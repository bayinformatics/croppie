import type { CropPoints, PointsArray } from "../types";
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
//# sourceMappingURL=points.d.ts.map