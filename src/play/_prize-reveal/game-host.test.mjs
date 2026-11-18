// The one renderer state machine of the prize-draw reveal (gh#305), driven over fakes: every transition,
// every fallback trigger, held time, and the exit contract -- whichever way a reveal ends, it aborts, stops
// the loop, drops every listener, disposes every owned resource and the renderer, and draws the committed
// 2D view exactly once. A game the registry picks to hold its picture (gh#319) settles with the scene
// still up instead; the cases at the end of this file own that edge.
import test from 'node:test';
import assert from 'node:assert/strict';
// The two callers first: the arm gate they import reads `document` as it loads, before host-harness.mjs
// stands in its minimal one.
import { mountDemo } from './demo.ts';
import { makeDoc } from '../../prize-event/fake-dom.mjs';
import { fakeOrigin, mount as mountStage, press, storedEvent } from '../prize-draw/stage-harness.mjs';
import { OUTCOME, baseOptions, launch, makeModule, makePage, makeRegistry, settle, widthMatches } from './host-harness.mjs';
import { GAMES, isAvailable, settleFor } from './game-registry.ts';
import { startReveal } from './game-host.ts';

const RM_QUERY = '(prefers-reduced-motion: reduce)';

async function running(pageOpts = {}, modOpts = {}) {
  const page = makePage(pageOpts);
  const mod = makeModule(modOpts);
  const reg = makeRegistry(mod);
  const { options, calls } = baseOptions(page, { registry: reg.registry });
  const host = launch(page, options);
  await settle();
  return { page, mod, reg, calls, host };
}

/** The exit contract, whichever way the reveal ended. */
function assertCleanExit({ page, mod, calls, host }, state, reason) {
  assert.equal(host.state, state);
  if (reason !== undefined) assert.equal(host.reason, reason);
  assert.equal(calls.render2D.length, 1, 'the 2D view was not drawn exactly once');
  assert.equal(calls.render2D[0], OUTCOME, 'the 2D view drew something other than the committed outcome');
  assert.equal(page.frames.size, 0, 'a frame is still queued');
  assert.equal(page.mql.count('change'), 0, 'the reduced-motion listener is still attached');
  for (const list of page.widthMqls.values()) assert.equal(list.count('change'), 0, `the ${list.media} listener is still attached`);
  assert.equal(page.doc.count('visibilitychange'), 0, 'the visibility listener is still attached');
  assert.equal(page.mine(), 0, 'the host is still registered with the real render hold');
  assert.equal(page.container.children.length, 0, 'the 3D layer is still in the page');
  for (const call of page.rendererCalls) assert.equal(call.canvas.count('webglcontextlost'), 0, 'context-loss listener left');
  for (const r of page.renderers) assert.equal(r.disposed, 1, 'the renderer was not disposed exactly once');
  for (const ro of page.resizeObservers) assert.equal(ro.disconnected, true, 'the resize observer is still connected');
  // The raw context is the host's from the moment it is acquired, renderer or not: released exactly once
  // (none to release when the page lacks WEBGL_lose_context), its canvas detached and its listener gone.
  for (const gl of page.gls) assert.equal(gl.released, page.loseExtension ? 1 : 0, 'the raw WebGL context was not released exactly once');
  for (const c of page.canvases) {
    assert.equal(c.count('webglcontextlost'), 0, 'a canvas kept its context-loss listener');
    assert.equal(c.parentNode, null, 'a canvas is still attached');
  }
  if (mod) {
    for (const res of mod.resources) assert.equal(res.disposed, 1, 'an owned resource was not disposed exactly once');
    if (mod.mounts.length) {
      assert.equal(mod.context.signal.aborted, true, 'the module signal was not aborted');
    }
  }
}

test('a null game reveals in 2D at once: nothing loads and no canvas is made', async () => {
  const page = makePage();
  const mod = makeModule();
  const reg = makeRegistry(mod);
  const { options, calls } = baseOptions(page, { registry: reg.registry, game: null });
  const host = launch(page, options);
  await settle();
  assertCleanExit({ page, mod, calls, host }, 'fallback', 'no-game');
  assert.equal(reg.loads, 0);
  assert.equal(page.rendererLoads, 0, 'three was imported for a 2D reveal');
  assert.deepEqual(page.contextRequests, []);
});

test('reduced motion at entry reveals in 2D before three or the game is imported', async () => {
  const page = makePage({ reducedMotion: true });
  const mod = makeModule();
  const reg = makeRegistry(mod);
  const { options, calls } = baseOptions(page, { registry: reg.registry });
  const host = launch(page, options);
  await settle();
  assert.ok(page.mqlQueries.includes(RM_QUERY), 'the host never asked for reduced motion');
  assertCleanExit({ page, mod, calls, host }, 'fallback', 'reduced-motion-entry');
  assert.equal(reg.loads, 0, 'the game module was imported under reduced motion');
  assert.equal(page.rendererLoads, 0, 'three was imported under reduced motion');
});

test('a game the registry marks unavailable reveals in 2D without loading', async () => {
  const page = makePage();
  const mod = makeModule();
  const reg = makeRegistry(mod, { available: false });
  const { options, calls } = baseOptions(page, { registry: reg.registry });
  const host = launch(page, options);
  await settle();
  assertCleanExit({ page, mod, calls, host }, 'fallback', 'unavailable');
  assert.equal(reg.loads, 0);
  assert.equal(page.rendererLoads, 0);
});

test('no WebGL2: 2D, and three is never imported', async () => {
  const page = makePage({ webgl2: false });
  const mod = makeModule();
  const reg = makeRegistry(mod);
  const { options, calls } = baseOptions(page, { registry: reg.registry });
  const host = launch(page, options);
  await settle();
  assert.deepEqual(page.contextRequests, ['webgl2']);
  assertCleanExit({ page, mod, calls, host }, 'fallback', 'no-webgl2');
  assert.equal(page.rendererLoads, 0);
  assert.equal(reg.loads, 0);
});

test('idle -> loading -> running: the canvas is in the page, the module mounted with viewport and motion', async () => {
  const page = makePage();
  const mod = makeModule();
  const reg = makeRegistry(mod, { defer: true });
  const { options, calls } = baseOptions(page, { registry: reg.registry });
  const host = launch(page, options);
  assert.equal(host.state, 'loading');
  reg.resolve();
  await settle();
  assert.equal(host.state, 'running');
  assert.deepEqual(calls.states, ['loading', 'running']);
  assert.equal(page.container.children.length, 1);
  const { input, context } = mod.mounts[0];
  assert.equal(input.outcome, OUTCOME);
  assert.equal(input.reducedMotion, false);
  assert.deepEqual(input.viewport, { cssWidth: 1920, cssHeight: 1080, dpr: 1 });
  assert.equal(context.renderer, page.renderers[0]);
  assert.equal(page.frames.size, 1, 'no frame was requested');
  assert.equal(calls.render2D.length, 0, 'the 2D view was drawn under a running 3D reveal');
});

test('import failure falls back to 2D', async () => {
  const page = makePage();
  const mod = makeModule();
  const reg = makeRegistry(mod, { defer: true });
  const { options, calls } = baseOptions(page, { registry: reg.registry });
  const host = launch(page, options);
  reg.reject(new Error('chunk failed'));
  await settle();
  assertCleanExit({ page, mod, calls, host }, 'fallback', 'import');
  assert.equal(page.rendererCalls.length, 0);
  assert.equal(mod.mounts.length, 0);
});

