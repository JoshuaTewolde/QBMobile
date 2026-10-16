import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

// Every file the app loads must be in the service worker's cache list, or it will be missing offline.
test('service worker caches every app file', () => {
  const sw = readFileSync('sw.js', 'utf8');
  const listed = new Set([...sw.match(/const APP_FILES = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map(m => m[1]));
  const required = [
    'index.html', 'style.css', 'manifest.webmanifest',
    ...readdirSync('src').map(f => `src/${f}`),
    ...readdirSync('icons').map(f => `icons/${f}`),
    ...readdirSync('vendor/pdfjs').filter(f => f.endsWith('.mjs')).map(f => `vendor/pdfjs/${f}`),
  ];
  for (const f of required) assert.ok(listed.has(f), `${f} missing from APP_FILES in sw.js`);
});
