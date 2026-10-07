/** Production Canvas limits, with the side cap applied first to avoid area overflow. */
export function capSize(width: number, height: number) {
  let scale = Math.min(1, 16384 / width, 16384 / height);
  width *= scale; height *= scale;
  scale = Math.min(1, Math.sqrt(16777216 / (width * height)));
  width *= scale; height *= scale;
  const w = Math.max(1, Math.round(width)), h = Math.max(1, Math.round(height));
  return w * h <= 16777216 ? { width: w, height: h }
    : { width: Math.max(1, Math.floor(width)), height: Math.max(1, Math.floor(height)) };
}

/**
 * Halve the relevant original-image region, then put it back in the SAME source coordinates.
 * The largest affine singular value protects detail along the least compressed direction;
 * strong shear/anisotropy can therefore still alias along its more compressed direction.
 * No full-image staging copy, readback, EXIF transform, or scratch bitmap resets.
 */
export function drawRegion(ctx: CanvasRenderingContext2D, image: HTMLImageElement,
  x: number, y: number, width: number, height: number, scale: number) {
  let source: HTMLImageElement | HTMLCanvasElement = image;
  let sx = x, sy = y, sw = width, sh = height;
  const targetWidth = width * scale, targetHeight = height * scale;
  while (sw / 2 >= targetWidth && sh / 2 >= targetHeight) {
    const size = capSize(sw / 2, sh / 2);
    // Capping a very large/sheared region must not discard detail along its sharp axis.
    if (size.width < targetWidth || size.height < targetHeight || (size.width >= sw && size.height >= sh)) break;
    const step = document.createElement('canvas');
    step.width = size.width; step.height = size.height;
    const next = step.getContext('2d');
    if (!next) break;
    next.imageSmoothingEnabled = true; next.imageSmoothingQuality = 'high';
    next.drawImage(source, sx, sy, sw, sh, 0, 0, step.width, step.height);
    source = step; sx = sy = 0; sw = step.width; sh = step.height;
  }
  ctx.drawImage(source, sx, sy, sw, sh, x, y, width, height);
  // WebKit pixels change if intermediates are zeroed, even after the final draw. Use GC.
}
