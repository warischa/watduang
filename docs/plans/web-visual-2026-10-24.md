# Web pages: visual polish and a motion and effect layer — plan

Ticket: gh#288. Written 2026-10-24 (S2026-10-24#2), **plan only**: nothing here has been executed.
A new session executes it, in the phase order below. The owner's decisions are on the ticket and
restated here so a session can start from this file alone.

Origin: an external reference index the owner supplied, `WEB_VISUAL_INDEX.md` (v1.0, reviewed
2026-10-23, not in this repo). It catalogues React, WebGL, shader, glass and motion libraries.
§ "What the index offers this repo" keeps the parts that matter, so the session does not need it.

## Owner decisions (popup, 2026-10-24)

1. **Scope: every page except the play surface.**
   - **In:** `/`, `/c/fortune/`, `/c/party/`, `/tools/`, the four tool pages (`/tool/wheel/`, `/tool/draw/`, `/tool/number/`, `/tool/team/`), the 404, and the page chrome of `/game/<id>/` (everything outside `#stage`).
   - **Also in:** the three fortune items (siamsi, daily-fortune, love-match), including their surfaces. ADR-0040 says they are not เกม.
   - **Out:** the 14 play routes (`src/play/<id>/`) and the `#stage` of every party game.
   - The fortune surfaces render inside `#stage`, so the no-`<a href>` rule in `CLAUDE.md` (ADR-0014, ADR-0041, ADR-0055) still binds them.
2. **Level: polish within canvas D, plus a new motion and effect layer, canvas first.** The palette stays as ADR-0069 set it.
3. **No new dependency.** Effects are hand-written CSS, SVG or WebGL. `three` is not loaded on web pages: ADR-0068 counts it as a per-visitor cost.
4. **Plan home:** gh#288 plus this file.

## What the index offers this repo

The repo runs Astro with vanilla TS and no runtime framework (ADR-0060). Its runtime dependencies are `astro`, `@astrojs/sitemap` and `three`.

| Index entry | Verdict here |
|---|---|
| React Bits, Magic UI, Motion Primitives, React Three Fiber, Drei, React Postprocessing, R3F Scroll Rig, React Three UIKit, ShaderGradient, Liquid Glass React | **Not usable.** Each needs React. Use them only as visual references for an effect rebuilt in CSS. |
| Motion, Lenis, Curtains.js, OGL, Liquid Glass JS, Theatre.js | **Out.** Each is a new dependency (decision 3). OGL and Curtains would also be a second renderer, against ADR-0060. Liquid Glass JS samples the page with html2canvas. |
| Paper Shaders, Radiant | **Reference** for one hand-written fragment shader (gradient or noise) on a hero. Read the upstream LICENSE before porting any shader source. Radiant's terms are per shader. |
| CSS `backdrop-filter`; SVG liquid glass (shuding) | **Candidates**, dependency-free, for the top bar and panels. Safari and Firefox support SVG displacement only partly, so the frosted CSS version must read fine alone. |
| WebGL Fluid Simulation | **Out.** GPU cost on the phones that are this site's core audience. |
| Lamina | Archived. Ignore. |

Adopted from the index's composition rules:
- Semantic DOM stays the content.
- At most one GPU canvas per page.
- Every decorative layer is `pointer-events: none` and `aria-hidden`, and never sits over or shifts the ad slot.
- Every effect has a no-WebGL and a reduced-motion form.

## Constraints the session must hold

