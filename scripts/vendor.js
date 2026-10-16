// Copy pdf.js into vendor/ so the app loads it locally (works offline, no CDN at runtime).
// Run after changing the pdfjs-dist version: npm run vendor
import { mkdirSync, copyFileSync, readFileSync } from 'node:fs';
const src = 'node_modules/pdfjs-dist/build/';
const dest = 'vendor/pdfjs/';
mkdirSync(dest, { recursive: true });
for (const f of ['pdf.min.mjs', 'pdf.worker.min.mjs']) copyFileSync(src + f, dest + f);
copyFileSync('node_modules/pdfjs-dist/LICENSE', dest + 'LICENSE');
const { version } = JSON.parse(readFileSync('node_modules/pdfjs-dist/package.json', 'utf8'));
console.log(`vendored pdfjs-dist ${version} into ${dest}`);
