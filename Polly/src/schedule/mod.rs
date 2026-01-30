// src/schedule/mod.rs

mod model;

use std::collections::{BTreeMap, HashMap, HashSet};
use std::fs;
use std::path::PathBuf;
use std::time::Duration;

use anyhow::{Context, Result};
use percent_encoding::{NON_ALPHANUMERIC, percent_encode};
use regex::Regex;
use reqwest::{Client, header};
use scraper::{Html, Selector};
use serde_json::json;
use tokio::time::sleep;

use crate::config::{BASE_URL, DETAIL_URL};
use crate::schedule::model::{ParsedSchedule, RouteMeta, TimeEntry};
use crate::utils;

// ============================================================================
// Schedule Arguments
// ============================================================================

#[derive(clap::Args)]
pub struct ScheduleArgs {
    /// Specific route number to crawl (e.g., "34-1"). If omitted, all routes are crawled.
    pub route: Option<String>,

    /// Output directory for saving the schedule JSON files.
    pub output_dir: PathBuf,
}

/// Main entry point for the schedule crawler.
///
/// This function orchestrates the entire crawling process:
/// 1. Initializes an HTTP client with cookie storage to maintain session.
/// 2. Fetches the main schedule page to get a list of all bus routes.
/// 3. For each route, it fetches the detailed schedule.
/// 4. Parses the HTML response for each detail page.
/// 5. Merges the various schedules (e.g., weekday, weekend) for each route.
/// 6. Saves the final, structured data as JSON files.
///
pub async fn run(args: ScheduleArgs) -> Result<()> {
    let schedule_dir = args.output_dir.join("schedules");

    utils::ensure_dir(&schedule_dir)?;

    println!("\n============================================================");
    println!("Starting Bus Schedule Crawler (Browser Mimic Mode)");
    println!("============================================================\n");

    // Initialize an HTTP client that mimics a web browser.
    // Cookie store is enabled to automatically handle session cookies (JSESSIONID),
    // which is crucial for making subsequent requests to the detail page.
    let client = Client::builder()
        .cookie_store(true)
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .timeout(Duration::from_secs(30))
        .build()?;

    // Fetch the main schedule page to acquire session cookies and the list of all routes.
    println!("Fetching main page (Initializing Session)...");

    let resp = client.get(BASE_URL).send().await?.text().await?;
    let document = Html::parse_document(&resp);

    // Extract basic route information and the target route IDs to crawl.
    let (route_meta_map, targets) = extract_route_info(&document, args.route.as_deref())?;

    println!("✓ Found info for {} routes", route_meta_map.len());
    println!("✓ Found {} route schedules to process", targets.len());

    let mut collected_schedules: Vec<ParsedSchedule> = Vec::new();

    // Iterate through each target route and fetch its detailed schedule.
    for (i, route_id) in targets.iter().enumerate() {
        print!(
            "\r   [/{}/{}] Fetching {}... ",
            i + 1,
            targets.len(),
            route_id
        );
        sleep(Duration::from_millis(300)).await; // Politeness delay.

        // The website expects the route ID in the POST body to be percent-encoded UTF-8.
        let encoded_val = percent_encode(route_id.as_bytes(), NON_ALPHANUMERIC).to_string();
        let body_str = format!("no={}", encoded_val);

        // Send a POST request to get the detailed schedule for the specific route_id.
        // It's crucial to set the correct headers (Referer, Origin, Content-Type)
        // to simulate a legitimate request originating from the website.
        let detail_resp = match client
            .post(DETAIL_URL)
            .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
            .header(header::REFERER, BASE_URL)
            .header(header::ORIGIN, "http://its.wonju.go.kr")
            .body(body_str)
            .send()
            .await
        {
            Ok(r) => r,
            Err(_) => {
                println!("✗ Failed (Network)");
                continue;
            }
        };

        if !detail_resp.status().is_success() {
            println!("✗ Failed (Status: {})", detail_resp.status());
            continue;
        }

        let detail_html = detail_resp.text().await?;

        // The route number is the part of the route_id before any parentheses.
        let route_number = route_id.split('(').next().unwrap_or(route_id).to_string();
        let meta = route_meta_map.get(&route_number);

        // Parse the returned HTML to extract the schedule.
        match parse_detail_schedule(&detail_html, route_id, meta) {
            Ok(parsed) => {
                let count: usize = parsed.times_by_direction.values().map(|v| v.len()).sum();
                if count > 0 {
                    println!("✓ ({} times)", count);
                    collected_schedules.push(parsed);
                } else {
                    // If parsing yields no times, save the HTML for debugging.
                    println!("Warning: 0 times. (HTML Check Saved)");
                    fs::write(format!("debug_empty_{}.html", i), &detail_html).ok();
                }
            }
            Err(e) => {
                println!("✗ Error: {}", e);
            }
        }
    }

    // Merge the collected schedules and save them to JSON files.
    println!("\nOrganizing and saving schedules...");

    let merged_routes = merge_schedules(collected_schedules, &route_meta_map);

    for (route_number, data) in merged_routes {
        save_route_schedule(&schedule_dir, &route_number, &data)?;
    }

    Ok(())
}

