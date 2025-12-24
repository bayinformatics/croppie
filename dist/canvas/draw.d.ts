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
export declare function drawCroppedImage(image: HTMLImageElement, points: CropPoints, outputWidth: number, outputHeight: number, options?: {
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
 * @param canvas - The HTMLCanvasElement to encode as a data URL.
 * @param format - Image format to encode (`"png"`, `"jpeg"`, etc.). Used to build the MIME type `image/{format}`.
 * @param quality - Image quality between 0 and 1 for formats that use it (e.g., `"jpeg"`). Ignored by formats that do not accept a quality parameter.
 * @returns A data URL (base64) containing the encoded image in the specified format.
 */
export declare function canvasToBase64(canvas: HTMLCanvasElement, format?: OutputFormat, quality?: number): string;
//# sourceMappingURL=draw.d.ts.map