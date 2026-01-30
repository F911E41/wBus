// src/route/mod.rs

mod model;

use std::collections::{BTreeMap, HashMap};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use anyhow::Result;
use chrono::Local;
use futures::stream::{self, StreamExt};
use serde_json::{Value, json};

use crate::config::{CONCURRENCY_FETCH, CONCURRENCY_SNAP, OSRM_CHUNK_SIZE, OSRM_URL, TAGO_URL};
use crate::route::model::{
    BusRouteProcessor, DerivedFeature, DerivedFeatureCollection, FrontendMeta, FrontendProperties,
    FrontendStop, RawRouteFile, RawStop, RouteGeometry, RouteIndices, RouteProcessData,
};
use crate::utils::{
    ensure_dir, extract_items,
    geo::{calculate_metrics, closest_point_on_polyline, find_nearest_coord_index},
    get_env, parse_flexible_string, resolve_url,
};

// ============================================================================
// Argument Structure
// ============================================================================

#[derive(clap::Args)]
pub struct RouteArgs {
    /// City code to process (default: Wonju -> 32020)
    #[arg(long, default_value = "32020")]
    city_code: String,

    /// Specific route number (if not specified, all)
    #[arg(short, long)]
    route: Option<String>,

    /// Output directory
    #[arg(short, long, default_value = "./storage/processed_routes")]
    output_dir: PathBuf,

    /// Update station map only and skip snapping
    #[arg(long)]
    station_map_only: bool,

    /// Snap route paths using OSRM only (skip Tago API)
    #[arg(long)]
    osrm_only: bool,
}

// ============================================================================
// Main Execution
// ============================================================================

pub async fn run(args: RouteArgs) -> Result<()> {
    // Setup Directories
    let raw_dir = args.output_dir.join("raw_routes");
    let derived_dir = args.output_dir.join("derived_routes");

    ensure_dir(&raw_dir)?;
    ensure_dir(&derived_dir)?;

    let service_key = get_env("DATA_GO_KR_SERVICE_KEY");
    if service_key.is_empty() {
        anyhow::bail!("DATA_GO_KR_SERVICE_KEY is missing!");
    }

    let processor = Arc::new(BusRouteProcessor {
        service_key,
        city_code: args.city_code.clone(),
        raw_dir: raw_dir.clone(),
        derived_dir: derived_dir.clone(),
        mapping_file: args.output_dir.join("routeMap.json"),
        tago_base_url: resolve_url("TAGO_API_URL", TAGO_URL),
        osrm_base_url: resolve_url("OSRM_API_URL", OSRM_URL),
    });

    // [Phase 1] Data Collection (Raw Save)
    if !args.osrm_only {
        println!("\n[Phase 1: Fetching Raw Data to {:?}]", raw_dir);

        let routes = processor.get_all_routes().await?;
        let target_routes: Vec<Value> = if let Some(target_no) = args.route.as_ref() {
            routes
                .into_iter()
                .filter(|r| parse_flexible_string(&r["routeno"]) == *target_no)
                .collect()
        } else {
            routes
        };

        println!(" Targeting {} routes...", target_routes.len());

        let mut route_stream = stream::iter(target_routes)
            .map(|route| {
                let proc = Arc::clone(&processor);
                async move { proc.fetch_and_save_raw(route).await }
            })
            .buffer_unordered(CONCURRENCY_FETCH);

        // Aggregation for routeMap.json
        let mut all_stops = BTreeMap::new();
        let mut route_details_map = HashMap::new();
        let mut route_mapping: BTreeMap<String, Vec<String>> = BTreeMap::new();
        let mut count = 0usize;

        while let Some(result) = route_stream.next().await {
            match result {
                Ok(Some(data)) => {
                    count += 1;
                    route_details_map.insert(data.route_id.clone(), data.details);
                    route_mapping
                        .entry(data.route_no)
                        .or_default()
                        .push(data.route_id);
                    for (id, val) in data.stops_map {
                        all_stops.insert(id, val);
                    }
                    if count % 10 == 0 {
                        print!(".");
                    }
                }
                Ok(None) => {}
                Err(e) => eprintln!("\n Error: {:?}", e),
            }
        }
        println!("\n Processed {} raw routes.", count);

        processor.save_route_map_json(&route_mapping, &route_details_map, &all_stops)?;

        if args.station_map_only {
            println!("✓ Station map generated.");
            return Ok(());
        }
    }

    // [Phase 2] Data Processing (Raw -> Derived)
    println!(
        "\n[Phase 2: Processing raw data to GeoJSON: {:?}]",
        derived_dir
    );

    // Read all JSONs from `raw_routes/`
    let raw_entries: Vec<_> = fs::read_dir(&raw_dir)?.filter_map(|e| e.ok()).collect();

    // Process with concurrency
    let mut snap_stream = stream::iter(raw_entries)
        .map(|entry| {
            let proc = Arc::clone(&processor);
            let specific = args.route.clone();

            async move {
                let path = entry.path();
                if path.extension().map_or(false, |ext| ext == "json") {
                    let fname = path.file_name().unwrap().to_string_lossy();

                    // Filter check
                    if let Some(ref target) = specific {
                        if !fname.starts_with(target) && !fname.contains(target) {
                            return Ok(());
                        }
                    }

                    println!(" Processing {}...", fname);

                    proc.process_raw_to_derived(&path).await
                } else {
                    Ok(())
                }
            }
        })
        .buffer_unordered(CONCURRENCY_SNAP);

    while let Some(res) = snap_stream.next().await {
        if let Err(e) = res {
            eprintln!(" Processing failed: {:?}", e);
        }
    }

    println!("✓ Pipeline Complete.");

    Ok(())
}

