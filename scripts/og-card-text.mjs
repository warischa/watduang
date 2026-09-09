#!/usr/bin/env node
// Single source of truth for the TEXT that goes on an OG card. Both the generator
// (scripts/make-og.mjs) and the gate (scripts/og-card-check.mjs) call cardLines(), so a card whose
// source copy moved and whose PNG did not is a difference the gate can see without rendering
// anything. CI has no librsvg and no Thai font, so the gate must never touch the renderer.
//
// Wrapping, font fitting and the SVG stay in make-og.mjs — those are rendering decisions. What
// lives here is the ordered LOGICAL lines: the title, then the sub lines, before any wrap.

// Site-level cards (home page · game listing · 404) aren't games so they aren't in the manifest — made into an
// entry shaped just like a game, so the measure/wrap/render code never has to know this case exists
export const SITE = {
  id: 'site',
  names: { th: 'วัดดวง' },
  // No player-count line is stamped on this card, and there is no `players` field to stamp one
  // from: only a party-category card gets that line (see the sub line below). This card speaks for
  // the whole site, and CLAUDE.md forbids stating the count, or phone-passing, as a fact about the
  // whole site. gh#89 / ADR-0040. The wording below is the line already shipping in
  // src/pages/index.astro: gh#192 (a)(i) ruled that replacement copy for the deleted group claims
  // is the owner's, not an agent's, so this reuses ruled copy rather than authoring any.
  tagline: 'ไม่ต้องโหลดแอป ไม่ต้องสมัคร',
};

/**
 * The ordered logical text lines of a card: [title, tagline, (party count line)].
 * Throws when the tagline is missing — the caller owns the message, because the generator's is an
 * instruction to a human editing src/games and the gate's is a report about a stale card.
 */
export function cardLines(game) {
  // The card's tagline comes only from the tagline field — never silently fall back to seo.title/seo.description
  // (both were tried: title gives a tagline missing "who loses" · description runs long into 4 small lines
  //  and duplicates the player-count line) A card that quietly weakens is the same kind of failure as Thai text breaking with no error
  const tagline = typeof game.tagline === 'string' ? game.tagline.trim() : '';
  if (!tagline) throw new Error(`og-card-text: no tagline on "${game.id}"`);

  // Only a party-category card states a player count. ADR-0040: the fortune category is one person
  // and one answer, and CLAUDE.md forbids the range as a claim about the whole site, which is what
  // the site card is. Keyed on category, NOT on the range being 1-1 -- the phrase itself is game
  // language, so a 1-1 card would still be wrong with the numbers merely corrected.
  // The site entry has no category, so it takes the non-party arm.
  const subLines = game.category === 'party' ? [tagline, `เล่นฟรี ${game.players[0]}-${game.players[1]} คน ไม่ต้องโหลดแอป`] : [tagline];
  return [game.names.th, ...subLines];
}
