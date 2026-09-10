#!/usr/bin/env node
// gh#112 — every distinct Thai codepoint run reaching a player from the pinned tool-surface file
// set must be a verbatim key in scripts/tool-copy-registry.json, and a commit that adds a run
// without its key fails.
//
// WHY THIS SHAPE. Box 1 of the ticket asked the tree about its own history (who authored a Thai
// string) and is unfalsifiable: authorship is not a property of the tree. What IS falsifiable is
// presence — a run either has a registry row or it does not. The one underivable half (who wrote
// it) survives as the row's `source` field, claimed forward at write time.
//
// ADR-0025 — this gate polices what a commit ADDS. The registry is grandfathered against the
// baseline commit named in its own `baseline` field, so the tree passes on landing day and the
// demanded set only shrinks. A key in the registry that no longer appears in the tree is reported
// as an orphan and is NOT a failure.
//
// SEGMENTATION, defined once, here, pinned by selftest() on a fixture. A RUN is a maximal
// character sequence that STARTS and ENDS on a Thai codepoint (U+0E00-U+0E7F) and may contain,
// between those ends, Thai codepoints and these JOINERS only:
//     space, ASCII digits, and  . , ! ? % : ( ) -
// Everything else splits: quotes, angle brackets, braces, slashes, Latin letters, newlines. So a
// run stops at a tag or literal boundary and a phrase stays whole enough to review as copy. The
// ticket's number 211 is NOT inherited; it was an artifact of a different choice. `/` is
// deliberately not a joiner, or a run could swallow a `//` comment opener next to it.
//
// COMMENT CHANNEL — excluded. Comments in these files cite UI copy; a citation is a mention, not
// a string reaching a player, so it is neither demanded nor allowed to satisfy a demand.
//
// CONSERVATION / SELF-ABORT (the shape scripts/accent-single-source-check.mjs implements as
// conservationFailures). Excluding comments means blanking text, and a stripper that blanks LIVE
// text would make this gate quietly demand less than it should. So: every Thai codepoint present
// in the raw file and dead after stripping must lie inside a comment span found by an INDEPENDENT
// textual scan of the raw text. One outside them aborts the run before any verdict is printed.
// The textual scan guards `//` with a lookbehind so a scheme URL is not an opener — that is the
// exact class (live text after `://` in template position) that once blanked live lines here.
// DISCLOSED CEILING: the textual scan ignores quoting, so a `/*` inside a string literal creates a
// phantom span and over-attributes. It fails toward attributing, never toward a false abort.
//
// THE FILE SET is enumerated (PIN below), never globbed. Two feeds are reconciled against it in
// both directions on every run: the tool directories, and the static import closure of the tool
// pages. The closure feed exists because src/components/ToolNameEntry.astro lives outside those
// directories and was hand-added to the ticket's list — a second such component would otherwise
// escape the pin in silence. Nodes on EXCLUDED are not descended into, or the closure becomes the
// whole site.
//
// NOT COVERED, and a green here earns no clearance over it (ADR-0019): site-wide chrome
// (Base.astro, GameNav.astro) is out of the pin by the ticket's own enumeration, so the GameNav
// heading literal the 2026-08-26 comment names as a past omission is still not covered by this
// gate. Thai reaching a player from anywhere outside PIN is not looked at.
//
//   node scripts/tool-copy-registry-check.mjs             -> audit the pinned set, exit 0 or 1
//   node scripts/tool-copy-registry-check.mjs --selftest  -> calibration on fixture text

import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { stripComments, stripAstro, astroTemplateFixture } from './strip-comments.mjs';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const REGISTRY_REL = 'scripts/tool-copy-registry.json';

/** The pinned set. Enumerated, not globbed. Both feeds below must reconcile against it exactly. */
const PIN = [
  'src/components/ToolNameEntry.astro',
  'src/pages/tool/draw.astro',
  'src/pages/tool/number.astro',
  'src/pages/tool/team.astro',
  'src/pages/tool/wheel.astro',
  'src/pages/tools/index.astro',
  'src/tools/draw-round.ts',
  'src/tools/draw.ts',
  'src/tools/manifest.ts',
  'src/tools/name-list.ts',
  'src/tools/number.ts',
  'src/tools/team.ts',
  'src/tools/wheel-round.ts',
  'src/tools/wheel.ts',
];

