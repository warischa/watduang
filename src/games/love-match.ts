// Love Match — pick two people out of the group and read how their fortune sits together today.
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
import { el } from './_el.ts';
// Exactly two functions, taken straight from the sibling game with no util file and no
// abstraction layer FOR THEM — the same way short-stick.ts imports pickLoser from its sibling.
// Two call sites do not justify a layer (#34). (el() is a different case: six byte-identical
// copies did justify one, and it now lives in _el.ts.)
import { hashPick, normalizeName } from './daily-fortune.ts';
import { armAllButtons } from './_arm-gate.ts';

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

/** The meter arc's stroke-dashoffset for a score — the SVG's fixed 264 dasharray (2π·42, the canvas's
 *  r=42 ring) minus the fraction the score fills. Derived from the percentage, never hardcoded, so the
 *  arc a player reads is always the number the meter prints; 75% → 66, the canvas's own example. */
export function arcDashOffset(percent: number): number {
  return Math.round(264 * (1 - percent / 100));
}

// ---- Current screen state (one game per page) ----

let cleanup: Array<() => void> = [];
let stageEl: HTMLElement | null = null;
let gameCtx: GameContext | null = null;
/** Roster index, not a name — two players in one group may share a name and are still two picks. */
let firstIndex: number | null = null;
// Chip nodes for the CURRENT pick screen, one per roster index — kept live across the two taps of a
// pick so the first tap can mark a chip taken in place instead of rebuilding the row (#36: a rebuild
// after tap 1 reflows every later chip under the player's finger, so tap 2 lands on the wrong person).
let chipEls: HTMLButtonElement[] = [];
let headerEl: HTMLParagraphElement | null = null;
let backBtn: HTMLButtonElement | null = null;

// ponytail: `cleanup` grows across pick↔result cycles instead of being drained per render, so the
// removal closures pin detached nodes until dispose(). Bounded and released on every game switch —
// a whole party night is ~100 cycles. Same trade as daily-fortune.ts; drain it per render only if a
// profile says to.
function on(target: EventTarget, type: string, handler: EventListener): void {
  target.addEventListener(type, handler);
  cleanup.push(() => target.removeEventListener(type, handler));
}

// ---- Screens ----
// 320px: every size comes off the viewport, never a constant, and both the names and the line wrap
// instead of pushing the stage sideways.
const CHIPS_STYLE = 'display:flex;flex-wrap:wrap;gap:0.5rem;justify-content:center;margin:0.75rem 0';
// Reserves 2 lines' worth of height for the header paragraph regardless of which of its two possible
// strings is showing (the initial prompt vs. the "pick <name>'s partner" string built in pick() below) —
// in em, so it tracks whatever font-size the header actually renders at. Without this, swapping the text
// in place could still change the paragraph's own height if the new string wraps differently, and shift
// the chip row underneath it — the same bug on a new axis (#36). Rendered at 320px: both strings stay
// one line for names up to ~18 Thai characters, so day to day this is headroom, not an active fix — it
// stays because a longer name can still wrap the second string to 2 lines. headerNameFor() truncates any
// name past HEADER_NAME_MAX before it reaches this string, so the built string can never wrap past 2
// lines — the reservation is a hard cap, not a "usually" cover for the common case.
const HEADER_STYLE = 'min-height:2.8em;line-height:1.4;margin:0 0 0.5rem';
// A name past this length is truncated (with an ellipsis) before it goes into the header string — see
// headerNameFor(). Player names are never length-capped at write time everywhere they could originate
// (an old, uncapped localStorage entry can outlive today's input maxlength), so this is the actual
// backstop for HEADER_STYLE's 2-line reservation, not the input's maxlength.
export const HEADER_NAME_MAX = 20;

/** Truncates a player name for use inside the header string built in pick() below, so that string can
 *  never wrap past HEADER_STYLE's 2-line reservation, regardless of how long the underlying name is. */
function headerNameFor(name: string): string {
  return name.length > HEADER_NAME_MAX ? `${name.slice(0, HEADER_NAME_MAX)}…` : name;
}
// The "taken" look for the first-picked chip. Previously unauthored — the dimming rode entirely on the
// browser's default `:disabled` UA styling, and a real device (iOS Safari, not the headless Chrome that
// captured docs/verification/evidence) is not guaranteed to render that the same way. Values chosen to
// stay close to what Chrome's default already produced, since the owner approved that exact look.
const TAKEN_CHIP_STYLE = 'opacity:0.5';

// No hub link is built in this file any more — #stage must hold no navigation target (a tap-transition
// would drop it under the finger that just tapped). The crawlable /games/ link is static chrome in
// src/layouts/GameLayout.astro.

