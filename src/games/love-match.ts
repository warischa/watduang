// Love Match — pick two people out of the circle and read how their fortune sits together today.
// The reading is a pure function of (sorted normalized pair, Asia/Bangkok date): tap again and it is
// the same answer, swap who you tapped first and it is still the same answer, tomorrow it is a new
// one. Sorting is what makes name-A+name-B and name-B+name-A one pair — without it the game answers differently
// by tap order, and the first thing a group does is tap the other way round to check (#34).
// Determinism also kills reroll-until-you-like-it, which matters more here than in #33: a group
// WILL re-roll a bad compatibility score if the game lets them.
// No checkpoint by design: state is a pure function of two names and the date, so there is nothing
// mid-round to persist and siamsi stays the sole checkpoint writer (ADR-0010). The only session
// write here is markPlayed at reveal.
// The .ts extension in the import path is required for `node --test` (Node does not guess
// extensions) — Vite/tsc accept it.
import type { GameContext, GameModule } from './types.ts';
// Exactly two functions, no shared util file and no abstraction layer — the same way short-stick.ts
// imports pickLoser from its sibling. Two call sites do not justify a layer (#34).
import { hashPick, normalizeName } from './daily-fortune.ts';

// ---- The reading: pure and calculable, testable with no DOM (see love-match.test.mjs) ----

export interface Band {
  /** Identifier only — never shown to a player, so it stays English like every other identifier. */
  readonly id: string;
  readonly min: number;
  readonly max: number;
  readonly lines: readonly string[];
}

/** Every line describes the fortune of the *pair*, never a verdict on one of the two people in the room,
 *  and never assumes the two are or should be together — friends, colleagues and relatives play this
 *  (#34). Per ADR-0011 a line may urge what horoscopes have always urged (patience, kindness, letting
 *  an argument go) but may not name a medical, financial or legal act.
 *  Bands tile 0..100 with no gap and no overlap: bandFor() must be total, because the test walks
 *  every score from 0 to 100 against its own copy of these boundaries. */
