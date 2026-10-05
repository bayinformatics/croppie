import type { CropPoints, PointsArray, TransformState } from "../types.js";
import { clamp } from "./clamp.js";

// Re-export for convenience
export type { PointsArray };

/**
 * Input type that accepts either format
 */
export type PointsInput = CropPoints | PointsArray;

/**
 * Normalize a points input into a CropPoints object.
 *
 * Coordinates given as strings are converted to numbers: v2's `get()` returned its points
 * as `toFixed()` strings (e.g. `["50", "50", "150", "150"]`), which apps stored and pass
 * back. Only a plain decimal string counts; any other string (such as `"50px"`, `"0x10"`
 * or `""`) becomes `NaN`, which `calculateTransformFromPoints` rejects.
 *
 * @param points - An array [topLeftX, topLeftY, bottomRightX, bottomRightY], a CropPoints object, or `undefined`.
 * @returns A new CropPoints object corresponding to `points`, or `undefined` if `points` is `undefined`.
 * @throws Error if `points` is an array whose length is not exactly 4.
 */
export function normalizePoints(
	points: PointsInput | undefined,
): CropPoints | undefined {
	if (points === undefined) {
		return undefined;
	}

	if (Array.isArray(points)) {
		if (points.length !== 4) {
			throw new Error(
				"PointsArray must have exactly 4 elements: [topLeftX, topLeftY, bottomRightX, bottomRightY]",
			);
		}
		return {
			topLeftX: toCoordinate(points[0]),
			topLeftY: toCoordinate(points[1]),
			bottomRightX: toCoordinate(points[2]),
			bottomRightY: toCoordinate(points[3]),
		};
	}

	return {
		topLeftX: toCoordinate(points.topLeftX),
		topLeftY: toCoordinate(points.topLeftY),
		bottomRightX: toCoordinate(points.bottomRightX),
		bottomRightY: toCoordinate(points.bottomRightY),
	};
}

/**
 * A plain decimal number, optionally signed and with an exponent, with surrounding
 * whitespace: "12.50", "-3", ".5", "5.", "1e2". Not "50px", "0x10", "1,5", "Infinity" or "".
 */
const DECIMAL = /^\s*[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?\s*$/;

/**
 * A coordinate as a number. A string (v2's `get()` format) must be a plain decimal number;
 * any other string becomes `NaN`. (`Number()` alone would read "0x10" as 16 and "" as 0.)
 */
function toCoordinate(value: unknown): number {
	if (typeof value !== "string") return value as number;
	return DECIMAL.test(value) ? Number(value) : Number.NaN;
}

/**
 * Converts a CropPoints object into a PointsArray.
 *
 * @param points - Object with `topLeftX`, `topLeftY`, `bottomRightX`, and `bottomRightY` coordinates
 * @returns A PointsArray in the order [topLeftX, topLeftY, bottomRightX, bottomRightY]
 */
export function pointsToArray(points: CropPoints): PointsArray {
	return [
		points.topLeftX,
		points.topLeftY,
		points.bottomRightX,
		points.bottomRightY,
	];
}

/**
 * Derive the transform that makes the viewport show the region described by
 * `points` within an image of the given size.
 *
 * The scale cover-fits the rect to the viewport (the larger of
 * `viewportWidth / rectWidth` and `viewportHeight / rectHeight`), so the
 * requested region always fills the viewport; the translation preserves the
 * rect's center at the applied scale. When `scaleBounds` is given, the
 * cover-fit scale is clamped to `[min, max]` BEFORE the translation is
 * derived. Aspect-matched points reproduce exactly through
 * {@link Croppie.get | Croppie#get} only while the resulting transform stays
 * within the configured zoom and position bounds; otherwise `bind()` clamps
 * and `get()` cannot reproduce the original points.
 *
 * @param points - Crop region, in the same frame as `imageWidth` x `imageHeight`; Croppie
 *   passes the displayed (rotated) frame, so a quarter turn swaps width and height
 * @param imageWidth - Width of the image in that frame
 * @param imageHeight - Height of the image in that frame
 * @param viewportWidth - Width of the crop viewport
 * @param viewportHeight - Height of the crop viewport
 * @param scaleBounds - Optional `[min, max]` the applied scale is clamped to
 *   before deriving the translation
 * @returns The transform to apply, or `undefined` when any coordinate is
 *   non-finite or the rect has a non-positive width or height.
 */
export function calculateTransformFromPoints(
	points: CropPoints,
	imageWidth: number,
	imageHeight: number,
	viewportWidth: number,
	viewportHeight: number,
	scaleBounds?: { min: number; max: number },
): Pick<TransformState, "x" | "y" | "scale"> | undefined {
	const { topLeftX, topLeftY, bottomRightX, bottomRightY } = points;
	if (
		![topLeftX, topLeftY, bottomRightX, bottomRightY].every(Number.isFinite)
	) {
		return undefined;
	}

	const pointWidth = bottomRightX - topLeftX;
	const pointHeight = bottomRightY - topLeftY;
	if (pointWidth <= 0 || pointHeight <= 0) {
		return undefined;
	}

	// Cover-fit: the larger ratio wins so the whole rect stays in view.
	// Clamp BEFORE deriving the translation so the center is preserved
	// at the scale actually applied
	const scale = Math.max(
		viewportWidth / pointWidth,
		viewportHeight / pointHeight,
	);
	const appliedScale = scaleBounds
		? clamp(scale, scaleBounds.min, scaleBounds.max)
		: scale;

	// Preserve the requested rect's center relative to the image center
	return {
		x: appliedScale * (imageWidth / 2 - (topLeftX + bottomRightX) / 2),
		y: appliedScale * (imageHeight / 2 - (topLeftY + bottomRightY) / 2),
		scale: appliedScale,
	};
}
