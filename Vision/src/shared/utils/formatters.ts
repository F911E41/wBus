import { UI_TEXT } from "@core/config/locale";

/**
 * Converts seconds to minutes, rounding up to the nearest whole number.
 * Ensures the result is never negative.
 * * @param seconds - The duration in seconds (e.g., from API)
 * @returns The duration in minutes (e.g., 65s -> 2m)
 */
export function secondsToMinutes(seconds: number): number {
    if (seconds <= 0) return 0;
    return Math.ceil(seconds / 60);
}

/**
 * Shortens the vehicle type string for UI display.
 * Typically used to shorten "저상버스" (Low-floor bus) to "저상".
 * * @param vehicleType - The full vehicle type string
 * @returns The first 2 characters of the string
 */
export function formatVehicleType(vehicleType: string): string {
    if (!vehicleType) return "";
    return vehicleType.slice(0, 2);
}

/**
 * Formats a route number with the localized suffix.
 * * @param routeNo - The raw route number (e.g., "100")
 * @returns The formatted string (e.g., "100번" in KR or "No. 100" depending on locale)
 */
export function formatRouteNumber(routeNo: string): string {
    return `${routeNo}${UI_TEXT.BUS_LIST.TITLE_ROUTE}`;
}
