// The cards module mounted for real (gh#306), over a fake renderer and a fake 2D canvas: node has no WebGL,
// so shaders never compile here, but every line of scene building, painting and per-frame update runs
// across both full timelines at 200 people. It proves the beats arrive in order and complete once, the
// cards the scene marks passing are exactly outcome.survivors (read off the instanced attribute the shader
// draws from), a deal never turns a card or paints a rule, and every geometry, material and texture the
// scene draws with was registered through context.own.
import test from 'node:test';
import assert from 'node:assert/strict';
import { reveal } from './index.ts';
import { dealInput, people, roundInput } from './fixtures.mjs';

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
  for (const m of ['setTransform', 'save', 'restore', 'beginPath', 'moveTo', 'lineTo', 'arcTo', 'bezierCurveTo', 'arc', 'closePath', 'fill', 'stroke', 'fillRect', 'clearRect', 'translate', 'scale', 'clip', 'rect']) {
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
      renders.push({ scene, camera, flip: cardsMesh(scene)?.material.uniforms.uFlip.value });
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

function cardsMesh(scene) {
  let found = null;
  scene.traverse((o) => {
    if (o.geometry?.getAttribute?.('aJudge')) found = o;
  });
  return found;
}

function run(m, total, step = 50) {
  for (let t = 0; t <= total + 100; t += step) m.handle.advance({ type: 'tick', elapsedMs: t, deltaMs: step });
}

const label = (e) => (e.type === 'beat' ? `${e.beat}:${e.index}` : e.type);

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
      if (obj.material.map) assert.ok(owned.has(obj.material.map), 'a map texture was not registered');
      for (const u of Object.values(obj.material.uniforms ?? {})) {
        if (u.value && u.value.isTexture) assert.ok(owned.has(u.value), `a texture on ${obj.name} was not registered`);
      }
      checked++;
    }
  });
  assert.ok(checked >= 8, `the scene held almost nothing (${checked}): this check measured nothing`);
}

/** The ids the scene marks passing: the instanced pass flag the shader judges with, in deal order. */
function displayedPassing(m, input) {
  const mesh = cardsMesh(m.renders.at(-1).scene);
  assert.ok(mesh, 'no card mesh in the scene');
  const judge = mesh.geometry.getAttribute('aJudge');
  assert.equal(judge.count, input.outcome.deal.cards.length, 'not one card per person');
  return input.outcome.deal.cards.filter((_, i) => judge.array[i * judge.itemSize + 1] === 1).map((c) => c.id);
}

const RANKS = new Set(['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']);
const RULE_TEXTS = ['ดำอยู่ต่อ', 'ดอกจิกเท่านั้น', 'เฉพาะไพ่หน้าคน', 'กติการอบนี้', 'ไพ่ดำอยู่ต่อ ไพ่แดงตกรอบ', 'ผ่าน', 'ไม่ผ่าน', 'เปิดพร้อมกันทั้งห้อง'];

test('deal at 200: the whole timeline runs, one deal beat then complete, every card stays face down', () => {
  const input = dealInput(people(200), 100);
  const m = mountFor(input);
  assert.ok(m.renders.length >= 1, 'mount drew no first frame');
  assertAllOwned(m.renders[0].scene, m.owned);
  run(m, 5000);
  assert.deepEqual(m.events.map(label), ['deal:0', 'complete']);
  assertAllOwned(m.renders.at(-1).scene, m.owned);
  assert.ok(m.renders.length > 50, 'the deal drew too few frames to have animated');
  assert.ok(m.renders.every((r) => r.flip === 0), 'a deal turned the cards face up');
  assert.deepEqual(displayedPassing(m, input), [], 'a deal marked a card passing');
  const judge = cardsMesh(m.renders.at(-1).scene).geometry.getAttribute('aJudge');
  for (let i = 0; i < judge.count; i++) assert.ok(judge.array[i * judge.itemSize] < 0, 'a deal scheduled a judgement');
  const drawn = m.doc.painted.flatMap((c) => c.texts);
  for (const s of RULE_TEXTS) assert.ok(!drawn.includes(s), `a deal painted "${s}"`);
  assert.ok(!drawn.some((t) => RANKS.has(t)), 'a deal painted a card face');
  assert.ok(drawn.includes('แจกไพ่แล้ว 200 ใบ'), 'the dealt count never reached the field');
  assert.ok(drawn.includes('ไพ่ของใครของมัน กติกายังไม่ได้สุ่ม'));
  assert.ok(drawn.includes('ไพ่แจกทั้งห้อง'), 'the game name was never painted');
  assert.ok(drawn.includes('รอบที่ 1 จาก 4'));
  m.handle.dispose();
  m.handle.dispose();
});

test('round at 200: rule, cut, complete in order; the scene shows exactly outcome.survivors passing', () => {
  const input = roundInput(people(200), 100, 1);
  const m = mountFor(input);
  assertAllOwned(m.renders[0].scene, m.owned);
  assert.equal(m.renders[0].flip, 0, 'the round started face up');
  run(m, 8000);
  assert.deepEqual(m.events.map(label), ['rule:0', 'cut:0', 'complete']);
  assert.equal(m.renders.at(-1).flip, 1, 'the cards never finished turning');
  assert.deepEqual(displayedPassing(m, input), input.outcome.survivors);
  assertAllOwned(m.renders.at(-1).scene, m.owned);
  const drawn = m.doc.painted.flatMap((c) => c.texts);
  const rule = { black: 'ดำอยู่ต่อ', clubs: 'ดอกจิกเท่านั้น', face: 'เฉพาะไพ่หน้าคน' }[input.outcome.deal.pair[1]];
  assert.ok(drawn.includes(rule), 'the drawn rule was never painted');
  assert.ok(drawn.includes('กติการอบนี้'));
  assert.ok(drawn.includes('เปิดพร้อมกันทั้งห้อง'));
  assert.ok(drawn.includes('ผ่านรอบที่ 1'));
  assert.ok(drawn.includes('100'), 'the kept count was never painted');
  assert.ok(drawn.includes('ผ่าน') && drawn.includes('ไม่ผ่าน'), 'the legend was never painted');
  m.handle.dispose();
  m.handle.dispose();
});

