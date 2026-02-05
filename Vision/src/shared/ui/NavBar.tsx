"use client";

import { MapIcon } from "lucide-react";

import { APP_CONFIG } from "@core/config/env";

interface NavBarProps {
    /** Optional class names to override positioning (default: absolute top-4 left-4) */
    className?: string;
}

/**
 * Floating Navigation Bar / Header.
 * Displays the App Logo and Name in a glassmorphism "pill" style.
 */
export default function NavBar({ className = "" }: NavBarProps) {
    return (
        <nav
            aria-label="Main Navigation"
            className={`absolute top-4 left-4 z-50 ${className}`}
        >
            <div
                className="
          flex items-center gap-2 p-1.5 pr-5 
          bg-white/90 backdrop-blur-md 
          border border-white/20 shadow-lg rounded-full
          transition-transform hover:scale-[1.02] active:scale-95 cursor-default
        "
            >
                {/* Logo Icon Container */}
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-600 text-white shadow-sm">
                    <MapIcon className="w-5 h-5" aria-hidden="true" />
                </div>

                {/* App Title */}
                <h1 className="text-sm font-bold text-slate-800 tracking-tight select-none">
                    {APP_CONFIG.NAME}
                </h1>
            </div>
        </nav>
    );
}
