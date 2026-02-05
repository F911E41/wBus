import { fetchAPI } from "@core/network/fetchAPI";

import type { BusItem } from "@core/domain/bus";
import type { BusStopArrival } from "@core/domain/station";

/**
 * Fetches real-time bus location data for a specific route.
 * @param routeId - The ID of the route to fetch bus locations for
 * @returns A promise that resolves to an array of bus location items
 */
export async function getBusLocationData(routeId: string): Promise<BusItem[]> {
    const data = await fetchAPI<{
        response?: { body?: { items?: { item?: BusItem[] } } };
    }>(`/getBusLocation/${routeId}`);
    const items = data.response?.body?.items?.item;
    return items ?? [];
}

/**
 * Fetches bus arrival information for a specific bus stop.
 * @param busStopId - The ID of the bus stop to fetch arrival information for
 * @returns A promise that resolves to an array of arrival information items
 */
export async function getBusStopArrivalData(busStopId: string): Promise<BusStopArrival[]> {
    const data = await fetchAPI<{
        response?: { body?: { items?: { item?: BusStopArrival | BusStopArrival[] } } };
    }>(`/getBusArrivalInfo/${busStopId}`);
    const rawItem = data.response?.body?.items?.item;
    if (!rawItem) {
        return [];
    }
    return Array.isArray(rawItem) ? rawItem : [rawItem];
}
