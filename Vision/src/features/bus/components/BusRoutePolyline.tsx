"use client";

import { Polyline } from "react-leaflet";
import { memo, useEffect, useMemo, useRef, useState } from "react";

import { APP_CONFIG, MAP_SETTINGS } from "@core/config/env";

import { useBusContext } from "@map/context/MapContext";

import { getRouteInfo } from "@bus/api/getStaticData";

import { useBusLocationData } from "@bus/hooks/useBusLocation";
import type { PolylineSegment } from "@bus/hooks/useBusMultiPolyline";
import { useMultiPolyline } from "@bus/hooks/useBusMultiPolyline";

import type { PathOptions } from "leaflet";

// ----------------------------------------------------------------------
// Constants
// ----------------------------------------------------------------------

const COLORS = {
    // Active route colors (vibrant)
    ACTIVE_UP: "#2563eb",       // Blue-600 (more saturated)
    ACTIVE_DOWN: "#dc2626",     // Red-600
    // Inactive route colors (muted)
    INACTIVE_UP: "#bfdbfe",     // Blue-200
    INACTIVE_DOWN: "#fecaca",   // Red-200
    // Glow effect colors (semi-transparent)
    GLOW_UP: "rgba(37, 99, 235, 0.35)",    // Blue glow
    GLOW_DOWN: "rgba(220, 38, 38, 0.35)",  // Red glow
} as const;

const BASE_OPTIONS: PathOptions = {
    lineCap: "round",
    lineJoin: "round",
};

// Animation keyframe styles for dashed line effect
const ANIMATED_DASH_STYLES = `
@keyframes polylineDashFlow {
    0% { stroke-dashoffset: 0; }
    100% { stroke-dashoffset: -24; }
}
.polyline-animated path {
    animation: polylineDashFlow 1s linear infinite;
}
`;

// Style tag ID for polyline animations
const POLYLINE_STYLE_ID = "bus-polyline-animation-style";

// ----------------------------------------------------------------------
// Helper Hook: useRouteIds
// ----------------------------------------------------------------------
// Hook: Animation Styles Injection
// ----------------------------------------------------------------------

function usePolylineStyles() {
    useEffect(() => {
        if (typeof window === "undefined") return;
        if (document.getElementById(POLYLINE_STYLE_ID)) return;

        const style = document.createElement("style");
        style.id = POLYLINE_STYLE_ID;
        style.textContent = ANIMATED_DASH_STYLES;
        document.head.appendChild(style);
    }, []);
}

// ----------------------------------------------------------------------
// Helper Hook: useRouteIds
// ----------------------------------------------------------------------

function useRouteIds(routeName: string) {
    const [routeIds, setRouteIds] = useState<string[]>([]);

    useEffect(() => {
        let isMounted = true;

        const fetchRouteIds = async () => {
            try {
                const info = await getRouteInfo(routeName);
                if (isMounted) {
                    setRouteIds(info?.vehicleRouteIds ?? []);
                }
            } catch (error) {
                if (APP_CONFIG.IS_DEV) console.error(error);
            }
        };

        fetchRouteIds();

        return () => {
            isMounted = false;
        };
    }, [routeName]);

    return routeIds;
}

// ----------------------------------------------------------------------
// Sub-Component: GlowPolylineLayer (Active routes with glow effect)
// ----------------------------------------------------------------------

interface GlowPolylineLayerProps {
    segments: PolylineSegment[];
    color: string;
    glowColor: string;
    isAnimated?: boolean;
}

const GlowPolylineLayer = memo(({
    segments,
    color,
    glowColor,
    isAnimated = false,
}: GlowPolylineLayerProps) => {
    // Glow layer (background, slightly thicker, semi-transparent)
    const glowOptions = useMemo<PathOptions>(() => ({
        ...BASE_OPTIONS,
        color: glowColor,
        weight: 10,
        opacity: 1,
    }), [glowColor]);

    // Main line layer (foreground)
    const mainOptions = useMemo<PathOptions>(() => ({
        ...BASE_OPTIONS,
        color,
        weight: 4,
        opacity: 1,
    }), [color]);

    // Animated line options (with className for CSS animation)
    const animatedOptions = useMemo<PathOptions>(() => ({
        ...mainOptions,
        className: "polyline-animated",
        dashArray: "8, 8",
    }), [mainOptions]);

    if (segments.length === 0) return null;

    return (
        <>
            {/* Glow Layer (rendered first, behind main line) */}
            {segments.map((segment, idx) => {
                const key = `glow-${segment.direction}-${segment.routeIds.join("_")}-${idx}`;
                return (
                    <Polyline
                        key={key}
                        positions={segment.coords}
                        pathOptions={glowOptions}
                    />
                );
            })}
            {/* Main Line Layer */}
            {segments.map((segment, idx) => {
                const key = `main-${segment.direction}-${segment.routeIds.join("_")}-${idx}`;
                return (
                    <Polyline
                        key={key}
                        positions={segment.coords}
                        pathOptions={isAnimated ? animatedOptions : mainOptions}
                    />
                );
            })}
        </>
    );
});

