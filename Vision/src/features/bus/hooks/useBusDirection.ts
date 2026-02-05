import { useCallback, useEffect, useMemo, useState } from "react";

import { APP_CONFIG, MAP_SETTINGS } from "@core/config/env";

import { getRouteDetails, getRouteInfo } from "@bus/api/getStaticData";

import { useBusStop } from "@bus/hooks/useBusStop";

// ----------------------------------------------------------------------
// Constants & Types
// ----------------------------------------------------------------------

export const Direction = {
    UP: 1,
    DOWN: 0,
} as const;

export type DirectionCode = typeof Direction[keyof typeof Direction] | null;

const ALWAYS_UPWARD_NODEIDS = new Set(MAP_SETTINGS.ALWAYS_UPWARD_NODE_IDS);

interface RouteSequenceData {
    routeid: string;
    sequence: { nodeid: string; nodeord: number; updowncd: number }[];
}

interface LoadedRouteState {
    sequences: RouteSequenceData[];
    routeIdOrder: string[]; // Keep track of fallback order (Up -> Down usually)
}

type SequenceLookupMap = Map<string, Array<{ routeid: string; nodeord: number; updowncd: number }>>;

// ----------------------------------------------------------------------
// Main Hook: useBusDirection
// ----------------------------------------------------------------------

/**
 * Determines the direction (Up/Down) of a bus based on its current Stop ID and Order.
 * Matches realtime bus data against static route definitions.
 */
