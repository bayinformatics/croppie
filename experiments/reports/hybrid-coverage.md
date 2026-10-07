# Hybrid cropper: coverage and core

The coverage/core half is complete on baseline `a00608009bc60a9dbf1144ad239291cb7fa5b6fc`. This remains an experiment. Changes are confined to `experiments/lean-cropper/src/{model.ts,core.ts,core.css}`, the new `checks/coverage.check.ts`, and this report.

## Integration contract

| Surface | Implemented behavior |
| --- | --- |
| `Options.coverage?: 'fill' \| 'free'` | Defaults to `fill`. `setCoverage(mode)` updates instance policy, immediately constrains an existing state when entering fill, and calls `onChange` once. Repeating the current mode is a no-op; setting policy before load emits no callback. Coverage is not serialized. |
| `Options.mask?: Mask`, `setMask(mask)` | `Mask` is publicly exported as `'rect' \| 'circle'`; default is `rect`. A changed mask emits one synchronous callback after load. Reset and later loads retain the selected mask. |
| `CropState.mask?: Mask` | Existing version-1 states remain readable. Missing mask normalizes to `rect`; `getState()` and callbacks include the normalized value. Restore adopts the saved mask and obeys the instance's current coverage policy. |
| Circle preview | The crop outline and outside dimming follow the ellipse inscribed in the rectangular viewport. Corner and move buttons remain outside clipping and remain hit-testable. Coverage conservatively fills all four rectangular corners, including those outside the ellipse. |
| Free mode | Pan remains unbounded; zoom retains the area-equivalent `.001…64` range. Invalid input and non-finite derived geometry reject before the previous state changes. |

The original decoded image and Blob remain the source. CSS consumes the single source-to-stage affine tuple. No raster work occurs during gestures, and there are no dependency additions, native-private fields, workers, WASM, or new module frameworks.

## Coverage geometry and numerical behavior

The solver inverse-transforms all four viewport corners relative to the viewport center using the inverse linear part of the existing affine tuple. Their source-space spans determine the required uniform enlargement. It clamps the source point under the viewport center into the interval that keeps those corners inside the source rectangle, then reconstructs translation only when a correction is needed. Measuring centered corners avoids losing their span during extreme pan; reconstructing a bounded center avoids subtracting two huge pan translations.

Rotation, reflections, and arbitrary existing shear are retained. This does not use the rotated image's stage-space bounding box. There is no new rotation/scale-only validation restriction. The existing finite determinant and `abs(det) >= 1e-12` state validation rule remains. When finite input nevertheless produces an unrepresentable inverse or derived affine tuple, the operation throws without installing it; a failed coverage switch also retains the previous policy.

Zoom clamps its factor before applying the requested anchor. The lower bound is the current coverage requirement (or the old `.001` floor, whichever is larger); the upper bound is at least that requirement even when tiny images need scale above `64`. Repeated attempts below the minimum preserve the exact state instead of drifting toward the pointer. A relative `1e-12` roundoff tolerance prevents repeated numerical corrections at boundaries. Changes that need no coverage correction retain their requested anchor.

All mutation paths use validated candidates: API pan/zoom/rotate/flip, viewport/aspect changes, corner/crop gestures, pinch, responsive resize, state restore, load, and reset. Load computes its candidate before replacing a previous good source. Callback snapshots remain detached and synchronous; normal JavaScript Proxy receivers continue to work.

The checks exposed two existing fit-roundoff cases: initial centering and stage reframing could produce tiny negative offsets (for example, `-5.68e-14px` during a `646×529` to `763×629` resize). Nonnegative fit margins now prevent valid edge-aligned crops from failing validation. Same-size reframing also returns an exact copied state, preserving serialization at the zoom boundary.

## Verification

Executed with the supplied Bun **1.4.2** and existing frozen dependencies. The new check bundles the core in memory and binds an OS-assigned localhost port; it neither reads nor writes shared `dist`, fixtures, or historical evidence.

| Check | Result |
| --- | --- |
| TypeScript (`tsc -p experiments/lean-cropper/tsconfig.json`) | Passed |
| Existing `model.check.ts` | 4,969 assertions; 400 seeded transforms; 60 resize combinations |
| New initialization properties, seed `27` | 20,000 varied stage/aspect initial states passed |
| Chromium `153.0.8010.12` | 28,409 assertions; 1,680 seeded operations; 1,693 four-corner coverage observations; 168 minimum-tightness checks; 8 gesture checks |
| Firefox `155.0` and WebKit `26.6` | Each passed the same assertions, seeded operations, coverage observations, and tightness checks, plus 5 gesture checks |

The browser property sequence uses seed `0x5eedc0de`, six square/non-square sources from `1×1` to `4096×3072`, near/exact quarter-turns, both reflections, independently generated shears, aspect/viewport changes, real ResizeObserver resizes, restore into another stage, extreme pan up to `1e20`, and varied zoom factors. Native `DOMMatrix.inverse().transformPoint()` checks all four source-space corners independently of the solver. A further slight shrink must uncover a corner at every checked minimum; this also guards against an overly conservative solver.

Additional assertions cover unconstrained rotation/zoom anchors, exact below-minimum stability, serialization, fill/free switching and policy persistence on failure, mask defaults/restores, detached synchronous callbacks, malformed modes, finite-input overflow, Proxy receivers, failed/racing loads, original Blob identity, old/current object-URL revocation, reset, and destroy. Real mouse pan, wheel, corner dragging, and keyboard controls run in all three browsers; Chromium also exercises real CDP multi-touch pinch below/above the minimum and cancellation. This is desktop browser automation, not a physical touch-device audit.

Reproduce from the repository root:

```sh
export PATH=/tmp/croppie-performance-2026-10-06/tools:$PATH
node_modules/.bin/tsc -p experiments/lean-cropper/tsconfig.json
bun experiments/lean-cropper/checks/model.check.ts
bun experiments/lean-cropper/checks/coverage.check.ts
bun experiments/lean-cropper/build.ts
```

`LEAN_BROWSERS=chromium` can restrict the new browser check for diagnosis. The full run passed **5,040 seeded operations**, **85,227 browser assertions**, **5,079 coverage observations**, and **504 minimum-tightness checks**, in addition to the 20,000 initialization cases and existing model checks.

The unchanged build succeeded. Local core-only size is **11,509 raw / 4,278 gzip9 bytes** for `core.js`, plus **1,408 raw / 594 gzip9 bytes** for required `core.css`: **4,872 gzip9 bytes** combined. The combined hybrid exporter/demo totals must be measured after integration; this worktree retains the baseline exporter and demo.

## Parent integration work

1. Preserve explicit free-mode tests in the existing browser suite. The old exact-delta mouse pan, unconstrained keyboard pan, anchored pinch, and intentionally transparent/white empty-crop assertions assume the previous free default. Select `free` for those cases, or replace the geometry expectations with fill invariants where testing fill is intended.
2. Keep the shared browser suite, demo, README, build scripts, exporter, and recorded historical evidence under their assigned owners. None was edited here. The new coverage check supplies fill behavior independently.
3. Integrate the export worker's ellipse support using optional `state.mask`; legacy missing values mean rectangle. Preview uses conservative rectangular coverage for either mask. Parent validation still owns combined preview/export visual agreement, export quality, runtime/performance measurements, and demo controls/documentation.

No production source, push, publication, or external-channel message was made.
