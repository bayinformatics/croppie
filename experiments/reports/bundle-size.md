# Croppie bundle-size experiment

Date: 2026-10-06 (America/Denver). Worker task: `task_c4cf2174b2dd`, dispatch: `ctx_a39b60d410cc`.

**Isolated size-only candidate: 8,987 bytes gzip9, down from 9,559: 572 bytes / 5.98%.** JavaScript saves 58 bytes; CSS saves 514 bytes. The npm package and docs build both receive the reduction. No features, exports, runtime dependencies, or public types were removed.

The combined production result after the runtime changes is **9,020 gzip bytes**; see [parent validation](parent-validation.md). The numbers below preserve the earlier size-only measurement.

Native-private members saved more JavaScript, but **failed public methods through an empty Proxy**. That experiment is rejected and reverted. Passing the original 870 tests and matching public declarations did not prove behavioral compatibility.

## Revisions and integration

Baseline: `76540ff3ec7f95b6adae2615f630e80cbc33c523`.

Size-only implementation: `f8b7e9435338d1b272b5cbac1ec763bc2d7a113f`, source-identical to the measured worker revision. The accepted changes were cherry-picked with identical patches; the table uses reachable integrated commits.

Accepted commits, in integration order:

| Commit | Change | Incremental gzip9 saving |
| --- | --- | ---: |
| `b89639d5d2542e25d805c7c581dd8351916d98b0` | Build package and docs CSS with Bun minification; retain both CSS export aliases and the CSS declaration stub | 514 CSS bytes |
| `afcdf46c3e9ff119a9c90f27441762bf8e1cfb75` | Add two transparent-Proxy public-API regression tests | 0 |
| `40d0dca068443f454839597b21dbfe6ccfb8eb6d` | Keep the mount element, viewport element, and overlay element local to DOM assembly | 36 JS bytes |
| `f8b7e9435338d1b272b5cbac1ec763bc2d7a113f` | Move pure `initialTransform` and `resolveBindRotation` helpers to module scope | 22 JS bytes |

The rejected change is retained as a [source-only native-private patch](../performance/native-private.patch), applicable to `b89639d` (also to `afcdf46`, which adds the Proxy checks). **Do not apply this patch to production.** It converts 41 private members and fails the empty-Proxy public API checks; it is absent from the integrated source. The original worker commit and its revert were local-only. This report is committed separately from implementation.

The source changes preserve the original DOM assembly order, public method signatures, error messages, validation, EXIF support, event ordering, object-URL cleanup, gesture handling, and output drawing/downsampling. No parent-owned performance tests, measurement script, or root Playwright configuration were changed. The lockfile is unchanged.

## Toolchain and measurement rules

All builds use `/tmp/croppie-performance-2026-10-06/tools/bun`, version **1.4.2+744846f84**, with the same frozen dependencies. Node is **v24.16.0**, Node zlib is **1.3.1-e00f703**, npm is **11.13.0**, and the installed Playwright package is **1.63.0**. Host is macOS/arm64.

The first `bun install --frozen-lockfile` checked 82 installs across 109 packages with no changes. Build scripts receive the pinned Bun through `PATH`, including nested `bun` invocations.

Measurement uses `node:zlib.gzipSync(bytes, { level: 9 })` separately for each served JavaScript or CSS file. The combined value is the sum of those gzip sizes, not gzip of concatenated files. All `.js` and `.css` files under each output directory are included recursively; `.map` and `.d.ts` files are excluded. The JavaScript `sourceMappingURL` comment remains in the measured bytes. There are no optional chunks or new lazy imports. `dist` and `docs` are separate distribution variants and are not counted twice in the same transfer total.

The earlier Bun 1.2.15 research numbers are not used as the baseline. Fresh pinned Bun 1.4.2 produces 8,205 JS gzip9 bytes, rather than the earlier unverified 8,324.

