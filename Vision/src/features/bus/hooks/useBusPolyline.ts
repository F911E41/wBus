import { useEffect, useState } from "react";

import { APP_CONFIG } from "@core/config/env";

import { getPolyline } from "@bus/api/getStaticData";
import { transformPolyline } from "@bus/utils/polyUtils";

// ----------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------

type Coordinate = [number, number];

interface PolylineState {
    // Returns array of segments (Coordinate[][]) to support multi-colored segments if needed.
    // If you only need a single line, use mergePolylines utility in the consumer.
    upPolyline: Coordinate[][];
    downPolyline: Coordinate[][];
}

const INITIAL_STATE: PolylineState = {
    upPolyline: [],
    downPolyline: [],
};

// ----------------------------------------------------------------------
// Hook
// ----------------------------------------------------------------------

export function useBusPolyline(routeId?: string | null) {
    const [snapshot, setSnapshot] = useState<{
        routeId: string;
        polylines: PolylineState;
    } | null>(null);

    useEffect(() => {
        // Reset or Early Return
        if (!routeId) return;

        let isMounted = true;

        const fetchAndTransform = async () => {
            try {
                const rawData = await getPolyline(routeId);

                if (!isMounted) return;

                if (rawData) {
                    // Optimization: Transform immediately, don't store raw GeoJSON in state
                    const transformed = transformPolyline(rawData);
                    setSnapshot({ routeId, polylines: transformed });
                } else {
                    // Handle 404 or empty data
                    setSnapshot({ routeId, polylines: INITIAL_STATE });
                }
            } catch (error) {
                if (APP_CONFIG.IS_DEV) {
                    console.error(`[useBusPolyline] Failed to fetch route ${routeId}`, error);
                }
                if (isMounted) {
                    setSnapshot({ routeId, polylines: INITIAL_STATE });
                }
            }
        };

        void fetchAndTransform();

        // Cleanup to prevent race conditions
        return () => {
            isMounted = false;
        };
    }, [routeId]);

    if (!routeId || snapshot?.routeId !== routeId) {
        return INITIAL_STATE;
    }

    return snapshot.polylines;
}
