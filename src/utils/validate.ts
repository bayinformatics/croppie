import type { CroppieOptions } from "../types.js";
import { DEFAULT_MAX_ZOOM } from "./limits.js";
import { toNumber } from "./number.js";

const PREFIX = "[@bayinformatics/croppie]";

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
export function positiveFinite(name: string, value: unknown): number {
	const number =
		typeof value === "number" || typeof value === "string"
			? toNumber(value)
			: Number.NaN;
	if (!Number.isFinite(number) || number <= 0) {
		const shown = typeof value === "string" ? JSON.stringify(value) : value;
		throw new RangeError(
			`${PREFIX} ${name} must be a positive, finite number (got ${String(shown)})`,
		);
	}
	return number;
}

/**
 * Validate the options passed to the `Croppie` constructor, and return them with every
 * dimension and zoom limit as a number.
 *
 * A viewport or boundary dimension and `zoom.min` / `zoom.max` may be numbers or numeric
 * strings (as read from data attributes: `"200"`, `" 5 "`); the returned options hold them
 * as numbers, so no string reaches the arithmetic. Throws a `RangeError` for values that
 * would silently produce NaN/Infinity maths or an unusable slider: a dimension that is not
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
export function validateOptions(options: CroppieOptions): CroppieOptions {
	const viewport = {
		...options.viewport,
		width: positiveFinite("viewport.width", options.viewport.width),
		height: positiveFinite("viewport.height", options.viewport.height),
	};
	const checked: CroppieOptions = { ...options, viewport };

	if (options.boundary) {
		checked.boundary = {
			width: positiveFinite("boundary.width", options.boundary.width),
			height: positiveFinite("boundary.height", options.boundary.height),
		};
	}

	if (options.zoom) {
		const zoom = { ...options.zoom };
		if (zoom.min !== undefined) zoom.min = positiveFinite("zoom.min", zoom.min);
		if (zoom.max !== undefined) zoom.max = positiveFinite("zoom.max", zoom.max);
		checked.zoom = zoom;

		// An unset min is per image and capped at max, so only a configured min is compared
		const max = zoom.max ?? DEFAULT_MAX_ZOOM;
		if (zoom.min !== undefined && zoom.min > max) {
			throw new RangeError(
				`${PREFIX} zoom.min (${zoom.min}) must not be greater than zoom.max (${max})`,
			);
		}
	}

	const { boundary } = checked;
	if (
		boundary &&
		(boundary.width < viewport.width || boundary.height < viewport.height)
	) {
		console.warn(
			`${PREFIX} boundary (${boundary.width}×${boundary.height}) is smaller than the viewport (${viewport.width}×${viewport.height}); the viewport will be clipped`,
		);
	}

	return checked;
}
