import type { CropPoints, OutputFormat, Rotation } from "../types.js";
import { clamp } from "../utils/clamp.js";
import { swapDims } from "../utils/rotation.js";

/** The largest canvas iOS Safari will draw into (4096 x 4096); a bigger one stays blank. */
const MAX_STEP_PIXELS = 16_777_216;

/** A source for drawImage and the rectangle of it to draw. */
interface SourceRect {
	source: CanvasImageSource;
	x: number;
	y: number;
	width: number;
	height: number;
}

/**
 * Shrink a source rectangle by repeated halving until one more halving would undershoot the
 * size it will finally be drawn at.
 *
 * A single drawImage that shrinks by much more than 2x samples too few source pixels in
 * WebKit (even at imageSmoothingQuality "high"), so a 48 MP photo cropped to an avatar came
 * out jagged and speckled. Each halving stays within the 2x that bilinear filtering handles
 * well. A step is never larger than MAX_STEP_PIXELS, so the first one may shrink by more.
 *
 * @param rect - The image and the rectangle of it to draw
 * @param targetWidth - The width the result will be drawn at
 * @param targetHeight - The height the result will be drawn at
 * @returns The rectangle to draw: `rect` itself when it shrinks by less than 2x, otherwise
 *   the whole of the last step canvas
 */
function downsample(
	rect: SourceRect,
	targetWidth: number,
	targetHeight: number,
): SourceRect {
	let current = rect;
	while (
		current.width / 2 >= targetWidth &&
		current.height / 2 >= targetHeight
	) {
		const scale = Math.min(
			0.5,
			Math.sqrt(MAX_STEP_PIXELS / (current.width * current.height)),
		);
		const step = document.createElement("canvas");
		step.width = Math.max(1, Math.round(current.width * scale));
		step.height = Math.max(1, Math.round(current.height * scale));

		const ctx = step.getContext("2d");
		// Without a context, draw what we have in one go rather than fail the crop
		if (!ctx) break;
		ctx.imageSmoothingEnabled = true;
		ctx.imageSmoothingQuality = "high";
		ctx.drawImage(
			current.source,
			current.x,
			current.y,
			current.width,
			current.height,
			0,
			0,
			step.width,
			step.height,
		);

		current = {
			source: step,
			x: 0,
			y: 0,
			width: step.width,
			height: step.height,
		};
	}
	return current;
}

/**
 * Create a new canvas showing the viewport `frame` of an image, scaled to given dimensions and optionally masked or filled.
 *
 * The frame is the unclamped viewport rectangle in source-image pixels, so it can extend
 * past the image when the user zoomed out (coverage not enforced). It is scaled by one factor
 * for both axes and centered in the output: the part that overlaps the image is drawn into the
 * proportional sub-rectangle, and the rest of the output stays transparent (or
 * `backgroundColor`). An output of another shape than the frame therefore gets empty bars
 * instead of a stretched image. An output with the frame's shape up to rounding to whole
 * pixels (the `'viewport'` and `'original'` result sizes) is filled exactly: a frame inside
 * the image maps onto the whole output, like drawing the crop rectangle directly, and the
 * rounding leaves no sub-pixel gap at the edges.
 *
 * ```
 * k = min(outW / frameW, outH / frameH)    (kx = outW / frameW, ky = outH / frameH when filled)
 * ox = (outW - frameW * k) / 2             (same for y)
 * sx0 = clamp(frame.topLeftX, 0, iw)     sx1 = clamp(frame.bottomRightX, 0, iw)   (same for y)
 * dx = ox + (sx0 - frame.topLeftX) * k   dw = (sx1 - sx0) * k                     (same for y)
 * ```
 *
 * With a `rotation` the frame is still given in the NATURAL image frame, while the output
 * canvas is in the displayed orientation: the image is drawn through a context rotated about
 * the output center into the box `[bw, bh] = swapDims(outW, outH, rotation)` (the output
 * turned back), which takes the place of `outW` and `outH` above, with the destination
 * offsets measured from `(-bw/2, -bh/2)`. The background and the circle mask are applied in
 * canvas coordinates, before the rotation, so they are not rotated.
 *
 * @param image - Source HTMLImageElement to draw from.
 * @param frame - Viewport rectangle in source-image pixels (the natural frame); may extend past the image.
 * @param outputWidth - Width of the resulting canvas in pixels.
 * @param outputHeight - Height of the resulting canvas in pixels.
 * @param options - Optional rendering options.
 * @param options.circle - If true, clip to the ellipse inscribed in the drawn frame (a circle for a square viewport); that is the output's inscribed ellipse when the output has the frame's shape.
 * @param options.backgroundColor - If provided, fill the canvas background with this CSS color before drawing the image.
 * @param options.rotation - Clockwise rotation the image is displayed with (default: 0).
 * @returns An HTMLCanvasElement containing the framed image scaled to `outputWidth` x `outputHeight`.
 * @throws If the 2D rendering context cannot be obtained from the created canvas.
 */
