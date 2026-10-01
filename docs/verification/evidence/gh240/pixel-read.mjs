// gh#240: reads the face colour of each die out of the probe's own screenshots, at the face points the
// probe recorded (inside each die's padding, where no pip can sit), plus each die's mean grey level
// over its whole box. ImageMagick does the decoding; nothing here is computed from CSS.
//
//   node docs/verification/evidence/gh240/pixel-read.mjs <probe-output.json>
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const result = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const dir = path.dirname(new URL(import.meta.url).pathname);
const magick = (args) => execFileSync('magick', args, { encoding: 'utf8' }).trim();

const legs = [
  ['idle', `${result.lane}-idle-first-turn.png`, result.idleAfterScroll],
  ['landed', `${result.lane}-landed.png`, result.landed],
];
for (const [label, file, dice] of legs) {
  const png = path.join(dir, file);
  const size = magick(['identify', '-format', '%wx%h', png]);
  for (const die of dice) {
    const { x, y } = die.facePoint;
    const face = magick([png, '-format', `%[pixel:p{${x},${y}}]`, 'info:']);
    const r = die.rect;
    const crop = `${Math.floor(r.width) - 2}x${Math.floor(r.height) - 2}+${Math.ceil(r.left) + 1}+${Math.ceil(r.top) + 1}`;
    const mean = magick([png, '-crop', crop, '+repage', '-colorspace', 'Gray', '-format', '%[fx:mean]', 'info:']);
    console.log(`${result.lane}\t${label}\t${file}\t${size}\t${die.id}\tclass="${die.classes}"\tfilter=${die.filter}\tpipsOn=${die.pipsOn}\tface@${x},${y}=${face}\tdieMeanGrey=${Number(mean).toFixed(4)}`);
  }
}
