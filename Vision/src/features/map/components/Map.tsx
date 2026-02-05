"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import React, { memo, useCallback, useMemo, useRef } from "react";
import { MapContainer, ZoomControl } from "react-leaflet";

import type { LatLngBoundsExpression, LatLngExpression } from "leaflet";

import { MAP_SETTINGS } from "@core/config/env";

import { getInitialMapView } from "@map/utils/mapViewStorage";

// Feature Components
import BusMarker from "@bus/components/BusMarker";
import BusStopMarker from "@bus/components/BusStopMarker";
import BusRoutePolyline from "@bus/components/BusRoutePolyline";

// Map Sub-components
import MapContextBridge from "@map/components/MapContextBridge";
import MapLibreBaseLayer from "@map/components/MapLibreBaseLayer";
import MapViewPersistence from "@map/components/MapViewPersistence";

// ----------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------

interface MapProps {
    /** List of route IDs to render on the map */
    routeNames: string[];
    /** Callback fired once when the map base layer is fully loaded */
    onReady?: () => void;
    /** Callback fired when a route is interacted with (e.g., clicked) */
    onRouteChange?: (routeName: string) => void;
}

interface RouteMarkersProps {
    routeName: string;
    onRouteChange?: (routeName: string) => void;
}

// ----------------------------------------------------------------------
// Internal Optimized Components
// ----------------------------------------------------------------------

/**
 * A memoized wrapper for route-specific map elements (Buses, Stops, Path).
 * This prevents re-rendering ALL routes when only one route's data updates
 * or when the parent Map component re-renders.
 */
const RouteMarkers = memo(({ routeName, onRouteChange }: RouteMarkersProps) => {
    return (
        <>
            <BusMarker routeName={routeName} />
            <BusStopMarker routeName={routeName} onRouteChange={onRouteChange} />
            <BusRoutePolyline routeName={routeName} />
        </>
    );
}, (prev, next) => {
    // Custom comparison: Only re-render if routeName or handler changes
    return (
        prev.routeName === next.routeName &&
        prev.onRouteChange === next.onRouteChange
    );
});

RouteMarkers.displayName = "RouteMarkers";

// ----------------------------------------------------------------------
// Main Component
// ----------------------------------------------------------------------

export default function Map({ routeNames, onReady, onRouteChange }: MapProps) {
    // Ref to ensure the ready callback is fired exactly once
    const readyOnceRef = useRef(false);

    // Handler to signal parent that map is interactive
    const handleReadyOnce = useCallback(() => {
        if (readyOnceRef.current) return;
        readyOnceRef.current = true;
        onReady?.();
    }, [onReady]);

    // Load saved view state (center/zoom) or default from config
    const initialView = useMemo(() => getInitialMapView(), []);

    // Static Map Options (Memoized to prevent MapContainer re-initialization)
    const mapOptions = useMemo(() => ({
        center: initialView.center as LatLngExpression,
        zoom: initialView.zoom,
        minZoom: MAP_SETTINGS.ZOOM.MIN,
        maxZoom: MAP_SETTINGS.ZOOM.MAX,
        maxBounds: MAP_SETTINGS.BOUNDS.MAX as LatLngBoundsExpression,
        maxBoundsViscosity: 1.0,
        scrollWheelZoom: true,
        preferCanvas: true, // Use Canvas renderer for better performance with many markers
        zoomControl: false, // Disable default control to reposition it manually
    }), [initialView]);

    return (
        <MapContainer
            {...mapOptions}
            className="w-full h-full relative z-0"
        >
            {/* 1. UI Controls */}
            <ZoomControl position="topright" />

            {/* 2. Logic & Base Layers */}
            {/* MapContextBridge preserves context for children if needed */}
            <MapContextBridge>
                {/* Base Vector Tile Layer (MapLibre integration) */}
                <MapLibreBaseLayer onReady={handleReadyOnce} />

                {/* Persist user's zoom/pan state */}
                <MapViewPersistence />

                {/* 3. Data Layers (Routes) */}
                {routeNames.map((routeName) => (
                    <RouteMarkers
                        key={routeName}
                        routeName={routeName}
                        onRouteChange={onRouteChange}
                    />
                ))}
            </MapContextBridge>
        </MapContainer>
    );
}
