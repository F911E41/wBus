import { ArrowDown, ArrowUp, CircleGauge, HelpCircle } from "lucide-react";

/**
 * Get direction icon component based on direction code
 * @param directionCode - Direction code (2 for cycle, 1 for up, 0 for down, null for unknown)
 * @returns Direction icon component from lucide-react
 */
export function getDirectionIcon(directionCode: number | null) {
    if (directionCode === 2) return CircleGauge;
    if (directionCode === 1) return ArrowUp;
    if (directionCode === 0) return ArrowDown;
    return HelpCircle;
}
