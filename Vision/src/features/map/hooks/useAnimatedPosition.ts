"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MAP_SETTINGS } from "@core/config/env";
import {
    calculateBearing,
    getApproxDistanceMeters,
    getEuclideanDistance,
    interpolateAngle,
    snapPointToPolyline,
} from "@map/utils/geoUtils";

import type { LatLngTuple } from "leaflet";
import type L from "leaflet";

// ----------------------------------------------------------------------
// Types & Constants
// ----------------------------------------------------------------------

interface AnimatedPositionState {
    position: LatLngTuple;
    angle: number;
}

interface UseAnimatedPositionOptions {
    /** Animation duration in ms. Defaults to global setting. */
    duration?: number;
    /** The route path to snap the marker to. */
    polyline?: LatLngTuple[];
    /** If true, the marker is projected onto the polyline. */
    snapToPolyline?: boolean;
    /** Optional segment hint to keep snapping on the expected path. */
    snapIndexHint?: number | null;
    /** Optional search radius (segment count) around the hint. */
    snapIndexRange?: number;
    /** Forces an immediate re-sync when the key changes (e.g. route change). */
    resetKey?: string | number;
    /** Optional ref to Leaflet marker for direct DOM updates (bypasses React state for smoother animation) */
    markerRef?: React.RefObject<L.Marker | null>;
}

// Thresholds for backward movement detection
const BACKWARD_T_EPSILON = 1e-3;
const BACKWARD_JITTER_METERS = 12;

// Throttle state updates to reduce React re-renders (update every N ms)
const STATE_UPDATE_THROTTLE_MS = 50;

// ----------------------------------------------------------------------
// Pure Helper Functions
// ----------------------------------------------------------------------

/**
 * Detects if the new position is "behind" the previous position along the path.
 */
function isBackwardProgress(
    startSegIdx: number,
    startT: number,
    endSegIdx: number,
    endT: number
): boolean {
    if (endSegIdx < startSegIdx) return true;
    if (endSegIdx > startSegIdx) return false;
    return endT < startT - BACKWARD_T_EPSILON;
}

/**
 * Builds the animation path along the polyline from start to end.
 */
function buildPolylinePath(
    polyline: LatLngTuple[],
    startPos: LatLngTuple,
    startSegIdx: number,
    endPos: LatLngTuple,
    endSegIdx: number
): LatLngTuple[] {
    const path: LatLngTuple[] = [startPos];

    if (startSegIdx === endSegIdx) {
        path.push(endPos);
        return path;
    }

    const isForward = endSegIdx > startSegIdx;

    if (isForward) {
        for (let i = startSegIdx + 1; i <= endSegIdx; i++) {
            path.push(polyline[i]);
        }
        path.push(endPos);
    } else {
        // Backward: snap immediately without animation
        path.push(endPos);
    }

    return path;
}

/**
 * Precomputes cumulative distances along a path.
 * Returns the distances array and total distance.
 */
function precomputePathDistances(path: LatLngTuple[]): { distances: number[]; totalDistance: number } {
    if (path.length === 0) return { distances: [], totalDistance: 0 };
    if (path.length === 1) return { distances: [0], totalDistance: 0 };

    const distances: number[] = [0];
    for (let i = 1; i < path.length; i++) {
        distances.push(distances[i - 1] + getEuclideanDistance(path[i - 1], path[i]));
    }
    const totalDistance = distances[distances.length - 1];

    return { distances, totalDistance };
}

/**
 * Interpolates position and angle at a given progress (0-1) along a path.
 * Uses precomputed distances for efficiency.
 */
