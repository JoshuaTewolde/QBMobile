// ACF-style packet parser. Pure functions on plain text; no DOM or pdf.js, so it is reusable anywhere.
//
// Input: text with one PDF line per text line (see pdftext.js).
// Output: { title, tossups, bonuses, warnings }. Warnings are human-readable strings; an empty list means
// the packet looks well-formed.

export const EXPECTED_TOSSUPS = 20;
export const EXPECTED_BONUSES = 20;

// A category tag like <Other History> or <Painting/Sculpture>.
const CATEGORY = /<([A-Z][^<>\n]{0,60})>/g;
// Reader instructions to strip from question text. Other bracketed text (e.g. "[This country]") is read aloud.
const READER_INSTRUCTION = /\s*\[(?:read|emphasize|pause|pronounce|note to)[^\]]*\]/gi;

// Join PDF lines into one string. A line ending in a hyphen is joined without a space ("chi-" + "squared").
export function joinLines(text) {
  return text
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .reduce((acc, line) => (!acc ? line : /\S-$/.test(acc) ? acc + line : acc + ' ' + line), '');
}

export function stripReaderInstructions(s) {
  return s.replace(READER_INSTRUCTION, '').replace(/\s{2,}/g, ' ').trim();
}

// Split an answer line into its parts:
//   primary: the main answer, e.g. "Battle of Thermopylae (“therm-OP-ih-lee”)"
//   directives: contents of the [...] block (accept/prompt/reject), or ''
//   note: a trailing explanatory parenthetical, e.g. "Volpone is by Ben Jonson.", or ''
export function parseAnswer(raw) {
  const full = raw.trim();
  let primary = full, directives = '', note = '';
  const open = full.indexOf('[');
  if (open >= 0) {
    let depth = 0, close = -1;
    for (let i = open; i < full.length; i++) {
      if (full[i] === '[') depth++;
      else if (full[i] === ']' && --depth === 0) { close = i; break; }
    }
    primary = full.slice(0, open).trim();
    if (close < 0) {
      directives = full.slice(open + 1).trim();
    } else {
      directives = full.slice(open + 1, close).trim();
      note = full.slice(close + 1).trim();
    }
  } else {
    // No brackets: a trailing "(...)" that is not a pronunciation guide is a note.
    const m = full.match(/^(.*?)\s*\((?![“"])([^()]*)\)\s*$/);
    if (m && /\s/.test(m[2])) { primary = m[1].trim(); note = m[2].trim(); }
  }
  note = note.replace(/^\((.*)\)$/s, '$1').trim();
  return { primary, directives, note, full };
}

// Split a section into chunks that each end with a category tag. Returns { chunks, leftover }.
function splitByCategory(section) {
  const chunks = [];
  let last = 0, m;
  CATEGORY.lastIndex = 0;
  while ((m = CATEGORY.exec(section))) {
    chunks.push({ body: section.slice(last, m.index), category: m[1].trim() });
    last = CATEGORY.lastIndex;
  }
  return { chunks, leftover: section.slice(last).trim() };
}

// Pull "N. " off the front of a chunk.
function takeNumber(body) {
  const m = body.match(/^\s*(\d{1,3})\.\s+/);
  return m ? { number: Number(m[1]), rest: body.slice(m[0].length) } : { number: null, rest: body.trim() };
}

function parseTossup(chunk, warn) {
  const { number, rest } = takeNumber(chunk.body);
  const label = `Tossup ${number ?? '?'}`;
  if (number === null) warn(`${label}: no question number found near "${chunk.body.trim().slice(0, 40)}…"`);
  const parts = rest.split(/\bANSWER:\s*/);
  if (parts.length !== 2) warn(`${label}: expected 1 ANSWER line, found ${parts.length - 1}`);
  const question = stripReaderInstructions(joinLines(parts[0] ?? ''));
  const answer = parseAnswer(joinLines(parts.slice(1).join(' ANSWER: ')));
  if (!/for (?:10|ten) points/i.test(question)) warn(`${label}: no "For 10 points" in question text`);
  if (!question) warn(`${label}: empty question text`);
  if (!answer.primary) warn(`${label}: empty answer`);
  return { number, category: chunk.category, question, answer };
}

function parseBonus(chunk, warn) {
  const { number, rest } = takeNumber(chunk.body);
  const label = `Bonus ${number ?? '?'}`;
  if (number === null) warn(`${label}: no question number found near "${chunk.body.trim().slice(0, 40)}…"`);
  // Parts are tagged [10e]/[10m]/[10h] and may be in any order; keep document order.
  const pieces = rest.split(/\[10([emh])\]\s*/);
  const leadin = stripReaderInstructions(joinLines(pieces[0]));
  const parts = [];
  for (let i = 1; i < pieces.length; i += 2) {
    const [q, ...a] = pieces[i + 1].split(/\bANSWER:\s*/);
    if (a.length !== 1) warn(`${label}: part [10${pieces[i]}] has ${a.length} ANSWER lines`);
    parts.push({ difficulty: pieces[i], question: stripReaderInstructions(joinLines(q)), answer: parseAnswer(joinLines(a.join(' ANSWER: '))) });
  }
  if (parts.length !== 3) warn(`${label}: expected 3 parts, found ${parts.length}`);
  return { number, category: chunk.category, leadin, parts };
}

function checkNumbering(items, kind, warn) {
  items.forEach((it, i) => {
    if (it.number !== null && it.number !== i + 1) warn(`${kind} numbering: expected ${i + 1}, found ${it.number}`);
  });
}

export function parsePacket(text) {
  const warnings = [];
  const warn = w => warnings.push(w);

  const t = text.replace(/\r\n?/g, '\n');
  const tossHead = t.match(/^[ \t]*Tossups[ \t]*$/m);
  const bonusHead = t.match(/^[ \t]*Bonuses[ \t]*$/m);
  if (!tossHead) warn('No "Tossups" heading found');
  if (!bonusHead) warn('No "Bonuses" heading found');

  const tossStart = tossHead ? tossHead.index + tossHead[0].length : 0;
  const tossEnd = bonusHead ? bonusHead.index : t.length;
  const title = joinLines(t.slice(0, tossHead ? tossHead.index : 0)).replace(/\s*Edited by.*$/i, '');

  const tossSection = splitByCategory(t.slice(tossStart, tossEnd));
  if (tossSection.leftover) warn(`Unparsed text at end of tossups: "${tossSection.leftover.slice(0, 60)}…"`);
  const tossups = tossSection.chunks.map(c => parseTossup(c, warn));
  checkNumbering(tossups, 'Tossup', warn);

  let bonuses = [];
  if (bonusHead) {
    const bonusSection = splitByCategory(t.slice(bonusHead.index + bonusHead[0].length));
    if (bonusSection.leftover) warn(`Unparsed text at end of bonuses: "${bonusSection.leftover.slice(0, 60)}…"`);
    bonuses = bonusSection.chunks.map(c => parseBonus(c, warn));
    checkNumbering(bonuses, 'Bonus', warn);
  }

  if (tossups.length !== EXPECTED_TOSSUPS) warn(`Found ${tossups.length} tossups (expected ${EXPECTED_TOSSUPS})`);
  if (bonuses.length !== EXPECTED_BONUSES) warn(`Found ${bonuses.length} bonuses (expected ${EXPECTED_BONUSES})`);

  return { title, tossups, bonuses, warnings };
}
