import React from "react";
import { ArrowDown, ArrowUp, HelpCircle } from "lucide-react";

import PopupMarquee from "@shared/ui/MarqueeText";

import { UI_TEXT } from "@core/config/locale";

import type { BusItem } from "@core/domain/bus";
import type { DirectionCode } from "@bus/hooks/useBusDirection";

type BusListItemProps = {
    bus: BusItem;
    routeName: string;
    getDirection: (nodeId: string | null | undefined, nodeOrd: number, routeId?: string | null) => DirectionCode;
    onClick: (lat: number, lng: number) => void;
};

export const BusListItem = React.memo(({ bus, routeName, getDirection, onClick }: BusListItemProps) => {
    const direction = bus.nodeid && bus.nodeord !== undefined
        ? getDirection(bus.nodeid, bus.nodeord, bus.routeid)
        : null;

    const stopName = bus.nodenm || "";
    const iconProps = {
        className: "w-3 h-3 sm:w-3.5 sm:h-3.5 flex-shrink-0 text-gray-400",
        "aria-hidden": true as const,
    };
    const directionIcon = direction === 1
        ? <ArrowUp {...iconProps} />
        : direction === 0
            ? <ArrowDown {...iconProps} />
            : <HelpCircle {...iconProps} />;

    return (
        <li>
            <button
                type="button"
                className="flex w-full justify-between items-center py-2 px-2 sm:py-3 sm:px-3 cursor-pointer bg-linear-to-r from-gray-50 to-blue-50/50 hover:from-blue-100 hover:to-indigo-100 transition-all duration-300 rounded-lg sm:rounded-xl group border border-transparent hover:border-blue-300 hover:shadow-md hover:scale-[1.02] active:scale-[0.98] text-left"
                onClick={() => onClick(bus.gpslati, bus.gpslong)}
                aria-label={`${bus.vehicleno} ${UI_TEXT.BUS_ITEM.CURRENT_LOC} ${stopName}`}
            >
                {/* Left: Vehicle number and route information 
                    1. shrink-0: Never shrink even if flex container is too small
                    2. min-w-fit: Ensure the content fits without breaking
                */}
                <div className="flex flex-col gap-0.5 sm:gap-1 shrink-0 min-w-fit mr-2">
                    <span
                        className="font-bold text-sm sm:text-base text-gray-900 group-hover:text-blue-700 transition-colors whitespace-nowrap">
                        {bus.vehicleno}
                    </span>
                    <span
                        className="text-[10px] sm:text-[11px] font-bold text-white bg-linear-to-r from-blue-600 to-indigo-600 rounded-full px-2 py-0.5 sm:px-2.5 sm:py-1 inline-block w-fit shadow-sm">
                        {routeName}
                    </span>
                </div>

                {/* Right: Stop name and direction icon 
                    1. min-w-0: Prevent flex child elements from overflowing the parent (essential for Marquee to work)
                    2. justify-end: Align to the right
                */}
                <div
                    className="flex items-center gap-1 text-gray-600 group-hover:text-gray-900 text-right min-w-0 flex-1 justify-end">
                    {/* Marquee Container
                        List items are narrower than popups, so we set maxLength to around 6-8 for tight fit.
                        We set max-w to prevent overly long stop names from encroaching on the vehicle number. 
                    */}
                    <div className="text-[10px] sm:text-xs font-medium max-w-20 sm:max-w-20">
                        <PopupMarquee text={stopName} maxLength={8} />
                    </div>

                    {directionIcon}
                </div>
            </button>
        </li>
    );
});

BusListItem.displayName = 'BusListItem';