export const BANDS: readonly Band[] = [
  {
    id: 'far',
    min: 0,
    max: 24,
    lines: [
      'วันนี้ดวงคู่นี้ยังไม่เข้าจังหวะกัน พูดคนละเรื่องเดียวกันอยู่',
      'จังหวะของสองคนนี้วันนี้สวนทางกัน คนหนึ่งจะเร็ว อีกคนจะช้า',
      'วันนี้คลื่นไม่ตรงกัน คุยอะไรก็ต้องอธิบายกันสองรอบ',
      'ดวงคู่นี้วันนี้เหมือนนัดกันคนละที่ ตั้งใจดีกันทั้งคู่แต่ยังไม่บรรจบ',
      'วันนี้สองคนนี้อยู่คนละอารมณ์ ต่างคนต่างพักสักหน่อยแล้วค่อยว่ากัน',
      'ดวงคู่นี้วันนี้แรงเยอะแต่ทิศไม่ตรง เรื่องเล็กๆ เถียงกันได้ยาวเลย',
      'วันนี้ยังไม่ใช่วันของคู่นี้ พรุ่งนี้ฟ้าอาจจัดจังหวะใหม่ให้',
    ],
  },
  {
    id: 'slow',
    min: 25,
    max: 49,
    lines: [
      'ดวงคู่นี้ต้องออกแรงกันหน่อย แต่ออกแรงแล้วไปต่อได้',
      'วันนี้สองคนนี้เริ่มจับจังหวะกันได้ ยังไม่ลงล็อกแต่ใกล้แล้ว',
      'คู่นี้วันนี้เหมือนเพลงที่ยังจูนไม่เข้าคีย์ ฟังไปสักพักจะเข้าที่เอง',
      'ดวงคู่นี้ดีตอนอยู่กันเงียบๆ พอมีคนอื่นมาร่วมวงจังหวะจะรวน',
      'วันนี้คู่นี้ต้องใช้ความใจเย็นมากกว่าคำพูด อดใจไว้แล้วจะผ่านไปได้สวย',
    ],
  },
  {
    id: 'steady',
    min: 50,
    max: 69,
    lines: [
      'ดวงคู่นี้กลางๆ แบบสบายใจ ไม่หวือหวาแต่ก็ไม่มีอะไรให้กังวล',
      'วันนี้สองคนนี้ไปด้วยกันได้เรื่อยๆ เหมือนเดินคุยกันไปไม่ต้องรีบ',
      'คู่นี้พอดีกันแบบไม่ต้องพยายาม อยู่ด้วยกันแล้วเวลาผ่านไปเร็ว',
      'ดวงคู่นี้วันนี้นิ่ง ใครเหนื่อยมาอีกคนจะรู้เองโดยไม่ต้องบอก',
      'วันนี้คู่นี้เข้ากันได้ดีเวลามีงานต้องทำ แต่ต้องมีคนเริ่มก่อนสักคน',
    ],
  },
  {
    id: 'close',
    min: 70,
    max: 89,
    lines: [
      'ดวงคู่นี้เข้าขากันดีมาก คิดอะไรมักตรงกันโดยไม่ได้นัด',
      'วันนี้สองคนนี้จังหวะตรงกันเป๊ะ พูดพร้อมกันได้หลายรอบเลย',
      'คู่นี้เจอกันทีไรบรรยากาศดีขึ้นทุกที คนรอบข้างก็พลอยสบายใจไปด้วย',
      'ดวงคู่นี้เสริมกันพอดี คนหนึ่งคิด อีกคนลงมือ',
      'วันนี้คู่นี้คุยกันคำเดียวก็เข้าใจ ที่เหลือไม่ต้องอธิบาย',
      'ดวงคู่นี้แรงดี วันนี้ชวนกันทำอะไรก็สำเร็จง่ายกว่าปกติ',
      'สองคนนี้อยู่ด้วยกันแล้วเรื่องยากกลายเป็นเรื่องขำ',
    ],
  },
  {
    id: 'locked',
    min: 90,
    max: 100,
    lines: [
      'ดวงคู่นี้เต็มจังหวะ วันนี้ทำอะไรด้วยกันก็เข้าล็อกไปหมด',
      'ฟ้าจัดจังหวะให้สองคนนี้มาเจอกันพอดีวันนี้ ชวนกันทำอะไรก็ราบรื่น',
      'สองคนนี้คลื่นตรงกันแบบหาไม่ได้ง่ายๆ ทั้งวงต้องยกให้',
      'ดวงคู่นี้ดีจนคนรอบตัวสังเกตเห็นเอง ไม่ต้องมีใครบอก',
      'วันนี้คู่นี้คิดตรงกันจนน่าตกใจ ลองถามคำถามเดียวกันดูได้เลย',
      'ดวงคู่นี้ส่งกันขึ้น อีกคนอยู่ตรงไหนอีกคนก็ทำได้ดีกว่าเดิม',
      'วงนี้ต้องพึ่งคู่นี้ ใครมีเรื่องติดขัดวันนี้ให้สองคนนี้ช่วยกันคิด',
    ],
  },
];

/** Score ranges with how many slots each one takes in the draw. Uneven on purpose (#34): a flat
 *  0..100 hands almost every group a mediocre middling percentage, which is the boring outcome, so
 *  the two ends carry more weight than the middle. The test measures the resulting distribution
 *  rather than trusting this table.
 *  0..5 and 100 are deliberately unproducible: 0% reads as a verdict on two real people in the room
 *  rather than on their timing, and 100% is an absolute this game has no business claiming. Both
 *  still resolve in bandFor() — the bands tile the full range, the draw just never lands there. */
const WEIGHTS: readonly (readonly [from: number, to: number, slots: number])[] = [
  [6, 24, 2],
  [25, 49, 1],
  [50, 69, 1],
  [70, 89, 2],
  [90, 99, 4],
];

/** Every score the draw can produce, one entry per slot — `hashPick` is uniform over entries, so
 *  repeating a score is what weights it. Exported so the test can assert against the scores that
 *  actually exist instead of against 0..100, most of which never occur. */
export const SCORES: readonly number[] = WEIGHTS.flatMap(([from, to, slots]) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i).flatMap(
    (score) => Array.from({ length: slots }, () => score),
  ),
);

/** The seed both outputs share. Two things are load-bearing here.
 *  1. Sorting, so tap order cannot change the reading.
 *  2. Sorting with `<=` — plain UTF-16 code-unit comparison. `localeCompare`/`Intl.Collator` would
 *     order Thai by ICU locale data that differs between runtimes and ICU builds, so two phones could
 *     seed the same pair in opposite orders and disagree. Code-unit order is arbitrary to a reader
 *     but identical on every device, which is the only property this needs.
 *  ponytail: `|` is a plain separator, so a name literally containing `|` could collide with another
 *  pair. Harmless — the collision's only effect is two pairs reading alike, which #34 already accepts
 *  as a known consequence of a small pool. Length-prefix the parts if that ever stops being true. */
