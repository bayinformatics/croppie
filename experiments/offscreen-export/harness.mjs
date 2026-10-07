import { drawCroppedImage, canvasToBlob } from "/native.js";
import { createExportWorker } from "/loader.js";
import { injectExifOrientation } from "../../tests/fixtures/exif-jpeg.js";

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const nextFrame = () => new Promise(requestAnimationFrame);
const hash = async (bytes) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
  (byte) => byte.toString(16).padStart(2, "0")).join("");
let bound;
let exporter;

async function load(blob) {
  const url = URL.createObjectURL(blob);
  const image = new Image();
  image.src = url;
  await image.decode();
  return { image, release: () => URL.revokeObjectURL(url) };
}

async function exifBlob(orientation) {
  const canvas = document.createElement("canvas");
  canvas.width = 400;
  canvas.height = 240;
  const ctx = canvas.getContext("2d");
  for (const [color, x, y] of [["#ff0000", 0, 0], ["#00ff00", 200, 0],
    ["#ffff00", 200, 120], ["#0000ff", 0, 120]]) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, 200, 120);
  }
  const jpeg = await canvasToBlob(canvas, "jpeg", 1);
  return new Blob([injectExifOrientation(new Uint8Array(await jpeg.arrayBuffer()), orientation)],
    { type: "image/jpeg" });
}

export async function setup(name) {
  bound?.release();
  exporter?.close();
  const orientation = name.startsWith("exif-") ? Number(name.slice(5)) : null;
  const blob = orientation ? await exifBlob(orientation) : await fetch(`/images/${name}`).then((r) => {
    if (!r.ok) throw new Error(`Fixture ${name}: HTTP ${r.status}`);
    return r.blob();
  });
  const started = performance.now();
  bound = { ...await load(blob), blob, name, orientation };
  const nativeDecodeMs = performance.now() - started;
  exporter = createExportWorker();
  const support = await exporter.ready;
  return {
    name, bytes: blob.size, mime: blob.type, sha256: await hash(await blob.arrayBuffer()),
    dimensions: [bound.image.naturalWidth, bound.image.naturalHeight], nativeDecodeMs,
    support,
  };
}

function fullFrame() {
  return { topLeftX: 0, topLeftY: 0,
    bottomRightX: bound.image.naturalWidth, bottomRightY: bound.image.naturalHeight };
}

export function cases() {
  const w = bound.image.naturalWidth, h = bound.image.naturalHeight;
  const full = fullFrame();
  const side = Math.min(w, h);
  const square = { topLeftX: (w - side) / 2, topLeftY: (h - side) / 2,
    bottomRightX: (w + side) / 2, bottomRightY: (h + side) / 2 };
  const fractional = { topLeftX: -w * .03125 + .375, topLeftY: h * .0725 + .625,
    bottomRightX: w * .8125 + .25, bottomRightY: h * 1.09375 - .125 };
  if (bound.orientation) return [
    { name: "full", frame: full, width: w, height: h, oracle: 0 },
    { name: "rotated90", frame: full, width: h, height: w, options: { rotation: 90 }, oracle: 90 },
    { name: "fractional-circle", frame: fractional, width: 256, height: 256, options: { circle: true } },
  ];
  return [256, 2048].flatMap((size) => [
    { name: `full-letterbox-${size}`, frame: full },
    { name: `square-${size}`, frame: square },
    { name: `fractional-bars-${size}`, frame: fractional },
    { name: `circle-alpha-${size}`, frame: fractional, options: { circle: true } },
    { name: `circle-background-${size}`, frame: fractional,
      options: { circle: true, backgroundColor: "#173655" } },
    ...[90, 180, 270].map((rotation) => ({ name: `rotated${rotation}-${size}`,
      frame: fractional, options: { rotation } })),
  ].map((spec) => ({ ...spec, width: size, height: size })));
}

async function native(spec) {
  const start = performance.now();
  const canvas = drawCroppedImage(bound.image, spec.frame, spec.width, spec.height, spec.options);
  const drawn = performance.now();
  const blob = await canvasToBlob(canvas, "png");
  return { blob, drawMs: drawn - start, encodeMs: performance.now() - drawn,
    dimensions: [bound.image.naturalWidth, bound.image.naturalHeight] };
}

async function decodedPixels(blob) {
  const { image, release } = await load(blob);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(image, 0, 0);
    return { width: canvas.width, height: canvas.height,
      data: ctx.getImageData(0, 0, canvas.width, canvas.height).data };
  } finally { release(); }
}

function difference(a, b) {
  if (a.width !== b.width || a.height !== b.height) return { equal: false, dimensionsMismatch: true };
  let channels = 0, pixels = 0, maxDelta = 0;
  let first = null;
  for (let i = 0; i < a.data.length; i += 4) {
    let changed = false;
    for (let c = 0; c < 4; c++) {
      const delta = Math.abs(a.data[i + c] - b.data[i + c]);
      if (delta) {
        changed = true;
        channels++;
        maxDelta = Math.max(maxDelta, delta);
        if (first === null) first = { x: (i / 4) % a.width, y: Math.floor(i / 4 / a.width),
          channel: c, native: a.data[i + c], worker: b.data[i + c] };
      }
    }
    if (changed) pixels++;
  }
  return { equal: pixels === 0, differentPixels: pixels, differentChannels: channels,
    maxChannelDelta: maxDelta, first };
}

