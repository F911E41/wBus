"use client";

import "leaflet-rotatedmarker";

import L from "leaflet";
import { Marker, type MarkerProps } from "react-leaflet";
import { forwardRef, useEffect, useRef } from "react";

// ----------------------------------------------------------------------
// Module Augmentation & Imports
// ----------------------------------------------------------------------

// Extend Leaflet's Marker definition to include methods added by 'leaflet-rotatedmarker'
declare module "leaflet" {
    interface Marker {
        setRotationAngle(angle: number): this;

        setRotationOrigin(origin: string): this;
    }

    interface MarkerOptions {
        rotationAngle?: number;
        rotationOrigin?: string;
    }
}

// ----------------------------------------------------------------------
// Component Types
// ----------------------------------------------------------------------

interface BusRotatedMarkerProps extends MarkerProps {
    rotationAngle?: number;
    rotationOrigin?: string;
}

// ----------------------------------------------------------------------
// Component
// ----------------------------------------------------------------------

const BusRotatedMarker = forwardRef<L.Marker, BusRotatedMarkerProps>(
    ({ rotationAngle = 0, rotationOrigin = "center", ...props }, forwardedRef) => {
        const internalRef = useRef<L.Marker | null>(null);

        // Sync rotation updates directly to the Leaflet instance
        // Note: 'position' updates are handled automatically by <Marker> re-rendering
        useEffect(() => {
            const marker = internalRef.current;
            if (!marker) return;

            // Safe to call directly due to Module Augmentation above
            if (typeof marker.setRotationAngle === "function") {
                marker.setRotationAngle(rotationAngle);
            }

            if (typeof marker.setRotationOrigin === "function") {
                marker.setRotationOrigin(rotationOrigin);
            }
        }, [rotationAngle, rotationOrigin]);

        // Handle Ref merging (Internal + Forwarded)
        const setRef = (instance: L.Marker | null) => {
            internalRef.current = instance;

            if (!forwardedRef) return;

            if (typeof forwardedRef === "function") {
                forwardedRef(instance);
            } else {
                forwardedRef.current = instance;
            }
        };

        return (
            <Marker
                ref={setRef}
                rotationAngle={rotationAngle}
                rotationOrigin={rotationOrigin}
                {...props}
            />
        );
    }
);

BusRotatedMarker.displayName = "BusRotatedMarker";

export default BusRotatedMarker;
