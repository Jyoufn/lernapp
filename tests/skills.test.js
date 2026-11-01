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
