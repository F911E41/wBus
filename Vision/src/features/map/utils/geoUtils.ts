// ----------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------

export type Coordinate = [number, number]; // [Latitude, Longitude]

// Generic type for coordinate-like tuples (compatible with Leaflet's LatLngTuple)
// LatLngTuple is defined as [number, number, (number | undefined)?]
// We need to accept arrays where at minimum first two elements are numbers
type CoordinateLike = { readonly 0: number; readonly 1: number; readonly length: number };

// ----------------------------------------------------------------------
// Distance Calculations
// ----------------------------------------------------------------------

/**
 * Calculates the Great Circle (Haversine) distance between two geographic points.
 * Use this for accurate long-distance measurements on Earth.
 *
 *
 * @param lat1 Latitude of point 1
 * @param lon1 Longitude of point 1
 * @param lat2 Latitude of point 2
 * @param lon2 Longitude of point 2
 * @returns Distance in kilometers
 */
export function getHaversineDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
): number {
    const R = 6371; // Earth's radius in km
    const toRad = (deg: number) => (deg * Math.PI) / 180;

    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);

    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
}

/**
 * Calculates the Euclidean distance between two points (Planar approximation).
 * Faster than Haversine, suitable for very short distances or relative comparisons.
 *
 * @param P First point [lat, lng]
 * @param Q Second point [lat, lng]
 * @returns The straight-line distance in coordinate units
 */
export function getEuclideanDistance(P: CoordinateLike, Q: CoordinateLike): number {
    const dx = P[0] - Q[0];
    const dy = P[1] - Q[1];
    return Math.sqrt(dx * dx + dy * dy);
}

// ----------------------------------------------------------------------
// Direction & Projection
// ----------------------------------------------------------------------

/**
 * Calculates the initial bearing (forward azimuth) from point A to point B.
 * Returns the angle in degrees (0-360), where 0 is North, 90 is East.
 *
 * @param A Start point [lat, lng]
 * @param B End point [lat, lng]
 * @returns Bearing in degrees (0° to 360°)
 */
export function calculateBearing(A: CoordinateLike, B: CoordinateLike): number {
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const toDeg = (rad: number) => (rad * 180) / Math.PI;

    const lat1 = toRad(A[0]);
    const lat2 = toRad(B[0]);
    const dLon = toRad(B[1] - A[1]);

    const y = Math.sin(dLon) * Math.cos(lat2);
    const x =
        Math.cos(lat1) * Math.sin(lat2) -
        Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);

    const bearing = toDeg(Math.atan2(y, x));
    return (bearing + 360) % 360;
}

/**
 * Calculates the standard Cartesian angle between two points.
 * Note: This returns a math angle (Counter-clockwise from positive X-axis),
 * not necessarily a geographic map bearing.
 *
 * @param A Start point [lat, lng]
 * @param B End point [lat, lng]
 * @returns Angle in degrees
 */
export function calculateAngle(A: Coordinate, B: Coordinate): number {
    const deltaLat = B[0] - A[0];
    const deltaLng = B[1] - A[1];
    // atan2(y, x) -> result in radians
    return (Math.atan2(deltaLat, deltaLng) * 180) / Math.PI;
}

/**
 * Projects a point P onto the nearest location on the line segment AB.
 *
 * Used for snapping GPS points to a road geometry.
 *
 * @param P The point to project [lat, lng]
 * @param A Segment start [lat, lng]
 * @param B Segment end [lat, lng]
 * @returns The closest point on the segment [lat, lng]
 */
export function projectPointOnSegment(
    P: Coordinate,
    A: Coordinate,
    B: Coordinate
): Coordinate {
    const AP = [P[0] - A[0], P[1] - A[1]];
    const AB = [B[0] - A[0], B[1] - A[1]];

    const abSquared = AB[0] * AB[0] + AB[1] * AB[1];

    // If segment length is 0 (A and B are same), return A
    if (abSquared === 0) {
        return A;
    }

    // Project AP onto AB (dot product)
    const dot = AP[0] * AB[0] + AP[1] * AB[1];

    // Calculate normalized distance 't' along the segment
    let t = dot / abSquared;

    // Clamp t to the segment [0, 1] to ensure we stay within the segment
    if (t < 0) t = 0;
    if (t > 1) t = 1;

    return [A[0] + AB[0] * t, A[1] + AB[1] * t];
}

// ----------------------------------------------------------------------
// Polyline Snapping (Unified)
// ----------------------------------------------------------------------

export interface SnapResult {
    position: Coordinate;
    angle: number;
    segmentIndex: number;
    /** Normalized progress along the segment (0-1) */
    t: number;
}