/** Reached by the closure feed and deliberately out of the pin. Each names why; not descended into. */
const EXCLUDED = {
  'src/layouts/Base.astro': 'site-wide chrome — its Thai belongs to every page, not to the tool surfaces gh#112 enumerated',
  'src/components/GameNav.astro': 'site-wide chrome, shared with game and fortune pages; the ticket enumerated the tool surfaces only',
  'src/shell/lock.ts': 'shell primitive, no player-facing copy channel of its own',
};

/** Closed vocabulary for a row's `source`. Empty or out-of-vocabulary is a failure. */
const FIXED_SOURCES = new Set([
  'design/canvas.json',
  'src/styles/tokens.css',
  'src/tools/manifest.ts',
  'owner-supplied',
  'agent-authored-pending-owner-review',
]);
const ARTBOARD_SOURCE = /^design\/[A-Za-z0-9_-]+\.dc\.html$/;

// ---------------------------------------------------------------------------
// Segmentation — the one definition, pinned by selftest() on a fixture.
// ---------------------------------------------------------------------------
const THAI = '\\u0E00-\\u0E7F';
const JOINERS = '0-9 .,!?%:()\\-';
const RUN = new RegExp(`[${THAI}](?:[${THAI}${JOINERS}]*[${THAI}])?`, 'gu');

/** The one segmentation definition. See SEGMENTATION in the header for the rule it implements. */
export function segment(text) {
  return [...text.matchAll(RUN)].map((m) => m[0]);
}

/** Written as escapes: U+0E00 and U+0E7F have no printable glyph and would not survive an edit. */
export const isThai = (ch) => ch >= '\u0E00' && ch <= '\u0E7F';

/** Marks a char the comment-stripper blanked. Not Thai, not a joiner, so it always splits a run. */
const SENTINEL = '\u0001';

/** Comments blanked by the grammar that owns the file; blanked chars become a hard split sentinel. */
export function strippedWithSentinel(rel, raw) {
  const blank = (m) => m.replace(/[^\n]/g, ' ');
  const stripped = rel.endsWith('.astro')
    ? stripAstro(raw.replace(/<!--[\s\S]*?-->/g, blank))
    : stripComments(raw);
  // A blanked char becomes SENTINEL, not a space: the stripper blanks to spaces and space is a
  // joiner, so a comment sitting between two live runs would otherwise weld them into one key.
  let out = '';
  for (let i = 0; i < raw.length; i++) {
    out += stripped[i] === raw[i] ? raw[i] : raw[i] === '\n' ? '\n' : SENTINEL;
  }
  return out;
}

