# Quiz Bowl Practice App (PWA)

## Purpose
A simple, mobile-first web app (installable PWA) that I use on my phone for quiz bowl practice, mainly as a passenger on road trips. I upload a packet PDF, and the app reads tossups aloud one at a time while showing the words as they are spoken. I buzz, answer in my head or out loud, reveal the answer, grade myself, and the app keeps score.

I am the only user. Keep the UI very simple: large tap targets, readable text, one main button at the bottom.

## Hard constraints
- **Must work fully offline** after the first load (service worker caches the app shell; packets and scores stored on-device in IndexedDB/localStorage). No server, no accounts, no network calls at runtime.
- **Static site only:** plain HTML/CSS/JS (or a minimal build setup if clearly worth it). No backend. It will be hosted for free (GitHub Pages or Netlify) so the PWA can be installed; HTTPS is needed for install and offline.
- **PDF parsing in the browser** with pdf.js, bundled locally (not loaded from a CDN at runtime, so it works offline).
- **Speech:** use the browser's `speechSynthesis` with locally installed voices. Do not use any cloud TTS.
- Do not add dependencies without telling me why.

## Core flow (v1: tossups only)
1. **Upload:** pick a packet PDF. The app parses it, shows how many tossups it found, and saves it. Keep a list of saved packets that I can select or delete.
2. **Question screen:** shows one tossup at a time. The app reads it aloud, revealing the words one by one in sync with the speech.
3. **Buzz button** at the bottom:
   - Tap to buzz. Reading stops immediately.
   - The button shows a **5-second countdown**.
   - The answer is revealed when the countdown ends **or** when I tap the button a second time.
   - After the answer is shown, the button becomes **Next**, and I mark the result as **Right** or **Wrong**.
4. **Question death:** when the reading finishes, I have **5 seconds** to buzz. If I don't, the question dies, the answer is shown, and the button becomes **Next**.
5. **Scoring:**
   - Correct: **+10**
   - Wrong after the question has finished reading: **0**
   - Wrong before the question has finished reading (buzzed mid-reading): **neg, -5**
   - Buzz timing is what decides neg vs. 0, so record whether the buzz happened before or after the "speech ended" event.
   - A question that dies unanswered scores 0 and is not a wrong answer.
6. **Running tally** always visible: points, number correct, number wrong, number of negs, and tossups seen.

## Additional features to include
- **Screen wake lock** (`navigator.wakeLock`) so the screen doesn't sleep mid-question.
- **Pause / resume** button for the reading.
- **Saved progress:** remember the current packet and question number, and keep scores across sessions, with a reset button.
- **Reading speed slider** (persisted).
- **Fix a misgrade:** I can change Right/Wrong on the question I just graded.
- **Full answer display:** show the primary answer prominently, plus the full accept/prompt/reject line.
- **Missed-question review list:** questions I got wrong, negged, or let die, for later study. Category tags also allow stats by category.
- **Parse check:** if a packet does not yield the expected question counts, show a clear warning instead of silently loading broken data.
- Optional later: shuffle, jump to question number, category filter, and a bonus mode.

## Word-by-word highlighting (known risk, test first)
Word highlighting depends on the speech engine reporting word positions. `SpeechSynthesisUtterance` has a `boundary` event, but I am not sure it fires reliably on Android Chrome with offline voices; this depends on the voice.

- **First task:** build a tiny test page that reads a sentence aloud and logs whether `boundary` events fire (with `charIndex`) on my phone with the installed voice. Report the result before building more.
- **Fallback if boundary events don't fire:** estimate each word's reveal time from the speech rate (e.g. word length-weighted timing against the utterance's start time) and reveal words on a timer. It can drift slightly on long questions; that is acceptable for practice.
- Whatever is used, the app needs a reliable `end` event (or equivalent) to know when reading finished, because that decides neg vs. 0 and starts the 5-second death timer. Make sure pause, cancel, and speed changes don't leave timers or utterances in a bad state (Chrome's `speechSynthesis` has quirks around `cancel()` and `pause()`; handle them defensively).
- If this approach is too loose on my phone, we may switch to a native Android app. Keep the parser and scoring logic in separate modules so they can be reused.

## Packet format (ACF-style PDFs)
Samples are in `samples/` (2022 ACF Fall Packet K and Packet D, 20 tossups + 20 bonuses each). Look at them before writing the parser. Assume the other packets I use follow the same format, but detect and flag anything malformed.

