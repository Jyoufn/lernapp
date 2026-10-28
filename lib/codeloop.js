/* ===================================================================
   Coding-Agent mit Nemotron 3 Ultra – zuerst GRATIS über OpenRouter (.env: OPENROUTER_API_KEY, Modell
   nvidia/nemotron-3-ultra-550b-a55b:free), als Ersatz direkt über NVIDIA (NVIDIA_CODE_API_KEY, leer = NVIDIA_API_KEY).
   Ist das OpenRouter-Tageslimit erreicht (bzw. fällt OpenRouter aus), geht es mitten in der Arbeit über NVIDIA weiter.
   Das Modell arbeitet so, wie es selbst am besten vorankommt: es hat Werkzeuge (Dateien auflisten/lesen/schreiben/ändern,
   Aufgabenliste, Projekt prüfen, App wirklich starten) und entscheidet selbst, wann es plant, liest, baut und testet –
   fertig ist es erst, wenn Prüfung und Lauftest fehlerfrei sind. Jeder Schritt geht als Block an die App, die daraus die
   Arbeitsschritte im Chat macht (code-agent.js):  ````file:pfad … ````   ```read  ```check  ```run  ```plan
   =================================================================== */
const CC = require('./codecheck');
const AT = require('./apptest'); // App wirklich starten und ausprobieren (unsichtbarer Chrome/Edge)
const P = require('./providers');

// Anbieter in Reihenfolge: OpenRouter (gratis) → NVIDIA direkt (Ersatz)
function providers(env) {
  const list = [];
  const or = String(env.OPENROUTER_API_KEY || '').trim();
  if (or) list.push({ name: 'OpenRouter', api: 'https://openrouter.ai/api/v1', key: or, keyName: 'OPENROUTER_API_KEY',
    model: env.OPENROUTER_CODE_MODEL || 'nvidia/nemotron-3-ultra-550b-a55b:free', vision: env.OPENROUTER_VISION_MODEL || 'nvidia/nemotron-3.5-super-vl:free',
    headers: { 'HTTP-Referer': 'http://localhost:3000', 'X-Title': 'Lern-App Coding-Agent' } });
  const nv = String(env.NVIDIA_CODE_API_KEY || '').trim() || P.nvidiaKeyOf(env) || '';
  if (nv) list.push({ name: 'NVIDIA', api: 'https://integrate.api.nvidia.com/v1', key: nv, keyName: 'NVIDIA_CODE_API_KEY',
    model: env.NVIDIA_CODE_MODEL || P.NVIDIA_TEXT_MODEL, vision: env.NVIDIA_CODE_VISION_MODEL || P.NVIDIA_VISION_MODEL, headers: {} });
  return list;
}
const MODEL = (env) => providers(env)[0]?.model || P.NVIDIA_TEXT_MODEL;
const keyOf = (env) => providers(env)[0]?.key || '';
const MAX_STEPS = 40;
const available = (env) => providers(env).length > 0;

/* Bilder im Chat (Screenshots, Entwürfe, Fehlermeldungen): Nemotron 3 Ultra liest nur Text – das Bildmodell Nemotron 3.5 Super VL
   (gleicher Schlüssel) beschreibt sie für den Programmierer, die Beschreibung geht mit der Nachricht an den Agenten.
   Beschreibungen werden gemerkt (gleiches Bild → keine zweite Anfrage). */
