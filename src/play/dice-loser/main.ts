// Play-route controller for the dice-loser game (gh#156). It owns the screens; NOT the rule.
//
// The losing rule lives in src/games/dice-loser.ts and is imported here — `rollDice` and
// `resolveRound` are the only things that decide anything, and they are the functions
// src/games/dice-loser.test.mjs pins. Re-deriving "highest total loses" in this file would put a
// second, untested copy of the game's one rule on the shipped path.
//
// THE PLAYERS ARE NOT THIS FILE'S. The shared player screen (ADR-0071, gh#264) owns the count, the
// names, the roster and the group; it is mounted into #dl-players and hands the players it starts
// with to startWithPlayers() below. What this file keeps is the game: its one option (which total
// loses), then the rounds. This route used to keep its own stepper, name rows, reset control and a
// private list under a per-game key; they are gone, and that list is migrated once by the shared
// screen (LEGACY_LISTS there), so this file spells no storage key at all.
//
// NAMES NEVER TOUCH innerHTML. Every pill, summary card and result line below is built with
// createElement + textContent, which is what makes a player called `<img onerror=...>` render as
// exactly that text. This is the bug three sibling routes shipped, so it is structural here rather
// than a call to an escape helper that a future edit could forget.
//
// English comments throughout: the thai-comments carve-out covers files a mockup brought with it, and
// nothing in this folder is a verbatim lift.
import game, {
  rollDice,
  resolveRound,
  CONDITION_LABEL,
  type LoseCondition,
  type Roll,
} from '../../games/dice-loser.ts';
import { armAllButtons } from '../../games/_arm-gate.ts';
import { mountPlayerScreen, type Player } from '../_player-screen/player-screen.ts';

/** Which of the nine cells in a 3x3 grid carry a pip, per face. A die is decorative here — the value
 *  that counts is announced as text — but a dice game that shows numerals is not a dice game. */
const PIPS: Readonly<Record<number, readonly number[]>> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

// The literal query, in the same file as the motion it gates (ADR-0046 — reduce, not remove). The
// tumble itself is a CSS animation the stylesheet already shortens under the same query; this timer
// only has to stop outrunning it, or the faces would land before the animation that reveals them.
const REDUCE_MOTION =
  typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const ROLL_MS = REDUCE_MOTION ? 120 : 620;

/** The seated players' names, in the order the shared screen handed them over (roster order). Every
 *  seat index below is an index into this array. Set only by startWithPlayers(). */
let names: string[] = [];
let condition: LoseCondition = 'HIGH_LOSES';

/** Seats still in the game, as indexes into `names`. A tiebreak round narrows this and never grows it. */
let active: number[] = [];
let turnIdx = 0;
let roundNumber = 1;
/** seat index -> that seat's roll THIS round. Cleared at the start of every round. */
let rolls = new Map<number, Roll>();
let rollTimer: ReturnType<typeof setTimeout> | null = null;

// ---- elements ----------------------------------------------------------------------------------

const $ = <T extends HTMLElement>(id: string): T | null => document.getElementById(id) as T | null;

// The shared player screen's root. Not through $() above: the shared tests read the mount's root off
// this declaration, in this spelling, to drive the real screen over this route's markup.
const playersEl = document.getElementById('dl-players');
// The game's own option screen (the scoring rule), shown after the players are chosen.
const setupEl = $('dl-setup');
const playEl = $('dl-play');
const summaryEl = $('dl-summary');
const tiebreakEl = $('dl-tiebreak');
const finalEl = $('dl-final');
const liveEl = $('dl-live');

const beginEl = $<HTMLButtonElement>('dl-begin');
const modeHighEl = $<HTMLButtonElement>('dl-mode-high');
const modeLowEl = $<HTMLButtonElement>('dl-mode-low');

const roundLabelEl = $('dl-round-label');
const turnNameEl = $('dl-turn-name');
const pillsEl = $('dl-pills');
const scoreEl = $('dl-score');
const rollEl = $<HTMLButtonElement>('dl-roll');
const nextEl = $<HTMLButtonElement>('dl-next');
const dieEls = [$('dl-die-1'), $('dl-die-2'), $('dl-die-3')];

