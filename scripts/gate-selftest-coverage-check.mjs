#!/usr/bin/env node
// Meta-gate: no `*-check` script in this repo may ship as a gate that cannot fail.
//
// Two known ways a gate script quietly stops being able to fail, both seen in this repo (gh#120's
// REFUTE round): (1) it has no `--selftest` at all, or a `--selftest` flag it accepts and ignores,
// so a broken detector never gets caught — the checker's own logic is untested; (2) it is wired as
// an npm script entry, but nothing that actually executes ever reaches that entry, so the check
// never runs at all. TWO EXECUTORS, and a gate must be reachable from BOTH: package.json's `ci`
// aggregate is what a developer runs locally, and .github/workflows/ci.yml is what gates the
// deploy. They are independent lists — the workflow never runs `npm run ci`, it spells every gate
// out as its own step — so a gate chained into the npm aggregate alone is DEAD in production CI, and
// one wired only as a workflow step is invisible to every local run. That defect shipped in this
// gate's own diff: both new gates were added to `scripts.ci` and to no workflow step, and an earlier
// version of this header claimed `ci` was "the aggregate npm actually runs" in CI, which is false.
// party-size-claim-check.mjs shipped with neither rule in place, and
// check-citations.mjs / crawl-check-gamenav.mjs were both cited as having "no --selftest mode" —
// on inspection (this gate's own scan, see below) that second claim did not hold: both already
// implement a real, two-way-calibrated `selftest()` and are already chained from `ci`. This gate
// does not special-case any of the three; it audits the CLASS so the fourth gate someone adds next
// month is guarded by construction, not by someone remembering to update a list — as long as that
// gate is invoked as `node scripts/X.mjs` by one of the two executors. A gate reached only through a
// shell wrapper is NOT guarded by construction; see THE SET'S HONEST BOUND below.
//
// THE SET, and why it converges: every `scripts/<name>.mjs` file invoked with `node` by either
// executor — package.json's own `scripts` block, or a `run:` step in .github/workflows/ci.yml. Two
// finite lists in two files this repo owns; no filesystem walk, no naming-convention guess. The
// union matters in both directions: a package.json-only gate is the dead-in-CI case, a workflow-only
// gate would otherwise never be audited at all.
//
// THE SET'S HONEST BOUND — printed as a coverage-gap line on EVERY run, not just documented here.
// `node scripts/X.mjs` is the only invocation shape matched, so a gate reached through a SHELL
// WRAPPER is outside the audited set: `"ci-probes": "bash scripts/ci-probes.sh"` means
// scripts/ci-probes-verdict.mjs and every probe that shell script drives are neither violations nor
// exemptions — they were never looked at. Following wrappers is not built on purpose: it means
// parsing shell (variables, loops, `$(...)`, a wrapper calling a wrapper), which does not converge,
// and every unparsed branch would read as clean. So the set does not silently shrink instead: see
// unauditableCommands — each wrapper is NAMED in the output every run, so "0 violations" can never
// be mistaken for "everything was audited". `uses:` steps in the workflow (actions/checkout,
// azure/login, the deploy action) are also unaudited and are third-party, not gates of this repo.
//
// THREE RULES per gate script found in that set:
//   RULE 1 (no exemption, ever) — the script implements a real `--selftest`:
//     a. a CLI flag check: `<argv-ish>.includes('--selftest')` (the house idiom, used by every real
//        gate in this repo today — verified: `grep -l "function selftest(" scripts/*.mjs` returns
//        every wired gate under that exact name; thai-comments.mjs checks `args.includes(...)`
//        against a pre-sliced `process.argv.slice(2)`, everything else checks `process.argv` itself
//        — both count, the receiver name is cosmetic), AND
//     b. a `function selftest() { ... }` body (brace-matched) that contains at least 2 "verification
//        statements" — `assert.<method>(` or `throw new Error(` calls. This is a text-based proxy
//        for "asserts on more than one property", calibrated directly against the mutation this
//        gate exists to catch: a `--selftest` gutted to `function selftest() { console.log('ok'); }`
//        has ZERO verification statements and is caught by this alone, regardless of the flag being
//        present in the source and regardless of the process exiting 0 when run.
//     This gate deliberately does NOT execute any script's `--selftest` (no `execFileSync` here at
//     all) — crawl-check-gamenav.mjs's own selftest rebuilds dist/ via `npm run build` and is
//     documented as manual-only for exactly that cost; running every gate's selftest from inside
//     another gate would multiply that cost across every CI run and violate the one-build-per-run
//     assumption the repo's other tracks rely on. Static text analysis only, same discipline as this
//     repo's other meta-gate (scripts/repo-root-walk-check.mjs) and its own disclosed ceiling: it can
//     be defeated by a `selftest()` that calls out to a helper doing the real asserting (indirection
//     this heuristic cannot see) — that gap makes the gate MORE likely to demand real assertions
//     inline, never less; it fails closed.
//     CEILING, disclosed honestly (do not read a rule-1 PASS as "this selftest is calibrated" — it
//     is not proven, only not-obviously-gutted): `countVerificationStatements` is a source-text proxy,
//     the same defect class gh#118 names for `draw`'s round pin. It counts regex hits, not what they
//     assert. `assert.ok(true); assert.ok(true);` clears the >=2 floor and PASSES rule 1 even though
//     it calibrates nothing — a vacuous selftest is invisible to this rule; only a fully GUTTED one
//     (0 statements) is caught (proven by this gate's own calibration round in the Goal that added
//     rule 1, and re-confirmed for the vacuous case: this rule was never exercised against it and
//     would pass it). Closing this needs a different kind of proof than static text can give: actually
//     EXECUTING each selftest against a planted mutant of the property it claims to check, and
//     asserting the selftest goes red — the same technique crawl-check-gamenav.mjs's own selftest
//     already uses on GameNav.astro. That is real work (a mutant per gate, a rebuild where relevant)
//     and is explicitly NOT built here; this comment exists so a future reader does not mistake a
//     rule-1 green for a proof of calibration quality.
//   RULE 2 — the script is reachable from BOTH executors, OR it is named on RULE2_EXEMPTIONS below
//     with an inline reason. Side A (npm): `npm run <entry>` appears, as a whole npm-run-name token,
//     inside package.json's `scripts.ci` string, for at least one entry name that references this
//     script file. Side B (workflow): some `run:` step in .github/workflows/ci.yml either invokes
//     `node scripts/X.mjs` directly (the house shape there) or calls `npm run <entry>` for such an
//     entry. Reachable from one side and not the other is a VIOLATION and the message names which
//     side is missing — the two lists drift independently, and each drift direction breaks a
//     different thing (local runs vs the deploy gate). An exemption covers both sides at once,
//     because the reason a gate is deliberately unwired is never per-executor.
//     The allowlist is checked FIRST as "is this the provably-safe few", THEN the check negates it —
//     everything else must clear reachability. A gate added next month and never listed defaults to
//     GUARDED (violation), not silently exempt.
//   RULE 3 (no exemption from calibration, once wired — see allowlist note below) — every command
//     either executor actually runs for this script must chain `--selftest` before the real run: the
//     house shape `node scripts/X.mjs --selftest && node scripts/X.mjs`. That means every
//     ci-reachable npm entry name found by RULE 2 (there can be more than one entry pointing at the
//     same script file) AND every workflow `run:` step that invokes the script directly — a workflow
//     step is a command like any other, and `run: node scripts/X.mjs` bare is the same defect as a
//     bare npm entry, just in the file that gates the deploy. A bare `node scripts/X.mjs`
//     entry passes RULE 1 (the script can calibrate) and RULE 2 (CI reaches it) while never once
//     running the calibration CI actually executes — this is the defect RULE 1 and RULE 2 together
//     were blind to: both asked "can this script prove itself", neither asked "does the entry CI
//     runs actually ask it to". A script exempted from RULE 2 (not reachable at all, e.g.
//     party-size-claim-check.mjs / gh#89) owes RULE 3 nothing YET — there is no ci-reached entry for
//     it to chain `--selftest` onto — but the exemption ends the moment it IS wired, same as RULE 2's.
//     RULE3_EXEMPTIONS models the same allowlist discipline as RULE2_EXEMPTIONS: explicit, justified,
//     checked first then negated. It is empty today — no currently-wired entry has an owner-approved
//     reason to skip its own calibration; add an entry only with a filed reason, never as a silent
//     skip.
//
// The allowlists are the load-bearing part of this file. Every entry names WHY it is exempt and what
// ends the exemption, per the Goal — see RULE2_EXEMPTIONS and RULE3_EXEMPTIONS below.
//
//   node scripts/gate-selftest-coverage-check.mjs             -> audit the gate set both executors run
//   node scripts/gate-selftest-coverage-check.mjs --selftest  -> calibration on a throwaway fixture

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