export function pairSeed(a: string, b: string, today: string): string {
  const x = normalizeName(a);
  const y = normalizeName(b);
  const [lo, hi] = x <= y ? [x, y] : [y, x];
  return `${lo}|${hi}|${today}`;
}

/** Today's compatibility number for a pair. */
export function scoreFor(a: string, b: string, today: string): number {
  return hashPick(pairSeed(a, b, today), SCORES);
}

export function bandFor(score: number): Band {
  const band = BANDS.find((b) => score >= b.min && score <= b.max);
  if (!band) throw new Error(`bandFor: score ${score} is outside 0..100`);
  return band;
}

/** Today's line for a pair. The score chooses the band and the band owns the pool, so the number and
 *  the text physically cannot contradict each other — that is the whole reason this is one seed and
 *  not two hashes (#34): two hashes would print 95% next to a line about a difficult match.
 *  The `|line` suffix picks *within* the chosen pool. It is the same pair-seed, not a second
 *  independent hash: the band is already fixed by the score before this runs. The suffix exists
 *  because `hashPick` derives its index as `h % pool.length` from one `h` — reusing the bare seed
 *  would tie `h % SCORES.length` to `h % lines.length` whenever those lengths share a factor, and
 *  some lines in a band would become undrawable. That coupling would come back silently the next
 *  time someone adds a line; the suffix removes it for good, and the test checks reachability per
 *  band anyway. */
export function lineFor(a: string, b: string, today: string): string {
  const seed = pairSeed(a, b, today);
  return hashPick(`${seed}|line`, bandFor(hashPick(seed, SCORES)).lines);
}

// ---- Current screen state (one game per page) ----

let cleanup: Array<() => void> = [];
let stageEl: HTMLElement | null = null;
let gameCtx: GameContext | null = null;
/** Roster index, not a name — two players in one circle may share a name and are still two picks. */
let firstIndex: number | null = null;

// ponytail: `cleanup` grows across pick↔result cycles instead of being drained per render, so the
// removal closures pin detached nodes until dispose(). Bounded and released on every game switch —
// a whole party night is ~100 cycles. Same trade as daily-fortune.ts; drain it per render only if a
// profile says to.
function on(target: EventTarget, type: string, handler: EventListener): void {
  target.addEventListener(type, handler);
  cleanup.push(() => target.removeEventListener(type, handler));
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text?: string,
  style?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (style) node.setAttribute('style', style);
  return node;
}

// ---- Screens ----
// 320px: every size comes off the viewport, never a constant, and both the names and the line wrap
// instead of pushing the stage sideways.
const CHIPS_STYLE = 'display:flex;flex-wrap:wrap;gap:0.5rem;justify-content:center;margin:0.75rem 0';
const SCORE_STYLE = 'font-size:clamp(2.6rem,16vw,4rem);font-weight:700;line-height:1.1;margin:0.5rem 0';
const LINE_STYLE =
  'font-size:clamp(1.15rem,5.5vw,1.6rem);font-weight:700;line-height:1.7;overflow-wrap:anywhere';
const PAIR_STYLE = 'font-size:1.25rem;font-weight:700;overflow-wrap:anywhere';

function hubLink(): HTMLAnchorElement {
  const hub = el('a', 'กลับไปหน้ารวมเกม');
  hub.href = '/games/';
  return hub;
}

function renderPick(): void {
  const stage = stageEl;
  if (!stage) return;
  stage.replaceChildren();

  const roster = gameCtx?.session.players ?? [];
  // The setup panel refuses to start below players[0], so this is a guard, not a normal path.
  if (roster.length < 2) {
    stage.appendChild(el('p', 'เกมนี้ต้องมีอย่างน้อย 2 คน ใส่ชื่อเพิ่มก่อนนะ'));
    stage.appendChild(hubLink());
    return;
  }

  const first = firstIndex;
  stage.appendChild(
    el('p', first === null ? 'แตะเลือกคนแรก' : `เลือกคู่ของ ${roster[first]}`),
  );

  const chips = el('div', undefined, CHIPS_STYLE);
  roster.forEach((name, index) => {
    // The same person cannot be both halves of the pair — a pick is an index, so two players who
    // share a name are still offered separately, and their reading is a real one.
    if (index === first) return;
    const chip = el('button', name);
    chip.type = 'button';
    on(chip, 'click', () => pick(index));
    chips.appendChild(chip);
  });
  stage.appendChild(chips);

  if (first !== null) {
    const back = el('button', 'เลือกคนแรกใหม่');
    back.id = 'lm-reset';
    back.type = 'button';
    on(back, 'click', () => {
      firstIndex = null;
      renderPick();
    });
    stage.appendChild(back);
  }
}

