import { getEnv, getEnvArray, getEnvBoolean, getEnvBounds, getEnvNumber } from "@core/utils/parser";

// ----------------------------------------------------------------------
// Internal Parsing Helpers & Raw Data
// ----------------------------------------------------------------------

const RAW_POSITION = getEnv(process.env.NEXT_PUBLIC_MAP_DEFAULT_POSITION, "37.3421,127.91976");
const [defaultLat, defaultLng] = RAW_POSITION.split(",").map(Number);

const RAW_STATIC_API_URL = getEnv(process.env.NEXT_PUBLIC_STATIC_API_URL, "NOT_SET");
const STATIC_BASE_URL = RAW_STATIC_API_URL !== "NOT_SET" ? RAW_STATIC_API_URL.replace(/\/+$/, "") : "";

// ----------------------------------------------------------------------
// Exported Configurations
// ----------------------------------------------------------------------

export const APP_CONFIG = {
    NAME: getEnv(process.env.NEXT_PUBLIC_APP_NAME, "wBus"),
    IS_DEV: process.env.NODE_ENV === "development",
} as const;

export const SITE_CONFIG = {
    METADATA: {
        TITLE: getEnv(process.env.NEXT_PUBLIC_SITE_TITLE, "wBus"),
        DESCRIPTION: getEnv(process.env.NEXT_PUBLIC_SITE_DESCRIPTION, "원주시 실시간 버스 위치 및 도착 정보 서비스"),
        // @TODO: Enable these once the environment variables are set up
        // BASE_URL: getEnv(process.env.NEXT_PUBLIC_SITE_BASE_URL, "http://localhost:3000"),
        // SOCIAL_IMAGE: getEnv(process.env.NEXT_PUBLIC_SOCIAL_IMAGE_PATH, "/social-image.png"),
    },
} as const;

export const API_CONFIG = {
    LIVE: {
        URL: getEnv(process.env.NEXT_PUBLIC_LIVE_API_URL, "NOT_SET"),
        POLLING_INTERVAL_MS: getEnvNumber(process.env.NEXT_PUBLIC_LIVE_API_REFRESH_INTERVAL, 3000),
    },
    STATIC: {
        BASE_URL: STATIC_BASE_URL,
        USE_REMOTE: getEnvBoolean(process.env.NEXT_PUBLIC_USE_REMOTE_STATIC_DATA, false),
        REVALIDATE_SEC: 3600,
        PATHS: {
            MAP_STYLE: "config.json",
            ROUTE_MAP: "routeMap.json",
            POLYLINES: "polylines",
            SCHEDULES: "schedules",
        },
    },
    MAP_STYLE_FALLBACK: getEnv(process.env.NEXT_PUBLIC_MAP_FALLBACK_API_URL, "https://tiles.openfreemap.org/styles/liberty"),
} as const;

export const MAP_SETTINGS = {
    BOUNDS: {
        MAX: getEnvBounds(process.env.NEXT_PUBLIC_MAP_MAX_BOUNDS, "37.10,127.60,37.60,128.30"),
        DEFAULT_CENTER: [defaultLat, defaultLng] as [number, number],
    },
    ZOOM: {
        DEFAULT: getEnvNumber(process.env.NEXT_PUBLIC_MAP_DEFAULT_ZOOM, 13),
        MIN: getEnvNumber(process.env.NEXT_PUBLIC_MAP_MIN_ZOOM, 12),
        MAX: getEnvNumber(process.env.NEXT_PUBLIC_MAP_MAX_ZOOM, 19),
        BUS_STOP_VISIBLE: getEnvNumber(process.env.NEXT_PUBLIC_BUS_STOP_MARKER_MIN_ZOOM, 16),
    },
    ANIMATION: {
        BUS_MOVE_MS: getEnvNumber(process.env.NEXT_PUBLIC_BUS_ANIMATION_DURATION, 4000),
        FLY_TO_MS: getEnvNumber(process.env.NEXT_PUBLIC_MAP_FLY_TO_DURATION, 1000),
    },
    MARKERS: {
        BUS: {
            ICON_SIZE: [29, 43] as [number, number],
            ICON_ANCHOR: [14, 21] as [number, number],
            POPUP_ANCHOR: [0, -21] as [number, number],
            LABEL_STYLE_ID: "bus-route-label-style",
            MARQUEE_THRESHOLD: 3, // Number of characters to start marquee effect
        }
    },
    // Special logic for specific bus stops
    ALWAYS_UPWARD_NODE_IDS: getEnvArray(process.env.NEXT_PUBLIC_ALWAYS_UPWARD_NODE_IDS, ","),
    // Default route to select on map load
    DEFAULT_ROUTE: getEnv(process.env.NEXT_PUBLIC_DEFAULT_ROUTE, "30"),
} as const;

export const UI_CONFIG = {
    TRANSITIONS: {
        SPLASH_FADE_MS: getEnvNumber(process.env.NEXT_PUBLIC_SPLASH_FADE_DURATION, 500),
    },
} as const;

// ----------------------------------------------------------------------
// Storage Keys (LocalStorage)
// ----------------------------------------------------------------------

export const STORAGE_KEYS = {
    ROUTE_ID: "wbus_selected_route",
    MAP_VIEW: "wbus_map_view",
} as const;

// ----------------------------------------------------------------------
// Domain Constants
// ----------------------------------------------------------------------

export const DAY_TYPES = {
    WEEKDAY: 'weekday',
    WEEKEND: 'weekend', // Covers weekends and public holidays
} as const;

export type DayType = typeof DAY_TYPES[keyof typeof DAY_TYPES];
