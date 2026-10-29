/* ===================================================================
   Aufgaben für die Agenten (Tab „Aufgaben“ → „Neue Aufgabe“ mit Agent)
   - Die App schickt die Aufgabe an POST /api/agent-tasks/run. Der Server arbeitet sie KOMPLETT ab – auch wenn die App
     inzwischen geschlossen ist (die Anfrage hängt nicht am Browser: kein Abbruch beim Schließen; Vercel: bis 300 s).
   - Ergebnis: ein neuer Chat (im Chatverlauf) oder ein neues Dokument – direkt im Konto gespeichert.
   - Zustand je Aufgabe im Konto (u:<id>:agentaufgaben): queued → running → done | failed. Die App holt ihn über
     GET /api/agent-tasks und setzt Status/Fortschritt der Karte (Offen → In Arbeit → Prüfen).
   =================================================================== */
const W = require('./workflow');
const ACC = require('./accounts');

const KEY = (uid) => `u:${uid}:agentaufgaben`;
const AGENTS = { general: 'Allgemein', learn: 'Lernen', research: 'Research', boerse: 'Börse' };
const STALE_MS = 7 * 60000; // länger als die längste Laufzeit → hängengeblieben
const parse = (s, d = null) => { try { return s == null ? d : JSON.parse(s); } catch { return d; } };
// Quellen wie im Chat gespeichert: Stelle = Nummer − 1 (Belege [1], [2] …)
const byNumber = (list) => { const a = []; list.forEach((x, i) => { a[(x.n || i + 1) - 1] = x; }); return Array.from(a, (x) => x || null); };
const newId = (p) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

async function list(store, uid, now = Date.now()) {
  const all = await store.hgetall(KEY(uid));
  const out = {};
  for (const [id, s] of Object.entries(all || {})) {
    const st = parse(s);
    if (!st) continue;
    if ((st.state === 'running' || st.state === 'queued') && now - (st.updated || 0) > STALE_MS) {
      Object.assign(st, { state: 'failed', error: 'Abgebrochen – bitte nochmal starten.', updated: now });
      await store.hset(KEY(uid), { [id]: JSON.stringify(st) });
    }
    out[id] = st;
  }
  return out;
}
async function setState(store, uid, id, patch, now = Date.now()) {
  const cur = parse(await store.hget(KEY(uid), id), {});
  const next = { ...cur, ...patch, updated: now };
  await store.hset(KEY(uid), { [id]: JSON.stringify(next) });
  return next;
}
async function remove(store, uid, ids) { if (ids.length) await store.hdel(KEY(uid), ids); }

/* ---------- Markdown → einfaches HTML fürs Dokument (gleiche Auszeichnung, die der Dokument-Editor kennt) ---------- */
const escHtml = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function inline(s) {
  return escHtml(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\[(\d{1,2})\]/g, '<sup>[$1]</sup>');
}
function mdToHtml(md) {
  const lines = String(md || '').replace(/\r/g, '').split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (/^```/.test(l)) { // Code-Block (Visualisierungen wie ```chart bleiben als Code stehen)
      const buf = []; i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++; out.push(`<pre><code>${escHtml(buf.join('\n'))}</code></pre>`); continue;
    }
    const h = l.match(/^(#{1,6})\s+(.*)$/);
    if (h) { const n = Math.min(4, h[1].length); out.push(`<h${n}>${inline(h[2])}</h${n}>`); i++; continue; }
    if (/^\s*([-*_])\s*\1\s*\1[\s\1]*$/.test(l)) { out.push('<hr>'); i++; continue; }
    if (/^\s*\|.*\|\s*$/.test(l) && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1] || '')) { // Tabelle
      const row = (r) => r.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const head = row(l); i += 2;
      const body = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) body.push(row(lines[i++]));
      out.push(`<table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
      continue;
    }
    if (/^\s*([-*+]|\d+[.)])\s+/.test(l)) {
      const ordered = /^\s*\d/.test(l), items = [];
      while (i < lines.length && /^\s*([-*+]|\d+[.)])\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*([-*+]|\d+[.)])\s+/, ''));
      out.push(`<${ordered ? 'ol' : 'ul'}>${items.map((x) => `<li>${inline(x)}</li>`).join('')}</${ordered ? 'ol' : 'ul'}>`);
      continue;
    }
    if (/^>\s?/.test(l)) {
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ''));
      out.push(`<blockquote>${inline(buf.join(' '))}</blockquote>`); continue;
    }
    if (!l.trim()) { i++; continue; }
    const buf = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|```|>|\s*([-*+]|\d+[.)])\s+|\s*\|)/.test(lines[i])) buf.push(lines[i++]);
    if (!buf.length) buf.push(lines[i++]);
    out.push(`<p>${inline(buf.join(' '))}</p>`);
  }
  return out.join('');
}

