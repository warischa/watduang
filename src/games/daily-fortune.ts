// Daily Fortune — the phone passes, each player types their own name and reads today's fortune.
// The fortune is a pure function of (normalized name, Asia/Bangkok date): tap again and it is the
// same answer, tomorrow it is a different one. That determinism is what keeps this game distinct
// from siamsi's random group draw (#33, ADR-0002) — it also kills reroll-until-you-like-it and
// makes two phones agree on the same name.
// No checkpoint by design: there is nothing mid-round to persist, so siamsi stays the sole
// checkpoint writer (ADR-0010). The only session write here is markPlayed at reveal.
// The .ts extension in the import path is required for `node --test` (Node does not guess
// extensions) — Vite/tsc accept it.
import type { GameContext, GameModule } from './types.ts';
import { armAllButtons } from './_arm-gate.ts';
import { el } from './_el.ts';

// ---- The draw: pure and calculable, testable with no DOM (see daily-fortune.test.mjs) ----

/** One flat pool, not split by aspect (#33): an aspect split multiplies hand-reviewed items past
 *  what ADR-0011 unlocked, and finance/health sections are exactly where advice-register text leaks
 *  in. Every line describes the fortune and never prescribes a medical, financial or legal act. */
export const FORTUNES: readonly string[] = [
  'วันนี้ดวงเปิดทาง เรื่องที่ค้างมานานจะขยับได้สักที',
  'มีเกณฑ์ได้ข่าวดีจากคนไกล ช่วงบ่ายเป็นต้นไป',
  'ดวงเสน่ห์แรงเป็นพิเศษ ใครเห็นหน้าก็อยากเข้ามาคุยด้วย',
  'ดวงกินดี วันนี้จะได้เจอของอร่อยแบบไม่ได้ตั้งใจ',
  'เรื่องที่คิดว่ายาก วันนี้จะมีคนยื่นมือเข้ามาช่วยโดยไม่ต้องเอ่ยปาก',
  'ดวงโชคลาภมาแบบเล็กๆ ของที่รอมานานจะมาถึงมือแบบไม่ทันตั้งตัว',
  'วันนี้จังหวะเข้าล็อก ไปถึงไหนก็พอดีเวลาไปหมด',
  'คำที่พูดออกไปวันนี้ จะมีคนจำได้นานกว่าที่คิด',
  'ดวงการงานเด่น มีคนมองเห็นสิ่งที่ทำอยู่เงียบๆ มานาน',
  'วันนี้เป็นวันของคนใจดี ยิ่งให้ยิ่งได้กลับมาแบบไม่รู้ตัว',
  'มีคนคิดถึงอยู่ แต่เขายังหาจังหวะทักไม่ถูก',
  'ดวงเดินทางราบรื่น วันนี้ไปไหนก็เจอไฟเขียวไปตลอดสาย',
  'เช้านี้เงียบๆ แต่ตกบ่ายจะมีเรื่องดีแทรกเข้ามาให้ยิ้ม',
  'วันนี้ความคิดแล่นกว่าปกติ ไอเดียที่ตันมานานจะโผล่มาเอง',
  'ดวงมิตรสหายดี วันนี้จะมีคนชวนไปทำอะไรสนุกๆ',
  'เรื่องที่กังวลมาหลายวัน วันนี้จะคลี่คลายเองโดยไม่ต้องออกแรง',
  'ฟ้าวันนี้เปิดให้คนกล้า พูดสิ่งที่อยากพูดออกไปแล้วจะโล่งใจ',
  'ดวงเฮงแบบไม่มีปี่ไม่มีขลุ่ย',
  'วันนี้มีคนอยากชมอยู่ในใจ แต่เขาเขินเกินกว่าจะพูดออกมา',
  'ดวงวันนี้ครึ่งๆ ต้นวันติดขัด ปลายวันคลี่คลาย',
  'วันนี้เป็นวันของการรอ ยิ่งเร่งยิ่งช้า',
  'ของที่หายไปเมื่อวาน จะโผล่มาในที่ที่หาไปแล้วสามรอบ',
  'มีคนกำลังตัดสินใจอะไรบางอย่างที่เกี่ยวกับเรา แต่ยังไม่บอก',
  'ดวงวันนี้เหมือนฟ้าหลังฝน มัวตอนต้น สว่างตอนท้าย',
  'วันนี้จะได้เจอคนหน้าคุ้นในที่ที่ไม่คิดว่าจะเจอ',
  'ถ้าวันนี้ได้ยินเพลงเก่าโดยบังเอิญ แปลว่ามีคนกำลังคิดถึงอยู่',
  'คนรอบตัววันนี้จะเข้าใจเราช้ากว่าปกติ ไม่ใช่เพราะเขาไม่แคร์',
  'ดวงวันนี้ไม่หวือหวา แต่เป็นวันที่ปลอดภัยที่สุดในรอบสัปดาห์',
  'เรื่องเก่าจะย้อนกลับมาให้คิดถึงอีกครั้ง จะยิ้มหรือถอนหายใจก็แล้วแต่ใจ',
  'วันนี้เวลาเดินเร็วกว่าปกติ เผลอแป๊บเดียวก็เย็นแล้ว',
  'ถ้าวันนี้เจอฝนตกแดดออกพร้อมกัน ถือเป็นสัญญาณว่ามาถูกทางแล้ว',
  'มีคนพูดถึงลับหลัง แต่ไม่ใช่เรื่องร้ายอย่างที่กลัว',
  'ดวงวันนี้เงียบ ไม่มีอะไรเข้ามา และนั่นก็เป็นข่าวดีในแบบของมัน',
  'คำตอบที่ตามหาอยู่ วันนี้จะมาจากคนที่ไม่คิดว่าเขาจะรู้เรื่องนี้',
  'วันนี้ใจกับความจริงเดินคนละทาง สิ่งที่รู้สึกจะใหญ่กว่าที่เกิดขึ้นจริง',
  'ดวงวันนี้เหมือนน้ำนิ่ง ดูไม่มีอะไร แต่ข้างใต้กำลังเปลี่ยน',
  'วันนี้ดวงชอบเล่นตลก อะไรที่วางแผนไว้จะสลับที่กันหมด',
  'มีของบางอย่างในบ้านที่วันนี้จะทำให้นึกถึงคนคนหนึ่งขึ้นมา',
  'ระวังปากพาจน วันนี้คำที่หลุดออกไปจะย้อนกลับมาหาตัวเอง',
  'ดวงตกเรื่องของหาย วันนี้วางอะไรไว้ตรงไหนต้องจำให้ดี',
  'วันนี้ใจลอยเป็นพิเศษ อะไรที่ต้องใช้สมาธิจะพลาดง่ายกว่าเดิม',
  'ดวงเหนื่อย วันนี้จะรู้สึกว่าทำเท่าไรก็เหมือนไม่มีใครเห็น',
  'ระวังเสียเวลาไปกับเรื่องที่ไม่ใช่ของตัวเอง',
  'วันนี้อารมณ์ขึ้นลงง่าย เรื่องเล็กจะรู้สึกใหญ่กว่าความจริง',
  'มีคนทำให้ผิดหวังเล็กๆ ในวันนี้ แต่เขาไม่ได้ตั้งใจ',
  'ดวงวันนี้ชนคนหัวร้อน เจอแล้วเดินเลี่ยงดีกว่าเถียง',
  'แผนที่วางไว้วันนี้จะไม่เป็นไปตามนั้น เตรียมใจไว้ก่อนสักนิด',
  'ระวังหลงเชื่อคำที่ฟังดูดีเกินจริงในวันนี้',
  'ดวงติดขัดเรื่องการสื่อสาร วันนี้พิมพ์ไปอย่าง คนอ่านเข้าใจอีกอย่าง',
  'วันนี้จะมีเรื่องกวนใจตอนสาย แต่พอถึงเย็นก็ลืมไปแล้ว',
  'ดวงร้อนรน วันนี้ยิ่งรีบยิ่งพัง ช้าลงสักหน่อยแล้วจะรอด',
  'วันนี้ร่างกายจะบอกว่าเหนื่อยก่อนที่ใจจะยอมรับ',
  'วันนี้เหมือนเดินสวนทางกับดวงตัวเอง อะไรที่เคยง่ายจะกลายเป็นยาก',
];

