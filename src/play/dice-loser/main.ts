// Play-route controller for the dice-loser game (gh#156). It owns the screens; NOT the rule.
//
// The losing rule lives in src/games/dice-loser.ts and is imported here — `rollDice` and
// `resolveRound` are the only things that decide anything, and they are the functions
// src/games/dice-loser.test.mjs pins. Re-deriving "highest total loses" in this file would put a
// second, untested copy of the game's one rule on the shipped path.
//
// NAMES NEVER TOUCH innerHTML. Every row, pill, summary card and result line below is built with
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
import { loadGroup, loadRoster, saveGroup } from '../../shell/roster';
import { saveOnSetupComplete, takeSetupEditRequest } from '../_setup-bridge';
// gh#175 / ADR-0054: the party opens on the shared animal cast, never on a numbered placeholder.
// resetCastNames is the reset control's wipe -- it reads only the array's length and keeps the count.
import { mascotNames, resetCastNames } from '../_mascots.ts';

const MIN_PLAYERS = game.players[0];
const MAX_PLAYERS = game.players[1];
const DEFAULT_COUNT = 3;
const NAME_MAX = 12;

/** Per-game seat names, so a rename made here does not travel to another game mid-sitting. The shared
 *  roster is still what SEEDS this list, and `saveOnSetupComplete` below writes the finished group
 *  back through roster.ts — the roster key itself is spelled in src/shell/roster.ts and nowhere else
 *  (ADR-0010, enforced by text). */
const STORE_KEY = 'watduang:dice-loser-players';

/** One seat's default name, from the shared cast (gh#175). Before gh#175 this was kept byte-exact
 *  to the mockup's numbered placeholder ("ผู้เล่น 1", "ผู้เล่น 2"); that claim is gone now that the
 *  default routes through the shared cast instead. Routed through mascotNames so the wrap past the
 *  cast's end has exactly one definition, in _mascots.ts, and none here. */
const defaultName = (seat: number): string => mascotNames(seat + 1)[seat];

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

type Saved = { count: number; names: string[] };

let count = DEFAULT_COUNT;
let names: string[] = Array.from({ length: MAX_PLAYERS }, (_, i) => defaultName(i));
let condition: LoseCondition = 'HIGH_LOSES';

/** Seats still in the game, as indexes into `names`. A tiebreak round narrows this and never grows it. */
let active: number[] = [];
let turnIdx = 0;
let roundNumber = 1;
/** seat index -> that seat's roll THIS round. Cleared at the start of every round. */
let rolls = new Map<number, Roll>();
let rollTimer: ReturnType<typeof setTimeout> | null = null;

// ---- persistence -------------------------------------------------------------------------------

function load(): void {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      // Validate before trusting: this blob was written by a past version of this file.
      const saved = JSON.parse(raw) as Partial<Saved>;
      if (typeof saved.count === 'number' && Number.isFinite(saved.count)) {
        count = Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, Math.floor(saved.count)));
      }
      if (Array.isArray(saved.names)) {
        names = names.map((fallback, i) => {
          const stored = saved.names?.[i];
          return typeof stored === 'string' && stored.trim() !== '' ? stored.slice(0, NAME_MAX) : fallback;
        });
      }
    }
  } catch {
    // Private mode, quota, or a corrupt blob — the defaults above are already playable.
  }

  // Seed from the shared roster: the group the device last played beats the full roster, and either
  // beats the numbered defaults. Only seats the group actually names are overwritten, so a name typed
  // on this route survives a roster that is shorter than the count.
  const group = loadGroup();
  const seed = group.length >= MIN_PLAYERS ? group : loadRoster().names();
  if (seed.length >= MIN_PLAYERS) {
    count = Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, seed.length));
    names = names.map((current, i) => (seed[i] ? seed[i].slice(0, NAME_MAX) : current));
  }
}

function save(): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ count, names } satisfies Saved));
  } catch {
    // A round that cannot be persisted still plays; nothing here is load-bearing for this round.
  }
}

