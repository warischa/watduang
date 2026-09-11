// ADR-0046 on this route is a CHAIN of four artifacts, and only the last link lives in a file this
// repo writes freely. The route's reduced-motion handling was recorded as "inferred rather than
// confirmed" for exactly that reason; this file is the confirmation, pinned link by link.
//
// THE CHAIN, in the order it runs:
//   1. src/pages/game/one-bomb/play.astro imports main.js BEFORE main.ts, so the engine's click
//      listener exists by the time main.ts clicks the switch. Reversed, the click lands on a node
//      with no listener and nothing anywhere reports it.
//   2. markup.html ships #motionToggle with the `on` class, matching the engine's own
//      `motionEnabled: true` default — so the switch main.ts finds really is the live state.
//   3. main.js binds that button to the engine's `motionEnabled` key, and the handler derives the
//      value from the class it just toggled. This is the only reachable writer of that flag: the
//      engine's state is private to a sealed IIFE.
//   4. main.ts's applyReducedMotion clicks the switch only while it is still on, and
//      severEngineLeafControls calls it BEFORE the loop that clone-replaces the button away.
//
// WHAT THIS CONFIRMS, exactly: a reduced-motion player reaches `game.motionEnabled`, which is what
// gates the camera shake on a detonation and the seat/mascot bounce. `particlesEnabled` (the embers)
// is a SEPARATE engine flag and is deliberately not driven from here — reduce, not remove.
//
// ponytail: matched on source text, not executed. Stated ceiling — this proves the four links read
// as they must, never that a browser ran them in that order. The browser walk is what shows that.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const here = import.meta.dirname;
const read = (rel) => fs.readFileSync(path.join(here, rel), 'utf8');

const SOURCES = {
  astro: read('../../pages/game/one-bomb/play.astro'),
  markup: read('markup.html'),
  engine: read('main.js'),
  route: read('main.ts'),
};

/** The switch's own tag, whatever order its attributes are written in. */
const motionButton = (markup) => markup.match(/<button[^>]*id="motionToggle"[^>]*>/)?.[0] ?? '';

/** Everything severEngineLeafControls runs, from its header to the end of the file — enough to order
 *  two statements inside it without a brace parser. */
const severTail = (route) => route.slice(route.indexOf('function severEngineLeafControls'));

// Each link: the predicate that must hold on the real source, plus one mutant of that same source
// that must break it. A link whose mutant stays green is a link this file cannot see.
const LINKS = [
  {
    name: 'the engine loads before the route, so the switch has a listener when it is clicked',
    of: 'astro',
    holds: (src) => {
      const engineAt = src.indexOf("one-bomb/main.js'");
      const routeAt = src.indexOf("one-bomb/main.ts'");
      return engineAt !== -1 && routeAt !== -1 && engineAt < routeAt;
    },
    mutate: (src) =>
      src
        .replace("import '../../../play/one-bomb/main.js';\n", '')
        .replace("import '../../../play/one-bomb/main.ts';", "import '../../../play/one-bomb/main.ts';\n  import '../../../play/one-bomb/main.js';"),
    breaks: 'the imports could be reordered and this file would still pass',
  },
  {
    name: 'the switch ships on, matching the engine motion default it mirrors',
    of: 'markup',
    holds: (src) => /class="[^"]*\bon\b[^"]*"/.test(motionButton(src)),
    mutate: (src) => src.replace('class="toggleSwitch on" id="motionToggle"', 'class="toggleSwitch" id="motionToggle"'),
    breaks: 'the switch could ship off and this file would still call the chain live',
  },
  {
    name: 'the engine default the switch mirrors is motion ON',
    of: 'engine',
    holds: (src) => /motionEnabled:\s*true/.test(src),
    mutate: (src) => src.replace('motionEnabled: true', 'motionEnabled: false'),
    breaks: 'the engine default could flip and the class would then lie about the flag',
  },
  {
    name: 'the switch is bound to the engine motion flag',
    of: 'engine',
    holds: (src) => /bindToggle\('motionToggle',\s*'motionEnabled'\)/.test(src),
    mutate: (src) => src.replace("bindToggle('motionToggle', 'motionEnabled')", "bindToggle('motionToggle', 'tiltEnabled')"),
    breaks: 'a re-extraction could rename the key and the click would set a flag nothing reads',
  },
  {
    name: 'that binding writes the flag from the class it toggles',
    of: 'engine',
    holds: (src) => {
      const body = src.slice(src.indexOf('function bindToggle'));
      const toggleAt = body.indexOf("btn.classList.toggle('on')");
      const writeAt = body.indexOf('game[key] = val');
      return toggleAt !== -1 && writeAt !== -1 && toggleAt < writeAt;
    },
    mutate: (src) => src.replace('game[key] = val;', 'void val;'),
    breaks: 'the handler could stop writing the flag and the click would only repaint a switch',
  },
  {
    name: 'the route clicks that switch only while it is on',
    of: 'route',
    holds: (src) => /if \(toggle\?\.classList\.contains\('on'\)\) toggle\.click\(\);/.test(src),
    mutate: (src) => src.replace("if (toggle?.classList.contains('on')) toggle.click();", 'toggle?.click();'),
    breaks: 'an unguarded click would turn the motion back ON for a player who asked for less of it',
  },
  {
    name: 'the click happens before the loop that replaces the switch away',
    of: 'route',
    holds: (src) => {
      const tail = severTail(src);
      const clickAt = tail.indexOf('applyReducedMotion();');
      const severAt = tail.indexOf('control.replaceWith(clone);');
      return clickAt !== -1 && severAt !== -1 && clickAt < severAt;
    },
    mutate: (src) =>
      severTail(src).length > 0
        ? src.replace('  applyReducedMotion();\n  for (const id of ENGINE_LEAF_CONTROLS) {', '  for (const id of ENGINE_LEAF_CONTROLS) {')
        : src,
    breaks: 'the call could move below the sever, where the button it clicks has no listener left',
  },
];

for (const link of LINKS) {
  test(`ADR-0046 chain: ${link.name}`, () => {
    const src = SOURCES[link.of];
    assert.ok(link.holds(src), `the ADR-0046 chain is broken at: ${link.name}`);

    // MUST-RED. The mutant is derived from the real source by one substitution, so it is not a
    // stand-in this file wrote, and a substitution that stripped nothing is itself a failure.
    const mutant = link.mutate(src);
    assert.notEqual(mutant, src, `the mutant for "${link.name}" substituted nothing — the check below proves nothing`);
    assert.equal(link.holds(mutant), false, link.breaks);
  });
}
