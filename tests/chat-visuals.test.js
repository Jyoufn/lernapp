const test = require('node:test');
const assert = require('node:assert/strict');
const visuals = require('../chat-visuals');

test('Diagrammdaten werden begrenzt und geprüft', () => {
  const result = visuals.chart(JSON.stringify({ type: 'bar', title: 'Lernfortschritt', labels: ['Bio', 'Mathe', 'Chemie'], values: [12, 18, 7], unit: 'h' }));
  assert.equal(result.type, 'donut'); // Balken gibt es nicht mehr – Vergleiche werden als Ring gezeigt
  assert.deepEqual(result.values, [12, 18, 7]);
  assert.equal(visuals.chart('{ kaputt'), null);
  assert.equal(visuals.chart({ type: 'bar', labels: ['A'], values: [1] }), null);
  assert.equal(visuals.chart({ type: 'bar', labels: ['A', 'B'], values: [1, 'Infinity'] }), null);
  assert.equal(visuals.chart({ type: 'radar', labels: ['A', 'B'], values: [1, 2] }), null);
});

test('Die App wählt den passenden Diagrammtyp selbst', () => {
  const pick = (d) => visuals.chart({ title: 'T', ...d }).type;
  assert.equal(pick({ labels: ['Mo', 'Di', 'Mi', 'Do', 'Fr'], values: [1, 2, 1, 3, 2], unit: 'h' }), 'area');        // Verlauf
  assert.equal(pick({ labels: ['2019', '2020', '2021', '2022'], values: [5, 6, 8, 9] }), 'area');
  assert.equal(pick({ labels: ['Wind', 'Sonne', 'Kohle'], values: [40, 35, 25], unit: '%' }), 'donut');            // Anteile
  assert.equal(pick({ labels: ['Bio', 'Mathe', 'Chemie'], values: [5, 4, 2], unit: 'h' }), 'donut');               // Vergleich
  assert.equal(pick({ labels: ['Nordrhein-Westfalen', 'Baden-Württemberg', 'Bayern'], values: [18, 11, 13] }), 'donut'); // lange Namen stehen in der Liste
  // Ausweg Rangliste: negative Werte oder zu viele Teile für einen Ring
  assert.equal(visuals.chart({ type: 'donut', labels: ['A', 'B'], values: [2, -1] }).type, 'hbar');
  assert.equal(pick({ labels: 'ABCDEFGHI'.split(''), values: [9, 8, 7, 6, 5, 4, 3, 2, 1] }), 'hbar');
  // Linie nur für Zeitverläufe ab 3 Punkten
  assert.equal(visuals.chart({ type: 'line', labels: ['A', 'B'], values: [2, 3] }).type, 'donut');
  assert.equal(visuals.chart({ type: 'bar', labels: ['2020', '2021', '2022'], values: [2, 3, 5] }).type, 'area');
  // gleiche Zahlenreihe erkennt man am Schlüssel
  const a = visuals.chart({ type: 'bar', labels: ['A', 'B', 'C'], values: [1, 2, 3] });
  const b = visuals.chart({ type: 'line', labels: ['A', 'B', 'C'], values: [1, 2, 3] });
  assert.equal(visuals.chartKey(a), visuals.chartKey(b));
});

test('Zeitstrahl erlaubt längeren Text und Stichpunkte', () => {
  const long = 'Satz. '.repeat(60);
  const t = visuals.timeline({ title: 'T', events: [
    { date: '1665', title: 'A', text: long, points: ['eins', '', 'zwei'] },
    { date: '1838', title: 'B' },
  ] });
  assert.ok(t.events[0].text.length > 220);
  assert.deepEqual(t.events[0].points, ['eins', 'zwei']);
  assert.deepEqual(t.events[1].points, []);
});

test('Bildanweisungen benötigen eine brauchbare Beschreibung und einen Alternativtext', () => {
  assert.deepEqual(visuals.illustration({ prompt: 'Schematische Darstellung eines Blattes im Querschnitt', alt: 'Querschnitt eines Blattes' }), {
    prompt: 'Schematische Darstellung eines Blattes im Querschnitt', alt: 'Querschnitt eines Blattes', query: 'Querschnitt eines Blattes',
  });
  assert.equal(visuals.illustration({ prompt: 'Bild', alt: 'Blatt' }), null);
  assert.equal(visuals.illustration('kein JSON'), null);
});

test('Zerbrochene Tabellen werden repariert', () => {
  const broken = ['| Begriff | Bedeutung |', '|---|---|', '| A | eins |', '', '| B | zwei |', '| Begriff | Bedeutung |', '|---|---|', '| C | drei', 'Danach Text.'].join('\n');
  assert.equal(visuals.repairTables(broken), ['| Begriff | Bedeutung |', '|---|---|', '| A | eins |', '| B | zwei |', '| C | drei |', 'Danach Text.'].join('\n'));
  // normale Absätze und Code bleiben unverändert
  const plain = 'Text\n\n```\n| a | b |\n\n| c |\n```\n\nMehr Text';
  assert.equal(visuals.repairTables(plain), plain);
});