test('three failing to import falls back to 2D', async () => {
  const page = makePage();
  page.deferRenderer = true;
  const mod = makeModule();
  const reg = makeRegistry(mod);
  const { options, calls } = baseOptions(page, { registry: reg.registry });
  const host = launch(page, options);
  page.rejectRenderer(new Error('three chunk failed'));
  await settle();
  assertCleanExit({ page, mod, calls, host }, 'fallback', 'import');
});

test('renderer init throwing falls back, and the module never mounts', async () => {
  const page = makePage();
  page.rendererFactoryThrows = new Error('no context');
  const mod = makeModule();
  const reg = makeRegistry(mod);
  const { options, calls } = baseOptions(page, { registry: reg.registry });
  const host = launch(page, options);
  await settle();
  assertCleanExit({ page, mod, calls, host }, 'fallback', 'init');
  assert.equal(mod.mounts.length, 0);
});

test('mount throwing falls back, and what it registered before throwing is disposed', async () => {
  const run = await running({}, { onMount: () => { throw new Error('mount'); } });
  assert.equal(run.mod.resources.length, 2);
  assertCleanExit(run, 'fallback', 'mount');
});

test('render throwing falls back on that frame', async () => {
  const run = await running({}, { onAdvance: (c) => { if (c.type === 'tick') throw new Error('draw'); } });
  run.page.flush(16);
  assertCleanExit(run, 'fallback', 'render');
});

test('context loss mid-run: the listener predates the renderer; default prevented; fallback', async () => {
  const run = await running();
  assert.equal(run.page.listenersAtFactory, 1, 'the renderer existed before the context-loss listener');
  run.page.flush(16);
  let prevented = 0;
  run.page.rendererCalls[0].canvas.dispatch('webglcontextlost', { preventDefault: () => prevented++ });
  assert.equal(prevented, 1);
  assertCleanExit(run, 'fallback', 'context-lost');
});

test('reduced motion turned on mid-run falls back; turning it off again never restarts the reveal', async () => {
  const run = await running();
  run.page.flush(16);
  run.page.setReducedMotion(true);
  assertCleanExit(run, 'fallback', 'reduced-motion');
  run.page.setReducedMotion(false);
  await settle();
  assert.equal(run.mod.mounts.length, 1);
  assert.equal(run.calls.render2D.length, 1);
  assert.equal(run.host.state, 'fallback');
});

test('held and hidden time is excluded from elapsed; the loop stops while held', async () => {
  const run = await running();
  const { page, mod, host } = run;
  const ticks = () => mod.commands.filter((c) => c.type === 'tick').map((c) => [c.elapsedMs, c.deltaMs]);
  page.flush(1000);
  page.flush(1016);
  page.setHeld(true);
  assert.equal(host.state, 'held');
  assert.equal(page.frames.size, 0, 'a frame stayed queued under the hold');
  page.flush(5000);
  page.setHeld(false);
  assert.equal(host.state, 'running');
  page.flush(6000);
  page.flush(6016);
  page.setHidden(true);
  assert.equal(host.state, 'held');
  page.setHidden(false);
  page.flush(9000);
  page.flush(9020);
  assert.deepEqual(ticks(), [[0, 0], [16, 16], [16, 0], [32, 16], [32, 0], [52, 20]]);
  assert.deepEqual(run.calls.states, ['loading', 'running', 'held', 'running', 'held', 'running']);
});

test('a reveal that becomes ready under a hold waits held, then runs', async () => {
  const run = await running({ held: true });
  assert.equal(run.host.state, 'held');
  assert.equal(run.page.frames.size, 0);
  run.page.setHeld(false);
  assert.equal(run.host.state, 'running');
  assert.equal(run.page.frames.size, 1);
});

test('a slow frame never falls back', async () => {
  const run = await running();
  run.page.flush(0);
  run.page.flush(3000);
  assert.equal(run.host.state, 'running');
  assert.deepEqual(run.mod.commands.at(-1), { type: 'tick', elapsedMs: 3000, deltaMs: 3000 });
});

test('complete settles; dispose afterwards, twice, changes nothing but the state', async () => {
  const run = await running();
  run.page.flush(16);
  run.mod.emit({ type: 'beat', beat: 'cut', index: 0 });
  assert.deepEqual(run.calls.events, [{ type: 'beat', beat: 'cut', index: 0 }]);
  run.mod.emit({ type: 'complete' });
  assertCleanExit(run, 'settled');
  assert.equal(run.mod.disposed, 1);
  run.host.dispose();
  run.host.dispose();
  assertCleanExit(run, 'disposed');
  assert.equal(run.mod.disposed, 1, 'the handle was disposed twice');
  assert.equal(await run.host.done, 'settled');
});

test('a module that completes inside mount settles once mount returns, and its handle is disposed', async () => {
  const run = await running({}, { onMount: (_c, _i, emit) => emit({ type: 'complete' }) });
  assertCleanExit(run, 'settled');
  assert.equal(run.mod.disposed, 1);
});

test('dispose while loading: 2D once; the late imports are discarded', async () => {
  const page = makePage();
  page.deferRenderer = true;
  const mod = makeModule();
  const reg = makeRegistry(mod, { defer: true });
  const { options, calls } = baseOptions(page, { registry: reg.registry });
  const host = launch(page, options);
  host.dispose();
  host.dispose();
  reg.resolve();
  page.resolveRenderer();
  await settle();
  assertCleanExit({ page, mod, calls, host }, 'disposed');
  assert.equal(page.rendererCalls.length, 0, 'a renderer was made for a disposed reveal');
  assert.equal(mod.mounts.length, 0, 'a disposed reveal mounted its late module');
});

test('next is forwarded; finish settles at once', async () => {
  const run = await running();
  run.host.command('next');
  assert.deepEqual(run.mod.commands.at(-1), { type: 'next' });
  run.host.command('finish');
  assert.deepEqual(run.mod.commands.at(-1), { type: 'finish' });
  assertCleanExit(run, 'settled');
});

test('an error event from the module falls back', async () => {
  const run = await running();
  run.mod.emit({ type: 'error', error: new Error('x') });
  assertCleanExit(run, 'fallback', 'module-error');
});

test('after an exit, module events are ignored and a late own() is disposed at once', async () => {
  const run = await running();
  run.mod.emit({ type: 'complete' });
  run.mod.emit({ type: 'beat', beat: 'cut', index: 1 });
  run.mod.emit({ type: 'complete' });
  run.mod.emit({ type: 'error', error: 1 });
  assert.deepEqual(run.calls.events, [{ type: 'complete' }]);
  const late = { disposed: 0, dispose() { late.disposed++; } };
  run.mod.context.own(late);
  assert.equal(late.disposed, 1);
  assertCleanExit(run, 'settled');
});

test('a resize reaches the renderer and the module', async () => {
  const run = await running();
  run.page.container.clientWidth = 1280;
  run.page.container.clientHeight = 720;
  run.page.resizeObservers[0].cb();
  assert.deepEqual(run.page.renderers[0].sizes.at(-1), [1280, 720, false]);
  assert.deepEqual(run.mod.commands.at(-1), { type: 'resize', viewport: { cssWidth: 1280, cssHeight: 720, dpr: 1 } });
});

