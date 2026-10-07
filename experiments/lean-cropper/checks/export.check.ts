import { toCanvas, toBlob, type ExportOptions } from '../src/export';
import type { CropState, Matrix, Source } from '../src/core';
import { drawCroppedImage } from '../../../src/canvas/draw';
import { capCanvasSize } from '../../../src/utils/limits';

type State = CropState & { mask?: 'rect' | 'circle' };
type Cropper = { getState(): State; getSource(): Source };
const assert = (value: unknown, label: string) => { if (!value) throw new Error(label); };
const canvas = (w: number, h: number) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const context = (c: HTMLCanvasElement) => c.getContext('2d')!;
const rgba = (c: HTMLCanvasElement) => context(c).getImageData(0, 0, c.width, c.height).data;
const matrix = (m: DOMMatrix): Matrix => [m.a, m.b, m.c, m.d, m.e, m.f];
const images = new Map<string, Source>();

async function load(name: string): Promise<Source> {
  if (images.has(name)) return images.get(name)!;
  const blob = await (await fetch(`/images/${name}`)).blob(), image = new Image();
  image.src = URL.createObjectURL(blob); await image.decode();
  const source = { image, blob }; images.set(name, source); return source;
}

function cropper(source: Source, state?: State): Cropper {
  const size = { width: source.image.naturalWidth, height: source.image.naturalHeight };
  return { getState: () => state ?? { version: 1, image: size, stage: size, aspect: null,
    viewport: { x: 0, y: 0, ...size }, transform: [1, 0, 0, 1, 0, 0] }, getSource: () => source };
}

function difference(a: HTMLCanvasElement, b: HTMLCanvasElement) {
  assert(a.width === b.width && a.height === b.height, 'Difference dimensions');
  const x = rgba(a), y = rgba(b); let sum = 0, squares = 0, premultipliedSquares = 0, max = 0, changed = 0;
  for (let i = 0; i < x.length; i++) {
    const d = Math.abs(x[i]! - y[i]!); sum += d; squares += d * d; max = Math.max(max, d); if (d) changed++;
    const alpha = i - i % 4 + 3;
    const visible = i % 4 === 3 ? x[i]! - y[i]! : (x[i]! * x[alpha]! - y[i]! * y[alpha]!) / 255;
    premultipliedSquares += visible * visible;
  }
  return { meanRGBA: sum / x.length, rmseRGBA: Math.sqrt(squares / x.length),
    premultipliedRMSE: Math.sqrt(premultipliedSquares / x.length), max, changed };
}

/** Independent full-image native reference: never region-crops, never resets scratch surfaces. */
function reference(c: Cropper, output: HTMLCanvasElement, options: ExportOptions, progressive: boolean) {
  const s = c.getState(), v = s.viewport, m = new DOMMatrix(s.transform);
  const result = canvas(output.width, output.height), ctx = context(result);
  const k = Math.min(result.width / v.width, result.height / v.height);
  const rounded = Math.abs(result.width / v.width - result.height / v.height) <= .5 / v.width + .5 / v.height;
  const kx = rounded ? result.width / v.width : k, ky = rounded ? result.height / v.height : k;
  const ox = rounded ? 0 : (result.width - v.width * k) / 2, oy = rounded ? 0 : (result.height - v.height * k) / 2;
  if (options.background) { ctx.fillStyle = options.background; ctx.fillRect(0, 0, result.width, result.height); }
  ctx.beginPath();
  if (s.mask === 'circle') ctx.ellipse(result.width / 2, result.height / 2, v.width * kx / 2, v.height * ky / 2, 0, 0, 2 * Math.PI);
  else ctx.rect(ox, oy, v.width * kx, v.height * ky);
  ctx.clip();
  const image = c.getSource().image;
  let source: HTMLImageElement | HTMLCanvasElement = image, w = image.naturalWidth, h = image.naturalHeight;
  // Column length gives an independent full-image reference for the uniform/rotation cases.
  const scale = Math.max(Math.hypot(m.a * kx, m.b * ky), Math.hypot(m.c * kx, m.d * ky));
  if (progressive) while (w / 2 >= image.naturalWidth * scale && h / 2 >= image.naturalHeight * scale) {
    const size = capCanvasSize(w / 2, h / 2), next = canvas(size.width, size.height), nc = context(next);
    nc.imageSmoothingQuality = 'high'; nc.drawImage(source, 0, 0, w, h, 0, 0, next.width, next.height);
    source = next; w = next.width; h = next.height;
  }
  ctx.translate(ox, oy); ctx.scale(kx, ky); ctx.translate(-v.x, -v.y); ctx.transform(m.a, m.b, m.c, m.d, m.e, m.f);
  ctx.imageSmoothingQuality = 'high'; ctx.drawImage(source, 0, 0, w, h, 0, 0, image.naturalWidth, image.naturalHeight);
  return result;
}

