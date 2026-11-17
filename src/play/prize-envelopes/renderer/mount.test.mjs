// The envelopes module mounted for real (gh#317) over a fake renderer and fake 2D canvases: node has no WebGL,
// so shaders never compile here, but every line of scene building, painting and per-frame update runs across
// the whole timeline. It proves the beats arrive in order and complete once, that every geometry, material and
// texture the scene draws with was registered through context.own, that the open flap's tip lands where the
// board draws it, and -- for every pick placement -- that the text painted on each envelope's slot is its
// picker's name and drawn prize, the envelopes opening no-prize first and the first prize last.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { reveal } from './index.ts';
import { ENV, OPEN_ANGLE, STEP, T, XS } from './plan.ts';

const CLUSTERS = new Intl.Segmenter('th', { granularity: 'grapheme' });

/** Past the last beat: every envelope opens, then the claim line. Read off the beats, never a copied figure:
 *  the reveal is about 7 s per envelope (owner ruling 2026-11-17), so a fixed short window would miss it. */
const END = T.idle + 5 * STEP + T.result;

function fakeCtx(canvas, log) {
  let font = '10px x';
  const ctx = {
    canvas,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    lineJoin: 'miter',
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
      // Width per grapheme cluster: a Thai vowel or tone mark sits on its letter and adds no advance.
      return { width: [...CLUSTERS.segment(text)].length * px * 0.55 };
    },
    fillText(text) {
      ctx.texts.push(text);
      log.push(text);
    },
    clearRect() {
      ctx.texts = [];
    },
    getTransform: () => ({ a: 1 }),
  };
  for (const m of ['setTransform', 'save', 'restore', 'beginPath', 'moveTo', 'lineTo', 'arcTo', 'arc', 'closePath', 'fill', 'stroke', 'fillRect']) {
    ctx[m] = () => {};
  }
  return ctx;
}

function fakeDoc() {
  // Every text ever painted, on any canvas.
  const log = [];
  return {
    log,
    createElement(tag) {
      assert.equal(tag, 'canvas');
      const canvas = { width: 0, height: 0 };
      const ctx = fakeCtx(canvas, log);
      canvas.ctx = ctx;
      canvas.getContext = () => ctx;
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
  const full = { viewport: { cssWidth: 1920, cssHeight: 1080, dpr: 1 }, reducedMotion: false, ...input };
  const handle = reveal.mount(context, full, (e) => {
    events.push(e);
    if (e.type === 'complete') abort.abort();
  });
  return { handle, events, owned, renders, doc, abort };
}

function run(m, until, step = 100, each = () => {}) {
  for (let t = 0; t <= until; t += step) {
    m.handle.advance({ type: 'tick', elapsedMs: t, deltaMs: step });
    each(t);
  }
}

/** Every geometry, material and texture the scene would upload was registered through own(). */
function assertAllOwned(scene, owned) {
  let checked = 0;
  scene.traverse((obj) => {
    if (obj.geometry) {
      assert.ok(owned.has(obj.geometry), `${obj.type} ${obj.name} geometry was not registered`);
      checked++;
    }
    if (obj.material) {
      assert.ok(owned.has(obj.material), `${obj.type} ${obj.name} material was not registered`);
      for (const u of Object.values(obj.material.uniforms ?? {})) {
        if (u.value && u.value.isTexture) assert.ok(owned.has(u.value), `a texture on ${obj.name} was not registered`);
      }
      if (obj.material.map) assert.ok(owned.has(obj.material.map), 'a map was not registered');
      checked++;
    }
  });
  assert.ok(checked > 40, `the scene held almost nothing (${checked}): this check measured nothing`);
}

function permutations(xs) {
  if (xs.length <= 1) return [xs];
  return xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]));
}
const PRIZES = ['ทีวี 55 นิ้ว', 'จักรยานไฟฟ้า', 'หม้อทอดไร้น้ำมัน', 'พัดลม', 'กระเป๋า'];
const PEOPLE = ['p0', 'p1', 'p2', 'p3', 'p4'].map((id, i) => ({ id, name: `ชื่อ ${i}` }));
const ORDER = ['p3', 'p1', 'p4', 'p0', 'p2'];
const NO_PRIZE = 'ไม่มีรางวัล';

