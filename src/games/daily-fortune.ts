// Daily Fortune (gh#99) — one press, three everyday things that happen to you today, and a verdict.
// Not a reading and not a horoscope: the register is harmless, ordinary and reversed, something
// happens and then it tips. The page says so above the press, because people who searched for a
// real horoscope land here.
// The three lines are drawn one per pool from three pools that never overlap, so no two lines are
// about the same thing and the pools can never assemble a nonsense pair. Each line carries a luck
// value of +1, 0 or -1; the verdict is the sum of the three and is never authored per combination.
// What the per-name reading left behind: the Bangkok-day helper, which is what makes the word
// "today" true on this page, and hashPick/normalizeName, which love-match imports from here.
// No checkpoint by design: there is nothing mid-round to persist, so siamsi stays the sole
// checkpoint writer (ADR-0010). The only session write here is markPlayed at the draw.
// The .ts extension in the import path is required for `node --test` (Node does not guess
// extensions) — Vite/tsc accept it.
import type { GameContext, GameModule } from './types.ts';
import { armAllButtons } from './_arm-gate.ts';
import { el } from './_el.ts';

// ---- The draw: pure and calculable, testable with no DOM (see daily-fortune.test.mjs) ----

export type Luck = -1 | 0 | 1;

export interface FortuneLine {
  readonly text: string;
  readonly luck: Luck;
}

export interface FortunePool {
  readonly key: 'eat' | 'money' | 'travel';
  /** The chip shown beside the line, so a reader can see the three are about different things. */
  readonly label: string;
  readonly lines: readonly FortuneLine[];
}

/** Three pools that never overlap. A starter set of four lines each — filling the pools is its own
 *  ticket. Two rules bind every line: it describes something ordinary and harmless that tips, and
 *  it predicts no injury, no illness, no legal trouble and no amount of money. Ordering is
 *  load-bearing for the tests only in that every pool opens on a +1 and closes on a -1, so a rigged
 *  draw can reach both ends of the verdict range. */
export const POOLS: readonly FortunePool[] = [
  {
    key: 'eat',
    label: 'กิน',
    lines: [
      { text: 'สั่งเมนูที่ธรรมดาที่สุดในร้าน วันนี้ดันอร่อยจนอยากสั่งซ้ำ', luck: 1 },
      { text: 'สั่งไข่ดาว จะได้ไข่เจียว แต่อร่อยกว่าที่สั่งไว้', luck: 0 },
      { text: 'ชานมที่สั่งหวานน้อย จะมาเป็นหวานปกติ แต่วันนี้ดันอยากกินหวานพอดี', luck: 0 },
      { text: 'กัดขนมคำแรก ไส้จะทะลักลงบนเสื้อตัวที่เพิ่งซัก', luck: -1 },
    ],
  },
  {
    key: 'money',
    label: 'เงิน',
    lines: [
      { text: 'ล้วงกระเป๋าเสื้อตัวเก่า จะเจอแบงก์ที่ลืมไปแล้วว่าเคยมี', luck: 1 },
      { text: 'ของที่รอลดราคามานาน วันนี้ลดจริง แต่เหลือสีที่ไม่ได้อยากได้', luck: 0 },
      { text: 'ตั้งใจว่าวันนี้จะไม่ควักเงินเลย สุดท้ายได้เท่าทุนพอดี ไม่ขาดไม่เกิน', luck: 0 },
      { text: 'เจอเงินตกข้างถนน แต่มีคนหยิบตัดหน้าไปก่อนหนึ่งก้าว', luck: -1 },
    ],
  },
  {
    key: 'travel',
    label: 'ทาง',
    lines: [
      { text: 'เดินไปถึงป้ายพอดี รถมาจอดตรงหน้าเหมือนนัดกันไว้', luck: 1 },
      { text: 'ออกจากบ้านเร็วกว่าเดิมสิบนาที แล้วไปถึงเวลาเดิมเป๊ะ', luck: 0 },
      { text: 'ไปถึงหน้าลิฟต์ตอนประตูเพิ่งปิด แต่อีกฝั่งเปิดรออยู่พอดี', luck: 0 },
      { text: 'ลืมพกร่ม ฝนจะตกตอนออกจากบ้าน แล้วหยุดตอนถึงที่หมาย', luck: -1 },
    ],
  },
];

