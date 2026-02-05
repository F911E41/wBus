/** Error types for bus location polling */
export type BusDataError =
    | "ERR:NONE_RUNNING" // No buses are currently running
    | "ERR:NETWORK" // Network failure
    | "ERR:INVALID_ROUTE" // Invalid or unknown routeId
    | null; // No error
