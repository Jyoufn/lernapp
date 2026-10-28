// Tests für die Agenten-Schleife des Coding-Agenten (lib/codeloop.js) – die NVIDIA-API wird simuliert (kein Schlüssel, kein Netz)
const test = require('node:test');
const assert = require('node:assert/strict');
const W = require('../lib/workflow');
const M = require('./mock');

// Antwort der NVIDIA-API (OpenAI-Format): Text und/oder Werkzeug-Aufrufe
const reply = (content, calls = [], reasoning = '') => M.json({ choices: [{ message: { role: 'assistant', content,
  ...(reasoning ? { reasoning_content: reasoning } : {}),
  ...(calls.length ? { tool_calls: calls.map(([name, args], i) => ({ id: `c${i}`, type: 'function', function: { name, arguments: JSON.stringify(args) } })) } : {}) } }] });
const isCode = (c) => c.url.includes('integrate.api.nvidia.com') && Array.isArray(c.body?.tools);
const ENV = { NVIDIA_CODE_API_KEY: 'test-code-key', APPTEST: 'off', CODE_AGENT: 'on' }; // Coden ist in der App vorerst gesperrt – für die Tests frei // Lauftest (echter Browser) ist eigens getestet

test('Agenten-Schleife: Plan → Dateien schreiben → Prüfung findet Fehler → gezielt ändern → Prüfung ok → fertig', async () => {
  const steps = [
    reply('Ich lege zuerst die Aufgaben an.', [['update_plan', { steps: [{ text: 'Spielfeld' }, { text: 'Steuerung' }] }]], 'Erst planen.'),
    reply('', [['write_file', { path: 'index.html', content: '<canvas id="game"></canvas>\n<script src="game.js"></script>' }],
      ['write_file', { path: 'game.js', content: 'const c = document.getElementById("board");' }]]),
    reply('', [['check_project', {}]]),
    reply('', [['edit_file', { path: 'game.js', old_string: '"board"', new_string: '"game"' }]]),
    reply('', [['check_project', {}]]),
    reply('Fertig: Das Spiel startet mit der Leertaste.'),
  ];
  let n = 0;
  const fx = M.installFetch([{ match: isCode, respond: () => steps[n++] }]);
  try {
    const c = M.collect();
    const result = await W.runChat({ env: ENV, body: { log: false, agent: 'code', messages: [{ role: 'user', text: 'Bau ein Spiel' }] }, send: c.send, signal: new AbortController().signal });
    assert.equal(n, steps.length, 'alle Schritte der Schleife liefen');
    const calls = fx.calls.filter(isCode);
    assert.equal(calls[0].init.headers.Authorization, 'Bearer test-code-key', 'eigener Schlüssel aus .env');
    assert.match(calls[0].body.model, /nemotron-3-ultra/);
    assert.ok(calls[0].body.tools.some((t) => t.function.name === 'edit_file'), 'Werkzeuge werden mitgeschickt');
    // Werkzeug-Ergebnisse gehen mit tool_call_id zurück an das Modell
    const toolMsgs = calls[3].body.messages.filter((m) => m.role === 'tool');
    assert.match(toolMsgs.at(-1).content, /#board/, 'Prüfergebnis kommt beim Modell an');
    assert.ok(toolMsgs.every((m) => m.tool_call_id));
    const a = result.answer;
    assert.match(a, /```plan\n/);
    assert.match(a, /````file:game\.js\nconst c = document\.getElementById\("game"\);\n````/, 'geänderte Datei steht vollständig im Text');
    const checks = [...a.matchAll(/```check\n(.*)\n```/g)].map((m) => JSON.parse(m[1]).problems.length);
    assert.deepEqual(checks, [1, 0]);
    assert.match(a, /Fertig: Das Spiel startet/);
    assert.ok(c.events.some((e) => e.event === 'thought'), 'Gedanken des Modells erscheinen als Thinking');
  } finally { fx.restore(); W.cooldowns.clear(); }
});

test('Agenten-Schleife: meldet fertig ohne Prüfung → die App prüft selbst und gibt Fehler zurück', async () => {
  const steps = [
    reply('', [['write_file', { path: 'app.js', content: 'function a( {' }]]),
    reply('Fertig.'),
    reply('', [['write_file', { path: 'app.js', content: 'function a() {}' }]]),
    reply('Jetzt wirklich fertig.'),
  ];
  let n = 0;
  const fx = M.installFetch([{ match: isCode, respond: () => steps[n++] }]);
  try {
    const c = M.collect();
    const result = await W.runChat({ env: ENV, body: { log: false, agent: 'code', messages: [{ role: 'user', text: 'Bau was' }] }, send: c.send, signal: new AbortController().signal });
    assert.equal(n, 4);
    const fix = fx.calls.filter(isCode)[2].body.messages.at(-1);
    assert.equal(fix.role, 'user');
    assert.match(fix.content, /Automatische Prüfung[\s\S]*SyntaxError/);
    const checks = [...result.answer.matchAll(/```check\n(.*)\n```/g)].map((m) => JSON.parse(m[1]).problems.length);
    assert.deepEqual(checks, [1, 0]);
  } finally { fx.restore(); W.cooldowns.clear(); }
});

test('Agenten-Schleife: NVIDIA-Aussetzer (HTTP 500) wird wiederholt, danach geht es normal weiter', async () => {
  const err500 = () => M.json({ error: { message: 'Internal server error', code: 500 } }, 500);
  const steps = [err500(), err500(), reply('', [['write_file', { path: 'a.txt', content: 'Hallo' }]]), reply('Fertig.')];
  let n = 0;
  const fx = M.installFetch([{ match: isCode, respond: () => steps[n++] }]);
  try {
    const c = M.collect();
    const result = await W.runChat({ env: { ...ENV, CODE_RETRY_SCALE: 0 }, body: { log: false, agent: 'code', messages: [{ role: 'user', text: 'Leg a.txt an' }] }, send: c.send, signal: new AbortController().signal });
    assert.equal(n, 4);
    assert.match(result.answer, /````file:a\.txt\nHallo\n````/);
    assert.match(result.answer, /Fertig\./);
  } finally { fx.restore(); W.cooldowns.clear(); }
});

test('Agenten-Schleife: NVIDIA fällt dauerhaft aus → bisherige Dateien bleiben, klarer Hinweis statt Absturz', async () => {
  let n = 0;
  const fx = M.installFetch([{ match: isCode, respond: () => (n++ === 0 ? reply('', [['write_file', { path: 'index.html', content: '<h1>Hi</h1>' }]]) : M.json({ error: { message: 'Internal server error' } }, 500)) }]);
  try {
    const c = M.collect();
    const result = await W.runChat({ env: { ...ENV, CODE_RETRY_SCALE: 0 }, body: { log: false, agent: 'code', messages: [{ role: 'user', text: 'Bau was' }] }, send: c.send, signal: new AbortController().signal });
    assert.equal(result.status, 'completed');
    assert.match(result.answer, /````file:index\.html\n<h1>Hi<\/h1>\n````/, 'Datei bleibt erhalten');
    assert.match(result.answer, /Unterbrochen:.*HTTP 500.*„weiter“/);
  } finally { fx.restore(); W.cooldowns.clear(); }
});

test('Agenten-Schleife: von jeder Datei bleibt nur die aktuelle Fassung im Verlauf (Anfragen bleiben klein)', async () => {
  const v1 = 'eins'.repeat(1000), v2 = 'zwei'.repeat(1000);
  const steps = [reply('', [['write_file', { path: 'big.js', content: v1 }]]), reply('', [['write_file', { path: 'big.js', content: v2 }]]), reply('', [['list_files', {}]]), reply('Fertig.')];
  let n = 0;
  const fx = M.installFetch([{ match: isCode, respond: () => steps[n++] }]);
  try {
    const c = M.collect();
    await W.runChat({ env: ENV, body: { log: false, agent: 'code', messages: [{ role: 'user', text: 'Bau was' }] }, send: c.send, signal: new AbortController().signal });
    const sent = JSON.stringify(fx.calls.filter(isCode)[3].body.messages);
    assert.ok(!sent.includes(v1), 'alte Fassung nicht mehr mitgeschickt');
    assert.ok(sent.includes(v2), 'aktuelle Fassung bleibt sichtbar');
  } finally { fx.restore(); W.cooldowns.clear(); }
});

test('Agenten-Schleife: liest nicht im Kreis – unverändertes Wieder-Lesen wird abgefangen, danach Anstoß zum Weiterarbeiten', async () => {
  const project = [{ role: 'assistant', text: '````file:a.js\nlet a = 1;\n````\n````file:b.js\nlet b = 2;\n````\n````file:c.js\nlet c = 3;\n````' }];
  const steps = [
    reply('', [['read_file', { path: 'a.js' }], ['read_file', { path: 'b.js' }], ['read_file', { path: 'c.js' }]]),
    reply('', [['read_file', { path: 'a.js' }]]),
    reply('', [['read_file', { path: 'b.js' }]]),
    reply('', [['edit_file', { path: 'a.js', old_string: '1', new_string: '5' }]]),
    reply('Fertig.'),
  ];
  let n = 0;
  const fx = M.installFetch([{ match: isCode, respond: () => steps[n++] }]);
  try {
    const c = M.collect();
    const result = await W.runChat({ env: ENV, body: { log: false, agent: 'code', messages: [{ role: 'user', text: 'Bau was' }, ...project, { role: 'user', text: 'Ändere a' }] }, send: c.send, signal: new AbortController().signal });
    const calls = fx.calls.filter(isCode);
    const tools2 = calls[2].body.messages.filter((m) => m.role === 'tool');
    assert.match(tools2.at(-1).content, /unverändert/, 'zweites Lesen von a.js wird abgefangen');
    assert.match(JSON.stringify(calls[2].body.messages), /let c = 3/, 'alle drei Dateien bleiben sichtbar');
    assert.match(calls[3].body.messages.at(-1).content, /Lies nichts erneut/, 'nach drei Lese-Schritten kommt der Anstoß');
    assert.equal([...result.answer.matchAll(/```read\n/g)].length, 3, 'jede Datei nur einmal als „gelesen“');
  } finally { fx.restore(); W.cooldowns.clear(); }
});

