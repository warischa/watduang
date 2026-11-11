// gh#303 REFUTE round 2: the CLOSED authoring grammar of the boards' picked frames (the picked option's frames and the
// shared F frames). The generator writes only what is listed here, and render-boards.mjs fails anything else it finds
// in a picked frame: an element, an attribute, an attribute value, a CSS longhand or a CSS value outside these lists.
// This is a set this directory owns, so it closes; a list of what the browser can paint would never close.
// Forbidden by omission: <use>, <symbol>, <defs>, gradients and patterns (no url() paint), <text>, <img>, <template>,
// list items and ::marker, opacity, fill-opacity and stroke-opacity, zoom and the individual scale/rotate/translate
// properties, filters, masks, clip paths, blend modes, animations and transitions, and generated content.
// Values are matched as Chrome serialises them (CSSOM longhands; attributes as written).

const NUM = '-?\\d+(\\.\\d+)?';
const PAINT = '^(#[0-9a-fA-F]{6}|none|currentColor)$';
const RESET = '^(initial|normal|none|auto|0|100%|stretch|1|0px|0%|visible)$';
const LEN = '^(-?\\d+(\\.\\d+)?(px|%|em)?|auto|initial|0)$';
const LENS = '^((-?\\d+(\\.\\d+)?(px|%|em)?|auto|initial)\\s?)+$';

