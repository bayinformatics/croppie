# Offscreen export experiment

Run the isolated comparison from the repository root with Bun 1.4.2 on PATH (see `.bun-version`) and the existing frozen dependencies:

```sh
python3 tests/performance/fixtures.py
bun experiments/offscreen-export/run.mjs
```

The command writes new results under `.cache/offscreen-export/` and builds into its `assets/` directory, starts its own loopback server on an ephemeral
port, runs installed Chromium/Firefox/WebKit sequentially, writes raw JSON, and stops the
server. It needs no package/config changes and makes no external image requests.
**Exit 1 means a correctness/platform/measurement gate failed.** A recorded negative
experiment is intentional; the equality criterion is never relaxed.

Set `OFFSCREEN_PHASE=correctness`, `timing`, or `build` to run just that phase;
`OFFSCREEN_BROWSERS=chromium,firefox,webkit` selects engines. Defaults are four warmups
and ten measured samples per variant; `OFFSCREEN_WARMUPS` and `OFFSCREEN_REPEATS`
override them. `OFFSCREEN_FIXTURES` and `OFFSCREEN_OUTPUT` select other fixture and result directories. Defaults are anchored to the checkout; explicit relative overrides use the invoking directory. The checked-in `results/` evidence is left intact.

The five timing variants are native, cold/reused image-transfer worker, and cold/reused
Blob-decode worker. Native and image-transfer start from the same fully decoded
HTMLImageElement; Blob-decode deliberately measures a new decode on every request.
A reused worker retains its module/realm, **not a decoded source**. An image transfer uses
`createImageBitmap(element)` on the main thread and transfers its ownership; a Blob is
cloned into the worker and decoded there. Neither input path fetches a source URL.

`build.mjs` adapts production `src/canvas/draw.ts` with five count-guarded substitutions
(two canvas constructors, the source/return types, and the two natural-dimension reads).
The complete repeated-halving, caps, smoothing, intersection, rounding, aspect handling,
rotation, mask and fill logic remains. There are no zero-sized canvas resets. The build
emits the adapted source for inspection and hashes the inputs. This text transformation
is an experiment maintenance seam: review production changes before reusing it.

Read [the report](../reports/offscreen-export.md) for the strict pixel failures,
responsiveness/latency tradeoffs, full byte accounting, commands and limitations.

The checked-in worker evidence predates integration of CSS minification. Rerunning the
build now minifies CSS to match the current package; the added worker/loader payload is
unchanged. Keep fresh results separate with `OFFSCREEN_OUTPUT` when comparing snapshots.