const VISION_PROMPT = `Du beschreibst Bilder für einen Programmierer, der danach etwas daraus bauen oder einen Fehler beheben soll. Auf Deutsch, genau und vollständig:
- Art des Bildes (Entwurf/Mockup, Screenshot einer App, Fehlermeldung, Foto, Grafik, Spielfigur …).
- Aufbau und Layout von oben nach unten: Bereiche, Elemente, Größenverhältnisse, Abstände, Ausrichtung.
- Farben als Hex-Werte (geschätzt), Schriften (Art, Größe, Gewicht), Ecken, Schatten, Icons.
- Alle sichtbaren Texte wörtlich. Code oder Fehlermeldungen exakt abschreiben, mit Datei und Zeile, wenn sichtbar.
- Zustände und Bedienung, die man erkennt (Knöpfe, Eingaben, Hover, aktiv/inaktiv).
Keine Vermutungen über Dinge, die nicht zu sehen sind.`;
const visionCache = new Map();
async function describeImages(env, images, signal) {
  const imgs = (images || []).filter((i) => /^image\//.test(i.mime) && i.data).slice(0, 4);
  if (!imgs.length) return '';
  const key = imgs.map((i) => `${i.data.length}:${i.data.slice(0, 64)}:${i.data.slice(-64)}`).join('|');
  if (visionCache.has(key)) return visionCache.get(key);
  let text, lastErr;
  for (const prov of providers(env)) {
    try {
      const r = await apiFetch(env, prov, '/chat/completions', {
        model: prov.vision, max_tokens: 3000, temperature: 0.2,
        messages: [{ role: 'system', content: VISION_PROMPT }, { role: 'user', content: [
          { type: 'text', text: imgs.length > 1 ? `Beschreibe die ${imgs.length} Bilder nacheinander (Bild 1, Bild 2 …).` : 'Beschreibe das Bild.' },
          ...imgs.map((img) => ({ type: 'image_url', image_url: { url: `data:${img.mime};base64,${img.data}` } })),
        ] }],
      }, AbortSignal.any([signal, AbortSignal.timeout(120000)]));
      text = String((await r.json()).choices?.[0]?.message?.content || '').replace(/<think>[\s\S]*?<\/think>/g, '');
      if (text.trim()) break;
    } catch (err) {
      if (signal.aborted) throw err;
      lastErr = err; // nächster Anbieter
    }
  }
  if (!text?.trim()) return `(Das Bild konnte nicht ausgewertet werden: ${String(lastErr?.message || 'keine Antwort').slice(0, 160)})`;
  text = String(text || '').trim();
  if (visionCache.size > 50) visionCache.delete(visionCache.keys().next().value);
  visionCache.set(key, text);
  return text;
}

const SYSTEM = `Du bist ein sehr erfahrener Software-Entwickler und arbeitest als Coding-Agent in einer Lern-App – so wie Claude Code.
Ziel: das bestmögliche, wirklich funktionierende Ergebnis. Dafür hast du Werkzeuge und entscheidest SELBST, wie du am besten vorgehst –
ob und wann du planst, was du liest, wie du die Dateien aufteilst, wann du prüfst und testest. Arbeite in einer Schleife:
Kontext sammeln → handeln → prüfen → wiederholen, bis die Aufgabe wirklich fertig ist.

DEINE WERKZEUGE
- list_files / read_file: bestehendes Projekt ansehen (nie raten, was in einer Datei steht).
- update_plan: Aufgabenliste anlegen und abhaken – sinnvoll bei allem, was mehr als ein, zwei Schritte braucht; der Nutzer sieht sie oben.
- write_file: Datei anlegen oder komplett ersetzen – immer der VOLLSTÄNDIGE Inhalt, nie „…“ oder Auslassungen.
- edit_file: genau eine Stelle ersetzen (old_string exakt und eindeutig, mit genug Kontext) – für kleine Änderungen.
- check_project: Syntax, eingebundene Dateien, IDs, JSON automatisch prüfen.
- run_app: die App wirklich in einem Browser starten – alle Knöpfe werden geklickt, Pfeile/Leertaste/Enter/WASD gedrückt; du bekommst
  echte Laufzeitfehler mit Datei und Zeile, geklickte Knöpfe, sichtbaren Text und ob das Canvas etwas zeigt.

WANN DU FERTIG BIST
- Erst wenn alles umgesetzt ist und check_project UND run_app nach deinen letzten Änderungen fehlerfrei sind. Jeder Laufzeitfehler ist
  ein echter Fehler: Ursache finden, beheben, erneut testen. Ein leeres Canvas nach „Start“ heißt: das Spiel läuft nicht.
- Dann antwortest du OHNE Werkzeug mit einer kurzen Zusammenfassung auf Deutsch: ein Satz, was fertig ist; 2–5 Stichpunkte, was du
  angelegt bzw. geändert hast; ein Satz, wie man es startet und bedient.

QUALITÄT (nicht die schnellste oder billigste Lösung)
- Durchdachte Architektur, gut lesbarer Code mit kurzen Kommentaren an wichtigen Stellen, Fehlerfälle abgefangen.
- Teile Code in mehrere überschaubare Dateien (je höchstens ~200 Zeilen) – jede Datei mit einem eigenen write_file-Aufruf.
- Modernes, ansprechendes Design: klare Abstände, harmonische Farben, gut lesbare Schrift, weiche Übergänge, sinnvolles Layout.
- Webprojekte: index.html als Einstieg, nur relative Pfade, kein Build-Schritt, keine externen Bibliotheken, wenn es ohne geht.
- Spiele: Start → Spielen → Pause → Game over → Neustart; Spielschleife mit requestAnimationFrame und Zeitschritt (überall gleich
  schnell); Canvas scharf (devicePixelRatio); Pfeiltasten scrollen nicht die Seite; Highscore in localStorage.
- Jedes Projekt hat eine README.md: was es ist, wie man es startet, Aufbau der Dateien, Stil-Entscheidungen. Halte sie aktuell.

REGELN
- Code steht NUR in Werkzeug-Aufrufen, nie im Text. Zwischen den Schritten kein Text – Text gibt es erst in der Zusammenfassung.
- Pfade relativ zum Projektordner, nur „/“, kein „..“.
- Hat der Nutzer Bilder angehängt (Entwurf, Screenshot, Fehlermeldung), steht ihre Beschreibung in seiner Nachricht: setze Entwürfe
  möglichst genau um (Aufbau, Farben, Texte) und behebe gezeigte Fehler gezielt.
- Antworte auf Deutsch.`;

const TOOLS = [
  { name: 'list_files', description: 'Listet alle Dateien des Projekts mit Zeilenzahl.', parameters: { type: 'object', properties: {} } },
  { name: 'read_file', description: 'Liest eine Datei des Projekts vollständig (mit Zeilennummern).', parameters: { type: 'object', properties: { path: { type: 'string', description: 'Pfad relativ zum Projekt, z. B. src/game.js' } }, required: ['path'] } },
  { name: 'write_file', description: 'Legt eine Datei an oder ersetzt sie komplett. content ist IMMER der vollständige Inhalt.', parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] } },
  { name: 'edit_file', description: 'Ersetzt in einer Datei genau eine Stelle: old_string (muss exakt und eindeutig vorkommen) durch new_string.', parameters: { type: 'object', properties: { path: { type: 'string' }, old_string: { type: 'string' }, new_string: { type: 'string' } }, required: ['path', 'old_string', 'new_string'] } },
  { name: 'check_project', description: 'Prüft das ganze Projekt automatisch: Syntax aller JS-Dateien und Inline-Scripts, eingebundene Dateien vorhanden, IDs im HTML, JSON. Nach Änderungen immer aufrufen.', parameters: { type: 'object', properties: {} } },
  { name: 'run_app', description: 'Startet die App wirklich (unsichtbarer Browser), klickt alle Knöpfe, drückt Pfeile/Leertaste/Enter/WASD und meldet Laufzeitfehler (Datei, Zeile), geklickte Knöpfe und ob das Canvas etwas zeigt. Nach check_project immer aufrufen.', parameters: { type: 'object', properties: {} } },
  { name: 'update_plan', description: 'Legt die Aufgabenliste an bzw. aktualisiert sie (ganze Liste übergeben).', parameters: { type: 'object', properties: { steps: { type: 'array', items: { type: 'object', properties: { text: { type: 'string' }, done: { type: 'boolean' } }, required: ['text'] } } }, required: ['steps'] } },
].map((f) => ({ type: 'function', function: f }));

