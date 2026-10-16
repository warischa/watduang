// Site-side module for the one-bomb play route: the round the party plays, and the shared player
// screen that seats it.
//
// WHY A SEPARATE MODULE. main.js is the lifted engine and scripts/extract-mockup.mjs owns it, so
// everything this site adds to the route lives here, in a file a re-extraction does not overwrite.
//
// PLAYERS (ADR-0071, gh#264). The shared player screen is mounted into #ob-player-screen in the
// menu, under the hero: its stepper, saved rows, names and start button replaced the mockup's count
// card and this file's own name rows, reset confirm and per-game list. The screen reads and writes
// the shared roster; this file spells no storage key at all. Its start hands the chosen players to
// startWithPlayers, and the round seats exactly those, in the order given. The one-time import of the
// list this route used to keep is the shared screen's (LEGACY_LISTS), not this file's.
//
// NAMES NEVER TOUCH innerHTML. The two HTML strings below are static scaffolds with no interpolation
// at all; every seat label, strip card and result line is written with textContent, so a player
// called `<img onerror=...>` renders as exactly that text.
//
// WHERE THE NAMES REACH. This file owns the round on both lanes (owner ruling 2026-09-10), so a
// player's name reaches the turn banner, the live region, the player strip, every stone's label and
// the result copy. The 3D backdrop the engine still draws carries no names: the lifted engine is a
// sealed IIFE parked in its menu state, and it is not handed the players.
// The module's default export is read for one field, `players`: the range the player screen admits is
// the one the manifest declares (ADR-0065), never a number restated here.
import game from '../../games/one-bomb.ts';
import { armAllButtons } from '../../games/_arm-gate.ts';
// gh#227: the site-wide mute preference, which this route's fallback path also reads and writes.
import { isMuted, setMuted } from '../../shell/audio.ts';
// ADR-0071: the one player screen every party route mounts. It owns the count, the names, the roster
// and the group; this file gets the chosen players back through startWithPlayers().
import { EDIT_EVENT, mountPlayerScreen, type Player } from '../_player-screen/player-screen.ts';
// gh#209: a seat's animal glyph, the fallback for a seat the screen did not name an animal for.
import { mascotEmoji } from '../_mascots.ts';

// gh#170: the round's announcement channel. It ships EMPTY and lives outside the menu, because the
// menu is visibility:hidden during play and a live region inside it would be announced to nobody.
const LIVE_HTML = '<p class="ob-live" id="ob-live" role="status" aria-live="polite"></p>';

const $ = <T extends HTMLElement>(id: string): T | null => document.getElementById(id) as T | null;

// ---- the seats -----------------------------------------------------------------------------------

/** Who this match plays with, in the order the shared screen handed them over (roster order). Each
 *  seat keeps the animal the screen gave it, so a group with someone sitting out keeps every animal
 *  on its owner. Empty until the first start. */
let playing: Player[] = [];

/** The seat count, read off the seats themselves -- no second copy of it is kept anywhere. */
function currentCount(): number {
  return playing.length;
}

/** The engine entry the player screen starts (ADR-0071): every player it is handed is seated, in the
 *  order given, and the match starts. The screen admits only the declared range, so the board table
 *  below has a shape for every count it can be handed. */
function startWithPlayers(players: Player[]): void {
  playing = [...players];
  startMatch();
}

