"use client";

import BusStopPopup from "@bus/components/BusStopPopup";

import { memo, useCallback, useMemo, useState } from "react";
import { Marker, Popup, useMap, useMapEvents } from "react-leaflet";
import { BusFront, Info, MapPinned } from "lucide-react";

import { MAP_SETTINGS } from "@core/config/env";
import { UI_TEXT } from "@core/config/locale";

import { useIcons } from "@bus/hooks/useBusIcons";
import { useBusStop } from "@bus/hooks/useBusStop";
import { filterStopsByViewport } from "@bus/utils/stopFiltering";

import type { BusStop } from "@core/domain/station";
import type { Icon } from "leaflet";

type BusStopMarkerItemProps = {
    stop: BusStop;
    icon: Icon;
    onRouteChange?: (routeName: string) => void;
};

const BusStopMarkerItem = memo(({ stop, icon, onRouteChange }: BusStopMarkerItemProps) => {
    const [isPopupOpen, setIsPopupOpen] = useState(false);

    const handlePopupOpen = useCallback(() => setIsPopupOpen(true), []);
    const handlePopupClose = useCallback(() => setIsPopupOpen(false), []);

    return (
        <Marker
            position={[stop.gpslati, stop.gpslong]}
            icon={icon}
            eventHandlers={{
                popupopen: handlePopupOpen,
                popupclose: handlePopupClose,
            }}
        >
            <Popup
                className="custom-bus-stop-popup"
                minWidth={280}
                maxWidth={320}
                autoPanPadding={[50, 50]}
            >
                <div className="flex flex-col bg-white overflow-hidden rounded-2xl shadow-2xl border border-slate-100">
                    {/* Header Section */}
                    <div className="relative overflow-hidden bg-slate-900 px-4 py-4 text-white">
                        {/* Background decorative pattern */}
                        <div className="absolute -right-2 -top-2 opacity-10">
                            <BusFront size={80} strokeWidth={1} />
                        </div>

                        <div className="relative z-10 flex flex-col gap-2">
                            <div className="flex items-start gap-2.5">
                                <div
                                    className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/30">
                                    <MapPinned size={18} />
                                </div>
                                <div className="flex flex-col gap-0.5 overflow-hidden">
                                    <h3 className="truncate text-base font-black leading-tight tracking-tight sm:text-lg">
                                        {stop.nodenm}
                                    </h3>
                                    <div className="flex items-center gap-1.5 text-slate-400">
                                        <span className="text-[10px] font-bold uppercase tracking-widest text-blue-400">Station ID</span>
                                        <span className="text-xs font-mono font-medium">{stop.nodeno || "N/A"}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Body Section: Arrival Information List */}
                    <div className="relative min-h-[120px] bg-slate-50/50">
                        {isPopupOpen ? (
                            <BusStopPopup
                                stopId={stop.nodeid}
                                onRouteChange={onRouteChange}
                            />
                        ) : (
                            <div className="flex h-32 items-center justify-center">
                                <div className="flex flex-col items-center gap-2">
                                    <div
                                        className="h-5 w-5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                                    <span
                                        className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">{UI_TEXT.COMMON.LOADING_LIVE}</span>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Footer Section */}
                    <div className="flex items-center justify-center border-t border-slate-100 bg-white py-2 px-4">
                        <div className="flex items-center gap-1 text-[10px] font-medium text-slate-400">
                            <Info size={12} className="text-slate-300" />
                            <span>{UI_TEXT.BUS_ITEM.CLICK_ROUTE_FOR_INFO}</span>
                        </div>
                    </div>
                </div>
            </Popup>
        </Marker>
    );
});

BusStopMarkerItem.displayName = "BusStopMarkerItem";

export default function BusStopMarker({
    routeName,
    onRouteChange
}: {
    routeName: string;
    onRouteChange?: (routeName: string) => void;
}) {
    const stops = useBusStop(routeName);
    const { busStopIcon } = useIcons();

    const map = useMap();
    const [zoom, setZoom] = useState(map.getZoom());
    const [bounds, setBounds] = useState(map.getBounds());

    useMapEvents({
        zoomend: () => {
            setZoom(map.getZoom());
            setBounds(map.getBounds());
        },
        moveend: () => {
            setBounds(map.getBounds());
        },
    });

    const visibleStops = useMemo(() => {
        if (zoom < MAP_SETTINGS.ZOOM.BUS_STOP_VISIBLE) return [];
        return filterStopsByViewport(stops, bounds, zoom);
    }, [stops, bounds, zoom]);

    if (!busStopIcon) return null;

    return (
        <>
            {visibleStops.map((stop, index) => {
                const key = stop.nodeid
                    ? `${stop.nodeid}-${stop.updowncd ?? "na"}`
                    : `stop-${index}`;
                return (
                    <BusStopMarkerItem
                        key={key}
                        stop={stop}
                        icon={busStopIcon}
                        onRouteChange={onRouteChange}
                    />
                );
            })}
        </>
    );
}
