// Antwortverhalten (lib/antwort.js + systemNative): Bausteine nach Bedarf, Rückfragen nur am Anfang, Quellen-Gedächtnis des Chats.
// Alle Anbieter sind simuliert – geprüft wird unser Ablauf, nicht die Qualität der Modellantwort.
const test = require('node:test');
const assert = require('node:assert/strict');
const W = require('../lib/workflow');
const A = require('../lib/antwort');
const M = require('./mock');

const F = '```';
const ASK = `${F}ask\n{"questions":[{"question":"Welche Phase meinst du?","options":["Prophase","Metaphase","Anaphase"],"multi":false}]}\n${F}`;
const LONG = 'Die Mitose ist die Teilung des Zellkerns und läuft in vier Phasen ab. '.repeat(14);
const run = (body, signal = new AbortController().signal) => {
  const c = M.collect();
  return W.runChat({ env: M.ENV, body: { log: false, ...body }, send: c.send, signal }).then((result) => ({ ...c, result }));
};
let fx = null;
test.afterEach(() => { fx?.restore(); fx = null; W.cooldowns.clear(); require('../lib/providers').resetLimits(); });

test('Bausteine nach Bedarf: normale Frage bekommt den schlanken Prompt, Wünsche laden die ausführlichen Abschnitte', () => {
  const sys = (text, extra = {}) => W.systemNative('medium', { agent: 'learn', need: A.toolNeeds({ text, ...extra }) });
  const plain = sys('Erklär mir die Mitose');
  assert.match(plain, /ANTWORTFORMEN/);
  assert.match(plain, /WAS DU IN DIESER APP ZEIGEN KANNST/);
  assert.match(plain, /KOPIER-KASTEN/);
  assert.doesNotMatch(plain, /BILD ANPASSEN|HEFTEINTRAG \(Zusatz|"slides"|ABFRAGEN \(der Nutzer|LINKS \(```links\)/);
  assert.ok(plain.length < 19000, `schlank: ${plain.length} Zeichen`);
  assert.match(sys('Zeichne mir ein Bild von einer Tierzelle'), /BILDER ERZEUGEN[\s\S]*BILD ANPASSEN/);
  assert.match(sys('Mach das heller', { recent: `Hier:\n${F}illustration\n{"prompt":"Zelle"}\n${F}` }), /BILD ANPASSEN/, 'Folgewunsch zu einem Bild im Verlauf');
  assert.match(sys('Zeig die Entwicklung der Einwohnerzahl als Diagramm'), /Nutze pro Zahlenreihe genau einen Block/);
  assert.match(sys('Mach einen Zeitstrahl zur Weimarer Republik'), /ZEITSTRAHL: Wünscht der Nutzer/);
  assert.match(sys('Wie schreibe ich das ins Heft?'), /HEFTEINTRAG \(Zusatz/);
  assert.match(sys('Such mir Beispiele mit Link raus'), /LINKS \(```links\)/);
  assert.match(sys('Erklär das', { sources: [{ n: 1, images: [{ alt: 'Schema' }] }] }), /QUELLBILD \(```quellbild\)/);
  assert.match(sys('Frag mich zur Mitose ab', { quiz: true }), /ABFRAGEN \(der Nutzer will ausdrücklich abgefragt werden/);
  // Präsentation: Format nur auf Wunsch – dann auch beim Allgemein-Agenten (kannte es vorher nicht)
  const pz = W.systemNative('medium', { agent: 'general', need: A.toolNeeds({ text: 'Mach mir eine Präsentation zur Fotosynthese' }) });
  assert.match(pz, /```praesentation[\s\S]*"slides"/);
  assert.doesNotMatch(W.systemNative('medium', { agent: 'general' }), /"slides"/);
  // Stufe Niedrig (Unterricht) hat ihre eigene Form
  assert.doesNotMatch(W.systemNative('low', { agent: 'learn' }), /ANTWORTFORMEN/);
  assert.match(W.systemNative('low', { agent: 'learn' }), /FÜR DEN UNTERRICHT/);
});

test('Rückfragen-Regel: selten, nur ganz am Anfang, nie mitten in der Antwort; Abfragen nur auf Wunsch', () => {
  const s = W.systemNative('medium', { agent: 'general' });
  assert.match(s, /ENTWEDER FRAGEN ODER ANTWORTEN – nie beides/);
  assert.match(s, /mittendrin oder am Schluss kommt keine Frage/);
  assert.match(s, /Keine Wissens-, Kontroll- oder Quizfragen/);
  assert.doesNotMatch(s, /bis zu 5 Fragen, je 3–4 Antwortmöglichkeiten/, 'Abfrage-Anleitung steht nicht mehr immer im Prompt');
  for (const t of ['Frag mich bitte ab', 'Kannst du mich zu Kapitel 3 abfragen?', 'Stell mir fünf Fragen zur Mitose', 'Teste mein Wissen', 'Übe mit mir Vokabeln', 'Hör mich ab']) assert.ok(A.QUIZ_WISH.test(t), t);
  for (const t of ['Erklär mir die Mitose', 'Ich habe eine Frage zur Aufgabe', 'Löse Aufgabe 3', 'Was ist ein t-Test?', 'Stell mir das Thema vor']) assert.ok(!A.QUIZ_WISH.test(t), t);
  assert.equal(A.quizMode([{ role: 'user', text: 'Frag mich ab' }, { role: 'assistant', text: '…' }, { role: 'user', text: 'B' }]), true);
  assert.equal(A.quizMode([{ role: 'user', text: 'Erklär mir das' }]), false);
});

test('Rückfrage im Textstrom: am Anfang bleibt sie, nach einer Antwort fällt sie weg (auch über Stückgrenzen)', () => {
  const feed = (parts, opt) => { let out = ''; const g = A.createAskGate((x) => { out += x; }, opt); parts.forEach((p) => g.push(p)); return { out, st: g.end() }; };
  const early = feed(['Kurze Frage vorab:\n\n``', '`as', `k${ASK.slice(6, 40)}`, ASK.slice(40)]);
  assert.equal(early.st.kept, 1); assert.equal(early.st.dropped, 0);
  assert.match(early.out, /```ask\n\{"questions"/);
  const late = feed([LONG, '\n\n', ASK.slice(0, 9), ASK.slice(9)]);
  assert.equal(late.st.dropped, 1); assert.equal(late.st.after, 0);
  assert.doesNotMatch(late.out, /ask|Welche Phase/);
  assert.equal(late.st.text, LONG.trimEnd());
  const cont = feed([LONG, `\n\n${ASK}\n\nIn der Anaphase werden die Chromatiden getrennt.`]);
  assert.equal(cont.st.dropped, 1); assert.ok(cont.st.after > 20, 'Modell hat danach weitergeschrieben');
  assert.match(cont.out, /Anaphase werden die Chromatiden getrennt\.$/);
  assert.equal(feed([LONG, '\n\n', ASK], { allow: true }).st.kept, 1, 'Abfragen auf Wunsch: Block bleibt');
  // Einleitung aus ein paar Sätzen vor der Frage ist noch „am Anfang“; gegliederter Text davor ist schon eine Antwort
  const intro = 'Gern helfe ich dir bei deinem Spiel. Damit es genau zu dem passt, was du dir vorstellst, brauche ich vorher noch zwei kurze Angaben von dir – dann lege ich direkt los und baue dir einen ersten spielbaren Stand.';
  assert.equal(feed([`${intro}\n\n${ASK}`]).st.kept, 1);
  assert.equal(feed([`## Mitose\n\n1. Prophase: Die Chromosomen verdichten sich und werden sichtbar.\n2. Metaphase: Die Chromosomen ordnen sich in der Äquatorialebene an.\n3. Anaphase: Die Chromatiden werden zu den Polen gezogen.\n\n${ASK}`]).st.dropped, 1);
  assert.equal(feed(['Text mit ``', '`js\nconst a = 1;\n```\nund mehr.']).out, 'Text mit ```js\nconst a = 1;\n```\nund mehr.', 'andere Code-Blöcke bleiben unberührt');
});

test('Zu-Ende-Schreiben: „FERTIG“ wird verschluckt, eine echte Fortsetzung kommt mit Absatz an', () => {
  const fin = (parts) => { let out = ''; const g = A.createFinishGate((x) => { out += x; }); parts.forEach((p) => g.push(p)); g.end(); return out; };
  assert.equal(fin(['FER', 'TIG']), '');
  assert.equal(fin(['FERTIG.']), '');
  assert.equal(fin(['**FERTIG**']), '');
  assert.equal(fin(['In der ', 'Anaphase werden die Chromatiden getrennt.']), '\n\nIn der Anaphase werden die Chromatiden getrennt.');
  assert.equal(fin(['Ja.']), '\n\nJa.');
});

test('Ablauf: Rückfrage mitten in der Antwort → Block fällt weg, die Antwort wird ohne Frage zu Ende geschrieben', async () => {
  let n = 0;
  fx = M.installFetch([
    { match: M.is.route, respond: () => M.nvidiaJson({ level: 'medium', sources: 'none', queries: [], why: 'Erklärung' }) },
    { match: M.is.geminiStream, respond: () => (++n === 1 ? M.sseResponse(M.geminiChunks([LONG, `\n\n${ASK}`])) : M.sseResponse(M.geminiChunks(['In der Anaphase werden die Chromatiden getrennt.']))) },
  ]);
  const r = await run({ messages: [{ role: 'user', text: 'Erklär mir die Mitose' }], agent: 'learn', effort: 'auto' });
  assert.equal(r.result.status, 'completed');
  assert.doesNotMatch(r.text(), /```ask|Welche Phase meinst du/);
  assert.match(r.text(), /vier Phasen ab\.[\s\S]*In der Anaphase werden die Chromatiden getrennt\.$/);
  const gens = fx.calls.filter(M.is.geminiStream);
  assert.equal(gens.length, 2, 'genau ein zweiter Aufruf zum Zu-Ende-Schreiben');
  assert.match(JSON.stringify(gens[1].body.contents.at(-1)), /Rückfrage unterbrochen/);
  assert.doesNotMatch(r.result.answer, /```ask/);
});

test('Ablauf: Rückfrage ganz am Anfang bleibt (echte Unklarheit); beim Abfragen auf Wunsch auch nach Text', async () => {
  fx = M.installFetch([
    { match: M.is.route, respond: () => M.nvidiaJson({ level: 'medium', sources: 'none', queries: [], why: 'unklar' }) },
    { match: M.is.geminiStream, respond: () => M.sseResponse(M.geminiChunks([`Damit es passt, kurz vorab:\n\n${ASK}`])) },
  ]);
  const r = await run({ messages: [{ role: 'user', text: 'Ich möchte ein Game programmieren' }], agent: 'general', effort: 'auto' });
  assert.match(r.text(), /```ask/);
  assert.equal(fx.calls.filter(M.is.geminiStream).length, 1);
  fx.restore();
  fx = M.installFetch([
    { match: M.is.route, respond: () => M.nvidiaJson({ level: 'medium', sources: 'none', queries: [], why: 'Abfragen' }) },
    { match: M.is.geminiStream, respond: () => M.sseResponse(M.geminiChunks([`${LONG}\n\nWeiter geht es:\n\n${ASK}`])) },
  ]);
  const q = await run({ messages: [{ role: 'user', text: 'Frag mich zur Mitose ab' }, { role: 'assistant', text: `Los geht's:\n\n${ASK}` }, { role: 'user', text: 'Welche Phase meinst du? → Anaphase' }], agent: 'learn', effort: 'auto' });
  assert.match(q.text(), /```ask/, 'Abfragen: nächste Frage nach der Auswertung ist erlaubt');
  assert.equal(fx.calls.filter(M.is.geminiStream).length, 1);
  assert.match(M.systemOf(fx.calls.filter(M.is.geminiStream)[0]), /ABFRAGEN \(der Nutzer will ausdrücklich abgefragt werden/);
});

test('Quellen-Gedächtnis: Dateien bleiben für den ganzen Chat Material – auch viele Nachrichten später', async () => {
  fx = M.installFetch([
    { match: M.is.route, respond: () => M.nvidiaJson({ level: 'medium', sources: 'none', queries: [], why: 'Folgefrage' }) },
    { match: M.is.geminiStream, respond: () => M.sseResponse(M.geminiChunks(['Antwort.'])) },
  ]);
  const file = { mime: 'image/jpeg', data: 'AAAA', name: 'Arbeitsblatt Mitose.jpg' };
  const messages = [{ role: 'user', text: 'Löse Aufgabe 1', images: [file] }, { role: 'assistant', text: '## Aufgabe 1 …' }];
  for (let i = 0; i < 5; i++) messages.push({ role: 'user', text: `Folgefrage ${i}` }, { role: 'assistant', text: 'Antwort.' });
  messages.push({ role: 'user', text: 'Und was passiert in der Anaphase?' });
  const r = await run({ messages, agent: 'learn', effort: 'auto' });
  assert.equal(r.result.status, 'completed');
  const sys = M.systemOf(fx.calls.filter(M.is.geminiStream).pop());
  assert.match(sys, /QUELLEN DIESES CHATS \(GEDÄCHTNIS\)/);
  assert.match(sys, /Sieh bei JEDER neuen Frage zuerst dort nach/);
  assert.match(sys, /Nur wenn die Frage ein ganz anderes Thema ist/);
  assert.doesNotMatch(sys, /SCHULBUCH-AUFBAU/, 'für ältere Dateien die kurzen Lese-Regeln');
  // die Einschätzung erfährt von den Dateien (mit Namen)
  assert.match(M.userOf(fx.calls.filter(M.is.route).pop()), /Arbeitsblatt Mitose\.jpg[\s\S]*sources of this chat/);
  // klarer Verweis („Aufgabe 3“) → die Dateien sind die Grundlage, mit den ausführlichen Lese-Regeln
  fx.calls.length = 0;
  messages[messages.length - 1] = { role: 'user', text: 'Und jetzt Aufgabe 3' };
  await run({ messages, agent: 'learn', effort: 'auto' });
  const sys2 = M.systemOf(fx.calls.filter(M.is.geminiStream).pop());
  assert.match(sys2, /MATERIAL DES NUTZERS IST DIE GRUNDLAGE/);
  assert.match(sys2, /SCHULBUCH-AUFBAU/);
});

test('Antwortformen: Aufbau je Art der Frage, Niveau und Portionen stehen im Prompt', () => {
  for (const key of ['KURZE WISSENSFRAGE', 'THEMA ODER BEGRIFF ERKLÄREN', 'AUFGABE LÖSEN', 'RECHNEN', 'VERGLEICHEN', 'EIGENE LÖSUNG ODER EIGENER TEXT', 'TEXT SCHREIBEN', 'ÜBERSETZEN UND SPRACHEN', 'FOLGEFRAGE', 'NIVEAU:', 'PORTIONEN:']) assert.ok(A.FORMS.includes(key), key);
  assert.match(A.FORMS, /der AUFWAND/, 'gewählter Aufwand bestimmt weiter Tiefe und Länge');
  assert.match(W.NATIVE_CORE, /GESPRÄCH UND GEDÄCHTNIS/);
});
