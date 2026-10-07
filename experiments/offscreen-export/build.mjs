// Run with pinned Bun. All outputs stay outside the production build directory.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const experiment = join(root, "experiments/offscreen-export");
const drawPath = join(root, "src/canvas/draw.ts");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

export async function build(outdir) {
  await mkdir(outdir, { recursive: true });
  const source = await readFile(drawPath, "utf8");
  let adapted = source;
  const substitutions = [
    ['document.createElement("canvas")', "new OffscreenCanvas(1, 1)", 2],
    ["image: HTMLImageElement,", "image: ImageBitmap,", 1],
    ["): HTMLCanvasElement {", "): OffscreenCanvas {", 1],
    ["image.naturalWidth", "image.width", 1],
    ["image.naturalHeight", "image.height", 1],
  ];
  for (const [before, after, count] of substitutions) {
    if (adapted.split(before).length - 1 !== count) {
      throw new Error(`Production draw.ts changed: expected ${count} occurrences of ${before}`);
    }
    adapted = adapted.replaceAll(before, after);
  }
  const workerPlugin = {
    name: "experiment-offscreen-draw",
    setup(builder) {
      builder.onLoad({ filter: /[/\\]src[/\\]canvas[/\\]draw\.ts$/ }, () => ({
        contents: adapted, loader: "ts", resolveDir: dirname(drawPath),
      }));
    },
  };
  const entries = [
    ["native.js", drawPath, []],
    ["loader.js", join(experiment, "loader.mjs"), []],
    ["worker.js", join(experiment, "worker.ts"), [workerPlugin]],
    ["harness.js", join(experiment, "harness.mjs"), []],
  ];
  for (const [name, path, plugins] of entries) {
    const result = await Bun.build({
      entrypoints: [path], target: "browser", minify: true, plugins,
      external: ["/native.js", "/loader.js"],
    });
    if (!result.success || result.outputs.length !== 1) throw new Error(String(result.logs));
    await writeFile(join(outdir, name), new Uint8Array(await result.outputs[0].arrayBuffer()));
  }
  // Match the production command, including its sourceMappingURL comment.
  execFileSync(process.execPath, ["build", "src/index.ts", `--outdir=${outdir}`,
    "--entry-naming=croppie.[ext]", "--minify", "--sourcemap"], { cwd: root, stdio: "pipe" });
  await writeFile(join(outdir, "croppie.css"), await readFile(join(root, "src/croppie.css")));
  await writeFile(join(outdir, "adapted-draw.ts"), adapted);
  const assets = ["native.js", "loader.js", "worker.js", "harness.js", "croppie.js", "croppie.css"];
  // Use Node's zlib, as in the parent measurement (Bun's compressor differs).
  const sizes = JSON.parse(execFileSync("node", ["--input-type=module", "-e", `
    import { readFileSync } from 'node:fs';
    import { gzipSync } from 'node:zlib';
    import { createHash } from 'node:crypto';
    const files = process.argv.slice(1).map(path => {
      const b = readFileSync(path);
      return {name: path.split('/').at(-1), raw: b.length,
        gzip9: gzipSync(b, {level: 9}).length,
        sha256: createHash('sha256').update(b).digest('hex')};
    });
    console.log(JSON.stringify({node: process.version, files}));
  `, ...assets.map((name) => join(outdir, name))], { encoding: "utf8" }));
  const total = (names) => sizes.files.filter((f) => names.includes(f.name)).reduce(
    (sum, f) => ({ raw: sum.raw + f.raw, gzip9: sum.gzip9 + f.gzip9 }), { raw: 0, gzip9: 0 });
  const manifest = {
    head: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
    bun: Bun.version,
    substitutions, drawSourceSha256: sha256(source), adaptedDrawSha256: sha256(adapted),
    sources: Object.fromEntries(await Promise.all([
      "src/canvas/draw.ts", "src/utils/limits.ts", "src/utils/points.ts", "src/utils/rotation.ts",
      "experiments/offscreen-export/build.mjs", "experiments/offscreen-export/loader.mjs",
      "experiments/offscreen-export/worker.ts", "experiments/offscreen-export/harness.mjs",
      "experiments/offscreen-export/run.mjs",
    ].map(async (path) => [path, sha256(await readFile(join(root, path)))]))),
    sizes: { ...sizes,
      isolatedNative: total(["native.js"]),
      isolatedWorkerIncludingLoader: total(["loader.js", "worker.js"]),
      fullNative: total(["croppie.js", "croppie.css"]),
      fullNativePlusWorker: total(["croppie.js", "croppie.css", "loader.js", "worker.js"]),
      wholeBenchmarkRuntime: total(["native.js", "loader.js", "worker.js", "harness.js"]),
    },
  };
  await writeFile(join(outdir, "build.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}