function allocation<T>(action: () => T) {
  const nativeCreate = document.createElement, create = nativeCreate.bind(document), draw = CanvasRenderingContext2D.prototype.drawImage;
  const surfaces: HTMLCanvasElement[] = [], draws: { image: boolean; source: number[]; target: number[]; canvas: number[] }[] = [];
  document.createElement = ((name: string, options?: ElementCreationOptions) => {
    const element = create(name, options); if (name === 'canvas') surfaces.push(element as HTMLCanvasElement); return element;
  }) as typeof document.createElement;
  CanvasRenderingContext2D.prototype.drawImage = function(this: CanvasRenderingContext2D, ...args: Parameters<typeof draw>) {
    const src = args[0] as HTMLImageElement | HTMLCanvasElement;
    draws.push({ image: src instanceof HTMLImageElement, source: Array.from(args).slice(1, 5) as number[],
      target: Array.from(args).slice(5) as number[], canvas: [this.canvas.width, this.canvas.height] });
    return draw.apply(this, args);
  } as typeof draw;
  try { return { result: action(), surfaces, draws }; }
  finally { document.createElement = nativeCreate; CanvasRenderingContext2D.prototype.drawImage = draw; }
}

export async function sizes() {
  const source = await load('art.png'), c = cropper(source), cases = [];
  for (const options of [{}, { width: 0.1 }, { height: 0.49 }, { width: 6000, height: 6000 },
    { width: 20000, height: 100 }, { width: 1e308, height: 1e308 }, { width: 1e308 }, { height: 1e308 }]) {
    const out = toCanvas(c, options); cases.push({ options, width: out.width, height: out.height });
    assert(out.width <= 16384 && out.height <= 16384 && out.width * out.height <= 16777216, 'Output caps');
    out.width = out.height = 0; // This returned surface belongs to the test/caller.
  }
  assert(cases[3]!.width === 4096 && cases[3]!.height === 4096, 'Oversized square scales instead of throwing');
  assert(cases[4]!.width === 16384 && cases[4]!.height === 82, 'Side cap preserves aspect');
  assert(cases[5]!.width === 4096 && cases[5]!.height === 4096, 'Finite huge dimensions do not overflow');
  assert(cases[6]!.width === 4729 && cases[6]!.height === 3547, 'Huge one-dimensional request');
  let rejected = 0;
  for (const value of [0, -1, -0.1, NaN, Infinity, -Infinity, '', ' ', '320', null]) for (const key of ['width', 'height']) {
    try { toCanvas(c, { [key]: value } as ExportOptions); } catch { rejected++; }
  }
  assert(rejected === 20, 'Invalid sizes rejected before rounding/coercion');
  return { cases, rejected };
}

