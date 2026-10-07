// build.mjs adapts this import with guarded substitutions, preserving the full algorithm.
import { drawCroppedImage } from "../../src/canvas/draw.ts";

let supported = false;
let reason = "";
try {
  supported = typeof createImageBitmap === "function" &&
    typeof OffscreenCanvas === "function" &&
    typeof OffscreenCanvas.prototype.convertToBlob === "function" &&
    !!new OffscreenCanvas(1, 1).getContext("2d");
  if (!supported) reason = "Worker createImageBitmap / OffscreenCanvas 2D / convertToBlob unavailable";
} catch (error) {
  reason = String(error);
}
postMessage({ ready: true, supported, reason });

self.onmessage = async ({ data: { id, input, isBlob, spec } }) => {
  const started = performance.now();
  let bitmap;
  try {
    // Default decoding honors EXIF once, including mirrored orientations.
    bitmap = isBlob ? await createImageBitmap(input) : input;
    const decoded = performance.now();
    const canvas = drawCroppedImage(bitmap, spec.frame, spec.width, spec.height, spec.options);
    const drawn = performance.now();
    const blob = await canvas.convertToBlob({ type: "image/png" });
    const encoded = performance.now();
    postMessage({
      id, blob,
      dimensions: [bitmap.width, bitmap.height],
      decodeMs: decoded - started,
      drawMs: drawn - decoded,
      encodeMs: encoded - drawn,
      workerTotalMs: encoded - started,
    });
  } catch (error) {
    postMessage({ id, error: String(error) });
  } finally {
    // Close only the consumed input after encoding; never reset intermediate canvases.
    bitmap?.close();
  }
};
