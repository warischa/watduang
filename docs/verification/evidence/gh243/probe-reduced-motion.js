return {
  reduce: matchMedia('(prefers-reduced-motion: reduce)').matches,
  running: document.getAnimations().filter((a) => a.playState === 'running').length,
};
