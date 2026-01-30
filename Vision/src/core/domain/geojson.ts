// Vision/src/core/domain/geojson.ts

// GeoJSON types for bus route polylines.

export interface BusRouteFeatureCollection {
    type: "FeatureCollection";
    features: BusRouteFeature[];
}

export interface BusRouteFeature {
    type: "Feature";
    id: string;

    /**
     * [minLon, minLat, maxLon, maxLat]
     * Standard GeoJSON bounding box format, used for map viewport fitting.
     */
    bbox: [number, number, number, number];

    geometry: {
        type: "LineString";
        coordinates: Array<[number, number]>; // [lng, lat]
    };

    properties: BusRouteProperties;
}

export interface BusRouteProperties {
    route_id: string;
    route_no: string;
    stops: Array<{
        id: string;   // Stop ID
        name: string; // Stop name
        ord: number;  // Order
        ud: number;   // 0 = down, 1 = up
    }>;

    /**
     * The index in the coordinates array where the turn point is located
     * (Used for distinguishing up/down directions and arrow rendering branching points)
     */
    turn_idx: number;

    /**
     * Array mapping stops[i] to coordinates[j]
     * Example: stops[0] corresponds to coordinates[0], stops[1] corresponds to coordinates[24]
     */
    stop_to_coord: number[];

    total_dist: number; // Unit: meter (m)
    source_ver: string; // ISO 8601 Date String
}

export type GeoPolyline = BusRouteFeatureCollection;
export type GeoFeature = BusRouteFeature;