GlowPolylineLayer.displayName = "GlowPolylineLayer";

// ----------------------------------------------------------------------
// Sub-Component: PolylineLayer (Inactive routes, simple style)
// ----------------------------------------------------------------------

interface PolylineLayerProps {
    segments: PolylineSegment[];
    color: string;
    weight?: number;
    opacity?: number;
    isDashed?: boolean;
}

const PolylineLayer = memo(({
    segments,
    color,
    weight = 4,
    opacity = 0.4,
    isDashed = true,
}: PolylineLayerProps) => {
    const pathOptions = useMemo<PathOptions>(() => ({
        ...BASE_OPTIONS,
        color,
        weight,
        opacity,
        dashArray: isDashed ? "6, 8" : undefined,
    }), [color, weight, opacity, isDashed]);

    if (segments.length === 0) return null;

    return (
        <>
            {segments.map((segment, idx) => {
                const key = `${segment.direction}-${segment.routeIds.join("_")}-${idx}`;
                return (
                    <Polyline
                        key={key}
                        positions={segment.coords}
                        pathOptions={pathOptions}
                    />
                );
            })}
        </>
    );
});

PolylineLayer.displayName = "PolylineLayer";

// ----------------------------------------------------------------------
// Main Component
// ----------------------------------------------------------------------

export default function BusRoutePolyline({ routeName }: { routeName: string }) {
    // Initialize styles
    usePolylineStyles();

    // Data Fetching
    const { map } = useBusContext();
    const routeIds = useRouteIds(routeName);
    const { data: busList } = useBusLocationData(routeName);
    const lastBoundsKeyRef = useRef<string | null>(null);

    // Determine active route IDs (routes with running buses)
    // Filter to only include IDs that are valid for this route (from route_numbers)
    const activeRouteIds = useMemo(() => {
        const validRouteIdSet = new Set(routeIds);
        const busRouteIds = busList
            .map((bus) => bus.routeid)
            .filter((id): id is string => Boolean(id) && validRouteIdSet.has(id));
        return Array.from(new Set(busRouteIds));
    }, [busList, routeIds]);

    const {
        activeUpSegments,
        inactiveUpSegments,
        activeDownSegments,
        inactiveDownSegments,
        bounds,
    } = useMultiPolyline(routeName, routeIds, activeRouteIds);

    // Styling Logic
    const hasActiveSegments = activeUpSegments.length > 0 || activeDownSegments.length > 0;
    const isNoBusRunning = busList.length === 0;

    // When no bus is running, show all segments as "primary" but without glow
    const displayActiveUpSegments = hasActiveSegments ? activeUpSegments : inactiveUpSegments;
    const displayActiveDownSegments = hasActiveSegments ? activeDownSegments : inactiveDownSegments;

    // Fit map to bounds
    useEffect(() => {
        if (!map || !bounds) return;

        const key = bounds.flat().join(",");
        if (lastBoundsKeyRef.current === key) return;
        lastBoundsKeyRef.current = key;

        map.fitBounds(bounds, {
            padding: [32, 32],
            animate: true,
            duration: MAP_SETTINGS.ANIMATION.FLY_TO_MS / 1000,
        });
    }, [map, bounds]);

    return (
        <>
            {/* 
             * Polyline Rendering Strategy:
             * - When buses are running: Only show polylines for route IDs with active buses
             * - When no buses: Show all polylines from route_numbers as fallback
             * 
             * Note: We intentionally don't show inactive route polylines to avoid cluttering
             * the map with routes that have no active buses.
             */}

            {/* Active Routes (with glow effect when buses are running) */}
            {isNoBusRunning ? (
                // No buses: Show all segments as simple dashed lines
                <>
                    <PolylineLayer
                        segments={displayActiveUpSegments}
                        color={COLORS.ACTIVE_UP}
                        weight={4}
                        opacity={0.7}
                        isDashed={true}
                    />
                    <PolylineLayer
                        segments={displayActiveDownSegments}
                        color={COLORS.ACTIVE_DOWN}
                        weight={4}
                        opacity={0.7}
                        isDashed={true}
                    />
                </>
            ) : (
                // Buses running: Show ONLY active route segments with glow effect
                <>
                    <GlowPolylineLayer
                        segments={activeUpSegments}
                        color={COLORS.ACTIVE_UP}
                        glowColor={COLORS.GLOW_UP}
                        isAnimated={false}
                    />
                    <GlowPolylineLayer
                        segments={activeDownSegments}
                        color={COLORS.ACTIVE_DOWN}
                        glowColor={COLORS.GLOW_DOWN}
                        isAnimated={false}
                    />
                </>
            )}
        </>
    );
}
