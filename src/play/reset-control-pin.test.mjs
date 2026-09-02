// gh#178, the second box mascot-defaults.test.mjs's own numbered-default scan does not close: every
// play route's setup screen must offer the reset-to-cast control, not just avoid the numbered string.
//
// The route set is derived from the manifest exactly like the sibling scan above it (games with a
// playRoute, sorted by id) -- never hand-typed -- so a twelfth route inherits this check the day its
// manifest line lands, with no edit here.
//
// The control is NOT one symbol across routes (a fact pinned by reading all eleven
// reset-names.test.mjs / reset-cast.test.mjs files): some call resetCastNames(...) or
// applyMascotDefaults(...) from _mascots.ts, freeze-tap keeps its own array, two routes are .ts, and
// how-close-is-near / zero-trigger name neither symbol in their main file. What every route DOES
// share is the SETUP-SCREEN TRIGGER a player actually taps to open the reset confirm dialog -- pinned
// below by that trigger's own id/data-act (read straight out of each route's markup.html/main.js/
// main.ts, the same element zero-trigger/reset-cast.test.mjs already selects by
// getElementById('btn-open-reset-cast')), not by the reset copy alone.
//
// Why the copy alone is not the pin: the same Thai string appears THREE times per route -- the setup
// trigger, the confirm dialog's heading, and the confirm dialog's own confirm button -- so a pattern
// scanning the whole file for the copy stays green when only the trigger is deleted and the dialog
// survives untouched (REFUTE finding 2026-09-02). RESET_TRIGGER instead names each route's trigger
// ELEMENT: an attribute string unique to that element (its id, or a data-act for the one route that
// has no id on its trigger), plus the copy that must appear inside that SAME element. Deleting only
// the trigger removes the attribute string from the file entirely, which this pin catches; deleting
// only the dialog leaves the trigger, its attribute, and its copy all standing, which is correct
// (the trigger is what this test is pinning).
//
// A lookup table keyed by route id, rather than one shared pattern, is what lets zero-trigger's wider
// copy count as satisfying the same invariant. It is manifest-derived in the only way that matters
// for gh#178: a route missing from the table is a named red, not a silent skip -- so adding a route
// here without adding its trigger entry fails loudly instead of passing on nothing. The reverse (a
// stale entry naming a route the manifest no longer ships) fails loudly too, via the key-set check
// below, rather than rotting silently forever.
//
// The attribute must sit inside a real opening tag, not a comment: `<!-- -->` in markup.html hides
// text from a player same as deleting it, but is invisible to scripts/thai-comments.mjs (that gate
// scans .js/.ts/.mjs comments, not markup.html), so a trigger "removed" by commenting it out would
// otherwise slip past every existing gate. findTriggerElement below walks backward from the attribute
// match for an unclosed `<!--` and refuses the match if one is open.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

// The nine routes sharing the plain trigger id pattern differ only in the exact id string main.js/
// markup.html happens to use; power-meter's trigger carries no id at all, only data-act. zero-trigger
// keeps its own wider copy, because its confirm names avatars as well as names. No entry here for a
// route the manifest ships is a red naming that route, not a vacuous pass over the rest.
const RESET_TRIGGER = {
  'cannon-flag': { attr: 'id="btn-reset-names"', copy: /รีเซ็ตเป็นชื่อสัตว์/ },
  'cursed-number': { attr: 'id="resetNamesBtn"', copy: /รีเซ็ตเป็นชื่อสัตว์/ },
  'dice-loser': { attr: 'id="dl-reset-names"', copy: /รีเซ็ตเป็นชื่อสัตว์/ },
  'freeze-tap': { attr: 'id="resetNamesBtn"', copy: /รีเซ็ตเป็นชื่อสัตว์/ },
  'how-close-is-near': { attr: 'id="btnResetNames"', copy: /รีเซ็ตเป็นชื่อสัตว์/ },
  'pinocchio-luck': { attr: 'id="reset-names"', copy: /รีเซ็ตเป็นชื่อสัตว์/ },
  'power-meter': { attr: 'data-act="openResetNamesModal"', copy: /รีเซ็ตเป็นชื่อสัตว์/ },
  'short-stick': { attr: 'id="btn-reset-names"', copy: /รีเซ็ตเป็นชื่อสัตว์/ },
  timebomb: { attr: 'id="tb-reset-names"', copy: /รีเซ็ตเป็นชื่อสัตว์/ },
  'wire-snip-panic': { attr: 'id="btn-reset-names"', copy: /รีเซ็ตเป็นชื่อสัตว์/ },
  'zero-trigger': { attr: 'id="btn-open-reset-cast"', copy: /รีเซ็ตเป็นชื่อและรูปสัตว์/ },
};

