const test = require('node:test');
const assert = require('node:assert/strict');
const Skills = require('../skills.js');
const SK = require('../lib/skills.js');

test('Skills: „/skill“, ein starkes Stichwort oder zwei passende Wörter aktivieren – normale Fragen nicht', () => {
  assert.deepEqual(Skills.active('/humanizer mach den Text besser'), ['humanizer']);
  assert.deepEqual(Skills.active('Erstelle mir eine Präsentation über die Zelle'), ['praesentation']);
  assert.deepEqual(Skills.active('Mach ein modernes Design mit schönen Farben'), ['designer']);
  assert.deepEqual(Skills.active('Erklär mir die Photosynthese'), []);
  assert.deepEqual(Skills.active('Ich schreibe morgen eine Klausur'), []);
  assert.equal(SK.lernsetKind(SK.of({ text: 'Mach mir Karteikarten zur Zelle' })), 'karten');
  assert.match(SK.prompt(SK.of({ text: 'x', skills: ['designer', 'unbekannt'] })), /DESIGNER-MODUS/);
});

test('MiniMax (NVIDIA): eigener Schlüssel, Reihenfolge laut Einstellung – Gemini zuerst oder MiniMax zuerst', () => {
  const P = require('../lib/providers');
  const W = require('../lib/workflow');
  const env = { GEMINI_API_KEY: 'gem-key-12345', MINIMAX_API_KEY: 'nvapi-minimax-123' };
  assert.deepEqual(P.familiesFor(env).slice(0, 2), ['gemini', 'minimax']);
  assert.deepEqual(P.familiesFor({ ...env, AI_ORDER: 'minimax' }).slice(0, 2), ['minimax', 'gemini']);
  const a = W.providerAttempts({ ...env, AI_ORDER: 'minimax', __family: 'minimax' }, 'x', ['gemini-2.5-flash']);
  assert.equal(a[0].provider, 'minimax');
  assert.equal(a[0].model, 'minimaxai/minimax-m3.1-flash');
  assert.ok(a.some((x) => x.kind === 'gemini'), 'danach Gemini');
});
