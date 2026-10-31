// Saves /digest/<night> as one self-contained HTML file, without a browser or a server.
// Usage: pnpm preview:save [-- <night>] [--no-marker]. Output: var/preview/index.html (git-ignored).
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createApp } from '../src/app.js';
import { lane } from '../src/lane.js';

const args = process.argv.slice(2);
const noMarker = args.includes('--no-marker');
const night = args.find((a) => !a.startsWith('--')) ?? '2026-10-28';
const out = 'var/preview/index.html';

if (noMarker) delete process.env.LANE_MARKER;

const res = await createApp().request(`/digest/${night}`);
if (res.status !== 200) {
  console.error(`preview:save failed: GET /digest/${night} returned ${res.status}`);
  process.exit(1);
}
const html = await res.text();
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html, 'utf8');

console.log(`saved ${out} (${Buffer.byteLength(html)} bytes)`);
console.log(`banner: ${lane().marker ? 'marker shown' : 'no marker set'}`);