// Rule 2 exemptions: explicit, provably-safe, and each one names why. Keyed by script FILENAME
// (basename under scripts/), not by npm entry name, so it stays correct even if the entry is renamed.
const RULE2_EXEMPTIONS = new Map([
  [
    'party-size-claim-check.mjs',
    'gh#89: deliberately unwired pending an owner decision on the party-size claim (ADR-0039/ADR-0040 ' +
      'set the rule this script enforces one half of; ADR-0040 confirms the claim is real but the ' +
      "surface scope is still the owner's call). Wiring it into `ci` today would red CI immediately " +
      'on an unresolved decision, not a bug. Exemption ends the day gh#89 resolves and this script is ' +
      'either wired into `ci` or retired.',
  ],
]);

// Rule 3 exemptions: same discipline, empty by design. A ci-reachable entry lands here only with a
// filed, owner-approved reason its own calibration should not run automatically (the shape
// crawl-check-gamenav.mjs's header describes for --selftest itself: rebuilding dist/ mid-CI would
// desync the artifact later steps ship) -- and that reason has to be filed against THIS script's own
// wiring, not assumed from a sibling's docstring. Nothing is listed today.
const RULE3_EXEMPTIONS = new Map([
  [
    'crawl-check-gamenav.mjs',
    'Filed 2026-08-27 against THIS entry, not inherited from the sibling docstring. Its --selftest ' +
      'plants two mutants and REBUILDS dist/ after each, so chaining it into the ci entry would run a ' +
      'rebuild inside the aggregate and desync the artifact the later steps check and Deploy uploads. ' +
      'Not hypothetical here: a --selftest added to CI once rebuilt dist/ and deploy shipped bytes the ' +
      'earlier gates never checked. The header comment in that script states the same ' +
      'policy and was read against the file before this entry was written. RULE 1 still binds and ' +
      'passes: calibration exists, run by hand 2026-08-27, exit 0, MUTANTS planted 2/2 caught 2/2. ' +
      'Exemption ends when that calibration runs somewhere it cannot touch the deployed artifact -- ' +
      'its own CI job, or a step ordered before Build -- at which point delete this entry, never widen it.',
  ],
]);

// ADR-0045 latent gap 1: the workflow reader was blind to a step's sibling keys, so a gate step
// placed behind `if:` or `continue-on-error:` kept rules 2/3 green while losing real coverage.
// GitHub owns the set of execution-modifying keys (if, continue-on-error, needs, matrix, reusable
// workflows, concurrency-cancel, path filters -- and it can add more), so per-key patching never
// converges. This inverts it: a step's sibling key is safe ONLY if it is named here; anything else
// beside a `run:` step is treated as capable of gating whether that step executes at all. Every
// entry below is safe because it changes cosmetics or HOW the step runs, never WHETHER it runs.
const SAFE_STEP_SIBLING_KEYS = new Set([
  'name', // step label, purely cosmetic
  'id', // reference id for other steps (e.g. steps.swa_token.outputs.*), does not gate this step
  'env', // env vars visible to `run:`, does not gate whether it runs
  'shell', // interpreter `run:` uses, does not gate whether it runs
  'working-directory', // cwd for `run:`, does not gate whether it runs
]);

// ---------------------------------------------------------------------------
// Pure: package.json scripts text -> the set of gate scripts it references. No IO here so the
// selftest can feed synthetic scripts blocks directly.
// ---------------------------------------------------------------------------

/**
 * Every `scripts/<name>.mjs` file this one npm-script command string actually INVOKES via `node`,
 * deduped. Anchored to `node ` so a script that merely MENTIONS another script's path in prose (e.g.
 * check-node-version's error string: `"...scripts/validate-games.mjs needs built-in .ts type
 * stripping..."`) is not mistaken for a real invocation — that false positive was caught by this
 * gate's own rule-3 run against the live repo: it would otherwise demand check-node-version's shell
 * one-liner chain --selftest for a file it never runs at all, an unfixable, unfalsifiable violation.
 */
export function scriptFilesInCommand(command) {
  return [...new Set([...command.matchAll(/\bnode\s+scripts\/([\w-]+\.mjs)/g)].map((m) => m[1]))];
}

/** Consumes a (possibly block-scalar) `run:` value starting at `lines[i]`'s own `key: rest` split,
 * returning `{ command, lastIndex }` -- `lastIndex` is the last line the value occupied, so the
 * caller's loop can skip past it. Shared by workflowSteps' single forward pass. */
function collectRunCommand(lines, i, rawValue, keyIndent) {
  const inline = rawValue.trim();
  if (inline && !/^[|>][-+]?\d*$/.test(inline)) {
    return { command: inline, lastIndex: i };
  }
  const body = [];
  while (i + 1 < lines.length) {
    const next = lines[i + 1];
    if (next.trim() !== '' && next.match(/^[ \t]*/)[0].length <= keyIndent) break;
    body.push(next);
    i++;
  }
  return { command: body.join('\n'), lastIndex: i };
}

/**
 * Every YAML sequence item shaped like a workflow step (a `- key: ...` list item, whatever key sits
 * under it -- this reader does not track which top-level key owns the list, same discipline as the
 * old `run:`-only scan) that carries a `run:` key, as `{ command, guardedKeys }`. A line-based read,
 * NOT a YAML parse (no yaml dependency in this repo). Block scalars (`run: |`) are collected as one
 * multi-line command, because rule 3's `&&` chain must live inside ONE step: treating the whole
 * workflow as a single blob would let `--selftest` in step 7 satisfy a bare invocation in step 12.
 *
 * `guardedKeys` is every OTHER key found at the step's own indent (before or after `run:`, order does
 * not matter -- one Set accumulates across the whole step) that is not on SAFE_STEP_SIBLING_KEYS.
 * ADR-0045 latent gap 1: `if:` and `continue-on-error:` are exactly the keys this closes over.
 */
export function workflowSteps(workflowText) {
  const lines = workflowText.split('\n');
  const steps = [];
  let cur = null;
  const flush = () => {
    if (cur && cur.command !== undefined) {
      const guardedKeys = [...cur.keys].filter((k) => k !== 'run' && !SAFE_STEP_SIBLING_KEYS.has(k)).sort();
      steps.push({ command: cur.command, guardedKeys });
    }
    cur = null;
  };
  const takeKey = (line, keyIndent) => {
    const kv = /^([\w-]+):[ \t]*(.*)$/.exec(line);
    if (!kv) return;
    cur.keys.add(kv[1]);
    if (kv[1] === 'run') return kv[2];
    return undefined;
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const dash = /^(\s*)-\s+(.*)$/.exec(line);
    if (dash && (!cur || dash[1].length <= cur.dashIndent)) {
      flush();
      cur = { dashIndent: dash[1].length, keyIndent: dash[1].length + 2, keys: new Set(), command: undefined };
      const runVal = takeKey(dash[2], cur.keyIndent);
      if (runVal !== undefined) {
        const r = collectRunCommand(lines, i, runVal, cur.keyIndent);
        cur.command = r.command;
        i = r.lastIndex;
      }
      continue;
    }
    if (!cur || line.trim() === '') continue;
    const indent = line.match(/^[ \t]*/)[0].length;
    if (indent < cur.keyIndent) {
      flush(); // dedent out of the step (defensive; not observed in this repo's real workflow)
      continue;
    }
    if (indent === cur.keyIndent) {
      const runVal = takeKey(line.slice(cur.keyIndent), cur.keyIndent);
      if (runVal !== undefined) {
        const r = collectRunCommand(lines, i, runVal, cur.keyIndent);
        cur.command = r.command;
        i = r.lastIndex;
      }
    }
    // indent > keyIndent: nested content under some other key (with:/env: sub-mapping) -- ignored,
    // same bound this reader already discloses for anything past a `run:` line's own text.
  }
  flush();
  return steps;
}

