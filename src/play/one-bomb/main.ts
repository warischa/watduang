// Name entry for the one-bomb play route, and the reset control that goes with it.
//
// WHY A SEPARATE MODULE INSTEAD OF A roster-bridge.ts. Every other lifted route ships a mockup whose
// own setup screen already has one name field per seat, so its bridge only has to fill fields that
// exist. This mockup has none: its setup card is a player-count stepper and nothing else, and the
// engine labels every seat from its own fixed cast. There is nothing to seed, so this file BUILDS the
// name entry the way timebomb and dice-loser build theirs — at runtime, from this file, which is not
// one of the three basenames scripts/extract-mockup.mjs owns. Patching the lifted copy instead would
// put site-side code inside a file a re-extraction overwrites.
//
// NAMES NEVER TOUCH innerHTML. The one HTML string below is a static scaffold with no interpolation
// at all; every seat row, badge and field is built with createElement + textContent, so a player
// called `<img onerror=...>` renders as exactly that text.
//
// WHERE THE NAMES REACH, and the ceiling that is left. On the no-3D path this file owns the board,
// so a typed name reaches the turn banner, the live region, the player strip, every stone's label
// and the result copy. On the 3D path it still does not: the lifted engine is a sealed IIFE whose
// cast, turn banner and result copy are private to that closure, and it exposes no hook, so the
// names persist to the shared roster and seed the next game while the 3D board keeps the mockup's
// own animal labels. Closing THAT needs a hook in a file scripts/extract-mockup.mjs owns.
import { MAX_PLAYERS, MIN_PLAYERS } from '../../games/one-bomb.ts';
import { armAllButtons } from '../../games/_arm-gate.ts';
// gh#227: the site-wide mute preference, which this route's fallback path also reads and writes.
import { isMuted, setMuted } from '../../shell/audio.ts';
import { loadGroup, loadRoster } from '../../shell/roster';
import { saveOnSetupComplete, takeSetupEditRequest } from '../_setup-bridge';
// gh#175 / ADR-0054: the party opens on the shared animal cast, never on a numbered placeholder.
// resetCastNames is the reset control's wipe -- it reads only the array's length and keeps the count.
import { mascotEmoji, mascotNames, resetCastNames } from '../_mascots.ts';

const NAME_MAX = 12;

/** Per-game seat names, so a rename made here does not travel to another game mid-sitting. The shared
 *  roster is still what SEEDS this list, and saveOnSetupComplete writes the finished group back
 *  through roster.ts — the roster key itself is spelled in src/shell/roster.ts and nowhere else
 *  (ADR-0010, enforced by text). */
const STORE_KEY = 'watduang:one-bomb-players';

type Saved = { names: string[] };

/** The cast every seat opens on, kept as its own constant because a blanked field falls back to it
 *  at render time -- `names` itself is overwritten by the roster seed and by typing. */
const CAST = mascotNames(MAX_PLAYERS);

let names: string[] = [...CAST];

// The static scaffold: a container for the seat rows, the reset trigger, and its confirm dialog. It
// carries no player data, which is why it may be a string at all. The trigger's id is also what
// src/play/reset-control-pin.test.mjs looks for, so it has to be literal text in a real opening tag.
const SETUP_HTML = `
<ul class="ob-players" id="ob-players"></ul>
<button class="btnBase secondaryBtn ob-reset" id="ob-reset-names" type="button">รีเซ็ตเป็นชื่อสัตว์</button>
<dialog class="ob-reset-dialog" id="ob-reset-dialog">
  <h2>รีเซ็ตเป็นชื่อสัตว์</h2>
  <p>ชื่อที่พิมพ์ไว้ทั้งหมดจะหายไป และกลับไปเป็นชื่อสัตว์ประจำที่นั่ง จำนวนผู้เล่นยังเท่าเดิม</p>
  <div class="ob-reset-btns">
    <button class="btnBase secondaryBtn" id="ob-reset-cancel" type="button">ไม่รีเซ็ต</button>
    <button class="btnBase primaryBtn" id="ob-reset-confirm" type="button">รีเซ็ตเลย</button>
  </div>
</dialog>`;

// gh#170: the round's announcement channel. It ships EMPTY and lives outside the menu, because the
// menu is visibility:hidden during play and a live region inside it would be announced to nobody.
const LIVE_HTML = '<p class="ob-live" id="ob-live" role="status" aria-live="polite"></p>';

// gh#215: the panel that goes up when the 3D context is lost mid-round. role="alert" because it
// arrives with no tap of the player's own behind it — the browser took the context away and the
// board simply stopped being drawn.
//
// ADR-0008 is why the copy names the cost: a round is discarded here, and discarding one is
// acceptable only behind a labelled button the player pressed on purpose AND knowing what it costs.
// One button element and no anchor of any kind: this file is inside the play surface (ADR-0014).
const HALT_HTML = `
<div class="ob-halt" id="ob-halt" role="alert">
  <div class="ob-halt-card glassPanel">
    <p class="ob-halt-title">ภาพ 3 มิติหยุดทำงานกลางรอบ</p>
    <p class="ob-halt-body">เครื่องหยุดวาดกระดานให้เกมกลางคัน รอบที่ค้างอยู่ไปต่อไม่ได้แล้ว ถ้ากดปุ่มข้างล่าง เกมจะเริ่มใหม่ตั้งแต่รอบที่ 1 และคะแนนของทุกคนจะถูกล้างเป็น 0 จำนวนผู้เล่นยังเท่าเดิม</p>
    <button class="btnBase primaryBtn ob-halt-btn" id="ob-halt-restart" type="button">เริ่มรอบใหม่ (คะแนนเริ่มนับใหม่)</button>
  </div>
</div>`;

/** Nodes this file has taken the `id` attribute off, kept under the id it used to answer to. Empty
 *  until a lost 3D context fills it; see haltOnContextLoss for why an id is a severable thing. */
const rehomed = new Map<string, HTMLElement>();