function interpolateAlongPathWithCache(
    path: LatLngTuple[],
    distances: number[],
    totalDistance: number,
    progress: number
): { position: LatLngTuple; angle: number } {
    if (path.length === 0) return { position: [0, 0], angle: 0 };
    if (path.length === 1) return { position: path[0], angle: 0 };

    if (totalDistance === 0) {
        return { position: path[path.length - 1], angle: 0 };
    }

    const clampedProgress = Math.max(0, Math.min(1, progress));
    const targetDistance = totalDistance * clampedProgress;

    // Binary search for active segment (more efficient for long paths)
    let segIdx = 0;
    let low = 0;
    let high = distances.length - 1;

    while (low < high) {
        const mid = (low + high + 1) >> 1;
        if (distances[mid] <= targetDistance) {
            low = mid;
        } else {
            high = mid - 1;
        }
    }
    segIdx = low;

    // Handle edge case when we're at the end
    if (segIdx >= path.length - 1) {
        segIdx = path.length - 2;
    }

    // Interpolate within segment
    const segStart = distances[segIdx];
    const segEnd = distances[segIdx + 1] ?? segStart;
    const segLen = segEnd - segStart;

    const t = segLen > 0 ? (targetDistance - segStart) / segLen : 0;

    const p1 = path[segIdx];
    const p2 = path[segIdx + 1] ?? p1;

    const position: LatLngTuple = [
        p1[0] + (p2[0] - p1[0]) * t,
        p1[1] + (p2[1] - p1[1]) * t,
    ];

    const angle = calculateBearing(p1, p2);

    return { position, angle };
}

/**
 * Easing functions for animation
 * - Cubic: Faster deceleration, snappier feel
 * - Quart: Smoother deceleration, more natural movement
 */
function easeOutQuart(t: number): number {
    return 1 - Math.pow(1 - t, 4);
}

// ----------------------------------------------------------------------
// Hook Definition
// ----------------------------------------------------------------------

/**
 * Animates a marker's position smoothly along a polyline.
 *
 * Features:
 * - Snaps GPS positions to the nearest point on the route
 * - Animates along the polyline path (not straight lines)
 * - Handles backward movement (GPS jitter) gracefully
 * - Uses requestAnimationFrame for smooth 60fps animation
 * - Optionally updates Leaflet marker directly for smoother rendering
 * - Precomputes path distances for efficient interpolation
 * - Throttles React state updates to reduce re-renders
 */
