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
export declare function calculateBounds(imageWidth: number, imageHeight: number, scale: number, viewportWidth: number, viewportHeight: number): TransformBounds;
//# sourceMappingURL=bounds.d.ts.map