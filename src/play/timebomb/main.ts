// Play-route controller for the timebomb game (gh#145). Two jobs, and deliberately nothing else:
//   1. render the player baseline screen ADR-0054 prescribes (mascot defaults ready to play, fixed
//      order, rename that stays local to THIS game), and
//   2. hand the finished roster to the SHIPPED ENGINE and mount it.
//
// The engine is src/games/timebomb.ts, imported and mounted as-is. That is the whole point of this
// port: the absolute-deadline clock, the wake lock, the arm gate on its own screens, the
// reduced-motion throttle and the markPlayed call all live there and are already tested
// (src/games/timebomb.test.mjs, plus fuse-clock.test.mjs beside this file). Re-deriving any of them
// here would silently lose behaviour that only shows up on a throttled tab or a sleeping screen.
//
// English comments throughout: the thai-comments carve-out (ADR-0050 ruling 5) covers what a mockup
// brought with it, and nothing here came from a mockup.
import game from '../../games/timebomb.ts';
import type { GameContext, GameSession } from '../../games/types.ts';
import { armAllButtons } from '../../games/_arm-gate.ts';
import { loadRoster } from '../../shell/roster';
import { loadSession } from '../../shell/session';
// The canonical mascot cast, ADR-0054 rulings 1-3: fixed order, identical in every game. It used to
// be a second copy of the freeze-tap mockup's array, diffed against it row by row; it is now the one
// shared definition, and src/play/mascot-defaults.test.mjs pins that definition to the mockup.
// resetCastNames is gh#177's wipe: it reads only the LENGTH of the cast handed to it and never looks
// inside an entry, which is why no typed name can survive a reset whatever this route passes.
import { MASCOTS, resetCastNames } from '../_mascots.ts';
// The drawn play surface. It reads the engine's fuse element and holds no clock of its own — see the
// header of that file for why that split is what keeps the absolute deadline the only clock.
import { startBombCanvas } from './bomb-canvas.ts';


// Range from the module's own declared players field, so this screen can never offer a count the
// manifest does not claim. ADR-0054 ruling 5 sets the site-wide ceiling at 20, which is also the
// length of the mascot list — this game's own maximum (10) sits under it.
const MIN_PLAYERS = game.players[0];
const MAX_PLAYERS = Math.min(game.players[1], MASCOTS.length);
const DEFAULT_COUNT = 6;
const NAME_MAX = 12;

/** localStorage, and NOT the shared roster. ADR-0053 rules the shared roster IS the identity channel
 *  for party games, and names this route the one deliberate exception: it is an engine-reuse retrofit,
 *  and migrating it would drop the lists players already have saved under this key. That is an open
 *  owner question, not a bug to fix in passing. Earlier revisions of this comment cited "ADR-0049
 *  ruling 4" for a per-game rule; ADR-0049 is about docs-only pushes and ADR-0050's ruling 4 is the
 *  port recipe, so that rule was never in either ADR. It did exist, as ADR-0054 ruling 4, which
 *  ADR-0053 supersedes. Not the roster key either — that one is spelled
 *  in src/shell/roster.ts and nowhere else (ADR-0010, enforced by roster-lock-structure-check). */
const STORE_KEY = 'watduang:timebomb-players';

type Saved = { count: number; names: string[] };

let count = DEFAULT_COUNT;
// One entry per mascot seat, defaulted to the mascot's own name — "ready to play" means this array is
// already valid before the player touches anything (ADR-0054 ruling 3).
let names: string[] = MASCOTS.map((m) => m.name);

function load(): void {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw) as Partial<Saved>;
    if (typeof saved.count === 'number' && Number.isFinite(saved.count)) {
      count = Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, Math.floor(saved.count)));
    }
    // Validate before trusting: this blob was written by a past version of this file.
    if (Array.isArray(saved.names)) {
      names = MASCOTS.map((m, i) => {
        const stored = saved.names?.[i];
        return typeof stored === 'string' && stored.trim() !== '' ? stored.slice(0, NAME_MAX) : m.name;
      });
    }
  } catch {
    // Private mode, quota, or a corrupt blob — the mascot defaults above are already playable.
  }
}

function save(): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ count, names } satisfies Saved));
  } catch {
    // A round that cannot be persisted still plays; nothing here is load-bearing for this round.
  }
}

const setupEl = document.getElementById('tb-setup');
const stageEl = document.getElementById('tb-stage');
const listEl = document.getElementById('tb-players');
const countEl = document.getElementById('tb-count-num');
const decEl = document.getElementById('tb-count-dec') as HTMLButtonElement | null;
const incEl = document.getElementById('tb-count-inc') as HTMLButtonElement | null;
const beginEl = document.getElementById('tb-begin') as HTMLButtonElement | null;
const canvasEl = document.getElementById('tb-canvas') as HTMLCanvasElement | null;
const liveEl = document.getElementById('tb-live');
const resetEl = document.getElementById('tb-reset-names') as HTMLButtonElement | null;
const resetDialogEl = document.getElementById('tb-reset-dialog') as HTMLDialogElement | null;
const resetCancelEl = document.getElementById('tb-reset-cancel') as HTMLButtonElement | null;
const resetConfirmEl = document.getElementById('tb-reset-confirm') as HTMLButtonElement | null;

