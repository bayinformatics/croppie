import type { CropPoints, PointsArray, TransformState } from "../types.js";
export type { PointsArray };
/**
 * Input type that accepts either format
 */
export type PointsInput = CropPoints | PointsArray;
/**
 * Normalize a points input into a CropPoints object.
 *
 * Coordinates given as strings are parsed with `parseFloat`, as Croppie v2's `bind()` did:
 * v2's `get()` returned its points as strings (e.g. `["50", "50", "150", "150"]`), which
 * apps stored and pass back. A string that is not a number becomes `NaN`, which
 * `calculateTransformFromPoints` rejects.
 *
 * @param points - An array [topLeftX, topLeftY, bottomRightX, bottomRightY], a CropPoints object, or `undefined`.
 * @returns A new CropPoints object corresponding to `points`, or `undefined` if `points` is `undefined`.
 * @throws Error if `points` is an array whose length is not exactly 4.
 */
export declare function normalizePoints(points: PointsInput | undefined): CropPoints | undefined;
/**
 * Converts a CropPoints object into a PointsArray.
 *
 * @param points - Object with `topLeftX`, `topLeftY`, `bottomRightX`, and `bottomRightY` coordinates
 * @returns A PointsArray in the order [topLeftX, topLeftY, bottomRightX, bottomRightY]
 */
export declare function pointsToArray(points: CropPoints): PointsArray;
/**
 * Derive the transform that makes the viewport show the region described by
 * `points` within an image of the given natural size.
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
 * @param points - Crop region in natural image coordinates
 * @param imageWidth - Natural width of the image
 * @param imageHeight - Natural height of the image
 * @param viewportWidth - Width of the crop viewport
 * @param viewportHeight - Height of the crop viewport
 * @param scaleBounds - Optional `[min, max]` the applied scale is clamped to
 *   before deriving the translation
 * @returns The transform to apply, or `undefined` when any coordinate is
 *   non-finite or the rect has a non-positive width or height.
 */
export declare function calculateTransformFromPoints(points: CropPoints, imageWidth: number, imageHeight: number, viewportWidth: number, viewportHeight: number, scaleBounds?: {
    min: number;
    max: number;
}): Pick<TransformState, "x" | "y" | "scale"> | undefined;
