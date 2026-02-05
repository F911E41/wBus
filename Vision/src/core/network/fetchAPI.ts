import { API_CONFIG, APP_CONFIG } from "@core/config/env";

// Set a delay function for retry logic
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Custom Error Class for HTTP Errors
export class HttpError extends Error {
    status: number;

    constructor(message: string, status: number) {
        super(message);
        this.name = "HttpError";
        this.status = status;
    }
}

/**
 * API Fetch Function (GET)
 * @param endpoint ex: `/getBusLocation/34`
 * @param options Fetch options (retries, retryDelay, isStatic)
 */
export async function fetchAPI<T = unknown>(
    endpoint: string,
    options: {
        retries?: number;
        retryDelay?: number;
        isStatic?: boolean;
        baseUrl?: string;
        init?: RequestInit;
    } = {}
): Promise<T> {
    const { retries = 3, retryDelay = 1000, isStatic = false, baseUrl: customBaseUrl, init } = options;

    if (customBaseUrl === undefined) {
        if (!isStatic && API_CONFIG.LIVE.URL === "NOT_SET") {
            throw new Error("[fetchAPI] Environment variable `LIVE_API_URL` is not set.");
        }

        if (isStatic && API_CONFIG.STATIC.BASE_URL === "NOT_SET") {
            throw new Error("[fetchAPI] Environment variable `STATIC_API_URL` is not set.");
        }
    }

    const baseUrl = customBaseUrl ?? (isStatic ? API_CONFIG.STATIC.BASE_URL : API_CONFIG.LIVE.URL);
    const url = `${baseUrl}${endpoint}`;

    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(url, {
                ...init,
                method: "GET",
                headers: {
                    Client: APP_CONFIG.NAME,
                    ...(init?.headers ?? {}),
                },
            });

            if (!response.ok) {
                const errorText = await response.text();
                const httpError = new HttpError(
                    `[fetchAPI] Fetch failed for ${url} with status ${response.status}: ${errorText}`,
                    response.status
                );
                // Don't throw here, let it be handled by the catch block below
                if (i === retries - 1) {
                    throw httpError;
                }
                throw httpError;
            }

            return (await response.json()) as T;
        } catch (error) {
            const isLast = i === retries - 1;

            if (isLast) {
                if (error instanceof HttpError) {
                    throw error;
                }
                const message = error instanceof Error ? error.message : String(error);
                throw new Error(`[fetchAPI] Fetch failed for ${url}: ${message}`);
            }

            await delay(retryDelay);
        }
    }

    throw new Error("[fetchAPI] Unhandled exception occurred.");
}
