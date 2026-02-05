"use client";

import L from "leaflet";

import { memo, useEffect, useMemo, useRef } from "react";
import { Popup } from "react-leaflet";

import { MAP_SETTINGS } from "@core/config/env";
import { UI_TEXT } from "@core/config/locale";

import { useIcons } from "@bus/hooks/useBusIcons";
import { useBusData } from "@bus/hooks/useBusData";

import { getSnappedPosition } from "@bus/utils/getSnappedPos";
import { getDirectionIcon } from "@bus/utils/directionIcons";

import BusAnimatedMarker from "@bus/components/BusAnimatedMarker";

import PopupMarquee from "@shared/ui/MarqueeText";

import type { BusItem } from "@core/domain/bus";

// ----------------------------------------------------------------------
// Constants & Styles
// ----------------------------------------------------------------------

const SETTINGS = MAP_SETTINGS.MARKERS.BUS;
const SNAP_INDEX_RANGE = 80;

const CSS_STYLES = `
@keyframes busRouteMarquee {
  0% { transform: translateX(0); }
  100% { transform: translateX(-50%); }
}
.bus-marker-with-label .bus-route-text-animate {
  display: inline-block;
  width: max-content; 
  min-width: 100%;
  animation: busRouteMarquee 3s linear infinite;
  padding-right: 4px;
}
.bus-marker-with-label .bus-route-text-container:hover .bus-route-text-animate {
  animation-play-state: paused;
}
`;

// ----------------------------------------------------------------------
// Hook: Styles Injection
// ----------------------------------------------------------------------

function useBusMarkerStyles() {
    useEffect(() => {
        if (typeof window === "undefined") return;
        if (document.getElementById(SETTINGS.LABEL_STYLE_ID)) return;

        const style = document.createElement("style");
        style.id = SETTINGS.LABEL_STYLE_ID;
        style.textContent = CSS_STYLES;

        document.head.appendChild(style);
    }, []);
}

// ----------------------------------------------------------------------
// Hook: Icon Generation
// ----------------------------------------------------------------------

