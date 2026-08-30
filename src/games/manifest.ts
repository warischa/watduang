// Single source of truth for which games exist — getStaticPaths() and scripts/validate-games.mjs
// both read this file. Static import on purpose: build time gets the real object to validate, no
// metadata copy that could drift. This code never leaks to the browser — the game page loads the
// module via import.meta.glob on the client instead.
import type { GameModule } from './types';
// The .ts extension is spelled out in full on purpose: scripts/validate-games.mjs imports this file
// with node directly, and node's ESM cannot guess the extension · Vite/Astro already accept .ts.
import timebomb from './timebomb.ts';
import siamsi from './siamsi.ts';
import shortStick from './short-stick.ts';
import dailyFortune from './daily-fortune.ts';
import freezeTap from './freeze-tap.ts';
import cannonFlag from './cannon-flag.ts';
import powerMeter from './power-meter.ts';
// Ports 1-3 of the seven the owner ordered in gh#139, registered in that order.
import diceLoser from './dice-loser.ts';
import howCloseIsNear from './how-close-is-near.ts';
import pinocchioLuck from './pinocchio-luck.ts';
// Port 4, gh#161.
import cursedNumber from './cursed-number.ts';
// love-match is deliberately NOT registered: the page is delisted until gh#101 rebuilds it (the solo
// mount hands it an empty roster, so every visitor hit "need 2+ people"). src/games/love-match.ts,
// its test, and its stylesheet stay on disk on purpose — gh#101 rebuilds from them.
// pick-loser is GONE, not delisted (gh#154, owner decision 2026-08-30: too simple to be interesting).
// The module, its test and its OG image are deleted; /game/pick-loser 301s to /c/party/ in
// public/staticwebapp.config.json. Its one reusable part, pickLoser(), already lives in
// _pick-index.ts, which short-stick.ts imports.

export const games: GameModule[] = [
  timebomb,
  siamsi,
  shortStick,
  dailyFortune,
  freezeTap,
  cannonFlag,
  powerMeter,
  diceLoser,
  howCloseIsNear,
  pinocchioLuck,
  cursedNumber,
];

export const byId = (id: string): GameModule | undefined =>
  games.find((g) => g.id === id);

// gh#159 / ADR-0052 — the home page's popular row. Popularity is measured off-site by analytics and
// the resulting order is BAKED IN HERE at build time: nothing counts at runtime, nothing is stored
// per visitor, and no request leaves the page for this feature. Promoting a different game, or
// adding one, is an edit to `ids` alone — no page file changes. The heading lives here rather than
// in the page because it is hub copy (ADR-0034); it is deliberately an adjective and never a count,
// because there is no number behind it yet (gh#160 reconciles the label with real data).
// Three to four ids: the row is a podium, not a ranking.
export const popularGroup = {
  heading: 'ยอดนิยม',
  // OWNER'S PICK, 2026-08-30: the newest games that have a play route.
  //
  // Derived from history, never from memory: `git log --diff-filter=A` on each
  // src/pages/game/<id>/play.astro puts these three at fa01c8c (2026-08-30T11:34), ahead of
  // timebomb and short-stick at 59c909c and the rest earlier. Three rather than four because the
  // next two landed in the SAME commit, so a fourth slot would be a coin flip rather than a pick.
  // Order inside fa01c8c is by ticket number descending (gh#158, gh#157, gh#156).
  //
  // Every id here is a game whose `category` is 'party'. That is load-bearing, not incidental:
  // ADR-0040 says the fortune pages and the randomizer tools are NOT games, and this row's heading
  // promises games. A fortune id in this array would make the heading false.
  //
  // Not a measurement. ADR-0052: the row ships before the numbers exist, and gh#160 is where the
  // label and real analytics data get reconciled. Replace this array wholesale; nothing else moves.
  ids: ['pinocchio-luck', 'how-close-is-near', 'dice-loser'],
};

/** The row's games, in `popularGroup.ids` order. An id no game answers to fails the build loudly —
 *  the alternative is a card rendering `undefined` on the home page after a one-word typo. */
export const popularGames: GameModule[] = popularGroup.ids.map((id) => {
  const game = byId(id);
  if (!game) throw new Error(`popularGroup.ids: no game is registered under the id "${id}"`);
  return game;
});
