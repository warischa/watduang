#!/usr/bin/env node
// Guard against dead doc-to-doc citations. This repo migrates agent docs Thai -> English one
// file at a time (see CLAUDE.md "Write English. Ship Thai."), and every conversion is free to
// silently break an inbound citation that names a heading or a line number in another file.
// This has recurred 4 times. Catches the CLASS (any citation of either form below going dead),
// not one instance.
//
// Two citation forms are checked, both proven fragile by real breakage in this repo:
//   1. Heading-text: `file.md` § "Heading text"  (or unquoted-to-delimiter: § Heading — rest)
//      Dead when the target file's heading text no longer matches exactly.
//   2. Line-number: file.md:N or file.md:N-M
//      Dead when the target file has fewer than N/M lines, or — when the citation quotes
//      content — when that quoted text is no longer near line N (gh#29: broke twice when
//      docs/site-owner-checklist.md was split).
//
//   node scripts/check-citations.mjs             -> scan the repo, exit non-zero if any dead
//   node scripts/check-citations.mjs --selftest   -> both-direction calibration on a temp fixture
//
// docs/sessions-archive.md is a verbatim historical record (never edited) and is excluded —
// it already carries known-dead § citations that are not this checker's job to fix.
//
// --- Ceiling: what this checker does NOT check (gh#44, ADR-0019) --------------------
// A green run here means "the citations this checker owns all resolve" — it does not mean
// "no dead citation exists in this repo." Three known gaps, disclosed so a green run can't
// be misread as full coverage:
//
//   1. Prose-separated citations are invisible. Both heading regexes require the `.md` path
//      and the `§` to be separated by whitespace ONLY (`\s*`). A citation with prose between
//      them — e.g. docs/runbook.md:5, "...pointing here (under § Rules that must not be
//      broken ...)" — is never matched; rename that heading and this script still prints
//      "all citations resolve". Widening the regex to close this was tried and rejected: it
//      produces false positives on this repo's own prose (docs/verification/evidence/44/
//      prose-separated-scan.md), and the set of ways prose can separate a path from a `§` is
//      owned by whoever writes the next paragraph, not by this script — it does not converge.
//   2. Heading match is exact-string, not fuzzy. A citation naming only a heading's leading
//      words (`§ Supersession`) does not resolve against the real heading
//      `## Supersession — S2026-08-15#4`, even though a human reads it fine. Referenced line:
//      docs/adr/0010-checkpoint-slot-stays-site-wide-until-a-second-writer-exists.md:125 — but
//      that citation is ALSO prose-separated (ceiling 1), so the gate never even attempts the
//      exact-match step on it in this repo; it is shown here as what the row WOULD be if the
//      citation were reachable, not a live ceiling-2 bite.
//   3. This checker cannot describe its own subject matter. Any document that quotes a
//      citation in the `path § "heading"` form — to explain or document this checker — is
//      itself scanned, and the quoted example is treated as a live citation. See
//      docs/verification/evidence/44/prose-separated-scan.md, which has to dodge that form
//      in its own tables to avoid tripping this script.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const EXCLUDE_DIRS = new Set(['node_modules', '.scratch', '.git', 'dist']);
const EXCLUDE_FILES = new Set(['docs/sessions-archive.md']);

// ---------------------------------------------------------------------------
// Pure: text -> citations. No file IO here, so the selftest can feed it strings directly.
// ---------------------------------------------------------------------------
function lineOf(text, index) {
  let line = 1;
  for (let i = 0; i < index; i++) if (text[i] === '\n') line++;
  return line;
}

