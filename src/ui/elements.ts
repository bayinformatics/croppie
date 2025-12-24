import type { Boundary, Viewport, ViewportType } from "../types.ts";
import { createElement } from "../utils/dom.ts";

/**
 * Create the croppie container element.
 *
 * @param customClass - Optional additional class name to append to the container's class list
 * @returns The created div element with class "croppie-container" and the optional `customClass` appended
 */
export function createContainer(customClass?: string): HTMLDivElement {
	const container = createElement("div", {
		className: `croppie-container${customClass ? ` ${customClass}` : ""}`,
	});
	return container;
}

/**
 * Create the outer boundary element that constrains the crop area.
 *
 * @param boundary - Object describing the boundary's width and height in pixels
 * @returns The created div element used as the boundary container
 */
export function createBoundary(boundary: Boundary): HTMLDivElement {
	const element = createElement("div", {
		className: "cr-boundary",
		styles: {
			width: `${boundary.width}px`,
			height: `${boundary.height}px`,
			position: "relative",
			overflow: "hidden",
		},
	});
	return element;
}

/**
 * Create a positioned, sized DOM element that represents the crop viewport.
 *
 * @param viewport - Object describing the viewport's width, height, and type which determine the element's size and shape
 * @returns The configured `HTMLDivElement` to be used as the viewport element (includes class `cr-viewport cr-vp-{type}`)
 */
export function createViewport(viewport: Viewport): HTMLDivElement {
	const element = createElement("div", {
		className: `cr-viewport cr-vp-${viewport.type}`,
		styles: {
			width: `${viewport.width}px`,
			height: `${viewport.height}px`,
			position: "absolute",
			top: "50%",
			left: "50%",
			transform: "translate(-50%, -50%)",
			pointerEvents: "none",
			borderRadius: viewport.type === "circle" ? "50%" : "0",
		},
	});
	return element;
}

/**
 * Creates the overlay that darkens the area outside the viewport.
 *
 * @param boundary - The cropping boundary used to position and size the overlay mask
 * @param viewport - The viewport dimensions and type that define the transparent cutout
 * @returns The overlay div element with a semi-transparent black background and a mask that cuts out the viewport area
 */
export function createOverlay(
	boundary: Boundary,
	viewport: Viewport,
): HTMLDivElement {
	const element = createElement("div", {
		className: "cr-overlay",
		styles: {
			position: "absolute",
			top: "0",
			left: "0",
			width: "100%",
			height: "100%",
			pointerEvents: "none",
		},
	});

	// The overlay uses a CSS mask or clip-path to create the cutout
	const maskImage = createMaskImage(boundary, viewport);
	element.style.background = "rgba(0, 0, 0, 0.5)";
	element.style.maskImage = maskImage;
	element.style.webkitMaskImage = maskImage;

	return element;
}

/**
 * Generates a CSS `mask-image` string that creates a transparent cutout for the viewport centered in the boundary.
 *
 * @param boundary - Dimensions of the bounding container used to center the cutout.
 * @param viewport - Viewport dimensions and type ("circle" for circular cutouts, otherwise rectangular).
 * @returns A CSS `mask-image` value: a `radial-gradient` for circular viewports or two overlapping `linear-gradient`s for rectangular viewports that together produce a transparent hole where the viewport is located.
 */
function createMaskImage(boundary: Boundary, viewport: Viewport): string {
	const centerX = boundary.width / 2;
	const centerY = boundary.height / 2;

	if (viewport.type === "circle") {
		const radius = viewport.width / 2;
		// Create a radial gradient that's transparent in the center
		return `radial-gradient(circle ${radius}px at ${centerX}px ${centerY}px, transparent ${radius}px, black ${radius}px)`;
	}

	// For square, use a more complex gradient
	const left = centerX - viewport.width / 2;
	const right = centerX + viewport.width / 2;
	const top = centerY - viewport.height / 2;
	const bottom = centerY + viewport.height / 2;

	// This creates a rectangular hole using CSS gradients
	return `
    linear-gradient(to right, black ${left}px, transparent ${left}px, transparent ${right}px, black ${right}px),
    linear-gradient(to bottom, black ${top}px, transparent ${top}px, transparent ${bottom}px, black ${bottom}px)
  `;
}

/**
 * Create the image element used as the crop preview.
 *
 * The element is configured with alt text, non-draggable behavior, absolute positioning,
 * origin at the top-left, and no maximum width/height so it can be transformed freely.
 *
 * @returns The configured HTMLImageElement used to display the source image inside the cropper.
 */
export function createPreview(): HTMLImageElement {
	const element = createElement("img", {
		className: "cr-image",
		attributes: {
			alt: "Cropper image",
			draggable: "false",
		},
		styles: {
			position: "absolute",
			top: "0",
			left: "0",
			transformOrigin: "0 0",
			maxWidth: "none",
			maxHeight: "none",
		},
	});
	return element;
}

/**
 * Creates a range input element configured as the zoom slider.
 *
 * @param min - Minimum slider value
 * @param max - Maximum slider value
 * @param value - Initial slider value
 * @returns The configured HTMLInputElement with type `"range"` and `step` set to `0.01`
 */
export function createZoomSlider(
	min: number,
	max: number,
	value: number,
): HTMLInputElement {
	const element = createElement("input", {
		className: "cr-slider",
		attributes: {
			type: "range",
			min: String(min),
			max: String(max),
			step: "0.01",
			value: String(value),
		},
	});
	return element;
}

/**
 * Create the slider container element used to wrap the zoom slider.
 *
 * @returns The created div element with class "cr-slider-wrap".
 */
export function createSliderContainer(): HTMLDivElement {
	return createElement("div", {
		className: "cr-slider-wrap",
	});
}