const $ = <T extends HTMLElement>(id: string): T | null =>
  (rehomed.get(id) ?? document.getElementById(id)) as T | null;

// ---- persistence -------------------------------------------------------------------------------

function load(): void {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      // Validate before trusting: this blob was written by a past version of this file.
      const saved = JSON.parse(raw) as Partial<Saved>;
      if (Array.isArray(saved.names)) {
        names = names.map((fallback, i) => {
          const stored = saved.names?.[i];
          return typeof stored === 'string' && stored.trim() !== '' ? stored.slice(0, NAME_MAX) : fallback;
        });
      }
    }
  } catch {
    // Private mode, quota, or a corrupt blob — the cast defaults above are already playable.
  }
}

function save(): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ names } satisfies Saved));
  } catch {
    // A round that cannot be persisted still plays; nothing here is load-bearing for this round.
  }
}

/** The group the device last played beats the full roster, and either beats the cast defaults. Only
 *  seats the seed actually names are overwritten, so a name typed here survives a shorter roster.
 *  Returns how many seats the seed covers, which is also the count the stepper is driven to. */
function seedFromRoster(): number {
  const group = loadGroup();
  const seed = group.length >= MIN_PLAYERS ? group : loadRoster().names();
  if (seed.length < MIN_PLAYERS) return 0;
  names = names.map((current, i) => (seed[i] ? seed[i].slice(0, NAME_MAX) : current));
  return Math.min(MAX_PLAYERS, seed.length);
}

// ---- the seat rows -----------------------------------------------------------------------------

/** The engine owns the player count: the stepper's own display is the single reading of it, so this
 *  file never keeps a second copy that could disagree with the board. */
function currentCount(): number {
  const shown = Number.parseInt($('playerCountVal')?.textContent ?? '', 10);
  if (!Number.isFinite(shown)) return MIN_PLAYERS;
  return Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, shown));
}

function renderRows(): void {
  const listEl = $('ob-players');
  if (!listEl) return;
  const count = currentCount();

  listEl.replaceChildren();
  for (let i = 0; i < count; i += 1) {
    const row = document.createElement('li');
    row.className = 'ob-player';

    const badge = document.createElement('span');
    badge.className = 'ob-player-seat';
    // gh#209's animal glyph, not a seat number: this route builds its own setup rows, so the shared
    // shell panel's badge never reaches it.
    badge.textContent = mascotEmoji(i);
    badge.setAttribute('aria-hidden', 'true');

    // A native text input brings focus, caret, keyboard and the length cap for free — maxLength as an
    // ATTRIBUTE so a paste is clamped too, not just typing.
    const input = document.createElement('input');
    input.className = 'ob-player-name';
    input.type = 'text';
    input.value = names[i];
    input.maxLength = NAME_MAX;
    // POSITIONAL, and deliberately numbered: this says which ROW the field is, not who the player is.
    input.setAttribute('aria-label', `ชื่อผู้เล่นคนที่ ${i + 1}`);
    input.addEventListener('input', () => {
      names[i] = input.value;
      save();
    });

    row.append(badge, input);
    listEl.appendChild(row);
  }
}

/** gh#175. The wipe the reset confirm guards: the cast goes back to its animal names, and the
 *  array's own length is untouched — resetCastNames reads only that length, never an entry, so a
 *  typed name cannot survive this call. The player count is not touched here and cannot be: this
 *  route reads it off the engine's stepper, and nothing in this file writes it. */
function resetPlayerNames(): void {
  names = resetCastNames(names);
}

// ---- wiring ------------------------------------------------------------------------------------

/** Every reveal on this screen re-arms it, ADR-0014 and ADR-0057: a double-tap aimed at the control
 *  that caused the reveal must not fall through onto whatever now sits under the finger. Closing the
 *  confirm dialog counts as a reveal — the controls behind it are enabled and their arm window
 *  expired long ago, which is exactly why a second contact fires one. */
function armSetup(): void {
  const menu = document.querySelector<HTMLElement>('#menuOverlay .menuBox');
  if (menu) armAllButtons(menu);
}

/** The lifted engine's own screens, and the class each one is hidden by. Three different spellings,
 *  read off the engine rather than normalised: #hud and #menuOverlay carry `hidden` while they are
 *  away, #resultCard carries `show` while it is present, and the two modals carry `open`. */
const REVEAL_CONTAINERS: ReadonlyArray<{
  id: string;
  cls: string;
  visibleWhenPresent: boolean;
  modal?: true;
}> = [
  { id: 'hud', cls: 'hidden', visibleWhenPresent: false },
  { id: 'menuOverlay', cls: 'hidden', visibleWhenPresent: false },
  { id: 'resultCard', cls: 'show', visibleWhenPresent: true },
  { id: 'howModal', cls: 'open', visibleWhenPresent: true, modal: true },
  { id: 'settingsModal', cls: 'open', visibleWhenPresent: true, modal: true },
];

/** ADR-0014's gate, applied to screens this file cannot reach any other way. The engine is a sealed
 *  IIFE: every one of its reveals is a class flip inside a closure with no hook, and the reveal that
 *  matters most (the result card, which puts "รอบต่อไป" under the finger that just tapped the bomb)
 *  happens well after the tap that caused it. So the reveal is OBSERVED instead of called: one
 *  attribute observer per screen arms whatever became visible, which covers the asynchronous reveals
 *  and any reveal a later re-extraction adds, with no call site inside the lift to maintain.
 *
 *  ponytail: an observer, not a list of engine functions to shadow. The upgrade path, if the engine
 *  ever stops using classes to hide a screen, is a second predicate here — not a second mechanism. */
function watchEngineReveals(): void {
  if (typeof MutationObserver !== 'function') return;
  for (const { id, cls, visibleWhenPresent } of REVEAL_CONTAINERS) {
    const el = $(id);
    if (!el) continue;
    const visible = (): boolean => el.classList.contains(cls) === visibleWhenPresent;
    let wasVisible = visible();
    new MutationObserver(() => {
      const now = visible();
      if (now && !wasVisible) armAllButtons(el);
      wasVisible = now;
    }).observe(el, { attributes: true, attributeFilter: ['class'] });
  }
}

