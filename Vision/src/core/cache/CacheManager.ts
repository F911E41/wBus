/**
 * Generic cache manager for storing and retrieving data with memory management
 * Provides a centralized way to manage cache across the application
 */
export class CacheManager<T> {
    private cache: Map<string, T> = new Map();
    private pendingRequests: Map<string, Promise<T>> = new Map();
    private accessTimes: Map<string, number> = new Map();
    private maxSize: number;

    /**
     * Create a new cache manager
     * @param maxSize - Maximum number of items to store (default: 100)
     */
    constructor(maxSize: number = 100) {
        this.maxSize = maxSize;
    }

    /**
     * Get cached data or return null if not found
     */
    get(key: string): T | null {
        const value = this.cache.get(key) ?? null;
        if (value !== null) {
            this.accessTimes.set(key, Date.now());
        }
        return value;
    }

    /**
     * Set data in a cache with automatic eviction if a cache is full
     */
    set(key: string, value: T): void {
        // Evict least recently used items if a cache is full
        if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
            this.evictLRU();
        }
        this.cache.set(key, value);
        this.accessTimes.set(key, Date.now());
    }

    /**
     * Check if key exists in cache
     */
    // noinspection JSUnusedGlobalSymbols
    has(key: string): boolean {
        return this.cache.has(key);
    }

    /**
     * Delete a specific key from cache
     */
    // noinspection JSUnusedGlobalSymbols
    delete(key: string): void {
        this.cache.delete(key);
        this.accessTimes.delete(key);
        this.pendingRequests.delete(key);
    }

    /**
     * Clear all cache
     */
    clear(): void {
        this.cache.clear();
        this.accessTimes.clear();
        this.pendingRequests.clear();
    }

    /**
     * Clear all cache except for specified keys
     * @internal Used for selective cache management
     */
    // noinspection JSUnusedGlobalSymbols
    clearExcept(keysToKeep: string[]): void {
        const keepSet = new Set(keysToKeep);
        for (const key of this.cache.keys()) {
            if (!keepSet.has(key)) {
                this.cache.delete(key);
                this.accessTimes.delete(key);
            }
        }
        for (const key of this.pendingRequests.keys()) {
            if (!keepSet.has(key)) {
                this.pendingRequests.delete(key);
            }
        }
    }

    /**
     * Get or fetch data with automatic deduplication of concurrent requests
     * If data is cached, return it immediately
     * If a request is pending, return the pending promise
     * Otherwise, execute the fetch function and cache the result
     */
    async getOrFetch(
        key: string,
        fetchFn: () => Promise<T>
    ): Promise<T> {
        // Return cached data if available
        if (this.cache.has(key)) {
            this.accessTimes.set(key, Date.now());
            return this.cache.get(key)!;
        }

        // Return pending request if one exists
        if (this.pendingRequests.has(key)) {
            return this.pendingRequests.get(key)!;
        }

        // Create new request
        const promise = fetchFn()
            .then((data) => {
                this.set(key, data);
                return data;
            })
            .finally(() => {
                this.pendingRequests.delete(key);
            });

        this.pendingRequests.set(key, promise);
        return promise;
    }

    /**
     * Get all keys in cache
     * @internal Used for debugging and testing
     */
    // noinspection JSUnusedGlobalSymbols
    keys(): string[] {
        return Array.from(this.cache.keys());
    }

    /**
     * Get cache size
     * @internal Used for monitoring and testing
     */
    // noinspection JSUnusedGlobalSymbols
    size(): number {
        return this.cache.size;
    }

    /**
     * Get cache statistics for monitoring
     * @internal Used for debugging and performance monitoring
     */
    // noinspection JSUnusedGlobalSymbols
    getStats(): {
        size: number;
        maxSize: number;
        pendingRequests: number;
        utilizationPercent: number;
    } {
        return {
            size: this.cache.size,
            maxSize: this.maxSize,
            pendingRequests: this.pendingRequests.size,
            utilizationPercent: Math.round((this.cache.size / this.maxSize) * 100),
        };
    }

    /**
     * Evict the least recently used item from cache
     */
    private evictLRU(): void {
        const oldestKey = Array.from(this.accessTimes.entries())
            .reduce((oldest, curr) => (curr[1] < oldest[1] ? curr : oldest))[0];

        this.cache.delete(oldestKey);
        this.accessTimes.delete(oldestKey);
        this.pendingRequests.delete(oldestKey);
    }
}
