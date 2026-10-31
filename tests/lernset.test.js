// Lernsets: KI-JSON tolerant lesen (nur auswertbare Fragen), Prompt mit Einstellungen, Bewertung offener Antworten (Modell simuliert)
const test = require('node:test');
const assert = require('node:assert/strict');
const Lernset = require('../lernset');
const LS = require('../lib/lernset');
const M = require('./mock');

test('Lernset lesen: Karteikarten, Quiz und Klausur – kaputte Fragen fallen weg, Punkte und Dauer werden ergänzt', () => {
  const k = Lernset.parse('{"art":"karteikarten","titel":"Zelle","karten":[{"vorne":"ATP?","hinten":"Energieträger"},{"vorne":"","hinten":"x"}]}');
  assert.equal(k.kind, 'karten');
  assert.equal(k.cards.length, 1);
  const q = Lernset.parse(`{"art":"quiz","fragen":[
    {"typ":"mc","frage":"Wo?","optionen":["A","B","C"],"richtig":["B"]},
    {"typ":"mc","frage":"Kaputt","optionen":["A"],"richtig":[0]},
    {"typ":"wf","frage":"Stimmt das?","richtig":"falsch"},
    {"typ":"luecke","text":"Die ___ liegt im ___.","loesungen":["Zelle"]},
    {"typ":"luecke","text":"Die ___ liegt im ___.","loesungen":["Atmungskette","Mitochondrium"]},
    {"typ":"zuordnen","paare":[["A","1"],["B","2"]]},],}`); // Rest-Kommas wie von Modellen
  assert.deepEqual(q.items.map((x) => x.type), ['mc', 'wf', 'luecke', 'zuordnen'], 'MC mit einer Option und Lückentext mit zu wenig Lösungen fallen weg');
  assert.deepEqual(q.items[0].right, [1], 'Buchstabe B → Index 1');
  assert.equal(q.items[1].right, false);
  const e = Lernset.parse('{"art":"probeklausur","aufgaben":[{"typ":"offen","frage":"Erläutern Sie …","erwartung":"…","punkte":6},{"typ":"mc","frage":"?","optionen":["a","b"],"richtig":[0,1]}]}');
  assert.equal(e.kind, 'klausur');
  assert.equal(e.items[0].points, 6);
  assert.equal(e.items[1].points, 2, 'mehrere richtige → 2 Punkte');
  assert.ok(e.minutes >= 20, 'ohne Dauer: aus den Punkten geschätzt');
  assert.equal(Lernset.parse('kein json'), null);
});

test('Lernset-Prompt: Einstellungen aus dem Fenster stehen drin, Chat-Wunsch wird erkannt', () => {
  const p = LS.PROMPT({ kind: 'klausur', minutes: 60, level: 'schwer', types: ['mc', 'offen'], topic: 'Weimarer Republik' });
  assert.match(p, /Probeklausur für 60 Minuten/);
  assert.match(p, /Multiple Choice.*offene Aufgabe/);
  assert.match(p, /Weimarer Republik/);
  assert.match(p, /Inhalt NUR daraus/);
  assert.ok(LS.ASK.test('Mach mir Karteikarten zur Zellatmung'));
  assert.ok(LS.ASK.test('Kannst du eine Probeklausur erstellen?'));
  assert.ok(!LS.ASK.test('Erkläre mir die Zellatmung'));
});

test('Klausur bewerten: leere Antwort ohne Modell 0 Punkte, sonst Punkte vom Modell (begrenzt auf die Höchstpunktzahl)', async () => {
  const fx = M.installFetch([
    { match: (c) => c.url.includes(':generateContent'), respond: () => M.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ results: [{ i: 1, punkte: 9, feedback: 'Gut.' }] }) }] } }] }) },
  ]);
  try {
    const r = await LS.grade(M.ENV, { items: [{ i: 0, frage: 'A?', erwartung: 'x', punkte: 2, antwort: '  ' }, { i: 1, frage: 'B?', erwartung: 'y', punkte: 4, antwort: 'Meine Antwort' }] });
    const byI = Object.fromEntries(r.results.map((x) => [x.i, x]));
    assert.equal(byI[0].punkte, 0);
    assert.match(byI[0].feedback, /Keine Antwort/);
    assert.equal(byI[1].punkte, 4, '9 von 4 → auf 4 begrenzt');
    assert.equal(fx.calls.filter((c) => c.url.includes(':generateContent')).length, 1, 'nur die nicht leere Antwort geht ans Modell');
  } finally { fx.restore(); }
});
