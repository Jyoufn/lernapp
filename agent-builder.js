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
    const luma = (c) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
    const d3 = (p, e) => Math.hypot(p[0] - e[0], p[1] - e[1], p[2] - e[2]);
    // Farben EINMAL im Originalbild bündeln (k-means über die Figur) – jede Rasterzelle nimmt danach die häufigste Farbe statt eines
    // Mittelwerts: scharfe Kanten, keine Mischfarben, Augen und Linien bleiben dunkel (wie bei den festen Agenten)
    const fgIdx = []; for (let i = 0; i < S * S; i++) if (!bg[i]) fgIdx.push(i);
    const sample = fgIdx.filter((_, k) => k % 3 === 0).map(px);
    let cent = [sample[0]];
    while (cent.length < Math.min(11, sample.length)) {
      let best = null, bd = -1;
      for (const c of sample) { let m = Infinity; for (const e of cent) { const dd = d3(c, e); if (dd < m) m = dd; } if (m > bd) { bd = m; best = c; } }
      if (!best || bd < 20) break; cent.push(best);
    }
    const near = (c) => { let bi = 0, bd = Infinity; cent.forEach((e, k) => { const dd = d3(c, e); if (dd < bd) { bd = dd; bi = k; } }); return bi; };
    for (let it = 0; it < 10; it++) {
      const acc = cent.map(() => [0, 0, 0, 0]);
      sample.forEach((c) => { const k = near(c); acc[k][0] += c[0]; acc[k][1] += c[1]; acc[k][2] += c[2]; acc[k][3]++; });
      cent = cent.map((e, k) => (acc[k][3] ? [acc[k][0] / acc[k][3], acc[k][1] / acc[k][3], acc[k][2] / acc[k][3]] : e));
    }
    const lab = new Int16Array(S * S).fill(-1);
    fgIdx.forEach((i) => { lab[i] = near(px(i)); });
    const dark = cent.map((c) => luma(c) < 46);
    const hex = (c) => `#${c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;
    const calm = (c) => { const g = luma(c); return c.map((v) => g + (v - g) * 0.86); }; // ruhigere Farben wie bei den festen Agenten
    const out = {};
    for (const N of [32, 24, 20]) {
      // wie die festen Agenten: der Kopf füllt die Breite, oben 1 px Luft, was unten übersteht (Hals/Körper) wird abgeschnitten
      const scale = (N - 2) / bw, ox = 1, oy = bh * scale <= N - 1 ? N - bh * scale : 1;
      const step = 1 / scale, darkW = N >= 32 ? 1.7 : 1.45;
      const grid = new Int16Array(N * N).fill(-1);
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const sx0 = x0 + (x - ox) / scale, sy0 = y0 + (y - oy) / scale;
        let n = 0, fg = 0; const cnt = new Float32Array(cent.length);
        for (let sy = Math.floor(sy0); sy < Math.ceil(sy0 + step); sy++) for (let sx = Math.floor(sx0); sx < Math.ceil(sx0 + step); sx++) {
          n++; if (sx < 0 || sy < 0 || sx >= S || sy >= S) continue;
          const k = lab[sy * S + sx]; if (k < 0) continue;
          fg++; cnt[k] += dark[k] ? darkW : 1;
        }
        if (!fg || fg / Math.max(1, n) < 0.45) continue;
        let bk = 0; for (let k = 1; k < cnt.length; k++) if (cnt[k] > cnt[bk]) bk = k;
        grid[y * N + x] = bk;
      }
      const at = (x, y) => (x < 0 || y < 0 || x >= N || y >= N ? -1 : grid[y * N + x]);
      // einzelne Pixel ohne Nachbarn weg
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { if (at(x, y) < 0) continue; let nb = 0; for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) if ((a || b) && at(x + a, y + b) >= 0) nb++; if (nb < 2) grid[y * N + x] = -1; }
      // Ausreißer glätten: haben 3 von 4 Nachbarn dieselbe andere (helle) Farbe, übernimmt der Pixel sie – dunkle Linien/Augen bleiben
      for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) {
        const k = y * N + x, me = grid[k]; if (me < 0 || dark[me]) continue;
        const cntN = {}; [grid[k - 1], grid[k + 1], grid[k - N], grid[k + N]].forEach((c) => { if (c >= 0) cntN[c] = (cntN[c] || 0) + 1; });
        const top = Object.entries(cntN).sort((a, b) => b[1] - a[1])[0];
        if (top && +top[0] !== me && top[1] >= 3) grid[k] = +top[0];
      }
      // Palette: dunkle Bündel = Umriss-Schwarz, die übrigen von hell nach dunkel als Buchstaben
      const used = [...new Set([...grid].filter((k) => k >= 0 && !dark[k]))].sort((a, b) => luma(cent[b]) - luma(cent[a]));
      const pal = { a: '#000000' }, letter = {};
      used.forEach((k, i) => { const ch = 'bcdefghijklmnop'[i]; pal[ch] = hex(calm(cent[k])); letter[k] = ch; });
      const rows = [];
      for (let y = 0; y < N; y++) {
        let r = '';
        for (let x = 0; x < N; x++) {
          const k = at(x, y);
          if (k >= 0) { r += dark[k] ? 'a' : letter[k] || 'a'; continue; }
          // Umriss: 1 px außen herum – aber nicht doppelt: liegt innen schon eine schwarze Linie (vom Bild selbst), bleibt es durchsichtig
          const nbs = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([a, b]) => at(x + a, y + b)).filter((v) => v >= 0);
          r += nbs.length && nbs.some((v) => !dark[v]) ? 'a' : '.';
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
  const send = (text) => { if (typeof sendMessage === 'function') { chatEl()?.querySelector('.ags-hero')?.remove(); sendMessage(text, []); } };

  /* ---------- Ablauf (Stand 03.11. nachmittags) ----------
     1. Leeres Fenster: ruhige Startfläche „Was soll dein Agent für dich tun?“ – man beschreibt es frei im Eingabefeld (keine Vorschläge).
     2. Die KI greift die Idee auf, schlägt selbst Namen und Aussehen vor (```agententwurf → Karte mit gezeichnetem Kopf, Name per Stift änderbar)
        und stellt die 2–3 wichtigsten Fragen (im Eingabefeld, Multiple Choice, überspringbar).
     3. Höchstens noch eine Runde, dann der fertige Agent (```agentprofil → „Agent erstellen“).
     Alles läuft als normaler Chat (gleiche Animationen wie sonst); Stand je Chat: setupName, setupAvatar. */
  const chatEl = () => document.getElementById('chat');
  const scroll = () => { try { if (typeof scrollToBottom === 'function') scrollToBottom(true); } catch {} };
  const composerShown = (on) => app?.classList.toggle('ags-noinput', !on);
  const placeholder = (t) => { const inp = document.getElementById('input'); if (inp && isSetup(tabNow())) inp.placeholder = t; };
  function say(text) {
    const m = document.createElement('div'); m.className = 'msg-ai ags-say'; m.dataset.dog = 'general';
    const a = document.createElement('div'); a.className = 'answer md'; m.append(a);
    chatEl()?.append(m);
    if (typeof renderMarkdown === 'function') renderMarkdown(a, text); else a.textContent = text;
    scroll();
    return m;
  }
  // Startfläche im leeren Einrichtungs-Chat
  function hero() {
    const ch = chatEl(); if (!ch || ch.querySelector('.ags-hero')) return;
    const el = document.createElement('div'); el.className = 'ags-hero';
    el.innerHTML = `<div class="ags-hero-art"><span class="ap-ghost">${window.PixelDogs?.svg?.('general', 32) || ''}<span class="ap-plus">${fi('plus', 13)}</span></span></div>
      <h2 class="ags-hero-t">Was soll dein Agent für dich tun?</h2>
      <p class="ags-hero-s">Beschreib es in deinen Worten – wofür, in welchem Fach, wie du am liebsten lernst. Namen, Aussehen und eine ausführliche Anleitung übernehme ich.</p>`;
    ch.prepend(el);
  }
  function heroOut() {
    const el = chatEl()?.querySelector('.ags-hero'); if (!el) return;
    el.classList.add('out'); setTimeout(() => el.remove(), 360);
  }
  function freshSetup(tab = tabNow()) { return isSetup(tab) && !chatData(tab)?.setupBase && typeof historyOf === 'function' && !historyOf(tab).length; }
  function startSetup() {
    const tab = tabNow(); if (!isSetup(tab)) return;
    composerShown(true);
    if (freshSetup(tab)) {
      hero(); placeholder('Beschreib, wobei dein Agent helfen soll …');
      const c = chatData(tab);
      // aus dem normalen Chat („erstell mir einen Agenten, der …“) → der Wunsch ist schon die Beschreibung
      if (c?.setupWish && !tab._wishSent) { tab._wishSent = true; setTimeout(() => { if (tabNow() === tab && freshSetup(tab)) send(c.setupWish); }, 260); }
    } else placeholder('Antworte hier …');
    setTimeout(() => document.getElementById('input')?.focus({ preventScroll: true }), 120);
  }
  // Bild entsteht wie im normalen Chat: „Bild erzeugen“ mit Licht-Streifen über einem Rahmen mit der Kachel-Welle (hier quadratisch)
  let sqWave = '';
  const squareWave = () => {
    if (sqWave) return sqWave;
    const W = 576, N = 17, S = 24, G = 8, SWEEP = 2600, o = (W - N * S - (N - 1) * G) / 2;
    let t = '';
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) t += `<rect x="${o + c * (S + G)}" y="${o + r * (S + G)}" width="${S}" height="${S}" rx="6" style="animation-delay:${Math.round((c / (N - 1) * 0.85 + r / (N - 1) * 0.15) * SWEEP)}ms"/>`;
    return (sqWave = `<div class="ill-frame" aria-hidden="true"><svg viewBox="0 0 ${W} ${W}" preserveAspectRatio="xMidYMid meet"><g fill="#fff" fill-opacity="0.09">${t}</g></svg></div>`);
  };
  async function drawAvatar(desc, fresh = false) {
    const ck = hash(`wiz|${desc}`);
    const hit = !fresh && cache()[ck];
    if (hit) return hit.raster;
    const r = await fetch('/api/agent-avatar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ wish: desc || 'freundliches Tier' }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.src) throw new Error(j.error || 'Das Bild konnte gerade nicht erzeugt werden.');
    const raster = await pixelate(j.src);
    keepCache(ck, { raster, desc: j.desc || '' });
    return raster;
  }

  /* ---------- Entwurf (```agententwurf): Name + Aussehen, von der KI vorgeschlagen ----------
     Karte: links das Bild (gleiche Lade-Animation wie Bilder im Chat), rechts Name (Stift = umbenennen), ein Satz, „Neu generieren“.
     Der jeweils letzte Entwurf im Chat gilt – sein Bild wird zum Profilbild (setupAvatar), sein Name zum Namen (setupName). */
  function parseDraft(raw) {
    const { h } = heads(raw);
    const name = String(h.name || '').replace(/\s+/g, ' ').trim().slice(0, 24);
    const aussehen = String(h.aussehen || h.beschreibung_bild || '').trim().slice(0, 300);
    if (!name || !aussehen) return null;
    return { name, beschreibung: String(h.beschreibung || '').trim().slice(0, 160), aussehen };
  }
  const draftsIn = () => [...(chatEl()?.querySelectorAll('figure.agd') || [])];
  const isLatest = (fig) => { const l = draftsIn(); return l[l.length - 1] === fig; };
  function markDrafts() { const l = draftsIn(); l.forEach((f, i) => f.classList.toggle('old', i < l.length - 1)); }
  function draftCard(d, live) {
    const fig = document.createElement('figure'); fig.className = 'agd';
    const c0 = chatData(tabNow());
    let raster = null, name = d.name;
    fig.innerHTML = `<div class="agd-pic"></div><div class="agd-side"><span class="agd-k">Dein Agent</span>
      <div class="agd-name"><b>${esc(name)}</b><button type="button" class="agd-ren" data-agd="rename" aria-label="Namen ändern" title="Namen ändern">${fi('pencil', 12)}</button></div>
      ${d.beschreibung ? `<p class="agd-desc">${esc(d.beschreibung)}</p>` : ''}
      <div class="agd-acts"></div></div>`;
    const pic = fig.querySelector('.agd-pic'), acts = fig.querySelector('.agd-acts');
    const take = () => {
      if (!isLatest(fig)) return;
      const c = chatData(tabNow()); if (!c) return;
      if (raster) c.setupAvatar = { key: 'draft', figur: 'eigenes', farbe: '', aktion: '', raster, beschreibung: d.aussehen };
      if (!c.setupRenamed) c.setupName = name;
      saveChat();
    };
    function show(state, err) {
      if (state === 'wait') {
        pic.className = 'agd-pic wait';
        pic.innerHTML = `<div class="illustration-pending"><span class="shimmer ill-ico"></span><span class="shimmer">Bild erzeugen</span></div>${squareWave()}`;
        try { if (typeof sweepRow === 'function') sweepRow(pic.querySelector('.illustration-pending')); } catch {}
        acts.innerHTML = '';
        return;
      }
      if (state === 'err') { pic.className = 'agd-pic err'; pic.innerHTML = `<span>${esc(err || 'Das Bild konnte gerade nicht erzeugt werden.')}</span>`; }
      else { pic.className = 'agd-pic ready'; pic.innerHTML = window.PixelDogs?.previewArt?.('eigenes', '', 256, raster) || ''; }
      acts.innerHTML = `<button type="button" class="agv-btn" data-agd="again">${fi('refresh', 12)}Neu generieren</button>`;
    }
    async function paint(fresh) {
      const c = chatData(tabNow());
      // gespeichertes Bild genau dieses Aussehens (nach Neuladen) → sofort
      if (!fresh && c?.setupAvatar?.raster && c.setupAvatar.beschreibung === d.aussehen) { raster = c.setupAvatar.raster; show('ok'); return; }
      const ck = cache()[hash(`wiz|${d.aussehen}`)];
      if (!fresh && ck) { raster = ck.raster; show('ok'); take(); return; }
      if (!live && !fresh) { show('err', 'Bild nicht mehr gespeichert – „Neu generieren“ zeichnet es neu.'); return; }
      show('wait');
      try { raster = await drawAvatar(d.aussehen, fresh); show('ok'); take(); scroll(); } catch (err) { show('err', err.message); }
    }
    fig.addEventListener('click', (e) => {
      const b = e.target.closest('[data-agd]'); if (!b) return;
      if (b.dataset.agd === 'again') paint(true);
      if (b.dataset.agd === 'rename') {
        const box = fig.querySelector('.agd-name');
        box.innerHTML = `<form class="agd-in"><input type="text" maxlength="24" value="${esc(name)}" aria-label="Name" autocomplete="off" spellcheck="false"><button type="submit" aria-label="Übernehmen">${fi('check', 12)}</button></form>`;
        const inp = box.querySelector('input'); inp.focus(); inp.select();
        const done = (ok) => {
          const v = inp.value.replace(/\s+/g, ' ').trim().slice(0, 24);
          if (ok && v) { name = v; const c = chatData(tabNow()); if (c) { c.setupName = v; c.setupRenamed = true; saveChat(); } }
          box.innerHTML = `<b>${esc(name)}</b><button type="button" class="agd-ren" data-agd="rename" aria-label="Namen ändern" title="Namen ändern">${fi('pencil', 12)}</button>`;
        };
        box.querySelector('form').addEventListener('submit', (ev) => { ev.preventDefault(); done(true); });
        inp.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') { ev.stopPropagation(); done(false); } });
        inp.addEventListener('blur', () => setTimeout(() => { if (box.contains(inp)) done(true); }, 120));
      }
    });
    fig._paint = () => { if (c0 && !c0.setupRenamed && isLatest(fig)) take(); paint(false); };
    return fig;
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
    if (edit) { c.setupBase = edit.id; c.title = `${edit.name} bearbeiten`; c.auto = false; c.setupName = edit.name; c.setupAvatar = { figur: edit.figur, farbe: edit.farbe, aktion: edit.aktion, raster: edit.raster || null, beschreibung: edit.beschreibungBild || '' }; }
    saveChat();
    sync();
    if (edit) {
      say(`Was soll an **${edit.name}** anders werden? Schreib es einfach – zum Beispiel ein anderes Fach, eine andere Methode, ein neues Aussehen.`);
      setTimeout(() => document.getElementById('input')?.focus(), 160);
    } // ein neuer Agent startet über „chat-tab-switched“ (createTab), sobald der Chat aktiv ist
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
    if (inp) { if (on) { inp.dataset.ph0 ||= inp.placeholder; inp.placeholder = freshSetup(tab) ? 'Beschreib, wobei dein Agent helfen soll …' : 'Antworte hier …'; } else if (inp.dataset.ph0) { inp.placeholder = inp.dataset.ph0; delete inp.dataset.ph0; } }
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
    if (isSetup(tab)) startSetup(); else composerShown(true);
  }, 0));
  document.addEventListener('dogmodechange', () => setTimeout(greet, 0));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && app?.classList.contains('agent-setup') && !document.querySelector('.agent-picker.open, .cbx-overlay, #composer.asking') && !e.target.closest?.('textarea, input')) close(); });
  setTimeout(sync, 0);
  // „Erstell mir einen eigenen Agenten …“ im normalen Chat → gleich das Fenster öffnen (der Chat selbst baut keine Agenten)
  function intercept(text) {
    if (isSetup(tabNow())) { heroOut(); setTimeout(() => placeholder('Antworte hier …'), 400); return false; } // Einrichtung: ganz normal an die KI
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
        <div class="agv-side"><div class="agv-t">${state === 'wait' ? 'Wird gezeichnet …' : flow ? esc(chatData(tabNow())?.setupName || 'Aussehen') : 'Aussehen'}</div>
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
  // Anweisung lesbar machen: Zeilen in GROSSBUCHSTABEN = Abschnitts-Überschriften (wie im Dokument: „Rolle und Ziel“), Rest als Markdown
  const CAPS = /^[A-ZÄÖÜ][A-ZÄÖÜ0-9 ,/&()·\-–]{3,60}:?$/;
  // „TON UND SPRACHE“ → „Ton und Sprache“: Nomen groß, kleine Bindewörter klein (erstes Wort immer groß)
  const SMALL = new Set(['und', 'oder', 'mit', 'ohne', 'für', 'bei', 'von', 'vom', 'zu', 'zum', 'zur', 'im', 'in', 'an', 'am', 'auf', 'aus', 'als', 'der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'wie', 'was', 'wann', 'er', 'sie', 'es', 'nie', 'nicht', 'tut', 'macht', 'ist', 'sich', 'nach', 'vor', 'über', 'je', 'pro']);
  const niceHead = (h) => h.trim().replace(/:$/, '').toLowerCase().split(/(\s+|-|\/)/).map((w, i) => (!i || !SMALL.has(w) ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join('');
  const promptMd = (t) => String(t || '').split('\n').map((l) => (CAPS.test(l.trim()) ? `## ${niceHead(l)}` : l)).join('\n');
  const sectionsOf = (t) => (promptMd(t).match(/^## .+$/gm) || []).map((h) => h.slice(3));
  /* Anweisung im eigenen Fenster – sieht aus wie ein Dokument der App (gleiche Schrift, Größen, Abstände). Links die Gliederung:
     folgt beim Scrollen (aktueller Abschnitt hervorgehoben) und springt beim Antippen. „Bearbeiten“ = Text direkt ändern;
     bei gespeicherten Agenten führt „Im Chat verbessern“ in die Einrichtung (kein KI-Chat in diesem Fenster). */
  function openPrompt(p, opts = {}) {
    const av = p._av || p;
    const ov = document.createElement('div'); ov.className = 'agp-ov';
    const words = (t) => String(t || '').split(/\s+/).filter(Boolean).length.toLocaleString('de-DE');
    ov.innerHTML = `<div class="agp-sheet" role="dialog" aria-label="Anweisung von ${esc(p.name)}"><div class="agp-sh-head"><span class="agp-sh-art">${window.PixelDogs?.previewArt?.(av.figur, av.farbe, 32, av.raster) || ''}</span><div class="agp-sh-ti"><b>${esc(p.name)}</b><span class="agp-sh-wc">Anweisung · ${words(p.prompt)} Wörter</span></div><span class="ags-grow"></span>
      ${opts.improve ? `<button type="button" class="agp-btn" data-sh="improve">${fi('sparkle', 12)}Im Chat verbessern</button>` : ''}${opts.onSave ? `<button type="button" class="agp-btn" data-sh="edit">${fi('pencil', 12)}Bearbeiten</button>` : ''}
      <button type="button" class="ags-x" data-x aria-label="Schließen">${fi('x', 15)}</button></div>
      <div class="agp-sh-body"><nav class="agp-sh-nav" aria-label="Gliederung"></nav><div class="agp-sh-scroll"><article class="agp-doc"><h1 class="agp-doc-t">${esc(p.name)}</h1><p class="agp-doc-s">${esc(p.beschreibung || 'Eigener Agent')}</p><div class="agp-sh-text dc-content"></div></article></div></div></div>`;
    const sc = ov.querySelector('.agp-sh-scroll'), text = ov.querySelector('.agp-sh-text'), nav = ov.querySelector('.agp-sh-nav');
    let heads = [], editing = false;
    function draw() {
      if (typeof renderMarkdown === 'function') renderMarkdown(text, promptMd(p.prompt)); else text.textContent = p.prompt;
      heads = [...text.querySelectorAll('h2')];
      nav.replaceChildren(...heads.map((h, k) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = h.textContent; b.dataset.k = k; return b; }));
      nav.hidden = !heads.length;
      spy();
    }
    // Scrollspy: der Abschnitt, dessen Überschrift zuletzt oben angekommen ist; ganz unten = letzter
    function spy() {
      if (!heads.length || editing) return;
      const top = sc.scrollTop + 72, end = sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 4;
      let on = 0; heads.forEach((h, k) => { if (h.offsetTop <= top) on = k; });
      if (end) on = heads.length - 1;
      nav.querySelectorAll('button').forEach((b, k) => b.classList.toggle('on', k === on));
      const cur = nav.children[on]; if (cur && (cur.offsetTop < nav.scrollTop || cur.offsetTop > nav.scrollTop + nav.clientHeight - 30)) nav.scrollTop = cur.offsetTop - 40;
    }
    let raf = 0; sc.addEventListener('scroll', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(spy); }, { passive: true });
    nav.addEventListener('click', (e) => { const b = e.target.closest('button[data-k]'); if (!b) return; const h = heads[+b.dataset.k]; if (h) sc.scrollTo({ top: Math.max(0, h.offsetTop - 24), behavior: 'smooth' }); });
    function edit(on) {
      editing = on; ov.classList.toggle('editing', on);
      const btn = ov.querySelector('[data-sh="edit"]');
      if (on) {
        const ta = document.createElement('textarea'); ta.className = 'agp-edit'; ta.value = p.prompt; ta.spellcheck = false;
        text.replaceChildren(ta); nav.hidden = true;
        const fit = () => { ta.style.height = 'auto'; ta.style.height = `${ta.scrollHeight + 4}px`; };
        ta.addEventListener('input', fit); requestAnimationFrame(() => { fit(); ta.focus({ preventScroll: true }); });
        if (btn) btn.innerHTML = `${fi('check', 12)}Speichern`;
        btn?.classList.add('primary');
      } else {
        const v = text.querySelector('textarea')?.value;
        if (v != null && v.trim() && v !== p.prompt) { p.prompt = v.trim(); opts.onSave?.(p.prompt); ov.querySelector('.agp-sh-wc').textContent = `Anweisung · ${words(p.prompt)} Wörter`; }
        if (btn) btn.innerHTML = `${fi('pencil', 12)}Bearbeiten`;
        btn?.classList.remove('primary');
        draw();
      }
    }
    draw();
    const shut = () => { if (editing) edit(false); ov.classList.remove('in'); setTimeout(() => ov.remove(), 240); document.removeEventListener('keydown', esc1, true); };
    const esc1 = (e) => { if (e.key === 'Escape') { e.stopPropagation(); shut(); } };
    ov.addEventListener('click', (e) => {
      if (e.target === ov || e.target.closest('[data-x]')) { shut(); return; }
      const b = e.target.closest('[data-sh]'); if (!b) return;
      if (b.dataset.sh === 'edit') edit(!editing);
      if (b.dataset.sh === 'improve') { shut(); opts.improve(); }
    });
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
    if (chatData(tab)?.setupRenamed && chatData(tab)?.setupName) p.name = chatData(tab).setupName; // vom Nutzer umbenannt → dieser Name gilt
    const existing = list().find((a) => a.id === editId) || list().find((a) => a.name.toLowerCase() === p.name.toLowerCase());
    const av = finalAvatar(p), words = p.prompt.split(/\s+/).filter(Boolean).length;
    p._av = av;
    const secs = sectionsOf(p.prompt).length;
    fig.innerHTML = `<div class="agp-top"><div class="agp-art"><div class="agp-head">${window.PixelDogs?.previewArt?.(av.figur, av.farbe, 96, av.raster) || ''}</div></div><div class="agp-main">
        <div class="agp-name">${esc(p.name)}</div>
        <p class="agp-desc">${esc(p.beschreibung || 'Eigener Agent')}</p>
        <div class="agp-tags"><span>${esc(MODE_NAMES[MODES[p.verhalten]])}</span>${p.tools.filter((t) => t !== 'miniapps').map((t) => `<span>${esc(TOOL_NAMES[t])}</span>`).join('')}</div>
      </div></div>
      <div class="agp-acts"><button type="button" class="agp-btn agp-open" data-agp="prompt">${fi('file', 13)}Anweisung ansehen<em>${words.toLocaleString('de-DE')} Wörter${secs ? ` · ${secs} Abschnitte` : ''}</em></button><span class="ags-grow"></span><button type="button" class="agp-btn primary" data-agp="save">${existing ? 'Änderungen übernehmen' : 'Agent erstellen'}</button></div>`;
    fig.addEventListener('click', (e) => {
      const b = e.target.closest('[data-agp]'); if (!b) return;
      if (b.dataset.agp === 'prompt') { openPrompt(p, { onSave: () => { const w = fig.querySelector('.agp-open em'); if (w) w.textContent = `${p.prompt.split(/\s+/).filter(Boolean).length.toLocaleString('de-DE')} Wörter`; } }); return; }
      if (b.dataset.agp === 'save') {
        const l = list(), id = existing?.id || `u-${Date.now().toString(36)}`;
        const item = { id, name: p.name, beschreibung: p.beschreibung, begruessung: '', verhalten: p.verhalten, prompt: p.prompt, tools: p.tools, vorlage: '', ...av, aktion: '', at: Date.now() };
        const i = l.findIndex((a) => a.id === id);
        if (i >= 0) l[i] = item; else l.unshift(item);
        store(l);
        fig.querySelector('[data-agp="save"]').outerHTML = `<span class="agp-ok">${fi('check', 12)}${i >= 0 ? 'Übernommen' : 'Erstellt'}</span><button type="button" class="agp-btn primary" data-agp="start" data-id="${esc(id)}">Chat starten</button>`;
        celebrate(item, i < 0);
      } else if (b.dataset.agp === 'start') close(b.dataset.id);
    });
    return fig;
  }
  function render(target, text, opts = {}) {
    const pres = target.querySelectorAll('pre:has(code.language-agentprofil), pre:has(code.language-avatar), pre:has(code.language-agententwurf)');
    if (!pres.length) return;
    if (opts.live) target._agLive = true;
    const closed = (lang) => (String(text).match(new RegExp('```' + lang + '[^\\n]*\\n[\\s\\S]*?\\n```', 'g')) || []).length;
    const done = { agentprofil: closed('agentprofil'), avatar: closed('avatar'), agententwurf: closed('agententwurf') };
    const keep = (target._agp ||= new Map()), n = { agentprofil: 0, avatar: 0, agententwurf: 0 };
    pres.forEach((pre) => {
      const code = pre.querySelector('code'), raw = code.textContent;
      const lang = code.classList.contains('language-avatar') ? 'avatar' : code.classList.contains('language-agententwurf') ? 'agententwurf' : 'agentprofil';
      const i = n[lang]++, fin = !opts.live || i < done[lang];
      if (lang === 'agententwurf') {
        const d = fin ? parseDraft(raw) : null;
        if (!d) { pre.remove(); return; }
        const k = `ad|${i}|${raw}`;
        const fresh = !keep.has(k);
        if (fresh) keep.set(k, draftCard(d, !!target._agLive));
        pre.replaceWith(keep.get(k));
        if (fresh) { markDrafts(); keep.get(k)._paint(); }
        return;
      }
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
      return { agent: 'general', setup: 'agent', ...(c?.setupWish ? { setupWish: c.setupWish } : {}),
        ...(c?.setupName ? { setupInfo: { name: c.setupName, aussehen: c.setupAvatar?.beschreibung || '', umbenannt: !!c.setupRenamed, bild: !!c.setupAvatar?.raster } } : {}),
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
      + `<button type="button" class="ags-ib" data-ags-doc="${esc(a.id)}" aria-label="Anweisung ansehen" title="Anweisung ansehen">${fi('file', 13)}</button><button type="button" class="ags-ib" data-ags-edit="${esc(a.id)}" aria-label="Im Chat bearbeiten" title="Im Chat bearbeiten">${fi('pencil', 13)}</button><button type="button" class="ags-ib del${delArm === a.id ? ' sure' : ''}" data-ags-del="${esc(a.id)}" aria-label="Löschen">${delArm === a.id ? 'Wirklich?' : fi('trash', 13)}</button></div>`).join('');
    return `<h2>Eigene Agenten</h2><div class="st-card">${rows}<div class="st-row ags-new" data-ags-new role="button" tabindex="0"><span class="ags-plus">${fi('plus', 13)}</span><span class="st-name">Neuen Agenten erstellen</span><span class="grow"></span><span class="st-ws-chev"><svg width="12" height="12" aria-hidden="true"><use href="#o-chev"/></svg></span></div></div>`;
  }
  // gespeicherter Agent: Anweisung ansehen, direkt ändern (wird gespeichert) oder im Einrichtungs-Chat verbessern
  function showSaved(a) {
    const p = { ...a, _av: a };
    openPrompt(p, {
      onSave: (prompt) => { const l = list(), i = l.findIndex((x) => x.id === a.id); if (i >= 0) { l[i] = { ...l[i], prompt, at: Date.now() }; store(l); } },
      improve: () => { const cur = byId(a.id); if (cur) open({ edit: cur }); },
    });
  }
  function settingsClick(e, redraw) {
    const t = e.target;
    if (t.closest('[data-ags-new]')) { open(); return true; }
    const u = t.closest('[data-ags-use]'); if (u) { window.PixelDogs?.select(u.dataset.agsUse); setTimeout(redraw, 60); return true; }
    const ed = t.closest('[data-ags-edit]'); if (ed) { const a = byId(ed.dataset.agsEdit); if (a) open({ edit: a }); return true; }
    const dc = t.closest('[data-ags-doc]'); if (dc) { const a = byId(dc.dataset.agsDoc); if (a) showSaved(a); return true; }
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

  return { open: (o) => open(o && typeof o === 'object' && !o.id ? o : o ? { edit: o } : {}), close, render, list, parseProfile, parseAvatar, intercept, pixelate, showSaved, promptMd };
})();
window.AgentBuilder = AgentBuilder;
