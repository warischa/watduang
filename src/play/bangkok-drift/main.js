'use strict';
// Hand-added to this lift and recorded in src/play/_divergences.json — the mockup is a standalone
// file and imports nothing. Everything below the two logic markers is the mockup's own bytes; every
// import here is used outside that block, so the rules the node check drives stay the lifted ones.
//
// ADR-0017 / ADR-0057: a freshly revealed control is disabled for a short window off the browser's
// own input clock, so a second contact from the tap that revealed it fires nothing. Closing the reset
// confirm is a reveal too — the setup controls behind it come back live with no arm window of their
// own — so the close paths arm as well.
import { armAllButtons } from '../../games/_arm-gate.ts';
// The shared cast (ADR-0054): one definition of the animals, read by every play route.
import { MASCOTS, mascotEmoji } from '../_mascots.ts';
// @logic-start -- pure rules, no DOM; test-logic.js slices this block out and drives it in node.
// Units are metres and seconds. Lateral position x is in road half-widths: the road spans -1..1.
const RULES = {
  SEG_LEN: 5,            // metres per track segment
  ROAD_HALF: 4,          // metres from the centre line to the road edge
  LANES: [-0.6, 0, 0.6], // obstacle lane centres in half-widths, indexed by lane + 1
  HIT_DX: 0.45,          // car half-width 0.2 + obstacle half-width 0.25, in half-widths
  OFFROAD_X: 1.05,       // the car centre past this is off the road
  GRACE_SEGS: 40,        // obstacle-free run-up: 200 m, about five seconds
  MIN_GAP: 8,            // segments between obstacles, so a free lane is always reachable
  SPEED0: 25,            // m/s at the green light
  SPEED_MAX0: 38,        // m/s ceiling at t = 0
  SPEED_RAMP: 0.9,       // the ceiling grows by this many m/s every second
  ACCEL: 10,             // m/s^2
  STEER: 2.8,            // half-widths per second at full input. ponytail: feel-tuned like
                         // CENTRIFUGAL below, not derived -- raised from 1.8 because the owner
                         // reported turning was too slow (full-road crossing 1.11s -> 0.71s).
                         // scripts/extract-mockup.mjs owns this file, but it would NOT quietly
                         // overwrite this: its pre-write seam refuses any byte change to a file the
                         // repo already ships, and the fragment recorded in src/play/_divergences.json
                         // cannot be released by --force at all, only by editing that registry.
                         // drift-rules.test.mjs pins the behaviour as the third check, so a value
                         // that did come back would also fail a test rather than only a gate.
  CENTRIFUGAL: 0.25,     // ponytail: one scalar on v^2/R, tuned by feel in a browser, not derived
  REDUCED_DT: 0.7,       // under prefers-reduced-motion the simulation is fed this fraction of dt, so
                         // the road still draws every frame but moves slower. It lives in this table
                         // rather than inline at the frame loop for one reason: drift-rules.test.mjs
                         // can only see the @logic-start block, so a number outside it has no test
                         // that fails on a WRONG value. Recorded in src/play/_divergences.json as two
                         // fragments -- this line AND the call site -- because a re-extraction that
                         // kept the constant and restored `dt * 0.7` at the wire would leave the
                         // registry green with the constant dead (gh#225).
  // The obstacle table. ONE row per kind, so a fifth kind is a row here plus one sprite, never a
  // branch in the rules. `th` is the Thai name a result screen shows. `lethal` ends the turn on
  // contact. The control kinds carry the numbers that make their effect measurable: `kick` is an
  // instant sideways shove in half-widths, `slide` how many seconds the car keeps drifting, `drift`
  // the drift speed in half-widths per second, `steerScale` how much steering survives while sliding.
  OBSTACLES: [
    { id: 'rock',   th: 'ก้อนหิน',      lethal: true,  kick: 0,    slide: 0,    drift: 0,   steerScale: 1 },
    { id: 'cone',   th: 'กรวย',         lethal: true,  kick: 0,    slide: 0,    drift: 0,   steerScale: 1 },
    { id: 'puddle', th: 'หนองน้ำ',      lethal: false, kick: 0,    slide: 1.5,  drift: 0.5, steerScale: 0.35 },
    { id: 'banana', th: 'เปลือกกล้วย',  lethal: false, kick: 0.35, slide: 0.35, drift: 0,   steerScale: 1 },
  ],
};
// Deterministic PRNG so one seed gives every player in the round the same road.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// A track is a list of segments. curve is the OutRun-style second difference of lateral drift in
// metres per segment, so a constant value over a run of segments draws a smooth arc. obstacle is
// null, or { kind, lane, dir }: kind indexes RULES.OBSTACLES, lane is -1 | 0 | 1, and dir is the
// sideways direction its effect uses. dir is drawn from the seeded PRNG rather than rolled at the
// moment of contact, because every player in a round drives the same seed and their metres only
// compare if the same banana kicks all of them the same way.
function buildTrack(seed, count) {
  const rnd = mulberry32(seed);
  const segs = [];
  let curve = 0, left = 0, gap = RULES.MIN_GAP;
  for (let i = 0; i < count; i++) {
    if (left === 0) {
      left = 20 + Math.floor(rnd() * 40);
      curve = rnd() < 0.4 ? 0 : (rnd() < 0.5 ? -1 : 1) * (0.1 + rnd() * 0.3);
    }
    left--;
    gap++;
    let obstacle = null;
    const density = 0.03 + 0.06 * Math.min(1, i / 2000); // sparse at the start, denser by 10 km
    if (i >= RULES.GRACE_SEGS && gap >= RULES.MIN_GAP && rnd() < density) {
      obstacle = {
        kind: Math.floor(rnd() * RULES.OBSTACLES.length),
        lane: Math.floor(rnd() * 3) - 1,
        dir: rnd() < 0.5 ? -1 : 1,
      };
      gap = 0;
    }
    segs.push({ curve, obstacle });
  }
  return segs;
}
// slide counts down the seconds left in a drift; slideV is its sideways speed, slideSteer how much
// steering survives it, and slideDir which way it leans (the renderer tilts the car by it).
function newDrive() {
  return { pos: 0, speed: RULES.SPEED0, x: 0, t: 0, seg: 0, slide: 0, slideV: 0, slideSteer: 1, slideDir: 0, hitKind: null, hits: 0 };
}
// Advances the car by dt seconds with steer in {-1, 0, 1}. Returns null while the turn is alive,
// 'offroad' or 'crash' on the frame it ends. An obstacle is judged once, on the frame the car enters
// its segment -- ponytail: no swept collision inside a segment; 5 m segments at 60 fps do not need it.
// Only a lethal row or leaving the road ends the turn; a control row changes the car and returns null.
function stepDrive(d, track, steer, dt) {
  d.t += dt;
  d.speed = Math.min(RULES.SPEED_MAX0 + RULES.SPEED_RAMP * d.t, d.speed + RULES.ACCEL * dt);
  const seg = track[d.seg % track.length];
  const sliding = d.slide > 0;
  d.x += steer * RULES.STEER * (sliding ? d.slideSteer : 1) * dt;
  if (sliding) {
    d.x += d.slideV * dt;
    d.slide = Math.max(0, d.slide - dt);
    if (d.slide === 0) { d.slideV = 0; d.slideSteer = 1; }
  }
  // v^2 / R with R = SEG_LEN^2 / curve, converted to half-widths; a right-hand bend pushes left.
  d.x -= (seg.curve / (RULES.SEG_LEN * RULES.SEG_LEN)) * d.speed * d.speed / RULES.ROAD_HALF * RULES.CENTRIFUGAL * dt;
  d.pos += d.speed * dt;
  if (Math.abs(d.x) > RULES.OFFROAD_X) return 'offroad';
  const idx = Math.floor(d.pos / RULES.SEG_LEN);
  while (d.seg < idx) {
    d.seg++;
    const s = track[d.seg % track.length];
    if (s.obstacle === null || Math.abs(d.x - RULES.LANES[s.obstacle.lane + 1]) >= RULES.HIT_DX) continue;
    const k = RULES.OBSTACLES[s.obstacle.kind];
    d.hitKind = k.id;
    d.hits++; // counts contacts, so a screen reader hears a second puddle as a second event
    if (k.lethal) return 'crash';
    d.x += k.kick * s.obstacle.dir;
    if (k.slide > 0) {
      d.slide = k.slide;
      d.slideV = k.drift * s.obstacle.dir;
      d.slideSteer = k.steerScale;
      d.slideDir = s.obstacle.dir;
    }
  }
  return null;
}
// results: [{ name, metres }] in turn order, metres being the integer the screen showed. Longest
// run first, ties keep turn order, and everyone tied on the shortest run is hit.
function rankPlayers(results) {
  const order = results.map((r, i) => ({ ...r, i })).sort((a, b) => b.metres - a.metres || a.i - b.i);
  const min = order[order.length - 1].metres;
  return { order, losers: order.filter((r) => r.metres === min) };
}
// @logic-end