**Structure**
- Header lines (title, editor credits), then a `Tossups` section, then a `Bonuses` section.
- **Tossup:** `N. <question text>` ending with `For 10 points, ...`, then `ANSWER: <answer line>`, then a `<Category>` tag such as `<Other History>`.
- **Bonus:** `N. <lead-in> For 10 points each:`, then three parts, each tagged `[10e]`, `[10m]`, or `[10h]`, with its own `ANSWER:` line, then a final `<Category>` tag. The three parts are NOT always in e/m/h order, so read them in document order. (Bonuses are out of scope for v1, but the parser should still recognize them so it can validate counts and skip them cleanly.)

**Parsing pitfalls**
- PDF text extraction often glues the end of one question to the start of the next, e.g. `<Painting/Sculpture>5. To challenge...`. Split on category tags and question numbers, not on line breaks. Page breaks can also appear mid-question.
- Extraction artifacts such as lost ligatures (e.g. "Tif any’s" for "Tiffany’s") occur. Don't crash on them; don't try to auto-fix beyond simple known cases.
- Curly quotes and accented characters (ā, é, ṭ, etc.) appear throughout. Preserve them for display.

**Answer line anatomy**
- Primary answer first, e.g. `ANSWER: Battle of Thermopylae (“therm-OP-ih-lee”)`.
- Then bracketed instructions: `[or ...; accept ...; prompt on ...; reject ...]`.
- Sometimes a trailing parenthetical note after the brackets that explains the question, e.g. `(Volpone is by Ben Jonson.)`.
- **Displayed answer:** show the primary answer prominently, with the full line available below it.
- Some answers require two parts (e.g. "Two answers required", `nitrogen AND oxygen`); display both.

**Text prepared for speech**
- Strip reader instructions like `[read slowly]` and `[emphasize]` from the question text before speaking or displaying.
- Pronunciation guides in quotes inside parentheses, e.g. `(“therm-OP-ih-lee”)`, help the voice. Decide in one place whether to speak the respelling or drop the guide, and keep it easy to change. Show the original word on screen either way.
- Keep the displayed words and the spoken words aligned so the word-by-word reveal stays in sync.

## Working agreements
- Use `git` and commit often. Do not rewrite history.
- Keep changes small and focused; explain the approach before large edits.
- Write tests for the parser and run them against both PDFs in `samples/`. Expected: 20 tossups and 20 bonuses (3 parts each) per packet. A count mismatch should fail loudly.
- Test on my actual phone (Android, Chrome). Serve the dev build over local Wi-Fi so I can open it on the phone, and tell me explicitly what I need to verify by hand.
- Final check before a trip: install the PWA from the hosted HTTPS URL, then confirm everything works in airplane mode (uploading a packet, reading, buzzing, scoring, and reopening the app after closing it).
- Browser speech and PWA behavior vary by version and device. If you are unsure about an API's behavior, check current documentation or say so rather than guessing.

## Order of work
1. **Speech test page** (boundary events and end events on my phone). Report results.
2. **Parser** for tossups, with tests against `samples/`.
3. **Question screen** with reading, word reveal, buzz, 5-second countdown, answer reveal, question-death timer, grading, and scoring.
4. **Persistence:** saved packets, progress, scores, settings, missed-question list.
5. **PWA setup:** manifest, icons, service worker, offline caching, wake lock.
6. **Hosting** on GitHub Pages or Netlify, then the airplane-mode check.
7. Optional: bonuses, shuffle, category filter.

## Current status
**Speech test results (Android 10, Chrome 155, local "English United States" voice):** `boundary` events never fire; `end` fires reliably; `cancel()` fires `error: interrupted` within ~20 ms and leaves the engine clean; `pause()` stops speech and `resume()` never restarts it. So: word reveal is timed per word and re-synced at each sentence (one utterance per sentence), pause = cancel, resume = restart the current sentence. Unread words are hidden, not greyed. Exact word sync is low priority for me.

Done: speech test page (`speech-test/`), parser + tests (`npm test`), question screen, scoring, persistence (localStorage), upload with parse check, missed-question review, settings. Dev server: `npm run serve` (port 8000 on the LAN).

Next: PWA setup (manifest, icons, service worker, wake lock needs HTTPS), then hosting and the airplane-mode check.