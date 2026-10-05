import type { CropPoints, OutputFormat } from "../types.js";
/**
 * Create a new canvas showing the viewport `frame` of an image, scaled to given dimensions and optionally masked or filled.
 *
 * The frame is the unclamped viewport rectangle in source-image pixels, so it can extend
 * past the image when the user zoomed out (coverage not enforced). It is scaled by one factor
 * for both axes and centred in the output: the part that overlaps the image is drawn into the
 * proportional sub-rectangle, and the rest of the output stays transparent (or
 * `backgroundColor`). An output of another shape than the frame therefore gets empty bars
 * instead of a stretched image. An output with the frame's shape up to rounding to whole
 * pixels (the `'viewport'` and `'original'` result sizes) is filled exactly: a frame inside
 * the image maps onto the whole output, like drawing the crop rectangle directly, and the
 * rounding leaves no sub-pixel gap at the edges. The image is drawn with its edges on whole
 * pixels, so a letterboxed image has no blurred half-pixel seam next to the bars.
 *
 * ```
 * k = min(outW / frameW, outH / frameH)    (kx = outW / frameW, ky = outH / frameH when filled)
 * ox = (outW - frameW * k) / 2             (same for y)
 * sx0 = clamp(frame.topLeftX, 0, iw)     sx1 = clamp(frame.bottomRightX, 0, iw)   (intersectFrame)
 * dx0 = round(ox + (sx0 - frame.topLeftX) * k)   dx1 = round(ox + (sx1 - frame.topLeftX) * k)
 * dw = dx1 - dx0                                                                  (same for y)
 * ```
 *
 * @param image - Source HTMLImageElement to draw from.
 * @param frame - Viewport rectangle in source-image pixels; may extend past the image.
 * @param outputWidth - Width of the resulting canvas in pixels.
 * @param outputHeight - Height of the resulting canvas in pixels.
 * @param options - Optional rendering options.
 * @param options.circle - If true, clip to the ellipse inscribed in the drawn frame (a circle for a square viewport); that is the output's inscribed ellipse when the output has the frame's shape.
 * @param options.backgroundColor - If provided, fill the canvas background with this CSS color before drawing the image.
 * @returns An HTMLCanvasElement containing the framed image scaled to `outputWidth` x `outputHeight`.
 * @throws If the 2D rendering context cannot be obtained from the created canvas.
 */
export declare function drawCroppedImage(image: HTMLImageElement, frame: CropPoints, outputWidth: number, outputHeight: number, options?: {
    circle?: boolean;
    backgroundColor?: string;
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