/** ADR-0057: closing a modal is itself a reveal. The control the modal was covering is enabled and
 *  its arm window expired long ago, which is why the second contact of the double-tap that closed
 *  the modal fires it. No class on the screen BEHIND the modal changes, so the observer above cannot
 *  see this one and it is armed explicitly.
 *
 *  The modal being closed is deliberately NOT in the set: on the pointerdown call below it is still
 *  open, and disabling its own close button there would eat the click that closes it. */
function armWhatTheModalCovered(): void {
  for (const { id, cls, visibleWhenPresent, modal } of REVEAL_CONTAINERS) {
    const el = modal ? null : $(id);
    if (el && el.classList.contains(cls) === visibleWhenPresent) armAllButtons(el);
  }
  // The BOARD, which no list above can hold: it is this route's own DOM rather than one of the
  // engine's screens, and the test that pins REVEAL_CONTAINERS to the engine's reveals is right to
  // keep it out. It is armed on every rebuild and on nothing else, so a modal opened mid-round left
  // every stone behind it enabled with its window long expired. Measured, not argued: with the
  // settings modal up, one 120ms press on the backdrop over a stone closed the modal AND took
  // `.ob-tile.is-open` from 0 to 1.
  const board = $('ob-board-wrap');
  if (board && !board.classList.contains('ob-away')) armAllButtons(board);
}

/** gh#170. The engine paints whose turn it is into the banner and the round number into its badge,
 *  and both are silent: a sighted player reads them, a screen-reader user is told nothing, because
 *  the engine writes textContent into elements that ship fixed prose around them. Mirroring those two
 *  writes into one empty region is what turns them into announcements.
 *
 *  Observed rather than called, for the same reason the reveals are: the engine exposes no hook. */
function announceTurns(): void {
  if (typeof MutationObserver !== 'function') return;
  const live = $('ob-live');
  const who = $('turnPlayerName');
  const round = $('roundLabel');
  if (!live || !who) return;

  let lastSaid = '';
  const say = (): void => {
    const name = (who.textContent ?? '').trim();
    if (name === '') return;
    const at = (round?.textContent ?? '').trim();
    const line = at === '' ? `ถึงตาของ ${name} แล้ว` : `${at} ถึงตาของ ${name} แล้ว`;
    // A repeat write is not a repeat announcement in every screen reader, and the engine repaints
    // the banner on frames where nothing changed.
    if (line === lastSaid) return;
    lastSaid = line;
    live.textContent = line;
  };

  const observer = new MutationObserver(say);
  observer.observe(who, { childList: true, characterData: true, subtree: true });
  if (round) observer.observe(round, { childList: true, characterData: true, subtree: true });
}

/** ADR-0046, reduce rather than remove. The engine's motion — the camera shake on a bomb, the seat
 *  bounce, the 3D tilt — is written from script into a WebGL frame, so no CSS media block can reach
 *  it; the query has to be read here. The engine already owns the switch (its settings screen offers
 *  it, defaulted ON), so this drives that control rather than adding a second idea of the same state:
 *  one flag, one owner, and a player who wants the motion back finds the toggle where it always was. */
function applyReducedMotion(): void {
  if (typeof window.matchMedia !== 'function') return;
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const toggle = $<HTMLButtonElement>('motionToggle');
  // Only when it is still ON: the engine's toggle flips on click, so clicking an already-off switch
  // would turn the motion back on for exactly the player who asked for less of it.
  if (toggle?.classList.contains('on')) toggle.click();
}

// ---- the no-3D board ---------------------------------------------------------------------------

/** ADR-0051: a route that uses WebGL ships a path that keeps the page usable when the context is
 *  unavailable. This is that path, and with no context the lifted engine takes its
 *  unsupported-notice branch and its ENTIRE body sits below that early return: the state machine,
 *  the stepper wiring, every screen transition. Nothing on the route moves, which is why the exit
 *  probe could find no control that transitions the screen.
 *
 *  WHERE `getContext('webgl')` REALLY RETURNS NULL, corrected after being measured rather than
 *  assumed. This comment used to claim every browser probe this repo runs launches Chrome with the
 *  GPU disabled, so the context is always absent. That is true of `--disable-gpu` ON A MAC only.
 *  On the CI runner the same flag leaves this route's canvas LIVE — established by signature, not
 *  by a direct read: CI's own fit line for this route matches a local `--use-angle=swiftshader`
 *  run and not a local `--disable-gpu` one. WHY the runner has a context is explicitly NOT known —
 *  ANGLE or SwiftShader on the runner image, llvmpipe, and a Chrome-version gate are all
 *  candidates and none has been measured. `scripts/canvas-ink-probe.mjs` now prints the in-page
 *  read from the runner itself so the next CI run settles it from evidence.
 *
 *  So the round is run from here, on a real DOM grid of real <button> stones. Same seat range, same
 *  board shapes, same ten rounds, same rule — one bomb, everyone who is not holding the phone when
 *  it goes off scores. The engine's own HUD nodes are REUSED rather than rebuilt: the turn banner,
 *  the round badge, the odds pill, the player strip, the result card and the toast all ship in
 *  markup.html and are painted from here.
 *
 *  SCOPE: BOTH LANES, by owner ruling 2026-09-10, and that reverses what this comment used to say.
 *  The grid was fallback-only, so on any device with a context the route shipped a canvas as its
 *  play surface and ZERO cells. Making the grid primary while the engine also ran would put two
 *  state machines on one HUD, so the engine's input is severed instead: `#gameCanvas` is
 *  `pointer-events: none` in overrides.css and severEngineLeafControls below replaces its leaf
 *  controls at mount. The engine ends up parked in its MENU state, and the owner was shown and
 *  accepted the cost — a device with a GPU gets no 3D stone board and no engine audio, only the DOM
 *  grid over a 3D backdrop of environment, idle mascots and embers. That is the ruled outcome, not
 *  a defect. The alternative needed a hook in main.js, which scripts/extract-mockup.mjs owns.
 *
 *  ponytail: the reveals here are the engine's own class writes, so the observer above arms them
 *  with no second mechanism. Only the board is armed explicitly, because it is not one of the five
 *  screens that observer watches. */