/// Parses the main schedule page to extract a list of all available routes.
/// It creates a map of route metadata and a list of `route_id`s used for fetching details.
fn extract_route_info(
    document: &Html,
    filter: Option<&str>,
) -> Result<(HashMap<String, RouteMeta>, Vec<String>)> {
    let mut route_meta_map = HashMap::new();
    let mut targets = Vec::new();

    let row_selector = Selector::parse("table tr").unwrap();
    let cell_selector = Selector::parse("td").unwrap();
    let onclick_re = Regex::new(r"goDetail\('([^']+)'\)").unwrap();

    let mut temp_directions: HashMap<String, HashSet<String>> = HashMap::new();

    // Iterate over each row in the main schedule table.
    for row in document.select(&row_selector) {
        let cells: Vec<_> = row.select(&cell_selector).collect();
        if cells.len() >= 6 {
            let route_element = cells[0];

            // The route_id required for the POST request is in an `onclick` attribute.
            if let Some(onclick) = route_element.value().attr("onclick") {
                if let Some(caps) = onclick_re.captures(onclick) {
                    let route_id = caps.get(1).unwrap().as_str().to_string();

                    // If a specific route is requested, filter out all others.
                    if let Some(f) = filter {
                        if !route_id.starts_with(f) {
                            continue;
                        }
                    }

                    targets.push(route_id.clone());

                    let route_no = route_id.split('(').next().unwrap_or(&route_id).to_string();
                    let origin = cells[1].text().collect::<String>().trim().to_string();
                    let dest = cells[2].text().collect::<String>().trim().to_string();

                    // Collect all unique termini for this route number.
                    let entry = temp_directions.entry(route_no.clone()).or_default();
                    entry.insert(origin.clone());
                    entry.insert(dest.clone());

                    // Store metadata for the route.
                    route_meta_map.entry(route_no).or_insert(RouteMeta {
                        origin,
                        destination: dest,
                        directions: Vec::new(),
                    });
                }
            }
        }
    }

    // Assign the sorted, unique directions to each route in the metadata map.
    for (r_no, dirs_set) in temp_directions {
        if let Some(meta) = route_meta_map.get_mut(&r_no) {
            let mut sorted_dirs: Vec<String> = dirs_set.into_iter().collect();
            sorted_dirs.sort();
            meta.directions = sorted_dirs;
        }
    }

    Ok((route_meta_map, targets))
}

/// Normalizes Korean day type strings into a standard English identifier.
fn normalize_day_type(raw: &str) -> String {
    let lower = raw.to_lowercase();
    if lower.contains("평일") || lower.contains("주중") {
        // Weekday
        "weekday".to_string()
    } else if lower.contains("주말") // Weekend
        || lower.contains("휴일") // Holiday
        || lower.contains("토") // Saturday
        || lower.contains("일") // Sunday
        || lower.contains("방학") // Vacation
        || lower.contains("공휴")
    // Public Holiday
    {
        "weekend".to_string()
    } else {
        "general".to_string()
    }
}

