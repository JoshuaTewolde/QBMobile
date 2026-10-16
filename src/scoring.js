// Scoring rules. Pure functions; no DOM or storage.

export const POINTS = { right: 10, wrong: 0, neg: -5, dead: 0 };

// buzzedEarly: the buzz happened before the speech "end" event for the question.
export function outcomeFor({ buzzed, buzzedEarly, correct }) {
  if (!buzzed) return 'dead';
  if (correct) return 'right';
  return buzzedEarly ? 'neg' : 'wrong';
}

// Flip a graded result between right and wrong/neg (for fixing a misgrade). Dead questions are not graded.
export function flipOutcome(result) {
  if (result.outcome === 'dead') return result;
  const correct = result.outcome !== 'right';
  return { ...result, outcome: outcomeFor({ buzzed: true, buzzedEarly: result.buzzedEarly, correct }) };
}

// "wrong" counts wrong answers after the question finished reading; negs are counted separately.
export function tally(results) {
  const t = { points: 0, right: 0, wrong: 0, neg: 0, dead: 0, seen: results.length };
  for (const r of results) { t.points += POINTS[r.outcome]; t[r.outcome]++; }
  return t;
}

export function isMissed(result) {
  return result.outcome !== 'right';
}

// Stats per category: { [category]: tally }
export function tallyByCategory(results) {
  const groups = {};
  for (const r of results) (groups[r.category] ??= []).push(r);
  return Object.fromEntries(Object.entries(groups).map(([c, rs]) => [c, tally(rs)]));
}
