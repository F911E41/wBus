import path from 'path';
import { promises as fs } from 'fs';

import { fetchAPI, HttpError } from '@core/network/fetchAPI';

import { API_CONFIG, APP_CONFIG } from '@core/config/env';

import type { BusSchedule } from "@core/domain/schedule";

// ------------------------------------------------------------------
// Types & Interfaces
// ------------------------------------------------------------------

export interface Notice {
    id: string;
    type: 'info' | 'warning' | 'urgent';
    title: string;
    message: string;
    date: string;
}

interface NoticeResponse {
    notices: Notice[];
}

interface ResourceLocation {
    isRemote: boolean;
    pathOrUrl: string;
}

// ------------------------------------------------------------------
// State & Caching
// ------------------------------------------------------------------

/**
 * In-memory cache to prevent redundant file reads or API calls during the server lifecycle.
 */
const GlobalCache = {
    schedules: new Map<string, BusSchedule>(),
    routeList: null as BusSchedule[] | null,
    availableRouteIds: null as string[] | null,
    notices: null as Notice[] | null,
};

// ------------------------------------------------------------------
// Internal Helpers
// ------------------------------------------------------------------

/**
 * Resolves the server-side base URL for remote API fetching.
 * Handles cases where the base URL is a relative path (e.g., '/dev') in local development.
 */
function getServerBaseUrl(): string {
    const { BASE_URL } = API_CONFIG.STATIC;

    // Check if BASE_URL is relative (starts with '/')
    if (BASE_URL && BASE_URL.startsWith('/')) {
        // Fallback to REMOTE_API_URL or return BASE_URL (which might cause generic fetch issues if not absolute)
        return process.env.REMOTE_API_URL || BASE_URL;
    }

    return BASE_URL || '';
}

/**
 * Determines the location (Remote URL or Local File Path) for a requested resource.
 * @param resourcePath - Relative path to the resource (e.g., 'schedules/101.json' or 'notice.json')
 */
function resolveResourceLocation(resourcePath: string): ResourceLocation {
    // Remote Mode
    if (API_CONFIG.STATIC.USE_REMOTE) {
        const baseUrl = getServerBaseUrl();
        // Construct remote URL: e.g., https://api.example.com/schedules/101.json
        // Note: Removing leading slash from resourcePath if present to avoid double slashes
        const normalizedPath = resourcePath.startsWith('/') ? resourcePath.slice(1) : resourcePath;

        return {
            isRemote: true,
            pathOrUrl: `${baseUrl}/${normalizedPath}`
        };
    }

    // Local File System Mode
    // Construct local path: e.g., /User/project/public/data/schedules/101.json
    return {
        isRemote: false,
        pathOrUrl: path.join(process.cwd(), 'public/data', resourcePath)
    };
}

/**
 * Generic data loader that handles both Remote Fetching and Local File Reading.
 * Includes error handling for 404s and missing files.
 */
async function loadJsonData<T>(resourcePath: string, contextLabel: string): Promise<T | null> {
    const { isRemote, pathOrUrl } = resolveResourceLocation(resourcePath);

    try {
        if (isRemote) {
            // Remote Fetch
            return await fetchAPI<T>(pathOrUrl, {
                baseUrl: '', // pathOrUrl is already absolute
                init: { next: { revalidate: API_CONFIG.STATIC.REVALIDATE_SEC } }
            });
        } else {
            // Local File Read
            const fileContent = await fs.readFile(pathOrUrl, 'utf8');
            return JSON.parse(fileContent) as T;
        }
    } catch (error) {
        // Handle "File Not Found" scenarios (ENOENT for fs, 404/403 for HTTP)
        const errorCode =
            typeof error === "object" && error !== null && "code" in error
                ? (error as { code?: string }).code
                : undefined;
        const isNotFound =
            errorCode === "ENOENT" ||
            (error instanceof HttpError && (error.status === 404 || error.status === 403));

        if (isNotFound) {
            if (APP_CONFIG.IS_DEV) {
                console.warn(`[${contextLabel}] Resource not found: ${resourcePath}`);
            }
            return null;
        }

        // Log unexpected errors
        if (APP_CONFIG.IS_DEV) {
            console.error(`[${contextLabel}] Failed to load data from: ${pathOrUrl}`, error);
        }

        return null;
    }
}

// ------------------------------------------------------------------
// Exported API Functions
// ------------------------------------------------------------------

/**
 * Get available route IDs by scanning the local directory.
 * NOTE: This relies on the local file system even if USE_REMOTE is true,
 * serving as the source of truth for which routes exist.
 */
export async function getAvailableRouteIds(): Promise<string[]> {
    if (GlobalCache.availableRouteIds) {
        return GlobalCache.availableRouteIds;
    }

    try {
        const schedulesDir = path.join(process.cwd(), 'public/data/schedules');
        const files = await fs.readdir(schedulesDir);

        GlobalCache.availableRouteIds = files
            .filter(file => file.endsWith('.json') && file !== '.keep')
            .map(file => file.replace('.json', ''));

        return GlobalCache.availableRouteIds;
    } catch (error) {
        if (APP_CONFIG.IS_DEV) {
            console.error("[getScheduleData] Failed to scan schedule directory:", error);
        }
        return [];
    }
}

/**
 * Load and parse a single route schedule with caching.
 */
export async function getRouteData(routeId: string): Promise<BusSchedule | null> {
    if (GlobalCache.schedules.has(routeId)) {
        return GlobalCache.schedules.get(routeId)!;
    }

    const resourcePath = `${API_CONFIG.STATIC.PATHS.SCHEDULES}/${routeId}.json`;
    const data = await loadJsonData<BusSchedule>(resourcePath, 'getRouteData');

    if (data) {
        GlobalCache.schedules.set(routeId, data);
    }

    return data;
}

/**
 * Get all routes (bulk load).
 */
export async function getAllRoutes(): Promise<BusSchedule[]> {
    if (GlobalCache.routeList) {
        return GlobalCache.routeList;
    }

    const routeIds = await getAvailableRouteIds();

    // Fetch all routes in parallel
    const results = await Promise.allSettled(
        routeIds.map(id => getRouteData(id))
    );

    GlobalCache.routeList = results
        .filter((result): result is PromiseFulfilledResult<BusSchedule | null> =>
            result.status === 'fulfilled'
        )
        .map(result => result.value)
        .filter((value): value is BusSchedule => value !== null);

    return GlobalCache.routeList;
}

/**
 * Get all route IDs for static path generation.
 * (Alias for getAvailableRouteIds to maintain API consistency).
 */
export async function getAllRouteIds(): Promise<string[]> {
    return await getAvailableRouteIds();
}

/**
 * Check if a specific route exists in the system.
 */
export async function routeExists(routeId: string): Promise<boolean> {
    const routeIds = await getAvailableRouteIds();
    return routeIds.includes(routeId);
}

/**
 * Fetch system notices.
 */
export async function getNotices(): Promise<Notice[]> {
    if (GlobalCache.notices) {
        return GlobalCache.notices;
    }

    // "notice.json" is expected to be at the root of the data folder
    const data = await loadJsonData<NoticeResponse>('notice.json', 'getNotices');

    if (data?.notices) {
        GlobalCache.notices = data.notices;
        return GlobalCache.notices;
    }

    return [];
}