// Third alt: bare path, no backticks and no markdown link — still a citation this checker
// owns (gh#36 reproducer). Lookbehind blocks the whole path-char class, not just backtick/paren,
// so it can't restart mid-path (e.g. `docs/target.md` must not also match as `target.md`).
const PATH_ALT = '(?:`([^`]+\\.md)`|\\[[^\\]]*\\]\\(([^)]+\\.md)\\)|(?<![`A-Za-z0-9_./-])([A-Za-z0-9_./-]+\\.md)\\b)';
const headingQuotedRe = new RegExp(`${PATH_ALT}\\s*§\\s*"([^"]+)"`, 'g');
// (?!\s*\d) excludes this repo's other § idiom — numbered-section refs like `file.md` §2 —
// which is not one of the two citation forms this checker owns (see header comment).
const headingUnquotedRe = new RegExp(`${PATH_ALT}\\s*§\\s*(?!\\s*")(?!\\s*\\d)([^\\n]+)`, 'g');
const lineNoRe = /\b([A-Za-z0-9_./-]+\.md):(\d+)(?:-(\d+))?\b/g;

function findCitations(text) {
  const citations = [];

  for (const m of text.matchAll(headingQuotedRe)) {
    citations.push({ kind: 'heading', line: lineOf(text, m.index), path: m[1] ?? m[2] ?? m[3], heading: m[4] });
  }
  for (const m of text.matchAll(headingUnquotedRe)) {
    const raw = m[4];
    // Comma/colon end the heading too — trailing prose routinely continues with either
    // ("§ Heading, then do the thing") without an em-dash or period in between (gh#36).
    const cut = raw.search(/\s+—|\s+--|\.\s|\.$|,|:/);
    const heading = (cut === -1 ? raw : raw.slice(0, cut)).trim();
    if (heading) citations.push({ kind: 'heading', line: lineOf(text, m.index), path: m[1] ?? m[2] ?? m[3], heading });
  }
  for (const m of text.matchAll(lineNoRe)) {
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 400);
    // Only bind a quote that is unambiguously part of THIS citation's own sentence: strip the
    // citation's own closing backtick (if any) first, then stop at the next sentence terminator,
    // paragraph break, or another citation's opening backtick — a quote past any of those
    // belongs to different prose, not this reference (gh#36 quote-stealing).
    const sameSentence = after.replace(/^`/, '').match(/^[\s\S]*?(?=`|\n\n|[.!?](?:\s|$)|$)/)[0];
    const quoteMatch = sameSentence.match(/"([^"]{3,})"/);
    const quote = quoteMatch ? quoteMatch[1] : null;
    citations.push({
      kind: 'lineno',
      line: lineOf(text, m.index),
      path: m[1],
      startLine: Number(m[2]),
      endLine: m[3] ? Number(m[3]) : Number(m[2]),
      quote,
    });
  }
  return citations;
}

// ---------------------------------------------------------------------------
// Resolution + checking. Real file IO, but every path goes through `root` so the
// selftest can point it at a temp fixture instead of the live repo.
// ---------------------------------------------------------------------------
function resolveTarget(root, citingAbsPath, relPath) {
  const dirRel = path.resolve(path.dirname(citingAbsPath), relPath);
  if (fs.existsSync(dirRel)) return dirRel;
  const rootRel = path.resolve(root, relPath);
  if (fs.existsSync(rootRel)) return rootRel;
  return null;
}

