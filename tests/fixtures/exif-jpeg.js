/**
 * Builders for tiny JPEG headers that carry an EXIF Orientation tag. No binary fixtures:
 * the bytes are assembled here. Plain ESM with no imports, so it is shared by the bun tests
 * and by the browser test page (served from /tests/fixtures/exif-jpeg.js).
 */

const SOI = [0xff, 0xd8];
const SOS = [0xff, 0xda];

function concat(parts) {
	const total = parts.reduce((sum, part) => sum + part.length, 0);
	const result = new Uint8Array(total);
	let offset = 0;
	for (const part of parts) {
		result.set(part, offset);
		offset += part.length;
	}
	return result;
}

/**
 * An APP1 (EXIF) segment of 36 bytes with a single IFD0 entry: tag 0x0112 (Orientation),
 * type SHORT, count 1. Layout: marker (2) | length (2) | "Exif\0\0" (6) | TIFF header (8) |
 * entry count (2) | entry (12) | next IFD offset (4).
 *
 * @param {number} orientation - The value stored in the tag (use 1-8, or 0/9 for invalid)
 * @param {{ littleEndian?: boolean }} [options] - Byte order of the TIFF structure ("II" vs "MM")
 */
export function buildExifApp1(orientation, { littleEndian = false } = {}) {
	const bytes = new Uint8Array(36);
	const view = new DataView(bytes.buffer);
	const le = littleEndian;

	view.setUint16(0, 0xffe1); // APP1 marker
	view.setUint16(2, 34); // segment length: everything after the marker
	bytes.set([0x45, 0x78, 0x69, 0x66, 0x00, 0x00], 4); // "Exif\0\0"

	// TIFF header at offset 10
	bytes[10] = bytes[11] = le ? 0x49 : 0x4d; // "II" or "MM"
	view.setUint16(12, 0x002a, le);
	view.setUint32(14, 8, le); // IFD0 starts 8 bytes after the TIFF header

	// IFD0 at offset 18
	view.setUint16(18, 1, le); // one entry
	view.setUint16(20, 0x0112, le); // Orientation
	view.setUint16(22, 3, le); // SHORT
	view.setUint32(24, 1, le); // count
	view.setUint16(28, orientation, le); // value, in the first two bytes of the value field
	// bytes 32-35: offset of the next IFD, 0

	return bytes;
}

/** A JFIF APP0 segment (18 bytes), which real JPEGs put before the EXIF segment. */
export function buildJfifApp0() {
	return Uint8Array.of(
		0xff,
		0xe0,
		0x00,
		0x10,
		0x4a,
		0x46,
		0x49,
		0x46,
		0x00, // "JFIF\0"
		0x01,
		0x01, // version 1.1
		0x00, // no density units
		0x00,
		0x01,
		0x00,
		0x01, // 1x1 density
		0x00,
		0x00, // no thumbnail
	);
}

/** An APP1 segment that holds XMP, not EXIF: it must be skipped, not mistaken for EXIF. */
export function buildXmpApp1() {
	const namespace = "http://ns.adobe.com/xap/1.0/\0";
	const payload = new TextEncoder().encode(`${namespace}<x:xmpmeta/>`);
	const bytes = new Uint8Array(4 + payload.length);
	new DataView(bytes.buffer).setUint16(0, 0xffe1);
	new DataView(bytes.buffer).setUint16(2, payload.length + 2);
	bytes.set(payload, 4);
	return bytes;
}

/**
 * SOI, an optional JFIF APP0, the EXIF APP1 and a start-of-scan marker: enough of a JPEG for
 * a header parser, not a decodable image.
 *
 * @param {number} orientation
 * @param {{ jfifFirst?: boolean, littleEndian?: boolean }} [options]
 */
export function buildJpegHeader(
	orientation,
	{ jfifFirst = false, littleEndian = false } = {},
) {
	return concat([
		SOI,
		jfifFirst ? buildJfifApp0() : [],
		buildExifApp1(orientation, { littleEndian }),
		SOS,
	]);
}

/**
 * Insert an EXIF APP1 segment right after the SOI of a real JPEG, e.g. one encoded by a
 * canvas, so the file carries an Orientation tag.
 *
 * @param {Uint8Array} jpegBytes
 * @param {number} orientation
 * @param {{ littleEndian?: boolean }} [options]
 */
export function injectExifOrientation(jpegBytes, orientation, options = {}) {
	if (jpegBytes[0] !== 0xff || jpegBytes[1] !== 0xd8) {
		throw new Error("Not a JPEG: missing the FF D8 start-of-image marker");
	}
	return concat([
		jpegBytes.subarray(0, 2),
		buildExifApp1(orientation, options),
		jpegBytes.subarray(2),
	]);
}
