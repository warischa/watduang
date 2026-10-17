Result: PASS

- Choose **B with an explicit execution boundary**. This approves the approach; native-browser acceptance remains pending.
- **Ownership:** `src/play/_render-suspension.json::routes` owns each route’s permitted extension names and reviewed instrumentation. Browser/library requests are observations; they never automatically enlarge that permitted set.
- **A — viable above three:** `src/play/croc-bite/main.js::GameScene.render` can wrap `renderer.render()` without forking three. Proving “only path” by scanning arbitrary route syntax does not converge; A requires substantial encapsulation and still needs runtime verification.
- **B — converges within instrumented WebGL realms:** extensions expose their functions through `getExtension`; an unknown name can fail without predicting its methods. This directly closes F3’s expanding extension list. [WebGL specification](https://registry.khronos.org/webgl/specs/latest/1.0/#5.14.14)
- `scripts/webgl-pixels-probe.mjs::RECORDER` must cover both canvas classes and both WebGL prototypes before application code. Same-thread `transferControlToOffscreen()` remains covered through `OffscreenCanvas.getContext`.
- **Boundary:** workers and other documents require instrumentation and aggregation, or an explicit failing policy. WebGPU requires its own rejection/instrumentation. Two hooks in one window do not cover these paths. [OffscreenCanvas](https://html.spec.whatwg.org/multipage/canvas.html#the-offscreencanvas-interface), [WebGPU](https://www.w3.org/TR/webgpu/)
- **C — reject as the zero-draw oracle:** identical pixels can result from repeated draws; compositor activity also includes unrelated UI. `READBACK` additionally depends on frame timing because `preserveDrawingBuffer:false` permits clearing after presentation. [WebGL specification](https://registry.khronos.org/webgl/specs/latest/1.0/#WEBGLCONTEXTATTRIBUTES)
- **READ:** route implementations, adapter tests, registry, recorder, lane, and installed three’s `WebGLExtensions`/buffer renderers. **RAN:** adapter/screen/recorder Node tests and registry selftest/audit passed.
- **RAN synthetic:** actual `RECORDER` missed an extension draw and ignored a WebGPU context result. This confirms instrumentation gaps, not native rendering behavior.
- Policy: normalize extension-name case; review the union of names requested across both legs, including unsupported queries. Reject every unlisted request persistently, even if application code catches an exception.
- Wrap approved extension draw methods before returning the object; preserve native behavior and repeated-object identity. Keep recording through the final measurement and judge policy violations after `READBACK`.
- **Must-red extension:** on real `one-bomb`, explicitly permit/instrument `ANGLE_instanced_arrays`, issue a valid native instanced draw while the actual screen holds, and require `heldDraws>0`, route FAIL, exit 1. Acquisition rejection alone does not satisfy this check.
- **Must-red unlisted:** acquire a supported extension omitted from that adapter’s policy while free; require a named policy violation and exit 1. This isolates admission enforcement from hold detection.
- **Must-green lane:** `scripts/webgl-pixels-lane.sh` must retain clean exit 0 and stub-control exit 1, with every manifest party route checked and every declared adapter surface measured.
- **Regression risks:** omitting three’s optional requests or `READBACK`’s `WEBGL_debug_renderer_info`; changing return values; double-wrapping; allowing extension draws to escape `STUB_DRAW`. Keep both calibration legs.
- Retain F1/F2 acceptance: the latest held span must end, and the final recorder snapshot must include measurement-time activity (`main`/`judgeHold`).
- The supplied 2/2 browser-lane result was not rerun here; no repository files were edited.

would change if: a permitted extension exposes native drawing outside these intercepted acquisitions, or a real-route control escapes while every declared execution boundary is enforced.