export function useAnimatedPosition(
    targetPosition: LatLngTuple,
    targetAngle: number,
    options: UseAnimatedPositionOptions = {}
): AnimatedPositionState {
    const {
        duration = MAP_SETTINGS.ANIMATION.BUS_MOVE_MS,
        polyline = [],
        snapToPolyline: shouldSnap = true,
        snapIndexHint = null,
        snapIndexRange,
        resetKey,
        markerRef,
    } = options;

    // State: Current visual position (throttled updates for React)
    const [state, setState] = useState<AnimatedPositionState>(() => {
        if (shouldSnap && polyline.length >= 2) {
            const snapped = snapPointToPolyline(targetPosition, polyline, {
                segmentHint: snapIndexHint,
                searchRadius: snapIndexRange,
            });
            return { position: snapped.position, angle: targetAngle };
        }
        return { position: targetPosition, angle: targetAngle };
    });

    // Refs for animation state
    const animationRef = useRef<number | null>(null);
    const isFirstRender = useRef(true);
    const hasInitialSnapped = useRef(false);
    const prevPolylineLengthRef = useRef(polyline.length);
    const prevTargetRef = useRef<LatLngTuple>(targetPosition);
    const prevSnapIndexRef = useRef<number | null>(snapIndexHint);

    const currentPosRef = useRef<LatLngTuple>(targetPosition);
    const currentAngleRef = useRef<number>(targetAngle);

    // Animation path data
    const animationPathRef = useRef<LatLngTuple[]>([]);
    const animationStartTimeRef = useRef<number>(0);
    const animationStartAngleRef = useRef<number>(targetAngle);
    const animationEndAngleRef = useRef<number>(targetAngle);
    const animationEndPosRef = useRef<LatLngTuple>(targetPosition);
    const resetKeyRef = useRef<string | number | undefined>(resetKey);

    // Precomputed path distances for efficient interpolation
    const pathDistancesRef = useRef<number[]>([]);
    const pathTotalDistanceRef = useRef<number>(0);

    // Throttle state updates
    const lastStateUpdateRef = useRef<number>(0);

    /**
     * Updates the Leaflet marker directly without going through React state.
     * This provides smoother animation by avoiding React's reconciliation.
     */
    const updateMarkerDirect = useCallback((pos: LatLngTuple, angle: number) => {
        const marker = markerRef?.current;
        if (!marker) return false;

        try {
            // Update position directly on the Leaflet marker
            marker.setLatLng(pos);

            // Update rotation if the marker supports it (leaflet-rotatedmarker)
            if (typeof (marker as L.Marker).setRotationAngle === "function") {
                (marker as L.Marker).setRotationAngle(angle);
            }
            return true;
        } catch {
            return false;
        }
    }, [markerRef]);

    // Handle route changes (reset key)
    useEffect(() => {
        if (resetKeyRef.current === resetKey) return;
        resetKeyRef.current = resetKey;

        if (animationRef.current !== null) {
            cancelAnimationFrame(animationRef.current);
            animationRef.current = null;
        }

        const hasPolyline = polyline.length >= 2;
        let nextPos = targetPosition;
        let nextAngle = targetAngle;
        let nextSnapIndex: number | null = snapIndexHint;

        if (shouldSnap && hasPolyline) {
            const snapped = snapPointToPolyline(targetPosition, polyline, {
                segmentHint: snapIndexHint,
                searchRadius: snapIndexRange,
            });
            nextPos = snapped.position;
            nextAngle = snapped.angle;
            nextSnapIndex ??= snapped.segmentIndex;
        }

        currentPosRef.current = nextPos;
        currentAngleRef.current = nextAngle;
        prevSnapIndexRef.current = nextSnapIndex;
        prevTargetRef.current = targetPosition;
        setState({ position: nextPos, angle: nextAngle });
    }, [resetKey, targetPosition, targetAngle, polyline, shouldSnap, snapIndexHint, snapIndexRange]);

    // Main animation effect
    useEffect(() => {
        const hasPolyline = polyline.length >= 2;
        const polylineJustLoaded = hasPolyline && prevPolylineLengthRef.current < 2;
        prevPolylineLengthRef.current = polyline.length;

        // First render OR polyline just became available: snap immediately
        if (isFirstRender.current || (polylineJustLoaded && !hasInitialSnapped.current)) {
            isFirstRender.current = false;
            let initPos: LatLngTuple = targetPosition;
            let initSnapIndex: number | null = snapIndexHint;

            if (shouldSnap && hasPolyline) {
                const snapped = snapPointToPolyline(targetPosition, polyline, {
                    segmentHint: snapIndexHint,
                    searchRadius: snapIndexRange,
                });
                initPos = snapped.position;
                initSnapIndex ??= snapped.segmentIndex;
                hasInitialSnapped.current = true;
                
                // Also update marker directly for immediate visual feedback
                updateMarkerDirect(initPos, targetAngle);
            }

            currentPosRef.current = initPos;
            currentAngleRef.current = targetAngle;
            prevSnapIndexRef.current = initSnapIndex;
            setState({ position: initPos, angle: targetAngle });
            prevTargetRef.current = targetPosition;
            return;
        }

        // Check if position actually changed
        const prev = prevTargetRef.current;
        const isSamePosition = targetPosition[0] === prev[0] && targetPosition[1] === prev[1];

        if (isSamePosition) {
            currentAngleRef.current = targetAngle;
            if (snapIndexHint !== null && snapIndexHint !== undefined) {
                prevSnapIndexRef.current = snapIndexHint;
            }
            setState(s => ({ ...s, angle: targetAngle }));
            return;
        }

        // Cancel any running animation
        if (animationRef.current !== null) {
            cancelAnimationFrame(animationRef.current);
        }
        prevTargetRef.current = targetPosition;

        const startPos = currentPosRef.current;
        const startAngle = currentAngleRef.current;

        let path: LatLngTuple[];
        let endPos: LatLngTuple;
        let endAngle: number;

        if (shouldSnap && hasPolyline) {
            const startSnapped = snapPointToPolyline(startPos, polyline, {
                segmentHint: prevSnapIndexRef.current,
                searchRadius: snapIndexRange,
            });
            const endSnapped = snapPointToPolyline(targetPosition, polyline, {
                segmentHint: snapIndexHint,
                searchRadius: snapIndexRange,
            });

            // Handle backward movement (GPS jitter)
            const isBackward = isBackwardProgress(
                startSnapped.segmentIndex,
                startSnapped.t,
                endSnapped.segmentIndex,
                endSnapped.t
            );

            if (isBackward) {
                const backMeters = getApproxDistanceMeters(startSnapped.position, endSnapped.position);

                // Small jitter: ignore
                if (backMeters <= BACKWARD_JITTER_METERS) {
                    return;
                }

                // Large jump: teleport immediately
                currentPosRef.current = endSnapped.position;
                currentAngleRef.current = endSnapped.angle;
                prevSnapIndexRef.current = snapIndexHint ?? endSnapped.segmentIndex;
                setState({ position: endSnapped.position, angle: endSnapped.angle });
                return;
            }

            path = buildPolylinePath(
                polyline,
                startSnapped.position,
                startSnapped.segmentIndex,
                endSnapped.position,
                endSnapped.segmentIndex
            );
            endPos = endSnapped.position;
            endAngle = endSnapped.angle;
            prevSnapIndexRef.current = snapIndexHint ?? endSnapped.segmentIndex;
        } else {
            // Direct linear interpolation
            path = [startPos, targetPosition];
            endPos = targetPosition;
            endAngle = targetAngle;
        }

        // Start animation with precomputed distances
        animationPathRef.current = path;
        const { distances, totalDistance } = precomputePathDistances(path);
        pathDistancesRef.current = distances;
        pathTotalDistanceRef.current = totalDistance;

        animationStartTimeRef.current = performance.now();
        animationStartAngleRef.current = startAngle;
        animationEndAngleRef.current = endAngle;
        animationEndPosRef.current = endPos;
        lastStateUpdateRef.current = 0;

        const tick = (currentTime: number) => {
            const elapsed = currentTime - animationStartTimeRef.current;
            const rawProgress = Math.min(elapsed / duration, 1);
            // Use quartic easing for smoother deceleration
            const progress = easeOutQuart(rawProgress);

            // Use precomputed distances for interpolation
            const pathResult = interpolateAlongPathWithCache(
                animationPathRef.current,
                pathDistancesRef.current,
                pathTotalDistanceRef.current,
                progress
            );

            const usePathAngle = animationPathRef.current.length > 1;
            const angle = usePathAngle
                ? pathResult.angle
                : interpolateAngle(
                    animationStartAngleRef.current,
                    animationEndAngleRef.current,
                    progress
                );

            currentPosRef.current = pathResult.position;
            currentAngleRef.current = angle;

            // Try direct marker update first (bypasses React for smoother animation)
            const directUpdateSuccess = updateMarkerDirect(pathResult.position, angle);

            // Throttle React state updates to reduce re-renders
            // Only update state if direct update failed or enough time has passed
            const timeSinceLastUpdate = currentTime - lastStateUpdateRef.current;
            const shouldUpdateState = !directUpdateSuccess ||
                timeSinceLastUpdate >= STATE_UPDATE_THROTTLE_MS ||
                rawProgress >= 1;

            if (shouldUpdateState) {
                lastStateUpdateRef.current = currentTime;
                setState({ position: pathResult.position, angle });
            }

            if (rawProgress < 1) {
                animationRef.current = requestAnimationFrame(tick);
            } else {
                // Ensure final position is exact
                currentPosRef.current = animationEndPosRef.current;
                currentAngleRef.current = animationEndAngleRef.current;
                updateMarkerDirect(animationEndPosRef.current, animationEndAngleRef.current);
                setState({
                    position: animationEndPosRef.current,
                    angle: animationEndAngleRef.current,
                });
                animationRef.current = null;
            }
        };

        animationRef.current = requestAnimationFrame(tick);

        return () => {
            if (animationRef.current !== null) {
                cancelAnimationFrame(animationRef.current);
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [targetPosition[0], targetPosition[1], targetAngle, duration, polyline, shouldSnap, snapIndexHint, snapIndexRange, updateMarkerDirect]);

    return state;
}
