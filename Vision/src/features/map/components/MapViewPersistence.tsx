"use client";

import { useEffect } from "react";
import { useMap } from "react-leaflet";

import { createMapViewFromMap, saveMapView } from "@map/utils/mapViewStorage";

// ----------------------------------------------------------------------
// Component
// ----------------------------------------------------------------------

/**
 * Headless component that syncs the map's viewport state (center & zoom)
 * to local storage whenever the user stops panning or zooming.
 * * This ensures that when the user returns to the app, the map is restored
 * to their last viewed location.
 */
export default function MapViewPersistence() {
    const map = useMap();

    useEffect(() => {
        // Handler: Serialize and save current view
        const handleMoveEnd = () => {
            const viewState = createMapViewFromMap(map);
            saveMapView(viewState);
        };

        // Bind listener for 'moveend' (covers both drag and zoom completion)
        map.on("moveend", handleMoveEnd);

        // Cleanup listener on unmount
        return () => {
            map.off("moveend", handleMoveEnd);
        };
    }, [map]);

    // This component renders nothing
    return null;
}
