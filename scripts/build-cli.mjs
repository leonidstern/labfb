// Builds the command line and server into dist/local.mjs (what npm ships): local.mjs and lib/ bundled and minified by
// esbuild, then every local name given again by terser (the same step the page script gets, scripts/build-widget.mjs):
// the shortest names, gzip packs the result about 2% smaller (1.5 KB of the package).
//   npx -p esbuild@<pinned> -p terser@<pinned> node scripts/build-cli.mjs
import fs from 'node:fs';
import { tool } from './npx-tools.mjs';

const esbuild = tool('esbuild');
const terser = tool('terser');
fs.rmSync('dist', { recursive: true, force: true });
const { outputFiles } = await esbuild.build({
  entryPoints: ['local.mjs'],
  bundle: true,
  minify: true,
  keepNames: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  outdir: 'dist',
  outExtension: { '.js': '.mjs' },
  logLevel: 'warning',
  write: false,
});
for (const f of outputFiles) {
  const { code } = await terser.minify(f.text, { compress: false, mangle: true, module: true, format: { comments: /^!/, ascii_only: true } });
  fs.mkdirSync('dist', { recursive: true });
  fs.writeFileSync(f.path, code + '\n');
}