function inputFor(picks, n, order = ORDER, people = PEOPLE) {
  return {
    key: `e|final|${picks.join('')}`,
    eventName: 'ปาร์ตี้ปีใหม่ 2570',
    people,
    outcome: { kind: 'final', game: 'envelopes', prizes: PRIZES.slice(0, n), order, picks },
  };
}

/** By envelope index: the slot mesh, its painted texts and whether it shows. */
function slotsOf(scene) {
  const out = new Map();
  scene.traverse((obj) => {
    if (obj.userData.envelope === undefined) return;
    out.set(obj.userData.envelope, { texts: obj.material.uniforms.uMap.value.image.ctx.texts, visible: obj.visible });
  });
  return out;
}
function platesOf(scene) {
  const out = new Map();
  scene.traverse((obj) => {
    if (obj.userData.plate !== undefined) out.set(obj.userData.plate, obj.material.uniforms.uMap.value.image.ctx.texts);
  });
  return out;
}

const tags = (events) => events.map((e) => (e.type === 'beat' ? `${e.beat}:${e.index}` : e.type));

test('the whole timeline runs: five openings, beats in order, complete once, everything owned, nothing drawn after', () => {
  const names = ['ฒำฒำฒำฒำฒำฒำฒำฒำฒำฒำฒำฒำ', 'WWWWWWWWWWWW', 'ฒฒฒฒฒฒฒฒฒฒฒฒ', 'ต้น ส.', 'มะปรางหวานใจ'];
  const ps = PEOPLE.map((p, i) => ({ ...p, name: names[i] }));
  const m = mountFor(inputFor(['p2', 'p0', 'p4', 'p1', 'p3'], 3, ORDER, ps));
  assert.ok(m.renders.length >= 1, 'mount drew no first frame');
  assertAllOwned(m.renders[0].scene, m.owned);
  run(m, END);
  const t = tags(m.events);
  assert.equal(t.filter((x) => x === 'complete').length, 1);
  assert.equal(t.at(-1), 'complete');
  assert.deepEqual(t.filter((x) => x.startsWith('cut')), ['cut:0', 'cut:1', 'cut:2', 'cut:3', 'cut:4']);
  assert.deepEqual(t.filter((x) => x.startsWith('prize')), ['prize:4', 'prize:3', 'prize:2', 'prize:1', 'prize:0']);
  assertAllOwned(m.renders.at(-1).scene, m.owned);
  const drawn = m.doc.log;
  for (const s of [
    'รอบชิงรางวัล',
    'ซองของขวัญ',
    'ผู้เข้ารอบชิง 5 คน เลือกซองของขวัญคนละซอง',
    'เลือกแล้ว รอเปิดรอบชิง',
    'ซองของขวัญปิดอยู่ รางวัลอยู่ข้างใน',
    'เปิดทีละซอง · ซองไม่มีรางวัลก่อน รางวัลที่ 1 เปิดสุดท้าย',
    'เปิดแล้ว 2 จาก 5 ซอง',
    'รางวัลที่ 1 เปิดสุดท้าย',
    'เปิดครบ 5 ซอง',
    'ผู้ได้รับรางวัล',
    'ขอบคุณที่ร่วมลุ้น',
    NO_PRIZE,
    'รางวัล',
    '3',
    'ผู้ได้รางวัล เปิดหน้าผลในมือถือให้ทีมงานดู ชื่อต้องตรงกับบนจอนี้',
    'ปาร์ตี้ปีใหม่ 2570',
  ]) {
    assert.ok(drawn.includes(s), `never painted: ${s}`);
  }
  // A name is only ever drawn whole, on one line or wrapped at its floor: never cut to fit.
  for (const name of names) assert.ok(drawn.some((x) => x === name) || drawn.join('').includes(name), `name lost: ${name}`);
  const before = m.renders.length;
  m.handle.advance({ type: 'tick', elapsedMs: 50000, deltaMs: 50 });
  assert.equal(m.renders.length, before, 'a frame was drawn after the reveal ended');
  m.handle.dispose();
  m.handle.dispose();
});

