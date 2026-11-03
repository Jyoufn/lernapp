/* =====================================================================
   Eigene Agenten
   - Agenten-Feld → letzte Karte „Neuer Agent“ (oder „erstell mir einen Agenten …“ im normalen Chat) → großes Fenster: normaler Chat
     (Allgemein-Hund, Denken, Rückfragen im Eingabefeld), der NUR die Einrichtung macht (Server: body.setup = 'agent' → AGENT_SETUP).
   - Sofort beim Öffnen: Grundlagen-Fragen (Name, Aussehen, Aufgabe) im Eingabefeld – danach fragt die KI in Phasen weiter
     (Aufgabe im Detail, Darstellung mit Mini-App-Vorschau, Stil und Grenzen, Zusammenfassung) und schreibt erst dann das Profil.
   - ```avatar: Vorschau des Aussehens mit Animation – Vorlage-Figur (umgefärbt, auch eigene Hex-Farbe) oder EIGENES Bild:
     /api/agent-avatar malt ein Pixel-Brustbild, die App rastert es hier auf 32/24/20 (Umriss, wenige Farben) → „Übernehmen“.
   - ```agentprofil (Kopfzeilen + „---“ + lange Anweisung) → Karte → „Agent erstellen“ → gespeichert in 'agents.custom.v1' (geht ins Konto).
   - Anfragen mit eigenem Agenten: agent = Grundlage, custom = { name, prompt, mode, tools, vorlage } (Server hängt alles an).
   ===================================================================== */
