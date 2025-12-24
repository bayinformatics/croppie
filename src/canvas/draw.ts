import type { CropPoints, OutputFormat } from "../types.ts";

/**
 * Create a new canvas containing the specified rectangular region of an image, scaled to given dimensions and optionally masked or filled.
 *
 * @param image - Source HTMLImageElement to draw from.
 * @param points - Crop rectangle in source-image pixels; must provide `topLeftX`, `topLeftY`, `bottomRightX`, and `bottomRightY`.
 * @param outputWidth - Width of the resulting canvas in pixels.
 * @param outputHeight - Height of the resulting canvas in pixels.
 * @param options - Optional rendering options.
 * @param options.circle - If true, apply a circular clipping mask centered in the output canvas.
 * @param options.backgroundColor - If provided, fill the canvas background with this CSS color before drawing the image.
 * @returns An HTMLCanvasElement containing the cropped (and optionally masked) image scaled to `outputWidth` x `outputHeight`.
 * @throws If the 2D rendering context cannot be obtained from the created canvas.
 */
export function drawCroppedImage(
	image: HTMLImageElement,
	points: CropPoints,
	outputWidth: number,
	outputHeight: number,
	options?: {
		circle?: boolean;
		backgroundColor?: string;
	},
): HTMLCanvasElement {
	const canvas = document.createElement("canvas");
	canvas.width = outputWidth;
	canvas.height = outputHeight;

	const ctx = canvas.getContext("2d");
	if (!ctx) {
		throw new Error("Failed to get 2D context");
	}

	// Fill background if specified
	if (options?.backgroundColor) {
		ctx.fillStyle = options.backgroundColor;
		ctx.fillRect(0, 0, outputWidth, outputHeight);
	}

	// Apply circular mask if needed
	if (options?.circle) {
		ctx.beginPath();
		ctx.arc(outputWidth / 2, outputHeight / 2, outputWidth / 2, 0, Math.PI * 2);
		ctx.closePath();
		ctx.clip();
	}

	// Calculate source dimensions from points
	const sourceWidth = points.bottomRightX - points.topLeftX;
	const sourceHeight = points.bottomRightY - points.topLeftY;

	// Draw the cropped region
	ctx.drawImage(
		image,
		points.topLeftX,
		points.topLeftY,
		sourceWidth,
		sourceHeight,
		0,
		0,
		outputWidth,
		outputHeight,
	);

	return canvas;
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
 * @param canvas - The HTMLCanvasElement to encode as a data URL.
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
