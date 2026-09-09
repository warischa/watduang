#!/usr/bin/env node
// The party-size claim regex, extracted so more than one gate can enforce the same shape without a
// second copy drifting from this one. scripts/party-size-claim-check.mjs owns the rule and its
// permitted-surface set; scripts/og-card-check.mjs applies the same regex to OG card text.
//
// The claim: a player-count RANGE. Not any number of people — "อย่างน้อย 2 คน" is a guard message,
// not the site's party-size promise.
//
// Carries the /g flag, so it is stateful: use String#match or matchAll, never a bare .test() in a
// loop, where lastIndex makes the answer alternate.
export const CLAIM = /\d+\s*(?:-|–|—|ถึง|to)\s*\d+\s*(?:คน|players)/g;
