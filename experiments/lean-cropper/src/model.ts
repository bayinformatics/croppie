import { around, point, translate, type Matrix, type Point } from './affine';

export type Size = { width: number; height: number };
export type Rect = Point & Size;
export type Corner = 'nw' | 'ne' | 'sw' | 'se';
export type Coverage = 'fill' | 'free';
export type Mask = 'rect' | 'circle';
export interface CropState {
  version: 1;
  image: Size;
  stage: Size;
  transform: Matrix;
  viewport: Rect;
  /** null means free aspect; otherwise viewport width / height. */
  aspect: number | null;
  /** Missing in earlier version-1 states. Circle is the viewport's inscribed ellipse. */
  mask?: Mask;
}
export const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
export const center = (r: Rect): Point => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
export const finite = (...values: number[]) => values.every(n => typeof n === 'number' && Number.isFinite(n));

export function copy(s: CropState): CropState {
  return { ...s, mask: s.mask ?? 'rect', image: { ...s.image }, stage: { ...s.stage }, viewport: { ...s.viewport }, transform: [...s.transform] };
}

export function coverageMode(mode: Coverage): Coverage {
  if (mode !== 'fill' && mode !== 'free') throw new Error('Invalid coverage');
  return mode;
}

export function maskMode(mask: Mask): Mask {
  if (mask !== 'rect' && mask !== 'circle') throw new Error('Invalid mask');
  return mask;
}

export function fitRect(r: Rect, stage: Size, aspect: number | null): Rect {
  if (!finite(r.x, r.y, r.width, r.height, stage.width, stage.height) || r.width <= 0 || r.height <= 0 || stage.width <= 0 || stage.height <= 0 ||
      (aspect !== null && (!finite(aspect) || aspect <= 0))) throw new Error('Invalid viewport');
  let width = Math.max(24, r.width), height = Math.max(24, r.height);
  if (aspect !== null) { width = Math.max(width, 24 * aspect); height = width / aspect; }
  const k = Math.min(1, stage.width / width, stage.height / height);
  width *= k; height *= k;
  if (!finite(width, height) || width <= 0 || height <= 0) throw new Error('Invalid viewport');
  return { x: clamp(r.x, 0, stage.width - width), y: clamp(r.y, 0, stage.height - height), width, height };
}

export function initial(image: Size, stage: Size, aspect: number | null, mask: Mask = 'rect'): CropState {
  const viewport = fitRect({ x: 0, y: 0, width: stage.width * .72, height: stage.height * .72 }, stage, aspect);
  viewport.x = Math.max(0, (stage.width - viewport.width) / 2);
  viewport.y = Math.max(0, (stage.height - viewport.height) / 2);
  const z = Math.max(viewport.width / image.width, viewport.height / image.height);
  return { version: 1, image: { ...image }, stage: { ...stage }, viewport, aspect, mask,
    transform: [z, 0, 0, z, (stage.width - image.width * z) / 2, (stage.height - image.height * z) / 2] };
}

/** Uniformly fit an existing stage into the new stage; keeps crop/source correspondence. */
export function reframe(s: CropState, stage: Size): CropState {
  if (stage.width === s.stage.width && stage.height === s.stage.height) return copy(s);
  const k = Math.min(stage.width / s.stage.width, stage.height / s.stage.height);
  const x = Math.max(0, (stage.width - s.stage.width * k) / 2), y = Math.max(0, (stage.height - s.stage.height * k) / 2);
  return { ...copy(s), stage: { ...stage }, transform: translate(around(s.transform, k, 0, 0, k, { x: 0, y: 0 }), x, y),
    viewport: { x: s.viewport.x * k + x, y: s.viewport.y * k + y, width: s.viewport.width * k, height: s.viewport.height * k } };
}

export function validate(s: CropState, image: Size): void {
  const m = s.transform, v = s.viewport, t = s.stage;
  const determinant = m?.[0] * m?.[3] - m?.[1] * m?.[2];
  if (s.version !== 1 || s.image.width !== image.width || s.image.height !== image.height ||
      !Array.isArray(m) || m.length !== 6 || !finite(...m, v.x, v.y, v.width, v.height, t.width, t.height, image.width, image.height) || image.width <= 0 || image.height <= 0 ||
      !finite(determinant) || Math.abs(determinant) < 1e-12 || t.width <= 0 || t.height <= 0 ||
      v.width <= 0 || v.height <= 0 || v.x < 0 || v.y < 0 || v.x + v.width > t.width + 1e-6 || v.y + v.height > t.height + 1e-6 ||
      (s.mask !== undefined && s.mask !== 'rect' && s.mask !== 'circle') ||
      (s.aspect !== null && (!finite(s.aspect) || s.aspect <= 0 || Math.abs(v.width / v.height - s.aspect) > 1e-6))) {
    throw new Error('Invalid crop state or different image dimensions');
  }
}

