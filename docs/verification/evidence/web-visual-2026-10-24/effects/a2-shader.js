// PROTOTYPE for measurement only (gh#288 Phase 0). Placeholder values, not design (ADR-0033).
// A2: one hand-written WebGL1 fragment shader behind the hero copy, half resolution, paused off-screen,
// one still frame under reduced motion. Without a context it returns and the CSS ground stays.
const host = document.querySelector('header.hero');
const c = document.createElement('canvas');
c.setAttribute('aria-hidden', 'true');
c.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;z-index:0;pointer-events:none;opacity:.45';
const gl = c.getContext('webgl', { antialias: false, premultipliedAlpha: true });
if (!gl) return 'no-webgl: CSS ground kept';
host.prepend(c);
host.querySelector('.inner').style.zIndex = '1';
const vs = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
const fs = 'precision mediump float;uniform vec2 r;uniform float t;' +
  'float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}' +
  'float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}' +
  'void main(){vec2 u=gl_FragCoord.xy/r;float v=n(u*3.+vec2(t*.05,t*.03))+.5*n(u*6.-t*.04);' +
  'vec3 a=vec3(1.,.8,0.),b=vec3(.17,.48,1.);gl_FragColor=vec4(mix(a,b,clamp(v*.7,0.,1.)),.9);}';
const sh = (type, s) => { const o = gl.createShader(type); gl.shaderSource(o, s); gl.compileShader(o); return o; };
const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(pr); gl.useProgram(pr);
gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
const ur = gl.getUniformLocation(pr, 'r'), ut = gl.getUniformLocation(pr, 't');
const size = () => { c.width = Math.round(host.clientWidth * 0.5); c.height = Math.round(host.clientHeight * 0.5); gl.viewport(0, 0, c.width, c.height); gl.uniform2f(ur, c.width, c.height); };
size(); addEventListener('resize', size);
const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
let on = true; new IntersectionObserver((e) => { on = e[0].isIntersecting; if (on && !still) requestAnimationFrame(f); }).observe(host);
const f = (ms) => { gl.uniform1f(ut, ms / 1000); gl.drawArrays(gl.TRIANGLES, 0, 3); if (on && !still) requestAnimationFrame(f); };
requestAnimationFrame(f);
return 'webgl';
