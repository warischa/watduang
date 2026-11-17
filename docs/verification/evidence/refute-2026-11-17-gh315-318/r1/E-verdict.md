Result: FAIL
1. [spot-fix] med — `src/play/prize-draw/stage.ts:157` · FIELD_SCREENS/markField — **Confirmed DOM/CSS regression:** opening a ready zones round produces `data-screen="zones"` without `data-field`. Below 640px, the phone field styles therefore miss it, leaving the fixed projector layout.
   base: clean — RAN HEAD’s stage.ts through a scratch loader with current dependencies; the same fixture renders `round` with `data-field`.
2. [spot-fix] low — `src/play/prize-zones/renderer/plan.ts:164` · eventKeyOf — **Confirmed:** `unrecognised:048213:round1:000123` and `a:b:048213:round1:000123` both return `048213`, violating the requirement to refuse other shapes. The regex matches an arbitrary suffix; anchor the complete key with only an optional `demo:` prefix.
   base: new — HEAD has no version to run. RAN `node --test <scratch>`; both malformed-key rejection assertions fail.

Coverage: Read supplied diff and targeted zones/stage/demo/CSS excerpts. RAN focused event, persistence, QR, demo, host and phase-2 plan suites successfully. Browser layout remains unverified: bundled Chromium was missing and installed-Chrome fallback aborted; recheck mobile rendering in a working browser. No workspace files changed.
would change if: zones receives an effective phone layout and eventKeyOf rejects every prefix except the optional `demo:`.