export interface SnapOptions {
    /** Hint for where to start searching (segment index) */
    segmentHint?: number | null;
    /** Number of segments to search around the hint */
    searchRadius?: number;
}

/**
 * Helper: Clamps a value between 0 and max (inclusive).
 */
function clampIndex(value: number, max: number): number {
    return Math.max(0, Math.min(value, max));
}

/**
 * Snaps a point to the nearest position on a polyline.
 *
 * This is the unified snapping function used by both marker positioning
 * and animation interpolation. Uses segment hints for performance.
 *
 * @param point The GPS point to snap [lat, lng]
 * @param polyline Array of coordinates forming the route
 * @param options Search optimization options
 * @returns Snap result with position, angle, segment info
 */
export function snapPointToPolyline<T extends CoordinateLike>(
    point: CoordinateLike,
    polyline: T[],
    options?: SnapOptions
): SnapResult {
    const defaultResult: SnapResult = { position: [point[0], point[1]], angle: 0, segmentIndex: 0, t: 0 };

    if (!polyline || polyline.length < 2) {
        return defaultResult;
    }

    const lastSegment = polyline.length - 2;
    const hint = options?.segmentHint;
    const hasHint = typeof hint === "number" && Number.isFinite(hint);
    const radius = Math.max(0, Math.floor(options?.searchRadius ?? 0));

    const clampedHint = hasHint ? clampIndex(Math.round(hint), lastSegment) : 0;
    const startIdx = hasHint ? clampIndex(clampedHint - radius, lastSegment) : 0;
    const endIdx = hasHint ? clampIndex(clampedHint + radius, lastSegment) : lastSegment;

    let bestDistSq = Infinity;
    let bestPos: Coordinate = [polyline[0][0], polyline[0][1]];
    let bestIdx = 0;
    let bestT = 0;
    let bestSegment: { A: T; B: T } = { A: polyline[0], B: polyline[0] };

    for (let i = startIdx; i <= endIdx; i++) {
        const A = polyline[i];
        const B = polyline[i + 1];

        const AP_x = point[0] - A[0];
        const AP_y = point[1] - A[1];
        const AB_x = B[0] - A[0];
        const AB_y = B[1] - A[1];

        const ab2 = AB_x * AB_x + AB_y * AB_y;
        let t = 0;

        if (ab2 > 0) {
            const dot = AP_x * AB_x + AP_y * AB_y;
            t = Math.max(0, Math.min(1, dot / ab2));
        }

        const projX = A[0] + AB_x * t;
        const projY = A[1] + AB_y * t;

        const dx = point[0] - projX;
        const dy = point[1] - projY;
        const dSq = dx * dx + dy * dy;

        if (dSq < bestDistSq) {
            bestDistSq = dSq;
            bestPos = [projX, projY];
            bestIdx = i;
            bestT = t;
            bestSegment = { A, B };
        }
    }

    return {
        position: bestPos,
        angle: calculateBearing(bestSegment.A, bestSegment.B),
        segmentIndex: bestIdx,
        t: bestT,
    };
}

// ----------------------------------------------------------------------
// Distance Utilities (Meters)
// ----------------------------------------------------------------------

/**
 * Approximates distance in meters using a simplified spherical model.
 * Faster than Haversine, accurate enough for short distances (<10km).
 */
export function getApproxDistanceMeters(p1: CoordinateLike, p2: CoordinateLike): number {
    const latRad = ((p1[0] + p2[0]) * 0.5 * Math.PI) / 180;
    const lngScale = Math.cos(latRad);
    const dLat = p2[0] - p1[0];
    const dLng = (p2[1] - p1[1]) * lngScale;
    const distDeg = Math.sqrt(dLat * dLat + dLng * dLng);
    return distDeg * 111_000; // ~111km per degree at equator
}

/**
 * Haversine distance in meters (for higher accuracy).
 */
export function getHaversineDistanceMeters(p1: CoordinateLike, p2: CoordinateLike): number {
    return getHaversineDistance(p1[0], p1[1], p2[0], p2[1]) * 1000;
}

// ----------------------------------------------------------------------
// Angle Utilities
// ----------------------------------------------------------------------

/**
 * Normalizes an angle to the range [0, 360).
 */
export function normalizeAngle(angle: number): number {
    return ((angle % 360) + 360) % 360;
}

/**
 * Interpolates between two angles, handling the 359° → 0° wrap correctly.
 */
export function interpolateAngle(from: number, to: number, progress: number): number {
    const normFrom = normalizeAngle(from);
    const normTo = normalizeAngle(to);

    let diff = normTo - normFrom;
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;

    return normalizeAngle(normFrom + diff * progress);
}
