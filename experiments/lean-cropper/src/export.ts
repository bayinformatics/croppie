import type { CropState, Source } from './core';
import { unproject } from './affine';
import { capSize, drawRegion } from './resample';

export interface ExportOptions {
  width?: number;
  height?: number;
  background?: string;
  type?: string;
  quality?: number;
}
type ExportSource = {
  getState(): CropState & { mask?: 'rect' | 'circle' };
  getSource(): Source;
};

/** The same oriented image and affine matrix used by CSS, translated into crop space. */
export function toCanvas(cropper: ExportSource, options: ExportOptions = {}): HTMLCanvasElement {
  const s = cropper.getState(), v = s.viewport, m = s.transform;
  for (const n of [options.width, options.height]) {
    if (n !== undefined && (typeof n !== 'number' || !Number.isFinite(n) || n <= 0)) throw new Error('Invalid export size');
  }
  // Cap before multiplying implicit dimensions, including enormous but finite requests.
  const requestedScale = Math.min(options.width !== undefined ? options.width / v.width
    : options.height !== undefined ? options.height / v.height : 1, 16384 / v.width, 16384 / v.height);
  const { width, height } = options.width !== undefined && options.height !== undefined
    ? capSize(options.width, options.height) : capSize(v.width * requestedScale, v.height * requestedScale);
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Canvas 2D unavailable');
  if (options.background) { ctx.fillStyle = options.background; ctx.fillRect(0, 0, width, height); }
  const k = Math.min(width / v.width, height / v.height);
  // Fill a shape rounded to integer pixels, avoiding a faint bar caused only by rounding.
  const rounded = Math.max((width - .5) / v.width, (height - .5) / v.height)
    <= Math.min((width + .5) / v.width, (height + .5) / v.height);
  const kx = rounded ? width / v.width : k, ky = rounded ? height / v.height : k;
  const dw = rounded ? width : v.width * k, dh = rounded ? height : v.height * k;
  const dx = (width - dw) / 2, dy = (height - dh) / 2;
  // Clip the logical crop, not the entire output box; the image cannot leak into bars.
  ctx.beginPath();
  if (s.mask === 'circle') ctx.ellipse(width / 2, height / 2, dw / 2, dh / 2, 0, 0, Math.PI * 2);
  else ctx.rect(dx, dy, dw, dh);
  ctx.clip();

  const image = cropper.getSource().image;
  const corners = [unproject(m, v), unproject(m, { x: v.x + v.width, y: v.y }),
    unproject(m, { x: v.x, y: v.y + v.height }), unproject(m, { x: v.x + v.width, y: v.y + v.height })];
  const a = m[0] * kx, b = m[1] * ky, c = m[2] * kx, d = m[3] * ky;
  const scale = (Math.hypot(a + d, b - c) + Math.hypot(a - d, b + c)) / 2;
  // Four filter pixels of support in the most compressed direction, including all halves.
  const minimumScale = Math.abs(a * d - b * c) / scale;
  const pad = 4 / Math.min(1, minimumScale);
  // Keep the halving grid anchored to source pixels; one rounded crop pixel must not
  // change the sampling phase throughout the image (especially at quarter turns).
  const grid = 2 ** Math.max(0, Math.floor(Math.log2(1 / scale)));
  const left = Math.max(0, Math.floor((Math.min(...corners.map(p => p.x)) - pad) / grid) * grid);
  const top = Math.max(0, Math.floor((Math.min(...corners.map(p => p.y)) - pad) / grid) * grid);
  const right = Math.min(image.naturalWidth, Math.ceil((Math.max(...corners.map(p => p.x)) + pad) / grid) * grid);
  const bottom = Math.min(image.naturalHeight, Math.ceil((Math.max(...corners.map(p => p.y)) + pad) / grid) * grid);
  if (right > left && bottom > top) {
    ctx.setTransform(a, b, c, d, dx + kx * (m[4] - v.x), dy + ky * (m[5] - v.y));
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    drawRegion(ctx, image, left, top, right - left, bottom - top, scale);
  }
  return canvas;
}

export function toBlob(cropper: ExportSource, options: ExportOptions = {}): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = toCanvas(cropper, options);
    try {
      canvas.toBlob(blob => {
        canvas.width = canvas.height = 0;
        blob ? resolve(blob) : reject(new Error('Image encoding failed'));
      }, options.type ?? 'image/png', options.quality ?? .92);
    } catch (error) { canvas.width = canvas.height = 0; reject(error); }
  });
}