const $ = (id) => document.getElementById(id);
const SCREENS = ['setup', 'turn', 'drive', 'result', 'final'];
// EVERY screen change routes through here, so this one call is every reveal path this route has:
// setup, turn, drive, result and final. ADR-0017/ADR-0057 — the buttons the new screen brings ship
// disabled for the arm window, judged on the browser's own input stamp (ADR-0059).
function show(name) {
  for (const s of SCREENS) {
    const screen = $('screen-' + s);
    screen.classList.toggle('active', s === name);
  }
  const revealed = $('screen-' + name);
  if (revealed) armAllButtons(revealed);
}
function announce(text) { $('live').textContent = text; }
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const game = { count: 4, names: [], turn: 0, track: null, results: [] };

// --- setup: the same ids and classes as the shipped ports, so the roster bridge lifts as-is.
function renderRoster() {
  const box = $('roster');
  const typed = [...box.querySelectorAll('.roster-input')].map((el) => el.value);
  box.replaceChildren();
  for (let i = 0; i < game.count; i++) {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'roster-input';
    input.maxLength = 15;
    input.dataset.index = i;
    input.placeholder = 'ผู้เล่น ' + (i + 1);
    input.setAttribute('aria-label', 'ชื่อผู้เล่นคนที่ ' + (i + 1));
    input.value = typed[i] || '';
    // gh#209, hand-added to this lift: the seat opens with its ANIMAL, never a seat number. The glyph
    // comes from the shared cast so this row can never drift from the badge any other screen shows.
    const row = document.createElement('div');
    row.className = 'roster-row';
    const badge = document.createElement('div');
    badge.className = 'roster-badge';
    badge.textContent = mascotEmoji(i);
    row.append(badge, input);
    box.appendChild(row);
  }
  document.querySelector('.count-display').textContent = game.count;
}
// The seat fields are rebuilt above, but the two stepper controls are not — they are static markup and
// their arm window expired long ago. Arming the whole setup screen after a rebuild is what covers the
// case where the rebuild was itself the reveal (the reset confirm closing onto it).
function armSetup() {
  const screen = $('screen-setup');
  if (screen) armAllButtons(screen);
}
// The reset-to-cast control (gh#178) and its confirm. `เก็บชื่อเดิมไว้` takes focus as soon as the
// question's controls arm: a click fires on Enter keydown, so focusing the destructive button would
// let a held key confirm a question nobody read.
function openResetNames() {
  const modal = $('bd-modal-reset-names');
  modal.classList.add('active');
  // Focus is handed over in the gate's own onArm hook, not beside this call: armAllButtons ships both
  // buttons `disabled` for the arm window, and focus() on a disabled control does nothing at all —
  // focusing here would read as a safe default while leaving the question with no focus.
  armAllButtons(modal, [], () => $('bd-cancel-reset-names').focus());
}
function closeResetNames() {
  $('bd-modal-reset-names').classList.remove('active');
  // Closing IS a reveal: every control on the setup screen is live again and none of them has an arm
  // window of its own, which is exactly why a second contact from the closing tap would fire one.
  armSetup();
}
$('bd-reset-names').addEventListener('click', openResetNames);
$('bd-cancel-reset-names').addEventListener('click', closeResetNames);
$('bd-confirm-reset-names').addEventListener('click', () => {
  for (const [i, el] of [...document.querySelectorAll('.roster-input')].entries()) {
    const name = MASCOTS[i % MASCOTS.length].name;
    el.value = el.maxLength > 0 ? name.slice(0, el.maxLength) : name;
  }
  closeResetNames();
  announce('รีเซ็ตชื่อผู้เล่นเป็นชื่อสัตว์แล้ว');
});
$('decPlayerBtn').addEventListener('click', () => { if (game.count > 2) { game.count--; renderRoster(); } });
$('incPlayerBtn').addEventListener('click', () => { if (game.count < 10) { game.count++; renderRoster(); } });
$('startGameBtn').addEventListener('click', () => {
  game.names = [...document.querySelectorAll('.roster-input')].map((el, i) => el.value.trim() || 'ผู้เล่น ' + (i + 1));
  startRound();
});
function startRound() {
  // One seed per round: every player drives the very same road, so their metres compare.
  game.track = buildTrack((Math.random() * 4294967296) >>> 0, 6000);
  game.results = [];
  game.turn = 0;
  showTurn();
}
function showTurn() {
  const name = game.names[game.turn];
  $('turn-count').textContent = 'คนที่ ' + (game.turn + 1) + ' จาก ' + game.count;
  $('turn-name').textContent = name;
  show('turn');
  announce('ส่งมือถือให้ ' + name);
}
$('readyBtn').addEventListener('click', startDrive);

