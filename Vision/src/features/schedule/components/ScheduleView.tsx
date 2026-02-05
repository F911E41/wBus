"use client";

import { memo, useEffect, useMemo, useState } from "react";

import { DAY_TYPES, DayType } from "@core/config/env";
import { DAY_LABELS, UI_TEXT } from "@core/config/locale";

import { getCurrentDayType } from "@schedule/utils/time";

import type { BusSchedule, RowItem } from "@core/domain/schedule";

// ----------------------------------------------------------------------
// Types & Helpers
// ----------------------------------------------------------------------

interface NextBusInfo {
    hour: string;
    minute: string;
    timeUntil: { minutes: number; seconds: number } | null;
}

/**
 * Maps internal day type constants to localized UI labels.
 */
const dayTypeToLabel = {
    [DAY_TYPES.WEEKDAY]: DAY_LABELS.WEEKDAY,
    [DAY_TYPES.WEEKEND]: DAY_LABELS.WEEKEND,
} as const;

/**
 * Returns the localized label for specific featured stop keys.
 */
function getFeaturedStopsLabel(key: string): string {
    if (key === 'general') return '';
    if (key === 'weekday') return DAY_LABELS.WEEKDAY;
    if (key === 'sunday') return DAY_LABELS.SUNDAY;
    return key;
}

/**
 * Pure function to calculate the very next bus based on current time.
 */
function findNextBus(
    schedule: Record<string, Record<string, RowItem[]>>,
    hours: string[],
    direction: string,
    now: Date
): NextBusInfo | null {
    const currentHour = now.getHours().toString().padStart(2, "0");
    const currentMinute = now.getMinutes();

    for (const hour of hours) {
        const buses = schedule[hour]?.[direction];
        if (!buses?.length) continue;

        const hourNum = parseInt(hour, 10);
        const currentHourNum = parseInt(currentHour, 10);

        // Skip past hours
        if (hourNum < currentHourNum) continue;

        for (const bus of buses) {
            const busMinute = parseInt(bus.minute, 10);

            // If it's the current hour, skip past minutes
            if (hourNum === currentHourNum && busMinute < currentMinute) continue;

            // Calculate exact time difference
            const busTime = new Date(now);
            busTime.setHours(hourNum, busMinute, 0, 0);

            const diff = busTime.getTime() - now.getTime();
            if (diff < 0) continue;

            return {
                hour,
                minute: bus.minute,
                timeUntil: {
                    minutes: Math.floor(diff / 60000),
                    seconds: Math.floor((diff % 60000) / 1000),
                },
            };
        }
    }

    return null;
}

// ----------------------------------------------------------------------
// Custom Hook: Logic Extraction
// ----------------------------------------------------------------------

function useScheduleLogic(data: BusSchedule) {
    const isGeneralSchedule = !!data.schedule.general;

    // State
    const [dayType, setDayType] = useState<DayType>(() => getCurrentDayType());
    const [direction, setDirection] = useState(data.directions[0]);
    const [now, setNow] = useState(() => new Date());

    // Effect: Update time every second
    useEffect(() => {
        const interval = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(interval);
    }, []);

    const resolvedDirection = useMemo(() => {
        if (data.directions.includes(direction)) return direction;
        return data.directions[0];
    }, [data.directions, direction]);

    // Derived State: Current active schedule based on day type
    const activeSchedule = useMemo(
        () => (isGeneralSchedule ? data.schedule.general! : data.schedule[dayType]!),
        [data.schedule, dayType, isGeneralSchedule]
    );

    // Derived State: Sorted list of hours
    const hours = useMemo(
        () => Object.keys(activeSchedule).sort(),
        [activeSchedule]
    );

    // Derived State: Next bus info
    const nextBus = useMemo(
        () => findNextBus(activeSchedule, hours, resolvedDirection, now),
        [activeSchedule, hours, resolvedDirection, now]
    );

    // Determine which hour to highlight (Next bus hour OR current hour)
    const highlightedHour = nextBus?.hour ?? now.getHours().toString().padStart(2, "0");

    return {
        isGeneralSchedule,
        dayType,
        setDayType,
        direction: resolvedDirection,
        setDirection,
        activeSchedule,
        hours,
        nextBus,
        highlightedHour
    };
}

