// gh#170: the round-start announcement of the zero-trigger party route.
//
// scripts/round-start-announce-check.mjs proves the CHANNEL exists -- an empty live region with an id
// that some script in this directory names. It cannot prove the write happens, and its id search runs
// over raw text, so a comment mentioning #zt-live satisfies it just as well as a real resolve. That
// gap is what this file closes: announceTurn() is sliced out of main.js and executed, so the assertion
// is on what the region's textContent actually becomes.
//
// Driven through main.js's OWN method text (the sliceMethod idiom losing-rule.test.mjs uses), because
// main.js is a lifted mockup with no exports -- nothing here re-implements the sentence.
//
// WHAT IT MUST NOT SAY: the stopped clock reading is the round's outcome, and speaking it would hand a
// screen-reader user the verdict before the tap. Everything asserted present is already on screen for
// sighted players (the round indicator, the active-player card, the forbidden-digit pill).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(here, 'main.js'), 'utf8');

/** Brace-walking slice of a class method -- the shape every rule in this mockup has. */
function sliceMethod(name) {
  const start = source.search(new RegExp(`^\\s*${name}\\(`, 'm'));
  assert.notEqual(start, -1, `zero-trigger/main.js no longer declares ${name}() -- this test is measuring nothing`);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(source.indexOf(name, start), i + 1);
    }
  }
  throw new Error(`unbalanced braces slicing ${name}()`);
}

/** Runs the real announceTurn() against a recorder standing in for #zt-live. `liveId` is what the
 *  document will answer to; passing anything else models the region going missing. */
function run({ liveId = 'zt-live', roundNumber = 3, cycleCount = 2, forbiddenDigit = 7, name = 'เอ' } = {}) {
  const writes = [];
  const live = {
    get textContent() {
      return writes.length ? writes[writes.length - 1] : '';
    },
    set textContent(value) {
      writes.push(value);
    },
  };
  const document = { getElementById: (id) => (id === liveId ? live : null) };
  // eslint-disable-next-line no-new-func -- the whole point is to execute main.js's own text.
  const engine = new Function('document', `return { ${sliceMethod('announceTurn')} };`)(document);
  engine.state = { roundNumber, cycleCount, forbiddenDigit };
  engine.announceTurn({ name });
  return writes;
}

test('zero-trigger: the round start is spoken, carrying only what the screen already shows', () => {
  const writes = run();
  assert.equal(writes.length, 2, 'the region must be cleared before the new sentence, so an identical repeat still fires');
  assert.equal(writes[0], '', 'the first write is the clear');

  const spoken = writes[1];
  for (const fragment of ['รอบที่ 3', 'วงที่ 2', 'เอ', 'หลบเลข 7']) {
    assert.ok(spoken.includes(fragment), `the announcement must carry ${fragment} -- got: ${spoken}`);
  }
});

test('zero-trigger: a missing live region is survived, not thrown through', () => {
  // prepareTurn() calls this on every round start; a throw here would strand the turn mid-render.
  assert.doesNotThrow(() => run({ liveId: 'not-the-region' }));
});
