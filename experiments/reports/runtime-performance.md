# Runtime performance experiment

Integrate **05725a2** and **365c5cc** for the compatible runtime improvements. Keep the canvas-release experiments out of production: **5f9881f was reverted by b660237** after real WebKit pixel regressions. The final source tree contains only the two hot-path changes.

Baseline: `76540ff3ec7f95b6adae2615f630e80cbc33c523`. Final measured source: `b660237` (equivalent to `365c5cc` for source/tests). Date: October 6, 2026, America/Denver.

## Accepted changes and evidence

| Change | Measured work avoided | Compatibility checks |
| --- | --- | --- |
| `05725a2`: calculate update payloads only while the live update-listener set is nonempty | For 1,000 small wheel or programmatic zoom changes without subscribers, public `get()` invocations fall from 1,000 to **0**. For a 1,000-event alternating drag, they fall from 999 to **0**; the first move is stationary. | Logical state and preview transform stay synchronous. Existing listeners still receive one shared snapshot per event; nested zoom, removal/re-registration, and listeners added during `rotate` retain their ordering. |
| `365c5cc`: write slider value and spoken percentage only when the current DOM differs | For 1,000 small wheel changes, small programmatic zoom changes, or unchanged-zoom requests, `aria-valuetext` mutation records fall from 1,000 to **0**. | Reads the current DOM instead of caching it, so externally altered/clamped sliders still repair immediately. Percentage changes are visible before update callbacks. |

The subscribed workload still produces exactly 999 drag updates and 1,000 wheel/programmatic updates, each with one data snapshot. Public API, types, exports, gesture handlers, CSS classes, EXIF behavior, image binding and object-URL lifetime, and export algorithms are unchanged. No animation-frame batching, worker export, or additional asynchronous state was introduced.

### Production bundle cost

Bun 1.4.2 production build, including the linked source-map comment and excluding map files; gzip level 9 and Brotli quality 11 through **Node v24.16.0**, not Bun's zlib compatibility implementation.

| JS artifact | Baseline bytes | Final bytes | Delta |
| --- | ---: | ---: | ---: |
| Minified | 24,127 | 24,266 | +139 |
| gzip 9 | 8,205 | 8,238 | **+33** |
| Brotli 11 | 7,330 | 7,366 | +36 |

CSS is unchanged. With the coordinator's unchanged 1,354-byte gzip CSS artifact, combined gzip is 9,559 → 9,592 bytes. These numbers concern this worker's changes alone; the coordinator measures the combined size-worker/runtime result independently.

## Browser measurements

Environment: macOS 26.6.2 (25G83), arm64, Mac17,6, 18 logical CPUs, 128 GiB RAM; Bun 1.4.2, Node v24.16.0, Playwright 1.63.0. Installed engines: Chromium 153.0.8010.12 (revision 1243), Firefox 155.0 (1543), WebKit 26.6 (2359).

The helper owns an ephemeral localhost port; it never connects to another worktree's 4173 server. Each engine runs baseline/candidate/candidate/baseline in fresh pages, with 1,000 warm-up gesture operations and seven samples of 3,000 operations per page. Tables use the upper median of 14 samples per variant. Input is a deterministic, partially transparent 2048×1536 PNG, generated from pixel coordinates; a bound Blob avoids measuring large data-URL preview costs. Viewport is 128×96, boundary 300×250, zoom starts at 1, and small changes alternate around that zoom.

**All timings are exploratory:** other workers may consume CPU. Synthetic event dispatch measures synchronous processing in a tight loop, not interaction latency or frame rate. Firefox/WebKit timers resolve only whole milliseconds here; a displayed zero means below that resolution. Instrumentation is removed before timing. No timing threshold decides acceptance.

| 3,000 operations, no update subscriber | Chromium baseline → final, ms | Firefox baseline → final, ms | WebKit baseline → final, ms |
| --- | ---: | ---: | ---: |
| Alternating pointer drag | 4.9 → 4.4 | 7 → 6 | 6 → 5 |
| Small alternating wheel changes | 17.3 → 16.7 | 31 → 31 | 51 → 49 |
| Small alternating `setZoom` changes | 5.0 → 2.9 | 9 → 6 | 5 → 3 |
| `setZoom` at unchanged zoom | 3.6 → 0.1 | 5 → 0 | 2 → 0 |

Subscribed drags in Chromium measured 4.5 → 4.7 ms and subscribed wheel changes in Firefox 31 → 32 ms: small adverse observations remain in the raw evidence and are not dismissed as proven noise. Subscribed `setZoom` measured 4.9 → 3.2 ms, 9 → 6 ms, and 5 → 4 ms respectively. Isolated parent measurements should decide whether any throughput change is meaningful. The deterministic acceptance evidence is eliminated payload work and DOM writes, with unchanged event output.

Export performs two warmups and seven timed iterations per page for canvas, PNG/JPEG/WebP Blob, and PNG/JPEG/WebP base64, at quality 0.92. Final output encoding is unchanged. Chromium medians span roughly 2.8–4.0 ms, Firefox 2–3 ms, WebKit 0–1 ms; changes are zero or approximately one timer unit. WebKit falls back to PNG for WebP in this environment, and the helper records the actual MIME type. There is **no claimed export speedup** and no evidence supporting a new worker export path from this focused input.

Raw final comparisons: [Chromium](runtime-performance.chromium.json), [Firefox](runtime-performance.firefox.json), [WebKit](runtime-performance.webkit.json).

### Output and state verification

