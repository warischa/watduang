// PROTOTYPE for measurement only (gh#288 Phase 0). Placeholder values, not design (ADR-0033).
// B2: SVG displacement "liquid glass" via backdrop-filter:url(#...), frosted B1 underneath as fallback.
const ns = 'http://www.w3.org/2000/svg';
const svg = document.createElementNS(ns, 'svg'); svg.setAttribute('width', '0'); svg.setAttribute('height', '0'); svg.setAttribute('aria-hidden', 'true'); svg.style.position = 'absolute';
svg.innerHTML = '<filter id="proto-glass" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.012 0.04" numOctaves="2" seed="3" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="28" xChannelSelector="R" yChannelSelector="G"/><feGaussianBlur stdDeviation="2"/></filter>';
document.body.prepend(svg);
const st = document.createElement('style');
st.textContent = 'header.chrome-bar{position:sticky;top:0;z-index:50;background:rgba(20,20,43,.72)!important;-webkit-backdrop-filter:blur(14px) saturate(1.4);backdrop-filter:blur(14px) saturate(1.4)}@supports (backdrop-filter:url(#proto-glass)){header.chrome-bar{backdrop-filter:url(#proto-glass) saturate(1.4)}}';
document.head.appendChild(st);
return getComputedStyle(document.querySelector('header.chrome-bar')).backdropFilter;
