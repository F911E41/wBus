import { useCallback, useEffect, useRef, useState } from "react";

import { API_CONFIG, APP_CONFIG } from "@core/config/env";
import { UI_TEXT } from "@core/config/locale";

import { getBusStopArrivalData } from "@bus/api/getRealtimeData";

import type { BusStopArrival } from "@core/domain/station";

export function useBusArrivalInfo(busStopId: string | null) {
    const [data, setData] = useState<BusStopArrival[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // A ref to keep track of the timer without causing re-renders
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    // Use useCallback to memoize the fetchData function
    const fetchData = useCallback(async () => {
        // Only fetch if a valid busStopId is provided
        if (!busStopId || busStopId.trim() === "") {
            setData([]); // Clear data if busStopId becomes invalid
            return;
        }

        setLoading(true);
        setError(null);
        try {
            const result = await getBusStopArrivalData(busStopId);
            setData(result);
        } catch (e) {
            if (APP_CONFIG.IS_DEV) {
                console.error("[useBusArrivalInfo] Error fetching bus arrival data:", e);
            }
            setError(UI_TEXT.ERROR.NO_ARRIVAL_INFO);
        } finally {
            setLoading(false);
        }
    }, [busStopId]);

    useEffect(() => {
        // Clear any existing timer when busStopId changes
        if (timerRef.current) {
            clearInterval(timerRef.current);
        }

        // Don't start a new fetch cycle if busStopId is invalid
        if (!busStopId || busStopId.trim() === "") {
            setData([]);
            return;
        }

        // Initial data fetch
        fetchData();

        // Start a new timer for periodic fetches
        timerRef.current = setInterval(fetchData, API_CONFIG.LIVE.POLLING_INTERVAL_MS);

        // Cleanup on unmount or busStopId change
        return () => {
            if (timerRef.current) {
                clearInterval(timerRef.current);
            }
        };
    }, [busStopId, fetchData]); // fetchData is stable due to useCallback

    return { data, loading, error };
}

// For extracting arrival info for a specific route in a simple way
export function getNextBusArrivalInfo(routeName: string, data: BusStopArrival[]) {
    // Use a more robust check to handle different route formats
    const target = data.find((bus) =>
        bus.routeno.replace(/-/g, "").trim() === routeName.replace(/-/g, "").trim()
    );

    if (!target) return null;

    return {
        minutes: Math.ceil(target.arrtime / 60),
        stopsAway: target.arrprevstationcnt,
    };
}
