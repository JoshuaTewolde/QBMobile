import { test } from 'node:test';
import assert from 'node:assert/strict';
import { outcomeFor, flipOutcome, tally, tallyByCategory } from '../src/scoring.js';

test('outcomes', () => {
  assert.equal(outcomeFor({ buzzed: true, buzzedEarly: true, correct: true }), 'right');
  assert.equal(outcomeFor({ buzzed: true, buzzedEarly: false, correct: true }), 'right');
  assert.equal(outcomeFor({ buzzed: true, buzzedEarly: true, correct: false }), 'neg');
  assert.equal(outcomeFor({ buzzed: true, buzzedEarly: false, correct: false }), 'wrong');
  assert.equal(outcomeFor({ buzzed: false }), 'dead');
});

test('tally', () => {
  const t = tally(['right', 'right', 'neg', 'wrong', 'dead'].map(outcome => ({ outcome })));
  assert.deepEqual(t, { points: 15, right: 2, wrong: 1, neg: 1, dead: 1, seen: 5 });
});

test('flip fixes a misgrade, respecting buzz timing', () => {
  assert.equal(flipOutcome({ outcome: 'right', buzzedEarly: true }).outcome, 'neg');
  assert.equal(flipOutcome({ outcome: 'right', buzzedEarly: false }).outcome, 'wrong');
  assert.equal(flipOutcome({ outcome: 'neg', buzzedEarly: true }).outcome, 'right');
  assert.equal(flipOutcome({ outcome: 'dead', buzzedEarly: false }).outcome, 'dead');
});

test('by category', () => {
  const by = tallyByCategory([{ outcome: 'right', category: 'Physics' }, { outcome: 'neg', category: 'Physics' }, { outcome: 'dead', category: 'Biology' }]);
  assert.equal(by.Physics.points, 5);
  assert.equal(by.Biology.seen, 1);
});