/** The key half of the seed. Trim + collapse internal whitespace so a padded Thai name and a
 *  double-spaced Thai name behave the same; lowercase so a Latin name typed `"Bank"` / `"bank"`
 *  agrees (a no-op on Thai); NFC so the same Thai word typed on two keyboards hashes the same. */
export function normalizeName(raw: string): string {
  // Zero-width chars are stripped before trim: `\s` does not match them, so a name pasted from
  // LINE or Facebook can carry an invisible U+200B and hash differently from the identical-looking
  // typed name — which would quietly break the "two phones agree" promise above.
  // SARA AM has two spellings that render identically and NFC does not fold: the single \u0E33 (U+0E33)
  // that Thai keyboards emit, and NIKHAHIT + SARA AA (U+0E4D U+0E32) that some PDFs and older
  // systems emit. Names like \u0E19\u0E49\u0E33, \u0E04\u0E33, \u0E17\u0E33 are common enough that leaving this would break the same
  // "two phones agree" promise the zero-width strip below protects.
  return raw
    .normalize('NFC')
    .replace(/\u0E4D\u0E32/g, '\u0E33')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

// Built once — an Intl formatter is expensive, and this one never varies.
const BANGKOK_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Bangkok',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** "Today" as YYYY-MM-DD in Bangkok, never the device's day — two phones in different timezones
 *  must agree on the same name near midnight. Thailand is UTC+7 with no DST.
 *  Known and accepted (#33): at Bangkok midnight the fortune flips mid-read, because nothing is
 *  stored to pin it. That is what "today" promises. */
export function bangkokDate(now: Date = new Date()): string {
  return BANGKOK_DAY.format(now);
}

/** Deterministic pick — same seed, same item, forever. FNV-1a over the seed's UTF-16 units plus an
 *  avalanche finalizer: FNV-1a alone mixes its low bits weakly, and `% pool.length` reads exactly
 *  those, which leaves pool entries unreachable. `>>> 0` before the modulo is load-bearing — a
 *  negative index returns undefined, and every "same seed, same answer" test would still pass.
 *  Exported for row 7 (Love Match), the way short-stick imports pickLoser — one function, no layer. */
export function hashPick<T>(seed: string, pool: readonly T[]): T {
  if (pool.length === 0) throw new Error('hashPick: empty pool, nothing to draw from');
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  return pool[(h >>> 0) % pool.length];
}

/** Today's fortune for a typed name. This is the seam the whole game rests on: both halves of the
 *  seed must be in it — drop the date and it stops being "today", drop the name and everyone in the
 *  group reads the same line. */
export function fortuneFor(name: string, today: string): string {
  return hashPick(`${normalizeName(name)}|${today}`, FORTUNES);
}

// ---- Current screen state (one game per page) ----

let cleanup: Array<() => void> = [];
let stageEl: HTMLElement | null = null;
let gameCtx: GameContext | null = null;

// ponytail: `cleanup` grows across ask↔result cycles instead of being drained per render, so the
// removal closures pin detached nodes until dispose(). Bounded and released on every game switch —
// a whole party night is ~100 cycles. Drain it per render only if a profile says to; doing it blind
// risks dropping a listener that is registered once in mount() rather than per render.
function on(target: EventTarget, type: string, handler: EventListener): void {
  target.addEventListener(type, handler);
  cleanup.push(() => target.removeEventListener(type, handler));
}

// ---- Screens ----
// 320px: every size comes off the viewport, never a constant, and the fortune line wraps instead of
// pushing the stage sideways.
const INPUT_STYLE = 'width:min(100%,20rem);font-size:1.1rem;padding:0.6rem;box-sizing:border-box';
const CHIPS_STYLE = 'display:flex;flex-wrap:wrap;gap:0.5rem;justify-content:center;margin:0.75rem 0';
const FORTUNE_STYLE =
  'font-size:clamp(1.15rem,5.5vw,1.6rem);font-weight:700;line-height:1.7;overflow-wrap:anywhere';
const NAME_STYLE = 'font-size:1.25rem;font-weight:700;overflow-wrap:anywhere';

/** The typed name as it should be shown back — same whitespace cleanup as the seed, but the
 *  player's own capitalisation is theirs to keep. */
function displayName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

function renderAsk(hint?: string): void {
  const stage = stageEl;
  if (!stage) return;
  stage.replaceChildren();

  stage.appendChild(el('p', 'ส่งมือถือให้เจ้าตัวพิมพ์ชื่อเอง แล้วกดดูดวงวันนี้'));

  // A real <form> so Enter on the keyboard submits — no keydown handler needed.
  const form = el('form', undefined, 'margin:0.5rem 0');
  const input = el('input', undefined, INPUT_STYLE);
  input.id = 'df-name';
  input.type = 'text';
  input.maxLength = 24;
  input.autocomplete = 'off';
  input.placeholder = 'พิมพ์ชื่อของคุณ';
  input.setAttribute('aria-label', 'ชื่อของคุณ');
  form.appendChild(input);

  const go = el('button', 'ดูดวงวันนี้', 'margin-top:0.75rem');
  go.id = 'df-go';
  go.type = 'submit';
  form.appendChild(go);

  on(form, 'submit', (event) => {
    event.preventDefault();
    reveal(input.value);
  });
  stage.appendChild(form);

  if (hint) stage.appendChild(el('p', hint));

  // The setup panel already collected the group — offer those names as one tap instead of retyping.
  const names = [...new Set(gameCtx?.session.players ?? [])];
  const chipEls: HTMLButtonElement[] = [];
  if (names.length > 0) {
    stage.appendChild(el('p', 'หรือแตะชื่อในวงได้เลย'));
    const chips = el('div', undefined, CHIPS_STYLE);
    for (const name of names) {
      const chip = el('button', name);
      chip.type = 'button';
      on(chip, 'click', () => reveal(name));
      chipEls.push(chip);
      chips.appendChild(chip);
    }
    stage.appendChild(chips);
  }

  // Exception (owner's call, not a judgement call to re-litigate): the roster chips are exempt from
  // the gate. renderResult's "another" button remounts straight into this screen under the same
  // finger that just tapped it — the chips exist precisely so that one operator can tap through the
  // roster fast, chip after chip. Gating them would break that real play pattern. "go" (df-go) is a
  // different finger's action (typed a name first) and stays gated like every other control here.
  cleanup.push(armAllButtons(stage, chipEls));
}

function renderResult(name: string, now: Date): void {
  const stage = stageEl;
  if (!stage) return;
  stage.replaceChildren();

  // Same `now` that seeded the fortune — two `new Date()` calls could straddle Bangkok midnight and
  // print a date that contradicts the line below it.
  const shown = new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'long' }).format(now);
  stage.appendChild(el('p', `ดวงประจำวันที่ ${shown}`));
  stage.appendChild(el('p', `ดวงวันนี้ของ ${displayName(name)}`, NAME_STYLE));
  stage.appendChild(el('p', fortuneFor(name, bangkokDate(now)), FORTUNE_STYLE));
  stage.appendChild(el('p', 'กดกี่ครั้งวันนี้ก็ได้ดวงเดิม พรุ่งนี้ค่อยมาดูใหม่ เดี๋ยวดวงเปลี่ยน'));

  const another = el('button', 'ดูดวงคนต่อไป');
  another.id = 'df-again';
  another.type = 'button';
  on(another, 'click', () => renderAsk());
  stage.appendChild(another);

  // The tap that revealed this screen swaps it in under the same finger, so a ghost second contact
  // would land on "ดูดวงคนต่อไป" and skip straight past the fortune nobody read yet.
  cleanup.push(armAllButtons(stage));
  // No link to /games/ here, on purpose: #stage holds no navigation target in any game. Every screen
  // arrives via stage.replaceChildren() under the finger that triggered it, so an anchor placed here
  // lands at a coordinate the finger just used and a double-tap leaves the round (measured in this
  // game: the hub sat 26px INSIDE the tapped chip's box, capture 34/15). The page's crawlable
  // /games/ link is static chrome in src/layouts/GameLayout.astro, above #stage where no re-render
  // can move it.
}

