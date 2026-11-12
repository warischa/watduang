// gh#304 round-2 CSS spot-fixes, measured in a real browser through scripts/driver.mjs (CDP_PORT=9335, dist
// served on 4324). Prints one JSON object; screenshots land beside this file, named by TAG.
//   TAG=before|after  (the build under test; labels the output and the screenshots only)
//
// (a) the projector's result screen at 1920x1080 with 'ฒำ' x12 as the first prize's winner and a second
//     12-cluster wide name on a result card: the name box must wrap (nm-wrap, white-space normal), and the
//     name must lie inside its box and the frame on both axes (nothing clips), and above the next block.
// (b) the category page at 1440: the event card's title and body computed font sizes.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../..');
const { createEvent, encodeEvent, drawNext, revealDrawn, advance, decodeEvent, STORAGE_KEY } = await import(path.join(ROOT, 'src/prize-event/event.ts'));
const { proposeSchedule } = await import(path.join(ROOT, 'src/prize-draw/schedule.ts'));
const BASE = process.env.BASE || 'http://localhost:4324';
const TAG = process.env.TAG || 'run';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const WIDE_FIRST = 'ฒำ'.repeat(12);
const WIDE_CARD = 'ญำ'.repeat(12);

// A seeded rng, so the walk is the same on every run; the final order is then set by hand.
function seededRng() {
  let n = 7;
  const float = () => ((n = (n * 1103515245 + 12345) % 2147483648) / 2147483648);
  return { float, int: (k) => Math.floor(float() * k), hex: (b) => Array.from({ length: b }, () => Math.floor(float() * 256).toString(16).padStart(2, '0')).join('') };
}

// An event walked to its end: all four cuts revealed, the final drawn and revealed.
function resultEvent() {
  const rng = seededRng();
  const names = Array.from({ length: 40 }, (_, i) => `Guest ${i + 1}`);
  let s = createEvent({ eventName: 'ปาร์ตี้ปีใหม่ 2570', names, schedule: proposeSchedule(40), prizes: ['ทีวี 55 นิ้ว', 'จักรยานไฟฟ้า', 'หม้อทอดไร้น้ำมัน', 'เครื่องชงกาแฟ', 'หูฟังไร้สาย'] }, rng);
  for (;;) {
    s = drawNext(s, rng);
    s = revealDrawn(s);
    if (s.final) break;
    s = advance(s);
  }
  // The cuts only keep ids, so two of the five finalists are renamed to the wide names: they are then the
  // first and second prize's winners of a state the app itself walked to its end.
  const [first, second] = s.final.order;
  const people = s.setup.people.map((p) => (p.id === first ? { ...p, name: WIDE_FIRST } : p.id === second ? { ...p, name: WIDE_CARD } : p));
  const state = { ...s, setup: { ...s.setup, people } };
  return { state, haveWide: decodeEvent(encodeEvent(state)) !== null };
}