/** The names the round actually plays with: the first `count` seats, with a blanked field falling back
 *  to its mascot default so the engine can never be handed an empty label. */
function playingNames(): string[] {
  return names.slice(0, count).map((name, i) => (name.trim() === '' ? MASCOTS[i].name : name.trim()));
}

function renderRows(): void {
  if (!listEl || !countEl) return;
  countEl.textContent = String(count);
  if (decEl) decEl.disabled = count <= MIN_PLAYERS;
  if (incEl) incEl.disabled = count >= MAX_PLAYERS;

  listEl.replaceChildren();
  for (let i = 0; i < count; i += 1) {
    const row = document.createElement('li');
    row.className = 'tb-player';

    const badge = document.createElement('span');
    badge.className = 'tb-player-emoji';
    badge.textContent = MASCOTS[i].emoji;
    badge.setAttribute('aria-hidden', 'true');

    // A native text input is the rename affordance — it brings focus, caret, keyboard and the length
    // cap for free, and maxLength as an ATTRIBUTE so a paste is clamped too, not just typing.
    const input = document.createElement('input');
    input.className = 'tb-player-name';
    input.type = 'text';
    input.value = names[i];
    input.maxLength = NAME_MAX;
    // The one numbered string left on this screen, and it stays numbered ON PURPOSE (gh#177). What
    // ADR-0054 removed from the other routes is the numbered default NAME — a value a player reads as
    // their own identity. This is not a value: it is the field's positional label, "the name of the
    // Nth player", it is never rendered as a name, never persisted, and never handed to the engine.
    // Sourcing it from the cast would make it lie the moment the player types (the label would still
    // say the mascot while the field says something else) and would give two seats the same label
    // once two seats are renamed alike, which is the one thing a positional label is for.
    input.setAttribute('aria-label', `ชื่อผู้เล่นคนที่ ${i + 1}`);
    input.addEventListener('input', () => {
      names[i] = input.value;
      save();
    });

    row.append(badge, input);
    listEl.appendChild(row);
  }
}

/** gh#177's wipe, and deliberately nothing else: no DOM write, no storage write. The redraw and the
 *  save belong to the confirm handler, which leaves this a pure state move that reset-names.test.mjs
 *  can lift out of this file and execute without a browser.
 *
 *  `count` is a separate variable and is not named here, which is how the confirm's promise that the
 *  party keeps its size is kept — not by remembering to restore it afterwards. */
function resetNames(): void {
  names = resetCastNames(names);
}

function setCount(next: number): void {
  const clamped = Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, next));
  if (clamped === count) return;
  count = clamped;
  save();
  renderRows();
}

/** The context the engine mounts against. Shaped like the solo context in src/pages/game/[id].astro:
 *  the fields this route owns are answered here, and the one fact that belongs to the whole site —
 *  which games this group already played — is forwarded to the real shell session so the engine's
 *  markPlayed('timebomb') still lands somewhere real.
 *  setPlayers is a no-op on purpose: this route's identity is local, which ADR-0053 records as this
 *  route's named exception rather than as the site-wide rule. Writing these names into the site-wide
 *  session slot is exactly how a rename would leave this game. */
function buildContext(): GameContext {
  const shell = loadSession();
  const session: GameSession = {
    players: playingNames(),
    setPlayers(): void {},
    played: shell.played,
    markPlayed(id: string): void {
      shell.markPlayed(id);
    },
    checkpoint: null,
    saveCheckpoint(): void {},
    clear(): void {},
  };
  return { roster: loadRoster(), session };
}

/** What the canvas cannot say. The bomb is pixels, so every phase change is mirrored into a live
 *  region as text; the holder's name and the fuse bar are already real DOM the engine keeps current.
 *  Driven by a MutationObserver rather than a poll: the engine replaces the stage's children wholesale
 *  on every screen change, which is exactly one childList mutation per phase. */
function announceFromStage(stage: HTMLElement): void {
  if (!liveEl) return;
  if (stage.querySelector('#tb-fuse')) {
    liveEl.textContent = 'ฟิวส์เริ่มเดินแล้ว ส่งมือถือต่อได้เลย';
    return;
  }
  if (stage.querySelector('#tb-again')) {
    const result = stage.querySelectorAll('p')[1]?.textContent?.trim();
    liveEl.textContent = result ? `ระเบิดแล้ว ${result}` : 'ระเบิดแล้ว';
    return;
  }
  liveEl.textContent = '';
}

