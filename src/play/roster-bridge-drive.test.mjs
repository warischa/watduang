// The hole no static gate in scripts/ can see, pinned here.
//
// Every party route's roster-bridge.ts restores a saved group by driving the mockup's OWN setup
// controls programmatically. ADR-0017 then armed those same routes: armAllButtons ships every button
// on a freshly revealed panel natively `disabled` for 400ms. A programmatic click on a disabled form
// control returns without dispatching anything and WITHOUT THROWING -- so a bridge that fires inside
// that window seeds nothing, silently: no error, no exception, no red test, and the group is asked to
// type its names again. cannon-flag and power-meter answered it with a local drive() that clears the
// flag for the one call and puts it back; six more routes were converted to match.
//
// This test does not re-check any of that behaviour. It pins the SET: a seventh route added next
// month reintroduces the bug the day it ships, and nothing else would notice. The set is read off the
// filesystem, never from a list of route names typed in here -- a hand-written list stops covering
// what it names at the next rename and stays green while doing it.
//
// ponytail: matched on source text, not on a parsed AST. Two ceilings, stated rather than hidden:
// (1) it proves the click goes THROUGH drive(), never that drive() itself is correct -- the two
//     properties that matter (restores the prior flag; identical to a plain click when the control
//     was not disabled) are pinned by the body-equality assertion below, which is exact-text, so a
//     reworded but equivalent drive() fails here and whoever reworded it decides deliberately;
// (2) a bridge with zero literal `.click()` used to be waved through, which made "contains no
//     .click() text" the real predicate instead of "does not click a control raw". The known
//     alternate spellings are enumerated below and now red; what is NOT closed, and cannot be, is
//     the next spelling nobody has written yet. A click can always be spelled a new way. What the
//     rewrite buys is that such a route can no longer pass in SILENCE: reaching zero known clicks
//     forces a NO_RAW_CLICK entry, so a human states the claim and the next reader can attack it.
//
// THIS FILE CONTAINS THE PATTERN IT BANS, in prose and in the regex source above and below. That is
// handled structurally, not by escaping: the set is built from files NAMED roster-bridge.ts, and this
// file is not one, so it is never read as evidence about itself. A sibling test went red on its first
// run for exactly this reason -- a checker cannot tell use from mention.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const PLAY_DIR = import.meta.dirname;
const BRIDGE = 'roster-bridge.ts';

// The canonical body, character for character as cannon-flag settled it. Everything the fix rests on
// is in these six lines: it reads the prior state, restores it, and on a non-button element
// `.disabled` is undefined -- never `=== true` -- so the plain-click path runs and nothing is written.
const DRIVE_BODY = `function drive(el: HTMLElement): void {
  const btn = el as HTMLButtonElement;
  const wasDisabled = btn.disabled === true;
  if (wasDisabled) btn.disabled = false;
  el.click();
  if (wasDisabled) btn.disabled = true;
}`;

// Bridges allowed a raw click, each with the reason. An entry here is a decision, not an observation:
// removing the exemption is how a route rejoins the rule.
// Empty on purpose. wire-snip-panic held the only entry while it was the last route with no arm
// window; it was armed and given drive() in the same batch, so it rejoined the rule and the entry
// went. The stale check below is what caught that — the exemption outlived its reason by one step.
const EXEMPT = new Map([]);

/** Full-line comments go, and this is not a detail: every converted bridge DOCUMENTS the hazard in a
 *  JSDoc block above drive(), quoting the very call this test counts. Prose about a click is not a
 *  click. Only whole-line comments are dropped -- a trailing `//` inside a string would take real code
 *  with it, and nothing in these files needs that. */
function codeOf(file) {
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => {
      const t = line.trimStart();
      return !t.startsWith('//') && !t.startsWith('/*') && !t.startsWith('*');
    })
    .join('\n');
}

const bridges = fs
  .readdirSync(PLAY_DIR, { withFileTypes: true })
  .filter((e) => e.isDirectory() && fs.existsSync(path.join(PLAY_DIR, e.name, BRIDGE)))
  .map((e) => e.name)
  .sort();

const CLICK_RE = /\.click\(\s*\)/g;

