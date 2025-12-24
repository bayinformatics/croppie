/**
 * Creates an HTMLImageElement for the given URL and loads its image data.
 *
 * If `url` does not start with `"data:"`, the image's `crossOrigin` is set to `"anonymous"`. The returned operation rejects with an `Error` if the image fails to load.
 *
 * @param url - The image URL or data URL to load.
 * @returns The loaded `HTMLImageElement`.
 */
export function loadImage(url: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const img = new Image();

		// Only set crossOrigin for actual URLs, not data URLs
		if (!url.startsWith("data:")) {
			img.crossOrigin = "anonymous";
		}

		img.onload = () => resolve(img);
		img.onerror = () => reject(new Error(`Failed to load image: ${url}`));

		img.src = url;
	});
}

/**
 * Convert a File or Blob into a data URL string.
 *
 * @returns The file contents encoded as a data URL string.
 * @throws If reading the file fails.
 * @throws If the FileReader produces a non-string result.
 */
export function fileToDataUrl(file: File | Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();

		reader.onload = () => {
			if (typeof reader.result === "string") {
				resolve(reader.result);
			} else {
				reject(new Error("Failed to read file as data URL"));
			}
		};

		reader.onerror = () => reject(new Error("Failed to read file"));

		reader.readAsDataURL(file);
	});
}

/**
 * Returns the natural width and height of the provided image element.
 *
 * @returns An object with `width` set to the image's naturalWidth and `height` set to the image's naturalHeight
 */
export function getImageDimensions(img: HTMLImageElement): {
	width: number;
	height: number;
} {
	return {
		width: img.naturalWidth,
		height: img.naturalHeight,
	};
}

/**
 * Compute the aspect ratio of dimensions as width divided by height.
 *
 * @returns The aspect ratio (`width / height`).
 */
export function aspectRatio(width: number, height: number): number {
	return width / height;
}

/**
 * Compute the scale factor that fills a viewport with an image.
 *
 * @param imageWidth - Image width in pixels
 * @param imageHeight - Image height in pixels
 * @param viewportWidth - Viewport width in pixels
 * @param viewportHeight - Viewport height in pixels
 * @returns The scale factor to apply to the image so it fills the viewport; values > 1 enlarge the image, values < 1 shrink it
 */
export function calculateInitialZoom(
	imageWidth: number,
	imageHeight: number,
	viewportWidth: number,
	viewportHeight: number,
): number {
	const widthRatio = viewportWidth / imageWidth;
	const heightRatio = viewportHeight / imageHeight;

	// Use the larger ratio to ensure viewport is filled
	return Math.max(widthRatio, heightRatio);
}
