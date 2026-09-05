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
// The result screen below is the approved design (design/GameDailyFortune.dc.html); its styles live in
// src/styles/games/daily-fortune.css under the `df-` prefix. The card owns its height — no fixed height,
// no overflow — so the longest fortune in the pool renders in full instead of clipping or scrolling.
const INPUT_STYLE = 'width:min(100%,20rem);font-size:1.1rem;padding:0.6rem;box-sizing:border-box';
const CHIPS_STYLE = 'display:flex;flex-wrap:wrap;gap:0.5rem;justify-content:center;margin:0.75rem 0';

// Inline art, byte-exact from the canvas — drawn, never an image. `stroke` references the token the way
// pick-loser's burst does: presentation attributes resolve var() (here --color-line-strong, the canvas's #1a1a1a).
const SUN_SVG =
  '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--color-line-strong)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<circle cx="12" cy="12" r="4.5"></circle>' +
  '<path d="M12 2v2.5"></path><path d="M12 19.5V22"></path>' +
  '<path d="M4.2 4.2l1.8 1.8"></path><path d="M18 18l1.8 1.8"></path>' +
  '<path d="M2 12h2.5"></path><path d="M19.5 12H22"></path>' +
  '<path d="M4.2 19.8L6 18"></path><path d="M18 6l1.8-1.8"></path></svg>';

const CLOCK_SVG =
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-line-strong)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path></svg>';

/** The typed name as it should be shown back — same whitespace cleanup as the seed, but the
 *  player's own capitalisation is theirs to keep. */
function displayName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

function renderAsk(hint?: string): void {
  const stage = stageEl;
  if (!stage) return;
  stage.replaceChildren();
  // The ask screen keeps the stage in block flow (its input width is min(100%, 20rem), which only
  // behaves in block flow) — the result screen is the one that opts into .stage-screen.
  stage.className = '';

  stage.appendChild(el('p', 'พิมพ์ชื่อแล้วกดดูดวงวันนี้ ชื่อเดิมวันเดิมได้ดวงเดิมเสมอ'));

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
    stage.appendChild(el('p', 'หรือแตะชื่อที่เคยพิมพ์ไว้ได้เลย'));
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
  // The result screen opts into the shared shell layout (.stage-screen) so the card spans full width
  // on the accent ground the play-area already paints. `now` is the single instant the hash uses, so
  // rendering must not call new Date() again — a Bangkok-midnight straddle would then hash a day the
  // reveal did not seal.
  stage.className = 'stage-screen';

  const heading = el('span', 'คำทำนายวันนี้');
  heading.className = 'df-heading';
  stage.appendChild(heading);

  // The hero motif: the fortune card. It owns its height — no fixed height, no overflow — so the
  // longest line in the pool fits without clipping or scrolling. Direct children in canvas order.
  const card = document.createElement('div');
  card.className = 'df-fortune-card';

  const nameRow = document.createElement('div');
  nameRow.className = 'df-card-name-row';
  const sun = document.createElement('span');
  sun.className = 'df-card-sun';
  sun.innerHTML = SUN_SVG;
  const cardName = el('span', displayName(name));
  cardName.className = 'df-card-name';
  nameRow.appendChild(sun);
  nameRow.appendChild(cardName);
  card.appendChild(nameRow);

  const rule = document.createElement('div');
  rule.className = 'df-card-rule';
  card.appendChild(rule);

  const fortune = el('p', fortuneFor(name, bangkokDate(now)));
  fortune.className = 'df-fortune-text';
  card.appendChild(fortune);

  stage.appendChild(card);

  const foot = el('p', 'ดวงของวันนี้ เฉพาะชื่อนี้เท่านั้น');
  foot.className = 'df-foot';
  stage.appendChild(foot);

  // Primary control + hint chip, grouped at the canvas's 10px gap (the shell's 22px gap is not a
  // declared lever, so the group is its own flex column). No anchor enters #stage on this screen any
  // more than on any other (ADR-0014).
  const actions = document.createElement('div');
  actions.className = 'df-actions';

  const another = el('button', 'ดูดวงชื่ออื่น');
  another.id = 'df-again';
  another.type = 'button';
  another.className = 'game-btn game-btn-primary';
  on(another, 'click', () => renderAsk());
  actions.appendChild(another);

  const hint = document.createElement('div');
  hint.className = 'df-hint';
  const clock = document.createElement('span');
  clock.className = 'df-hint-clock';
  clock.innerHTML = CLOCK_SVG;
  const hintText = el('span', 'กดกี่ครั้งวันนี้ก็ได้ดวงเดิม พรุ่งนี้ค่อยมาดูใหม่');
  hintText.className = 'df-hint-text';
  hint.appendChild(clock);
  hint.appendChild(hintText);
  actions.appendChild(hint);

  stage.appendChild(actions);

  // The tap that revealed this screen swaps it in under the same finger, so a ghost second contact
  // would land on "ดูดวงคนต่อไป" and skip straight past the fortune nobody read yet. No outbound
  // link here — #stage holds no navigation target in any game (ADR-0014); the page's crawlable
  // link is static chrome in src/layouts/GameLayout.astro, above #stage where no re-render can move it.
  cleanup.push(armAllButtons(stage));
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
  names: { th: 'ดวงวันนี้', en: 'Daily Fortune' },
  category: 'fortune',
  // gh#96 / ADR-0040 — the proving page of the solo class: one person, one answer, no panel. The
  // party-facing screens this module still renders are the gap ADR-0040 names until the redesign
  // ticket replaces its content; the shape is legal and mounts without a start event today.
  players: [1, 1],
  // One person, one answer, no rounds (ADR-0040) — there is nothing to lose by navigating away, and
  // that is why the leave-confirm must stay silent here. Never announce a round from this file.
  startsRound: false,
  keywords: ['ดวงวันนี้', 'วัดดวงวันนี้', 'ดูดวงรายวัน', 'คำทำนายวันนี้', 'เกมเล่นบนเครื่องเดียว'],
  tagline: 'ใส่ชื่อแล้วรู้ดวงวันนี้ทันที วันนี้กดกี่ครั้งก็ดวงเดิม',
  seo: {
    title: 'ดวงวันนี้ — ใส่ชื่อดูคำทำนายประจำวัน เล่นฟรีบนเครื่องเดียว',
    description:
      'พิมพ์ชื่อแล้วดูคำทำนายดวงวันนี้ของชื่อนั้น ชื่อเดิมในวันเดิมได้คำทำนายเดิมเสมอ พรุ่งนี้ค่อยเปลี่ยนใหม่ ไม่ต้องโหลดแอป ไม่ต้องสมัคร',
    steps: [
      'พิมพ์ชื่อของตัวเองลงไป',
      'กด "ดูดวงวันนี้" แล้วอ่านคำทำนายที่ได้',
      'อยากดูชื่ออื่นอีก กด "ดูดวงชื่ออื่น" แล้วพิมพ์ชื่อใหม่',
      'วันนี้กดซ้ำกี่ครั้งก็ได้คำทำนายเดิม พรุ่งนี้กลับมาดูใหม่ได้ดวงใหม่',
    ],
  },
  og: 'daily-fortune.png',
  // gh#82 — the how-to-play prose below the stage is ad inventory, per issue #13's amendment 8:
  // the decision was no slot on the PLAY SCREEN, never no slot on the page.
  ads: true,

  mount(stage: HTMLElement, ctx: GameContext) {
    mountInto(stage, ctx);
  },

  dispose() {
    teardown();
  },
};

export default game;
