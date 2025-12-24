/**
 * Clamp a number to the inclusive range [min, max].
 *
 * @returns The input `value` constrained to be at least `min` and at most `max`.
 */
export function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}
