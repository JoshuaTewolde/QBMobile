// Reads prepared sentences aloud one utterance per sentence and reveals words on a timer.
//
// Tested on the target phone (Android 10, Chrome 155, local en_US voice):
//   - boundary events never fire, so word reveal is estimated from word length and speech rate;
//   - end fires reliably; cancel() fires error "interrupted" and leaves the engine clean;
//   - pause()/resume() do not work (speech stops and never resumes), so pause = cancel and
//     resume = restart the current sentence.
// Each sentence's end event re-syncs the reveal, so timing drift never lasts past one sentence.

const synth = globalThis.speechSynthesis;
const CALIBRATION_KEY = 'qb.calibration';
const DEFAULT_MS_PER_UNIT = 40;      // at rate 1; refined per voice after each sentence

function loadCalibration() {
  try { return JSON.parse(localStorage.getItem(CALIBRATION_KEY)) ?? {}; } catch { return {}; }
}
function saveCalibration(c) {
  try { localStorage.setItem(CALIBRATION_KEY, JSON.stringify(c)); } catch { /* storage unavailable */ }
}

// Relative speaking time of a word: letters plus a pause for punctuation.
function weight(spoken) {
  if (!spoken) return 0;
  let w = spoken.replace(/[^\p{L}\p{N}]/gu, '').length + 2;
  if (/[,;:]["”’)]*$/.test(spoken)) w += 4;
  if (/[.?!]["”’)]*$/.test(spoken)) w += 7;
  if (/\d/.test(spoken)) w += spoken.length * 2;   // numbers are spoken as longer words
  return w;
}

export class Reader {
  constructor() {
    this.gen = 0;              // bumped on every start/stop; stale events from older utterances are ignored
    this.timers = [];
    this.utterance = null;     // keep a reference so Chrome does not garbage-collect it and drop its events
    this.calibration = loadCalibration();
  }

  get supported() { return !!synth; }

  voices() { return synth ? synth.getVoices() : []; }

  // sentences: from prepareForSpeech. onWord(i) reveals words 0..i (global index). onEnd() when reading finishes.
  start(sentences, { voice, rate = 1, onWord, onEnd, fromSentence = 0 }) {
    this.stop();
    this.sentences = sentences;
    this.opts = { voice, rate, onWord, onEnd };
    this.offsets = [];
    let n = 0;
    for (const s of sentences) { this.offsets.push(n); n += s.words.length; }
    this.sentenceIndex = fromSentence;
    this.paused = false;
    this.finished = false;
    this.speakSentence(this.gen);
  }

  setRate(rate) { if (this.opts) this.opts.rate = rate; }   // applies from the next sentence

  pause() {
    if (!this.sentences || this.paused || this.finished) return;
    this.paused = true;
    this.halt();
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    this.speakSentence(++this.gen);
  }

  // Stop reading entirely (buzz, leaving the screen). Does not fire onEnd.
  stop() {
    this.sentences = null;
    this.paused = false;
    this.halt();
  }

  halt() {
    this.gen++;
    this.clearTimers();
    if (synth) synth.cancel();
  }

  clearTimers() { this.timers.forEach(clearTimeout); this.timers = []; }

  msPerUnit() {
    const name = this.opts.voice?.name ?? 'default';
    return this.calibration[name] ?? DEFAULT_MS_PER_UNIT;
  }

  speakSentence(gen) {
    const i = this.sentenceIndex;
    if (i >= this.sentences.length) { this.finish(gen); return; }
    const sentence = this.sentences[i];
    const offset = this.offsets[i];
    const { voice, rate, onWord } = this.opts;

    if (!sentence.spoken) { onWord(offset + sentence.words.length - 1); this.next(gen); return; }

    const u = new SpeechSynthesisUtterance(sentence.spoken);
    if (voice) { u.voice = voice; u.lang = voice.lang; }
    u.rate = rate;
    this.utterance = u;

    const weights = sentence.words.map(w => weight(w.spoken));
    const units = weights.reduce((a, b) => a + b, 0);
    const msPerUnit = this.msPerUnit() / rate;
    let startedAt = 0;

    u.onstart = () => {
      if (gen !== this.gen) return;
      startedAt = performance.now();
      // Reveal each word when it starts being spoken. Never reveal the last word early;
      // the end event does that.
      let t = 0;
      sentence.words.forEach((w, j) => {
        if (j === sentence.words.length - 1) return;
        const at = t;
        this.timers.push(setTimeout(() => { if (gen === this.gen) onWord(offset + j); }, at));
        t += weights[j] * msPerUnit;
      });
      // Safety net in case end never fires.
      this.timers.push(setTimeout(() => { if (gen === this.gen) done(); }, units * msPerUnit * 3 + 5000));
    };

    const done = () => {
      if (gen !== this.gen) return;
      this.clearTimers();
      onWord(offset + sentence.words.length - 1);
      if (startedAt && units >= 20) this.calibrate((performance.now() - startedAt) * rate / units);
      this.next(gen);
    };
    u.onend = done;
    u.onerror = e => {
      if (gen !== this.gen) return;            // our own cancel()
      if (e.error === 'interrupted' || e.error === 'canceled') return;
      done();                                  // engine error: skip ahead rather than hang
    };

    synth.speak(u);
  }

  next(gen) {
    if (gen !== this.gen) return;
    this.sentenceIndex++;
    this.speakSentence(gen);
  }

  finish(gen) {
    if (gen !== this.gen || this.finished) return;
    this.finished = true;
    this.opts.onEnd?.();
  }

  calibrate(measured) {
    const name = this.opts.voice?.name ?? 'default';
    const prev = this.calibration[name] ?? DEFAULT_MS_PER_UNIT;
    // Smooth, and ignore wild outliers (e.g. a sentence that stalled).
    if (measured < prev * 0.4 || measured > prev * 2.5) return;
    this.calibration[name] = prev * 0.7 + measured * 0.3;
    saveCalibration(this.calibration);
  }
}
