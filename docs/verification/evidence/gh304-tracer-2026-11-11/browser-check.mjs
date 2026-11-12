// gh#304 browser check, run through scripts/driver.mjs against a served dist/ (see README for the pair).
// Measures, never calculates: the projector at 1920x1080 (fit of every name chip, before and after the
// reveal, and the result cards), the reduced-motion reveal, a refresh mid-event, and the setup page at
// 320 and 1280. Screenshots land beside this file. Prints one JSON object.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../..');
const { createEvent, encodeEvent, STORAGE_KEY } = await import(path.join(ROOT, 'src/prize-event/event.ts'));
const { proposeSchedule } = await import(path.join(ROOT, 'src/prize-draw/schedule.ts'));
const BASE = process.env.BASE || 'http://localhost:4324';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The widest valid names (gh#302 NAME FIT row, orchestrator name rule): W x12 and DDO + SARA AM x12.
const WIDE_LATIN = 'W'.repeat(12);
const WIDE_THAI = 'ฒำ'.repeat(12);
function seedEvent() {
  let n = 7;
  const float = () => ((n = (n * 1103515245 + 12345) % 2147483648) / 2147483648);
  const rng = { float, int: (k) => Math.floor(float() * k), hex: (b) => Array.from({ length: b }, () => Math.floor(float() * 256).toString(16).padStart(2, '0')).join('') };
  const names = Array.from({ length: 200 }, (_, i) => `Guest ${i + 1}`);
  names[3] = WIDE_LATIN;
  names[4] = WIDE_THAI;
  return encodeEvent(createEvent({ eventName: 'ปาร์ตี้ปีใหม่ 2570', names, schedule: proposeSchedule(200), prizes: ['ทีวี 55 นิ้ว', 'จักรยานไฟฟ้า', 'หม้อทอดไร้น้ำมัน', 'ลำโพงไร้สาย', 'หูฟังไร้สาย'] }, rng));
}

// In-page: every name box against the fit rule. clip = the name's own run is wider than the box's
// content box (no slack); wrapped = the fit fell back to two lines; below = rendered under its floor.
const FIT_READ = `
  await document.fonts.ready;
  const out = { boxes: 0, clipped: [], wrapped: [], belowFloor: [], slackLost: [], wide: {} };
  for (const box of document.querySelectorAll('[data-fit-size]')) {
    out.boxes++;
    const run = box.firstElementChild;
    const cs = getComputedStyle(box);
    const room = box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const px = parseFloat(cs.fontSize);
    const floor = Number(box.dataset.fitFloor);
    const name = run.textContent;
    const wrapped = box.classList.contains('nm-wrap');
    const clipped = wrapped ? box.scrollHeight > box.clientHeight + 1 : run.offsetWidth > room + 0.5;
    if (clipped) out.clipped.push({ name, px, room, w: run.offsetWidth });
    if (wrapped) out.wrapped.push({ name, px });
    if (px < floor) out.belowFloor.push({ name, px, floor });
    if (!wrapped && run.offsetWidth * 1.02 > room + 0.5) out.slackLost.push({ name, px, room, w: run.offsetWidth });
    if (name === ${JSON.stringify(WIDE_LATIN)} || name === ${JSON.stringify(WIDE_THAI)}) out.wide[name === ${JSON.stringify(WIDE_LATIN)} ? 'W12' : 'DDO_AM12'] = { px, room, w: run.offsetWidth, wrapped, bold: cs.fontWeight };
  }
  out.screen = document.getElementById('pd-frame')?.getAttribute('data-screen');
  return out;
`;

const pressMc = `
  const b = document.querySelector('.pd-mc button');
  if (!b) return 'absent';
  for (let i = 0; i < 40 && b.disabled; i++) await new Promise((r) => setTimeout(r, 50));
  if (b.disabled) return 'disabled';
  b.click();
  return 'clicked';
`;

// The bold W x12 leg: the draw uses the browser's crypto, so whether W x12 passes round 1 is chance;
// re-seed and press until it is a passed (bold) chip, then read that one box after the bold face loaded.
// BOLD_MUTANT=1 stubs document.fonts.load so the refit on the bold face never runs (the bug's shape).
const BOLD_READ = `
  await new Promise((r) => setTimeout(r, 1500));
  const box = [...document.querySelectorAll('[data-fit-size]')].find((b) => b.firstElementChild.textContent === ${JSON.stringify(WIDE_LATIN)});
  if (!box) return { found: false };
  const run = box.firstElementChild;
  const cs = getComputedStyle(run);
  const bcs = getComputedStyle(box);
  const room = box.clientWidth - parseFloat(bcs.paddingLeft) - parseFloat(bcs.paddingRight);
  return { found: true, passed: box.classList.contains('in') && !!box.closest('.pd-marked'), weight: cs.fontWeight,
    boldFaceLoaded: document.fonts.check('700 20px Sarabun'), family: cs.fontFamily.split(',')[0],
    px: parseFloat(bcs.fontSize), floor: Number(box.dataset.fitFloor), room, w: run.offsetWidth,
    wrapClass: box.classList.contains('nm-wrap'), lines: run.getClientRects().length,
    clipped: box.scrollWidth > box.clientWidth + 1 || box.scrollHeight > box.clientHeight + 1 };
`;

async function boldLeg(session, seed, stage) {
  const tries = [];
  for (let i = 0; i < 10; i++) {
    await session.nav(stage);
    await session.wipe();
    await session.evaluate(`localStorage.setItem(${JSON.stringify(STORAGE_KEY)}, ${JSON.stringify(seed)}); return true;`);
    await session.setWidth(1920, 1080);
    await session.nav(stage);
    await session.setWidth(1920, 1080);
    await sleep(1500);
    const pre = (await session.evaluate(`${process.env.BOLD_MUTANT === '1' ? 'document.fonts.load = () => new Promise(() => {});' : ''} return { w: innerWidth, h: innerHeight, boldBefore: document.fonts.check('700 20px Sarabun') };`)).value;
    const press = (await session.evaluate(pressMc)).value;
    await sleep(2000);
    const read = (await session.evaluate(BOLD_READ)).value;
    tries.push({ pre, press, read });
    if (read?.passed) break;
  }
  return { mutant: process.env.BOLD_MUTANT === '1', attempts: tries.length, last: tries.at(-1), notPassed: tries.filter((t) => !t.read?.passed).length };
}

export default async function run(session) {
  const res = {};
  const seed = seedEvent();
  const stage = `${BASE}/game/prize-draw/play/`;
  if (process.env.BOLD_ONLY === '1') return { boldW12: await boldLeg(session, seed, stage), consoleErrors: [...session.consoleErrors] };

  // ---- projector, 1920x1080
  await session.nav(stage);
  await session.wipe();
  await session.evaluate(`localStorage.setItem(${JSON.stringify(STORAGE_KEY)}, ${JSON.stringify(seed)}); return true;`);
  await session.setWidth(1920, 1080);
  await session.nav(stage);
  await session.setWidth(1920, 1080);
  await sleep(1500);
  res.viewport = (await session.evaluate('return { w: innerWidth, h: innerHeight, mm: matchMedia("(prefers-reduced-motion: reduce)").matches };')).value;
  res.adsOnStage = (await session.evaluate('return document.querySelectorAll(".ad-slot, .ad-label").length;')).value;
  res.round1 = (await session.evaluate(FIT_READ)).value;
  await session.screenshot(path.join(HERE, 'stage-1920-round1.png'));
  res.press1 = (await session.evaluate(pressMc)).value;
  await sleep(2000);
  res.reveal1 = (await session.evaluate(FIT_READ)).value;
  await session.screenshot(path.join(HERE, 'stage-1920-reveal1.png'));
  const passedBefore = (await session.evaluate('return [...document.querySelectorAll(".pd-field .pd-chip.in")].map((c) => c.textContent);')).value;
  // refresh mid-event: the same round, the same survivors
  await session.nav(stage);
  await sleep(1500);
  const passedAfter = (await session.evaluate('return [...document.querySelectorAll(".pd-field .pd-chip.in")].map((c) => c.textContent);')).value;
  res.refresh = { screen: (await session.evaluate('return document.getElementById("pd-frame").getAttribute("data-screen");')).value, samePassed: JSON.stringify(passedBefore) === JSON.stringify(passedAfter), passed: passedAfter.length };
  // walk to the result
  const walk = [];
  for (let i = 0; i < 8; i++) {
    walk.push((await session.evaluate(pressMc)).value);
    await sleep(1600);
    const scr = (await session.evaluate('return document.getElementById("pd-frame").getAttribute("data-screen");')).value;
    if (scr === 'final') await session.screenshot(path.join(HERE, 'stage-1920-final.png'));
    if (scr === 'result') break;
  }
  res.walk = walk;
  res.result = (await session.evaluate(FIT_READ)).value;
  await session.screenshot(path.join(HERE, 'stage-1920-result.png'));
  res.consoleErrors = [...session.consoleErrors];

  // ---- reduced motion: the reveal fades (--motion-rm-fade) instead of the wave
  await session.cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await session.wipe();
  await session.evaluate(`localStorage.setItem(${JSON.stringify(STORAGE_KEY)}, ${JSON.stringify(seed)}); return true;`);
  await session.nav(stage);
  await sleep(1500);
  const rm = { matches: (await session.evaluate('return matchMedia("(prefers-reduced-motion: reduce)").matches;')).value };
  rm.press = (await session.evaluate(pressMc)).value;
  await sleep(60);
  rm.during = (await session.evaluate(`const f = document.querySelector('.pd-field'); const c = f.querySelector('.pd-chip'); return { fade: f.classList.contains('pd-fade'), animation: getComputedStyle(f).animationName + ' ' + getComputedStyle(f).animationDuration, chipDelay: getComputedStyle(c).transitionDelay, marked: f.classList.contains('pd-marked') };`)).value;
  await sleep(600);
  await session.screenshot(path.join(HERE, 'stage-1920-reveal1-reduced.png'));
  res.reducedMotion = rm;
  await session.cdp('Emulation.setEmulatedMedia', { features: [] });
  // positive control for the wave: with motion allowed, chips carry a stepped transition delay
  await session.wipe();
  await session.evaluate(`localStorage.setItem(${JSON.stringify(STORAGE_KEY)}, ${JSON.stringify(seed)}); return true;`);
  await session.nav(stage);
  await sleep(1500);
  await session.evaluate(pressMc);
  await sleep(30);
  res.motionControl = (await session.evaluate(`const cs = [...document.querySelectorAll('.pd-field .pd-chip')]; return { fade: document.querySelector('.pd-field').classList.contains('pd-fade'), delay0: getComputedStyle(cs[0]).transitionDelay, delayLast: getComputedStyle(cs.at(-1)).transitionDelay };`)).value;

  // ---- setup page at 320 and 1280
  const setup = `${BASE}/game/prize-draw/`;
  res.setup = {};
  for (const [w, h] of [[320, 568], [1280, 800]]) {
    await session.nav(setup);
    await session.wipe();
    await session.setWidth(w, h);
    await session.nav(setup);
    await session.setWidth(w, h);
    await sleep(800);
    const names = Array.from({ length: 200 }, (_, i) => `Guest ${i + 1}`).join('\n');
    res.setup[w] = (await session.evaluate(`
      await document.fonts.ready;
      const ta = document.getElementById('pd-names');
      ta.value = ${JSON.stringify(names)};
      ta.dispatchEvent(new Event('input'));
      const controls = [...document.querySelectorAll('main button, main input, main textarea')].filter((e) => e.getBoundingClientRect().width > 0);
      const small = controls.map((e) => ({ id: e.id || e.className, w: Math.round(e.getBoundingClientRect().width), h: Math.round(e.getBoundingClientRect().height) })).filter((r) => r.w < 44 || r.h < 44);
      return { innerWidth, scrollWidth: document.documentElement.scrollWidth, sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth, adSlots: document.querySelectorAll('.ad-slot').length, count: document.getElementById('pd-count').textContent, schedule: ['pd-s0','pd-s1','pd-s2','pd-s3'].map((id) => document.getElementById(id).value || document.getElementById(id).textContent), controls: controls.length, small };
    `)).value;
    await session.screenshot(path.join(HERE, `setup-${w}.png`));
    // the board's error state: after round 2 set above after round 1
    await session.evaluate(`const s = document.getElementById('pd-s2'); s.value = '120'; s.dispatchEvent(new Event('input')); document.getElementById('pd-setup').requestSubmit(); return true;`);
    await sleep(200);
    res.setup[w].error = (await session.evaluate(`return { sched: document.getElementById('pd-sched-msg').textContent, start: document.getElementById('pd-start-msg').textContent, stored: localStorage.getItem(${JSON.stringify(STORAGE_KEY)}) !== null };`)).value;
    await session.screenshot(path.join(HERE, `setup-${w}-schedule-error.png`));
  }
  res.boldW12 = await boldLeg(session, seed, stage);
  res.consoleErrorsAll = [...session.consoleErrors];
  return res;
}
