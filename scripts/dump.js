// Debug helper: print the extracted text of a packet PDF.
import { readFileSync } from 'node:fs';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { extractText } from '../src/pdftext.js';
console.log(await extractText(pdfjs, new Uint8Array(readFileSync(process.argv[2]))));