1. **876 Bun tests pass**, including six new tests for synchronous no-subscriber state/DOM, unsubscribe/re-subscribe, shared snapshots and nested events, subscriptions changed during `rotate`, spoken-percentage updates, and repair of externally altered sliders.
2. `bun run lint`, `bun run typecheck`, and `bun run build` pass. Baseline targeted integration/input/canvas run had 499 passes; the coordinator independently reported 870 baseline tests passing.
3. Final Chromium, Firefox, and WebKit runs all match baseline on **16 exact RGBA hashes**: four rotations × circle on/off × ordinary/fractional letterboxed framing, including a 129×97 output. All seven result type/format combinations match decoded pixel hashes and encoded byte lengths. Each browser's repeated baseline is also stable.
4. Final draw sequences and scratch allocation accounting match baseline. The coordinator owns the broader 12MP/48MP, EXIF, browser, and isolated alternating validation; this report does not substitute for that work.

## Rejected canvas experiments

The original algorithm leaves four downsample canvases after a 2048×1536 → 128×96 export. Instrumented accounting finds **1,044,480 scratch pixels**, equivalent to 4,177,920 RGBA bytes (3.984375 MiB) until collection, and a peak of 1,056,768 pixels including output. This is the sum of dimensions of instrumented canvases, **not measured resident/GPU memory**. Keeping references in the audit deliberately prevents garbage collection from obscuring ownership; ordinary browser collection timing is unspecified.

| Experiment | Allocation observation | Correctness result and decision |
| --- | --- | --- |
| Clear each consumed scratch canvas before the next halving; clear the last after output draw | Retained scratch pixels 0; instrumented peak 995,328 pixels | Chromium initially matched, but **all 16 WebKit canvas cases and encoded results differed**. Rejected and reverted. Source-only patch: [early release](../performance/scratch-release-early.patch); [full evidence](runtime-early-release.webkit.json). |
| Keep every scratch canvas through the output draw, then clear them together | Retained scratch pixels 0; peak remains 1,056,768 pixels | Tiny square probe and 128×96 export checks passed, but **8 of 16 WebKit 129×97 crop cases differed**. Rejected; source-only patch: [release after final draw](../performance/scratch-release-after-final.patch); [full evidence](runtime-after-final.webkit.json). |

The [standalone probe](../performance/scratch-release-probe.mjs) strips out Croppie, instrumentation, gestures, rotation, and encoding of the result. An 8×8 source reduced to 1×1 changes two channels, maximum difference 8, under early release; repeated retained baselines match. The 2048×2048 case changes 201,449 of 262,144 RGBA channels, maximum difference 33. [Probe results](runtime-scratch-release-probe.webkit.json) show that the weaker square case alone would have incorrectly approved after-final cleanup.

The coordinator independently reproduced early-release differences on real 12MP/48MP photo and transparent fixtures: it reported 63,518 of 65,536 output pixels differing for one 48MP → 256px case, maximum channel difference 43 and RGBA RMSE 5.00. This is corroborating coordinator evidence, not an additional measurement performed by this worker.

Changing canvas dimensions resets its bitmap, as specified by the [HTML canvas standard](https://html.spec.whatwg.org/multipage/canvas.html). These tests establish that the **timing of those resets changes this WebKit downsampling path**; they do not identify the browser's internal cause. Forced readbacks, delayed cleanup, browser detection, fewer halving steps, and weaker quality thresholds were not added. The original image/Canvas lifetime and native export paths remain in production.

Frame batching was also left unchanged: the current methods write the DOM before synchronous listeners and callers read it. Moving that work to a future frame would change observable behavior, and the measured redundant work can be removed directly without that tradeoff. No worker was assumed to be faster than native Canvas.

## Reproduction

Run from the repository root. Dependencies were installed with the frozen lockfile and no dependency changes.

```sh
export PATH=/tmp/croppie-performance-2026-10-06/tools:$PATH
bun install --frozen-lockfile
bun test
bun run lint
bun run typecheck
bun run build

bun experiments/performance/runtime-profile.mjs /tmp/runtime-chromium.json
PROFILE_BROWSER=firefox bun experiments/performance/runtime-profile.mjs /tmp/runtime-firefox.json
PROFILE_BROWSER=webkit bun experiments/performance/runtime-profile.mjs /tmp/runtime-webkit.json
```

The comparison builds the pinned baseline in a temporary directory and the current source independently. It exits nonzero if any within-engine output hash, encoded length, or draw sequence differs. Expected final result: all three equality flags true. Production-size measurements use the same pinned Bun build options and Node compressors for each variant.

Rejected experiments are applied only to temporary copies by the helper; these commands deliberately **exit 1** on WebKit's pixel mismatch:

```sh
PROFILE_BROWSER=webkit PROFILE_CANVAS_PATCH=experiments/performance/scratch-release-early.patch bun experiments/performance/runtime-profile.mjs /tmp/runtime-early-release.json
PROFILE_BROWSER=webkit PROFILE_CANVAS_PATCH=experiments/performance/scratch-release-after-final.patch bun experiments/performance/runtime-profile.mjs /tmp/runtime-after-final.json
PROFILE_BROWSER=webkit bun experiments/performance/scratch-release-probe.mjs /tmp/runtime-scratch-probe.json
```

Integration: cherry-pick the two accepted source/test commits and the independent experiment/report commit. Do not cherry-pick `5f9881f` in isolation; the branch's `b660237` undo ensures it is absent from the final tree. Parent-owned performance tests, bundle measurement script, Playwright configuration, and build scripts were not edited.