/* NVIDIA-Anfrage (OpenAI-kompatibel). Aussetzer (500/502/503/504, Netz, Zeitüberschreitung) und Ratenlimit (429, Wartezeit
   aus der Meldung bzw. retry-after) werden mit Pause wiederholt; ungültiger Schlüssel bzw. 400 sofort als Fehler. */
const RETRY_WAIT = [2000, 5000, 10000, 20000, 30000];
const sleep = (ms, signal) => new Promise((resolve, reject) => {
  const t = setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => { clearTimeout(t); reject(signal.reason || new Error('abgebrochen')); }, { once: true });
});
async function apiFetch(env, prov, path, body, signal, onRetry) {
  const scale = env.CODE_RETRY_SCALE != null ? Number(env.CODE_RETRY_SCALE) : 1;
  let lastErr = null, wait = 0, limitWaits = 0, fails = 0;
  for (let n = 0; ; n++) {
    if (n) {
      if (fails > RETRY_WAIT.length) break; // aufgegeben – ohne weitere Pause
      onRetry?.(fails, lastErr, wait);
      await sleep((wait || RETRY_WAIT[Math.max(0, fails - 1)]) * scale, signal);
    }
    let r;
    try {
      r = await fetch(`${prov.api}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${prov.key}`, ...prov.headers }, body: JSON.stringify(body), signal });
    } catch (err) {
      if (signal.aborted) throw err;
      lastErr = err; wait = 0; fails++; continue; // Netz weg / Zeitüberschreitung → nochmal
    }
    if (r.ok) return r;
    if (r.status === 401 || r.status === 403) throw Object.assign(new Error(`${prov.name}-Schlüssel ungültig – in .env bei ${prov.keyName} eintragen`), { status: r.status, switchable: true });
    let detail = '', code = '', failed = '';
    try {
      const raw = await r.text();
      try { const e = JSON.parse(raw).error || {}; detail = String(e.message || '').slice(0, 300); code = String(e.code || ''); failed = String(e.failed_generation || '').slice(0, 300); } catch { detail = raw.slice(0, 300); }
    } catch {}
    lastErr = Object.assign(new Error(`${prov.name} antwortet nicht (HTTP ${r.status}${code ? `, ${code}` : ''}): ${detail}`), { status: r.status, code, failed });
    // Tageslimit der Gratis-Modelle bzw. kein Guthaben (OpenRouter: 429 „per-day“ / 402) → nicht warten, sondern Anbieter wechseln
    if (r.status === 402 || (r.status === 429 && /per[- ]day|daily|free-models-per-day/i.test(detail))) { lastErr.switchable = true; lastErr.daily = true; throw lastErr; }
    if (!(r.status === 429 || r.status >= 500)) throw lastErr; // z. B. 400: Wiederholen hilft nicht
    // Ratenlimit (429): so lange warten, wie die API sagt („try again in 24.75s“ bzw. retry-after) – zählt nicht als Fehlversuch
    // (höchstens 15× hintereinander, also gut 15 Minuten)
    if (r.status === 429) {
      const said = Number((detail.match(/try again in ([\d.]+)s/i) || [])[1]);
      const ra = Number(r.headers?.get?.('retry-after'));
      wait = Math.min(65, Math.max(said || 0, ra || 0, 2) + 1.5) * 1000;
      if (++limitWaits > 15) fails = RETRY_WAIT.length + 1; // gut 15 Minuten nur gewartet → aufgeben
    } else { wait = 0; fails++; }
  }
  if (lastErr) lastErr.switchable = true; // nach allen Wiederholungen: vielleicht klappt es beim nächsten Anbieter
  throw lastErr || Object.assign(new Error(`${prov.name} antwortet nicht`), { switchable: true });
}
/* Live-Status: woran das Modell gerade schreibt (aus dem gestreamten Werkzeug-Aufruf, sobald Name und Pfad zu sehen sind) */
const LIVE = { write_file: 'Datei wird angelegt', edit_file: 'Datei wird geändert', read_file: 'Liest', list_files: 'Sieht sich das Projekt an',
  check_project: 'Prüft den Code', run_app: 'Startet die App zum Testen', update_plan: 'Plant die Aufgaben' };