/** One press: exactly one line from each pool, in pool order. Drawing per pool — rather than three
 *  picks out of one flat pool — is what makes "never two about the same thing" true by construction
 *  instead of by luck. `rand` is injected so the tests never touch Math.random. */
export function drawFortune(rand: () => number = Math.random): readonly FortuneLine[] {
  return POOLS.map((pool) => pool.lines[Math.floor(rand() * pool.lines.length)]!);
}

export function luckSum(lines: readonly { luck: Luck }[]): number {
  return lines.reduce((sum, line) => sum + line.luck, 0);
}

/** Five bands over the -3..+3 the three luck values can sum to. The ends double up (-3 with -2,
 *  +3 with +2) because all-three-the-same is rare and deserves the same punchline as near-miss. */
export function verdictFor(sum: number): string {
  if (sum >= 2) return 'จักรวาลเข้าข้างแบบเงียบๆ';
  if (sum === 1) return 'ดวงดีนิดๆ พอให้ยิ้มได้';
  if (sum === 0) return 'เสมอตัว ได้อย่างเสียอย่าง';
  if (sum === -1) return 'ดวงแป้กเบาๆ แต่ยังไหว';
  return 'จักรวาลแกล้งเล่นๆ แต่ไม่เจ็บตัว';
}

/** The luck glyph the canvas draws beside each line: "+" is luck, "-" is misfortune, "~" is the
 *  reversal. Same three values the verdict sums. */
function luckGlyph(luck: Luck): string {
  return luck === 1 ? '+' : luck === -1 ? '-' : '~';
}

/** Kept because love-match.ts imports it from this module — the name entry it was written for is
 *  gone from this page. Trim + collapse internal whitespace, lowercase, NFC. */
export function normalizeName(raw: string): string {
  // Zero-width chars are stripped before trim: `\s` does not match them, so a name pasted from
  // LINE or Facebook can carry an invisible U+200B and hash differently from the identical-looking
  // typed name.
  // SARA AM has two spellings that render identically and NFC does not fold: the single SARA AM (U+0E33)
  // that Thai keyboards emit, and NIKHAHIT + SARA AA (U+0E4D U+0E32) that some PDFs and older
  // systems emit.
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

/** "Today" as YYYY-MM-DD in Bangkok, never the device's day. Thailand is UTC+7 with no DST.
 *  Known and accepted: at Bangkok midnight the page's date flips mid-read, because nothing is
 *  stored to pin it. That is what "today" promises. */
export function bangkokDate(now: Date = new Date()): string {
  return BANGKOK_DAY.format(now);
}

const THAI_WEEKDAYS = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
const THAI_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

/** The date pill, formatted from the Bangkok day string and nothing else — so the shown date can
 *  never disagree with the day the page calls today. Written by hand rather than with a th-TH
 *  formatter because `weekday: 'short'` renders the full weekday name on Node's ICU and the
 *  abbreviation on a browser's, and the canvas wants the abbreviation. */
export function thaiDayLabel(bangkokDay: string): string {
  const [year, month, day] = bangkokDay.split('-').map(Number) as [number, number, number];
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return `${THAI_WEEKDAYS[weekday]} ${day} ${THAI_MONTHS[month - 1]}`;
}

/** Deterministic pick — same seed, same item, forever. FNV-1a over the seed's UTF-16 units plus an
 *  avalanche finalizer: FNV-1a alone mixes its low bits weakly, and `% pool.length` reads exactly
 *  those, which leaves pool entries unreachable. `>>> 0` before the modulo is load-bearing — a
 *  negative index returns undefined. Exported for row 7 (Love Match), the way short-stick imports
 *  pickLoser — one function, no layer. This page no longer uses it: nothing here is seeded. */
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
  return pool[(h >>> 0) % pool.length]!;
}

// ---- Current screen state (one game per page) ----

let cleanup: Array<() => void> = [];
let stageEl: HTMLElement | null = null;
let gameCtx: GameContext | null = null;

