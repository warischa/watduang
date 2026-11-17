// The marble-race module mounted for real (gh#316), over a fake renderer and a fake 2D canvas: node has no
// WebGL, so shaders never compile here, but every line of scene building, painting and per-frame update
// runs across whole rounds. It proves the module emits one cut beat per heat that runs, in order, and
// completes once; that every geometry, material and texture the scene draws with was registered through
// context.own; and that a name reaches the screen only as painted text (ADR-0026: names are attacker-owned).
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
    createLinearGradient: () => ({ addColorStop() {} }),
  };
  for (const m of ['setTransform', 'save', 'restore', 'beginPath', 'moveTo', 'lineTo', 'arcTo', 'closePath', 'fill', 'stroke', 'fillRect', 'clearRect', 'rect']) {
    ctx[m] = () => {};
  }
  return ctx;
}

/** A document that can only make canvases: any other element a name could become fails the test. */
function fakeDoc() {
  const painted = [];
  return {
    painted,
    createElement(tag) {
      assert.equal(tag, 'canvas', `the module created a <${tag}>: only canvases may carry a name`);
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

/** Tick at 50ms until the module completes (or a ceiling far past any round the board allows). */
function run(m, ceiling = 200000) {
  let t = 0;
  for (; t <= ceiling && !m.events.some((e) => e.type === 'complete'); t += 50) m.handle.advance({ type: 'tick', elapsedMs: t, deltaMs: 50 });
  return t;
}

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
  assert.ok(checked > 8, 'the scene held almost nothing: this check measured nothing');
}

const HOSTILE = '<img src=x onerror=alert(1)>';
const people = (n) =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: i === 3 ? 'ฒำฒำฒำฒำฒำฒำฒำฒำฒำฒำฒำฒำ' : i === 5 ? HOSTILE : `ชื่อ ${i}` }));
const label = (e) => (e.type === 'beat' ? `${e.beat}:${e.index}` : e.type);

test('a 200-name round runs all ten heats: one cut per heat in order, complete once, everything owned', () => {
  const ps = people(200);
  // Every other name survives, so every heat holds survivors and the freeze lands in heat 10.
  const survivors = ps.filter((_, i) => i % 2 === 0).map((p) => p.id);
  const m = mountFor({ key: 'e|round1:C', eventName: 'งาน', people: ps, outcome: { kind: 'round', game: 'marbles', round: 1, code: 'C', survivors } });
  assert.ok(m.renders.length >= 1, 'mount drew no first frame');
  assertAllOwned(m.renders[0].scene, m.owned);
  run(m);
  assert.deepEqual(m.events.map(label), [...Array.from({ length: 10 }, (_, h) => `cut:${h}`), 'complete']);
  assertAllOwned(m.renders.at(-1).scene, m.owned);
  const drawn = m.doc.painted.flatMap((c) => c.texts);
  for (const s of ['ชุดที่ 1 จาก 10', 'ชุดที่ 10 จาก 10', 'ครบ 100 คน ลูกแก้วที่ข้ามเส้นชัย อยู่ต่อ', 'ผ่านรอบที่ 1', 'เส้นชัย', 'รอบที่ 1 จาก 4']) {
    assert.ok(drawn.includes(s), `"${s}" was never painted`);
  }
  assert.ok(drawn.includes('100'), 'the survivor count was never painted');
  assert.ok(drawn.includes(HOSTILE), 'the hostile name was not painted verbatim as text');
  m.handle.dispose();
  m.handle.dispose();
});

test('a short field (7 names, one heat) and a field whose last heat keeps nobody both complete', () => {
  const seven = people(7);
  const a = mountFor({ key: 'k7', eventName: 'E', people: seven, outcome: { kind: 'round', game: 'marbles', round: 4, code: 'C', survivors: ['p0', 'p2', 'p3', 'p5', 'p6'] } });
  run(a);
  assert.deepEqual(a.events.map(label), ['cut:0', 'complete']);

  // 37 names: heats of 20 and 17. Only heat 1's names survive, so heat 2 never runs.
  const field = people(37);
  const b = mountFor({ key: 'k37', eventName: 'E', people: field, outcome: { kind: 'round', game: 'marbles', round: 2, code: 'C', survivors: field.slice(0, 20).map((p) => p.id) } });
  run(b);
  assert.deepEqual(b.events.map(label), ['cut:0', 'complete']);
});