/** The board shape per seat count. A SECOND COPY of the engine's BOARD_GRID_MAP, which is private to
 *  a closure that never evaluates on this path — src/play/one-bomb/board-grid.test.mjs pins the two
 *  together so a re-extraction cannot move one without the other. */
const BOARD_GRID: Record<number, readonly [number, number]> = {
  2: [5, 5],
  3: [5, 6],
  4: [6, 6],
  5: [6, 7],
  6: [7, 7],
  7: [7, 8],
  8: [8, 8],
  9: [8, 9],
  10: [9, 9],
};

const TOTAL_ROUNDS = 10;

// The board's own scaffold. Static, no interpolation and no control: every stone is built by
// renderBoard with createElement, for the reason the file header gives.
const BOARD_HTML = `
<div class="ob-board-wrap ob-away" id="ob-board-wrap">
  <div class="ob-board" id="ob-board" role="group" aria-label="กระดานแผ่นหิน"></div>
</div>`;

const round = {
  n: 1,
  current: 0,
  scores: [] as number[],
  rows: 5,
  cols: 5,
  bomb: -1,
  /** Tile index -> the seat that opened it. This is what lets a cleared stone say WHO cleared it. */
  opened: new Map<number, number>(),
  /** Taps are only a move while a round is live: not on the menu, not behind the result card. */
  accepting: false,
  loser: -1,
};

let disarmBoard: (() => void) | null = null;
let toastTimer: ReturnType<typeof setTimeout> | undefined;

/** The name this seat plays under — the typed one, falling back to its cast name when the field is
 *  blank. This is the value that reaches the board, the banner and the strip. */
function seatName(index: number): string {
  const typed = (names[index] ?? '').trim();
  return typed === '' ? CAST[index % CAST.length] : typed;
}

function showToast(message: string): void {
  const toast = $('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 900);
}

/** The stepper the engine would own. Everything downstream reads the count back off the display it
 *  writes here, so this file still keeps no second copy of the player count. */
function setPlayerCount(next: number): void {
  const count = Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, next));
  const display = $('playerCountVal');
  if (display) display.textContent = String(count);
  const minus = $<HTMLButtonElement>('playerMinus');
  const plus = $<HTMLButtonElement>('playerPlus');
  // The gate reads a control the CALLER disabled as intent and hands it back disabled, so a stepper
  // parked at its bound stays parked across an arm window.
  if (minus) minus.disabled = count <= MIN_PLAYERS;
  if (plus) plus.disabled = count >= MAX_PLAYERS;
  const [rows, cols] = BOARD_GRID[count] ?? [5, 5];
  const desc = $('boardDimensionDesc');
  if (desc) desc.textContent = `กระดาน ${rows} × ${cols} · แผ่นหิน ${rows * cols} แผ่น`;
}

/** The strip along the top of the HUD, rebuilt from typed names. Built node by node with textContent
 *  — a seat label is player-typed text and never reaches a markup sink (ADR-0026). */
function paintStrip(count: number): void {
  const strip = $('playerStrip');
  if (!strip) return;
  strip.replaceChildren();
  for (let i = 0; i < count; i += 1) {
    const card = document.createElement('div');
    card.className = 'playerCard';
    if (i === round.current && round.accepting) card.classList.add('active');
    if (i === round.loser) card.classList.add('loser');

    const badge = document.createElement('div');
    badge.className = 'avatarBadge';
    badge.textContent = mascotEmoji(i);
    badge.setAttribute('aria-hidden', 'true');

    const info = document.createElement('div');
    info.className = 'pInfo';
    const who = document.createElement('div');
    who.className = 'pName';
    who.textContent = seatName(i);
    const score = document.createElement('div');
    score.className = 'pScore';
    score.textContent = `ชนะ: ${round.scores[i] ?? 0}`;
    info.append(who, score);

    card.append(badge, info);
    strip.appendChild(card);
  }
}

/** Every reading the HUD shows, from one place, so the banner and the odds pill cannot disagree
 *  about whose turn it is. announceTurns() observes #turnPlayerName, so writing a real name here is
 *  also what puts a real name into the live region. */
function paintHud(): void {
  const count = currentCount();
  const who = $('turnPlayerName');
  if (who) who.textContent = seatName(round.current);
  const avatar = $('turnAvatarEmoji');
  if (avatar) avatar.textContent = mascotEmoji(round.current);
  const label = $('roundLabel');
  if (label) label.textContent = `${round.n} / ${TOTAL_ROUNDS}`;

  const remaining = Math.max(1, round.rows * round.cols - round.opened.size);
  const odds = $('tensionLabel');
  if (odds) odds.textContent = `1 ใน ${remaining} (${((1 / remaining) * 100).toFixed(1)}%)`;
  const fill = $('tensionFill');
  if (fill) fill.style.width = `${Math.min(100, Math.max(6, (1 / remaining) * 100 * 2.2))}%`;

  paintStrip(count);
}

/** The board itself: one <button> per stone, sized from BOARD_GRID. Rebuilt whole on every round
 *  start, which is exactly the reveal that has to be armed — the tap that opens the next round lands
 *  on "รอบต่อไป", and the stone that replaces it must not take that finger's second contact
 *  (ADR-0014, ADR-0057). Within a round no arming is owed: a second contact lands on the stone that
 *  was just opened, and an opened stone is a toast, not a move. */