test('the passing set on screen follows outcome.survivors for every size and rule tried', () => {
  for (const n of [9, 37, 52, 200]) {
    for (const keep of [5, Math.ceil(n / 2), n - 1]) {
      for (const rule of [0, 1]) {
        const input = roundInput(people(n), keep, rule);
        const m = mountFor(input);
        m.handle.advance({ type: 'tick', elapsedMs: 10000, deltaMs: 10000 });
        assert.deepEqual(displayedPassing(m, input), input.outcome.survivors, `n ${n} keep ${keep} rule ${rule}`);
      }
    }
  }
});

test('a round whose survivors the drawn rule contradicts is refused at mount, never drawn', () => {
  const input = roundInput(people(37), 20, 0);
  const out = input.people.map((p) => p.id).find((id) => !input.outcome.survivors.includes(id));
  const swapped = { ...input, outcome: { ...input.outcome, survivors: [out, ...input.outcome.survivors.slice(1)] } };
  assert.throws(() => mountFor(swapped), /survivor/);
});

test('every resource stays owned across a resize and a repaint; finish completes once; nothing draws after', () => {
  const input = roundInput(people(200), 50, 0);
  const m = mountFor(input);
  m.handle.advance({ type: 'tick', elapsedMs: 3000, deltaMs: 16 });
  m.handle.advance({ type: 'resize', viewport: { cssWidth: 1280, cssHeight: 1024, dpr: 2 } });
  m.handle.advance({ type: 'tick', elapsedMs: 5600, deltaMs: 16 });
  assertAllOwned(m.renders.at(-1).scene, m.owned);
  m.handle.advance({ type: 'next' });
  m.handle.advance({ type: 'finish' });
  m.handle.advance({ type: 'finish' });
  assert.deepEqual(m.events.map(label), ['rule:0', 'cut:0', 'complete']);
  const before = m.renders.length;
  m.handle.advance({ type: 'tick', elapsedMs: 9000, deltaMs: 16 });
  assert.equal(m.renders.length, before, 'a frame was drawn after the reveal ended');
});

test('cosmetic choices follow the key: the same key replays the same tremble, another key differs', () => {
  const input = roundInput(people(20), 10, 0);
  const phase = (m) => {
    const a = cardsMesh(m.renders[0].scene).geometry.getAttribute('aJudge');
    return Array.from({ length: a.count }, (_, i) => a.array[i * a.itemSize + 2]);
  };
  const a = phase(mountFor(input));
  assert.deepEqual(a, phase(mountFor(input)));
  assert.notDeepEqual(a, phase(mountFor({ ...input, key: 'another' })));
  assert.equal(new Set(a).size, a.length, 'every card trembles on the same phase');
});

// PD-306-01 through the renderer's own card-building path (buildCards): the card rects the shader draws are
// placed from the MEASURED line counts, so a row holding a 3- or 4-line name is taller, and every rect stays
// inside the stage's field at 200 names. The fake canvas measures 0.55em per character; a name of one
// repeated letter has no space, so it wraps between clusters at the 16px floor, 9 per line in the 87.8px box.
test('200 names: a card whose name needs 3 or 4 lines gets a taller row, and every rect stays inside the field', () => {
  const FIELD = { left: 56, right: 1864, top: 100, bottom: 860 };
  const rects = (longAt, letters) => {
    const ps = people(200).map((p, i) => ({ ...p, name: i === longAt ? 'ก'.repeat(letters) : `นาม ${i}` }));
    const m = mountFor(dealInput(ps, 100));
    const rect = cardsMesh(m.renders[0].scene).geometry.getAttribute('aRect');
    const out = Array.from({ length: 200 }, (_, i) => Array.from(rect.array.slice(i * 4, i * 4 + 4)));
    m.abort.abort();
    return out;
  };
  // The attribute is Float32: edges are exact to ~1e-4.
  const inside = (all) => {
    for (const [cx, cy, w, h] of all) {
      assert.ok(cx - w / 2 >= FIELD.left - 1e-3 && cx + w / 2 <= FIELD.right + 1e-3, `a card leaves the field sideways (${cx}, ${w})`);
      assert.ok(cy - h / 2 >= FIELD.top - 1e-3 && cy + h / 2 <= FIELD.bottom + 1e-3, `a card leaves the field (${cy}, ${h})`);
    }
  };
  const three = rects(3, 22);
  assert.ok(Math.abs(three[0][2] - 171.8) < 0.06, `card width ${three[0][2]}`);
  assert.deepEqual([three[0][3], three[9][3], three[10][3]], [48, 48, 32], 'the 3-line name grows its own row only');
  inside(three);
  const four = rects(13, 30);
  assert.deepEqual([four[0][3], four[10][3], four[19][3], four[20][3]], [32, 64, 64, 32], 'the 4-line name grows its own row only');
  assert.ok(four[10][1] - four[0][1] >= (32 + 64) / 2 + 4 - 1e-3, 'the grown row overlaps the row above');
  inside(four);
});
