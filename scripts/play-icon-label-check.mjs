#!/usr/bin/env node
// Gate: an icon-only control on a play route must carry a Thai accessible name.
//
// THE DEFECT THIS EXISTS FOR, measured 2026-09-05 (gh#211, surfaced from gh#165). Nine play routes
// ship icon-only controls and no gate or probe in this repo had ever inspected an accessible name —
// `grep -rl 'aria-label' scripts/*.mjs` returned nothing. Thirty-three controls across seven routes
// could not be named by a screen reader in Thai. Three of them, on zero-trigger, carried an ENGLISH
// aria-label sitting over a correct Thai title, so the hovering mouse user read Thai and the
// screen-reader user heard English. This is a Thai-first site; CLAUDE.md's rule is that everything a
// player reads is Thai, and an accessible name is read by a player.
//
// THE SET, its key, and who owns it. The set is every literal `<button ...>...</button>` occurrence
// in src/play/<route>/{markup.html, main.js, main.ts} whose own text carries no letter in any script
// and no digit. The partition key is the route directory, and the route list is read from the
// src/play directory listing every run — there is no hand-maintained route array, so a route nobody
// adds to anything is CHECKED by default, never silently skipped. Every member is literal text in a
// file this repo tracks, so the set is OWNED HERE and the check converges.
//
// A digit is deliberately a passing name: a keypad key reading "7" and a step button reading "-10"
// announce their own meaning, and gating their wording would be gating the mockup author's free
// choice, which is not a set this repo owns.
//
// WHAT COUNTS AS A NAME HERE — a Thai `aria-label`, and nothing else. Three legitimate name sources
// are deliberately REFUSED, each for a reason:
//   `title`      — it is the last-resort fallback in the accessible-name computation, so a
//                  title-only button does announce on a desktop screen reader. It is refused because
//                  title never surfaces on touch, and touch is this site's primary device. Four of
//                  the nine sound toggles were title-only when this gate was written.
//   aria-labelledby — a real name source this gate cannot resolve (the target may be in another
//                  file, or built at runtime). Refusing it fails CLOSED: a route that needs one reds
//                  here and someone widens this gate deliberately. No route uses one today.
//   an <svg><title> child — same reasoning, same fail-closed choice.
//
// WHAT IT CANNOT SEE, counted live on every run rather than asserted here, because a hardcoded
// number rots: buttons built by document.createElement, and buttons whose text is a template
// interpolation. Both are reported in the disclosure block with the run's own counts.
//
// THE LABELS' HOME is src/play/_aria-labels.json, and scripts/play-aria-labels.mjs re-applies it
// after an extraction. This gate does NOT read that table — it judges the files that actually ship,
// so it still reds when the table is empty, when the table is wrong, or when someone hand-edits a
// route file. Sharing the table would make it unfalsifiable by construction.
//
//   node scripts/play-icon-label-check.mjs            -> audit every play route
//   node scripts/play-icon-label-check.mjs --selftest -> calibration on a throwaway fixture
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { ROUTE_FILES, iconOnlyButtons, hasThai } from './play-aria-labels.mjs';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const PLAY_DIR = path.join(repoRoot, 'src', 'play');

/**
 * Judge one directory of route folders. Takes the directory so --selftest can point it at a
 * throwaway fixture instead of src/play.
 */
