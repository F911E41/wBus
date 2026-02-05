"use client";

import { ReactNode, useEffect } from "react";
import { useMap } from "react-leaflet";

import { useBusContext } from "@map/context/MapContext";

// ----------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------

interface MapContextBridgeProps {
    children: ReactNode;
}

// ----------------------------------------------------------------------
// Component
// ----------------------------------------------------------------------

/**
 * A bridge component to expose the internal Leaflet Map instance to the global App Context.
 * * Why is this needed?
 * `useMap` can only be used *inside* `<MapContainer>`. By rendering this bridge inside,
 * we capture the map instance and set it into our `BusContext`, allowing components
 * *outside* the map (like sidebars or overlays) to control the map (pan, zoom, etc.).
 */
export default function MapContextBridge({ children }: MapContextBridgeProps) {
    const map = useMap();
    const { setMap } = useBusContext();

    useEffect(() => {
        // Register the map instance to the global context
        setMap(map);

        // Cleanup: Clear the map instance when this component unmounts
        return () => {
            setMap(null);
        };
    }, [map, setMap]);

    // Render children normally
    return <>{children}</>;
}
