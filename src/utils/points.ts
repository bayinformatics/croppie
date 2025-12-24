import type { CropPoints, PointsArray } from "../types";

// Re-export for convenience
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
			topLeftX: points[0],
			topLeftY: points[1],
			bottomRightX: points[2],
			bottomRightY: points[3],
		};
	}

	return points;
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
