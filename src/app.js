// UI wiring: screens, the question flow (read → buzz → countdown → answer → grade → next), uploads, review.

import { parsePacket } from './parser.js';
import { prepareForSpeech } from './speech-text.js';
import { Reader } from './reader.js';
import { outcomeFor, flipOutcome, tally, tallyByCategory, isMissed, POINTS } from './scoring.js';
import { store } from './storage.js';

const BUZZ_SECONDS = 5;   // countdown after a buzz before the answer is revealed
const DEATH_SECONDS = 5;  // time to buzz after reading finishes

const $ = id => document.getElementById(id);
const reader = new Reader();
const OUTCOME_LABEL = { right: 'Right', wrong: 'Wrong', neg: 'Neg', dead: 'Dead' };

// ---------- screens ----------
function show(screen) {
  for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== screen;
  if (screen === 'question') requestWakeLock(); else releaseWakeLock();
  if (screen === 'home') renderHome();
  if (screen === 'missed') renderMissed();
  if (screen === 'settings') renderSettings();
}
document.querySelectorAll('[data-home]').forEach(b => b.onclick = () => show('home'));

function renderTally() {
  const t = tally(store.results());
  const html = [['Points', t.points], ['Right', t.right], ['Wrong', t.wrong], ['Negs', t.neg], ['Seen', t.seen]]
    .map(([k, v]) => `<div><b>${v}</b>${k}</div>`).join('');
  document.querySelectorAll('[data-tally]').forEach(el => el.innerHTML = html);
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------- home ----------
function renderHome() {
  renderTally();
  const packets = store.packets();
  const { packetId } = store.progress();
  $('noPackets').hidden = packets.length > 0;
  $('packetList').innerHTML = packets.map(p => {
    const pos = store.position(p.id);
    const where = pos >= p.tossups.length ? 'finished' : pos > 0 ? `at question ${pos + 1}` : 'not started';
    return `<li class="${p.id === packetId ? 'current' : ''}" data-id="${p.id}">
      <div class="grow" data-open>${esc(p.title)}<small>${p.tossups.length} tossups · ${where}</small></div>
      <button data-delete aria-label="Delete">🗑</button></li>`;
  }).join('');
  const current = packets.find(p => p.id === packetId);
  $('continueBtn').hidden = !current;
  if (current) {
    const pos = store.position(current.id);
    $('continueBtn').textContent = pos >= current.tossups.length ? 'Packet finished: start over' : `Continue: question ${pos + 1}`;
  }
}

$('packetList').onclick = e => {
  const li = e.target.closest('li');
  if (!li) return;
  const packet = store.packet(li.dataset.id);
  if (e.target.closest('[data-delete]')) {
    if (confirm(`Delete "${packet.title}"? Your scores are kept.`)) { store.deletePacket(packet.id); renderHome(); }
  } else if (e.target.closest('[data-open]')) {
    openPacket(packet);
  }
};

$('continueBtn').onclick = () => openPacket(store.packet(store.progress().packetId));

function openPacket(packet) {
  let pos = store.position(packet.id);
  if (pos >= packet.tossups.length) {
    if (!confirm('This packet is finished. Start over from question 1?')) return;
    pos = 0;
  }
  store.setProgress(packet.id, pos);
  startQuestion(packet, pos);
}

$('resetScores').onclick = () => {
  if (confirm('Reset all scores and the missed-question list? Packets and positions are kept.')) { store.resetResults(); renderHome(); }
};
$('openMissed').onclick = () => show('missed');
$('openSettings').onclick = () => show('settings');

// ---------- upload ----------
let pdfjsPromise = null;
function loadPdfjs() {
  pdfjsPromise ??= import('../vendor/pdfjs/pdf.min.mjs').then(pdfjs => {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
    return pdfjs;
  });
  return pdfjsPromise;
}

$('fileInput').onchange = async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  const status = $('importStatus');
  status.innerHTML = `<p class="dim">Reading ${esc(file.name)}…</p>`;
  try {
    const [{ extractText }, pdfjs] = await Promise.all([import('./pdftext.js'), loadPdfjs()]);
    const text = await extractText(pdfjs, new Uint8Array(await file.arrayBuffer()));
    const parsed = parsePacket(text);
    const packet = {
      id: String(Date.now()),
      title: parsed.title || file.name.replace(/\.pdf$/i, ''),
      addedAt: Date.now(),
      tossups: parsed.tossups,
      bonuses: parsed.bonuses,
      warnings: parsed.warnings,
    };
    const counts = `${parsed.tossups.length} tossups, ${parsed.bonuses.length} bonuses`;
    if (!parsed.warnings.length) {
      saveImported(packet, `<div class="ok">Saved <b>${esc(packet.title)}</b>: ${counts}.</div>`);
      return;
    }
    status.innerHTML = `<div class="warn"><b>This packet may not have parsed correctly.</b> Found ${counts}.
      <ul>${parsed.warnings.slice(0, 12).map(w => `<li>${esc(w)}</li>`).join('')}${parsed.warnings.length > 12 ? `<li>…and ${parsed.warnings.length - 12} more</li>` : ''}</ul>
      ${parsed.tossups.length ? '<button id="saveAnyway" class="btn secondary">Save anyway</button>' : ''}
      <button id="discard" class="btn secondary">Discard</button></div>`;
    $('discard').onclick = () => status.innerHTML = '';
    if ($('saveAnyway')) $('saveAnyway').onclick = () => saveImported(packet, `<div class="ok">Saved <b>${esc(packet.title)}</b> with warnings.</div>`);
  } catch (err) {
    console.error(err);
    status.innerHTML = `<div class="warn"><b>Could not read this PDF.</b><br>${esc(err.message || err)}</div>`;
  }
};