function reveal(raw: string): void {
  if (normalizeName(raw) === '') {
    renderAsk('ใส่ชื่อก่อนนะ ถึงจะดูดวงวันนี้ได้');
    return;
  }
  gameCtx?.session.markPlayed('daily-fortune');
  renderResult(raw, new Date());
}

function mountInto(stage: HTMLElement, ctx: GameContext): void {
  stageEl = stage;
  gameCtx = ctx;
  renderAsk();
}

function teardown(): void {
  cleanup.forEach((fn) => fn());
  cleanup = [];
  stageEl?.replaceChildren();
  stageEl = null;
  gameCtx = null;
}

const game: GameModule = {
  id: 'daily-fortune',
  names: { th: 'วัดดวงวันนี้', en: 'Daily Fortune' },
  category: 'fortune',
  players: [2, 10],
  keywords: ['ดวงวันนี้', 'วัดดวงวันนี้', 'ดูดวงรายวัน', 'คำทำนายวันนี้', 'เกมส่งมือถือ', 'เกมเล่นบนเครื่องเดียว'],
  tagline: 'ใส่ชื่อแล้วรู้ดวงวันนี้ทันที วันนี้กดกี่ครั้งก็ดวงเดิม',
  seo: {
    title: 'วัดดวงวันนี้ — ใส่ชื่อดูคำทำนายประจำวัน เล่นฟรีบนเครื่องเดียว',
    description:
      'ส่งมือถือวนให้ทุกคนพิมพ์ชื่อตัวเอง แล้วดูคำทำนายดวงวันนี้ของแต่ละคน ชื่อเดิมในวันเดิมได้คำทำนายเดิมเสมอ พรุ่งนี้ค่อยเปลี่ยนใหม่ เล่นได้ 2-10 คน ไม่ต้องโหลดแอป ไม่ต้องสมัคร',
    steps: [
      'ส่งมือถือให้คนแรก พิมพ์ชื่อตัวเองลงไป',
      'กด "ดูดวงวันนี้" แล้วอ่านคำทำนายของตัวเองให้วงฟัง',
      'กด "ดูดวงคนต่อไป" แล้วส่งมือถือให้คนถัดไปพิมพ์ชื่อบ้าง',
      'วันนี้กดซ้ำกี่ครั้งก็ได้คำทำนายเดิม พรุ่งนี้กลับมาดูใหม่ได้ดวงใหม่',
    ],
  },
  og: 'daily-fortune.png',
  ads: false, // play screen = never an ad slot

  mount(stage: HTMLElement, ctx: GameContext) {
    mountInto(stage, ctx);
  },

  dispose() {
    teardown();
  },
};

export default game;
