import type { CroppieOptions } from "../types.js";
/**
 * Validate the options passed to the `Croppie` constructor.
 *
 * Throws a `RangeError` for values that would silently produce NaN/Infinity maths or an
 * unusable slider: a viewport or boundary dimension that is not a positive finite number,
 * a `zoom.min` / `zoom.max` that is not, or `zoom.min > zoom.max` (a lone `min` is
 * compared with the default max, a lone `max` with the default min). A boundary smaller
 * than the viewport only logs a warning, since the viewport is then clipped but nothing breaks.
 *
 * @param options - The constructor options to check
 * @throws RangeError for invalid dimensions or zoom limits
 */
export declare function validateOptions(options: CroppieOptions): void;