/** Back-compat shape: every `run:` step's command text, one string per step, same order as
 * workflowSteps -- every existing caller that only needs the command (not its guarded keys) keeps
 * working unchanged. */
export function workflowRunCommands(workflowText) {
  return workflowSteps(workflowText).map((s) => s.command);
}

/** scriptFile -> Set(npm entry names whose command references it). */
export function buildEntryMap(scripts) {
  const map = new Map();
  for (const [entryName, command] of Object.entries(scripts)) {
    for (const file of scriptFilesInCommand(command)) {
      if (!map.has(file)) map.set(file, new Set());
      map.get(file).add(entryName);
    }
  }
  return map;
}

/** Every entry name (of `entryNames`) invoked as a whole npm-run-name token inside `ciCommand`. */
export function reachableEntryNames(entryNames, ciCommand) {
  if (!ciCommand) return [];
  return [...entryNames].filter((name) => {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // `:` excluded too (ADR-0045 latent gap 4): without it, an entry named e.g. `check` matched
    // inside `npm run check:all` -- npm's own colon-namespaced script convention, not a word
    // boundary the original lookahead accounted for.
    return new RegExp(`npm run ${escaped}(?![\\w:-])`).test(ciCommand);
  });
}

/** Is any of `entryNames` invoked as a whole npm-run-name token inside `ciCommand`? */
export function isReachableFromCI(entryNames, ciCommand) {
  return reachableEntryNames(entryNames, ciCommand).length > 0;
}

/**
 * What actually executes this script file, per executor. `ciEntryNames` are npm entries the `ci`
 * aggregate chains; `workflowEntryNames` are npm entries a workflow step calls; `workflowDirect` are
 * workflow `run:` commands that invoke `node scripts/X.mjs` themselves (the house shape in ci.yml).
 * Every rule-2 and rule-3 verdict is derived from this one shape, so the two rules can never disagree
 * about who runs what.
 *
 * `workflowSteps` is workflowSteps()'s `{command, guardedKeys}[]` shape, not plain strings. ADR-0045
 * latent gap 1: a step whose `guardedKeys` is non-empty (an `if:`/`continue-on-error:`/any other
 * sibling key not on SAFE_STEP_SIBLING_KEYS) does NOT count toward workflowDirect/workflowEntryNames
 * — it is collected into `workflowGated` instead, so rule 2 can name it as the specific reason,
 * distinct from "no step reaches this at all".
 */
export function computeReach(file, entryNames, ciCommand, workflowSteps) {
  const names = [...entryNames];
  const workflowEntryNames = new Set();
  const workflowDirect = [];
  const workflowGated = [];
  for (const { command, guardedKeys } of workflowSteps) {
    const direct = scriptFilesInCommand(command).includes(file);
    const viaEntries = reachableEntryNames(names, command);
    if (guardedKeys.length) {
      if (direct || viaEntries.length) workflowGated.push({ command, guardedKeys });
      continue;
    }
    if (direct) workflowDirect.push(command);
    for (const name of viaEntries) workflowEntryNames.add(name);
  }
  return {
    ciEntryNames: reachableEntryNames(names, ciCommand),
    workflowEntryNames: [...workflowEntryNames],
    workflowDirect,
    workflowGated,
  };
}

/**
 * Rule 2: reachable from BOTH executors, or exempt. The failure detail names the MISSING SIDE — the
 * two lists drift independently and "not reachable" alone does not tell a reader whether they broke
 * local runs or the deploy gate. `exemptions` is a parameter so the selftest can calibrate the
 * allowlist mechanism against a synthetic map.
 */
export function auditRule2(file, entryNames, reach, exemptions = RULE2_EXEMPTIONS) {
  const npmSide = reach.ciEntryNames.length > 0;
  const workflowSide = reach.workflowDirect.length > 0 || reach.workflowEntryNames.length > 0;
  if (npmSide && workflowSide) {
    return {
      ok: true,
      detail:
        `reachable from both executors: \`npm run ${reach.ciEntryNames.join('/')}\` inside the ci aggregate, ` +
        `and ${reach.workflowDirect.length} direct + ${reach.workflowEntryNames.length} npm-run step(s) in .github/workflows/ci.yml`,
    };
  }
  const exemptReason = exemptions.get(file);
  if (exemptReason) return { ok: true, detail: `exempted: ${exemptReason}` };
  const missing = [];
  if (!npmSide) missing.push("package.json's `scripts.ci` aggregate (what a developer runs locally) never chains it");
  if (!workflowSide) {
    const gated = reach.workflowGated || [];
    if (gated.length) {
      const keys = [...new Set(gated.flatMap((g) => g.guardedKeys))].sort().join(', ');
      missing.push(
        `.github/workflows/ci.yml only reaches it through step(s) carrying an execution-modifying sibling key not on SAFE_STEP_SIBLING_KEYS (${keys}) — ` +
          'ADR-0045 latent gap 1: a step behind `if:`/`continue-on-error:` (or any other unlisted key) does not unconditionally execute, so it is not counted as reachable',
      );
    } else {
      missing.push('.github/workflows/ci.yml (what gates the deploy) has no `run:` step that executes it — the workflow never runs `npm run ci`, so being in that aggregate buys nothing here');
    }
  }
  return {
    ok: false,
    detail:
      `MISSING SIDE: ${missing.join(' AND ')}. Entries checked: ${[...entryNames].join(', ') || '(none — referenced by the workflow only)'}. ` +
      'Not on the RULE2_EXEMPTIONS allowlist.',
  };
}

/**
 * Rule 3: does EVERY command either executor actually runs for this script chain `--selftest` before
 * the real run (house shape: `node scripts/X.mjs --selftest && node scripts/X.mjs`)? Not reachable at
 * all -> rule 3 does not apply yet (rule 2 already owns that verdict). `exemptions` is a parameter
 * (defaulting to the real allowlist) so the selftest below can calibrate this function against a
 * synthetic allowlist without touching RULE3_EXEMPTIONS itself.
 */
