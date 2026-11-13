// What the ladder reveal puts on screen, measured off the mounted scene (gh#305 playthrough): the module runs
// over a fake renderer, and at every tick each panel's four corners go through the camera three itself would
// render with. Judged while a panel is drawn (visible, opacity above 0), for every phase of the timeline and
// at several projector sizes: every prize slot card and every lane plate lies wholly inside the viewport,
// and none of them meets the hud or the top bar. Also: the flat track (lanes, rungs, paths and their glow)
// and the leaders face the camera, so a material that culls back faces still draws them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { ladderOrder } from '../../../prize-event/game-contract.ts';
import { reveal } from './index.ts';
import { SLOT_MAX_H } from './plan.ts';

const CLUSTERS = new Intl.Segmenter('th', { granularity: 'grapheme' });

function fakeDoc() {
  return {
    createElement() {
      let font = '10px x';
      const canvas = { width: 0, height: 0 };
      const ctx = {
        canvas,
        get font() {
          return font;
        },
        set font(v) {
          font = v;
        },
        measureText(text) {
          const px = Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 10);
          return { width: [...CLUSTERS.segment(text)].length * px * 0.55 };
        },
        getTransform: () => ({ a: 1 }),
      };
      for (const m of ['setTransform', 'save', 'restore', 'beginPath', 'moveTo', 'lineTo', 'arcTo', 'arc', 'closePath', 'fill', 'stroke', 'fillRect', 'fillText', 'clearRect']) ctx[m] = () => {};
      canvas.getContext = () => ctx;
      return canvas;
    },
  };
}

// The board's stress names (design/Gh303Ladder.dc.html, ld-idle B) and its prize names, plus one prize name
// that takes two lines on a slot: the tallest card the camera fit allows for (SLOT_MAX_H). A prize name past
// two lines is outside that bound and outside this test.
const NAMES = ['ฒำฒำฒำฒำฒำฒำฒำฒำฒำฒำฒำฒำ', 'WWWWWWWWWWWW', 'ฒฒฒฒฒฒฒฒฒฒฒฒ', 'ต้น ส.', 'มะปรางหวานใจ'];
const PEOPLE = NAMES.map((name, i) => ({ id: `p${i}`, name }));
const PRIZES = ['ทีวี 55 นิ้ว', 'จักรยานไฟฟ้า', 'หม้อทอดไร้น้ำมันขนาดใหญ่พิเศษ', 'พัดลม', 'กระเป๋า'];

function mountAt(cssWidth, cssHeight, n = 3) {
  const picks = ['p2', 'p0', 'p4', 'p1', 'p3'];
  const perm = [3, 0, 4, 1, 2];
  const slotRanks = [2, 0, 4, 1, 3];
  const renders = [];
  const abort = new AbortController();
  const handle = reveal.mount(
    { root: { ownerDocument: fakeDoc() }, renderer: { render: (scene, camera) => renders.push({ scene, camera }) }, signal: abort.signal, own: (r) => r },
    {
      key: 'e|final',
      eventName: 'ปาร์ตี้ปีใหม่ 2570',
      people: PEOPLE,
      viewport: { cssWidth, cssHeight, dpr: 1 },
      reducedMotion: false,
      outcome: { kind: 'final', game: 'ladder', prizes: PRIZES.slice(0, n), picks, permutation: perm, slotRanks, order: ladderOrder(picks, perm, slotRanks) },
    },
    () => {},
  );
  return { handle, renders };
}

const meshes = (scene) => {
  const out = [];
  scene.traverse((o) => o.isMesh && out.push(o));
  return out;
};

/** A panel's box in viewport px, through the camera as rendered. */
function boxOf(mesh, camera, w, h) {
  const xs = [];
  const ys = [];
  for (const [x, y] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) {
    const v = new Vector3(x, y, 0).applyMatrix4(mesh.matrixWorld).project(camera);
    xs.push(((v.x + 1) / 2) * w);
    ys.push(((1 - v.y) / 2) * h);
  }
  return { l: Math.min(...xs), r: Math.max(...xs), t: Math.min(...ys), b: Math.max(...ys) };
}

const drawn = (m) => m.visible && (m.material.uniforms?.uOpacity?.value ?? 1) > 0;
const TOL = 0.5;
const inside = (b, w, h) => b.l >= -TOL && b.t >= -TOL && b.r <= w + TOL && b.b <= h + TOL;
const meets = (a, b) => Math.min(a.r, b.r) - Math.max(a.l, b.l) > TOL && Math.min(a.b, b.b) - Math.max(a.t, b.t) > TOL;
const fmt = (b) => `${b.l.toFixed(0)},${b.t.toFixed(0)}..${b.r.toFixed(0)},${b.b.toFixed(0)}`;

