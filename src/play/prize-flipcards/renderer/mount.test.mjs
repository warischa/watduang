// The flipcards module mounted for real (gh#318) over a fake renderer and fake 2D canvases: node has no WebGL,
// so shaders never compile here, but every line of scene building, painting and per-frame update runs across
// the whole timeline. It proves the beats arrive in order and complete once, that every geometry, material and
// texture the scene draws with was registered through context.own, that a turned card lies back on the row
// where the board draws it and reads the right way round, and -- for every pick placement -- that the text
// painted on each card's face is its picker's name and drawn prize, the cards turning no-prize first and the
// first prize last.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { reveal } from './index.ts';
import { CARD, CARD_CY, COPY, STEP, T, XS, claimOpacity, planFor } from './plan.ts';
import { FACE_MARGIN } from './paint.ts';

// A run window past the plan's whole timeline (idle + five beats + result), rounded up to the coarsest step
// used below so the complete beat always lands inside it. The absolute beat length is pinned by plan.test.
const UNTIL = Math.ceil((T.idle + 5 * STEP + T.result) / 500) * 500;

const CLUSTERS = new Intl.Segmenter('th', { granularity: 'grapheme' });

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
  for (const m of ['setTransform', 'save', 'restore', 'beginPath', 'moveTo', 'lineTo', 'arcTo', 'arc', 'closePath', 'fill', 'stroke', 'fillRect', 'clip', 'translate', 'rotate']) {
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

/** The hold host's seam (gh#319): complete settles but does NOT abort -- the picture stays up, the signal
 *  lives, and a later resize still reaches the module. The handback seam above aborts on complete. */
function mountHeldFor(input) {
  const doc = fakeDoc();
  const owned = new Set();
  const renders = [];
  const abort = new AbortController();
  const renderer = { render(scene, camera) { renders.push({ scene, camera }); } };
  const context = { root: { ownerDocument: doc }, renderer, signal: abort.signal, own: (r) => (owned.add(r), r) };
  const events = [];
  const full = { viewport: { cssWidth: 1920, cssHeight: 1080, dpr: 1 }, reducedMotion: false, ...input };
  const handle = reveal.mount(context, full, (e) => events.push(e));
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
  // Ground and five chrome panels, and per card its back, face and plate: 21 meshes, a geometry and a
  // material each.
  assert.ok(checked >= 42, `the scene held less than it draws (${checked}): this check measured too little`);
}

function permutations(xs) {
  if (xs.length <= 1) return [xs];
  return xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]));
}
const PRIZES = ['ทีวี 55 นิ้ว', 'จักรยานไฟฟ้า', 'หม้อทอดไร้น้ำมัน', 'พัดลม', 'กระเป๋า'];
const PEOPLE = ['p0', 'p1', 'p2', 'p3', 'p4'].map((id, i) => ({ id, name: `ชื่อ ${i}` }));
const ORDER = ['p3', 'p1', 'p4', 'p0', 'p2'];
const NO_PRIZE = 'ไม่มีรางวัล';

function inputFor(picks, n, order = ORDER, people = PEOPLE, prizes = PRIZES, claim = true) {
  return {
    key: `e|final|${picks.join('')}`,
    eventName: 'ปาร์ตี้ปีใหม่ 2570',
    people,
    outcome: { kind: 'final', game: 'flipcards', prizes: prizes.slice(0, n), order, picks },
    claim,
  };
}