// Relative roundoff only: avoids repeated corrections and anchor drift at a limit.
const EPSILON = 1e-12;
const determinant = (m: Matrix) => m[0] * m[3] - m[1] * m[2];

/** Inverse viewport corners relative to its center; translation cannot erase their span. */
function coverageBounds(s: CropState) {
  const m = s.transform, det = determinant(m);
  const inverse: Matrix = [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det, 0, 0];
  const w = s.viewport.width / 2, h = s.viewport.height / 2;
  const corners = [{ x: -w, y: -h }, { x: w, y: -h }, { x: -w, y: h }, { x: w, y: h }].map(p => point(inverse, p));
  const x = Math.max(...corners.map(p => Math.abs(p.x))), y = Math.max(...corners.map(p => Math.abs(p.y)));
  const ratio = Math.max(2 * x / s.image.width, 2 * y / s.image.height);
  if (!finite(...inverse, x, y, ratio) || ratio <= 0) throw new Error('Invalid derived transform');
  return { inverse, x, y, ratio };
}

/** Uniform enlargement and source-space pan limits also work for reflected/sheared states.
 * Ellipse masks deliberately use conservative rectangular coverage.
 * Returns a candidate; callers install it only after all derived geometry is valid.
 */
export function constrain(s: CropState, mode: Coverage): CropState {
  coverageMode(mode); validate(s, s.image);
  const next = copy(s);
  if (mode === 'free') return next;
  const bounds = coverageBounds(s), p = center(s.viewport), m = s.transform;
  const k = bounds.ratio > 1 + EPSILON ? bounds.ratio : 1;
  const source = point(bounds.inverse, { x: p.x - m[4], y: p.y - m[5] });
  // At an exact minimum the interval can invert by a few ulps: collapse it to center.
  const x = Math.min(bounds.x / k, s.image.width / 2), y = Math.min(bounds.y / k, s.image.height / 2);
  const target = { x: clamp(source.x, x, s.image.width - x), y: clamp(source.y, y, s.image.height - y) };
  if (!finite(source.x, source.y, target.x, target.y, k)) throw new Error('Invalid derived transform');
  const moved = Math.abs(source.x - target.x) > EPSILON * s.image.width || Math.abs(source.y - target.y) > EPSILON * s.image.height;
  if (k !== 1 || moved) {
    const a = m[0] * k, b = m[1] * k, c = m[2] * k, d = m[3] * k;
    // Rebuild translation from a bounded source center, avoiding catastrophic pan cancellation.
    next.transform = [a, b, c, d, p.x - a * target.x - c * target.y, p.y - b * target.x - d * target.y];
    validate(next, s.image);
  }
  return next;
}

/** Clamp the factor before applying its anchor, so zooming out at minimum cannot pan. */
export function zoomTransform(s: CropState, factor: number, anchor: Point, mode: Coverage): Matrix {
  if (!finite(factor, anchor.x, anchor.y) || factor <= 0) throw new Error('Invalid zoom');
  const scale = Math.sqrt(Math.abs(determinant(s.transform)));
  const minimum = Math.max(.001 / scale, mode === 'fill' ? coverageBounds(s).ratio : 0);
  const k = clamp(factor, minimum, Math.max(64 / scale, minimum));
  if (!finite(k) || k <= 0) throw new Error('Invalid derived transform');
  return Math.abs(k - 1) <= EPSILON ? [...s.transform] : around(s.transform, k, 0, 0, k, anchor);
}

/** A corner stays on its original side of the opposite corner. */
export function resizeRect(r: Rect, corner: Corner, dx: number, dy: number, stage: Size, aspect: number | null): Rect {
  const east = corner.includes('e'), south = corner.includes('s');
  const x = east ? r.x : r.x + r.width, y = south ? r.y : r.y + r.height;
  const maxW = east ? stage.width - x : x, maxH = south ? stage.height - y : y;
  let width = r.width + (east ? dx : -dx), height = r.height + (south ? dy : -dy);
  if (aspect !== null) {
    width = (width * aspect * aspect + height * aspect) / (aspect * aspect + 1);
    const max = Math.min(maxW, maxH * aspect);
    width = clamp(width, Math.min(max, Math.max(24, 24 * aspect)), max);
    height = width / aspect;
  } else {
    width = clamp(width, Math.min(24, maxW), maxW);
    height = clamp(height, Math.min(24, maxH), maxH);
  }
  return { x: east ? x : x - width, y: south ? y : y - height, width, height };
}
