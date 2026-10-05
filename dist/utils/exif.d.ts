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
export declare function readJpegOrientation(bytes: Uint8Array): number;
/**
 * Read the EXIF Orientation of a JPEG File or Blob, reading only its first 256 KiB.
 *
 * @param blob - The file to inspect
 * @returns The orientation 1-8 (1 when the file is not a JPEG or has no tag)
 */
export declare function readBlobOrientation(blob: Blob): Promise<number>;
/**
 * Read the EXIF Orientation of a base64 JPEG data URL, decoding only its first 256 KiB.
 *
 * @param url - The URL to inspect
 * @returns The orientation 1-8 (1 when the data is not a JPEG or has no tag), or `undefined`
 *   for anything that is not a base64 `data:` URL or cannot be decoded
 */
export declare function readDataUrlOrientation(url: string): number | undefined;
