// Mechanical string/constant extractor for game tests.
//
// The problem it kills: a test that retypes a button's Thai label asserts against a SECOND copy of it.
// Retyped Thai drifts invisibly (a zero-width space, a differently composed sara-am, a trailing
// U+00A0 all look identical in a diff), and when the module's string legitimately changes, the test
// has to be edited by hand in every file that retyped it. Reading the value out of the module makes
// the module the single source and the test a structural claim ("this node shows the AGAIN copy"),
// which is the claim the test actually means.
//
// It is an import, not a source parser: no regex over .ts, so it cannot go stale against the syntax.
//
// SEAM REQUIRED — and this is the pattern that blocks a pure import: the game modules build their UI
// with inline literals (the label is typed straight into the el() call), so there is nothing to read.
// The seam
// is one exported const object of copy per module, which the render functions then reference.
//
// gh#154 — NO GAME MODULE EXPORTS A `COPY` OBJECT TODAY. The proof-of-concept lived in the party game
// that ticket deleted, and every remaining game still inlines its labels, so this helper has zero
// production callers: `git grep -l _module-copy src/` returns only _fake-dom.test.mjs, which
// exercises exportedStrings against fixture modules. Kept because the seam is still the answer the
// next copy-drift bug needs — but read its green as "the helper works", never as "a game uses it".

/** Flattens every string reachable from a module's named exports into `dotted.path -> string`.
 *  Functions, numbers and cycles are skipped; arrays index numerically (`FORTUNES.0.text`). */
export function exportedStrings(mod) {
  const out = new Map();
  const seen = new WeakSet();

  function visit(value, path) {
    if (typeof value === 'string') {
      out.set(path, value);
      return;
    }
    if (value === null || typeof value !== 'object') return;
    if (seen.has(value)) return;
    seen.add(value);
    for (const [k, v] of Object.entries(value)) {
      visit(v, path ? `${path}.${k}` : k);
    }
  }

  for (const [name, value] of Object.entries(mod)) visit(value, name);
  return out;
}

/** The strings a module actually exports, as a plain object keyed by dotted path — the form a test
 *  wants when it asserts a rendered node against the module's own copy. Throws on an unknown key so
 *  a renamed constant fails loudly instead of comparing a node against `undefined`. */
export function copyOf(mod) {
  const map = exportedStrings(mod);
  return new Proxy({}, {
    get(_t, key) {
      if (typeof key !== 'string') return undefined;
      if (!map.has(key)) {
        throw new Error(`_module-copy: no exported string at "${key}". Known keys: ${[...map.keys()].join(', ')}`);
      }
      return map.get(key);
    },
    has(_t, key) { return map.has(key); },
    ownKeys() { return [...map.keys()]; },
    getOwnPropertyDescriptor(_t, key) {
      return map.has(key) ? { enumerable: true, configurable: true, value: map.get(key) } : undefined;
    },
  });
}
