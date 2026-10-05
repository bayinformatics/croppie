# Contributing to Croppie

Thanks for helping out. This is a short guide to getting a change merged.

## Prerequisites

- [Bun](https://bun.sh) at the version pinned in [`.bun-version`](.bun-version) (currently 1.4.2). CI reads that file, and a different Bun version can produce a different bundle, which fails the build-parity check. If you manage runtimes with [mise](https://mise.jdx.dev), `mise use bun@$(cat .bun-version)` is enough. Confirm with `bun --version`: package scripts call `bun` and `bunx` again internally, so the pinned version has to be the first `bun` on your `PATH` (an older global install earlier on the `PATH` silently wins).
- Node 22 or newer with npm for the tooling (needed by `bun run check:package`, which runs `npm pack`, and to try the published package, e.g. `require()` / `import` smoke tests). This applies to working on Croppie only: the published package supports Node 20 and newer (`engines.node`).
- Chromium for the visual tests: `bunx playwright install chromium`.

```sh
bun install --frozen-lockfile
```

Use `--frozen-lockfile` so you never change `bun.lock` by accident. Change dependencies deliberately with `bun add` / `bun remove` and commit the lockfile.

## Scripts

| Script | What it does |
|---|---|
| `bun run test` | Unit + integration tests (`bun test`, with coverage; lcov in `coverage/lcov.info`) |
| `bun run test:watch` | Tests in watch mode |
| `bun run test:visual` | Builds, then runs the Playwright screenshot tests |
| `bun run lint` | Biome over `src`, `tests` and `playwright.config.ts` |
| `bun run lint:fix` | Same, applying fixes |
| `bun run typecheck` | Type-checks `src`, `tests` and the Playwright config (`tsconfig.test.json`) |
| `bun run build` | Cleans `dist/`, then builds the bundle, CSS and type declarations |
| `bun run build:docs` | Builds the demo bundle in `docs/` |
| `bun run check:package` | `publint` + `attw` against the packed tarball |
| `bun run dev` | Watch build into `dist/` (run `bun run build` before committing) |

Before you commit, run `bun run lint && bun run typecheck && bun run test`.

## Tests

- `tests/unit`, `tests/utils`, `tests/input`, `tests/ui`, `tests/canvas`: fast tests of single modules.
- `tests/integration`: drives the `Croppie` class end to end inside happy-dom.
- `tests/visual`: Playwright screenshot tests against the built bundle (not run by `bun test`).

happy-dom does not load images or implement canvas, so the tests use mocks from `tests/fixtures/mock-helpers.ts` and `tests/canvas/mocks.ts`:

- `installImageMock(dimensions)` makes `new Image()` fire `onload`. Pass fixed dimensions, or a resolver such as `fixtureDimensions` (see `tests/fixtures/test-image-data-url.ts`) so each fixture image reports its real size.
- `setupCanvasMocks()` / `restoreCanvasMocks()` stub `getContext("2d")`, `toBlob` and `toDataURL`; `getLastMockContext()` gives you the context to assert on.

Write the failing test first and commit it, then commit the fix or feature (`test: failing tests for X`, then `fix: X`).

## Committed build output

`dist/` and `docs/croppie.js`, `docs/croppie.js.map` and `docs/croppie.css` are committed (so git-based installs and GitHub Pages work), and CI rebuilds them and fails on any difference. The rules:

1. Rebuild them with `bun run build && bun run build:docs` under the pinned Bun version.
2. Do it in the **last** commit of your PR (`chore: rebuild dist and docs artifacts`), not in intermediate commits.
3. Never edit them by hand.

## Visual baselines

Screenshots live in `tests/visual/__screenshots__/chromium-<platform>/`, one set per OS (`linux` is what CI compares against, `darwin` is for local runs). Only update baselines when rendering is supposed to change:

```sh
bunx playwright test --update-snapshots
```

If Linux CI reports pixel differences that are not a regression (for example after a Playwright upgrade), download the `visual-regression-results` artifact from the failed run, copy the `*-actual.png` files over the `chromium-linux` baselines, check that they show the same scene, and commit them.

## Commits and pull requests

- Use [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `test:`, `docs:`, `chore:`, `ci:`, `build:`.
- Keep commits to a single concern.
- Add a line to `CHANGELOG.md` under the unreleased section for anything users can see.
- Fill in the pull request template.

## Releasing (maintainers)

1. Merge the PR(s) to `main`; make sure `CHANGELOG.md` has the date and `package.json` the version.
2. Create a GitHub release whose tag is `v<version>` targeting `main`.
3. `publish.yml` first verifies that the tag matches `package.json`, then runs lint, typecheck, tests, build and `check:package`, then publishes to npm and GitHub Packages. A manual run (`workflow_dispatch`) has to be started on the tag `v<version>`; on a branch it stops before building.
4. Check `npm view @bayinformatics/croppie version`.