const AgentBuilder = (() => {
  const KEY = 'agents.custom.v1', CACHE_KEY = 'agents.avatarcache.v1';
  const MODES = { allgemein: 'general', lernen: 'learn', research: 'research', coden: 'code' };
  const MODE_NAMES = { general: 'Allgemein', learn: 'Lernen', research: 'Research', code: 'Coden' };
  const FIG_NAMES = { havaneser: 'Havaneser', collie: 'Border Collie', golden: 'Golden Retriever', oktopus: 'Oktopus', baer: 'Bär', eigenes: 'Eigenes Bild' };
  const FUR_NAMES = { original: 'Original', creme: 'Creme', weiss: 'Weiß', grau: 'Grau', schwarz: 'Schwarz', braun: 'Braun', gold: 'Gold', rot: 'Rot', orange: 'Orange', rosa: 'Rosa', blau: 'Blau', tuerkis: 'Türkis', gruen: 'Grün' };
  const ACT_NAMES = { kochen: 'Kocht', lupe: 'Sucht mit Lupe', buch: 'Liest', tablet: 'Schaut aufs Tablet', laptop: 'Tippt am Laptop', keine: 'Keine Animation' };
  const TOOL_NAMES = { miniapps: 'Mini-Apps', lernsets: 'Lernsets', diagramme: 'Diagramme', mindmaps: 'Mindmaps', bilder: 'Bilder', quellen: 'Quellen' };
  const CREATE_ASK = /\b(erstell|bau|mach|leg|richt|kreier|design|programmier)\w*\b[^.?!\n]{0,40}\b(eigenen|neuen|einen|meinen)\s+(ki-?)?agent(en)?\b|\b(eigenen|neuen)\s+(ki-?)?agent(en)?\s+(erstellen|bauen|anlegen|einrichten|machen|designen)\b/i;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fi = (n, s = 14) => (window.FadeIcons ? FadeIcons.svg(n, s) : '');
  const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };
  const list = () => { const l = read(KEY, []); return Array.isArray(l) ? l : []; };
  const store = (l) => { write(KEY, l.slice(0, 24)); window.PixelDogs?.reloadCustom?.(l); window.Settings?.redraw?.(); };
  const byId = (id) => list().find((a) => a.id === id);
  const hash = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
  const app = document.getElementById('app');
  const panel = document.querySelector('.panel');
  const tabNow = () => (typeof activeTab === 'function' ? activeTab() : null);
  const chatData = (tab) => (tab && typeof chatOf === 'function' ? chatOf(tab) : null);
  const isSetup = (tab) => !!tab && !tab.dataset.view && chatData(tab)?.setup === 'agent';
  const saveChat = () => { try { if (typeof saveChats === 'function') saveChats(); } catch {} };

  /* ---------- Blöcke lesen: Kopfzeilen „schlüssel: wert“, bei agentprofil danach „---“ und die lange Anweisung (JSON geht auch) ---------- */
  function heads(raw) {
    const text = String(raw || '').replace(/\r/g, '');
    if (/^\s*\{/.test(text)) { try { const o = JSON.parse(text.replace(/[„“]/g, '"')); return { h: o, body: String(o.prompt || '') }; } catch {} }
    const cut = text.search(/^\s*-{3,}\s*$/m);
    const top = cut >= 0 ? text.slice(0, cut) : text, body = cut >= 0 ? text.slice(cut).replace(/^\s*-{3,}\s*\n?/, '') : '';
    const h = {};
    top.split('\n').forEach((l) => { const m = l.match(/^\s*([a-zäöüß_]+)\s*:\s*(.*?)\s*$/i); if (m) h[m[1].toLowerCase().replace('ü', 'ue')] = m[2]; });
    return { h, body };
  }
  const normFig = (f) => { const k = String(f || '').toLowerCase().replace(/ä/g, 'ae'); return FIG_NAMES[k] ? k : /eigen/.test(k) ? 'eigenes' : 'havaneser'; };
  const normFur = (f) => { const k = String(f || '').toLowerCase().trim().replace(/ü/g, 'ue').replace(/ß/g, 'ss'); return FUR_NAMES[k] ? k : /^#[0-9a-f]{6}$/.test(k) ? k : 'original'; };
  const normAct = (a) => { const k = String(a || '').toLowerCase().trim(); return ACT_NAMES[k] ? k : ''; };
  function parseAvatar(raw) {
    const { h } = heads(raw);
    const figur = normFig(h.figur);
    return { figur, farbe: figur === 'eigenes' ? '' : normFur(h.farbe), aktion: normAct(h.aktion), beschreibung: String(h.beschreibung || '').slice(0, 300) };
  }
  function parseProfile(raw) {
    const { h, body } = heads(raw);
    const name = String(h.name || '').replace(/\s+/g, ' ').trim().slice(0, 24);
    const prompt = String(body || h.prompt || '').trim().slice(0, 20000);
    if (!name || prompt.length < 40) return null;
    const verhalten = MODES[String(h.verhalten || '').toLowerCase()] ? String(h.verhalten).toLowerCase() : 'allgemein';
    const tools = String(Array.isArray(h.werkzeuge) ? h.werkzeuge.join(',') : h.werkzeuge || '').toLowerCase().split(/[\s,;]+/).filter((t) => TOOL_NAMES[t]);
    return { name, prompt, figur: normFig(h.figur), farbe: normFur(h.farbe), aktion: normAct(h.aktion), beschreibungBild: String(h.beschreibung_bild || '').slice(0, 300),
      beschreibung: String(h.beschreibung || '').trim().slice(0, 160), begruessung: String(h.begruessung || '').trim().slice(0, 90),
      verhalten, tools, vorlage: /^(ja|yes|true)$/i.test(String(h.vorlage || '').trim()) };
  }

  /* ---------- Eigenes Bild: Pixel-Brustbild aus dem gemalten Bild rastern (32/24/20 je für sich, wie die festen Agenten) ---------- */
  const loadImg = (src) => new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = src; });
  async function pixelate(src) {
    const img = await loadImg(src), S = 256;
    const cv = document.createElement('canvas'); cv.width = cv.height = S;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    const m = Math.min(img.width, img.height); cx.drawImage(img, (img.width - m) / 2, (img.height - m) / 2, m, m, 0, 0, S, S); // mittleres Quadrat (FLUX malt quer)
    const d = cx.getImageData(0, 0, S, S).data;
    const px = (i) => [d[i * 4], d[i * 4 + 1], d[i * 4 + 2]];
    // Hintergrund = Farbe am Rand (Median), dann von außen füllen; nah an der Hintergrundfarbe zählt auch innen als Hintergrund
    const border = [];
    for (let k = 0; k < S; k++) border.push(px(k), px((S - 1) * S + k), px(k * S), px(k * S + S - 1));
    const med = [0, 1, 2].map((c) => border.map((p) => p[c]).sort((a, b) => a - b)[border.length >> 1]);
    const dist = (p) => Math.hypot(p[0] - med[0], p[1] - med[1], p[2] - med[2]);
    const bg = new Uint8Array(S * S), q = [];
    for (let k = 0; k < S; k++) [k, (S - 1) * S + k, k * S, k * S + S - 1].forEach((i) => { if (!bg[i] && dist(px(i)) < 90) { bg[i] = 1; q.push(i); } });
    while (q.length) { const i = q.pop(), x = i % S, y = (i / S) | 0; [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([a, b]) => { const nx = x + a, ny = y + b; if (nx < 0 || ny < 0 || nx >= S || ny >= S) return; const j = ny * S + nx; if (!bg[j] && dist(px(j)) < 90) { bg[j] = 1; q.push(j); } }); }
    for (let i = 0; i < S * S; i++) if (!bg[i] && dist(px(i)) < 45) bg[i] = 1;
    let x0 = S, y0 = S, x1 = -1, y1 = -1;
    for (let i = 0; i < S * S; i++) if (!bg[i]) { const x = i % S, y = (i / S) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0 || (x1 - x0) * (y1 - y0) < S * S * 0.04) throw new Error('Im Bild war keine Figur zu erkennen.');
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    const out = {};
    for (const N of [32, 24, 20]) {
      // wie die festen Agenten: der Kopf füllt die Breite, oben 1 px Luft, was unten übersteht (Hals/Körper) wird abgeschnitten
      const scale = (N - 2) / bw, ox = 1, oy = bh * scale <= N - 1 ? N - bh * scale : 1;
      const grid = [];
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const sx0 = x0 + (x - ox) / scale, sy0 = y0 + (y - oy) / scale, step = 1 / scale;
        let n = 0, fg = 0; const sum = [0, 0, 0];
        for (let sy = Math.floor(sy0); sy < Math.ceil(sy0 + step); sy++) for (let sx = Math.floor(sx0); sx < Math.ceil(sx0 + step); sx++) {
          if (sx < 0 || sy < 0 || sx >= S || sy >= S) { n++; continue; }
          n++; const i = sy * S + sx; if (bg[i]) continue; fg++; const p = px(i); sum[0] += p[0]; sum[1] += p[1]; sum[2] += p[2];
        }
        grid.push(fg && fg / Math.max(1, n) >= 0.45 ? sum.map((v) => v / fg) : null);
      }
      // einzelne Pixel ohne Nachbarn weg
      const at = (x, y) => (x < 0 || y < 0 || x >= N || y >= N ? null : grid[y * N + x]);
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { if (!at(x, y)) continue; let nb = 0; for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) if ((a || b) && at(x + a, y + b)) nb++; if (nb < 2) grid[y * N + x] = null; }
      // wenige Farben (k-means), sehr dunkle = Umriss-Schwarz
      const cols = grid.filter(Boolean), luma = (c) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
      const K = Math.min(9, cols.length);
      let cent = [cols[0]];
      while (cent.length < K) { let best = null, bd = -1; for (const c of cols) { const m = Math.min(...cent.map((e) => Math.hypot(c[0] - e[0], c[1] - e[1], c[2] - e[2]))); if (m > bd) { bd = m; best = c; } } if (!best || bd < 18) break; cent.push(best); }
      for (let it = 0; it < 8; it++) {
        const acc = cent.map(() => [0, 0, 0, 0]);
        cols.forEach((c) => { let bi = 0, bd = Infinity; cent.forEach((e, k) => { const dd = Math.hypot(c[0] - e[0], c[1] - e[1], c[2] - e[2]); if (dd < bd) { bd = dd; bi = k; } }); acc[bi][0] += c[0]; acc[bi][1] += c[1]; acc[bi][2] += c[2]; acc[bi][3]++; });
        cent = cent.map((e, k) => (acc[k][3] ? [acc[k][0] / acc[k][3], acc[k][1] / acc[k][3], acc[k][2] / acc[k][3]] : e));
      }
      const hex = (c) => `#${c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;
      const order = cent.map((c, k) => ({ c, k })).filter((o) => luma(o.c) >= 42).sort((a, b) => luma(b.c) - luma(a.c));
      // ruhigere Farben wie bei den festen Agenten (etwas weniger Sättigung)
      const calm = (c) => { const g = luma(c); return c.map((v) => g + (v - g) * 0.85); };
      const pal = { a: '#000000' }, letter = {};
      order.forEach((o, i) => { const ch = 'bcdefghijklmnop'[i]; pal[ch] = hex(calm(o.c)); letter[o.k] = ch; });
      const chOf = (c) => { let bi = 0, bd = Infinity; cent.forEach((e, k) => { const dd = Math.hypot(c[0] - e[0], c[1] - e[1], c[2] - e[2]); if (dd < bd) { bd = dd; bi = k; } }); return letter[bi] || 'a'; };
      // einzelne Ausreißer-Pixel glätten: haben 3 von 4 Nachbarn dieselbe andere Farbe, übernimmt der Pixel sie
      const chs = grid.map((c) => (c ? chOf(c) : null));
      for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) {
        const k = y * N + x; if (!chs[k]) continue;
        const nb = [chs[k - 1], chs[k + 1], chs[k - N], chs[k + N]].filter(Boolean), cnt = {};
        nb.forEach((c) => { cnt[c] = (cnt[c] || 0) + 1; });
        const top = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0];
        if (top && top[0] !== chs[k] && top[1] >= 3) chs[k] = top[0];
      }
      const rows = [];
      for (let y = 0; y < N; y++) {
        let r = '';
        for (let x = 0; x < N; x++) {
          const c = at(x, y);
          if (c) { r += chs[y * N + x] || chOf(c); continue; }
          // Umriss: 1 px außen herum (unten bleibt offen – Brustbild ist angeschnitten)
          r += [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => at(x + a, y + b)) ? 'a' : '.';
        }
        rows.push(r);
      }
      out[N] = { pal, rows };
    }
    return out;
  }
  const cache = () => read(CACHE_KEY, {});
  const keepCache = (k, v) => { const c = cache(); c[k] = v; const ks = Object.keys(c); while (ks.length > 12) delete c[ks.shift()]; write(CACHE_KEY, c); };

  /* ---------- Fenster „Neuer Agent“ ---------- */
  let prevDog = null;
  const head = document.createElement('div');
  head.className = 'ags-head';
  head.innerHTML = `<b class="ags-title">Neuen Agenten erstellen</b><span class="ags-grow"></span><button type="button" class="ags-x" aria-label="Schließen">${fi('x', 15)}</button>`;
  if (panel) panel.append(head);
  head.querySelector('.ags-x').addEventListener('click', () => close());
  const send = (text) => { if (typeof sendMessage === 'function') sendMessage(text, []); };

  /* ---------- Geführter Anfang (ohne KI-Aufruf) ----------
     Begrüßung → Name in einem kleinen Kasten direkt im Chat (Eingabefeld noch verborgen) → Eingabefeld erscheint: Aussehen beschreiben →
     die Einrichtung „antwortet“ mit dem gezeichneten Kopf (Zeichen-Animation), Änderungen einfach unten schreiben, „Übernehmen“ legt fest →
     Aufgabe unten beschreiben → ab da fragt die KI in Phasen weiter. Stand je Chat in chatOf(tab).wizard. */
  const INTRO = '**Moin!** Ich helfe dir, deinen eigenen Agenten zu bauen – Schritt für Schritt.\n\nZuerst bekommt er einen **Namen** und ein **Aussehen**, danach klären wir genau, **was er können soll**. Am Ende schreibe ich ihm eine ausführliche Anleitung, damit er wirklich zu dir passt.';
  const chatEl = () => document.getElementById('chat');
  const flowOf = () => { let f = chatEl()?.querySelector(':scope > .ags-flow'); if (!f && chatEl()) { f = document.createElement('div'); f.className = 'ags-flow'; chatEl().prepend(f); } return f; };
  const wiz = () => { const c = chatData(tabNow()); if (!c) return null; c.wizard ||= { step: 'intro' }; return c.wizard; };
  const keepWiz = () => saveChat();
  const scroll = () => { try { if (typeof scrollToBottom === 'function') scrollToBottom(true); } catch {} };
  const composerShown = (on) => app?.classList.toggle('ags-noinput', !on);
  function say(text, { instant = false } = {}) {
    const m = document.createElement('div'); m.className = 'msg-ai ags-say'; m.dataset.dog = 'general';
    const a = document.createElement('div'); a.className = 'answer md'; m.append(a);
    flowOf()?.append(m);
    return new Promise((done) => {
      if (instant || typeof makeRenderer !== 'function') { if (typeof renderMarkdown === 'function') renderMarkdown(a, text); else a.textContent = text; done(m); scroll(); return; }
      const r = makeRenderer(a); r.append(text);
      Promise.resolve(r.finish?.()).then(() => { done(m); scroll(); });
    });
  }
  const userSays = (text) => { if (typeof addUserMessage === 'function') { const before = chatEl()?.lastElementChild; addUserMessage(text, []); const out = chatEl()?.lastElementChild; if (out && out !== before) flowOf()?.append(out); } scroll(); };
  // Name: kleiner Kasten im Chat – Frage oben, darunter das Feld mit Senden; danach fest (Schloss)
  function nameCard(done) {
    const card = document.createElement('div'); card.className = 'ags-qcard';
    card.innerHTML = `<div class="ags-qq">Wie soll dein Agent heißen?</div><form class="ags-qin"><input type="text" maxlength="24" placeholder="Name eintragen" aria-label="Name" autocomplete="off" spellcheck="false" /><button type="submit" aria-label="Weiter">${fi('arrow-up', 13)}</button></form>`;
    const form = card.querySelector('form'), inp = card.querySelector('input');
    inp.addEventListener('input', () => card.classList.toggle('ready', !!inp.value.trim()));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = inp.value.replace(/\s+/g, ' ').trim().slice(0, 24); if (!v) return;
      lockName(card, v); done(v);
    });
    flowOf()?.append(card); scroll();
    return card;
  }
  function lockName(card, v) {
    card.classList.add('done');
    card.querySelector('.ags-qin').outerHTML = `<div class="ags-qv">${fi('lock', 11)}<span>${esc(v)}</span></div>`;
  }
  async function stepName() {
    const w = wiz(); w.step = 'name'; keepWiz(); composerShown(false);
    nameCard((v) => { w.name = v; stepLook(); });
  }
  async function stepLook() {
    const w = wiz(); w.step = 'look'; keepWiz();
    await say(`Schön – **${w.name}** also. Wie soll ${w.name} aussehen? Schreib es unten ins Feld: Tier oder Wesen, Farben, besondere Merkmale. Ich zeichne dann den Kopf im Pixel-Stil der anderen Agenten.`);
    composerShown(true);
    setTimeout(() => document.getElementById('input')?.focus(), 80);
  }
  // Aussehen zeichnen = Antwort der Einrichtung (Kopf als Pixel-Bild); Änderung = einfach unten weiterschreiben
  function drawLook(desc) {
    const w = wiz(); w.step = 'look-check'; w.lookDesc = desc; w.raster = null; keepWiz();
    const m = document.createElement('div'); m.className = 'msg-ai ags-say'; m.dataset.dog = 'general';
    flowOf()?.append(m); scroll();
    const card = avatarCard({ figur: 'eigenes', beschreibung: desc, aktion: '', farbe: '' }, `wiz|${desc}`, true, {
      scripted: true,
      onReady: (cur) => { w.raster = cur.raster; keepWiz(); scroll(); },
      onTake: (cur) => takeLook(cur, card),
    });
    m.append(card); scroll();
  }
  function takeLook(cur, card) {
    const w = wiz(); const c = chatData(tabNow());
    c.setupAvatar = { key: 'wizard', figur: 'eigenes', farbe: '', aktion: '', raster: cur.raster, beschreibung: w.lookDesc };
    card.classList.add('taken');
    stepTask();
  }
  async function stepTask() {
    const w = wiz(); w.step = 'task'; keepWiz();
    await say(`Steht! Jetzt das Wichtigste: **Wobei soll ${w.name} dir helfen?** Beschreib es unten so genau du kannst – danach frage ich gezielt weiter.`);
    setTimeout(() => document.getElementById('input')?.focus(), 80);
  }
  // Absenden im Einrichtungs-Chat (app.js → intercept): Aussehen lokal zeichnen, Aufgabe geht an die KI
  function onSubmit(text) {
    const w = wiz(); if (!w) return false;
    if (w.step === 'look' || w.step === 'look-check') {
      const change = w.step === 'look-check' && w.lookDesc;
      userSays(text);
      drawLook((change ? `${w.lookDesc} – Änderung: ${text}` : text).slice(0, 400));
      return true;
    }
    if (w.step === 'task') { w.task = text; w.step = 'ai'; keepWiz(); return false; } // normal an die KI senden
    return w.step === 'name' || w.step === 'intro' || w.step === 'greeting';
  }
  async function startWizard() {
    const tab = tabNow(), w = wiz(); if (!w || tab?._wizStarted) return;
    tab._wizStarted = true;
    if (w.step === 'intro') { w.step = 'greeting'; composerShown(false); await say(INTRO); stepName(); return; }
    replay(); resumeStep();
  }
  // nach Neuladen/Tab-Wechsel: Bisheriges wieder zeigen und beim offenen Schritt weitermachen
  function replay() {
    const w = wiz(); if (!w) return;
    const f = flowOf(); if (!f || f.childElementCount) return;
    say(INTRO, { instant: true });
    if (w.name) { const card = nameCard(() => {}); lockName(card, w.name); }
    const a = chatData(tabNow())?.setupAvatar;
    if (a?.raster) { const m = document.createElement('div'); m.className = 'msg-ai ags-say'; m.dataset.dog = 'general'; m.innerHTML = `<figure class="agv agv-static taken"><div class="agv-stage"><div class="agv-head">${window.PixelDogs?.rasterSvg?.(a.raster[32], 128) || ''}</div></div><div class="agv-side"><div class="agv-t">${esc(w.name || '')}</div><div class="agv-m">Aussehen festgelegt</div></div></figure>`; f.append(m); }
  }
  function resumeStep() {
    const w = wiz(); if (!w) return;
    if (typeof historyOf === 'function' && historyOf(tabNow()).length) { composerShown(true); return; } // KI-Teil läuft schon
    if (w.step === 'greeting' || w.step === 'name') { stepName(); return; }
    composerShown(true);
    if (w.step === 'look-check' && !chatData(tabNow())?.setupAvatar) { w.step = 'look'; keepWiz(); }
    if (w.step === 'look') say(`Wie soll ${w.name} aussehen? Schreib es unten ins Feld.`, { instant: true });
    if (w.step === 'task') say(`Wobei soll ${w.name} dir helfen? Beschreib es unten so genau du kannst.`, { instant: true });
  }

  function open(opts = {}) {
    if (typeof createTab !== 'function') return;
    const edit = opts.edit || null;
    window.Settings?.close?.();
    prevDog = window.PixelDogs?.mode || 'general';
    if (prevDog !== 'general') window.PixelDogs?.select('general');
    const tab = createTab(edit ? `${edit.name} bearbeiten` : 'Neuer Agent');
    const c = chatData(tab);
    c.setup = 'agent';
    if (opts.wish) c.setupWish = String(opts.wish).slice(0, 1000);
    if (edit) { c.setupBase = edit.id; c.title = `${edit.name} bearbeiten`; c.auto = false; c.wizard = { step: 'ai', name: edit.name }; c.setupAvatar = { figur: edit.figur, farbe: edit.farbe, aktion: edit.aktion, raster: edit.raster || null, beschreibung: edit.beschreibungBild || '' }; }
    saveChat();
    sync();
    if (edit) {
      say(`Was möchtest du an **${edit.name}** ändern? Name, Aussehen, Aufgabe, Arbeitsweise, Ton oder Grenzen – sag es einfach.`);
      setTimeout(() => document.getElementById('input')?.focus(), 160);
    } // der Ablauf startet über „chat-tab-switched“ (createTab), sobald der neue Chat aktiv ist
  }
  function close(selectId = null) {
    const tab = tabNow();
    if (typeof hideAskPanel === 'function') hideAskPanel();
    if (isSetup(tab)) {
      // leer = Entwurf: ein neuer Chat genügt (der Entwurf wird beim Verlassen verworfen); mit Verlauf: löschen (neuer leerer Chat an seiner Stelle)
      const empty = typeof historyOf === 'function' && !historyOf(tab).length;
      try { if (empty) createTab('Neuer Chat'); else if (typeof deleteChat === 'function') deleteChat(tab); } catch {}
    }
    app?.classList.remove('agent-setup'); composerShown(true);
    const to = selectId || (prevDog && window.PixelDogs?.DOGS?.[prevDog] ? prevDog : null);
    if (to && to !== window.PixelDogs?.mode) setTimeout(() => window.PixelDogs?.select(to), 60);
    prevDog = null;
    setTimeout(sync, 0);
  }
  let heroText = '';
  function sync() {
    const tab = tabNow(), on = isSetup(tab);
    app?.classList.toggle('agent-setup', on);
    const base = on && chatData(tab)?.setupBase ? byId(chatData(tab).setupBase) : null;
    head.querySelector('.ags-title').textContent = base ? `${base.name} bearbeiten` : 'Neuen Agenten erstellen';
    const inp = document.getElementById('input');
    if (inp) { if (on) { inp.dataset.ph0 ||= inp.placeholder; inp.placeholder = 'Antworte hier …'; } else if (inp.dataset.ph0) { inp.placeholder = inp.dataset.ph0; delete inp.dataset.ph0; } }
    greet();
  }
  function greet() {
    const t = document.querySelector('#composer .dh-title'); if (!t) return;
    heroText ||= t.textContent;
    const a = byId(window.PixelDogs?.mode);
    void a; t.textContent = heroText; // immer „Woran arbeiten wir heute?“ – auch bei eigenen Agenten (Wunsch 03.11.)
  }
  window.addEventListener('chat-tab-switched', () => setTimeout(() => {
    sync();
    const tab = tabNow();
    if (isSetup(tab) && !chatData(tab)?.setupBase) startWizard(); else composerShown(true);
  }, 0));
  document.addEventListener('dogmodechange', () => setTimeout(greet, 0));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && app?.classList.contains('agent-setup') && !document.querySelector('.agent-picker.open, .cbx-overlay, #composer.asking') && !e.target.closest?.('textarea, input')) close(); });
  setTimeout(sync, 0);
  // „Erstell mir einen eigenen Agenten …“ im normalen Chat → gleich das Fenster öffnen (der Chat selbst baut keine Agenten)
  function intercept(text) {
    if (isSetup(tabNow())) return !chatData(tabNow())?.setupBase && onSubmit(String(text || '').trim());
    if (!CREATE_ASK.test(String(text || ''))) return false;
    open({ wish: text });
    return true;
  }

  /* ---------- Vorschau des Aussehens (```avatar) ---------- */
  function avatarCard(spec, raw, live, flow = null) {
    const fig = document.createElement('figure');
    fig.className = 'agv';
    let stop = () => {}, cur = { ...spec, raster: null };
    const meta = () => [FIG_NAMES[cur.figur], cur.figur !== 'eigenes' ? (FUR_NAMES[cur.farbe] || (cur.farbe ? 'Eigene Farbe' : '')) : '', ACT_NAMES[cur.aktion || ''] || ''].filter(Boolean).join(' · ');
    const accepted = () => { const a = chatData(tabNow())?.setupAvatar; return !!a && a.key === hash(raw); };
    function draw(state, err) {
      stop();
      const taken = fig.classList.contains('taken');
      const art = state === 'ok' ? (window.PixelDogs?.previewArt?.(cur.figur, cur.farbe, 128, cur.raster) || '') : '';
      fig.innerHTML = `<div class="agv-stage${state === 'wait' ? ' wait' : ''}">${state === 'wait' ? `<div class="agv-scene">${window.illustrationWave ? illustrationWave() : ''}</div><span class="agv-wait shimmer">Zeichnet</span>` : `<div class="agv-head">${art}</div>`}</div>
        <div class="agv-side"><div class="agv-t">${state === 'wait' ? 'Wird gezeichnet …' : flow ? esc(wiz()?.name || 'Aussehen') : 'Aussehen'}</div>
        <div class="agv-m">${state === 'wait' ? 'Kopf im Pixel-Stil der anderen Agenten' : esc(flow ? (cur.beschreibung || '').replace(/ – Änderung: /g, ' · ') : meta())}</div>
        ${state === 'ok' ? `<div class="agv-sizes"><span>${window.PixelDogs?.previewArt?.(cur.figur, cur.farbe, 24, cur.raster) || ''}</span><span class="agv-cap">So im Chat</span></div>` : ''}
        ${err ? `<p class="agv-err">${esc(err)}</p>` : ''}
        <div class="agv-acts">${state === 'wait' ? '' : taken || accepted() ? `<span class="agv-ok">${fi('check', 12)}Übernommen</span>`
          : `${cur.figur === 'eigenes' ? `<button type="button" class="agv-btn" data-agv="again">${fi('refresh', 12)}Neu zeichnen</button>` : ''}${state === 'ok' ? '<button type="button" class="agv-btn primary" data-agv="take">Übernehmen</button>' : ''}`}</div>
        ${flow && state !== 'wait' && !taken ? '<p class="agv-hint">Etwas anders? Schreib es einfach unten ins Feld.</p>' : ''}</div>`;
    }
    async function paint(fresh) {
      if (cur.figur !== 'eigenes') { draw('ok'); return; }
      const ck = hash(`${cur.beschreibung}|${raw}`);
      const hit = !fresh && cache()[ck];
      if (hit) { cur.raster = hit.raster; cur.desc = hit.desc; draw('ok'); flow?.onReady?.(cur); return; }
      if (!live && !fresh) { draw('idle', 'Vorschau nicht mehr gespeichert – „Neu zeichnen“ erstellt sie neu.'); return; }
      draw('wait');
      try {
        const r = await fetch('/api/agent-avatar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ wish: cur.beschreibung || 'freundliches Tier' }) });
        const j = await r.json();
        if (!r.ok || !j.src) throw new Error(j.error || 'Das Bild konnte gerade nicht gezeichnet werden.');
        cur.raster = await pixelate(j.src); cur.desc = j.desc || '';
        keepCache(ck, { raster: cur.raster, desc: cur.desc });
        draw('ok'); flow?.onReady?.(cur);
      } catch (err) { draw('idle', err.message || 'Fehler beim Zeichnen.'); flow?.onFail?.(err); }
    }
    fig.addEventListener('click', (e) => {
      const b = e.target.closest('[data-agv]'); if (!b) return;
      if (b.dataset.agv === 'again') paint(true);
      if (b.dataset.agv === 'take' && flow?.onTake) { if (!cur.raster) return; fig.classList.add('taken'); draw('ok'); flow.onTake(cur); return; }
      if (b.dataset.agv === 'take') {
        const c = chatData(tabNow()); if (!c) return;
        c.setupAvatar = { key: hash(raw), figur: cur.figur, farbe: cur.farbe, aktion: cur.aktion, raster: cur.raster || null, beschreibung: cur.beschreibung || '' };
        saveChat(); draw('ok');
        send('Das Aussehen passt – bitte übernehmen und weitermachen.');
      }
    });
    fig._stop = () => stop();
    paint(false);
    return fig;
  }

  /* ---------- Profil-Karte (```agentprofil) ---------- */
  function lastWidget() {
    const h = typeof historyOf === 'function' ? historyOf(tabNow()) : [];
    for (let i = h.length - 1; i >= 0; i--) { const m = h[i].role === 'assistant' && String(h[i].text || '').match(/```widget[^\n]*\n([\s\S]*?)\n```/g); if (m) return m[m.length - 1].replace(/^```widget[^\n]*\n|\n```$/g, ''); }
    return '';
  }
  function finalAvatar(p) {
    const a = chatData(tabNow())?.setupAvatar;
    if (a && (a.figur !== 'eigenes' || a.raster)) return { figur: a.figur, farbe: a.farbe, aktion: p.aktion || a.aktion || '', raster: a.raster || null, beschreibungBild: a.beschreibung || '' };
    return { figur: p.figur === 'eigenes' ? 'havaneser' : p.figur, farbe: p.farbe, aktion: p.aktion, raster: null };
  }
  // Anweisung lesbar machen: Zeilen in GROSSBUCHSTABEN = Abschnitts-Überschriften, Rest als Markdown
  const promptMd = (t) => String(t || '').split('\n').map((l) => (/^[A-ZÄÖÜ][A-ZÄÖÜ0-9 ,/&()·\-–]{3,60}:?$/.test(l.trim()) ? `#### ${l.trim().replace(/:$/, '')}` : l)).join('\n');
  // Anweisung im eigenen Fenster: Abschnitte als Liste links (springen), Text rechts – ruhig und gut lesbar
  function openPrompt(p) {
    const ov = document.createElement('div'); ov.className = 'agp-ov';
    ov.innerHTML = `<div class="agp-sheet" role="dialog" aria-label="Anweisung"><div class="agp-sh-head"><span class="agp-sh-art">${window.PixelDogs?.previewArt?.(p._av.figur, p._av.farbe, 32, p._av.raster) || ''}</span><div><b>${esc(p.name)}</b><span>Anweisung · ${p.prompt.split(/\s+/).length.toLocaleString('de-DE')} Wörter</span></div><span class="ags-grow"></span><button type="button" class="ags-x" data-x aria-label="Schließen">${fi('x', 15)}</button></div>
      <div class="agp-sh-body"><nav class="agp-sh-nav"></nav><div class="agp-sh-text md"></div></div></div>`;
    const text = ov.querySelector('.agp-sh-text');
    if (typeof renderMarkdown === 'function') renderMarkdown(text, promptMd(p.prompt)); else text.textContent = p.prompt;
    const nav = ov.querySelector('.agp-sh-nav');
    text.querySelectorAll('h4').forEach((h, k) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = h.textContent.charAt(0) + h.textContent.slice(1).toLowerCase(); b.addEventListener('click', () => h.scrollIntoView({ behavior: 'smooth', block: 'start' })); nav.append(b); if (!k) b.classList.add('on'); });
    if (!nav.childElementCount) nav.remove();
    const shut = () => { ov.classList.remove('in'); setTimeout(() => ov.remove(), 240); document.removeEventListener('keydown', esc1, true); };
    const esc1 = (e) => { if (e.key === 'Escape') { e.stopPropagation(); shut(); } };
    ov.addEventListener('click', (e) => { if (e.target === ov || e.target.closest('[data-x]')) shut(); });
    document.addEventListener('keydown', esc1, true);
    document.body.append(ov); requestAnimationFrame(() => ov.classList.add('in'));
  }
  // nach „Agent erstellen“: ruhiger Abschluss im Fenster – Kopf, Name, „ist bereit“, Chat starten
  function celebrate(item, isNew) {
    const ov = document.createElement('div'); ov.className = 'agp-done';
    ov.innerHTML = `<div class="agp-done-in"><div class="agp-done-art">${window.PixelDogs?.previewArt?.(item.figur, item.farbe, 128, item.raster) || ''}</div>
      <div class="agp-done-check">${fi('check', 14)}</div><b>${esc(item.name)} ${isNew ? 'ist bereit' : 'ist aktualisiert'}</b><span>Du findest ${esc(item.name)} im Agenten-Feld und unter Einstellungen → Agenten.</span>
      <div class="agp-done-acts"><button type="button" class="agp-btn" data-done="close">Schließen</button><button type="button" class="agp-btn primary" data-done="start">Chat starten</button></div></div>`;
    ov.addEventListener('click', (e) => { const b = e.target.closest('[data-done]'); if (!b) return; ov.remove(); if (b.dataset.done === 'start') close(item.id); else close(); });
    panel?.append(ov); requestAnimationFrame(() => ov.classList.add('in'));
  }
  function card(p, done) {
    const fig = document.createElement('figure');
    fig.className = 'agp';
    if (!done) {
      fig.classList.add('agp-wait');
      fig.innerHTML = `<div class="agp-art"><span class="agp-dot"></span></div><div class="agp-main"><div class="agp-name shimmer">Agent wird zusammengestellt</div></div>`;
      return fig;
    }
    const tab = tabNow(), editId = chatData(tab)?.setupBase || null;
    if (chatData(tab)?.wizard?.name && !editId) p.name = chatData(tab).wizard.name; // Name ist im ersten Schritt festgelegt
    const existing = list().find((a) => a.id === editId) || list().find((a) => a.name.toLowerCase() === p.name.toLowerCase());
    const av = finalAvatar(p), words = p.prompt.split(/\s+/).length;
    p._av = av;
    const sections = (promptMd(p.prompt).match(/^#### .+$/gm) || []).map((h) => h.slice(5)).slice(0, 8);
    fig.innerHTML = `<div class="agp-top"><div class="agp-art"><div class="agp-head">${window.PixelDogs?.previewArt?.(av.figur, av.farbe, 96, av.raster) || ''}</div></div><div class="agp-main">
        <div class="agp-name">${esc(p.name)}</div>
        <p class="agp-desc">${esc(p.beschreibung || 'Eigener Agent')}</p>
        <div class="agp-tags"><span>${esc(MODE_NAMES[MODES[p.verhalten]])}</span>${p.tools.map((t) => `<span>${esc(TOOL_NAMES[t])}</span>`).join('')}</div>
      </div></div>
      <button type="button" class="agp-instr" data-agp="prompt"><span class="agp-instr-t">${fi('file', 13)}<b>Anweisung</b><em>${words.toLocaleString('de-DE')} Wörter</em></span>
        <span class="agp-instr-s">${sections.map((x) => `<i>${esc(x.charAt(0) + x.slice(1).toLowerCase())}</i>`).join('')}</span>${fi('chevron-right', 11)}</button>
      <div class="agp-acts"><button type="button" class="agp-btn primary" data-agp="save">${existing ? 'Änderungen übernehmen' : 'Agent erstellen'}</button></div>`;
    fig.addEventListener('click', (e) => {
      const b = e.target.closest('[data-agp]'); if (!b) return;
      if (b.dataset.agp === 'prompt') { openPrompt(p); return; }
      if (b.dataset.agp === 'save') {
        const l = list(), id = existing?.id || `u-${Date.now().toString(36)}`;
        const item = { id, name: p.name, beschreibung: p.beschreibung, begruessung: '', verhalten: p.verhalten, prompt: p.prompt, tools: p.tools, vorlage: '', ...av, aktion: '', at: Date.now() };
        const i = l.findIndex((a) => a.id === id);
        if (i >= 0) l[i] = item; else l.unshift(item);
        store(l);
        fig.querySelector('.agp-acts').innerHTML = `<span class="agp-ok">${fi('check', 12)}${i >= 0 ? 'Übernommen' : 'Erstellt'}</span><button type="button" class="agp-btn primary" data-agp="start" data-id="${esc(id)}">Chat starten</button>`;
        celebrate(item, i < 0);
      } else if (b.dataset.agp === 'start') close(b.dataset.id);
    });
    return fig;
  }
  function render(target, text, opts = {}) {
    const pres = target.querySelectorAll('pre:has(code.language-agentprofil), pre:has(code.language-avatar)');
    if (!pres.length) return;
    if (opts.live) target._agLive = true;
    const closed = (lang) => (String(text).match(new RegExp('```' + lang + '[^\\n]*\\n[\\s\\S]*?\\n```', 'g')) || []).length;
    const done = { agentprofil: closed('agentprofil'), avatar: closed('avatar') };
    const keep = (target._agp ||= new Map()), n = { agentprofil: 0, avatar: 0 };
    pres.forEach((pre) => {
      const code = pre.querySelector('code'), raw = code.textContent;
      const lang = code.classList.contains('language-avatar') ? 'avatar' : 'agentprofil';
      const i = n[lang]++, fin = !opts.live || i < done[lang];
      if (lang === 'avatar') {
        if (!fin) { pre.remove(); return; }
        const k = `av|${i}|${raw}`;
        if (!keep.has(k)) keep.set(k, avatarCard(parseAvatar(raw), raw, !!target._agLive));
        pre.replaceWith(keep.get(k));
        return;
      }
      const p = fin ? parseProfile(raw) : null;
      const k = fin ? `${i}|${raw}` : `${i}|wait`;
      if (fin && !p) { pre.remove(); return; }
      if (!keep.has(k)) { const f = card(p, fin); if (fin && keep.has(`${i}|wait`)) f.classList.add('agp-reveal'); keep.set(k, f); }
      pre.replaceWith(keep.get(k));
    });
  }

  /* ---------- Anfrage: welcher Agent, eigene Anweisung, Einrichtung, Design der Mini-Apps ---------- */
  window.agentPayload = (id, tab = tabNow()) => {
    const look = window.CodeBox?.look?.();
    const extra = look ? { look } : {};
    if (isSetup(tab)) {
      const c = chatData(tab), base = byId(c?.setupBase);
      const w = c?.wizard || {};
      return { agent: 'general', setup: 'agent', ...(c?.setupWish ? { setupWish: c.setupWish } : {}),
        ...(w.name ? { setupInfo: { name: w.name, aussehen: w.lookDesc || w.look || '', animation: w.aktion || '' } } : {}),
        ...(base ? { setupBase: { name: base.name, beschreibung: base.beschreibung, figur: base.figur, farbe: base.farbe, aktion: base.aktion, verhalten: base.verhalten, werkzeuge: base.tools, begruessung: base.begruessung, anweisung: base.prompt } } : {}), ...extra };
    }
    const a = byId(id);
    if (a) return { agent: MODES[a.verhalten] || 'general', custom: { name: a.name, prompt: a.prompt, mode: a.verhalten, tools: a.tools || [], vorlage: a.vorlage || '' }, ...extra };
    return { agent: id, ...extra };
  };

  /* ---------- Einstellungen → Agenten: eigene Agenten ---------- */
  let delArm = null;
  function settingsHtml() {
    const l = list();
    const rows = l.map((a) => `<div class="st-row ags-row"><span class="st-dog">${window.PixelDogs?.svg(a.id, 24) || ''}</span><span class="st-name">${esc(a.name)}</span><span class="st-muted ags-meta">${esc(MODE_NAMES[MODES[a.verhalten]] || 'Allgemein')}</span><span class="grow"></span>`
      + `${window.PixelDogs?.mode === a.id ? `<span class="st-ok">${fi('check', 12)}Aktiv</span>` : `<button type="button" class="st-btn dark" data-ags-use="${esc(a.id)}">Auswählen</button>`}`
      + `<button type="button" class="ags-ib" data-ags-edit="${esc(a.id)}" aria-label="Bearbeiten">${fi('pencil', 13)}</button><button type="button" class="ags-ib del${delArm === a.id ? ' sure' : ''}" data-ags-del="${esc(a.id)}" aria-label="Löschen">${delArm === a.id ? 'Wirklich?' : fi('trash', 13)}</button></div>`).join('');
    return `<h2>Eigene Agenten</h2><div class="st-card">${rows}<div class="st-row ags-new" data-ags-new role="button" tabindex="0"><span class="ags-plus">${fi('plus', 13)}</span><span class="st-name">Neuen Agenten erstellen</span><span class="grow"></span><span class="st-ws-chev"><svg width="12" height="12" aria-hidden="true"><use href="#o-chev"/></svg></span></div></div>`;
  }
  function settingsClick(e, redraw) {
    const t = e.target;
    if (t.closest('[data-ags-new]')) { open(); return true; }
    const u = t.closest('[data-ags-use]'); if (u) { window.PixelDogs?.select(u.dataset.agsUse); setTimeout(redraw, 60); return true; }
    const ed = t.closest('[data-ags-edit]'); if (ed) { const a = byId(ed.dataset.agsEdit); if (a) open({ edit: a }); return true; }
    const d = t.closest('[data-ags-del]');
    if (d) {
      const id = d.dataset.agsDel;
      if (delArm !== id) { delArm = id; redraw(); setTimeout(() => { if (delArm === id) { delArm = null; redraw(); } }, 3000); }
      else { delArm = null; store(list().filter((a) => a.id !== id)); }
      return true;
    }
    return false;
  }
  (window.SettingsHooks ||= []).push({ page: 'agents', order: 1, html: settingsHtml, click: settingsClick }, { page: 'saved', order: 0, html: settingsHtml, click: settingsClick });

  return { open: (o) => open(o && typeof o === 'object' && !o.id ? o : o ? { edit: o } : {}), close, render, list, parseProfile, parseAvatar, intercept, pixelate };
})();
window.AgentBuilder = AgentBuilder;
