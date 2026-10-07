// Usage: OFFSCREEN_FIXTURES=/absolute/path/to/images bun experiments/offscreen-export/run.mjs
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { cpus, release, totalmem } from "node:os";
import { join, resolve } from "node:path";
import { chromium, firefox, webkit } from "@playwright/test";
import { build, root } from "./build.mjs";

const fixtures = resolve(process.env.OFFSCREEN_FIXTURES ||
  "/Users/matthewstingel/orca/workspaces/croppie/performance-and-size/.cache/performance/images");
const output = resolve(process.env.OFFSCREEN_OUTPUT || "experiments/offscreen-export/results");
const phase = process.env.OFFSCREEN_PHASE || "all";
const browsers = (process.env.OFFSCREEN_BROWSERS || "chromium,firefox,webkit").split(",");
const warmups = Number(process.env.OFFSCREEN_WARMUPS || 4);
const repeats = Number(process.env.OFFSCREEN_REPEATS || 10);
if (!["all", "correctness", "timing", "build"].includes(phase)) throw new Error(`Unknown phase ${phase}`);
if (!Number.isInteger(warmups) || warmups < 1 || !Number.isInteger(repeats) || repeats < 1) {
  throw new Error("Warmups and repeats must be positive integers");
}
await mkdir(output, { recursive: true });
const assets = join(output, "assets");
const manifest = await build(assets);
await writeFile(join(output, "build.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ build: manifest.sizes }));
if (phase === "build") process.exit(0);
const fixtureNames = ["photo-12mp.jpg", "photo-48mp.jpg", "transparent.png"];
const fixtureMetadata = await Promise.all(fixtureNames.map(async (name) => {
  const bytes = await readFile(join(fixtures, name));
  return { name, path: join(fixtures, name), bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex") };
}));
const staticPaths = new Map([
  ...["native.js", "loader.js", "worker.js", "harness.js"].map((name) => [`/${name}`, join(assets, name)]),
  ...fixtureNames.map((name) => [`/images/${name}`, join(fixtures, name)]),
]);
const server = Bun.serve({
  hostname: "127.0.0.1", port: 0,
  fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === "/") return new Response("<!doctype html><meta charset=utf-8><title>Offscreen export experiment</title>",
      { headers: { "Content-Type": "text/html", "Cache-Control": "no-store" } });
    const file = staticPaths.get(path);
    if (!file) return new Response("Not found", { status: 404 });
    return new Response(Bun.file(file), { headers: { "Cache-Control": "no-store" } });
  },
});
const summary = (samples) => {
  const keys = [...new Set(samples.flatMap(Object.keys))];
  return Object.fromEntries(keys.filter((key) => samples.some((sample) => typeof sample[key] === "number"))
    .map((key) => {
      const sorted = samples.map((sample) => sample[key]).filter((n) => typeof n === "number").sort((a, b) => a - b);
      const n = sorted.length;
      return [key, { n, median: n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2,
        p95: sorted[Math.ceil(n * .95) - 1], min: sorted[0], max: sorted[n - 1] }];
    }));
};
let failed = false;
try {
  for (const browserName of browsers) {
    if (!{ chromium, firefox, webkit }[browserName]) throw new Error(`Unknown browser ${browserName}`);
    const browser = await { chromium, firefox, webkit }[browserName].launch();
    const report = {
      startedAt: new Date().toISOString(), browser: browserName, browserVersion: browser.version(),
      browserExecutable: { chromium, firefox, webkit }[browserName].executablePath(),
      playwright: JSON.parse(await readFile(join(root, "node_modules/@playwright/test/package.json"))).version,
      host: { platform: process.platform, arch: process.arch, release: release(),
        cpu: cpus()[0].model, logicalCpus: cpus().length, totalMemory: totalmem() },
      command: { argv: process.argv, phase, browsers, warmups, repeats, fixtures, output },
      manifest, fixtureMetadata, blockedRequests: [], fixtures: [], correctness: [], timing: [], errors: [],
    };
    const persist = () => writeFile(join(output, `${browserName}.${phase}.json`), `${JSON.stringify(report, null, 2)}\n`);
    const context = await browser.newContext({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 1,
      serviceWorkers: "block" });
    await context.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.origin === server.url.origin || url.protocol === "blob:" || url.protocol === "data:") {
        await route.continue();
      } else {
        report.blockedRequests.push(url.href);
        await route.abort();
      }
    });
    try {
      const names = phase === "timing" ? fixtureNames.slice(0, 2) :
        [...fixtureNames, ...Array.from({ length: 8 }, (_, i) => `exif-${i + 1}`)];
      for (const name of names) {
        const page = await context.newPage();
        page.setDefaultTimeout(120000);
        await page.goto(server.url.href);
        await page.evaluate(async () => { window.experiment = await import("/harness.js"); });
        try {
          const fixture = await page.evaluate((name) => window.experiment.setup(name), name);
          report.fixtures.push(fixture);
          if (!fixture.support.supported) {
            failed = true;
            report.errors.push({ fixture: name, error: fixture.support.reason });
          }
          if (phase !== "timing" && fixture.support.supported) {
            const specs = await page.evaluate(() => window.experiment.cases());
            for (const spec of specs) {
              const result = await page.evaluate((spec) => window.experiment.verify(spec), spec);
              report.correctness.push(result);
              if (result.comparisons.some((comparison) => !comparison.equal)) failed = true;
            }
            const checks = report.correctness.filter((item) => item.name.startsWith(`${name}/`));
            console.log(`${browserName} ${name}: ${checks.length} cases, ${checks.flatMap((c) => c.comparisons).filter((c) => !c.equal).length} mismatches`);
          }
          if (phase !== "correctness" && name.startsWith("photo-")) {
            const idle = [];
            for (let i = 0; i < 3; i++) idle.push(await page.evaluate(() => window.experiment.idle()));
            fixture.idleSamples = idle;
            fixture.idleSummary = summary(idle);
            for (const size of [256, 2048]) {
              const variants = fixture.support.supported ?
                ["native", "image-cold", "image-reused", "blob-cold", "blob-reused"] : ["native"];
              const records = Object.fromEntries(variants.map((variant) => [variant,
                { fixture: name, size, variant, warmups: [], samples: [], errors: [] }]));
              for (let round = 0; round < warmups + repeats; round++) {
                // Forward/reverse AB.../...BA, with several warmups for every variant.
                const order = round % 2 ? [...variants].reverse() : variants;
                for (const variant of order) {
                  try {
                    const sample = await page.evaluate((args) => window.experiment.sample(args), { variant, size });
                    records[variant][round < warmups ? "warmups" : "samples"].push({ round, ...sample });
                  } catch (error) {
                    failed = true;
                    records[variant].errors.push({ round, error: String(error) });
                  }
                }
              }
              for (const record of Object.values(records)) {
                record.summary = summary(record.samples);
                report.timing.push(record);
              }
              console.log(`${browserName} ${name} ${size}: ${repeats} timed samples per variant`);
              await persist();
            }
          }
        } catch (error) {
          failed = true;
          report.errors.push({ fixture: name, error: String(error) });
        } finally {
          await page.evaluate(() => window.experiment.close()).catch(() => {});
          await page.close();
          await persist();
        }
      }
    } finally {
      report.finishedAt = new Date().toISOString();
      report.pixelEqualityPassed = report.correctness.length > 0 && report.correctness.every(
        (row) => row.comparisons.every((comparison) => comparison.equal));
      report.allChecksPassed = report.errors.length === 0 && report.blockedRequests.length === 0 &&
        (phase === "timing" || report.pixelEqualityPassed) && report.timing.every((row) => row.errors.length === 0);
      failed ||= !report.allChecksPassed;
      await persist();
      await browser.close();
    }
  }
} finally { server.stop(true); }
// A mismatch is a failed gate even though recording a negative experiment is useful.
process.exitCode = failed ? 1 : 0;