// --- drive
const stage = $('stage');
const canvas = $('road');
// ADR-0051: a play route never blanks the page. A device that has run out of 2D contexts returns null
// here, and on some engines getContext itself throws — either way the module must keep loading, so the
// round can still be driven and finished with the canvas simply not drawing. Every drawing entry point
// below returns early when this is null; only the picture is lost, never the game.
const ctx = (() => {
  try {
    return canvas ? canvas.getContext('2d') : null;
  } catch {
    return null;
  }
})();
let W = 0, H = 0, drive = null, steer = 0, countdown = 0, goFlash = 0, last = 0, raf = 0, announcedHits = 0;
function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  W = stage.clientWidth;
  H = stage.clientHeight;
  // W is read by the steering split as well as by the renderer, so it is measured whether or not
  // there is a context to draw with. Only the transform below needs one.
  if (!ctx) return;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resize);
function startDrive() {
  show('drive');
  resize();
  stage.classList.remove('crash');
  drive = newDrive();
  steer = 0;
  countdown = 3;
  goFlash = 0;
  announcedHits = 0;
  $('hud-name').textContent = game.names[game.turn];
  $('overlay').textContent = '3';
  announce(game.names[game.turn] + ' เตรียมตัว นับถอยหลัง');
  last = performance.now();
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(frame);
}
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  let ended = null;
  if (countdown > 0) {
    countdown -= dt;
    $('overlay').textContent = countdown > 0 ? String(Math.ceil(countdown)) : 'ไป!';
    if (countdown <= 0) { goFlash = 0.6; announce('ไป!'); }
  } else {
    if (goFlash > 0 && (goFlash -= dt) <= 0) $('overlay').textContent = '';
    // Reduced motion slows the simulation instead of hiding it: the road still draws every frame.
    // The factor is RULES.REDUCED_DT, not a literal here, so drift-rules.test.mjs can red on a wrong
    // value; this call is the half no test in the slice can see, and the registry guards it (gh#225).
    ended = stepDrive(drive, game.track, steer, reduceMotion.matches ? dt * RULES.REDUCED_DT : dt);
    // A control hazard changes the car without ending the turn, and a canvas says nothing about
    // that on its own -- announce it outside the stage, in the live region.
    if (!ended && drive.hits > announcedHits) {
      announcedHits = drive.hits;
      const k = RULES.OBSTACLES.find((o) => o.id === drive.hitKind);
      if (k && !k.lethal) announce('เจอ' + k.th + ' รถเสียการควบคุม');
    }
  }
  draw();
  $('hud-dist').textContent = Math.floor(drive.pos) + ' ม.';
  $('hud-speed').textContent = Math.round(drive.speed * 3.6) + ' กม./ชม.';
  if (ended) endDrive(ended);
  else raf = requestAnimationFrame(frame);
}
function endDrive(why) {
  stage.classList.add('crash');
  steer = 0;
  const metres = Math.floor(drive.pos);
  game.results.push({ name: game.names[game.turn], metres });
  // The table owns the Thai name, so a fifth kind never needs a new string here.
  const hit = RULES.OBSTACLES.find((k) => k.id === drive.hitKind);
  const reason = why === 'crash' ? 'ชน' + (hit ? hit.th : 'สิ่งกีดขวาง') + '!' : 'หลุดออกนอกถนน!';
  announce(reason + ' ' + metres + ' เมตร');
  setTimeout(() => {
    $('result-why').textContent = reason;
    $('result-name').textContent = game.names[game.turn];
    $('result-dist').textContent = metres + ' ม.';
    const nextLabel = game.turn === game.count - 1 ? 'ดูผลรวม' : 'ส่งต่อให้คนถัดไป';
    $('nextBtn').textContent = nextLabel;
    // The markup ships a generic Thai accessible name from src/play/_aria-labels.json, because the
    // button is empty until this line runs and an empty control has no name at all. An aria-label
    // WINS over the text, so it is rewritten here to whatever the player can actually read.
    $('nextBtn').setAttribute('aria-label', nextLabel);
    show('result');
  }, 700);
}
$('nextBtn').addEventListener('click', () => {
  game.turn++;
  if (game.turn < game.count) showTurn(); else showFinal();
});
function showFinal() {
  const { order, losers } = rankPlayers(game.results);
  const list = $('rank');
  list.replaceChildren();
  order.forEach((r, i) => {
    const li = document.createElement('li');
    if (i === 0) li.classList.add('first');
    if (losers.includes(r)) li.classList.add('loser');
    const name = document.createElement('span');
    name.textContent = (i + 1) + '. ' + r.name;
    const dist = document.createElement('span');
    dist.textContent = r.metres + ' ม.';
    li.append(name, dist);
    list.appendChild(li);
  });
  const hit = losers.map((r) => r.name).join(', ');
  $('final-loser').textContent = hit + ' โดน!';
  show('final');
  announce('ผลรอบนี้ ' + order[0].name + ' ชนะ ' + hit + ' โดน');
}
$('replayBtn').addEventListener('click', startRound);
$('editBtn').addEventListener('click', () => { renderRoster(); show('setup'); });