test('every exit honours the same contract', async () => {
  const exits = {
    complete: (r) => r.mod.emit({ type: 'complete' }),
    finish: (r) => r.host.command('finish'),
    error: (r) => r.mod.emit({ type: 'error', error: 0 }),
    contextLost: (r) => r.page.rendererCalls[0].canvas.dispatch('webglcontextlost', { preventDefault() {} }),
    reducedMotion: (r) => r.page.setReducedMotion(true),
    narrowed: (r) => r.page.setWidth(320),
    disposeRunning: (r) => r.host.dispose(),
    disposeHeld: (r) => {
      r.page.setHeld(true);
      r.host.dispose();
    },
    renderThrows: (r) => {
      r.throwNext = true;
      r.page.flush(100);
    },
  };
  for (const [name, exit] of Object.entries(exits)) {
    const box = {};
    const run = await running({}, { onAdvance: (c) => { if (c.type === 'tick' && box.run?.throwNext) throw new Error(name); } });
    box.run = run;
    run.page.flush(16);
    exit(run);
    assert.equal(run.calls.render2D.length, 1, `${name}: 2D drawn ${run.calls.render2D.length} times`);
    assertCleanExit(run, run.host.state);
    assert.ok(['settled', 'fallback', 'disposed'].includes(run.host.state), `${name}: ended in ${run.host.state}`);
  }
});

test('frame-time hooks, when enabled, see each frame with its phase; held time is a gap', async () => {
  const page = makePage();
  const mod = makeModule();
  const reg = makeRegistry(mod);
  const frames = [];
  const gaps = [];
  page.env.frameSampler = { frame: (p, raf, cpu) => frames.push([p, raf, cpu]), gap: (k, ms) => gaps.push([k, ms]) };
  const { options } = baseOptions(page, { registry: reg.registry });
  launch(page, options);
  await settle();
  page.flush(100);
  mod.emit({ type: 'beat', beat: 'cut', index: 2 });
  page.flush(116);
  page.setHeld(true);
  page.clock = 600;
  page.setHeld(false);
  assert.deepEqual(frames, [['start', null, 0], ['cut:2', 16, 0]]);
  assert.deepEqual(gaps.filter(([k]) => k === 'held'), [['held', 484]]);
});

// ---- reentrancy: a dispose (or any exit) that lands inside a transition wins, and nothing follows it ----

/** A reveal whose onState hook may act on the host once it exists. */
function hooked({ pageOpts, modOpts, regOpts, onState, render2D, onEvent, prepare } = {}) {
  const page = makePage(pageOpts);
  const mod = makeModule(modOpts);
  const reg = makeRegistry(mod, regOpts);
  const box = {};
  const { options, calls } = baseOptions(page, { registry: reg.registry });
  if (onState) {
    options.onState = (s, r) => {
      calls.states.push(r ? `${s}:${r}` : s);
      onState(s, box.host);
    };
  }
  if (onEvent) {
    options.onEvent = (e) => {
      calls.events.push(e);
      onEvent(e, box.host);
    };
  }
  if (render2D) {
    options.render2D = (o) => {
      calls.render2D.push(o);
      render2D(box.host);
    };
  }
  prepare?.(page, box);
  box.host = launch(page, options);
  return { page, mod, reg, calls, host: box.host, box };
}

test('dispose after the game imported, before three did: no renderer, no mount, the raw context released', async () => {
  const page = makePage();
  page.deferRenderer = true;
  const mod = makeModule();
  const reg = makeRegistry(mod);
  const { options, calls } = baseOptions(page, { registry: reg.registry });
  const host = launch(page, options);
  await settle();
  host.dispose();
  page.resolveRenderer();
  await settle();
  assertCleanExit({ page, mod, calls, host }, 'disposed');
  assert.equal(page.rendererCalls.length, 0);
  assert.equal(mod.mounts.length, 0);
});

test('dispose during renderer creation: the dispose wins -- no layer, no mount, no frame, everything released', async () => {
  const run = hooked();
  run.page.onFactory = () => run.host.dispose();
  await settle();
  assertCleanExit(run, 'disposed');
  assert.equal(run.mod.mounts.length, 0, 'a module mounted after the reveal was disposed');
  assert.equal(await run.host.done, 'disposed');
  assert.ok(!run.calls.states.includes('running'), `the state moved on after the dispose: ${run.calls.states}`);
});

test('a context lost inside getContext: nothing is imported and the context is released', async () => {
  const page = makePage();
  page.onGetContext = (canvas) => canvas.dispatch('webglcontextlost', { preventDefault() {} });
  const mod = makeModule();
  const reg = makeRegistry(mod);
  const { options, calls } = baseOptions(page, { registry: reg.registry });
  const host = launch(page, options);
  await settle();
  assertCleanExit({ page, mod, calls, host }, 'fallback', 'context-lost');
  assert.equal(reg.loads + page.rendererLoads, 0, 'imports ran for a reveal that had already fallen back');
});

test('getContext throwing reads as no WebGL2', async () => {
  const page = makePage();
  page.getContextThrows = new Error('blocked');
  const mod = makeModule();
  const reg = makeRegistry(mod);
  const { options, calls } = baseOptions(page, { registry: reg.registry });
  const host = launch(page, options);
  await settle();
  assertCleanExit({ page, mod, calls, host }, 'fallback', 'no-webgl2');
});

test('a loader that throws synchronously falls back like a failed import', async () => {
  for (const which of ['game', 'three']) {
    const page = makePage();
    const mod = makeModule();
    const reg = makeRegistry(mod, { throwSync: which === 'game' ? new Error('sync') : null });
    if (which === 'three') page.loadRendererThrowsSync = new Error('sync');
    const { options, calls } = baseOptions(page, { registry: reg.registry });
    const host = launch(page, options);
    await settle();
    assertCleanExit({ page, mod, calls, host }, 'fallback', 'import');
  }
});

test('without WEBGL_lose_context the canvas is still detached and its listener removed', async () => {
  const page = makePage();
  page.loseExtension = false;
  page.deferRenderer = true;
  const mod = makeModule();
  const reg = makeRegistry(mod);
  const { options, calls } = baseOptions(page, { registry: reg.registry });
  const host = launch(page, options);
  host.dispose();
  page.resolveRenderer();
  await settle();
  assertCleanExit({ page, mod, calls, host }, 'disposed');
});

for (const [state, pageOpts] of [['running', {}], ['held', { held: true }]]) {
  test(`dispose inside onState('${state}'): no frame stays queued and nothing transitions after`, async () => {
    const run = hooked({ pageOpts, onState: (s, host) => { if (s === state) host.dispose(); } });
    await settle();
    assertCleanExit(run, 'disposed');
    assert.equal(run.mod.disposed, 1);
    assert.equal(run.calls.states.at(-1), 'disposed');
  });
}

test("finish inside onState('running') settles and leaves no frame queued", async () => {
  const run = hooked({ onState: (s, host) => { if (s === 'running') host.command('finish'); } });
  await settle();
  assertCleanExit(run, 'settled');
});

test("dispose inside onState('running') on a resume from a hold leaves no frame queued", async () => {
  let armed = false;
  const run = hooked({ pageOpts: { held: true }, onState: (s, host) => { if (armed && s === 'running') host.dispose(); } });
  await settle();
  armed = true;
  run.page.setHeld(false);
  assertCleanExit(run, 'disposed');
});

for (const exitState of ['settled', 'fallback']) {
  test(`dispose inside onState('${exitState}') follows it: one 2D view, ${exitState} then disposed`, async () => {
    const run = hooked({ onState: (s, host) => { if (s === exitState) host.dispose(); } });
    await settle();
    if (exitState === 'settled') run.mod.emit({ type: 'complete' });
    else run.mod.emit({ type: 'error', error: 0 });
    assertCleanExit(run, 'disposed');
    assert.deepEqual(run.calls.states.slice(-2).map((x) => x.split(':')[0]), [exitState, 'disposed']);
    assert.equal(await run.host.done, exitState);
  });
}

