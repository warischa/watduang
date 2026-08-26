// Copy this file to src/games/<slug>.ts and add one line to manifest.ts — done.
// Filename starts with _ = both the client glob and validate-games.mjs skip this file.
import type { GameContext, GameModule } from './types';

let cleanup: Array<() => void> = [];

const game: GameModule = {
  id: 'template',
  names: { th: 'ชื่อไทย', en: 'English name' },
  category: 'party',
  players: [2, 10],
  keywords: [],
  tagline: 'บรรทัดเดียวสั้นๆ ว่าเกมนี้สนุกยังไง — ขึ้นบนการ์ด OG',
  seo: {
    title: '',
    description: '',
    steps: ['ขั้นที่ 1', 'ขั้นที่ 2', 'ขั้นที่ 3'],
  },
  og: 'template.png',
  // A new game is usually true: the slot renders in the how-to-play prose below the stage, never on
  // the play screen (issue #13, amendment 8). Leave it false only if the page must generate no ad
  // request at all, and add it to the denylist in scripts/validate-games.mjs with the reason.
  ads: true,

  // ctx.session.checkpoint is ONE site-wide slot, shared by every game — not yours alone.
  // saveCheckpoint() does not check ownership: calling it overwrites whatever another
  // game left there, no warning. saveCheckpoint(null) / clear() empties it site-wide,
  // not just for this game. See issue #24 and
  // docs/adr/0008-starting-a-round-never-resumes-or-discards-one-silently.md before
  // this game saves or clears a checkpoint.
  // Also: saveCheckpoint() only UPDATES an existing session record, it never creates one.
  // The shell calls setPlayers() first on every real entry path, so this is invisible in
  // normal play — but a checkpoint saved before setPlayers() silently does nothing.
  mount(stage: HTMLElement, ctx: GameContext) {
    stage.textContent = `${ctx.session.players.length} คน`;
  },

  // Every timer / listener / audio mount() creates must be torn down here.
  dispose() {
    cleanup.forEach((fn) => fn());
    cleanup = [];
  },
};

export default game;
