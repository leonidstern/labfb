// Builds the page script: src/comments.js and its modules, bundled and minified into public/_lab/comments.js (and the
// parts it loads later, below). The
// stylesheet (src/widget/styles.css) goes in as text, minified too: esbuild's command line can't minify CSS it loads
// as text, so this runs esbuild's API instead.
//
// labit has no dependencies: package.json runs this through `npx -p esbuild@<pinned> node …`, which puts esbuild on
// PATH for this process only, and the API is found next to that command.
//   node scripts/build-widget.mjs --outfile=<file> [--watch]
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const outfile = arg('outfile') || 'public/_lab/comments.js';
const watch = process.argv.includes('--watch');

const bin = (process.env.PATH || '').split(path.delimiter).find((d) => fs.existsSync(path.join(d, 'esbuild')) && fs.existsSync(path.join(d, '..', 'esbuild', 'package.json')));
if (!bin) {
  console.error('esbuild not found: run this with npm run build (npx -p esbuild@… node scripts/build-widget.mjs)');
  process.exit(1);
}
const esbuild = createRequire(path.join(bin, '..', 'esbuild', 'package.json'))('esbuild');

// The stylesheet as text, minified (comments and spaces out). Everything else as the plain command line did it.
const minifiedCss = {
  name: 'minified-css-text',
  setup(build) {
    build.onLoad({ filter: /\.css$/ }, async (a) => {
      const { code } = await esbuild.transform(await fs.promises.readFile(a.path, 'utf8'), { loader: 'css', minify: true });
      return { contents: code.trim(), loader: 'text' };
    });
  },
};
const options = {
  entryPoints: ['src/comments.js'],
  bundle: true,
  format: 'iife',
  legalComments: 'inline',
  minify: true,
  logLevel: 'warning',
  outfile,
  plugins: [minifiedCss],
  define: { 'globalThis.__LAB_DEBUG__': 'false' },
};
// Parts the page script loads only when they are used (part(name) in src/comments.js): each one an ES module beside
// it, <name>.js, with its own styles in it. The lab serves them with the script (public/_lab/*.js), and its widget
// version covers them (widgetRev in local.mjs), so a change to one reloads open pages too.
const PARTS = { components: 'src/widget/components.ts', switcher: 'src/widget/switcher.ts', draw: 'src/widget/draw.ts' };
// The board page's script (src/board/board.ts) is built beside it: only the board page loads it.
const board = { ...options, entryPoints: ['src/board/board.ts'], outfile: path.join(path.dirname(outfile), 'board.js') };
const builds = [
  options,
  ...Object.entries(PARTS).map(([name, entry]) => ({ ...options, entryPoints: [entry], format: 'esm', outfile: path.join(path.dirname(outfile), `${name}.js`) })),
  board,
];
if (watch) for (const o of builds) await (await esbuild.context(o)).watch();
else await Promise.all(builds.map((o) => esbuild.build(o)));
