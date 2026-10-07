# Hybrid cropper quality export

The isolated hybrid now exports through progressive native Canvas downsampling with the original browser-oriented image, arbitrary affine rotation/reflection, circular masks, proportional letterboxing, and production output caps. Chromium, Firefox, and WebKit pass the dedicated exporter checks. Full-photo 5120px → 320px and 48MP → 320px exports are **pixel-identical to the current production renderer within each browser**.

This is the exporter half of the experiment, based on `a00608009bc60a9dbf1144ad239291cb7fa5b6fc`. It does not replace production Croppie. Coverage/core integration and common tests remain the coordinator's work.

## Commits and scope

| Commit | Contents |
| --- | --- |
| `7d7d4a39f420972f4c67a63e8ec10ec0ef0dd2ac` | `src/export.ts` and new `src/resample.ts` under `experiments/lean-cropper` |
| `964a9c48d27046457e40c6d4c71ba253eba8d7dd` | New dedicated `checks/export.check.ts` and `checks/export.check.mjs` |
| Report commit following those commits | This document only |

No production source/config, core/model/affine/CSS, demo, common tests/build/README, dependencies, or historical evidence was changed. The public `toCanvas(cropper, options)` / `toBlob(cropper, options)` contract remains structural; `getState()` locally accepts optional `mask: 'rect' | 'circle'`, and a missing mask means rectangle.

## Rendering and ownership

1. Validate supplied width/height **before** rounding: nonnumbers, blank strings, nonfinite values, zero, and negative values reject. Positive fractional dimensions round to at least one pixel. Cap valid oversized dimensions proportionally at **16,384 per side / 16,777,216 pixels**, including finite requests as large as `1e308`; the side cap precedes area multiplication to avoid overflow.
2. Contain-fit the logical crop into a requested output of a different aspect. Clip the image to that fitted rectangle or its inscribed ellipse, so rotated image pixels cannot leak into the bars. Fill the background first, including the bars and area outside the mask. Shapes differing only by integer rounding use production's `isRoundedShape` rule and fill exactly; 5120×2915 → 320×182 has no faint transparent border.
3. Inverse-project the four viewport corners, add four output filter pixels of support in the most compressed direction, align the bounding region to the halving grid, then intersect with the original image. This avoids a full-resolution staging canvas. The grid alignment prevents a one-source-pixel rounding discrepancy from changing the sampling phase across a quarter-turn crop.
4. Halve that region through native HTML canvases while preserving detail along the affine transform's largest singular value. Map the final buffer back into exactly the same source rectangle and affine output transform. The smallest singular value determines filter padding. No EXIF transform is applied a second time.
5. Returned canvases belong to the caller. Downsample surfaces are never zeroed, including after final drawing; they use normal garbage collection. Only the private final `toBlob` canvas is cleared, after its encoding callback (or a synchronous encoding failure). The original image, object URL, Blob, and crop state remain unchanged.

There is no quality opt-in, engine detection, worker, OffscreenCanvas, WASM, decoder dependency, or new renderer abstraction. The progressive strategy is adapted from `src/canvas/draw.ts`, with arbitrary affine output and relevant-region sampling replacing the quarter-turn-only geometry.

## Reproduce

```sh
export PATH=/tmp/croppie-performance-2026-10-06/tools:$PATH
bun install --frozen-lockfile
bunx tsc -p experiments/lean-cropper/tsconfig.json
node experiments/lean-cropper/checks/export.check.mjs
```

The test runner builds its own test-only modules, starts/stops a server on an OS-assigned ephemeral port, and writes generated fixtures, output PNGs, comparison strips, and `results.json` to `.cache/hybrid-export`. It never reuses 4197 or 4173. `HYBRID_EXPORT_BROWSERS=webkit` selects an engine; `HYBRID_EXPORT_OUTPUT` changes the evidence directory. `HYBRID_PHOTO_48MP` can point to the reusable 48MP fixture; otherwise the runner uses the local performance fixture or generates the same rescaled garden image. The recorded run read the coordinator's existing fixture without modifying it.

Toolchain: **Bun 1.4.2**, **Node v24.16.0**, **zlib 1.3.1-e00f703**, **Pillow 10.4.0**, installed Playwright 1.63.0. Engines: Chromium **153.0.8010.12**, Firefox **155.0**, WebKit **26.6**. Frozen installation made no dependency changes; TypeScript and `git diff --check` passed.

## Geometry, lifecycle, and production agreement