test('dispose inside render2D: the exit is reported first, then the dispose; one 2D view', async () => {
  const run = hooked({ render2D: (host) => host.dispose() });
  await settle();
  run.mod.emit({ type: 'complete' });
  assertCleanExit(run, 'disposed');
  assert.deepEqual(run.calls.states.slice(-2), ['settled', 'disposed']);
});

test('dispose inside mount: no frame, the handle and everything owned released once', async () => {
  const run = hooked({ modOpts: { onMount: () => run.host.dispose() } });
  await settle();
  assertCleanExit(run, 'disposed');
  assert.equal(run.mod.disposed, 1);
});

test('dispose inside mount, then mount throws: the dispose wins over the mount failure', async () => {
  const run = hooked({ modOpts: { onMount: () => { run.host.dispose(); throw new Error('mount'); } } });
  await settle();
  assertCleanExit(run, 'disposed');
  assert.equal(await run.host.done, 'disposed');
});

test('dispose inside the first tick, and inside a beat listener: no frame stays queued', async () => {
  const run = hooked({ modOpts: { onAdvance: (c) => { if (c.type === 'tick') run.host.dispose(); } } });
  await settle();
  run.page.flush(16);
  assertCleanExit(run, 'disposed');

  // The stage's beat listener disposes the reveal while the module is still inside its tick.
  const beat = hooked({
    modOpts: { onAdvance: (c) => { if (c.type === 'tick') beat.mod.emit({ type: 'beat', beat: 'cut', index: 0 }); } },
    onEvent: (e, host) => { if (e.type === 'beat') host.dispose(); },
  });
  await settle();
  beat.page.flush(16);
  assertCleanExit(beat, 'disposed');
});

test('a hold toggled inside a tick never queues a second frame', async () => {
  const run = hooked({ modOpts: { onAdvance: (c) => { if (c.type === 'tick') { run.page.setHeld(true); run.page.setHeld(false); } } } });
  await settle();
  run.page.flush(16);
  assert.equal(run.page.frames.size, 1, `${run.page.frames.size} frames queued`);
  run.host.dispose();
  assertCleanExit(run, 'disposed');
});

test('a throwing onState, onEvent or render2D never stalls the machine', async () => {
  // Each failure is rethrown on its own job: capture those jobs rather than let them escape the test.
  const queued = [];
  const realQueue = globalThis.queueMicrotask;
  globalThis.queueMicrotask = (job) => queued.push(job);
  try {
    const page = makePage();
    const mod = makeModule();
    const reg = makeRegistry(mod);
    const { options, calls } = baseOptions(page, { registry: reg.registry });
    options.onState = (s) => { calls.states.push(s); throw new Error(`onState ${s}`); };
    options.onEvent = () => { throw new Error('onEvent'); };
    options.render2D = (o) => { calls.render2D.push(o); throw new Error('render2D'); };
    const host = launch(page, options);
    await settle();
    assert.equal(host.state, 'running', 'a throwing listener stalled the start');
    assert.equal(page.frames.size, 1);
    mod.emit({ type: 'beat', beat: 'cut', index: 0 });
    mod.emit({ type: 'complete' });
    assertCleanExit({ page, mod, calls, host }, 'settled');
  } finally {
    globalThis.queueMicrotask = realQueue;
  }
  const thrown = queued.map((job) => {
    try {
      job();
    } catch (err) {
      return err.message;
    }
    return null;
  });
  for (const m of ['onState loading', 'onState running', 'onEvent', 'render2D', 'onState settled']) {
    assert.ok(thrown.includes(m), `${m} was swallowed rather than rethrown on its own job`);
  }
});

test('inside mount, a context loss and then a dispose: the dispose wins over the earlier exit', async () => {
  const run = hooked({
    modOpts: {
      onMount: (context) => {
        run.page.canvases[0].dispatch('webglcontextlost', { preventDefault() {} });
        run.host.dispose();
        void context;
      },
    },
  });
  await settle();
  assertCleanExit(run, 'disposed');
  assert.equal(await run.host.done, 'disposed');
});

// ---- round 2: every call-out the host makes after it has returned can end the reveal -------------------
// A sampler hook, a clock read, a frame request or cancel, the hold read, a DOM call: each may run code that
// disposes. After any of them the latch is re-read, so nothing transitions after 'disposed', no frame is
// left queued and everything is released once.

/** Dispose the reveal once, the first time an armed trap fires. */
function trap(box) {
  let fired = false;
  box.armed = true;
  return () => {
    if (!box.armed || fired || !box.host) return false;
    fired = true;
    box.host.dispose();
    return true;
  };
}

function assertDisposedLast(run) {
  assertCleanExit(run, 'disposed');
  const states = run.calls.states.map((x) => x.split(':')[0]);
  assert.equal(states.indexOf('disposed'), states.length - 1, `a transition followed the dispose: ${states.join(' -> ')}`);
}

const sampler = (box, on) => {
  const fire = trap(box);
  return {
    frame: () => {
      if (on === 'frame') fire();
    },
    gap: (kind) => {
      if (kind === on) fire();
    },
  };
};

test('a sampler whose load-gap hook disposes: disposed is the last state, nothing runs after', async () => {
  const run = hooked({ prepare: (page, box) => { page.env.frameSampler = sampler(box, 'load'); } });
  await settle();
  assertDisposedLast(run);
  assert.equal(await run.host.done, 'disposed');
});

test('a sampler whose per-frame hook disposes: no frame queued after it', async () => {
  const run = hooked({ prepare: (page, box) => { page.env.frameSampler = sampler(box, 'frame'); } });
  await settle();
  run.page.flush(16);
  assertDisposedLast(run);
});

for (const [kind, release] of [
  ['held', (page) => page.setHeld(false)],
  ['hidden', (page) => page.setHidden(false)],
]) {
  test(`a sampler whose ${kind}-gap hook disposes on the resume: the reveal does not run again`, async () => {
    const run = hooked({ prepare: (page, box) => { page.env.frameSampler = sampler(box, kind); } });
    await settle();
    if (kind === 'held') run.page.setHeld(true);
    else run.page.setHidden(true);
    release(run.page);
    assertDisposedLast(run);
  });
}

test('the clock read that starts a hold disposes: no held state after it', async () => {
  const run = hooked({
    prepare: (page, box) => {
      const real = page.env.now;
      box.fire = trap(box);
      box.armed = false;
      page.env.now = () => {
        box.fire();
        return real();
      };
    },
  });
  await settle();
  run.box.armed = true;
  run.page.setHeld(true);
  assertDisposedLast(run);
});

test('cancelling the frame as a hold starts disposes: no held state after it', async () => {
  const run = hooked({
    prepare: (page, box) => {
      const real = page.env.cancelAnimationFrame;
      box.fire = trap(box);
      box.armed = false;
      page.env.cancelAnimationFrame = (id) => {
        real(id);
        box.fire();
      };
    },
  });
  await settle();
  run.box.armed = true;
  run.page.setHeld(true);
  assertDisposedLast(run);
});

test('the frame request itself disposes: the frame it queued is cancelled', async () => {
  const run = hooked({
    prepare: (page, box) => {
      const real = page.env.requestAnimationFrame;
      box.fire = trap(box);
      page.env.requestAnimationFrame = (cb) => {
        const id = real(cb);
        box.fire();
        return id;
      };
    },
  });
  await settle();
  assertDisposedLast(run);
});