export function auditRule3(file, reach, scripts, exemptions = RULE3_EXEMPTIONS) {
  const executed = [
    ...new Set([...reach.ciEntryNames, ...reach.workflowEntryNames]),
  ].map((name) => ({ label: `npm entry \`${name}\``, command: scripts[name] || '' }));
  for (const cmd of reach.workflowDirect) executed.push({ label: 'ci.yml `run:` step', command: cmd });
  if (executed.length === 0) {
    return { ok: true, detail: 'n/a — not reachable from either executor (see rule 2); nothing runs yet, so nothing owes a --selftest chain' };
  }
  const exemptReason = exemptions.get(file);
  if (exemptReason) {
    return { ok: true, detail: `exempted: ${exemptReason}` };
  }
  const escaped = file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const houseShape = new RegExp(`node\\s+scripts/${escaped}\\s+--selftest\\s*&&\\s*node\\s+scripts/${escaped}\\b`);
  const bad = executed.filter((e) => !houseShape.test(e.command));
  if (bad.length) {
    return {
      ok: false,
      detail:
        `${bad.map((e) => `${e.label} runs \`${e.command.trim()}\``).join('; ')} — ` +
        'never chain --selftest before the real run, so the calibration that executor is supposed to run never executes',
    };
  }
  return { ok: true, detail: `all ${executed.length} executed command(s) chain --selftest before the real run (house shape)` };
}

/**
 * Finding-2 coverage gap, printed every run: commands that hand execution to a shell wrapper, whose
 * transitive gates this audit therefore never looked at. Silence about an unaudited set reads as
 * clean, and this repo has been bitten by exactly that.
 */
export function unauditableCommands(scripts, workflowCommands) {
  // ADR-0045 latent gap 3: match the ARTIFACT (a scripts/*.sh or scripts/*.bash path, anywhere in
  // the command), not the invoker word that happened to precede it. The old `\b(?:bash|sh|zsh)\s+`
  // prefix let `./scripts/foo.sh`, an exec-bit `scripts/foo.sh`, `source scripts/foo.sh`, and
  // `bash -c "..."` all escape this scan and the coverage-gap line it feeds.
  const wrapperRe = /\b(scripts\/[\w.-]+\.(?:sh|bash))\b/g;
  const out = [];
  const seen = new Set();
  const add = (source, command) => {
    for (const m of command.matchAll(wrapperRe)) {
      const key = `${source}|${m[1]}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ source, wrapper: m[1] });
    }
  };
  for (const [name, command] of Object.entries(scripts)) add(`npm entry \`${name}\``, command);
  for (const cmd of workflowCommands) add('ci.yml `run:` step', cmd);
  return out;
}

/**
 * ADR-0045 latent gap 2: the union of references drops a gate with no denominator if it is removed
 * from BOTH executors in one refactor -- nothing before this asserted the union was complete. This
 * globs every `scripts/*.mjs` file whose name contains "check" (the header's own naming rule: "no
 * `*-check` script in this repo may ship as a gate that cannot fail" -- verified against the real
 * tree, not just the suffix case: it also covers the prefix shape, check-citations.mjs, and the
 * mid-name shape, crawl-check-gamenav.mjs; a `-check.mjs$`-only glob false-flagged the latter as a
 * stale RULE3 exemption the first time this ran) -- a REPO-OWNED, countable set, unlike GitHub's
 * execution-modifying keys, so it converges. A disk file matching that glob but absent from
 * `allFiles` (referenced by neither executor) and absent from `exemptions` vanished silently. The
 * mirror direction is checked too: an exemption key that no longer matches on disk is stale.
 */
export function globGateCheckFiles(scriptsDir) {
  return fs
    .readdirSync(scriptsDir)
    .filter((f) => f.endsWith('.mjs') && f.includes('check'))
    .sort();
}

export function auditGateInventory(diskFiles, allFiles, exemptions) {
  const missing = diskFiles.filter((f) => !allFiles.has(f) && !exemptions.has(f));
  const staleExemptions = [...exemptions.keys()].filter((f) => !diskFiles.includes(f));
  return { missing, staleExemptions };
}

// ---------------------------------------------------------------------------
// Pure: one gate script's source text -> rule 1 verdict.
// ---------------------------------------------------------------------------

