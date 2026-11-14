// gh#308, ADR-0077: the one importer of lean-qr. Draws the join QR on the projector's lobby canvas.
// stage.ts loads this module with import() and only for a QR-mode lobby, so an admin-mode event never
// fetches it (lobby.test.mjs walks the static graph to prove it).
//
// Options from the evidence for the pick (docs/verification/evidence/gh308-qr-library-2026-11-11/): the
// correction level is set explicitly to M, never left to the library default (measured as L there), and
// the symbol goes to a canvas, one pixel per module, scaled up by CSS with pixelated rendering.

import { correction, generate } from 'lean-qr';

/** At least M; the library may raise it when the same version holds more correction. */
export const QR_OPTIONS = { minCorrectionLevel: correction.M } as const;

/** The quiet zone, in modules: the 4 the QR standard asks for (the board's placeholder drew 3). */
export const QR_PAD = 4;

// Dark modules in the board's ink (VALUES row, token color-line-strong), light in its card white.
const ON = [0x14, 0x14, 0x2b, 255] as const;
const OFF = [255, 255, 255, 255] as const;

type CanvasLike = Parameters<ReturnType<typeof generate>['toCanvas']>[0];

/** Encode `text` and draw it on `canvas`, which is resized to the symbol plus its quiet zone. */
export function drawJoinQr(canvas: CanvasLike, text: string): void {
  generate(text, QR_OPTIONS).toCanvas(canvas, { on: ON, off: OFF, pad: QR_PAD });
}
