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
| `bun run lint` | Biome over `src`, `tests`, `scripts` and `playwright.config.ts` |
| `bun run lint:fix` | Same, applying fixes |
| `bun run typecheck` | Type-checks `src`, `tests` and the Playwright config (`tsconfig.test.json`) |
| `bun run build` | Cleans `dist/`, then builds the bundle, CSS and type declarations |
| `bun run build:docs` | Builds the demo bundle in `docs/` |
| `bun run check:package` | Checks that the type declarations in `dist/` import with `.js` specifiers, then `publint --strict` and `attw` against the packed tarball |
| `bun run size` | Checks the gzip size of `dist/croppie.js` and `dist/croppie.css` against the budget in `.size-limit.json` (run `bun run build` first) |
| `bun run dev` | Watch build into `dist/` |

Before you commit, run `bun run lint && bun run typecheck && bun run test`.

The bundle has a hard gzip size budget, enforced in CI (`dist/croppie.js` 8.5 kB, `dist/croppie.css` 1.5 kB; 1 kB is 1000 bytes). To raise it on purpose, change the `limit` in `.size-limit.json` in the same PR that adds the feature and give the reason in the PR description; do not raise it just to make a failing check pass.

## Tests

- `tests/unit`, `tests/utils`, `tests/input`, `tests/ui`, `tests/canvas`: fast tests of single modules.
- `tests/integration`: drives the `Croppie` class end to end inside happy-dom.
- `tests/visual`: Playwright screenshot tests against the built bundle (not run by `bun test`).

happy-dom does not load images or implement canvas, so the tests use mocks from `tests/fixtures/mock-helpers.ts` and `tests/canvas/mocks.ts`:

- `installImageMock(dimensions)` makes `new Image()` fire `onload`. Pass fixed dimensions, or a resolver such as `fixtureDimensions` (see `tests/fixtures/test-image-data-url.ts`) so each fixture image reports its real size.
- `setupCanvasMocks()` / `restoreCanvasMocks()` stub `getContext("2d")`, `toBlob` and `toDataURL`; `getLastMockContext()` gives you the context to assert on.

Write the failing test first and commit it, then commit the fix or feature (`test: failing tests for X`, then `fix: X`).

## Build output

`dist/` and `docs/croppie.js`, `docs/croppie.js.map` and `docs/croppie.css` are build output and are git-ignored. Do not commit them. CI builds them: `publish.yml` builds the package that goes to npm, and `pages.yml` builds the demo for GitHub Pages. Because a clone has no `dist/`, the package cannot be installed from git; installs are from npm only.

Run `bun run build` for `dist/` (the visual tests do it for you) and `bun run build:docs` to preview `docs/index.html` with a fresh demo bundle. Every pull request also gets a bundle size report and a [pkg.pr.new](https://pkg.pr.new) preview comment with an installable build of your branch.

## Visual baselines

Screenshots live in `tests/visual/__screenshots__/chromium-<platform>/`, one set per OS (`linux` is what CI compares against, `darwin` is for local runs). Only update baselines when rendering is supposed to change:

```sh
bunx playwright test --update-snapshots
```

If Linux CI reports pixel differences that are not a regression (for example after a Playwright upgrade), download the `visual-regression-results` artifact from the failed run, copy the `*-actual.png` files over the `chromium-linux` baselines, check that they show the same scene, and commit them.

## Commits and pull requests

- Use [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `perf:`, `revert:`, `docs:`, `test:`, `chore:`, `ci:`, `build:`, `style:`, `refactor:`. Mark a breaking change with `!` (`feat!:`) or a `BREAKING CHANGE:` footer.
- Keep commits to a single concern. Pull requests are merged with merge commits, so each commit message is what release-please reads.
- Do not edit `CHANGELOG.md` or the `package.json` version: release-please writes both from the commit messages. `feat`, `fix`, `perf`, `revert` and `docs` commits appear in the changelog; `chore`, `ci`, `test`, `build`, `style` and `refactor` do not, so put the user-visible change in a `feat:` or `fix:` subject.
- Fill in the pull request template.

## Releasing (maintainers)

Releases come from [release-please](https://github.com/googleapis/release-please) (`release-please.yml`):

1. After commits land on `main`, release-please keeps one release pull request open (`chore(main): release X.Y.Z`) that bumps `package.json` and prepends the changelog entry. Review it like any other PR.
2. Merge it. release-please creates the tag `vX.Y.Z` and the GitHub release on `main`.
3. The release triggers `publish.yml`, which first verifies that the tag matches `package.json`, then runs lint, typecheck, tests, build and `check:package`, then publishes to npm through trusted publishing (OIDC): there is no npm token, and the provenance statement is attached automatically.
4. Check `npm view @bayinformatics/croppie version`.

If release-please is unavailable, a maintainer can create the GitHub release `vX.Y.Z` on `main` by hand once `package.json` has that version; `publish.yml` runs the same way. A manual run (`workflow_dispatch`) has to be started on the tag `vX.Y.Z`; on a branch it stops before building. Releases are created with a GitHub App token (`RELEASE_APP_ID`, `RELEASE_APP_PRIVATE_KEY`) because a release created with the default `GITHUB_TOKEN` does not trigger workflows.
