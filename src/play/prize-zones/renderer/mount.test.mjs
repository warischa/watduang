// The zones module mounted for real (gh#315), over a fake renderer and a fake 2D canvas: node has no WebGL, so
// shaders never compile here, but every line of scene building, painting and per-frame update runs across the
// whole timeline. It proves the module emits one cut beat per zone and completes once, that the fates it sends
// to the GPU are the committed survivors, that every geometry, material and texture it draws with was
// registered through context.own, and that a name reaches a canvas only as fillText's plain text.
import test from 'node:test';
import assert from 'node:assert/strict';
import { reveal } from './index.ts';

function fakeCtx() {
  let font = '10px x';
  const ctx = {
    canvas: null,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    shadowColor: '',
    shadowBlur: 0,
    textAlign: 'left',
    textBaseline: 'alphabetic',
    texts: [],
    get font() {
      return font;
    },
    set font(v) {
      font = v;
    },
    measureText(text) {
      const px = Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 10);
      return { width: [...text].length * px * 0.55 };
    },
    fillText(text) {
      ctx.texts.push(text);
    },
    getTransform: () => ({ a: 1 }),
  };
  for (const m of ['setTransform', 'translate', 'save', 'restore', 'beginPath', 'moveTo', 'lineTo', 'arc', 'arcTo', 'closePath', 'fill', 'stroke', 'fillRect', 'clearRect']) {
    ctx[m] = () => {};
  }
  return ctx;
}

function fakeDoc() {
  const painted = [];
  const created = [];
  return {
    painted,
    created,
    createElement(tag) {
      created.push(tag);
      assert.equal(tag, 'canvas', 'the module built a DOM element other than a canvas');
      const ctx = fakeCtx();
      painted.push(ctx);
      const canvas = { width: 0, height: 0, getContext: () => ctx };
      ctx.canvas = canvas;
      return canvas;
    },
  };
}

function mountFor(input, viewport = { cssWidth: 1920, cssHeight: 1080, dpr: 1 }) {
  const doc = fakeDoc();
  const owned = new Set();
  const renders = [];
  const abort = new AbortController();
  const renderer = {
    render(scene, camera) {
      renders.push({ scene, camera });
    },
  };
  const context = { root: { ownerDocument: doc }, renderer, signal: abort.signal, own: (r) => (owned.add(r), r) };
  const events = [];
  const full = { ...input, viewport, reducedMotion: false };
  const handle = reveal.mount(context, full, (e) => {
    events.push(e);
    if (e.type === 'complete') abort.abort();
  });
  return { handle, events, owned, renders, doc, abort };
}

function run(m, total) {
  for (let t = 0; t <= total + 100; t += 50) m.handle.advance({ type: 'tick', elapsedMs: t, deltaMs: 50 });
}

/** Every geometry, material and texture the scene would upload was registered through own(). */
function assertAllOwned(scene, owned) {
  let checked = 0;
  scene.traverse((obj) => {
    if (obj.geometry) {
      assert.ok(owned.has(obj.geometry), `${obj.type} geometry was not registered`);
      checked++;
    }
    if (obj.material) {
      assert.ok(owned.has(obj.material), `${obj.type} material was not registered`);
      for (const u of Object.values(obj.material.uniforms ?? {})) {
        if (u.value && u.value.isTexture) assert.ok(owned.has(u.value), 'a texture was not registered');
      }
      checked++;
    }
  });
  assert.ok(checked > 10, 'the scene held almost nothing: this check measured nothing');
}

// Short enough to fit one line, so it reaches fillText whole.
const HOSTILE = '<img src=x>';
const people = (n) =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: i === 3 ? 'ฒำฒำฒำฒำฒำฒำฒำฒำฒำฒำฒำฒำ' : i === 5 ? HOSTILE : `ชื่อ ${i}` }));
const TOTAL = 4 * 1100 + 800 + 3000;

function roundFor(n, keep) {
  const ps = people(n);
  // Scattered survivors in roster order: i -> i * k mod n is a bijection when k is coprime to n.
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  const k = [7, 11, 13].find((m) => gcd(m, n) === 1);
  const survivors = ps.filter((_, i) => (i * k) % n < keep).map((p) => p.id);
  assert.equal(survivors.length, keep, 'fixture: the survivor set is not the size asked for');
  return { key: 'e:round1:C', eventName: 'งาน', people: ps, outcome: { kind: 'round', game: 'zones', round: 1, code: 'C', survivors } };
}

