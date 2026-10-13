import { build } from 'esbuild';
import { mkdir, readdir, rm, copyFile } from 'node:fs/promises';
for (const file of await readdir('dist')) if (file.endsWith('.js')) await rm(`dist/${file}`);
await build({ entryPoints: ['src/app.js'], bundle: true, minify: true, format: 'esm', target: 'es2022', outdir: 'dist', splitting: true, chunkNames: 'chunk-[hash]', legalComments: 'eof' });
for (const file of ['file-worker.js', 'download-worker.js']) await copyFile(`src/${file}`, `dist/${file}`);
await mkdir('dist/licenses', { recursive: true });
await copyFile('node_modules/mediabunny/LICENSE', 'dist/licenses/Mediabunny.txt');
await copyFile('node_modules/@mediabunny/aac-encoder/LICENSE', 'dist/licenses/AAC-encoder.txt');
console.log('Built static GitHub Pages website.');
