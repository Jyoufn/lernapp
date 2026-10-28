// Lauftest des Coding-Agenten (lib/apptest.js) mit echtem, unsichtbarem Chrome/Edge – ohne Browser wird übersprungen
const test = require('node:test');
const assert = require('node:assert/strict');
const AT = require('../lib/apptest');

const browser = AT.findBrowser();
const page = (script) => new Map([
  ['index.html', '<html><head><title>T</title></head><body><button id="go">Start</button><canvas id="c" width="100" height="100"></canvas><script src="game.js"></script></body></html>'],
  ['game.js', script],
]);

test('Lauftest: Klick auf „Start“ findet den echten Laufzeitfehler mit Datei und Zeile', { skip: !browser && 'kein Browser', timeout: 60000 }, async () => {
  const r = await AT.run(page('let best = localStorage.getItem("hs") || 0;\ndocument.getElementById("go").onclick = () => { startGame(); };'));
  assert.equal(r.ok, false);
  assert.deepEqual(r.clicked, ['Start']);
  assert.match(r.errors[0].message, /startGame is not defined/);
  assert.equal(r.errors[0].file, 'game.js');
  assert.equal(r.errors[0].line, 2);
});

test('Lauftest: funktionierende App ohne Fehler, Canvas zeigt etwas', { skip: !browser && 'kein Browser', timeout: 60000 }, async () => {
  const r = await AT.run(page('const x = document.getElementById("c").getContext("2d");\ndocument.getElementById("go").onclick = () => { x.fillStyle = "red"; x.fillRect(10, 10, 50, 50); };'));
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.equal(r.canvas, true);
});