/* ---------- Auftrag an den Agenten ---------- */
function promptOf(task) {
  const doc = task.output === 'doc';
  return [
    `AUFGABE: ${task.title}`,
    task.notes ? `DETAILS: ${task.notes}` : '',
    '',
    'Du bearbeitest diese Aufgabe selbstständig im Hintergrund – niemand kann Rückfragen beantworten. Stelle KEINE Rückfragen,',
    'triff sinnvolle Annahmen (nenne sie kurz) und liefere ein vollständiges, gründliches Ergebnis.',
    doc ? 'Das Ergebnis wird ein eigenes Dokument: schreibe es als fertigen Text mit Überschriften, Absätzen und Listen – ohne Einleitung wie „Hier ist …“ und ohne Schlussfragen.' : '',
  ].filter((x) => x !== '').join('\n');
}

/* Aufgabe abarbeiten. prepareBody(body) ergänzt, was der Agent braucht (z. B. Börse: gespeicherter Radar, „Meine Käufe“). */
async function run({ store, uid, task, env, prepareBody = (b) => b, runChat = W.runChat, now = () => Date.now() }) {
  const id = String(task.id || '');
  if (!/^t[a-z0-9]{4,30}$/.test(id) || !String(task.title || '').trim()) throw Object.assign(new Error('Aufgabe ungültig'), { status: 400 });
  const agent = AGENTS[task.agent] ? task.agent : 'general';
  const output = task.output === 'doc' ? 'doc' : 'chat';
  const cur = parse(await store.hget(KEY(uid), id));
  if (cur?.state === 'running' && now() - (cur.updated || 0) < STALE_MS) return cur; // läuft schon (z. B. zweites Gerät)
  await setState(store, uid, id, { state: 'running', agent, output, started: now(), error: '', chatId: '', docId: '' }, now());

  const prompt = promptOf({ ...task, output });
  let text = '', sources = [], error = '';
  const send = (event, data) => {
    if (event === 'text') text += data.text || '';
    else if (event === 'reset') text = '';
    else if (event === 'research' && (data.status === 'done' || data.status === 'failed') && Array.isArray(data.sources)) sources = data.sources;
    else if (event === 'error') error = data.message || data.error || 'Fehler';
  };
  const body = prepareBody({ messages: [{ role: 'user', text: prompt }], agent, effort: 'high', log: false, background: true });
  try {
    await runChat({ env, body, send, signal: new AbortController().signal });
  } catch (err) { error = err.message || 'Fehler'; }
  text = text.replace(/```ask[\s\S]*?(```|$)/g, '').trim();
  if (!text) return setState(store, uid, id, { state: 'failed', error: error || 'Der Agent hat keine Antwort geliefert.' }, now());

  const at = now();
  const title = String(task.title).trim().slice(0, 120);
  if (output === 'doc') {
    const used = sources.filter(Boolean);
    const refs = used.length ? `<h2>Quellen</h2><ol>${used.map((s) => `<li><a href="${escHtml(s.url)}">${escHtml(s.title || s.domain)}</a>${s.domain ? ` – ${escHtml(s.domain)}` : ''}</li>`).join('')}</ol>` : '';
    const doc = { id: newId('d'), title, subtitle: `Erstellt vom Agenten ${AGENTS[agent]} (Aufgabe)`, projectId: '', tags: [], content: mdToHtml(text) + refs, created: at, updated: at };
    await ACC.storeDocs(store, uid, { docs: [doc] });
    return setState(store, uid, id, { state: 'done', docId: doc.id, title, finished: at }, at);
  }
  const meta = parse(await store.get(`u:${uid}:chats:meta`), {});
  const chat = {
    id: newId('c'), title, auto: false, pinned: false, updated: at, closed: true, agent,
    history: [{ role: 'user', text: [task.title, task.notes].filter(Boolean).join('\n\n') }, { role: 'assistant', text, ...(sources.length ? { sources: byNumber(sources) } : {}) }],
  };
  await ACC.storeChats(store, uid, { chats: [chat], active: meta.active || null, order: [chat.id, ...(meta.order || [])] });
  return setState(store, uid, id, { state: 'done', chatId: chat.id, title, finished: at }, at);
}

module.exports = { run, list, setState, remove, mdToHtml, promptOf, AGENTS, KEY };
