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
];

export const byId = (id: string): GameModule | undefined =>
  games.find((g) => g.id === id);
