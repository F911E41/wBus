"use client";

import L from "leaflet";
import "@maplibre/maplibre-gl-leaflet";

import { useMap } from "react-leaflet";
import { useEffect, useRef } from "react";
import { MapStyleImageMissingEvent } from "maplibre-gl";

import { APP_CONFIG } from "@core/config/env";
import { getMapStyle } from "@map/api/getMapData";

// ----------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------

interface MapLibreBaseLayerProps {
    /** Callback fired when the vector tiles and style are fully loaded and idle. */
    onReady?: () => void;
}

/**
 * Minimal type definition for the MapLibre instance exposed by the leaflet plugin.
 * This covers the methods needed to check loading status.
 */
interface MapLibreGLInstance {
    on?: (event: string, handler: () => void) => void;
    once?: (event: string, handler: () => void) => void;
    off?: (event: string, handler: () => void) => void;
    loaded?: () => boolean;
    areTilesLoaded?: () => boolean;
    isStyleLoaded?: () => boolean;

    // Fix: Sprite image management methods
    hasImage?: (id: string) => boolean;
    addImage?: (
        id: string,
        image: { width: number; height: number; data: Uint8Array }
    ) => void;
}

/**
 * Type extension for the Leaflet Layer to include the `getMap` method
 * provided by `@maplibre/maplibre-gl-leaflet`.
 */
type LeafletMapLibreLayer = L.Layer & {
    getMap?: () => MapLibreGLInstance
};

// ----------------------------------------------------------------------
// Component
// ----------------------------------------------------------------------

/**
 * Renders the vector base map using MapLibre GL JS within a Leaflet container.
 * Handles async style fetching and signals when the map is visually ready.
 */
export default function MapLibreBaseLayer({ onReady }: MapLibreBaseLayerProps) {
    const map = useMap();

    // Refs to manage lifecycle and cleanup
    const layerRef = useRef<LeafletMapLibreLayer | null>(null);
    const isReadySignaledRef = useRef(false);
    const cleanupListenersRef = useRef<(() => void) | null>(null);

    useEffect(() => {
        if (!map || typeof window === "undefined") return;

        let isActive = true;

        // Helper: Safely call onReady only once
        const signalReady = () => {
            if (isReadySignaledRef.current) return;
            isReadySignaledRef.current = true;
            onReady?.();
        };

        // Helper: Bind events to the underlying MapLibre instance to detect when tiles are ready
        const attachLoadListeners = (layer: LeafletMapLibreLayer) => {
            const glMap = layer.getMap?.();

            if (!glMap) {
                // Fallback: If we can't access the GL instance, assume ready immediately to unblock UI
                signalReady();
                return;
            }

            // Check if map is already idle/loaded
            const checkIsFullyLoaded = () => {
                const styleReady = glMap.isStyleLoaded?.() ?? glMap.loaded?.() ?? true;
                const tilesReady = glMap.areTilesLoaded?.() ?? glMap.loaded?.() ?? true;
                return styleReady && tilesReady;
            };

            const handleMissingImage = (e?: MapStyleImageMissingEvent) => {
                const id = e?.id;
                if (!id) return;

                if (APP_CONFIG.IS_DEV) {
                    console.warn("[MapLibre missing image]", id);
                }

                if (glMap.hasImage?.(id)) return;

                // Add a transparent 1x1 pixel as a placeholder
                glMap.addImage?.(id, {
                    width: 1,
                    height: 1,
                    data: new Uint8Array([0, 0, 0, 0]),
                });
            };

            if (checkIsFullyLoaded()) {
                signalReady();
                return;
            }

            // Handler for load/idle events
            const handleLoadEvent = () => {
                if (!isActive) return;
                if (checkIsFullyLoaded()) {
                    signalReady();
                }
            };

            // Bind listeners
            // Note: 'idle' is the most reliable event for "rendering finished"
            const bind = glMap.once ?? glMap.on;
            if (bind) {
                bind("idle", handleLoadEvent);
                bind("load", handleLoadEvent);
                glMap.on?.("styleimagemissing", handleMissingImage);

                // Store cleanup function
                cleanupListenersRef.current = () => {
                    glMap.off?.("idle", handleLoadEvent);
                    glMap.off?.("load", handleLoadEvent);
                    glMap.off?.("styleimagemissing", handleMissingImage);
                };
            } else {
                signalReady();
            }
        };

        // Main initialization logic
        const initializeLayer = async () => {
            try {
                const style = await getMapStyle();

                // Prevent race conditions if component unmounted during fetch
                if (!isActive || layerRef.current) return;

                // Initialize the Leaflet-MapLibre adapter
                // @ts-expect-error - L.maplibreGL is injected by the import side-effect
                const glLayer = L.maplibreGL({ style }) as LeafletMapLibreLayer;

                glLayer.addTo(map);
                layerRef.current = glLayer;

                attachLoadListeners(glLayer);
            } catch (error) {
                if (APP_CONFIG.IS_DEV) {
                    console.error("[MapLibreBaseLayer] Failed to load map style:", error);
                }
                // Even on error, signal ready so the splash screen doesn't hang forever
                signalReady();
            }
        };

        // Wait for Leaflet map to be ready before adding the GL layer
        map.whenReady(initializeLayer);

        // Cleanup on unmount
        return () => {
            isActive = false;

            // Remove event listeners
            if (cleanupListenersRef.current) {
                cleanupListenersRef.current();
                cleanupListenersRef.current = null;
            }

            // Remove layer from map
            if (layerRef.current) {
                map.removeLayer(layerRef.current);
                layerRef.current = null;
            }
        };
    }, [map, onReady]);

    // This is a logic-only component, it renders nothing to the DOM itself
    return null;
}