test('a hold listener ahead of the host disposes it on the release: the host, later in that dispatch, does nothing', async () => {
  const hold = await import('../_render-hold.ts');
  let off = null;
  const run = hooked({
    pageOpts: { held: true },
    // Registered before the host, so it runs first in the release's dispatch.
    prepare: (_page, box) => {
      off = hold.onRenderHold((h) => {
        if (!h && box.host) box.host.dispose();
      });
    },
  });
  await settle();
  assert.equal(run.host.state, 'held');
  run.page.setHeld(false);
  off();
  assertDisposedLast(run);
});

// ---- the hold is the real module's, by import (gh#305 REFUTE round 2) ------------------------------------

test('the host registers with the REAL hold under its own instance, names it on its layer, and leaves on exit', async () => {
  const run = await running();
  assert.ok(run.page.instance, 'the host made no registration the real hold module can see');
  assert.equal(run.page.mine(), 1);
  assert.equal(run.page.container.children[0].getAttribute('data-render-hold-instance'), run.page.instance, 'the layer does not name the instance its host registered under');
  run.page.setHeld(true);
  assert.equal(run.host.state, 'held', 'a real acquire did not pause the host');
  run.page.setHeld(false);
  assert.equal(run.host.state, 'running');
  run.host.dispose();
  assertCleanExit(run, 'disposed');
});

test('an environment carrying a holds object is ignored: an injected no-op cannot cut the host off the real hold', async () => {
  const page = makePage();
  let injectedCalls = 0;
  page.env.holds = {
    isRenderHeld: () => { injectedCalls++; return false; },
    onRenderHold: () => { injectedCalls++; return () => {}; },
  };
  const mod = makeModule();
  const reg = makeRegistry(mod);
  const { options, calls } = baseOptions(page, { registry: reg.registry });
  const host = launch(page, options);
  await settle();
  page.setHeld(true);
  assert.equal(host.state, 'held', 'the host followed the injected hold, not the real one');
  assert.equal(page.frames.size, 0, 'a frame stayed queued under the real hold');
  assert.equal(injectedCalls, 0, 'the host called into the injected hold');
  page.setHeld(false);
  host.dispose();
  assertCleanExit({ page, mod, calls, host }, 'disposed');
});

for (const [name, install] of [
  ['the pixel-ratio read', (page, fire) => { const real = page.env.devicePixelRatio; page.env.devicePixelRatio = () => { fire(); return real(); }; }],
  ['creating the layer', (page, fire) => { const real = page.doc.createElement; page.doc.createElement = (tag) => { const el = real(tag); if (tag === 'div') fire(); return el; }; }],
]) {
  test(`${name} before mount disposes: the module never mounts`, async () => {
    const run = hooked({
      prepare: (page, box) => {
        box.fire = trap(box);
        box.armed = false;
        install(page, () => box.fire());
        // Armed once the imports land, so the dispose falls between them and the mount.
        page.onFactory = () => { box.armed = true; };
      },
    });
    await settle();
    assertDisposedLast(run);
    assert.equal(run.mod.mounts.length, 0, 'a module mounted after the reveal was disposed');
  });
}

test('a renderer call inside a resize disposes: the module gets no resize after it', async () => {
  const run = hooked();
  await settle();
  const r = run.page.renderers[0];
  const realSize = r.setSize;
  r.setSize = (...a) => {
    realSize(...a);
    run.host.dispose();
  };
  const before = run.mod.commands.length;
  run.page.resizeObservers[0].cb();
  assert.equal(run.mod.commands.slice(before).filter((c) => c.type === 'resize').length, 0, 'a resize reached a disposed module');
  assertDisposedLast(run);
});

// ---- below 640px every game reveals in 2D (PD-305-04, PD-306-02, PD-307-02) ------------------------------
// The set this switch must enumerate is the registry's games x the width classes {<640, >=640} x the two
// callers (the projector stage and the games' own pages). Every case iterates GAMES, never a hand list, so
// a game added there is covered here, and one that skips the switch reds its own case.

const GAME_IDS = Object.keys(GAMES).filter(isAvailable);
const UNAVAILABLE_IDS = Object.keys(GAMES).filter((g) => !isAvailable(g));
const NARROW_WIDTHS = [320, 639, 639.5];
const WIDE_WIDTHS = [640, 1920];

/** The real registry's availability, with a loader that records which game was asked for. */
function registryOf(mod) {
  const reg = { loads: [] };
  reg.registry = {
    isAvailable,
    loaderFor: (game) => () => {
      reg.loads.push(game);
      return Promise.resolve(mod.module);
    },
  };
  return reg;
}

async function revealAt(game, width) {
  const page = makePage({ width });
  const mod = makeModule();
  const reg = registryOf(mod);
  const { options, calls } = baseOptions(page, { registry: reg.registry, game });
  const host = launch(page, options);
  await settle();
  return { page, mod, reg, calls, host };
}

test('the fake reads width queries as a browser does: a whole-pixel max-width misses a fractional width', () => {
  assert.equal(widthMatches('(max-width: 639px)', 639.5), false);
  assert.equal(widthMatches('(min-width: 640px)', 639.5), false);
  assert.equal(widthMatches('not all and (min-width: 640px)', 639.5), true);
  assert.equal(widthMatches('not all and (min-width: 640px)', 640), false);
  assert.throws(() => widthMatches('(orientation: portrait)', 320), /cannot evaluate/);
});

test('the integrated games are every module in the registry, so the cases below measure the width switch', () => {
  assert.deepEqual([...GAME_IDS].sort(), ['cards', 'envelopes', 'fireworks', 'flipcards', 'ladder', 'marbles', 'zones']);
  for (const game of GAME_IDS) assert.equal(isAvailable(game), true, `${game} is unavailable, so its cases prove nothing`);
});

test('any unavailable game is refused before it loads anything (none is unavailable today)', async () => {
  assert.deepEqual([...UNAVAILABLE_IDS].sort(), []);
  for (const game of UNAVAILABLE_IDS) {
    for (const width of [320, 1920]) {
      const run = await revealAt(game, width);
      assertCleanExit(run, 'fallback', 'unavailable');
      assert.deepEqual(run.reg.loads, [], `${game} was loaded at ${width}px while unavailable`);
      assert.equal(run.page.rendererLoads, 0, `three was imported for unavailable ${game}`);
      assert.deepEqual(run.page.contextRequests, [], `a WebGL context was asked for unavailable ${game}`);
    }
  }
});

