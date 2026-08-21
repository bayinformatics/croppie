import type { CropPoints, PointsArray, TransformState } from "../types";
export type { PointsArray };
/**
 * Input type that accepts either format
 */
export type PointsInput = CropPoints | PointsArray;
/**
 * Normalize a points input into a CropPoints object.
 *
 * @param points - An array [topLeftX, topLeftY, bottomRightX, bottomRightY], a CropPoints object, or `undefined`.
 * @returns A CropPoints object corresponding to `points`, or `undefined` if `points` is `undefined`.
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
 * rect's center. Aspect-matched points reproduce exactly through
 * {@link Croppie.get | Croppie#get}.
 *
 * @param points - Crop region in natural image coordinates
 * @param imageWidth - Natural width of the image
 * @param imageHeight - Natural height of the image
 * @param viewportWidth - Width of the crop viewport
 * @param viewportHeight - Height of the crop viewport
 * @returns The transform to apply, or `undefined` when any coordinate is
 *   non-finite or the rect has a non-positive width or height.
 */
export declare function calculateTransformFromPoints(points: CropPoints, imageWidth: number, imageHeight: number, viewportWidth: number, viewportHeight: number): TransformState | undefined;
//# sourceMappingURL=points.d.ts.map