// `.includes('--selftest')`, not anchored to `process.argv` specifically — thai-comments.mjs reads
// `const args = process.argv.slice(2)` first and checks `args.includes('--selftest')`. Either shape
// is the house idiom for "a CLI flag was passed"; requiring the exact `process.argv` receiver would
// false-flag a real gate for a cosmetic variable-naming choice that changes nothing behaviourally.
function hasSelftestFlag(text) {
  return /\.includes\(\s*['"]--selftest['"]\s*\)/.test(text);
}

/** Brace-matched body of `function selftest() { ... }` — the house convention name, verified
 * present under that exact name in every currently-wired gate (see header comment). */
export function extractSelftestBody(text) {
  // First-MATCH is not first-DECLARATION: this file documents `function selftest() {` in its own
  // header comments, in a JSDoc block, and inside a violation-message string literal — four mentions
  // before the real declaration at the bottom. An unanchored regex grabbed the comment, brace-matched
  // prose, and reported 0 verification statements, so the gate flagged ITSELF the moment it was wired
  // into package.json. A checker cannot tell use from mention; anchoring to start-of-line (allowing
  // `export`/`async`) picks the declaration and skips every mention, which all sit mid-line.
  const m = /^[ \t]*(?:export[ \t]+)?(?:async[ \t]+)?function[ \t]+selftest[ \t]*\([^)]*\)[ \t]*\{/m.exec(text);
  if (!m) return null;
  let i = m.index + m[0].length;
  let depth = 1;
  const start = i;
  while (i < text.length && depth > 0) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') depth--;
    i++;
  }
  if (depth !== 0) return null;
  return text.slice(start, i - 1);
}

/** assert.*(...) + throw new Error(...) occurrences — the two-way-calibration proxy. */
export function countVerificationStatements(body) {
  const asserts = (body.match(/\bassert\.\w+\(/g) || []).length;
  const throws = (body.match(/\bthrow new Error\(/g) || []).length;
  return asserts + throws;
}

export function auditRule1(text) {
  if (!hasSelftestFlag(text)) {
    return { ok: false, detail: "no --selftest CLI flag check (process.argv.includes('--selftest')) found" };
  }
  const body = extractSelftestBody(text);
  if (body === null) {
    return { ok: false, detail: 'the --selftest flag is checked, but no `function selftest() { ... }` body was found to run' };
  }
  const count = countVerificationStatements(body);
  if (count < 2) {
    return {
      ok: false,
      detail:
        `selftest() has only ${count} verification statement(s) (assert.*()/throw new Error() calls) — ` +
        'a real two-way calibration needs at least one check that must pass on a known-good input and ' +
        'one that must fail on a known-bad input; a --selftest flag the script accepts and ignores is a ' +
        'violation, not a pass',
    };
  }
  return { ok: true, detail: `selftest() has ${count} verification statement(s)` };
}

// ---------------------------------------------------------------------------
// IO: audit every gate script package.json references.
// ---------------------------------------------------------------------------
export function scan(scriptsDir, packageJsonText, workflowText, rule3Exemptions = RULE3_EXEMPTIONS) {
  const pkg = JSON.parse(packageJsonText);
  const scripts = pkg.scripts || {};
  const ciCommand = scripts.ci || '';
  const steps = workflowSteps(workflowText || '');
  // The audited SET still includes a gated step's script -- gap 1 must turn it into a named
  // violation (computeReach/auditRule2 below), never make it vanish from the audit entirely.
  const workflowCommands = steps.map((s) => s.command);
  const entryMap = buildEntryMap(scripts);
  // The set is the UNION over both executors: a gate wired only as a workflow step has no npm entry
  // to be found through, and would otherwise be audited by nothing at all.
  const allFiles = new Set(entryMap.keys());
  for (const cmd of workflowCommands) for (const file of scriptFilesInCommand(cmd)) allFiles.add(file);
  const results = [];
  for (const file of [...allFiles].sort()) {
    const entryNames = entryMap.get(file) || new Set();
    const scriptPath = path.join(scriptsDir, file);
    if (!fs.existsSync(scriptPath)) {
      results.push({
        file,
        rule1: {
          ok: false,
          detail: `referenced by ${entryNames.size ? `package.json (${[...entryNames].join(', ')})` : '.github/workflows/ci.yml'} but scripts/${file} does not exist`,
        },
        rule2: { ok: false, detail: 'n/a — file missing' },
        rule3: { ok: false, detail: 'n/a — file missing' },
      });
      continue;
    }
    const text = fs.readFileSync(scriptPath, 'utf8');
    const rule1 = auditRule1(text);
    const reach = computeReach(file, entryNames, ciCommand, steps);
    const rule2 = auditRule2(file, entryNames, reach);
    const rule3 = auditRule3(file, reach, scripts, rule3Exemptions);
    results.push({ file, rule1, rule2, rule3 });
  }
  return results;
}

// ---------------------------------------------------------------------------
// Self-test: a throwaway fixture package.json + scripts dir under os.tmpdir(), never this repo's
// own package.json/scripts — so fixing a real gate can't retune this check. Calibrated both ways
// per rule, plus the exemption path, plus a fix-clears-the-violation round trip.
// ---------------------------------------------------------------------------
function goodSelftestSrc() {
  return [
    "import assert from 'node:assert/strict';",
    'function selftest() {',
    "  assert.equal(1 + 1, 2, 'known-good must pass');",
    "  assert.throws(() => { throw new Error('bad'); }, 'known-bad must fail');",
    "  console.log('PASS');",
    '}',
    "if (process.argv.includes('--selftest')) selftest(); else console.log('main mode');",
  ].join('\n');
}

function selftest() {
  const dir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'gate-selftest-coverage-check-'));
  try {
    fs.writeFileSync(path.join(dir, 'good-check.mjs'), goodSelftestSrc());

    // Rule 1 violation: --selftest flag present, function present, but gutted to a no-op — the
    // EXACT mutation this gate's own acceptance test performs on real gates.
    fs.writeFileSync(
      path.join(dir, 'no-op-selftest-check.mjs'),
      [
        'function selftest() {',
        "  console.log('ok, trust me');",
        '}',
        "if (process.argv.includes('--selftest')) selftest(); else console.log('main mode');",
      ].join('\n'),
    );

    // Rule 1 violation: no --selftest support at all.
    fs.writeFileSync(path.join(dir, 'no-selftest-check.mjs'), "console.log('main mode only');\n");

    // Rule 2 violation: real selftest, but its npm entry is never chained from ci and it is not
    // on the exemption allowlist.
    fs.writeFileSync(path.join(dir, 'unreachable-check.mjs'), goodSelftestSrc());

    // Rule 2 exemption path: real selftest, unreachable from ci, but on RULE2_EXEMPTIONS by its
    // real filename — proves the allowlist actually short-circuits rule 2 for the one entry it names.
    fs.writeFileSync(path.join(dir, 'party-size-claim-check.mjs'), goodSelftestSrc());

    // Rule 3 violation: real selftest AND chained into ci (rule 1 and rule 2 both pass), but its
    // ci-reached entry is bare `node scripts/X.mjs` — never runs --selftest. This is the exact class
    // the coordinator found: a script that CAN calibrate, wired into CI, but never asked to.
    fs.writeFileSync(path.join(dir, 'bare-entry-check.mjs'), goodSelftestSrc());

    // Rule 2, workflow side missing — THE defect this rule was extended for: chained from the npm
    // `ci` aggregate in perfect house shape, and no workflow step runs it, so production CI executes
    // it never. Under a rule 2 that reads package.json alone this fixture is GREEN.
    fs.writeFileSync(path.join(dir, 'npm-only-check.mjs'), goodSelftestSrc());

    // Rule 2, npm side missing — the mirror case: a workflow step runs it, no local run ever does.
    fs.writeFileSync(path.join(dir, 'workflow-only-check.mjs'), goodSelftestSrc());

    // Rule 3, workflow side: npm entry is perfect house shape AND chained from ci, but the ci.yml
    // step that runs it is a bare `node scripts/X.mjs`. Isolates the workflow half of rule 3.
    fs.writeFileSync(path.join(dir, 'bare-workflow-check.mjs'), goodSelftestSrc());

    // Known-good indirection: the workflow reaches this one via `npm run <entry>`, not `node
    // scripts/X.mjs`. Proves workflow reachability counts that shape too, or every gate the workflow
    // calls through npm would read as unreachable.
    fs.writeFileSync(path.join(dir, 'indirect-check.mjs'), goodSelftestSrc());

    // Referenced by package.json but the file was never written — the missing-script path.
    // (no file written for missing-check.mjs on purpose)

    const pkg = {
      scripts: {
        'good-check': 'node scripts/good-check.mjs --selftest && node scripts/good-check.mjs',
        'no-op-selftest-check': 'node scripts/no-op-selftest-check.mjs --selftest && node scripts/no-op-selftest-check.mjs',
        'no-selftest-check': 'node scripts/no-selftest-check.mjs',
        'unreachable-check': 'node scripts/unreachable-check.mjs --selftest && node scripts/unreachable-check.mjs',
        'party-size-claim-check': 'node scripts/party-size-claim-check.mjs',
        'missing-check': 'node scripts/missing-check.mjs --selftest && node scripts/missing-check.mjs',
        'bare-entry-check': 'node scripts/bare-entry-check.mjs',
        'npm-only-check': 'node scripts/npm-only-check.mjs --selftest && node scripts/npm-only-check.mjs',
        'workflow-only-check': 'node scripts/workflow-only-check.mjs --selftest && node scripts/workflow-only-check.mjs',
        'bare-workflow-check': 'node scripts/bare-workflow-check.mjs --selftest && node scripts/bare-workflow-check.mjs',
        'indirect-check': 'node scripts/indirect-check.mjs --selftest && node scripts/indirect-check.mjs',
        'fixture-probes': 'bash scripts/fixture-probes.sh',
        ci:
          'npm run good-check && npm run no-op-selftest-check && npm run no-selftest-check && npm run bare-entry-check && ' +
          'npm run npm-only-check && npm run bare-workflow-check && npm run indirect-check && npm run fixture-probes',
      },
    };
    const pkgText = JSON.stringify(pkg);

    // The second executor, in the shape ci.yml really has: one gate per step, `run:` inline, plus a
    // block scalar and a shell-wrapper step. NOTE what is absent: no `npm run ci` anywhere — that is
    // the real workflow's shape and the reason rule 2 has two sides at all.
    const workflowText = [
      'name: ci',
      'on:',
      '  push:',
      'jobs:',
      '  build:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: actions/checkout@v5',
      '      - name: Good gate',
      '        run: node scripts/good-check.mjs --selftest && node scripts/good-check.mjs',
      '      - name: No-op selftest gate',
      '        run: node scripts/no-op-selftest-check.mjs --selftest && node scripts/no-op-selftest-check.mjs',
      '      - name: No selftest gate',
      '        run: node scripts/no-selftest-check.mjs --selftest && node scripts/no-selftest-check.mjs',
      '      - name: Bare npm entry gate',
      '        run: node scripts/bare-entry-check.mjs --selftest && node scripts/bare-entry-check.mjs',
      '      - name: Workflow-only gate',
      '        run: node scripts/workflow-only-check.mjs --selftest && node scripts/workflow-only-check.mjs',
      '      - name: Bare workflow step gate',
      '        run: node scripts/bare-workflow-check.mjs',
      '      - name: Missing file gate',
      '        run: node scripts/missing-check.mjs --selftest && node scripts/missing-check.mjs',
      '      - name: Reached through npm',
      '        run: npm run indirect-check',
      '      - name: Multi-line step',
      '        run: |',
      '          echo "a block scalar step"',
      '          bash scripts/fixture-probes.sh',
      '',
    ].join('\n');

    // Parser calibration first — every verdict below is downstream of it, and a parser that returned
    // [] would make the whole workflow side of rule 2 a check of nothing that still prints green.
    const parsed = workflowRunCommands(workflowText);
    assert.equal(parsed.length, 9, `must find all 9 \`run:\` steps, got ${parsed.length}`);
    assert.match(parsed[8], /echo "a block scalar step"\n\s+bash scripts\/fixture-probes\.sh/, 'a `run: |` block scalar must be captured as ONE multi-line command, not split or dropped');
    assert.deepEqual(workflowRunCommands(''), [], 'no workflow text must yield no commands (the caller turns that into a loud failure, never a pass)');
    console.log('PASS calibration: the ci.yml `run:` parser finds all 9 steps including the block scalar, and an empty workflow yields none');

    const results = scan(dir, pkgText, workflowText);
    assert.equal(results.length, 11, `must audit all 11 gate scripts the two executors reference, got ${results.length}`);

    const byFile = Object.fromEntries(results.map((r) => [r.file, r]));

    assert.equal(byFile['good-check.mjs'].rule1.ok, true, 'known-good: real 2-statement selftest must pass rule 1');
    assert.equal(byFile['good-check.mjs'].rule2.ok, true, 'known-good: chained from ci must pass rule 2');
    assert.equal(byFile['good-check.mjs'].rule3.ok, true, 'known-good: --selftest && shape must pass rule 3');

    assert.equal(byFile['no-op-selftest-check.mjs'].rule1.ok, false, 'known-bad: a gutted no-op selftest must fail rule 1');
    assert.equal(byFile['no-op-selftest-check.mjs'].rule2.ok, true, 'no-op-selftest-check is still chained from ci, so rule 2 alone must stay green');

    assert.equal(byFile['no-selftest-check.mjs'].rule1.ok, false, 'known-bad: no --selftest support at all must fail rule 1');

    assert.equal(byFile['unreachable-check.mjs'].rule1.ok, true, 'unreachable-check has a real selftest, so rule 1 must pass');
    assert.equal(byFile['unreachable-check.mjs'].rule2.ok, false, 'known-bad: unchained from ci and not exempted must fail rule 2');
    assert.equal(byFile['unreachable-check.mjs'].rule3.ok, true, 'rule 3 does not apply until rule 2 is satisfied — unreachable stays rule-3 clean');
    assert.match(byFile['unreachable-check.mjs'].rule3.detail, /n\/a/, 'the not-yet-applicable rule 3 verdict must say so, not just happen to pass');

    assert.equal(byFile['party-size-claim-check.mjs'].rule1.ok, true, 'the exemption fixture has a real selftest too, so rule 1 must pass');
    assert.equal(byFile['party-size-claim-check.mjs'].rule2.ok, true, 'known-good exemption path: allowlisted by filename must pass rule 2 despite being unchained');
    assert.match(byFile['party-size-claim-check.mjs'].rule2.detail, /exempted/, 'the exemption path must say so in its own detail, not just happen to pass');
    assert.equal(byFile['party-size-claim-check.mjs'].rule3.ok, true, 'still unreachable, so rule 3 does not apply to the rule-2-exempted script either');

    assert.equal(byFile['missing-check.mjs'].rule1.ok, false, 'known-bad: a package.json entry pointing at a file that does not exist must fail rule 1');

    // The RULE 3 finding itself: known-good chained shape passes, known-bad bare entry fails, both
    // on scripts that already clear rule 1 AND rule 2 — isolating rule 3 as the only variable.
    assert.equal(byFile['bare-entry-check.mjs'].rule1.ok, true, 'bare-entry-check has a real selftest, so rule 1 must pass');
    assert.equal(byFile['bare-entry-check.mjs'].rule2.ok, true, 'bare-entry-check is chained from ci, so rule 2 must pass');
    assert.equal(byFile['bare-entry-check.mjs'].rule3.ok, false, 'known-bad: a bare `node scripts/X.mjs` ci-reached entry must fail rule 3 even though rule 1 and rule 2 both pass');
    assert.match(byFile['bare-entry-check.mjs'].rule3.detail, /never chain --selftest/, 'the rule 3 failure must name the missing --selftest chain, not a vague message');

    // The TWO-EXECUTOR legs. Each isolates one side, with every other rule already satisfied.
    assert.equal(byFile['npm-only-check.mjs'].rule1.ok, true, 'npm-only-check has a real selftest, so rule 1 must pass');
    assert.equal(byFile['npm-only-check.mjs'].rule2.ok, false, 'known-bad: chained from the npm ci aggregate in perfect house shape but run by NO workflow step must fail rule 2 — this is the dead-in-production-CI defect');
    assert.match(byFile['npm-only-check.mjs'].rule2.detail, /workflows\/ci\.yml/, 'the rule 2 failure must name the WORKFLOW as the missing side, not just say "not reachable"');
    assert.doesNotMatch(byFile['npm-only-check.mjs'].rule2.detail, /scripts\.ci` aggregate/, 'the npm side is satisfied here and must not be reported as missing');
    assert.equal(byFile['npm-only-check.mjs'].rule3.ok, true, 'the one executed command chains --selftest, so rule 3 must stay green — isolating rule 2 as the only variable');

    assert.equal(byFile['workflow-only-check.mjs'].rule2.ok, false, 'known-bad: run by a workflow step but never chained from the npm ci aggregate must fail rule 2 too — a local run would never execute it');
    assert.match(byFile['workflow-only-check.mjs'].rule2.detail, /scripts\.ci` aggregate/, 'the mirror failure must name the NPM side as the missing one');
    assert.doesNotMatch(byFile['workflow-only-check.mjs'].rule2.detail, /workflows\/ci\.yml/, 'the workflow side is satisfied here and must not be reported as missing');

    assert.equal(byFile['bare-workflow-check.mjs'].rule2.ok, true, 'bare-workflow-check is reached by both executors, so rule 2 must pass');
    assert.equal(byFile['bare-workflow-check.mjs'].rule3.ok, false, 'known-bad: a bare `run: node scripts/X.mjs` workflow step must fail rule 3 even though the npm entry chains --selftest perfectly');
    assert.match(byFile['bare-workflow-check.mjs'].rule3.detail, /ci\.yml `run:` step/, 'the rule 3 failure must name the ci.yml step as the command that never calibrates');
    assert.match(byFile['bare-workflow-check.mjs'].rule3.detail, /never chain --selftest/, 'and must name the missing --selftest chain, not a vague message');

    assert.equal(byFile['indirect-check.mjs'].rule2.ok, true, 'known-good: a workflow step calling `npm run <entry>` must count as workflow reachability');
    assert.equal(byFile['indirect-check.mjs'].rule3.ok, true, 'and the entry it calls chains --selftest, so rule 3 passes through the indirection');

    assert.match(byFile['unreachable-check.mjs'].rule2.detail, /AND/, 'a script missing from BOTH executors must report both sides, not stop at the first');

    const violations = results.filter((r) => !r.rule1.ok || !r.rule2.ok || !r.rule3.ok);
    assert.deepEqual(
      violations.map((v) => v.file).sort(),
      [
        'bare-entry-check.mjs',
        'bare-workflow-check.mjs',
        'missing-check.mjs',
        'no-op-selftest-check.mjs',
        'no-selftest-check.mjs',
        'npm-only-check.mjs',
        'unreachable-check.mjs',
        'workflow-only-check.mjs',
      ],
      'exactly the eight planted defects must violate, no more, no fewer',
    );
    console.log(
      `PASS calibration: ${violations.length}/11 fixture gate(s) flagged — no-op selftest (rule 1), no selftest (rule 1), unreachable from both executors (rule 2), ` +
        'missing file (rule 1), npm-only and workflow-only wiring (rule 2, each naming its missing side), bare npm entry and bare ci.yml step never chaining ' +
        '--selftest (rule 3) — good-check, the npm-run indirection and the allowlisted exemption all stayed clean',
    );

    // Finding-2 bound: the shell wrapper in both executors must be REPORTED, never silently dropped
    // from the audited set, and a wrapper-free pair must say "none" rather than print a stale gap.
    const gaps = unauditableCommands(pkg.scripts, parsed);
    assert.deepEqual(
      gaps.map((g) => g.wrapper).sort(),
      ['scripts/fixture-probes.sh', 'scripts/fixture-probes.sh'],
      'both the npm entry and the workflow step that hand off to a shell wrapper must be reported as unaudited',
    );
    assert.deepEqual(
      [...new Set(gaps.map((g) => (g.source.startsWith('npm entry') ? 'npm entry' : g.source)))].sort(),
      ['ci.yml `run:` step', 'npm entry'],
      'the gap must name WHICH executor each unaudited hand-off came from',
    );
    assert.deepEqual(unauditableCommands({ ci: 'npm run good-check' }, ['node scripts/good-check.mjs']), [], 'no wrapper anywhere must report no gap');
    console.log(`PASS calibration: the ${gaps.length} shell-wrapper hand-off(s) are reported as an unaudited set from both executors, and a wrapper-free pair reports none`);

    // Rule 3 exemption path, calibrated against a SYNTHETIC allowlist passed as scan()'s 3rd
    // argument — never against the real (currently empty) RULE3_EXEMPTIONS — so this fixture can
    // prove the mechanism works without inventing an unreal production exemption.
    const syntheticRule3Exemptions = new Map([['bare-entry-check.mjs', 'fixture-only: proves the allowlist short-circuits rule 3']]);
    const exemptedResults = scan(dir, pkgText, workflowText, syntheticRule3Exemptions);
    const exemptedBare = exemptedResults.find((r) => r.file === 'bare-entry-check.mjs');
    assert.equal(exemptedBare.rule3.ok, true, 'a filename on the rule-3 allowlist must pass rule 3 despite the bare entry');
    assert.match(exemptedBare.rule3.detail, /exempted/, 'the rule 3 exemption path must say so in its own detail');
    console.log('PASS calibration: a synthetic rule-3 allowlist entry short-circuits the bare-entry violation, same mechanism as rule 2');

    // Fix round trip: rewrite every rule-1 offender with a real selftest, chain unreachable-check
    // and missing-check from ci, and add the missing --selftest chain to bare-entry-check's own
    // command — re-scanning must clear all five violations (proves this gate can go green again).
    fs.writeFileSync(path.join(dir, 'no-op-selftest-check.mjs'), goodSelftestSrc());
    fs.writeFileSync(path.join(dir, 'no-selftest-check.mjs'), goodSelftestSrc());
    fs.writeFileSync(path.join(dir, 'missing-check.mjs'), goodSelftestSrc());
    pkg.scripts.ci += ' && npm run unreachable-check && npm run missing-check';
    // no-selftest-check's OWN command was bare from the start (that was its rule-1 fixture shape);
    // giving the file a real selftest without also fixing its command would just trade a rule-1
    // violation for a rule-3 one, so both offending commands get the house shape here.
    pkg.scripts['no-selftest-check'] = 'node scripts/no-selftest-check.mjs --selftest && node scripts/no-selftest-check.mjs';
    pkg.scripts['bare-entry-check'] = 'node scripts/bare-entry-check.mjs --selftest && node scripts/bare-entry-check.mjs';
    // ...and the workflow side of the same round trip: give the two npm-only gates a step, and the
    // bare step its --selftest chain. Both executors have to be fixed for the gate to go green,
    // which is the whole point of rule 2 having two sides.
    pkg.scripts.ci += ' && npm run workflow-only-check';
    const fixedWorkflowText = `${workflowText.replace(
      '        run: node scripts/bare-workflow-check.mjs\n',
      '        run: node scripts/bare-workflow-check.mjs --selftest && node scripts/bare-workflow-check.mjs\n',
    )}${[
      '      - name: Unreachable gate, now wired',
      '        run: node scripts/unreachable-check.mjs --selftest && node scripts/unreachable-check.mjs',
      '      - name: npm-only gate, now wired',
      '        run: node scripts/npm-only-check.mjs --selftest && node scripts/npm-only-check.mjs',
      '',
    ].join('\n')}`;
    assert.notEqual(fixedWorkflowText.includes('        run: node scripts/bare-workflow-check.mjs\n'), true, 'the round trip must actually have rewritten the bare workflow step, not silently no-op');
    const fixedResults = scan(dir, JSON.stringify(pkg), fixedWorkflowText);
    const fixedViolations = fixedResults.filter((r) => !r.rule1.ok || !r.rule2.ok || !r.rule3.ok);
    assert.equal(fixedViolations.length, 0, `fixing every planted defect must clear all violations, still saw: ${fixedViolations.map((v) => v.file).join(', ')}`);
    console.log('PASS calibration: fixing every planted defect (including chaining --selftest into the bare entry) returns the gate to green');

    // ADR-0045 latent gap 2: a gate script glob-matched on disk but referenced by NEITHER executor
    // and not exempted must be flagged, and a stale exemption pointing at a file that no longer
    // exists (or no longer looks like a gate) must be flagged too — the denominator this repo had
    // no assertion on before. The dir already holds the fixture's real `*-check.mjs` files; add one
    // more that is deliberately orphaned from both `pkg.scripts` and the workflow.
    fs.writeFileSync(path.join(dir, 'orphaned-check.mjs'), goodSelftestSrc());
    const diskGateFiles = globGateCheckFiles(dir);
    assert.ok(diskGateFiles.includes('orphaned-check.mjs'), 'the glob must find the new fixture file on disk');
    const knownAllFiles = new Set(fixedResults.map((r) => r.file));
    const orphanInventory = auditGateInventory(diskGateFiles, knownAllFiles, RULE2_EXEMPTIONS);
    assert.deepEqual(orphanInventory.missing, ['orphaned-check.mjs'], 'known-bad: a *-check.mjs file referenced by neither executor and not exempted must be reported missing');
    const staleInventory = auditGateInventory(diskGateFiles, knownAllFiles, new Map([['deleted-check.mjs', 'no longer real']]));
    assert.deepEqual(staleInventory.staleExemptions, ['deleted-check.mjs'], 'known-bad: an exemption naming a file absent from the disk glob must be reported stale');
    fs.rmSync(path.join(dir, 'orphaned-check.mjs'));
    const clearedInventory = auditGateInventory(globGateCheckFiles(dir), knownAllFiles, RULE2_EXEMPTIONS);
    assert.deepEqual(clearedInventory.missing, [], 'known-good: removing the orphan file must clear the missing-from-both-executors finding');
    console.log('PASS calibration: gate-inventory glob flags an orphaned *-check.mjs file and a stale exemption entry, and clears once the orphan is removed');

    // ADR-0045 latent gap 1: a `run:` step carrying `if:` or `continue-on-error:` (or any other
    // sibling key not on SAFE_STEP_SIBLING_KEYS) must not count as workflow reachability, and rule 2
    // must name it specifically -- not read as a generic "no step reaches this at all".
    const gatedWorkflowText = [
      'name: ci',
      'on:',
      '  push:',
      'jobs:',
      '  build:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: actions/checkout@v5',
      '      - name: Gated by if',
      "        if: ${{ github.ref == 'refs/heads/main' }}",
      '        run: node scripts/gated-if-check.mjs --selftest && node scripts/gated-if-check.mjs',
      '      - name: Gated by continue-on-error',
      '        continue-on-error: true',
      '        run: node scripts/gated-coe-check.mjs --selftest && node scripts/gated-coe-check.mjs',
      '      - name: Ungated, safe siblings only',
      '        id: ungated',
      '        shell: bash',
      '        run: node scripts/ungated-check.mjs --selftest && node scripts/ungated-check.mjs',
      '',
    ].join('\n');
    const gatedSteps = workflowSteps(gatedWorkflowText);
    assert.deepEqual(gatedSteps.find((s) => s.command.includes('gated-if-check')).guardedKeys, ['if'], 'an `if:` sibling must be captured as a guarded key');
    assert.deepEqual(gatedSteps.find((s) => s.command.includes('gated-coe-check')).guardedKeys, ['continue-on-error'], 'a `continue-on-error:` sibling must be captured as a guarded key');
    assert.deepEqual(gatedSteps.find((s) => s.command.includes('ungated-check')).guardedKeys, [], 'name:/id:/shell: siblings must never be treated as guarding execution');
    console.log('PASS calibration: workflowSteps captures if:/continue-on-error: as guarded keys and leaves name:/id:/shell: alone');

    fs.writeFileSync(path.join(dir, 'gated-if-check.mjs'), goodSelftestSrc());
    const gatedPkgText = JSON.stringify({
      scripts: {
        'gated-if-check': 'node scripts/gated-if-check.mjs --selftest && node scripts/gated-if-check.mjs',
        ci: 'npm run gated-if-check',
      },
    });
    const gatedResults = scan(dir, gatedPkgText, gatedWorkflowText);
    const gatedFile = gatedResults.find((r) => r.file === 'gated-if-check.mjs');
    assert.equal(gatedFile.rule2.ok, false, 'known-bad: chained from npm ci but only reachable via an `if:`-gated workflow step must fail rule 2');
    assert.match(gatedFile.rule2.detail, /execution-modifying sibling key/, 'the rule 2 failure must name the gap-1 reason, not a generic missing-side message');
    assert.match(gatedFile.rule2.detail, /\(if\)/, 'the failure must name the actual guarded key found');

    // Known-good control: the same step with the `if:` removed must clear rule 2.
    const ungatedWorkflowText = gatedWorkflowText.replace(
      "      - name: Gated by if\n        if: ${{ github.ref == 'refs/heads/main' }}\n        run: node scripts/gated-if-check.mjs --selftest && node scripts/gated-if-check.mjs\n",
      '      - name: Gated by if, now unconditional\n        run: node scripts/gated-if-check.mjs --selftest && node scripts/gated-if-check.mjs\n',
    );
    assert.notEqual(ungatedWorkflowText, gatedWorkflowText, 'the control fixture must actually differ from the gated one, not silently no-op');
    const ungatedResults = scan(dir, gatedPkgText, ungatedWorkflowText);
    const ungatedFile = ungatedResults.find((r) => r.file === 'gated-if-check.mjs');
    assert.equal(ungatedFile.rule2.ok, true, 'known-good: removing the `if:` sibling must clear the rule 2 violation');
    console.log('PASS calibration: a gate step behind if:/continue-on-error: fails rule 2 by name (gap 1), and clears once unconditional');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
async function main() {
  if (process.argv.includes('--selftest')) return selftest();

  const scriptsDir = path.join(repoRoot, 'scripts');
  const packageJsonText = fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8');
  const workflowPath = path.join(repoRoot, '.github/workflows/ci.yml');
  // A missing or unparseable workflow must be LOUD. If it silently read as "no run: steps", every
  // gate would fail rule 2 on the workflow side, or worse, a future refactor of that file's shape
  // would quietly turn one whole side of rule 2 into a check of nothing.
  if (!fs.existsSync(workflowPath)) {
    console.error('::error::.github/workflows/ci.yml not found — rule 2 cannot check the executor that gates the deploy, so nothing here is a clean verdict');
    process.exit(1);
  }
  const workflowText = fs.readFileSync(workflowPath, 'utf8');
  const workflowCommands = workflowRunCommands(workflowText);
  if (workflowCommands.length < 2) {
    console.error(
      `::error::.github/workflows/ci.yml parsed to ${workflowCommands.length} \`run:\` step(s) — that file runs a dozen gates, so the parser is broken, not the workflow`,
    );
    process.exit(1);
  }
  const results = scan(scriptsDir, packageJsonText, workflowText);
  if (!results.length) {
    console.error('::error::no gate entries found in package.json scripts — nothing was audited, which is not the same as clean');
    process.exit(1);
  }

  // Printed BEFORE any verdict, pass or fail: what this audit could not look at. Not a violation —
  // an honest bound, so "0 violations" is never read as "everything was audited".
  const gaps = unauditableCommands(JSON.parse(packageJsonText).scripts || {}, workflowCommands);
  if (gaps.length) {
    console.log(
      `gate-selftest-coverage-check COVERAGE GAP: ${gaps.length} shell-wrapper invocation(s) hand execution to a script this audit does not follow — ` +
        `${gaps.map((g) => `${g.source} -> ${g.wrapper}`).join('; ')}. Every gate those wrappers drive (and any *-check.mjs they run) is NEITHER audited ` +
        'NOR exempted here; rules 1-3 say nothing about it. See THE SET\'S HONEST BOUND in this script\'s header.',
    );
  } else {
    console.log('gate-selftest-coverage-check COVERAGE GAP: none — no shell-wrapper invocation found in either executor, so the audited set is the whole set');
  }

  // ADR-0045 latent gap 2: a countable, repo-owned denominator on top of the reference union above —
  // catches a gate deleted from BOTH executors in one refactor (the union has nothing to notice that
  // against) and a stale exemption entry left pointing at a file that is no longer even a gate.
  const diskGateFiles = globGateCheckFiles(scriptsDir);
  const allFiles = new Set(results.map((r) => r.file));
  const inventory = auditGateInventory(diskGateFiles, allFiles, RULE2_EXEMPTIONS);
  if (inventory.missing.length) {
    for (const f of inventory.missing) {
      console.error(
        `::error file=scripts/${f}::[gate-selftest-coverage gate inventory] scripts/${f} matches the *-check.mjs gate naming convention but is ` +
          'referenced by neither executor and is not on RULE2_EXEMPTIONS — it either fell out of both lists silently, or it is not a gate and should ' +
          'be renamed off the *-check.mjs convention',
      );
    }
  }
  if (inventory.staleExemptions.length) {
    for (const f of inventory.staleExemptions) {
      console.error(
        `::error::[gate-selftest-coverage gate inventory] RULE2_EXEMPTIONS names scripts/${f}, which is no longer a *-check.mjs file on disk — stale entry, delete it`,
      );
    }
  }
  // Same staleness check on RULE3_EXEMPTIONS — reuses auditGateInventory purely for its
  // staleExemptions half; RULE3's "missing" concept does not apply (a calibration-skip exemption
  // says nothing about reachability), so `allFiles` here is a don't-care passed as the full set.
  const rule3Stale = auditGateInventory(diskGateFiles, allFiles, RULE3_EXEMPTIONS).staleExemptions;
  for (const f of rule3Stale) {
    console.error(
      `::error::[gate-selftest-coverage gate inventory] RULE3_EXEMPTIONS names scripts/${f}, which is no longer a *-check.mjs file on disk — stale entry, delete it`,
    );
  }
  if (inventory.missing.length || inventory.staleExemptions.length || rule3Stale.length) process.exit(1);

  const violations = results.filter((r) => !r.rule1.ok || !r.rule2.ok || !r.rule3.ok);
  if (violations.length) {
    for (const v of violations) {
      if (!v.rule1.ok) console.error(`::error file=scripts/${v.file}::[gate-selftest-coverage rule 1: real --selftest] ${v.rule1.detail}`);
      if (!v.rule2.ok) console.error(`::error file=scripts/${v.file}::[gate-selftest-coverage rule 2: reachable or exempt] ${v.rule2.detail}`);
      if (!v.rule3.ok) console.error(`::error file=scripts/${v.file}::[gate-selftest-coverage rule 3: ci-reached entry chains --selftest] ${v.rule3.detail}`);
    }
    console.error(`\n${violations.length}/${results.length} gate script(s) can ship as a gate that cannot fail.`);
    process.exit(1);
  }

  console.log(
    `gate-selftest-coverage-check: ${results.length} gate script(s) audited across BOTH executors (the union of package.json's scripts block and ci.yml — a workflow-only gate is counted here too, so this is not a package.json count) and ${workflowCommands.length} ci.yml \`run:\` step(s) parsed, ` +
      `${RULE2_EXEMPTIONS.size} rule-2 exemption(s) and ${RULE3_EXEMPTIONS.size} rule-3 exemption(s) on the allowlists, 0 violation(s).`,
  );
}

await main();
