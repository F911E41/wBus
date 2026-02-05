"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";

import { MAP_SETTINGS } from "@core/config/env";
import { UI_TEXT } from "@core/config/locale";

import { useBusContext } from "@map/context/MapContext";

import { BusListItem } from "@bus/components/BusListItem";
import { useBusSortedList } from "@bus/hooks/useBusSortedList";
import { getBusErrorMessage } from "@bus/utils/errorMessages";

import { useScheduleData } from "@schedule/hooks/useScheduleData";
import { formatTime, getNearestBusTime } from "@schedule/utils/time";

import ScheduleView from "@schedule/components/ScheduleView";

import Pill from "@shared/ui/Pill";

import type { BusSchedule } from "@core/domain/schedule";

//-------------------------------------------------------------------
// Types & Interfaces
//-------------------------------------------------------------------

interface BusListProps {
    routeNames: string[];
    allRoutes: string[];
    selectedRoute: string;
    onRouteChange: (route: string) => void;
}

type RouteData = ReturnType<typeof useBusSortedList>;

interface NearestBus {
    time: string;
    minutesUntil: number;
    destination: string;
}

type ExpandedPanel = "bus" | "schedule" | null;

//-------------------------------------------------------------------
// Constants & Utility Styles
//-------------------------------------------------------------------

const getUrgencyClass = (minutesUntil: number): string => {
    if (minutesUntil <= 3) return "bg-red-400";
    if (minutesUntil <= 7) return "bg-amber-400";
    if (minutesUntil <= 15) return "bg-emerald-400";
    return "bg-sky-300";
};

const STYLES = {
    CONTAINER: "bg-white/98 backdrop-blur-md rounded-2xl shadow-2xl w-60 sm:w-64 border border-gray-200/50 overflow-hidden transition-all duration-300",
    HEADER: "px-4 pt-4 pb-3 bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-700",
    SELECT_WRAPPER: "relative flex items-center group transition-all duration-200 hover:bg-white/10 rounded-lg -ml-1.5 px-1.5",
    SELECT_ELEMENT: "appearance-none bg-transparent text-base sm:text-lg font-bold text-white pr-7 py-0.5 cursor-pointer focus:outline-none z-10 w-full tracking-tight",
    SELECT_ICON: "absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none text-blue-200 group-hover:text-white transition-colors",
    INFO_TEXT: "text-[11px] sm:text-xs font-semibold",
    LIST_CONTAINER: "text-xs sm:text-sm text-gray-800 max-h-[220px] overflow-y-auto px-2 py-2 space-y-1",
    SCHEDULE_CONTAINER: "max-h-[50svh] overflow-y-auto px-4 py-3 text-slate-800",
};

//-------------------------------------------------------------------
// Sub-Components
//-------------------------------------------------------------------

const RouteDataCollector = React.memo(({
    routeName,
    onDataUpdate
}: {
    routeName: string;
    onDataUpdate: (name: string, data: RouteData) => void
}) => {
    const data = useBusSortedList(routeName);

    useEffect(() => {
        onDataUpdate(routeName, data);
    }, [routeName, data, onDataUpdate]);

    return null;
});
RouteDataCollector.displayName = 'RouteDataCollector';

interface SchedulePreviewProps {
    data: BusSchedule | null;
    loading: boolean;
    isOpen: boolean;
    onToggle: () => void;
}