// 16:9 at the board's size and at 1280x720, then a 4:3 and a 21:9 screen (the camera fit's two branches).
for (const [w, h] of [[1920, 1080], [1280, 720], [1024, 768], [2560, 1080]]) {
  test(`${w}x${h}: every slot card and plate stays in view and clear of the hud and the top bar, every phase`, () => {
    const m = mountAt(w, h);
    const faults = [];
    let judged = 0;
    let plateTicks = 0;
    let tallest = 0;
    for (let t = 0; t <= 40000; t += 50) {
      m.handle.advance({ type: 'tick', elapsedMs: t, deltaMs: 50 });
      const last = m.renders.at(-1);
      if (!last) break;
      const { scene, camera } = last;
      scene.updateMatrixWorld(true);
      const all = meshes(scene);
      const byName = (n) => all.find((o) => o.name === n);
      const hud = byName('hud');
      const top = byName('top');
      assert.ok(hud && top, 'the hud and top bar panels are in the scene');
      const chrome = [...(drawn(hud) ? [['hud', boxOf(hud, camera, w, h)]] : []), ['top bar', boxOf(top, camera, w, h)]];
      for (const o of all) {
        if (!/^(slot|plate):/.test(o.name) || !drawn(o)) continue;
        const b = boxOf(o, camera, w, h);
        judged++;
        if (o.name.startsWith('plate')) plateTicks++;
        else tallest = Math.max(tallest, o.scale.y);
        if (!inside(b, w, h)) faults.push(`t=${t} ${o.name} ${fmt(b)} leaves the ${w}x${h} view`);
        for (const [name, c] of chrome) if (meets(b, c)) faults.push(`t=${t} ${o.name} ${fmt(b)} meets the ${name} ${fmt(c)}`);
      }
    }
    // A card near the tallest the fit allows for was on screen (two lines of prize name; a one-line name
    // there is 4.8px short of a two-line one), and none taller.
    assert.ok(tallest >= SLOT_MAX_H - 5 && tallest <= SLOT_MAX_H, `tallest slot card ${tallest}px, bound ${SLOT_MAX_H}px`);
    assert.ok(judged > 3000 && plateTicks > 1000, `too little was judged (${judged} panel ticks, ${plateTicks} plate ticks): this check measured nothing`);
    const kinds = ['leaves the', 'meets the hud', 'meets the top bar'].map((k) => `${faults.filter((f) => f.includes(k)).length} ${k}`);
    assert.deepEqual(faults.slice(0, 12), [], `${faults.length} fault(s): ${kinds.join(', ')}`);
  });
}

test('the flat track and the leaders face the camera: no triangle is a back face from where the camera stands', () => {
  const m = mountAt(1920, 1080, 5);
  for (const t of [0, 4000, 20000, 33000]) {
    m.handle.advance({ type: 'tick', elapsedMs: t, deltaMs: 50 });
    const { scene, camera } = m.renders.at(-1);
    scene.updateMatrixWorld(true);
    const eye = new Vector3().setFromMatrixPosition(camera.matrixWorld);
    let tris = 0;
    const back = [];
    for (const o of meshes(scene)) {
      if (!/^(lanes|leaders|rung:|glow:|path:)/.test(o.name)) continue;
      const pos = o.geometry.getAttribute('position');
      const idx = o.geometry.index.array;
      const end = Math.min(idx.length, o.geometry.drawRange.count);
      for (let i = 0; i + 2 < end; i += 3) {
        const [a, b, c] = [idx[i], idx[i + 1], idx[i + 2]].map((k) => new Vector3().fromBufferAttribute(pos, k).applyMatrix4(o.matrixWorld));
        const n = new Vector3().subVectors(b, a).cross(new Vector3().subVectors(c, a));
        if (n.lengthSq() === 0) continue;
        tris++;
        if (n.dot(new Vector3().subVectors(eye, a)) <= 0) back.push(o.name);
      }
    }
    assert.ok(tris > 20, `t=${t}: only ${tris} triangles were judged`);
    assert.deepEqual([...new Set(back)], [], `t=${t}: back faces in ${[...new Set(back)].join(', ')}`);
  }
});
