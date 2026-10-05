import type { CropPoints, Rotation } from "../types.js";

/**
 * Quarter-turn rotation maths.
 *
 * Frames: **N** is the natural image (`W = naturalWidth`, `H = naturalHeight`, origin at the
 * top-left). **D** is the displayed image: N rotated clockwise by `r`, with dimensions
 * `(Dw, Dh) = swapDims(W, H, r)`, i.e. `(H, W)` for 90 and 270 and `(W, H)` otherwise.
 * Clockwise rotation in y-down coordinates is
 *
 * ```
 * R(90)(x, y)  = (-y,  x)
 * R(180)(x, y) = (-x, -y)
 * R(270)(x, y) = ( y, -x)
 * ```
 *
 * Point maps (`q` in D from `p` in N, and back):
 *
 * | r   | N -> D              | D -> N              |
 * |-----|---------------------|---------------------|
 * | 90  | `(H - py, px)`      | `(qy, H - qx)`      |
 * | 180 | `(W - px, H - py)`  | `(W - qx, H - qy)`  |
 * | 270 | `(py, W - px)`      | `(W - qy, qx)`      |
 *
 * Axis-aligned rectangles stay axis-aligned, so the rect maps below are exact (for integer
 * dimensions and in floating point alike) and `inverse(forward(rect)) === rect`:
 *
 * - `naturalRectToRotated`: 90 -> `{tlX: H-brY, tlY: tlX, brX: H-tlY, brY: brX}`;
 *   180 -> `{W-brX, H-brY, W-tlX, H-tlY}`; 270 -> `{tlX: tlY, tlY: W-brX, brX: brY, brY: W-tlX}`
 * - `rotatedRectToNatural`: 90 -> `{tlX: tlY, tlY: H-brX, brX: brY, brY: H-tlX}`;
 *   180 -> same as forward; 270 -> `{tlX: W-brY, tlY: tlX, brX: W-tlY, brY: brX}`
 *
 * Screen transform (see `Croppie.updateTransform`), with `(x, y)` the offset of the displayed
 * image centre from the boundary centre and `B` the boundary:
 * `(tx, ty) = (B.w/2 + x, B.h/2 + y) - s * R(r)(W/2, H/2)`.
 *
 * `rotate(d)`: `r' = (r + d) mod 360` and `(x', y') = R(d)(x, y)`. The natural pixel under the
 * viewport centre, `P = C - R(-r)(x, y) / s` (with `C` the natural image centre), is invariant,
 * because `R(-r - d) * R(d) = R(-r)`.
 *
 * @module
 */

/**
 * Normalise any multiple of 90 degrees (positive or negative) to 0, 90, 180 or 270.
 *
 * @param degrees - Rotation in degrees, clockwise
 * @returns The equivalent rotation in [0, 360)
 * @throws RangeError if `degrees` is not a finite multiple of 90
 */
export function normalizeRotation(degrees: number): Rotation {
	if (!Number.isFinite(degrees) || degrees % 90 !== 0) {
		throw new RangeError(
			`[@bayinformatics/croppie] rotation must be a multiple of 90 degrees (got ${String(degrees)})`,
		);
	}

	// `+ 0` turns -0 into 0
	return ((((degrees % 360) + 360) % 360) + 0) as Rotation;
}

/**
 * The dimensions of a `width` x `height` image after rotating it by `rotation`.
 *
 * @returns `[width, height]` for 0 and 180, `[height, width]` for 90 and 270
 */
export function swapDims(
	width: number,
	height: number,
	rotation: Rotation,
): [number, number] {
	return rotation === 90 || rotation === 270
		? [height, width]
		: [width, height];
}

/**
 * Rotate an offset clockwise by `degrees` (y-down screen coordinates): `R(d)(x, y)`.
 *
 * @param degrees - A normalised rotation
 */
export function rotateOffset(
	x: number,
	y: number,
	degrees: Rotation,
): [number, number] {
	// `0 - v` rather than `-v`: negating a zero would give -0, which leaks into CSS strings
	switch (degrees) {
		case 90:
			return [0 - y, x];
		case 180:
			return [0 - x, 0 - y];
		case 270:
			return [y, 0 - x];
		default:
			return [x, y];
	}
}

/**
 * Map a rectangle in the natural image (`width` x `height`) to the image rotated clockwise
 * by `rotation`.
 */
export function naturalRectToRotated(
	rect: CropPoints,
	width: number,
	height: number,
	rotation: Rotation,
): CropPoints {
	const { topLeftX, topLeftY, bottomRightX, bottomRightY } = rect;

	switch (rotation) {
		case 90:
			return {
				topLeftX: height - bottomRightY,
				topLeftY: topLeftX,
				bottomRightX: height - topLeftY,
				bottomRightY: bottomRightX,
			};
		case 180:
			return {
				topLeftX: width - bottomRightX,
				topLeftY: height - bottomRightY,
				bottomRightX: width - topLeftX,
				bottomRightY: height - topLeftY,
			};
		case 270:
			return {
				topLeftX: topLeftY,
				topLeftY: width - bottomRightX,
				bottomRightX: bottomRightY,
				bottomRightY: width - topLeftX,
			};
		default:
			return { ...rect };
	}
}

/**
 * Map a rectangle in the rotated (displayed) image back to the natural image
 * (`width` x `height`): the inverse of `naturalRectToRotated`.
 */
export function rotatedRectToNatural(
	rect: CropPoints,
	width: number,
	height: number,
	rotation: Rotation,
): CropPoints {
	const { topLeftX, topLeftY, bottomRightX, bottomRightY } = rect;

	switch (rotation) {
		case 90:
			return {
				topLeftX: topLeftY,
				topLeftY: height - bottomRightX,
				bottomRightX: bottomRightY,
				bottomRightY: height - topLeftX,
			};
		case 180:
			return {
				topLeftX: width - bottomRightX,
				topLeftY: height - bottomRightY,
				bottomRightX: width - topLeftX,
				bottomRightY: height - topLeftY,
			};
		case 270:
			return {
				topLeftX: width - bottomRightY,
				topLeftY: topLeftX,
				bottomRightX: width - topLeftY,
				bottomRightY: bottomRightX,
			};
		default:
			return { ...rect };
	}
}

/**
 * Convert an EXIF Orientation tag (1-8) to the clockwise rotation that displays the image
 * upright: 1 -> 0, 3 -> 180, 6 -> 90, 8 -> 270.
 *
 * @returns The rotation, or `undefined` for mirrored orientations (2, 4, 5, 7) and values
 *   outside 1-8, which cannot be expressed as a rotation
 */
export function exifOrientationToRotation(
	orientation: number,
): Rotation | undefined {
	switch (orientation) {
		case 1:
			return 0;
		case 3:
			return 180;
		case 6:
			return 90;
		case 8:
			return 270;
		default:
			return undefined;
	}
}