// ponytail: `cleanup` grows across idle-result cycles instead of being drained per render, so the
// removal closures pin detached nodes until dispose(). Bounded and released on every game switch.
// Drain it per render only if a profile says to; doing it blind risks dropping a listener that is
// registered once in mount() rather than per render.
function on(target: EventTarget, type: string, handler: EventListener): void {
  target.addEventListener(type, handler);
  cleanup.push(() => target.removeEventListener(type, handler));
}

// ---- Screens ----
// Both screens are the approved canvases design/DuangTodayIdle.dc.html and
// design/DuangTodayResult.dc.html (ADR-0033); their styles live in src/styles/games/daily-fortune.css
// under the `df-` prefix. The canvas puts the date pill in the page header next to a back link —
// the link is shell chrome and an anchor may never enter the stage (ADR-0014), so the pill renders
// as the first row inside the stage instead.

// Inline art, drawn and never an image: the winking sun says the page is a joke in the drawing and
// not only in the copy. `stroke` references the token the way pick-loser's burst does: presentation
// attributes resolve var() (here --color-line-strong, the canvas's #1a1a1a).
const WINK_SUN_SVG =
  '<svg width="150" height="150" viewBox="0 0 150 150" fill="none" aria-hidden="true">' +
  '<circle cx="75" cy="75" r="34" fill="var(--page-accent)" stroke="var(--color-line-strong)" stroke-width="3"></circle>' +
  '<path d="M75 18 v-12 M75 132 v12 M18 75 h-12 M132 75 h12 M35 35 l-9-9 M115 35 l9-9 M35 115 l-9 9 M115 115 l9 9" ' +
  'stroke="var(--color-line-strong)" stroke-width="3" stroke-linecap="round"></path>' +
  '<path d="M64 70 q4 -5 8 0" stroke="var(--color-line-strong)" stroke-width="3" stroke-linecap="round"></path>' +
  '<circle cx="86" cy="70" r="2.6" fill="var(--color-line-strong)"></circle>' +
  '<path d="M65 85 q10 8 20 0" stroke="var(--color-line-strong)" stroke-width="3" stroke-linecap="round"></path></svg>';

function datePill(now: Date): HTMLElement {
  const pill = el('span', thaiDayLabel(bangkokDate(now)));
  pill.className = 'df-date';
  const row = document.createElement('div');
  row.className = 'df-date-row';
  row.appendChild(pill);
  return row;
}

function renderIdle(): void {
  const stage = stageEl;
  if (!stage) return;
  stage.replaceChildren();
  stage.className = 'stage-screen';

  stage.appendChild(datePill(new Date()));

  const art = document.createElement('div');
  art.className = 'df-art';
  art.innerHTML = WINK_SUN_SVG;
  stage.appendChild(art);

  const headline = el('span', 'วันนี้คุณจะเจอกับอะไร');
  headline.className = 'df-headline';
  stage.appendChild(headline);

  // Above the press on purpose: someone who searched for a real horoscope should learn what this
  // page is before they scroll, not after they feel tricked.
  const joke = el('p', 'ดวงขำๆ เรื่องจิ๊บจ๊อยประจำวัน ไม่ต้องเชื่อ กดแล้วรู้เลย');
  joke.className = 'df-joke';
  stage.appendChild(joke);

  const go = el('button', 'เปิดดวงวันนี้');
  go.id = 'df-go';
  go.type = 'button';
  go.className = 'game-btn game-btn-primary';
  on(go, 'click', () => draw());
  stage.appendChild(go);

  const foot = el('p', 'อยากได้คำทำนายจริงจัง ไปเสี่ยงเซียมซี');
  foot.className = 'df-foot';
  stage.appendChild(foot);

  cleanup.push(armAllButtons(stage));
}