export const GRAMMAR = {
  html: ['div', 'span', 'i', 'b', 'small', 'h1', 'h2', 'h3', 'p'],
  svg: ['svg', 'g', 'line', 'circle', 'path', 'rect', 'polyline', 'polygon'],
  // attribute -> value shape; '*' on an element applies to every element; data-* are listed one by one
  attrs: {
    '*': { class: '^[A-Za-z0-9_ -]*$', style: '', 'aria-hidden': '^true$', 'data-frame': '^[a-z0-9-]+$', 'data-dir': '^[ABF]$',
      'data-expect': '^\\d+/\\d+$', 'data-min': `^${NUM}$`, 'data-max': `^${NUM}$` },
    svg: { width: `^${NUM}$`, height: `^${NUM}$`, viewBox: '^[-\\d. ]+$' },
    g: { transform: `^(\\s*(translate|scale|rotate)\\(${NUM}([ ,]+${NUM}){0,2}\\))+\\s*$`, fill: PAINT },
    line: { x1: `^${NUM}$`, y1: `^${NUM}$`, x2: `^${NUM}$`, y2: `^${NUM}$`, stroke: PAINT, 'stroke-width': `^${NUM}$`, 'stroke-linecap': '^(round|butt|square)$', 'stroke-dasharray': '^[\\d. ]+$' },
    circle: { cx: `^${NUM}$`, cy: `^${NUM}$`, r: `^${NUM}$`, fill: PAINT, stroke: PAINT, 'stroke-width': `^${NUM}$` },
    path: { d: '^[MmLlHhVvCcSsQqZz\\d\\s.,-]+$', fill: PAINT, stroke: PAINT, 'stroke-width': `^${NUM}$`, 'stroke-linecap': '^(round|butt|square)$', 'stroke-linejoin': '^(round|miter|bevel)$' },
    rect: { x: `^${NUM}$`, y: `^${NUM}$`, width: `^${NUM}$`, height: `^${NUM}$`, rx: `^${NUM}$`, fill: PAINT },
    polyline: { points: '^[\\d\\s.,-]+$', fill: PAINT, stroke: PAINT, 'stroke-width': `^${NUM}$`, 'stroke-linejoin': '^(round|miter|bevel)$', 'stroke-linecap': '^(round|butt|square)$', 'stroke-dasharray': '^[\\d. ]+$' },
    polygon: { points: '^[\\d\\s.,-]+$', fill: PAINT },
  },
  // the only pseudo-elements a rule reaching a picked frame may name
  pseudo: ['before', 'after'],
  // CSS longhand -> value shape ('' = any value that passes the global check below)
  css: {
    display: '^(flex|block|grid|none|inline-flex|inline-block|inline)$',
    position: '^(relative|absolute|static)$', 'z-index': '^-?\\d+$', 'pointer-events': '^none$',
    top: LEN, right: LEN, bottom: LEN, left: LEN, width: LEN, height: LEN, 'min-width': LEN, 'min-height': LEN, 'min-block-size': LEN,
    'margin-top': LEN, 'margin-right': LEN, 'margin-bottom': LEN, 'margin-left': LEN, 'margin-inline-start': LEN, 'margin-inline-end': LEN, 'margin-block-start': LEN, 'margin-block-end': LEN,
    'padding-top': LEN, 'padding-right': LEN, 'padding-bottom': LEN, 'padding-left': LEN, 'padding-block-start': LEN, 'padding-block-end': LEN, 'padding-inline-start': LEN, 'padding-inline-end': LEN,
    'box-sizing': '^(border-box|content-box)$', 'overflow-x': '^(hidden|clip|visible)$', 'overflow-y': '^(hidden|clip|visible)$',
    'flex-direction': '^(row|column)$', 'flex-wrap': '^(wrap|nowrap)$', 'flex-grow': `^${NUM}$`, 'flex-shrink': `^${NUM}$`, 'flex-basis': LEN,
    'align-items': '^(center|flex-end|flex-start|start|end|baseline|stretch|normal)$', 'align-content': '^(center|normal)$',
    'justify-content': '^(space-between|center|flex-start|flex-end|start|normal)$', 'row-gap': LEN, 'column-gap': LEN,
    'grid-template-columns': '^[\\w\\s(),.-]+$', 'grid-auto-rows': '^[\\w\\s(),.-]+$', 'grid-column-start': '^(-?\\d+|auto)$', 'grid-column-end': '^(-?\\d+|auto)$',
    'font-family': '^(Sarabun|Mitr|ui-monospace)(, [A-Za-z -]+)*$', 'font-size': LEN, 'font-weight': '^(400|500|600|700|normal|bold)$', 'line-height': '^(\\d+(\\.\\d+)?(px)?|normal|initial)$',
    'font-style': '^(normal|initial)$', 'font-stretch': '^(normal|initial|100%)$', 'font-size-adjust': '^(none|initial)$',
    'font-variant-caps': RESET, 'font-variant-ligatures': RESET, 'font-variant-numeric': RESET, 'font-variant-east-asian': RESET, 'font-variant-alternates': RESET,
    'font-variant-position': RESET, 'font-variant-emoji': RESET, 'font-language-override': RESET, 'font-kerning': RESET, 'font-optical-sizing': RESET,
    'font-feature-settings': RESET, 'font-variation-settings': RESET,
    'letter-spacing': LEN, 'word-spacing': LEN, 'text-align': '^(center|right|left|start)$', 'white-space-collapse': '^collapse$', 'text-wrap-mode': '^(wrap|nowrap)$',
    'overflow-wrap': '^(anywhere|normal)$', 'text-decoration-line': '^(none|line-through)$', 'text-decoration-thickness': RESET, 'text-decoration-style': RESET, 'text-decoration-color': RESET,
    color: '', 'background-color': '', 'background-image': '^(initial|none|(repeating-)?linear-gradient\\(.*\\))$',
    'background-position-x': RESET, 'background-position-y': RESET, 'background-size': RESET, 'background-repeat': RESET, 'background-attachment': RESET, 'background-origin': RESET, 'background-clip': RESET,
    'border-top-width': LEN, 'border-right-width': LEN, 'border-bottom-width': LEN, 'border-left-width': LEN, 'border-block-start-width': LEN, 'border-block-end-width': LEN,
    'border-top-style': '^(solid|dashed|none|initial)$', 'border-right-style': '^(solid|dashed|none|initial)$', 'border-bottom-style': '^(solid|dashed|none|initial)$', 'border-left-style': '^(solid|dashed|none|initial)$',
    'border-block-start-style': '^(solid|dashed|none)$', 'border-block-end-style': '^(solid|dashed|none)$',
    'border-top-color': '', 'border-right-color': '', 'border-bottom-color': '', 'border-left-color': '', 'border-block-start-color': '', 'border-block-end-color': '',
    'border-image-source': '^(none|initial)$', 'border-image-slice': RESET, 'border-image-width': RESET, 'border-image-outset': RESET, 'border-image-repeat': RESET,
    'border-top-left-radius': LENS, 'border-top-right-radius': LENS, 'border-bottom-right-radius': LENS, 'border-bottom-left-radius': LENS,
    'box-shadow': '', 'text-shadow': '',
    // the frame's own 75% display scale is the only transform; render-boards also fails a transform on any element that
    // bears text
    transform: '^(none|scale\\(0\\.75\\))$', 'transform-origin': '^0px 0px$',
    'object-fit': '^contain$', 'object-position': '^center center$',
    content: '^(""|none|normal)$',
  },
  // no value may reach outside the board or compute itself
  banned: '(url\\(|attr\\(|var\\(|env\\(|image-set\\(|element\\(|paint\\(|cross-fade\\(|expression\\()',
};