/// Parses the HTML of a schedule detail page for a single route.
fn parse_detail_schedule(
    html: &str,
    route_id: &str,
    meta: Option<&RouteMeta>,
) -> Result<ParsedSchedule> {
    let document = Html::parse_document(html);

    // Extract the route number and raw day type from the route_id string (e.g., "34-1(평일)").
    let route_match_re = Regex::new(r"^(\S+?)(.*)?$").unwrap();
    let (route_number, raw_day_type) = if let Some(caps) = route_match_re.captures(route_id) {
        (
            caps.get(1).map_or("", |m| m.as_str()).to_string(),
            caps.get(2)
                .map_or("general", |m| {
                    m.as_str().trim_matches(|c| c == '(' || c == ')')
                })
                .to_string(),
        )
    } else {
        (route_id.to_string(), "general".to_string())
    };

    let day_type = normalize_day_type(&raw_day_type);

    let table_selector = Selector::parse("table").unwrap();
    let th_selector = Selector::parse("th").unwrap();

    // Find the correct schedule table by looking for a `th` element containing "발" (departure).
    let mut target_table = None;
    for table in document.select(&table_selector) {
        let headers: Vec<String> = table
            .select(&th_selector)
            .map(|th| th.text().collect::<String>())
            .collect();
        if headers.iter().any(|h| h.contains("발")) {
            target_table = Some(table);
            break;
        }
    }

    // If the specific table isn't found, fall back to the first table on the page.
    if target_table.is_none() {
        target_table = document.select(&table_selector).next();
    }

    let table = target_table.context("No schedule table found in the HTML")?;

    let mut col_map: HashMap<usize, String> = HashMap::new(); // Maps column index to direction name.
    let mut directions: Vec<String> = Vec::new();
    let mut note_col_idx = None;

    let tr_selector = Selector::parse("tr").unwrap();
    let header_rows: Vec<_> = table.select(&tr_selector).collect();

    // Parse table headers to identify directions.
    for row in &header_rows {
        let ths: Vec<_> = row.select(&th_selector).collect();
        if ths.is_empty() {
            continue;
        }

        for (idx, th) in ths.iter().enumerate() {
            let text = th.text().collect::<String>().trim().to_string();

            if text == "비고" {
                // "비고" means "Notes".
                note_col_idx = Some(idx);
                continue;
            }

            // Extract direction names from headers. Headers for times often end with "발" (departure).
            // We ignore irrelevant headers like "운행순번" (run order), "시" (hour), "분" (minute), etc.
            let clean_text = text.trim_end_matches('발').to_string();
            if !clean_text.is_empty()
                && !["운행순번", "시", "분", "", "구분"].contains(&clean_text.as_str())
                && !Regex::new(r"^\d+시$").unwrap().is_match(&clean_text)
            {
                if !directions.contains(&clean_text) {
                    directions.push(clean_text.clone());
                }
                col_map.insert(idx, clean_text);
            }
        }
    }

    // If directions could not be determined from the table headers,
    // fall back to the metadata extracted from the main page.
    if directions.is_empty() {
        if let Some(m) = meta {
            directions = m.directions.clone();
        }
        // If we have directions from meta but no column map, create a default mapping.
        if col_map.is_empty() && !directions.is_empty() {
            for (i, dir) in directions.iter().enumerate() {
                col_map.insert(i + 1, dir.clone());
            }
        }
    }

    let td_selector = Selector::parse("td").unwrap();
    let time_re = Regex::new(r"^(\d{1,2}:\d{2})").unwrap();

    let mut times_by_direction: HashMap<String, Vec<TimeEntry>> = HashMap::new();
    for dir in &directions {
        times_by_direction.insert(dir.clone(), Vec::new());
    }

    // Iterate through table rows to extract departure times.
    for row in table.select(&tr_selector) {
        let cells: Vec<_> = row.select(&td_selector).collect();
        if cells.is_empty() {
            // Skip header rows.
            continue;
        }

        // Extract note text if the note column exists.
        let note = if let Some(idx) = note_col_idx {
            if idx < cells.len() {
                let text = cells[idx].text().collect::<String>().trim().to_string();
                if text.is_empty() { None } else { Some(text) }
            } else {
                None
            }
        } else {
            None
        };

        // Check each cell in the row for a time.
        for (col_idx, cell) in cells.iter().enumerate() {
            if let Some(dir_name) = col_map.get(&col_idx) {
                let text = cell.text().collect::<String>().trim().to_string();
                if let Some(caps) = time_re.captures(&text) {
                    let clean_time = caps.get(1).unwrap().as_str().to_string();

                    if let Some(list) = times_by_direction.get_mut(dir_name) {
                        list.push(TimeEntry {
                            time: clean_time,
                            note: note.clone(),
                        });
                    }
                }
            }
        }
    }

    Ok(ParsedSchedule {
        route_number,
        day_type,
        directions,
        times_by_direction,
    })
}