// Builds the whole pick screen once per round (initial mount, or after the result screen's "again"
// button calls this again to start a new pick) — every chip stays for both taps of a pick, per #36.
// `firstIndex` is always null when this runs; the first tap updates the existing nodes in place (see
// pick()) instead of calling this again.
function renderPick(): void {
  const stage = stageEl;
  if (!stage) return;
  stage.replaceChildren();
  // The pick screen sits in block flow (its chips and header are inline-styled); the result screen is
  // the one that opts into .stage-screen. Explicit on every render so a round that came back from the
  // result screen ("ดูคู่อื่น") lands in block flow instead of inheriting the class it left behind.
  stage.className = '';
  chipEls = [];
  headerEl = null;
  backBtn = null;

  const roster = gameCtx?.session.players ?? [];
  // The setup panel refuses to start below players[0], so this is a guard, not a normal path.
  if (roster.length < 2) {
    stage.appendChild(el('p', 'เกมนี้ต้องมีอย่างน้อย 2 คน ใส่ชื่อเพิ่มก่อนนะ'));
    return;
  }

  headerEl = el('p', 'แตะเลือกคนแรก', HEADER_STYLE);
  stage.appendChild(headerEl);

  const chips = el('div', undefined, CHIPS_STYLE);
  roster.forEach((name, index) => {
    const chip = el('button', name);
    chip.type = 'button';
    on(chip, 'click', () => pick(index));
    chipEls[index] = chip;
    chips.appendChild(chip);
  });
  stage.appendChild(chips);

  // Created once, hidden via the native `hidden` attribute rather than added/removed from the DOM —
  // no CSS needed, and it keeps this screen's node set fixed for the same reason the chips are fixed.
  const back = el('button', 'เลือกคนแรกใหม่');
  back.id = 'lm-reset';
  back.type = 'button';
  back.hidden = true;
  on(back, 'click', () => {
    if (firstIndex !== null) {
      const prev = chipEls[firstIndex];
      prev.disabled = false;
      prev.removeAttribute('aria-pressed');
      prev.removeAttribute('style');
    }
    firstIndex = null;
    if (headerEl) headerEl.textContent = 'แตะเลือกคนแรก';
    back.hidden = true;
  });
  backBtn = back;
  stage.appendChild(back);

  // Every way into this screen (mount, and renderResult's "again" remount) swaps the stage under the
  // finger that just tapped, so a ghost second contact could land on a chip or on "back". Unlike
  // daily-fortune's roster chips, gating these is safe: a chip→chip tap here crosses no #stage swap —
  // the first tap mutates the row in place (see pick() above) rather than re-rendering — so the
  // 400ms window only ever delays the FIRST tap of a fresh pick, never a deliberate second one.
  cleanup.push(armAllButtons(stage));
}

// ---- The result screen's inline art, drawn, never an image. Presentation attributes resolve var(),
// exactly as pick-loser's burst does: #1a1a1a is var(--color-line-strong), #fffdf7 is
// var(--color-ground-warm). #d6336c is the meter arc's own colour, NOT the accent, and stays a literal
// (the brief: only the accent may not be one). The arc offset is computed, never hardcoded.
const HEART_SVG =
  '<svg width="26" height="26" viewBox="0 0 24 24" fill="var(--color-line-strong)" stroke="var(--color-line-strong)" stroke-width="2" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M12 20s-7-4.5-7-9.5A3.8 3.8 0 0 1 12 8a3.8 3.8 0 0 1 7 2.5c0 5-7 9.5-7 9.5z"></path></svg>';

/** The 250×250 meter SVG on the canvas's 0..100 viewBox: a warm ring outlined strong, plus the
 *  #d6336c progress arc whose stroke-dashoffset is arcDashOffset(score). The -90deg rotation is CSS
 *  (.lm-meter svg), not inline. */
function meterSvg(offset: number): string {
  return (
    '<svg width="250" height="250" viewBox="0 0 100 100" aria-hidden="true">' +
    '<circle cx="50" cy="50" r="42" fill="var(--color-ground-warm)" stroke="var(--color-line-strong)" stroke-width="5"></circle>' +
    `<circle cx="50" cy="50" r="42" fill="none" stroke="#d6336c" stroke-width="5" stroke-linecap="round" stroke-dasharray="264" stroke-dashoffset="${offset}"></circle>` +
    '</svg>'
  );
}

