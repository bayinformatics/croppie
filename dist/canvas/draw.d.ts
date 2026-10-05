import type { CropPoints, OutputFormat, Rotation } from "../types.js";
/**
 * Create a new canvas showing the viewport `frame` of an image, scaled to given dimensions and optionally masked or filled.
 *
 * The frame is the unclamped viewport rectangle in source-image pixels, so it can extend
 * past the image when the user zoomed out (coverage not enforced). The part of the frame
 * that overlaps the image is drawn into the proportional sub-rectangle of the output; the
 * rest stays transparent (or `backgroundColor`). A frame inside the image maps onto the
 * whole output, exactly like drawing the crop rectangle directly, and nothing is ever
 * stretched to fill the empty space.
 *
 * ```
 * kx = outW / frameW                     ky = outH / frameH
 * sx0 = clamp(frame.topLeftX, 0, iw)     sx1 = clamp(frame.bottomRightX, 0, iw)   (same for y)
 * dx = (sx0 - frame.topLeftX) * kx       dw = (sx1 - sx0) * kx                    (same for y)
 * ```
 *
 * With a `rotation` the frame is still given in the NATURAL image frame, while the output
 * canvas is in the displayed orientation: the image is drawn through a context rotated about
 * the output centre into a destination box of `swapDims(outW, outH, rotation)` (the output
 * turned back), so `[dw, dh] = swapDims(...)`, `kx = dw / frameW`, `ky = dh / frameH` and the
 * destination offsets are measured from `(-dw/2, -dh/2)`. The background and the circle mask
 * are applied first, in canvas coordinates, so they are not rotated.
 *
 * @param image - Source HTMLImageElement to draw from.
 * @param frame - Viewport rectangle in source-image pixels (the natural frame); may extend past the image.
 * @param outputWidth - Width of the resulting canvas in pixels.
 * @param outputHeight - Height of the resulting canvas in pixels.
 * @param options - Optional rendering options.
 * @param options.circle - If true, clip to the ellipse inscribed in the output (a circle for a square output).
 * @param options.backgroundColor - If provided, fill the canvas background with this CSS color before drawing the image.
 * @param options.rotation - Clockwise rotation the image is displayed with (default: 0).
 * @returns An HTMLCanvasElement containing the framed image scaled to `outputWidth` x `outputHeight`.
 * @throws If the 2D rendering context cannot be obtained from the created canvas.
 */
export declare function drawCroppedImage(image: HTMLImageElement, frame: CropPoints, outputWidth: number, outputHeight: number, options?: {
    circle?: boolean;
    backgroundColor?: string;
    rotation?: Rotation;
}): HTMLCanvasElement;
/**
 * Creates a Blob containing the canvas image encoded in the specified format.
 *
 * @param canvas - The source canvas to encode
 * @param format - Output image format (e.g., `"png"`, `"jpeg"`); defaults to `"png"`
 * @param quality - Quality value between 0 and 1 used by encoders that support it; defaults to `0.92`
 * @returns A Blob containing the encoded image with MIME type `image/{format}`
 */
export declare function canvasToBlob(canvas: HTMLCanvasElement, format?: OutputFormat, quality?: number): Promise<Blob>;
/**
 * Create a base64-encoded data URL representing the canvas image.
 *
 * @param format - Image format to encode (`"png"`, `"jpeg"`, etc.). Used to build the MIME type `image/{format}`.
 * @param quality - Image quality between 0 and 1 for formats that use it (e.g., `"jpeg"`). Ignored by formats that do not accept a quality parameter.
 * @returns A data URL (base64) containing the encoded image in the specified format.
 */
export declare function canvasToBase64(canvas: HTMLCanvasElement, format?: OutputFormat, quality?: number): string;
