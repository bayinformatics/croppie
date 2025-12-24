/**
 * Create a debounced version of a function that delays invoking it until after a period of inactivity.
 *
 * @param fn - The function to debounce
 * @param delay - Milliseconds to wait after the last call before invoking `fn`
 * @returns A function that delays calling `fn` until `delay` milliseconds have passed since the most recent call; preserves the original `this` context and parameters
 */
export declare function debounce<T extends (...args: unknown[]) => unknown>(fn: T, delay: number): (...args: Parameters<T>) => void;
//# sourceMappingURL=debounce.d.ts.map