function checkCitation(root, citingRelPath, citingAbsPath, c) {
  const label = `${citingRelPath}:${c.line}`;
  const target = resolveTarget(root, citingAbsPath, c.path);
  if (!target) {
    return { file: label, target: c.path, reason: 'target file not found (checked relative to citing file, then repo root)' };
  }

  if (c.kind === 'heading') {
    const headings = [...fs.readFileSync(target, 'utf8').matchAll(/^#{1,6}\s+(.*)$/gm)].map((m) => m[1].trim());
    if (!headings.includes(c.heading.trim())) {
      return { file: label, target: `${c.path} § "${c.heading}"`, reason: 'no heading in target matches this exact text' };
    }
    return null;
  }

  const targetLines = fs.readFileSync(target, 'utf8').split('\n');
  const suffix = c.endLine !== c.startLine ? `${c.startLine}-${c.endLine}` : `${c.startLine}`;
  if (targetLines.length < c.endLine) {
    return { file: label, target: `${c.path}:${suffix}`, reason: `target file has only ${targetLines.length} line(s)` };
  }
  if (c.quote) {
    const from = Math.max(0, c.startLine - 6);
    const to = Math.min(targetLines.length, c.endLine + 5);
    const window = targetLines.slice(from, to).join(' ').replace(/\s+/g, ' ');
    const normQuote = c.quote.replace(/\s+/g, ' ').trim();
    if (!window.includes(normQuote)) {
      return {
        file: label,
        target: `${c.path}:${suffix}`,
        reason: `quoted content "${normQuote.slice(0, 60)}${normQuote.length > 60 ? '…' : ''}" not found near line ${c.startLine}`,
      };
    }
  }
  return null;
}

function scanRoot(root) {
  const deadCitations = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (e.isDirectory()) {
        if (!EXCLUDE_DIRS.has(e.name)) walk(path.join(dir, e.name));
        continue;
      }
      if (!e.name.endsWith('.md')) continue;
      const abs = path.join(dir, e.name);
      const rel = path.relative(root, abs).split(path.sep).join('/');
      if (EXCLUDE_FILES.has(rel)) continue;
      const text = fs.readFileSync(abs, 'utf8');
      for (const c of findCitations(text)) {
        const dead = checkCitation(root, rel, abs, c);
        if (dead) deadCitations.push(dead);
      }
    }
  };
  walk(root);
  return deadCitations;
}

