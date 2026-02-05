import L from "leaflet";

import { APP_CONFIG, MAP_SETTINGS, STORAGE_KEYS } from "@core/config/env";

// ----------------------------------------------------------------------
// Types & Constants
// ----------------------------------------------------------------------

export type StoredMapView = {
    center: [number, number]; // [Latitude, Longitude]
    zoom: number;
};

const DEFAULT_MAP_VIEW: StoredMapView = {
    center: MAP_SETTINGS.BOUNDS.DEFAULT_CENTER,
    zoom: MAP_SETTINGS.ZOOM.DEFAULT,
};

// ----------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------

/**
 * Clamps the zoom level to the allowed min/max range.
 */
function clampZoom(zoom: number): number {
    return Math.min(MAP_SETTINGS.ZOOM.MAX, Math.max(MAP_SETTINGS.ZOOM.MIN, zoom));
}

/**
 * Validates if a coordinate value is a finite number.
 */
function isValidCoordinate(val: unknown): val is number {
    return typeof val === 'number' && Number.isFinite(val);
}

// ----------------------------------------------------------------------
// Public Functions
// ----------------------------------------------------------------------

/**
 * Gets the initial map view state.
 * Priority: 1. Local Storage (User Preference) -> 2. Default Config
 */
export function getInitialMapView(): StoredMapView {
    return loadStoredMapView() ?? DEFAULT_MAP_VIEW;
}

/**
 * Loads and validates the map view from Local Storage.
 * Returns null if no data exists, or if data is corrupted/out-of-bounds.
 */
export function loadStoredMapView(): StoredMapView | null {
    if (typeof window === "undefined") return null;

    try {
        const raw = localStorage.getItem(STORAGE_KEYS.MAP_VIEW);
        if (!raw) return null;

        const parsed = JSON.parse(raw);

        // Structure Check
        if (!parsed || !Array.isArray(parsed.center) || parsed.center.length !== 2) {
            return null;
        }

        const lat = Number(parsed.center[0]);
        const lng = Number(parsed.center[1]);
        const zoom = Number(parsed.zoom);

        // Type Validity Check
        if (!isValidCoordinate(lat) || !isValidCoordinate(lng) || !isValidCoordinate(zoom)) {
            return null;
        }

        // Logic Validity Check (Is it within the allowed map area?)
        // Uses Leaflet's bounds check to ensure we don't load a view pointing to the middle of the ocean
        const maxBounds = L.latLngBounds(MAP_SETTINGS.BOUNDS.MAX);
        if (!maxBounds.contains([lat, lng])) {
            if (APP_CONFIG.IS_DEV) {
                console.warn("[mapViewStorage] Stored view is outside allowed bounds. Resetting to default.");
            }
            return null;
        }

        return {
            center: [lat, lng],
            zoom: clampZoom(zoom)
        };

    } catch (error) {
        if (APP_CONFIG.IS_DEV) {
            console.error("[mapViewStorage] Failed to parse stored map view:", error);
        }
        return null;
    }
}

/**
 * Creates a clean StoredMapView object from a Leaflet Map instance.
 * Precision is reduced (toFixed) to save storage space.
 */
export function createMapViewFromMap(map: L.Map): StoredMapView {
    const center = map.getCenter();
    const zoom = map.getZoom();

    return {
        // Keep 6 decimal places for coordinates (~10cm precision)
        center: [
            Number(center.lat.toFixed(6)),
            Number(center.lng.toFixed(6))
        ],
        // Keep 2 decimal places for zoom
        zoom: Number(clampZoom(zoom).toFixed(2)),
    };
}

/**
 * Persists the map view state to Local Storage.
 */
export function saveMapView(view: StoredMapView): void {
    if (typeof window === "undefined") return;

    try {
        localStorage.setItem(STORAGE_KEYS.MAP_VIEW, JSON.stringify(view));
    } catch (error) {
        if (APP_CONFIG.IS_DEV) {
            console.error("[mapViewStorage] Failed to write map view to storage:", error);
        }
    }
}