| Revision / experiment | JS raw | JS gzip9 | CSS raw | CSS gzip9 | Sum raw | Sum gzip9 | Status |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Baseline `76540ff` | 24,127 | 8,205 | 4,257 | 1,354 | 28,384 | 9,559 | Reference |
| CSS minification `b89639d` | 24,127 | 8,205 | 2,901 | 840 | 27,028 | 9,045 | Accepted |
| Native-private patch + minified CSS | 21,660 | 7,912 | 2,901 | 840 | 24,561 | 8,752 | **Rejected: Proxy regression** |
| Constructor locals `40d0dca` + minified CSS | 23,969 | 8,169 | 2,901 | 840 | 26,870 | 9,009 | Accepted |
| Pure helpers `f8b7e94` + previous accepted changes | 23,874 | 8,147 | 2,901 | 840 | 26,775 | 8,987 | **Final recommendation** |

At the baseline, CSS-only, native-private, and final measurement checkpoints, `docs/croppie.js` and `docs/croppie.css` were byte-identical to their `dist` counterparts. The constructor-locals-only checkpoint measured the production JS build; its unchanged CSS is from `b89639d`.

SHA-256 of the independently measured files:

| Artifact | Baseline | Final |
| --- | --- | --- |
| `croppie.js` | `95bf29a50863c9f18b3fc5ae141ff08518fa824349549aface7c4064230169da` | `9a159503165623efc2328b78f493a17fd3349b35256c9dceb6dd1d7879c20b8d` |
| `croppie.css` | `6652d810fc6622db70adb139b3a159f37e3c4978b36f302708fa2c378319aae0` | `5511aaa00be715fdbfd28743507f3c0355d5719ada940290570afe00dca80e2c` |

## Commands to reproduce sizes

Use Bun 1.4.2 from `.bun-version` on your PATH. Temporary paths in the historical validation notes below describe the original worker environment; they are not prerequisites for these commands.

Run from a checkout of the baseline or final implementation above. Do not compare artifacts built by another Bun version.

```sh
bun --revision
bun install --frozen-lockfile
bun run build
bun run build:docs
node --input-type=module <<'JS'
import { readdirSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
console.log({ node: process.version, zlib: process.versions.zlib });
for (const dir of ['dist', 'docs']) {
  const files = readdirSync(dir, { recursive: true })
    .filter(path => /\.(?:js|css)$/.test(path))
    .sort()
    .map(path => {
      const bytes = readFileSync(`${dir}/${path}`);
      return {
        path,
        raw: bytes.length,
        gzip9: gzipSync(bytes, { level: 9 }).length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      };
    });
  console.log(JSON.stringify({
    dir, files,
    raw: files.reduce((sum, file) => sum + file.raw, 0),
    gzip9: files.reduce((sum, file) => sum + file.gzip9, 0),
  }, null, 2));
}
JS
```

The committed Proxy check is `bun test tests/integration/croppie-proxy.test.ts`. To reproduce the rejected behavior, use a disposable checkout of `afcdf46`, apply the native-private patch, and run that check; failure is expected.

## Validation and exact failures

| Check | Baseline | Final compatible candidate |
| --- | --- | --- |
| `bun run build` and `bun run build:docs` | Pass | Pass |
| `bun test` | 870 pass, 0 fail, 3,108 expectations | 872 pass, 0 fail, 3,122 expectations |
| `bun run typecheck` | Pass | Pass |
| `bun run lint` | Pass, 71 files | Pass, 72 files |
| `bun run check:package` | Pass | Pass |
| Existing Chromium visual suite | 7 pass | 7 pass |
| Existing rotation and EXIF pixel tests, Chromium/Firefox/WebKit | Not run for all engines at baseline | 6 pass, 0 fail |
| `npm publish --dry-run --ignore-scripts` | **Exit 1: already-published version** | **Same exit 1 and error** |

Commands used for non-browser validation:

```sh
bun test
bun run typecheck
bun run lint
bun run check:package
npm publish --dry-run --ignore-scripts
```

`check:package` passed declaration-specifier checks, `publint --strict --pack bun`, and the repository's are-the-types-wrong checks. Its pre-existing ignored `node10` / `node16-cjs` resolution diagnostics still appear; neither their configuration nor package exports was changed. Final declaration comparison removed comments, whitespace, and private-only declarations from `Croppie.d.ts`: the remaining public declaration was identical. All 23 other `.d.ts` files were byte-identical to baseline.

The npm dry-run emitted the exact error **`You cannot publish over the previously published versions: 3.2.0.`** and a login warning on both revisions. The baseline check used the saved baseline `dist` plus baseline `package.json`, `README.md`, `LICENSE`, and `CHANGELOG.md` in the baseline artifact directory. No version, registry, or authentication change was made to make the check pass. Nothing was published.

Other observed failures during exploration:

- The first native-private lint run exited 1 because Biome required four formatting changes in `src/Croppie.ts`; formatting fixed it, and the next lint run passed. No rule was disabled.
- An exploratory declaration-comparison command using the old TypeScript compiler API failed with **`TypeError: ts.createPrinter is not a function`** under installed TypeScript 7. The successful comparison instead normalized emitted declarations as described above; this was a verification-script error, not a project build failure.
- Native-private public methods on a Proxy failed, as detailed below. These behavioral failures were not removed from tests or classified as harmless introspection.

### Browser isolation and commands

The root `playwright.config.ts` was left untouched. Temporary configurations imported it and used port **42731**, a static server rooted at this worktree, and output outside the repository so other workers could use their own servers. Chromium screenshot expectations and tolerances remained those from the repository; screenshots were not updated.

```sh
bunx --no-install playwright test --config=/tmp/croppie-performance-2026-10-06/bundle-size-worker/playwright.config.ts
bunx --no-install playwright test --config=/tmp/croppie-performance-2026-10-06/bundle-size-worker/playwright-browsers.config.ts --grep 'result\(\)|EXIF'
```

The first temporary configuration was:

```ts
import config from '/Users/matthewstingel/orca/workspaces/croppie/croppie-size-experiment/playwright.config.ts';
export default {
  ...config,
  testDir: '/Users/matthewstingel/orca/workspaces/croppie/croppie-size-experiment/tests/visual',
  outputDir: '/tmp/croppie-performance-2026-10-06/bundle-size-worker/visual-results',
  webServer: {
    command: 'bun /tmp/croppie-performance-2026-10-06/bundle-size-worker/serve.ts',
    port: 42731,
    reuseExistingServer: false,
  },
};
```

The second imported the first and replaced `projects` with Chromium, Firefox, and WebKit, each at an 800×600 viewport and device scale factor 1. Only the two existing crop-pixel tests were run across engines; this was correctness validation, not a performance benchmark. The coordinator owns independent final runtime measurements.

The temporary `serve.ts` was:

