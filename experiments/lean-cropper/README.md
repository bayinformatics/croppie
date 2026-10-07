# Hybrid cropper experiment

The lean affine prototype now has **arbitrary-angle image coverage, progressive quality export, circular masks, and proportional output sizing**. Production Croppie remains unchanged. This is a candidate design for a future interface, not a drop-in replacement or a published package.

Measured with Bun 1.4.2 and Node gzip level 9:

| Selected browser assets | gzip9 |
| --- | ---: |
| Widget + quality exporter + required CSS | **6,188 bytes** |
| The same, with optional JPEG EXIF reporting | **6,785 bytes** |
| Complete demo, including controls, HTML, both stylesheets, and sample SVG | **10,232 bytes** |

The original single-pass prototype was 4,627 bytes for the widget/export/CSS subtotal. The restored guarantees cost 1,561 bytes. Totals sum independently compressed response bodies; demo JS already bundles core/export, so standalone bundles are not counted again. Read the [hybrid validation report](../reports/hybrid-validation.md) for measured results and limits, and the [original experiment report](../reports/lean-redesign.md) for historical evidence.

## Run and use

Use the version in the root `.bun-version` and the existing frozen dependencies:

```sh
bun experiments/lean-cropper/build.ts
bun experiments/lean-cropper/serve.ts
```

Open **http://127.0.0.1:4197/experiments/lean-cropper/dist/**. `LEAN_PORT` selects another unused port. This session's pinned Bun is `/tmp/croppie-performance-2026-10-06/tools/bun`; prepend that directory to `PATH` if your global Bun differs. No external fonts, frameworks, workers, WASM, or image-processing runtime dependencies are needed.

```ts
import { LeanCropper, type CropState } from './src/core';
import { toBlob, toCanvas } from './src/export';
import './src/core.css';

// The host needs a visible, nonzero width and height.
const cropper = new LeanCropper(host, {
  aspect: 1,             // null permits free aspect
  coverage: 'fill',      // default: keep the whole crop covered
  mask: 'circle',        // default is 'rect'
  onChange(state) { /* detached snapshot, after the synchronous update */ },
});
await cropper.load(file); // Blob/File or a URL fetched with normal CORS rules
cropper.rotate(37.25);   // clockwise delta around the crop center
cropper.flip('horizontal');
cropper.zoom(1.2, { x: 150, y: 90 });
cropper.pan(20, -10);
cropper.setViewport({ x: 80, y: 60, width: 240, height: 240 });

const saved: CropState = cropper.getState();
cropper.setState(JSON.parse(JSON.stringify(saved)));
const blob = await toBlob(cropper, {
  width: 512, type: 'image/jpeg', quality: .9, background: '#fff',
});
const canvas = toCanvas(cropper, { width: 512 }); // caller owns this canvas
cropper.setCoverage('free'); // explicit permission for transparent crop edges
cropper.setMask('rect');
cropper.reset();
cropper.destroy();
```

The exporter imports only core types. Applications that crop on a server can omit it; when included, progressive downsampling is the default. Optional tag reporting is a separate entry and is absent from core, export, and demo JS:

```ts
import { readBlobOrientation, readJpegOrientation } from './src/exif';
const orientation = await readBlobOrientation(file);
// readJpegOrientation(bytes) accepts a Uint8Array instead.
```

These JPEG helpers reuse the production parser, including its bounded header scan. They report metadata; they do not orient the image. The browser handles visual orientation once.

The demo server serves only built assets, test fixtures, the check harness, and the two comparison photographs. Repository files, symlink escapes, and non-local Host/Origin requests are rejected.

The demo offers **Circle** as a single choice: it selects and locks Square automatically, including after a new image loads. **Ellipse** allows oval crops with an editable aspect ratio. The lower-level mask interface remains general for custom controls.

## Geometry and guarantees

`CropState` remains version 1: oriented image dimensions, stage dimensions, `transform: [a,b,c,d,e,f]`, viewport `{x,y,width,height}`, aspect, and optional `mask: 'rect'|'circle'`. The matrix maps source pixels to stage CSS pixels. Existing states without `mask` normalize to rectangle. The original Blob is not serialized; dimensions are a basic consistency check, not an image identity check.

