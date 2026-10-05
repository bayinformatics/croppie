/** Only the start of a JPEG holds its headers; never scan (or decode) more than this. */
const MAX_SCAN_BYTES = 256 * 1024;
/** Base64 characters that decode to MAX_SCAN_BYTES (a multiple of 4, so it decodes cleanly). */
const MAX_SCAN_BASE64_CHARS = Math.ceil(MAX_SCAN_BYTES / 3) * 4;

const EXIF_HEADER = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00]; // "Exif\0\0"
const ORIENTATION_TAG = 0x0112;

/**
 * Read the EXIF Orientation tag (1-8) from the start of a JPEG.
 *
 * A small, dependency-free parser: it walks the marker segments up to the first
 * start-of-scan, finds the APP1 segment that starts with `Exif\0\0`, and reads tag 0x0112 from
 * IFD0 of the embedded TIFF structure (either byte order). Every read is bounded by the
 * segment and by the first 256 KiB, so hostile input cannot make it read far or throw.
 *
 * Browsers already display JPEGs upright according to this tag; Croppie reports it but never
 * rotates by it. Use this on bytes you fetched yourself to learn the tag of a remote image.
 *
 * @param bytes - The beginning of the JPEG file (the whole file is fine)
 * @returns The orientation 1-8, or 1 when the input is not a JPEG, has no EXIF segment or
 *   Orientation entry, holds a value outside 1-8, or is truncated or malformed
 */
export function readJpegOrientation(bytes: Uint8Array): number {
	const length = Math.min(bytes.length, MAX_SCAN_BYTES);
	const view = new DataView(bytes.buffer, bytes.byteOffset, length);
	const byteAt = (offset: number) => view.getUint8(offset);

	try {
		if (length < 4 || byteAt(0) !== 0xff || byteAt(1) !== 0xd8) return 1;

		let offset = 2;
		while (offset + 4 <= length) {
			if (byteAt(offset) !== 0xff) return 1;
			const marker = byteAt(offset + 1);

			if (marker === 0xff) {
				offset += 1; // fill byte
			} else if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
				offset += 2; // standalone marker without a length
			} else if (marker === 0xda || marker === 0xd9) {
				return 1; // image data or end of image: no more headers
			} else {
				const segmentLength = view.getUint16(offset + 2);
				if (segmentLength < 2) return 1;
				const end = Math.min(offset + 2 + segmentLength, length);
				if (marker === 0xe1) {
					const orientation = readExifSegment(view, offset + 4, end);
					if (orientation !== undefined) return orientation;
				}
				offset += 2 + segmentLength;
			}
		}
	} catch {
		// Anything unexpected means "no usable tag"
	}

	return 1;
}

/** The orientation in an APP1 payload [start, end), or undefined if it is not an EXIF segment. */
function readExifSegment(
	view: DataView,
	start: number,
	end: number,
): number | undefined {
	if (start + EXIF_HEADER.length > end) return undefined;
	if (!EXIF_HEADER.every((byte, i) => view.getUint8(start + i) === byte)) {
		return undefined;
	}

	const tiff = start + EXIF_HEADER.length;
	if (tiff + 8 > end) return 1;

	const order = view.getUint16(tiff);
	if (order !== 0x4949 && order !== 0x4d4d) return 1;
	const little = order === 0x4949;
	if (view.getUint16(tiff + 2, little) !== 0x2a) return 1;

	const ifd = tiff + view.getUint32(tiff + 4, little);
	if (ifd + 2 > end) return 1;

	const entries = view.getUint16(ifd, little);
	for (let i = 0; i < entries; i++) {
		const entry = ifd + 2 + i * 12;
		if (entry + 12 > end) return 1;
		if (view.getUint16(entry, little) === ORIENTATION_TAG) {
			const value = view.getUint16(entry + 8, little);
			return value >= 1 && value <= 8 ? value : 1;
		}
	}

	return 1;
}

/**
 * Read the EXIF Orientation of a base64 JPEG data URL, decoding only its first 256 KiB.
 *
 * @param url - The URL to inspect
 * @returns The orientation 1-8 (1 when the data is not a JPEG or has no tag), or `undefined`
 *   for anything that is not a base64 `data:` URL or cannot be decoded
 */
export function readDataUrlOrientation(url: string): number | undefined {
	const comma = url.indexOf(",");
	if (!url.startsWith("data:") || comma === -1) return undefined;
	if (!url.slice(5, comma).split(";").includes("base64")) return undefined;

	try {
		const binary = atob(
			url.slice(comma + 1, comma + 1 + MAX_SCAN_BASE64_CHARS),
		);
		const bytes = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) {
			bytes[i] = binary.charCodeAt(i);
		}
		return readJpegOrientation(bytes);
	} catch {
		return undefined;
	}
}