```ts
import { join, resolve } from 'node:path';
const root = '/Users/matthewstingel/orca/workspaces/croppie/croppie-size-experiment';
const server = Bun.serve({
  port: 42731,
  async fetch(request) {
    const url = new URL(request.url);
    const path = resolve(join(root, decodeURIComponent(url.pathname)));
    if (!path.startsWith(`${root}/`)) return new Response('Forbidden', { status: 403 });
    const file = Bun.file(path);
    return await file.exists() ? new Response(file) : new Response('Not found', { status: 404 });
  },
});
console.log(`Serving size experiment at http://localhost:${server.port}`);
```

## Rejected hypotheses and compatibility findings

### Native-private: measured win, real behavior regression

Changing all 41 TypeScript-private members to native-private members reduced JS gzip9 from 8,205 to 7,912 bytes. The original 870 tests, typecheck, package checks, seven Chromium visual tests, and six cross-browser rotation/EXIF tests all passed. Reversing only the private syntax and transpiling reproduced identical baseline class code. Nevertheless, private-brand checks reject a transparent Proxy used as the public receiver.

The exact baseline/candidate probe instantiated the compiled bundle with a 100×100 square viewport, wrapped the instance in `new Proxy(instance, {})`, and called each operation below on a fresh instance. It used the existing happy-dom preload:

```sh
bun --preload ./tests/integration/setup.ts /tmp/croppie-performance-2026-10-06/bundle-size-worker/check-proxy.ts
```

| Public operation | Baseline | Native-private candidate |
| --- | --- | --- |
| `proxy.get()` | Returns initial crop data | `TypeError` |
| `proxy.zoom` | Returns `1` | `TypeError` |
| `proxy.setZoom(2)` | Succeeds | `TypeError` |
| `proxy.destroy()` | Succeeds | `TypeError` |

Bun reported `Cannot access private method or acessor` for the method accesses and `Cannot access invalid private field` for field accesses. The coordinator independently confirmed the same public regression in a browser. The falsified assumption was that preserving declared public types while changing only private members guarantees API compatibility. The final code keeps TypeScript-private instance state and passes the two new Proxy regression tests, including bind, events, rotation, reset, zoom, and destruction. No bound-method workaround or artificial short source names were introduced.

The same four-operation probe was also rerun against the final **compiled** bundle. Baseline and final both passed all four operations; native-private still failed all four. Command: `bun --preload ./tests/integration/setup.ts /tmp/croppie-performance-2026-10-06/bundle-size-worker/check-proxy-final.ts`. Results are saved in `final/proxy.json` beside the other local evidence.

### Other trials

| Trial | Result | Decision |
| --- | --- | --- |
| CSS `--minify-whitespace` versus `--minify` | Both emitted identical 2,901-byte raw / 840-byte gzip9 CSS under pinned Bun | Keep the conventional `--minify` build |
| Return `createElement(...)` directly in four UI helpers instead of local binding + return | Then-active scratch bundle remained exactly 21,577 raw / 7,891 gzip9; Bun already removed the bindings | Reverted; no production change |
| Keep constructor-only DOM references local | Saves 36 JS gzip9 bytes without private brands | Accepted |
| Move pure helpers to module scope | `initialTransform` alone saved 6 bytes; adding `resolveBindRotation` saved another 16 | Accepted, readable names retained |

EXIF removal, validator removal, gesture simplification, downsampling removal, error-message truncation, optional feature chunks, and API changes were not used to meet a size target. Optional chunks would count toward the total; moving existing synchronous behavior behind an async import was not an acceptable size reduction.

## Caveats and retained evidence

CSS minification uses Bun's built-in CSS bundler and no new dependency. Bun documents its minification and compatibility transforms in the [official CSS bundler documentation](https://bun.sh/docs/bundler/css). Source selectors, custom properties, focus rules, theme rules, and inline accessibility behavior remain present. The compiled stylesheet rewrites equivalent CSS syntax and colors; this report does not promise text-identical CSSOM serialization. Existing visual and crop-pixel tests pass.

The size results are deterministic artifact comparisons under the pinned toolchain. They are not runtime speed or memory claims, and the concurrent cross-browser runs are not timing evidence. The JavaScript win is modest (58 gzip9 bytes, 0.71%); CSS accounts for most of the total reduction. The parent should remeasure the final integrated implementation because gzip savings need not add linearly when combined with another worker's code.

Raw build/test/package/browser logs, the baseline and native-private artifacts, temporary server/configurations, Proxy probe output, and per-checkpoint size JSON are retained locally under `/tmp/croppie-performance-2026-10-06/bundle-size-worker/` in `baseline`, `css`, `private`, `locals`, and `final`. Those temporary files are not shipped or committed; the commands, byte counts, hashes, failures, and decisions above are the durable evidence.
