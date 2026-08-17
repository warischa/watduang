# gh#38 — recommendation: add `astro check` to CI

## Evidence summary

- `01-astro-check-first-run.txt`: on a clean tree, `@astrojs/check` is not installed.
  `npx astro check` with stdin closed (default in CI) prompts to install it, gets EOF,
  and **exits 0 having run no check at all**. `@astrojs/check` must be added as an
  explicit devDependency, or a bare `astro check` step in CI is a silent no-op that
  always passes.
- With `@astrojs/check` installed: 60 files scanned, 0 errors, 0 warnings, 3 pre-existing
  hints (unrelated to gh#38, see file for detail).
- `02-astro-check-calibration.txt`: a deliberately broken `.astro` property reference
  (`src/components/GameNav.astro`) makes `astro check` exit 1 and name the exact
  file:line:col. The same break passes `npm run build` clean (exit 0) and ships as
  **empty `<a>` link text** in the built HTML — exactly the class of bug gh#38 describes,
  and today's CI (validate-games, citations, thai-comments gate, unit tests, build, CSP
  checks, sitemap check, smoke test) has no step that would catch it.

## Recommendation

**Add `astro check` to CI.** It catches a real, currently-invisible class of defect
(broken references inside `.astro` files) that `astro build` does not check, at a
measured cost of ~2.6s wall — small relative to the existing smoke-test step.

### 1. Add the dependency

`package.json` devDependencies needs `@astrojs/check` (paired with the `typescript` that's
already there) — `npm ci` alone will not fetch it, and without it the CI step becomes the
silent no-op described above.

```json
"devDependencies": {
  "typescript": "^5.0.0",
  "@astrojs/check": "^0.9.0"
}
```

### 2. Add a `typecheck` script

`package.json` scripts:

```json
"typecheck": "astro check"
```

### 3. Add a CI step, in `.github/workflows/ci.yml`

Placement: right after "Unit tests" and before "Build" — it's a fast, independent gate
that should fail before spending time on the build/smoke-test steps that follow it.

```yaml
      - name: Typecheck (astro check)
        run: npm run typecheck
```

No changes to `staticwebapp.config.json` or the deploy step — this stays within the
existing 2-file Azure-specific boundary; `astro check` is a dev-time gate, not part of the
deployed artifact.

## Does this duplicate `astro build`?

No. `astro build` does not run the TypeScript checker — confirmed above: the deliberately
broken prop reference built clean and shipped broken output. `astro check` is the only
step (existing or proposed) that opens `.astro` files' embedded expressions with `tsc` and
checks them against declared types.

## Caveat

This recommendation only implements the proposal in this file — `ci.yml` itself is left
untouched per the task's scope; the owner has not approved the CI change.
