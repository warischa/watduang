// Play-route controller for the timebomb game (gh#145). Two jobs, and deliberately nothing else:
//   1. mount the shared player screen (ADR-0071, gh#264) into #tb-setup -- the stepper, the saved
//      roster, the names and the start button are all its, read from and written to the shared
//      roster like every other party game -- and
//   2. hand the players it starts with to the SHIPPED ENGINE and mount it.
//
// The engine is src/games/timebomb.ts, imported and mounted as-is. That is the whole point of this
// port: the absolute-deadline clock, the wake lock, the arm gate on its own screens, the
// reduced-motion throttle and the markPlayed call all live there and are already tested
// (src/games/timebomb.test.mjs, plus fuse-clock.test.mjs beside this file). Re-deriving any of them
// here would silently lose behaviour that only shows up on a throttled tab or a sleeping screen.
//
// This route used to keep its own player list under a per-game key, the one exception ADR-0053 made
// to the shared roster. ADR-0071 superseded that exception: the list is migrated once, by the shared
// screen, and this file spells no storage key at all.
//
// English comments throughout: the thai-comments carve-out (ADR-0050 ruling 5) covers what a mockup
// brought with it, and nothing here came from a mockup.
import game from '../../games/timebomb.ts';
import type { GameContext, GameSession } from '../../games/types.ts';
import { armAllButtons } from '../../games/_arm-gate.ts';
// gh#165. The site-wide muted flag lives with the synth that obeys it (src/shell/audio.ts), so this
// route reads and writes it and spells the storage key nowhere. gh#227 points the other routes'
// existing toggles at these same two functions.
import { isMuted, setMuted } from '../../shell/audio.ts';
import { loadRoster } from '../../shell/roster';
import { loadSession } from '../../shell/session';
import { mountPlayerScreen, type Player } from '../_player-screen/player-screen.ts';
// The drawn play surface. It reads the engine's fuse element and holds no clock of its own — see the
// header of that file for why that split is what keeps the absolute deadline the only clock.
import { startBombCanvas } from './bomb-canvas.ts';

const setupEl = document.getElementById('tb-setup');
const stageEl = document.getElementById('tb-stage');
const canvasEl = document.getElementById('tb-canvas') as HTMLCanvasElement | null;
const liveEl = document.getElementById('tb-live');
const topEl = document.getElementById('tb-top');
const muteEl = document.getElementById('tb-mute') as HTMLButtonElement | null;

/** Who this round plays with, in the order the shared screen handed them over (roster order). */
let playing: string[] = [];

/** The context the engine mounts against. Shaped like the solo context in src/pages/game/[id].astro:
 *  the fields this route owns are answered here, and the one fact that belongs to the whole site —
 *  which games this group already played — is forwarded to the real shell session so the engine's
 *  markPlayed('timebomb') still lands somewhere real.
 *  setPlayers keeps this context's own list and persists nothing: the shared screen already wrote the
 *  roster and the group when start was pressed (ADR-0071), and the site-wide session slot is the game
 *  page's checkpoint machinery, which this route has never written (ADR-0010). The engine does not
 *  call it today; it is answered rather than stubbed so a future call cannot silently do nothing. */
function buildContext(): GameContext {
  const shell = loadSession();
  const session: GameSession = {
    players: [...playing],
    setPlayers(names: string[]): void {
      session.players = [...names];
    },
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

function begin(players: Player[]): void {
  if (!stageEl) return;
  playing = players.map((p) => p.name);
  stageEl.hidden = false;
  game.dispose(); // no-op before the first mount, as on the game page's own start path
  game.mount(stageEl, buildContext());
}

/** Puts the round away: the engine's teardown empties the stage (the canvas reads that and hides
 *  itself), and the stage is hidden so the player screen is the only thing on the page. Used both
 *  when the players confirm ending a live round and when the screen opens over a finished one. */
function putAwayRound(): void {
  game.dispose();
  if (stageEl) stageEl.hidden = true;
}

/** A round is live while the fuse is burning. The result screen after the bang is not one: editing
 *  the players there loses nothing, so the screen opens without asking (ADR-0071 ruling 6). */
function roundActive(): boolean {
  return !!stageEl && !stageEl.hidden && !!stageEl.querySelector('#tb-fuse');
}

// gh#185. The chrome's edit-players pill used to write a sessionStorage flag and reload; on this
// route it now reopens the shared screen in place instead, and the shared screen clears any flag
// already in the tab when it mounts, so this file no longer reads it.

if (canvasEl) startBombCanvas(canvasEl);
if (stageEl) {
  new MutationObserver(() => announceFromStage(stageEl)).observe(stageEl, { childList: true });
}

if (setupEl) {
  // Range from the module's own declared players field, so this screen can never offer a count the
  // manifest does not claim; the shared screen clamps into it and owns the 20 ceiling. Read inline
  // on purpose: scripts/seat-cap-check.mjs proves this hand-off structurally.
  const screen = mountPlayerScreen({
    root: setupEl,
    range: game.players,
    onStart: begin,
    roundActive,
    abortRound: putAwayRound,
    onOpen: putAwayRound,
  });
  screen.open();
}

/** gh#165. The toggle's face, re-read from the stored flag rather than from a local boolean: the flag
 *  is site-wide (src/shell/audio.ts), so another tab or an earlier round may already have set it and
 *  a remembered value here would be a second, drifting copy of the truth. No aria-pressed and no
 *  label rewrite — naming these controls is gh#211 and is deliberately not absorbed here. */
function renderMute(): void {
  if (!muteEl) return;
  muteEl.textContent = isMuted() ? '🔇' : '🔊';
}

if (muteEl && topEl) {
  renderMute();
  muteEl.addEventListener('click', () => {
    setMuted(!isMuted());
    renderMute();
  });
  // ADR-0017, and the case that is easy to miss because nothing is revealed by a script here: the
  // header is on screen from the first paint, so the double-tap aimed at the game card that
  // navigated to this route lands its second contact on a live control. The shared screen arms
  // #app when it opens, but it opens only after it has read the roster, so the header is armed here
  // as well, from the first paint. Pinned by arm-reveal-paths.test.mjs.
  armAllButtons(topEl);
}

// The engine holds an AudioContext, a wake lock and a rAF loop; leaving the page without disposing
// leaks all three. persisted = bfcache, where the same round is resumed on return by the engine's own
// visibilitychange listener — disposing there would destroy a live round.
window.addEventListener('pagehide', (event) => {
  if (!event.persisted) game.dispose();
});