export function useBusDirection(routeName: string) {
    const [isReady, setIsReady] = useState(false);
    const [routeState, setRouteState] = useState<LoadedRouteState>({
        sequences: [],
        routeIdOrder: [],
    });

    // Load Route Data
    useEffect(() => {
        let isMounted = true;

        const loadData = async () => {
            // Reset state immediately when routeName changes.
            // This prevents "stale data" from the previous route being used while the new one loads.
            setIsReady(false);
            setRouteState({ sequences: [], routeIdOrder: [] });

            try {
                const info = await getRouteInfo(routeName);
                if (!info) {
                    if (isMounted) setRouteState({ sequences: [], routeIdOrder: [] });
                    return;
                }

                const details = await Promise.all(
                    info.vehicleRouteIds.map(async (id) => {
                        const d = await getRouteDetails(id);
                        return d ? { routeid: id, sequence: d.sequence } : null;
                    })
                );

                if (isMounted) {
                    const validDetails = details.filter(Boolean) as RouteSequenceData[];
                    setRouteState({
                        sequences: validDetails,
                        routeIdOrder: validDetails.map((d) => d.routeid),
                    });
                    setIsReady(true);
                }
            } catch (err) {
                if (APP_CONFIG.IS_DEV) {
                    console.error(`[useBusDirection] Failed to load route: ${routeName}`, err);
                }
                if (isMounted) setRouteState({ sequences: [], routeIdOrder: [] });
            }
        };

        loadData();

        return () => {
            isMounted = false;
        };
    }, [routeName]);

    // Build Lookup Maps (Memoized)
    // Lookup: NodeID -> List of potential sequence items
    const sequenceLookupMap = useMemo<SequenceLookupMap>(() => {
        if (!isReady) return new Map(); // Return empty map if not ready
        const map: SequenceLookupMap = new Map();
        for (const { routeid, sequence } of routeState.sequences) {
            for (const item of sequence) {
                const list = map.get(item.nodeid) ?? [];
                list.push({ routeid, nodeord: item.nodeord, updowncd: item.updowncd });
                map.set(item.nodeid, list);
            }
        }
        return map;
    }, [routeState.sequences, isReady]);

    // Lookup: RouteID -> Does this route contain both Up(1) and Down(0) stops?
    const routeMixedDirMap = useMemo(() => {
        const map = new Map<string, boolean>();
        for (const { routeid, sequence } of routeState.sequences) {
            const directions = new Set(sequence.map((s) => s.updowncd));
            map.set(routeid, directions.size > 1);
        }
        return map;
    }, [routeState.sequences]);

    // Fallback: If route is split into two IDs (e.g. A -> B), assume 1st is Up, 2nd is Down.
    const fallbackDirMap = useMemo(() => {
        const map = new Map<string, DirectionCode>();
        if (routeState.routeIdOrder.length === 2) {
            map.set(routeState.routeIdOrder[0], Direction.UP);
            map.set(routeState.routeIdOrder[1], Direction.DOWN);
        }
        return map;
    }, [routeState.routeIdOrder]);

    const activeRouteIds = useMemo(
        () => new Set(routeState.sequences.map((s) => s.routeid)),
        [routeState.sequences]
    );

    // The Direction Resolver Function
    const getDirection = useCallback(
        (
            nodeid: string | null | undefined,
            nodeord: number,
            routeid?: string | null
        ): DirectionCode => {
            // Basic Validation
            if (!isReady) return null;
            if (!nodeid || typeof nodeid !== "string") return null;
            const normalizedNodeId = nodeid.trim();
            if (!normalizedNodeId) return null;

            const targetOrd = Number(nodeord);
            if (!Number.isFinite(targetOrd)) return null;

            // Rule 1: Always Upward Nodes (Hardcoded overrides)
            if (ALWAYS_UPWARD_NODEIDS.has(normalizedNodeId)) {
                return Direction.UP;
            }

            // Rule 2: Lookup Candidates
            const candidates = sequenceLookupMap.get(normalizedNodeId);
            if (!candidates || candidates.length === 0) return null;

            // Filter by routeID scope
            // If we know the bus's routeID, strictly match it. Otherwise use any active routeID.
            const scopedCandidates = routeid
                ? candidates.filter((c) => c.routeid === routeid)
                : candidates.filter((c) => activeRouteIds.has(c.routeid));

            const pool = scopedCandidates.length > 0 ? scopedCandidates : candidates;

            // Rule 3: Find Best Match (Exact Order > Closest Order)
            // We look for the stop in the sequence that matches the bus's current order (nodeord).
            const exactMatch = pool.find((c) => c.nodeord === targetOrd);

            const bestMatch = exactMatch || pool.reduce((best, curr) => {
                const bestDiff = Math.abs(best.nodeord - targetOrd);
                const currDiff = Math.abs(curr.nodeord - targetOrd);

                // Pick the one with smaller order difference.
                // Tie-breaker: prefer smaller nodeord (earlier in route).
                if (currDiff < bestDiff) return curr;
                if (currDiff === bestDiff && curr.nodeord < best.nodeord) return curr;
                return best;
            }, pool[0]);

            if (!bestMatch) return null;

            // Rule 4: Determine Final Direction
            // If the routeID is known to be strictly single-direction (not mixed),
            // we might use the fallback map (e.g. Route A=Up, Route B=Down).
            const isMixed = routeMixedDirMap.get(bestMatch.routeid) ?? false;
            const fallback = fallbackDirMap.get(bestMatch.routeid);

            if (!isMixed && fallback !== undefined) {
                return fallback;
            }

            // Default: Use the specific stop's direction code
            return bestMatch.updowncd === 0 ? Direction.DOWN : Direction.UP;
        },
        [sequenceLookupMap, activeRouteIds, routeMixedDirMap, fallbackDirMap, isReady]
    );

    return getDirection;
}

// ----------------------------------------------------------------------
// Helper Hook: useStopExists
// ----------------------------------------------------------------------

export function useStopExists(routeName: string) {
    const stops = useBusStop(routeName);

    // Create Set once for O(1) lookups
    const stopSet = useMemo(() => new Set(stops.map((s) => s.nodeid)), [stops]);

    return useCallback((nodeid: string | null | undefined): boolean => {
        if (!nodeid || typeof nodeid !== "string") return false;
        return stopSet.has(nodeid.trim());
    }, [stopSet]);
}

// ----------------------------------------------------------------------
// Standalone Helper
// ----------------------------------------------------------------------

export async function getDirectionFromRouteDetails(
    routeid: string,
    nodeord: number
): Promise<DirectionCode> {
    try {
        const detail = await getRouteDetails(routeid);
        if (!detail?.sequence) return null;

        const match = detail.sequence.find((s) => s.nodeord === nodeord);
        if (match) {
            return match.updowncd === 0 ? Direction.DOWN : Direction.UP;
        }
        return null;
    } catch (err) {
        if (APP_CONFIG.IS_DEV) {
            console.error("[getDirectionFromRouteDetails] Failed:", err);
        }
        return null;
    }
}
