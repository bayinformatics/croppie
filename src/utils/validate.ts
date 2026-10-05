import type { CroppieOptions } from "../types.js";
import { DEFAULT_MAX_ZOOM } from "./limits.js";

const PREFIX = "[@bayinformatics/croppie]";

function assertPositiveFinite(name: string, value: unknown): void {
	if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
		throw new RangeError(
			`${PREFIX} ${name} must be a positive, finite number (got ${String(value)})`,
		);
	}
}

/**
 * Validate the options passed to the `Croppie` constructor.
 *
 * Throws a `RangeError` for values that would silently produce NaN/Infinity maths or an
 * unusable slider: a viewport or boundary dimension that is not a positive finite number,
 * a `zoom.min` / `zoom.max` that is not, or a configured `zoom.min` greater than `zoom.max`
 * (a lone `min` is compared with the default max). A lone `max` only has to be positive
 * and finite: an unset `min` is per image, and the resolved minimum is capped at `max`. A
 * boundary smaller than the viewport only logs a warning, since the viewport is then clipped
 * but nothing breaks.
 *
 * @param options - The constructor options to check
 * @throws RangeError for invalid dimensions or zoom limits
 */
export function validateOptions(options: CroppieOptions): void {
	const { viewport, boundary, zoom } = options;

	assertPositiveFinite("viewport.width", viewport.width);
	assertPositiveFinite("viewport.height", viewport.height);

	if (boundary) {
		assertPositiveFinite("boundary.width", boundary.width);
		assertPositiveFinite("boundary.height", boundary.height);
	}

	if (zoom?.min !== undefined) {
		assertPositiveFinite("zoom.min", zoom.min);
	}
	if (zoom?.max !== undefined) {
		assertPositiveFinite("zoom.max", zoom.max);
	}

	// An unset min is per image and capped at max, so only a configured min is compared
	const min = zoom?.min;
	const max = zoom?.max ?? DEFAULT_MAX_ZOOM;
	if (min !== undefined && min > max) {
		throw new RangeError(
			`${PREFIX} zoom.min (${min}) must not be greater than zoom.max (${max})`,
		);
	}

	if (
		boundary &&
		(boundary.width < viewport.width || boundary.height < viewport.height)
	) {
		console.warn(
			`${PREFIX} boundary (${boundary.width}×${boundary.height}) is smaller than the viewport (${viewport.width}×${viewport.height}); the viewport will be clipped`,
		);
	}
}