function saveImported(packet, message) {
  if (!store.addPacket(packet)) {
    $('importStatus').innerHTML = '<div class="warn"><b>Not saved:</b> phone storage is full. Delete a packet and try again.</div>';
    return;
  }
  if (!store.progress().packetId) store.setProgress(packet.id, 0);
  $('importStatus').innerHTML = message;
  renderHome();
}

// ---------- question flow ----------
// phase: 'reading' (speech in progress, possibly paused) → 'dying' (reading done, death timer)
//        → 'countdown' (buzzed) → 'answer'
let q = null;

function settingsVoice() {
  const { voiceName } = store.settings();
  const voices = reader.voices();
  return voices.find(v => v.name === voiceName)
    ?? voices.find(v => v.localService && /^en[-_]US/i.test(v.lang))
    ?? voices.find(v => /^en/i.test(v.lang))
    ?? null;
}

function startQuestion(packet, index) {
  stopTimers();
  reader.stop();
  const tossup = packet.tossups[index];
  const sentences = prepareForSpeech(tossup.question);
  q = { packet, index, tossup, sentences, phase: 'reading', readingDone: false, buzzed: false,
        buzzedEarly: false, outcome: null, recorded: false, paused: false, timer: null, ticker: null };

  show('question');
  renderTally();
  renderLastResult();
  $('qTitle').textContent = `${packet.title} · ${index + 1}/${packet.tossups.length}`;

  // All words are in the DOM but hidden (not greyed) until revealed.
  const words = sentences.flatMap(s => s.words);
  $('qText').innerHTML = words.map(w => `<span hidden${w.guide ? ' class="guide"' : ''}>${esc(w.display)} </span>`).join('');
  q.spans = [...$('qText').children];
  q.revealed = -1;
  $('answerPanel').hidden = true;
  $('gradeRow').hidden = true;
  setMain('Buzz', 'buzz');
  $('pauseBtn').hidden = false;
  $('pauseBtn').textContent = '❚❚';
  $('qScroll').scrollTop = 0;

  reader.start(sentences, {
    voice: settingsVoice(),
    rate: store.settings().rate,
    onWord: revealTo,
    onEnd: onReadingEnd,
  });
}

function revealTo(i) {
  if (!q || i <= q.revealed) return;
  for (let j = q.revealed + 1; j <= i && j < q.spans.length; j++) q.spans[j].hidden = false;
  q.revealed = i;
  const sc = $('qScroll');
  if (sc.scrollHeight - sc.scrollTop - sc.clientHeight < 80) sc.scrollTop = sc.scrollHeight;
}

