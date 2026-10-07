import { around, translate, type Matrix, type Point } from './affine';

export type Size = { width: number; height: number };
export type Rect = Point & Size;
export type Corner = 'nw' | 'ne' | 'sw' | 'se';
export interface CropState {
  version: 1;
  image: Size;
  stage: Size;
  transform: Matrix;
  viewport: Rect;
  /** null means free aspect; otherwise viewport width / height. */
  aspect: number | null;
}
export const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
export const center = (r: Rect): Point => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
export const finite = (...values: number[]) => values.every(n => typeof n === 'number' && Number.isFinite(n));

export function copy(s: CropState): CropState {
  return { ...s, image: { ...s.image }, stage: { ...s.stage }, viewport: { ...s.viewport }, transform: [...s.transform] };
}

export function fitRect(r: Rect, stage: Size, aspect: number | null): Rect {
  if (!finite(r.x, r.y, r.width, r.height) || r.width <= 0 || r.height <= 0 ||
      (aspect !== null && (!finite(aspect) || aspect <= 0))) throw new Error('Invalid viewport');
  let width = Math.max(24, r.width), height = Math.max(24, r.height);
  if (aspect !== null) { width = Math.max(width, 24 * aspect); height = width / aspect; }
  const k = Math.min(1, stage.width / width, stage.height / height);
  width *= k; height *= k;
  return { x: clamp(r.x, 0, stage.width - width), y: clamp(r.y, 0, stage.height - height), width, height };
}

export function initial(image: Size, stage: Size, aspect: number | null): CropState {
  const viewport = fitRect({ x: 0, y: 0, width: stage.width * .72, height: stage.height * .72 }, stage, aspect);
  viewport.x = (stage.width - viewport.width) / 2;
  viewport.y = (stage.height - viewport.height) / 2;
  const z = Math.max(viewport.width / image.width, viewport.height / image.height);
  return { version: 1, image: { ...image }, stage: { ...stage }, viewport, aspect,
    transform: [z, 0, 0, z, (stage.width - image.width * z) / 2, (stage.height - image.height * z) / 2] };
}

/** Uniformly fit an existing stage into the new stage; keeps crop/source correspondence. */
export function reframe(s: CropState, stage: Size): CropState {
  const k = Math.min(stage.width / s.stage.width, stage.height / s.stage.height);
  const x = (stage.width - s.stage.width * k) / 2, y = (stage.height - s.stage.height * k) / 2;
  return { ...copy(s), stage: { ...stage }, transform: translate(around(s.transform, k, 0, 0, k, { x: 0, y: 0 }), x, y),
    viewport: { x: s.viewport.x * k + x, y: s.viewport.y * k + y, width: s.viewport.width * k, height: s.viewport.height * k } };
}

export function validate(s: CropState, image: Size): void {
  const m = s.transform, v = s.viewport, t = s.stage;
  const determinant = m?.[0] * m?.[3] - m?.[1] * m?.[2];
  if (s.version !== 1 || s.image.width !== image.width || s.image.height !== image.height ||
      !Array.isArray(m) || m.length !== 6 || !finite(...m, v.x, v.y, v.width, v.height, t.width, t.height) ||
      !finite(determinant) || Math.abs(determinant) < 1e-12 || t.width <= 0 || t.height <= 0 ||
      v.width <= 0 || v.height <= 0 || v.x < 0 || v.y < 0 || v.x + v.width > t.width + 1e-6 || v.y + v.height > t.height + 1e-6 ||
      (s.aspect !== null && (!finite(s.aspect) || s.aspect <= 0 || Math.abs(v.width / v.height - s.aspect) > 1e-6))) {
    throw new Error('Invalid crop state or different image dimensions');
  }
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