// Ways to dispatch a click that leave no literal `.click()` text behind. Not a sealed set -- see
// ceiling (2) in the header -- but every one of these has to red, or "no .click() substring" is the
// property being tested instead of "does not click a control raw".
//   - a string-keyed member access, el['click']();
//   - a computed member CALL, el[SOME_CONST]();  -- the same thing with the key hoisted
//   - an event dispatched by hand; narrowed to click-ish types, because every bridge legitimately
//     dispatches an 'input' event after writing a name;
//   - the call moved into an imported helper whose name says click/tap/press.
const ALT_CLICK_RE =
  /\[\s*(['"`])click\1\s*\]|\[\s*[A-Za-z_$][\w$]*\s*\]\s*\(\s*\)|dispatchEvent\s*\(\s*new\s+\w+\(\s*['"](?:click|pointerdown|mousedown)|^\s*import[^;]*\b\w*(?:[Cc]lick|[Tt]ap|[Pp]ress)\w*\b[^;]*from/m;

// Routes that drive NO control at all. Like EXEMPT, an entry is a decision, not an observation: it
// asserts the route seeds its roster without pressing anything, so the arm-window hazard cannot
// apply. Empty today -- all nine bridges click, so all nine must own drive().
const NO_RAW_CLICK = new Set([]);

test('the bridge set is discovered, not assumed', () => {
  assert.ok(bridges.length >= 6, `found ${bridges.length} roster bridges — this test would barely check anything`);
  const stale = [...EXEMPT.keys(), ...NO_RAW_CLICK]
    .filter((r) => !bridges.includes(r))
    .sort();
  assert.deepEqual(stale, [], `EXEMPT/NO_RAW_CLICK name routes with no ${BRIDGE}: ${stale.join(', ')}`);
});

test('every programmatic click in a roster bridge goes through drive()', () => {
  for (const route of bridges) {
    const code = codeOf(path.join(PLAY_DIR, route, BRIDGE));
    const clicks = [...code.matchAll(CLICK_RE)].length;

    // BEFORE the fork, so it covers both sides. Hunting alternate spellings only where drive() is
    // absent would search the one case that already reds: a bridge that DOES define drive() carries
    // clicks === 1 from drive()'s own el.click(), takes the main branch, and could fire a raw
    // el['click']() beside it with every assertion below still green -- which is the exact bug this
    // is here to catch. drive()'s canonical body is cut out first rather than the match loosened, so
    // the sanctioned click is excluded by identity, not by a weaker pattern; the JSDoc prose quoting
    // the hazard is already gone via codeOf().
    const alt = ALT_CLICK_RE.exec(code.replace(DRIVE_BODY, ''));
    assert.ok(
      !alt,
      `${route}/${BRIDGE} dispatches a click as ${JSON.stringify(alt && alt[0])}, outside drive(). ` +
        'That still hits a control armAllButtons may have disabled, and it bypasses drive(), so the ' +
        'group silently retypes its names. Route it through drive() like every other press.',
    );

    if (clicks === 0) {
      // Zero literal clicks is where this test used to fall silent. It is now a decision.
      assert.ok(
        NO_RAW_CLICK.has(route),
        `${route}/${BRIDGE} presses nothing this test recognises. Either it ` +
          'genuinely drives no control -- add a NO_RAW_CLICK entry saying so -- or it clicks in a ' +
          'spelling this test does not know yet, in which case the silent-seeding bug is back and the ' +
          'spelling belongs in ALT_CLICK_RE. Absence is not a pass.',
      );
      continue;
    }

    assert.ok(
      !NO_RAW_CLICK.has(route),
      `${route} is listed as driving no control but performs ${clicks} click(s) — drop its NO_RAW_CLICK entry`,
    );

    if (EXEMPT.has(route)) {
      // The other direction: an exemption for a route that no longer needs one is a stale decision,
      // and a stale EXEMPT is how this test would keep passing while the code moved on.
      assert.ok(
        !code.includes(DRIVE_BODY),
        `${route} is exempt but now defines drive() — drop its EXEMPT entry`,
      );
      continue;
    }

    assert.ok(
      code.includes(DRIVE_BODY),
      `${route}/${BRIDGE} clicks a control but does not define the canonical drive(). A click on a ` +
        'button armAllButtons disabled dispatches nothing and throws nothing, so the group silently ' +
        'retypes its names. Copy drive() from cannon-flag and route every click through it — or add ' +
        'an EXEMPT entry saying why this route cannot be arm-gated.',
    );
    assert.equal(
      clicks,
      1,
      `${route}/${BRIDGE} performs ${clicks} raw click(s) outside drive(). drive() holds the only ` +
        'one; wrap the rest as drive(el), null-checking first rather than optional-chaining the call.',
    );
    // drive() defined but never called is the shape a half-done conversion leaves behind.
    const calls = [...code.matchAll(/\bdrive\(/g)].length;
    assert.ok(calls >= 2, `${route}/${BRIDGE} defines drive() but never calls it`);
  }
});