function renderBoard(): void {
  const host = $('ob-board');
  if (!host) return;
  host.style.setProperty('--ob-cols', String(round.cols));
  host.replaceChildren();
  for (let i = 0; i < round.rows * round.cols; i += 1) {
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'ob-tile';
    tile.dataset.idx = String(i);
    // POSITIONAL, like the setup rows': this names the stone, not the player. Who opened it is
    // written onto the label at the moment it is opened.
    tile.setAttribute('aria-label', `แผ่นหินที่ ${i + 1}`);
    host.appendChild(tile);
  }
  disarmBoard?.();
  disarmBoard = armAllButtons(host);
}

function finishRound(loser: number): void {
  const count = currentCount();
  for (let i = 0; i < count; i += 1) {
    if (i !== loser) round.scores[i] = (round.scores[i] ?? 0) + 1;
  }
  round.loser = loser;
  round.accepting = false;
  paintHud();

  const isFinal = round.n >= TOTAL_ROUNDS;
  const survivors = count - 1;
  const emoji = $('resultEmoji');
  if (emoji) emoji.textContent = isFinal ? '🏆' : '💥';
  const title = $('resultTitle');
  if (title) title.textContent = isFinal ? 'จบการแข่งขันแล้ว!' : `${seatName(loser)} โดนระเบิดตูม!`;

  let desc = `${mascotEmoji(loser)} ${seatName(loser)} พลาดเหยียบระเบิด! ${
    survivors === 1 ? 'อีกคนชนะในรอบนี้' : `อีก ${survivors} คนชนะในรอบนี้`
  }`;
  if (isFinal) {
    const best = Math.max(...round.scores.slice(0, count).map((s) => s ?? 0));
    const winners: string[] = [];
    for (let i = 0; i < count; i += 1) {
      if ((round.scores[i] ?? 0) === best) winners.push(`${mascotEmoji(i)} ${seatName(i)}`);
    }
    desc += ` 🥇 แชมเปี้ยน: ${winners.join(' และ ')} ชนะไปทั้งหมด ${best} รอบ!`;
  }
  const body = $('resultDesc');
  if (body) body.textContent = desc;
  const next = $('nextRoundBtn');
  if (next) next.textContent = isFinal ? 'เล่นอีกครั้ง 🔄' : 'รอบต่อไป ➔';
  // The observer above sees this class write and arms the card, the same way it does for the engine.
  $('resultCard')?.classList.add('show');
}

function openTile(index: number): void {
  if (!round.accepting || index < 0) return;
  const tile = $('ob-board')?.children[index] as HTMLButtonElement | undefined;
  if (!tile) return;
  if (round.opened.has(index)) {
    showToast('ช่องนี้เปิดไปแล้ว!');
    return;
  }

  const player = round.current;
  if (index === round.bomb) {
    tile.classList.add('is-bomb');
    tile.textContent = '💣';
    tile.setAttribute('aria-label', `แผ่นหินที่ ${index + 1} ระเบิด ${seatName(player)} แพ้รอบนี้`);
    finishRound(player);
    return;
  }

  round.opened.set(index, player);
  tile.classList.add('is-open');
  tile.textContent = mascotEmoji(player);
  tile.setAttribute('aria-label', `แผ่นหินที่ ${index + 1} ปลอดภัย ${seatName(player)} เปิดไว้`);
  round.current = (round.current + 1) % currentCount();
  paintHud();
}

function startRound(keepTurn: boolean): void {
  const count = currentCount();
  const [rows, cols] = BOARD_GRID[count] ?? [5, 5];
  round.rows = rows;
  round.cols = cols;
  round.bomb = Math.floor(Math.random() * rows * cols);
  round.opened.clear();
  round.loser = -1;
  if (!keepTurn) round.current = (round.n - 1) % count;
  round.accepting = true;
  renderBoard();
  paintHud();
}

function startMatch(): void {
  round.scores = Array.from({ length: currentCount() }, () => 0);
  round.n = 1;
  round.current = 0;
  $('menuOverlay')?.classList.add('hidden');
  $('hud')?.classList.remove('hidden');
  $('resultCard')?.classList.remove('show');
  $('ob-board-wrap')?.classList.remove('ob-away');
  startRound(true);
}

function advanceRound(): void {
  $('resultCard')?.classList.remove('show');
  if (round.n >= TOTAL_ROUNDS) {
    round.scores = Array.from({ length: currentCount() }, () => 0);
    round.n = 1;
  } else {
    round.n += 1;
  }
  startRound(false);
}

function backToMenu(): void {
  round.accepting = false;
  $('resultCard')?.classList.remove('show');
  $('hud')?.classList.add('hidden');
  $('ob-board-wrap')?.classList.add('ob-away');
  $('menuOverlay')?.classList.remove('hidden');
}

/** The engine's leaf controls: every id main.js binds a listener to that is not a container. At
 *  MODULE scope so both callers below read one list, and so the drift pin in
 *  webgl-context-loss.test.mjs — which parses this declaration out of the file — measures the list
 *  the common path actually uses.
 *
 *  DUPLICATED, ONCE, INSIDE haltOnContextLoss, and that is a constraint rather than a choice. That
 *  test executes the halt function's own bytes through `new Function` over a stub, with a fixed
 *  parameter list; an identifier declared out here is not in that scope, so hoisting the halt's copy
 *  would turn every behavioural leg of that file into a ReferenceError. The two copies are held
 *  together by execution, not by eye: the same test drives the halt with THIS list and asserts every
 *  id in it is dead afterwards, so the halt's copy cannot be a subset of this one. */
const ENGINE_LEAF_CONTROLS = [
  'homeBtn',
  'newRoundBtn',
  'nextRoundBtn',
  'menuResultBtn',
  'startPlayBtn',
  'playerMinus',
  'playerPlus',
  'soundToggle',
  'motionToggle',
  'particleToggle',
  'audioToggleBtn',
];