test('Bild-Auftrag ohne ```illustration-Rahmen wird trotzdem als Bild erkannt', () => {
  const bare = 'Hier ist das Bild:\n{\n  "prompt": "Aufbau einer Tierzelle, Querschnitt mit allen Bestandteilen beschriftet: Zellmembran",\n  "alt": "Querschnitt einer Tierzelle",\n  "query": "animal cell diagram"\n}\nText danach.';
  const fixed = visuals.fenceBareIllustrations(bare);
  assert.match(fixed, /```illustration\n\{[\s\S]*"alt": "Querschnitt einer Tierzelle"[\s\S]*\}\n```\nText danach\./);
  // vorhandene Codeblöcke und fremdes JSON bleiben unverändert
  const fenced = '```json\n{"prompt":"xxxxxxxxxxxxxxxxxxxxxxxxx","alt":"a"}\n```';
  assert.equal(visuals.fenceBareIllustrations(fenced), fenced);
  assert.equal(visuals.fenceBareIllustrations('{"a":1}'), '{"a":1}');
  // ein bereits gerahmter Bild-Block wird nicht doppelt gerahmt
  const ok = '```illustration\n{"prompt":"Aufbau einer Tierzelle mit Zellkern","alt":"Tierzelle"}\n```';
  assert.equal(visuals.fenceBareIllustrations(ok), ok);
});

test('Gedanken werden zu Arbeitsschritten – Gemini (Überschriften) und Nemotron (Absätze)', () => {
  const gemini = visuals.thoughtSteps('**Frage verstehen**\n\nDer Nutzer will wissen, was Mitose ist.\n\n**Phasen ordnen**\n\nProphase, Metaphase, Anaphase, Telophase.');
  assert.deepEqual(gemini.map((s) => s.title), ['Frage verstehen', 'Phasen ordnen']);
  assert.match(gemini[1].body, /Prophase/);
  // halb übertragene Überschrift erzeugt noch keinen Schritt
  assert.equal(visuals.thoughtSteps('**Frage verst').length, 0);
  const nemotron = visuals.thoughtSteps('Der Nutzer fragt nach der Mitose. Ich sollte die Phasen erklären.\n\nZuerst die Prophase: Chromosomen kondensieren.');
  assert.deepEqual(nemotron.map((s) => s.title), ['Der Nutzer fragt nach der Mitose', 'Zuerst die Prophase']);
  // höchstens 8 Schritte, der Rest hängt am letzten
  const many = visuals.thoughtSteps(Array.from({ length: 12 }, (_, i) => `Absatz Nummer ${i + 1} ist hier.`).join('\n\n'));
  assert.equal(many.length, 8);
  assert.match(many[7].body, /Absatz Nummer 12/);
});

test('Mindmap ist ein Baum: Äste mit eigenen Unterpunkten (mehrere Ebenen), „text“ für Erklärungen, alte „items“ werden Kinder', () => {
  const m = visuals.mindmap({ center: 'Demografischer Wandel', branches: [
    { label: 'Definition', text: 'Veränderung von Größe und Altersaufbau.' },
    { label: 'Hauptursachen', children: [{ label: 'Niedrige Geburtenrate' }, { label: 'Höhere Lebenserwartung' }] },
    { label: 'Deutschland', children: [{ label: 'Hauptursachen', children: [{ label: '1,4 Kinder pro Frau' }] }] },
    { label: 'Alt', items: ['eins', 'zwei'] },
  ] });
  assert.equal(m.branches[0].text, 'Veränderung von Größe und Altersaufbau.');
  assert.deepEqual(m.branches[1].children.map((c) => c.label), ['Niedrige Geburtenrate', 'Höhere Lebenserwartung']);
  assert.equal(m.branches[2].children[0].children[0].label, '1,4 Kinder pro Frau');
  assert.deepEqual(m.branches[3].children.map((c) => c.label), ['eins', 'zwei']);
});

test('Zeitstrahl: keine feste Obergrenze mehr (alle Ereignisse und Stichpunkte), keine Quellenzeile', () => {
  const t = visuals.timeline({ title: 'T', source: 'irgendwas', events: Array.from({ length: 25 }, (_, i) => ({ date: String(1900 + i), title: `E${i}`, points: Array.from({ length: 9 }, (_, k) => `p${k}`) })) });
  assert.equal(t.events.length, 25);
  assert.equal(t.events[0].points.length, 9);
  assert.equal(t.source, undefined);
});

test('Denk-Ablauf je Format: Präsentation, Mindmap, Zeitstrahl haben eigene Schritte; Börse kennt kein Diagramm-Format', () => {
  global.window = global.window || {};
  require('../thinking.js');
  const T = global.window.Thinking;
  assert.equal(T.formatOf('Mach mir eine Präsentation über Vulkane', 'learn'), 'praesentation');
  assert.equal(T.formatOf('Erstelle eine Mindmap zum demografischen Wandel', 'general'), 'mindmap');
  assert.equal(T.formatOf('Zeitstrahl zur Deutschen Einheit', 'general'), 'timeline');
  assert.equal(T.formatOf('Zeig mir das Diagramm von SAP', 'boerse'), null);
  assert.equal(T.of('learn', 'start', 'praesentation').main, 'Understanding your goal');
  assert.equal(T.of('learn', 'work', 'praesentation').main, 'Creating presentation');
  assert.equal(T.of('learn', 'work', 'praesentation').anim, 'book', 'der Hund bleibt der des Agenten');
  assert.equal(T.of('general', 'work', null).sub, 'Preparing response');
  assert.equal(T.blockFormat('Text\n```mindmap\n{}'), 'mindmap');
  assert.equal(T.statsOf('timeline', '```timeline\n{"events":[{},{},{}]}\n```'), '3 events');
});