export async function geometry() {
  const source = await load('art.png'), original = canvas(1024, 768); context(original).drawImage(source.image, 0, 0);
  const pixels = rgba(original), rows = [];
  assert(difference(toCanvas(cropper(source)), toCanvas(cropper(source, { ...cropper(source).getState(), mask: 'rect' }))).max === 0, 'Missing v1 mask means rect');
  for (const [degrees, flipX, flipY, mask, shear] of [[0, 1, 1, 'rect', 0], [90, -1, 1, 'rect', 0],
    [37.25, 1, 1, 'rect', 0], [-28.75, -1, 1, 'circle', 0], [123.4, -1, -1, 'circle', 0], [11.2, 1, -1, 'rect', .7]] as const) {
    const v = { x: 12.25, y: 17.625, width: 405.5, height: 291.25 };
    const m = new DOMMatrix().translate(203, 158).rotate(degrees).scale(.62 * flipX, .62 * flipY).skewX(shear * 180 / Math.PI).translate(-460, -350);
    const state: State = { ...cropper(source).getState(), viewport: v, transform: matrix(m), mask };
    const output = toCanvas(cropper(source, state), { width: 420, height: 340 });
    const data = rgba(output), k = Math.min(output.width / v.width, output.height / v.height);
    const ox = (output.width - v.width * k) / 2, oy = (output.height - v.height * k) / 2;
    const inverse = m.inverse(); let checked = 0, errors = 0, worst = 0;
    const examples: unknown[] = [];
    // Analytic nearest solid-region oracle, independent of Canvas resampling and affine helpers.
    for (let y = 0; y < output.height; y += 2) for (let x = 0; x < output.width; x += 2) {
      const vx = (x + .5 - ox) / k, vy = (y + .5 - oy) / k;
      const p = inverse.transformPoint({ x: vx + v.x, y: vy + v.y });
      const ellipse = ((vx - v.width / 2) / (v.width / 2)) ** 2 + ((vy - v.height / 2) / (v.height / 2)) ** 2;
      const outside = vx < -2 || vy < -2 || vx > v.width + 2 || vy > v.height + 2 ||
        p.x < -8 || p.y < -8 || p.x > 1032 || p.y > 776 || (mask === 'circle' && ellipse > 1.06);
      const inside = vx > 2 && vy > 2 && vx < v.width - 2 && vy < v.height - 2 &&
        p.x > 8 && p.y > 8 && p.x < 1016 && p.y < 760 && (mask !== 'circle' || ellipse < .94);
      if (!outside && !inside) continue;
      let expected = [0, 0, 0, 0];
      if (!outside) {
        const px = Math.floor(p.x), py = Math.floor(p.y), at = (py * 1024 + px) * 4;
        expected = Array.from(pixels.slice(at, at + 4));
        let solid = true;
        // Exclude the native high-quality filter support at color/alpha edges (8 source px).
        for (const dy of [-8, -4, 0, 4, 8]) for (const dx of [-8, -4, 0, 4, 8]) for (let ch = 0; ch < 4; ch++) {
          if (pixels[((py + dy) * 1024 + px + dx) * 4 + ch] !== expected[ch]) solid = false;
        }
        if (!solid) continue;
      }
      const at = (y * output.width + x) * 4;
      let error = Math.abs(data[at + 3]! - expected[3]!);
      for (let ch = 0; ch < 3; ch++) error = Math.max(error, Math.abs(data[at + ch]! * data[at + 3]! - expected[ch]! * expected[3]!) / 255);
      checked++; if (error > 2) { errors++; if (examples.length < 5) examples.push({ x, y, p: { x: p.x, y: p.y }, expected, actual: Array.from(data.slice((y * output.width + x) * 4, (y * output.width + x) * 4 + 4)) }); } worst = Math.max(worst, error);
    }
    assert(checked > 10000 && errors === 0, `Analytic geometry ${degrees}/${mask}: ${errors}/${checked}, max ${worst}, ${JSON.stringify(examples)}`);
    rows.push({ degrees, flipX, flipY, mask, shear, checked, errors, worst });
  }
  // Image edges cross a fractional free viewport; bars must stay clear/filled.
  const state = { ...cropper(source).getState(), viewport: { x: -512.25, y: -384.75, width: 2048, height: 1536 } };
  const free = toCanvas(cropper(source, state), { width: 512, height: 512 });
  assert(context(free).getImageData(256, 10, 1, 1).data[3] === 0, 'Transparent contain bars');
  assert(context(free).getImageData(40, 256, 1, 1).data[3] === 0, 'Out-of-source pixels');
  const filled = toCanvas(cropper(source, { ...state, mask: 'circle' }), { width: 512, height: 512, background: '#13579b' });
  assert(Array.from(context(filled).getImageData(10, 10, 1, 1).data).join() === '19,87,155,255', 'Background behind mask and bars');
  return rows;
}

