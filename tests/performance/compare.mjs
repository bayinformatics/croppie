import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, firefox, webkit } from "@playwright/test";
import { measure, verify } from "./scenarios.mjs";

// Example: node tests/performance/compare.mjs baseline=.cache/performance/baseline candidate=dist
// Env: BROWSERS=chromium,firefox,webkit BATCHES=3 RUNS=20 WARMUPS=5 VERIFY_ONLY=1
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const variants = Object.fromEntries(
	process.argv.slice(2).map((argument) => {
		const separator = argument.indexOf("=");
		assert(separator > 0, "Expected label=artifact-directory");
		const name = argument.slice(0, separator);
		assert(/^[a-z][a-z0-9-]*$/.test(name), "Use simple variant labels");
		return [name, resolve(argument.slice(separator + 1))];
	}),
);
assert(
	Object.keys(variants).length > 0,
	"Specify at least one build to measure",
);
const engines = { chromium, firefox, webkit };
const settings = {
	browsers: (process.env.BROWSERS || "chromium,firefox,webkit").split(","),
	batches: Number(process.env.BATCHES || 3),
	runs: Number(process.env.RUNS || 20),
	warmups: Number(process.env.WARMUPS || 5),
	verifyOnly: process.env.VERIFY_ONLY === "1",
};
for (const key of ["batches", "runs", "warmups"]) {
	assert(
		Number.isInteger(settings[key]) &&
			settings[key] >= (key === "warmups" ? 0 : 1),
		`Invalid ${key}`,
	);
}
const files = new Map([
	["/exif-jpeg.js", resolve(root, "tests/fixtures/exif-jpeg.js")],
	...["photo-12mp.jpg", "photo-48mp.jpg", "transparent.png"].map((name) => [
		`/images/${name}`,
		resolve(root, ".cache/performance/images", name),
	]),
]);
for (const [variant, directory] of Object.entries(variants)) {
	for (const name of ["croppie.js", "croppie.css"])
		files.set(`/build/${variant}/${name}`, resolve(directory, name));
}
const artifacts = {};
for (const [url, path] of files) {
	const bytes = await readFile(path);
	artifacts[url] = {
		path,
		sha256: createHash("sha256").update(bytes).digest("hex"),
		bytes: bytes.length,
	};
}
const server = createServer(async (request, response) => {
	const url = new URL(request.url, "http://localhost");
	if (url.pathname === "/") {
		const variant = url.searchParams.get("variant");
		if (!Object.hasOwn(variants, variant)) {
			response.writeHead(404).end();
			return;
		}
		response.setHeader("Content-Type", "text/html");
		response.end(
			`<!doctype html><html lang="en"><head><meta charset="utf-8"><link rel="stylesheet" href="/build/${variant}/croppie.css"><style>body{margin:20px}</style></head><body></body></html>`,
		);
		return;
	}
	const path = files.get(url.pathname);
	if (!path) {
		response.writeHead(404).end();
		return;
	}
	try {
		response.setHeader(
			"Content-Type",
			path.endsWith(".js")
				? "text/javascript"
				: path.endsWith(".css")
					? "text/css"
					: path.endsWith(".png")
						? "image/png"
						: "image/jpeg",
		);
		response.end(await readFile(path));
	} catch (error) {
		response.writeHead(500).end(String(error));
	}
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const origin = `http://127.0.0.1:${server.address().port}`;
const percentile = (values, fraction) =>
	[...values].sort((a, b) => a - b)[
		Math.min(values.length - 1, Math.ceil(values.length * fraction) - 1)
	];
const summarize = (samples) =>
	Object.fromEntries(
		[
			"bindMs",
			"readyMs",
			"gestureMs",
			"avatarMs",
			"largeMs",
			"avatarTimerDelayMs",
			"largeTimerDelayMs",
			"frameMs",
		].map((key) => {
			const values =
				key === "frameMs"
					? samples.flatMap((sample) => sample.intervals)
					: samples.map((sample) => sample[key]);
			return [
				key,
				{ median: percentile(values, 0.5), p95: percentile(values, 0.95) },
			];
		}),
	);
const report = {
	at: new Date().toISOString(),
	node: process.version,
	settings,
	artifacts,
	browsers: {},
};
const output = resolve(
	process.env.OUTPUT || ".cache/performance/comparison.json",
);
await mkdir(dirname(output), { recursive: true });
try {
	for (const name of settings.browsers) {
		assert(engines[name], `Unknown browser ${name}`);
		const browser = await engines[name].launch({ headless: true });
		try {
			const result = {
				version: browser.version(),
				correctness: {},
				measurements: [],
			};
			report.browsers[name] = result;
			let reference;
			for (const variant of Object.keys(variants)) {
				const page = await browser.newPage({
					viewport: { width: 800, height: 600 },
				});
				await page.goto(`${origin}/?variant=${variant}`);
				const verified = await page.evaluate(verify, { variant });
				assert.equal(verified.remainingCroppers, 0);
				if (reference)
					assert.deepEqual(
						verified.outputHashes,
						reference,
						`${name}/${variant}: output pixels differ`,
					);
				reference = verified.outputHashes;
				result.correctness[variant] = verified;
				await page.close();
				console.log(
					`${name}/${variant}: EXIF, lifecycle, round-trip and output checks passed`,
				);
			}
			if (!settings.verifyOnly) {
				for (let batch = 0; batch < settings.batches; batch++) {
					const order = Object.keys(variants);
					if (batch % 2) order.reverse();
					for (const image of [
						"photo-12mp.jpg",
						"photo-48mp.jpg",
						"transparent.png",
					]) {
						for (const variant of order) {
							const page = await browser.newPage({
								viewport: { width: 800, height: 600 },
							});
							await page.goto(`${origin}/?variant=${variant}`);
							const measured = await page.evaluate(measure, {
								variant,
								image,
								warmups: settings.warmups,
								runs: settings.runs,
							});
							result.measurements.push({
								batch,
								variant,
								image,
								...measured,
								summary: summarize(measured.samples),
							});
							await page.close();
							await writeFile(output, JSON.stringify(report, null, 2));
							console.log(
								`${name}/${variant}/${image}: batch ${batch + 1}/${settings.batches} measured`,
							);
						}
					}
				}
			}
		} finally {
			await browser.close();
		}
	}
} finally {
	await writeFile(output, JSON.stringify(report, null, 2));
	await new Promise((done) => server.close(done));
}
console.log(`Saved ${output}`);