// ----------------------------------------------------------------------
// Sub-Components (Internal)
// ----------------------------------------------------------------------

const RouteInfo = ({ details, featuredStops }: { details?: string[]; featuredStops?: Record<string, string[]> }) => {
    const featuredEntries = Object.entries(featuredStops ?? {})
        .map(([key, stops]) => [key, stops.filter((stop) => stop.trim().length > 0)] as const)
        .filter(([, stops]) => stops.length > 0);

    return (
        <>
            {details && details.length > 0 && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs space-y-1">
                    {details.map((detail, i) => (
                        <p key={i} className="text-amber-800">• {detail}</p>
                    ))}
                </div>
            )}

            {featuredEntries.length > 0 && (
                <div className="p-3 bg-slate-50 rounded-xl text-xs">
                    <p className="font-bold text-slate-700 mb-2">{UI_TEXT.SCHEDULE.MAJOR_STOPS}</p>
                    {featuredEntries.map(([key, stops]) => (
                        <div key={key} className="mb-2 last:mb-0">
                            <p className="text-[11px] text-slate-500 mb-1">{getFeaturedStopsLabel(key)}</p>
                            <div className="flex flex-wrap gap-1.5">
                                {stops.map((stop, i) => (
                                    <span key={i}
                                        className="px-2 py-0.5 bg-white rounded-md text-[11px] text-slate-600 border border-slate-200">
                                        {stop}
                                    </span>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </>
    );
};

const DayTypeSelector = ({ current, onChange }: { current: DayType; onChange: (t: DayType) => void }) => (
    <div className="flex bg-slate-200 p-1 rounded-xl">
        {Object.values(DAY_TYPES).map((t) => (
            <button
                key={t}
                onClick={() => onChange(t)}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${current === t ? "bg-white text-blue-600 shadow-sm" : "text-slate-500"
                    }`}
            >
                {dayTypeToLabel[t]}
            </button>
        ))}
    </div>
);

const DirectionSelector = ({
    directions,
    current,
    onChange,
    isCompact
}: {
    directions: string[];
    current: string;
    onChange: (d: string) => void;
    isCompact: boolean;
}) => (
    <div className={`flex gap-2 overflow-x-auto pb-1 ${isCompact ? "text-[11px]" : "text-xs"}`}>
        {directions.map((dir) => (
            <button
                key={dir}
                onClick={() => onChange(dir)}
                className={`${isCompact ? "px-3 py-1.5" : "px-3.5 py-2"
                    } rounded-full font-bold border whitespace-nowrap transition-all ${current === dir
                        ? "bg-blue-600 border-blue-600 text-white"
                        : "bg-white border-slate-200"
                    }`}
            >
                {dir}
            </button>
        ))}
    </div>
);

const NextBusStatus = ({
    hour,
    nextBus,
    scheduleItems
}: {
    hour: string;
    nextBus: NextBusInfo | null;
    scheduleItems?: RowItem[];
}) => (
    <div className="bg-blue-50 rounded-xl shadow-sm border border-blue-200 overflow-hidden">
        <div className="grid grid-cols-[56px_1fr]">
            {/* Time Column */}
            <div
                className="p-3 text-center border-r border-blue-200 font-mono font-bold flex flex-col items-center gap-1 text-blue-600 text-sm">
                <div>{hour}</div>
                {nextBus?.timeUntil && (
                    <div className="text-[11px] font-normal text-blue-500">
                        {nextBus.timeUntil.minutes}:{nextBus.timeUntil.seconds.toString().padStart(2, '0')}
                    </div>
                )}
            </div>
            {/* Minutes Column */}
            <div className="p-3 flex flex-wrap gap-3 items-center">
                {scheduleItems?.map((item, i) => (
                    <span
                        key={i}
                        className={`text-sm font-medium ${nextBus && item.minute === nextBus.minute ? "text-blue-600 font-bold" : ""
                            }`}
                    >
                        {item.minute}
                        {item.noteId && <sup className="text-red-500 ml-0.5">{item.noteId}</sup>}
                    </span>
                )) ?? <span className="text-slate-300"></span>}
            </div>
        </div>
    </div>
);

const TimetableGrid = ({
    hours,
    highlightedHour,
    nextBus,
    schedule,
    direction
}: {
    hours: string[];
    highlightedHour: string;
    nextBus: NextBusInfo | null;
    schedule: Record<string, Record<string, RowItem[]>>;
    direction: string;
}) => (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {hours.map((hour) => {
            const isNow = hour === highlightedHour;
            return (
                <div
                    key={hour}
                    className={`grid grid-cols-[56px_1fr] border-b last:border-0 border-slate-200 ${isNow ? "bg-blue-100/40 border-b-2 border-blue-300" : ""
                        }`}
                >
                    {/* Time Column */}
                    <div
                        className={`p-3 text-center border-r border-slate-200 font-mono font-bold flex flex-col items-center gap-1 text-xs ${isNow ? "text-blue-600" : "text-slate-400"
                            }`}
                    >
                        <div>{hour}</div>
                        {isNow && nextBus?.timeUntil && (
                            <div className="text-[10px] font-normal text-blue-500">
                                {nextBus.timeUntil.minutes}:{nextBus.timeUntil.seconds.toString().padStart(2, '0')}
                            </div>
                        )}
                    </div>
                    {/* Minutes Column */}
                    <div className="p-3 flex flex-wrap gap-3 items-center">
                        {schedule[hour]?.[direction]?.map((item, i) => (
                            <span key={i} className="text-sm font-medium">
                                {item.minute}
                                {item.noteId && <sup className="text-red-500 ml-0.5">{item.noteId}</sup>}
                            </span>
                        )) ?? <span className="text-slate-300"></span>}
                    </div>
                </div>
            );
        })}
    </div>
);

// ----------------------------------------------------------------------
// Main Component
// ----------------------------------------------------------------------

function ScheduleView({ data, mode = "full" }: { data: BusSchedule; mode?: "full" | "compact" }) {
    const isCompact = mode === "compact";

    const {
        isGeneralSchedule,
        dayType,
        setDayType,
        direction,
        setDirection,
        activeSchedule,
        hours,
        nextBus,
        highlightedHour
    } = useScheduleLogic(data);

    return (
        <div className={isCompact ? "space-y-3" : "space-y-4"}>

            {/* 1. Route Info (Details & Featured Stops) - Full Mode Only */}
            {!isCompact && (
                <RouteInfo details={data.routeDetails} featuredStops={data.featuredStops} />
            )}

            {/* 2. Day Type Tabs - Full Mode Only (if applicable) */}
            {!isCompact && !isGeneralSchedule && (
                <DayTypeSelector current={dayType} onChange={setDayType} />
            )}

            {/* 3. Direction Buttons */}
            <DirectionSelector
                directions={data.directions}
                current={direction}
                onChange={setDirection}
                isCompact={isCompact}
            />

            {/* 4. Highlighted 'Next Bus' Display */}
            {hours.includes(highlightedHour) && (
                <NextBusStatus
                    hour={highlightedHour}
                    nextBus={nextBus}
                    scheduleItems={activeSchedule[highlightedHour]?.[direction]}
                />
            )}

            {/* 5. Full Timetable - Full Mode Only */}
            {!isCompact && (
                <TimetableGrid
                    hours={hours}
                    highlightedHour={highlightedHour}
                    nextBus={nextBus}
                    schedule={activeSchedule}
                    direction={direction}
                />
            )}

            {/* 6. Footer Notes - Full Mode Only */}
            {!isCompact && data.notes && Object.keys(data.notes).length > 0 && (
                <div className="p-3 bg-slate-100 rounded-xl text-[11px] text-slate-500 space-y-1">
                    <p className="font-bold mb-1">{UI_TEXT.SCHEDULE.NOTES_TITLE}</p>
                    {Object.entries(data.notes).map(([id, text]) => (
                        <p key={id}>{id}: {text}</p>
                    ))}
                </div>
            )}

            {/* 7. Footer Last Updated - Full Mode Only */}
            {!isCompact && (
                <div className="text-center text-[11px] text-slate-400">
                    {UI_TEXT.SCHEDULE.LAST_UPDATED} {data.lastUpdated}
                </div>
            )}
        </div>
    );
}

export default memo(ScheduleView);