export async function productionParity() {
  const source = await load('art.png'), rows = [];
  for (const rotation of [0, 90, 180, 270] as const) for (const circle of [false, true]) {
    const fw = 768, fh = 512, vw = rotation % 180 ? fh : fw, vh = rotation % 180 ? fw : fh;
    const frame = { topLeftX: 128, topLeftY: 128, bottomRightX: 896, bottomRightY: 640 };
    const m = new DOMMatrix().translate(vw / 2, vh / 2).rotate(rotation).translate(-512, -384);
    const c = cropper(source, { ...cropper(source).getState(), transform: matrix(m),
      viewport: { x: 0, y: 0, width: vw, height: vh }, mask: circle ? 'circle' : 'rect' });
    const audit = allocation(() => toCanvas(c, { width: vw / 4, height: vh / 4 })), actual = audit.result;
    const expected = drawCroppedImage(source.image, frame, actual.width, actual.height, { rotation, circle });
    const diff = difference(actual, expected);
    // Straight-alpha RGB near zero alpha is unstable; retain it in evidence, gate visible RGBA.
    assert(diff.meanRGBA < .6 && diff.premultipliedRMSE < 2, `Production ${rotation}/${circle}: ${JSON.stringify(diff)}`);
    rows.push({ rotation, circle, ...diff });
  }
  return rows;
}