test('every placement x 1 to 5 prizes mounted: each slot names its picker and their drawn prize, prize 1 opens last', () => {
  let slots = 0;
  const names = new Map(PEOPLE.map((p) => [p.id, p.name]));
  permutations(PEOPLE.map((p) => p.id)).forEach((picks, i) => {
    const n = (i % 5) + 1;
    const m = mountFor(inputFor(picks, n));
    const scene = m.renders[0].scene;
    // Before anything opens, no slot shows; every plate names its picker from the start.
    for (const s of slotsOf(scene).values()) assert.equal(s.visible, false, 'a slot showed before its envelope opened');
    for (const [index, texts] of platesOf(scene)) assert.deepEqual(texts, [names.get(picks[index])]);
    const shownAt = new Map();
    run(m, END, 50, (t) => {
      for (const [index, s] of slotsOf(scene)) if (s.visible && !shownAt.has(index)) shownAt.set(index, t);
    });
    const shown = slotsOf(m.renders.at(-1).scene);
    assert.equal(shown.size, 5);
    for (const [index, s] of shown) {
      const rank = ORDER.indexOf(picks[index]);
      assert.equal(s.visible, true);
      const named = PEOPLE.filter((p) => s.texts.includes(p.name)).map((p) => p.name);
      assert.deepEqual(named, [names.get(picks[index])], `picks ${picks} envelope ${index}`);
      if (rank < n) {
        assert.ok(s.texts.includes(`รางวัลที่ ${rank + 1}`) && s.texts.includes(PRIZES[rank]), `envelope ${index} rank ${rank} of ${n}: ${s.texts}`);
      } else {
        assert.ok(s.texts.includes(NO_PRIZE) && s.texts.includes('ขอบคุณที่ร่วมลุ้น'), `envelope ${index} rank ${rank} of ${n}: ${s.texts}`);
        assert.ok(!s.texts.some((x) => x.startsWith('รางวัลที่')), 'a no-prize slot shows a prize label');
      }
      slots++;
    }
    // The order the room saw them open: no-prize envelopes left to right, then prize n down to prize 1.
    const seen = [...shownAt.entries()].sort((a, b) => a[1] - b[1]).map(([index]) => ORDER.indexOf(picks[index]));
    const none = [0, 1, 2, 3, 4].filter((k) => ORDER.indexOf(picks[k]) >= n).map((k) => ORDER.indexOf(picks[k]));
    assert.deepEqual(seen, [...none, ...Array.from({ length: n }, (_, k) => n - 1 - k)], `picks ${picks} n ${n}`);
  });
  assert.equal(slots, 600);
});

test('the flap turns about its hinge from the board\'s closed tip to its open tip, through the base camera', () => {
  const m = mountFor(inputFor(['p0', 'p1', 'p2', 'p3', 'p4'], 5));
  const { scene, camera } = m.renders[0];
  const tipY = (index) => {
    let tip = null;
    scene.traverse((obj) => {
      if (obj.name === `seal:${index}`) tip = obj.parent;
    });
    assert.ok(tip, `no flap tip on envelope ${index}`);
    tip.updateWorldMatrix(true, false);
    const world = new Vector3().setFromMatrixPosition(tip.matrixWorld);
    const p = world.clone().project(camera);
    // x on the envelope's centre line in the world (perspective spreads a tip off the row's plane sideways),
    // y where the camera puts it in the frame.
    return { x: world.x + 960, y: (1 - p.y) * 540, z: world.z, px: (p.x + 1) * 960 };
  };
  for (let i = 0; i < 5; i++) {
    const closed = tipY(i);
    assert.ok(Math.abs(closed.x - XS[i]) < 1e-6 && Math.abs(closed.y - (ENV.top + ENV.closedTip)) < 1e-6, `closed tip ${i}: ${closed.x},${closed.y}`);
  }
  run(m, END, 500);
  for (let i = 0; i < 5; i++) {
    const open = tipY(i);
    assert.ok(Math.abs(open.x - XS[i]) < 1e-6 && Math.abs(open.y - (ENV.top + ENV.openTip)) < 0.01, `open tip ${i}: ${open.x},${open.y}`);
    assert.ok(open.z < 0, `open tip ${i} leans toward the room, not back`);
    // Leaning back, an open tip off the frame's centre draws up to 15.65px nearer the centre than the board's
    // still (measured: 15.65, 7.82, 0, 7.82, 15.65 left to right): the 3D intent's perspective, bounded here.
    const inward = (open.px - XS[i]) * Math.sign(960 - XS[i]);
    assert.ok(inward >= 0 && inward <= 15.7, `open tip ${i} drawn ${open.px - XS[i]}px off the board's centre line`);
  }
  assert.ok(OPEN_ANGLE > Math.PI && OPEN_ANGLE < 1.5 * Math.PI, 'the open flap does not lean back past upright');
});

