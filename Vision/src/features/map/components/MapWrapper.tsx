"use client";

import React from "react";
import dynamic from "next/dynamic";

// ----------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------

type MapWrapperProps = {
    /** List of route IDs to render on the map */
    routeNames: string[];
    /** Callback fired when the map is fully initialized */
    onReady?: () => void;
    /** Callback fired when a user interacts with a route */
    onRouteChange?: (routeName: string) => void;
};

// ----------------------------------------------------------------------
// Dynamic Import
// ----------------------------------------------------------------------

/**
 * Dynamically import the Map component with Server-Side Rendering (SSR) disabled.
 * * Why?
 * Leaflet and MapLibre rely heavily on the global `window` and `document` objects,
 * which are not available during Next.js server rendering. Attempting to render them
 * on the server would cause "window is not defined" errors.
 */
const DynamicMap = dynamic(() => import("./Map"), {
    ssr: false,
    // Optional: You could add a lightweight placeholder here to prevent layout shift
    // loading: () => <div className="w-full h-full bg-slate-100" />
});

// ----------------------------------------------------------------------
// Component
// ----------------------------------------------------------------------

/**
 * Wrapper component to ensure the Map is only rendered on the Client Side.
 */
const MapWrapper: React.FC<MapWrapperProps> = (props) => {
    return (
        <DynamicMap
            {...props}
        />
    );
};

export default MapWrapper;