export async function detailAndLifetime() {
  const source = await load('detail.png'), base = cropper(source).getState();
  const state = { ...base, transform: [.1, 0, 0, .1, 0, 0] as Matrix, viewport: { x: 73.6, y: 51.2, width: 25.6, height: 19.2 } };
  const c = cropper(source, state), before = JSON.stringify(state), url = source.image.src;
  const audit = allocation(() => toCanvas(c, { width: 256, height: 192 }));
  const expected = canvas(256, 192); context(expected).drawImage(source.image, 736, 512, 256, 192, 0, 0, 256, 192);
  const detail = difference(audit.result, expected);
  assert(detail.max === 0 && audit.surfaces.length === 1, `Original detail preserved: ${JSON.stringify(detail)}`);
  assert(audit.draws[0]!.image && audit.draws[0]!.source[2]! <= 265, 'Only relevant original source region');
  const photo = await load('photo-48mp.jpg'), pc = cropper(photo), pBefore = JSON.stringify(pc.getState()), pUrl = photo.image.src;
  const zoomed = allocation(() => toCanvas(cropper(photo, { ...pc.getState(), viewport: { x: 3013, y: 2311, width: 257, height: 193 } })));
  const zoomReference = canvas(257, 193); context(zoomReference).drawImage(photo.image, 3013, 2311, 257, 193, 0, 0, 257, 193);
  const photoDetail = difference(zoomed.result, zoomReference);
  assert(photoDetail.max === 0 && zoomed.surfaces.length === 1 && zoomed.draws[0]!.source[2]! <= 265, '48MP small-region original detail, no staging surface');
  const held = toCanvas(pc, { width: 320 }), heldData = held.toDataURL();
  const blobAudit = allocation(() => toBlob(pc, { width: 320 })), encoded = await blobAudit.result;
  assert(blobAudit.surfaces[0]!.width === 0, 'Private output freed after encoding');
  assert(blobAudit.surfaces.slice(1).every(c => c.width > 0 && c.height > 0), 'Intermediate canvases never reset');
  assert(blobAudit.draws.every(d => d.canvas[0]! <= 16384 && d.canvas[1]! <= 16384 && d.canvas[0]! * d.canvas[1]! <= 16777216), 'Bounded scratch allocation');
  assert(blobAudit.draws[0]!.image && blobAudit.draws[0]!.canvas.join() === '4000,3000', '48MP first pass halves original directly');
  const decoded = new Image(), encodedURL = URL.createObjectURL(encoded); decoded.src = encodedURL; await decoded.decode();
  const fromBlob = canvas(held.width, held.height); context(fromBlob).drawImage(decoded, 0, 0); URL.revokeObjectURL(encodedURL);
  assert(difference(held, fromBlob).max === 0, 'PNG encoding retains exported pixels');
  const again = toCanvas(pc, { width: 320 });
  assert(difference(held, again).max === 0 && held.toDataURL() === heldData, 'Repeated exports and retained caller canvas');
  assert(JSON.stringify(state) === before && source.image.src === url && c.getSource().blob === source.blob &&
    JSON.stringify(pc.getState()) === pBefore && photo.image.src === pUrl && pc.getSource().image === photo.image, 'Original source/state lifetime');
  const formats = [];
  for (const type of ['image/png', 'image/jpeg', 'image/webp', 'image/unsupported']) {
    const blob = await toBlob(c, { width: 128, type, quality: .91, background: 'white' });
    const im = new Image(), src = URL.createObjectURL(blob); im.src = src; await im.decode(); URL.revokeObjectURL(src);
    assert(im.naturalWidth === 128 && im.naturalHeight === 96, 'Blob dimensions');
    assert(blob.type === (type === 'image/unsupported' ? 'image/png' : type) || (type === 'image/webp' && blob.type === 'image/png'), 'Native MIME/fallback');
    formats.push({ requested: type, actual: blob.type, bytes: blob.size });
  }
  const alphaSource = await load('art.png'), ac = cropper(alphaSource, { ...cropper(alphaSource).getState(), mask: 'circle' });
  for (const type of ['image/png', 'image/jpeg', 'image/webp']) {
    const blob = await toBlob(ac, { width: 128, height: 128, type, ...(type === 'image/jpeg' ? { background: 'white' } : {}) });
    const im = new Image(), src = URL.createObjectURL(blob); im.src = src; await im.decode(); URL.revokeObjectURL(src);
    const decoded = canvas(128, 128); context(decoded).drawImage(im, 0, 0);
    const corner = Array.from(context(decoded).getImageData(0, 0, 1, 1).data);
    assert(type === 'image/jpeg' ? corner.every(n => n >= 253) : corner[3] === 0, 'Encoded mask/bars and explicit JPEG background');
    formats.push({ requested: type, actual: blob.type, bytes: blob.size, corner });
  }
  const native = HTMLCanvasElement.prototype.toBlob; let pending: BlobCallback | undefined, privateCanvas: HTMLCanvasElement | undefined;
  HTMLCanvasElement.prototype.toBlob = function(callback) { pending = callback; privateCanvas = this; };
  try {
    const waiting = toBlob(c, { width: 64 });
    assert(privateCanvas!.width === 64, 'Output stays alive while encoder is pending');
    pending!(null); let rejected = false; try { await waiting; } catch { rejected = true; }
    assert(rejected && privateCanvas!.width === 0, 'Null encoder result rejects and releases output');
    HTMLCanvasElement.prototype.toBlob = function() { privateCanvas = this; throw new Error('encoder failure'); };
    rejected = false; try { await toBlob(c, { width: 64 }); } catch { rejected = true; }
    assert(rejected && privateCanvas!.width === 0, 'Throwing encoder rejects and releases output');
  } finally { HTMLCanvasElement.prototype.toBlob = native; }
  return { detail, photoDetail, detailDraws: audit.draws, photoDetailDraws: zoomed.draws, formats, allocation: blobAudit.draws,
    scratchPixels: blobAudit.surfaces.slice(1).reduce((n, c) => n + c.width * c.height, 0) };
}

