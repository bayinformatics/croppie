/**
 * @bayinformatics/croppie
 *
 * A modern, TypeScript-first image cropper.
 * Fork of Foliotek/Croppie with ES modules, TypeScript, and modern APIs.
 *
 * @packageDocumentation
 */

// Default export for convenience
export { Croppie, Croppie as default } from "./Croppie.js";
export type {
	BindOptions,
	Boundary,
	CropPoints,
	CroppieData,
	CroppieEventHandler,
	CroppieEvents,
	CroppieOptions,
	OutputFormat,
	OutputType,
	ResultOptions,
	Rotation,
	Viewport,
	ViewportType,
	ZoomConfig,
} from "./types.js";
export { readJpegOrientation } from "./utils/exif.js";