for (const game of GAME_IDS) {
  for (const width of NARROW_WIDTHS) {
    test(`${game} at ${width}px reveals in 2D before three or the game is imported`, async () => {
      const run = await revealAt(game, width);
      assertCleanExit(run, 'fallback', 'narrow-entry');
      assert.deepEqual(run.reg.loads, [], `${game} was imported on a ${width}px screen`);
      assert.equal(run.page.rendererLoads, 0, `three was imported on a ${width}px screen`);
      assert.deepEqual(run.page.contextRequests, [], 'a WebGL context was asked for on a phone');
    });
  }
  for (const width of WIDE_WIDTHS) {
    test(`${game} at ${width}px runs in 3D (the control)`, async () => {
      const run = await revealAt(game, width);
      assert.equal(run.host.state, 'running');
      assert.deepEqual(run.reg.loads, [game]);
      assert.equal(run.mod.mounts.length, 1);
      assert.equal(run.calls.render2D.length, 0);
      run.host.dispose();
      assertCleanExit(run, 'disposed');
    });
  }

  test(`${game}: narrowing below 640px mid-reveal falls back once; widening again never restarts it`, async () => {
    const run = await revealAt(game, 1920);
    run.page.flush(16);
    run.page.setWidth(800);
    assert.equal(run.host.state, 'running', 'a resize that stays wide ended the reveal');
    run.page.setWidth(639.5);
    assertCleanExit(run, 'fallback', 'narrow');
    run.page.setWidth(1920);
    run.page.setWidth(320);
    await settle();
    assert.equal(run.mod.mounts.length, 1, 'the reveal mounted again');
    assert.equal(run.calls.render2D.length, 1, 'the 2D view was drawn again');
    assert.equal(run.host.state, 'fallback');
  });

  test(`${game}: narrowing while the game still loads falls back, and the late import is discarded`, async () => {
    const page = makePage();
    page.deferRenderer = true;
    const mod = makeModule();
    const reg = registryOf(mod);
    const { options, calls } = baseOptions(page, { registry: reg.registry, game });
    const host = launch(page, options);
    assert.equal(host.state, 'loading');
    page.setWidth(320);
    page.resolveRenderer();
    await settle();
    assertCleanExit({ page, mod, calls, host }, 'fallback', 'narrow');
    assert.equal(page.rendererCalls.length, 0, 'a renderer was made after the fallback');
    assert.equal(mod.mounts.length, 0);
  });

  test(`${game}: a 2D reveal on a phone stays 2D when the screen widens`, async () => {
    const run = await revealAt(game, 320);
    run.page.setWidth(1920);
    await settle();
    assertCleanExit(run, 'fallback', 'narrow-entry');
    assert.deepEqual(run.reg.loads, []);
    assert.deepEqual(run.page.contextRequests, []);
  });
}

test('reduced motion on a phone keeps its own reason: the reduced-motion check is unchanged and comes first', async () => {
  const page = makePage({ reducedMotion: true, width: 320 });
  const mod = makeModule();
  const reg = registryOf(mod);
  const { options, calls } = baseOptions(page, { registry: reg.registry });
  const host = launch(page, options);
  await settle();
  assertCleanExit({ page, mod, calls, host }, 'fallback', 'reduced-motion-entry');
});

/** Starts each reveal through the real host on `page`, recording the hosts a caller made. */
function realHosts(page, reg, container = null) {
  const hosts = [];
  const start = (o) => {
    const host = startReveal({ ...o, registry: reg.registry, ...(container ? { container } : {}) }, page.env);
    hosts.push(host);
    return host;
  };
  return { hosts, start };
}

for (const game of GAME_IDS) {
  test(`the ${game} page at 320px reveals in 2D through the real host; at 1920px it imports (control)`, async () => {
    for (const [width, wide] of [[320, false], [1920, true]]) {
      const page = makePage({ width });
      const reg = registryOf(makeModule());
      const { hosts, start } = realHosts(page, reg, wide ? page.container : null);
      const doc = makeDoc();
      const root = doc.createElement('div');
      const live = doc.createElement('p');
      doc.body.append(live, root);
      const demo = mountDemo({ doc, root, live, game, startReveal: start });
      const go = root.querySelector('.pr-go');
      go.disabled = false;
      go.click();
      await settle();
      assert.equal(hosts.length, 1, `${width}px: the page started no reveal`);
      if (wide) {
        assert.equal(hosts[0].state, 'running', `control: ${game} did not run in 3D at ${width}px`);
        assert.deepEqual(reg.loads, [game]);
      } else {
        assert.equal(hosts[0].reason, 'narrow-entry', `${game} at ${width}px: ${hosts[0].state} ${hosts[0].reason}`);
        assert.deepEqual(reg.loads, [], `${game} was imported on a phone`);
        assert.equal(page.rendererLoads, 0);
      }
      demo.dispose();
    }
  });
}

test('the projector at 320px reveals in 2D through the real host; at 1920px it imports (control)', async () => {
  for (const [width, wide] of [[320, false], [1920, true]]) {
    const origin = fakeOrigin();
    storedEvent(origin, { n: 50, games: { rounds: ['fireworks', null, null, null], final: null } });
    const page = makePage({ width });
    const reg = registryOf(makeModule());
    const { hosts, start } = realHosts(page, reg, wide ? page.container : null);
    const s = await mountStage({ origin, startReveal: start });
    press(s);
    await origin.idle();
    await settle();
    assert.equal(hosts.length, 1, `${width}px: the projector started no reveal`);
    if (wide) {
      assert.equal(hosts[0].state, 'running', 'control: the projector did not run in 3D');
      assert.deepEqual(reg.loads, ['fireworks']);
    } else {
      assert.equal(hosts[0].reason, 'narrow-entry');
      assert.deepEqual(reg.loads, [], 'the projector imported a game on a phone');
      assert.equal(page.rendererLoads, 0);
      assert.ok(s.go(), 'the MC can step on after the 2D reveal');
    }
  }
});

// ---- a width change while the page is hidden (REFUTE round 1) ----------------------------------------------
// Two delivery models: `change` on the resize itself, hidden or not, and the spec's -- reported at the next
// rendering update, which a hidden page never gets, so it lands after the page is visible again. Either way
// the reveal narrowed while hidden comes back in 2D without drawing one more 3D frame, and a 2D reveal
// widened while hidden stays 2D.

const ticksOf = (mod) => mod.commands.filter((c) => c.type === 'tick').length;

for (const media of ['immediate', 'next-frame']) {
  for (const game of GAME_IDS) {
    test(`${game} (${media}): narrowed while hidden, the reveal is in 2D once visible -- never another 3D frame`, async () => {
      const page = makePage({ media });
      const mod = makeModule();
      const reg = registryOf(mod);
      const { options, calls } = baseOptions(page, { registry: reg.registry, game });
      const host = launch(page, options);
      await settle();
      page.flush(16);
      assert.equal(host.state, 'running');
      const before = ticksOf(mod);
      page.setHidden(true);
      page.setWidth(320);
      page.setHidden(false);
      page.flush(32);
      page.flush(48);
      assertCleanExit({ page, mod, calls, host }, 'fallback', 'narrow');
      assert.equal(ticksOf(mod), before, 'a 3D frame was drawn after the viewport narrowed');
      assert.equal(mod.mounts.length, 1);
    });

    test(`${game} (${media}): widened while hidden, a 2D reveal stays 2D once visible`, async () => {
      for (const [label, start] of [['entry', 320], ['mid-reveal', 1920]]) {
        const page = makePage({ media, width: start });
        const mod = makeModule();
        const reg = registryOf(mod);
        const { options, calls } = baseOptions(page, { registry: reg.registry, game });
        const host = launch(page, options);
        await settle();
        if (start > 320) {
          page.setWidth(320);
          page.flush(16);
        }
        const reason = start > 320 ? 'narrow' : 'narrow-entry';
        assertCleanExit({ page, mod, calls, host }, 'fallback', reason);
        const loads = reg.loads.length;
        page.setHidden(true);
        page.setWidth(1920);
        page.setHidden(false);
        page.flush(32);
        await settle();
        assertCleanExit({ page, mod, calls, host }, 'fallback', reason);
        assert.equal(reg.loads.length, loads, `${label}: the game was imported again`);
        assert.ok(mod.mounts.length <= 1, `${label}: the reveal mounted again`);
      }
    });
  }
}

// ---- the held picture (gh#319: PD-315-02 a, PD-317-06 a, PD-318-01 a) ------------------------------------
// A game whose registry entry says `hold` keeps its last 3D frame on screen when the reveal settles: the
// loop stops, the committed 2D frame is drawn behind it, and the scene lives until dispose() or a trigger
// that would have fallen back mid-run. Both sets are read from the registry, never hand-listed, so a game
// added there is covered here and one whose pick changes reds its own case.

