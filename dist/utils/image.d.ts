/**
 * Describe a URL for an error message without dumping it whole.
 *
 * A data URL can be megabytes of base64 (a photo from `bindFile()`), so it is summarized as
 * `data:<mime>;…(<n> chars)`; any other URL is cut to 120 characters plus an ellipsis.
 *
 * @param url - The URL to describe
 * @returns A short, human-readable description of the URL
 */
export declare function describeUrl(url: string): string;
/**
 * Creates an HTMLImageElement for the given URL and loads its image data.
 *
 * If `url` does not start with `"data:"`, the image's `crossOrigin` is set to `"anonymous"`. The returned operation rejects with an `Error` if the image fails to load; its message describes the URL with `describeUrl`, so a data URL is never embedded whole.
 *
 * @param url - The image URL or data URL to load.
 * @returns The loaded `HTMLImageElement`.
 */
export declare function loadImage(url: string): Promise<HTMLImageElement>;
/**
 * Convert a File or Blob into a data URL string.
 *
 * @returns The file contents encoded as a data URL string.
 * @throws If reading the file fails.
 * @throws If the FileReader produces a non-string result.
 */
export declare function fileToDataUrl(file: File | Blob): Promise<string>;
/**
 * Returns the natural width and height of the provided image element.
 *
 * @returns An object with `width` set to the image's naturalWidth and `height` set to the image's naturalHeight
 */
export declare function getImageDimensions(img: HTMLImageElement): {
    width: number;
    height: number;
};
/**
 * Compute the aspect ratio of dimensions as width divided by height.
 *
 * @returns The aspect ratio (`width / height`).
 */
export declare function aspectRatio(width: number, height: number): number;
/**
 * Compute the scale factor that fills a viewport with an image.
 *
 * @param imageWidth - Image width in pixels
 * @param imageHeight - Image height in pixels
 * @param viewportWidth - Viewport width in pixels
 * @param viewportHeight - Viewport height in pixels
 * @returns The scale factor to apply to the image so it fills the viewport; values > 1 enlarge the image, values < 1 shrink it
 */
export declare function calculateInitialZoom(imageWidth: number, imageHeight: number, viewportWidth: number, viewportHeight: number): number;
/**
 * Compute the scale factor that fits a whole image inside a viewport.
 *
 * @param imageWidth - Image width in pixels
 * @param imageHeight - Image height in pixels
 * @param viewportWidth - Viewport width in pixels
 * @param viewportHeight - Viewport height in pixels
 * @returns The scale factor at which the entire image is visible inside the viewport (the smaller of the two ratios, so never above `calculateInitialZoom`)
 */
export declare function calculateContainZoom(imageWidth: number, imageHeight: number, viewportWidth: number, viewportHeight: number): number;
