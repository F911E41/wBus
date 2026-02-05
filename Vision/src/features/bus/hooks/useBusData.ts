import { useEffect, useMemo, useState } from "react";

import { getRouteInfo } from "@bus/api/getStaticData";

import { type BusPolylineSet, useBusPolylineMap } from "@bus/hooks/useBusPolylineMap";
import { useBusDirection } from "@bus/hooks/useBusDirection";
import { useBusLocationData } from "@bus/hooks/useBusLocation";

import type { RouteInfo } from "@core/domain/route";
import type { BusItem } from "@core/domain/bus";

export interface UseBusData {
    routeInfo: RouteInfo | null;
    busList: BusItem[];
    getDirection: ReturnType<typeof useBusDirection>;
    polylineMap: Map<string, BusPolylineSet>;
    fallbackPolylines: BusPolylineSet;
    activeRouteId: string | null;
}

/**
 * Custom hook that aggregates all bus-related data for a given route.
 * Combines route information, bus locations, polylines, and direction data.
 * @param routeName - The name of the route (e.g., "30", "34")
 * @returns An object containing all bus data for the route
 */
export function useBusData(routeName: string): UseBusData {
    const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null);
    const { data: busList } = useBusLocationData(routeName);
    const directionFn = useBusDirection(routeName);

    useEffect(() => {
        getRouteInfo(routeName).then(setRouteInfo);
    }, [routeName]);

    const activeRouteId = useMemo(() => {
        const liveRouteId = busList.find((bus) => bus.routeid)?.routeid;
        return liveRouteId ?? routeInfo?.vehicleRouteIds[0] ?? null;
    }, [busList, routeInfo]);

    const routeIds = useMemo(
        () => routeInfo?.vehicleRouteIds ?? [],
        [routeInfo]
    );

    const polylineMap = useBusPolylineMap(routeIds);

    const fallbackPolylines: BusPolylineSet = (() => {
        if (activeRouteId && polylineMap.has(activeRouteId)) {
            return polylineMap.get(activeRouteId)!;
        }

        for (const polyline of polylineMap.values()) {
            return polyline;
        }

        return { upPolyline: [], downPolyline: [] };
    })();

    return {
        routeInfo,
        busList,
        getDirection: directionFn,
        polylineMap,
        fallbackPolylines,
        activeRouteId,
    };
}