/** Owner ruling 2026-09-10: the DOM round is installed in BOTH lanes, so the engine must stop
 *  receiving taps even when it is alive. Its whole input surface is the canvas (severed in
 *  overrides.css) plus listeners bound directly to the ids above, so replacing those nodes drops
 *  every one of them. `removeEventListener` is not available: main.js binds anonymous functions
 *  inside a sealed IIFE.
 *
 *  WHAT SURVIVES A DEEP CLONE, enumerated rather than hoped for, because this repo has already
 *  shipped dead controls to it. Attributes all survive — id, class, type, title, the Thai accessible
 *  name, `data-*` — and so do children, which is why the emoji glyph on each icon button is still
 *  there. Listeners do not, which is the point. `disabled` survives too, because it is a reflected
 *  attribute, and that is the one piece that must not: an arm window open at this moment would have
 *  the gate's own re-enable land on the detached original and hand every later arm a control it
 *  reads as caller-disabled. So it is cleared explicitly. Nothing else is copied: focus is not, and
 *  the engine sets no expando property on any of these nodes (it exposes nothing at all).
 *
 *  The stepper's bounds are the one `disabled` state this route OWNS rather than inherits, and they
 *  are re-asserted by installNoWebglRound's closing setPlayerCount call, which runs right after
 *  this. Read back off the display, so no second copy of the count is introduced.
 *
 *  Idempotent on the no-3D lane: the engine bailed before binding anything there, so this replaces
 *  eleven nodes with eleven equivalent ones and severs nothing. One path, not two — a lane-dependent
 *  branch here would be a branch every browser claim then has to cover twice. */
function severEngineLeafControls(): void {
  for (const id of ENGINE_LEAF_CONTROLS) {
    const control = $<HTMLButtonElement>(id);
    if (!control) continue;
    const clone = control.cloneNode(true) as HTMLButtonElement;
    clone.disabled = false;
    control.replaceWith(clone);
  }
}

/** Everything the engine would have wired at the end of its own IIFE, plus the board. */
function installNoWebglRound(): void {
  const app = document.getElementById('app');
  if (!app) return;
  // The engine's notice tells the player the board cannot be shown and to go play something else.
  // That sentence stops being true here, and it lives in a file extract-mockup.mjs overwrites, so it
  // is replaced from this side rather than edited there.
  $('webglUnsupportedNotice')?.remove();
  app.insertAdjacentHTML('afterbegin', BOARD_HTML);

  // NO REPLACEMENT NOTICE, and that is a measured decision rather than an omission. A line in the
  // menu card explaining the missing 3D cost 58px of a 568px screen and was itself clipped off the
  // bottom of that card, so the one screen it was written for could not read it. A board that plays
  // is the explanation; ADR-0051 asks for a usable page, not an apology on it.

  $('ob-board')?.addEventListener('click', (ev) => {
    const tile = (ev.target as Element | null)?.closest<HTMLButtonElement>('.ob-tile');
    const idx = tile?.dataset.idx;
    if (idx !== undefined) openTile(Number.parseInt(idx, 10));
  });

  $('playerMinus')?.addEventListener('click', () => setPlayerCount(currentCount() - 1));
  $('playerPlus')?.addEventListener('click', () => setPlayerCount(currentCount() + 1));
  $('startPlayBtn')?.addEventListener('click', startMatch);
  $('newRoundBtn')?.addEventListener('click', () => startRound(true));
  $('nextRoundBtn')?.addEventListener('click', advanceRound);
  $('homeBtn')?.addEventListener('click', backToMenu);
  $('menuResultBtn')?.addEventListener('click', backToMenu);
  $('howToPlayBtn')?.addEventListener('click', () => $('howModal')?.classList.add('open'));
  $('settingsBtn')?.addEventListener('click', () => $('settingsModal')?.classList.add('open'));
  $('menuSettingsBtn')?.addEventListener('click', () => $('settingsModal')?.classList.add('open'));

  for (const btn of document.querySelectorAll<HTMLElement>('.closeModal')) {
    btn.addEventListener('click', () => {
      const target = btn.dataset.close;
      if (target) $(target)?.classList.remove('open');
    });
  }
  for (const overlay of document.querySelectorAll<HTMLElement>('.modalOverlay')) {
    overlay.addEventListener('pointerdown', (ev) => {
      if (ev.target === overlay) overlay.classList.remove('open');
    });
  }

  // The motion and particle switches carry no behaviour on this path — there is no camera to shake
  // and no particle system to feed. They still flip, so a player is not left tapping a control that
  // looks broken, and so applyReducedMotion's click on #motionToggle is still a real state change
  // rather than a no-op on a dead switch.
  for (const id of ['motionToggle', 'particleToggle']) {
    $(id)?.addEventListener('click', () => $(id)?.classList.toggle('on'));
  }

  // gh#227: the SOUND switch is different, and no longer decorative. The synth died with the engine,
  // so nothing on THIS path makes a noise — but the state the control describes is the device's, not
  // this route's, so it reads and writes the shared preference in src/shell/audio.ts. Otherwise a
  // player who mutes here finds the next route still audible. Both controls are painted from the
  // stored state before either listener attaches, because the device may already be muted.
  // No migration off any older per-route value: ADR-0064.
  const audio = $('audioToggleBtn');
  const paintSound = (): void => {
    $('soundToggle')?.classList.toggle('on', !isMuted());
    if (audio) audio.textContent = isMuted() ? '🔇' : '🔊';
  };
  paintSound();
  for (const el of [$('soundToggle'), audio]) {
    el?.addEventListener('click', () => {
      setMuted(!isMuted());
      paintSound();
    });
  }

  setPlayerCount(currentCount());
}