test('one draw order governs the scene: every mesh but the ground is transparent, and each flap is drawn over its body', () => {
  // three draws its opaque list first and sorts renderOrder only within a list: an opaque mesh among the
  // panels would be drawn under all of them whatever its order says.
  const m = mountFor(inputFor(['p0', 'p1', 'p2', 'p3', 'p4'], 3));
  const byName = new Map();
  let meshes = 0;
  m.renders[0].scene.traverse((obj) => {
    if (!obj.isMesh) return;
    byName.set(obj.name, obj);
    if (obj.name === 'ground') return;
    assert.equal(obj.material.transparent, true, `${obj.name} is opaque: it is drawn before every transparent panel`);
    meshes++;
  });
  assert.ok(meshes >= 25, `only ${meshes} meshes checked`);
  for (let i = 0; i < 5; i++) {
    const body = byName.get(`body:${i}`);
    const flap = byName.get(`flap:${i}`);
    const seal = byName.get(`seal:${i}`);
    assert.ok(body && flap && seal, `envelope ${i} is missing a part`);
    assert.ok(flap.renderOrder > body.renderOrder && seal.renderOrder > flap.renderOrder, `envelope ${i} draws out of order`);
  }
});

test('finish completes once; a resize refits and redraws; dispose is idempotent', () => {
  const input = inputFor(['p4', 'p3', 'p2', 'p1', 'p0'], 5);
  const early = mountFor(input);
  early.handle.advance({ type: 'tick', elapsedMs: 100, deltaMs: 100 });
  early.handle.advance({ type: 'finish' });
  early.handle.advance({ type: 'finish' });
  assert.deepEqual(early.events, [{ type: 'complete' }]);

  const m = mountFor(input);
  m.handle.advance({ type: 'resize', viewport: { cssWidth: 390, cssHeight: 844, dpr: 3 } });
  m.handle.advance({ type: 'tick', elapsedMs: 16, deltaMs: 16 });
  m.handle.advance({ type: 'resize', viewport: { cssWidth: 2560, cssHeight: 1080, dpr: 1 } });
  m.handle.advance({ type: 'tick', elapsedMs: 32, deltaMs: 16 });
  assert.ok(m.renders.length >= 3);
  assertAllOwned(m.renders.at(-1).scene, m.owned);
  m.handle.dispose();
  m.handle.dispose();
  const after = m.renders.length;
  m.handle.advance({ type: 'tick', elapsedMs: 48, deltaMs: 16 });
  assert.equal(m.renders.length, after, 'a disposed reveal drew a frame');
});

test('a record it could only draw by inventing is refused at mount, before anything is drawn', () => {
  const dup = inputFor(['p0', 'p0', 'p2', 'p3', 'p4'], 3);
  assert.throws(() => mountFor(dup), /pick/);
  const none = inputFor(['p0', 'p1', 'p2', 'p3', 'p4'], 3);
  delete none.outcome.picks;
  assert.throws(() => mountFor(none), /picks/);
});
