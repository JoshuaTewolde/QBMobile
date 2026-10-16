// Turn question text into sentences of words, each word with a display form and a spoken form.
// Keeping both in one structure keeps the on-screen reveal aligned with what the voice says.

// How to handle pronunciation guides like (“therm-OP-ih-lee”). Change this one setting to switch behavior.
//   'drop':  speak the original word; the guide is shown on screen but not spoken.
//   'speak': speak the respelling in place of the word(s) it follows; the original words stay on screen.
export const GUIDE_MODE = 'drop';

const GUIDE = /^\(“([^”]*)”\)(\S*)$/;
const ABBREVIATIONS = new Set(['mr.', 'mrs.', 'ms.', 'dr.', 'st.', 'mt.', 'vs.', 'no.', 'jr.', 'sr.', 'gen.', 'col.', 'lt.', 'sgt.', 'capt.', 'ft.', 'ca.', 'c.', 'e.g.', 'i.e.']);

// Split into tokens on whitespace, but keep a whole guide "(“zhorzh-juh POME-pee-doo”)," as one token.
function tokenize(text) {
  return text.match(/\(“[^”]*”\)\S*|\S+/g) ?? [];
}

function endsSentence(token, next) {
  if (!next) return true;
  if (!/[.?!][”’")\]]*$/.test(token)) return false;
  const bare = token.replace(/[”’")\]]+$/, '').toLowerCase();
  if (ABBREVIATIONS.has(bare)) return false;
  if (/^[A-Z]\.$/.test(token)) return false;   // initials like "J."
  return /^[“"(‘']?[A-Z0-9]/.test(next);
}

export function prepareForSpeech(text, { guideMode = GUIDE_MODE } = {}) {
  const tokens = tokenize(text);
  const words = [];
  for (const t of tokens) {
    const g = t.match(GUIDE);
    if (!g) { words.push({ display: t, spoken: t === '/' ? '' : t, guide: false }); continue; }
    if (guideMode === 'speak') { words.push({ display: t, spoken: g[1] + g[2], guide: true }); continue; }
    // drop: move any trailing punctuation onto the previous word so the voice still pauses there
    if (g[2] && words.length) words[words.length - 1].spoken += g[2];
    words.push({ display: t, spoken: '', guide: true });
  }

  if (guideMode === 'speak') {
    // A guide with N space-separated groups replaces the N preceding words' speech.
    words.forEach((w, i) => {
      if (!w.guide) return;
      const n = w.spoken.split(/\s+/).length;
      for (let j = i - 1; j >= 0 && i - j <= n && !words[j].guide; j--) {
        // keep the replaced word's trailing punctuation so pauses stay natural
        const punct = words[j].spoken.match(/[.,;:?!”’"]*$/)[0];
        words[j].spoken = punct;
      }
    });
  }

  const sentences = [];
  let cur = [];
  words.forEach((w, i) => {
    cur.push(w);
    if (endsSentence(w.display, tokens[i + 1])) { sentences.push(cur); cur = []; }
  });
  if (cur.length) sentences.push(cur);

  return sentences.map(ws => ({ words: ws, spoken: ws.map(w => w.spoken).filter(Boolean).join(' ') }));
}
