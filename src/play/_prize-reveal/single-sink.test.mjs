// names-dom.ts is THE sink for a roster name on every prize-draw screen (ADR-0026: guard at the sink). This
// file checks the "only" half of that claim, which each screen's hostile-name test cannot: a module that
// wrote a name some other way, even inertly (a live region built by string concatenation, say), would sit
// outside the sink's guarantees (text only, dir="auto" isolation) while every hostile test stayed green.
//
// Two legs, because one instrument cannot see every sink:
//   1. RUNTIME. The prize fake DOM reports every string written into it (text, text node, string child,
//      attribute, style property, form value) to a hook. The setup page and the projector are driven for
//      real with distinctive roster names, the projector through every screen to the result; each write
//      that carries a roster name is attributed to the module on the call stack that made it, and that
//      module must be names-dom.ts. Writes made by a test (typing into the roster box) are the user's.
//   2. SOURCE. The DOM has text sinks the fake does not model as setters (innerText, nodeValue, title,
//      ARIA reflection, ...): a write to one of those on the fake is a silent plain property the hook never
//      sees. No source module in the three prize-draw directories may use one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { makeDoc } from '../../prize-event/fake-dom.mjs';
import { STORAGE_KEY, createEvent } from '../../prize-event/event.ts';
import { mountSetup } from '../../prize-event/setup-page.ts';
import { proposeSchedule } from '../../prize-draw/schedule.ts';
import { memoryStorage, mount, seeded } from '../prize-draw/stage-harness.mjs';

// Distinctive, and none is a substring of another ("Qz1Kv" is not inside "Qz11Kv").
const ROSTER = Array.from({ length: 12 }, (_, i) => `Qz${i + 1}Kv`);
const SINK = `${path.sep}_prize-reveal${path.sep}names-dom.ts`;
const SINK_URL = '/_prize-reveal/names-dom.ts';

/** The first frame below the fake DOM's own frames: the module that asked the fake to write. */
function writer() {
  const lines = new Error().stack.split('\n').slice(1);
  const first = lines.findIndex((l) => l.includes('fake-dom.mjs'));
  return (lines.slice(first).find((l) => !l.includes('fake-dom.mjs')) ?? '').trim();
}

function watch(doc) {
  const seen = { sink: 0, bypass: [] };
  const limit = Error.stackTraceLimit;
  doc.onWrite = (text) => {
    // Case-folded: a taken name the setup page lists ("qz1kv") is the same person's name.
    const name = ROSTER.find((n) => text.toLowerCase().includes(n.toLowerCase()));
    if (!name) return;
    Error.stackTraceLimit = 50;
    const by = writer();
    Error.stackTraceLimit = limit;
    if (by.includes(SINK) || by.includes(SINK_URL)) seen.sink++;
    else if (!/\.test\.mjs|stage-harness\.mjs/.test(by)) seen.bypass.push({ name, by, text });
  };
  return seen;
}

test('projector, every screen to the result: every roster name the route writes goes through names-dom.ts', () => {
  const doc = makeDoc();
  const seen = watch(doc);
  const storage = memoryStorage();
  const ev = createEvent({ eventName: 'Party 2570', names: ROSTER, schedule: proposeSchedule(ROSTER.length), prizes: ['A', 'B', 'C', 'D', 'E'] }, seeded(1));
  storage.map.set(STORAGE_KEY, JSON.stringify(ev));
  const s = mount({ storage, rng: seeded(2), doc });
  for (let guard = 0; s.go() && guard < 20; guard++) {
    s.go().disabled = false;
    s.go().click();
  }
  assert.equal(s.frame.getAttribute('data-screen'), 'result', 'the walk did not reach the result: the result path was not measured');
  assert.deepEqual(seen.bypass.map((b) => `${b.name} by ${b.by}`), [], 'a roster name reached the DOM outside names-dom.ts');
  assert.ok(seen.sink > ROSTER.length, `the hook saw ${seen.sink} sink writes: it is not seeing the screens`);
});