// ---------------------------------------------------------------------------
// Self-test: a temp fixture tree, never repo content, so fixing a doc can't retune the check.
// Calibrated both ways — must pass a known-good citer and fail a known-bad one.
// ---------------------------------------------------------------------------
function selftest() {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'check-citations-'));
  try {
    fs.writeFileSync(
      path.join(root, 'target.md'),
      ['# Title', '', '## Real Heading', '', 'line 4 filler', 'line 5 has the quoted fact right here', 'line 6 filler', ''].join('\n'),
    );
    fs.writeFileSync(
      path.join(root, 'good.md'),
      [
        '`target.md` § "Real Heading" — resolves.',
        '`target.md:5` says "the quoted fact right here" — resolves, content near line 5.',
        '`target.md:6` — resolves, no quote to check.',
        // gh#36 defect 1: comma/colon continuation must not be swallowed into the heading.
        '`target.md` § Real Heading, then do the thing — resolves despite the comma in trailing prose.',
        // gh#36 defect 2: a quote from a later, unrelated sentence must not be bound to this citation.
        '`target.md:6` is fine. Meanwhile CLAUDE.md says "totally unrelated phrase" elsewhere in this doc.',
        // Markdown-link path form — coverage for the PATH_ALT capture-group renumbering.
        '[Target](target.md) § "Real Heading" — resolves via the markdown-link path form.',
      ].join('\n'),
    );
    fs.writeFileSync(
      path.join(root, 'bad.md'),
      [
        '`target.md` § "Heading That Was Renamed" — dead, no such heading.',
        '`target.md:99` — dead, target has fewer than 99 lines.',
        '`target.md:5` says "a fact that moved away" — dead, quote not near line 5.',
        '`missing.md:1` — dead, target file does not exist.',
        // gh#36 defect 3: bare path (no backticks, no markdown link) must still be matched.
        'target.md § "Deleted Heading" — dead, bare path with no backticks must still be checked.',
      ].join('\n'),
    );

    const goodDead = scanRoot(root).filter((d) => d.file.startsWith('good.md'));
    assert.deepEqual(goodDead, [], 'known-good citer must report zero dead citations');
    console.log('PASS known-good citer resolves all 6 citations');

    const badDead = scanRoot(root).filter((d) => d.file.startsWith('bad.md'));
    assert.equal(badDead.length, 5, `known-bad citer must report exactly 5 dead citations, got ${badDead.length}`);
    console.log(`PASS known-bad citer flags all 5 planted defects:\n${badDead.map((d) => `     ${d.file} → ${d.target} → ${d.reason}`).join('\n')}`);

    // --- Pin the three disclosed ceilings (gh#44, ADR-0019, header comment above). Each
    // asserts CURRENT behaviour so a future widening of a regex goes red here first, forcing
    // the header to be updated rather than silently drifting out of sync with reality.

    // Ceiling 1: a prose-separated citation (non-whitespace between path and §) is invisible,
    // for BOTH the quoted and unquoted heading forms. Fixture also carries one ORDINARY
    // whitespace-adjacent dead citation, so the assertion below proves this file was actually
    // scanned — a bare `deepEqual([], [])` here couldn't tell "scanned and correctly ignored"
    // apart from "never scanned" (gh#44 REFUTE finding 1).
    fs.writeFileSync(
      path.join(root, 'ceiling1-prose-separated.md'),
      [
        '`target.md` — pointing here (under § Heading That Does Not Exist) is a genuinely',
        'dead citation in spirit, but prose separates the path from the § so this checker',
        'never even recognizes it as a citation to check.',
        '',
        '`target.md` — see also (under § "Quoted Heading That Does Not Exist" too) — this',
        'quoted-form variant is prose-separated exactly the same way, so it must also stay',
        'invisible to headingQuotedRe.',
        '',
        '`target.md` § "Ordinary Dead Heading" — an unrelated, genuinely dead citation',
        'planted whitespace-adjacent so this file is provably still being scanned.',
      ].join('\n'),
    );
    const ceiling1Dead = scanRoot(root).filter((d) => d.file.startsWith('ceiling1-prose-separated.md'));
    assert.equal(
      ceiling1Dead.length,
      1,
      'ceiling 1: expected exactly one finding (the planted ordinary dead citation) — the prose-separated one must stay invisible',
    );
    assert.equal(
      ceiling1Dead[0].target,
      'target.md § "Ordinary Dead Heading"',
      'ceiling 1: the one finding must be the planted ordinary citation, not something else',
    );
    console.log(
      `PASS ceiling 1 pinned: file was scanned (caught the ordinary dead citation ${ceiling1Dead[0].target}); the prose-separated citation stayed invisible (disclosed gap, not a false green)`,
    );

    // Ceiling 2: heading match is exact-string — a leading-words-only citation against a
    // date-suffixed real heading does not resolve, even though a human reads it fine.
    fs.writeFileSync(path.join(root, 'target2.md'), ['# Title', '', '## Leading — suffix', ''].join('\n'));
    fs.writeFileSync(
      path.join(root, 'ceiling2-exact-match.md'),
      ['`target2.md` § Leading — dead: exact-match ceiling, "Leading" != "Leading — suffix".'].join('\n'),
    );
    const ceiling2Dead = scanRoot(root).filter((d) => d.file.startsWith('ceiling2-exact-match.md'));
    assert.equal(ceiling2Dead.length, 1, 'ceiling 2: a leading-words-only heading citation must be reported dead');
    console.log(`PASS ceiling 2 pinned: ${ceiling2Dead[0].file} → ${ceiling2Dead[0].target} → ${ceiling2Dead[0].reason}`);

    // Ceiling 3: a quoted citation example embedded in a markdown table row is itself scanned
    // as a live citation — the checker cannot describe its own subject matter.
    fs.writeFileSync(path.join(root, 'ceiling3-table-row.md'), ['| `target.md` § Real Heading | example cell |'].join('\n'));
    const ceiling3Dead = scanRoot(root).filter((d) => d.file.startsWith('ceiling3-table-row.md'));
    assert.equal(ceiling3Dead.length, 1, 'ceiling 3: a citation example inside a table row must still be scanned as live');
    console.log(`PASS ceiling 3 pinned: ${ceiling3Dead[0].file} → ${ceiling3Dead[0].target} → ${ceiling3Dead[0].reason}`);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
async function main() {
  if (process.argv.includes('--selftest')) return selftest();

  const dead = scanRoot(repoRoot);
  if (dead.length) {
    for (const d of dead) console.error(`${d.file} → ${d.target} → ${d.reason}`);
    console.error(`\n${dead.length} dead citation(s).`);
    process.exit(1);
  }
  console.log('check-citations: all citations resolve');
}

await main();
