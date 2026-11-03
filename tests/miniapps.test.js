// Mini-Apps (```widget), Einstellungen per Chat, eigene Agenten und Einrichtungs-Chat (lib/workflow.js)
const test = require('node:test');
const assert = require('node:assert');
const M = require('./mock');
const W = require('../lib/workflow');

test('Mini-App-Anleitung: beim Coding-Agenten immer, sonst nur bei passenden Wörtern; Stilwünsche gehen mit', () => {
  const code = W.extrasPrompt({ agent: 'code', text: 'Hallo', recent: '', look: { accent: '#4fcf8a', corners: 'rund', wish: 'Pastell' } });
  assert.match(code, /MINI-APPS/);
  assert.match(code, /#4fcf8a/);
  assert.match(code, /Pastell/);
  assert.doesNotMatch(W.extrasPrompt({ agent: 'general', text: 'Was ist Photosynthese?', recent: '' }), /MINI-APPS/);
  assert.match(W.extrasPrompt({ agent: 'general', text: 'Veranschauliche mir das mit einer Simulation', recent: '' }), /MINI-APPS/);
  assert.match(W.extrasPrompt({ agent: 'general', text: 'Mach meinen Chat-Hintergrund zu Sternen', recent: '' }), /```einstellung/);
});

test('Eigener Agent: Anweisung wird geprüft und an den System-Prompt gehängt', async () => {
  assert.equal(W.cleanCustom({ name: '', prompt: 'x' }), null);
  assert.deepEqual(W.cleanCustom({ name: ' Mathe  Coach ', prompt: 'Du bist ein Mathe-Coach und gibst nur Tipps.', mode: 'lernen' }), { name: 'Mathe Coach', prompt: 'Du bist ein Mathe-Coach und gibst nur Tipps.', mode: 'learn' });
  const fx = M.installFetch([{ match: M.is.geminiStream, respond: () => M.sseResponse(M.geminiChunks(['Okay!'])) }]);
  try {
    const c = M.collect();
    await W.runChat({ env: { ...M.ENV }, body: { log: false, agent: 'u-abc', effort: 'low', custom: { name: 'Coach', prompt: 'ROLLE: Du gibst nur Tipps, nie die Lösung.', mode: 'allgemein' }, messages: [{ role: 'user', text: 'Hilf mir bei 2x+3=7' }] }, send: c.send, signal: new AbortController().signal });
    const sys = M.systemOf(fx.calls.find(M.is.geminiStream));
    assert.match(sys, /EIGENER AGENT „Coach“/);
    assert.match(sys, /nie die Lösung/);
  } finally { fx.restore(); W.cooldowns.clear(); }
});

test('Einrichtungs-Chat: nur Einrichtung (Vorrang am Ende), keine Suche, strenge Pixel-Figuren', async () => {
  const fx = M.installFetch([{ match: M.is.geminiStream, respond: () => M.sseResponse(M.geminiChunks(['Wofür soll er da sein?'])) }]);
  try {
    const c = M.collect();
    await W.runChat({ env: { ...M.ENV }, body: { log: false, setup: 'agent', agent: 'research', effort: 'low', setupBase: { name: 'Alt', prompt: 'alte Anweisung' }, messages: [{ role: 'user', text: 'Ich will einen Agenten für Bio' }] }, send: c.send, signal: new AbortController().signal });
    const sys = M.systemOf(fx.calls.find(M.is.geminiStream));
    assert.match(sys, /EINRICHTUNG EINES EIGENEN AGENTEN/);
    assert.match(sys, /havaneser/);
    assert.match(sys, /alte Anweisung/);
    assert.ok(sys.lastIndexOf('EINRICHTUNG EINES EIGENEN AGENTEN') > sys.lastIndexOf('AGENT: ALLGEMEIN'), 'Einrichtung steht am Ende');
    assert.doesNotMatch(sys, /AGENT: RESEARCH/, 'Einrichtung läuft immer als Allgemein');
  } finally { fx.restore(); W.cooldowns.clear(); }
});
