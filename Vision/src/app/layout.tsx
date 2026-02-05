import "./globals.css";
import "maplibre-gl/dist/maplibre-gl.css";

import React from "react";

import { ThemeProvider } from "next-themes";
import { Geist, Geist_Mono } from "next/font/google";

import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";

import { SITE_CONFIG } from "@core/config/env";

import { MapContextProvider } from "@map/context/MapContext";

import type { Metadata, Viewport } from "next";

// Google Fonts (Geist Sans, Geist Mono)
const geistSans = Geist({
    variable: "--font-geist-sans",
    subsets: ["latin"],
});

const geistMono = Geist_Mono({
    variable: "--font-geist-mono",
    subsets: ["latin"],
});

// @TODO: Make BASE_URL dynamic based on environment
const BASE_URL = "https://wbus.vercel.app";

// Page Metadata
export const metadata: Metadata = {
    metadataBase: new URL(BASE_URL),

    title: {
        default: "wBus",
        template: "%s · wBus",
    },
    description: SITE_CONFIG.METADATA.DESCRIPTION,

    alternates: {
        canonical: "/",
    },

    openGraph: {
        type: "website",
        url: BASE_URL,
        siteName: "wBus",
        title: "wBus",
        description: SITE_CONFIG.METADATA.DESCRIPTION,
        images: [
            {
                url: "/opengraph-image.png",
                width: 1200,
                height: 630,
                alt: "wBus",
            },
        ],
    },

    twitter: {
        card: "summary_large_image",
        title: "wBus",
        description: SITE_CONFIG.METADATA.DESCRIPTION,
        images: ["/opengraph-image.png"],
    },

    icons: {
        icon: "/favicon.ico",
        apple: "/apple-touch-icon.png",
    },
};

export const viewport: Viewport = {
    width: "device-width",
    initialScale: 1,
    maximumScale: 1,
    userScalable: true,
    viewportFit: "cover",
    themeColor: "#003876",
    colorScheme: "light",
};

// RootLayout is the main layout part that wraps around all pages.
// It includes global styles, the MapContextProvider for map context, and analytics components.
export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="ko" suppressHydrationWarning>
            <body
                className={`${geistSans.variable} ${geistMono.variable} antialiased`}
            >
                <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
                    {/* Provides global map context via MapContextProvider */}
                    <MapContextProvider>{children}</MapContextProvider>
                </ThemeProvider>
                {/* Vercel SpeedInsights and Analytics components */}
                <SpeedInsights />
                <Analytics />
            </body>
        </html>
    );
}
