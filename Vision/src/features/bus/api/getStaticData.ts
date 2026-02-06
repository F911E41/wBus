import { fetchAPI, HttpError } from "@core/network/fetchAPI";
import { CacheManager } from "@core/cache/CacheManager";

import { API_CONFIG, APP_CONFIG } from "@core/config/env";

import type {
    GeoPolyline,
    BusStop,
    StationLocation,
    RouteDetail,
    RouteInfo,
    StaticData
} from "@core/domain";

/**
 * Cache Managers
 */
const staticDataCache = new CacheManager<StaticData>();
const polylineCache = new CacheManager<GeoPolyline | null>();

/**
 * Build URL for polyline data based on remote/local mode
 */
function getPolylineUrl(routeKey: string): string {
    if (API_CONFIG.STATIC.USE_REMOTE && API_CONFIG.STATIC.BASE_URL) {
        return `${API_CONFIG.STATIC.BASE_URL}/${API_CONFIG.STATIC.PATHS.POLYLINES}/${routeKey}.geojson`;
    }
    return `/data/polylines/${routeKey}.geojson`;
}

/**
 * Build URL for route map based on remote/local mode
 */
function getRouteMapUrl(): string {
    if (API_CONFIG.STATIC.USE_REMOTE && API_CONFIG.STATIC.BASE_URL) {
        return `${API_CONFIG.STATIC.BASE_URL}/${API_CONFIG.STATIC.PATHS.ROUTE_MAP}`;
    }
    return "/data/routeMap.json";
}

/**
 * Fetches and caches the routeMap.json data.
 * This function ensures only one fetch request is made even if called multiple times.
 */
async function getStaticData(): Promise<StaticData> {
    return staticDataCache.getOrFetch("staticData", async () => {
        return fetchAPI<StaticData>(getRouteMapUrl(), { baseUrl: "" });
    });
}

/**
 * Fetches and caches the routeMap.json data.
 * This function ensures only one fetch request is made even if called multiple times.
 * @returns A promise that resolves to a map of route names to vehicle IDs (excludes empty routes)
 */
export async function getRouteMap(): Promise<Record<string, string[]>> {
    const data = await getStaticData();
    // Filter out routes with empty vehicle IDs (e.g., "Shuttle": [])
    return Object.fromEntries(
        Object.entries(data.route_numbers).filter(([, ids]) => ids.length > 0)
    );
}

/**
 * Fetch the polyline geojson file for the provided key and cache the result.
 * The key should follow the naming scheme `${routeId}` to target
 * a specific route variant (falls back to `${routeName}` if no ID is provided).
 *
 * @param routeKey - filename-friendly key (ex: "30_WJB251000068")
 * @returns {Promise<GeoPolyline | null>} - GeoJSON Data or null if not found
 */
export async function getPolyline(
    routeKey: string
): Promise<GeoPolyline | null> {
    return polylineCache.getOrFetch(routeKey, async () => {
        try {
            return await fetchAPI<GeoPolyline>(getPolylineUrl(routeKey), {
                baseUrl: "",
            });
        } catch (error) {
            // Gracefully handle missing polyline files (404 errors)
            if (error instanceof HttpError && error.status === 404) {
                if (APP_CONFIG.IS_DEV) {
                    console.warn(`[getPolyline] Polyline file not found: ${routeKey}`);
                }
                return null;
            }
            throw error;
        }
    });
}

/**
 * Fetches station location data from `routeMap.json`.
 * This data is cached to minimize redundant fetch requests.
 * Maps the station key (nodeid) from the object key to the nodeid property.
 * @returns A promise that resolves to an array of station items
 */
export async function getBusStopLocationData(): Promise<BusStop[]> {
    const data = await getStaticData();
    // Map the station key (nodeid) from object keys to the nodeid property
    return Object.entries(data.stations).map(([nodeid, station]) => ({
        ...station,
        nodeid,
    }));
}

/**
 * Fetches the station map keyed by nodeid.
 * Useful for lookup-heavy operations that only need coordinates.
 */
export async function getStationMap(): Promise<Record<string, StationLocation>> {
    const data = await getStaticData();
    return data.stations;
}

/**
 * Fetches route-specific stops by joining route_details with station metadata.
 */
export async function getRouteStopsByRouteName(
    routeName: string
): Promise<BusStop[]> {
    const data = await getStaticData();
    const routeIds = data.route_numbers[routeName] ?? [];

    if (routeIds.length === 0) return [];

    const stationMap = data.stations;
    const stopMap = new Map<string, BusStop>();

    routeIds.forEach((routeId) => {
        const detail = data.route_details[routeId];
        if (!detail?.sequence) return;

        detail.sequence.forEach((stop) => {
            const station = stationMap[stop.nodeid];
            if (!station) return;

            const key = `${stop.nodeid}-${stop.updowncd ?? ""}`;
            if (stopMap.has(key)) return;

            stopMap.set(key, {
                ...station,
                nodeid: stop.nodeid,
                nodeord: stop.nodeord,
                updowncd: stop.updowncd,
            });
        });
    });

    return Array.from(stopMap.values());
}

/**
 * Returns a list of available route names (only routes with vehicle IDs).
 */
export async function getAvailableRoutes(): Promise<string[]> {
    const routes = await getRouteMap();
    return Object.keys(routes);
}

/**
 * Returns a RouteInfo object for the given route name.
 * @param routeName - The name of the route (e.g., "30", "34")
 * @returns A promise that resolves to RouteInfo or null if not found
 */
export async function getRouteInfo(
    routeName: string
): Promise<RouteInfo | null> {
    try {
        const map = await getRouteMap();
        const routeIds = map[routeName];

        if (!routeIds?.length) {
            if (APP_CONFIG.IS_DEV) {
                console.warn(`[getRouteInfo] Route missing: ${routeName}`);
            }

            return null;
        }

        return {
            routeName,
            vehicleRouteIds: routeIds,
        };
    } catch (err) {
        if (APP_CONFIG.IS_DEV) {
            console.error(`[getRouteInfo] Route missing: ${routeName}`, err);
        }

        return null;
    }
}

/**
 * Fetches route detail information including sequence data.
 * @param routeId - The ID of the route (e.g., "WJB251000068")
 * @returns A promise that resolves to RouteDetail or null if not found
 */
export async function getRouteDetails(
    routeId: string
): Promise<RouteDetail | null> {
    const data = await getStaticData();
    return data.route_details[routeId] || null;
}
