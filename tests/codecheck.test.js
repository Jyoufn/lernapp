// Tests für die Code-Prüfung des Coding-Agenten (lib/codecheck.js) – ohne Netz, nur lokale Prüfungen
const test = require('node:test');
const assert = require('node:assert/strict');
const CC = require('../lib/codecheck');

test('Datei-Blöcke: vier Backticks, innere ``` bleiben Teil der Datei, unsichere Pfade werden bereinigt', () => {
  const text = 'Text\n````file:README.md\n# Titel\n```js\nx\n```\n````\n````file:../../evil.txt\nhalb';
  const b = CC.blocks(text);
  assert.equal(b.length, 2);
  assert.equal(b[0].path, 'README.md');
  assert.match(b[0].content, /```js/);
  assert.equal(b[1].path, 'evil.txt');
  assert.equal(b[1].done, false);
});

test('Projektstand: spätere Dateien überschreiben frühere, unfertige Blöcke zählen nicht', () => {
  const files = CC.projectFrom(['````file:a.js\nlet a = 1;\n````', '````file:a.js\nlet a = 2;\n````\n````file:b.js\nhalb']);
  assert.deepEqual([...files], [['a.js', 'let a = 2;']]);
});

test('Verlauf ohne Datei-Blöcke: nur kurze Hinweise bleiben', () => {
  const t = CC.stripBlocks('Ich baue es.\n````file:src/game.js\nlet a;\n````\n```check\n{"round":1,"problems":[]}\n```\nFertig.');
  assert.equal(t, 'Ich baue es.\n[Datei src/game.js geschrieben]\n\nFertig.');
});

test('Prüfung findet Syntaxfehler, fehlende Dateien, falsche IDs und kaputtes JSON', () => {
  const files = new Map([
    ['index.html', '<canvas id="game"></canvas><script src="game.js"></script><script src="fehlt.js"></script>'],
    ['game.js', 'const c = document.getElementById("board");\nfunction a( {'],
    ['data.json', '{kaputt'],
  ]);
  const msgs = CC.check(files).map((p) => p.message).join('\n');
  assert.match(msgs, /SyntaxError/);
  assert.match(msgs, /fehlt\.js/);
  assert.match(msgs, /#board/);
  assert.match(msgs, /Ungültiges JSON/);
});

test('Prüfung: sauberes Projekt ohne Meldungen', () => {
  const files = new Map([
    ['index.html', '<canvas id="game"></canvas><link rel="stylesheet" href="style.css"><script type="module" src="src/main.js"></script>'],
    ['style.css', 'body { margin: 0; }'],
    ['src/main.js', 'import { start } from "./game.js";\nstart(document.getElementById("game"));'],
    ['src/game.js', 'export function start(c) { return c; }'],
  ]);
  assert.deepEqual(CC.check(files), []);
});

/* Ablauf des Coding-Agenten: Projektstand im Prompt, Prüfung nach dem Schreiben, Korrekturrunde bei Fehlern */
const W = require('../lib/workflow');
const M = require('./mock');
const ANALYSIS_CODE = { simple: false, domain: 'code', approach: 'Ich baue das Spiel in mehreren Dateien.', points: ['Spielfeld', 'Steuerung', 'Punkte'],
  research: false, verify: false, effort: 'high', topic: 'snake', queriesDe: [], queriesEn: [], clarify: [] };
test('Coden: fehlerhafter Code → Prüfblock mit Fehlern → Korrekturrunde → Prüfblock ohne Fehler', async () => {
  const F4 = '````';
  const bad = `Ich baue es.\n${F4}file:index.html\n<canvas id="game"></canvas><script src="game.js"></script>\n${F4}\n${F4}file:game.js\nconst c = document.getElementById("board");\n${F4}\nFertig.`;
  const fix = `Ich korrigiere die ID.\n${F4}file:game.js\nconst c = document.getElementById("game");\n${F4}`;
  let n = 0;
  const fx = M.installFetch([
    { match: M.is.analyze, respond: () => M.nvidiaJson(ANALYSIS_CODE) },
    { match: M.is.geminiStream, respond: () => M.sseResponse(M.geminiChunks([n++ === 0 ? bad : fix])) },
  ]);
  try {
    const c = M.collect();
    const prev = { role: 'assistant', text: `${F4}file:README.md\n# Snake\n${F4}` };
    const result = await W.runChat({ env: { GEMINI_API_KEY: M.ENV.GEMINI_API_KEY, CODE_AGENT: 'on' }, body: { log: false, agent: 'code', effort: 'low', messages: [{ role: 'user', text: 'Bau Snake' }, prev, { role: 'user', text: 'Mach es besser' }] }, send: c.send, signal: new AbortController().signal });
    const gens = fx.calls.filter(M.is.geminiStream);
    assert.equal(gens.length, 2, 'eine Korrekturrunde');
    assert.match(M.systemOf(gens[0]), /AKTUELLES PROJEKT[\s\S]*README\.md/, 'Projektstand steht im Prompt');
    const checks = [...result.answer.matchAll(/```check\n(.*)\n```/g)].map((m) => JSON.parse(m[1]));
    assert.equal(checks.length, 2);
    assert.match(checks[0].problems[0].message, /#board/);
    assert.deepEqual(checks[1].problems, []);
  } finally { fx.restore(); W.cooldowns.clear(); }
});
