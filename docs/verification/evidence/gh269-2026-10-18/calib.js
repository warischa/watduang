// gh269 calibration page script. Reproduces, in a real Chrome, the ordering the 2026-10-16 replay
// simulated: the first-screen sampler's frame callback runs, a stylesheet-only reveal (no DOM
// mutation) is applied, then the open task runs. The real sampler is installed by the harness before
// this script (Page.addScriptToEvaluateOnNewDocument), so its rAF callback is registered first.
//
// ?mech=insert|adopt|media  -- how the leaf is revealed, all CSSOM, none a DOM mutation
//      attr                -- control: a DOM-attribute reveal, which IS a mutation
// ?order=pos|neg|real|task  -- pos: reveal, open 300ms later (must paint first)
//                              neg: open, reveal in the next task (must not paint first)
//                              real: reveal in a rAF callback after the sampler's, open in a task
//                                    posted from it (the replay's ordering)
//                              task: reveal in a task after the frame, open in the next task
(() => {
  const q = new URLSearchParams(location.search);
  const mech = q.get('mech');
  const order = q.get('order');
  const html = document.documentElement;
  const A = 'data-player-screen';
  const P = 'data-player-screen-pending';
  const t = () => performance.now();
  // A sequence number orders marks and mutation records exactly; performance.now() is coarsened
  // here and ties the open's own mutations with the reveal mark.
  let seq = 0;
  const log = { mech, order, events: [], mutations: [], frames: [], entries: [], gl: null, done: false };
  window.__cal = log;
  const rec = () => window.__watduangFirstScreen;

  const fresh = (kind) => { try { return document.createElement('canvas').getContext(kind) ? 'live' : 'null'; } catch (e) { return 'throw'; } };
  log.gl = { webgl: fresh('webgl'), webgl2: fresh('webgl2'), '2d': fresh('2d') };

  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      log.entries.push({ id: e.identifier, renderTime: e.renderTime, loadTime: e.loadTime, startTime: e.startTime,
        paintTime: e.paintTime ?? null, presentationTime: e.presentationTime ?? null, seenAt: t() });
    }
  }).observe({ type: 'element', buffered: true });

  new MutationObserver((rs) => {
    const at = t();
    for (const r of rs) log.mutations.push({ at, seq: ++seq, type: r.type, attr: r.attributeName, target: r.target.nodeName + (r.target.id ? '#' + r.target.id : '') });
  }).observe(html, { attributes: true, childList: true, characterData: true, subtree: true });

  const mark = (name) => log.events.push({ name, at: t(), seq: ++seq, samples: rec()?.samples ?? null, stopped: rec()?.stopped ?? null, frames: log.frames.length });

  const reveal = () => {
    mark('reveal-start');
    if (mech === 'insert') {
      const s = document.getElementById('base').sheet;
      s.insertRule('#leaf { display: block; }', s.cssRules.length);
    } else if (mech === 'adopt') {
      const s = new CSSStyleSheet();
      s.replaceSync('#leaf { display: block; }');
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, s];
    } else if (mech === 'media') {
      const s = document.getElementById('base').sheet;
      const m = [...s.cssRules].find((r) => r instanceof CSSMediaRule);
      m.media.mediaText = 'all';
    } else if (mech === 'attr') {
      // CONTROL, not stylesheet-only: the same reveal through a DOM attribute. The mutation counter and
      // the sampler's MutationObserver must both see this one.
      html.setAttribute('data-reveal', '');
    } else throw new Error('unknown mech ' + mech);
    mark('reveal');
  };

  const ps = document.querySelector('.ps');
  // The shared screen's open, as player-screen.ts does it: un-hide the root, announce open, and the
  // pending marker clears a microtask later.
  const open = () => {
    mark('open-start');
    ps.hidden = false;
    html.setAttribute(A, 'open');
    queueMicrotask(() => html.removeAttribute(P));
    mark('open');
  };

  const finish = () => setTimeout(() => { log.done = true; }, 600);
  const start = () => {
    mark('start');
    if (order === 'pos') requestAnimationFrame(() => { reveal(); setTimeout(() => { open(); finish(); }, 300); });
    else if (order === 'real') requestAnimationFrame(() => { reveal(); setTimeout(() => { open(); finish(); }, 0); });
    else if (order === 'task') requestAnimationFrame(() => { setTimeout(() => { reveal(); setTimeout(() => { open(); finish(); }, 0); }, 0); });
    else if (order === 'neg') requestAnimationFrame(() => { setTimeout(() => { open(); setTimeout(() => { reveal(); finish(); }, 0); }, 0); });
    else throw new Error('unknown order ' + order);
  };

  // Mount: closed plus pending in one task, so the sampler counts samples (an open is in flight).
  html.setAttribute(A, 'closed');
  html.setAttribute(P, '1');

  // Warm up 20 frames, then start from a TASK: a rAF registered from a task is queued after the
  // sampler's own callback for the next frame, which it registered during this frame's callbacks.
  const fr = (ts) => {
    log.frames.push({ ts, at: t() });
    if (log.frames.length === 20) setTimeout(start, 0);
    if (log.frames.length < 400) requestAnimationFrame(fr);
  };
  requestAnimationFrame(fr);
})();
