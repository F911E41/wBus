import { useMemo } from "react";

import { useBusStop, useClosestStopOrd } from "@bus/hooks/useBusStop";
import { useBusLocationData } from "@bus/hooks/useBusLocation";
import { useBusDirection } from "@bus/hooks/useBusDirection";

export const useBusSortedList = (routeName: string) => {
    const { data: mapList, error: mapError, hasFetched: locationFetched } = useBusLocationData(routeName);

    // Get bus stop data for the route
    const stops = useBusStop(routeName);

    const getDirection = useBusDirection(routeName);
    const closestOrd = useClosestStopOrd(routeName);

    // Combine errors
    const error = mapError;

    // Map of stop nodeid to nodeord for sorting
    const stopMap = useMemo(
        () => new Map(stops.map((s) => [s.nodeid, s.nodeord])),
        [stops]
    );

    // Even if stopMap (stop information) is not yet loaded, show the bus location data (mapList) if available.
    // The previous logic removed buses not in stopMap, causing the "No buses running" issue.
    const sortedList = useMemo(() => {
        // Return an empty array if no data
        if (!mapList || mapList.length === 0) return [];

        // Sorting logic
        return [...mapList].sort((a, b) => {
            // If no stop information, send order to the end (Infinity)
            // Important: Do not remove with filter, just push order to the end to prevent data disappearance
            const ordA = stopMap.get(a.nodeid) ?? Infinity;
            const ordB = stopMap.get(b.nodeid) ?? Infinity;

            // 1st priority: If both have stop information, sort by proximity
            if (ordA !== Infinity && ordB !== Infinity && closestOrd) {
                return Math.abs(ordA - closestOrd) - Math.abs(ordB - closestOrd);
            }

            // 2nd priority: Move those with stop information forward
            if (ordA !== Infinity) return -1;
            if (ordB !== Infinity) return 1;

            // 3rd priority: If both have no information, keep as is (or add sorting by vehicle number, etc.)
            return 0;
        });
    }, [mapList, stopMap, closestOrd]);

    // If bus location data has finished loading (true), display data regardless of stop information loading status
    const hasFetched = locationFetched;

    // Return object Memoization
    // Without this, an infinite loop occurs in BusList's RouteDataCollector.
    return useMemo(() => ({
        sortedList,
        getDirection,
        error,
        hasFetched
    }), [sortedList, getDirection, error, hasFetched]);
};