// --- input: the left half of the stage steers left, the right half right; arrow keys for a desktop check.
function steerFrom(e) { steer = e.clientX < stage.getBoundingClientRect().left + W / 2 ? -1 : 1; }
stage.addEventListener('pointerdown', (e) => { e.preventDefault(); stage.setPointerCapture(e.pointerId); steerFrom(e); });
for (const type of ['pointerup', 'pointercancel']) stage.addEventListener(type, () => { steer = 0; });
window.addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft') steer = -1; else if (e.key === 'ArrowRight') steer = 1; });
window.addEventListener('keyup', (e) => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') steer = 0; });

// --- rendering: OutRun-style pseudo-3D. The camera sits above the car at the car's x; a road edge
// at distance z projects with scale = CAM_D / z, and bends are the classic accumulated x/dx offset.
const CAM_H = 3, CAM_D = 1.6, DRAW_SEGS = 60;
// A Bangkok horizon: boxy blocks, a few tapered towers and the odd thin spire, generated once from a
// fixed seed so it never flickers, drawn every frame as a flat dark silhouette. No landmark is
// reproduced and nothing carries a name -- a skyline, not a place.
const SKYLINE = (() => {
  const rnd = mulberry32(20260904), blocks = [];
  for (let x = 0; x < 1; x += 0.026) {
    blocks.push({ x, w: 0.02 + rnd() * 0.04, h: 0.12 + rnd() * rnd() * 1.7, taper: rnd() < 0.2 ? 0.35 : 0.92, spire: rnd() < 0.14 });
  }
  return blocks;
})();
function drawSkyline(HZ, shift) {
  const span = W + 120;
  ctx.fillStyle = '#0b1424';
  for (const s of SKYLINE) {
    const w = Math.max(4, s.w * W), h = s.h * HZ * 0.5;
    const x = (((s.x * W + shift) % span) + span) % span - 60, cx = x + w / 2, tw = w * s.taper;
    ctx.beginPath();
    ctx.moveTo(x, HZ);
    ctx.lineTo(cx - tw / 2, HZ - h);
    ctx.lineTo(cx + tw / 2, HZ - h);
    ctx.lineTo(x + w, HZ);
    ctx.closePath();
    ctx.fill();
    if (s.spire) ctx.fillRect(cx - w * 0.04, HZ - h - h * 0.3, Math.max(1, w * 0.08), h * 0.3);
  }
}
function draw() {
  // ADR-0051 again: no context means no picture, and the round carries on around it. This is the one
  // guard the whole renderer needs — every other drawing function below is reached only from here.
  if (!ctx) return;
  const HZ = H * 0.4, F = W / 2, RW = RULES.ROAD_HALF, SEG = RULES.SEG_LEN, track = game.track;
  const sky = ctx.createLinearGradient(0, 0, 0, HZ);
  sky.addColorStop(0, '#070c14');
  sky.addColorStop(1, '#274c7a');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, HZ);
  ctx.fillStyle = '#0d3b2a';
  ctx.fillRect(0, HZ, W, H - HZ);

  const base = drive.seg, frac = (drive.pos - base * SEG) / SEG, camX = drive.x * RW;
  drawSkyline(HZ, -camX * 9);
  const project = (z, wx) => {
    const s = CAM_D / Math.max(z, 0.5); // the camera-side edge sits behind the lens; clamp, canvas clips
    return { x: W / 2 + (wx - camX) * s * F, y: HZ + CAM_H * s * F, w: RW * s * F };
  };
  // edges[n] is the near edge of segment base+n; edges[0] is the one just behind the camera.
  const edges = [project(-frac * SEG, 0)];
  const hazards = [];
  let x = 0, dx = -track[base % track.length].curve * frac;
  for (let n = 0; n < DRAW_SEGS; n++) {
    const seg = track[(base + n) % track.length];
    x += dx;
    dx += seg.curve;
    edges.push(project((n + 1 - frac) * SEG, x));
    if (n > 0 && seg.obstacle !== null) hazards.push({ ob: seg.obstacle, edge: edges[n] });
  }
  for (let n = DRAW_SEGS; n >= 1; n--) { // far to near
    const near = edges[n - 1], far = edges[n], alt = Math.floor((base + n - 1) / 2) % 2 === 0;
    ctx.fillStyle = alt ? '#0f4a33' : '#0d3b2a';
    ctx.fillRect(0, far.y, W, near.y - far.y + 1);
    band(near, far, 1.12, alt ? '#f8fafc' : '#ef4444');
    band(near, far, 1, alt ? '#3b4252' : '#363c4a');
    if (alt) band(near, far, 0.02, '#e5e7eb');
  }
  // Distance fog: the far road and anything standing on it fade into the sky at the horizon.
  const fog = ctx.createLinearGradient(0, HZ, 0, HZ + H * 0.2);
  fog.addColorStop(0, 'rgba(39, 76, 122, 0.95)');
  fog.addColorStop(1, 'rgba(39, 76, 122, 0)');
  ctx.fillStyle = fog;
  ctx.fillRect(0, HZ, W, H * 0.2);

  for (let i = hazards.length - 1; i >= 0; i--) {
    const h = hazards[i], kind = RULES.OBSTACLES[h.ob.kind];
    SPRITES[kind.id](h.edge.x + RULES.LANES[h.ob.lane + 1] * h.edge.w, h.edge.y, h.edge.w * 0.25);
  }
  drawCar();
}
function band(near, far, k, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(near.x - near.w * k, near.y);
  ctx.lineTo(near.x + near.w * k, near.y);
  ctx.lineTo(far.x + far.w * k, far.y);
  ctx.lineTo(far.x - far.w * k, far.y);
  ctx.closePath();
  ctx.fill();
}
// One sprite per row of RULES.OBSTACLES, keyed by its id. The table cannot hold these itself: it is
// inside the @logic-start block, which test-logic.js evaluates in node where there is no canvas.
// Each takes the on-screen centre, the ground line and a half-width scaled by distance.
function groundShadow(cx, baseY, hw) {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.beginPath();
  ctx.ellipse(cx, baseY, hw * 1.3, hw * 0.35, 0, 0, Math.PI * 2);
  ctx.fill();
}
function drawCone(cx, baseY, hw) {
  const h = hw * 2.6;
  groundShadow(cx, baseY, hw);
  ctx.fillStyle = '#f97316';
  ctx.beginPath();
  ctx.moveTo(cx - hw, baseY);
  ctx.lineTo(cx + hw, baseY);
  ctx.lineTo(cx + hw * 0.3, baseY - h);
  ctx.lineTo(cx - hw * 0.3, baseY - h);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(cx - hw * 0.6, baseY - h * 0.55, hw * 1.2, h * 0.15);
}
function drawRock(cx, baseY, hw) {
  const h = hw * 1.9;
  groundShadow(cx, baseY, hw);
  ctx.fillStyle = '#6b7280';
  ctx.beginPath();
  ctx.moveTo(cx - hw * 1.15, baseY);
  ctx.lineTo(cx - hw * 0.85, baseY - h * 0.62);
  ctx.lineTo(cx - hw * 0.1, baseY - h);
  ctx.lineTo(cx + hw * 0.8, baseY - h * 0.7);
  ctx.lineTo(cx + hw * 1.1, baseY);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#9ca3af'; // one lit facet, so the block reads as a boulder and not a grey box
  ctx.beginPath();
  ctx.moveTo(cx - hw * 0.85, baseY - h * 0.62);
  ctx.lineTo(cx - hw * 0.1, baseY - h);
  ctx.lineTo(cx + hw * 0.1, baseY - h * 0.45);
  ctx.closePath();
  ctx.fill();
}
function drawPuddle(cx, baseY, hw) {
  ctx.fillStyle = 'rgba(15, 33, 62, 0.9)'; // lies flat on the road, no height
  ctx.beginPath();
  ctx.ellipse(cx, baseY, hw * 1.8, hw * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(148, 197, 255, 0.55)';
  ctx.beginPath();
  ctx.ellipse(cx - hw * 0.4, baseY - hw * 0.1, hw * 0.7, hw * 0.16, 0, 0, Math.PI * 2);
  ctx.fill();
}
function drawBanana(cx, baseY, hw) {
  groundShadow(cx, baseY, hw * 0.8);
  ctx.fillStyle = '#facc15';
  ctx.beginPath(); // a crescent: one arc out, a tighter one back
  ctx.arc(cx, baseY + hw * 0.5, hw * 1.3, Math.PI * 1.15, Math.PI * 1.85);
  ctx.arc(cx, baseY + hw * 0.85, hw * 1.3, Math.PI * 1.85, Math.PI * 1.15, true);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#a16207';
  ctx.fillRect(cx + hw * 1.05, baseY - hw * 0.35, hw * 0.28, hw * 0.22);
}
const SPRITES = { rock: drawRock, cone: drawCone, puddle: drawPuddle, banana: drawBanana };
function drawCar() {
  const cw = Math.min(W * 0.22, 110), ch = cw * 0.55;
  const sliding = drive.slide > 0;
  ctx.save();
  ctx.translate(W / 2, H - ch * 0.5 - 14);
  // Skid feedback: two dark streaks trailing the car, drawn before it so they sit on the road.
  if (sliding) {
    ctx.fillStyle = 'rgba(10, 10, 12, 0.45)';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(side * cw * 0.46 - drive.slideDir * cw * 0.9, ch * 0.5);
      ctx.lineTo(side * cw * 0.46 - drive.slideDir * cw * 0.7, ch * 0.5);
      ctx.lineTo(side * cw * 0.46 + cw * 0.06, ch * 0.18);
      ctx.lineTo(side * cw * 0.46 - cw * 0.06, ch * 0.18);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.rotate(steer * 0.06 + (sliding ? drive.slideDir * 0.16 : 0));
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.beginPath();
  ctx.ellipse(0, ch * 0.5, cw * 0.6, ch * 0.18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#111827'; // wheels
  ctx.fillRect(-cw * 0.55, ch * 0.05, cw * 0.18, ch * 0.45);
  ctx.fillRect(cw * 0.37, ch * 0.05, cw * 0.18, ch * 0.45);
  // A red low-slung sports car: wide flat body, a narrower shoulder line and a rear wing. It carries
  // no badge, no name and no marque cue -- the site's no-brands rule covers drawn shapes too.
  ctx.fillStyle = '#1f2937'; // rear wing, sitting above the deck
  ctx.fillRect(-cw * 0.46, -ch * 0.16, cw * 0.92, ch * 0.1);
  ctx.fillStyle = '#dc2626'; // body
  ctx.fillRect(-cw * 0.5, -ch * 0.06, cw, ch * 0.5);
  ctx.fillStyle = '#b91c1c'; // shadowed lower flank, so the body reads as a solid and not a slab
  ctx.fillRect(-cw * 0.5, ch * 0.28, cw, ch * 0.16);
  ctx.fillStyle = '#ef4444'; // roof line, narrower than the body: the low-slung silhouette
  ctx.beginPath();
  ctx.moveTo(-cw * 0.42, -ch * 0.06);
  ctx.lineTo(-cw * 0.3, -ch * 0.46);
  ctx.lineTo(cw * 0.3, -ch * 0.46);
  ctx.lineTo(cw * 0.42, -ch * 0.06);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#0b1220'; // rear glass
  ctx.fillRect(-cw * 0.26, -ch * 0.42, cw * 0.52, ch * 0.3);
  ctx.fillStyle = '#fca5a5'; // highlight along the deck
  ctx.fillRect(-cw * 0.5, -ch * 0.06, cw, ch * 0.04);
  ctx.fillStyle = '#fb7185'; // tail lights, lit
  ctx.fillRect(-cw * 0.46, ch * 0.08, cw * 0.16, ch * 0.1);
  ctx.fillRect(cw * 0.3, ch * 0.08, cw * 0.16, ch * 0.1);
  ctx.restore();
}

renderRoster();