/** True when `index` falls inside an unclosed `<!-- -->` in `text`. */
function insideComment(text, index) {
  const lastOpen = text.lastIndexOf('<!--', index);
  if (lastOpen === -1) return false;
  const lastClose = text.lastIndexOf('-->', index);
  return lastOpen > lastClose;
}

/** True when `index` sits in a JS comment: a `//` earlier on the same line, or an unclosed slash-star.
 *  ponytail: three comment forms, repo-owned files; a `//` inside a string on the same line would
 *  mis-skip a real match and read as a loud RED, never a silent pass. A real parser is gh#191's class. */
function insideJsComment(text, index) {
  const lineStart = text.lastIndexOf('\n', index) + 1;
  if (text.slice(lineStart, index).includes('//')) return true;
  const lastOpen = text.lastIndexOf('/*', index);
  return lastOpen !== -1 && lastOpen > text.lastIndexOf('*/', index);
}

/** Finds the element carrying `attr` (e.g. `id="btn-reset-names"`) and returns its inner HTML, or
 *  null if no LIVE occurrence exists: every occurrence is tried, and one inside an HTML or JS comment,
 *  or not actually inside an opening tag, is skipped rather than trusted (REFUTE round 2: a deleted
 *  trigger left behind as `// old: <button id=...>` above the dialog read as present). */
function findTriggerElement(text, attr) {
  for (let attrIndex = text.indexOf(attr); attrIndex !== -1; attrIndex = text.indexOf(attr, attrIndex + 1)) {
    if (insideComment(text, attrIndex) || insideJsComment(text, attrIndex)) continue;

    const tagStart = text.lastIndexOf('<', attrIndex);
    const tagNameMatch = tagStart === -1 ? null : text.slice(tagStart).match(/^<([a-zA-Z][\w-]*)/);
    if (!tagNameMatch) continue;

    const openTagEnd = text.indexOf('>', attrIndex);
    if (openTagEnd === -1) continue;

    const closeTag = `</${tagNameMatch[1]}>`;
    const closeIndex = text.indexOf(closeTag, openTagEnd);
    if (closeIndex === -1) continue;

    return text.slice(openTagEnd + 1, closeIndex);
  }
  return null;
}

test("every play route's setup screen has the reset trigger", async () => {
  const repoRoot = path.join(here, '..', '..');
  const { games } = await import(pathToFileURL(path.join(repoRoot, 'src/games/manifest.ts')).href);
  const routes = games.filter((g) => g.playRoute).map((g) => g.id).sort();
  assert.ok(routes.length > 0,
    'no play routes derived from src/games/manifest.ts -- refusing to report a vacuous pass on an empty work set');
  assert.deepEqual(Object.keys(RESET_TRIGGER).sort(), routes,
    'RESET_TRIGGER key set must equal the manifest play-route set -- an extra or missing key means the table and the site have drifted apart');

  const missing = [];
  for (const id of routes) {
    const { attr, copy } = RESET_TRIGGER[id];
    // The trigger can ship in markup.html (static routes) or main.js/main.ts (routes that inject
    // their setup screen), so all three are read and concatenated rather than picking one per route.
    let combined = '';
    for (const file of ['markup.html', 'main.js', 'main.ts']) {
      const p = path.join(here, id, file);
      if (fs.existsSync(p)) combined += fs.readFileSync(p, 'utf8');
    }
    const el = findTriggerElement(combined, attr);
    if (el === null) {
      missing.push(`${id}: trigger element not found (no live tag carrying ${attr})`);
    } else if (!copy.test(el)) {
      missing.push(`${id}: trigger element found but its copy does not match ${copy}`);
    }
  }
  assert.deepEqual(missing, [], `route(s) missing a reset trigger:\n  ${missing.join('\n  ')}`);
  console.log(`reset-control pin: ${routes.length} play route(s) derived from the manifest`);
});
