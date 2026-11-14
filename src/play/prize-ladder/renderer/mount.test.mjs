// The ladder module mounted for real (gh#307) over a fake renderer and fake 2D canvases: node has no WebGL,
// so shaders never compile here, but every line of scene building, painting and per-frame update runs
// across the whole timeline. It proves the beats arrive in order and complete once, that every geometry,
// material and texture the scene draws with was registered through context.own, and -- for all 120
// permutations -- that the name painted on each prize slot is the committed order's name for its rank.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ladderOrder } from '../../../prize-event/game-contract.ts';
import { reveal } from './index.ts';

const CLUSTERS = new Intl.Segmenter('th', { granularity: 'grapheme' });

function fakeCtx(canvas, log) {
  let font = '10px x';
  const ctx = {
    canvas,
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
  const painted = [];
  // Every text ever painted, on any canvas: a reused canvas clears its own record on repaint.
  const log = [];
  return {
    painted,
    log,
    createElement(tag) {
      assert.equal(tag, 'canvas');
      const canvas = { width: 0, height: 0 };
      const ctx = fakeCtx(canvas, log);
      canvas.ctx = ctx;
      canvas.getContext = () => ctx;
      painted.push(ctx);
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

function run(m, until, step = 100) {
  for (let t = 0; t <= until; t += step) m.handle.advance({ type: 'tick', elapsedMs: t, deltaMs: step });
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
const PERMS = permutations([0, 1, 2, 3, 4]);
const PRIZES = ['ทีวี 55 นิ้ว', 'จักรยานไฟฟ้า', 'หม้อทอดไร้น้ำมัน', 'พัดลม', 'กระเป๋า'];
const PEOPLE = ['p0', 'p1', 'p2', 'p3', 'p4'].map((id, i) => ({ id, name: `ชื่อ ${i}` }));
const NO_PRIZE = 'ไม่มีรางวัล';

function inputFor(perm, slotRanks, n, picks = ['p3', 'p1', 'p4', 'p0', 'p2'], people = PEOPLE) {
  return {
    key: `e|final|${perm.join('')}`,
    eventName: 'ปาร์ตี้ปีใหม่ 2570',
    people,
    outcome: { kind: 'final', game: 'ladder', prizes: PRIZES.slice(0, n), picks, permutation: perm, slotRanks, order: ladderOrder(picks, perm, slotRanks) },
  };
}

/** The texts painted on each prize slot, by exit lane, read off the scene's slot meshes. */
function slotTexts(scene) {
  const out = new Map();
  scene.traverse((obj) => {
    if (obj.userData.slotExit === undefined) return;
    const tex = obj.material.uniforms.uMap.value;
    out.set(obj.userData.slotExit, tex.image.ctx.texts);
  });
  return out;
}

const tags = (events) => events.map((e) => (e.type === 'beat' ? `${e.beat}:${e.index}` : e.type));

test('the whole timeline runs: five lights, beats in order, complete once, everything owned, nothing drawn after', () => {
  const ps = PEOPLE.map((p, i) => ({ ...p, name: ['ฒำฒำฒำฒำฒำฒำฒำฒำฒำฒำฒำฒำ', 'WWWWWWWWWWWW', 'ฒฒฒฒฒฒฒฒฒฒฒฒ', 'ต้น ส.', 'มะปรางหวานใจ'][i] }));
  const input = inputFor([3, 0, 4, 1, 2], [3, 0, 4, 1, 2], 3, undefined, ps);
  const m = mountFor(input);
  assert.ok(m.renders.length >= 1, 'mount drew no first frame');
  assertAllOwned(m.renders[0].scene, m.owned);
  run(m, 40000);
  const t = tags(m.events);
  assert.equal(t.filter((x) => x === 'complete').length, 1);
  assert.equal(t.at(-1), 'complete');
  assert.deepEqual(t.filter((x) => x.startsWith('cut')), ['cut:0', 'cut:1', 'cut:2', 'cut:3', 'cut:4']);
  assert.equal(t.filter((x) => x.startsWith('prize')).length, 5);
  assertAllOwned(m.renders.at(-1).scene, m.owned);
  const drawn = m.doc.log;
  for (const s of ['รอบชิงรางวัล', 'ทางแยกเลือกเส้น', 'แต่ละคนเลือกเส้นแล้ว', 'เปิดทางทีละคน', 'ผู้ได้รับรางวัล', 'ขอบคุณที่ร่วมลุ้น', NO_PRIZE, 'ผู้ได้รางวัล เปิดหน้าผลในมือถือให้ทีมงานดู ชื่อต้องตรงกับบนจอนี้']) {
    assert.ok(drawn.includes(s), `never painted: ${s}`);
  }
  assert.ok(drawn.includes('รางวัลที่ 1 · ทีวี 55 นิ้ว'), 'the first prize line was never painted');
  const before = m.renders.length;
  m.handle.advance({ type: 'tick', elapsedMs: 50000, deltaMs: 50 });
  assert.equal(m.renders.length, before, 'a frame was drawn after the reveal ended');
  m.handle.dispose();
  m.handle.dispose();
});

test('all 120 permutations mounted: each slot names order[rank] once its light lands; past the prize count it reads no prize', () => {
  let slots = 0;
  PERMS.forEach((perm, i) => {
    const slotRanks = PERMS[(i * 37) % 120];
    const n = (i % 5) + 1;
    const input = inputFor(perm, slotRanks, n);
    const m = mountFor(input);
    const names = new Map(PEOPLE.map((p) => [p.id, p.name]));
    // Before any light lands, no slot names anyone.
    for (const texts of slotTexts(m.renders[0].scene).values()) {
      for (const p of PEOPLE) assert.ok(!texts.includes(p.name), 'a slot named a finalist before the reveal');
    }
    run(m, 40000, 250);
    const shown = slotTexts(m.renders.at(-1).scene);
    assert.equal(shown.size, 5);
    for (const [exit, texts] of shown) {
      const rank = slotRanks[exit];
      const want = names.get(input.outcome.order[rank]);
      const named = PEOPLE.filter((p) => texts.includes(p.name)).map((p) => p.name);
      assert.deepEqual(named, [want], `perm ${perm} slots ${slotRanks} exit ${exit}`);
      assert.ok(texts.includes(rank < n ? `รางวัลที่ ${rank + 1}` : NO_PRIZE), `exit ${exit} rank ${rank} of ${n}: ${texts}`);
      if (rank >= n) assert.ok(!texts.some((x) => x.startsWith('รางวัลที่')), 'a no-prize slot shows a prize label');
      slots++;
    }
  });
  assert.equal(slots, 600);
});

test('finish completes once; a resize refits and redraws; dispose is idempotent', () => {
  const input = inputFor([4, 3, 2, 1, 0], [0, 1, 2, 3, 4], 5);
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

test('an inconsistent record is refused at mount, before anything is drawn', () => {
  const input = inputFor([3, 0, 4, 1, 2], [3, 0, 4, 1, 2], 3);
  input.outcome.order = [...input.outcome.order].reverse();
  assert.throws(() => mountFor(input), /order/);
});

test('the 3D scene hands the rail colour to its lane and leader meshes: TRACK.lane, the 50% rail (PD-307-04)', () => {
  const m = mountFor(inputFor([3, 0, 4, 1, 2], [3, 0, 4, 1, 2], 3));
  const hexes = new Map();
  m.renders[0].scene.traverse((obj) => {
    if (obj.name === 'lanes' || obj.name === 'leaders') hexes.set(obj.name, obj.material.color.getHexString());
  });
  assert.deepEqual([...hexes.keys()].sort(), ['lanes', 'leaders'], 'a rail mesh is missing from the scene');
  for (const [name, hex] of hexes) assert.equal(hex, '7a7897', `the ${name} mesh was painted #${hex}`);
  m.handle.dispose();
});
