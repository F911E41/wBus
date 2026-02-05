"use client";

import React, { Component, ErrorInfo, ReactNode } from "react";

import { APP_CONFIG } from "@core/config/env";
import { UI_TEXT } from "@core/config/locale";

// ----------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------

interface ErrorBoundaryProps {
    children: ReactNode;
    /** Custom fallback UI to render instead of the default error card */
    fallback?: ReactNode;
    /** Callback triggered when an error is caught */
    onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
}

interface DefaultFallbackProps {
    error: Error | null;
    onRetry: () => void;
}

// ----------------------------------------------------------------------
// Internal UI Component (Default Fallback)
// ----------------------------------------------------------------------

/**
 * The default UI displayed when an error occurs and no custom fallback is provided.
 */
const DefaultErrorFallback: React.FC<DefaultFallbackProps> = ({ error, onRetry }) => {
    const errorMessage = error instanceof Error ? error.message : String(error);

    return (
        <div className="flex items-center justify-center min-h-screen bg-gray-50 p-4">
            <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full">
                {/* Icon */}
                <div className="flex items-center justify-center w-12 h-12 mx-auto bg-red-100 rounded-full mb-4">
                    <span className="text-2xl" role="img" aria-label="Error">⚠️</span>
                </div>

                {/* Title & Message */}
                <h2 className="text-xl font-bold text-gray-900 text-center mb-2">
                    {UI_TEXT.ERROR.TITLE}
                </h2>
                <p className="text-gray-600 text-center mb-6">
                    {UI_TEXT.ERROR.UNKNOWN(errorMessage)}
                </p>

                {/* Developer Debug Info (Only in Dev Mode) */}
                {APP_CONFIG.IS_DEV && error && (
                    <div className="bg-red-50 border border-red-200 rounded p-3 mb-4 text-left">
                        <p className="text-xs font-mono text-red-800 break-all whitespace-pre-wrap">
                            {error.toString()}
                        </p>
                    </div>
                )}

                {/* Action Button */}
                <button
                    onClick={onRetry}
                    className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                >
                    {UI_TEXT.COMMON.RETRY}
                </button>
            </div>
        </div>
    );
};

// ----------------------------------------------------------------------
// Main Error Boundary Class
// ----------------------------------------------------------------------

/**
 * Error Boundary component to catch and handle React errors gracefully.
 * Note: Must be a Class Component as hooks do not yet support `componentDidCatch`.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props);
        this.state = {
            hasError: false,
            error: null,
        };
    }

    /**
     * Lifecycle: Update state so the next render shows the fallback UI.
     */
    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return {
            hasError: true,
            error,
        };
    }

    /**
     * Lifecycle: Log error information.
     */
    componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
        // Log error details for debugging in development
        if (APP_CONFIG.IS_DEV) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error(UI_TEXT.ERROR.UNKNOWN(msg), errorInfo);
        }

        // Trigger parent callback if provided (e.g., for analytics logging)
        if (this.props.onError) {
            this.props.onError(error, errorInfo);
        }
    }

    /**
     * Resets the error state to attempt re-rendering the children.
     */
    handleReset = (): void => {
        this.setState({
            hasError: false,
            error: null,
        });
    };

    render(): ReactNode {
        if (this.state.hasError) {
            // Return Custom Fallback if provided
            if (this.props.fallback) {
                return this.props.fallback;
            }

            // Return Default Error UI
            return (
                <DefaultErrorFallback
                    error={this.state.error}
                    onRetry={this.handleReset}
                />
            );
        }

        // Render Children (Happy Path)
        return this.props.children;
    }
}

export default ErrorBoundary;