const READ_RESULT = `
  await document.fonts.ready;
  const frame = document.getElementById('pd-frame');
  const scaled = frame.closest('.pd-scaled');
  const scale = parseFloat(getComputedStyle(scaled).getPropertyValue('--pd-scale')) || 1;
  const fr = frame.getBoundingClientRect();
  const wc = document.querySelector('.pd-wcards');
  const out = { screen: frame.getAttribute('data-screen'), scale, frame: { w: Math.round(fr.width / scale), h: Math.round(fr.height / scale) }, boxes: [] };
  for (const box of document.querySelectorAll('.pd-wn')) {
    const run = box.firstElementChild;
    const cs = getComputedStyle(box);
    const br = box.getBoundingClientRect();
    const rects = [...run.getClientRects()];
    const left = Math.min(...rects.map((r) => r.left));
    const right = Math.max(...rects.map((r) => r.right));
    const top = Math.min(...rects.map((r) => r.top));
    const bottom = Math.max(...rects.map((r) => r.bottom));
    const lines = new Set(rects.map((r) => Math.round(r.top / scale))).size;
    const u = (v) => Math.round(v / scale * 10) / 10;
    // Horizontal: the name's line rects against the box's content box and the frame. Vertical: the box is
    // what holds the wrapped lines (it has no fixed height), so it is the box that must lie inside the
    // frame and stop above the next block. The run's own inline rect is not used vertically: it is the
    // font's content area, taller than the line box, and reads 10px "over" on a one-line Guest name too.
    const room = box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    out.boxes.push({
      name: run.textContent,
      px: parseFloat(cs.fontSize),
      floor: Number(box.dataset.fitFloor),
      wrapClass: box.classList.contains('nm-wrap'),
      whiteSpace: cs.whiteSpace,
      lines,
      box: { w: u(br.width), h: u(br.height), room },
      runWidth: u(right - left),
      overBoxX: { left: u(br.left + parseFloat(cs.paddingLeft) * scale - left), right: u(right - (br.right - parseFloat(cs.paddingRight) * scale)) },
      overFrameX: { left: u(fr.left - left), right: u(right - fr.right) },
      boxOverFrameY: { top: u(fr.top - br.top), bottom: u(br.bottom - fr.bottom) },
      scrollOverflowRaw: { x: box.scrollWidth - box.clientWidth, y: box.scrollHeight - box.clientHeight },
      belowGap: box.closest('.pd-spot') && wc ? u(wc.getBoundingClientRect().top - br.bottom) : null,
    });
  }
  const eps = 0.6;
  out.clips = out.boxes.filter((b) => b.overBoxX.left > eps || b.overBoxX.right > eps || b.overFrameX.left > eps || b.overFrameX.right > eps
    || b.boxOverFrameY.top > eps || b.boxOverFrameY.bottom > eps || (b.belowGap !== null && b.belowGap < 0)).map((b) => b.name);
  const wide = (b) => b.name.includes('ำ');
  out.notWrapped = out.boxes.filter((b) => wide(b) && (b.lines < 2 || !b.wrapClass || b.whiteSpace === 'nowrap' || b.whiteSpace === 'pre')).map((b) => b.name);
  out.controlWrapped = out.boxes.filter((b) => !wide(b) && (b.lines !== 1 || b.wrapClass)).map((b) => b.name);
  return out;
`;

const READ_CARD = `
  await document.fonts.ready;
  const card = document.querySelector('.game-card-event');
  if (!card) return { found: false };
  const h3 = card.querySelector('h3');
  const p = card.querySelector('p');
  return { found: true, innerWidth, scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth,
    h3: { text: h3.textContent, fontSize: getComputedStyle(h3).fontSize }, p: { fontSize: getComputedStyle(p).fontSize }, cardWidth: Math.round(card.getBoundingClientRect().width) };
`;

export default async function run(session) {
  const res = { tag: TAG };
  const { state, haveWide } = resultEvent();
  res.seed = { haveWide, at: state.at, rounds: state.rounds.length, final: Boolean(state.final) };
  const stage = `${BASE}/game/prize-draw/play/`;
  await session.nav(stage);
  await session.wipe();
  await session.evaluate(`localStorage.setItem(${JSON.stringify(STORAGE_KEY)}, ${JSON.stringify(encodeEvent(state))}); return true;`);
  await session.setWidth(1920, 1080);
  await session.nav(stage);
  await session.setWidth(1920, 1080);
  await sleep(1800);
  res.viewport = (await session.evaluate('return { w: innerWidth, h: innerHeight };')).value;
  res.result = (await session.evaluate(READ_RESULT)).value;
  await session.screenshot(path.join(HERE, `gh304-fix-stage-result-1920-${TAG}.png`));

  await session.nav(`${BASE}/c/company-party/`);
  await session.setWidth(1440, 900);
  await session.nav(`${BASE}/c/company-party/`);
  await session.setWidth(1440, 900);
  await sleep(800);
  res.category = (await session.evaluate(READ_CARD)).value;
  await session.screenshot(path.join(HERE, `gh304-fix-category-1440-${TAG}.png`));
  res.consoleErrors = [...session.consoleErrors];
  return res;
}
