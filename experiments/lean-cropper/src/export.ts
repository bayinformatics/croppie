import type { LeanCropper } from './core';

export interface ExportOptions {
  width?: number;
  height?: number;
  background?: string;
  type?: string;
  quality?: number;
}
type ExportSource = Pick<LeanCropper, 'getState' | 'getSource'>;

/** The same oriented image and affine matrix used by CSS, translated into crop space. */
export function toCanvas(cropper: ExportSource, options: ExportOptions = {}): HTMLCanvasElement {
  const s = cropper.getState(), v = s.viewport, m = s.transform;
  const width = Math.round(options.width ?? (options.height ? options.height * v.width / v.height : v.width));
  const height = Math.round(options.height ?? width * v.height / v.width);
  if (![width, height].every(n => Number.isFinite(n) && n > 0 && n <= 8192) || width * height > 16_777_216) throw new Error('Export exceeds 8192px per side or 16777216 pixels');
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Canvas 2D unavailable');
  if (options.background) { ctx.fillStyle = options.background; ctx.fillRect(0, 0, width, height); }
  const x = width / v.width, y = height / v.height;
  ctx.setTransform(x * m[0], y * m[1], x * m[2], y * m[3], x * (m[4] - v.x), y * (m[5] - v.y));
  ctx.imageSmoothingQuality = 'high'; ctx.drawImage(cropper.getSource().image, 0, 0);
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