/** By card index: the face mesh, its painted texts and whether it shows. */
function facesOf(scene) {
  const out = new Map();
  scene.traverse((obj) => {
    if (obj.userData.card === undefined) return;
    out.set(obj.userData.card, { mesh: obj, texts: obj.material.uniforms.uMap.value.image.ctx.texts, visible: obj.visible });
  });
  return out;
}
function backsOf(scene) {
  const out = new Map();
  scene.traverse((obj) => {
    if (obj.userData.back !== undefined) out.set(obj.userData.back, obj);
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

test('the whole timeline runs: five turns, beats in order, complete once, everything owned, nothing drawn after', () => {
  const names = ['ฒำฒำฒำฒำฒำฒำฒำฒำฒำฒำฒำฒำ', 'WWWWWWWWWWWW', 'ฒฒฒฒฒฒฒฒฒฒฒฒ', 'ต้น ส.', 'มะปรางหวานใจ'];
  const ps = PEOPLE.map((p, i) => ({ ...p, name: names[i] }));
  const m = mountFor(inputFor(['p2', 'p0', 'p4', 'p1', 'p3'], 3, ORDER, ps));
  assert.ok(m.renders.length >= 1, 'mount drew no first frame');
  assertAllOwned(m.renders[0].scene, m.owned);
  run(m, UNTIL);
  const t = tags(m.events);
  assert.equal(t.filter((x) => x === 'complete').length, 1);
  assert.equal(t.at(-1), 'complete');
  assert.deepEqual(t.filter((x) => x.startsWith('cut')), ['cut:0', 'cut:1', 'cut:2', 'cut:3', 'cut:4']);
  assert.deepEqual(t.filter((x) => x.startsWith('prize')), ['prize:4', 'prize:3', 'prize:2', 'prize:1', 'prize:0']);
  assertAllOwned(m.renders.at(-1).scene, m.owned);
  const drawn = m.doc.log;
  for (const s of [
    'รอบชิงรางวัล',
    'เปิดไพ่ชิงรางวัล',
    'ผู้เข้ารอบชิง 5 คน เลือกไพ่คว่ำคนละใบ',
    'เลือกไพ่แล้ว รอเปิดรอบชิง',
    'ไพ่คว่ำหน้า รางวัลอยู่ด้านหลัง',
    'เปิดทีละใบ · ใบไม่มีรางวัลก่อน รางวัลที่ 1 เปิดสุดท้าย',
    'เปิดแล้ว 2 จาก 5 ใบ',
    'รางวัลที่ 1 เปิดสุดท้าย',
    'เปิดครบ 5 ใบ',
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

test('every placement x 1 to 5 prizes mounted: each face names its picker and their drawn prize, prize 1 turns last', () => {
  let faces = 0;
  const names = new Map(PEOPLE.map((p) => [p.id, p.name]));
  permutations(PEOPLE.map((p) => p.id)).forEach((picks, i) => {
    const n = (i % 5) + 1;
    const m = mountFor(inputFor(picks, n));
    const scene = m.renders[0].scene;
    // Before anything turns, no face shows and every back does; every plate names its picker from the start.
    for (const f of facesOf(scene).values()) assert.equal(f.visible, false, 'a face showed before its card turned');
    for (const b of backsOf(scene).values()) assert.equal(b.visible, true, 'a back was hidden before its card turned');
    for (const [index, texts] of platesOf(scene)) assert.deepEqual(texts, [names.get(picks[index])]);
    const shownAt = new Map();
    run(m, UNTIL, 50, (t) => {
      for (const [index, f] of facesOf(scene)) if (f.visible && !shownAt.has(index)) shownAt.set(index, t);
    });
    const shown = facesOf(m.renders.at(-1).scene);
    assert.equal(shown.size, 5);
    for (const b of backsOf(scene).values()) assert.equal(b.visible, false, 'a back still shows on a turned card');
    for (const [index, f] of shown) {
      const rank = ORDER.indexOf(picks[index]);
      assert.equal(f.visible, true);
      const named = PEOPLE.filter((p) => f.texts.includes(p.name)).map((p) => p.name);
      assert.deepEqual(named, [names.get(picks[index])], `picks ${picks} card ${index}`);
      if (rank < n) {
        assert.ok(f.texts.includes(`รางวัลที่ ${rank + 1}`) && f.texts.includes(PRIZES[rank]), `card ${index} rank ${rank} of ${n}: ${f.texts}`);
      } else {
        assert.ok(f.texts.includes(NO_PRIZE) && f.texts.includes('ขอบคุณที่ร่วมลุ้น'), `card ${index} rank ${rank} of ${n}: ${f.texts}`);
        assert.ok(!f.texts.some((x) => x.startsWith('รางวัลที่')), 'a no-prize face shows a prize label');
      }
      faces++;
    }
    // The order the room saw them turn: no-prize cards left to right, then prize n down to prize 1.
    const seen = [...shownAt.entries()].sort((a, b) => a[1] - b[1]).map(([index]) => ORDER.indexOf(picks[index]));
    const none = [0, 1, 2, 3, 4].filter((k) => ORDER.indexOf(picks[k]) >= n).map((k) => ORDER.indexOf(picks[k]));
    assert.deepEqual(seen, [...none, ...Array.from({ length: n }, (_, k) => n - 1 - k)], `picks ${picks} n ${n}`);
  });
  assert.equal(faces, 600);
});

/** Where a mesh-local point lands in the frame through the base camera: frame px, y down. */
function frameXY(mesh, camera, x, y) {
  mesh.updateWorldMatrix(true, false);
  const p = new Vector3(x, y, 0).applyMatrix4(mesh.matrixWorld).project(camera);
  return { x: (p.x + 1) * 960, y: (1 - p.y) * 540 };
}
/** The cosine of the angle between a panel's outward normal and the direction to the camera from where the
 *  panel stands: positive the room sees its front, negative its back, zero edge-on. */
function facingCos(mesh, camera) {
  mesh.updateWorldMatrix(true, false);
  const normal = new Vector3(0, 0, 1).transformDirection(mesh.matrixWorld);
  const centre = new Vector3().setFromMatrixPosition(mesh.matrixWorld);
  const toCam = camera.position.clone().sub(centre);
  return normal.dot(toCam) / toCam.length();
}
/** Whether a panel's front side faces the camera. */
function facesRoom(mesh, camera) {
  return facingCos(mesh, camera) > 0;
}

test('a card turns over on its centre line and lies back on the row where the board draws it, read the right way round', () => {
  const m = mountFor(inputFor(['p0', 'p1', 'p2', 'p3', 'p4'], 5));
  const { scene, camera } = m.renders[0];
  const backs = backsOf(scene);
  const halfW = CARD.w / 2 + FACE_MARGIN;
  for (let i = 0; i < 5; i++) {
    const back = backs.get(i);
    assert.ok(facesRoom(back, camera), `back ${i} faces away before its turn`);
    assert.ok(!facesRoom(facesOf(scene).get(i).mesh, camera), `face ${i} faces the room before its turn`);
    const l = frameXY(back, camera, -0.5, 0.5);
    const r = frameXY(back, camera, 0.5, -0.5);
    assert.ok(Math.abs(l.x - (XS[i] - CARD.w / 2)) < 1e-6 && Math.abs(r.x - (XS[i] + CARD.w / 2)) < 1e-6, `back ${i} spans ${l.x}..${r.x}`);
    assert.ok(Math.abs(l.y - CARD.top) < 1e-6 && Math.abs(r.y - (CARD.top + CARD.h)) < 1e-6, `back ${i} stands ${l.y}..${r.y}`);
  }
  run(m, UNTIL, 500);
  const faces = facesOf(m.renders.at(-1).scene);
  for (let i = 0; i < 5; i++) {
    const face = faces.get(i).mesh;
    assert.ok(facesRoom(face, camera), `face ${i} turned away from the room`);
    // The face's own left edge is on the frame's left: a mirrored face would put it on the right.
    const l = frameXY(face, camera, -0.5, 0.5);
    const r = frameXY(face, camera, 0.5, -0.5);
    assert.ok(Math.abs(l.x - (XS[i] - halfW)) < 1e-6, `face ${i}: its left edge is drawn at ${l.x}, not ${XS[i] - halfW}`);
    assert.ok(Math.abs(r.x - (XS[i] + halfW)) < 1e-6, `face ${i}: its right edge is drawn at ${r.x}, not ${XS[i] + halfW}`);
    assert.ok(Math.abs((l.y + r.y) / 2 - CARD_CY) < 1e-6 && l.y < r.y, `face ${i} is not upright on the card's centre (${l.y}..${r.y})`);
    // Back on the row's plane: a turned card lies where it stood.
    face.updateWorldMatrix(true, false);
    assert.ok(Math.abs(new Vector3().setFromMatrixPosition(face.matrixWorld).z) < 1e-9, `face ${i} left the row's plane`);
  }
});

test('mid-turn the card leaves the plane and is edge-on at the half turn, where the sides swap', () => {
  const m = mountFor(inputFor(['p0', 'p1', 'p2', 'p3', 'p4'], 5));
  const { scene, camera } = m.renders[0];
  // The first card to turn under five prizes is prize 5's: the rank-4 finalist p2, on card 2 (ORDER ranks
  // p3 p1 p4 p0 p2, so p2 is rank 4). Its turn starts at 1500ms, the half turn at 1800ms.
  run(m, 1700, 100);
  const pivot = backsOf(scene).get(2).parent;
  assert.ok(pivot.rotation.y > 0 && pivot.rotation.y < Math.PI / 2, `before the half turn the card is at ${pivot.rotation.y}`);
  assert.equal(backsOf(scene).get(2).visible, true);
  assert.equal(facesOf(scene).get(2).visible, false);
  m.handle.advance({ type: 'tick', elapsedMs: 1800, deltaMs: 100 });
  assert.ok(Math.abs(pivot.rotation.y - Math.PI / 2) < 1e-9, 'the sides swap away from the half turn');
  assert.equal(backsOf(scene).get(2).visible, false);
  assert.equal(facesOf(scene).get(2).visible, true);
  m.handle.advance({ type: 'tick', elapsedMs: 1900, deltaMs: 100 });
  assert.ok(facesRoom(facesOf(scene).get(2).mesh, camera), 'past the half turn the face is still turned away');
});

// A hair of edge-on: below this cosine the card presents no area to the room at all, so neither of its sides
// points meaningfully away. Anything larger is a side genuinely turned away, and hiding the other one then
// leaves the card blank.
const EDGE_ON = 1e-6;

test('a card never vanishes during its turn: one side shows at every instant, and it is the side facing the room', () => {
  // Identity picks and order with one prize: cards 1 to 4 turn first, left to right, card 0 last. Every card
  // position is sampled across its whole turn 1ms apart, and the other four cards are checked at the same
  // instants. Away from the row's centre the half turn is not edge-on: the back still faces the room there
  // while the face, chosen by the clock alone, points away -- the card disappears for part of its own turn.
  const input = inputFor(['p0', 'p1', 'p2', 'p3', 'p4'], 1, ['p0', 'p1', 'p2', 'p3', 'p4']);
  const m = mountFor(input);
  const { scene, camera } = m.renders[0];
  const backs = backsOf(scene);
  const faces = facesOf(scene);
  const plan = planFor(input);
  let samples = 0;
  const check = (t) => {
    for (let i = 0; i < 5; i++) {
      const back = backs.get(i);
      const face = faces.get(i).mesh;
      const shown = [back, face].filter((o) => o.visible);
      assert.equal(shown.length, 1, `card ${i} at ${t}ms shows ${shown.length} sides`);
      const b = facingCos(back, camera);
      const f = facingCos(face, camera);
      const shownCos = shown[0] === back ? b : f;
      const hiddenCos = shown[0] === back ? f : b;
      assert.ok(shownCos >= -EDGE_ON, `card ${i} at ${t}ms shows a side pointing away from the room (${shownCos})`);
      assert.ok(hiddenCos <= EDGE_ON, `card ${i} at ${t}ms hides the side facing the room (${hiddenCos})`);
      samples++;
    }
  };
  m.handle.advance({ type: 'tick', elapsedMs: 0, deltaMs: 0 });
  check(0);
  for (const o of plan.openings) {
    for (let t = o.turnAt - 20; t <= o.turnAt + T.turn + 20; t++) {
      m.handle.advance({ type: 'tick', elapsedMs: t, deltaMs: 1 });
      check(t);
    }
    // The turn really completes: the face is the side the room reads once it is over.
    assert.equal(faces.get(o.index).mesh.visible, true, `card ${o.index} never came round`);
    assert.equal(backs.get(o.index).visible, false, `card ${o.index} still shows its back after its turn`);
  }
  assert.equal(samples, 5 * (1 + 5 * (T.turn + 41)), 'the sampling measured too little to cover every turn');
  m.handle.dispose();
});

test('one draw order governs the scene: every mesh but the ground is transparent, and the sides of a card share one layer', () => {
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
  assert.equal(meshes, 20, `${meshes} panels: five cards of back, face and plate, and five chrome panels`);
  for (let i = 0; i < 5; i++) {
    const back = byName.get(`back:${i}`);
    const face = byName.get(`face:${i}`);
    const plate = byName.get(`plate:${i}`);
    assert.ok(back && face && plate, `card ${i} is missing a part`);
    assert.ok(back.renderOrder === face.renderOrder && plate.renderOrder > face.renderOrder, `card ${i} draws out of order`);
  }
});

test('a long prize name is painted whole: the face grows about the card, never clipped', () => {
  // Enough words to wrap past the card's own height, so the face must grow rather than clip.
  const long = Array.from({ length: 24 }, (_, k) => `ส่วน${k}`).join(' ');
  const m = mountFor(inputFor(['p3', 'p1', 'p4', 'p0', 'p2'], 1, ORDER, PEOPLE, [long]));
  run(m, UNTIL, 500);
  const face = facesOf(m.renders.at(-1).scene).get(0);
  assert.equal(face.texts.join(' ').split(' ').filter((w) => w.startsWith('ส่วน')).length, 24, `words lost: ${face.texts}`);
  assert.ok(face.mesh.scale.y > CARD.h + 2 * FACE_MARGIN, `the face kept the card's height (${face.mesh.scale.y}) for ${face.texts.length} lines`);
  assert.equal(face.mesh.position.y, 0, 'the overflow is not even about the card');
});

test('a name is attacker-owned: it reaches the canvas only as fillText text, verbatim', () => {
  const evil = '<img src=x onerror=alert(1)>';
  const ps = PEOPLE.map((p, i) => (i === 3 ? { ...p, name: evil } : p));
  const m = mountFor(inputFor(['p3', 'p1', 'p4', 'p0', 'p2'], 1, ORDER, ps));
  run(m, UNTIL, 500);
  assert.ok(facesOf(m.renders.at(-1).scene).get(0).texts.join('').includes('<img'), 'the name did not reach the face as text');
  // The plate wraps the name at its floor, and the wrap consumes the space it breaks at: the painted lines
  // rebuild the name exactly when joined at that space, and every line is a substring of it -- nothing parsed
  // into markup, nothing added, nothing lost.
  const plate = platesOf(m.renders.at(-1).scene).get(0);
  assert.deepEqual(plate.join(' '), evil, 'the painted plate lines do not rebuild the name verbatim');
  for (const line of plate) assert.ok(evil.includes(line), `a plate line is not part of the name: ${line}`);
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

/** Every named part of the scene, by mesh name: the scene object is the same one each render draws. */
function namedParts(m) {
  const out = new Map();
  m.renders[0].scene.traverse((obj) => {
    if (obj.name) out.set(obj.name, obj);
  });
  return out;
}

test('the claim is QR mode\'s: claim false builds no claim surface; claim true paints it; the rest of the picture is identical', () => {
  const picks = ['p2', 'p0', 'p4', 'p1', 'p3'];
  const plan = planFor(inputFor(picks, 3));
  const off = mountFor(inputFor(picks, 3, ORDER, PEOPLE, PRIZES, false));
  const on = mountFor(inputFor(picks, 3));
  const offParts = namedParts(off);
  const onParts = namedParts(on);
  assert.equal(offParts.has('claim'), false, 'claim false built a claim surface');
  const claim = onParts.get('claim');
  assert.ok(claim, 'claim true built no claim surface');
  assert.ok(claim.material.uniforms.uMap.value, 'the claim surface holds no paint');
  assert.ok(claim.material.uniforms.uMap.value.image.ctx.texts.includes(COPY.claim), 'the claim surface does not carry the claim line');
  // A resize rebuilds every text: the claim stays unbuilt and unpainted through it.
  for (const m of [off, on]) {
    m.handle.advance({ type: 'resize', viewport: { cssWidth: 390, cssHeight: 844, dpr: 3 } });
    m.handle.advance({ type: 'resize', viewport: { cssWidth: 1920, cssHeight: 1080, dpr: 1 } });
  }
  assert.equal(namedParts(off).has('claim'), false, 'a resize built the claim surface with claim false');
  // The whole timeline side by side: the same beats, and every other part on the same opacity and visibility.
  for (let t = 0; t <= UNTIL; t += 100) {
    off.handle.advance({ type: 'tick', elapsedMs: t, deltaMs: 100 });
    on.handle.advance({ type: 'tick', elapsedMs: t, deltaMs: 100 });
    for (const name of ['top', 'hud', 'band', 'figure']) {
      const a = offParts.get(name);
      const b = onParts.get(name);
      assert.equal(a.material.uniforms.uOpacity.value, b.material.uniforms.uOpacity.value, `${name} opacity diverged at ${t}ms`);
      assert.equal(a.visible, b.visible, `${name} visibility diverged at ${t}ms`);
    }
    for (let i = 0; i < 5; i++) {
      assert.equal(offParts.get(`face:${i}`).visible, onParts.get(`face:${i}`).visible, `face ${i} visibility diverged at ${t}ms`);
    }
    // The seam aborts on complete, so the tick at total draws nothing: every earlier tick is on the plan's clock.
    if (t < plan.total) {
      assert.equal(claim.material.uniforms.uOpacity.value, claimOpacity(plan, t), `the claim fade left the plan's clock at ${t}ms`);
      assert.equal(claim.visible, t > plan.resultAt, `the claim shows at the wrong time at ${t}ms`);
    }
  }
  assert.deepEqual(tags(off.events), tags(on.events), 'claim false changed the beats');
  assert.ok(!off.doc.log.includes(COPY.claim), 'the claim line was painted with claim false');
  assert.ok(on.doc.log.includes(COPY.claim), 'the claim line was never painted with claim true');
  assert.ok(claim.visible && claim.material.uniforms.uOpacity.value > 0, 'the claim never showed at the result');
});

// ---- the held picture's lifecycle edges (gh#319 cross-lineage review) ----

test('finish before the first tick draws the committed result: every card face up, not the opening backs', () => {
  const m = mountHeldFor(inputFor(['p0', 'p1', 'p2', 'p3', 'p4'], 5));
  const before = m.renders.length;
  m.handle.advance({ type: 'finish' });
  assert.ok(m.renders.length > before, 'finish held the opening picture without drawing the result frame');
  const scene = m.renders.at(-1).scene;
  for (const f of facesOf(scene).values()) assert.equal(f.visible, true, 'a card face is down on the held result');
  for (const b of backsOf(scene).values()) assert.equal(b.visible, false, 'a card back still shows on the held result');
  assert.deepEqual(tags(m.events), ['complete'], 'finish did not complete exactly once');
});

test('finish before the fonts load redraws the held result once the faces arrive', async () => {
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
  const handle = reveal.mount(context, { ...inputFor(['p0', 'p1', 'p2', 'p3', 'p4'], 5), viewport: { cssWidth: 1920, cssHeight: 1080, dpr: 1 }, reducedMotion: false }, (e) => events.push(e));
  handle.advance({ type: 'finish' });
  const atFinish = renders.length;
  resolveFonts();
  await new Promise((r) => setTimeout(r, 0));
  assert.ok(renders.length > atFinish, 'the font rebuild submitted no frame: the held picture keeps fallback glyphs');
  for (const f of facesOf(renders.at(-1).scene).values()) assert.equal(f.visible, true, 'the redrawn held result lost its faces');
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
  const m = mountFontsFor(inputFor(['p0', 'p1', 'p2', 'p3', 'p4'], 5));
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
  const m2 = mountFontsFor(inputFor(['p0', 'p1', 'p2', 'p3', 'p4'], 5));
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

test('the font redraw rebuilds the hud\'s text', async () => {
  const m = mountFontsFor(inputFor(['p0', 'p1', 'p2', 'p3', 'p4'], 5));
  m.handle.advance({ type: 'finish' });
  const hud = m.renders[0].scene.getObjectByName('hud');
  const beforeImage = hud.material.uniforms.uMap.value.image;
  m.resolveFonts();
  await flush();
  assert.notEqual(hud.material.uniforms.uMap.value.image, beforeImage, 'the font redraw left the hud on fallback glyphs');
});