function orientationOracle(pixels, rotation) {
  const orders = [[0, 1, 2, 3], [1, 0, 3, 2], [2, 3, 0, 1], [3, 2, 1, 0],
    [0, 3, 2, 1], [3, 0, 1, 2], [2, 1, 0, 3], [1, 2, 3, 0]];
  let order = orders[bound.orientation - 1];
  if (rotation === 90) order = [order[3], order[0], order[1], order[2]];
  const rgb = [[255, 0, 0], [0, 255, 0], [255, 255, 0], [0, 0, 255]];
  const values = [[.25, .25], [.75, .25], [.75, .75], [.25, .75]].map(([x, y]) => {
    const offset = (Math.floor(y * pixels.height) * pixels.width + Math.floor(x * pixels.width)) * 4;
    return Array.from(pixels.data.slice(offset, offset + 3));
  });
  // This tolerance ONLY identifies solid JPEG quadrant colors, never the equality gate.
  return { pass: values.every((color, i) => color.every((v, c) => Math.abs(v - rgb[order[i]][c]) < 10)),
    order, values };
}

export async function verify(spec) {
  const reference = await native(spec);
  const expected = await decodedPixels(reference.blob);
  const record = { name: `${bound.name}/${spec.name}`, spec,
    nativeDecodedSha256: await hash(expected.data), nativeBlobBytes: reference.blob.size,
    nativeMime: reference.blob.type,
    comparisons: [] };
  if (spec.oracle !== undefined) record.nativeOrientation = orientationOracle(expected, spec.oracle);
  for (const input of ["image", "blob"]) {
    try {
      const result = await exporter.run(input === "image" ? bound.image : bound.blob, spec);
      const actual = await decodedPixels(result.blob);
      const dimensionsEqual = result.dimensions[0] === bound.image.naturalWidth &&
        result.dimensions[1] === bound.image.naturalHeight;
      const diff = difference(expected, actual);
      const orientation = spec.oracle !== undefined ? orientationOracle(actual, spec.oracle) : null;
      record.comparisons.push({ input, ...diff, dimensions: result.dimensions, dimensionsEqual,
        equal: diff.equal && dimensionsEqual && (orientation?.pass ?? true) &&
          (record.nativeOrientation?.pass ?? true),
        orientation, decodedSha256: await hash(actual.data), blobBytes: result.blob.size,
        mime: result.blob.type });
    } catch (error) {
      record.comparisons.push({ input, equal: false, error: String(error) });
    }
  }
  return record;
}

async function observe(operation) {
  await pause(20);
  const frameAnchor = await nextFrame();
  const started = performance.now();
  let completed = Infinity, timer, raf;
  let lastTimer = started, lastFrame = frameAnchor;
  let maxTimerGapMs = 0, maxRafGapMs = 0, timerTicksDuring = 0, rafTicksDuring = 0;
  let firstTaskDelayMs = null;
  function tick() {
    const now = performance.now();
    maxTimerGapMs = Math.max(maxTimerGapMs, now - lastTimer);
    lastTimer = now;
    if (now <= completed) timerTicksDuring++;
    timer = setTimeout(tick, 4);
  }
  function frame(now) {
    maxRafGapMs = Math.max(maxRafGapMs, now - lastFrame);
    lastFrame = now;
    if (performance.now() <= completed) rafTicksDuring++;
    raf = requestAnimationFrame(frame);
  }
  const firstTask = new Promise((resolve) => setTimeout(() => {
    firstTaskDelayMs = performance.now() - started;
    resolve();
  }, 0));
  timer = setTimeout(tick, 4);
  raf = requestAnimationFrame(frame);
  try {
    const result = await operation();
    completed = performance.now();
    await firstTask;
    await pause(5);
    await nextFrame(); // Include the first callback after any blocking export work.
    const { blob, id, ...timings } = result;
    return { ...timings, totalMs: completed - started, blobBytes: blob?.size, mime: blob?.type,
      firstTaskDelayMs, maxTimerGapMs, maxRafGapMs, timerTicksDuring, rafTicksDuring };
  } finally {
    clearTimeout(timer);
    cancelAnimationFrame(raf);
  }
}

export async function idle() {
  return observe(async () => { await pause(100); return {}; });
}

export async function sample({ variant, size }) {
  const spec = cases().find((item) => item.name === `square-${size}`);
  return observe(async () => {
    if (variant === "native") return native(spec);
    const cold = variant.endsWith("cold");
    const client = cold ? createExportWorker() : exporter;
    try {
      const support = await client.ready;
      const result = await client.run(variant.startsWith("image") ? bound.image : bound.blob, spec);
      return { ...result, startupMs: cold ? support.startupMs : 0 };
    } finally { if (cold) client.close(); }
  });
}

export function close() {
  exporter?.close();
  bound?.release();
  exporter = null;
  bound = null;
}