const SchedulePreview = ({ data, loading, isOpen, onToggle }: SchedulePreviewProps) => {
    const [nearestBus, setNearestBus] = useState<NearestBus | null>(null);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (!mounted || !data) {
            setNearestBus(null);
            return;
        }
        const updateTime = () => setNearestBus(getNearestBusTime(data));
        updateTime();

        const interval = setInterval(updateTime, 10000);

        return () => clearInterval(interval);
    }, [data, mounted]);

    const statusMessage = loading || !mounted ? UI_TEXT.COMMON.LOADING : UI_TEXT.SCHEDULE.NO_SERVICE;
    const dotClass = nearestBus ? getUrgencyClass(nearestBus.minutesUntil) : "bg-white/40";

    const displayTime = useMemo(() => {
        if (!nearestBus) return "";
        const [hour, minute] = nearestBus.time.split(":");
        return hour && minute ? formatTime(hour, minute) : nearestBus.time;
    }, [nearestBus]);

    return (
        <div className="flex flex-nowrap items-center justify-between gap-2 min-h-[32px] overflow-hidden">
            <div className="flex items-center gap-1.5 shrink-0">
                <div className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
                <span className={`${STYLES.INFO_TEXT} text-blue-100 whitespace-nowrap`}>
                    {UI_TEXT.SCHEDULE.NEXT_BUS}
                </span>
            </div>

            {nearestBus ? (
                <div className="flex items-center gap-1.5 overflow-hidden">
                    <div className="shrink-0">
                        <Pill tone="light" size="sm">
                            {UI_TEXT.TIME.FORMAT_REMAINING(nearestBus.minutesUntil)}
                        </Pill>
                    </div>

                    <button
                        onClick={onToggle}
                        className="transition-transform active:scale-95 focus:outline-none shrink min-w-0"
                        aria-label="Toggle Schedule"
                    >
                        <Pill tone={isOpen ? "glass" : "light"} size="sm">
                            <div className="flex items-center truncate">
                                <span className="font-bold truncate">{nearestBus.destination}</span>
                                <span className="ml-1 opacity-90 whitespace-nowrap">{displayTime}</span>
                                {/* Visual cue for dropdown */}
                                <svg
                                    className={`w-3 h-3 ml-1.5 opacity-70 transition-transform duration-200 shrink-0 ${isOpen ? "rotate-180" : ""}`}
                                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}
                                >
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                                </svg>
                            </div>
                        </Pill>
                    </button>
                </div>
            ) : (
                <span className={`${STYLES.INFO_TEXT} text-blue-100/80 truncate`}>{statusMessage}</span>
            )}
        </div>
    );
};

//-------------------------------------------------------------------
// Main Component
//-------------------------------------------------------------------