const summaryTitleEl = $('dl-summary-title');
const summaryListEl = $('dl-summary-list');
const summaryContinueEl = $<HTMLButtonElement>('dl-summary-continue');
const tiebreakListEl = $('dl-tiebreak-list');
const tiebreakStartEl = $<HTMLButtonElement>('dl-tiebreak-start');
const finalNameEl = $('dl-final-name');
const finalDetailsEl = $('dl-final-details');
const rematchEl = $<HTMLButtonElement>('dl-rematch');
const newSetupEl = $<HTMLButtonElement>('dl-new-setup');

const PANELS = [setupEl, playEl, summaryEl, tiebreakEl, finalEl];

/** One screen at a time, and every button on the arriving screen is re-armed: a double-tap aimed at
 *  the control that caused the transition must not fall through onto the next screen. */
function show(panel: HTMLElement | null): void {
  for (const el of PANELS) {
    if (el) el.hidden = el !== panel;
  }
  if (panel) armAllButtons(panel);
}

function announce(text: string): void {
  if (liveEl) liveEl.textContent = text;
}

/** The label a seat plays under. Never blank: the shared screen hands over a blank row under its
 *  mascot's name (displayName there), so there is no fallback left for this file to own. */
function seatName(seat: number): string {
  return names[seat] ?? '';
}

// ---- the players, then the game's own option ---------------------------------------------------

/** The handoff the shared player screen starts (ADR-0071). Every player it is handed is seated, in
 *  the order given -- the screen has already admitted the count against this game's declared range,
 *  so there is nothing left to clamp here -- and the game's own option, the scoring rule, comes next
 *  (ruling 1). scripts/seat-cap-check.mjs runs this function and reads the seats back. */
function startWithPlayers(players: Player[]): void {
  names = players.map((p) => p.name);
  show(setupEl);
}

/** A round is live while one of its three panels is up: a turn, a summary or a tiebreak. The rule
 *  screen before it and the result after it hold nothing to lose, so the edit control opens the
 *  player screen there without asking (ADR-0071 ruling 6). */
function roundActive(): boolean {
  return [playEl, summaryEl, tiebreakEl].some((el) => !!el && !el.hidden);
}

/** Puts the round away: a roll still tumbling is dropped, so its faces never land on a round that
 *  is gone, and every panel is hidden so the player screen is the only thing on the page. Used both
 *  when the players confirm ending a live round and whenever the screen opens. */
function putAwayRound(): void {
  if (rollTimer !== null) {
    clearTimeout(rollTimer);
    rollTimer = null;
  }
  show(null);
}

function setCondition(next: LoseCondition): void {
  condition = next;
  for (const el of [modeHighEl, modeLowEl]) {
    if (!el) continue;
    const on = el.dataset.mode === next;
    el.classList.toggle('is-selected', on);
    el.setAttribute('aria-checked', on ? 'true' : 'false');
  }
}

// ---- the round ---------------------------------------------------------------------------------

function startRound(seats: number[]): void {
  active = [...seats];
  turnIdx = 0;
  rolls = new Map();
  renderTurn();
  show(playEl);
}

/** gh#240. A decorative face for a die that has not been rolled yet, so the turn screen never shows
 *  three blank squares. Deliberately NOT rollDice and nothing else from the rule module: this value
 *  is never stored in `rolls`, never totalled and never announced, so it cannot feed a result. It
 *  shares Math.random with rollDice's default source, and that is harmless -- the generator is
 *  unseeded and its state is unobservable, so an extra draw here changes no roll's distribution. */
function idleFace(): number {
  return Math.floor(Math.random() * 6) + 1;
}

/** Draws `face` into one die. `idle` marks a decorative face (gh#240) and is the ONE place the
 *  dimming class is decided: renderTurn passes true, the roll timer's real result passes nothing and
 *  so clears it -- the dimming is lifted only when the actual roll is on the die. */
function renderPips(el: HTMLElement | null, face: number, idle = false): void {
  if (!el) return;
  el.classList.toggle('is-idle', idle);
  el.replaceChildren();
  const on = PIPS[face] ?? [];
  for (let cell = 0; cell < 9; cell += 1) {
    const pip = document.createElement('span');
    pip.className = on.includes(cell) ? 'dl-pip is-on' : 'dl-pip';
    el.appendChild(pip);
  }
}

