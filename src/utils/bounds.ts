/**
 * Bounds for valid transform x/y values
 */
export interface TransformBounds {
	minX: number;
	maxX: number;
	minY: number;
	maxY: number;
}

/**
 * Calculate the valid bounds for transform x/y to keep the image covering the viewport.
 *
 * @param imageWidth - Natural width of the image
 * @param imageHeight - Natural height of the image
 * @param scale - Current zoom scale
 * @param viewportWidth - Width of the viewport
 * @param viewportHeight - Height of the viewport
 * @returns Bounds object with minX, maxX, minY, maxY
 */
export function calculateBounds(
	imageWidth: number,
	imageHeight: number,
	scale: number,
	viewportWidth: number,
	viewportHeight: number,
): TransformBounds {
	const scaledWidth = imageWidth * scale;
	const scaledHeight = imageHeight * scale;

	// Calculate how far the image can move while still covering viewport
	// If image is smaller than viewport, bounds collapse to 0 (centered)
	const maxX = Math.max(0, (scaledWidth - viewportWidth) / 2);
	const maxY = Math.max(0, (scaledHeight - viewportHeight) / 2);

	return {
		minX: maxX === 0 ? 0 : -maxX,
		maxX,
		minY: maxY === 0 ? 0 : -maxY,
		maxY,
	};
}
