import { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";

// ----------------------------------------------------------------------
// Types & Config
// ----------------------------------------------------------------------

type PillTone = "soft" | "solid" | "muted" | "light" | "glass";
type PillSize = "sm" | "md";

/**
 * Visual styles mapping for the Pill component.
 * - `soft`: Light background with colored text (Standard).
 * - `solid`: High contrast, filled background.
 * - `muted`: Gray scale for neutral status.
 * - `light`: For use on dark backgrounds (translucent white).
 * - `glass`: Frosted glass effect for overlays.
 */
const toneStyles: Record<PillTone, string> = {
    soft: "bg-blue-50 text-blue-600 border border-blue-100",
    solid: "bg-blue-600 text-white border border-blue-600",
    muted: "bg-slate-100 text-slate-600 border border-slate-200",
    light: "bg-white/20 text-white border border-white/30",
    glass: "bg-white/30 text-white border border-white/40 backdrop-blur-md",
};

const sizeStyles: Record<PillSize, string> = {
    sm: "px-2.5 py-0.5 text-[10px]",
    md: "px-3 py-1 text-xs",
};

/**
 * Props for the Pill component.
 * Supports polymorphism via the `as` prop.
 */
type PillProps<T extends ElementType> = {
    /** The HTML element or React component to render (default: "span") */
    as?: T;
    /** The content to display inside the pill */
    children: ReactNode;
    /** Additional CSS classes to merge */
    className?: string;
    /** The visual color theme of the pill */
    tone?: PillTone;
    /** The size dimension of the pill */
    size?: PillSize;
} & ComponentPropsWithoutRef<T>; // Inherit props from the underlying element (e.g., onClick, href)

// ----------------------------------------------------------------------
// Component
// ----------------------------------------------------------------------

/**
 * A versatile "Pill" or "Badge" component for displaying status, tags, or counts.
 * It is polymorphic, meaning it can be rendered as a span, div, button, etc.
 *
 * @example
 * <Pill tone="solid" size="sm">New</Pill>
 * <Pill as="button" onClick={handleClick}>Click Me</Pill>
 */
export default function Pill<T extends ElementType = "span">({
    as,
    children,
    className = "",
    tone = "soft",
    size = "md",
    ...props
}: PillProps<T>) {
    const Component = as || "span";

    return (
        <Component
            className={`
        inline-flex items-center gap-1.5 rounded-full
        font-semibold leading-none whitespace-nowrap
        transition-colors
        ${toneStyles[tone]}
        ${sizeStyles[size]}
        ${className}
      `}
            {...props}
        >
            {children}
        </Component>
    );
}