test('Agenten-Schleife: angehängtes Bild wird vom Bildmodell beschrieben und geht mit an den Agenten', async () => {
  const isVision = (c) => c.url.includes('integrate.api.nvidia.com') && !Array.isArray(c.body?.tools);
  let n = 0;
  const fx = M.installFetch([
    { match: isVision, respond: () => M.json({ choices: [{ message: { content: 'Entwurf: dunkler Hintergrund #101820, Titel „Snake“ oben, grüner Start-Knopf.' } }] }) },
    { match: isCode, respond: () => [reply('', [['list_files', {}]]), reply('Fertig.')][n++] },
  ]);
  try {
    const c = M.collect();
    const img = { mime: 'image/png', name: 'entwurf.png', data: 'iVBORw0KGgo' + 'A'.repeat(200) };
    const result = await W.runChat({ env: ENV, body: { log: false, agent: 'code', messages: [{ role: 'user', text: 'Bau das so wie im Bild', images: [img] }] }, send: c.send, signal: new AbortController().signal });
    const vision = fx.calls.find(isVision);
    assert.match(vision.body.model, /vl/i, 'Bildmodell Nemotron VL wird benutzt');
    assert.ok(JSON.stringify(vision.body.messages).includes('image_url'), 'Bild geht an das Bildmodell');
    const first = fx.calls.filter(isCode)[0].body.messages.at(-1).content;
    assert.match(first, /Beschreibung des Bildmodells[\s\S]*#101820/, 'Beschreibung steht in der Nachricht an den Agenten');
    assert.match(result.answer, /```read\nbild:entwurf\.png\n```/, 'im Chat: „Bild angesehen“');
    assert.doesNotMatch(result.answer, /```read\n\*\n```/, 'leeres Projekt: kein „Projekt angesehen“');
  } finally { fx.restore(); W.cooldowns.clear(); }
});

test('Agenten-Schleife: NVIDIA-Ratenlimit (HTTP 429 mit retry-after) → warten und weitermachen', async () => {
  const limited = () => new Response(JSON.stringify({ error: { message: 'Rate limit reached' } }), { status: 429, headers: { 'Content-Type': 'application/json', 'retry-after': '2' } });
  const steps = [limited(), reply('', [['write_file', { path: 'a.txt', content: 'Hallo' }]]), reply('Fertig.')];
  let n = 0;
  const thoughts = [];
  const fx = M.installFetch([{ match: isCode, respond: () => steps[n++] }]);
  try {
    const c = M.collect();
    const result = await W.runChat({ env: { ...ENV, CODE_RETRY_SCALE: 0 }, body: { log: false, agent: 'code', messages: [{ role: 'user', text: 'Leg a.txt an' }] }, send: (e, d) => { if (e === 'thought') thoughts.push(d.text); c.send(e, d); }, signal: new AbortController().signal });
    assert.equal(n, 3);
    assert.match(result.answer, /````file:a\.txt\nHallo\n````/);
    assert.ok(thoughts.some((t) => /Ratenlimit/.test(t)), 'Hinweis aufs Ratenlimit im Thinking');
  } finally { fx.restore(); W.cooldowns.clear(); }
});

test('Agenten-Schleife: Anfrage zu groß fürs Token-Budget (413) → hart gekürzt, derselbe Schritt klappt dann', async () => {
  const big = '// eine Zeile Kommentar\n'.repeat(1000); // ~24 000 Zeichen, gültiges JS (die Prüfung bleibt fehlerfrei)
  const tooLarge = () => M.json({ error: { message: 'Request too large … tokens per minute (TPM): Limit 8000', code: 'rate_limit_exceeded' } }, 413);
  const steps = [reply('', [['write_file', { path: 'big.js', content: big }]]), tooLarge(), reply('Fertig.')];
  let n = 0;
  const fx = M.installFetch([{ match: isCode, respond: () => steps[n++] }]);
  try {
    const c = M.collect();
    const result = await W.runChat({ env: { ...ENV, NVIDIA_CODE_TOKEN_BUDGET: 100000 }, body: { log: false, agent: 'code', messages: [{ role: 'user', text: 'Bau was' }] }, send: c.send, signal: new AbortController().signal });
    assert.equal(n, 3);
    const retry = JSON.stringify(fx.calls.filter(isCode)[2].body.messages);
    assert.ok(!retry.includes(big), 'nach 413 ist der große Inhalt aus der Anfrage raus');
    assert.match(result.answer, /Fertig\./);
    assert.doesNotMatch(result.answer, /Unterbrochen/);
  } finally { fx.restore(); W.cooldowns.clear(); }
});

test('Agenten-Schleife: kaputter Werkzeug-Aufruf (400 tool_use_failed) → Hinweis, Schritt wird wiederholt', async () => {
  const broken = () => M.json({ error: { message: 'Failed to call a function', code: 'tool_use_failed', failed_generation: '{"name":"write_file"' } }, 400);
  const steps = [broken(), reply('', [['write_file', { path: 'a.txt', content: 'Hallo' }]]), reply('Fertig.')];
  let n = 0;
  const fx = M.installFetch([{ match: isCode, respond: () => steps[n++] }]);
  try {
    const c = M.collect();
    const result = await W.runChat({ env: ENV, body: { log: false, agent: 'code', messages: [{ role: 'user', text: 'Leg a.txt an' }] }, send: c.send, signal: new AbortController().signal });
    assert.equal(n, 3);
    assert.match(fx.calls.filter(isCode)[1].body.messages.at(-1).content, /fehlerhaft formatiert/);
    assert.match(result.answer, /````file:a\.txt\nHallo\n````/);
  } finally { fx.restore(); W.cooldowns.clear(); }
});

/* OpenRouter (gratis) zuerst, NVIDIA direkt als Ersatz */
const isOR = (c) => c.url.includes('openrouter.ai') && Array.isArray(c.body?.tools);
const ENV_OR = { OPENROUTER_API_KEY: 'test-or-key', NVIDIA_CODE_API_KEY: 'test-code-key', APPTEST: 'off', CODE_AGENT: 'on' };

test('OpenRouter: Nemotron 3 Ultra (free) wird zuerst benutzt, mit eigenem Schlüssel', async () => {
  let n = 0;
  const fx = M.installFetch([{ match: isOR, respond: () => [reply('', [['write_file', { path: 'a.txt', content: 'Hallo' }]]), reply('Fertig.')][n++] }]);
  try {
    const c = M.collect();
    const result = await W.runChat({ env: ENV_OR, body: { log: false, agent: 'code', messages: [{ role: 'user', text: 'Leg a.txt an' }] }, send: c.send, signal: new AbortController().signal });
    const call = fx.calls.find(isOR);
    assert.equal(call.body.model, 'nvidia/nemotron-3-ultra-550b-a55b:free');
    assert.equal(call.init.headers.Authorization, 'Bearer test-or-key');
    assert.ok(!fx.calls.some(isCode), 'NVIDIA direkt wird nicht gebraucht');
    assert.match(result.answer, /````file:a\.txt\nHallo\n````/);
  } finally { fx.restore(); W.cooldowns.clear(); }
});

test('OpenRouter-Tageslimit (429 free-models-per-day) → mitten in der Arbeit weiter über NVIDIA direkt', async () => {
  const daily = () => M.json({ error: { message: 'Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day', code: 429 } }, 429);
  let o = 0, v = 0;
  const thoughts = [];
  const fx = M.installFetch([
    { match: isOR, respond: () => [reply('', [['write_file', { path: 'a.txt', content: 'Hallo' }]]), daily()][o++] },
    { match: isCode, respond: () => [reply('', [['write_file', { path: 'b.txt', content: 'Welt' }]]), reply('Fertig.')][v++] },
  ]);
  try {
    const c = M.collect();
    const result = await W.runChat({ env: { ...ENV_OR, CODE_RETRY_SCALE: 0 }, body: { log: false, agent: 'code', messages: [{ role: 'user', text: 'Leg zwei Dateien an' }] }, send: (e, d) => { if (e === 'thought') thoughts.push(d.text); c.send(e, d); }, signal: new AbortController().signal });
    assert.equal(o, 2, 'OpenRouter: ein Schritt, dann Tageslimit (ohne Warten)');
    assert.equal(v, 2, 'danach NVIDIA direkt');
    assert.match(fx.calls.filter(isCode)[0].body.model, /nemotron-3-ultra-550b-a55b$/);
    assert.ok(JSON.stringify(fx.calls.filter(isCode)[0].body.messages).includes('a.txt'), 'NVIDIA macht mit dem bisherigen Verlauf weiter');
    assert.match(result.answer, /file:a\.txt[\s\S]*file:b\.txt[\s\S]*Fertig\./);
    assert.ok(thoughts.some((t) => /Tageslimit erreicht – weiter über NVIDIA/.test(t)));
  } finally { fx.restore(); W.cooldowns.clear(); }
});

test('Gestreamter Schritt: Werkzeug-Aufruf kommt stückweise, Live-Status „Datei wird angelegt: …“ geht sofort raus', async () => {
  const sse = (chunks) => new Response(chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join('') + 'data: [DONE]\n\n', { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
  const steps = [
    sse([
      { choices: [{ delta: { reasoning: 'Ich lege die Datei an.' } }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, id: 'c1', function: { name: 'write_file', arguments: '{"path":"src/ga' } }] } }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'me.js","content":"let a = 1;"}' } }] } }] },
    ]),
    sse([{ choices: [{ delta: { content: 'Fertig.' } }] }]),
  ];
  let n = 0;
  const statuses = [];
  const fx = M.installFetch([{ match: isCode, respond: () => steps[n++] }]);
  try {
    const c = M.collect();
    const result = await W.runChat({ env: ENV, body: { log: false, agent: 'code', messages: [{ role: 'user', text: 'Bau was' }] }, send: (e, d) => { if (e === 'codestatus') statuses.push(d.text); c.send(e, d); }, signal: new AbortController().signal });
    assert.equal(fx.calls.filter(isCode)[0].body.stream, true, 'Schritte werden gestreamt');
    assert.match(result.answer, /````file:src\/game\.js\nlet a = 1;\n````/);
    assert.ok(statuses.includes('Datei wird angelegt: src/game.js'), statuses.join(' | '));
    assert.ok(!statuses.some((t) => /Überlegt/.test(t)), 'keine doppelte „Überlegt“-Zeile neben dem Thinking');
    assert.equal(statuses.at(-1), '', 'am Ende verschwindet die Live-Zeile');
    assert.ok(c.events.some((e) => e.event === 'thought' && /Datei an/.test(e.data.text)), 'Gedanken aus dem Stream');
  } finally { fx.restore(); W.cooldowns.clear(); }
});

