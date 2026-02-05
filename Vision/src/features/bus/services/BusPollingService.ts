import { API_CONFIG, APP_CONFIG } from "@core/config/env";

import { getBusLocationData } from "@bus/api/getRealtimeData";
import { getRouteMap } from "@bus/api/getStaticData";

import type { BusItem } from "@core/domain/bus";
import type { BusDataError } from "@core/domain/error";

// Valid error codes that can be emitted
const VALID_ERROR_CODES: Set<Exclude<BusDataError, null>> = new Set([
    "ERR:NONE_RUNNING",
    "ERR:NETWORK",
    "ERR:INVALID_ROUTE",
]);

// Listener type definitions
type DataListener = (data: BusItem[]) => void;
type ErrorListener = (error: BusDataError) => void;

/**
 * Service class for managing bus location polling
 * Handles data fetching, caching, and listener management for bus location updates
 */
export class BusPollingService {
    private cache: Record<string, BusItem[]> = {};
    private dataListeners: Record<string, Set<DataListener>> = {};
    private errorListeners: Record<string, Set<ErrorListener>> = {};
    private intervals: Record<string, ReturnType<typeof setInterval>> = {};
    private visibilityHandlers: Record<string, () => void> = {};
    private pageShowHandlers: Record<string, (e: PageTransitionEvent) => void> = {};

    /**
     * Subscribe to bus location data updates for a route
     */
    subscribe(
        routeName: string,
        onData: DataListener,
        onError: ErrorListener
    ): () => void {
        // Initialize listener sets if they don't exist
        if (!this.dataListeners[routeName]) {
            this.dataListeners[routeName] = new Set();
        }
        if (!this.errorListeners[routeName]) {
            this.errorListeners[routeName] = new Set();
        }

        this.dataListeners[routeName].add(onData);
        this.errorListeners[routeName].add(onError);

        // If data is already cached, notify immediately
        if (this.cache[routeName]) {
            onData(this.cache[routeName]);
        }

        // Return cleanup function
        return () => {
            this.dataListeners[routeName]?.delete(onData);
            this.errorListeners[routeName]?.delete(onError);

            // Clean up empty listener sets
            if (this.dataListeners[routeName]?.size === 0) {
                delete this.dataListeners[routeName];
            }
            if (this.errorListeners[routeName]?.size === 0) {
                delete this.errorListeners[routeName];
            }
        };
    }

    /**
     * Clear cache for all routes except the specified one
     */
    clearOtherCaches(currentRoute: string): void {
        const cleanupKeys = <T>(obj: Record<string, T>, shouldKeep: (key: string) => boolean) => {
            Object.keys(obj).filter(k => !shouldKeep(k)).forEach(k => delete obj[k]);
        };

        cleanupKeys(this.cache, k => k === currentRoute);
        cleanupKeys(this.dataListeners, k => k === currentRoute || (this.dataListeners[k]?.size ?? 0) > 0);
        cleanupKeys(this.errorListeners, k => k === currentRoute || (this.errorListeners[k]?.size ?? 0) > 0);
    }

    /**
     * Clear all caches and stop all polling
     * Useful for cleanup when component unmounts or app closes
     */
    cleanup(): void {
        this.stopAllPolling();
        this.cache = {};
        this.dataListeners = {};
        this.errorListeners = {};
    }

    /**
     * Start polling for bus location data
     */
    startPolling(routeName: string): () => void {
        // Don't start if already polling
        if (this.intervals[routeName]) {
            return () => this.stopPolling(routeName);
        }

        const fetchFn = () => this.fetchAndUpdate(routeName);

        // Immediate fetch
        fetchFn();

        // Set up polling interval
        this.intervals[routeName] = setInterval(fetchFn, API_CONFIG.LIVE.POLLING_INTERVAL_MS);

        // Visibility listener - refresh data when page becomes visible
        const onVisible = () => {
            if (document.visibilityState === "visible") fetchFn();
        };

        // Page show listener - refresh data when page is restored from cache
        const onPageShow = (e: PageTransitionEvent) => {
            if (e.persisted) fetchFn();
        };

        this.visibilityHandlers[routeName] = onVisible;
        this.pageShowHandlers[routeName] = onPageShow;

        document.addEventListener("visibilitychange", onVisible);
        window.addEventListener("pageshow", onPageShow);

        // Return cleanup function
        return () => this.stopPolling(routeName);
    }

    /**
     * Stop polling for a route
     */
    stopPolling(routeName: string): void {
        if (this.intervals[routeName]) {
            clearInterval(this.intervals[routeName]);
            delete this.intervals[routeName];
        }

        if (this.visibilityHandlers[routeName]) {
            document.removeEventListener(
                "visibilitychange",
                this.visibilityHandlers[routeName]
            );
            delete this.visibilityHandlers[routeName];
        }

        if (this.pageShowHandlers[routeName]) {
            window.removeEventListener("pageshow", this.pageShowHandlers[routeName]);
            delete this.pageShowHandlers[routeName];
        }
    }

    /**
     * Stop all polling
     */
    stopAllPolling(): void {
        Object.keys(this.intervals).forEach((routeName) => {
            this.stopPolling(routeName);
        });
    }

    /**
     * Fetch and update bus location data for a route
     */
    private async fetchAndUpdate(routeName: string): Promise<void> {
        try {
            const routeMap = await getRouteMap();
            const vehicleIds = routeMap[routeName];

            if (!vehicleIds || vehicleIds.length === 0) {
                throw new Error("[BusPollingService] Route ID " + routeName + " not found in RouteMap.");
            }

            // Fetch bus data for each routeId and track which routeId it came from
            const results = await Promise.allSettled(
                vehicleIds.map(async (routeId) => {
                    const buses = await getBusLocationData(routeId);
                    // Inject routeid into each bus item since API doesn't provide it
                    return buses.map((bus) => ({
                        ...bus,
                        routeid: bus.routeid || routeId, // Use API value if present, otherwise inject
                    }));
                })
            );

            const fulfilled = results.filter(
                (r): r is PromiseFulfilledResult<BusItem[]> =>
                    r.status === "fulfilled"
            );

            if (fulfilled.length === 0) {
                throw new Error("[BusPollingService] Failed to fetch BusLocationData for all vehicle IDs.");
            }

            const buses = fulfilled.flatMap((r) => r.value);

            this.cache[routeName] = buses;
            this.dataListeners[routeName]?.forEach((cb) => cb(buses));

            if (buses.length === 0) {
                this.errorListeners[routeName]?.forEach((cb) =>
                    cb("ERR:NONE_RUNNING")
                );
            } else {
                this.errorListeners[routeName]?.forEach((cb) => cb(null));
            }
        } catch (err: unknown) {
            if (APP_CONFIG.IS_DEV)
                console.error("[BusPollingService] Failed to fetch BusLocationData for route:", "[" + routeName + "]", err);

            this.cache[routeName] = [];
            this.dataListeners[routeName]?.forEach((cb) => cb([]));

            let errorCode: BusDataError = "ERR:NETWORK";
            if (
                err instanceof Error &&
                VALID_ERROR_CODES.has(err.message as Exclude<BusDataError, null>)
            ) {
                errorCode = err.message as BusDataError;
            }

            this.errorListeners[routeName]?.forEach((cb) => cb(errorCode));
        }
    }
}

// Export singleton instance
export const busPollingService = new BusPollingService();
