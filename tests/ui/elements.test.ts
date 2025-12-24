import { describe, expect, it } from "bun:test";
import {
	createContainer,
	createBoundary,
	createViewport,
	createOverlay,
	createPreview,
	createZoomSlider,
	createSliderContainer,
} from "../../src/ui/elements.ts";

describe("UI Elements", () => {
	describe("createContainer", () => {
		it("creates a div element", () => {
			const container = createContainer();
			expect(container.tagName).toBe("DIV");
		});

		it("has croppie-container class", () => {
			const container = createContainer();
			expect(container.classList.contains("croppie-container")).toBe(true);
		});

		it("appends custom class when provided", () => {
			const container = createContainer("my-custom-class");

			expect(container.classList.contains("croppie-container")).toBe(true);
			expect(container.classList.contains("my-custom-class")).toBe(true);
		});

		it("handles multiple custom classes", () => {
			const container = createContainer("class-one class-two");

			expect(container.className).toBe("croppie-container class-one class-two");
		});

		it("works with empty string custom class", () => {
			const container = createContainer("");

			expect(container.className).toBe("croppie-container");
		});

		it("works with undefined custom class", () => {
			const container = createContainer(undefined);

			expect(container.className).toBe("croppie-container");
		});
	});

	describe("createBoundary", () => {
		it("creates a div element", () => {
			const boundary = createBoundary({ width: 300, height: 200 });
			expect(boundary.tagName).toBe("DIV");
		});

		it("has cr-boundary class", () => {
			const boundary = createBoundary({ width: 300, height: 200 });
			expect(boundary.classList.contains("cr-boundary")).toBe(true);
		});

		it("sets width and height from boundary config", () => {
			const boundary = createBoundary({ width: 400, height: 300 });

			expect(boundary.style.width).toBe("400px");
			expect(boundary.style.height).toBe("300px");
		});

		it("sets position to relative", () => {
			const boundary = createBoundary({ width: 300, height: 200 });
			expect(boundary.style.position).toBe("relative");
		});

		it("sets overflow to hidden", () => {
			const boundary = createBoundary({ width: 300, height: 200 });
			expect(boundary.style.overflow).toBe("hidden");
		});

		it("handles different dimensions", () => {
			const square = createBoundary({ width: 200, height: 200 });
			const wide = createBoundary({ width: 500, height: 250 });
			const tall = createBoundary({ width: 150, height: 400 });

			expect(square.style.width).toBe("200px");
			expect(square.style.height).toBe("200px");
			expect(wide.style.width).toBe("500px");
			expect(wide.style.height).toBe("250px");
			expect(tall.style.width).toBe("150px");
			expect(tall.style.height).toBe("400px");
		});
	});

	describe("createViewport", () => {
		it("creates a div element", () => {
			const viewport = createViewport({
				width: 200,
				height: 200,
				type: "square",
			});
			expect(viewport.tagName).toBe("DIV");
		});

		it("has cr-viewport class", () => {
			const viewport = createViewport({
				width: 200,
				height: 200,
				type: "square",
			});
			expect(viewport.classList.contains("cr-viewport")).toBe(true);
		});

		it("adds viewport type class for square", () => {
			const viewport = createViewport({
				width: 200,
				height: 200,
				type: "square",
			});
			expect(viewport.classList.contains("cr-vp-square")).toBe(true);
		});

		it("adds viewport type class for circle", () => {
			const viewport = createViewport({
				width: 200,
				height: 200,
				type: "circle",
			});
			expect(viewport.classList.contains("cr-vp-circle")).toBe(true);
		});

		it("sets width and height from viewport config", () => {
			const viewport = createViewport({
				width: 150,
				height: 100,
				type: "square",
			});

			expect(viewport.style.width).toBe("150px");
			expect(viewport.style.height).toBe("100px");
		});

		it("centers viewport with transform", () => {
			const viewport = createViewport({
				width: 200,
				height: 200,
				type: "square",
			});

			expect(viewport.style.position).toBe("absolute");
			expect(viewport.style.top).toBe("50%");
			expect(viewport.style.left).toBe("50%");
			expect(viewport.style.transform).toBe("translate(-50%, -50%)");
		});

		it("disables pointer events", () => {
			const viewport = createViewport({
				width: 200,
				height: 200,
				type: "square",
			});

			expect(viewport.style.pointerEvents).toBe("none");
		});

		it("sets border-radius to 50% for circle", () => {
			const viewport = createViewport({
				width: 200,
				height: 200,
				type: "circle",
			});

			expect(viewport.style.borderRadius).toBe("50%");
		});

		it("sets border-radius to 0 for square", () => {
			const viewport = createViewport({
				width: 200,
				height: 200,
				type: "square",
			});

			expect(viewport.style.borderRadius).toBe("0px");
		});
	});

	describe("createOverlay", () => {
		const boundary = { width: 400, height: 300 };
		const viewport = { width: 200, height: 200, type: "square" as const };

		it("creates a div element", () => {
			const overlay = createOverlay(boundary, viewport);
			expect(overlay.tagName).toBe("DIV");
		});

		it("has cr-overlay class", () => {
			const overlay = createOverlay(boundary, viewport);
			expect(overlay.classList.contains("cr-overlay")).toBe(true);
		});

		it("positions absolutely at top-left", () => {
			const overlay = createOverlay(boundary, viewport);

			expect(overlay.style.position).toBe("absolute");
			expect(overlay.style.top).toBe("0px");
			expect(overlay.style.left).toBe("0px");
		});

		it("fills 100% width and height", () => {
			const overlay = createOverlay(boundary, viewport);

			expect(overlay.style.width).toBe("100%");
			expect(overlay.style.height).toBe("100%");
		});

		it("disables pointer events", () => {
			const overlay = createOverlay(boundary, viewport);

			expect(overlay.style.pointerEvents).toBe("none");
		});

		it("sets semi-transparent background", () => {
			const overlay = createOverlay(boundary, viewport);

			expect(overlay.style.background).toBe("rgba(0, 0, 0, 0.5)");
		});

		it("sets mask image for square viewport", () => {
			const overlay = createOverlay(boundary, viewport);

			// Mask image should be set (implementation detail, just check it exists)
			expect(overlay.style.maskImage).toBeTruthy();
		});

		it("sets mask image for circle viewport", () => {
			const circleViewport = { width: 200, height: 200, type: "circle" as const };
			const overlay = createOverlay(boundary, circleViewport);

			expect(overlay.style.maskImage).toBeTruthy();
			expect(overlay.style.maskImage).toContain("radial-gradient");
		});

		it("sets webkit mask image for compatibility", () => {
			const overlay = createOverlay(boundary, viewport);

			expect(overlay.style.webkitMaskImage).toBeTruthy();
		});
	});

	describe("createPreview", () => {
		it("creates an img element", () => {
			const preview = createPreview();
			expect(preview.tagName).toBe("IMG");
		});

		it("has cr-image class", () => {
			const preview = createPreview();
			expect(preview.classList.contains("cr-image")).toBe(true);
		});

		it("sets alt text", () => {
			const preview = createPreview();
			expect(preview.alt).toBe("Cropper image");
		});

		it("is not draggable", () => {
			const preview = createPreview();
			// Check the attribute is set - happy-dom may not reflect as boolean
			expect(preview.getAttribute("draggable")).toBe("false");
		});

		it("positions absolutely at top-left", () => {
			const preview = createPreview();

			expect(preview.style.position).toBe("absolute");
			expect(preview.style.top).toBe("0px");
			expect(preview.style.left).toBe("0px");
		});

		it("sets transform origin to top-left", () => {
			const preview = createPreview();
			// happy-dom may return "0 0" instead of "0px 0px"
			expect(["0 0", "0px 0px"]).toContain(preview.style.transformOrigin);
		});

		it("removes max-width and max-height constraints", () => {
			const preview = createPreview();

			expect(preview.style.maxWidth).toBe("none");
			expect(preview.style.maxHeight).toBe("none");
		});
	});

	describe("createZoomSlider", () => {
		it("creates an input element", () => {
			const slider = createZoomSlider(0.5, 2, 1);
			expect(slider.tagName).toBe("INPUT");
		});

		it("has type range", () => {
			const slider = createZoomSlider(0.5, 2, 1);
			expect(slider.type).toBe("range");
		});

		it("has cr-slider class", () => {
			const slider = createZoomSlider(0.5, 2, 1);
			expect(slider.classList.contains("cr-slider")).toBe(true);
		});

		it("sets min attribute", () => {
			const slider = createZoomSlider(0.25, 2, 1);
			expect(slider.min).toBe("0.25");
		});

		it("sets max attribute", () => {
			const slider = createZoomSlider(0.5, 3, 1);
			expect(slider.max).toBe("3");
		});

		it("sets value attribute", () => {
			const slider = createZoomSlider(0.5, 2, 1.5);
			expect(slider.value).toBe("1.5");
		});

		it("sets step to 0.01", () => {
			const slider = createZoomSlider(0.5, 2, 1);
			expect(slider.step).toBe("0.01");
		});

		it("handles integer values", () => {
			const slider = createZoomSlider(1, 5, 3);

			expect(slider.min).toBe("1");
			expect(slider.max).toBe("5");
			expect(slider.value).toBe("3");
		});

		it("handles decimal values", () => {
			const slider = createZoomSlider(0.123, 4.567, 2.345);

			expect(slider.min).toBe("0.123");
			expect(slider.max).toBe("4.567");
			expect(slider.value).toBe("2.345");
		});
	});

	describe("createSliderContainer", () => {
		it("creates a div element", () => {
			const container = createSliderContainer();
			expect(container.tagName).toBe("DIV");
		});

		it("has cr-slider-wrap class", () => {
			const container = createSliderContainer();
			expect(container.classList.contains("cr-slider-wrap")).toBe(true);
		});

		it("can contain a slider", () => {
			const container = createSliderContainer();
			const slider = createZoomSlider(0.5, 2, 1);
			container.appendChild(slider);

			expect(container.contains(slider)).toBe(true);
		});
	});

	describe("Element Integration", () => {
		it("can build a complete croppie DOM structure", () => {
			const container = createContainer();
			const boundary = createBoundary({ width: 400, height: 300 });
			const viewport = createViewport({
				width: 200,
				height: 200,
				type: "circle",
			});
			const overlay = createOverlay(
				{ width: 400, height: 300 },
				{ width: 200, height: 200, type: "circle" },
			);
			const preview = createPreview();
			const sliderContainer = createSliderContainer();
			const slider = createZoomSlider(0.5, 2, 1);

			// Build structure
			boundary.appendChild(preview);
			boundary.appendChild(overlay);
			boundary.appendChild(viewport);
			sliderContainer.appendChild(slider);
			container.appendChild(boundary);
			container.appendChild(sliderContainer);

			// Verify structure
			expect(container.querySelector(".cr-boundary")).toBe(boundary);
			expect(container.querySelector(".cr-image")).toBe(preview);
			expect(container.querySelector(".cr-overlay")).toBe(overlay);
			expect(container.querySelector(".cr-viewport")).toBe(viewport);
			expect(container.querySelector(".cr-slider-wrap")).toBe(sliderContainer);
			expect(container.querySelector(".cr-slider")).toBe(slider);
		});
	});
});
