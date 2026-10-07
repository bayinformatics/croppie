// Isolate pixel changes caused by scratch-canvas lifetime. No production imports.
import { writeFileSync } from "node:fs";
import { chromium, firefox, webkit } from "@playwright/test";

const name = process.env.PROFILE_BROWSER || "webkit";
const browser = await { chromium, firefox, webkit }[name].launch();
try {
	const page = await browser.newPage();
	const rows = await page.evaluate(async () => {
		const rows = [];
		for (const size of [8, 16, 64, 256, 2048]) {
			const original = document.createElement("canvas");
			original.width = original.height = size;
			const pixels = original.getContext("2d").createImageData(size, size);
			for (let i = 0; i < pixels.data.length; i += 4) {
				const x = (i / 4) % size;
				const y = Math.floor(i / 4 / size);
				pixels.data.set(
					[
						(x * 31 + y * 17) % 256,
						(x ^ y) % 256,
						((x >> 2) ^ (y * 7)) % 256,
						(x + y) % 7 ? 255 : 127,
					],
					i,
				);
			}
			original.getContext("2d").putImageData(pixels, 0, 0);
			const image = new Image();
			image.src = original.toDataURL();
			await image.decode();
			original.width = original.height = 0;
			function render(mode) {
				const output = document.createElement("canvas");
				output.width = output.height = size / 8;
				const context = output.getContext("2d");
				context.imageSmoothingEnabled = true;
				context.imageSmoothingQuality = "high";
				const scratch = [];
				let current = image;
				let width = size;
				while (width / 2 >= output.width) {
					const step = document.createElement("canvas");
					step.width = step.height = width / 2;
					const ctx = step.getContext("2d");
					ctx.imageSmoothingEnabled = true;
					ctx.imageSmoothingQuality = "high";
					ctx.drawImage(
						current,
						0,
						0,
						width,
						width,
						0,
						0,
						step.width,
						step.height,
					);
					if (mode === "early" && current !== image)
						current.width = current.height = 0;
					scratch.push(step);
					current = step;
					width = step.width;
				}
				context.drawImage(
					current,
					0,
					0,
					width,
					width,
					0,
					0,
					output.width,
					output.height,
				);
				if (mode === "early" || mode === "last-only")
					current.width = current.height = 0;
				if (mode === "after-final")
					for (const canvas of scratch) canvas.width = canvas.height = 0;
				const result = context.getImageData(
					0,
					0,
					output.width,
					output.height,
				).data;
				for (const canvas of [...scratch, output])
					canvas.width = canvas.height = 0;
				return result;
			}
			const reference = render("retain");
			for (const mode of ["retain", "early", "last-only", "after-final"]) {
				const result = render(mode);
				let differentChannels = 0;
				let maxDifference = 0;
				let totalDifference = 0;
				for (let i = 0; i < result.length; i++) {
					const difference = Math.abs(result[i] - reference[i]);
					if (difference) differentChannels++;
					maxDifference = Math.max(maxDifference, difference);
					totalDifference += difference;
				}
				rows.push({
					size,
					target: size / 8,
					mode,
					differentChannels,
					maxDifference,
					meanAbsoluteDifference: totalDifference / result.length,
				});
			}
		}
		return rows;
	});
	const report = { browser: name, version: browser.version(), rows };
	console.log(JSON.stringify(report, null, 2));
	if (process.argv[2])
		writeFileSync(process.argv[2], `${JSON.stringify(report, null, 2)}\n`);
} finally {
	await browser.close();
}