/** gh#215. A WebGL context lost mid-round used to leave a blank canvas under a live HUD: the engine
 *  keeps running, so the banner still names whose turn it is on a board nobody can see.
 *
 *  HALT, not resume, and not a silent restart. Resume is impossible — the engine's round state lives
 *  in a `game` object inside main.js's top-level IIFE with no export, no window assignment and no
 *  CustomEvent; the only projections that reach the DOM are the current player, the round number and
 *  a remaining-tile COUNT, so the revealed set and the bomb index cannot be recovered from this side.
 *  A silent restart is barred by ADR-0008. And preventDefault() is deliberately NOT called: the code
 *  that builds the GL programs ran once inside that sealed IIFE, so a `webglcontextrestored` this
 *  file cannot act on is worse than none.
 *
 *  THE ENGINE IS A ZOMBIE, NOT A CORPSE, and that is what shapes the order below. Its state machine
 *  runs off requestAnimationFrame and advances on accumulated time (a resolving state settles after
 *  ~0.42s, a detonating one finishes after ~1.3s), and GL calls against a lost context do not throw.
 *  So it keeps opening tiles and can still push its result card up UNDERNEATH this panel. Input is
 *  therefore severed at LOSS time, not when the restart button is pressed. */
function haltOnContextLoss(): void {
  // The canvas first: the engine's own no-3D bail path removes it too, and every pointer listener it
  // uses to open a tile sits on that element, so removing it is what cuts the tile input path.
  $('gameCanvas')?.remove();

  // LEAF CONTROLS ONLY. Clone-replacing a node drops every listener on it, which is the point — but a
  // CONTAINER cannot be replaced here: watchEngineReveals holds a MutationObserver on #hud,
  // #menuOverlay, #resultCard and the two modals, and finishRound depends on that observer to arm the
  // result card. Swapping one of those nodes would silently kill it.
  //
  // The list is the same set installNoWebglRound re-wires, which is what makes the restart below a
  // full re-wiring rather than a half one; webgl-context-loss.test.mjs pins the two against each
  // other so a re-extraction cannot make them drift.
  //
  // The three toggles and the audio button are in the set even though their handlers are idempotent
  // class writes, and the reason is the RESTART, not the halt: main.js binds them with a bare
  // `classList.toggle('on')`, so leaving them wired would have installNoWebglRound add a second bare
  // toggle and every tap would flip twice — a switch that looks broken, and applyReducedMotion's
  // click on #motionToggle would stop sticking. The modal openers and closers are left alone: those
  // write `add('open')` / `remove('open')`, which really is idempotent when wired twice.
  const ENGINE_LEAF_CONTROLS = [
    'homeBtn',
    'newRoundBtn',
    'nextRoundBtn',
    'menuResultBtn',
    'startPlayBtn',
    'playerMinus',
    'playerPlus',
    'soundToggle',
    'motionToggle',
    'particleToggle',
    'audioToggleBtn',
  ];
  //
  // A DEEP CLONE CARRIES `disabled` ACROSS, and that attribute is the one piece of the old node that
  // must not survive. A loss can land while an arm window has these controls inert — the HUD reveal
  // at match start, a modal close, the setup arm at page load — and the gate's own re-enable then
  // fires at the detached original. _arm-gate.ts reads an already-disabled control it does not own as
  // the caller's intent, so from the next arm onwards the clone is handed back disabled and nothing
  // in the session gives it back. The halt panel would open above a dead restart route.
  for (const id of ENGINE_LEAF_CONTROLS) {
    const control = $<HTMLButtonElement>(id);
    if (!control) continue;
    const clone = control.cloneNode(true) as HTMLButtonElement;
    clone.disabled = false;
    control.replaceWith(clone);
  }
  // The one exception to that blanket enable, re-asserted rather than hand-listed: the stepper's
  // bounds are this file's own state, not gate residue, and a clone born live at MIN_PLAYERS offers a
  // roster the board has no grid for. installNoWebglRound re-applies them, but only when the player
  // presses restart, which leaves the whole halt window wrong. Read back off the display, so no
  // second copy of the count is introduced here.
  setPlayerCount(currentCount());

  // THE HUD IS NOT SEVERABLE THE WAY THOSE CONTROLS ARE, and the reason is where the engine's node
  // references come from. Its listeners live ON the controls, so a clone drops them — but updateUI,
  // renderPlayerStrip and finishDetonation hold no references at all: each one calls
  // document.getElementById at WRITE time. Clone-replacing a HUD node would simply hand the zombie
  // its clone on the next frame. What has to be severed is the ID.
  //
  // So the node is rehomed — kept under its old name in the map `$` reads first — and then loses the
  // attribute. This file goes on finding it; the engine, which can only ask the document, finds
  // nothing. Node identity is preserved, which is what lets the announcement be stopped at the SOURCE
  // of the write instead of by disconnecting announceTurns' observer: that observer is attached to
  // these exact nodes and the round started by the button below needs it back, still attached.
  //
  // Nothing here depends on what the engine does with the nothing it finds. A null dereference ends
  // its rAF loop (the reschedule sits after update(), so the frame that throws is the last one), and a
  // re-extraction that reads defensively would write to no node at all. The HUD is untouched either
  // way, which is the point: the guarantee does not rest on a throw.
  //
  // AFTER the severing loop, deliberately: #nextRoundBtn is in both lists, and the node worth keeping
  // is the clone that replaced it, not the one the engine still holds a listener on.
  const ENGINE_HUD_WRITES = [
    'turnBanner',
    'turnPlayerName',
    'turnAvatarEmoji',
    'roundLabel',
    'tensionLabel',
    'tensionFill',
    'playerStrip',
    'resultEmoji',
    'resultTitle',
    'resultDesc',
    'nextRoundBtn',
    'resultCard',
  ];
  for (const id of ENGINE_HUD_WRITES) {
    const node = $(id);
    if (!node) continue;
    rehomed.set(id, node);
    node.removeAttribute('id');
  }

  const app = document.getElementById('app');
  if (!app) return;
  // LAST CHILD of #app, above the route's previous maximum z-index (the toast, at 30). Belt and
  // braces since the rehoming above: the engine can no longer find the result card to reveal it, but
  // a panel that sits under a card at 20 would be the wrong shape for a notice that must be read.
  // Deliberately not a line inside the menu card: a notice there was measured at 58px and clipped off
  // the bottom of a 568px screen.
  app.insertAdjacentHTML('beforeend', HALT_HTML);
  const panel = $('ob-halt');
  // ADR-0057 and ADR-0059. The loss can land with a finger already down on the canvas, so this panel
  // is a reveal under that finger and its button would otherwise take the release of a tap aimed at a
  // stone. armAllButtons as-is: it anchors to the browser's own input timestamp.
  if (panel) armAllButtons(panel);
  $('ob-halt-restart')?.addEventListener('click', () => {
    panel?.remove();
    // The no-3D board, because there is still no 3D: this rebuilds the board and re-wires every
    // control severed above. startMatch then resets the round number and the scores, and reads the
    // player count back off the stepper's display, so the party carries over.
    installNoWebglRound();
    startMatch();
  });
}

