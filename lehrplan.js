/* ===================================================================
   Lehrplan (Lern-Agent): Kerncurricula Niedersachsen, Gymnasium – Sek I (5–10) bzw. gymnasiale Oberstufe (11–13).
   Einstellungen → Agenten → „Lehrplan“: Stufe und Fächer wählen → der Server sucht das offizielle PDF (CuVo/NiBiS) und reicht es durch,
   der Browser liest es (pdf.js) und teilt es in Abschnitte (IndexedDB „lehrplan“). Geht das nicht, lädt man das PDF selbst hoch.
   Bei jeder Frage an den Lern-Agenten sucht `payload()` die passenden Abschnitte (Wortabgleich, BM25) – passt nichts, geht nichts mit.
   Der Server baut sie als Rahmen ein (was verlangt ist, wie tief, Operatoren); erklärt wird weiter mit Fachquellen.
   =================================================================== */
(() => {
  const KEY = 'lehrplan.v1', DB = 'lehrplan', STORE = 'kc';
  const FAECHER = ['Deutsch', 'Mathematik', 'Englisch', 'Biologie', 'Chemie', 'Physik', 'Geschichte', 'Politik-Wirtschaft', 'Erdkunde', 'Informatik',
    'Latein', 'Französisch', 'Spanisch', 'Werte und Normen', 'Evangelische Religion', 'Katholische Religion', 'Philosophie', 'Kunst', 'Musik', 'Sport'];
  const STUFEN = { 1: 'Klasse 5–10', 2: 'Klasse 11–13' };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fi = (n, s = 12) => (window.FadeIcons ? FadeIcons.svg(n, s) : '');
  let cfg = (() => { try { return { stufe: 2, faecher: [], ...JSON.parse(localStorage.getItem(KEY)) }; } catch { return { stufe: 2, faecher: [] }; } })();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch {} };
  const redraw = () => window.Settings?.redraw?.();
  const docs = new Map(); // `${stufe}:${fach}` → { fach, stufe, title, url, pages, chunks: [{ p, t, tf, len }] }
  const status = new Map(); // key → { state: 'load' | 'ok' | 'fail', note }
  const keyOf = (fach, stufe = cfg.stufe) => `${stufe}:${fach}`;

  /* ---------- Speicher (IndexedDB) ---------- */
  const idb = () => new Promise((ok, bad) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(STORE); r.onsuccess = () => ok(r.result); r.onerror = () => bad(r.error); });
  async function dbDo(mode, fn) { const db = await idb(); return new Promise((ok, bad) => { const tx = db.transaction(STORE, mode); const req = fn(tx.objectStore(STORE)); tx.oncomplete = () => ok(req?.result); tx.onerror = () => bad(tx.error); }); }
  const dbPut = (k, v) => dbDo('readwrite', (s) => s.put(v, k)).catch(() => null);
  const dbDel = (k) => dbDo('readwrite', (s) => s.delete(k)).catch(() => null);
  const dbAll = () => dbDo('readonly', (s) => s.getAll()).catch(() => []);

  /* ---------- Text → Wörter (für den Abgleich) ---------- */
  const STOP = new Set('aber alle allem allen aller alles also auch auf aus bei beim bin bis bitte dann darum dass dein deine dem den denen der deren des dessen die dies diese diesem diesen dieser dieses doch dort durch eine einem einen einer eines einfach erkläre erklär erklären erkläre etwas euch fuer für gibt habe haben hast hat hier ihm ihn ihr ihre im immer ins ist jede jedem jeden jeder jetzt kann kannst kein keine können man mehr mein meine mich mir mit muss nach nicht noch nur oder ohne schon sehr sein seine sich sie sind so soll sollen sowie über um und uns unter vom von vor war was weil welche welcher wenn wer werden wie wieder wir wird wo zu zum zur zwischen schüler schülerinnen innen sowie bzw usw beispiel beispielsweise thema themen bitte mal kurz ausführlich frage fragen aufgabe aufgaben klasse klausur'.split(' '));
  const norm = (w) => w.toLowerCase().replace(/ß/g, 'ss');
  const stem = (w) => (w.length > 6 ? w.replace(/(ungen|ung|en|er|es|e|n|s)$/, '') : w);
  const words = (t) => (String(t).match(/[\p{L}]{4,}/gu) || []).map(norm).filter((w) => !STOP.has(w)).map(stem);

  function index(doc) {
    const df = new Map();
    doc.chunks.forEach((c) => { const tf = new Map(); const ws = words(c.t); ws.forEach((w) => tf.set(w, (tf.get(w) || 0) + 1)); c.tf = tf; c.len = ws.length || 1; tf.forEach((_, w) => df.set(w, (df.get(w) || 0) + 1)); });
    doc.df = df; doc.avg = doc.chunks.reduce((n, c) => n + c.len, 0) / Math.max(1, doc.chunks.length);
    return doc;
  }

  /* ---------- PDF lesen und in Abschnitte teilen ---------- */
  const isHead = (l) => l.length < 95 && !/[.,;:]$/.test(l) && (/^\d+(\.\d+)*\s+\S/.test(l) || /^[A-ZÄÖÜ][^a-z]{6,}$/.test(l) || /^(Kompetenz|Inhalt|Basiskonzept|Themenfeld|Rahmenthema|Modul|Kurshalbjahr|Operator)/i.test(l));
  async function readPdf(buf) {
    const pdf = await (await loadPdfJs()).getDocument({ data: buf }).promise;
    const pages = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const c = await (await pdf.getPage(p)).getTextContent();
      pages.push(c.items.map((i) => i.str + (i.hasEOL ? '\n' : ' ')).join('').replace(/[ \t]+/g, ' '));
    }
    return pages;
  }
  function chunk(pages) {
    const out = [];
    let cur = '', page = 1;
    const push = () => { const t = cur.replace(/\n{2,}/g, '\n').trim(); if (t.length > 80) out.push({ p: page, t }); cur = ''; };
    pages.forEach((txt, i) => {
      txt.split('\n').map((l) => l.trim()).filter(Boolean).forEach((l) => {
        if (/^\d{1,3}$/.test(l)) return; // Seitenzahl
        if ((isHead(l) && cur.length > 350) || cur.length > 1300) push();
        if (!cur) page = i + 1;
        cur += `${l}\n`;
      });
    });
    push();
    return out;
  }
  const FACH_WORT = (fach) => norm(fach.split(/[\s-]+/)[0]).replace(/evangelische|katholische/, 'religion');
  function validFor(pages, fach, stufe) {
    const head = norm(pages.slice(0, 4).join(' '));
    if (!/kerncurricul/.test(head)) return false;
    if (!head.includes(FACH_WORT(fach))) return false;
    return stufe === 2 ? /oberstufe|sekundarbereich ii|qualifikationsphase|einführungsphase/.test(head) : /schuljahrg(ä|ae|a)nge\s*5|sekundarbereich i\b|5\s*[-–]\s*10/.test(head);
  }
  async function storeDoc(fach, stufe, title, url, pages) {
    const doc = { key: keyOf(fach, stufe), fach, stufe, title, url, pages: pages.length, at: Date.now(), chunks: chunk(pages) };
    await dbPut(doc.key, { ...doc });
    docs.set(doc.key, index(doc));
    status.set(doc.key, { state: 'ok' });
  }

  /* ---------- Laden: offizielles PDF suchen → durchreichen → lesen ---------- */
  async function load(fach, stufe = cfg.stufe) {
    const k = keyOf(fach, stufe);
    if (status.get(k)?.state === 'load') return;
    status.set(k, { state: 'load', note: 'Wird gesucht …' }); redraw();
    try {
      const f = await (await fetch('/api/lehrplan/find', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fach, stufe }) })).json();
      for (const c of f.candidates || []) {
        status.set(k, { state: 'load', note: 'Wird gelesen …' }); redraw();
        const r = await fetch('/api/lehrplan/pdf', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: c.url }) });
        if (!r.ok || !/pdf/.test(r.headers.get('content-type') || '')) continue;
        const buf = new Uint8Array(await r.arrayBuffer());
        const pages = await readPdf(buf).catch(() => null);
        if (!pages || !validFor(pages, fach, stufe)) continue;
        await storeDoc(fach, stufe, `Kerncurriculum ${fach} – ${stufe === 2 ? 'gymnasiale Oberstufe' : 'Gymnasium, Schuljahrgänge 5–10'} (Niedersachsen)`, decodeURI(r.headers.get('x-lehrplan-url') || c.url), pages);
        redraw(); return;
      }
      status.set(k, { state: 'fail', note: 'Nicht automatisch gefunden – PDF selbst hochladen' });
    } catch { status.set(k, { state: 'fail', note: 'Gerade nicht erreichbar – später erneut oder PDF hochladen' }); }
    redraw();
  }
  async function upload(fach, file) {
    const k = keyOf(fach);
    status.set(k, { state: 'load', note: 'Wird gelesen …' }); redraw();
    try {
      const pages = await readPdf(new Uint8Array(await file.arrayBuffer()));
      if (!pages.join('').trim()) throw new Error('leer');
      await storeDoc(fach, cfg.stufe, `Kerncurriculum ${fach} – ${cfg.stufe === 2 ? 'gymnasiale Oberstufe' : 'Gymnasium, Schuljahrgänge 5–10'} (Niedersachsen)`, '', pages);
    } catch { status.set(k, { state: 'fail', note: 'Dieses PDF konnte nicht gelesen werden' }); }
    redraw();
  }
  // gespeicherte Lehrpläne beim Start in den Speicher holen
  dbAll().then((all) => (all || []).forEach((d) => { if (d?.key && d.chunks) { docs.set(d.key, index(d)); status.set(d.key, { state: 'ok' }); } })).then(() => redraw());

  /* ---------- Abgleich: passende Abschnitte zur Frage (BM25) ---------- */
  const OPS = ['nennen', 'angeben', 'beschreiben', 'darstellen', 'erklären', 'erläutern', 'analysieren', 'untersuchen', 'auswerten', 'deuten', 'interpretieren', 'vergleichen', 'begründen', 'beurteilen', 'bewerten', 'erörtern', 'diskutieren', 'stellung nehmen', 'zusammenfassen', 'charakterisieren', 'einordnen', 'herleiten', 'ableiten', 'berechnen', 'skizzieren', 'überprüfen', 'gestalten', 'entwickeln'];
  const opStem = (o) => o.replace(/en$/, '');
  function payload(question) {
    const active = [...docs.values()].filter((d) => d.stufe === cfg.stufe && cfg.faecher.includes(d.fach));
    if (!active.length) return null;
    const q = [...new Set(words(question))];
    if (!q.length) return null;
    const N = active.reduce((n, d) => n + d.chunks.length, 0);
    const dfAll = new Map(); active.forEach((d) => d.df.forEach((v, w) => dfAll.set(w, (dfAll.get(w) || 0) + v)));
    const idf = (w) => Math.log(1 + (N - (dfAll.get(w) || 0) + 0.5) / ((dfAll.get(w) || 0) + 0.5));
    const scored = [];
    active.forEach((d) => d.chunks.forEach((c) => {
      let s = 0, hits = 0;
      q.forEach((w) => { const f = c.tf.get(w) || 0; if (!f) return; hits++; s += idf(w) * (f * 2.2) / (f + 1.2 * (0.25 + 0.75 * c.len / d.avg)); });
      if (hits) scored.push({ d, c, s, hits });
    }));
    scored.sort((a, b) => b.s - a.s);
    const best = scored[0];
    if (!best || best.s < 3.2 || (best.hits < 2 && idf([...best.c.tf.keys()].find((w) => q.includes(w)) || '') < 2.2)) return null; // nichts wirklich Passendes → nichts mitschicken
    const doc = best.d;
    const pick = scored.filter((x) => x.d === doc && x.s >= best.s * 0.55).slice(0, 3);
    // Operator der Frage („Erläutere …“) → Definition aus dem Anhang des Kerncurriculums dazu
    const lq = norm(question);
    const op = OPS.find((o) => lq.includes(opStem(o)));
    if (op) { const oc = doc.chunks.find((c) => new RegExp(`(^|\\n)\\s*${op}\\b`, 'i').test(c.t) && /operator/i.test(c.t + (doc.chunks[doc.chunks.indexOf(c) - 1]?.t || ''))); if (oc && !pick.some((x) => x.c === oc)) pick.push({ c: oc }); }
    let used = 0;
    const auszuege = pick.map((x) => x.c).sort((a, b) => a.p - b.p).map((c) => ({ seite: c.p, text: c.t })).filter((a) => (used += a.text.length) <= 5200);
    return { land: 'Niedersachsen', schulform: 'Gymnasium', stufe: STUFEN[doc.stufe], fach: doc.fach, title: doc.title, url: doc.url || '', auszuege };
  }

  /* ---------- Einstellungen → Agenten → Lehrplan ---------- */
  function html() {
    const chips = FAECHER.map((f) => `<button type="button" class="lp-chip${cfg.faecher.includes(f) ? ' on' : ''}" data-lp-fach="${esc(f)}">${esc(f)}</button>`).join('');
    const rows = cfg.faecher.map((f) => {
      const k = keyOf(f), st = status.get(k) || (docs.has(k) ? { state: 'ok' } : { state: 'none' }), d = docs.get(k);
      const info = st.state === 'ok' && d ? `<span class="lp-ok">${fi('check', 11)}${d.pages} Seiten gelesen</span>` : st.state === 'load' ? `<span class="shimmer">${esc(st.note || 'Lädt …')}</span>` : st.state === 'fail' ? `<span class="lp-fail">${esc(st.note)}</span>` : '<span class="st-muted">Noch nicht geladen</span>';
      return `<div class="st-row lp-row"><span class="st-name">${esc(f)}</span><span class="lp-info">${info}</span><span class="grow"></span>
        ${st.state === 'load' ? '' : `<button type="button" class="ags-ib" data-lp-reload="${esc(f)}" title="Neu suchen" aria-label="Neu suchen">${fi('refresh', 12)}</button>`}
        <label class="ags-ib" title="PDF selbst hochladen" aria-label="PDF selbst hochladen">${fi('upload', 12)}<input type="file" accept="application/pdf,.pdf" data-lp-file="${esc(f)}" hidden></label>
        ${d?.url ? `<a class="ags-ib" href="${esc(d.url)}" target="_blank" rel="noopener" title="Original öffnen" aria-label="Original öffnen">${fi('file', 12)}</a>` : ''}</div>`;
    }).join('');
    return `<h2>Lehrplan (Lern-Agent)</h2><div class="st-card lp">
      <div class="st-row"><span class="st-name">Bundesland</span><span class="grow"></span><span class="st-muted">Niedersachsen · Gymnasium</span></div>
      <div class="st-row"><span class="st-name">Stufe</span><span class="grow"></span><span class="st-seg" role="radiogroup">${[1, 2].map((n) => `<button type="button" role="radio" aria-checked="${cfg.stufe === n}" class="${cfg.stufe === n ? 'on' : ''}" data-lp-stufe="${n}">${STUFEN[n]}</button>`).join('')}</span></div>
      <div class="st-row lp-fach-row"><span class="st-name">Fächer</span><div class="lp-chips">${chips}</div></div>
      ${rows}
      <div class="st-row lp-note"><span class="st-muted">Der Lern-Agent nutzt das Kerncurriculum als Rahmen: was in deiner Stufe verlangt ist, wie tief und was die Operatoren bedeuten. Erklärt wird weiter mit Fachquellen; steht zu einer Frage nichts im Lehrplan, bleibt er außen vor.</span></div></div>`;
  }
  function click(e) {
    const ch = e.target.closest('[data-lp-fach]');
    if (ch) {
      const f = ch.dataset.lpFach, on = cfg.faecher.includes(f);
      cfg.faecher = on ? cfg.faecher.filter((x) => x !== f) : [...cfg.faecher, f]; save(); redraw();
      if (!on && !docs.has(keyOf(f))) load(f);
      return true;
    }
    const s = e.target.closest('[data-lp-stufe]');
    if (s) { cfg.stufe = Number(s.dataset.lpStufe); save(); redraw(); cfg.faecher.filter((f) => !docs.has(keyOf(f))).forEach((f) => load(f)); return true; }
    const r = e.target.closest('[data-lp-reload]');
    if (r) { const k = keyOf(r.dataset.lpReload); docs.delete(k); dbDel(k); load(r.dataset.lpReload); return true; }
    return false;
  }
  function change(e) {
    const inp = e.target.closest?.('[data-lp-file]');
    if (!inp || !inp.files?.[0]) return false;
    upload(inp.dataset.lpFile, inp.files[0]); inp.value = '';
    return true;
  }
  (window.SettingsHooks ||= []).push({ page: 'agents', order: 2, html, click, change });
  window.Lehrplan = { payload, load, docs, get cfg() { return cfg; } };
})();
