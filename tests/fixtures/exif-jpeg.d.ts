export interface ExifBuildOptions {
	/** Byte order of the TIFF structure: "II" (little endian) instead of "MM" (default). */
	littleEndian?: boolean;
}

export function buildExifApp1(
	orientation: number,
	options?: ExifBuildOptions,
): Uint8Array<ArrayBuffer>;

export function buildJfifApp0(): Uint8Array<ArrayBuffer>;

export function buildXmpApp1(): Uint8Array<ArrayBuffer>;

export function buildJpegHeader(
	orientation: number,
	options?: ExifBuildOptions & { jfifFirst?: boolean },
): Uint8Array<ArrayBuffer>;

export function injectExifOrientation(
	jpegBytes: Uint8Array,
	orientation: number,
	options?: ExifBuildOptions,
): Uint8Array<ArrayBuffer>;