function setMain(label, style, disabled = false) {
  const b = $('mainBtn');
  b.textContent = label;
  b.className = `btn big ${style === 'buzz' ? 'buzz' : 'primary'}`;
  b.disabled = disabled;
}

function stopTimers() {
  if (!q) return;
  clearTimeout(q.timer);
  clearInterval(q.ticker);
  q.timer = q.ticker = null;
}

// Runs `onDone` after `seconds`, updating the main button label each second.
function countdown(seconds, label, style, onDone) {
  stopTimers();
  const end = performance.now() + seconds * 1000;
  const tick = () => setMain(`${label} ${Math.max(1, Math.ceil((end - performance.now()) / 1000))}`, style);
  tick();
  q.ticker = setInterval(tick, 200);
  q.timer = setTimeout(() => { stopTimers(); onDone(); }, seconds * 1000);
}

function onReadingEnd() {
  if (!q || q.phase !== 'reading') return;
  q.readingDone = true;      // from here on, a wrong answer is 0, not a neg
  q.phase = 'dying';
  revealTo(q.spans.length - 1);
  $('pauseBtn').hidden = true;
  countdown(DEATH_SECONDS, 'Buzz', 'buzz', () => showAnswer());
}

function buzz() {
  q.buzzed = true;
  q.buzzedEarly = !q.readingDone;
  reader.stop();
  q.phase = 'countdown';
  $('pauseBtn').hidden = true;
  countdown(BUZZ_SECONDS, 'Answer in', 'primary', () => showAnswer());
}

function showAnswer() {
  stopTimers();
  reader.stop();
  q.phase = 'answer';
  revealTo(q.spans.length - 1);
  const a = q.tossup.answer;
  $('answerCat').textContent = q.tossup.category;
  $('answerPrimary').textContent = a.primary;
  $('answerDirectives').textContent = a.directives ? `[${a.directives}]` : '';
  $('answerNote').textContent = a.note ? `(${a.note})` : '';
  $('answerPanel').hidden = false;
  $('answerPanel').scrollIntoView({ block: 'nearest' });

  if (q.buzzed) {
    $('gradeRow').hidden = false;
    $('rightBtn').classList.remove('selected');
    $('wrongBtn').classList.remove('selected');
    setMain('Next', 'primary', true);   // grade first
  } else {
    record('dead');
    setMain(nextLabel(), 'primary');
  }
}

function nextLabel() { return q.index + 1 >= q.packet.tossups.length ? 'Finish' : 'Next'; }

function record(outcome) {
  const result = {
    packetId: q.packet.id, packetTitle: q.packet.title, number: q.tossup.number, category: q.tossup.category,
    question: q.tossup.question, answer: q.tossup.answer.full, outcome, buzzedEarly: q.buzzedEarly, at: Date.now(),
  };
  if (q.recorded) store.replaceLastResult(result); else store.addResult(result);
  q.recorded = true;
  q.outcome = outcome;
  $('lastResult').hidden = true;   // the latest result is now this question's; fix it with Right/Wrong
  renderTally();
}

function grade(correct) {
  if (q?.phase !== 'answer' || !q.buzzed) return;
  record(outcomeFor({ buzzed: true, buzzedEarly: q.buzzedEarly, correct }));
  $('rightBtn').classList.toggle('selected', correct);
  $('wrongBtn').classList.toggle('selected', !correct);
  setMain(nextLabel(), 'primary');
}

function next() {
  const nextIndex = q.index + 1;
  store.setProgress(q.packet.id, nextIndex);
  if (nextIndex >= q.packet.tossups.length) { q = null; show('home'); return; }
  startQuestion(q.packet, nextIndex);
}

$('mainBtn').onclick = () => {
  if (!q) return;
  if (q.phase === 'reading' || q.phase === 'dying') buzz();
  else if (q.phase === 'countdown') showAnswer();          // second tap reveals early
  else if (q.phase === 'answer' && !$('mainBtn').disabled) next();
};
$('rightBtn').onclick = () => grade(true);
$('wrongBtn').onclick = () => grade(false);