// ---- elements ----------------------------------------------------------------------------------

const $ = <T extends HTMLElement>(id: string): T | null => document.getElementById(id) as T | null;

const setupEl = $('dl-setup');
const playEl = $('dl-play');
const summaryEl = $('dl-summary');
const tiebreakEl = $('dl-tiebreak');
const finalEl = $('dl-final');
const liveEl = $('dl-live');

const listEl = $('dl-players');
const countEl = $('dl-count-num');
const decEl = $<HTMLButtonElement>('dl-count-dec');
const incEl = $<HTMLButtonElement>('dl-count-inc');
const beginEl = $<HTMLButtonElement>('dl-begin');
const modeHighEl = $<HTMLButtonElement>('dl-mode-high');
const modeLowEl = $<HTMLButtonElement>('dl-mode-low');
const resetNamesEl = $<HTMLButtonElement>('dl-reset-names');
const resetDialogEl = $<HTMLDialogElement>('dl-reset-dialog');
const resetCloseEl = $<HTMLButtonElement>('dl-reset-close');
const resetCancelEl = $<HTMLButtonElement>('dl-reset-cancel');
const resetConfirmEl = $<HTMLButtonElement>('dl-reset-confirm');

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

/** The label a seat plays under — a blanked field falls back so no screen can render an empty name. */
function seatName(seat: number): string {
  const typed = names[seat]?.trim();
  return typed ? typed : defaultName(seat);
}

// ---- setup screen ------------------------------------------------------------------------------

function renderRows(): void {
  if (!listEl || !countEl) return;
  countEl.textContent = String(count);
  if (decEl) decEl.disabled = count <= MIN_PLAYERS;
  if (incEl) incEl.disabled = count >= MAX_PLAYERS;

  listEl.replaceChildren();
  for (let i = 0; i < count; i += 1) {
    const row = document.createElement('li');
    row.className = 'dl-player';

    const badge = document.createElement('span');
    badge.className = 'dl-player-seat';
    badge.textContent = String(i + 1);
    badge.setAttribute('aria-hidden', 'true');

    // A native text input brings focus, caret, keyboard and the length cap for free — maxLength as an
    // ATTRIBUTE so a paste is clamped too, not just typing.
    const input = document.createElement('input');
    input.className = 'dl-player-name';
    input.type = 'text';
    input.value = names[i];
    input.maxLength = NAME_MAX;
    input.setAttribute('aria-label', `ชื่อผู้เล่นคนที่ ${i + 1}`);
    input.addEventListener('input', () => {
      names[i] = input.value;
      save();
    });

    row.append(badge, input);
    listEl.appendChild(row);
  }
}

function setCount(next: number): void {
  const clamped = Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, next));
  if (clamped === count) return;
  count = clamped;
  save();
  renderRows();
}

/** gh#175. The wipe the reset confirm guards: the cast goes back to its animal names, and the array's
 *  own length is untouched -- resetCastNames reads only that length, never an entry, so a typed name
 *  cannot survive this call. `names` is fixed at MAX_PLAYERS regardless of `count` (load() and the
 *  count stepper both index into it that way), so resetting the whole array also clears the names of
 *  seats currently hidden past `count`, not just the visible ones -- there is no "count" to keep here
 *  because count is a separate field this function never touches. */