// ---- mount -------------------------------------------------------------------------------------

function mount(): void {
  // The chrome's "แก้ผู้เล่น" pill sets a session flag and reloads. This mockup boots to its own menu
  // every time, so the request is honoured just by arriving — but the flag still has to be CONSUMED
  // or the next party game opened in this tab reads a request that was never meant for it and drops
  // that player onto a setup screen they did not ask for.
  //
  // UNCONDITIONAL, and above every element lookup on purpose: a clear that sits behind an `if (el)`
  // is a clear that can be skipped on the real page too, and the tab keeps the stale flag.
  takeSetupEditRequest();

  const card = document.querySelector('#menuOverlay .setupCard');
  if (!card) return;
  card.insertAdjacentHTML('afterend', SETUP_HTML);

  load();
  const seeded = seedFromRoster();
  // UNCONDITIONAL, per the owner ruling 2026-09-10: the DOM round is the play surface in both
  // lanes, so the install no longer asks whether the engine died. Severing comes FIRST — install
  // binds this file's listeners to these same nodes, and severing after it would clone them away.
  //
  // Both calls sit BEFORE the stepper is driven, and that order is load-bearing: the engine's own
  // stepper listeners are gone by now, so this install is what makes #playerPlus move the count at
  // all — and the seeding loop below reads the count back after every click.
  severEngineLeafControls();
  installNoWebglRound();
  // gh#215. Optional chaining is load-bearing, not defensive habit: on the no-3D path above the
  // engine has already removed the canvas, and the listener must simply not attach there — a route
  // with no context to lose cannot lose one. `once` because there is no second loss to handle; the
  // canvas is gone by the end of the handler.
  $('gameCanvas')?.addEventListener('webglcontextlost', haltOnContextLoss, { once: true });
  // Driven through the mockup's OWN stepper rather than by writing the display: the engine keeps the
  // count inside its closure, so clicking is the only way to move both readings together. Bounded by
  // the seat range and by a no-progress guard, so a stepper that stops responding ends the loop
  // instead of spinning.
  const plus = $<HTMLButtonElement>('playerPlus');
  for (let guard = 0; plus && currentCount() < seeded && guard < MAX_PLAYERS; guard += 1) {
    const before = currentCount();
    plus.click();
    if (currentCount() === before) break;
  }

  renderRows();

  // Bubble phase on document: the engine's own listeners sit on the stepper buttons themselves, so by
  // the time this runs the count display already holds the new value.
  document.addEventListener('click', (ev) => {
    const target = ev.target as Element | null;
    if (target?.closest('#playerMinus, #playerPlus')) renderRows();
  });

  document.getElementById('app')?.insertAdjacentHTML('beforeend', LIVE_HTML);
  announceTurns();
  applyReducedMotion();
  watchEngineReveals();
  // The engine closes its modals two ways and they land on DIFFERENT clocks, so the same handler is
  // registered on both and neither is dropped.
  //
  // POINTERDOWN, capture, on document: the backdrop close fires on pointerdown, inside the engine's
  // own listener on the overlay. By the time any click runs, the overlay is already `visibility:
  // hidden` and the browser hit-tests the tap's release against whatever is underneath — so the
  // click of that ONE press lands on a stone. Measured, not argued: with reduced motion on (the
  // lifted CSS collapses the 250ms fade to 0.001s) one 120ms press on the backdrop over a stone
  // closed the modal and took `.ob-tile.is-open` from 0 to 1, with no button disabled anywhere.
  // Capture is what puts this ahead of the engine's own close, which is the only place a gate can
  // still disable the stone before that click is dispatched. Under normal motion the fade masks it
  // for 250ms, so the defect needed a press longer than the fade — an ordinary tap.
  //
  // CLICK, bubble: kept, and not redundant. The `.closeModal` button closes on CLICK, and a gate
  // built at pointerdown anchors its window to the PRESS while a gate built at click anchors to the
  // RELEASE (games/_arm-gate.ts, gh#190) — on a long press the pointerdown-anchored window is
  // already over by the time the finger lifts, which is the gap the release-anchored one covers.
  const armBehindModal = (ev: Event): void => {
    const target = ev.target as Element | null;
    if (target?.closest('.closeModal') || target?.classList.contains('modalOverlay')) {
      armWhatTheModalCovered();
    }
  };
  document.addEventListener('pointerdown', armBehindModal, true);
  document.addEventListener('click', armBehindModal);

  const dialog = $<HTMLDialogElement>('ob-reset-dialog');
  $('ob-reset-names')?.addEventListener('click', () => {
    dialog?.showModal();
    if (dialog) armAllButtons(dialog);
  });
  $('ob-reset-cancel')?.addEventListener('click', () => {
    dialog?.close();
    armSetup();
  });
  $('ob-reset-confirm')?.addEventListener('click', () => {
    resetPlayerNames();
    save();
    dialog?.close();
    renderRows();
    armSetup();
  });

  // The roster write-back, shared with every other route: whatever is in the fields when the player
  // starts the match becomes the device's group.
  saveOnSetupComplete('#startPlayBtn', '.ob-player-name', MAX_PLAYERS);

  armSetup();
}

mount();