These are rules, not concerns.
- **Design source.** Every design value comes from a `design/` board first (ADR-0033). That includes motion durations, easings and distances. Owner order since 2026-10-04: audit → owner picks → canvas → code. The `ui-ux-pro-max` plugin is an audit instrument, never a design source.
- **Tokens and palette.** Canvas D is the palette (ADR-0069), held in `src/styles/tokens.css`. The accent single-source gate (gh#128) must stay green.
- **Scripts and CSP.** No inline page script (ADR-0005). The CSP in `public/staticwebapp.config.json` allows only `'self'` plus AdSense origins, so nothing loads from a CDN.
- **Reduced motion is reduced, not removed** (ADR-0046). JS-driven motion must pass the "JS-driven motion declares a prefers-reduced-motion guard" gate.
- **Bundle.** Any new JS moves `BASELINE_TOTAL_BYTES` in `scripts/bundle-freeze-check.mjs` (gh#129). Re-pin it once, in the commit that adds the bytes, with the measured delta.
- **No WebGL.** Without a WebGL context the page still renders whole. The CSS version is the baseline and the shader only enhances it (ADR-0051, applied to web pages). Every CI browser lane runs `--disable-gpu`, so that is the path CI sees.
- **Copy.** Thai copy is verbatim and must stay inside the Thai subset (gh#202). Code and comments are English.
- **Content rule.** No bottles, cans or branded glasses in any image, OG cards included.
- **Push batching.** One src push per batch, with one owner ask and its evidence line (`CLAUDE.md`, Batch boundaries).

## Phases

### Phase 0 — Baseline audit (read-only)

Rebuild, then re-run the gh#262 audit method (`docs/verification/evidence/ui-audit-2026-10-06-gh262/`, probes included) over the in-scope set at 320, 390 and 1440. Close the gaps that audit lists under "Not covered":
- `/c/party/`, the 14 `/game/<id>/` chrome pages, and the 390 width;
- post-interaction states: the wheel result, the draw, team and number results, the siamsi slip, and the daily-fortune and love-match results;
- hover, active, disabled and focus-ring states, keyboard order, and reduced motion;
- a pixel or crop comparison against the canvas boards;
- LCP and CLS on the live site under CDP throttling, labelled as an approximation (a local server makes LCP meaningless).

Follow `docs/agents/browser-verification.md`: use `setWidth`, never `--window-size`, and state the flags of every run. Output `docs/verification/evidence/web-visual-<date>/README.md` with findings plus options and no picks. Check each finding against open and closed tickets first; gh#263 already holds some.

### Phase 1 — Owner picks (one popup round, Thai)

Each option carries its measured byte cost, a performance reading and its fallback.
- **A. Home hero ambient layer:** a CSS-only animated gradient, or a hand-written WebGL fragment shader of a few KB over that same CSS fallback.
- **B. Top bar and panels:** frosted `backdrop-filter`, or SVG displacement glass with the frosted version as fallback.
- **C. Micro-interactions:** tile and card hover and press lift, button press, one focus-ring style site-wide, and result reveal transitions on the tool and fortune pages.
- **D. Section reveal on scroll:** `IntersectionObserver` plus CSS, no scroll library, reduced under `prefers-reduced-motion`.
- **E. Page transitions:** native cross-document view transitions (`@view-transition` in CSS, zero JS). Measure first: browser support, behaviour on the AdSense slot, and that play-route navigation is untouched.
- **Plus:** every Phase 0 finding, with its options.

### Phase 2 — Canvas

Add or update boards in `design/` for each pick: colours from canvas D, motion specs as values. The owner approves the renders, in a popup. Evidence goes under `docs/verification/evidence/`.

### Phase 3 — Code, one effect per commit, lowest risk first

1. Motion tokens in `tokens.css`.
2. Focus ring and micro-interactions (CSS).
3. Hub, tool and fortune states.
4. Glass chrome.
5. Section reveal.
6. Page transitions.
7. The hero shader, last.

Each commit gets a test that is red first wherever a seam exists. Examples: the reduced-motion guard, token single-sourcing, the decorative layer being `aria-hidden` with no hit target, and the ad slot not moving. A commit that adds JS also re-pins the bundle.

### Phase 4 — Verify and ship

1. Full `bash scripts/run-workflow-gates.sh` at the final HEAD.
2. A browser check at 320, 390 and 1440, with reduced motion on and off, plus one run with WebGL forced off. Check that interactions still work.
3. A REFUTE pass.
4. Branch CI, then one owner ask for the src push.
5. Live byte compare with `scripts/live-site-bytes.sh`.
6. Real-device checks (frame rate, battery, Safari glass) are queued on gh#141. They are not claimed.

## Out of scope

- Play routes, the party-game `#stage`, and game logic.
- The `/en/` tree, which is not built.
- Palette changes.
- New dependencies.
- Analytics (gh#160).

## Risks

- **GPU and battery cost** of a hero shader on low-end phones, the core audience. It ships reduced under reduced motion, falls back without WebGL, and gets measured on gh#141 before it is called fine.
- **`backdrop-filter` on scroll** can drop frames on low-end Android. The frosted variant gets measured before the SVG one is considered.
- **Generic "template" motion.** The canvas comes first so the owner judges the look before any code.
- **View transitions plus AdSense:** unmeasured. Option E stays an option until Phase 1 data exists.

## Definition of done

- [ ] Phase 0 evidence README committed: findings plus options, with an explicit "not covered" list.
- [ ] The owner's picks recorded on gh#288.
- [ ] Canvas boards for every pick, approved by the owner.
- [ ] Code shipped and deployed. Full local gates green, branch and main CI green, the live site byte-identical to the build. What was not verified (real devices, Safari) is named on the ticket.