function resetPlayerNames(): void {
  names = resetCastNames(names);
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

function renderPips(el: HTMLElement | null, face: number): void {
  if (!el) return;
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

  for (const el of dieEls) {
    el?.classList.remove('is-rolling');
    renderPips(el, 0);
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

function begin(): void {
  roundNumber = 1;
  startRound(Array.from({ length: count }, (_, i) => i));
}

function backToSetup(): void {
  renderRows();
  show(setupEl);
}

// ---- wiring ------------------------------------------------------------------------------------

load();
renderRows();
setCondition(condition);
// The write-back that makes whatever this setup finishes with the group the NEXT game inherits, and
// the chrome's edit-players pill. This route opens on its setup screen either way, so taking the flag
// only clears it.
saveOnSetupComplete('#dl-begin', '.dl-player-name');
takeSetupEditRequest();
show(setupEl);

decEl?.addEventListener('click', () => setCount(count - 1));
incEl?.addEventListener('click', () => setCount(count + 1));
modeHighEl?.addEventListener('click', () => setCondition('HIGH_LOSES'));
modeLowEl?.addEventListener('click', () => setCondition('LOW_LOSES'));

// Reset Player Names Dialog (gh#175). Asked because the answer is destructive: every typed name is
// replaced. #dl-reset-dialog is not reached through show(), so it is armed here explicitly rather
// than inheriting the panel-swap arming show() gives the five main screens.
//
// The copy in markup.html names every loss this causes (docs/agents/src-edit-rules.md): all typed
// names go and do not come back; the player count and the win condition stay. Do NOT read the close
// X sitting before the destructive button in the markup as what protects this dialog -- armAllButtons
// disables the autofocused close control the instant showModal() returns and drops focus to <body>,
// so nothing is focused at all once the dialog is armed. What actually protects it is the 400ms gate,
// not the button order (same mechanism note as short-stick's reset confirm, gh#174).
resetNamesEl?.addEventListener('click', () => {
  if (!resetDialogEl) return;
  resetDialogEl.showModal();
  armAllButtons(resetDialogEl);
});
const closeResetDialog = (): void => {
  if (!resetDialogEl) return;
  resetDialogEl.close();
  // ADR-0017. Closing this dialog is ITSELF a reveal, and that -- not a rebuild -- is the hazard.
  // #dl-begin and the seat steppers sat behind the dialog a frame ago, enabled, their 400ms window
  // long expired. A double-tap on close, cancel or confirm therefore puts the second contact on
  // #dl-begin and starts the round with the phone still in the first player's hand. Armed in this
  // shared closer rather than in the three handlers, so no branch out of this dialog can miss it.
  if (setupEl) armAllButtons(setupEl);
};
resetCloseEl?.addEventListener('click', closeResetDialog);
resetCancelEl?.addEventListener('click', closeResetDialog);
resetConfirmEl?.addEventListener('click', () => {
  closeResetDialog();
  resetPlayerNames();
  save();
  // renderRows() rebuilds only <li> rows holding a seat badge and a name <input>, so it creates no
  // button of its own. That was once written here as the reason no re-arm was needed; it is the
  // wrong model and adversarial review caught it. The reveal that matters is the DIALOG CLOSING
  // over the live setup screen, which closeResetDialog above now arms for all three branches.
  renderRows();
});

beginEl?.addEventListener('click', () => {
  // The group the round actually plays with, written through roster.ts — saveOnSetupComplete reads
  // the inputs, and this covers the seats whose field was left at its default.
  saveGroup(Array.from({ length: count }, (_, i) => seatName(i)));
  begin();
});
rollEl?.addEventListener('click', roll);
nextEl?.addEventListener('click', nextTurn);
summaryContinueEl?.addEventListener('click', resolve);
tiebreakStartEl?.addEventListener('click', startTiebreak);
rematchEl?.addEventListener('click', begin);
newSetupEl?.addEventListener('click', backToSetup);

// The count steppers are excepted from the setup screen's arm gate: they are tapped repeatedly on
// purpose, which is the premise the gate's own comment says to check per control before gating it.
if (setupEl) {
  armAllButtons(setupEl, [decEl, incEl].filter((el): el is HTMLButtonElement => el !== null));
}

// One timer can be in flight (the tumble). Leaving the page without clearing it leaks it.
// persisted = bfcache, where the same round is still on screen on return.
window.addEventListener('pagehide', (event) => {
  if (!event.persisted && rollTimer !== null) {
    clearTimeout(rollTimer);
    rollTimer = null;
  }
});
