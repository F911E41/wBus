import { snapToPolyline } from "@bus/utils/polyUtils";

import type { RouteDetail } from "@core/domain/route";
import type { StationLocation } from "@core/domain/station";

// ----------------------------------------------------------------------
// Constants & Types
// ----------------------------------------------------------------------

type Coordinate = [number, number]; // [Latitude, Longitude]

const MAX_SAMPLE_STOPS = 20;

// Swap threshold: If the alternative route is 10% closer (0.9), consider swapping.
// Since we use squared distances, we square the ratio: 0.9 * 0.9 = 0.81
const SWAP_RATIO_SQ = 0.81;

// ----------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------

/**
 * Calculates the squared Euclidean distance from a point to the nearest segment on a polyline.
 * * Optimization: Returns squared distance to avoid expensive Math.sqrt().
 */
function getSquaredDistanceToPolyline(
    point: Coordinate,
    polyline: Coordinate[]
): number {
    const snapped = snapToPolyline(point, polyline);

    const dLat = point[0] - snapped.position[0];
    const dLng = point[1] - snapped.position[1];

    return dLat * dLat + dLng * dLng;
}

/**
 * Reduces the number of stops to process by sampling.
 * Essential for performance when routes have 100+ stops.
 */
function sampleCoordinates(coords: Coordinate[]): Coordinate[] {
    if (coords.length <= MAX_SAMPLE_STOPS) return coords;

    const step = Math.ceil(coords.length / MAX_SAMPLE_STOPS);
    const sampled: Coordinate[] = [];

    for (let i = 0; i < coords.length; i += step) {
        sampled.push(coords[i]);
        // Safety break to respect limit strictly
        if (sampled.length >= MAX_SAMPLE_STOPS) break;
    }

    return sampled;
}

/**
 * Calculates the average *squared* distance from a set of points to a polyline.
 */
function calculateMeanSquaredError(
    points: Coordinate[],
    polyline: Coordinate[]
): number | null {
    if (points.length === 0 || polyline.length < 2) return null;

    let totalDistSq = 0;

    for (const point of points) {
        totalDistSq += getSquaredDistanceToPolyline(point, polyline);
    }

    return totalDistSq / points.length;
}

// ----------------------------------------------------------------------
// Main Logic
// ----------------------------------------------------------------------

/**
 * Determines if the Up/Down polylines are swapped based on station proximity.
 * * * Logic:
 * If "Up Stops" are significantly closer to the "Down Polyline" AND
 * "Down Stops" are significantly closer to the "Up Polyline",
 * it returns `true` (suggesting a swap).
 */
export function shouldSwapPolylines(
    routeDetail: RouteDetail | null,
    stationMap: Record<string, StationLocation> | null,
    upPolyline: Coordinate[],
    downPolyline: Coordinate[]
): boolean {
    // Validation
    if (!routeDetail || !stationMap) return false;
    if (upPolyline.length < 2 || downPolyline.length < 2) return false;

    // Extract Station Coordinates by Direction
    const upStops: Coordinate[] = [];
    const downStops: Coordinate[] = [];

    for (const stop of routeDetail.sequence) {
        const station = stationMap[stop.nodeid];
        if (!station) continue;

        const coord: Coordinate = [station.gpslati, station.gpslong];

        if (stop.updowncd === 1) {       // 1 = Up (상행)
            upStops.push(coord);
        } else if (stop.updowncd === 0) { // 0 = Down (하행)
            downStops.push(coord);
        }
    }

    if (upStops.length === 0 || downStops.length === 0) return false;

    // Sampling for Performance
    const upSample = sampleCoordinates(upStops);
    const downSample = sampleCoordinates(downStops);

    // Calculate Errors (Cross-Checking)
    // MSE: Mean Squared Error
    const mseUpToUp = calculateMeanSquaredError(upSample, upPolyline);
    const mseUpToDown = calculateMeanSquaredError(upSample, downPolyline);
    const mseDownToUp = calculateMeanSquaredError(downSample, upPolyline);
    const mseDownToDown = calculateMeanSquaredError(downSample, downPolyline);

    if (
        mseUpToUp === null || mseUpToDown === null ||
        mseDownToUp === null || mseDownToDown === null
    ) {
        return false;
    }

    // Verify Hypothesis
    // "Is the Up route actually closer to the Down line?"
    const upStopsMatchDownPoly = mseUpToDown < (mseUpToUp * SWAP_RATIO_SQ);

    // "Is the Down route actually closer to the Up line?"
    const downStopsMatchUpPoly = mseDownToUp < (mseDownToDown * SWAP_RATIO_SQ);

    // Only swap if BOTH conditions are met to be conservative
    return upStopsMatchDownPoly && downStopsMatchUpPoly;
}
