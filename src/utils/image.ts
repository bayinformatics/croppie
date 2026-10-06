const MAX_DESCRIBED_URL_LENGTH = 120;

/**
 * Describe a URL for an error message without dumping it whole.
 *
 * A data URL can be megabytes of base64 (a photo the caller read with a `FileReader`), so it
 * is summarized as `data:<mime>;…(<n> chars)`; any other URL is cut to 120 characters plus an
 * ellipsis.
 *
 * @param url - The URL to describe
 * @returns A short, human-readable description of the URL
 */
export function describeUrl(url: string): string {
	if (url.startsWith("data:")) {
		const mime = /^data:([^;,]*)/.exec(url)?.[1] ?? "";
		return `data:${mime};…(${url.length} chars)`;
	}

	return url.length > MAX_DESCRIBED_URL_LENGTH
		? `${url.slice(0, MAX_DESCRIBED_URL_LENGTH)}…`
		: url;
}

/**
 * Creates an HTMLImageElement for the given URL and loads its image data.
 *
 * If `url` does not start with `"data:"`, the image's `crossOrigin` is set to `"anonymous"`. The returned operation rejects with an `Error` if the image fails to load; its message describes the URL with `describeUrl`, so a data URL is never embedded whole.
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
		img.onerror = () =>
			reject(new Error(`Failed to load image: ${describeUrl(url)}`));

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

/**
 * Compute the scale factor that fits a whole image inside a viewport.
 *
 * @param imageWidth - Image width in pixels
 * @param imageHeight - Image height in pixels
 * @param viewportWidth - Viewport width in pixels
 * @param viewportHeight - Viewport height in pixels
 * @returns The scale factor at which the entire image is visible inside the viewport (the smaller of the two ratios, so never above `calculateInitialZoom`)
 */
export function calculateContainZoom(
	imageWidth: number,
	imageHeight: number,
	viewportWidth: number,
	viewportHeight: number,
): number {
	return Math.min(viewportWidth / imageWidth, viewportHeight / imageHeight);
}
