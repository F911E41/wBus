import { getHaversineDistanceMeters, snapPointToPolyline, } from "@map/utils/geoUtils";

import type { BusItem } from "@core/domain/bus";
import type { StopIndexMap } from "@bus/utils/polyUtils";

// ----------------------------------------------------------------------
// Constants & Types
// ----------------------------------------------------------------------

type Coordinate = [number, number]; // [Latitude, Longitude]

// Maximum distance (in meters) to consider a snap valid.
// If the bus is further than this from the line, we assume GPS drift or off-route.
const MAX_SNAP_DISTANCE_METERS = 50;
const DEFAULT_SNAP_INDEX_RANGE = 80;

interface SnappedResult {
    position: Coordinate;
    angle: number;
    direction: number;
    segmentIndex?: number | null;
}

interface SnapCandidate extends SnappedResult {
    distance: number;
    isValid: boolean;
}

interface GetSnappedOptions {
    stopIndexMap?: StopIndexMap | null;
    turnIndex?: number;
    isSwapped?: boolean;
    snapIndexRange?: number;
}

// ----------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------

function isFiniteNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
}

function clampIndex(value: number, max: number): number {
    return Math.max(0, Math.min(value, max));
}

function getStopCoordIndex(
    stopIndexMap: StopIndexMap | null | undefined,
    nodeid: string | null | undefined,
    nodeord: number,
    direction: number | null
): number | null {
    if (!stopIndexMap) return null;

    const cleanedId = typeof nodeid === "string" ? nodeid.trim() : "";
    const ord = Number(nodeord);

    if (direction !== null && direction !== undefined) {
        if (cleanedId) {
            const idx = stopIndexMap.byIdDir[`${cleanedId}-${direction}`];
            if (isFiniteNumber(idx)) return idx;
        }

        if (Number.isFinite(ord)) {
            const idx = stopIndexMap.byOrdDir[`${ord}-${direction}`];
            if (isFiniteNumber(idx)) return idx;
        }
    }

    if (cleanedId) {
        const idx = stopIndexMap.byId[cleanedId];
        if (isFiniteNumber(idx)) return idx;
    }

    if (Number.isFinite(ord)) {
        const idx = stopIndexMap.byOrd[String(ord)];
        if (isFiniteNumber(idx)) return idx;
    }

    return null;
}

function getSegmentHint(
    coordIndex: number | null,
    direction: number,
    lineLength: number,
    turnIndex: number | undefined,
    isSwapped: boolean | undefined
): number | null {
    if (!isFiniteNumber(coordIndex) || lineLength < 2) return null;

    const lastSegment = lineLength - 2;
    const effectiveDirection = isSwapped ? (direction === 1 ? 0 : 1) : direction;

    if (!isFiniteNumber(turnIndex)) {
        return clampIndex(coordIndex - 1, lastSegment);
    }

    const safeTurnIndex = Math.round(turnIndex);

    if (effectiveDirection === 1) {
        if (coordIndex > safeTurnIndex) return null;
        return clampIndex(coordIndex - 1, lastSegment);
    }

    if (coordIndex < safeTurnIndex) return null;

    const localIndex = coordIndex - safeTurnIndex;
    return clampIndex(localIndex - 1, lastSegment);
}

// ----------------------------------------------------------------------
// Main Logic
// ----------------------------------------------------------------------

/**
 * Snaps a bus's raw GPS position to the nearest point on the route polyline.
 * * * Strategy:
 * 1. Try snapping to both Up and Down polylines.
 * 2. If the API provides a direction (Up/Down) and the snap is valid (close enough),
 * TRUST the API. This prevents the bus from "jumping" across the street visually.
 * 3. If the API direction is missing or the bus is too far from that line,
 * fallback to the physically closest line.
 */
export function getSnappedPosition(
    bus: BusItem,
    getDirection: (nodeid: string, nodeord: number, routeid?: string | null) => number | null,
    upPolyline: Coordinate[],
    downPolyline: Coordinate[],
    options?: GetSnappedOptions
): SnappedResult {
    const { gpslati, gpslong, nodeid } = bus;
    const nodeord = Number(bus.nodeord);
    const rawPosition: Coordinate = [gpslati, gpslong];
    const {
        stopIndexMap,
        turnIndex,
        isSwapped,
        snapIndexRange = DEFAULT_SNAP_INDEX_RANGE,
    } = options ?? {};

    // Get API Direction Hint
    const apiDirection = getDirection(nodeid, nodeord, bus.routeid);

    // Default fallback result (Raw GPS)
    const defaultResult: SnappedResult = {
        position: rawPosition,
        angle: 0,
        direction: apiDirection ?? 0, // Default to Down(0) if unknown
        segmentIndex: null,
    };

    const stopIndexUp = getStopCoordIndex(stopIndexMap, nodeid, nodeord, 1);
    const stopIndexDown = getStopCoordIndex(stopIndexMap, nodeid, nodeord, 0);
    const stopIndexAny = getStopCoordIndex(stopIndexMap, nodeid, nodeord, null);

    // Create Snap Candidates
    const createCandidate = (line: Coordinate[], dir: number): SnapCandidate | null => {
        if (!line || line.length < 2) return null;

        const coordIndex = dir === 1 ? (stopIndexUp ?? stopIndexAny) : (stopIndexDown ?? stopIndexAny);
        const segmentHint = getSegmentHint(coordIndex, dir, line.length, turnIndex, isSwapped);

        const snapped = snapPointToPolyline(rawPosition, line, {
            segmentHint,
            searchRadius: snapIndexRange,
        });
        const distance = getHaversineDistanceMeters(rawPosition, snapped.position);

        return {
            position: snapped.position,
            angle: snapped.angle,
            direction: dir,
            segmentIndex: snapped.segmentIndex,
            distance,
            isValid: distance <= MAX_SNAP_DISTANCE_METERS,
        };
    };

    const candidateUp = createCandidate(upPolyline, 1);
    const candidateDown = createCandidate(downPolyline, 0);

    // Selection Strategy

    // Case A: Trust API Direction (Anti-Jitter)
    // If API says UP and we are close enough to the UP line, stick to it.
    if (apiDirection === 1 && candidateUp?.isValid) {
        return candidateUp;
    }
    if (apiDirection === 0 && candidateDown?.isValid) {
        return candidateDown;
    }

    // Case B: Fallback - Choose the Closest Valid Line
    // API was wrong, missing, or the bus drifted too far from the expected line.
    if (candidateUp?.isValid && candidateDown?.isValid) {
        return candidateUp.distance < candidateDown.distance
            ? candidateUp
            : candidateDown;
    }

    // Case C: Only one line is valid
    if (candidateUp?.isValid) return candidateUp;
    if (candidateDown?.isValid) return candidateDown;

    // Case D: Neither line is close (Off-route) -> Return raw GPS
    return defaultResult;
}
