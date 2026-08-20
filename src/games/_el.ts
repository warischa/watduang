// Shared DOM helper — el() WAS byte-identical in all six game modules (daily-fortune,
// love-match, pick-loser, short-stick, siamsi, timebomb) before this extraction; those copies are
// gone. Pure and stateless, which is why sharing it is safe: cleanup/on() deliberately stayed
// local to each game, because love-match.test.mjs imports two game modules and a shared mutable
// cleanup array would let one game's dispose() drain the other's pending listener removals.
// The underscore prefix keeps it out of the game page's lazy-loader glob (`!../../games/_*.ts`),
// the same way _arm-gate.ts does.

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text?: string,
  style?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (style) node.setAttribute('style', style);
  return node;
}