$('pauseBtn').onclick = () => {
  if (q?.phase !== 'reading') return;
  if (q.paused) { q.paused = false; reader.resume(); $('pauseBtn').textContent = '❚❚'; }
  else { q.paused = true; reader.pause(); $('pauseBtn').textContent = '▶'; }
};

$('backHome').onclick = () => {
  // An unfinished question is asked again next time; a finished one moves on.
  if (q) {
    stopTimers();
    reader.stop();
    if (q.recorded) store.setProgress(q.packet.id, q.index + 1);
    q = null;
  }
  show('home');
};

// Fix a misgrade on the previous question (the current one uses the Right/Wrong buttons).
function renderLastResult() {
  const last = store.results().at(-1);
  const el = $('lastResult');
  if (!last || last.outcome === 'dead') { el.hidden = true; return; }
  const pts = POINTS[last.outcome];
  el.innerHTML = `<span>Last (Q${last.number}): ${OUTCOME_LABEL[last.outcome]} ${pts > 0 ? '+' : ''}${pts}</span><button id="flipLast">Change to ${last.outcome === 'right' ? 'Wrong' : 'Right'}</button>`;
  el.hidden = false;
  $('flipLast').onclick = () => { store.replaceLastResult(flipOutcome(last)); renderTally(); renderLastResult(); };
}

// ---------- review ----------
function renderMissed() {
  const results = store.results();
  const byCat = Object.entries(tallyByCategory(results)).sort((a, b) => a[0].localeCompare(b[0]));
  $('catStats').innerHTML = '<tr><th>Category</th><th>Seen</th><th>Right</th><th>Negs</th><th>Pts</th></tr>' +
    byCat.map(([c, t]) => `<tr><td>${esc(c)}</td><td>${t.seen}</td><td>${t.right}</td><td>${t.neg}</td><td>${t.points}</td></tr>`).join('');
  const missed = results.filter(isMissed).reverse();
  $('noMissed').hidden = missed.length > 0;
  $('missedList').innerHTML = missed.map(r => `<li>
    <div class="meta">${OUTCOME_LABEL[r.outcome]} · ${esc(r.category)} · ${esc(r.packetTitle)} #${r.number}</div>
    <div class="q">${esc(r.question)}</div>
    <div class="a">${esc(r.answer)}</div></li>`).join('');
}

// ---------- settings ----------
function renderSettings() {
  const s = store.settings();
  const current = settingsVoice();
  const voices = reader.voices().filter(v => /^en/i.test(v.lang));
  $('voiceSelect').innerHTML = voices.map(v =>
    `<option ${v.name === current?.name ? 'selected' : ''}>${esc(v.name)}</option>`).join('');
  $('rateInput').value = s.rate;
  $('rateLabel').textContent = Number(s.rate).toFixed(1) + '×';
}
$('voiceSelect').onchange = e => store.saveSettings({ voiceName: e.target.value });
$('rateInput').oninput = e => {
  const rate = Number(e.target.value);
  store.saveSettings({ rate });
  $('rateLabel').textContent = rate.toFixed(1) + '×';
  reader.setRate(rate);
};
$('testVoice').onclick = () => reader.start(prepareForSpeech('For 10 points, name this battle at the hot gates.'), {
  voice: settingsVoice(), rate: store.settings().rate, onWord() {}, onEnd() {},
});

// ---------- wake lock ----------
let wakeLock = null;
async function requestWakeLock() {
  try { if ('wakeLock' in navigator && !wakeLock) wakeLock = await navigator.wakeLock.request('screen'); wakeLock?.addEventListener('release', () => wakeLock = null); }
  catch { /* not available (e.g. plain http) or denied */ }
}
function releaseWakeLock() { wakeLock?.release(); wakeLock = null; }
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !$('question').hidden) requestWakeLock();
});

// ---------- start ----------
if (!reader.supported) alert('This browser has no speech synthesis. Reading aloud will not work.');
globalThis.speechSynthesis?.addEventListener('voiceschanged', () => { if (!$('settings').hidden) renderSettings(); });
show('home');

// ---------- offline ----------
// The service worker caches the app for offline use (needs HTTPS or localhost).
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(err => console.warn('service worker', err));
// Ask the browser not to evict saved packets and scores when storage runs low.
navigator.storage?.persist?.().catch(() => {});
