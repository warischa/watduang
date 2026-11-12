// THE sink for a person's name on every prize-draw screen: the projector's name field, its result cards,
// and the setup page's messages. A name is attacker-owned once QR join lands (gh#308: strangers type it on
// their own phones and it reaches a projector), so it is guarded at the sink, per ADR-0026: it is written
// with textContent and nothing else, so markup in a name is shown as text and never parsed. Every screen
// calls writeName or nameBox; a screen that wrote a name any other way would be outside this guard, and
// each screen's hostile-name test is what notices.
//
// The fit rule (gh#302 NAME FIT row, design/Gh302Projector.dc.html and design/Gh302Setup.dc.html): a name
// renders at its surface's size; if the name plus 2% slack does not fit its box, it shrinks in 1px steps,
// never below the surface's floor; past the floor it wraps to a second line instead of clipping. The sizes
// and floors are the board's (FIT below); fitName is the one place the rule lives.

/** Size and floor in px, per surface, from the boards' NAME FIT rows. */
export const FIT = {
  /** A name chip in the projector's field, every round. */
  chip: { size: 20, floor: 14 },
  /** The first prize's winner on the result screen. */
  winnerFirst: { size: 132, floor: 132 },
  /** The winners of prizes 2 to 5. */
  winnerCard: { size: 52, floor: 35 },
} as const;
export type FitSpec = { size: number; floor: number };

/** The fit rule's slack: the name must fit with 2% to spare (covers glyphs wider in one face only). */
export const FIT_SLACK = 1.02;

/** Class a box takes when even the floor does not fit: its stylesheet lets the name wrap there. */
export const WRAP_CLASS = 'nm-wrap';

/** Write a name as text. `dir="auto"` isolates a right-to-left name from the text around it. */
export function writeName(target: HTMLElement, name: string): void {
  target.textContent = name;
  target.setAttribute('dir', 'auto');
}

/**
 * A box holding one name, ready for fitName: the box is what has a width, the inner span is the name's
 * own run of text, measured against it. `tag`/`className` are the box's; the size and floor ride on the
 * box as data attributes so fitAll can find every box a screen rendered.
 */
export function nameBox(doc: Document, tag: string, className: string, name: string, fit: FitSpec): HTMLElement {
  const box = doc.createElement(tag);
  box.className = className;
  box.setAttribute('data-fit-size', String(fit.size));
  box.setAttribute('data-fit-floor', String(fit.floor));
  const run = doc.createElement('span');
  run.className = 'nm';
  writeName(run, name);
  box.appendChild(run);
  return box;
}

/** Shrink one box's name to fit, per the rule above. Needs layout, so it runs in a browser only. */
export function fitName(box: HTMLElement): void {
  const run = box.firstElementChild as HTMLElement | null;
  const size = Number(box.getAttribute('data-fit-size'));
  const floor = Number(box.getAttribute('data-fit-floor'));
  if (!run || !Number.isFinite(size) || !Number.isFinite(floor) || typeof getComputedStyle !== 'function') return;
  box.classList.remove(WRAP_CLASS);
  const cs = getComputedStyle(box);
  // offsetWidth/clientWidth are layout widths, so the projector frame's scale transform does not skew them.
  const room = (): number => box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const over = (): boolean => run.offsetWidth * FIT_SLACK > room();
  let px = size;
  box.style.fontSize = `${px}px`;
  while (over() && px > floor) {
    px -= 1;
    box.style.fontSize = `${px}px`;
  }
  if (over()) box.classList.add(WRAP_CLASS);
}

/** Fit every name box under `root`. */
export function fitAll(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>('[data-fit-size]').forEach(fitName);
}