1. **Coverage:** `fill` inverse-projects viewport corners into the original image and corrects zoom/pan only when needed. It supports arbitrary rotation, reflections, and valid shear. Attempts below the minimum do not drift toward the pointer. The minimum can exceed the normal zoom ceiling for tiny images. `free` retains unrestricted pan. Coverage is instance policy; restoring saved geometry obeys the current policy.
2. **Masks and resizing:** `'circle'` is the ellipse inscribed in the viewport; choose aspect 1 for a circle. Preview and export use the same mask. Coverage conservatively covers its rectangular frame. `setViewport` clamps to the stage; fixed-aspect width drives height. Responsive resizing/restoring uniformly fits the saved stage and preserves the source correspondence. Reset refits while keeping the current aspect/mask; new loads use the constructor aspect and retain the selected mask/coverage.
3. **Export:** inverse-project the crop, select a relevant source region with filtering support, progressively halve it, and apply the same affine map into output space. Large-photo tests match the actual production renderer. One requested dimension preserves aspect; two different-aspect dimensions contain-fit with transparent/background bars. Pixel-rounded matching shapes fill exactly. Positive finite sizes are validated before rounding and capped proportionally to 16,384 pixels per side / 16,777,216 pixels total.
4. **Lifetime:** fetch/decode failures and superseded loads do not replace the previous good image; a new load or destroy prevents stale installation. Object URLs and observers are cleaned up. `getState`/callbacks return detached snapshots. `getSource` returns the original Blob and a borrowed image element; consumers must not mutate it. Returned canvases stay alive. Private Blob-output canvases are cleared after encoding; downsample intermediates are left to normal collection because early resets changed WebKit pixels.
5. **Events:** state/DOM updates and `onChange` are synchronous. Invalid modes and non-finite derived geometry reject before installation. Repeating the same coverage or mask is a no-op. Callbacks run after state is committed; callback exceptions propagate and do not roll back that committed state.

## Verification

Existing Playwright and Python/Pillow supply test tooling only. Build before the common browser checks. Every automated browser runner owns its server; use a different `LEAN_PORT` from any open manual demo.

```sh
node_modules/.bin/tsc -p experiments/lean-cropper/tsconfig.json
bun experiments/lean-cropper/checks/model.check.ts
bun experiments/lean-cropper/checks/coverage.check.ts
node experiments/lean-cropper/checks/export.check.mjs
node experiments/lean-cropper/checks/server.check.mjs
python3 experiments/lean-cropper/checks/make-fixtures.py
LEAN_PORT=42972 LEAN_EVIDENCE=.cache/hybrid/common node experiments/lean-cropper/checks/browser.check.mjs
LEAN_EVIDENCE=.cache/hybrid/common python3 experiments/lean-cropper/checks/quality.py
LEAN_PORT=42971 node experiments/lean-cropper/checks/hybrid.check.mjs
```

`LEAN_BROWSERS=chromium` narrows common/coverage/hybrid checks; `HYBRID_EXPORT_BROWSERS` narrows exporter checks. Generated fixtures, bundles, and evidence are ignored. Test-only `production-export.js` and affine alternatives are not requested by the demo and are excluded from its payload accounting. The original [recorded evidence](recorded/verification.json) describes the earlier single-pass experiment; current results are linked from the hybrid report.

## Remaining limits

1. No legacy Croppie methods/events/points adapter, undo history, snapping, or published declaration/package distribution. The stage must be visible and sized for initial load; very small crop handles can overlap.
2. Resampling quality is validated for the rotation, uniform scaling, and reflection generated by the controls. Strong imported shear/nonuniform scaling can still alias. Chromium's native single pass is slightly sharper on some photos; the hybrid consistently uses the production progressive strategy.
3. Per-canvas caps are not a total memory guarantee. Original image decoding, browser collection, and GPU allocation remain browser-managed. No file-size/decode-memory budget, tiling, or physical-device memory benchmark is implemented.
4. No metadata preservation, HDR/ICC/wide-gamut guarantee, HEIC/RAW fallback, or animated-frame policy. Native MIME fallback applies. EXIF tag reporting is optional and JPEG-specific.
5. Desktop Chromium/Firefox/WebKit, real Chromium multi-touch automation, keyboard controls, and responsive layout are tested. Physical Safari/iOS/Android, assistive technology, high contrast, localization, and rotated/skewed ancestors remain unvalidated.

Runtime code, sample SVG, and fixture logic were authored in this repository; production resampling/EXIF behavior is reused or adapted under the repository license. Tests use the existing garden photos; those photos are not part of the demo payload.
