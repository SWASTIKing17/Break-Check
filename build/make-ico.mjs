// One-shot script: bundle the pre-resized PNGs into a multi-resolution ICO.
// Not part of runtime — only invoked from `npm run icon`.
import fs from 'node:fs';
import pngToIco from 'png-to-ico';

const sizes = [16, 24, 32, 48, 64, 128, 256];
const inputs = sizes.map(s => `build/icon_${s}.png`);

const buf = await pngToIco(inputs);
fs.writeFileSync('build/icon.ico', buf);
console.log(`Wrote build/icon.ico (${buf.length} bytes) — sizes: ${sizes.join(', ')}`);