function begin(): void {
  if (!setupEl || !stageEl) return;
  setupEl.hidden = true;
  stageEl.hidden = false;
  game.dispose(); // no-op before the first mount, as on the game page's own start path
  game.mount(stageEl, buildContext());
}

load();
renderRows();

if (canvasEl) startBombCanvas(canvasEl);
if (stageEl) {
  new MutationObserver(() => announceFromStage(stageEl)).observe(stageEl, { childList: true });
}

/** The two count steppers, excepted from every gate on this screen — they are tapped repeatedly on
 *  purpose, which is the premise ARM_DELAY_MS's comment says to check per control before gating one.
 *  Excepting them is also what keeps their page-owned `disabled` (the MIN/MAX readout renderRows
 *  writes) intact: a gate that collected them would clear it with its blanket re-enable. The range
 *  itself does not depend on that attribute either way — setCount clamps, so the attribute is the
 *  hint and the clamp is the invariant. */
function steppers(): HTMLButtonElement[] {
  return [decEl, incEl].filter((el): el is HTMLButtonElement => el !== null);
}

if (setupEl && beginEl) {
  // Same ghost-tap gate the engine's own screens use: a double-tap aimed at the game card that
  // navigated here must not start a round on arrival.
  armAllButtons(setupEl, steppers());
  beginEl.addEventListener('click', begin);
}
decEl?.addEventListener('click', () => setCount(count - 1));
incEl?.addEventListener('click', () => setCount(count + 1));

// Reset to the animal cast (gh#177, owner ruling 2026-08-31). The control lives on the SETUP screen
// only, and that is a decision, not an omission:
//   * begin() is one-way — it hides #tb-setup and nothing reverses it — so a reset placed anywhere
//     reachable mid-round would have to live inside #tb-stage, whose children the engine replaces
//     wholesale on every screen change (src/games/timebomb.ts). A control there is destroyed by the
//     next render, and putting it there means editing the shared engine for one route's feature.
//   * A way back already exists and is not this file's to build: the shared "แก้ผู้เล่น" pill in
//     src/shell/PlayExit.astro reloads the page, and THIS route opens on #tb-setup on every load
//     (the setup section ships with no `hidden` attribute and no code path skips it). So mid-round
//     the sequence is pill -> reload -> setup -> reset, with the round ended by the reload.
// Because the trigger cannot be reached while a round is running, this reset can never end a round,
// and the confirm copy is not asked to name a loss that cannot happen here.
//
// The copy is short-stick's (gh#174) with ONE clause adapted: "จำนวนผู้เล่นและกติกาที่ตั้งไว้จะยังคงอยู่"
// became "จำนวนผู้เล่นที่ตั้งไว้จะยังคงอยู่", because this route has no rule settings at all — its setup
// screen offers a count and names and nothing else, and promising that settings survive would promise
// something that does not exist. Everything the confirm does cost is still named: every typed name is
// replaced, and it does not come back (they are persisted under STORE_KEY, so the save below
// overwrites them for good).
if (resetEl && resetDialogEl && resetCancelEl && resetConfirmEl) {
  resetEl.addEventListener('click', () => {
    resetDialogEl.showModal();
    // ADR-0017. The confirm's two buttons appear directly over the control that was just pressed,
    // which is the sharpest ghost-tap shape there is, so they arrive inert. The safe answer is first
    // in the markup and that ordering is worth keeping — but it is NOT the guard, and nothing here
    // relies on it: this call disables the autofocused button immediately after showModal(), which
    // drops focus onto the dialog itself, so past this point no button is focused to be activated by
    // an Enter still held from the tap that opened this. The 400ms window is what protects it.
    armAllButtons(resetDialogEl);
  });
  resetCancelEl.addEventListener('click', () => resetDialogEl.close());
  resetConfirmEl.addEventListener('click', () => {
    resetDialogEl.close();
    resetNames();
    save();
    renderRows();
    // ADR-0017 again, for the shape the gh#174 review found the hard way: closing the dialog puts the
    // whole setup screen back under a finger that is still on the confirm's coordinates, and the gate
    // installed at first paint fired and removed itself long ago. Without this, the second contact of
    // a double-tap on the confirm lands live on #tb-begin and starts the round. renderRows() rebuilds
    // only <li> rows, which hold no <button>, so this re-arms controls that were never destroyed —
    // the hazard here is the reveal, not the rebuild.
    if (setupEl) armAllButtons(setupEl, steppers());
  });
}

// The engine holds an AudioContext, a wake lock and a rAF loop; leaving the page without disposing
// leaks all three. persisted = bfcache, where the same round is resumed on return by the engine's own
// visibilitychange listener — disposing there would destroy a live round.
window.addEventListener('pagehide', (event) => {
  if (!event.persisted) game.dispose();
});