test('Coden ist vorerst gesperrt: ohne CODE_AGENT=on läuft eine Coden-Anfrage wie beim Allgemein-Agenten (keine Werkzeug-Schleife)', async () => {
  const fx = M.installFetch([
    { match: isCode, respond: () => reply('sollte nicht kommen') },
    { match: M.is.geminiStream, respond: () => M.sseResponse(M.geminiChunks(['Hallo!'])) },
    { match: M.is.nvidia, respond: () => M.nvidiaJson({ simple: true, effort: 'low', points: [], clarify: [] }) },
  ]);
  try {
    const c = M.collect();
    const result = await W.runChat({ env: { GEMINI_API_KEY: 'g', NVIDIA_CODE_API_KEY: 'test-code-key' }, body: { log: false, agent: 'code', messages: [{ role: 'user', text: 'Hallo' }] }, send: c.send, signal: new AbortController().signal });
    assert.ok(!fx.calls.some(isCode), 'keine Werkzeug-Schleife');
    assert.match(result.answer, /Hallo!/);
  } finally { fx.restore(); W.cooldowns.clear(); }
});

test('Allgemein-Agent programmiert normal im Chat: keine Werkzeug-Schleife, kein Coding-Prompt, Code als normaler Codeblock', async () => {
  const code = 'Hier ist dein Spiel:\n```html\n<canvas id="c"></canvas>\n```';
  const fx = M.installFetch([
    { match: isCode, respond: () => reply('sollte nicht kommen') },
    { match: M.is.geminiStream, respond: () => M.sseResponse(M.geminiChunks([code])) },
    { match: M.is.nvidia, respond: () => M.nvidiaJson({ simple: false, effort: 'low', points: [], clarify: [] }) },
  ]);
  try {
    const c = M.collect();
    const result = await W.runChat({ env: { GEMINI_API_KEY: 'g', NVIDIA_CODE_API_KEY: 'test-code-key', CODE_AGENT: 'on' }, body: { log: false, agent: 'general', effort: 'low', messages: [{ role: 'user', text: 'Programmier mir ein kleines Snake-Spiel' }] }, send: c.send, signal: new AbortController().signal });
    assert.ok(!fx.calls.some(isCode), 'keine Werkzeug-Schleife beim Allgemein-Agenten');
    const sys = M.systemOf(fx.calls.find(M.is.geminiStream));
    assert.match(sys, /AGENT: ALLGEMEIN/);
    assert.doesNotMatch(sys, /AGENT: CODEN|file:index\.html/, 'kein Coding-Prompt');
    assert.match(result.answer, /```html/);
  } finally { fx.restore(); W.cooldowns.clear(); }
});