// ---- wiring ------------------------------------------------------------------------------------
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
//
// gh#214 — role="grid" RATHER THAN role="group", and it is authored here on purpose. The tap-floor
// gate exempts a board's cells from the 44px WIDTH minimum, and the 2026-09-10 ruling keys that
// exemption on the ARIA role the cell declares in the DOM rather than on any list of routes or
// selectors. A cell role is only valid inside a row inside a grid, so the container has to say grid
// or renderBoard's cells are exempt by an attribute that means nothing. src/play/_board-roles.json
// records which route has a board and why, and carries the two player-facing costs the owner
// accepted with the ruling. This file is where the role can LIVE: markup.html, style.css and main.js
// are rewritten byte-for-byte from the mockup by scripts/extract-mockup.mjs, and main.ts is not.
const BOARD_HTML = `
<div class="ob-board-wrap ob-away" id="ob-board-wrap">
  <div class="ob-board" id="ob-board" role="grid" aria-label="กระดานแผ่นหิน"></div>
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
  /** A match is in progress: from a round starting until the last round's result. Wider than
   *  `accepting` on purpose -- the result card between two rounds still holds every score of a match
   *  that is not over, so editing the players there asks first (ADR-0071 ruling 6, ADR-0008). */
  live: false,
};

let disarmBoard: (() => void) | null = null;
let toastTimer: ReturnType<typeof setTimeout> | undefined;

/** The name this seat plays under, as the shared screen handed it over -- a row left blank there
 *  already arrives as its mascot's name. This is the value that reaches the board, the banner and the
 *  strip. */
function seatName(index: number): string {
  return playing[index]?.name ?? '';
}

/** The animal this seat plays as: the one the shared screen gave the player, so it stays on its owner
 *  when someone earlier in the roster sits the round out. */
function seatEmoji(index: number): string {
  return playing[index]?.emoji ?? mascotEmoji(index);
}

function showToast(message: string): void {
  const toast = $('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 900);
}

/** The strip along the top of the HUD, rebuilt from the seated names. Built node by node with
 *  textContent — a seat label is player-typed text and never reaches a markup sink (ADR-0026). */
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
    badge.textContent = seatEmoji(i);
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
  if (avatar) avatar.textContent = seatEmoji(round.current);
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
  let rowEl: HTMLElement | null = null;
  for (let i = 0; i < round.rows * round.cols; i += 1) {
    // gh#214 — ONE WRAPPER PER GRID ROW, and it is semantics, not layout. A cell role is only valid
    // inside a row inside a grid, so a cell role stamped onto stones parented straight to the grid
    // would be an attribute the exemption reads and no assistive technology can use. The wrapper
    // carries `display: contents` (overrides.css), which keeps every stone a direct grid ITEM of
    // .ob-board: the pitch, the column count and the rect a thumb hits are all unchanged, measured.
    if (i % round.cols === 0) {
      rowEl = document.createElement('div');
      rowEl.className = 'ob-board-row';
      rowEl.setAttribute('role', 'row');
      host.appendChild(rowEl);
    }
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'ob-tile';
    // The role the tap-floor gate's width exemption is keyed on (gh#214, ruling 2026-09-10), and the
    // only place it is written. src/play/_board-roles.json says which route this is owed on; the gate
    // reads it back off the rendered page and keys off no list of its own.
    tile.setAttribute('role', 'gridcell');
    tile.dataset.idx = String(i);
    // POSITIONAL, like the player screen's name fields: this names the stone, not the player. Who opened it is
    // written onto the label at the moment it is opened.
    tile.setAttribute('aria-label', `แผ่นหินที่ ${i + 1}`);
    (rowEl ?? host).appendChild(tile);
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
  // The last round settles the match: editing the players over its result loses nothing.
  if (isFinal) round.live = false;
  const survivors = count - 1;
  const emoji = $('resultEmoji');
  if (emoji) emoji.textContent = isFinal ? '🏆' : '💥';
  const title = $('resultTitle');
  if (title) title.textContent = isFinal ? 'จบการแข่งขันแล้ว!' : `${seatName(loser)} โดนระเบิดตูม!`;

  let desc = `${seatEmoji(loser)} ${seatName(loser)} พลาดเหยียบระเบิด! ${
    survivors === 1 ? 'อีกคนชนะในรอบนี้' : `อีก ${survivors} คนชนะในรอบนี้`
  }`;
  if (isFinal) {
    const best = Math.max(...round.scores.slice(0, count).map((s) => s ?? 0));
    const winners: string[] = [];
    for (let i = 0; i < count; i += 1) {
      if ((round.scores[i] ?? 0) === best) winners.push(`${seatEmoji(i)} ${seatName(i)}`);
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
  // BY SELECTOR, not by child index: the stones are parented to a per-row wrapper (renderBoard, for
  // the cell role's sake), so `children[index]` would return the row that holds five of them and the
  // wrong stone would open. querySelectorAll is in DOM order, which is the order the indices were
  // handed out in.
  const tile = $('ob-board')?.querySelectorAll<HTMLButtonElement>('.ob-tile')[index];
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
  tile.textContent = seatEmoji(player);
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
  round.live = true;
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

/** Puts the match away and brings the menu back, which is where the player screen lives. Used both
 *  when the players confirm ending a live match and every time the screen opens (the screen calls
 *  it as its onOpen), so whatever was up -- the board, the HUD, a result card -- is gone under it. */
function putAwayRound(): void {
  round.accepting = false;
  round.live = false;
  $('resultCard')?.classList.remove('show');
  $('hud')?.classList.add('hidden');
  $('ob-board-wrap')?.classList.add('ob-away');
  $('menuOverlay')?.classList.remove('hidden');
  releaseMenuHold();
}

/** gh#264: the menu card holds the shared player screen, so without the screen it is this game's own
 *  menu painted first. markup.html ships #menuOverlay held (overrides.css), and it is released on the
 *  screen's open -- putAwayRound is the onOpen, run in the task that shows the screen -- and on every
 *  path where no screen will come (boot, below). Idempotent: every later open just finds it gone.
 *
 *  The release is NOT animated. The lifted `.menuOverlay` fades opacity and visibility over 0.35s, so a
 *  plain class removal faded the menu -- and the player screen inside it -- in after the open, and
 *  the fit probe's control leg read the screen changing on its own (measured 2026-10-16, one changed
 *  screen per row, visible tab). So the release passes through `.ob-unheld` (overrides.css: no
 *  transition), the style is flushed in that state, and the class goes: the values are already the
 *  shown ones, so nothing is left to animate, and the menu's own later fades are untouched. */
function releaseMenuHold(): void {
  const menu = $('menuOverlay');
  if (!menu?.classList.contains('held-for-players')) return;
  menu.classList.add('ob-unheld');
  menu.classList.remove('held-for-players');
  void menu.offsetWidth; // forces the style of the shown, untransitioned state before the class goes
  menu.classList.remove('ob-unheld');
}

/** ADR-0071 ruling 6: a match in progress is asked about before the players change. */
function roundActive(): boolean {
  return round.live;
}

/** The house icon and the result card's way back. Both used to drop the match on the menu silently;
 *  they now send the request the chrome's edit control sends, so the shared screen asks first while a
 *  match is live and opens straight away once it is settled. */
function requestPlayers(): void {
  document.dispatchEvent(new CustomEvent(EDIT_EVENT));
}

/** The engine's leaf controls: every id main.js binds a listener to that is not a container. At
 *  MODULE scope so the drift pin in webgl-context-loss.test.mjs — which parses this declaration out
 *  of the file — measures the list the mount path actually uses.
 *
 *  ONE COPY, since the loss halt that carried the second one was retired (owner ruling 2026-09-11).
 *  The list is read by severEngineLeafControls at mount and pinned against installNoWebglRound's
 *  own wiring by that test, so a control a re-extraction adds still has to land in both places. */
const ENGINE_LEAF_CONTROLS = [
  'homeBtn',
  'newRoundBtn',
  'nextRoundBtn',
  'menuResultBtn',
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
 *  The mockup's count stepper and start button were on this list until gh#264 removed them from the
 *  page: the count and the start are the shared player screen's now (ADR-0071), whose controls the
 *  engine never bound.
 *
 *  Idempotent on the no-3D lane: the engine bailed before binding anything there, so this replaces
 *  every listed node with an equivalent one and severs nothing. One path, not two — a lane-dependent
 *  branch here would be a branch every browser claim then has to cover twice. */
function severEngineLeafControls(): void {
  // ADR-0046, and this is the LAST MOMENT it can be honoured. The engine's motion state is private
  // and reachable only through the click handler on its own switch, which the loop below is about to
  // drop — so a reduced-motion player would otherwise keep the idle mascot bounce and the camera
  // shake running behind the grid on every device with a GPU. applyReducedMotion is reused as
  // written rather than reimplemented; it clicks the switch only while it is still on, so the call
  // mount makes later finds nothing left to do and the no-3D lane is still covered by that one.
  applyReducedMotion();
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

  // ONCE, and the guard is kept even though the second caller — the retired halt panel's restart —
  // is gone. A second insert put a SECOND wrapper in the box, both at inset 0 and the same z-index,
  // with the stale one painting on top of the live one: measured on the build that shipped without
  // this guard, where after one loss and one restart the page held 2 wrappers and 50 stones, the
  // player saw the dead board, and taps mutated the invisible one. One line against that.
  //
  // NO REPLACEMENT NOTICE, and that is a measured decision rather than an omission. A line in the
  // menu card explaining the missing 3D cost 58px of a 568px screen and was itself clipped off the
  // bottom of that card, so the one screen it was written for could not read it. A board that plays
  // is the explanation; ADR-0051 asks for a usable page, not an apology on it.
  if (!$('ob-board')) {
    app.insertAdjacentHTML('afterbegin', BOARD_HTML);
    // Inside the guard with the insert: this listener is delegated to the host, which renderBoard
    // refills rather than replaces, so a second registration would open two stones per tap.
    $('ob-board')?.addEventListener('click', (ev) => {
      const tile = (ev.target as Element | null)?.closest<HTMLButtonElement>('.ob-tile');
      const idx = tile?.dataset.idx;
      if (idx !== undefined) openTile(Number.parseInt(idx, 10));
    });
  }

  // No start button here: the shared player screen's start begins the match, through
  // startWithPlayers (ADR-0071).
  $('newRoundBtn')?.addEventListener('click', () => startRound(true));
  $('nextRoundBtn')?.addEventListener('click', advanceRound);
  $('homeBtn')?.addEventListener('click', requestPlayers);
  $('menuResultBtn')?.addEventListener('click', requestPlayers);
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
}

/** gh#215's halt, retired by the owner ruling of 2026-09-11. What is left is the smallest honest
 *  answer to a lost context: drop the canvas that stopped drawing, and let the round carry on.
 *
 *  WHY NOTHING ELSE IS OWED. The halt severed the engine's leaf controls, re-asserted the stepper
 *  bound and took the ids off every HUD node the engine can still write, then put a panel up whose
 *  one button called startMatch. Since gh#150 option A the DOM tile grid is the play surface on
 *  BOTH lanes: severEngineLeafControls and installNoWebglRound run at mount, unconditionally, and
 *  the engine is parked in its menu state with its canvas input severed in overrides.css. Losing a
 *  context changes none of that — GL calls against a lost context do not throw and main.js has no
 *  listener of its own for the event — so the severing was a second copy of what mount already did,
 *  and the rehoming defended against writes that sit behind a round state the engine can no longer
 *  enter. The panel's only way forward zeroed every score and sent the party back to round 1 to
 *  recover a backdrop nobody was playing on. That cost is what the ruling retired.
 *
 *  NO NOTICE, DELIBERATELY, and on two grounds already recorded in this file. installNoWebglRound
 *  carries the measurement: a line explaining the missing 3D cost 58px of a 568px screen and was
 *  clipped off the bottom of the card it lived in, so the one screen it was written for could not
 *  read it. And a notice is a REVEAL — ADR-0057 and ADR-0059 would make it an armed region with a
 *  close path to gate, which is a new surface added to a page that is still fully playable. The
 *  board that goes on playing is the explanation; the backdrop simply stops being drawn.
 *
 *  NO preventDefault(), unchanged: it is what asks the browser for a `webglcontextrestored`, and the
 *  code that builds the GL programs ran once inside main.js's sealed IIFE. Nothing here could act on
 *  that event, so the route neither asks for it nor listens for it. */
function onContextLost(): void {
  // The canvas is removed rather than left blank so the two lanes end in the same shape (ADR-0051):
  // on the no-3D lane the engine removes it itself, and a canvas that no longer draws is a node
  // still announcing itself as the 3D game stage.
  $('gameCanvas')?.remove();
}

// ---- mount -------------------------------------------------------------------------------------

/** The screen's open, or false when there is no player-screen root and no screen will come (boot
 *  releases the menu either way it ends without one). */
function mount(): Promise<void> | false {
  const playersRoot = document.getElementById('ob-player-screen');
  if (!playersRoot) return false;

  // UNCONDITIONAL, per the owner ruling 2026-09-10: the DOM round is the play surface in both
  // lanes, so the install no longer asks whether the engine died. Severing comes FIRST — install
  // binds this file's listeners to these same nodes, and severing after it would clone them away.
  severEngineLeafControls();
  installNoWebglRound();
  // gh#215. Optional chaining is load-bearing, not defensive habit: on the no-3D path above the
  // engine has already removed the canvas, and the listener must simply not attach there — a route
  // with no context to lose cannot lose one. `once` because there is no second loss to handle; the
  // canvas is gone by the end of the handler.
  $('gameCanvas')?.addEventListener('webglcontextlost', onContextLost, { once: true });

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

  // ADR-0017, the double-tap aimed at the game card that navigated here: the menu's own buttons are on
  // screen from the first paint. The shared screen arms #app when it opens, but it opens only after it
  // has read the roster, so the menu is armed here as well -- before the screen is mounted into it,
  // so this gate holds only the menu's own controls and the screen's are left to the screen.
  const menu = document.querySelector<HTMLElement>('#menuOverlay .menuBox');
  if (menu) armAllButtons(menu);

  // ADR-0071: the shared player screen, under the hero and above the game's own how-to and settings.
  // Range from the module's own declared players field, so the screen can never offer a count the
  // manifest does not claim; the screen clamps into it and owns the 20 ceiling. Read inline on
  // purpose: scripts/seat-cap-check.mjs proves this hand-off structurally, and runs startWithPlayers.
  const screen = mountPlayerScreen({
    root: playersRoot,
    range: game.players,
    onStart: startWithPlayers,
    roundActive,
    abortRound: putAwayRound,
    onOpen: putAwayRound,
  });
  return screen.open();
}

/** gh#264: the menu's hold is released by the screen's open, so every boot that ends with no screen
 *  coming releases it here instead -- no root to mount into, a mount that threw, or an open that
 *  failed later (a rejected migration, REFUTE round 2) -- and the menu shows as it did before the hold
 *  existed. Both failures are rethrown, so each stays as loud as it was: the synchronous one throws,
 *  the asynchronous one stays an unhandled rejection. */
function boot(): void {
  try {
    const opening = mount();
    if (!opening) {
      releaseMenuHold();
      return;
    }
    void opening.catch((err: unknown) => {
      releaseMenuHold();
      throw err;
    });
  } catch (err) {
    releaseMenuHold();
    throw err;
  }
}

boot();