// ============================================================================
// Processor Implementation
// ============================================================================

impl BusRouteProcessor {
    // Phase 1 Logic

    async fn get_all_routes(&self) -> Result<Vec<Value>> {
        let params = [
            ("cityCode", self.city_code.as_str()),
            ("numOfRows", "2000"),
            ("pageNo", "1"),
            ("serviceKey", self.service_key.as_str()),
            ("_type", "json"),
        ];

        let url = format!("{}/getRouteNoList", self.tago_base_url);
        let resp = reqwest::Client::new()
            .get(&url)
            .query(&params)
            .send()
            .await?;
        let json: Value = resp.json().await?;

        extract_items(&json)
    }

    async fn fetch_and_save_raw(&self, route_info: Value) -> Result<Option<RouteProcessData>> {
        let route_id = route_info["routeid"]
            .as_str()
            .unwrap_or_default()
            .to_string();
        let route_no = parse_flexible_string(&route_info["routeno"]);

        if route_no == "UNKNOWN" || route_id.is_empty() {
            return Ok(None);
        }

        // Fetch Stops
        let params = [
            ("cityCode", self.city_code.as_str()),
            ("routeId", route_id.as_str()),
            ("numOfRows", "1024"),
            ("serviceKey", self.service_key.as_str()),
            ("_type", "json"),
        ];

        let url = format!("{}/getRouteAcctoThrghSttnList", self.tago_base_url);
        let resp = reqwest::Client::new()
            .get(&url)
            .query(&params)
            .send()
            .await?;

        let json: Value = match resp.json().await {
            Ok(v) => v,
            Err(_) => return Ok(None),
        };

        let items = extract_items(&json)?;
        if items.is_empty() {
            return Ok(None);
        }

        // Convert to internal RawStop
        let mut stops: Vec<RawStop> = items
            .iter()
            .map(|item| RawStop {
                node_id: item["nodeid"].as_str().unwrap_or("").to_string(),
                node_nm: item["nodenm"].as_str().unwrap_or("").to_string(),
                node_ord: item["nodeord"].as_i64().unwrap_or(0),
                node_no: parse_flexible_string(&item["nodeno"]),
                gps_lat: item["gpslati"].as_f64().unwrap_or(0.0),
                gps_long: item["gpslong"].as_f64().unwrap_or(0.0),
                up_down_cd: item["updowncd"]
                    .as_i64()
                    .or_else(|| item["updowncd"].as_str().and_then(|s| s.parse().ok()))
                    .unwrap_or(0),
            })
            .collect();

        stops.sort_by_key(|s| s.node_ord);

        // Save RAW file
        let raw_file = RawRouteFile {
            route_id: route_id.clone(),
            route_no: route_no.clone(),
            fetched_at: Local::now().to_rfc3339(),
            stops: stops.clone(),
        };

        let file_path = self.raw_dir.join(format!("{}_{}.json", route_no, route_id));
        fs::write(file_path, serde_json::to_string_pretty(&raw_file)?)?;

        // Generate Metadata for routeMap.json
        let sequence_meta: Vec<Value> = stops
            .iter()
            .map(|s| {
                json!({
                    "nodeid": s.node_id, "nodeord": s.node_ord, "updowncd": s.up_down_cd
                })
            })
            .collect();

        let stops_map_data: Vec<(String, Value)> = stops
            .iter()
            .map(|s| {
                (
                    s.node_id.clone(),
                    json!({
                        "nodenm": s.node_nm, "nodeno": s.node_no,
                        "gpslati": s.gps_lat, "gpslong": s.gps_long
                    }),
                )
            })
            .collect();

        Ok(Some(RouteProcessData {
            route_id,
            route_no: route_no.clone(),
            details: json!({ "routeno": route_no, "sequence": sequence_meta }),
            stops_map: stops_map_data,
        }))
    }