| Check | Evidence |
| --- | --- |
| Analytic geometry | Six states per engine: axis-aligned, 90° plus reflection, 37.25°, −28.75° with horizontal flip and ellipse, 123.4° with both flips and ellipse, and 11.2° with shear/reflection. Fractional viewports and mismatched output aspect included. **163,554 sampled pixels per engine; zero errors** in independently inverse-projected solid interiors and empty regions. |
| Production quarter turns | Four rotations × rectangular/elliptical mask per engine: **24 comparisons**. Chromium/WebKit byte-identical; Firefox worst raw RGBA MAE **0.5219**, premultiplied RGBA RMSE **1.2721**. Gate: raw MAE <0.6 and premultiplied RMSE <2. |
| Full-photo production equality | Both 5120×2915 and 8000×6000 fixtures, all engines: **six pixel-identical comparisons**, and all border alpha values exactly 255. |
| Original detail | A 256×192 one-pixel-line crop from an image displayed at 0.1 scale, and a 257×193 crop from the original 48MP photo: **pixel-identical**, one output canvas, zero downsample canvases. |
| Lifetime and formats | Repeated exports preserve caller pixels and original source/state. PNG re-decoding exactly matches Canvas output. Null/throwing encoders reject; a pending encoder retains its canvas. PNG/WebP transparency, explicit white JPEG background, native MIME fallback, and post-encoding output release all pass. |

The analytic test excludes eight source pixels around color/alpha edges so it tests coordinate placement separately from native filter kernels. It compares premultiplied RGBA; WebKit can legitimately report a straight RGB value of 255 on an alpha-2 fringe. Raw pixel statistics remain recorded. Tests initially exposed and fixed a real region-grid phase error; acceptance was not satisfied by relaxing the photo quality gates.

Production snaps intersected image edges to whole output pixels for free/out-of-source crops. The hybrid preserves fractional affine placement instead. Pixel equality is therefore asserted where those geometries agree; fractional/free and arbitrary-angle cases use independent affine geometry and resampling references. Filter differences at transparent boundaries are not treated as proof of a geometry error or as proof of exact production parity.

Additional checks cover missing-v1-mask compatibility, transparent/free out-of-source viewports, circular backgrounds, letterbox clipping, one-dimension aspect preservation, tiny/huge/invalid dimensions, and EXIF orientations 1–8 against independently transposed Pillow fixtures. EXIF MAE is **0** in Chromium/Firefox and **0.1680/255** in WebKit, below the unchanged 1.5 threshold. PNG/JPEG work in every engine; WebP is native WebP in Chromium/Firefox and falls back to PNG in this WebKit build. Unsupported requested MIME also falls back to PNG.

## Resampling quality

The dedicated runner compiles and calls the **actual production `src/canvas/draw.ts`**. Its separate native progressive reference retains every intermediate and renders the entire original image, providing a comparison to the region-based hybrid. The single-pass comparison uses the same geometry/mask as the hybrid. The original prototype's single pass is also captured separately where its semantics match.

The old common progressive check cleared scratch dimensions and used an unnecessary full-image staging canvas. Given the independently reproduced WebKit reset differences, its historical **0.4401 MAE / 49.96 dB** result is not a valid production target. That historical artifact was not edited. All new measurements below retain the surfaces and use the current production renderer.

### Full photos versus plain Pillow Lanczos

These values retain the historical plain-Lanczos metric. The hybrid, production, and retained full-image progressive reference have identical pixels for these cases.

| Image / browser | Old single-pass MAE | Hybrid = production MAE | Old PSNR | Hybrid = production PSNR |
| --- | ---: | ---: | ---: | ---: |
| 5120 → 320×182 / Chromium | 4.6721 | 5.4470 | 31.29 dB | 29.86 dB |
| 5120 → 320×182 / Firefox | 11.6904 | 5.1705 | 22.90 dB | 30.63 dB |
| 5120 → 320×182 / WebKit | 10.0438 | 4.5294 | 24.18 dB | 31.31 dB |
| 48MP → 320×240 / Chromium | 4.0827 | 4.1460 | 33.05 dB | 32.81 dB |
| 48MP → 320×240 / Firefox | 11.9373 | 4.0827 | 22.77 dB | 33.05 dB |
| 48MP → 320×240 / WebKit | 11.9263 | 3.5223 | 22.78 dB | 33.77 dB |

This closes the large Firefox/WebKit aliasing gap to production. It does **not** improve every engine: Chromium's native high-quality single pass is slightly sharper than repeated halving for these photos. The hybrid deliberately retains the production strategy consistently across engines. No browser-dependent quality shortcut was introduced.

### Arbitrary angles and partial/transparent crops

The independent affine oracle uses Pillow Lanczos prefiltering, a 4× bicubic affine render, and Lanczos reduction. It applies the same logical crop and mask, rather than comparing a rotated result with an unrotated resize. Pixels are composited onto white for RGB MAE/PSNR; geometry and alpha are independently checked above. Each cell is **single-pass MAE → hybrid MAE**.

| Scenario | Chromium | Firefox | WebKit |
| --- | ---: | ---: | ---: |
| 5120px photo, 37.25° | 5.166 → 5.727 | 9.480 → 5.405 | 8.672 → 5.251 |
| 48MP, −28.75°, flip, ellipse | 3.401 → 3.530 | 9.352 → 3.339 | 9.543 → 3.114 |
| 48MP, 123.4°, flip, fractional viewport, square letterbox | 2.603 → 2.704 | 7.203 → 2.602 | 7.431 → 2.471 |
| 5120px photo, 20% region, 19.3°, fractional viewport | 3.865 → 3.479 | 6.123 → 3.345 | 4.040 → 3.726 |
| Transparent artwork, 37.25°, flip, ellipse, letterbox | 0.601 → 0.538 | 0.855 → 0.642 | 0.870 → 0.525 |

