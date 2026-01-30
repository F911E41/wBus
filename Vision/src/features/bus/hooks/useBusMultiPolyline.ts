// src/features/bus/hooks/useBusMultiPolyline.ts

import { useEffect, useMemo, useState } from "react";

import { APP_CONFIG } from "@core/config/env";

import { getPolyline, getRouteDetails, getStationMap } from "@bus/api/getStaticData";

import { transformPolyline } from "@bus/utils/polyUtils";

import { shouldSwapPolylines } from "@bus/utils/polylineDirection";

import type { GeoPolyline } from "@core/domain/geojson";
import type { RouteDetail } from "@core/domain/route";
import type { StationLocation } from "@core/domain/station";

// ----------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------

type Coordinate = [number, number];

export interface PolylineSegment {
    coords: Coordinate[];
    routeIds: string[]; // List of routes sharing this specific geometry
    direction: "up" | "down";
}

interface FetchedData {
    dataMap: Map<string, GeoPolyline>;
    detailMap: Map<string, RouteDetail | null>;
    stationMap: Record<string, StationLocation> | null;
}

interface SegmentBucket {
    upSegments: PolylineSegment[];
    downSegments: PolylineSegment[];
}

type BBox = [number, number, number, number]; // [minLng, minLat, maxLng, maxLat]
type Bounds = [[number, number], [number, number]]; // [[minLat, minLng], [maxLat, maxLng]]

const EMPTY_FETCHED: FetchedData = {
    dataMap: new Map(),
    detailMap: new Map(),
    stationMap: null,
};

// ----------------------------------------------------------------------
// Helpers: Pure Logic
// ----------------------------------------------------------------------

/**
 * Generates a unique string key for a coordinate array to detect duplicates.
 * Using toFixed(6) handles floating point precision issues.
 */
function generateSegmentKey(coords: Coordinate[]): string {
    // Optimization: Only use start, mid, and end points for hash if segments are long?
    // For safety, we currently stringify the whole path.
    return coords.map(([lat, lng]) => `${lat.toFixed(6)},${lng.toFixed(6)}`).join("|");
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
}

function isValidBBox(value: unknown): value is BBox {
    return Array.isArray(value)
        && value.length === 4
        && value.every((item) => isFiniteNumber(item));
}

function mergeBBox(base: BBox, next: BBox): BBox {
    return [
        Math.min(base[0], next[0]),
        Math.min(base[1], next[1]),
        Math.max(base[2], next[2]),
        Math.max(base[3], next[3]),
    ];
}

function getBBoxFromFeature(data: GeoPolyline): BBox | null {
    const feature = data.features?.[0];
    if (!feature) return null;

    if (isValidBBox(feature.bbox)) {
        return feature.bbox;
    }

    const coords = feature.geometry?.coordinates ?? [];
    if (coords.length === 0) return null;

    let minLng = coords[0][0];
    let maxLng = coords[0][0];
    let minLat = coords[0][1];
    let maxLat = coords[0][1];

    coords.forEach(([lng, lat]) => {
        if (!isFiniteNumber(lng) || !isFiniteNumber(lat)) return;
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
    });

    return [minLng, minLat, maxLng, maxLat];
}

/**
 * Merges new segments into an existing map of unique segments.
 * If a segment exists (geometry matches), we just append the routeId.
 */
function mergeIntoSegmentMap(
    segmentMap: Map<string, PolylineSegment>,
    coordsList: Coordinate[][],
    routeId: string,
    direction: "up" | "down"
) {
    coordsList.forEach((coords) => {
        if (coords.length < 2) return;

        const key = generateSegmentKey(coords);
        const existing = segmentMap.get(key);

        if (existing) {
            if (!existing.routeIds.includes(routeId)) {
                existing.routeIds.push(routeId);
            }
        } else {
            segmentMap.set(key, {
                coords,
                routeIds: [routeId],
                direction,
            });
        }
    });
}

/**
 * Core processing logic:
 * 1. Transforms GeoJSON to segments
 * 2. Checks for legacy direction swapping
 * 3. Deduplicates segments across multiple routes
 */
function processAllRoutes(
    routeIds: string[],
    fetched: FetchedData
): SegmentBucket {
    const segmentMap = new Map<string, PolylineSegment>();

    routeIds.forEach((routeId) => {
        const data = fetched.dataMap.get(routeId);
        if (!data) return;

        // Transform (Split)
        const { upPolyline, downPolyline } = transformPolyline(data);

        // Direction Correction
        let finalUp = upPolyline;
        let finalDown = downPolyline;

        const detail = fetched.detailMap.get(routeId) ?? null;
        // We need merged lines for the swap check heuristic
        const mergedUp = upPolyline.length > 0 ? upPolyline[0] : [];
        const mergedDown = downPolyline.length > 0 ? downPolyline[0] : [];

        if (shouldSwapPolylines(detail, fetched.stationMap, mergedUp, mergedDown)) {
            finalUp = downPolyline;
            finalDown = upPolyline;
        }

        // Deduplicate / Merge
        mergeIntoSegmentMap(segmentMap, finalUp, routeId, "up");
        mergeIntoSegmentMap(segmentMap, finalDown, routeId, "down");
    });

    // Convert Map values to Arrays
    const upSegments: PolylineSegment[] = [];
    const downSegments: PolylineSegment[] = [];

    for (const segment of segmentMap.values()) {
        if (segment.direction === "up") upSegments.push(segment);
        else downSegments.push(segment);
    }

    return { upSegments, downSegments };
}