const HOLD_IDS = GAME_IDS.filter((g) => settleFor(g) === 'hold');
const HANDBACK_IDS = GAME_IDS.filter((g) => settleFor(g) === 'handback');

/** A reveal of `game` on a fresh page, through the real registry's availability and settle mode. */
async function revealOf(game, { pageOpts, modOpts, render2D, onState } = {}) {
  const page = makePage(pageOpts);
  const mod = makeModule(modOpts);
  const reg = registryOf(mod);
  const box = {};
  const { options, calls } = baseOptions(page, { registry: reg.registry, game });
  if (render2D) options.render2D = (o) => { calls.render2D.push(o); render2D(box.host); };
  if (onState) options.onState = (s, r) => { calls.states.push(r ? `${s}:${r}` : s); onState(s, box.host); };
  box.host = launch(page, options);
  await settle();
  return { page, mod, reg, calls, host: box.host };
}

/** Settled with the picture still up: nothing runs and nothing is released, the 2D frame is drawn exactly
 *  once behind it, and every trigger that would have fallen back mid-run is still heard. */
function assertHeldPicture({ page, mod, calls, host }) {
  assert.equal(host.state, 'settled');
  assert.equal(host.reason, null);
  assert.equal(calls.render2D.length, 1, 'the 2D frame was not drawn exactly once behind the held picture');
  assert.equal(calls.render2D[0], OUTCOME, 'the 2D frame drew something other than the committed outcome');
  assert.equal(page.frames.size, 0, 'a frame is still queued behind a held picture');
  assert.equal(page.container.children.length, 1, 'the 3D layer is not on screen');
  const cv = page.rendererCalls[0].canvas;
  assert.equal(cv.parentNode, page.container.children[0], 'the canvas is not attached to the layer');
  assert.equal(cv.getAttribute('aria-hidden'), 'true', 'the held canvas is not hidden from the accessibility tree');
  assert.equal(page.renderers[0].disposed, 0, 'the renderer was disposed while the picture is held');
  assert.equal(page.gls[0].released, 0, 'the WebGL context was released while the picture is held');
  assert.equal(mod.disposed, 0, 'the module handle was disposed while the picture is held');
  for (const res of mod.resources) assert.equal(res.disposed, 0, 'an owned resource was disposed while the picture is held');
  assert.equal(mod.context.signal.aborted, false, 'the module signal was aborted while the picture is held');
  assert.equal(page.resizeObservers[0].observed.length, 1, 'the resize observer was disconnected while the picture is held');
  assert.equal(cv.count('webglcontextlost'), 1, 'the held picture no longer hears a context loss');
  assert.equal(page.mql.count('change'), 1, 'the held picture no longer hears reduced motion');
  for (const list of page.widthMqls.values()) assert.equal(list.count('change'), 1, `the held picture no longer hears ${list.media}`);
}

for (const game of HOLD_IDS) {
  test(`${game}: complete holds the picture -- the loop stops, one 2D frame behind it, done settles`, async () => {
    assert.deepEqual([...HOLD_IDS, ...HANDBACK_IDS].sort(), [...GAME_IDS].sort(), 'a game is in neither settle set');
    const run = await revealOf(game);
    run.page.flush(16);
    const before = ticksOf(run.mod);
    run.mod.emit({ type: 'complete' });
    assertHeldPicture(run);
    assert.equal(await run.host.done, 'settled');
    run.page.flush(32);
    run.page.flush(48);
    assert.equal(ticksOf(run.mod), before, 'the held picture kept ticking');
    assert.equal(run.page.frames.size, 0, 'the held picture requested another frame');
    assert.deepEqual(run.calls.states, ['loading', 'running', 'settled']);
  });

  test(`${game}: finish holds the picture too`, async () => {
    const run = await revealOf(game);
    run.host.command('finish');
    assertHeldPicture(run);
    assert.deepEqual(run.mod.commands.at(-1), { type: 'finish' });
    assert.equal(await run.host.done, 'settled');
  });

  test(`${game}: dispose after a held settle releases everything once; a second dispose is a no-op`, async () => {
    const run = await revealOf(game);
    run.page.flush(16);
    run.mod.emit({ type: 'complete' });
    assertHeldPicture(run);
    run.host.dispose();
    assertCleanExit(run, 'disposed');
    assert.equal(run.mod.disposed, 1);
    assert.equal(await run.host.done, 'settled');
    run.host.dispose();
    assertCleanExit(run, 'disposed');
    assert.equal(run.mod.disposed, 1, 'the handle was disposed twice');
    assert.deepEqual(run.calls.states, ['loading', 'running', 'settled', 'disposed']);
    assert.equal(run.calls.render2D.length, 1, 'the 2D frame was drawn again on dispose');
  });

  test(`${game}: a dispose asked inside the held settle's 2D frame drops the picture: settled then disposed`, async () => {
    let root = null;
    const seen = { attached: null };
    const run = await revealOf(game, {
      modOpts: { onMount: (context) => { root = context.root; } },
      render2D: (host) => { seen.attached = root.parentNode !== null; host.dispose(); },
    });
    run.mod.emit({ type: 'complete' });
    assert.equal(seen.attached, true, 'the picture was already gone when the 2D frame was drawn');
    assertCleanExit(run, 'disposed');
    assert.deepEqual(run.calls.states.slice(-2), ['settled', 'disposed']);
    assert.equal(run.calls.render2D.length, 1);
    assert.equal(await run.host.done, 'settled');
  });

  test(`${game}: reduced motion turning on while the picture is held drops it; one 2D frame, no restart`, async () => {
    const run = await revealOf(game);
    run.page.flush(16);
    run.mod.emit({ type: 'complete' });
    assertHeldPicture(run);
    run.page.setReducedMotion(true);
    assertCleanExit(run, 'settled');
    assert.equal(run.mod.disposed, 1);
    run.page.setReducedMotion(false);
    run.page.flush(32);
    await settle();
    assert.equal(run.calls.render2D.length, 1, 'the 2D frame was drawn again');
    assert.equal(run.mod.mounts.length, 1);
    assert.equal(run.page.frames.size, 0);
    assert.equal(run.host.state, 'settled');
  });

  for (const width of NARROW_WIDTHS) {
    test(`${game}: narrowing to ${width}px while the picture is held drops it; widening never restarts it`, async () => {
      const run = await revealOf(game);
      run.page.flush(16);
      run.mod.emit({ type: 'complete' });
      assertHeldPicture(run);
      run.page.setWidth(width);
      assertCleanExit(run, 'settled');
      run.page.setWidth(1920);
      run.page.flush(32);
      await settle();
      assert.equal(run.calls.render2D.length, 1, 'the 2D frame was drawn again');
      assert.equal(run.mod.mounts.length, 1);
      assert.equal(run.page.frames.size, 0);
      assert.equal(run.host.state, 'settled');
    });
  }

  test(`${game}: a context lost while the picture is held drops it, default prevented`, async () => {
    const run = await revealOf(game);
    run.page.flush(16);
    run.mod.emit({ type: 'complete' });
    assertHeldPicture(run);
    let prevented = 0;
    run.page.rendererCalls[0].canvas.dispatch('webglcontextlost', { preventDefault: () => prevented++ });
    assert.equal(prevented, 1);
    assertCleanExit(run, 'settled');
    assert.equal(run.mod.disposed, 1);
  });

  test(`${game}: a held picture never restarts the loop on a render hold or a visibility change`, async () => {
    const run = await revealOf(game);
    run.page.flush(16);
    const before = ticksOf(run.mod);
    run.mod.emit({ type: 'complete' });
    assertHeldPicture(run);
    run.page.setHeld(true);
    assert.equal(run.host.state, 'settled', 'a render hold moved a settled reveal');
    assert.equal(run.page.frames.size, 0);
    run.page.setHeld(false);
    assert.equal(run.page.frames.size, 0, 'the hold release restarted the loop');
    run.page.setHidden(true);
    run.page.setHidden(false);
    run.page.flush(32);
    run.page.flush(48);
    assert.equal(run.page.frames.size, 0);
    assert.equal(ticksOf(run.mod), before, 'the held picture ticked again');
    assertHeldPicture(run);
  });

  test(`${game}: completing under a render hold settles with the picture up, and the release does not run it`, async () => {
    const run = await revealOf(game, { pageOpts: { held: true } });
    assert.equal(run.host.state, 'held');
    run.mod.emit({ type: 'complete' });
    assertHeldPicture(run);
    run.page.setHeld(false);
    run.page.flush(16);
    assert.equal(run.page.frames.size, 0, 'the hold release restarted a settled reveal');
    assert.equal(run.host.state, 'settled');
    assert.equal(ticksOf(run.mod), 0);
  });

  test(`${game}: reduced motion at entry stays 2D-only -- no canvas, no mount (control)`, async () => {
    const run = await revealOf(game, { pageOpts: { reducedMotion: true } });
    assertCleanExit(run, 'fallback', 'reduced-motion-entry');
    assert.deepEqual(run.page.contextRequests, []);
    assert.equal(run.mod.mounts.length, 0);
  });
}

