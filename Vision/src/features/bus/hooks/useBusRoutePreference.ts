import { useCallback, useMemo, useState } from "react";

import { APP_CONFIG, STORAGE_KEYS } from "@core/config/env";

/**
 * Hook to manage user's selected routeId preference using localStorage.
 * Remembers which route variant the user last selected.
 */
export function useBusRoutePreference(
    routeName: string,
    availableRouteIds: string[],
    liveRouteId: string | null
) {
    const [selectionByRoute, setSelectionByRoute] = useState<Record<string, string>>({});

    const storedRouteId = useMemo(() => {
        if (typeof window === "undefined") return null;
        try {
            return localStorage.getItem(`${STORAGE_KEYS.ROUTE_ID}_${routeName}`);
        } catch (error) {
            if (APP_CONFIG.IS_DEV) {
                console.warn("[useBusRoutePreference] Failed to load route preference from localStorage:", error);
            }
            return null;
        }
    }, [routeName]);

    const resolvedRouteId = useMemo(() => {
        const explicit = selectionByRoute[routeName];
        if (explicit && availableRouteIds.includes(explicit)) return explicit;
        if (storedRouteId && availableRouteIds.includes(storedRouteId)) return storedRouteId;
        if (liveRouteId && availableRouteIds.includes(liveRouteId)) return liveRouteId;
        return availableRouteIds[0] ?? null;
    }, [selectionByRoute, routeName, availableRouteIds, storedRouteId, liveRouteId]);

    // Save preference to localStorage when it changes
    const updateSelectedRouteId = useCallback(
        (routeId: string) => {
            if (availableRouteIds.includes(routeId)) {
                setSelectionByRoute((prev) => ({ ...prev, [routeName]: routeId }));
                try {
                    localStorage.setItem(`${STORAGE_KEYS.ROUTE_ID}_${routeName}`, routeId);
                } catch (error) {
                    // localStorage might not be available
                    if (APP_CONFIG.IS_DEV)
                        console.warn("[useBusRoutePreference] Failed to save route preference to localStorage:", error);
                }
            }
        },
        [routeName, availableRouteIds]
    );

    return {
        selectedRouteId: resolvedRouteId,
        updateSelectedRouteId,
        availableRouteIds,
    };
}
