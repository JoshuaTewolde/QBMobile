import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { extractText } from '../src/pdftext.js';
import { parsePacket, parseAnswer, EXPECTED_TOSSUPS, EXPECTED_BONUSES } from '../src/parser.js';

const SAMPLES = {
  K: 'samples/K. Editors 4.pdf',
  D: 'samples/D. MIT A + Tennessee A + UBC A.pdf',
};

const packets = {};
for (const [name, path] of Object.entries(SAMPLES)) {
  packets[name] = parsePacket(await extractText(pdfjs, new Uint8Array(readFileSync(path))));
}

for (const name of Object.keys(SAMPLES)) {
  test(`packet ${name}: counts and structure`, () => {
    const p = packets[name];
    assert.deepEqual(p.warnings, []);
    assert.equal(p.tossups.length, EXPECTED_TOSSUPS);
    assert.equal(p.bonuses.length, EXPECTED_BONUSES);
    p.tossups.forEach((t, i) => {
      assert.equal(t.number, i + 1);
      assert.ok(t.question.length > 100, `tossup ${i + 1} question too short`);
      assert.ok(t.answer.primary, `tossup ${i + 1} has no answer`);
      assert.ok(t.category, `tossup ${i + 1} has no category`);
      assert.doesNotMatch(t.question, /ANSWER:|<[A-Z]/);
    });
    p.bonuses.forEach((b, i) => {
      assert.equal(b.number, i + 1);
      assert.equal(b.parts.length, 3);
      b.parts.forEach(part => assert.ok(part.answer.primary));
    });
  });
}

test('packet K: specific tossups', () => {
  const t = packets.K.tossups;
  assert.equal(packets.K.title, '2022 ACF Fall Packet K by Editors');
  assert.equal(t[0].category, 'Other History');
  assert.equal(t[0].answer.primary, 'Battle of Thermopylae (“therm-OP-ih-lee”)');
  assert.match(t[0].question, /^This battle occurred/);
  assert.match(t[0].question, /“300” Spartans\.$/);
  assert.equal(t[16].answer.primary, 'nitrogen AND oxygen');
  assert.equal(t[18].answer.primary, 'Venice');
  assert.equal(t[18].answer.note, 'Volpone is by Ben Jonson.');
  assert.match(t[18].answer.directives, /^or Venezia; accept The Merchant of Venice$/);
  assert.match(packets.K.bonuses[8].leadin,/“\[This country\] Is Bleeding”/);   // bracketed text that is read aloud is kept
});

test('packet K: bonus parts keep document order and drop reader instructions', () => {
  const b = packets.K.bonuses;
  assert.deepEqual(b[0].parts.map(p => p.difficulty), ['h', 'm', 'e']);
  assert.doesNotMatch(b[1].parts[0].question, /read slowly/);
  assert.match(b[1].parts[0].question, /a loud “C, a fast triplet/);
  assert.match(b[1].parts[2].question, /\[this key\]/);
});

test('glued questions and page breaks still split correctly', () => {
  const text = 'Tossups\n1. First question. For 10 points, name it.\nANSWER: one\n<Physics>2. Second question\n\ncontinues after a page break. For 10 points, name it.\nANSWER: two [accept 2]\n<Chemistry>\nBonuses\n';
  const p = parsePacket(text);
  assert.equal(p.tossups.length, 2);
  assert.equal(p.tossups[1].question, 'Second question continues after a page break. For 10 points, name it.');
  assert.equal(p.tossups[1].answer.primary, 'two');
  assert.equal(p.tossups[1].category, 'Chemistry');
});

test('malformed packets produce warnings', () => {
  const p = parsePacket('Tossups\n1. No answer line here. For 10 points, x.\n<Physics>\n3. Skipped a number. For 10 points, y.\nANSWER: y\n<Biology>\nstray text');
  const w = p.warnings.join('\n');
  assert.match(w, /Tossup 1: expected 1 ANSWER line, found 0/);
  assert.match(w, /numbering: expected 2, found 3/);
  assert.match(w, /Unparsed text at end of tossups/);
  assert.match(w, /No "Bonuses" heading/);
  assert.match(w, /Found 2 tossups \(expected 20\)/);
});

test('parseAnswer', () => {
  assert.deepEqual(parseAnswer('Pygmalion'), { primary: 'Pygmalion', directives: '', note: '', full: 'Pygmalion' });
  assert.equal(parseAnswer('California [or CA] (The first sentence refers to Mono Lake.)').note, 'The first sentence refers to Mono Lake.');
  assert.equal(parseAnswer('Cháng’é (“chahng-UH”)').primary, 'Cháng’é (“chahng-UH”)');
  assert.equal(parseAnswer('Gödel (The man is Kurt Gödel.)').note, 'The man is Kurt Gödel.');
});
