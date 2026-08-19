# gh#44 — prose-separated `.md` + `§` citation census

Scope: every `.md` path (backticked, markdown-link, or bare) followed **later on the
same line** by a `§` with at least one non-whitespace character between them —
the form `scripts/check-citations.mjs`'s `PATH_ALT`/`headingQuotedRe`/`headingUnquotedRe`
MISS, because those regexes require `\s*` (whitespace-only) between
path and `§`. Excludes `node_modules`, `.git`, `dist`, `.scratch` (mirrors the script), and
excludes this file itself (see below). `docs/sessions-archive.md` is exempt by owner
decision and counted separately below.

The census below measures the repo **excluding this file**: this file's own census-table
rows necessarily quote the `path`-then-`§` form they are counting (a `.md` path and a
`§`-bearing cell with a `|` between them is non-whitespace separation), so scanning this
file would count its own rows as hits — the same self-description ceiling recorded as
ceiling 3 in `scripts/check-citations.mjs`.

## Scan command (reproducible)

Save as `scan.mjs` at repo root and run `node scan.mjs`:

```js
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const EXCLUDE_DIRS = new Set(['node_modules', '.git', 'dist', '.scratch']);
const EXCLUDE_FILES = new Set(['docs/verification/evidence/44/prose-separated-scan.md']);

// Same as scripts/check-citations.mjs's PATH_ALT constant.
const PATH_ALT = '(?:`([^`]+\\.md)`|\\[[^\\]]*\\]\\(([^)]+\\.md)\\)|(?<![`A-Za-z0-9_./-])([A-Za-z0-9_./-]+\\.md)\\b)';
const pathRe = new RegExp(PATH_ALT, 'g');

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (e.isDirectory()) { if (!EXCLUDE_DIRS.has(e.name)) walk(path.join(dir, e.name), out); continue; }
    if (e.name.endsWith('.md')) out.push(path.join(dir, e.name));
  }
}
const files = [];
walk(repoRoot, files);

const hits = [];
for (const abs of files) {
  const rel = path.relative(repoRoot, abs).split(path.sep).join('/');
  if (EXCLUDE_FILES.has(rel)) continue;
  const lines = fs.readFileSync(abs, 'utf8').split('\n');
  lines.forEach((line, idx) => {
    const lineNo = idx + 1;
    const sectionPositions = [...line].map((ch, i) => (ch === '§' ? i : -1)).filter((i) => i !== -1);
    if (!sectionPositions.length) return;
    pathRe.lastIndex = 0;
    let m;
    while ((m = pathRe.exec(line))) {
      const pathEnd = m.index + m[0].length;
      const citedPath = m[1] ?? m[2] ?? m[3];
      for (const secPos of sectionPositions.filter((p) => p >= pathEnd)) {
        const between = line.slice(pathEnd, secPos);
        if (between.length === 0 || /^\s*$/.test(between)) continue; // whitespace-only: already caught by the script
        hits.push({ file: rel, line: lineNo, citedPath, after: line.slice(secPos + 1, secPos + 121) });
        break; // nearest qualifying § per path occurrence
      }
    }
  });
}
console.log(JSON.stringify(hits, null, 2));
```

Classification method: for each hit, if the text right after `§` starts with a digit
→ `F-num` (numbered-section idiom, e.g. `§2`, deliberately excluded by the script's
`(?!\s*\d)` inside `headingUnquotedRe`). Otherwise the heading text was extracted using the SAME
cut-off regex as `headingUnquotedRe` (`\s+—|\s+--|\.\s|\.$|,|:`) and checked for exact
membership in the target file's `^#{1,6}\s+(.*)$` heading list — then verified by
opening the target file by hand, since dense narrative-log prose (the archive rows,
and a few live rows) routinely puts an unrelated `.md` path earlier on the same line
from a different reference than the one the `§` actually belongs to (a same-line
coincidence, not a real citation pairing) — flagged `F` in that case.

**Caveat surfaced by this scan, relevant to gh#44 either way it forks:** the
`docs/adr/0010-...:125` citation (both here and in the live-hits table below) uses the
plain word `Supersession`, but the actual target heading is
`## Supersession — S2026-08-15#4` (repo convention: date-stamped suffix). Heading
resolution is an exact string match (the `headings.includes(...)` check inside
`checkCitation` in `scripts/check-citations.mjs`), so
`"Supersession"` does NOT match `"Supersession — S2026-08-15#4"` even with the
whitespace requirement removed — this is a pre-existing extraction-cutoff gap,
orthogonal to gh#44's whitespace question. Classified `D` below: a heading literally
titled "Supersession" duly exists to a human reader, but the checker's exact-match
algorithm would flag it dead.

Note on table shape below: the cited path and cited heading are given their own
columns, so no cell places a `.md` path and a `§` in the whitespace-adjacent form
`headingQuotedRe`/`headingUnquotedRe` match (the nine `F-num` rows do contain a bare
`§1`/`§2`-style literal in their heading cell, but never next to a `.md` path in that
cell) — otherwise a row would itself be a `path § "heading"`-shaped citation and trip
`check-citations.mjs` when it scans this file (ceiling 3 in the script's header: the
checker cannot describe its own subject matter).

## Positive control

| citing | cited path | cited heading | target heading exists? |
|---|---|---|---|
| `docs/runbook.md:5` | `CLAUDE.md` | Rules that must not be broken | y — `## Rules that must not be broken` (CLAUDE.md:17), exact match |
| `docs/adr/0010-checkpoint-slot-stays-site-wide-until-a-second-writer-exists.md:80` | `docs/verification/adr-0010-findings.md` | Supersession | n — exact match fails against `## Supersession — S2026-08-15#4` (line 169); see caveat above |

Both surfaced by the scan. Positive control PASSES (the scan finds both hits; whether
the heading resolves is a separate, already-caveated question).

## Live (non-archive) hits — 12 total

| file:line | bucket | path cited | heading cited | target heading found? |
|---|---|---|---|---|
| `docs/adr/0010-checkpoint-slot-stays-site-wide-until-a-second-writer-exists.md:80` | D | `docs/verification/adr-0010-findings.md` | Supersession | n — exact match fails against `## Supersession — S2026-08-15#4` (see caveat above) |
| `docs/post-launch-checklist.md:3` | F-num | `site-owner-checklist.md` | §1 | — |
| `docs/post-launch-checklist.md:12` | F-num | `site-owner-checklist.md` | §2 | — |
| `docs/post-launch-checklist.md:12` | F-num | `site-owner-checklist.md` | §2 | — |
| `docs/post-launch-checklist.md:38` | F-num | `site-owner-checklist.md` | §2 | — |
| `docs/post-launch-checklist.md:58` | F-num | `site-owner-checklist.md` | §4 | — |
| `docs/runbook.md:5` | R | `CLAUDE.md` | Rules that must not be broken | y, exact match |
| `docs/site-owner-checklist.md:57` | F-num | `post-launch-checklist.md` | §2 | — |
| `docs/site-owner-checklist.md:92` | F-num | `post-launch-checklist.md` | §4 | — |
| `SESSION-HANDOFF.md:3` | F | `CLAUDE.md` | Current state (negated: "no longer has a § Current state") | n — no such heading, but also not a live-citation intent; it's prose stating the heading's absence |
| `SESSION-HANDOFF.md:11` | F-num | `docs/verification/evidence/43/calibration.md` | §5 | — |
| `SESSION-HANDOFF.md:11` | F-num | `docs/site-owner-checklist.md` | §5 | — |

Live tally: **R=1 · D=1 · F=1 · F-num=9** (12 total).

## Archive hits (`docs/sessions-archive.md`, exempt, counted separately) — 13 total

| file:line | bucket | path cited | heading cited | target heading found? |
|---|---|---|---|---|
| `docs/sessions-archive.md:23` | F | `docs/agents/ci-verification.md` | "Known premise exceptions" (mismatched pairing — the § actually belongs to `ADR-0016`, cited bare, not by `.md` path) | n |
| `docs/sessions-archive.md:125` | F-num | `SESSION-HANDOFF.md` | §1 | — |
| `docs/sessions-archive.md:129` | F-num | `site-owner-checklist.md` | §3 | — |
| `docs/sessions-archive.md:129` | F-num | `docs/post-launch-checklist.md` | §3 | — |
| `docs/sessions-archive.md:250` | F-num | `docs/agents/browser-verification.md` | §5 | — |
| `docs/sessions-archive.md:250` | F | `site-owner-checklist.md` | Outcome scored (mismatched — belongs to `ADR-0009`, cited bare) | n |
| `docs/sessions-archive.md:252` | F | `docs/agents/browser-verification.md` | Outcome (mismatched — belongs to `ADR-0009`, cited bare) | n |
| `docs/sessions-archive.md:269` | D | `docs/verification/adr-0010-findings.md` | Supersession | n — exact match fails against `## Supersession — S2026-08-15#4`, same as the live-section row above (see caveat above) |
| `docs/sessions-archive.md:287` | F | `triage-labels.md` | Finding S2026-08-15#3 (mismatched — belongs to `ADR-0010`, cited bare; also `triage-labels.md` itself doesn't resolve from this citing file's dir or repo root — actual file is `docs/agents/triage-labels.md`) | n |
| `docs/sessions-archive.md:336` | F-num | `dod-closeout-15-18.md` | §4 | — |
| `docs/sessions-archive.md:352` | F-num | `CONTEXT.md` | §1 | — |
| `docs/sessions-archive.md:352` | F-num | `site-owner-checklist.md` | §2 | — |
| `docs/sessions-archive.md:438` | F | `.claude/commands/save-session.md` | Language (mismatched — belongs to `CLAUDE.md`, which does have `## Language`) | n |

Archive tally: R=0 · D=1 · F=5 · F-num=7 (13 total, counted separately, never folded
into the live number). Re-derived by counting the 13 rows above, not carried forward
from an earlier draft; 0+1+5+7=13 reconciles.

## Grand total

25 hits (12 live + 13 archive), matching the scan command's raw output count — run against
the repo excluding this file (see the exclusion note above; this file necessarily quotes
the very form it counts, so scanning it would inflate the total with its own table rows).
