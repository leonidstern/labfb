// Builds the widget people download: public/_lab/comments.js minified (comments and spaces out, names shortened),
// the readable file staying the source (on the hosted lab, a source map points back to it). 229 → 132 kB, 68 → 41 kB gzipped (15 Nov).
// Runs before npm pack/publish (prepack) and on the hosted lab's deploy (LAB_DEPLOY=1), where the minified file also takes
// comments.js's place, so the script URL people embed stays the same. The local lab serves it while it's newer than
// the source; an edit to the source is served as it is until the next build.
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The folder with comments.js: this repo's public/_lab, or another (a copy, to try the deploy's step: node
// scripts/build.mjs <copy>/public/_lab with LAB_DEPLOY=1).
const dir = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', '_lab'));
// The deploy's step swaps the readable file out of the folder, so it runs only when asked by name: LAB_DEPLOY=1, which
// vercel.json's build command sets (Vercel's own VERCEL variable is there only when the project exposes it).
const deploy = process.env.LAB_DEPLOY === '1';
const src = path.join(dir, 'comments.js');
const out = path.join(dir, 'comments.min.js');

await build({ entryPoints: [src], outfile: out, minify: true, sourcemap: deploy ? 'linked' : false, // a map only on the hosted lab: the package has the readable file beside it
  target: 'es2022', legalComments: 'inline', logLevel: 'warning',
  banner: { js: '/* lab comments · https://github.com/leonidstern/labfb · MIT · readable source: comments.js */' } });

if (deploy) {
  // The deploy's copy only (never the repo): the readable file moves to comments.src.js, the map points there.
  fs.copyFileSync(src, path.join(dir, 'comments.src.js'));
  const map = JSON.parse(fs.readFileSync(out + '.map', 'utf8'));
  map.sources = ['comments.src.js'];
  fs.writeFileSync(path.join(dir, 'comments.js.map'), JSON.stringify(map));
  fs.writeFileSync(src, fs.readFileSync(out, 'utf8').replace(/\/\/# sourceMappingURL=comments\.min\.js\.map\s*$/, '//# sourceMappingURL=comments.js.map\n'));
}
const kb = (f) => (fs.statSync(f).size / 1024).toFixed(0);
console.log(`[build] comments.min.js ${kb(out)} kB (source ${kb(deploy ? path.join(dir, 'comments.src.js') : src)} kB)`);
