import { useEffect, useState } from "react";

import { busPollingService } from "@bus/services/BusPollingService";

import type { BusItem } from "@core/domain/bus";
import type { BusDataError } from "@core/domain/error";

/**
 * React hook to subscribe to bus location updates for a given route.
 * Automatically manages subscription lifecycle and cleanup.
 */
export function useBusLocationData(routeName: string): {
    data: BusItem[];
    error: BusDataError;
    hasFetched: boolean;
} {
    const [snapshot, setSnapshot] = useState<{
        routeName: string;
        data: BusItem[];
        error: BusDataError;
        hasFetched: boolean;
    }>({
        routeName: "",
        data: [],
        error: null,
        hasFetched: false,
    });

    useEffect(() => {
        if (!routeName) return;

        // Subscribe to bus location updates
        return busPollingService.subscribe(
            routeName,
            (data) => {
                setSnapshot({
                    routeName,
                    data,
                    error: null,
                    hasFetched: true,
                });
                // Only clear other caches after we have data for the new route
                busPollingService.clearOtherCaches(routeName);
            },
            (err) => {
                setSnapshot((prev) => ({
                    routeName,
                    data: err !== null && err !== undefined ? [] : (prev.routeName === routeName ? prev.data : []),
                    error: err,
                    hasFetched: true,
                }));
            }
        );
    }, [routeName]);

    const isActive = snapshot.routeName === routeName;

    return {
        data: isActive ? snapshot.data : [],
        error: isActive ? snapshot.error : null,
        hasFetched: isActive ? snapshot.hasFetched : false,
    };
}