/// Merges multiple `ParsedSchedule` structs into a single, comprehensive JSON object per route.
/// For example, it combines weekday and weekend schedules for the same bus route.
fn merge_schedules(
    schedules: Vec<ParsedSchedule>,
    route_meta_map: &HashMap<String, RouteMeta>,
) -> HashMap<String, serde_json::Value> {
    let mut merged_routes: HashMap<String, serde_json::Value> = HashMap::new();
    let mut route_note_maps: HashMap<String, HashMap<String, String>> = HashMap::new();
    let mut route_note_counters: HashMap<String, usize> = HashMap::new();

    for schedule in schedules {
        let r_no = schedule.route_number.clone();

        // If this is the first time seeing this route, create the base JSON structure.
        if !merged_routes.contains_key(&r_no) {
            let meta = route_meta_map.get(&r_no);
            let (origin, dest, dirs) = match meta {
                Some(m) => (
                    m.origin.clone(),
                    m.destination.clone(),
                    m.directions.clone(),
                ),
                None => (String::new(), String::new(), schedule.directions.clone()),
            };

            let initial_json = json!({
                "routeId": r_no,
                "routeName": format!("{}번", r_no),
                "description": format!("{} ↔ {}", origin, dest),
                "lastUpdated": chrono::Local::now().format("%Y-%m-%d").to_string(),
                "directions": dirs,
                "routeDetails": [],
                "featuredStops": { "general": [] },
                "schedule": {},
                "notes": {}
            });
            merged_routes.insert(r_no.clone(), initial_json);
            route_note_maps.insert(r_no.clone(), HashMap::new());
            route_note_counters.insert(r_no.clone(), 1);
        }

        let route_json = merged_routes.get_mut(&r_no).unwrap();
        let note_map = route_note_maps.get_mut(&r_no).unwrap();
        let note_counter = route_note_counters.get_mut(&r_no).unwrap();

        // Create a schedule object for the current day type (e.g., "weekday").
        let day_type_schedule = json!({});
        route_json["schedule"][&schedule.day_type] = day_type_schedule;

        for (direction, entries) in schedule.times_by_direction {
            let mut times_by_hour: BTreeMap<String, Vec<serde_json::Value>> = BTreeMap::new();

            for entry in entries {
                // Handle notes: assign a unique ID to each note text.
                let note_id = if let Some(note_text) = entry.note {
                    if !note_map.contains_key(&note_text) {
                        let new_id = note_counter.to_string();
                        note_map.insert(note_text.clone(), new_id.clone());
                        *note_counter += 1;
                        route_json["notes"][&new_id] = json!(note_text);
                        Some(new_id)
                    } else {
                        Some(note_map[&note_text].clone())
                    }
                } else {
                    None
                };

                // Group times by the hour.
                let parts: Vec<&str> = entry.time.split(':').collect();
                if parts.len() == 2 {
                    let hour = format!("{:0>2}", parts[0]);
                    let minute = format!("{:0>2}", parts[1]);

                    let mut minute_obj = json!({ "minute": minute });
                    if let Some(nid) = note_id {
                        minute_obj["noteId"] = json!(nid);
                    }

                    times_by_hour.entry(hour).or_default().push(minute_obj);
                }
            }

            // Add the hour-grouped times to the final JSON structure.
            for (hour, minutes) in times_by_hour {
                if route_json["schedule"][&schedule.day_type][&hour].is_null() {
                    route_json["schedule"][&schedule.day_type][&hour] = json!({});
                }
                route_json["schedule"][&schedule.day_type][&hour][&direction] = json!(minutes);
            }
        }
    }

    merged_routes
}

/// Saves the final merged schedule data for a route to a JSON file.
fn save_route_schedule(
    base_dir: &PathBuf,
    route_number: &str,
    data: &serde_json::Value,
) -> Result<()> {
    // Sanitize the route number to create a valid filename.
    let safe_name = route_number.replace(|c: char| !c.is_alphanumeric() && c != '-', "_");
    let filename = format!("{}.json", safe_name);
    let path = base_dir.join(filename);

    let json_str = serde_json::to_string_pretty(data)?;
    fs::write(&path, json_str)?;

    println!(
        "   ✓ Saved {} to {:?}",
        route_number,
        path.file_name().unwrap()
    );
    Ok(())
}