export interface QualityCase { name: string; source: string; angle?: number; flip?: boolean; circle?: boolean; letterbox?: boolean; fractional?: boolean; region?: boolean; shear?: boolean; anisotropic?: boolean }
export async function qualityCase(spec: QualityCase) {
  const source = await load(spec.source), state = cropper(source).getState(), iw = state.image.width, ih = state.image.height;
  const factor = spec.region ? .2 : 1, vw = iw * factor, vh = ih * factor * (spec.anisotropic ? .08 : 1);
  state.viewport = { x: spec.fractional ? 19.375 : 0, y: spec.fractional ? -21.625 : 0, width: vw, height: vh };
  state.transform = matrix(new DOMMatrix().translate(vw / 2, vh / 2).rotate(spec.angle ?? 0)
    .scale(spec.flip ? -1 : 1, spec.anisotropic ? .08 : 1).skewX(spec.shear ? 70 : 0).translate(-iw / 2, -ih / 2));
  if (spec.circle) state.mask = 'circle';
  const c = cropper(source, state), options = { width: 320, ...(spec.letterbox ? { height: 320 } : {}) };
  const audit = allocation(() => toCanvas(c, options)), actual = audit.result;
  if (spec.region) assert(audit.draws[0]!.source[2]! * audit.draws[0]!.source[3]! < iw * ih / 5, 'Region export does not resample the full image');
  const single = reference(c, actual, options, false), progressive = reference(c, actual, options, true);
  const outputs: Record<string, string> = { hybrid: actual.toDataURL(), single: single.toDataURL(), progressive: progressive.toDataURL() };
  let productionDifference: ReturnType<typeof difference> | undefined;
  if (!spec.angle && !spec.flip && !spec.circle && !spec.fractional && !spec.shear && !spec.anisotropic) {
    const v = state.viewport;
    const production = drawCroppedImage(source.image, {
      topLeftX: (iw - v.width) / 2, topLeftY: (ih - v.height) / 2,
      bottomRightX: (iw + v.width) / 2, bottomRightY: (ih + v.height) / 2,
    }, actual.width, actual.height);
    productionDifference = difference(actual, production); outputs.production = production.toDataURL();
    if (!spec.region) assert(productionDifference.max === 0, 'Full-photo output pixel-identical to production');
  }
  // Original prototype geometry: useful only where its stretched output has matching semantics.
  if (!spec.angle && !spec.flip && !spec.circle && !spec.fractional && !spec.shear && !spec.anisotropic && !spec.letterbox && !spec.region) {
    const pixels = rgba(actual);
    for (let x = 0; x < actual.width; x++) assert(pixels[x * 4 + 3] === 255 && pixels[((actual.height - 1) * actual.width + x) * 4 + 3] === 255, 'No rounded-aspect horizontal seam');
    for (let y = 0; y < actual.height; y++) assert(pixels[(y * actual.width) * 4 + 3] === 255 && pixels[(y * actual.width + actual.width - 1) * 4 + 3] === 255, 'No rounded-aspect vertical seam');
    const old = canvas(actual.width, actual.height), ctx = context(old);
    ctx.imageSmoothingQuality = 'high'; ctx.drawImage(source.image, 0, 0, old.width, old.height); outputs.old = old.toDataURL();
  }
  return { spec, state, width: actual.width, height: actual.height, options, outputs,
    nativeDifference: difference(actual, progressive), productionDifference, draws: audit.draws };
}

export async function exif(name: string) {
  const c = cropper(await load(name)), out = toCanvas(c);
  return { width: out.width, height: out.height, png: out.toDataURL() };
}

Object.assign(window, { exportChecks: { sizes, geometry, productionParity, detailAndLifetime, qualityCase, exif } });
