"use client";

import { createContext, ReactNode, useContext, useMemo, useState } from "react";

import type { Map } from "leaflet";

// ----------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------

interface MapContextType {
    /** The raw Leaflet Map instance. Null if not yet initialized. */
    map: Map | null;
    /** Setter for the Leaflet Map instance. */
    setMap: (map: Map | null) => void;

    /** The currently selected route ID (for highlighting/filtering). */
    selectedRoute: string | null;
    /** Setter for the selected route. */
    setSelectedRoute: (route: string | null) => void;
}

interface MapContextProviderProps {
    children: ReactNode;
}

// ----------------------------------------------------------------------
// Context Creation
// ----------------------------------------------------------------------

const MapContext = createContext<MapContextType | undefined>(undefined);

// ----------------------------------------------------------------------
// Hook
// ----------------------------------------------------------------------

/**
 * Custom hook to access the global Map state.
 * * Usage:
 * - Access the `map` instance to perform imperative actions (panTo, fitBounds).
 * - Access `selectedRoute` to know which bus route is active.
 * * @throws Error if used outside of <MapContextProvider>
 */
export function useBusContext(): MapContextType {
    const context = useContext(MapContext);
    if (!context) {
        throw new Error(
            "[useBusContext] Context is missing. Ensure this component is wrapped within a <MapContextProvider>."
        );
    }
    return context;
}

// ----------------------------------------------------------------------
// Provider Component
// ----------------------------------------------------------------------

/**
 * Provider component that maintains the Leaflet map instance globally.
 * * Architecture Note:
 * Leaflet is imperative, while React is declarative. This provider holds the
 * imperative `map` object in state so that sibling components (Sidebar, Overlays)
 * can control the map without direct parent-child prop drilling.
 */
export function MapContextProvider({ children }: MapContextProviderProps) {
    const [map, setMap] = useState<Map | null>(null);
    const [selectedRoute, setSelectedRoute] = useState<string | null>(null);

    // Memoize values to prevent unnecessary re-renders in consumers
    const value = useMemo(() => ({
        map,
        setMap,
        selectedRoute,
        setSelectedRoute
    }), [map, selectedRoute]);

    return <MapContext.Provider value={value}>{children}</MapContext.Provider>;
}