export default function BusList({ routeNames, allRoutes, selectedRoute, onRouteChange }: BusListProps) {
    const { map } = useBusContext();
    const [routesData, setRoutesData] = useState<Record<string, RouteData>>({});
    const [expandedPanel, setExpandedPanel] = useState<ExpandedPanel>(null);

    const { data: scheduleData, loading: scheduleLoading, missing: scheduleMissing } = useScheduleData(selectedRoute);

    const isBusExpanded = expandedPanel === "bus";
    const isScheduleExpanded = expandedPanel === "schedule";
    const schedulePayload = scheduleData?.schedule;
    const hasScheduleData = Boolean(
        schedulePayload && (schedulePayload.general || schedulePayload.weekday || schedulePayload.weekend)
    );
    const showSchedule = !scheduleMissing && (scheduleLoading || hasScheduleData);

    useEffect(() => {
        if (expandedPanel === "schedule" && !hasScheduleData) {
            setExpandedPanel(null);
        }
    }, [expandedPanel, hasScheduleData]);

    // Handlers
    const handleRouteChange = useCallback((route: string) => {
        setRoutesData({});
        onRouteChange(route);
    }, [onRouteChange]);

    const togglePanel = useCallback((panel: "bus" | "schedule") => {
        setExpandedPanel((prev) => (prev === panel ? null : panel));
    }, []);

    const handleDataUpdate = useCallback((name: string, data: RouteData) => {
        setRoutesData((prev) => {
            if (prev[name]?.sortedList === data.sortedList && prev[name]?.error === data.error) return prev;
            return { ...prev, [name]: data };
        });
    }, []);

    const handleBusClick = useCallback((lat: number, lng: number) => {
        map?.flyTo([lat, lng], map.getZoom(), {
            animate: true,
            duration: MAP_SETTINGS.ANIMATION.FLY_TO_MS / 1000,
        });
    }, [map]);

    const setMapScroll = useCallback((enabled: boolean) => {
        if (!map?.scrollWheelZoom) return;
        if (enabled) {
            map.scrollWheelZoom.enable();
        } else {
            map.scrollWheelZoom.disable();
        }
    }, [map]);

    // UI State Logic
    const allBuses = useMemo(() => {
        return routeNames
            .map(name => routesData[name] ? { routeName: name, ...routesData[name] } : null)
            .filter((item): item is { routeName: string } & RouteData => item !== null)
            .flatMap(({ routeName, sortedList, getDirection }) =>
                sortedList.map(bus => ({ bus, routeName, getDirection }))
            );
    }, [routeNames, routesData]);

    const uiState = useMemo(() => {
        const activeData = routeNames.map(n => routesData[n]).filter(Boolean);
        const anyError = activeData.find(d => d.error !== null)?.error || null;
        const isLoading = activeData.length === 0 || activeData.some(d => !d.hasFetched);

        return {
            statusText: anyError ? getBusErrorMessage(anyError) : (isLoading ? UI_TEXT.COMMON.LOADING : UI_TEXT.BUS_LIST.COUNT_RUNNING(allBuses.length)),
            dotClass: anyError ? "bg-red-400" : (isLoading ? "bg-blue-300" : "bg-green-400"),
            isNoData: allBuses.length === 0
        };
    }, [routeNames, routesData, allBuses.length]);

    return (
        <>
            {routeNames.map((name) => (
                <RouteDataCollector key={name} routeName={name} onDataUpdate={handleDataUpdate} />
            ))}

            <div
                className={STYLES.CONTAINER}
                onWheel={(e) => e.stopPropagation()}
                onMouseEnter={() => setMapScroll(false)}
                onMouseLeave={() => setMapScroll(true)}
            >
                <div className={STYLES.HEADER}>
                    {/* Combined Title & Selector */}
                    <div className="mb-2.5">
                        <div className={STYLES.SELECT_WRAPPER}>
                            <select
                                value={selectedRoute}
                                onChange={(e) => handleRouteChange(e.target.value)}
                                className={STYLES.SELECT_ELEMENT}
                            >
                                {allRoutes.filter(Boolean).map((route) => (
                                    <option key={route} value={route} className="text-gray-900 font-sans">
                                        {UI_TEXT.BUS_LIST.TITLE_ROUTE(route)}
                                    </option>
                                ))}
                            </select>
                            <div className={STYLES.SELECT_ICON}>
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
                                    fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"
                                    strokeLinejoin="round">
                                    <path d="m6 9 6 6 6-6" />
                                </svg>
                            </div>
                        </div>
                    </div>

                    {/* Schedule Preview - Now handles the toggle interaction */}
                    {showSchedule && (
                        <SchedulePreview
                            data={scheduleData}
                            loading={scheduleLoading}
                            isOpen={isScheduleExpanded}
                            onToggle={() => togglePanel("schedule")}
                        />
                    )}

                    {/* Action Row - Rearranged for single line layout */}
                    <div className="flex items-center justify-between mt-1">
                        {/* Left: Status Dot & Text */}
                        <div className="flex items-center gap-2">
                            <div className={`h-1.5 w-1.5 rounded-full animate-pulse ${uiState.dotClass}`} />
                            <p className={`${STYLES.INFO_TEXT} text-blue-100`}>{uiState.statusText}</p>
                        </div>

                        {/* Right: List Toggle Button */}
                        <button onClick={() => togglePanel("bus")}>
                            <Pill tone={isBusExpanded ? "glass" : "light"} size="sm">
                                {isBusExpanded ? UI_TEXT.NAV.HIDE_LIST : UI_TEXT.NAV.SHOW_LIST}
                            </Pill>
                        </button>
                    </div>
                </div>

                {/* Expandable Content */}
                {isScheduleExpanded && showSchedule && hasScheduleData && scheduleData && (
                    <div className={STYLES.SCHEDULE_CONTAINER}>
                        <ScheduleView data={scheduleData} mode="full" />
                    </div>
                )}

                {isBusExpanded && (
                    <ul className={STYLES.LIST_CONTAINER}>
                        {uiState.isNoData ? (
                            <li className="text-center py-4 text-gray-500 text-xs italic">
                                {UI_TEXT.BUS_LIST.NO_RUNNING_DESC}
                            </li>
                        ) : (
                            allBuses.map(({ bus, routeName, getDirection }) => (
                                <BusListItem
                                    key={`${routeName}-${bus.vehicleno}`}
                                    bus={bus}
                                    routeName={routeName}
                                    getDirection={getDirection}
                                    onClick={handleBusClick}
                                />
                            ))
                        )}
                    </ul>
                )}
            </div>
        </>
    );
}
