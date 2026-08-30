// Play-route controller for the timebomb game (gh#145). Two jobs, and deliberately nothing else:
//   1. render the player baseline screen ADR-0049 prescribes (mascot defaults ready to play, fixed
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
// The canonical mascot cast, ADR-0049 rulings 1-3: fixed order, identical in every game. It used to
// be a second copy of the freeze-tap mockup's array, diffed against it row by row; it is now the one
// shared definition, and src/play/mascot-defaults.test.mjs pins that definition to the mockup.
import { MASCOTS } from '../_mascots.ts';
// The drawn play surface. It reads the engine's fuse element and holds no clock of its own — see the
// header of that file for why that split is what keeps the absolute deadline the only clock.
import { startBombCanvas } from './bomb-canvas.ts';


// Range from the module's own declared players field, so this screen can never offer a count the
// manifest does not claim. ADR-0049 ruling 5 sets the site-wide ceiling at 20, which is also the
// length of the mascot list — this game's own maximum (10) sits under it.
const MIN_PLAYERS = game.players[0];
const MAX_PLAYERS = Math.min(game.players[1], MASCOTS.length);
const DEFAULT_COUNT = 6;
const NAME_MAX = 12;

/** localStorage, and NOT the shared roster: ADR-0049 ruling 4 makes each game own its player list, so
 *  a rename here must not travel to another game. Not the roster key either — that one is spelled in
 *  src/shell/roster.ts and nowhere else (ADR-0010, enforced by roster-lock-structure-check). */
const STORE_KEY = 'watduang:timebomb-players';

type Saved = { count: number; names: string[] };

let count = DEFAULT_COUNT;
// One entry per mascot seat, defaulted to the mascot's own name — "ready to play" means this array is
// already valid before the player touches anything (ADR-0049 ruling 3).
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

/** The context the engine mounts against. Shaped like the solo context in src/pages/game/[id].astro:
 *  the fields this route owns are answered here, and the one fact that belongs to the whole site —
 *  which games this group already played — is forwarded to the real shell session so the engine's
 *  markPlayed('timebomb') still lands somewhere real.
 *  setPlayers is a no-op on purpose: this route's identity is local (ADR-0049 ruling 4), and writing
 *  these names into the site-wide session slot is exactly how a rename would travel to another game. */
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

if (setupEl && beginEl) {
  // Same ghost-tap gate the engine's own screens use: a double-tap aimed at the game card that
  // navigated here must not start a round on arrival. The two count steppers are excepted — they are
  // tapped repeatedly on purpose, which is the premise ARM_DELAY_MS's comment says to check per
  // control before gating it.
  armAllButtons(setupEl, [decEl, incEl].filter((el): el is HTMLButtonElement => el !== null));
  beginEl.addEventListener('click', begin);
}
decEl?.addEventListener('click', () => setCount(count - 1));
incEl?.addEventListener('click', () => setCount(count + 1));

// The engine holds an AudioContext, a wake lock and a rAF loop; leaving the page without disposing
// leaks all three. persisted = bfcache, where the same round is resumed on return by the engine's own
// visibilitychange listener — disposing there would destroy a live round.
window.addEventListener('pagehide', (event) => {
  if (!event.persisted) game.dispose();
});
