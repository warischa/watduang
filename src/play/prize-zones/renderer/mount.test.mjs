// The zones module mounted for real (gh#315), over a fake renderer and a fake 2D canvas: node has no WebGL, so
// shaders never compile here, but every line of scene building, painting and per-frame update runs across the
// whole timeline. It proves the module emits one cut beat per zone and completes once, that the fates it sends
// to the GPU are the committed survivors, that every geometry, material and texture it draws with was
// registered through context.own, and that a name reaches a canvas only as fillText's plain text.
import test from 'node:test';
import assert from 'node:assert/strict';
import { WebGLRenderList } from 'three/src/renderers/webgl/WebGLRenderLists.js';
import { reveal } from './index.ts';
import { planFor } from './plan.ts';

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

/** The hold host's seam (gh#319): complete settles but does NOT abort -- the picture stays up, the signal
 *  lives, and a later resize still reaches the module. The handback seam above aborts on complete. */
function mountHeldFor(input, viewport = { cssWidth: 1920, cssHeight: 1080, dpr: 1 }) {
  const doc = fakeDoc();
  const owned = new Set();
  const renders = [];
  const abort = new AbortController();
  const renderer = { render(scene, camera) { renders.push({ scene, camera }); } };
  const context = { root: { ownerDocument: doc }, renderer, signal: abort.signal, own: (r) => (owned.add(r), r) };
  const events = [];
  const handle = reveal.mount(context, { ...input, viewport, reducedMotion: false }, (e) => events.push(e));
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
  return { key: 'e:round1:C', eventName: 'งาน', people: ps, outcome: { kind: 'round', game: 'zones', round: 1, code: 'C', survivors }, claim: false };
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

/** The sequence three 0.170.0 actually draws `scene` in: its own render list and default comparators over a
 *  walk that matches WebGLRenderer's projectObject. A Group's renderOrder is carried down to its descendants
 *  as groupOrder, which painterSortStable and reversePainterSortStable both test before a mesh's own
 *  renderOrder. Only the walk is local: projectObject lives inside a WebGLRenderer, which cannot exist
 *  without a GL context. z is 0: both comparators settle groupOrder and renderOrder before z, and the
 *  assertions only compare meshes whose renderOrder differs. */
function drawSequence(scene) {
  const list = new WebGLRenderList();
  const walk = (object, groupOrder) => {
    if (object.visible === false) return;
    const order = object.isGroup ? object.renderOrder : groupOrder;
    if (object.isMesh || object.isLine || object.isPoints) {
      const material = object.material;
      if (Array.isArray(material)) {
        for (const one of material) if (one && one.visible) list.push(object, object.geometry, one, order, 0, null);
      } else if (material.visible) {
        list.push(object, object.geometry, material, order, 0, null);
      }
    }
    for (const child of object.children) walk(child, order);
  };
  walk(scene, 0);
  list.sort();
  return [...list.opaque, ...list.transmissive, ...list.transparent];
}

test('three draws the scene in renderOrder: no opaque mesh sorts above a transparent one, so no layer hides a name', () => {
  // three draws its opaque list before its transparent list and orders each by the keys in painterSortStable
  // and reversePainterSortStable, where a Group's renderOrder is carried down as groupOrder and tested before
  // a mesh's own renderOrder. An opaque mesh whose order sits above a transparent one, or any mesh moved
  // under a Group whose order outranks the layer it belongs in, is therefore drawn under a layer it should
  // sit above: the chips under the zone panels would overpaint every name, and mount tests, the WebGL lane
  // and review all pass while the screen shows a panel on top of the field. Rebuild the sequence three draws
  // and require it to be the renderOrder sequence.
  const m = mountFor(roundFor(20, 5));
  const drawn = drawSequence(m.renders[0].scene);
  const describe = (item) => `${item.object.name || item.object.type}@group${item.groupOrder}/order${item.renderOrder}(${item.material.transparent ? 'transparent' : 'opaque'})`;
  for (let i = 1; i < drawn.length; i++) {
    assert.ok(drawn[i].renderOrder >= drawn[i - 1].renderOrder, `${describe(drawn[i])} is drawn after ${describe(drawn[i - 1])}, which its order puts above it`);
  }
  // The chips must sit above the ground and the zone panels in the draw sequence, not merely in their order numbers.
  const at = (object) => drawn.findIndex((item) => item.object === object);
  const chips = m.renders[0].scene.getObjectByName('chips');
  const ground = m.renders[0].scene.getObjectByName('ground');
  assert.ok(chips && ground, 'the scene is missing the chips or the ground mesh');
  assert.ok(at(chips) > at(ground), `${describe(drawn[at(chips)])} is drawn before the ground`);
  for (const item of drawn.filter((it) => it.object.name.startsWith('zone-'))) {
    assert.ok(at(chips) > drawn.indexOf(item), `${describe(drawn[at(chips)])} is drawn before ${describe(item)}, so the panel overpaints every name`);
  }
  assert.ok(drawn.length >= 8, `only ${drawn.length} meshes drawn: ground, four panels, chips, top, heads, band, centre`);
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

// ---- the held picture's lifecycle edges (gh#319 cross-lineage review) ----

test('finish before the first tick draws the committed result at the plan end, not the opening frame', () => {
  const input = roundFor(37, 20);
  const m = mountHeldFor(input);
  const chips = m.renders[0].scene.getObjectByName('chips');
  const before = m.renders.length;
  m.handle.advance({ type: 'finish' });
  assert.ok(m.renders.length > before, 'finish held the opening picture without drawing the result frame');
  assert.equal(chips.material.uniforms.uTime.value, planFor(input).total, 'the held result is not at the plan end');
  assert.equal(m.events.filter((e) => e.type === 'complete').length, 1, 'finish did not complete exactly once');
});

test('finish before the fonts load redraws the held result once the faces arrive', async () => {
  const input = roundFor(37, 20);
  const doc = fakeDoc();
  let resolveFonts;
  const ready = new Promise((r) => { resolveFonts = r; });
  doc.fonts = { check: () => false, load: () => ready };
  const renders = [];
  const abort = new AbortController();
  const owned = new Set();
  const renderer = { render: (scene, camera) => renders.push({ scene, camera }) };
  const context = { root: { ownerDocument: doc }, renderer, signal: abort.signal, own: (r) => (owned.add(r), r) };
  const events = [];
  const handle = reveal.mount(context, { ...input, viewport: { cssWidth: 1920, cssHeight: 1080, dpr: 1 }, reducedMotion: false }, (e) => events.push(e));
  handle.advance({ type: 'finish' });
  const atFinish = renders.length;
  const chips = renders[0].scene.getObjectByName('chips');
  resolveFonts();
  await new Promise((r) => setTimeout(r, 0));
  assert.ok(renders.length > atFinish, 'the font rebuild submitted no frame: the held picture keeps fallback glyphs');
  assert.equal(chips.material.uniforms.uTime.value, planFor(input).total, 'the redrawn held result left the plan end');
});

/** A mount whose board faces never check true and whose load resolves on demand, over the hold seam. */
function mountFontsFor(input) {
  const doc = fakeDoc();
  let resolveFonts;
  const ready = new Promise((r) => { resolveFonts = r; });
  doc.fonts = { check: () => false, load: () => ready };
  const renders = [];
  const abort = new AbortController();
  const owned = new Set();
  const renderer = { render: (scene, camera) => renders.push({ scene, camera }) };
  const context = { root: { ownerDocument: doc }, renderer, signal: abort.signal, own: (r) => (owned.add(r), r) };
  const handle = reveal.mount(context, { ...input, viewport: { cssWidth: 1920, cssHeight: 1080, dpr: 1 }, reducedMotion: false }, () => {});
  return { handle, renders, abort, resolveFonts };
}
const flush = () => new Promise((r) => setTimeout(r, 0));

test('a font redraw during a render hold submits no frame and draws once when the hold lifts', async () => {
  globalThis.document ??= { documentElement: { setAttribute() {}, getAttribute() { return null; } } };
  const hold = await import('../../_render-hold.ts');
  // Held: the rebuild repaints but submits no frame; the lift draws exactly once.
  const m = mountFontsFor(roundFor(37, 20));
  m.handle.advance({ type: 'finish' });
  const release = hold.acquireRenderHold();
  try {
    const atFinish = m.renders.length;
    m.resolveFonts();
    await flush();
    assert.equal(m.renders.length, atFinish, 'a font redraw submitted a frame during the render hold');
    release();
    assert.equal(m.renders.length, atFinish + 1, 'the font redraw did not draw once when the hold lifted');
  } finally {
    release();
  }
  // Released before the lift: the redraw draws nothing.
  const m2 = mountFontsFor(roundFor(37, 20));
  m2.handle.advance({ type: 'finish' });
  const release2 = hold.acquireRenderHold();
  try {
    const atFinish = m2.renders.length;
    m2.resolveFonts();
    await flush();
    m2.abort.abort(); // the host released the picture while the hold was up
    release2();
    assert.equal(m2.renders.length, atFinish, 'a font redraw drew after the picture was released');
  } finally {
    release2();
  }
});

test('the font redraw rebuilds the zone heading\'s text', async () => {
  const m = mountFontsFor(roundFor(37, 20));
  m.handle.advance({ type: 'finish' });
  const head = m.renders[0].scene.getObjectByName('head-0');
  const headCtx = head.material.uniforms.uMap.value.image.getContext();
  let headPaints = 0;
  const realFill = headCtx.fillText.bind(headCtx);
  headCtx.fillText = (...a) => {
    headPaints++;
    return realFill(...a);
  };
  m.resolveFonts();
  await flush();
  assert.ok(headPaints > 0, 'the font redraw left the zone heading on fallback glyphs');
});
