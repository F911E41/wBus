// Route Map
export type RouteInfo = {
    routeName: string; // The route name shown to users (e.g., "30")
    vehicleRouteIds: string[]; // List of IDs used for real-time bus location requests
};

// Route Detail Sequence Item
export type SequenceItem = {
    nodeord: number;
    nodeid: string;
    updowncd: number;
};

// Route Detail from routeMap
export type RouteDetail = {
    routeno?: string;
    sequence: SequenceItem[];
};