const liveText = (name, args) => {
  const path = (String(args || '').match(/"path"\s*:\s*"([^"]+)"/) || [])[1];
  return LIVE[name] ? `${LIVE[name]}${path ? `: ${path}` : ''}` : '';
};
/* Antwort lesen: gestreamt (SSE) – Text, Gedanken und Werkzeug-Aufrufe kommen stückweise; Werkzeug-Name/Pfad gehen sofort an onCall.
   Ohne Stream (z. B. in Tests) die ganze Antwort am Stück. */
async function readReply(r, onCall) {
  if (!/event-stream/i.test(r.headers?.get?.('content-type') || '')) return (await r.json()).choices?.[0]?.message || {};
  const acc = { content: '', reasoning: '', calls: [] };
  const dec = new TextDecoder();
  let buf = '';
  const take = (line) => {
    if (!line.startsWith('data:')) return;
    const data = line.slice(5).trim();
    if (!data || data === '[DONE]') return;
    let j;
    try { j = JSON.parse(data); } catch { return; }
    if (j.error) throw Object.assign(new Error(`Abbruch mitten in der Antwort: ${String(j.error.message || j.error).slice(0, 200)}`), { status: 500, switchable: true });
    const d = j.choices?.[0]?.delta || {};
    if (d.content) acc.content += d.content;
    if (d.reasoning || d.reasoning_content) acc.reasoning += d.reasoning || d.reasoning_content;
    for (const tc of d.tool_calls || []) {
      const c = acc.calls[tc.index ?? acc.calls.length] ||= { id: '', name: '', args: '' };
      if (tc.id) c.id = tc.id;
      if (tc.function?.name) c.name += tc.function.name;
      if (tc.function?.arguments) c.args += tc.function.arguments;
      onCall?.(c);
    }
  };
  for await (const chunk of r.body) {
    buf += dec.decode(chunk, { stream: true });
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) { take(buf.slice(0, nl).trim()); buf = buf.slice(nl + 1); }
  }
  take(buf.trim());
  return { content: acc.content, reasoning: acc.reasoning,
    tool_calls: acc.calls.filter(Boolean).map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: c.args || '{}' } })) };
}
/* Ein Schritt: Chat mit Werkzeugen (gestreamt); Gedanken des Modells (reasoning) gehen an onThought, Live-Status an onStatus. */
async function chatStep(env, prov, messages, signal, onThought, onRetry, onStatus) {
  const r = await apiFetch(env, prov, '/chat/completions', {
    model: prov.model, messages: clean(messages), tools: TOOLS, tool_choice: 'auto', stream: true,
    max_tokens: Number(env.NVIDIA_CODE_MAX_TOKENS) || 16384, temperature: 0.3, top_p: 0.9,
  }, AbortSignal.any([signal, AbortSignal.timeout(Number(env.NVIDIA_CODE_STEP_MS) || 300000)]), onRetry);
  let shown = '';
  const m = await readReply(r, (c) => { const t = liveText(c.name, c.args); if (t && t !== shown) { shown = t; onStatus?.(t); } });
  const thought = m.reasoning || m.reasoning_content;
  if (thought) onThought?.(String(thought));
  onStatus?.('');
  const msg = { role: 'assistant', content: String(m.content || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim() };
  if (m.tool_calls?.length) msg.tool_calls = m.tool_calls.map((c, i) => ({ id: c.id || `call_${Date.now()}_${i}`, type: 'function', function: { name: c.function?.name, arguments: typeof c.function?.arguments === 'string' ? c.function.arguments : JSON.stringify(c.function?.arguments || {}) } }));
  return msg;
}

/* Anfragen klein halten, ohne dass das Modell den Überblick verliert: von jeder Datei bleibt genau EIN aktueller Stand im Verlauf
   sichtbar – der letzte write_file-Inhalt bzw. das letzte read_file-Ergebnis der aktuellen Fassung. Ältere Fassungen und überholte
   Lese-Ergebnisse werden durch einen kurzen Hinweis ersetzt (große Anfragen kosten Zeit, Ratenlimit und machen Aussetzer wahrscheinlicher).
   Früher blieben nur die letzten zwei Lese-Ergebnisse – bei drei Dateien las das Modell dann endlos im Kreis. */
function compact(messages, ver) {
  const current = new Map(); // pfad → letzte Stelle mit vollem, aktuellem Inhalt
  messages.forEach((m, i) => {
    if (m.role === 'assistant' && m.tool_calls) m.tool_calls.forEach((c, j) => { if (c._path && c._ver === (ver.get(c._path) || 0)) current.set(c._path, `w${i}.${j}`); });
    if (m.role === 'tool' && m._read && m._ver === (ver.get(m._read) || 0)) current.set(m._read, `r${i}`);
  });
  messages.forEach((m, i) => {
    if (m.role === 'assistant' && m.tool_calls) {
      m.tool_calls.forEach((c, j) => {
        const name = c.function?.name;
        if (!['write_file', 'edit_file'].includes(name) || c._compact) return;
        if (name === 'write_file' && current.get(c._path) === `w${i}.${j}`) return; // aktueller Stand – bleibt sichtbar
        let a = {};
        try { a = JSON.parse(c.function.arguments || '{}'); } catch {}
        if (a.content) a.content = `(ältere Fassung, ${String(a.content).split('\n').length} Zeilen – inzwischen geändert)`;
        if (a.old_string) a.old_string = String(a.old_string).slice(0, 200);
        if (a.new_string) a.new_string = String(a.new_string).slice(0, 200);
        c.function.arguments = JSON.stringify(a);
        c._compact = true;
      });
    }
    if (m.role === 'tool' && m._read && !m._short && current.get(m._read) !== `r${i}`) {
      m.content = `(älteres Lese-Ergebnis von ${m._read} – der aktuelle Stand steht weiter unten bzw. wurde inzwischen geändert)`;
      m._short = true;
    }
  });
}
/* Token-Budget (Schutz, falls eine Anfrage zu groß wird – NVIDIA_CODE_TOKEN_BUDGET, Standard 60000 Tokens):
   wird eine Anfrage zu groß, wird hart gekürzt: Datei-Inhalte nur noch als Hinweis (das Modell liest bei Bedarf gezielt),
   nur das letzte Lese-Ergebnis bleibt, lange Werkzeug-Antworten und alte Texte werden gekürzt, notfalls fällt alter Verlauf weg. */
const estTokens = (messages) => Math.ceil(JSON.stringify(clean(messages)).length / 2.8) + Math.ceil(JSON.stringify(TOOLS).length / 2.8); // eher zu hoch geschätzt
function squeeze(messages, target) {
  const gone = new Set(); // Dateien, deren vollen Inhalt das Modell danach nicht mehr sieht (dürfen neu gelesen werden)
  if (estTokens(messages) <= target) return gone;
  const lastTool = messages.map((m) => m.role).lastIndexOf('tool');
  messages.forEach((m, i) => {
    if (m.role === 'assistant' && m.tool_calls) m.tool_calls.forEach((c) => {
      let a = {};
      try { a = JSON.parse(c.function.arguments || '{}'); } catch {}
      if (a.content && a.content.length > 200) { a.content = `(${String(a.content).split('\n').length} Zeilen – bei Bedarf mit read_file lesen)`; if (c._path) gone.add(c._path); }
      if (a.old_string) a.old_string = String(a.old_string).slice(0, 120);
      if (a.new_string) a.new_string = String(a.new_string).slice(0, 120);
      c.function.arguments = JSON.stringify(a);
      c._compact = true;
    });
    if (m.role === 'tool' && i !== lastTool && m.content.length > 400) { m.content = `${m.content.slice(0, 300)} … (gekürzt)`; m._short = true; if (m._read) gone.add(m._read); }
    if (m.role === 'assistant' && !m.tool_calls && m.content.length > 600 && i < messages.length - 2) m.content = `${m.content.slice(0, 500)} … (gekürzt)`;
  });
  // immer noch zu groß: ältester Verlauf (zwischen System und der aktuellen Aufgabe) fällt weg
  const firstTask = messages.findIndex((m, i) => i > 0 && m.role === 'user' && m._task);
  while (estTokens(messages) > target && firstTask > 1 && messages.length > 3 && messages[1] !== messages[firstTask]) messages.splice(1, 1);
  return gone;
}
const clean = (messages) => messages.map(({ _read, _short, _ver, _task, ...m }) => (m.tool_calls ? { ...m, tool_calls: m.tool_calls.map(({ _compact, _path, _ver: v, ...c }) => c) } : m));

/* längster Backtick-Lauf am Zeilenanfang → der Block braucht einen mehr (mindestens vier) */
const fenceFor = (content) => '`'.repeat(Math.max(4, ...[...String(content).matchAll(/^(`{3,})/gm)].map((m) => m[1].length + 1)));
const numbered = (s) => s.split('\n').map((l, i) => `${String(i + 1).padStart(4)}| ${l}`).join('\n');

/* Die Schleife. project: Map(pfad → inhalt) mit dem bisherigen Stand; emit(text) schickt Text an die App. */
async function run({ env, history, project, emit, signal, onThought, onStatus = () => {} }) {
  const files = new Map(project || []);
  const fence3 = '```';
  let out = '';
  const say = (text) => { out += text; emit(text); };
  const block = (kind, body) => say(`\n\n${fence3}${kind}\n${body}\n${fence3}\n\n`);
  let dirty = false; // geändert seit der letzten Prüfung
  let untested = false; // geändert seit dem letzten erfolgreichen Lauftest
  let autoChecks = 0;
  const ver = new Map(); // pfad → Fassung (steigt bei jedem Schreiben/Ändern)
  const seen = new Map(); // pfad → Fassung, deren vollen Inhalt das Modell gerade sichtbar hat
  const bump = (p) => { ver.set(p, (ver.get(p) || 0) + 1); return ver.get(p); };
  const canRun = () => env.APPTEST !== 'off' && [...files.keys()].some((f) => /\.html?$/i.test(f)) && !!AT.findBrowser(env);

  const exec = async (name, args = {}) => {
    const p = CC.cleanPath(args.path || '');
    if (name === 'list_files') {
      if (files.size) block('read', '*'); // neues, leeres Projekt: nichts anzusehen – keine Zeile im Chat
      return files.size ? [...files].map(([k, v]) => `${k} (${v.split('\n').length} Zeilen)`).join('\n') : '(noch keine Dateien – neues Projekt)';
    }
    if (name === 'read_file') {
      if (!files.has(p)) return `Fehler: ${p} gibt es nicht. Vorhanden: ${[...files.keys()].join(', ') || 'keine'}`;
      if (seen.get(p) === (ver.get(p) || 0)) return `${p} ist unverändert – der aktuelle Inhalt steht schon oben im Verlauf. Nicht erneut lesen, sondern weiterarbeiten (ändern, check_project, run_app).`;
      seen.set(p, ver.get(p) || 0);
      block('read', p);
      return numbered(files.get(p));
    }
    if (name === 'write_file') {
      const content = String(args.content ?? '');
      files.set(p, content);
      seen.set(p, bump(p)); // der geschriebene Inhalt steht im Verlauf
      dirty = true;
      untested = true;
      const f = fenceFor(content);
      say(`\n\n${f}file:${p}\n${content}\n${f}\n\n`);
      return `OK: ${p} geschrieben (${content.split('\n').length} Zeilen).`;
    }
    if (name === 'edit_file') {
      if (!files.has(p)) return `Fehler: ${p} gibt es nicht – neue Dateien mit write_file anlegen.`;
      const cur = files.get(p), old = String(args.old_string ?? ''), neu = String(args.new_string ?? '');
      const count = old ? cur.split(old).length - 1 : 0;
      if (count !== 1) return `Fehler: old_string kommt ${count}× in ${p} vor (muss genau 1× sein). Lies die Datei mit read_file und nimm mehr Kontext.`;
      const content = cur.replace(old, () => neu);
      files.set(p, content);
      bump(p); // neue Fassung – zum Weiterarbeiten neu lesen
      dirty = true;
      untested = true;
      const f = fenceFor(content);
      say(`\n\n${f}file:${p}\n${content}\n${f}\n\n`);
      return `OK: ${p} geändert.`;
    }
    if (name === 'check_project') {
      onStatus('Prüft den Code');
      const problems = CC.check(files);
      dirty = false;
      block('check', JSON.stringify({ round: 1, problems }));
      return problems.length ? `${problems.length} Fehler:\n${problems.map((x) => `- ${x.file}${x.line ? `:${x.line}` : ''} ${x.message}`).join('\n')}` : 'Keine Fehler gefunden.';
    }
    if (name === 'run_app') {
      if (!canRun()) return env.APPTEST === 'off' ? 'Lauftest ist ausgeschaltet.' : 'Kein Lauftest möglich (keine HTML-Datei oder kein Browser).';
      onStatus('Testet die App im Browser');
      const r = await AT.run(files, { env });
      if (r.ok) untested = false;
      block('run', JSON.stringify({ ok: r.ok, errors: r.errors, clicked: r.clicked, canvas: r.canvas }));
      const info = `Geklickt: ${r.clicked.length ? r.clicked.join(', ') : 'keine Knöpfe gefunden'}. Canvas: ${r.canvas === null ? 'keins' : r.canvas === true ? 'zeigt etwas' : r.canvas === false ? 'LEER (nichts gezeichnet)' : r.canvas}. Sichtbarer Text: ${r.text || '(keiner)'}`;
      return r.ok ? `Lauftest ohne Fehler. ${info}` : `${r.errors.length} Laufzeitfehler:\n${r.errors.map((x) => `- ${x.message}${x.file ? ` (${x.file}${x.line ? `:${x.line}` : ''})` : ''}`).join('\n')}\n${info}`;
    }
    if (name === 'update_plan') {
      const steps = (Array.isArray(args.steps) ? args.steps : []).slice(0, 12).map((s) => ({ text: String(s?.text || s || '').slice(0, 160), done: !!s?.done })).filter((s) => s.text);
      block('plan', JSON.stringify({ steps }));
      return 'OK: Aufgabenliste aktualisiert.';
    }
    return `Fehler: Werkzeug ${name} gibt es nicht.`;
  };

  // Bilder der letzten drei Nachrichten mit Bildern verstehen (Bildmodell), die neuesten zeigt der Chat als „Bild angesehen“
  const withImages = history.map((m, i) => (m.role !== 'assistant' && (m.images || []).some((x) => /^image\//.test(x.mime)) ? i : -1)).filter((i) => i >= 0).slice(-3);
  const seenText = new Map();
  for (const i of withImages) {
    const desc = await describeImages(env, history[i].images, signal);
    if (i === history.length - 1) history[i].images.filter((x) => /^image\//.test(x.mime)).slice(0, 4).forEach((x, n) => block('read', `bild:${x.name || `Bild ${n + 1}`}`));
    if (desc) seenText.set(i, `\n\n[Angehängte Bilder – Beschreibung des Bildmodells]\n${desc}`);
  }
  const userText = (i) => `${String(history[i].text || '')}${seenText.get(i) || ''}`;
  const messages = [
    { role: 'system', content: SYSTEM },
    ...history.slice(0, -1).map((m, i) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.role === 'assistant' ? String(m.text || '') : userText(i) })),
    { role: 'user', _task: true, content: `${userText(history.length - 1)}\n\n(Projekt: ${files.size ? `${files.size} Dateien vorhanden – erst list_files/read_file` : 'noch leer – neues Projekt'})` },
  ];

  let idle = 0; // Schritte am Stück ohne Fortschritt (nur lesen/auflisten)
  let retries413 = 0, retriesTool = 0; // Wiederholungen bei zu großer Anfrage bzw. kaputtem Werkzeug-Aufruf
  const provs = providers(env);
  let pi = 0; // aktueller Anbieter (OpenRouter → NVIDIA)
  let finished = false;
  for (let step = 0; step < MAX_STEPS; step++) {
    if (signal.aborted) break;
    if (step === MAX_STEPS - 5) messages.push({ role: 'user', content: 'Nur noch wenige Schritte: prüfe jetzt mit check_project und run_app, behebe letzte Fehler und schließe mit der Zusammenfassung ab.' });
    compact(messages, ver);
    const tpm = Number(env.NVIDIA_CODE_TOKEN_BUDGET) || 60000;
    squeeze(messages, Math.floor(tpm * 0.5)).forEach((x) => seen.delete(x)); // Platz lassen für die Antwort in derselben Minute
    let msg;
    try {
      const prov = provs[pi];
      onStatus(''); // solange das Modell nur denkt: keine Live-Zeile (das Thinking zeigt die Zeitleiste) – erst bei einer konkreten Aktion
      msg = await chatStep(env, prov, messages, signal, onThought, (n, e, ms) => {
        const t = e?.status === 429 ? `${prov.name}-Ratenlimit – ${Math.round((ms || 0) / 1000)} s Pause, dann geht es weiter` : `${prov.name} hatte einen Aussetzer – neuer Versuch (${n}/${RETRY_WAIT.length})`;
        onThought?.(`${t} …`); onStatus(t);
      }, onStatus);
    } catch (err) {
      if (signal.aborted) throw err;
      // Tageslimit / Ausfall / ungültiger Schlüssel beim aktuellen Anbieter → mit dem nächsten Anbieter genau hier weitermachen
      if (err.switchable && pi < provs.length - 1) {
        onThought?.(`${provs[pi].name}: ${err.daily ? 'Tageslimit erreicht' : 'nicht erreichbar'} – weiter über ${provs[pi + 1].name} …`);
        pi++; step--; continue;
      }
      // Anfrage zu groß (413) → noch härter kürzen und denselben Schritt erneut versuchen
      if (err.status === 413 && retries413 < 2) { retries413++; squeeze(messages, Math.floor(tpm * (retries413 === 1 ? 0.4 : 0.25))).forEach((x) => seen.delete(x)); onThought?.('Anfrage war zu groß – gekürzt, neuer Versuch …'); step--; continue; }
      // Modell hat einen kaputten Werkzeug-Aufruf erzeugt → Schritt mit Hinweis wiederholen
      if (err.code === 'tool_use_failed' && retriesTool < 2) {
        retriesTool++;
        messages.push({ role: 'user', content: 'Dein letzter Werkzeug-Aufruf war fehlerhaft formatiert und wurde nicht ausgeführt. Rufe das Werkzeug erneut mit gültigem JSON auf; große Dateien in mehrere kleinere aufteilen.' });
        step--; continue;
      }
      // auch nach den Wiederholungen keine Antwort: bisherige Arbeit bleibt erhalten (steht schon im Chat), klarer Hinweis
      say(`\n\n**Unterbrochen:** ${err.message}. Alles bisher Erledigte ist gespeichert – schreib einfach „weiter“, dann macht der Agent dort weiter.\n`);
      return out;
    }
    messages.push(msg);
    retries413 = 0; retriesTool = 0;
    // Zwischensätze (neben Werkzeug-Aufrufen) erscheinen nicht – im Chat stehen nur Aufgabenliste, Schritte und am Ende die Zusammenfassung
    if (!msg.tool_calls) {
      // Fertig gemeldet – aber noch ungeprüfte Änderungen? Dann prüft die App selbst und gibt das Ergebnis zurück (höchstens 3×).
      // Danach startet die App selbst einen Lauftest, falls der Agent das nach seinen letzten Änderungen nicht getan hat.
      if ((dirty || (untested && canRun())) && autoChecks < 3) {
        autoChecks++;
        let result = await exec('check_project');
        let failed = !/^Keine Fehler/.test(result);
        if (!failed && untested && canRun()) { result = await exec('run_app'); failed = !/^Lauftest ohne Fehler/.test(result); }
        if (failed) {
          messages.push({ role: 'user', content: `Automatische Prüfung nach deinen Änderungen:\n${result}\nBehebe die Ursachen, dann check_project und run_app erneut.` });
          continue;
        }
      }
      say(`\n\n${msg.content || 'Fertig.'}\n`);
      finished = true;
      break;
    }
    for (const call of msg.tool_calls) {
      const name = call.function?.name;
      let args = call.function?.arguments;
      if (typeof args === 'string') { try { args = JSON.parse(args); } catch { args = {}; } }
      let result;
      try { result = await exec(name, args || {}); } catch (err) { result = `Fehler: ${err.message}`; }
      const path = CC.cleanPath((args || {}).path || '');
      if (name === 'write_file') { call._path = path; call._ver = ver.get(path) || 0; }
      messages.push({ role: 'tool', tool_call_id: call.id, content: result, ...(name === 'read_file' && /^\s*1\|/.test(result) ? { _read: path, _ver: ver.get(path) || 0 } : {}) });
    }
    // nur gelesen/aufgelistet, mehrmals hintereinander → anstoßen, statt im Kreis zu lesen
    idle = msg.tool_calls.every((c) => ['read_file', 'list_files'].includes(c.function?.name)) ? idle + 1 : 0;
    if (idle >= 3) {
      idle = 0;
      messages.push({ role: 'user', content: 'Du hast alles Nötige gelesen. Lies nichts erneut – setze jetzt den nächsten Schritt deines Plans um (write_file/edit_file), danach check_project und run_app.' });
    }
  }
  onStatus('');
  // Schritte aufgebraucht ohne Abschluss: trotzdem prüfen und ehrlich sagen, wo es steht
  if (!finished && !signal.aborted) {
    const check = await exec('check_project');
    const runResult = /^Keine Fehler/.test(check) && untested && canRun() ? await exec('run_app') : '';
    const ok = /^Keine Fehler/.test(check) && (!runResult || /^Lauftest ohne Fehler/.test(runResult));
    say(`\n\n**Schrittlimit erreicht.** ${ok ? 'Der Stand ist geprüft und läuft ohne Fehler.' : 'Es sind noch Fehler offen (siehe oben).'} Schreib „weiter“, dann macht der Agent dort weiter.\n`);
  }
  return out;
}

module.exports = { available, run, MODEL, SYSTEM, TOOLS, keyOf };