for (const game of HANDBACK_IDS) {
  test(`${game}: complete still hands the scene back -- everything released, one 2D frame (control)`, async () => {
    const run = await revealOf(game);
    run.page.flush(16);
    run.mod.emit({ type: 'complete' });
    assertCleanExit(run, 'settled');
    assert.equal(run.mod.disposed, 1);
    assert.equal(await run.host.done, 'settled');
  });
}

for (const game of GAME_IDS) {
  test(`${game}: the host canvas is aria-hidden on every mount`, async () => {
    const run = await revealAt(game, 1920);
    assert.equal(run.page.rendererCalls[0].canvas.getAttribute('aria-hidden'), 'true', 'the host canvas is not hidden from the accessibility tree');
    run.host.dispose();
    assertCleanExit(run, 'disposed');
  });
}

// ---- the held picture's lifecycle edges (gh#319 cross-lineage review) ----
// The host tells its caller when a held picture is released (onRelease), on EVERY release path, after the
// canvas is detached; a resize while held re-renders at the new size; and a settle with no picture attached
// (finish during loading) hands back instead of holding.

for (const game of HOLD_IDS) {
  test(`${game}: a throw while the final draws releases the held picture and calls onRelease with the canvas gone`, async () => {
    const page = makePage();
    // The flipcards mechanism: the module emits complete (the host settles and holds) and THEN throws on the
    // same tick's draw. The throw must release the picture and tell the caller, or the frame stays hidden.
    const mod = makeModule({ onAdvance: (c) => { if (c.type === 'tick') { mod.emit({ type: 'complete' }); throw new Error('final draw'); } } });
    const reg = registryOf(mod);
    const releases = [];
    const { options, calls } = baseOptions(page, { registry: reg.registry, game, onRelease: () => releases.push(page.container.children.length) });
    const host = launch(page, options);
    await settle();
    page.flush(16);
    assert.equal(host.state, 'settled', 'the throw moved the settled reveal');
    assert.deepEqual(releases, [0], 'onRelease did not fire once, after the canvas was detached');
    assert.equal(calls.render2D.length, 1, 'the release drew the 2D frame a second time');
    assert.equal(page.container.children.length, 0, 'the released canvas is still attached');
  });

  test(`${game}: every release path calls onRelease once -- dispose, reduced motion, narrowing, context loss`, async () => {
    for (const trigger of ['dispose', 'reduced-motion', 'narrow', 'context-lost']) {
      const page = makePage();
      const mod = makeModule();
      const reg = registryOf(mod);
      const releases = [];
      const { options } = baseOptions(page, { registry: reg.registry, game, onRelease: () => releases.push(page.container.children.length) });
      const host = launch(page, options);
      await settle();
      page.flush(16);
      mod.emit({ type: 'complete' });
      assert.equal(page.container.children.length, 1, `${trigger}: precondition, the picture is up`);
      if (trigger === 'dispose') host.dispose();
      else if (trigger === 'reduced-motion') page.setReducedMotion(true);
      else if (trigger === 'narrow') page.setWidth(320);
      else page.rendererCalls[0].canvas.dispatch('webglcontextlost', { preventDefault() {} });
      assert.deepEqual(releases, [0], `${trigger}: onRelease did not fire once with the canvas detached`);
    }
  });

  test(`${game}: finish before the picture exists hands back -- no hold, the context released, one 2D frame`, async () => {
    const page = makePage();
    const mod = makeModule();
    const reg = makeRegistry(mod, { defer: true });
    const { options, calls } = baseOptions(page, { registry: reg.registry, game });
    const host = launch(page, options);
    assert.equal(host.state, 'loading');
    host.command('finish');
    assert.equal(host.state, 'settled');
    assert.equal(page.container.children.length, 0, 'a picture was held that never mounted');
    for (const gl of page.gls) assert.equal(gl.released, page.loseExtension ? 1 : 0, 'the context of a handback settle was not released');
    assert.equal(calls.render2D.length, 1);
    reg.resolve();
    await settle();
    assert.equal(mod.mounts.length, 0, 'the module mounted after the reveal handed back');
  });

  test(`${game}: a resize while held releases to the 2D result -- no module call after settle`, async () => {
    const page = makePage();
    const mod = makeModule();
    const reg = registryOf(mod);
    const releases = [];
    const { options, calls } = baseOptions(page, { registry: reg.registry, game, onRelease: () => releases.push(page.container.children.length) });
    const host = launch(page, options);
    await settle();
    page.flush(16);
    mod.emit({ type: 'complete' });
    const commands = mod.commands.length;
    page.container.clientWidth = 1024;
    page.container.clientHeight = 768;
    page.resizeObservers[0].cb();
    assert.equal(host.state, 'settled', 'the resize moved the settled reveal');
    assert.equal(page.container.children.length, 0, 'the held picture was not released by the resize');
    assert.deepEqual(releases, [0], 'onRelease did not fire once with the canvas detached');
    assert.equal(mod.commands.length, commands, 'a resize called the module after settle');
    assert.equal(calls.render2D.length, 1, 'the release drew the 2D frame a second time');
    assert.equal(page.gls[0].released, page.loseExtension ? 1 : 0, 'the released context was not freed');
  });

  test(`${game}: dispose inside render2D and again inside onRelease notifies disposed once`, async () => {
    const page = makePage();
    const mod = makeModule();
    const reg = registryOf(mod);
    const box = {};
    const { options, calls } = baseOptions(page, { registry: reg.registry, game });
    options.render2D = (o) => { calls.render2D.push(o); box.host.dispose(); };
    options.onRelease = () => { box.host.dispose(); };
    box.host = launch(page, options);
    await settle();
    page.flush(16);
    mod.emit({ type: 'complete' });
    assert.equal(box.host.state, 'disposed');
    assert.equal(calls.states.filter((s) => s === 'disposed').length, 1, 'onState(disposed) fired more than once');
    assert.equal(calls.render2D.length, 1, 'the 2D frame was drawn more than once');
  });
}
