/**
 * Converts a number, or a number given as a string (a range input's `value`, an option read
 * from a data attribute), to a number.
 *
 * A blank string becomes `NaN` instead of the `0` that `Number("")` and `Number(" ")` give, so
 * a caller that ignores or rejects non-finite values treats it like any other string that is
 * not a number. Any other value goes through `Number()`.
 *
 * Internal: not part of the package's API.
 *
 * @param value - The value to convert
 * @returns The number, or `NaN` when `value` is a blank string or not a number
 */
export function toNumber(value: unknown): number {
	if (typeof value === "string") {
		return value.trim() === "" ? Number.NaN : Number(value);
	}
	return Number(value);
}
