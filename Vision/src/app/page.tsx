"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { APP_CONFIG, MAP_SETTINGS, STORAGE_KEYS } from "@core/config/env";

import { busPollingService } from "@bus/services/BusPollingService";
import { useBusRouteMap } from "@bus/hooks/useBusRouteMap";

import MapWrapper from "@map/components/MapWrapper";

import BusList from "@bus/components/BusList";

import Splash from "@shared/ui/Splash";
import NavBar from "@shared/ui/NavBar";

/**
 * Real-time bus map page for the wBus application.
 * Displays real-time bus location information on a map for all routes.
 */
export default function HomePage() {
    const [isSplashVisible, setIsSplashVisible] = useState(true);
    const [selectedRoute, setSelectedRoute] = useState<string>(() => {
        if (typeof window === "undefined") return MAP_SETTINGS.DEFAULT_ROUTE;
        try {
            return localStorage.getItem(STORAGE_KEYS.ROUTE_ID) ?? MAP_SETTINGS.DEFAULT_ROUTE;
        } catch (e) {
            if (APP_CONFIG.IS_DEV) {
                console.warn("[handleRouteChange] Failed to load route preference from localStorage", e);
            }
            return MAP_SETTINGS.DEFAULT_ROUTE;
        }
    });

    const routeMap = useBusRouteMap();
    const allRoutes = useMemo(() => routeMap ? Object.keys(routeMap) : [], [routeMap]);
    const activeRoute = useMemo(() => {
        if (!routeMap) return selectedRoute;
        if (routeMap[selectedRoute]) return selectedRoute;

        return routeMap[MAP_SETTINGS.DEFAULT_ROUTE]
            ? MAP_SETTINGS.DEFAULT_ROUTE
            : Object.keys(routeMap)[0] ?? selectedRoute;
    }, [routeMap, selectedRoute]);

    // Persist route selection to localStorage
    const handleRouteChange = useCallback((route: string) => {
        setSelectedRoute(route);
        if (typeof window !== "undefined") {
            try {
                localStorage.setItem(STORAGE_KEYS.ROUTE_ID, route);
            } catch (e) {
                // localStorage might not be available
                if (APP_CONFIG.IS_DEV) {
                    console.warn("[handleRouteChange] Failed to save route preference to localStorage", e);
                }
            }
        }
    }, []);

    useEffect(() => {
        if (!routeMap) return;
        if (!activeRoute || activeRoute === selectedRoute) return;
        if (typeof window === "undefined") return;
        try {
            localStorage.setItem(STORAGE_KEYS.ROUTE_ID, activeRoute);
        } catch (e) {
            if (APP_CONFIG.IS_DEV) {
                console.warn("[handleRouteChange] Failed to save route preference to localStorage", e);
            }
        }
    }, [routeMap, activeRoute, selectedRoute]);

    const handleMapReady = useCallback(() => {
        setIsSplashVisible(false);
    }, []);

    // Effect to start bus polling for selected route only
    useEffect(() => {
        if (!activeRoute) return;

        const cleanup = busPollingService.startPolling(activeRoute);

        return () => {
            cleanup();
        };
    }, [activeRoute]);

    return (
        <>
            <Splash isVisible={isSplashVisible} />
            <div
                className="flex flex-col w-full min-h-svh h-dvh pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
                <NavBar />
                <div className="relative flex-1 overflow-hidden">
                    <MapWrapper
                        routeNames={[activeRoute]}
                        onReady={handleMapReady}
                        onRouteChange={handleRouteChange}
                    />
                    <div
                        className="fixed bottom-[calc(env(safe-area-inset-bottom)+0.5rem)] left-[calc(env(safe-area-inset-left)+0.5rem)] z-30 flex flex-col gap-3 sm:bottom-[calc(env(safe-area-inset-bottom)+1rem)] sm:left-[calc(env(safe-area-inset-left)+1rem)]">
                        <BusList
                            routeNames={[activeRoute]}
                            allRoutes={allRoutes}
                            selectedRoute={activeRoute}
                            onRouteChange={handleRouteChange}
                        />
                    </div>
                </div>
            </div>
        </>
    );
}
