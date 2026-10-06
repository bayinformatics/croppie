import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

const css = readFileSync(
	new URL("../../src/croppie.css", import.meta.url),
	"utf8",
);

/** The declaration block of the first rule whose selector is exactly `selector`. */
function rule(selector: string): string | undefined {
	const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`).exec(css)?.[1];
}

describe("croppie.css slider focus styles", () => {
	it("shows an outline for keyboard focus (all browsers)", () => {
		const block = rule(".croppie-container .cr-slider:focus-visible");

		expect(block).toBeDefined();
		expect(block).toContain("outline: 2px solid var(--croppie-slider-start)");
		expect(block).toContain("outline-offset: 3px");
	});

	it("does not remove the outline for every focus (only the keyboard ring may show)", () => {
		expect(rule(".croppie-container .cr-slider:focus")).toBeUndefined();
	});

	it("highlights the thumb on keyboard focus in WebKit and Firefox", () => {
		for (const thumb of ["-webkit-slider-thumb", "-moz-range-thumb"]) {
			const block = rule(
				`.croppie-container .cr-slider:focus-visible::${thumb}`,
			);

			expect(block).toBeDefined();
			expect(block).toContain("var(--croppie-slider-shadow-focus)");
		}
	});
});