function renderResult(lines: readonly FortuneLine[], now: Date): void {
  const stage = stageEl;
  if (!stage) return;
  stage.replaceChildren();
  // `now` is the single instant the date pill uses, so rendering must not call new Date() again —
  // a Bangkok-midnight straddle would then show a day the draw did not seal.
  stage.className = 'stage-screen';

  stage.appendChild(datePill(now));

  // The verdict is the punchline and the screenshot. Derived, never authored per combination.
  const verdictCard = document.createElement('div');
  verdictCard.className = 'df-verdict-card';
  const verdictLabel = el('span', 'ดวงวันนี้ประมาณว่า');
  verdictLabel.className = 'df-verdict-label';
  const verdict = el('p', verdictFor(luckSum(lines)));
  verdict.className = 'df-verdict';
  verdictCard.appendChild(verdictLabel);
  verdictCard.appendChild(verdict);
  stage.appendChild(verdictCard);

  const list = document.createElement('div');
  list.className = 'df-lines';
  lines.forEach((line, index) => {
    const row = document.createElement('div');
    row.className = 'df-line';
    const cat = el('span', POOLS[index]!.label);
    cat.className = 'df-line-cat';
    const text = el('p', line.text);
    text.className = 'df-line-text';
    const glyph = el('span', luckGlyph(line.luck));
    glyph.className = line.luck === 0 ? 'df-line-luck df-luck-flip' : 'df-line-luck';
    row.appendChild(cat);
    row.appendChild(text);
    row.appendChild(glyph);
    list.appendChild(row);
  });
  stage.appendChild(list);

  const again = el('button', 'เปิดใหม่อีกที');
  again.id = 'df-again';
  again.type = 'button';
  again.className = 'game-btn game-btn-primary';
  on(again, 'click', () => draw());
  stage.appendChild(again);

  const foot = el('p', 'กดใหม่ได้เรื่อยๆ ดวงนี้ไม่จริงจังอยู่แล้ว');
  foot.className = 'df-foot';
  stage.appendChild(foot);

  // The press that revealed this screen swaps it in under the same finger, so a ghost second
  // contact would land on the redraw and skip the fortune nobody read yet. No outbound link here —
  // the stage holds no navigation target in any game (ADR-0014); the page's crawlable link is
  // static chrome in src/layouts/GameLayout.astro, above the stage where no re-render can move it.
  cleanup.push(armAllButtons(stage));
}

function draw(): void {
  gameCtx?.session.markPlayed('daily-fortune');
  renderResult(drawFortune(), new Date());
}

function mountInto(stage: HTMLElement, ctx: GameContext): void {
  stageEl = stage;
  gameCtx = ctx;
  renderIdle();
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
  // gh#96 / ADR-0040 — the proving page of the solo class: one person, one answer, no panel, and
  // since gh#99 no name entry and no roster either. Nothing on this page asks who is playing.
  players: [1, 1],
  renderer: 'dom',
  // One person, one answer, no rounds (ADR-0040) — there is nothing to lose by navigating away, and
  // that is why the leave-confirm must stay silent here. Never announce a round from this file.
  startsRound: false,
  keywords: ['ดวงวันนี้', 'ดวงขำๆ', 'ดูดวงรายวัน', 'ดวงวันนี้แบบสุ่ม', 'ดูดวงบนเครื่องเดียว'],
  tagline: 'กดครั้งเดียว รู้เลยว่าวันนี้จะเจอเรื่องจิ๊บจ๊อยอะไร อ่านขำๆ ไม่ต้องเชื่อ',
  seo: {
    title: 'ดวงวันนี้ — กดครั้งเดียว รู้ว่าวันนี้จะเจอเรื่องขำๆ อะไรบ้าง',
    description:
      'ดวงขำๆ ประจำวัน กดครั้งเดียวได้สามเรื่องจิ๊บจ๊อย เรื่องกิน เรื่องเงิน เรื่องทาง พร้อมสรุปดวงวันนี้ ไม่ใช่คำทำนายจริงจัง ไม่ต้องโหลดแอป ไม่ต้องสมัคร',
    steps: [
      'กด "เปิดดวงวันนี้" ครั้งเดียว',
      'อ่านสามเรื่องที่ได้ เรื่องกิน เรื่องเงิน และเรื่องทาง',
      'ดูสรุปดวงวันนี้ที่มาจากสามเรื่องนั้นรวมกัน',
      'อยากได้ใหม่ กด "เปิดใหม่อีกที" ได้เรื่อยๆ',
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
