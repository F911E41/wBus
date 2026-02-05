import { useEffect, useState } from "react";

import { APP_CONFIG } from "@core/config/env";
import { CacheManager } from "@core/cache/CacheManager";

import { getBusStopLocationData, getRouteStopsByRouteName } from "@bus/api/getStaticData";

import { useBusContext } from "@map/context/MapContext";
import { getHaversineDistance } from "@map/utils/geoUtils";

import type { BusStop } from "@core/domain/station";

// ----------------------------------------------------------------------
// Constants & Caches
// ----------------------------------------------------------------------

const MIN_VALID_STOPS = 4;
const stopCache = new CacheManager<BusStop[]>();
const routeStopsCache = new CacheManager<BusStop[]>();

// ----------------------------------------------------------------------
// Helpers (Pure Functions)
// ----------------------------------------------------------------------
// @TODO: Move to utils if reused elsewhere

function getSortValue(stop: BusStop, fallback: number): number {
    const nodeord = Number(stop.nodeord);
    if (Number.isFinite(nodeord)) return nodeord;

    const nodeno = Number(stop.nodeno);
    if (Number.isFinite(nodeno)) return nodeno;

    return fallback;
}

function sortStops(list: BusStop[]): BusStop[] {
    return list
        .map((stop, index) => ({ stop, index }))
        .sort((a, b) => getSortValue(a.stop, a.index) - getSortValue(b.stop, b.index))
        .map(({ stop }) => stop);
}

// ----------------------------------------------------------------------
// Main Hook: Data Fetching
// ----------------------------------------------------------------------

export function useBusStop(routeName: string) {
    // Initialize from cache if available
    const [stops, setStops] = useState<BusStop[]>(() => {
        return routeStopsCache.get(routeName) ?? [];
    });

    useEffect(() => {
        if (!routeName) return;

        let isMounted = true;

        const fetchStops = async () => {
            try {
                // Check Cache Again (for strict mode safety)
                const cached = routeStopsCache.get(routeName);
                if (cached) {
                    if (isMounted) setStops(cached);
                    // If cached, we might still want to re-validate or just return.
                    // In this static data case, we can usually stop here if cache is trusted.
                    return;
                }

                // Fetch All Stations (Global Fallback)
                // This is memoized by stopCache
                const allStopsPromise = stopCache.getOrFetch("Stations", async () => {
                    const data = await getBusStopLocationData();
                    return sortStops(data);
                });

                // Fetch Specific Route Stops
                const routeStopsPromise = getRouteStopsByRouteName(routeName).then(sortStops);

                const [allStops, routeStops] = await Promise.all([
                    allStopsPromise,
                    routeStopsPromise
                ]);

                // Validation Strategy
                // If route 90 returns too few stops (API issue), fallback to all stops.
                const isValid = routeStops.length >= MIN_VALID_STOPS;
                const finalStops = isValid ? routeStops : allStops;

                // Update Cache & State
                routeStopsCache.set(routeName, finalStops);

                if (APP_CONFIG.IS_DEV) {
                    console.debug(
                        `[useBusStop] Route="${routeName}": matched=${routeStops.length}, fallback=${!isValid}`
                    );
                }

                if (isMounted) setStops(finalStops);
            } catch (err) {
                if (APP_CONFIG.IS_DEV) {
                    console.error(`[useBusStop] Failed to load stops for ${routeName}`, err);
                }
            }
        };

        fetchStops();

        return () => {
            isMounted = false;
        };
    }, [routeName]);

    return stops;
}

// ----------------------------------------------------------------------
// Secondary Hook: Closest Stop Calculation
// ----------------------------------------------------------------------

export function useClosestStopOrd(routeName: string): number | null {
    const { map } = useBusContext();
    const stops = useBusStop(routeName);
    const [closestOrd, setClosestOrd] = useState<number | null>(null);

    useEffect(() => {
        if (!map || stops.length === 0) return;

        const calculateClosest = () => {
            // Safety check for Leaflet map instance
            if (!map.getCenter) return;

            const { lat, lng } = map.getCenter();

            // Find closest stop using reduce
            // Optimization: Could use squared distance if perf is an issue
            const closest = stops.reduce((best, current) => {
                const bestDist = getHaversineDistance(lat, lng, best.gpslati, best.gpslong);
                const currDist = getHaversineDistance(lat, lng, current.gpslati, current.gpslong);
                return currDist < bestDist ? current : best;
            }, stops[0]);

            const ord = Number(closest.nodeord);
            setClosestOrd(Number.isFinite(ord) ? ord : null);
        };

        // Initial calculation
        map.whenReady(calculateClosest);

        // Event listener
        map.on("moveend", calculateClosest);

        return () => {
            map.off("moveend", calculateClosest);
        };
    }, [map, stops]);

    return closestOrd;
}
