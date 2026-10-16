import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepareForSpeech } from '../src/speech-text.js';

test('splits sentences, not on abbreviations or initials', () => {
  const s = prepareForSpeech('Mrs. Hill met J. R. Smith in the U.S. capital. This 480 BCE battle came first. For 10 points, name it.');
  assert.deepEqual(s.map(x => x.spoken), [
    'Mrs. Hill met J. R. Smith in the U.S. capital.',
    'This 480 BCE battle came first.',
    'For 10 points, name it.',
  ]);
});

test('drop mode: guide shown but not spoken, punctuation kept', () => {
  const [s] = prepareForSpeech('the Greek letter chi (“kai”). ');
  assert.equal(s.spoken, 'the Greek letter chi.');
  assert.deepEqual(s.words.map(w => w.display), ['the', 'Greek', 'letter', 'chi', '(“kai”).']);
});

test('speak mode: respelling replaces the words it follows', () => {
  const [s] = prepareForSpeech('Georges Pompidou (“zhorzh-juh POME-pee-doo”) negotiated.', { guideMode: 'speak' });
  assert.equal(s.spoken, 'zhorzh-juh POME-pee-doo negotiated.');
  assert.equal(s.words[0].display, 'Georges');
});

test('slash in quoted verse is not spoken', () => {
  const [s] = prepareForSpeech('passer-by, / That here');
  assert.equal(s.spoken, 'passer-by, That here');
});
