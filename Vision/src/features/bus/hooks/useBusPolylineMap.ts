import { useEffect, useMemo, useState } from "react";

import { APP_CONFIG } from "@core/config/env";

import { getPolyline, getRouteDetails, getStationMap } from "@bus/api/getStaticData";

import { getPolylineMeta, type StopIndexMap, transformPolyline } from "@bus/utils/polyUtils";
import { shouldSwapPolylines } from "@bus/utils/polylineDirection";

import type { StationLocation } from "@core/domain/station";
import type { RouteDetail } from "@core/domain/route";
import type { GeoPolyline } from "@core/domain/geojson";

// ----------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------

type Coordinate = [number, number];

export interface BusPolylineSet {
    upPolyline: Coordinate[];
    downPolyline: Coordinate[];
    stopIndexMap?: StopIndexMap;
    turnIndex?: number;
    isSwapped?: boolean;
}

interface FetchedRouteData {
    routeId: string;
    data: GeoPolyline | null;
    routeDetail: RouteDetail | null;
}

// ----------------------------------------------------------------------
// Helper: Pure Processing Logic
// ----------------------------------------------------------------------

/**
 * Processes raw API data into render-ready polylines.
 * Handles splitting, merging, and direction correction (swapping).
 */
function processRouteData(
    data: GeoPolyline,
    routeDetail: RouteDetail | null,
    stationMap: Record<string, StationLocation> | null
): BusPolylineSet {
    const meta = getPolylineMeta(data);

    // Split raw data into Up/Down segments
    const { upPolyline, downPolyline } = transformPolyline(data);

    // Merge segments into continuous lines
    const mergedUp = upPolyline.length > 0 ? upPolyline[0] : [];
    const mergedDown = downPolyline.length > 0 ? downPolyline[0] : [];

    // Check if we need to swap directions
    const shouldSwap = shouldSwapPolylines(routeDetail, stationMap, mergedUp, mergedDown);
    if (shouldSwap) {
        return {
            upPolyline: mergedDown, // Swap!
            downPolyline: mergedUp,
            stopIndexMap: meta.stopIndexMap,
            turnIndex: meta.turnIndex,
            isSwapped: true,
        };
    }

    return {
        upPolyline: mergedUp,
        downPolyline: mergedDown,
        stopIndexMap: meta.stopIndexMap,
        turnIndex: meta.turnIndex,
        isSwapped: false,
    };
}

// ----------------------------------------------------------------------
// Main Hook
// ----------------------------------------------------------------------

export function useBusPolylineMap(routeIds: string[]) {
    const [snapshot, setSnapshot] = useState<{
        key: string;
        map: Map<string, BusPolylineSet>;
    }>({
        key: "",
        map: new Map(),
    });

    // Create a stable key to prevent re-fetching when array reference changes but content is same
    const routeKey = useMemo(() => routeIds.slice().sort().join("|"), [routeIds]);

    useEffect(() => {
        if (!routeKey) return;

        let isMounted = true;
        const sortedRouteIds = routeKey.split("|").filter(Boolean);

        const loadData = async () => {
            // Parallel Fetching: Station Map + All Route Data
            // We don't wait for stationMap to start fetching routes.
            const stationMapPromise = getStationMap().catch((err) => {
                if (APP_CONFIG.IS_DEV) console.error("[useBusPolylineMap] Station Map Error", err);
                return null;
            });

            const routesPromise = Promise.all(
                sortedRouteIds.map(async (routeId): Promise<FetchedRouteData> => {
                    try {
                        const [data, routeDetail] = await Promise.all([
                            getPolyline(routeId),
                            getRouteDetails(routeId),
                        ]);
                        return { routeId, data, routeDetail };
                    } catch (error) {
                        if (APP_CONFIG.IS_DEV) {
                            console.error(`[useBusPolylineMap] Route Error (${routeId})`, error);
                        }
                        return { routeId, data: null, routeDetail: null };
                    }
                })
            );

            const [stationMap, routesData] = await Promise.all([
                stationMapPromise,
                routesPromise
            ]);

            if (!isMounted) return;

            // Process Data
            const nextMap = new Map<string, BusPolylineSet>();

            routesData.forEach(({ routeId, data, routeDetail }) => {
                if (!data) return;

                const processed = processRouteData(data, routeDetail, stationMap);
                nextMap.set(routeId, processed);
            });

            setSnapshot({ key: routeKey, map: nextMap });
        };

        void loadData();

        return () => {
            isMounted = false;
        };
    }, [routeKey]); // Depends only on the content-based key, not the routeIds array reference.

    return snapshot.key === routeKey ? snapshot.map : new Map();
}