function renderResult(a: string, b: string, now: Date): void {
  const stage = stageEl;
  if (!stage) return;
  stage.replaceChildren();

  // One `now` for the whole screen — two `new Date()` calls could straddle Bangkok midnight and
  // print a date that contradicts the reading below it. The Bangkok day, never the device's: two
  // phones in different timezones must agree on the same pair near midnight (Thailand is UTC+7, no
  // DST). Known and accepted, as in #33: at Bangkok midnight the reading flips mid-read, because
  // nothing is stored to pin it — that is what "today" promises.
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const shown = new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'long' }).format(now);

  stage.appendChild(el('p', `ดวงคู่ประจำวันที่ ${shown}`));
  stage.appendChild(el('p', `${a} กับ ${b}`, PAIR_STYLE));
  stage.appendChild(el('p', `${scoreFor(a, b, today)}%`, SCORE_STYLE));
  stage.appendChild(el('p', lineFor(a, b, today), LINE_STYLE));
  stage.appendChild(el('p', 'สลับลำดับชื่อก็ได้ผลเท่าเดิม วันนี้กดกี่ครั้งก็เท่าเดิม พรุ่งนี้ค่อยมาดูใหม่'));

  const again = el('button', 'ดูคู่อื่น');
  again.id = 'lm-again';
  again.type = 'button';
  on(again, 'click', () => {
    firstIndex = null;
    renderPick();
  });
  stage.appendChild(again);

  stage.appendChild(hubLink());
}

function pick(index: number): void {
  const roster = gameCtx?.session.players ?? [];
  if (firstIndex === null) {
    firstIndex = index;
    renderPick();
    return;
  }
  const a = roster[firstIndex];
  const b = roster[index];
  gameCtx?.session.markPlayed('love-match');
  renderResult(a, b, new Date());
}

function mountInto(stage: HTMLElement, ctx: GameContext): void {
  stageEl = stage;
  gameCtx = ctx;
  firstIndex = null;
  renderPick();
}

function teardown(): void {
  cleanup.forEach((fn) => fn());
  cleanup = [];
  firstIndex = null;
  stageEl?.replaceChildren();
  stageEl = null;
  gameCtx = null;
}

const game: GameModule = {
  id: 'love-match',
  names: { th: 'ดวงความรัก', en: 'Love Match' },
  category: 'fortune',
  players: [2, 10],
  keywords: ['ดวงความรัก', 'ดูดวงคู่', 'ดวงคู่วันนี้', 'ทดสอบความเข้ากัน', 'เกมส่งมือถือ', 'เกมเล่นบนเครื่องเดียว'],
  needs: [],
  tagline: 'เลือกสองคนในวง แล้วดูว่าวันนี้ดวงเข้ากันกี่เปอร์เซ็นต์',
  seo: {
    title: 'ดวงความรัก — เลือกสองคนในวงดูดวงคู่วันนี้ เล่นฟรีบนเครื่องเดียว',
    description:
      'เลือกสองคนในวง แล้วดูว่าวันนี้ดวงของคู่นี้เข้ากันกี่เปอร์เซ็นต์ พร้อมคำทำนายประจำวัน คู่เดิมในวันเดิมได้ผลเดิมเสมอ สลับลำดับก็ได้ผลเท่ากัน พรุ่งนี้ค่อยเปลี่ยนใหม่ เล่นได้ 2-10 คน ไม่ต้องโหลดแอป ไม่ต้องสมัคร',
    steps: [
      'ใส่ชื่อทุกคนในวง (2–10 คน)',
      'แตะเลือกคนแรก แล้วแตะเลือกคนที่สอง',
      'อ่านเปอร์เซ็นต์ความเข้ากันของคู่นี้พร้อมคำทำนายวันนี้ให้วงฟัง',
      'กด "ดูคู่อื่น" แล้วเลือกคู่ใหม่ได้เรื่อยๆ วันนี้คู่เดิมได้ผลเดิม',
    ],
  },
  og: 'love-match.png',
  ads: false, // play screen = never an ad slot

  mount(stage: HTMLElement, ctx: GameContext) {
    mountInto(stage, ctx);
  },

  dispose() {
    teardown();
  },
};

export default game;
