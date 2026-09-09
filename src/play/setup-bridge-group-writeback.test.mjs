// What a play route's setup write-back is allowed to do to the SAVED group, pinned by execution
// against the real `_setup-bridge.ts` rather than by a source-shape match.
//
// The invariant, in one sentence: after a write-back from a page whose maximum is M, the saved group
// is the names that page showed, followed by any previously-saved names at index M and beyond.
//
// The rule is NOT "never shrink", and that is the whole reason the control leg below exists. A
// ten-seat page where the player deletes two of eight people must genuinely end up with six. What
// separates the two cases is the PAGE'S OWN MAXIMUM, never the two lengths: a six-seat page writing
// six names over a saved eight keeps the tail because the tail was never on screen, while a ten-seat
// page writing six over the same eight keeps nothing, because nothing was beyond its maximum. A fix
// that preserved the tail unconditionally passes the first leg and fails the control -- which is
// what makes the control the discriminating input and not decoration.
//
// Why the write-back is exercised here and not in a route's own test: the behaviour lives in the
// shared module, so a per-route copy of this would be nine tests measuring one function. The route
// tests stub `saveOnSetupComplete` and count calls, which is exactly why the trim shipped unseen.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

// The selectors are this test's own; nothing here depends on any one mockup's DOM vocabulary.
const START = '#start';
const NAME_INPUT = '.name';

/** Same "execute the shipped file" idiom as setup-edit-request.test.mjs: strip the types, turn every
 *  import into a stub lookup, drop `export`, and run the module body. */
function evaluateModule(file, resolve, globals) {
  const raw = fs.readFileSync(file, 'utf8');
  const js = stripTypeScriptTypes(raw, { mode: 'strip' })
    .replace(/^import\s+([\s\S]*?)\s+from\s+'([^']+)';/gm, (_m, binding, spec) => {
      const named = /^\{[\s\S]*\}$/.test(binding.trim());
      if (!named) throw new Error(`unhandled import shape in ${spec}: ${JSON.stringify(binding)}`);
      return `const ${binding.trim()} = __require(${JSON.stringify(spec)});`;
    })
    .replace(/^export\s+/gm, '');
  const exported = [...raw.matchAll(/^export function (\w+)/gm)].map((m) => m[1]);
  const keys = ['__require', ...Object.keys(globals)];
  // eslint-disable-next-line no-new-func -- executing the shipped file is the whole point.
  return new Function(...keys, `${js}\n;return { ${exported.join(', ')} };`)(
    resolve,
    ...Object.keys(globals).map((k) => globals[k]),
  );
}

/** One write-back: a saved group, a page maximum, and whatever the player left in the fields.
 *
 *  The start control is reached the way the real page reaches it -- the module registers document
 *  capture listeners, so the test dispatches into the registered `pointerup` handler with a target
 *  whose `closest()` answers for the start selector. Driving `persist` directly would skip the
 *  signature dedup and the target match, which are part of the shipped path. */
async function writeBack({ saved, max, typed, register = (fn, m) => fn(START, NAME_INPUT, m) }) {
  const listeners = [];
  const document = {
    addEventListener: (type, fn) => listeners.push({ type, fn }),
    // Rebuilt per call, matching a setup screen whose fields are re-rendered between presses.
    querySelectorAll: () => typed.map((value) => ({ value })),
  };
  // `ev.target instanceof Element` gates the shipped handler, so the class has to be a real global
  // here and the target a real instance of it -- a plain object is skipped silently.
  class Element {
    closest(selector) {
      return selector === START ? this : null;
    }
  }

  let group = null;
  const added = [];
  const globals = { document, window: {}, sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} }, Element };
  const seam = evaluateModule(path.join(HERE, '_setup-bridge.ts'), (spec) => {
    if (spec.endsWith('shell/roster')) {
      return {
        loadGroup: () => saved,
        loadRoster: () => ({ names: () => saved, add: async (n) => { added.push(n); } }),
        saveGroup: (names) => { group = names; },
      };
    }
    if (spec.endsWith('name-list.ts')) return { hasVisibleChar: (s) => s.trim().length > 0 };
    throw new Error(`unstubbed import in _setup-bridge.ts: ${spec}`);
  }, globals);

  register(seam.saveOnSetupComplete, max);
  const pointerup = listeners.find((l) => l.type === 'pointerup');
  assert.ok(pointerup, 'the module registered no pointerup listener -- nothing would persist on a real touch');
  pointerup.fn({ target: new Element() });
  // The persist path is `void (async () => ...)()`, so the write lands a microtask later.
  await new Promise((resolve) => setImmediate(resolve));
  return { group, added };
}

const EIGHT = ['เอ', 'บี', 'ซี', 'ดี', 'อี', 'เอฟ', 'จี', 'เอช'];

test('a six-seat page cannot trim a saved group of eight: its six names, then the saved tail', async () => {
  const { group } = await writeBack({ saved: EIGHT, max: 6, typed: EIGHT.slice(0, 6) });

  assert.deepEqual(
    group,
    EIGHT,
    'passing through a page with a smaller maximum trimmed the saved group permanently',
  );
  // Stated separately from the deepEqual so a failure says WHICH half broke: the tail names have to
  // be the original strings in their original order, not a re-sorted or re-cased set of them.
  assert.deepEqual(group.slice(6), EIGHT.slice(6), 'the tail beyond the page maximum was not carried through verbatim');
});

test('the control: a ten-seat page writing six over a saved eight genuinely shrinks to six', async () => {
  const { group } = await writeBack({ saved: EIGHT, max: 10, typed: EIGHT.slice(0, 6) });

  // Nothing was beyond this page's maximum, so there is no tail to carry and the deletion is real.
  // Without this leg a write-back that preserved everything always would look green.
  assert.deepEqual(group, EIGHT.slice(0, 6), 'a genuine shrink on a full-size page was undone');
});

test('a tail name the player retyped in a seat is not written twice', async () => {
  // The eighth saved name typed into seat one: the tail still starts beyond the maximum, and a plain
  // concatenation would store it in both places -- a duplicate the group has no way to drop.
  const typed = [EIGHT[7], ...EIGHT.slice(1, 6)];
  const { group } = await writeBack({ saved: EIGHT, max: 6, typed });

  assert.equal(new Set(group).size, group.length, `the write-back stored a duplicate: ${group.join(', ')}`);
  assert.deepEqual(group, [...typed, EIGHT[6]], 'the surviving tail is not the saved names beyond the maximum');
});

test('a caller that omits the page maximum fails loudly instead of defaulting to no maximum', async () => {
  // A silent default is the bug itself: "no maximum" is what the trimming code already did. Awaited
  // through `rejects` because the harness is async — a bare `throws` around it reports the missing
  // exception as an unhandled rejection after the test has already passed.
  await assert.rejects(
    writeBack({ saved: EIGHT, max: undefined, typed: EIGHT.slice(0, 6), register: (fn) => fn(START, NAME_INPUT) }),
    /max/i,
    'omitting the maximum was accepted, so a future route can reintroduce the permanent trim',
  );
});