function renderTurn(): void {
  const seat = active[turnIdx];
  if (roundLabelEl) {
    roundLabelEl.textContent = roundNumber === 1 ? 'รอบที่ 1' : `รอบตัดสินที่ ${roundNumber - 1}`;
  }
  if (turnNameEl) turnNameEl.textContent = `ตาของ ${seatName(seat)}`;

  if (pillsEl) {
    pillsEl.replaceChildren();
    for (const s of active) {
      const pill = document.createElement('li');
      pill.className = rolls.has(s) ? 'dl-pill is-done' : 'dl-pill';
      if (s === seat) pill.classList.add('is-current');
      pill.textContent = rolls.has(s) ? `${seatName(s)} ${rolls.get(s)?.total}` : seatName(s);
      pillsEl.appendChild(pill);
    }
  }

  // gh#240, owner ruling 2026-10-01: the dice wait on DIMMED random faces, not blank ones, so a phone
  // handed to the next player never looks as if that player already rolled. roll() tumbles these
  // same dimmed faces; the timer's real result is what lifts the dimming.
  for (const el of dieEls) {
    el?.classList.remove('is-rolling');
    renderPips(el, idleFace(), true);
  }
  if (scoreEl) scoreEl.textContent = '';
  if (rollEl) rollEl.hidden = false;
  if (nextEl) nextEl.hidden = true;
  // ADR-0014, the ghost-tap gate. This is a reveal with no panel change to hang the arming on, so
  // it must be armed HERE: startRound reaches this through show(playEl), which arms, but nextTurn
  // calls renderTurn directly on every later turn and nothing else arms. Without this, #dl-roll
  // reappears already enabled in the very slot #dl-next just vacated -- both are the sole
  // .game-btn-primary in #dl-play -- so the second contact of a double-tap aimed at "next" rolls
  // the dice for the next player with no consent. Reveal, then arm, then announce, matching roll().
  if (playEl) armAllButtons(playEl);
  announce(`ถึงตาของ ${seatName(seat)} แล้ว`);
}

function roll(): void {
  const seat = active[turnIdx];
  if (rolls.has(seat) || rollTimer !== null) return;
  const result = rollDice();
  rolls.set(seat, result);

  if (rollEl) rollEl.hidden = true;
  for (const el of dieEls) el?.classList.add('is-rolling');

  // The faces land after the tumble, so the animation is not showing a result that is already read.
  rollTimer = setTimeout(() => {
    rollTimer = null;
    result.dice.forEach((face, i) => {
      dieEls[i]?.classList.remove('is-rolling');
      renderPips(dieEls[i], face);
    });
    if (scoreEl) scoreEl.textContent = `แต้มรวม ${result.total} แต้ม`;
    const last = turnIdx >= active.length - 1;
    if (nextEl) {
      nextEl.textContent = last ? 'ดูสรุปผลรอบนี้' : 'ส่งต่อคนถัดไป';
      nextEl.hidden = false;
    }
    if (playEl) armAllButtons(playEl);
    announce(`${seatName(seat)} ทอยได้ ${result.dice.join(' ')} รวม ${result.total} แต้ม`);
  }, ROLL_MS);
}

function nextTurn(): void {
  turnIdx += 1;
  if (turnIdx >= active.length) {
    showSummary();
    return;
  }
  renderTurn();
}

/** Totals of the seats still in the round, in `active` order — exactly the array resolveRound's
 *  returned indexes are positions in. */
function activeTotals(): number[] {
  return active.map((seat) => rolls.get(seat)?.total ?? 0);
}

function showSummary(): void {
  const totals = activeTotals();
  const outcome = resolveRound(totals, condition);

  if (summaryTitleEl) {
    summaryTitleEl.textContent = roundNumber === 1 ? 'สรุปผลรอบที่ 1' : `สรุปผลรอบตัดสินที่ ${roundNumber - 1}`;
  }
  if (summaryListEl) {
    summaryListEl.replaceChildren();
    // The losing end reads first, so the row that decides the round is the row at the top.
    const order = active
      .map((seat, i) => ({ seat, total: totals[i] }))
      .sort((a, b) => (condition === 'HIGH_LOSES' ? b.total - a.total : a.total - b.total));
    for (const row of order) {
      const li = document.createElement('li');
      li.className = row.total === outcome.losingScore ? 'dl-row is-losing' : 'dl-row';
      const who = document.createElement('span');
      who.className = 'dl-row-name';
      who.textContent = seatName(row.seat);
      const score = document.createElement('span');
      score.className = 'dl-row-score';
      score.textContent = `${row.total} แต้ม`;
      li.append(who, score);
      summaryListEl.appendChild(li);
    }
  }
  show(summaryEl);
  announce(`สรุปผล เงื่อนไข${CONDITION_LABEL[condition]} แต้มที่แพ้คือ ${outcome.losingScore} แต้ม`);
}

