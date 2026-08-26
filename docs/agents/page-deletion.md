# Deleting or renaming a page

Split out of `docs/runbook.md` at the seam `CLAUDE.md` already names (ADR-0012). The runbook keeps
a pointer; everything about deleting or renaming a page lives here.

## Deleting a page breaks two things no local gate touches

**Symptom:** every gate is green, `dist/` has no reference left to the deleted URL, and CI still fails
— or CI passes and the deploy step fails instead. Both happened for one page deletion, 2026-08-26,
ADR-0041 removing `/games/`.

**Cause 1 — the smoke step keeps its own hardcoded path list.** `.github/workflows/ci.yml`'s
portability step walks a literal list of URLs against `npx serve dist/`. A deleted page stays in that
list until someone edits the workflow, and no local check reads it: the source-text gates never serve
`dist/`, and the ones that do read `dist/` scan built files rather than requesting paths.

The redirect cannot save it, and must not. That step exists to prove `dist/` stands up with **no Azure
runtime**, so a path that resolves only through Azure routing can never belong in its list.

**Cause 2 — Azure normalises trailing slashes before matching routes.** `/games/` and `/games` are the
same route to Static Web Apps. Declaring both is a duplicate, and a duplicate invalidates the **whole**
`staticwebapp.config.json`, not just the second entry. Azure's own words, off the failing run:

```
A rule was already processed with a duplicate route /games. Therefore, this rule
will not be evaluated. Please remove the duplicate rule.
```

One rule covers both forms. Do not add a second for the slashless variant.

**Do, when deleting or renaming any page:**

```bash
# the sweep that matters — note .github/, which a src/-and-docs/ sweep misses
grep -rn '/<the-url>/' src/ scripts/ public/ docs/ .github/ CLAUDE.md
npm run build && npx serve@14 dist/ -l 4321 &   # then walk the smoke step's own path list by hand
```

**Nothing local validates `staticwebapp.config.json`.** No gate reads it, the smoke step deliberately
runs without an Azure runtime, and the schema validator only executes inside the deploy. A failed
deploy is the cheap end of that — it ships nothing and breaks nothing. Before pushing, the only checks
available are that the file parses and that no two routes collide once trailing slashes are stripped.
