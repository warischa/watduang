// Single source of truth for which games exist — getStaticPaths() and scripts/validate-games.mjs
// both read this file. Static import on purpose: build time gets the real object to validate, no
// metadata copy that could drift. This code never leaks to the browser — the game page loads the
// module via import.meta.glob on the client instead.
import type { GameModule } from './types';
// The .ts extension is spelled out in full on purpose: scripts/validate-games.mjs imports this file
// with node directly, and node's ESM cannot guess the extension · Vite/Astro already accept .ts.
import timebomb from './timebomb.ts';
import siamsi from './siamsi.ts';
import pickLoser from './pick-loser.ts';
import shortStick from './short-stick.ts';
import dailyFortune from './daily-fortune.ts';
import freezeTap from './freeze-tap.ts';
// love-match is deliberately NOT registered: the page is delisted until gh#101 rebuilds it (the solo
// mount hands it an empty roster, so every visitor hit "need 2+ people"). src/games/love-match.ts,
// its test, and its stylesheet stay on disk on purpose — gh#101 rebuilds from them.

export const games: GameModule[] = [timebomb, siamsi, pickLoser, shortStick, dailyFortune, freezeTap];

export const byId = (id: string): GameModule | undefined =>
  games.find((g) => g.id === id);