function auditPlayDir(playDir) {
  const violations = [];
  const blind = { createElement: 0, interpolated: 0 };
  let routes = 0;
  let checked = 0;

  for (const entry of fs.readdirSync(playDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    routes++;
    for (const name of ROUTE_FILES) {
      const p = path.join(playDir, entry.name, name);
      if (!fs.existsSync(p)) continue;
      const text = fs.readFileSync(p, 'utf8');
      blind.createElement += (text.match(/createElement\(\s*['"`]button['"`]/g) || []).length;
      blind.interpolated += (text.match(/<button\b[^>]*>[^<]*\$\{/g) || []).length;
      for (const b of iconOnlyButtons(text)) {
        checked++;
        const where = `src/play/${entry.name}/${name}`;
        const which = b.id ? `#${b.id}` : b.classes.length ? `.${b.classes[0]}` : `text ${JSON.stringify(b.visible)}`;
        if (b.ariaLabel === null) {
          violations.push(`${where}: ${which} has no aria-label${b.title ? ` (title="${b.title}" is not enough)` : ''}`);
        } else if (!hasThai(b.ariaLabel)) {
          violations.push(`${where}: ${which} has a non-Thai aria-label "${b.ariaLabel}"`);
        }
      }
    }
  }
  return { violations, blind, routes, checked };
}

function selftest() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'icon-label-'));
  const route = path.join(dir, 'fixture-route');
  fs.mkdirSync(route);
  const write = (body) => fs.writeFileSync(path.join(route, 'markup.html'), body, 'utf8');

  // MUST-RED leg 1: an icon-only button with nothing but a Thai title. This is the shape four of the
  // nine sound toggles shipped in, so the fixture is the real defect, not a strawman.
  write('<button id="a" title="เสียง">\u{1f50a}</button>');
  const noLabel = auditPlayDir(dir);
  assert.equal(noLabel.violations.length, 1, 'a title-only icon button must red');
  assert.match(noLabel.violations[0], /has no aria-label/);

  // MUST-RED leg 2: an English aria-label. zero-trigger's real defect.
  write('<button id="a" aria-label="Audio Toggle">\u{1f50a}</button>');
  const english = auditPlayDir(dir);
  assert.equal(english.violations.length, 1, 'an English aria-label must red');
  assert.match(english.violations[0], /non-Thai/);

  // MUST-GREEN leg: the same button, named in Thai.
  write('<button id="a" aria-label="เปิด/ปิดเสียง">\u{1f50a}</button>');
  const fixed = auditPlayDir(dir);
  assert.equal(fixed.violations.length, 0, 'a Thai aria-label must pass');
  assert.equal(fixed.checked, 1, 'the fixed button must still be IN the set, not skipped');

  // The detector's own boundary: a digit names itself, so a keypad key is out of the set entirely.
  // Without this leg a detector that skipped EVERY button would pass all three legs above.
  write('<button class="num-btn">7</button><button id="z">✕</button>');
  const digits = auditPlayDir(dir);
  assert.equal(digits.checked, 1, 'a digit-labelled button must not be in the set');
  assert.equal(digits.violations.length, 1, 'the bare glyph beside it must still red');

  // A new route directory nobody listed anywhere must be audited, not skipped.
  const extra = path.join(dir, 'route-nobody-registered');
  fs.mkdirSync(extra);
  fs.writeFileSync(path.join(extra, 'markup.html'), '<button id="q">✕</button>', 'utf8');
  const added = auditPlayDir(dir);
  assert.equal(added.routes, 2, 'both route directories must be walked');
  assert.equal(added.violations.length, 2, 'an unregistered route defaults to CHECKED');

  fs.rmSync(dir, { recursive: true, force: true });
  console.log('play-icon-label-check --selftest: 5 legs pass (2 must-red, 1 must-green, 1 set-boundary, 1 default-checked)');
}

if (process.argv.includes('--selftest')) {
  selftest();
} else {
  const { violations, blind, routes, checked } = auditPlayDir(PLAY_DIR);
  for (const v of violations) console.error(`::error::${v}`);
  console.log(
    `play-icon-label-check: ${checked} icon-only control(s) across ${routes} route(s) · ${violations.length} without a Thai aria-label`,
  );
  console.log(
    `  NOT READ: ${blind.createElement} button(s) built by createElement and ${blind.interpolated} whose text is interpolated — ` +
      'neither has a literal name this gate can judge.',
  );
  console.log(
    '  NOT RESOLVED: aria-labelledby, an <svg><title> child, and the title fallback are all real ' +
      'accessible-name sources; this gate refuses all three rather than resolve them, so it fails closed.',
  );
  console.log(
    '  NOT JUDGED: whether a Thai label is ACCURATE. This gate reads the script, never the meaning. ' +
      'Page chrome outside src/play (src/shell/PlayExit.astro) is outside the set.',
  );
  if (violations.length) process.exit(1);
}
