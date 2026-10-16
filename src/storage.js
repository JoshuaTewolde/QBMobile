// On-device persistence in localStorage. A parsed packet is ~50 KB, so the 5 MB quota holds many packets.

const KEYS = {
  packets: 'qb.packets',     // [{ id, title, addedAt, tossups, bonuses, warnings }]
  progress: 'qb.progress',   // { packetId, positions }
  results: 'qb.results',     // [{ packetId, packetTitle, number, category, question, answer, outcome, buzzedEarly, at }]
  settings: 'qb.settings',   // { voiceName, rate, speakAnswer }
};

function read(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch (e) { console.error('save failed', key, e); return false; }
}

export const store = {
  packets: () => read(KEYS.packets, []),
  packet: id => read(KEYS.packets, []).find(p => p.id === id),
  addPacket(packet) { return write(KEYS.packets, [...read(KEYS.packets, []), packet]); },
  deletePacket(id) {
    write(KEYS.packets, read(KEYS.packets, []).filter(p => p.id !== id));
    const { packetId, positions } = store.progress();
    delete positions[id];
    write(KEYS.progress, { packetId: packetId === id ? null : packetId, positions });
  },

  // { packetId, positions: { [packetId]: index } } — current packet plus the place in every packet.
  progress: () => ({ packetId: null, positions: {}, ...read(KEYS.progress, {}) }),
  position: id => store.progress().positions[id] ?? 0,
  setProgress(packetId, index) {
    const p = store.progress();
    write(KEYS.progress, { packetId, positions: { ...p.positions, [packetId]: index } });
  },

  results: () => read(KEYS.results, []),
  addResult(r) { write(KEYS.results, [...read(KEYS.results, []), r]); },
  replaceLastResult(r) { const rs = read(KEYS.results, []); rs[rs.length - 1] = r; write(KEYS.results, rs); },
  resetResults() { write(KEYS.results, []); },

  settings: () => ({ voiceName: null, rate: 1, speakAnswer: true, ...read(KEYS.settings, {}) }),
  saveSettings(s) { write(KEYS.settings, { ...store.settings(), ...s }); },
};