test('projector result: the live region names each winner through the sink, one direction-isolated run each, in the approved line', () => {
  const doc = makeDoc();
  const storage = memoryStorage();
  const ev = createEvent({ eventName: 'Party 2570', names: ROSTER, schedule: proposeSchedule(ROSTER.length), prizes: ['A', 'B', 'C'] }, seeded(1));
  storage.map.set(STORAGE_KEY, JSON.stringify(ev));
  const s = mount({ storage, rng: seeded(3), doc });
  for (let guard = 0; s.go() && guard < 20; guard++) {
    s.go().disabled = false;
    s.go().click();
  }
  const held = s.stage.current();
  const byId = new Map(held.setup.people.map((p) => [p.id, p.name]));
  const winners = held.setup.prizes.map((_, i) => byId.get(held.final.order[i]));
  const runs = s.live.all().filter((el) => el.getAttribute('dir') === 'auto');
  assert.deepEqual(runs.map((r) => r.textContent), winners, 'the live region does not carry each winner as its own isolated run');
  // The owner-approved line (evidence README, copy row 8), unchanged by routing the names through the sink.
  assert.equal(s.live.textContent, ['ผู้ได้รับรางวัล', ...winners.map((n, i) => `รางวัลที่ ${i + 1} · ${n}`)].join(' · '));
});

test('setup page: refused and taken names are shown, and only through names-dom.ts', () => {
  const doc = makeDoc();
  const seen = watch(doc);
  const add = (tag, id, parent = doc.body) => {
    const el = doc.createElement(tag);
    el.id = id;
    parent.append(el);
    return el;
  };
  const form = add('form', 'pd-setup');
  add('input', 'pd-event', form);
  add('textarea', 'pd-names', form);
  for (const id of ['pd-count', 'pd-names-msg', 'pd-s0', 'pd-l0', 'pd-l1', 'pd-l2', 'pd-l3', 'pd-sched-msg', 'pd-prize-count', 'pd-start-msg']) add('div', id, form);
  for (const id of ['pd-s1', 'pd-s2', 'pd-s3']) add('input', id, form);
  for (const id of ['pd-sched-reset', 'pd-prize-minus', 'pd-prize-plus']) add('button', id, form);
  for (let i = 1; i <= 5; i++) {
    const row = doc.createElement('div');
    row.setAttribute('data-prize-row', String(i));
    form.append(row);
    add('input', `pd-prize-${i}`, row);
  }
  mountSetup(doc, { localStorage: memoryStorage(), location: { assign() {} } });
  const box = doc.getElementById('pd-names');
  box.value = [...ROSTER, 'qz1kv', 'Qz2Kv!'].join('\n');
  box.dispatch('input');
  const listed = doc.getElementById('pd-names-msg').textContent;
  assert.ok(listed.includes('qz1kv') && listed.includes('Qz2Kv!'), 'the taken and the refused name are not listed: the sink was not exercised');
  assert.deepEqual(seen.bypass.map((b) => `${b.name} by ${b.by}`), [], 'a roster name reached the DOM outside names-dom.ts');
  assert.ok(seen.sink >= 2, `the hook saw ${seen.sink} sink writes`);
});

const DIRS = ['../prize-draw', '.', '../../prize-event'].map((d) => path.join(import.meta.dirname, d));
// Text sinks the fake DOM does not model as setters, so the runtime leg cannot see them.
const UNMODELLED = /\.(?:innerText|outerText|nodeValue|data|title|innerHTML|outerHTML|placeholder|alt|label|aria[A-Z]\w*)\s*=(?!=)|\binsertAdjacent(?:Text|HTML)\b|\bdocument\.write\b/;

test('no prize-draw source module writes through a text sink the runtime leg cannot see', () => {
  for (const sample of ['el.innerText = name;', 'el.ariaLabel = name;', 'el.title = w.name;', "el.insertAdjacentText('beforeend', n);"]) {
    assert.match(sample, UNMODELLED, `the scan misses ${sample}: it would pass vacuously`);
  }
  assert.doesNotMatch('el.textContent = name;', UNMODELLED, 'the scan flags the modelled sink');
  const hits = [];
  let scanned = 0;
  for (const dir of DIRS) {
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.ts'))) {
      scanned++;
      fs.readFileSync(path.join(dir, file), 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (!line.trimStart().startsWith('//') && UNMODELLED.test(line)) hits.push(`${file} line ${i + 1}: ${line.trim()}`);
        });
    }
  }
  assert.ok(scanned >= 7, `scanned ${scanned} modules: the directories moved`);
  assert.deepEqual(hits, []);
});