The gates were set before the measured run: every ordinary UI transform scenario has hybrid MAE ≤6; Firefox/WebKit full-photo and strongly reduced rotation scenarios improve PSNR by at least 4 dB over the geometry-matched single pass; full-photo MAE stays within production ×1.2 +0.6. The final suite additionally requires exact full-photo production pixels. All pass. The thresholds do not claim that Canvas and Pillow use identical kernels or that one photograph certifies every image class.

### Explicit shear and anisotropic limits

The UI generates rotation, uniform scale, and reflections. Restored affine matrices may also contain shear or nonuniform scale. Geometry remains supported, but using the largest singular value to preserve detail cannot fully prefilter the more compressed direction. The implementation intentionally does not blur away the sharper direction to improve a global metric.

| Stress transform | Chromium hybrid MAE / PSNR | Firefox hybrid MAE / PSNR | WebKit hybrid MAE / PSNR |
| --- | ---: | ---: | ---: |
| 70° shear plus 17.5° rotation | 4.255 / 29.87 dB | 6.707 / 25.50 dB | 6.735 / 25.51 dB |
| Vertical scale 0.08, horizontal scale 1 | 13.800 / 23.08 dB | 18.786 / 20.01 dB | 18.972 / 19.93 dB |

These cases are measured and excluded from the uniform-transform quality claim. The anisotropic oracle separately Lanczos-filters both source axes; the shear oracle remains a finite 4× approximation, not an exact area integrator. WebKit's anisotropic MAE is worse than its single-pass **15.509**, despite similar PSNR. Strong anisotropic/sheared exports therefore remain a visible quality limitation.

## Allocation observations

The 48MP source is sampled directly into **4000×3000**, then 2000×1500, 1000×750, and 500×375; there is no 8000×6000 staging canvas. All scratch surfaces stay below the area/side caps. The instrumented sum is **15,937,500 scratch pixels / 63,750,000 nominal RGBA bytes**, plus the 320×240 output. This is allocation accounting with deliberately retained test references, **not measured resident/GPU memory**; original image decoding and collection timing are additional costs.

The rotated 20% photo-region case first reads roughly **1.09MP** of the 14.92MP source, rather than resampling the entire image. At original-detail scale the exporter uses the image directly and creates no scratch surface. If a capped intermediate would undershoot the sharp-axis target, halving stops; a larger source can also require a first capped reduction beyond 2×. The current bounds are per-surface, not a guarantee of total memory safety or quality for arbitrarily large inputs. Tiled rendering and device-memory profiling were not added.

## Actual payload sizes

Bun minification, no source maps, gzip level 9 through Node. These measurements include this exporter with the **baseline core/CSS**; the coordinator must remeasure the combined coverage+export integration.

| Artifact | Raw bytes | gzip9 bytes |
| --- | ---: | ---: |
| Component core JS | 9,258 | 3,479 |
| Quality export JS, including affine/resampling helpers | 2,705 | 1,285 |
| Required component CSS | 1,363 | 579 |
| **Component total** | **13,326** | **5,343** |
| **Complete existing demo total** | **21,925** | **8,777** |

The complete demo total includes its bundled JS (14,192 raw / 5,389 gzip), required CSS, demo CSS (2,752 / 1,153), HTML (2,812 / 1,237), and sample SVG (806 / 419). Its bundled JS already contains core/export; those standalone bundles are not counted again. No runtime dependency, worker, decoder, or WASM bytes are omitted. The 6–7KB combined-component budget remains a target for the coordinator's integrated result, not a claim about this baseline-core subtotal or the full demo.

## Fixture provenance and practical limits

| Fixture | Dimensions | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| Repository `garden-5120.jpg` | 5120×2915 | 3,345,561 | `4ca9cf44dabbd0945dd940e649bc30f8dadbe2fb5b9ff85dbb4db31bbbd218ba` |
| Reused `photo-48mp.jpg` | 8000×6000 | 11,006,443 | `694d490c6411aced1d979e340a82ad53f075c125a1b392ee6c192342512fc7dc` |
| Generated alpha/landmark artwork | 1024×768 | 6,465 | `54be977ea505299afee7fccdbaae0c08cf2fb22d6a467589bec4db3ce308586a` |
| Generated single-pixel detail | 2400×1600 | 14,898 | `95652a4ddd9b8c166c8c1a0e04752a8d3942d2798df8b7941ed1e40bd4305c83` |

The 48MP fixture is a reproducibly rescaled repository photograph, not a claim of original 48MP camera detail. The separate single-pixel artwork verifies detail retention. Measurements are local desktop browser results, not real Safari/iOS/Android coverage, an HDR/ICC/metadata guarantee, or a speed benchmark. Generated `*-comparison.png` strips show Pillow, single pass, hybrid, and retained progressive output in that order. The complete machine-readable result remains at `.cache/hybrid-export/results.json`; all durable conclusions needed to review this change are recorded here.