function useBusMarkerIcon(refreshKey?: string | number) {
    const { busIcon } = useIcons();
    const iconCache = useRef(new Map<string, L.DivIcon>());

    // Clear cache on refreshKey change
    useEffect(() => {
        iconCache.current.clear();
    }, [refreshKey]);

    return useMemo(() => {
        return (routeNumber: string) => {
            if (!busIcon || typeof window === "undefined") return null;

            if (iconCache.current.has(routeNumber)) {
                return iconCache.current.get(routeNumber)!;
            }

            const escapedNum = String(routeNumber)
                .replace(/&/g, "&amp;").replace(/</g, "&lt;")
                .replace(/>/g, "&gt;").replace(/"/g, "&quot;")
                .replace(/'/g, "&#39;");

            const needsMarquee = routeNumber.length > SETTINGS.MARQUEE_THRESHOLD - 1;
            const displayText = needsMarquee
                ? `${escapedNum}&nbsp;${escapedNum}&nbsp;`
                : escapedNum;

            const [w, h] = SETTINGS.ICON_SIZE;

            const icon = L.divIcon({
                className: "bus-marker-with-label",
                iconSize: SETTINGS.ICON_SIZE,
                iconAnchor: SETTINGS.ICON_ANCHOR,
                popupAnchor: SETTINGS.POPUP_ANCHOR,
                html: `
          <div style="position: relative; width: ${w}px; height: ${h}px; filter: drop-shadow(0 2px 8px rgba(37, 99, 235, 0.4));">
            <img src="/icons/bus-icon.png" style="width: ${w}px; height: ${h}px; transition: transform 0.3s ease;" />
            <div class="bus-route-text-container" style="
              position: absolute; top: 7px; left: 50%; transform: translateX(-50%);
              background: linear-gradient(135deg, #2563eb 0%, #4f46e5 100%);
              color: white; font-size: 10px; font-weight: bold;
              padding: 2px 5px; border-radius: 6px; border: 1.5px solid white;
              box-shadow: 0 2px 6px rgba(0,0,0,0.3); letter-spacing: 0.3px;
              max-width: 24px; overflow: hidden; white-space: nowrap;
            ">
              <span class="${needsMarquee ? "bus-route-text-animate" : ""}">${displayText}</span>
            </div>
          </div>
        `,
            });

            iconCache.current.set(routeNumber, icon);
            return icon;
        };
    }, [busIcon]);
}

// ----------------------------------------------------------------------
// Sub-Component: Popup Content
// ----------------------------------------------------------------------

const BusPopupContent = memo(({ bus, stopName, DirectionIcon }: {
    bus: BusItem;
    stopName: string;
    DirectionIcon: React.ElementType
}) => (
    <div className="min-w-fit sm:min-w-[200px] flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-br from-blue-600 to-indigo-600 text-white px-4 py-3">
            <div className="flex items-center gap-2">
                <DirectionIcon className="w-4 h-4 sm:w-5 sm:h-5 text-white/90" aria-hidden="true" />
                <span className="font-bold text-sm sm:text-base tracking-tight leading-none">
                    {UI_TEXT.BUS_LIST.TITLE_ROUTE(bus.routenm)}
                </span>
            </div>
        </div>

        {/* Body */}
        <div className="bg-white px-4 py-3 space-y-3 text-xs sm:text-sm">
            <div className="grid grid-cols-[auto_1fr] text-center items-center gap-2">
                <span className="text-[10px] sm:text-xs font-semibold text-gray-500 shrink-0 whitespace-nowrap">
                    {UI_TEXT.BUS_ITEM.VEHICLE_NUM}
                </span>
                <div>
                    <div
                        className="inline-flex font-bold text-gray-800 bg-gray-100 px-2 py-0.5 rounded border border-gray-200 whitespace-nowrap">
                        {bus.vehicleno}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-[auto_1fr] text-center items-center gap-2">
                <span className="text-[10px] sm:text-xs font-semibold text-gray-500 shrink-0 whitespace-nowrap">
                    {UI_TEXT.BUS_ITEM.CURRENT_LOC}
                </span>
                <div className="min-w-0">
                    <div className="text-gray-700 font-medium text-center">
                        <PopupMarquee text={stopName} maxLength={8} />
                    </div>
                </div>
            </div>
        </div>
    </div>
));

BusPopupContent.displayName = "BusPopupContent";

// ----------------------------------------------------------------------
// Main Component
// ----------------------------------------------------------------------

interface BusMarkerProps {
    routeName: string;
    onPopupOpen?: (routeName: string) => void;
    onPopupClose?: () => void;
}

export default function BusMarker({ routeName, onPopupOpen, onPopupClose }: BusMarkerProps) {
    // Initializations
    useBusMarkerStyles();

    // Data Fetching
    const {
        routeInfo,
        busList,
        getDirection,
        polylineMap,
        fallbackPolylines,
        activeRouteId
    } = useBusData(routeName);

    // The key to reset markers on route change
    const refreshKey = `${routeName}-${activeRouteId ?? "none"}`;

    // Icon Creation
    const createIcon = useBusMarkerIcon(refreshKey);

    // Data Processing (Snap & Prepare)
    const markers = useMemo(() => {
        if (!routeInfo || busList.length === 0) return [];

        return busList.map((bus) => {
            // Determine which polyline to snap to
            const targetRouteId = bus.routeid ?? activeRouteId ?? routeInfo.vehicleRouteIds[0] ?? null;
            const polylineSet = targetRouteId ? polylineMap.get(targetRouteId) : null;
            const { upPolyline, downPolyline, stopIndexMap, turnIndex, isSwapped } = polylineSet ?? fallbackPolylines;

            // Calculate Snap
            const snapped = getSnappedPosition(bus, getDirection, upPolyline, downPolyline, {
                stopIndexMap,
                turnIndex,
                isSwapped,
                snapIndexRange: SNAP_INDEX_RANGE,
            });
            const activePolyline = snapped.direction === 1 ? upPolyline : downPolyline;

            return {
                // Include routeName in the key to force unmount/mount on route change
                key: `${routeName}-${bus.vehicleno}`,
                bus,
                position: snapped.position,
                angle: snapped.angle,
                direction: snapped.direction,
                polyline: activePolyline,
                snapIndexHint: snapped.segmentIndex ?? null,
            };
        });
    }, [
        routeInfo,
        busList,
        getDirection,
        polylineMap,
        fallbackPolylines,
        activeRouteId,
        routeName
    ]);

    if (!routeInfo || markers.length === 0) return null;

    return (
        <>
            {markers.map(({ key, bus, position, angle, direction, polyline, snapIndexHint }) => {
                const icon = createIcon(bus.routenm);
                if (!icon) return null;

                return (
                    <BusAnimatedMarker
                        key={key}
                        position={position}
                        // If angle is missing or NaN, use 0 to prevent errors and set initial angle
                        rotationAngle={(angle || 0) % 360}
                        icon={icon}
                        polyline={polyline}
                        snapIndexHint={snapIndexHint}
                        snapIndexRange={SNAP_INDEX_RANGE}
                        animationDuration={MAP_SETTINGS.ANIMATION.BUS_MOVE_MS}
                        refreshKey={refreshKey}
                        eventHandlers={{
                            popupopen: () => onPopupOpen?.(routeName),
                            popupclose: () => onPopupClose?.(),
                        }}
                    >
                        <Popup autoPan={false} className="custom-bus-popup">
                            <BusPopupContent
                                bus={bus}
                                stopName={bus.nodenm || ""}
                                DirectionIcon={getDirectionIcon(direction)}
                            />
                        </Popup>
                    </BusAnimatedMarker>
                );
            })}
        </>
    );
}