function resolve(): void {
  const outcome = resolveRound(activeTotals(), condition);
  if (outcome.status === 'FINAL_LOSER' && outcome.loserIndex !== null) {
    showFinal(active[outcome.loserIndex], outcome.losingScore);
    return;
  }
  showTiebreak(outcome.tiedIndexes.map((i) => active[i]), outcome.losingScore);
}

function showTiebreak(tiedSeats: number[], losingScore: number): void {
  if (tiebreakListEl) {
    tiebreakListEl.replaceChildren();
    for (const seat of tiedSeats) {
      const li = document.createElement('li');
      li.className = 'dl-row is-losing';
      const who = document.createElement('span');
      who.className = 'dl-row-name';
      who.textContent = seatName(seat);
      const score = document.createElement('span');
      score.className = 'dl-row-score';
      score.textContent = `${losingScore} แต้ม`;
      li.append(who, score);
      tiebreakListEl.appendChild(li);
    }
  }
  // Held on the button rather than in a module-level pending variable: the only way into the next
  // round is this control, so the two cannot drift apart.
  if (tiebreakStartEl) tiebreakStartEl.dataset.seats = tiedSeats.join(',');
  show(tiebreakEl);
  announce(`เสมอกันที่ ${losingScore} แต้ม ต้องทอยรอบตัดสิน ${tiedSeats.length} คน`);
}

function startTiebreak(): void {
  const raw = tiebreakStartEl?.dataset.seats ?? '';
  const seats = raw
    .split(',')
    .map((n) => Number(n))
    .filter((n) => Number.isInteger(n) && n >= 0 && n < names.length);
  if (seats.length < 2) return;
  roundNumber += 1;
  startRound(seats);
}

function showFinal(seat: number, losingScore: number): void {
  if (finalNameEl) finalNameEl.textContent = seatName(seat);
  if (finalDetailsEl) {
    finalDetailsEl.textContent = `ทอยได้แต้ม ${losingScore} แต้ม (โหมด${CONDITION_LABEL[condition]})`;
  }
  show(finalEl);
  announce(`ผู้แพ้ในเกมนี้คือ ${seatName(seat)} ทอยได้ ${losingScore} แต้ม`);
}

// ---- entry points ------------------------------------------------------------------------------

/** The rule screen's start, and the result screen's rematch: a round with every seated player. */
function begin(): void {
  roundNumber = 1;
  startRound(Array.from({ length: names.length }, (_, i) => i));
}

// ---- wiring ------------------------------------------------------------------------------------

setCondition(condition);
modeHighEl?.addEventListener('click', () => setCondition('HIGH_LOSES'));
modeLowEl?.addEventListener('click', () => setCondition('LOW_LOSES'));
beginEl?.addEventListener('click', begin);
rollEl?.addEventListener('click', roll);
nextEl?.addEventListener('click', nextTurn);
summaryContinueEl?.addEventListener('click', resolve);
tiebreakStartEl?.addEventListener('click', startTiebreak);
rematchEl?.addEventListener('click', begin);

// ADR-0071. The player screen opens first; its start hands the players to startWithPlayers, which
// shows this game's own option next, then play. Range from the module's own declared players field,
// so the screen can never admit a count the manifest does not claim; the screen clamps into it and
// owns the 20 ceiling. Read inline on purpose: scripts/seat-cap-check.mjs proves this hand-off
// structurally. The screen arms the whole of #app each time it opens, closes a dialog or drops its
// undo bar (ADR-0057), so nothing here arms it a second time.
const screen = playersEl
  ? mountPlayerScreen({
      root: playersEl,
      range: game.players,
      onStart: startWithPlayers,
      roundActive,
      abortRound: putAwayRound,
      onOpen: putAwayRound,
    })
  : null;
screen?.open();

// The result screen's new-setup control leads back to the players, which are the shared screen's.
// The round is over on that screen, so the screen opens straight away; it asks first only when the
// chrome's edit control is pressed mid-round (ruling 6).
newSetupEl?.addEventListener('click', () => screen?.open());

// One timer can be in flight (the tumble). Leaving the page without clearing it leaks it.
// persisted = bfcache, where the same round is still on screen on return.
window.addEventListener('pagehide', (event) => {
  if (!event.persisted && rollTimer !== null) {
    clearTimeout(rollTimer);
    rollTimer = null;
  }
});
