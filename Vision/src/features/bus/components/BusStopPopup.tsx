import { useMemo } from "react";
import { AlertTriangle, Bus, ChevronRight, Clock, MapPin } from "lucide-react";

import { UI_TEXT } from "@core/config/locale";

import { useBusArrivalInfo } from "@bus/hooks/useBusArrivalInfo";

import { formatVehicleType, secondsToMinutes } from "@shared/utils/formatters";

import type { BusStopArrival } from "@core/domain/station";

// Sets the theme based on arrival time in minutes
const getStatusTheme = (minutes: number) => {
    if (minutes <= 2) return {
        text: "text-red-600",
        bg: "bg-red-50",
        border: "border-red-100",
        badge: "bg-red-600",
        label: UI_TEXT.BUS_ITEM.ARRIVING_SOON
    };
    if (minutes <= 5) return {
        text: "text-orange-600",
        bg: "bg-orange-50",
        border: "border-orange-100",
        badge: "bg-orange-500",
        label: UI_TEXT.BUS_ITEM.ARRIVING_SOON
    };
    return {
        text: "text-blue-600",
        bg: "bg-slate-50",
        border: "border-slate-100",
        badge: "bg-blue-600",
        label: UI_TEXT.BUS_ITEM.RUNNING_NOW
    };
};

function ArrivalItem({
    bus,
    onRouteChange
}: {
    bus: BusStopArrival;
    onRouteChange?: (name: string) => void
}) {
    const minutes = secondsToMinutes(bus.arrtime);
    const theme = getStatusTheme(minutes);
    const routeName = String(bus.routeno ?? "").trim();

    return (
        <button
            onClick={() => onRouteChange?.(routeName)}
            className={`w-full group relative flex items-center justify-between p-3 rounded-xl border-2 transition-all duration-200 
                ${theme.bg} ${theme.border} hover:border-blue-400 hover:shadow-md active:scale-[0.98] bg-white`}
        >
            <div className="flex flex-col items-start gap-1.5 overflow-hidden">
                <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-[11px] font-black text-white ${theme.badge} shadow-sm`}>
                        {routeName}
                    </span>
                    <span className="text-[10px] font-semibold text-slate-400 truncate">
                        {formatVehicleType(bus.vehicletp)}
                    </span>
                </div>

                <div className="flex items-center gap-1 text-slate-500">
                    <MapPin className="w-3 h-3 text-slate-400" />
                    <span className="text-xs font-medium">
                        {bus.arrprevstationcnt === 0 ? UI_TEXT.BUS_ITEM.ARRIVING_SOON : UI_TEXT.BUS_ITEM.STOPS_LEFT(bus.arrprevstationcnt)}
                    </span>
                </div>
            </div>

            <div className="flex flex-col items-end shrink-0">
                <div className={`flex items-center gap-1 font-black ${theme.text}`}>
                    <Clock className="w-3.5 h-3.5" />
                    <span className="text-base sm:text-lg">
                        {minutes === 0 ? UI_TEXT.BUS_ITEM.ARRIVING_SOON : `${minutes}${UI_TEXT.TIME.MINUTE_SUFFIX}`}
                    </span>
                </div>
                <div
                    className="flex items-center text-[10px] text-slate-400 font-bold group-hover:text-blue-500 transition-colors">
                    {UI_TEXT.BUS_ITEM.SHOW_ROUTE} <ChevronRight className="w-3 h-3" />
                </div>
            </div>
        </button>
    );
}

// Loading skeleton UI to display while loading
function LoadingSkeleton() {
    return (
        <div className="p-4 space-y-3">
            {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 w-full bg-slate-100 animate-pulse rounded-xl" />
            ))}
        </div>
    );
}

function ArrivalList({
    loading,
    error,
    arrivalData,
    onRouteChange,
}: {
    loading: boolean;
    error: string | null;
    arrivalData: BusStopArrival[];
    onRouteChange?: (routeName: string) => void;
}) {
    if (error) {
        return (
            <div className="p-4">
                <div
                    className="flex flex-col items-center gap-2 p-4 bg-red-50 rounded-2xl border border-red-100 text-center">
                    <AlertTriangle className="w-8 h-8 text-red-400" />
                    <p className="text-sm text-red-800 font-bold leading-tight">{error}</p>
                </div>
            </div>
        );
    }

    if (loading && arrivalData.length === 0) return <LoadingSkeleton />;

    if (!loading && arrivalData.length === 0) {
        return (
            <div className="p-4 text-center">
                <div className="py-8 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
                    <Bus className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                    <p className="text-sm text-slate-500 font-bold">{UI_TEXT.BUS_LIST.NO_RUNNING_DESC}</p>
                    <p className="text-[10px] text-slate-400 mt-1 uppercase tracking-wider">No buses scheduled</p>
                </div>
            </div>
        );
    }

    return (
        <div className="max-h-[320px] overflow-y-auto custom-scrollbar p-3 sm:p-4 space-y-2.5">
            {arrivalData.map((bus, idx) => (
                <ArrivalItem key={`${bus.routeno}-${idx}`} bus={bus} onRouteChange={onRouteChange} />
            ))}
        </div>
    );
}

export default function BusStopPopup({
    stopId,
    onRouteChange,
}: {
    stopId: string;
    onRouteChange?: (routeName: string) => void;
}) {
    const { data: arrivalRawData, loading, error } = useBusArrivalInfo(stopId);

    const sortedArrivalData = useMemo(() => {
        return arrivalRawData
            ? [...arrivalRawData].sort((a, b) => a.arrtime - b.arrtime) // Sort by actual arrival time rather than distance (stops)
            : [];
    }, [arrivalRawData]);

    return (
        <div className="w-full min-w-[260px] sm:min-w-[300px] bg-white">
            <ArrivalList
                loading={loading}
                error={error}
                arrivalData={sortedArrivalData}
                onRouteChange={onRouteChange}
            />
        </div>
    );
}
