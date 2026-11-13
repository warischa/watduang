// The fireworks module mounted for real (gh#305), over a fake renderer and a fake 2D canvas: node has no
// WebGL, so shaders never compile here, but every line of scene building, painting and per-frame update
// runs across both full timelines. It proves the module emits its beats in order and completes once, and
// that every geometry, material and texture the scene draws with was registered through context.own.
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
  for (const m of ['setTransform', 'save', 'restore', 'beginPath', 'moveTo', 'lineTo', 'arcTo', 'closePath', 'fill', 'stroke', 'fillRect', 'clearRect']) {
    ctx[m] = () => {};
  }
  return ctx;
}

function fakeDoc() {
  const painted = [];
  return {
    painted,
    createElement(tag) {
      assert.equal(tag, 'canvas');
      const ctx = fakeCtx();
      painted.push(ctx);
      const canvas = { width: 0, height: 0, getContext: () => ctx };
      ctx.canvas = canvas;
      return canvas;
    },
  };
}

function mountFor(input) {
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
  const full = { ...input, viewport: { cssWidth: 1920, cssHeight: 1080, dpr: 1 }, reducedMotion: false };
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

const people = (n) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: i === 3 ? 'ฒำฒำฒำฒำฒำฒำฒำฒำฒำฒำฒำฒำ' : `ชื่อ ${i}` }));

test('elimination at 200 names: the whole timeline runs, beats in order, complete once, everything owned', () => {
  const ps = people(200);
  const survivors = ps.filter((_, i) => i % 2 === 0).map((p) => p.id);
  const m = mountFor({ key: 'e|r1|C', eventName: 'งาน', people: ps, outcome: { kind: 'round', game: 'fireworks', round: 1, code: 'C', survivors } });
  assert.ok(m.renders.length >= 1, 'mount drew no first frame');
  assertAllOwned(m.renders[0].scene, m.owned);
  run(m, 20000);
  assert.deepEqual(m.events.map((e) => (e.type === 'beat' ? `${e.beat}:${e.index}` : e.type)), ['cut:0', 'cut:1', 'cut:2', 'cut:3', 'cut:4', 'complete']);
  assertAllOwned(m.renders.at(-1).scene, m.owned);
  const drawn = m.doc.painted.flatMap((c) => c.texts);
  assert.ok(drawn.includes('ผ่านรอบที่ 1'), 'the result label was never painted');
  assert.ok(drawn.includes('100'), 'the survivor count was never painted');
  m.handle.dispose();
  m.handle.dispose();
});

test('final: the whole timeline runs; finish completes once; nothing draws after the reveal ended', () => {
  const ps = people(5);
  const input = { key: 'e|final', eventName: 'งาน', people: ps, outcome: { kind: 'final', game: 'fireworks', prizes: ['ทีวี', ''], order: ['p2', 'p0', 'p4', 'p1', 'p3'] } };
  const m = mountFor(input);
  assertAllOwned(m.renders[0].scene, m.owned);
  run(m, 14000);
  assert.deepEqual(m.events.map((e) => (e.type === 'beat' ? `${e.beat}:${e.index}` : e.type)), ['prize:4', 'prize:3', 'prize:2', 'prize:1', 'prize:0', 'complete']);
  const before = m.renders.length;
  m.handle.advance({ type: 'tick', elapsedMs: 20000, deltaMs: 50 });
  assert.equal(m.renders.length, before, 'a frame was drawn after the reveal ended');

  const early = mountFor(input);
  early.handle.advance({ type: 'tick', elapsedMs: 100, deltaMs: 100 });
  early.handle.advance({ type: 'finish' });
  early.handle.advance({ type: 'finish' });
  assert.deepEqual(early.events, [{ type: 'complete' }]);
});

test('a resize refits without throwing', () => {
  const m = mountFor({ key: 'k', eventName: 'E', people: people(20), outcome: { kind: 'round', game: 'fireworks', round: 2, code: 'C', survivors: ['p1', 'p5'] } });
  m.handle.advance({ type: 'resize', viewport: { cssWidth: 1280, cssHeight: 1024, dpr: 2 } });
  m.handle.advance({ type: 'tick', elapsedMs: 16, deltaMs: 16 });
  assert.ok(m.renders.length >= 2);
});