test('a short heat after a full one draws nothing in its empty lanes, and marbles carry the board colours', () => {
  // 37 names: heat 1 is lanes 0-19, heat 2 lanes 0-16. Heat 1's last three lanes cross (gold, glowing),
  // then heat 2 runs with no lane 17-19 at all: nothing of heat 1 may linger there through the freeze.
  const ps = people(37);
  const m = mountFor({ key: 'k', eventName: 'E', people: ps, outcome: { kind: 'round', game: 'marbles', round: 1, code: 'C', survivors: ['p17', 'p18', 'p19', 'p25'] } });
  run(m);
  const scene = m.renders.at(-1).scene;
  const meshes = [];
  scene.traverse((o) => o.isInstancedMesh && meshes.push(o));
  assert.equal(meshes.length, 3, 'marbles, glows and streaks: one instanced mesh each');
  for (const mesh of meshes) {
    for (let i = 17; i < mesh.count; i++) {
      const e = mesh.instanceMatrix.array.slice(i * 16, i * 16 + 16);
      assert.ok(e.every((v) => v === 0), `an instanced mesh still draws lane ${i + 1}, which heat 2 does not have`);
    }
  }
  // The shader writes its tint as given, so the tint must be the board's sRGB value, not a linear one.
  const marbles = meshes.find((x) => x.geometry.getAttribute('aTint'));
  const tint = marbles.geometry.getAttribute('aTint');
  const near = (i, [r, g, b], what) =>
    assert.ok(Math.abs(tint.getX(i) - r) < 1e-3 && Math.abs(tint.getY(i) - g) < 1e-3 && Math.abs(tint.getZ(i) - b) < 1e-3, `${what}: (${tint.getX(i)}, ${tint.getY(i)}, ${tint.getZ(i)})`);
  near(5, [1, 0xcc / 255, 0], 'an across marble is not the board gold (--accent-gold)');
  near(0, [0x72 / 255, 0x24 / 255, 0x4d / 255], 'a stopped lane-1 marble is not the board dim #72244d');
});

test('three draws the scene in renderOrder: no opaque mesh sorts above a transparent one, so no layer hides the race', () => {
  // three draws its opaque list before its transparent list and sorts renderOrder only within each list. An
  // opaque mesh whose order is above a transparent one is therefore drawn under it whatever its order says:
  // the race (marbles, glows, streaks) once went opaque under the transparent full-frame background, which
  // overpainted every marble. Rebuild three's draw sequence from the materials and require it to be the
  // renderOrder sequence, whichever list each mesh lands in.
  const ps = people(20);
  const m = mountFor({ key: 'k', eventName: 'E', people: ps, outcome: { kind: 'round', game: 'marbles', round: 1, code: 'C', survivors: ['p1', 'p5'] } });
  const meshes = [];
  m.renders[0].scene.traverse((o) => o.isMesh && meshes.push(o));
  const byOrder = (a, b) => a.renderOrder - b.renderOrder;
  const listed = (wantTransparent) => meshes.filter((o) => (o.material.transparent === true) === wantTransparent).sort(byOrder);
  const drawn = [...listed(false), ...listed(true)];
  const describe = (o) => `${o.isInstancedMesh ? 'instanced' : 'mesh'}@${o.renderOrder}(${o.material.transparent ? 'transparent' : 'opaque'})`;
  for (let i = 1; i < drawn.length; i++) {
    assert.ok(drawn[i].renderOrder >= drawn[i - 1].renderOrder, `${describe(drawn[i])} is drawn after ${describe(drawn[i - 1])}, which its order puts above it`);
  }
  // The race meshes must sit above the background in the draw sequence, not merely in their order numbers.
  const race = meshes.filter((o) => o.isInstancedMesh);
  assert.equal(race.length, 3, 'marbles, glows and streaks: one instanced mesh each');
  const lowest = meshes.reduce((a, b) => (b.renderOrder < a.renderOrder ? b : a));
  for (const mesh of race) assert.ok(drawn.indexOf(mesh) > drawn.indexOf(lowest), `${describe(mesh)} is drawn before the background`);
  assert.ok(meshes.length >= 8, `only ${meshes.length} meshes checked: background, pulse, three race meshes, plates, band, figure`);
});

test('finish completes once; nothing draws after the reveal ended; a resize refits', () => {
  const ps = people(20);
  const input = { key: 'k', eventName: 'E', people: ps, outcome: { kind: 'round', game: 'marbles', round: 3, code: 'C', survivors: ['p1', 'p5'] } };
  const m = mountFor(input);
  m.handle.advance({ type: 'resize', viewport: { cssWidth: 1280, cssHeight: 1024, dpr: 2 } });
  m.handle.advance({ type: 'tick', elapsedMs: 16, deltaMs: 16 });
  assert.ok(m.renders.length >= 2);
  m.handle.advance({ type: 'finish' });
  m.handle.advance({ type: 'finish' });
  assert.deepEqual(m.events, [{ type: 'complete' }]);
  const before = m.renders.length;
  m.handle.advance({ type: 'tick', elapsedMs: 5000, deltaMs: 50 });
  assert.equal(m.renders.length, before, 'a frame was drawn after the reveal ended');
});

test('an outcome the module cannot draw as given is refused at mount, never repaired', () => {
  const ps = people(10);
  assert.throws(() => mountFor({ key: 'k', eventName: 'E', people: ps, outcome: { kind: 'round', game: 'marbles', round: 1, code: 'C', survivors: ['nobody'] } }), /marbles/);
});