    // Phase 2 Logic
    async fn process_raw_to_derived(&self, raw_path: &Path) -> Result<()> {
        // Read Raw File
        let content = fs::read_to_string(raw_path)?;
        let raw_data: RawRouteFile = serde_json::from_str(&content)?;

        let mut stops = raw_data.stops;

        // Sanitize coordinates (drift correction)
        self.sanitize_stops_to_corridor(&mut stops).await;

        if stops.len() < 2 {
            return Ok(());
        }

        let route_id = raw_data.route_id;
        let route_no = raw_data.route_no;

        // Identify Turning Point
        let mut turn_idx = stops.len() - 1;
        for i in 0..stops.len() - 1 {
            if stops[i].up_down_cd != stops[i + 1].up_down_cd {
                turn_idx = i;
                break;
            }
        }
        let turn_node_id = stops[turn_idx].node_id.clone();

        // OSRM Logic (Merging)
        let mut full_coordinates: Vec<Vec<f64>> = Vec::new();
        let mut stop_to_coord: Vec<usize> = Vec::with_capacity(stops.len());
        let mut start_idx = 0;

        while start_idx < stops.len() - 1 {
            let end_idx = (start_idx + OSRM_CHUNK_SIZE).min(stops.len());
            let chunk = &stops[start_idx..end_idx];

            if chunk.len() < 2 {
                break;
            }

            if let Some(coords) = self.fetch_osrm_route(chunk).await {
                let current_total = full_coordinates.len();

                // Merge Geometry
                let (to_append, _offset) = if current_total > 0 {
                    (&coords[1..], 0)
                } else {
                    (&coords[..], 0)
                };

                // Map Stops to Geometry
                for (i, stop) in chunk.iter().enumerate() {
                    let global_stop_idx = start_idx + i;
                    if global_stop_idx < stop_to_coord.len() {
                        continue;
                    }

                    if let Some(local_idx) =
                        find_nearest_coord_index((stop.gps_long, stop.gps_lat), &coords)
                    {
                        let global_coord_idx = if current_total > 0 {
                            if local_idx == 0 {
                                current_total - 1
                            } else {
                                current_total + local_idx - 1
                            }
                        } else {
                            local_idx
                        };
                        stop_to_coord.push(global_coord_idx);
                    } else {
                        stop_to_coord.push(current_total);
                    }
                }

                full_coordinates.extend_from_slice(to_append);
            }
            start_idx = end_idx - 1;
        }

        while stop_to_coord.len() < stops.len() {
            stop_to_coord.push(full_coordinates.len().saturating_sub(1));
        }

        // [OPTIMIZATION] Round coordinates to 6 decimal places to reduce file size
        // This is important for web performance
        let optimized_coordinates: Vec<Vec<f64>> = full_coordinates
            .into_iter()
            .map(|pt| {
                pt.iter()
                    .map(|c| (c * 1_000_000.0).round() / 1_000_000.0)
                    .collect()
            })
            .collect();

        // Derive Indices & Metrics
        let turn_coord_idx = stops
            .iter()
            .position(|s| s.node_id == turn_node_id)
            .and_then(|idx| stop_to_coord.get(idx).cloned())
            .unwrap_or(optimized_coordinates.len() / 2);

        // Calculate BBox & Distance using optimized coordinates
        let (bbox, total_dist) = calculate_metrics(&optimized_coordinates);

        // Build Frontend Data Structures
        let frontend_stops: Vec<FrontendStop> = stops
            .iter()
            .map(|s| FrontendStop {
                id: s.node_id.clone(),
                name: s.node_nm.clone(),
                ord: s.node_ord,
                up_down: s.up_down_cd,
            })
            .collect();

        let derived_data = DerivedFeatureCollection {
            type_: "FeatureCollection".to_string(),
            features: vec![DerivedFeature {
                type_: "Feature".to_string(),
                id: route_id.clone(),
                bbox: Some(bbox.to_vec()),
                geometry: RouteGeometry {
                    type_: "LineString".to_string(),
                    coordinates: optimized_coordinates,
                },
                properties: FrontendProperties {
                    route_id: route_id.clone(),
                    route_no,
                    stops: frontend_stops,
                    indices: RouteIndices {
                        turn_idx: turn_coord_idx,
                        stop_to_coord,
                    },
                    meta: FrontendMeta {
                        total_dist: (total_dist * 10.0).round() / 10.0,
                        source_ver: raw_data.fetched_at,
                    },
                },
            }],
        };

        // Save Derived File
        let output_path = self.derived_dir.join(format!("{}.geojson", route_id));
        fs::write(output_path, serde_json::to_string(&derived_data)?)?;

        Ok(())
    }