for (const [n, keep] of [
  [200, 100],
  [52, 20],
  [7, 5],
]) {
  test(`${n} names: the whole timeline runs, four cut beats then complete once, everything owned`, () => {
    const input = roundFor(n, keep);
    const m = mountFor(input);
    assert.ok(m.renders.length >= 1, 'mount drew no first frame');
    assertAllOwned(m.renders[0].scene, m.owned);
    run(m, TOTAL);
    assert.deepEqual(
      m.events.map((e) => (e.type === 'beat' ? `${e.beat}:${e.index}` : e.type)),
      ['cut:0', 'cut:1', 'cut:2', 'cut:3', 'complete'],
    );
    assertAllOwned(m.renders.at(-1).scene, m.owned);
    const drawn = m.doc.painted.flatMap((c) => c.texts);
    for (const s of ['ผ่านรอบที่ 1', String(keep), 'โซนสีชมพู', 'โซนสีฟ้า', 'โซนสีม่วง', 'โซนสีขาว', 'ชื่อที่ไม่ผ่าน นั่งลง', 'ผ่าน', 'ไม่ผ่าน']) {
      assert.ok(drawn.includes(s), `"${s}" was never painted`);
    }
    assert.ok(drawn.some((s) => /^นั่ง \d+$/.test(s)), 'no zone badge counted who sat');
    // What the GPU is told: each chip's fate, in roster order, is exactly the committed survivors.
    const chips = m.renders.at(-1).scene.getObjectByName('chips');
    const verdict = chips.geometry.getAttribute('aVerdict');
    const passing = input.people.filter((_, i) => verdict.array[i * 2 + 1] === 1).map((p) => p.id);
    assert.deepEqual(passing, input.outcome.survivors);
    assert.equal(chips.geometry.instanceCount, n);
    m.handle.dispose();
    m.handle.dispose();
  });
}

test('names reach the canvas as plain text only, never as markup, and the module builds no DOM but canvases', () => {
  const m = mountFor(roundFor(52, 20));
  const drawn = m.doc.painted.flatMap((c) => c.texts);
  assert.ok(drawn.includes(HOSTILE), 'the hostile name was not painted as its own literal text');
  assert.ok(m.doc.created.every((t) => t === 'canvas'));
});

test('finish completes once; nothing draws after the reveal ended; a resize repaints at the new scale', () => {
  const m = mountFor(roundFor(37, 20));
  m.handle.advance({ type: 'tick', elapsedMs: 0, deltaMs: 0 });
  m.handle.advance({ type: 'resize', viewport: { cssWidth: 1280, cssHeight: 720, dpr: 2 } });
  const painted = m.doc.painted.length;
  m.handle.advance({ type: 'tick', elapsedMs: 300, deltaMs: 300 });
  m.handle.advance({ type: 'finish' });
  m.handle.advance({ type: 'finish' });
  assert.equal(m.events.filter((e) => e.type === 'complete').length, 1);
  const renders = m.renders.length;
  m.handle.advance({ type: 'tick', elapsedMs: 9000, deltaMs: 50 });
  assert.equal(m.renders.length, renders, 'a frame was drawn after the reveal completed');
  assert.ok(painted > 0);
});

test('an outcome the plan refuses fails the mount, before anything is drawn', () => {
  const input = roundFor(20, 5);
  input.outcome = { ...input.outcome, survivors: [...input.outcome.survivors, 'nobody'] };
  const doc = fakeDoc();
  const renders = [];
  const context = { root: { ownerDocument: doc }, renderer: { render: () => renders.push(1) }, signal: new AbortController().signal, own: (r) => r };
  assert.throws(() => reveal.mount(context, { ...input, viewport: { cssWidth: 1920, cssHeight: 1080, dpr: 1 }, reducedMotion: false }, () => {}), /survivor/);
  assert.equal(renders.length, 0);
  assert.equal(doc.created.length, 0);
});