export function drawCroppedImage(
	image: HTMLImageElement,
	frame: CropPoints,
	outputWidth: number,
	outputHeight: number,
	options?: {
		circle?: boolean;
		backgroundColor?: string;
		rotation?: Rotation;
	},
): HTMLCanvasElement {
	const canvas = document.createElement("canvas");
	canvas.width = outputWidth;
	canvas.height = outputHeight;

	const ctx = canvas.getContext("2d");
	if (!ctx) {
		throw new Error("Failed to get 2D context");
	}

	// Downscaling a large photo to the viewport size looks much better with high quality
	ctx.imageSmoothingEnabled = true;
	ctx.imageSmoothingQuality = "high";

	// Fill background if specified
	if (options?.backgroundColor) {
		ctx.fillStyle = options.backgroundColor;
		ctx.fillRect(0, 0, outputWidth, outputHeight);
	}

	const frameWidth = frame.bottomRightX - frame.topLeftX;
	const frameHeight = frame.bottomRightY - frame.topLeftY;
	if (!(frameWidth > 0 && frameHeight > 0)) {
		return canvas;
	}

	// The destination box in the image's own orientation: the output itself, or the output
	// turned back by the rotation
	const rotation = options?.rotation ?? 0;
	const [boxWidth, boxHeight] = swapDims(outputWidth, outputHeight, rotation);

	// One scale keeps the image's proportions, with the frame centered in the box; a box that
	// is the frame's shape rounded to whole pixels is filled exactly instead
	const fill = isRoundedShape(boxWidth, boxHeight, frameWidth, frameHeight);
	const scale = Math.min(boxWidth / frameWidth, boxHeight / frameHeight);
	const scaleX = fill ? boxWidth / frameWidth : scale;
	const scaleY = fill ? boxHeight / frameHeight : scale;
	const offsetX = (boxWidth - frameWidth * scaleX) / 2;
	const offsetY = (boxHeight - frameHeight * scaleY) / 2;

	// Apply elliptical mask if needed: the ellipse inscribed in the scaled frame, in canvas
	// coordinates (a circle when the frame is square)
	if (options?.circle) {
		const [maskWidth, maskHeight] = swapDims(
			frameWidth * scaleX,
			frameHeight * scaleY,
			rotation,
		);
		ctx.beginPath();
		ctx.ellipse(
			outputWidth / 2,
			outputHeight / 2,
			maskWidth / 2,
			maskHeight / 2,
			0,
			0,
			Math.PI * 2,
		);
		ctx.closePath();
		ctx.clip();
	}

	// Intersect the frame with the image and map the overlap into the box
	const sourceLeft = clamp(frame.topLeftX, 0, image.naturalWidth);
	const sourceRight = clamp(frame.bottomRightX, 0, image.naturalWidth);
	const sourceTop = clamp(frame.topLeftY, 0, image.naturalHeight);
	const sourceBottom = clamp(frame.bottomRightY, 0, image.naturalHeight);

	const sourceWidth = sourceRight - sourceLeft;
	const sourceHeight = sourceBottom - sourceTop;

	// A frame that misses the image entirely leaves only the background
	if (!(sourceWidth > 0 && sourceHeight > 0)) {
		return canvas;
	}

	const destinationLeft = offsetX + (sourceLeft - frame.topLeftX) * scaleX;
	const destinationTop = offsetY + (sourceTop - frame.topLeftY) * scaleY;
	const destinationWidth = sourceWidth * scaleX;
	const destinationHeight = sourceHeight * scaleY;

	// The box is in the image's own orientation, so the steps are the same for any rotation
	const { source, x, y, width, height } = downsample(
		{
			source: image,
			x: sourceLeft,
			y: sourceTop,
			width: sourceWidth,
			height: sourceHeight,
		},
		destinationWidth,
		destinationHeight,
	);

	if (rotation === 0) {
		ctx.drawImage(
			source,
			x,
			y,
			width,
			height,
			destinationLeft,
			destinationTop,
			destinationWidth,
			destinationHeight,
		);
	} else {
		ctx.save();
		ctx.translate(outputWidth / 2, outputHeight / 2);
		ctx.rotate((rotation * Math.PI) / 180);
		ctx.drawImage(
			source,
			x,
			y,
			width,
			height,
			destinationLeft - boxWidth / 2,
			destinationTop - boxHeight / 2,
			destinationWidth,
			destinationHeight,
		);
		ctx.restore();
	}

	return canvas;
}

/**
 * Whether a `width` x `height` box is the frame's shape rounded to whole pixels: some scale
 * of the frame lies within half a pixel of the box on both axes.
 */
function isRoundedShape(
	width: number,
	height: number,
	frameWidth: number,
	frameHeight: number,
): boolean {
	return (
		Math.max((width - 0.5) / frameWidth, (height - 0.5) / frameHeight) <=
		Math.min((width + 0.5) / frameWidth, (height + 0.5) / frameHeight)
	);
}

/**
 * Creates a Blob containing the canvas image encoded in the specified format.
 *
 * @param canvas - The source canvas to encode
 * @param format - Output image format (e.g., `"png"`, `"jpeg"`); defaults to `"png"`
 * @param quality - Quality value between 0 and 1 used by encoders that support it; defaults to `0.92`
 * @returns A Blob containing the encoded image with MIME type `image/{format}`
 */
export function canvasToBlob(
	canvas: HTMLCanvasElement,
	format: OutputFormat = "png",
	quality = 0.92,
): Promise<Blob> {
	return new Promise((resolve, reject) => {
		const mimeType = `image/${format}`;

		canvas.toBlob(
			(blob) => {
				if (blob) {
					resolve(blob);
				} else {
					reject(new Error("Failed to create blob from canvas"));
				}
			},
			mimeType,
			quality,
		);
	});
}

/**
 * Create a base64-encoded data URL representing the canvas image.
 *
 * @param format - Image format to encode (`"png"`, `"jpeg"`, etc.). Used to build the MIME type `image/{format}`.
 * @param quality - Image quality between 0 and 1 for formats that use it (e.g., `"jpeg"`). Ignored by formats that do not accept a quality parameter.
 * @returns A data URL (base64) containing the encoded image in the specified format.
 */
export function canvasToBase64(
	canvas: HTMLCanvasElement,
	format: OutputFormat = "png",
	quality = 0.92,
): string {
	const mimeType = `image/${format}`;
	return canvas.toDataURL(mimeType, quality);
}