    // Helpers (Sanitize, OSRM Fetch, Save Map)
    async fn sanitize_stops_to_corridor(&self, stops: &mut [RawStop]) {
        if stops.len() < 3 {
            return;
        }

        for i in 1..stops.len() - 1 {
            let prev = stops[i - 1].clone();
            let next = stops[i + 1].clone();

            if let Some(corr) = self.fetch_osrm_route_between(&prev, &next).await {
                let p = (stops[i].gps_long, stops[i].gps_lat);
                if let Some(((cx, cy), d)) = closest_point_on_polyline(p, &corr) {
                    if d <= 90.0 {
                        stops[i].gps_long = cx;
                        stops[i].gps_lat = cy;
                    }
                }
            }
        }
    }

    async fn fetch_osrm_route_between(&self, a: &RawStop, b: &RawStop) -> Option<Vec<Vec<f64>>> {
        let coords = format!(
            "{:.6},{:.6};{:.6},{:.6}",
            a.gps_long, a.gps_lat, b.gps_long, b.gps_lat
        );

        self.call_osrm(&coords).await
    }

    async fn fetch_osrm_route(&self, stops: &[RawStop]) -> Option<Vec<Vec<f64>>> {
        let coords = stops
            .iter()
            .map(|s| format!("{:.6},{:.6}", s.gps_long, s.gps_lat))
            .collect::<Vec<_>>()
            .join(";");

        self.call_osrm(&coords).await
    }

    async fn call_osrm(&self, coords_param: &str) -> Option<Vec<Vec<f64>>> {
        let url = format!(
            "{}/{coords}?overview=full&geometries=geojson&steps=false&continue_straight=true",
            self.osrm_base_url,
            coords = coords_param
        );

        let resp = reqwest::get(&url).await.ok()?;
        if !resp.status().is_success() {
            return None;
        }

        let json: Value = resp.json().await.ok()?;
        let coords: Vec<Vec<f64>> =
            serde_json::from_value(json["routes"][0]["geometry"]["coordinates"].clone()).ok()?;

        if coords.is_empty() {
            None
        } else {
            Some(coords)
        }
    }

    fn save_route_map_json(
        &self,
        map: &BTreeMap<String, Vec<String>>,
        details: &HashMap<String, Value>,
        stops: &BTreeMap<String, Value>,
    ) -> Result<()> {
        let final_data = json!({
            "lastUpdated": Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
            "route_numbers": map,
            "route_details": details,
            "stations": stops
        });

        fs::write(
            &self.mapping_file,
            serde_json::to_string_pretty(&final_data)?,
        )?;

        Ok(())
    }
}