// ----------------------------------------------------------------------
// Main Hook
// ----------------------------------------------------------------------

export function useMultiPolyline(
    routeName: string,
    routeIds: string[],
    activeRouteIds?: string[]
) {
    const [snapshot, setSnapshot] = useState<{
        key: string;
        data: FetchedData;
    }>({
        key: "",
        data: EMPTY_FETCHED,
    });
    const fetchKey = useMemo(() => {
        if (!routeName || routeIds.length === 0) return "";
        return `${routeName}::${routeIds.slice().sort().join("|")}`;
    }, [routeName, routeIds]);
    const activeFetched = useMemo(
        () => (snapshot.key === fetchKey ? snapshot.data : EMPTY_FETCHED),
        [snapshot.key, snapshot.data, fetchKey]
    );

    // Fetch Data
    useEffect(() => {
        if (!fetchKey) return;

        let isMounted = true;
        const [, routeKey = ""] = fetchKey.split("::");
        const sortedRouteIds = routeKey ? routeKey.split("|").filter(Boolean) : [];

        const loadData = async () => {
            // Parallel Fetch: Station Map + All Routes
            const stationMapPromise = getStationMap().catch((err) => {
                if (APP_CONFIG.IS_DEV) console.error("[useMultiPolyline] Station Map Error", err);
                return null;
            });

            const routesPromise = Promise.all(
                sortedRouteIds.map(async (routeId) => {
                    try {
                        // Note: getPolyline takes a 'routeKey' which is usually just routeId
                        const [data, routeDetail] = await Promise.all([
                            getPolyline(routeId),
                            getRouteDetails(routeId),
                        ]);
                        return { routeId, data, routeDetail };
                    } catch (error) {
                        if (APP_CONFIG.IS_DEV) {
                            console.error(`[useMultiPolyline] Failed to load ${routeId}`, error);
                        }
                        return { routeId, data: null, routeDetail: null };
                    }
                })
            );

            const [stationMap, routesResult] = await Promise.all([
                stationMapPromise,
                routesPromise,
            ]);

            if (!isMounted) return;

            const newDataMap = new Map<string, GeoPolyline>();
            const newDetailMap = new Map<string, RouteDetail | null>();

            routesResult.forEach(({ routeId, data, routeDetail }) => {
                if (data) newDataMap.set(routeId, data);
                newDetailMap.set(routeId, routeDetail);
            });

            setSnapshot({
                key: fetchKey,
                data: {
                    dataMap: newDataMap,
                    detailMap: newDetailMap,
                    stationMap,
                },
            });
        };

        void loadData();

        return () => {
            isMounted = false;
        };
    }, [fetchKey]); // Re-fetch only if routeName or IDs change

    // Process & Deduplicate Segments
    const allSegments = useMemo(() => {
        if (activeFetched.dataMap.size === 0) {
            return { upSegments: [], downSegments: [] };
        }
        return processAllRoutes(routeIds, activeFetched);
    }, [activeFetched, routeIds]);

    const bounds = useMemo<Bounds | null>(() => {
        if (activeFetched.dataMap.size === 0) return null;

        let merged: BBox | null = null;

        for (const routeId of routeIds) {
            const data = activeFetched.dataMap.get(routeId);
            if (!data) continue;

            const bbox = getBBoxFromFeature(data);
            if (!bbox) continue;

            merged = merged ? mergeBBox(merged, bbox) : bbox;
        }

        if (!merged) return null;

        const [minLng, minLat, maxLng, maxLat] = merged;
        return [
            [minLat, minLng],
            [maxLat, maxLng],
        ];
    }, [activeFetched.dataMap, routeIds]);

    // Filter Active/Inactive
    const result = useMemo(() => {
        const activeUp: PolylineSegment[] = [];
        const inactiveUp: PolylineSegment[] = [];
        const activeDown: PolylineSegment[] = [];
        const inactiveDown: PolylineSegment[] = [];

        const activeSet = new Set(activeRouteIds ?? []);

        const split = (
            source: PolylineSegment[],
            activeTarget: PolylineSegment[],
            inactiveTarget: PolylineSegment[]
        ) => {
            source.forEach((seg) => {
                // A segment is active if it contains the currently selected routeId
                if (activeSet.size > 0 && seg.routeIds.some((id) => activeSet.has(id))) {
                    activeTarget.push(seg);
                } else {
                    inactiveTarget.push(seg);
                }
            });
        };

        split(allSegments.upSegments, activeUp, inactiveUp);
        split(allSegments.downSegments, activeDown, inactiveDown);

        return {
            activeUpSegments: activeUp,
            inactiveUpSegments: inactiveUp,
            activeDownSegments: activeDown,
            inactiveDownSegments: inactiveDown,
            bounds,
        };
    }, [allSegments, activeRouteIds, bounds]);

    return result;
}