function renderResult(a: string, b: string, now: Date): void {
  const stage = stageEl;
  if (!stage) return;
  stage.replaceChildren();
  // The result screen opts into the shared shell layout (.stage-screen) so it spans the full width on
  // the accent ground the play-area already paints — the same opt-in pick-loser and daily-fortune make.
  stage.className = 'stage-screen';

  // One `now` for the whole screen — two `new Date()` calls could straddle Bangkok midnight and hash a
  // day the reveal did not seal. The Bangkok day, never the device's (Thailand is UTC+7, no DST): two
  // phones in different timezones must agree on the same pair near midnight. The screen no longer prints
  // a date line (the canvas has none); the note under the button carries the "today" promise.
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const score = scoreFor(a, b, today);
  const line = lineFor(a, b, today);

  // The pair row: two structurally identical name tiles around a filled heart. The reading is about the
  // PAIR, never a verdict on one person, so the two tiles are the same element with the same class — no
  // first-name/second-name styling of any kind (the first AC). Direct children in canvas order.
  const pair = document.createElement('div');
  pair.className = 'lm-pair';
  const tileA = el('div', a);
  tileA.className = 'lm-name';
  const tileB = el('div', b);
  tileB.className = 'lm-name';
  const heart = document.createElement('span');
  heart.className = 'lm-heart';
  heart.innerHTML = HEART_SVG;
  pair.appendChild(tileA);
  pair.appendChild(heart);
  pair.appendChild(tileB);
  stage.appendChild(pair);

  // The meter: a drawn arc, not an image; the number is the one big thing on screen (62px).
  const meter = document.createElement('div');
  meter.className = 'lm-meter';
  meter.innerHTML = meterSvg(arcDashOffset(score));
  const meterLabel = document.createElement('div');
  meterLabel.className = 'lm-meter-label';
  const scoreEl = el('span', String(score));
  scoreEl.className = 'lm-score';
  const unitEl = el('span', 'เปอร์เซ็นต์');
  unitEl.className = 'lm-unit';
  meterLabel.appendChild(scoreEl);
  meterLabel.appendChild(unitEl);
  meter.appendChild(meterLabel);
  stage.appendChild(meter);

  // The reading card owns its height — no fixed height, no overflow — so the longest line in the pool
  // renders in full instead of clipping or scrolling (the third AC).
  const reading = document.createElement('div');
  reading.className = 'lm-reading';
  reading.appendChild(el('p', line));
  stage.appendChild(reading);

  const again = el('button', 'ดูคู่อื่น');
  again.id = 'lm-again';
  again.type = 'button';
  again.className = 'game-btn game-btn-primary';
  on(again, 'click', () => {
    firstIndex = null;
    renderPick();
  });
  stage.appendChild(again);

  const note = el('span', 'วันนี้คู่เดิมได้ผลเดิม');
  note.className = 'lm-note';
  stage.appendChild(note);

  // No /games/ link here — #stage holds no navigation target in any game (ADR-0014); the crawlable
  // link is static chrome above the stage. The second tap of the pair that produced this screen lands
  // here under the same finger, so gate it like every render.
  cleanup.push(armAllButtons(stage));
}

function pick(index: number): void {
  const roster = gameCtx?.session.players ?? [];
  if (firstIndex === null) {
    // In place, not a re-render (#36): the chip row must stay exactly as the player saw it for the
    // second tap. Taken chip is disabled (stops responding) and marked aria-pressed — still visible,
    // dimmed by TAKEN_CHIP_STYLE, so it doesn't read as "nothing happened".
    firstIndex = index;
    if (headerEl) headerEl.textContent = `เลือกคู่ของ ${headerNameFor(roster[index])}`;
    const chip = chipEls[index];
    if (chip) {
      chip.disabled = true;
      chip.setAttribute('style', TAKEN_CHIP_STYLE);
      chip.setAttribute('aria-pressed', 'true');
    }
    if (backBtn) backBtn.hidden = false;
    return;
  }
  // Same chip tapped twice fast: with the row no longer reflowing, the first chip is still on screen
  // and still under the finger — without this guard a double-tap pairs someone with themselves (#36).
  if (index === firstIndex) return;
  const a = roster[firstIndex];
  const b = roster[index];
  gameCtx?.session.markPlayed('love-match');
  renderResult(a, b, new Date());
}

function mountInto(stage: HTMLElement, ctx: GameContext): void {
  stageEl = stage;
  gameCtx = ctx;
  firstIndex = null;
  chipEls = [];
  headerEl = null;
  backBtn = null;
  renderPick();
}

function teardown(): void {
  cleanup.forEach((fn) => fn());
  cleanup = [];
  firstIndex = null;
  chipEls = [];
  headerEl = null;
  backBtn = null;
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