/** Comment spans located by an INDEPENDENT textual scan of the raw text — see CONSERVATION above. */
export function textualCommentMask(rel, raw) {
  const mask = new Uint8Array(raw.length);
  const res = [/\/\*[\s\S]*?\*\//g, /(?<![:\w])\/\/[^\n]*/g];
  if (rel.endsWith('.astro')) res.push(/<!--[\s\S]*?-->/g);
  for (const re of res) for (const m of raw.matchAll(re)) mask.fill(1, m.index, m.index + m[0].length);
  return mask;
}

/**
 * A Thai codepoint alive in the raw file and dead after stripping, sitting outside every textual
 * comment span, is evidence this gate lost text it was supposed to read. Abort, never pass.
 */
export function conservationFailures(rel, raw, sentinel) {
  const mask = textualCommentMask(rel, raw);
  const lost = [];
  for (let i = 0; i < raw.length; i++) {
    if (!isThai(raw[i]) || sentinel[i] !== SENTINEL || mask[i]) continue;
    lost.push({ line: raw.slice(0, i).split('\n').length, near: raw.slice(i, i + 24).split('\n')[0] });
    i += 24;
  }
  return lost;
}

/** Runs this file demands a registry key for. */
export function demandedRuns(rel, raw) {
  const sentinel = strippedWithSentinel(rel, raw);
  const aborts = conservationFailures(rel, raw, sentinel);
  if (aborts.length) {
    const at = aborts.map((a) => `line ${a.line} near "${a.near}"`).join('; ');
    throw new Error(
      `ABORT ${rel}: Thai text is present raw and gone after comment-stripping outside every ` +
        `comment span this gate can find textually (${at}). Either a comment opener inside a ` +
        `literal is blanking live lines, or the stripper is routed to the wrong grammar. No ` +
        `verdict is printed for a file whose copy this gate cannot prove it read.`,
    );
  }
  return segment(sentinel);
}

// ---------------------------------------------------------------------------
// The file set: two feeds, reconciled against PIN in both directions.
// ---------------------------------------------------------------------------
const listDir = (rel, keep) => {
  const abs = path.join(repoRoot, rel);
  return fs.existsSync(abs) ? fs.readdirSync(abs).filter(keep).map((n) => `${rel}/${n}`).sort() : [];
};

export function directoryFeed() {
  return [
    ...listDir('src/pages/tool', (n) => n.endsWith('.astro')),
    ...listDir('src/tools', (n) => n.endsWith('.ts') && !n.endsWith('.test.ts')),
  ];
}

const IMPORT_RE = /^[^\S\n]*import\s[\s\S]*?from\s*['"]([^'"]+)['"]|^[^\S\n]*import\s*['"](\.[^'"]+)['"]/gm;

/** Static import closure of the tool pages. An unresolvable relative import fails closed. */
export function closureFeed(roots) {
  const seen = new Set();
  const queue = [...roots];
  const unresolved = [];
  while (queue.length) {
    const rel = queue.shift();
    if (seen.has(rel)) continue;
    seen.add(rel);
    if (EXCLUDED[rel]) continue; // reached, recorded, not descended into
    let text;
    try {
      text = fs.readFileSync(path.join(repoRoot, rel), 'utf8');
    } catch {
      unresolved.push(rel);
      continue;
    }
    for (const m of text.matchAll(IMPORT_RE)) {
      const spec = m[1] ?? m[2];
      if (!spec || !spec.startsWith('.')) continue;
      const base = path.posix.normalize(path.posix.join(path.posix.dirname(rel), spec));
      const cand = [base, `${base}.ts`, `${base}.astro`].find((c) => fs.existsSync(path.join(repoRoot, c)));
      if (!cand) {
        unresolved.push(`${rel} -> ${spec}`);
        continue;
      }
      if (!seen.has(cand)) queue.push(cand);
    }
  }
  return { files: [...seen].sort(), unresolved };
}

export function reconcile(discovered, pin, excluded) {
  const allowed = new Set([...pin, ...Object.keys(excluded)]);
  const pinSet = new Set(pin);
  return {
    unlisted: discovered.filter((f) => !allowed.has(f)),
    missing: pin.filter((f) => !discovered.includes(f)),
    stale: Object.keys(excluded).filter((f) => pinSet.has(f)),
  };
}

export function registryProblems(registry) {
  const out = [];
  if (!registry || typeof registry !== 'object') return ['registry is not an object'];
  if (typeof registry.baseline !== 'string' || !/^[0-9a-f]{7,40}$/.test(registry.baseline)) {
    out.push('registry.baseline must name the grandfathering commit (ADR-0025)');
  }
  for (const [key, row] of Object.entries(registry.rows ?? {})) {
    const source = row?.source;
    if (typeof source !== 'string' || source === '') out.push(`"${key}": empty source`);
    else if (!FIXED_SOURCES.has(source) && !ARTBOARD_SOURCE.test(source)) {
      out.push(`"${key}": source "${source}" is outside the closed vocabulary`);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Self-test. Pure: every leg feeds plain rel/text strings, no fixture tree on disk.
// ---------------------------------------------------------------------------
function selftest() {
  // SEGMENTATION, pinned on a fixture. Exact keys, both what joins and what splits.
  const fixture = [
    '<p>เล่นได้ 2-10 คน</p>',
    "const a = 'ใส่ชื่อ'; const b = 'ลงวงล้อ';",
    'ถามว่า: อะไรนะ? (ไม่รู้) 100% ครับ',
    'AชนB ตัวอักษร mixed ไทย',
    'ก ข',
  ].join('\n');
  assert.deepEqual(
    segment(fixture),
    [
      'เล่นได้ 2-10 คน',
      'ใส่ชื่อ',
      'ลงวงล้อ',
      'ถามว่า: อะไรนะ? (ไม่รู้) 100% ครับ',
      'ชน',
      'ตัวอักษร',
      'ไทย',
      'ก ข',
    ],
    'segmentation: joiners hold a phrase together; quotes, tags, Latin letters and newlines split',
  );
  console.log('PASS segmentation: fixture segments to the pinned key list');

  // COMMENT CHANNEL, both directions, on the same run.
  const run = 'ข้อความทดสอบ';
  assert.deepEqual(demandedRuns('src/tools/wheel.ts', `export const M = '${run}';`), [run], 'a Thai run in a literal must be demanded');
  assert.deepEqual(demandedRuns('src/tools/wheel.ts', `// ${run}\nexport const M = 1;`), [], 'the same run in a comment must NOT be demanded');
  console.log('PASS comment channel: demanded in a literal, not demanded in a comment');

  // A comment must not weld two live runs into one key. The stripper blanks to spaces and space
  // is a joiner, so without the sentinel these two segment as one phrase with a hole in it.
  assert.deepEqual(
    demandedRuns('src/pages/tool/wheel.astro', '<p>กก<!-- ขข -->คค</p>'),
    ['กก', 'คค'],
    'blanked comment text must split, never join, the runs around it',
  );
  console.log('PASS sentinel: a comment between two runs does not weld them');

  // SEO title/description are in scope — party-size-claim-check's EXEMPT_META is NOT inherited.
  assert.deepEqual(
    demandedRuns('src/pages/tool/wheel.astro', '<Base title="หัวเรื่อง" description="คำบรรยาย">'),
    ['หัวเรื่อง', 'คำบรรยาย'],
    'per-page SEO title and description runs are both demanded',
  );
  console.log('PASS SEO: title and description runs are both demanded');

  // CONSERVATION ABORT. POSITIVE CONTROL first: the fixture must really lose the run under the
  // stripper, or the abort leg proves nothing. A .ts routing applied to template-position text is
  // the mis-routing this leg exists to catch.
  const misrouted = astroTemplateFixture('ข้อความสด');
  assert.ok(
    !stripComments(misrouted).includes('ข้อความสด'),
    'POSITIVE CONTROL: the stripper must lose this run, or the abort leg proves nothing',
  );
  assert.throws(() => demandedRuns('src/tools/wheel.ts', misrouted), /ABORT /, 'live Thai blanked outside every textual comment span must abort');
  console.log('PASS conservation: live Thai lost to stripping aborts instead of quietly under-demanding');

  // PIN reconciliation, both directions.
  assert.deepEqual(reconcile(['a.ts', 'b.ts'], ['a.ts'], {}), { unlisted: ['b.ts'], missing: [], stale: [] }, 'a file discovered and not pinned must fail');
  assert.deepEqual(reconcile(['a.ts'], ['a.ts', 'c.ts'], {}), { unlisted: [], missing: ['c.ts'], stale: [] }, 'a pinned file no longer discovered must fail');
  assert.deepEqual(reconcile(['a.ts', 'x.ts'], ['a.ts'], { 'x.ts': 'why' }).unlisted, [], 'an excluded file is allowed, not unlisted');
  console.log('PASS pin: unlisted, missing and excluded all classify');

  // SOURCE vocabulary.
  assert.deepEqual(registryProblems({ baseline: 'd7ce37f', rows: { a: { source: 'design/ToolWheel390.dc.html' } } }), [], 'a named artboard is in vocabulary');
  assert.equal(registryProblems({ baseline: 'd7ce37f', rows: { a: { source: '' } } }).length, 1, 'an empty source must be rejected');
  assert.equal(registryProblems({ baseline: 'd7ce37f', rows: { a: { source: 'vibes' } } }).length, 1, 'an out-of-vocabulary source must be rejected');
  assert.equal(registryProblems({ rows: {} }).length, 1, 'a registry with no baseline commit must be rejected');
  console.log('PASS source vocabulary: artboard accepted, empty and out-of-vocabulary rejected, baseline demanded');
}

function main() {
  const dir = directoryFeed();
  const roots = [...dir.filter((f) => f.endsWith('.astro')), 'src/pages/tools/index.astro'];
  const closure = closureFeed(roots);
  if (closure.unresolved.length) {
    console.error(`tool-copy-registry-check: unresolvable static import(s): ${closure.unresolved.join(', ')}`);
    return 1;
  }
  const discovered = [...new Set([...dir, ...closure.files])].sort();
  const { unlisted, missing, stale } = reconcile(discovered, PIN, EXCLUDED);
  if (unlisted.length || missing.length || stale.length) {
    for (const f of unlisted) {
      console.error(`${f}: reached by the tool directories or the tool pages' import closure and absent from the pinned list. Add it to PIN (with a registry row per Thai run) or to EXCLUDED with a reason.`);
    }
    for (const f of missing) console.error(`${f}: pinned and no longer discovered. Remove it from PIN.`);
    for (const f of stale) console.error(`${f}: listed in both PIN and EXCLUDED.`);
    return 1;
  }

  let registry;
  try {
    registry = JSON.parse(fs.readFileSync(path.join(repoRoot, REGISTRY_REL), 'utf8'));
  } catch (e) {
    console.error(`tool-copy-registry-check: cannot read ${REGISTRY_REL}: ${e.message}`);
    return 1;
  }
  const problems = registryProblems(registry);
  if (problems.length) {
    for (const p of problems) console.error(`${REGISTRY_REL}: ${p}`);
    return 1;
  }

  const keys = new Set(Object.keys(registry.rows ?? {}));
  const seen = new Set();
  const missingRows = [];
  let runCount = 0;
  for (const rel of PIN) {
    let runs;
    try {
      runs = demandedRuns(rel, fs.readFileSync(path.join(repoRoot, rel), 'utf8'));
    } catch (e) {
      console.error(e.message);
      return 1;
    }
    for (const r of runs) {
      runCount++;
      seen.add(r);
      if (!keys.has(r)) missingRows.push({ rel, run: r });
    }
  }
  console.log(`tool-copy-registry-check: scanned ${PIN.length} pinned file(s)`);
  for (const rel of PIN) console.log(`  ${rel}`);
  for (const [f, why] of Object.entries(EXCLUDED)) console.log(`  (excluded) ${f} — ${why}`);

  if (missingRows.length) {
    for (const m of missingRows) console.error(`${m.rel}: Thai run "${m.run}" has no row in ${REGISTRY_REL}`);
    console.error(
      `\ngh#112: ${missingRows.length} run(s) reach a player with no registry row. Add each as a verbatim key with a \`source\` from the closed vocabulary — a named design/*.dc.html artboard, design/canvas.json, src/styles/tokens.css, src/tools/manifest.ts, owner-supplied, or agent-authored-pending-owner-review.`,
    );
    return 1;
  }
  const orphans = [...keys].filter((k) => !seen.has(k)).length;
  // The pending count is deliberately NOT printed, per the owner ruling of 2026-09-10 on gh#229.
  // It used to be, and the argument for printing it is still sound on its own terms: gh#112's point
  // was that agent-authored and owner-authored Thai are indistinguishable in the diff, in the build
  // and in every test, so `source` is the field that tells them apart and a bare green here reads as
  // "every run has been reviewed" when it only means "every run has a row".
  // What settled it the other way: 79 of 134 rows carried agent-authored-pending-owner-review, the
  // owner accepted that as a resting state rather than a backlog, and a number nobody is going to
  // act on becomes a permanent unread warning that trains readers to skim this line. The ticket's
  // own DoD asked for this decision explicitly rather than leaving the print to habit.
  // The signal is not deleted, only unprinted — `source` still lives on every row, the closed
  // vocabulary above still forces a new row to declare one, and the count is one command away:
  //   node -e "const r=require('./scripts/tool-copy-registry.json');console.log(Object.values(r.rows).filter(x=>x.source==='agent-authored-pending-owner-review').length)"
  // Re-adding it to this line needs a ruling that supersedes gh#229's, not a judgement that the
  // number looks useful again.
  console.log(
    `tool-copy-registry-check: ${runCount} Thai run occurrence(s), ${seen.size} distinct, all present in ${REGISTRY_REL} (baseline ${registry.baseline}); ${orphans} orphan key(s) — the set only shrinks, ADR-0025. Rows carrying source=agent-authored-pending-owner-review are an accepted resting state and their count is not reported here (gh#229). NOT COVERED: Thai outside the pinned set, including site-wide chrome.`,
  );
  return 0;
}

// Entrypoint-gated so the exported helpers can be imported by a one-off tool without the audit
// firing as a side effect of the import.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  if (process.argv.includes('--selftest')) selftest();
  else process.exit(main());
}
