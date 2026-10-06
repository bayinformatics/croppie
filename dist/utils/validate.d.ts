import type { CroppieOptions } from "../types.js";
/**
 * A dimension, size or zoom limit as a number. A numeric string (as read from a data
 * attribute, such as `"200"` or `" 5 "`) is converted with `toNumber()`, like `setZoom()`
 * converts one.
 *
 * @param name - The option's name for the error message (such as `"viewport.width"`)
 * @param value - The value to check
 * @returns The value as a number
 * @throws RangeError unless the value is then a positive, finite number (a blank or
 *   non-numeric string, or a value that is neither a number nor a string, is not)
 */
export declare function positiveFinite(name: string, value: unknown): number;
/**
 * Validate the options passed to the `Croppie` constructor, and return them with every
 * dimension and zoom limit as a number.
 *
 * A viewport or boundary dimension and `zoom.min` / `zoom.max` may be numbers or numeric
 * strings (as read from data attributes: `"200"`, `" 5 "`); the returned options hold them
 * as numbers, so no string reaches the arithmetic. Throws a `RangeError` for values that
 * would silently produce NaN/Infinity math or an unusable slider: a dimension that is not
 * a positive finite number (a blank or non-numeric string is not), a `zoom.min` /
 * `zoom.max` that is not, or a configured `zoom.min` greater than `zoom.max` (a lone `min`
 * is compared with the default max). A lone `max` only has to be positive and finite: an
 * unset `min` is per image, and the resolved minimum is capped at `max`. A boundary smaller
 * than the viewport only logs a warning, since the viewport is then clipped but nothing
 * breaks.
 *
 * @param options - The constructor options to check
 * @returns A copy of `options` whose dimensions and zoom limits are numbers
 * @throws RangeError for invalid dimensions or zoom limits
 */
export declare function validateOptions(options: CroppieOptions): CroppieOptions;
