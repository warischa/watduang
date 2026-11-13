// node --test — gh#308, ADR-0026: names on the phone join page are attacker-owned. The server echoes the
// stored name, and localStorage keeps it, so both are channels into the page, and neither is trusted to
// have validated it. This file feeds markup, an anchor, an attribute break-out, a bidi override and
// over-long names down BOTH channels to every place the page renders a name (the header pill and the
// name card), plus the name-taken message, which renders the typed name. Each must show the name as
// text, exactly, and never let it become an element or an attribute.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { ACTIVE_TAGS, HOSTILE, makeDoc } from '../prize-event/fake-dom.mjs';
import { mountJoin } from './join-page.ts';
import { storageKey } from './join.ts';

const EV = 'AbCdEfGhIjKlMnOpQrStUv';
const JOIN_ID = 'j0j1j2j3j4j5j6j7j8j9jA';

const NAMES = [
  ...Object.values(HOSTILE),
  '"><img src=x onerror=alert(1)>',
  '</span><a href="/x">x</a>',
  `<b>${'W'.repeat(300)}</b>`,
  'ฒำ'.repeat(200),
];

function mount({ answer, stored }) {
  const doc = makeDoc();
  const root = doc.createElement('main');
  doc.body.append(root);
  const kv = new Map();
  const sent = [];
  if (stored) kv.set(storageKey(EV), JSON.stringify(stored));
  const h = mountJoin(root, {
    location: { pathname: '/game/prize-draw/join/', search: '', hash: `#event=${EV}&pin=123456` },
    history: { replaceState: () => {} },
    session: null,
    storage: { getItem: (k) => kv.get(k) ?? null, setItem: (k, v) => kv.set(k, v) },
    fetch: async (_url, init) => {
      sent.push(JSON.parse(init.body));
      return { status: answer.status, json: async () => answer.body };
    },
    getRandomValues: (a) => webcrypto.getRandomValues(a),
    setTimeout: () => 0,
    clearTimeout: () => {},
  });
  return { doc, root, h, kv, sent };
}

/** Every element below root and its attributes, as one list of strings. */
const attributeValues = (root) => root.all().flatMap((el) => [...el.attrs.values()]);

function assertInert(doc, root, name, label) {
  assert.deepEqual(doc.htmlWrites, [], `${label}: a markup sink was used`);
  // The page's own form is the one active element it renders by design; anything else came from a name.
  const own = (el) => el.tagName === 'FORM' && (el.id === 'pj-name-form' || el.id === 'pj-pin-form');
  assert.ok(root.all().filter(own).length <= 1, `${label}: one form at most`);
  const active = root.all().filter((el) => ACTIVE_TAGS.includes(el.tagName) && !own(el));
  assert.deepEqual(active.map((el) => el.tagName), [], `${label}: a name became an element`);
  assert.ok(!attributeValues(root).some((v) => v.includes(name)), `${label}: a name reached an attribute`);
}

function assertShownAsText(root, name, label) {
  for (const sel of ['.pj-me', '.pj-who']) {
    const box = root.querySelector(sel);
    assert.ok(box, `${label}: ${sel} is rendered`);
    assert.equal(box.textContent, name, `${label}: ${sel} shows the name exactly, as text`);
    const run = box.querySelector('.nm');
    assert.equal(run.childNodes.length, 1, `${label}: ${sel} holds one text node`);
    assert.equal(run.childNodes[0].nodeType, 3, `${label}: ${sel} holds text, not an element`);
    assert.equal(run.getAttribute('dir'), 'auto', `${label}: ${sel} isolates the name's direction`);
  }
}

test('positive control: a plain name reaches both sinks through the server channel', async () => {
  const s = mount({ answer: { status: 201, body: { id: JOIN_ID, name: 'ต้น ส.' } } });
  s.root.querySelector('#pj-name').value = 'ต้น ส.';
  s.root.querySelector('#pj-name-form').dispatch('submit');
  await s.h.settled();
  assertShownAsText(s.root, 'ต้น ส.', 'control');
  assertInert(s.doc, s.root, 'ต้น ส.', 'control');
});

test('server channel: a hostile name echoed by the join route is shown as text in the pill and the card', async () => {
  for (const name of NAMES) {
    const s = mount({ answer: { status: 201, body: { id: JOIN_ID, name } } });
    s.root.querySelector('#pj-name').value = 'ต้น';
    s.root.querySelector('#pj-name-form').dispatch('submit');
    await s.h.settled();
    const label = `server ${JSON.stringify(name.slice(0, 40))}`;
    assertShownAsText(s.root, name, label);
    assertInert(s.doc, s.root, name, label);
  }
});

test('storage channel: a hostile name in the kept record is shown as text in the pill and the card', () => {
  for (const name of NAMES) {
    const s = mount({ answer: null, stored: { token: 'T'.repeat(32), id: JOIN_ID, name } });
    const label = `stored ${JSON.stringify(name.slice(0, 40))}`;
    assertShownAsText(s.root, name, label);
    assertInert(s.doc, s.root, name, label);
  }
});

test('typed channel: a hostile name is refused before it is sent, so the taken message only ever holds a valid one', async () => {
  for (const name of NAMES) {
    const s = mount({ answer: { status: 409, body: { error: 'taken' } } });
    s.root.querySelector('#pj-name').value = name;
    s.root.querySelector('#pj-name-form').dispatch('submit');
    await s.h.settled();
    assert.equal(s.root.querySelector('.pj-nm'), null, `${JSON.stringify(name.slice(0, 40))} reached the taken message`);
    assert.equal(s.sent.length, 0, 'nothing was sent');
    assertInert(s.doc, s.root, name, `typed ${JSON.stringify(name.slice(0, 40))}`);
  }
});

test('the taken message writes the typed name through the text sink, at both places', async () => {
  const s = mount({ answer: { status: 409, body: { error: 'taken' } } });
  s.root.querySelector('#pj-name').value = "O'Neil";
  s.root.querySelector('#pj-name-form').dispatch('submit');
  await s.h.settled();
  const runs = s.root.querySelectorAll('.pj-nm');
  assert.equal(runs.length, 2);
  for (const run of runs) {
    assert.equal(run.textContent, "O'Neil");
    assert.equal(run.childNodes[0].nodeType, 3);
    assert.equal(run.getAttribute('dir'), 'auto');
  }
  assertInert(s.doc, s.root, "O'Neil", 'taken');
});
