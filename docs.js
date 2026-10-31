/* ===================================================================
   Dokumente – das Hauptsystem der App
   - Seitenleiste: „Dokumente“ (Liste mit Suche) und „Projekte“ (aufklappbar, darin die Dokumente)
   - jedes Dokument öffnet sich als eigener Tab: Titel, Beschreibung, Strich, Text (Format-Menü, Ask AI)
   - rechts ein Seitenfenster zum Auf-/Zuklappen (vorerst leer)
   - der Agent im Chat kann Dokumente anlegen und bearbeiten (Docs.add / Docs.update)
   - gespeichert als Dateien im Ordner „dokumente/“ (Server), Ersatz im Browser
   - Tags teilen sich Dokumente und Aufgaben
   =================================================================== */
const Docs = (() => {
  const LS = 'docs.v1';
  const TAG_KEY = 'tasks.tags.v1';
  const MONTHS = ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sep.', 'Okt.', 'Nov.', 'Dez.'];
  const fi = (n, s = 14) => `<svg width="${s}" height="${s}" aria-hidden="true"><use href="#f-${n}"/></svg>`;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const newId = (p) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };

  let docs = [];
  let projects = []; // { id, name, c }
  let ready = false;
  const loadTags = () => { try { return JSON.parse(localStorage.getItem(TAG_KEY)) || []; } catch { return []; } };
  let tags = loadTags();
  const saveTags = () => { try { localStorage.setItem(TAG_KEY, JSON.stringify(tags)); } catch {} window.dispatchEvent(new CustomEvent('tags-changed', { detail: 'docs' })); };
  window.addEventListener('tags-changed', (e) => { if (e.detail !== 'docs') tags = loadTags(); });
  const tagOf = (id) => tags.find((g) => g.id === id);
  const projOf = (id) => projects.find((p) => p.id === id);
  const docOf = (id) => docs.find((d) => d.id === id);
  // Workspace: jedes Dokument gehört zu einem Workspace (ältere ohne Angabe: „main“); Listen zeigen nur den aktiven
  const wsNow = () => window.Workspaces?.active() || 'main';
  const inWs = (d) => (d.ws || 'main') === wsNow();

  /* ---------- Laden / Speichern ---------- */
  let saveT = 0;
  function save() {
    if (!ready) return;
    clearTimeout(saveT);
    saveT = setTimeout(write, 400);
  }
  // gelöschte Dokumente werden dem Server ausdrücklich gemeldet – er löscht nie etwas, nur weil es in der Liste fehlt
  const deletedIds = new Set();
  // zuletzt an den Server geschickter Stand je Dokument – geschickt werden nur geänderte (Vercel: höchstens ~4,5 MB je Anfrage)
  const sentDocs = new Map();
  let sentProjects = '';
  function write() {
    clearTimeout(saveT);
    if (!ready) return;
    const sent = [...deletedIds];
    const strs = new Map(docs.map((d) => [d.id, JSON.stringify(d)]));
    const changed = docs.filter((d) => sentDocs.get(d.id) !== strs.get(d.id));
    const proj = JSON.stringify(projects);
    if (changed.length || sent.length || proj !== sentProjects) {
      const body = JSON.stringify({ docs: changed, projects, deleted: sent });
      fetch('/api/docs', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body, keepalive: body.length < 60000 })
        .then((r) => { if (!r.ok) return; sent.forEach((id) => deletedIds.delete(id)); changed.forEach((d) => sentDocs.set(d.id, strs.get(d.id))); sentProjects = proj; }).catch(() => {});
    }
    try { localStorage.setItem(LS, JSON.stringify({ docs, projects, deleted: sent })); } catch {}
  }
  window.addEventListener('pagehide', write);
  (async () => {
    // Nur vom Server laden. Ist er (z. B. beim Neustart) kurz nicht erreichbar: weiter versuchen und so lange
    // nichts speichern – nie einen alten Stand aus dem Browser übernehmen (der würde den Server überschreiben).
    let data = null;
    for (let i = 0; !data; i++) {
      try { const r = await fetch('/api/docs'); if (r.ok) data = await r.json(); } catch {}
      if (!data) await new Promise((res) => setTimeout(res, Math.min(5000, 600 + i * 400)));
    }
    // Rettung: was der Browser-Speicher noch hat, auf dem Server aber fehlt, erst sichern (wiederherstellung/), dann weiter
    try {
      const old = JSON.parse(localStorage.getItem(LS) || 'null');
      const have = new Set((data.docs || []).map((d) => d.id));
      const missing = (old?.docs || []).filter((d) => d?.id && !have.has(d.id) && !isEmpty(d));
      if (missing.length) await fetch('/api/recovery', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source: `Browser-Speicher ${location.origin}`, docs: missing }) });
    } catch {}
    docs = Array.isArray(data?.docs) ? data.docs : [];
    projects = Array.isArray(data?.projects) ? data.projects : [];
    docs.forEach((d) => sentDocs.set(d.id, JSON.stringify(d))); // so steht es schon auf dem Server
    sentProjects = JSON.stringify(projects);
    ready = true;
    renderSide();
    if (list.open) list.render();
    if (editor.open) editor.redraw();
  })();

  const relTime = (t) => {
    const s = Math.round((Date.now() - t) / 1000);
    if (s < 60) return 'Gerade eben';
    if (s < 3600) return `Vor ${Math.round(s / 60)} Min.`;
    if (s < 86400) return `Vor ${Math.round(s / 3600)} Std.`;
    const d = new Date(t);
    return `${d.getDate()}. ${MONTHS[d.getMonth()]}${d.getFullYear() !== new Date().getFullYear() ? ` ${d.getFullYear()}` : ''}`;
  };
  // Aufwand im Dokument-Chat (eigene Wahl, nur Stufen – kein Modellname)
  const DCC_EFF_LABEL = { auto: 'Auto', low: 'Low', medium: 'Medium', high: 'High', max: 'Max' };
  const dccEffort = () => { const v = localStorage.getItem('docs.chatEffort'); return DCC_EFF_LABEL[v] ? v : 'auto'; };
  const docIcon = (d) => (d?.icon && window.DocIcons?.has(d.icon.name) && /^#[\da-f]{6}$/i.test(d.icon.c || '') ? d.icon : null);
  const plain = (html) => { const d = document.createElement('div'); d.innerHTML = html || ''; return d.textContent || ''; };
  // leer = kein Titel, keine Beschreibung, kein Text → erscheint weder als Tab noch in Listen
  const isEmpty = (d) => !d.title.trim() && !(d.subtitle || '').trim() && !plain(d.content).trim() && !/data-blk|<hr|data-doclink|<table|data-todo|data-callout|data-math/i.test(d.content || '');
  // KI-HTML säubern: nur einfache Textauszeichnung, keine Skripte/Styles außer Farbe und Ausrichtung
  const ALLOWED = new Set(['H1', 'H2', 'H3', 'H4', 'P', 'UL', 'OL', 'LI', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'BLOCKQUOTE', 'BR', 'A', 'SPAN', 'DIV', 'FONT', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD', 'HR', 'PRE', 'CODE', 'SUP', 'SUB']); // PRE/CODE: Code aus dem Chat, SUP/SUB: x², H₂O
  function clean(html) {
    const t = document.createElement('template'); t.innerHTML = String(html || '');
    const walk = (n) => [...n.childNodes].forEach((c) => {
      if (c.nodeType === 3) return;
      if (c.nodeType !== 1 || /^(SCRIPT|STYLE|IFRAME|OBJECT|EMBED|IMG|SVG|FORM|INPUT)$/i.test(c.tagName)) { c.remove(); return; }
      walk(c);
      // tiefere Überschriften (h5/h6) werden zu h4 – nicht zu losem Text
      if (/^H[56]$/.test(c.tagName)) { const h = document.createElement('h4'); h.append(...c.childNodes); c.replaceWith(h); return; }
      if (!ALLOWED.has(c.tagName)) { c.replaceWith(...c.childNodes); return; }
      [...c.attributes].forEach((a) => {
        const keep = (c.tagName === 'A' && a.name === 'href' && /^https?:\/\//i.test(a.value))
          || (a.name === 'style' && /^\s*((color|text-align)\s*:\s*[#\w(),.%\s-]+;?\s*)+$/i.test(a.value))
          || (c.tagName === 'FONT' && a.name === 'color' && /^#?[\w]+$/.test(a.value))
          || (c.tagName === 'DIV' && ((a.name === 'data-viz' && /^(chart|mindmap|timeline|illustration|stock)$/.test(a.value)) || a.name === 'data-spec'))
          || (c.tagName === 'DIV' && ((a.name === 'data-blk' && window.DocBlocks?.TYPES.includes(a.value)) || a.name === 'data-cfg' || a.name === 'data-callout' || a.name === 'data-solid' || (a.name === 'data-radius' && /^\d{1,2}$/.test(a.value))))
          || (c.tagName === 'UL' && a.name === 'data-todo') || (c.tagName === 'LI' && a.name === 'data-done')
          || (c.tagName === 'TABLE' && ((a.name === 'data-name' && a.value.length <= 80) || (a.name === 'data-icon' && /^d:[\w-]{1,30}$/.test(a.value))))
          || (c.tagName === 'A' && a.name === 'data-doclink' && /^[\w-]{1,40}$/.test(a.value))
          || (c.tagName === 'SPAN' && (a.name === 'data-math' || a.name === 'data-display')); // Formel (TeX) – wird im Dokument mit KaTeX gesetzt
        if (!keep) c.removeAttribute(a.name);
      });
      if (c.tagName === 'A' && !c.hasAttribute('data-doclink')) { c.setAttribute('target', '_blank'); c.setAttribute('rel', 'noopener'); }
      if (c.tagName === 'DIV' && c.hasAttribute('data-viz')) { c.className = 'dc-viz'; c.replaceChildren(); }
      if (c.tagName === 'DIV' && c.hasAttribute('data-blk')) { c.className = 'dc-blk'; c.replaceChildren(); }
      if (c.tagName === 'SPAN' && c.hasAttribute('data-math')) c.replaceChildren();
    });
    walk(t.content);
    return t.innerHTML;
  }

  // Stelle zum Ergänzen: Ende des Abschnitts unter der Überschrift „after“ (bis zur nächsten Überschrift gleicher oder höherer Ebene);
  // ohne passende Überschrift → null (= ans Ende)
  function sectionEnd(root, after) {
    const norm = (t) => String(t || '').toLowerCase().replace(/^[\d.\s]+/, '').replace(/\s+/g, ' ').trim();
    const want = norm(after);
    if (!want) return null;
    const heads = [...root.children].filter((n) => /^H[1-4]$/.test(n.tagName));
    const head = heads.find((h) => norm(h.textContent) === want) || heads.find((h) => norm(h.textContent).includes(want) || (want.length > 3 && want.includes(norm(h.textContent))));
    if (!head) return null;
    const lv = +head.tagName[1];
    let ref = head.nextElementSibling;
    while (ref && !(/^H[1-4]$/.test(ref.tagName) && +ref.tagName[1] <= lv)) ref = ref.nextElementSibling;
    return ref;
  }
  // Neues HTML in vorhandenes einsetzen (ohne Editor), z. B. für eine Änderung, die erst noch akzeptiert wird
  function insertInto(content, html, after = '') {
    const root = document.createElement('div'); root.innerHTML = content || '';
    const ref = sectionEnd(root, after);
    const tmp = document.createElement('div'); tmp.innerHTML = html || '';
    [...tmp.childNodes].forEach((n) => root.insertBefore(n, ref));
    return root.innerHTML;
  }

  /* ---------- Cover-Motive als Vektorgrafik (scharf in jeder Größe) ----------
     Jedes Motiv hat eine eigene Form (Zufall mit festem Startwert) und eine eigene Farbpalette. */
  const CW = 1600, CH = 440; // gleiches Seitenverhältnis wie Banner, Kacheln und Vorschau → man sieht genau das, was später angezeigt wird
  const rng = (seed) => () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const svgUrl = (svg) => `center / cover no-repeat url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  // weiche Kurve quer über das Bild: Startpunkt + 3 Bögen mit zufälliger Höhe
  function curve(r, baseY, amp) {
    const y = () => baseY + (r() - 0.5) * 2 * amp;
    let d = `M -20 ${y().toFixed(1)}`;
    const seg = (CW + 40) / 3;
    for (let k = 0; k < 3; k++) {
      const x0 = -20 + seg * k;
      d += ` C ${(x0 + seg * 0.35).toFixed(1)} ${y().toFixed(1)}, ${(x0 + seg * 0.65).toFixed(1)} ${y().toFixed(1)}, ${(x0 + seg).toFixed(1)} ${y().toFixed(1)}`;
    }
    return d;
  }
  // Wellen: geschichtete Bänder, jedes mit eigenem Verlauf, weicher Schatten nach oben und heller Kante
  function artWaves(pal, seed) {
    const r = rng(seed), n = pal.length - 1;
    let defs = `<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${pal[0]}"/><stop offset="1" stop-color="${pal[1]}"/></linearGradient>
      <filter id="sh" x="-10%" y="-30%" width="120%" height="160%"><feDropShadow dx="0" dy="-10" stdDeviation="16" flood-color="#000" flood-opacity=".16"/></filter>`;
    let body = `<rect width="${CW}" height="${CH}" fill="url(#bg)"/>`;
    for (let i = 0; i < n; i++) {
      const a = pal[i], b = pal[i + 1];
      const tilt = r() > 0.5;
      defs += `<linearGradient id="g${i}" x1="${tilt ? 0 : 1}" y1="0" x2="${tilt ? 1 : 0}" y2="1"><stop offset="0" stop-color="${b}"/><stop offset=".55" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`;
      const d = curve(r, CH * (0.18 + (i * 0.7) / n), CH * 0.12);
      body += `<path d="${d} L ${CW + 20} ${CH + 20} L -20 ${CH + 20} Z" fill="url(#g${i})" filter="url(#sh)"/>`;
      body += `<path d="${d}" fill="none" stroke="#fff" stroke-opacity=".12" stroke-width="2"/>`;
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CW} ${CH}" preserveAspectRatio="xMidYMid slice"><defs>${defs}</defs>${body}</svg>`;
  }
  // Dünen: Himmel mit Leuchten, wenige breite Hügel, nach vorne dunkler
  function artDunes(pal, seed) {
    const r = rng(seed);
    const [sky1, sky2, sun, ...hills] = pal;
    const sx = 300 + r() * 1000, sy = CH * (0.32 + r() * 0.12);
    let defs = `<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky1}"/><stop offset="1" stop-color="${sky2}"/></linearGradient>
      <radialGradient id="sun" cx="${sx}" cy="${sy}" r="420" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${sun}" stop-opacity=".95"/><stop offset=".18" stop-color="${sun}" stop-opacity=".55"/><stop offset="1" stop-color="${sun}" stop-opacity="0"/></radialGradient>`;
    let body = `<rect width="${CW}" height="${CH}" fill="url(#sky)"/><rect width="${CW}" height="${CH}" fill="url(#sun)"/>`;
    hills.forEach((c, i) => {
      defs += `<linearGradient id="h${i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c}"/><stop offset="1" stop-color="${c}" stop-opacity=".85"/></linearGradient>`;
      const d = curve(r, CH * (0.5 + i * 0.16), CH * 0.08);
      body += `<path d="${d} L ${CW + 20} ${CH + 20} L -20 ${CH + 20} Z" fill="url(#h${i})"/>`;
    });
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CW} ${CH}" preserveAspectRatio="xMidYMid slice"><defs>${defs}</defs>${body}</svg>`;
  }
  // Aurora: dunkler Grund, große weich verschwommene Lichtflächen
  function artAurora(pal, seed) {
    const r = rng(seed), [bg, ...glows] = pal;
    let body = `<rect width="${CW}" height="${CH}" fill="${bg}"/><g filter="url(#b)">`;
    glows.forEach((c, i) => {
      const cx = (0.12 + r() * 0.76) * CW, cy = (0.15 + r() * 0.7) * CH, rx = 260 + r() * 360, ry = 110 + r() * 150, rot = (r() - 0.5) * 50;
      body += `<ellipse cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" rx="${rx.toFixed(0)}" ry="${ry.toFixed(0)}" fill="${c}" opacity="${(0.75 + r() * 0.25).toFixed(2)}" transform="rotate(${rot.toFixed(1)} ${cx.toFixed(0)} ${cy.toFixed(0)})"/>`;
      if (i === 0) body += `<ellipse cx="${(CW - cx).toFixed(0)}" cy="${(CH - cy).toFixed(0)}" rx="${(rx * 0.7).toFixed(0)}" ry="${(ry * 0.8).toFixed(0)}" fill="${c}" opacity=".55"/>`;
    });
    body += '</g>';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CW} ${CH}" preserveAspectRatio="xMidYMid slice"><defs><filter id="b" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="90"/></filter></defs>${body}</svg>`;
  }
  // Linien: Höhenlinien mit Farbverlauf und farbigem Leuchten; Abstand, Schwung und Anzahl je Motiv verschieden
  function artLines(pal, seed) {
    const r = rng(seed), [bg, c1, c2] = pal;
    const base = [], count = 16 + Math.floor(r() * 12), gap = 14 + r() * 16, swing = 10 + r() * 30;
    for (let k = 0; k < 4; k++) base.push(CH * (0.15 + r() * 0.7));
    const gx = (0.15 + r() * 0.7) * CW, gy = (0.2 + r() * 0.6) * CH;
    let body = `<rect width="${CW}" height="${CH}" fill="${bg}"/>
      <g filter="url(#b)"><ellipse cx="${gx.toFixed(0)}" cy="${gy.toFixed(0)}" rx="520" ry="200" fill="${c1}" opacity=".35"/><ellipse cx="${(CW - gx).toFixed(0)}" cy="${(CH - gy).toFixed(0)}" rx="420" ry="170" fill="${c2}" opacity=".28"/></g>`;
    for (let i = 0; i < count; i++) {
      const off = (i - count / 2) * gap;
      let d = `M -20 ${(base[0] + off).toFixed(1)}`;
      const seg = (CW + 40) / 3;
      for (let k = 0; k < 3; k++) {
        const x0 = -20 + seg * k, w = Math.sin((i + k * 2) * 0.45) * swing;
        d += ` C ${(x0 + seg * 0.35).toFixed(1)} ${(base[k] + off + w).toFixed(1)}, ${(x0 + seg * 0.65).toFixed(1)} ${(base[k + 1] + off - w).toFixed(1)}, ${(x0 + seg).toFixed(1)} ${(base[k + 1] + off).toFixed(1)}`;
      }
      const major = i % 4 === 0;
      body += `<path d="${d}" fill="none" stroke="url(#l)" stroke-width="${major ? 2.6 : 1.5}" stroke-opacity="${major ? 0.95 : 0.6}"/>`;
    }
    body += `<rect width="${CW}" height="${CH}" fill="url(#v)"/>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CW} ${CH}" preserveAspectRatio="xMidYMid slice"><defs><filter id="b" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="80"/></filter><linearGradient id="l" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient><radialGradient id="v" cx=".5" cy=".5" r=".8"><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".4"/></radialGradient></defs>${body}</svg>`;
  }

  // Bänder: breite, fließende Farbbänder quer übers Bild, jedes mit eigenem Verlauf und weichem Schatten
  function artRibbons(pal, seed) {
    const r = rng(seed), [bg1, bg2, ...cols] = pal;
    let defs = `<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bg1}"/><stop offset="1" stop-color="${bg2}"/></linearGradient>
      <filter id="sh" x="-20%" y="-40%" width="140%" height="180%"><feDropShadow dx="0" dy="14" stdDeviation="22" flood-color="#000" flood-opacity=".32"/></filter>`;
    let body = `<rect width="${CW}" height="${CH}" fill="url(#bg)"/>`;
    cols.forEach((c, i) => {
      const y0 = CH * (0.05 + i * 0.28) + (r() - 0.5) * 60, thick = 120 + r() * 70, tilt = 160 + r() * 120;
      const top = `M -40 ${(y0 + tilt).toFixed(0)} C ${CW * 0.3} ${(y0 + tilt - 260 * r()).toFixed(0)}, ${CW * 0.6} ${(y0 - 120 + 200 * r()).toFixed(0)}, ${CW + 40} ${(y0 - 60).toFixed(0)}`;
      const bot = `L ${CW + 40} ${(y0 - 60 + thick).toFixed(0)} C ${CW * 0.6} ${(y0 - 120 + 200 * r() + thick).toFixed(0)}, ${CW * 0.3} ${(y0 + tilt - 260 * r() + thick * 1.2).toFixed(0)}, -40 ${(y0 + tilt + thick).toFixed(0)} Z`;
      defs += `<linearGradient id="g${i}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${c}" stop-opacity=".95"/><stop offset=".5" stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="${c}"/></linearGradient>
        <linearGradient id="h${i}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${c}"/><stop offset="1" stop-color="${c}" stop-opacity=".8"/></linearGradient>`;
      body += `<path d="${top} ${bot}" fill="url(#h${i})" filter="url(#sh)"/><path d="${top} ${bot}" fill="url(#g${i})" opacity=".55"/>`;
    });
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CW} ${CH}" preserveAspectRatio="xMidYMid slice"><defs>${defs}</defs>${body}</svg>`;
  }
  // Bögen: geschichtete Kreisbögen aus einer Ecke, von dunkel nach hell
  function artArcs(pal, seed) {
    const r = rng(seed), n = pal.length;
    const cx = r() > 0.5 ? CW * 1.02 : -CW * 0.02, cy = CH * (0.95 + r() * 0.3);
    let defs = '<filter id="sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="-6" stdDeviation="14" flood-color="#000" flood-opacity=".3"/></filter>';
    let body = `<rect width="${CW}" height="${CH}" fill="${pal[0]}"/>`;
    for (let i = 1; i < n; i++) {
      const rad = (CW * 1.25) * (1 - (i - 1) / n);
      defs += `<radialGradient id="a${i}" cx="${cx}" cy="${cy}" r="${rad}" gradientUnits="userSpaceOnUse"><stop offset=".6" stop-color="${pal[i]}"/><stop offset="1" stop-color="${pal[i]}" stop-opacity=".85"/></radialGradient>`;
      body += `<circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${rad.toFixed(0)}" fill="url(#a${i})" filter="url(#sh)"/>`;
      body += `<circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${(rad - 1).toFixed(0)}" fill="none" stroke="#fff" stroke-opacity=".14" stroke-width="2"/>`;
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CW} ${CH}" preserveAspectRatio="xMidYMid slice"><defs>${defs}</defs>${body}</svg>`;
  }
  // Schlicht: ruhiger Verlauf in einer Farbe mit weichem Lichtfleck und leichter Vignette
  function artPlain(pal) {
    const [dark, mid, light] = pal;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CW} ${CH}" preserveAspectRatio="xMidYMid slice"><defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${mid}"/><stop offset="1" stop-color="${dark}"/></linearGradient>
      <radialGradient id="l" cx="22%" cy="12%" r="70%"><stop offset="0" stop-color="${light}" stop-opacity=".75"/><stop offset="1" stop-color="${light}" stop-opacity="0"/></radialGradient>
      <radialGradient id="v" cx="50%" cy="50%" r="80%"><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".28"/></radialGradient></defs>
      <rect width="${CW}" height="${CH}" fill="url(#bg)"/><rect width="${CW}" height="${CH}" fill="url(#l)"/><rect width="${CW}" height="${CH}" fill="url(#v)"/></svg>`;
  }

  // Gipfel: spitze Berggipfel in mehreren Lagen (hinten hell, vorne dunkel), Dunst dazwischen
  function artPeaks(pal, seed) {
    const r = rng(seed), [sky1, sky2, ...layers] = pal;
    let defs = `<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky1}"/><stop offset="1" stop-color="${sky2}"/></linearGradient>
      <linearGradient id="mist" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity=".16"/></linearGradient>`;
    let body = `<rect width="${CW}" height="${CH}" fill="url(#sky)"/>`;
    layers.forEach((c, i) => {
      const base = CH * (0.42 + i * 0.13), amp = CH * (0.26 - i * 0.04), n = 6 + i * 2;
      let d = `M -20 ${(base + r() * 20).toFixed(0)}`;
      for (let k = 1; k <= n; k++) {
        const x = (CW + 40) * (k / n) - 20, peak = k % 2 === 1;
        d += ` L ${(x - (CW / n) * (0.3 + r() * 0.3)).toFixed(0)} ${(peak ? base - amp * (0.5 + r() * 0.5) : base - amp * 0.1 * r()).toFixed(0)}`;
        d += ` L ${x.toFixed(0)} ${(base - amp * 0.15 * r()).toFixed(0)}`;
      }
      d += ` L ${CW + 20} ${CH + 20} L -20 ${CH + 20} Z`;
      defs += `<linearGradient id="m${i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c}"/><stop offset="1" stop-color="${c}" stop-opacity=".9"/></linearGradient>`;
      body += `<path d="${d}" fill="url(#m${i})"/>`;
      if (i < layers.length - 1) body += `<rect y="${(base - amp * 0.2).toFixed(0)}" width="${CW}" height="${(CH * 0.16).toFixed(0)}" fill="url(#mist)"/>`;
    });
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CW} ${CH}" preserveAspectRatio="xMidYMid slice"><defs>${defs}</defs>${body}</svg>`;
  }
  // Prisma: facettierte Dreiecksfläche – Farben laufen von links nach rechts, jede Facette leicht heller/dunkler
  function artPrism(pal, seed) {
    const r = rng(seed), cols = 9, rows = 4, pts = [];
    for (let y = 0; y <= rows; y++) {
      const row = [];
      for (let x = 0; x <= cols; x++) {
        const edgeX = x === 0 || x === cols, edgeY = y === 0 || y === rows;
        row.push([(x / cols) * CW + (edgeX ? 0 : (r() - 0.5) * 120), (y / rows) * CH + (edgeY ? 0 : (r() - 0.5) * 90)]);
      }
      pts.push(row);
    }
    const colorAt = (fx) => pal[Math.min(pal.length - 1, Math.floor(fx * pal.length))];
    let body = '';
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const a = pts[y][x], b = pts[y][x + 1], c = pts[y + 1][x], d = pts[y + 1][x + 1];
      [[a, b, d], [a, d, c]].forEach((t) => {
        const cx = (t[0][0] + t[1][0] + t[2][0]) / 3 / CW;
        const shade = r();
        body += `<polygon points="${t.map((p) => p.map((v) => v.toFixed(0)).join(',')).join(' ')}" fill="${colorAt(cx)}"/>`;
        body += `<polygon points="${t.map((p) => p.map((v) => v.toFixed(0)).join(',')).join(' ')}" fill="${shade > 0.5 ? '#fff' : '#000'}" fill-opacity="${(Math.abs(shade - 0.5) * 0.32).toFixed(2)}" stroke="#fff" stroke-opacity=".06" stroke-width="1"/>`;
      });
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CW} ${CH}" preserveAspectRatio="xMidYMid slice">${body}</svg>`;
  }
  // Punkte: feines Punkteraster auf dunklem Grund, Punkte wachsen zu einem farbigen Leuchten hin
  function artDots(pal, seed) {
    const r = rng(seed), [bg, glow1, glow2, dot] = pal;
    const gx = (0.25 + r() * 0.5) * CW, gy = (0.3 + r() * 0.4) * CH;
    let body = `<rect width="${CW}" height="${CH}" fill="${bg}"/><g filter="url(#b)"><ellipse cx="${gx.toFixed(0)}" cy="${gy.toFixed(0)}" rx="460" ry="220" fill="${glow1}" opacity=".7"/><ellipse cx="${(gx + 260).toFixed(0)}" cy="${(gy + 60).toFixed(0)}" rx="300" ry="160" fill="${glow2}" opacity=".55"/></g>`;
    const step = 26, maxD = Math.hypot(CW, CH) * 0.55;
    for (let y = step / 2; y < CH; y += step) for (let x = step / 2; x < CW; x += step) {
      const k = Math.max(0, 1 - Math.hypot(x - gx, y - gy) / maxD);
      const rad = 1 + k * k * 4.5;
      body += `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${rad.toFixed(1)}" fill="${dot}" fill-opacity="${(0.25 + k * 0.6).toFixed(2)}"/>`;
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CW} ${CH}" preserveAspectRatio="xMidYMid slice"><defs><filter id="b" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="80"/></filter></defs>${body}</svg>`;
  }

  const svgWrap = (defs, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CW} ${CH}" preserveAspectRatio="xMidYMid slice"><defs>${defs}</defs>${body}</svg>`;
  // Horizont: perspektivisches Gitter läuft zu einer leuchtenden Sonne am Horizont
  function artHorizon(pal) {
    const [sky1, sky2, sun, line, ground] = pal, hy = CH * 0.56, cx = CW / 2;
    let body = `<rect width="${CW}" height="${CH}" fill="url(#sky)"/><circle cx="${cx}" cy="${hy}" r="150" fill="url(#sun)"/><circle cx="${cx}" cy="${hy}" r="320" fill="url(#glow)"/>
      <rect y="${hy}" width="${CW}" height="${CH - hy}" fill="${ground}"/>`;
    for (let i = -14; i <= 14; i++) body += `<line x1="${cx + i * 22}" y1="${hy}" x2="${cx + i * 190}" y2="${CH}" stroke="${line}" stroke-opacity=".55" stroke-width="1.5"/>`;
    for (let k = 1; k <= 9; k++) { const y = hy + (CH - hy) * Math.pow(k / 9, 2); body += `<line x1="0" y1="${y.toFixed(0)}" x2="${CW}" y2="${y.toFixed(0)}" stroke="${line}" stroke-opacity="${(0.25 + k * 0.05).toFixed(2)}" stroke-width="1.5"/>`; }
    body += `<rect y="${hy - 1}" width="${CW}" height="60" fill="url(#fade)"/>`;
    return svgWrap(`<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky1}"/><stop offset="1" stop-color="${sky2}"/></linearGradient>
      <radialGradient id="sun"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset=".35" stop-color="${sun}"/><stop offset="1" stop-color="${sun}" stop-opacity=".9"/></radialGradient>
      <radialGradient id="glow"><stop offset="0" stop-color="${sun}" stop-opacity=".45"/><stop offset="1" stop-color="${sun}" stop-opacity="0"/></radialGradient>
      <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sun}" stop-opacity=".35"/><stop offset="1" stop-color="${sun}" stop-opacity="0"/></linearGradient>`, body);
  }
  // Bokeh: weich verschwommene Lichtkreise in verschiedenen Größen
  function artBokeh(pal, seed) {
    const r = rng(seed), [bg1, bg2, ...lights] = pal;
    let body = `<rect width="${CW}" height="${CH}" fill="url(#bg)"/><g filter="url(#soft)">`;
    for (let i = 0; i < 26; i++) {
      const rad = 30 + r() * 120, c = lights[i % lights.length];
      body += `<circle cx="${(r() * CW).toFixed(0)}" cy="${(r() * CH).toFixed(0)}" r="${rad.toFixed(0)}" fill="${c}" fill-opacity="${(0.12 + r() * 0.35).toFixed(2)}"/>`;
    }
    body += '</g>';
    for (let i = 0; i < 10; i++) body += `<circle cx="${(r() * CW).toFixed(0)}" cy="${(r() * CH).toFixed(0)}" r="${(14 + r() * 40).toFixed(0)}" fill="none" stroke="#fff" stroke-opacity=".12" stroke-width="2"/>`;
    return svgWrap(`<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bg1}"/><stop offset="1" stop-color="${bg2}"/></linearGradient><filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="9"/></filter>`, body);
  }
  // Bauhaus: klare geometrische Formen in Abstufungen einer Farbe
  function artBauhaus(pal, seed) {
    const r = rng(seed), [bg, ...cols] = pal, cell = CH / 2, n = Math.ceil(CW / cell);
    let body = `<rect width="${CW}" height="${CH}" fill="${bg}"/>`;
    for (let row = 0; row < 2; row++) for (let i = 0; i < n; i++) {
      const x = i * cell, y = row * cell, c = cols[Math.floor(r() * cols.length)], c2 = cols[Math.floor(r() * cols.length)], t = Math.floor(r() * 5), rot = Math.floor(r() * 4) * 90;
      body += `<g transform="rotate(${rot} ${x + cell / 2} ${y + cell / 2})"><rect x="${x}" y="${y}" width="${cell}" height="${cell}" fill="${c2}"/>`;
      if (t === 0) body += `<circle cx="${x + cell / 2}" cy="${y + cell / 2}" r="${cell * 0.38}" fill="${c}"/>`;
      else if (t === 1) body += `<path d="M ${x} ${y + cell} A ${cell} ${cell} 0 0 1 ${x + cell} ${y + cell} Z" fill="${c}"/>`;
      else if (t === 2) body += `<path d="M ${x} ${y} L ${x + cell} ${y} L ${x} ${y + cell} Z" fill="${c}"/>`;
      else if (t === 3) body += `<path d="M ${x} ${y} A ${cell} ${cell} 0 0 1 ${x + cell} ${y + cell} L ${x} ${y + cell} Z" fill="${c}"/>`;
      else body += `<rect x="${x + cell * 0.25}" y="${y + cell * 0.25}" width="${cell * 0.5}" height="${cell * 0.5}" fill="${c}"/>`;
      body += '</g>';
    }
    return svgWrap('', body);
  }
  // Seide: fließende Stofffalten aus vielen feinen, übereinanderliegenden Bändern
  function artSilk(pal, seed) {
    const r = rng(seed), [bg1, bg2, c1, c2] = pal;
    const a = [CH * (0.2 + r() * 0.3), CH * (0.4 + r() * 0.4), CH * (0.1 + r() * 0.4), CH * (0.3 + r() * 0.5)];
    let body = `<rect width="${CW}" height="${CH}" fill="url(#bg)"/>`;
    for (let i = 0; i < 34; i++) {
      const o = (i - 17) * 9, w = Math.sin(i * 0.35) * 40;
      body += `<path d="M -40 ${(a[0] + o).toFixed(0)} C ${CW * 0.3} ${(a[1] + o + w).toFixed(0)}, ${CW * 0.6} ${(a[2] + o - w).toFixed(0)}, ${CW + 40} ${(a[3] + o).toFixed(0)}" fill="none" stroke="url(#s)" stroke-width="${(6 + Math.abs(w) * 0.15).toFixed(1)}" stroke-opacity="${(0.18 + (i % 3) * 0.08).toFixed(2)}"/>`;
    }
    return svgWrap(`<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bg1}"/><stop offset="1" stop-color="${bg2}"/></linearGradient>
      <linearGradient id="s" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${c1}"/><stop offset=".5" stop-color="#fff"/><stop offset="1" stop-color="${c2}"/></linearGradient>`, body);
  }
  // Streifen: diagonale Streifen in unterschiedlicher Breite und Helligkeit
  function artStripes(pal, seed) {
    const r = rng(seed);
    let body = `<rect width="${CW}" height="${CH}" fill="${pal[0]}"/><g transform="rotate(-24 ${CW / 2} ${CH / 2})">`;
    for (let x = -CW * 0.4; x < CW * 1.4;) { const w = 30 + r() * 110; body += `<rect x="${x.toFixed(0)}" y="${-CH}" width="${w.toFixed(0)}" height="${CH * 3}" fill="${pal[1 + Math.floor(r() * (pal.length - 1))]}"/>`; x += w; }
    body += '</g><rect width="100%" height="100%" fill="url(#sh)"/>';
    return svgWrap('<linearGradient id="sh" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".12"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".25"/></linearGradient>', body);
  }
  // Wirbel: gedrehte, ineinanderliegende Ringe bilden eine Spirale
  function artSwirl(pal, seed) {
    const r = rng(seed), [bg, ...cols] = pal, cx = CW * (0.3 + r() * 0.4), cy = CH * (0.4 + r() * 0.2);
    let body = `<rect width="${CW}" height="${CH}" fill="${bg}"/>`;
    for (let i = 22; i >= 1; i--) {
      const s = i * 46, c = cols[i % cols.length];
      body += `<rect x="${(cx - s / 2).toFixed(0)}" y="${(cy - s / 2).toFixed(0)}" width="${s}" height="${s}" rx="${(s * 0.32).toFixed(0)}" fill="${c}" transform="rotate(${i * 9} ${cx.toFixed(0)} ${cy.toFixed(0)})" stroke="#000" stroke-opacity=".18" stroke-width="2"/>`;
    }
    return svgWrap('', body);
  }

  // Marmor: feine Adern (Rauschen) auf ruhigem Verlauf
  function artMarble(pal, seed) {
    const [bg1, bg2, vein, vein2] = pal;
    return svgWrap(`<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bg1}"/><stop offset="1" stop-color="${bg2}"/></linearGradient>
      <filter id="v1" x="0" y="0" width="100%" height="100%"><feTurbulence type="turbulence" baseFrequency="0.0016 0.0055" numOctaves="5" seed="${seed}"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  -7 0 0 0 1.25"/></filter>
      <filter id="v2" x="0" y="0" width="100%" height="100%"><feTurbulence type="turbulence" baseFrequency="0.003 0.009" numOctaves="4" seed="${seed + 7}"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  -10 0 0 0 1.1"/></filter>
      <mask id="m1"><rect width="${CW}" height="${CH}" fill="#fff" filter="url(#v1)"/></mask><mask id="m2"><rect width="${CW}" height="${CH}" fill="#fff" filter="url(#v2)"/></mask>
      <radialGradient id="l" cx="25%" cy="15%" r="80%"><stop offset="0" stop-color="#fff" stop-opacity=".18"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>`,
      `<rect width="${CW}" height="${CH}" fill="url(#bg)"/><rect width="${CW}" height="${CH}" fill="${vein}" mask="url(#m1)" opacity=".75"/><rect width="${CW}" height="${CH}" fill="${vein2}" mask="url(#m2)" opacity=".55"/><rect width="${CW}" height="${CH}" fill="url(#l)"/>`);
  }
  // Konfetti: verstreute Formen (Kreise, Striche, Dreiecke, Ringe) auf ruhiger Fläche
  function artConfetti(pal, seed) {
    const r = rng(seed), [bg, ...cols] = pal;
    let body = `<rect width="${CW}" height="${CH}" fill="${bg}"/>`;
    for (let i = 0; i < 70; i++) {
      const x = r() * CW, y = r() * CH, c = cols[i % cols.length], s = 8 + r() * 22, rot = Math.floor(r() * 180), t = i % 4;
      if (t === 0) body += `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${(s / 2).toFixed(1)}" fill="${c}"/>`;
      else if (t === 1) body += `<rect x="${(x - s).toFixed(0)}" y="${(y - 3).toFixed(0)}" width="${(s * 2).toFixed(0)}" height="7" rx="3.5" fill="${c}" transform="rotate(${rot} ${x.toFixed(0)} ${y.toFixed(0)})"/>`;
      else if (t === 2) body += `<path d="M ${x.toFixed(0)} ${(y - s).toFixed(0)} L ${(x + s).toFixed(0)} ${(y + s * 0.7).toFixed(0)} L ${(x - s).toFixed(0)} ${(y + s * 0.7).toFixed(0)} Z" fill="${c}" transform="rotate(${rot} ${x.toFixed(0)} ${y.toFixed(0)})"/>`;
      else body += `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${(s * 0.6).toFixed(1)}" fill="none" stroke="${c}" stroke-width="4"/>`;
    }
    return svgWrap('', body);
  }
  // Strahlen: Sonnenstrahlen aus einer Ecke, abwechselnd hell und dunkel, mit weichem Licht
  function artRays(pal, seed) {
    const r = rng(seed), [a, b, glow] = pal, cx = CW * (r() < 0.5 ? 0.12 : 0.88), cy = CH * 1.05, R = CW * 1.4, n = 36;
    let body = `<rect width="${CW}" height="${CH}" fill="${a}"/>`;
    for (let i = 0; i < n; i += 2) {
      const a1 = (i / n) * Math.PI * 2, a2 = ((i + 1) / n) * Math.PI * 2;
      body += `<path d="M ${cx} ${cy} L ${(cx + Math.cos(a1) * R).toFixed(0)} ${(cy + Math.sin(a1) * R).toFixed(0)} L ${(cx + Math.cos(a2) * R).toFixed(0)} ${(cy + Math.sin(a2) * R).toFixed(0)} Z" fill="${b}"/>`;
    }
    body += `<circle cx="${cx}" cy="${cy}" r="${CH * 1.1}" fill="url(#g)"/>`;
    return svgWrap(`<radialGradient id="g"><stop offset="0" stop-color="${glow}" stop-opacity=".9"/><stop offset=".45" stop-color="${glow}" stop-opacity=".25"/><stop offset="1" stop-color="${glow}" stop-opacity="0"/></radialGradient>`, body);
  }
  // Flüssig: weiche, ineinanderfließende Farbblasen (wie Lavalampe)
  function artBlobs(pal, seed) {
    const r = rng(seed), [bg, ...cols] = pal;
    let body = `<rect width="${CW}" height="${CH}" fill="${bg}"/><g filter="url(#goo)">`;
    for (let i = 0; i < 9; i++) body += `<circle cx="${(r() * CW).toFixed(0)}" cy="${(r() * CH).toFixed(0)}" r="${(90 + r() * 160).toFixed(0)}" fill="${cols[i % cols.length]}"/>`;
    body += '</g>';
    return svgWrap('<filter id="goo" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="38"/><feColorMatrix values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 26 -9"/></filter>', body);
  }
  // Mosaik: Dreiecks-Raster mit leichten Helligkeitsunterschieden (wie facettiertes Glas)
  function artMosaic(pal, seed) {
    const r = rng(seed), s = 110, rows = Math.ceil(CH / s) + 1, colsN = Math.ceil(CW / s) + 1;
    let body = '';
    for (let y = 0; y < rows; y++) for (let x = 0; x < colsN; x++) {
      const x0 = x * s, y0 = y * s, k = (x / colsN) * 0.6 + (y / rows) * 0.4;
      const pick = () => pal[Math.max(0, Math.min(pal.length - 1, Math.floor(k * (pal.length - 1) + (r() - 0.5) * 1.6)))];
      body += `<path d="M ${x0} ${y0} L ${x0 + s} ${y0} L ${x0} ${y0 + s} Z" fill="${pick()}"/><path d="M ${x0 + s} ${y0} L ${x0 + s} ${y0 + s} L ${x0} ${y0 + s} Z" fill="${pick()}"/>`;
    }
    return svgWrap('', body);
  }
  const COVER_GROUPS = [{ id: 'waves', name: 'Wellen' }, { id: 'dunes', name: 'Dünen' }, { id: 'aurora', name: 'Aurora' }, { id: 'lines', name: 'Linien' }];
  const art = (id, group, name, fn, pal, seed) => ({ id, group, name, pal, bg: svgUrl(fn(pal, seed)) }); // pal: auch für die automatische Akzentfarbe
  const COVER_PRESETS = [
    art('w-sunset', 'waves', 'Sonnenuntergang', artWaves, ['#7c2d12', '#c2410c', '#f97316', '#fb923c', '#fdba74', '#fde68a'], 11),
    art('w-rose', 'waves', 'Rosé', artWaves, ['#831843', '#be185d', '#ec4899', '#f9a8d4', '#fce7f3'], 23),
    art('w-ocean', 'waves', 'Ozean', artWaves, ['#082f49', '#0c4a6e', '#0369a1', '#0ea5e9', '#7dd3fc', '#e0f2fe'], 37),
    art('w-violet', 'waves', 'Veilchen', artWaves, ['#2e1065', '#5b21b6', '#7c3aed', '#a78bfa', '#ddd6fe'], 41),
    art('w-mint', 'waves', 'Minze', artWaves, ['#042f2e', '#115e59', '#14b8a6', '#5eead4', '#ccfbf1'], 53),
    art('w-graphite', 'waves', 'Graphit', artWaves, ['#09090b', '#18181b', '#27272a', '#3f3f46', '#71717a'], 67),
    art('d-desert', 'dunes', 'Wüste', artDunes, ['#fde68a', '#fb923c', '#fff7ed', '#ea580c', '#c2410c', '#7c2d12'], 7),
    art('d-dusk', 'dunes', 'Dämmerung', artDunes, ['#1e1b4b', '#be185d', '#fda4af', '#6d28d9', '#4c1d95', '#1e1b4b'], 19),
    art('d-alps', 'dunes', 'Berge', artDunes, ['#bae6fd', '#e0f2fe', '#ffffff', '#64748b', '#334155', '#0f172a'], 29),
    art('d-forest', 'dunes', 'Wald', artDunes, ['#d9f99d', '#fef9c3', '#fffbeb', '#4d7c0f', '#166534', '#052e16'], 43),
    art('d-night', 'dunes', 'Nacht', artDunes, ['#020617', '#1e3a8a', '#93c5fd', '#1e293b', '#0f172a', '#020617'], 59),
    art('d-lavender', 'dunes', 'Lavendel', artDunes, ['#ede9fe', '#fbcfe8', '#ffffff', '#a78bfa', '#7c3aed', '#4c1d95'], 71),
    art('a-north', 'aurora', 'Polarlicht', artAurora, ['#020617', '#22c55e', '#06b6d4', '#6366f1'], 3),
    art('a-flame', 'aurora', 'Flamme', artAurora, ['#0c0a09', '#f97316', '#e11d48', '#facc15'], 17),
    art('a-candy', 'aurora', 'Bonbon', artAurora, ['#1e1b4b', '#ec4899', '#8b5cf6', '#22d3ee'], 31),
    art('a-deep', 'aurora', 'Tiefe', artAurora, ['#020617', '#1d4ed8', '#0ea5e9', '#312e81'], 47),
    art('a-lime', 'aurora', 'Limette', artAurora, ['#052e16', '#a3e635', '#14b8a6', '#facc15'], 61),
    art('a-plum', 'aurora', 'Pflaume', artAurora, ['#1a0b1e', '#a21caf', '#f43f5e', '#7c3aed'], 83),
    art('l-blue', 'lines', 'Höhen Blau', artLines, ['#0b1120', '#38bdf8', '#818cf8'], 5),
    art('l-ember', 'lines', 'Glut', artLines, ['#120a06', '#f59e0b', '#ef4444'], 13),
    art('l-mint', 'lines', 'Höhen Grün', artLines, ['#04120f', '#34d399', '#22d3ee'], 27),
    art('l-pink', 'lines', 'Höhen Rosa', artLines, ['#140a12', '#f472b6', '#a78bfa'], 39),
    art('l-silver', 'lines', 'Silber', artLines, ['#0a0a0a', '#e5e5e5', '#737373'], 57),
    art('l-gold', 'lines', 'Gold', artLines, ['#0f0d08', '#fde68a', '#d97706'], 77),
  ];
  // eigene Farbe → dieselben Motive, Paletten aus Abstufungen dieser Farbe
  function colorCover(hex, style = 'mesh') {
    const m = /^#?([\da-f]{6})$/i.exec(hex || ''); if (!m) return '';
    const n = parseInt(m[1], 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
    const s = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
    let h = 0;
    if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h = Math.round(h * 60 + 360) % 360;
    const S = Math.round(Math.min(1, s) * 100);
    const hsl = (dh, sat, lit) => `hsl(${(h + dh + 360) % 360},${Math.max(0, Math.min(100, Math.round(sat)))}%,${Math.max(0, Math.min(100, Math.round(lit)))}%)`;
    // feste Form je Stil – beim Farbwechsel ändert sich nur die Farbe, nie das Motiv (Wellen/Dünen = Form der Vorschau)
    const seed = ({ waves: 11, wave: 11, dunes: 7, soft: 7, ribbons: 31, mesh: 31, aurora: 31, arcs: 5, lines: 5, peaks: 17, prism: 23, dots: 29, bokeh: 37, bauhaus: 43, silk: 47, stripes: 53, swirl: 59, marble: 61, confetti: 67, rays: 71, blobs: 73, mosaic: 79 })[style] || 41;
    if (style === 'flat') return `radial-gradient(120% 140% at 100% 0%, ${hsl(0, S, 62)} 0%, transparent 60%), ${hsl(0, S, 50)}`;
    if (style === 'ribbons') return svgUrl(artRibbons([hsl(-6, S * 0.5, 14), hsl(8, S * 0.6, 22), hsl(0, S * 0.9, 52), hsl(14, S * 0.85, 60), hsl(-14, S * 0.85, 48)], seed));
    if (style === 'arcs') return svgUrl(artArcs([hsl(-8, S * 0.6, 16), hsl(-6, S * 0.8, 26), hsl(-3, S * 0.9, 36), hsl(0, S, 46), hsl(4, S, 56), hsl(8, S * 0.9, 66), hsl(12, S * 0.8, 76)], seed));
    if (style === 'peaks') return svgUrl(artPeaks([hsl(-5, S * 0.45, 86), hsl(5, S * 0.6, 74), hsl(0, S * 0.6, 62), hsl(-3, S * 0.75, 48), hsl(-6, S * 0.85, 36), hsl(-8, S * 0.85, 24)], seed));
    if (style === 'prism') return svgUrl(artPrism([hsl(-18, S * 0.9, 44), hsl(-10, S * 0.9, 50), hsl(-3, S, 56), hsl(5, S, 61), hsl(12, S * 0.95, 65), hsl(20, S * 0.85, 69)], seed));
    if (style === 'dots') return svgUrl(artDots([hsl(0, S * 0.35, 9), hsl(0, S * 0.9, 52), hsl(18, S * 0.9, 56), hsl(5, S * 0.5, 80)], seed));
    if (style === 'marble') return svgUrl(artMarble([hsl(0, S * 0.35, 86), hsl(15, S * 0.45, 72), hsl(-10, S, 34), hsl(20, S * 0.8, 52)], seed));
    if (style === 'horizon') return svgUrl(artHorizon([hsl(-20, S * 0.8, 10), hsl(-5, S, 30), hsl(20, S, 66), hsl(0, S, 62), hsl(-15, S * 0.8, 8)]));
    if (style === 'bokeh') return svgUrl(artBokeh([hsl(-6, S * 0.5, 10), hsl(6, S * 0.7, 20), hsl(0, S * 0.9, 60), hsl(12, S * 0.9, 66), hsl(-12, S * 0.9, 56), '#ffffff'], seed));
    if (style === 'bauhaus') return svgUrl(artBauhaus([hsl(0, S * 0.25, 12), hsl(0, S * 0.9, 56), hsl(0, S * 0.9, 42), hsl(0, S * 0.8, 72), hsl(14, S * 0.9, 60), hsl(0, S * 0.3, 88)], seed));
    if (style === 'silk') return svgUrl(artSilk([hsl(-6, S * 0.9, 26), hsl(8, S * 0.9, 40), hsl(0, S * 0.9, 66), hsl(14, S * 0.85, 74)], seed));
    if (style === 'stripes') return svgUrl(artStripes([hsl(0, S * 0.9, 42), hsl(-5, S * 0.9, 34), hsl(0, S, 48), hsl(5, S, 56), hsl(3, S * 0.8, 66), hsl(-3, S * 0.9, 28)], seed));
    if (style === 'swirl') return svgUrl(artSwirl([hsl(0, S * 0.4, 8), hsl(0, S, 30), hsl(10, S, 42), hsl(20, S, 54), hsl(30, S, 66), hsl(40, S * 0.9, 78)], seed));
    if (style === 'confetti') return svgUrl(artConfetti([hsl(0, S * 0.3, 10), hsl(0, S, 58), hsl(30, S, 62), hsl(-30, S * 0.9, 60), hsl(10, S * 0.5, 86)], seed));
    if (style === 'rays') return svgUrl(artRays([hsl(-6, S * 0.9, 34), hsl(4, S * 0.95, 42), hsl(20, S, 72)], seed));
    if (style === 'blobs') return svgUrl(artBlobs([hsl(0, S * 0.4, 9), hsl(0, S, 52), hsl(25, S, 58), hsl(-25, S * 0.9, 50), hsl(10, S * 0.8, 70)], seed));
    if (style === 'mosaic') return svgUrl(artMosaic([hsl(-10, S * 0.8, 20), hsl(-5, S * 0.9, 30), hsl(0, S, 40), hsl(5, S, 50), hsl(10, S * 0.95, 60), hsl(15, S * 0.85, 70)], seed));
    if (style === 'plain') return svgUrl(artPlain([hsl(-6, S * 0.9, 30), hsl(3, S, 50), hsl(10, S * 0.75, 76)]));
    if (style === 'lines') return svgUrl(artLines([hsl(0, S * 0.35, 6), hsl(0, S, 64), hsl(40, S, 60)], seed));
    if (style === 'soft' || style === 'dunes') return svgUrl(artDunes([hsl(-5, S * 0.55, 86), hsl(8, S * 0.6, 78), '#ffffff', hsl(0, S * 0.9, 60), hsl(-5, S * 0.9, 46), hsl(-10, S * 0.9, 32)], seed));
    if (style === 'wave' || style === 'waves') return svgUrl(artWaves([hsl(-10, S * 0.8, 22), hsl(-6, S * 0.85, 30), hsl(-2, S * 0.9, 40), hsl(2, S, 50), hsl(6, S * 0.95, 60), hsl(10, S * 0.85, 70)], seed));
    return svgUrl(artAurora([hsl(0, S * 0.5, 7), hsl(0, S, 55), hsl(35, S, 55), hsl(-40, S, 50)], seed));
  }

  /* ---------- Anlegen / Öffnen / Löschen ---------- */
  function create(projectId = '') {
    const d = { id: newId('d'), title: '', subtitle: '', projectId, tags: [], content: '', created: Date.now(), updated: Date.now(), ws: wsNow() };
    docs.unshift(d);
    save(); renderSide(); if (list.open) list.render();
    open(d.id, true);
    return d;
  }
  function open(id, focusTitle = false) {
    const d = docOf(id); if (!d) return;
    editor.focusTitle = focusTitle;
    window.openDocTab?.(id, d.title || 'Unbenannt');
  }
  function remove(id) {
    docs = docs.filter((d) => d.id !== id);
    deletedIds.add(id);
    save(); renderSide(); if (list.open) list.render();
    const tab = document.querySelector(`.tab[data-doc="${id}"]`);
    tab?.querySelector('.tab-close')?.click();
  }
  function touch(d) { d.updated = Date.now(); save(); }

  /* ---------- Seitenleiste: Projekte (aufklappbar) mit ihren Dokumenten ---------- */
  const open$ = new Set(JSON.parse(localStorage.getItem('docs.openProjects') || '[]'));
  // „Dokumente“ in der Sidebar: einklappbar wie „Chats“ (Überschrift und Zustand aus app.js)
  const side = el('nav', 'nav dc-side sb-sec');
  side.dataset.sec = 'docs';
  side.classList.toggle('closed', !!window.sbSectionClosed?.('docs'));
  side.setAttribute('aria-label', 'Dokumente');
  (document.getElementById('sbScroll') || document.querySelector('.sidebar-inner'))?.append(side);
  function renderSide() {
    const loose = docs.filter((d) => inWs(d) && !isEmpty(d)).sort((a, b) => b.updated - a.updated).slice(0, 6);
    side.hidden = !loose.length; // ohne Dokumente keine leere Überschrift
    side.innerHTML = (window.sbSectionHead?.('Dokumente', 'docs') || '<div class="section-label">Dokumente</div>')
      // Projekt-Ordner stehen nicht in der Seitenleiste (nur in der Bibliothek); Dokumente ohne Projekt mit eigenem Icon oder Linien-Icon
      + `<div class="sb-sec-body"><div class="sb-sec-in">${loose.map((d) => `<a class="nav-item dc-loose" href="#" data-open-doc="${d.id}">${docIcon(d) ? DocIcons.of(d.icon, 15) : '<svg width="15" height="15"><use href="#o-doc"/></svg>'}<span>${esc(d.title || 'Unbenannt')}</span></a>`).join('')}</div></div>`;
    if (side.querySelector('.dc-newp')) side.querySelector('.dc-newp input').focus();
    window.dispatchEvent(new Event('docs-changed'));
  }
  side.addEventListener('click', (e) => {
    const a = e.target.closest('[data-side], [data-open-doc]'); if (!a) return;
    e.preventDefault();
    if (a.dataset.openDoc) { open(a.dataset.openDoc); return; }
    const p = a.closest('[data-proj]')?.dataset.proj;
    const k = e.target.closest('[data-side]').dataset.side;
    if (k === 'new-doc') { create(p); open$.add(p); return; }
    if (k === 'toggle') { open$.has(p) ? open$.delete(p) : open$.add(p); localStorage.setItem('docs.openProjects', JSON.stringify([...open$])); a.closest('.dc-proj').classList.toggle('open'); return; }
    if (k === 'all') { window.openViewTab?.('docs'); list.setProject('none'); return; }
    if (k === 'new-project') {
      if (side.querySelector('.dc-newp')) return;
      const row = el('div', 'dc-newp', `<span class="dc-pic">${fi('folder', 15)}</span><input placeholder="Projektname" maxlength="40" aria-label="Projektname" />`);
      side.querySelector('.dc-side-label').after(row);
      const inp = row.querySelector('input');
      inp.focus();
      let done = false;
      const finish = (keep) => {
        if (done) return; done = true;
        const name = inp.value.trim();
        if (keep && name) { const pr = { id: newId('p'), name, c: UIKit.COLORS[projects.length % UIKit.COLORS.length] }; projects.push(pr); open$.add(pr.id); save(); }
        renderSide();
      };
      inp.addEventListener('keydown', (x) => { x.stopPropagation(); if (x.key === 'Enter') finish(true); if (x.key === 'Escape') finish(false); });
      inp.addEventListener('blur', () => finish(true));
    }
  });

  /* ---------- Ansicht „Library“: genau wie der Chatverlauf (Titel + Pille, runde Suche, Pinned / Recent,
     Zeilen mit Icon, Name, Zeit, rechts Anheften und Löschen – Löschen: 1. Klick rot, 2. Klick löscht; Anheften gleitet weich nach oben) ---------- */
  const panel = () => document.querySelector('.panel');
  const list = (() => {
    const view = el('section', 'dc-view dc-list');
    view.hidden = true;
    view.innerHTML = `<div class="cl-wrap">
      <div class="cl-head"><h2>Bibliothek</h2><button type="button" class="cl-new" data-act="new" title="Neues Dokument">${fi('plus', 14)}<span>Neues Dokument</span></button></div>
      <label class="cl-search">${fi('search', 14)}<input type="search" placeholder="Dokumente durchsuchen" aria-label="Dokumente durchsuchen" /></label>
      <div class="cl-list"></div></div>`;
    const rows = view.querySelector('.cl-list'), search = view.querySelector('.cl-search input');
    const row = (d, i) => `<div class="cl-row" data-open-doc="${d.id}" data-key="${d.id}" tabindex="0" style="animation-delay:${Math.min(i, 10) * 20}ms">
        <span class="cl-av">${docIcon(d) ? DocIcons.of(d.icon, 16) : '<svg width="16" height="16"><use href="#o-doc"/></svg>'}</span><span class="cl-title">${esc(d.title || 'Ohne Titel')}</span><span class="cl-time">${relTime(d.updated)}</span>
        <span class="cl-acts"><button type="button" class="lb-act cl-pin${d.pinned ? ' on' : ''}" data-row="pin" aria-label="${d.pinned ? 'Lösen' : 'Anheften'}" title="${d.pinned ? 'Lösen' : 'Anheften'}">${fi('pin', 14)}</button><button type="button" class="lb-act lb-del" data-row="del" aria-label="Dokument löschen" title="Löschen">${fi('trash', 14)}</button></span></div>`;
    const api = {
      open: false,
      setProject() { api.render(); }, // Projekte gibt es in der Liste nicht mehr
      render() {
        const q = search.value.trim().toLowerCase();
        const items = docs.filter((d) => inWs(d) && !isEmpty(d) && (!q || `${d.title} ${d.subtitle || ''} ${plain(d.content)}`.toLowerCase().includes(q)))
          .sort((a, b) => b.updated - a.updated);
        let i = 0;
        rows.innerHTML = [['Angeheftet', items.filter((d) => d.pinned)], ...UIKit.timeGroups(items.filter((d) => !d.pinned), (d) => d.updated)]
          .filter(([, r]) => r.length).map(([label, r]) => `<div class="cl-label">${label}</div>${r.map((d) => row(d, i++)).join('')}`).join('')
          || `<div class="cl-empty">${q ? 'Keine Dokumente gefunden' : 'Noch keine Dokumente'}</div>`;
      },
      show() {
        if (!view.isConnected) panel()?.append(view);
        api.open = true; view.hidden = false; panel()?.classList.add('view-docs');
        api.render();
      },
      hide() { if (!api.open) return; api.open = false; view.hidden = true; if (!editor.open) panel()?.classList.remove('view-docs'); },
    };
    search.addEventListener('input', () => api.render());
    search.addEventListener('keydown', (e) => e.stopPropagation());
    view.addEventListener('click', (e) => {
      if (e.target.closest('[data-act="new"]')) { create(''); return; }
      const ra = e.target.closest('[data-row]');
      if (ra) {
        const d = docOf(ra.closest('[data-open-doc]').dataset.openDoc); if (!d) return;
        if (ra.dataset.row === 'pin') { window.flipList(rows, () => { d.pinned = !d.pinned; save(); renderSide(); api.render(); }, d.id); return; }
        // Löschen: erster Klick färbt rot, zweiter löscht
        if (!ra.classList.contains('confirm')) { ra.classList.add('confirm'); ra.title = 'Zum Löschen nochmal klicken'; setTimeout(() => { ra.classList.remove('confirm'); ra.title = 'Löschen'; }, 2500); return; }
        window.flipList(rows, () => remove(d.id));
        return;
      }
      const r = e.target.closest('[data-open-doc]'); if (r) open(r.dataset.openDoc);
    });
    view.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.dataset.openDoc) open(e.target.dataset.openDoc); });
    return api;
  })();

  /* ---------- KI im Dokument (Server: /api/doc-ai) ---------- */
  async function docAi(body) {
    const r = await fetch('/api/doc-ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const o = await r.json().catch(() => ({}));
    if (!r.ok || !o.html) throw new Error(o.error || 'Die KI hat gerade nicht geantwortet.');
    return { ...o, html: clean(o.html) };
  }

  /* ---------- Editor: Titel, Beschreibung, Strich, Text ----------
     Markieren → Format-Menü (Textart, Farbe, B/I/U/S, Liste, Ausrichtung, Link, Ask AI).
     Überschriften haben links einen Griff: ziehen verschiebt den ganzen Abschnitt. */
  const COLORS = [['Standard', '#e6e6e6'], ['Grau', '#9a9a9a'], ['Rot', '#ef6b5f'], ['Orange', '#f0a050'], ['Gelb', '#e8c95a'], ['Grün', '#5fc48a'], ['Blau', '#5b9bff'], ['Lila', '#a98bff']];
  const BLOCKS = [['p', 'Text'], ['h1', 'Überschrift 1'], ['h2', 'Überschrift 2'], ['h3', 'Überschrift 3'], ['h4', 'Überschrift 4'], ['blockquote', 'Zitat']];
  const ALIGNS = [['justifyLeft', 'align-left', 'Links'], ['justifyCenter', 'align-center', 'Mitte'], ['justifyRight', 'align-right', 'Rechts']];
  const editor = (() => {
    const view = el('section', 'dc-view dc-editor');
    view.hidden = true;
    let doc = null, tab = null;
    let focusOn = false, focusPrev = null; // Fokusmodus (siehe setFocus)
    let paneOpen = localStorage.getItem('docs.pane') === '1';
    const api = { open: false, focusTitle: false };
    const app = () => document.getElementById('app');
    // Rechtes Seitenfenster (#rpane neben dem Hauptteil): KI-Chat, der sich nur auf dieses Dokument bezieht
    function drawPane() {
      const on = api.open && paneOpen && !focusOn;
      app()?.classList.toggle('rpane-open', on);
      if (on) { drawDocChat(); paneResizer(); }
    }
    // Seitenfenster nach links breiter ziehen (Griff am linken Rand). 360 px ist das Minimum, die Breite wird gemerkt.
    const PANE_MIN = 360;
    const paneMax = () => Math.max(PANE_MIN, Math.min(900, Math.round(window.innerWidth * 0.6)));
    function setPaneWidth(w) { app()?.style.setProperty('--rpane-w', `${Math.min(paneMax(), Math.max(PANE_MIN, Math.round(w)))}px`); }
    setPaneWidth(+localStorage.getItem('docs.paneWidth') || PANE_MIN);
    function paneResizer() {
      const p = pane(); if (!p || p.querySelector(':scope > .rpane-grip')) return;
      const grip = el('div', 'rpane-grip'); grip.setAttribute('role', 'separator'); grip.setAttribute('aria-label', 'Breite des Seitenfensters ändern'); grip.title = 'Ziehen zum Verbreitern';
      p.append(grip);
      grip.addEventListener('pointerdown', (e) => {
        e.preventDefault(); try { grip.setPointerCapture(e.pointerId); } catch {}
        const right = p.getBoundingClientRect().right;
        app()?.classList.add('rpane-resizing');
        const move = (ev) => setPaneWidth(right - ev.clientX);
        const up = () => {
          grip.removeEventListener('pointermove', move); grip.removeEventListener('pointerup', up);
          app()?.classList.remove('rpane-resizing');
          localStorage.setItem('docs.paneWidth', String(parseFloat(app()?.style.getPropertyValue('--rpane-w')) || PANE_MIN));
        };
        grip.addEventListener('pointermove', move); grip.addEventListener('pointerup', up);
      });
      grip.addEventListener('dblclick', () => { setPaneWidth(PANE_MIN); localStorage.setItem('docs.paneWidth', String(PANE_MIN)); }); // Doppelklick: zurück auf Standard
    }

    /* ---------- KI-Chat zum Dokument ----------
       Mehrere Chats je Dokument (doc.chats, werden mit dem Dokument gespeichert). Die KI bekommt den aktuellen
       Inhalt des Dokuments mit und antwortet nur dazu – andere Chats kennt sie nicht. */
    let dccRun = null;
    let viewSrc = null; // Haupt-Chat, aus dem das Dokument stammt – wird rechts angezeigt (Weiterschreiben im Chat)
    const pane = () => document.getElementById('rpane');
    // Mehrere KI-Chats je Dokument (doc.chats); sie erscheinen nur hier im Dokument
    const dChats = (d) => {
      if (!Array.isArray(d.chats)) { // alter einzelner Verlauf (doc.chat) → erster Chat
        d.chats = (d.chat || []).length ? [{ id: `k${Date.now().toString(36)}`, title: (d.chat.find((m) => m.role === 'user')?.text || 'Chat').slice(0, 48), updated: d.updated || Date.now(), messages: d.chat }] : [];
        d.chatId = d.chats[0]?.id || null;
        delete d.chat;
      }
      return d.chats;
    };
    const curChat = (d) => dChats(d).find((c) => c.id === d.chatId) || null;
    // der KI-Chat (Haupt-Chat), aus dem das Dokument erstellt wurde
    const sourceChats = (d) => [...document.querySelectorAll('#tabs .tab:not(.uil-tab):not([data-view])')]
      .filter((t) => { try { return chatOf(t)?.docId === d.id; } catch { return false; } });
    function drawDocChat() {
      const p = pane(); if (!p || !doc) return;
      if (p.dataset.doc === doc.id && p.querySelector('.dcc')) return;
      dccRun?.abort(); dccRun = null;
      if (drawDocChat.last !== doc.id) viewSrc = null; // anderes Dokument → wieder dessen eigener Chat
      drawDocChat.last = doc.id;
      p.dataset.doc = doc.id;
      const grip = p.querySelector(':scope > .rpane-grip');
      // sieht aus wie der normale Chat: nur Nachrichten und unten das Eingabefeld (etwas kleiner)
      p.innerHTML = `<div class="dcc">
        <div class="dcc-top"><button type="button" class="icon-btn dcc-chats" aria-label="KI-Chats zu diesem Dokument" title="KI-Chats zu diesem Dokument" aria-expanded="false"><svg width="15" height="15"><use href="#f-chats"/></svg></button></div>
        <div class="dcc-listview" hidden>
          <div class="dcc-listbar"><button type="button" class="icon-btn dcc-lb" data-dcc-back aria-label="Zurück" title="Zurück">${fi('back', 14)}</button>
            <button type="button" class="icon-btn dcc-lb" data-dcc-new aria-label="Neuer Chat" title="Neuer Chat">${fi('plus', 14)}</button></div>
          <div class="cl-list"></div></div>
        <div class="dcc-list"></div>
        <form class="dcc-form"><div class="dcc-atts"></div><textarea rows="2" placeholder="Frag etwas zu diesem Dokument …" aria-label="Frage zum Dokument"></textarea>
          <div class="dcc-bar">
            <button type="button" class="plus-btn dcc-plus" aria-label="Bild hinzufügen" title="Bild hinzufügen">${icon('i-plus', 16)}</button>
            <input type="file" accept="image/*" multiple hidden />
            <button type="button" class="dcc-eff" aria-haspopup="menu" aria-label="Aufwand"><span>${DCC_EFF_LABEL[dccEffort()]}</span>${fi('chevron-down', 9)}</button>
            <span class="flex-spacer"></span>
            <button type="button" class="mic-btn dcc-mic" aria-label="Diktieren" title="Diktieren"><svg class="icon-mic" width="16" height="16"><use href="#i-mic"/></svg><svg class="icon-stop" width="16" height="16"><use href="#i-stop"/></svg></button>
            <button type="button" class="voice-btn dcc-voice" aria-label="Sprachmodus" title="Sprachmodus">${fi('voice', 16)}</button>
            <button type="submit" class="dcc-send" aria-label="Senden" title="Senden">${icon('i-arrow-up', 14)}</button></div></form>
        <div class="status-row dcc-status"><div class="listening dcc-listening" role="status" aria-live="polite"><span class="dot"></span><span>Hört zu</span></div></div></div>`;
      if (grip) p.append(grip);
      const list = p.querySelector('.dcc-list');
      const srcTab = viewSrc && document.querySelector(`#tabs .tab[data-cid="${viewSrc}"]`);
      if (srcTab) {
        // Haupt-Chat rechts anzeigen: gleiche Darstellung, unten statt Eingabefeld „Im Chat weiterschreiben“
        historyOf(srcTab).filter((m) => (m.text || m.images?.length) && !m.doc).forEach((m) => list.append(dccMsg(m.role, m.role === 'user' ? m.text : stripAskBlock(m.text), m.role === 'user' ? (m.images || []).filter((x) => /^image\//.test(x.mime)).map(dataUrl) : [])));
        p.querySelector('.dcc').classList.add('viewing');
        p.querySelector('.dcc-form textarea').placeholder = 'Frag etwas oder lass dir etwas erklären …';
      } else (curChat(doc)?.messages || []).forEach((m) => { const n = dccMsg(m.role, m.text, [], m); list.append(n); if (m.role === 'user' && m.imgId) showThumbs(n, m); });
      wireChatList(p);
      // Aufwand nur für den Dokument-Chat: Auto · Low · Medium · High · Max (kein Modellname)
      p.querySelector('.dcc-eff')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const btn = e.currentTarget, old = p.querySelector('.dcc-effmenu'); if (old) { old.remove(); return; }
        const m = el('div', 'tk-box dcc-effmenu', Object.keys(DCC_EFF_LABEL).map((k) => `<button type="button" data-eff="${k}" class="${k === dccEffort() ? 'on' : ''}"><span>${DCC_EFF_LABEL[k]}</span>${k === dccEffort() ? fi('check', 12) : ''}</button>`).join(''));
        btn.closest('.dcc-form').append(m);
        m.addEventListener('click', (ev) => { const b = ev.target.closest('[data-eff]'); if (!b) return; localStorage.setItem('docs.chatEffort', b.dataset.eff); btn.querySelector('span').textContent = DCC_EFF_LABEL[b.dataset.eff]; m.remove(); });
        setTimeout(() => document.addEventListener('pointerdown', (ev) => { if (!m.contains(ev.target)) m.remove(); }, { once: true }), 0);
      });
      list.scrollTop = list.scrollHeight;
      const ta = p.querySelector('textarea'), form = p.querySelector('form');
      const growTa = () => { ta.style.height = 'auto'; ta.style.height = `${Math.min(Math.max(ta.scrollHeight, 40), 160)}px`; };
      ta.addEventListener('input', growTa);
      ta.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); } });
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        if (dccRun) { dccRun.abort(); return; }
        const q = ta.value.trim(); if (!q && !dccFiles.length) return;
        stopDictation();
        const files = dccFiles; dccFiles = []; drawAtts();
        ta.value = ''; growTa(); askDoc(q || 'Was siehst du auf dem Bild – im Bezug auf das Dokument?', files);
      });
      // Bilder anhängen (Plus oder Einfügen)
      const fileIn = p.querySelector('input[type=file]');
      p.querySelector('.dcc-plus').addEventListener('click', () => fileIn.click());
      fileIn.addEventListener('change', () => { addAtts(fileIn.files); fileIn.value = ''; });
      ta.addEventListener('paste', (e) => { const f = [...(e.clipboardData?.files || [])].filter((x) => x.type.startsWith('image/')); if (f.length) { e.preventDefault(); addAtts(f); } });
      // Diktieren und Sprachmodus (Agent) wie im Chat
      p.querySelector('.dcc-mic').addEventListener('click', () => (dictation ? stopDictation() : startDictation(ta, growTa)));
      p.querySelector('.dcc-voice').addEventListener('click', () => document.getElementById('voiceBtn')?.click());
      drawAtts();
    }
    // angehängte Bilder (nur für die nächste Frage)
    let dccFiles = [];
    function addAtts(files) { [...files].filter((f) => f.type.startsWith('image/')).slice(0, 6).forEach((file) => dccFiles.push({ file, url: URL.createObjectURL(file) })); drawAtts(); }
    function drawAtts() {
      const box = pane()?.querySelector('.dcc-atts'); if (!box) return;
      box.innerHTML = dccFiles.map((f, i) => `<span class="dcc-att" style="background-image:url('${f.url}')"><button type="button" data-att="${i}" aria-label="Bild entfernen">${fi('x', 10)}</button></span>`).join('');
      box.hidden = !dccFiles.length;
      box.querySelectorAll('[data-att]').forEach((b) => b.addEventListener('click', () => { const [f] = dccFiles.splice(+b.dataset.att, 1); URL.revokeObjectURL(f.url); drawAtts(); }));
    }
    // Diktieren: Sprache → Text ins Eingabefeld (wie das Mikrofon im Chat)
    let dictation = null;
    function startDictation(ta, grow) {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition; if (!SR) return;
      let base = ta.value ? `${ta.value.replace(/\s+$/, '')} ` : '';
      const rec = new SR(); rec.lang = 'de-DE'; rec.interimResults = true; rec.continuous = true;
      let written = ta.value, from = 0, seen = 0;
      rec.onresult = (e) => {
        let done = '', live = '';
        for (let i = from; i < e.results.length; i++) { if (e.results[i].isFinal) done += e.results[i][0].transcript; else live += e.results[i][0].transcript; }
        seen = e.results.length;
        written = ta.value = base + done + live; grow();
      };
      // beim Sprechen etwas gelöscht/geändert: so übernehmen, bisher Erkanntes nicht wieder einsetzen
      const onEdit = () => { if (dictation !== rec || ta.value === written) return; base = ta.value && !/\s$/.test(ta.value) ? `${ta.value} ` : ta.value; written = ta.value; from = seen; };
      ta.addEventListener('input', onEdit);
      rec.onend = () => { ta.removeEventListener('input', onEdit); if (dictation === rec) stopDictation(); };
      try { rec.start(); } catch { return; }
      dictation = rec;
      pane()?.querySelector('.dcc-mic')?.classList.add('active');
      pane()?.querySelector('.dcc-listening')?.classList.add('show');
      pane()?.querySelector('.dcc')?.classList.add('dictating'); // Eingabefeld gleitet etwas hoch, darunter „Listening“
    }
    function stopDictation() {
      const rec = dictation; dictation = null;
      try { rec?.stop(); } catch {}
      pane()?.querySelector('.dcc-mic')?.classList.remove('active');
      pane()?.querySelector('.dcc-listening')?.classList.remove('show');
      pane()?.querySelector('.dcc')?.classList.remove('dictating');
    }
    // msg: gespeicherte Nachricht des Dokument-Chats → darunter Kopieren / Neu erzeugen (/ Checkpoint) und ggf. die Änderungs-Karte
    const msgEls = new WeakMap();
    function dccMsg(role, text, urls = [], msg = null) {
      if (role === 'user') {
        const m = el('div', 'dcc-q');
        if (urls.length) m.append(el('div', 'dcc-imgs', urls.map((u) => `<span style="background-image:url('${u}')"></span>`).join('')));
        if (text) m.append(userBubble(text, 'dcc-bubble')); // lange eigene Nachricht: eingeklappt mit „Mehr anzeigen“
        return m;
      }
      const a = el('div', 'dcc-a');
      a.dataset.dog = msg?.dog || window.PixelDogs?.mode || 'general'; // Hundekopf links neben der Antwort
      const body = el('div', 'dcc-body md');
      const shown = noAsk(text || '');
      if (window.renderMarkdown) renderMarkdown(body, shown); else body.textContent = shown;
      if (shown) a.append(body);
      if (msg) { msgEls.set(msg, a); fillMsg(a, msg); }
      if (body.querySelector('.chat-illustration[data-prompt]')) setTimeout(() => window.hydrateIllustrations?.(body), 0); // gespeicherte Bilder kommen aus dem Speicher des Servers
      return a;
    }
    // Bilder der Antwort erzeugen: oben „Generating picture“ (schimmernd, mit Sekunden), danach blendet das Bild weich ein
    async function dccPictures(a, body, list, signal) {
      if (!body?.querySelector('.chat-illustration[data-prompt]') || !window.hydrateIllustrations) return;
      const line = dccThink(a, list, 'Bild erzeugen', 'Bild erzeugt');
      await hydrateIllustrations(body, signal).catch(() => {});
      line.end(true); list.scrollTop = list.scrollHeight;
    }
    // Rückfrage-Block der KI (```ask …```) nicht als Code zeigen, sondern als Antworten zum Anklicken
    const noAsk = (t) => t.replace(/```ask[\s\S]*?(```|$)/g, '').trimEnd();
    function askCard(m) {
      const data = window.parseAskBlock?.(m.text); if (!data?.length) return null;
      const card = el('div', 'dcc-ask');
      const picks = data.map(() => null);
      card.innerHTML = data.map((q, i) => `<div class="dcc-ask-q" data-q="${i}"><div class="dcc-ask-t">${esc(q.question)}</div><div class="dcc-ask-opts">${q.options.map((o, k) => `<button type="button" data-o="${k}">${esc(o)}</button>`).join('')}</div></div>`).join('')
        + '<div class="dcc-ask-hint">oder unten selbst antworten</div>';
      card.addEventListener('click', (e) => {
        const b = e.target.closest('[data-o]'); if (!b || dccRun) return;
        const qi = +b.closest('[data-q]').dataset.q;
        picks[qi] = data[qi].options[+b.dataset.o];
        b.parentElement.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
        if (picks.some((x) => x == null)) return; // erst wenn jede Frage beantwortet ist
        card.classList.add('sent');
        askDoc(data.length === 1 ? picks[0] : data.map((q, i) => `${q.question} – ${picks[i]}`).join('\n'));
      });
      return card;
    }
    function fillMsg(a, m) {
      a.querySelector(':scope > .dcc-edit')?.remove(); a.querySelector(':scope > .dcc-actions')?.remove(); a.querySelector(':scope > .dcc-ask')?.remove();
      const chat = doc && curChat(doc);
      if (chat && chat.messages[chat.messages.length - 1] === m) { const ask = askCard(m); if (ask) a.append(ask); } // nur bei der letzten Antwort
      if (m.edit) a.append(editCard(m));
      a.append(dccFooter(m));
    }
    const refreshMsg = (m) => { const a = msgEls.get(m); if (a?.isConnected) fillMsg(a, m); };
    // Fußzeile wie im großen Chat – aber ohne „Ins Dokument“ (hier ist man ja schon im Dokument)
    function dccFooter(m) {
      const bar = el('div', 'msg-actions dcc-actions');
      const btn = (html, label, fn, cls = '') => { const b = el('button', `msg-btn${cls}`, html); b.type = 'button'; b.title = label; b.setAttribute('aria-label', label); b.addEventListener('click', () => fn(b)); bar.append(b); return b; };
      btn(icon('i-copy'), 'Kopieren', async (b) => {
        try { await navigator.clipboard.writeText(m.text || ''); } catch { return; }
        b.innerHTML = icon('i-check'); b.classList.add('done');
        setTimeout(() => { b.innerHTML = icon('i-copy'); b.classList.remove('done'); }, 1400);
      });
      btn(icon('i-refresh'), 'Neu erzeugen', () => redoDoc(m));
      if (m.edit?.state === 'accepted' && m.edit.checkpoint) btn(`${fi('undo', 13)}<span>Checkpoint</span>`, 'Dokument auf den Stand vor dieser Änderung zurücksetzen', () => restoreCheckpoint(m), ' dcc-restore');
      return bar;
    }

    /* ---------- Der Chat ändert das Dokument ----------
       Die KI schlägt eine Änderung mit [[ÄNDERN: …]] vor → /api/doc-ai schreibt das neue Dokument →
       Karte mit Akzeptieren / Ablehnen. Erst beim Akzeptieren wird geändert, vorher wird ein Checkpoint gemerkt. */
    const WANTS_EDIT = /(füg\w*\s.*(ein|hinzu|dazu)|einfüg|einbau|hinzufüg|ins dokument|in das dokument|in mein dokument|übernimm|übernehm|ergänz|änder|umschreib|schreib\w*\s.*(rein|dazu|ins)|pack\w*\s.*(rein|dazu|ins)|nimm\w*\s.*(rein|auf)|kürz|korrigier|ersetz|lösch|entfern|umstell|formatier)/i;
    const EDIT_MARK = /\[\[\s*ÄNDERN\s*:\s*([\s\S]*?)\s*(?:\]\]|$)/i;
    const visible = (t) => t.replace(/\[\[\s*ÄNDERN\s*:[\s\S]*?(?:\]\]|$)/gi, '').replace(/\[\[?[A-ZÄÖÜ]{0,6}$/i, '').trimEnd();
    const words = (h) => plain(h || '').split(/\s+/).filter(Boolean).length;
    const diffStat = (a, b) => { const n = words(b) - words(a); return n ? `${n > 0 ? '+' : '−'}${Math.abs(n)} Wörter` : 'gleich lang'; };
    const EDIT_HEAD = { work: 'Änderung wird vorbereitet …', pending: 'Änderung am Dokument', accepted: 'Änderung übernommen', rejected: 'Änderung abgelehnt', restored: 'Checkpoint wiederhergestellt', fail: 'Änderung hat nicht geklappt' };
    const EDIT_ICON = { pending: 'pencil', accepted: 'check', rejected: 'x', restored: 'undo', fail: 'alert' };
    function editCard(m) {
      const e = m.edit, card = el('div', `agent-suggest dcc-edit st-${e.state}`);
      const dog = window.PixelDogs?.svg(m.dog || window.PixelDogs.mode, 32) || '';
      const sub = e.state === 'pending' ? [e.summary, e.stat].filter(Boolean).join(' · ') : e.state === 'fail' ? e.error : e.state === 'accepted' ? e.stat : e.state === 'work' ? 'Der neue Text wird geschrieben …' : '';
      const btns = e.state === 'pending' ? '<button type="button" class="dcc-edit-no" data-edit-no>Ablehnen</button><button type="button" class="as-go" data-edit-ok>Akzeptieren</button>'
        : e.state === 'fail' ? '<button type="button" class="as-go" data-edit-retry>Nochmal versuchen</button>'
          : e.state === 'restored' && e.redo ? '<button type="button" class="as-go" data-edit-redo>Wieder übernehmen</button>' : '';
      card.innerHTML = `<span class="as-dog">${dog}</span><span class="as-text"><strong>${e.state === 'work' ? '<i class="dc-spin"></i>' : ''}${EDIT_HEAD[e.state]}</strong>${sub ? `<span>${esc(sub)}</span>` : ''}</span>${btns ? `<span class="dcc-edit-btns">${btns}</span>` : ''}`;
      card.addEventListener('click', (ev) => {
        if (ev.target.closest('[data-edit-ok]')) acceptEdit(m);
        else if (ev.target.closest('[data-edit-no]')) { m.edit = { id: e.id, docId: e.docId, state: 'rejected' }; save(); refreshMsg(m); }
        else if (ev.target.closest('[data-edit-retry]')) runEdit(m);
        else if (ev.target.closest('[data-edit-redo]')) applyEdit(m, e.redo, e.stat);
      });
      return card;
    }
    // hochgeladene Bilder („upload:1“ …) für Änderungen – nur im Speicher, damit der Chat klein bleibt
    const editUploads = new Map();
    /* Angehängte Bilder/PDFs der eigenen Nachrichten im Dokument-Chat: bleiben im Gerät (IndexedDB, nicht im Dokument) –
       so sieht die KI sie auch beim „Neu erzeugen“, bei Nachfragen und nach dem Neuladen, und die Vorschau bleibt sichtbar */
    const msgImages = new Map(); // Nachrichten-ID → [{ mime, data, name }]
    const imgDb = (() => {
      let dbp = null;
      const open = () => (dbp ||= new Promise((res, rej) => {
        try { const r = indexedDB.open('dcc-anhaenge', 1); r.onupgradeneeded = () => r.result.createObjectStore('img'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); } catch (e) { rej(e); }
      }));
      const tx = (mode, fn) => open().then((db) => new Promise((res, rej) => { const t = db.transaction('img', mode); const q = fn(t.objectStore('img')); t.oncomplete = () => res(q?.result); t.onerror = () => rej(t.error); }));
      return { get: (id) => tx('readonly', (st) => st.get(id)).catch(() => null), put: (id, v) => tx('readwrite', (st) => st.put(v, id)).catch(() => {}) };
    })();
    const imagesOf = async (m) => {
      if (!m?.imgId) return [];
      if (!msgImages.has(m.imgId)) msgImages.set(m.imgId, (await imgDb.get(m.imgId)) || []);
      return msgImages.get(m.imgId);
    };
    const dataUrl = (x) => `data:${x.mime};base64,${x.data}`;
    // Vorschaubilder einer gespeicherten Nachricht nachträglich einsetzen (aus dem Gerätespeicher)
    const showThumbs = (node, m) => imagesOf(m).then((imgs) => {
      const pics = imgs.filter((x) => /^image\//.test(x.mime));
      if (!pics.length || node.querySelector('.dcc-imgs')) return;
      node.prepend(el('div', 'dcc-imgs', pics.map((x) => `<span style="background-image:url('${dataUrl(x)}')"></span>`).join('')));
    });
    function fillUploads(html, ups) {
      if (!ups?.length) return html;
      const t = document.createElement('template'); t.innerHTML = html;
      const sub = (v) => (typeof v === 'string' && /^upload:\d+$/.test(v) ? ups[+v.slice(7) - 1] || '' : v);
      t.content.querySelectorAll('[data-blk]').forEach((b) => {
        try { const cfg = JSON.parse(b.dataset.cfg || '{}'); if (cfg.src) cfg.src = sub(cfg.src); (cfg.items || []).forEach((x) => { x.src = sub(x.src); }); b.dataset.cfg = JSON.stringify(cfg); } catch {}
      });
      return t.innerHTML;
    }
    async function runEdit(m) {
      const e = m.edit, d = docOf(e.docId); if (!d) return;
      e.state = 'work'; delete e.error; refreshMsg(m);
      try {
        const ups = editUploads.get(e.id) || [];
        // Gesprächsverlauf mitgeben: was eingefügt werden soll, steht meist in der Antwort davor – sonst schreibt die KI etwas Eigenes (Kürzeres)
        const chat = dChats(d).find((c) => c.messages.includes(m));
        const msgs = chat ? chat.messages.slice(0, chat.messages.indexOf(m) + 1) : [m];
        const ctx = msgs.slice(-12).map((x) => `${x.role === 'user' ? 'Nutzer' : 'KI'}: ${x.text || ''}`).join('\n\n');
        const prevAnswer = [...msgs].reverse().find((x) => x.role === 'assistant' && x !== m && (x.text || '').length > 200)?.text || '';
        const source = (m.text || '').length > 300 ? m.text : prevAnswer;
        const adding = window.docWantsAppend?.(e.instruction);
        const o = await docAi({ mode: adding ? 'append' : 'edit', instruction: e.instruction, chat: ctx, source, doc: { title: d.title, html: d.content || '' }, uploads: ups.length });
        if (m.edit !== e) return;
        o.html = fillUploads(o.html, ups);
        // nur das Neue kam zurück → einsetzen, Rest bleibt. Schickt die KI doch das ganze Dokument zurück (fängt mit dem alten Text an),
        // wird es als Ganzes genommen – sonst stünde alles doppelt drin
        const oldText = plain(d.content || '').replace(/\s+/g, ' ').trim().slice(0, 300);
        const whole = oldText.length > 40 && plain(o.html).replace(/\s+/g, ' ').includes(oldText);
        if (adding && !whole) o.html = insertInto(d.content || '', clean(o.html), String(o.after || ''));
        Object.assign(e, { state: 'pending', html: o.html, title: o.title || '', summary: String(o.reply || '').trim().slice(0, 400), stat: diffStat(d.content, o.html) });
      } catch (err) {
        if (m.edit !== e) return;
        Object.assign(e, { state: 'fail', error: err.message || 'Fehler' });
      }
      save(); refreshMsg(m);
    }
    // übernehmen: vorher Checkpoint (Titel + Inhalt) in der Nachricht merken
    function applyEdit(m, next, stat) {
      const e = m.edit, d = docOf(e.docId); if (!d) return;
      const checkpoint = { title: d.title, content: d.content || '', time: Date.now() };
      m.edit = { id: e.id, docId: e.docId, state: 'accepted', stat, checkpoint };
      update(d.id, next);
      pruneCheckpoints(d); save(); refreshMsg(m);
    }
    function acceptEdit(m) {
      const e = m.edit, d = docOf(e.docId); if (!d || e.state !== 'pending') return;
      const next = { content: e.html };
      if (e.title && e.title !== d.title && /titel|umbenenn|name/i.test(e.instruction || '')) next.title = e.title; // Titel nur, wenn danach gefragt wurde
      applyEdit(m, next, e.stat);
    }
    function restoreCheckpoint(m) {
      const e = m.edit, d = docOf(e.docId); if (!d || !e.checkpoint) return;
      const redo = { title: d.title, content: d.content || '' }; // falls man es sich anders überlegt
      update(d.id, { title: e.checkpoint.title, content: e.checkpoint.content });
      m.edit = { id: e.id, docId: e.docId, state: 'restored', stat: e.stat, redo };
      save(); refreshMsg(m);
    }
    // nur die letzten 8 Checkpoints je Dokument behalten (sie enthalten den ganzen Text)
    function pruneCheckpoints(d) {
      const all = dChats(d).flatMap((c) => c.messages.filter((x) => x.edit?.checkpoint || x.edit?.redo)).sort((a, b) => (b.edit.checkpoint?.time || 0) - (a.edit.checkpoint?.time || 0));
      all.slice(8).forEach((x) => { delete x.edit.checkpoint; delete x.edit.redo; });
    }
    // Antwort neu erzeugen: alles ab dieser Antwort weg, dann noch einmal fragen
    function redoDoc(m) {
      if (dccRun || !doc) return;
      const chat = curChat(doc); const i = chat?.messages.indexOf(m) ?? -1; if (i < 1) return;
      chat.messages = chat.messages.slice(0, i); save();
      const p = pane(); if (p) p.dataset.doc = '';
      drawDocChat(); runDoc(doc, chat);
    }
    // Liste oben rechts: neuer Chat, die Chats dieses Dokuments, der Chat, aus dem es erstellt wurde
    // Chat-Symbol oben rechts: die Liste erscheint direkt im Seitenfenster (wie „Alle Chats“ im Hauptteil)
    function wireChatList(p) {
      const btn = p.querySelector('.dcc-chats'), view = p.querySelector('.dcc-listview'), box = view.querySelector('.cl-list');
      // davor der Hund des zuletzt genutzten Agenten – wie in der Chat-Liste der Seitenleiste
      const dogOf = (id) => { const dogs = window.PixelDogs?.DOGS; const d = dogs?.[id] ? id : 'general'; return dogs ? `<span class="chat-av cl-av" data-dog="${d}">${window.PixelDogs.svg(d, 24)}</span>` : ''; };
      const lastDog = (c) => [...(c.messages || [])].reverse().find((m) => m.role === 'assistant' && m.dog)?.dog;
      const row = (title, sub, attrs, dogId, active = false) => `<div class="cl-row${active ? ' active' : ''}" tabindex="0" ${attrs}>${dogOf(dogId)}<span class="cl-title">${esc(title)}</span><span class="cl-time">${esc(sub)}</span></div>`;
      const render = () => {
        const list = [...dChats(doc)].sort((a, b) => b.updated - a.updated);
        const src = sourceChats(doc);
        box.innerHTML = (list.length ? `<div class="cl-label">In diesem Dokument</div>${list.map((c) => row(c.title || 'Chat', relTime(c.updated), `data-dcc-chat="${c.id}"`, lastDog(c), !viewSrc && c.id === doc.chatId)).join('')}` : '')
          + (src.length ? `<div class="cl-label">Erstellt aus</div>${src.map((t) => row(chatOf(t).title, relTime(chatOf(t).updated || Date.now()), `data-dcc-src="${t.dataset.cid || ''}"`, chatOf(t).agent, t.dataset.cid === viewSrc)).join('')}` : '')
          || '<div class="cl-empty">Noch keine Chats zu diesem Dokument</div>';
      };
      const show = (open) => { view.hidden = !open; p.querySelector('.dcc')?.classList.toggle('listing', open); btn.setAttribute('aria-expanded', String(open)); btn.classList.toggle('on', open); if (open) render(); };
      btn.addEventListener('click', () => show(view.hidden));
      // offen: links zurück, rechts Plus für einen neuen Chat
      view.querySelector('[data-dcc-back]').addEventListener('click', () => show(false));
      view.querySelector('.dcc-listbar [data-dcc-new]').addEventListener('click', () => { viewSrc = null; doc.chatId = null; save(); p.dataset.doc = ''; drawDocChat(); });
      box.addEventListener('click', (e) => {
        const r = e.target.closest('.cl-row'); if (!r) return;
        if (r.dataset.dccChat) { viewSrc = null; doc.chatId = r.dataset.dccChat; save(); p.dataset.doc = ''; drawDocChat(); return; }
        if (r.dataset.dccSrc) { viewSrc = r.dataset.dccSrc; p.dataset.doc = ''; drawDocChat(); } // Haupt-Chat rechts anzeigen
      });
    }
    async function askDoc(q, files = []) {
      const srcTab = viewSrc && document.querySelector(`#tabs .tab[data-cid="${viewSrc}"]`);
      if (srcTab) return askSource(srcTab, q, files);
      const p = pane(), list = p?.querySelector('.dcc-list'); if (!list || !doc) return;
      const d = doc;
      let chat = curChat(d);
      if (!chat) { chat = { id: `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, title: q.slice(0, 48), updated: Date.now(), messages: [] }; dChats(d).push(chat); d.chatId = chat.id; }
      const um = { role: 'user', text: q };
      if (files.length) um.imgId = newId('i'); // Anhänge bleiben im Gerät (siehe msgImages)
      chat.messages = [...chat.messages, um].slice(-40);
      chat.updated = Date.now();
      list.append(dccMsg('user', q, files.map((f) => f.url)));
      const images = (await Promise.all(files.map((f) => fileToInline(f.file).catch(() => null)))).filter(Boolean);
      if (images.length) { editUploads.set(um, images); msgImages.set(um.imgId, images); imgDb.put(um.imgId, images); } // falls die KI erst nachfragt und das Bild später einfügt
      else delete um.imgId;
      return runDoc(d, chat, images);
    }
    /* „Thinking“ wie im Haupt-Chat: Zeile mit schimmerndem Text und Sekunden; sobald die Antwort kommt,
       wird daraus „Done thinking Xs“ (sehr schnelle Antworten zeigen gar nichts).
       thought(): echte Gedanken des Modells live darunter; danach „Thought for Xs“, ein Klick klappt sie auf */
    function dccThink(a, list, label = 'Nachdenken', doneLabel = 'Fertig gedacht') {
      // GENAU die Zeitleiste des Haupt-Chats (createWork/stepLine aus app.js) und derselbe Ablauf je Agent (thinking.js):
      // Kopf mit Hauptstatus und Hund (PixelDogs.actor) → Schritte → Gedanken als einzelne Schritte → am Ende „Completed Xs“
      // und ein blauer Haken mit „… ready · n steps“; danach klappt die Zeitleiste weich zu. Im Seitenfenster nur etwas kleiner.
      const from = Date.now(), pic = /picture/.test(label);
      const agent = a.dataset.dog || window.PixelDogs?.mode || 'general';
      let over = false, thought = null;
      const sec = () => `${Math.max(1, Math.round((Date.now() - from) / 1000))}s`;
      const w = createWork();
      w.work.classList.add('active');
      const act = w.head.querySelector('.act'), title = w.head.querySelector('.work-title'), tEl = w.head.querySelector('.t');
      const setAct = (kind, text) => { if (over) return; if (act.dataset.kind !== kind) { act.dataset.kind = kind; act.innerHTML = ACT_MARKUP[kind] || ACT_MARKUP.work; } title.classList.add('sweep'); swapText(title, text); };
      const P = (k) => window.Thinking ? Thinking.of(agent, k) : { main: 'Arbeiten', sub: k, kind: 'work', anim: 'think' };
      // Hund neben dem Hauptstatus wie im Haupt-Chat
      let actor = null;
      if (window.PixelDogs?.actor) { actor = PixelDogs.actor(agent); a.prepend(actor.el); a.classList.add('acting'); }
      const ph = (k) => { setAct(P(k).kind, P(k).main); actor?.set(P(k).anim); };
      if (pic) { setAct('work', P('picture').main); actor?.set('paint'); } else ph('start');
      a.prepend(w.work); if (actor) a.prepend(actor.el); list.scrollTop = list.scrollHeight;
      const tick = setInterval(() => { tEl.textContent = sec(); }, 250);
      const rows = {};
      const step = (key, html, live) => {
        let r = rows[key];
        if (!r) { r = rows[key] = stepLine(live ? 'spin' : 'dot', html); w.steps.append(r); }
        else if (live) r.querySelector('.step-line').innerHTML = html;
        else finishStep(r, html);
        list.scrollTop = list.scrollHeight;
        return r;
      };
      if (pic) step('picture', `<span class="shimmer ill-ico"></span><span class="shimmer">${esc(label)}</span>`, true);
      const finishThought = (st) => { if (st.done) return; st.done = true; finishStep(st.step); st.head.textContent = st.title; };
      const live = (txt) => `<span class="shimmer">${txt}</span>`;
      const x = (k, extra) => `${P(k).sub}${extra ? ` <span class="ph-x">· ${extra}</span>` : ''}`;
      return { end(keep = false, ok = true) {
        if (over) return; over = true; clearInterval(tick);
        if ((Date.now() - from) < 1000 && !keep && !w.steps.children.length) { w.work.remove(); actor?.el.remove(); a.classList.remove('acting'); return; }
        w.work.classList.remove('active'); title.classList.remove('sweep');
        thought?.steps.forEach(finishThought);
        if (rows.picture) finishStep(rows.picture, doneLabel);
        Object.values(rows).forEach((r) => { if (r.querySelector('.spinner')) finishStep(r); });
        clearTimeout(title._swap); title.getAnimations?.().forEach((an) => an.cancel());
        swapText(title, ok ? P('done').main : 'Gestoppt nach'); tEl.classList.remove('live'); tEl.textContent = sec();
        actor?.finish(ok);
        // Abschluss wie im Haupt-Chat: blauer Haken mit kurzer Zusammenfassung
        if (ok && !w.steps.querySelector('.step.finished')) {
          const n = w.steps.querySelectorAll(':scope > .step:not([hidden])').length;
          const fin = stepLine('dot', `<strong>${P('done').sub}</strong>${n ? ` <span class="t">${n} ${n === 1 ? 'Schritt' : 'Schritte'}</span>` : ''}`);
          fin.classList.add('finished');
          markerIcon(fin, 'check-circle', 'done');
          w.steps.append(fin);
        }
        setTimeout(() => { if (w.work.isConnected && !w.work.classList.contains('collapsed')) toggleWork(w.work, true); }, 900);
      }, thought(text) {
        if (over || !text) return;
        // echte Gedanken als einzelne Schritte (wie im Haupt-Chat: ChatVisuals.thoughtSteps), der laufende mit Ladezeichen
        if (!thought) { thought = { raw: '', steps: [] }; ph('thoughts'); }
        thought.raw += text;
        const segs = typeof ChatVisuals !== 'undefined' && ChatVisuals.thoughtSteps ? ChatVisuals.thoughtSteps(thought.raw) : [{ title: P('thoughts').sub, body: thought.raw }];
        segs.forEach((seg, i) => {
          let st = thought.steps[i];
          if (!st) {
            if (thought.steps[i - 1]) finishThought(thought.steps[i - 1]);
            const sl = stepLine('spin', '');
            sl.classList.add('thought');
            const head = el('button', 'thought-head'); head.type = 'button';
            const box = el('div', 'thought-text'), fold = el('div', 'fold'), inner = el('div', 'fold-in');
            inner.append(box); fold.append(inner);
            sl.querySelector('.step-line').append(head); sl.append(fold);
            st = thought.steps[i] = { step: sl, head, box, title: '', done: false };
            head.addEventListener('click', () => { if (st.done && st.box.textContent) sl.classList.toggle('open'); });
            w.steps.insertBefore(sl, rows.write || null);
          }
          if (st.title !== seg.title) { st.title = seg.title; if (st.done) st.head.textContent = seg.title; else st.head.innerHTML = live(esc(seg.title)); }
          if (seg.body !== seg.title) st.box.textContent = seg.body;
        });
        list.scrollTop = list.scrollHeight;
      }, status(d) {
        if (over) return;
        const done = d.status !== 'active', m = d.meta || {};
        if (d.stage === 'material') { step('material', done ? x('material', m.relevant === true ? 'answering from them' : m.relevant === false ? 'nothing on this topic' : '') : live(P('material').sub), !done); if (!done) ph('material'); }
        else if (d.stage === 'thinking') {
          const r = step('plan', done ? x('plan', m.analysisFailed ? 'not available' : '') : live(P('plan').sub), !done);
          if (!done && !pic) ph('plan');
          if (done && Array.isArray(m.points) && m.points.length && !r.querySelector('.plan-list')) {
            r.classList.add('foldable', 'has-box');
            r.insertAdjacentHTML('beforeend', `<div class="fold"><div class="fold-in"><div class="plan-list">${m.points.map((pt) => `<div class="plan-item" data-state="done"><span class="pi-mark">${FadeIcons.svg('check-circle', 13)}</span><span class="pi-text">${esc(pt)}</span></div>`).join('')}</div></div></div>`);
            r.querySelector('.step-line').addEventListener('click', () => r.classList.toggle('open'));
          }
        } else if (d.stage === 'market') {
          // Börse: genau die Schritte, die der Server für diese Frage gerechnet hat
          if (!done) { const k = m.first || 'market'; step('market', live(P(k).sub), true); ph(k); }
          else {
            const list2 = Array.isArray(m.steps) && m.steps.length ? m.steps : [['market', m.failed ? 'not reachable' : '']];
            list2.forEach(([k, extra], i) => (i ? step(`market${i}`, x(k, extra), false) : step('market', x(k, extra), false)));
            if (list2.length) ph(list2[list2.length - 1][0]);
          }
        }
        else if (d.stage === 'browsing' || d.stage === 'searching_sources') { const k = m.news ? 'news' : 'search'; step('src', done ? x(m.news ? 'gather' : 'gather', m.read ? `${m.read} ${m.read === 1 ? 'Quelle' : 'Quellen'}` : '') : live(P(k).sub), !done); if (!done) ph(k); }
        else if (d.stage === 'verifying') { step('check', done ? x('review', m.corrected ? `${m.corrected} ${m.corrected === 1 ? 'Punkt' : 'Punkte'} korrigiert` : '') : live(P('review').sub), !done); if (!done) ph('review'); }
        else if (d.stage === 'answering') { step('write', done ? x('work') : live(P('work').sub), !done); if (!done && !pic) ph('work'); }
      }, paint() { // Text ist fertig, jetzt entsteht noch ein Bild: Hund an die Staffelei, Schritt „Generating picture“
        if (over) return;
        ph('picture');
        if (!rows.picture) step('picture', `<span class="shimmer ill-ico"></span><span class="shimmer">Generating picture</span>`, true);
        doneLabel = 'Bild erzeugt';
      }, drop() { over = true; clearInterval(tick); w.work.remove(); actor?.el.remove(); a.classList.remove('acting'); } }; // drop: Zeile ganz weg (z. B. doch kein Bild)
    }
    // Bildwunsch? Dann steht oben von Anfang an „Generating picture“ statt „Thinking“
    // Bildwunsch? Nur wenn ausdrücklich ein Bild erstellt/gezeigt werden soll (nicht schon, wenn das Wort „Bild“ vorkommt)
    const wantsPicture = (q) => /\b(bild|grafik|illustration|abbildung|schaubild|skizze|zeichnung)\w*/i.test(q || '') && /(erstell|mach|zeichne|generier|zeig|gib|füg|such|nimm|einbau|rein)/i.test(q || '');
    const webPicture = (q) => /(internet|im netz|online|website|webseite|echte?s? (bild|foto)|such)/i.test(q || '');
    const pictureLabel = (q) => (webPicture(q) ? 'Bild suchen' : 'Bild erzeugen');
    /* Antwort weich einblenden wie im Haupt-Chat: Text kommt in kleinen Schritten, neue Absätze gleiten herein.
       filter = was vom Rohtext sichtbar sein darf (z. B. ohne [[ÄNDERN …]] und Rückfrage-Block) */
    function dccReveal(body, list, filter) {
      let raw = '', shown = 0, timer = null, waiters = [];
      const seen = [];
      const draw = () => {
        const vis = filter(raw); shown = Math.min(shown, vis.length);
        renderMarkdown(body, vis.slice(0, shown));
        const now = performance.now();
        body.querySelectorAll(':scope > *, :scope > ul > li, :scope > ol > li').forEach((b, i) => {
          seen[i] ??= now; const age = now - seen[i];
          if (age < BLOCK_FADE_MS) { b.classList.add('md-in'); b.style.animationDelay = `-${Math.round(age)}ms`; }
        });
        list.scrollTop = list.scrollHeight;
      };
      const tick = () => {
        const back = filter(raw).length - shown;
        if (back <= 0) { timer = null; waiters.forEach((r) => r()); waiters = []; return; }
        shown += Math.max(REVEAL_MIN_CHARS, Math.ceil(back / REVEAL_CATCHUP));
        draw(); timer = setTimeout(tick, REVEAL_TICK);
      };
      const start = () => { if (!timer) timer = setTimeout(tick, 0); };
      return {
        append(t) { raw += t; start(); },
        flush() { clearTimeout(timer); timer = null; shown = Infinity; draw(); waiters.forEach((r) => r()); waiters = []; },
        finish() { if (shown >= filter(raw).length) return Promise.resolve(); start(); return new Promise((r) => waiters.push(r)); },
      };
    }
    // Antwort der KI zum Dokument holen (letzte Nachricht im Chat ist die Frage)
    async function runDoc(d, chat, images = []) {
      const p = pane(), list = p?.querySelector('.dcc-list'); if (!list) return;
      const a = el('div', 'dcc-a'); a.dataset.dog = window.PixelDogs?.mode || 'general'; const body = el('div', 'dcc-body md');
      a.append(body); list.append(a);
      const pic = wantsPicture(chat.messages[chat.messages.length - 1]?.text);
      const think = pic ? dccThink(a, list, pictureLabel(chat.messages[chat.messages.length - 1]?.text), 'Bild fertig') : dccThink(a, list), rv = dccReveal(body, list, (s) => noAsk(visible(s)));
      list.scrollTop = list.scrollHeight;
      const context = `Du hilfst bei genau einem Dokument aus der Lern-App – mit denselben Fähigkeiten wie im normalen Chat (Erklären, Rückfragen, Diagramme, Bilder, Recherche). Beziehe dich zuerst und so oft wie möglich auf das Dokument. Steht etwas nicht darin, ergänze mit gesichertem Fachwissen bzw. vertrauenswürdigen Quellen und sag kurz, dass es nicht aus dem Dokument stammt. Rückfragen (nur wenn wirklich nötig) als ask-Block mit kurzen Antwortmöglichkeiten.
Du kannst das Dokument auch ändern (ergänzen, umschreiben, kürzen, umstellen, Abschnitte oder Tabellen hinzufügen, Fehler korrigieren, Titel ändern) – aber NUR, wenn der Nutzer das ausdrücklich will (z. B. „füg das ein“, „pack das ins Dokument“, „schreib das rein“, „ändere/ergänze/kürze …“). Fragen, Erklärungen, Ideen, Bilder und Grafiken beantwortest du hier im Chat, OHNE das Dokument zu ändern; passt es gut, frag am Ende in einem kurzen Satz, ob du es ins Dokument übernehmen sollst. Will der Nutzer eine Änderung am Dokument, schreib 1–2 kurze Sätze, was du ändern wirst, und setz ganz ans Ende eine eigene Zeile:
[[ÄNDERN: genaue Anweisung, was im Dokument geändert werden soll]]
Soll neuer Text ins Dokument (z. B. „schreib einen Text über …“), schreib diesen Text VOLLSTÄNDIG hier im Chat aus (der Nutzer will ihn lesen) und setz danach die [[ÄNDERN]]-Zeile (z. B. „Füge den Text oben aus dem Chat unter … ein“); der Nutzer akzeptiert die Änderung danach. Bei reinen Umbauten (kürzen, löschen, umstellen) reicht ein kurzer Satz, was du änderst.\nLIES DAS DOKUMENT GENAU: Nichts doppeln. Steht ein Thema schon drin, verbessere/ergänze genau diese Stelle, statt es noch einmal einzufügen; Überflüssiges, Falsches oder Doppeltes darfst du löschen oder umschreiben. Schick nie das ganze Dokument noch einmal neu hinein – beschreibe in [[ÄNDERN]] gezielt, was wo geändert, ersetzt oder gelöscht wird. Bei Fragen oder Erklärungen ohne Änderungswunsch: keine solche Zeile.
Du kannst auch Blöcke wie in Notion einfügen: Aufgabenliste, Tabelle, Trennlinie, Hervorhebung, Bild (wird passend gesucht oder ein hochgeladenes Bild), Galerie, Video (wird auf YouTube gesucht oder per Link), Audio-Link, Website-Karte, Kalender mit Terminen, Zeit (Countdown, Zeitraum oder „seit“), Dashboard und Diagramme (Säulen, Balken, Linie, auch mehrere Datenreihen) und eine Karte (Landkarte mit einem Ort). Beschreibe in [[ÄNDERN: …]] genau, was hinein soll (z. B. „Säulendiagramm Lernzeit Mo–Fr: 2, 3, 1,5, 4, 2 Stunden“, „Karte: Brandenburger Tor, Berlin“, „hochgeladenes Bild 1 unter der Einleitung“).
Soll etwas ins Dokument und passt ein Block klar besser als Text (Zahlen → Diagramm, Termine → Kalender, Frist → Zeit, Ort → Karte), nimm den Block. Bilder gelten wie im normalen Chat: nur wenn sie wirklich nötig sind oder der Nutzer eins möchte – dann hier im Chat als \`\`\`illustration-Block (im "prompt" genau beschreiben, welche Teile beschriftet werden sollen). Will der Nutzer ein Bild aus dem Internet bzw. ein echtes Bild („such ein Bild“, „nimm ein Bild aus dem Internet“), setze "source":"web" – dann wird ein passendes freies Bild gesucht statt eins zu erzeugen. Denk vorher still nach, ob überhaupt ein Bild nötig ist. Hervorhebungen können eine Farbe, deckend/transparent und eine Abrundung haben.
Fehlt eine wichtige Angabe, die du nicht sinnvoll selbst festlegen kannst (z. B. welcher Ort, welche Werte, welches Datum), stell genau eine kurze Rückfrage und setz noch KEINE [[ÄNDERN]]-Zeile. Kannst du es sinnvoll selbst festlegen oder wurde nicht danach gefragt, mach es direkt.\n\nTitel: ${d.title || 'Unbenannt'}\nBeschreibung: ${d.subtitle || '–'}\n\nINHALT DES DOKUMENTS:\n${plain(d.content).replace(/\n{3,}/g, '\n\n').slice(0, 30000)}`;
      // nur Rolle und Text schicken (Checkpoints und Vorschläge bleiben hier)
      const recent = chat.messages.slice(-12).map((m) => ({ role: m.role, text: m.text + (m.edit ? `\n\n(Vorgeschlagene Änderung: ${EDIT_HEAD[m.edit.state] || ''})` : '') }));
      // Anhänge der letzten eigenen Nachrichten mitschicken (wie im Haupt-Chat) – auch beim Neu erzeugen und bei Nachfragen
      const lastMsgs = chat.messages.slice(-12);
      if (!images.length) images = await imagesOf([...lastMsgs].reverse().find((m) => m.role === 'user'));
      let budget = 6;
      for (let k = lastMsgs.length - 1; k >= 0 && budget > 0; k--) {
        const m = lastMsgs[k]; if (m.role !== 'user') continue;
        const imgs = (k === lastMsgs.length - 1 && images.length ? images : await imagesOf(m)).slice(0, budget);
        if (imgs.length) { recent[k] = { ...recent[k], images: imgs }; budget -= imgs.length; }
      }
      const messages = [{ role: 'user', text: context }, { role: 'assistant', text: 'Verstanden – ich beziehe mich nur auf dieses Dokument und schlage Änderungen mit [[ÄNDERN: …]] vor.' }, ...recent];
      const ctrl = new AbortController(); dccRun = ctrl;
      p.querySelector('.dcc-send')?.classList.add('stop');
      let answer = '';
      try {
        const res = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages, model: (typeof state !== 'undefined' && state.model) || 'gemini', effort: dccEffort(), fast: typeof state !== 'undefined' ? state.fast : undefined, agent: a.dataset.dog, noClarify: true }), signal: ctrl.signal });
        if (!res.ok || !res.body) throw new Error('Die KI ist gerade nicht erreichbar.');
        for await (const { event, data } of readSse(res)) {
          if (event === 'thought' && !answer && !pic) think.thought(data.text);
          if (event === 'text') { answer += data.text; rv.append(data.text); } // Zeitleiste läuft weiter („Working“) bis alles fertig ist – wie im Haupt-Chat
          else if (event === 'status') think.status?.(data);
          else if (event === 'error') throw new Error(data.message);
        }
        await rv.finish();
        // Bild in der Antwort: erzeugen und weich einblenden (bei Bildwunsch läuft „Generating picture“ oben weiter)
        if (pic && body.querySelector('.chat-illustration[data-prompt]')) { await hydrateIllustrations(body, ctrl.signal).catch(() => {}); think.end(true); }
        else if (pic) { think.drop(); await dccPictures(a, body, list, ctrl.signal); } // doch kein Bild: Bild-Zeile verschwindet
        else if (body.querySelector('.chat-illustration[data-prompt]') && window.hydrateIllustrations) { think.paint(); await hydrateIllustrations(body, ctrl.signal).catch(() => {}); think.end(true); }
        else think.end();
      } catch (err) {
        rv.flush();
        if (err.name !== 'AbortError') a.append(el('div', 'dcc-err', esc(err.message || 'Fehler')));
        think.end(false, false);
      } finally {
        think.end();
        if (dccRun === ctrl) dccRun = null;
        pane()?.querySelector('.dcc-send')?.classList.remove('stop');
        if (answer) {
          const m = { role: 'assistant', text: visible(answer), dog: a.dataset.dog };
          const mk = EDIT_MARK.exec(answer);
          // Die KI vergisst die [[ÄNDERN]]-Zeile manchmal, obwohl ausdrücklich eine Änderung gewünscht war („füg das ein“) –
          // dann gilt die Frage selbst als Anweisung, damit die Änderung trotzdem kommt (der Nutzer muss sie ja noch akzeptieren)
          const lastQ = [...chat.messages].reverse().find((x) => x.role === 'user')?.text || '';
          const instruction = mk?.[1]?.trim() || (WANTS_EDIT.test(lastQ) && !window.parseAskBlock?.(answer)?.length ? lastQ : '');
          if (instruction) {
            m.edit = { id: newId('e'), docId: d.id, state: 'work', instruction: instruction.slice(0, 2000) };
            const ups = [...images, ...chat.messages.slice(-6).flatMap((x) => editUploads.get(x) || [])].map((x) => (typeof x === 'string' ? x : `data:${x.mime};base64,${x.data}`));
            if (ups.length) editUploads.set(m.edit.id, [...new Set(ups)].slice(0, 12));
          }
          chat.messages = [...chat.messages, m].slice(-40); chat.updated = Date.now(); save();
          if (!noAsk(m.text)) body.remove();
          msgEls.set(m, a); fillMsg(a, m); list.scrollTop = list.scrollHeight;
          if (m.edit) runEdit(m);
        } else if (!a.querySelector('.dcc-err')) a.remove();
      }
    }
    // Im angezeigten Haupt-Chat weiterschreiben: gleicher Verlauf, gleiches Modell/Aufwand wie im Chat;
    // danach wird der (gerade nicht sichtbare) Chat-Tab neu aufgebaut, damit er beim Öffnen alles zeigt
    async function askSource(tab, q, files) {
      const p = pane(), list = p?.querySelector('.dcc-list'); if (!list) return;
      if (!tabChats.get(tab) && !tab.classList.contains('active')) tabChats.set(tab, { nodes: document.createDocumentFragment(), history: [] });
      const hist = historyOf(tab);
      list.append(dccMsg('user', q, files.map((f) => f.url)));
      const images = (await Promise.all(files.map((f) => fileToInline(f.file).catch(() => null)))).filter(Boolean);
      hist.push({ role: 'user', text: q, ...(images.length ? { images } : {}) });
      const a = el('div', 'dcc-a'); a.dataset.dog = window.PixelDogs?.mode || 'general'; const body = el('div', 'dcc-body md');
      a.append(body); list.append(a);
      const pic = wantsPicture(q);
      const think = pic ? dccThink(a, list, pictureLabel(q), 'Bild fertig') : dccThink(a, list), rv = dccReveal(body, list, stripAskBlock);
      const ctrl = new AbortController(); dccRun = ctrl;
      p.querySelector('.dcc-send')?.classList.add('stop');
      let answer = '';
      try {
        const res = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: historyForRequest(hist), model: state.model, effort: EFFORTS[state.effort].toLowerCase(), fast: state.fast, agent: a.dataset.dog }), signal: ctrl.signal });
        if (!res.ok || !res.body) throw new Error('Die KI ist gerade nicht erreichbar.');
        for await (const { event, data } of readSse(res)) {
          if (event === 'thought' && !answer && !pic) think.thought(data.text);
          if (event === 'text') { answer += data.text; rv.append(data.text); } // Zeitleiste läuft weiter („Working“) bis alles fertig ist – wie im Haupt-Chat
          else if (event === 'status') think.status?.(data);
          else if (event === 'error') throw new Error(data.message);
        }
        await rv.finish();
        // Bild in der Antwort: erzeugen und weich einblenden (bei Bildwunsch läuft „Generating picture“ oben weiter)
        if (pic && body.querySelector('.chat-illustration[data-prompt]')) { await hydrateIllustrations(body, ctrl.signal).catch(() => {}); think.end(true); }
        else if (pic) { think.drop(); await dccPictures(a, body, list, ctrl.signal); } // doch kein Bild: Bild-Zeile verschwindet
        else if (body.querySelector('.chat-illustration[data-prompt]') && window.hydrateIllustrations) { think.paint(); await hydrateIllustrations(body, ctrl.signal).catch(() => {}); think.end(true); }
        else think.end();
      } catch (err) {
        rv.flush();
        if (err.name !== 'AbortError') a.append(el('div', 'dcc-err', esc(err.message || 'Fehler')));
        think.end(false, false);
      } finally {
        think.end();
        if (dccRun === ctrl) dccRun = null;
        pane()?.querySelector('.dcc-send')?.classList.remove('stop');
        if (!answer && !a.querySelector('.dcc-err')) a.remove();
        hist.push({ role: 'assistant', text: answer || '(keine Antwort)' });
        const c = chatOf(tab); c.updated = Date.now();
        // Chat-Tab (nicht sichtbar) neu aufbauen, damit er beim Öffnen die neuen Nachrichten zeigt
        const saved = tabChats.get(tab);
        if (saved && !tab.classList.contains('active') && !chat.childNodes.length) {
          renderSavedHistory(hist);
          const frag = document.createDocumentFragment(); frag.append(...chat.childNodes);
          saved.nodes = frag;
        }
        saveChats();
      }
    }
    const grow = (ta) => { if (!ta) return; ta.style.height = 'auto'; ta.style.height = `${ta.scrollHeight}px`; };
    const content = () => view.querySelector('.dc-content');

    function draw() {
      if (!doc) { view.innerHTML = '<div class="dc-empty big">Dieses Dokument gibt es nicht mehr.</div>'; return; }
      view.innerHTML = `<div class="dc-topbar"><div class="dc-hist"><button type="button" class="icon-btn" data-act="undo" aria-label="Rückgängig" title="Rückgängig (Strg+Z)">${fi('undo', 15)}</button><button type="button" class="icon-btn redo" data-act="redo" aria-label="Wiederholen" title="Wiederholen (Strg+Umschalt+Z)">${fi('undo', 15)}</button></div><span class="grow"></span>
          <span class="dc-busy" hidden></span>
          <button type="button" class="icon-btn dc-focusbtn" data-act="focus" aria-label="Fokusmodus" title="Fokusmodus">${fi('focus', 16)}</button>
          <button type="button" class="icon-btn dc-pinbtn${doc.pinned ? ' on' : ''}" data-act="pin" aria-label="${doc.pinned ? 'Lösen' : 'Anheften'}">${fi('pin', 15)}</button>
          <button type="button" class="icon-btn dc-setbtn" data-act="settings" aria-label="Einstellungen des Dokuments">${fi('sliders', 15)}</button>
          <button type="button" class="icon-btn dc-panebtn" data-act="pane" aria-label="Seitenfenster rechts ein-/ausklappen" title="Seitenfenster">${icon('i-sidebar', 16)}</button></div>
        <div class="dc-body"><div class="dc-scroll">
          <div class="dc-page">
          <div class="dc-adds"><span class="tk-pop dc-mpop dc-ppop"><button type="button" class="dc-pchip" data-popen></button>
            <span class="tk-menu tags dc-mmenu"><span class="tk-tag-row"><input class="tk-tag-in dc-proj-in" placeholder="Suchen" maxlength="40" aria-label="Projekt suchen oder anlegen" /></span><span class="tk-tag-list dc-proj-list"></span></span></span>
            <button type="button" class="dc-add" data-act="icon" data-add="icon">${fi('smile', 13)}Icon hinzufügen</button><button type="button" class="dc-add" data-act="cover" data-add="cover">${fi('image', 13)}Cover hinzufügen</button></div>
          <div class="dc-cover"><div class="dc-cover-img"></div><div class="dc-cover-acts">
            <button type="button" data-act="cover">${fi('image', 12)}Cover ändern</button><button type="button" data-act="cover-del">Entfernen</button></div></div>
          <button type="button" class="dc-icon" data-act="icon" aria-label="Icon ändern" title="Icon ändern" hidden><span class="dc-icon-g"></span></button>
          <textarea class="dc-title-in" rows="1" placeholder="Titel" maxlength="160" aria-label="Titel">${esc(doc.title)}</textarea>
          <textarea class="dc-sub-in" rows="1" placeholder="Beschreibung hinzufügen …" maxlength="400" aria-label="Beschreibung">${esc(doc.subtitle || '')}</textarea>
          <div class="dc-meta open shown"><div class="dc-meta-body"><div class="dc-meta-in"></div></div></div>
          <div class="dc-content" contenteditable="true" spellcheck="true" data-placeholder="" aria-label="Inhalt">${doc.content || ''}</div>
          <div class="dc-gutter" hidden><button type="button" class="dc-fold" aria-label="Abschnitt ein-/ausklappen" title="Ein-/ausklappen">${fi('chevron-down', 10)}</button></div>
          <div class="dc-drop" hidden></div>
        </div></div>
        <nav class="prompt-nav dc-nav" aria-label="Überschriften in diesem Dokument"></nav>
        <div class="pn-card dc-nav-card"><div class="pn-q"></div><div class="pn-a"></div></div></div>
        <div class="dc-focus-bar"><button type="button" class="dc-focus-exit" data-act="focus" aria-label="Fokusmodus beenden" title="Fokusmodus beenden"><i></i></button></div>`;
      wireMeta(); wireProj(); fixHeadings(content()); wrapTables(content()); renderViz(content()); renderBlocks(); wire(); drawHist(); drawPane(); drawCover(); applyFolds(); buildNav();
      grow(view.querySelector('.dc-title-in')); grow(view.querySelector('.dc-sub-in'));
      if (writing.has(doc.id)) busy('KI schreibt …');
      if (api.focusTitle && !focusOn) { api.focusTitle = false; setTimeout(() => view.querySelector('.dc-title-in')?.focus(), 60); }
      applyFocus();
    }
    /* ---------- Fokusmodus: nur der Text, ganzer Bildschirm (Sidebar, Leisten, Griffe weg), nichts bearbeitbar;
       oben mittig ein etwas größerer Knopf beendet ihn (auch Esc) ---------- */
    function applyFocus() {
      view.classList.toggle('focus', focusOn);
      const c = content(); if (c) c.setAttribute('contenteditable', focusOn ? 'false' : 'true');
      view.querySelectorAll('.dc-title-in, .dc-sub-in').forEach((t) => { t.readOnly = focusOn; });
    }
    function setFocus(on) {
      if (focusOn === on) return;
      focusOn = on;
      const a = app();
      if (on) {
        focusPrev = { collapsed: !!a?.classList.contains('collapsed') };
        document.activeElement?.blur?.(); hideFmt();
        a?.classList.add('collapsed', 'doc-focus');
        a?.classList.remove('rpane-open');
        // kein Browser-Vollbild (zeigt eigene Hinweise und ein ×) – die App selbst blendet alles aus
      } else {
        a?.classList.remove('doc-focus');
        a?.classList.toggle('collapsed', !!focusPrev?.collapsed);
        drawPane();
        // sauberes Verlassen: Seite blendet weich ein, statt zu springen
        view.classList.remove('focus-out'); void view.offsetWidth; view.classList.add('focus-out');
        setTimeout(() => view.classList.remove('focus-out'), 460);
      }
      applyFocus();
    }
    // Vollbild vom System beendet (Esc, Wischgeste) → Fokusmodus auch beenden
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && focusOn) { e.preventDefault(); setFocus(false); } });
    const changed = () => { touch(doc); renderSide(); if (list.open) list.render(); window.markDrafts?.(); };
    function wire() {
      const title = view.querySelector('.dc-title-in'), sub = view.querySelector('.dc-sub-in'), c = content();
      const scroll = view.querySelector('.dc-scroll');
      title.addEventListener('input', () => {
        doc.title = title.value.replace(/\n/g, ' ');
        grow(title);
        window.setTabTitle?.(tab, doc.title.trim() || 'Unbenannt');
        changed();
      });
      title.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); c.focus(); } });
      sub.addEventListener('input', () => { doc.subtitle = sub.value.replace(/\n/g, ' '); grow(sub); changed(); });
      sub.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); c.focus(); } });
      c.addEventListener('focus', () => document.execCommand('defaultParagraphSeparator', false, 'p'));
      c.addEventListener('input', () => { window.DocBlocks?.tidy(c); const next = c.innerHTML === '<br>' ? '' : serialize(c); remember(doc.content, next); doc.content = next; changed(); clearTimeout(navT); navT = setTimeout(buildNav, 250); });
      window.DocBlocks?.attach(c, blockCtx()); // „/“ öffnet das Block-Menü
      c.addEventListener('keydown', (e) => {
        if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
        const k = e.key.toLowerCase();
        if (k === 'z' || k === 'y') { e.preventDefault(); stepHist(k === 'z' && !e.shiftKey); }
      });
      c.addEventListener('keydown', (e) => e.stopPropagation());
      // Einfügen immer als reiner Text (keine fremden Formate oder Skripte) – Bilder werden zu Bild-Blöcken
      c.addEventListener('paste', (e) => {
        e.preventDefault();
        const imgs = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith('image/'));
        if (imgs.length) { const sel = getSelection(); insertImages(imgs, sel?.rangeCount ? topChild(sel.anchorNode) : null); return; }
        document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
      });
      // Bild hineinziehen (Datei oder Bild von einer Website) → Bild-Block an der Stelle, abgerundet und per Rechtsklick bedienbar
      c.addEventListener('dragover', (e) => { if ([...(e.dataTransfer?.types || [])].some((t) => t === 'Files' || t === 'text/uri-list' || t === 'text/html')) e.preventDefault(); });
      c.addEventListener('drop', (e) => {
        const files = [...(e.dataTransfer?.files || [])].filter((f) => f.type.startsWith('image/'));
        // auch Bilder aus dem KI-Chat (data:-Bilder, z. B. Lerngrafiken) und von Websites
        const url = !files.length && (/<img[^>]+src="((?:https?:\/\/|data:image\/)[^"]+)"/i.exec(e.dataTransfer?.getData('text/html') || '')?.[1] || (/^https?:\/\/\S+\.(png|jpe?g|webp|gif|svg)(\?\S*)?$/i.test(e.dataTransfer?.getData('text/uri-list') || '') ? e.dataTransfer.getData('text/uri-list') : ''));
        if (!files.length && !url) return;
        e.preventDefault();
        const r = document.caretRangeFromPoint?.(e.clientX, e.clientY);
        const at = r ? topChild(r.startContainer) : null;
        if (files.length) insertImages(files, at); else insertImageBlock(url, at);
      });
      c.addEventListener('mousemove', placeGutter);
      view.querySelector('.dc-page').addEventListener('mouseleave', () => { if (!dragging && !caretHead()) gutter().hidden = true; });
      // Pfeil + Griff kleben an ihrer Überschrift: bei Tippen, Löschen, Umbruch, Einklappen, Größenänderung neu ausrichten
      const follow = () => { clearTimeout(followRaf); followRaf = setTimeout(refreshGutter, 0); };
      new MutationObserver(follow).observe(c, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['data-fold', 'class'] });
      new ResizeObserver(follow).observe(c);
      c.addEventListener('keyup', follow);
      c.addEventListener('focus', follow);
      if (onSelection) document.removeEventListener('selectionchange', onSelection); // beim Neuzeichnen nicht doppelt anmelden
      onSelection = () => { if (view.isConnected && !view.hidden) follow(); };
      document.addEventListener('selectionchange', onSelection);
      view.querySelector('.dc-fold').addEventListener('click', () => { if (!gutterFor) return; gutterFor.toggleAttribute('data-fold'); applyFolds(true); commit(); placeGutterAt(gutterFor); });
      // Titel oben erst, wenn der große Titel aus dem Bild gescrollt ist; Scrollleiste nur beim Scrollen
      let st = 0;
      scroll.addEventListener('scroll', () => {
        title.classList.toggle('stuck', scroll.scrollTop > 24);
        scroll.classList.add('scrolling'); clearTimeout(st); st = setTimeout(() => scroll.classList.remove('scrolling'), 900);
        requestAnimationFrame(markNav);
      }, { passive: true });
      wireNav();
    }
    const commit = () => { const c = content(); if (!c || !doc) return; const next = serialize(c); remember(doc.content, next); doc.content = next; changed(); buildNav(); };
    /* ---------- Rückgängig / Wiederholen (oben links, Strg+Z / Strg+Umschalt+Z) ----------
       Stände des Inhalts je Dokument; schnelles Tippen (< 0,7 s Pause) zählt als ein Schritt. Gilt auch für Blöcke und KI-Änderungen. */
    const hist = new Map();
    const histOf = (id) => { if (!hist.has(id)) hist.set(id, { u: [], r: [], t: 0 }); return hist.get(id); };
    function remember(prev, next) {
      if (!doc || prev === next) return;
      const h = histOf(doc.id), now = Date.now();
      if (now - h.t > 700 && h.u[h.u.length - 1] !== prev) { h.u.push(prev || ''); if (h.u.length > 100) h.u.shift(); }
      h.t = now; h.r = [];
      drawHist();
    }
    function drawHist() {
      const h = doc && histOf(doc.id);
      view.querySelector('[data-act="undo"]')?.toggleAttribute('disabled', !h?.u.length);
      view.querySelector('[data-act="redo"]')?.toggleAttribute('disabled', !h?.r.length);
    }
    function stepHist(back) {
      if (!doc) return;
      const h = histOf(doc.id), from = back ? h.u : h.r, to = back ? h.r : h.u;
      if (!from.length) return;
      const sc = view.querySelector('.dc-scroll'), top = sc?.scrollTop || 0;
      to.push(doc.content || '');
      doc.content = from.pop();
      h.t = 0;
      touch(doc); renderSide(); if (list.open) list.render();
      draw();
      const sc2 = view.querySelector('.dc-scroll'); if (sc2) sc2.scrollTop = top;
      drawHist();
    }
    // Grafiken: im Dokument steht nur der Platzhalter mit Quelltext, gezeichnet wird beim Anzeigen
    function renderViz(root) {
      // Formeln (aus dem Chat übernommen): mit KaTeX setzen, nicht direkt bearbeitbar – gespeichert wird nur der TeX-Text
      root?.querySelectorAll('[data-math]').forEach((m) => {
        if (m.firstChild) return;
        m.classList.add('dc-math'); m.contentEditable = 'false';
        try { m.innerHTML = window.katex ? katex.renderToString(m.dataset.math, { displayMode: m.hasAttribute('data-display'), throwOnError: false }) : esc(m.dataset.math); }
        catch { m.textContent = m.dataset.math; }
      });
      root?.querySelectorAll('[data-viz]').forEach((v) => {
        if (v.firstElementChild) return;
        v.classList.add('dc-viz', 'md'); v.contentEditable = 'false';
        const f = window.renderDocViz?.(v.dataset.viz, v.dataset.spec, v);
        if (f) v.append(f); else v.innerHTML = '<div class="chart-error">Grafik konnte nicht dargestellt werden.</div>';
      });
    }
    // Blöcke aus dem Slash-Menü (docblocks.js): zeichnen, Seitenlinks öffnen, nach dem Einfügen neu zeichnen
    const blockCtx = () => ({
      onChange: commit,
      afterInsert: () => { wrapTables(content()); renderBlocks(); },
      docs: () => docs.filter((d) => d.id !== doc?.id && !isEmpty(d)).sort((a, b) => b.updated - a.updated).map((d) => ({ id: d.id, title: d.title.trim() || 'Unbenannt', icon: d.icon || null })),
      docInfo: (id) => { const d = docOf(id); return d ? { title: d.title.trim() || 'Unbenannt', icon: d.icon || null } : null; },
      openDoc: (id) => open(id),
      // „Frag die KI“: Seitenfenster mit dem Dokument-Chat öffnen, Frage vorbereitet
      askAi: (text) => {
        paneOpen = true; localStorage.setItem('docs.pane', '1'); drawPane();
        setTimeout(() => { const ta = pane()?.querySelector('.dcc-form textarea'); if (!ta) return; ta.value = text; ta.dispatchEvent(new Event('input')); ta.focus(); ta.setSelectionRange(text.length, text.length); }, 80);
      },
      // „Verschieben nach“: Block ans Ende eines anderen Dokuments
      moveTo: (id, html) => { const t = docOf(id); if (t) update(id, { content: `${t.content || ''}${html}` }); },
      // „Verschieben nach → Neues Dokument“: leeres Dokument anlegen (ohne es zu öffnen)
      newDoc: () => { const d = { id: newId('d'), title: '', subtitle: '', projectId: '', tags: [], content: '', created: Date.now(), updated: Date.now(), ws: wsNow() }; docs.unshift(d); save(); return d.id; },
    });
    function renderBlocks() { window.DocBlocks?.render(content(), blockCtx()); }
    function serialize(c) {
      const x = c.cloneNode(true);
      window.DocBlocks?.strip(x);
      x.querySelectorAll('[data-viz]').forEach((v) => { v.replaceChildren(); v.className = 'dc-viz'; v.removeAttribute('contenteditable'); });
      x.querySelectorAll('[data-math]').forEach((m) => { m.replaceChildren(); m.removeAttribute('class'); m.removeAttribute('contenteditable'); });
      x.querySelectorAll('.dc-in').forEach((n) => n.classList.remove('dc-in'));
      return x.innerHTML;
    }
    function busy(text) {
      const b = view.querySelector('.dc-busy'); if (!b) return;
      b.hidden = !text; b.innerHTML = text ? `<i class="dc-spin"></i>${esc(text)}` : '';
    }

    /* ---------- Abschnitte: an Überschriften ein-/ausklappen und verschieben ---------- */
    const gutter = () => view.querySelector('.dc-gutter');
    const isHead = (n) => n?.nodeType === 1 && /^H[1-4]$/.test(n.tagName);
    const level = (n) => +n.tagName[1];
    let gutterFor = null, dragging = null;
    function topChild(n) { const c = content(); while (n && n.parentNode !== c) n = n.parentNode; return n; }
    // Bild-Block nach dem Element „after“ (sonst am Ende) einsetzen und speichern
    function insertImageBlock(src, after) {
      const c = content(); if (!c || !src) return;
      const b = document.createElement('div');
      b.dataset.blk = 'image'; b.dataset.cfg = JSON.stringify({ src });
      if (after && after.parentNode === c) after.after(b); else c.append(b);
      renderBlocks(); commit();
      return b;
    }
    async function insertImages(files, after) {
      for (const f of files.slice(0, 8)) { // mehrere Bilder untereinander, in der gezogenen Reihenfolge
        try { after = insertImageBlock(await window.DocBlocks.imageData(f), after) || after; }
        catch (err) { busy(err.message); setTimeout(() => busy(''), 3000); }
      }
    }
    function sectionOf(h) {
      const out = [h]; let n = h.nextSibling;
      while (n && !(isHead(n) && level(n) <= level(h))) { out.push(n); n = n.nextSibling; }
      return out;
    }
    /* ältere KI-Dokumente: lose nummerierte Zeilen („1.2.1 …“) oder fett gedruckte Einzeiler sind Überschriften
       → in echte h2/h3/h4 umwandeln, damit man sie einklappen und verschieben kann */
    function fixHeadings(c) {
      if (!c) return;
      let changedAny = false;
      const NUM = /^(\d+(?:\.\d+)*)\.?\s+\S/;
      const asHead = (text, depth) => { const h = document.createElement(depth <= 1 ? 'h2' : depth === 2 ? 'h3' : 'h4'); h.textContent = text; return h; };
      [...c.childNodes].forEach((n) => {
        if (n.nodeType === 3) {
          const t = n.textContent.trim(); if (!t) return;
          const m = NUM.exec(t);
          const r = m ? asHead(t, m[1].split('.').length) : Object.assign(document.createElement('p'), { textContent: t });
          n.replaceWith(r); changedAny = true; return;
        }
        if (n.nodeType === 1 && n.tagName === 'P' && n.children.length === 1 && /^(B|STRONG)$/.test(n.firstElementChild.tagName)) {
          const t = n.textContent.trim(), m = NUM.exec(t);
          if (m && t.length <= 90 && n.firstElementChild.textContent.trim() === t) { n.replaceWith(asHead(t, m[1].split('.').length)); changedAny = true; }
        }
      });
      if (changedAny && doc) { doc.content = serialize(c); save(); }
    }

    /* ---------- Cover (Banner oben): Verläufe, eigene Farbe in drei Stilen, eigene Bilder ----------
       doc.cover = { kind: 'preset', id } | { kind: 'color', c, style } | { kind: 'image', src } */
    /* ---------- Infos zum Dokument: Strich „Infos“ klappt per Klick auf ----------
       Priorität wie bei den Aufgaben (gleiche Stufen, gleiches Balken-Icon, gleiches Menü), Tags mit Plus. */
    const PRIOS = window.Tasks?.PRIOS || [{ id: 'none', name: 'Keine' }];
    const prioIcon = (id, s) => window.Tasks?.prioIcon?.(id, s) || '';
    const OLD_PRIO = { mid: 'medium' };
    const fmtDate = (t) => (t ? new Date(t).toLocaleString('de-DE', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '–');
    function drawMeta() {
      const box = view.querySelector('.dc-meta-in'); if (!box || !doc) return;
      const words = (plain(doc.content).match(/\S+/g) || []).length;
      const heads = content() ? [...content().children].filter(isHead).length : 0;
      const pid = OLD_PRIO[doc.priority] || doc.priority || 'none';
      const prio = PRIOS.find((p) => p.id === pid) || PRIOS[0];
      const ts = (doc.tags || []).map(tagOf).filter(Boolean);
      const row = (ic, label, value) => `<div class="dc-mrow"><span class="dc-mlabel">${fi(ic, 15)}${label}</span><span class="dc-mval">${value}</span></div>`;
      const tagsHtml = `${ts.map((g) => `<span class="dc-tag" style="--c:${g.c}"><i class="tag-dot"></i>${esc(g.name)}</span>`).join('')}
            <span class="tk-pop dc-mpop"><button type="button" class="dc-madd dc-tagadd" data-mopen="tags" aria-label="Tag hinzufügen">${fi('tag', 12)}${ts.length ? '' : '<span>Tags</span>'}</button>
            <span class="tk-menu tags dc-mmenu"><span class="tk-tag-row"><input class="tk-tag-in" placeholder="Suchen" maxlength="24" aria-label="Tag suchen oder anlegen" /></span><span class="tk-tag-list"></span></span></span>`;
      box.innerHTML = `<div class="dc-tagline">${tagsHtml}</div><div class="dc-ptable"${docSet().infos === false ? ' hidden' : ''}>` + row('calendar', 'Erstellt', esc(fmtDate(doc.created)))
        + row('clock', 'Bearbeitet', esc(fmtDate(doc.updated || doc.created)))
        + row('flag', 'Priorität', `<span class="tk-pop dc-mpop"><button type="button" class="dc-mbtn${pid === 'none' ? ' empty' : ''}${pid === 'urgent' ? ' urgent' : ''}" data-mopen="prio">${prioIcon(prio.id, 14)}${esc(pid === 'none' ? 'Keine' : prio.name)}</button>
            <span class="tk-menu dc-mmenu">${PRIOS.map((p) => `<button type="button" class="tk-mi${p.id === pid ? ' on' : ''}" data-prio="${p.id}">${prioIcon(p.id, 15)}<span>${esc(p.name)}</span>${fi('check', 12)}</button>`).join('')}</span></span>`)
        + row('file', 'Umfang', `${words.toLocaleString('de-DE')} Wörter`)
        + row('list', 'Abschnitte', String(heads)) + '</div>';
    }
    function drawMetaTags() {
      const list = view.querySelector('.dc-meta .tk-tag-list'), inp = view.querySelector('.dc-meta .tk-tag-in'); if (!list) return;
      const q = inp.value.trim().toLowerCase(), have = doc.tags || [];
      const found = tags.filter((g) => g.name.toLowerCase().includes(q));
      // Tag bearbeiten: Name, Farbe, Löschen
      const ed = tagOf(metaEdit);
      if (ed) {
        list.innerHTML = `<span class="tk-tag-editbox"><span class="tk-tag-edit-l">Tag bearbeiten</span><input class="tk-tag-name" data-mname value="${esc(ed.name)}" maxlength="24" aria-label="Name" />${UIKit.colorRow(ed.c, 'data-medit-color')}`
          + `<span class="tk-tag-edit-foot"><button type="button" class="tk-mini danger" data-mdel="${ed.id}">${fi('trash', 11)}Löschen</button><span class="grow"></span><button type="button" class="tk-mini" data-mdone>Fertig</button></span></span>`;
        return;
      }
      // neuer Tag: Farbe wählen
      if (metaNew) {
        list.innerHTML = `<span class="tk-tag-new-l">Farbe für „${esc(metaNew)}“</span>${UIKit.colorRow('', 'data-mnew-color')}`;
        return;
      }
      const exact = tags.some((g) => g.name.toLowerCase() === q);
      list.innerHTML = (q && !exact ? `<span class="tk-mi tk-tag-add" data-madd role="button" tabindex="0">${fi('plus', 12)}<span>„${esc(inp.value.trim())}“ hinzufügen</span></span>` : '')
        + found.map((g) => `<span class="tk-mi tag${have.includes(g.id) ? ' on' : ''}" data-mtag="${g.id}" role="button" tabindex="0"><i style="background:${g.c}"></i><span>${esc(g.name)}</span>${fi('check', 12)}<button type="button" class="tk-tag-pen" data-medit="${g.id}" aria-label="Tag bearbeiten" title="Bearbeiten">${fi('pencil', 11)}</button></span>`).join('')
        + (!found.length && !q ? '<span class="tk-ml">Noch keine Tags</span>' : '');
    }
    // Projekt: suchen, wählen (nochmal = entfernen), neu anlegen mit nächster Farbe
    // Projekt: suchen, wählen (nochmal = entfernen), neu anlegen – wie bei den Tags: erst der Name, dann Icon und Farbe
    // Neues Projekt: erst der Name, dann die Farbe antippen, danach das Icon (in dieser Farbe) – das Icon legt das Projekt an
    let projNew = '', projIcon = 'folder', projColor = '';
    function drawMetaProj() {
      const list = view.querySelector('.dc-proj-list'), inp = view.querySelector('.dc-proj-in'); if (!list) return;
      if (projNew && !projColor) {
        list.innerHTML = `<span class="tk-tag-new-l">Farbe für „${esc(projNew)}“</span>${UIKit.colorRow('', 'data-pjcolor')}`;
        return;
      }
      if (projNew) {
        list.innerHTML = `<span class="tk-tag-new-l">Icon für „${esc(projNew)}“ – antippen legt das Projekt an</span>
          <span class="dc-pj-icons" style="color:${esc(projColor)}">${DocIcons.names.map((n) => `<button type="button" class="dc-pj-ic" data-pjicon="${n}" aria-label="Icon">${DocIcons.svg(n, 16)}</button>`).join('')}</span>`;
        list.querySelector('.dc-pj-icons')?.animate([{ opacity: 0, transform: 'translateX(10px)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' });
        return;
      }
      const q = inp.value.trim(), ql = q.toLowerCase();
      const found = projects.filter((p) => p.name.toLowerCase().includes(ql));
      const exact = projects.some((p) => p.name.toLowerCase() === ql);
      list.innerHTML = (q && !exact ? `<span class="tk-mi dc-pj-add" data-mproj-new role="button" tabindex="0"><span>„${esc(q)}“ anlegen</span></span>` : '')
        + found.map((p) => `<span class="tk-mi tag${doc.projectId === p.id ? ' on' : ''}" data-mproj="${p.id}" role="button" tabindex="0"><span class="dc-pj-mi" style="color:${p.c}">${DocIcons.svg(p.icon && DocIcons.has(p.icon) ? p.icon : 'cube', 15)}</span><span>${esc(p.name)}</span>${fi('check', 12)}</span>`).join('')
        + (!found.length && !q ? '<span class="tk-ml dc-pj-none">Noch keine Projekte</span>' : '');
    }
    function drawProj() {
      const b = view.querySelector('.dc-pchip'); if (!b || !doc) return;
      const pr = projOf(doc.projectId);
      b.classList.toggle('set', !!pr);
      b.classList.toggle('tinted', !!pr); // Projektfarbe für Icon, transparente Fläche und Text
      if (pr) b.style.setProperty('--pc', pr.c); else b.style.removeProperty('--pc');
      const ic = pr ? `<span class="dc-pj-pic" style="color:${pr.c}">${DocIcons.svg(pr.icon && DocIcons.has(pr.icon) ? pr.icon : 'cube', 14)}</span>` : '<svg width="13" height="13" aria-hidden="true"><use href="#d-cube"/></svg>';
      b.innerHTML = `${ic}<span>${pr ? esc(pr.name) : 'Projekt'}</span>${fi('chevron-down', 9)}`;
      view.querySelector('.dc-page')?.classList.toggle('with-proj', !!pr);
    }
    const setProj = (id) => { doc.projectId = doc.projectId === id ? '' : id; touch(doc); changed(); drawProj(); view.querySelector('.dc-ppop')?.classList.remove('open'); };
    function wireProj() {
      const box = view.querySelector('.dc-adds'); if (!box) return;
      drawProj();
      const pop = box.querySelector('.dc-ppop'), inp = box.querySelector('.dc-proj-in');
      box.addEventListener('click', (e) => {
        if (e.target.closest('[data-popen]')) { const open = !pop.classList.contains('open'); pop.classList.toggle('open', open); if (open) { inp.value = ''; projNew = ''; drawMetaProj(); setTimeout(() => inp.focus(), 30); } return; }
        const pj = e.target.closest('[data-mproj]'); if (pj) { setProj(pj.dataset.mproj); return; }
        if (e.target.closest('[data-mproj-new]')) { newProj(inp.value.trim()); return; }
        const pi = e.target.closest('[data-pjicon]');
        if (pi && projColor) { projIcon = pi.dataset.pjicon; makeProj(projColor); return; }
        const pc = e.target.closest('[data-pjcolor]'); if (pc) { projColor = pc.dataset.pjcolor; drawMetaProj(); return; }
        if (e.target.closest('.tk-picker')) return;
        const cu = e.target.closest('[data-custom]');
        if (cu && projNew) { const host = cu.closest('.tk-colors').nextElementSibling; if (host.firstChild) { host.replaceChildren(); return; } host.append(UIKit.colorPicker('#5b8cff', (hex, done) => { cu.style.setProperty('--c', hex); cu.classList.add('on'); if (done) { projColor = hex; drawMetaProj(); } }, 'Weiter')); }
      });
      inp.addEventListener('input', () => { projNew = ''; projColor = ''; drawMetaProj(); });
      inp.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Escape') { pop.classList.remove('open'); return; }
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const name = inp.value.trim(); if (!name) return;
        const hit = projects.find((p) => p.name.toLowerCase() === name.toLowerCase());
        if (hit) setProj(hit.id); else newProj(name);
      });
      document.addEventListener('pointerdown', (e) => { if (box.isConnected && !box.contains(e.target)) pop.classList.remove('open'); });
    }
    const newProj = (name) => { if (!name) return; projNew = name.slice(0, 40); projIcon = 'folder'; projColor = ''; drawMetaProj(); };
    const makeProj = (c) => { const pr = { id: newId('p'), name: projNew, c, icon: projIcon }; projects.push(pr); projNew = ''; projColor = ''; save(); setProj(pr.id); };
    let metaNew = '', metaEdit = null; // Tag wird gerade angelegt (Name) bzw. bearbeitet (id)
    const tagPop = () => view.querySelector('.dc-meta .dc-mpop:has(.tk-tag-in)');
    // Infos: Tags unter dem Titel, darunter die feste Tabelle (abschaltbar in den Dokument-Einstellungen)
    function wireMeta() {
      const meta = view.querySelector('.dc-meta'); if (!meta) return;
      drawMeta(); // Infos stehen immer da (Tags unter dem Titel, darunter die Tabelle) – kein Auf-/Zuklappen
      const closeMenus = () => { metaNew = ''; metaEdit = null; meta.querySelectorAll('.dc-mpop.open').forEach((x) => x.classList.remove('open')); };
      const reopenTags = (focus) => { const pop = tagPop(); if (!pop) return; pop.classList.add('open'); const inp = pop.querySelector('.tk-tag-in'); inp.value = ''; drawMetaTags(); if (focus) inp.focus(); };
      meta.addEventListener('click', (e) => {
        const op = e.target.closest('[data-mopen]');
        if (op) {
          const pop = op.closest('.dc-mpop'), open = !pop.classList.contains('open');
          closeMenus(); pop.classList.toggle('open', open);
          if (open && op.dataset.mopen === 'tags') { const inp = pop.querySelector('.tk-tag-in'); inp.value = ''; drawMetaTags(); setTimeout(() => inp.focus(), 30); }
          return;
        }
        const pr = e.target.closest('[data-prio]');
        if (pr) { if (pr.dataset.prio === 'none') delete doc.priority; else doc.priority = pr.dataset.prio; touch(doc); changed(); drawMeta(); return; }
        // Tags anlegen (Farbe wählen) und bearbeiten
        if (e.target.closest('[data-madd]')) { metaNew = view.querySelector('.dc-meta .tk-tag-in').value.trim(); drawMetaTags(); return; }
        const nc = e.target.closest('[data-mnew-color]');
        if (nc && metaNew) {
          const g = { id: newId('g'), name: metaNew, c: nc.dataset.mnewColor };
          tags.push(g); saveTags(); (doc.tags || (doc.tags = [])).push(g.id); metaNew = '';
          touch(doc); changed(); drawMeta(); reopenTags(true); return;
        }
        const cu = e.target.closest('[data-custom]');
        if (cu) {
          const host = cu.closest('.tk-colors').nextElementSibling;
          if (host.firstChild) { host.replaceChildren(); return; }
          const isNew = cu.dataset.custom === 'data-mnew-color';
          host.append(UIKit.colorPicker(isNew ? '#5b8cff' : (tagOf(metaEdit)?.c || '#5b8cff'), (hex, done) => {
            cu.style.setProperty('--c', hex); cu.classList.add('on');
            if (isNew) { if (done) { const g = { id: newId('g'), name: metaNew, c: hex }; tags.push(g); saveTags(); (doc.tags || (doc.tags = [])).push(g.id); metaNew = ''; touch(doc); changed(); drawMeta(); reopenTags(true); } }
            else { const g = tagOf(metaEdit); if (g) { g.c = hex; saveTags(); drawMeta(); reopenTags(false); } }
          }, isNew ? 'Anlegen' : 'Übernehmen'));
          return;
        }
        if (e.target.closest('.tk-picker')) return;
        const me = e.target.closest('[data-medit]');
        if (me) { e.stopPropagation(); metaEdit = me.dataset.medit; metaNew = ''; drawMetaTags(); view.querySelector('.dc-meta [data-mname]')?.focus(); return; }
        const ec = e.target.closest('[data-medit-color]');
        if (ec) { const g = tagOf(metaEdit); if (g) { g.c = ec.dataset.meditColor; saveTags(); drawMeta(); reopenTags(false); } return; }
        if (e.target.closest('[data-mdone]')) { metaEdit = null; drawMeta(); reopenTags(false); return; }
        const md = e.target.closest('[data-mdel]');
        if (md) {
          const id = md.dataset.mdel;
          tags = tags.filter((x) => x.id !== id); saveTags();
          docs.forEach((d) => { if (d.tags?.includes(id)) d.tags = d.tags.filter((x) => x !== id); });
          metaEdit = null; save(); drawMeta(); reopenTags(false); return;
        }
        const tg = e.target.closest('[data-mtag]');
        if (tg) {
          const list = doc.tags || (doc.tags = []), i = list.indexOf(tg.dataset.mtag);
          if (i < 0) list.push(tg.dataset.mtag); else list.splice(i, 1);
          touch(doc); changed(); drawMeta(); reopenTags(false); return;
        }
        const sl = e.target.closest('[data-msrc]');
        if (sl) { viewSrc = sl.dataset.msrc; paneOpen = true; localStorage.setItem('docs.pane', '1'); if (pane()) pane().dataset.doc = ''; drawPane(); return; } // Chat rechts anzeigen
        if (!e.target.closest('.dc-mpop')) closeMenus();
      });
      meta.addEventListener('input', (e) => {
        if (e.target.matches('.tk-tag-in')) { metaNew = ''; metaEdit = null; drawMetaTags(); }
        if (e.target.matches('[data-mname]')) { const g = tagOf(metaEdit); if (g) { g.name = e.target.value.trim() || g.name; saveTags(); } }
      });
      meta.addEventListener('keydown', (e) => {
        if (!e.target.matches('.tk-tag-in')) return;
        e.stopPropagation();
        if (e.key === 'Escape') { closeMenus(); return; }
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const name = e.target.value.trim(); if (!name) return;
        const g = tags.find((x) => x.name.toLowerCase() === name.toLowerCase());
        if (!g) { metaNew = name; drawMetaTags(); return; } // neu → erst die Farbe wählen
        const list = doc.tags || (doc.tags = []);
        if (!list.includes(g.id)) list.push(g.id);
        touch(doc); changed(); drawMeta(); reopenTags(true);
      });
      document.addEventListener('pointerdown', (e) => { if (meta.isConnected && !e.target.closest('.dc-mpop')) closeMenus(); });
    }
    function coverCss(cv) {
      if (!cv) return '';
      if (cv.kind === 'preset') return COVER_PRESETS.find((p) => p.id === cv.id)?.bg || '';
      if (cv.kind === 'color') return colorCover(cv.c, cv.style);
      if (cv.kind === 'image' && /^data:image\/(jpeg|png|webp);base64,/.test(cv.src || '')) return `center / cover no-repeat url("${cv.src}")`;
      return '';
    }
    // animate: Cover kommt/geht → Icon, Titel und Text gleiten von der alten an die neue Stelle (Icon wächst/schrumpft dabei)
    function drawCover(animate = false) {
      const box = view.querySelector('.dc-cover'); if (!box) return;
      const bg = coverCss(doc.cover);
      const page = view.querySelector('.dc-page');
      const flip = animate && page && page.classList.contains('with-cover') !== !!bg ? captureFlip() : null;
      box.classList.toggle('has', !!bg);
      box.querySelector('.dc-cover-img').style.background = bg;
      // eigenes Bild: Banner übernimmt das Seitenverhältnis → das ganze Bild ist zu sehen (sehr hohe Bilder: ganz, mit Rand)
      const cv = doc.cover;
      box.classList.toggle('img', cv?.kind === 'image' && !cv.ai); // KI-Cover: normales Banner (füllt die Fläche), kein eigenes Seitenverhältnis
      box.style.aspectRatio = '';
      box.classList.remove('tall');
      if (cv?.kind === 'image' && !cv.ai) {
        const apply = (ratio) => { box.style.aspectRatio = String(Math.max(1.6, Math.min(6, ratio))); box.classList.toggle('tall', ratio < 1.6); };
        if (cv.ratio) apply(cv.ratio);
        else { const im = new Image(); im.onload = () => { if (doc.cover !== cv) return; cv.ratio = +(im.width / im.height).toFixed(4); apply(cv.ratio); save(); }; im.src = cv.src; }
      }
      view.querySelector('.dc-page')?.classList.toggle('with-cover', !!bg);
      drawIcon();
      flip?.();
      applySettings();
    }
    // Positionen merken; die zurückgegebene Funktion lässt alles von dort an die neue Stelle gleiten
    function captureFlip() {
      const els = ['.dc-adds', '.dc-icon', '.dc-title-in', '.dc-sub-in', '.dc-meta', '.dc-content'].map((q) => view.querySelector(q)).filter((e) => e && !e.hidden);
      const before = els.map((e) => e.getBoundingClientRect());
      return () => {
        if (reduced()) return;
        els.forEach((e, i) => {
          const a = before[i], b = e.getBoundingClientRect();
          if (!b.width) return;
          const dx = a.left - b.left, dy = a.top - b.top, sc = e.classList.contains('dc-icon') && a.width ? a.width / b.width : 1;
          if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && sc === 1) return;
          e.animate([{ transform: `translate(${dx}px, ${dy}px) scale(${sc})`, transformOrigin: 'top left' }, { transform: 'none', transformOrigin: 'top left' }], { duration: 460, easing: SOFT });
        });
      };
    }
    // Icon vor dem Titel (mit Cover: unten links überlappend), dazu die Knöpfe „Icon/Cover hinzufügen“ und das Icon im Tab
    const iconOf = (d) => (d?.icon && window.DocIcons?.has(d.icon.name) ? d.icon : null);
    /* ---------- Einstellungen des Dokuments (Knopf oben rechts, Fenster in der Mitte) ----------
       doc.settings: accent ('auto' = aus dem Cover | Farbe), font (sans/serif/mono), width (normal/wide), small, nav, spell
 */
    const ACCENTS = ['#2f86ff', '#6aa8ff', '#b49cff', '#f472b6', '#f07a6e', '#f0913a', '#facc15', '#4fcf8a', '#2dd4bf', '#a3a3a3'];
    const docSet = () => ({ accent: 'auto', font: 'sans', width: 'normal', small: false, nav: true, spell: true, infos: true, ...(doc?.settings || {}) });
    // Akzent automatisch: Farbe des Covers (Farb-Cover direkt, Motiv aus seiner Palette, eigenes Bild = mittlere kräftige Farbe)
    function autoAccent() {
      const cv = doc?.cover; if (!cv) return null;
      if (cv.kind === 'color') return cv.c;
      if (cv.kind === 'preset') { const p = COVER_PRESETS.find((x) => x.id === cv.id)?.pal; return p ? p[Math.min(p.length - 1, 2)] : null; }
      if (cv.kind === 'image') {
        if (cv.accent) return cv.accent;
        const im = new Image();
        im.onload = () => {
          if (doc?.cover !== cv) return;
          const c = document.createElement('canvas'); c.width = c.height = 24; const g = c.getContext('2d'); g.drawImage(im, 0, 0, 24, 24);
          const px = g.getImageData(0, 0, 24, 24).data; let r = 0, gg = 0, b = 0, w = 0;
          for (let i = 0; i < px.length; i += 4) { const mx = Math.max(px[i], px[i + 1], px[i + 2]), mn = Math.min(px[i], px[i + 1], px[i + 2]), k = (mx - mn) / 255 + 0.05; r += px[i] * k; gg += px[i + 1] * k; b += px[i + 2] * k; w += k; }
          cv.accent = `#${[r, gg, b].map((v) => Math.round(v / w).toString(16).padStart(2, '0')).join('')}`; save(); applySettings();
        };
        im.src = cv.src;
      }
      return null;
    }
    function applySettings() {
      if (!doc) return;
      const s = docSet(), page = view.querySelector('.dc-page'); if (!page) return;
      const acc = s.accent === 'auto' ? autoAccent() : s.accent;
      if (acc) view.style.setProperty('--accent', acc); else view.style.removeProperty('--accent');
      page.classList.toggle('f-serif', s.font === 'serif'); page.classList.toggle('f-mono', s.font === 'mono');
      page.classList.toggle('wide', s.width === 'wide'); page.classList.toggle('small', !!s.small);
      view.querySelector('.dc-nav')?.classList.toggle('off', !s.nav);
      const pt = view.querySelector('.dc-ptable'); if (pt) pt.hidden = s.infos === false;
      view.querySelector('.dc-content')?.setAttribute('spellcheck', String(!!s.spell));
    }
    function openSettings() {
      document.querySelector('.dc-set-ov')?.remove();
      const ov = document.createElement('div'); ov.className = 'dc-set-ov';
      const seg = (k, opts, cur) => `<div class="dc-seg" data-k="${k}">${opts.map(([v, l]) => `<button type="button" data-v="${v}"${cur === v ? ' class="on"' : ''}>${l}</button>`).join('')}</div>`;
      const sw = (k, on) => `<button type="button" class="ce-switch${on ? ' on' : ''}" data-sw="${k}" role="switch" aria-checked="${on}" aria-label="umschalten"><i></i></button>`;
      const row = (label, hint, ctrl) => `<div class="dc-set-row"><div class="dc-set-l"><span>${label}</span>${hint ? `<em>${hint}</em>` : ''}</div><div class="dc-set-c">${ctrl}</div></div>`;
      const draw = () => {
        const s = docSet();
        ov.innerHTML = `<div class="dc-set big" role="dialog" aria-label="Einstellungen des Dokuments">
          <div class="dc-set-head"><span class="dc-set-title">Einstellungen</span><span class="grow"></span><button type="button" class="icon-btn" data-close aria-label="Schließen">${fi('x', 13)}</button></div>
          <div class="dc-set-body">
            <div class="dc-set-sec">Darstellung</div>
            ${row('Akzentfarbe', s.accent === 'auto' ? 'passt sich dem Cover an' : 'für Haken, Markierungen und Links', `<div class="dc-acc"><button type="button" data-acc="auto" class="dc-acc-auto${s.accent === 'auto' ? ' on' : ''}">Auto</button>${ACCENTS.map((c) => `<button type="button" data-acc="${c}" class="dc-dot${s.accent === c ? ' on' : ''}" style="--c:${c}" aria-label="Farbe"></button>`).join('')}</div>`)}
            ${row('Schrift', '', seg('font', [['sans', 'Standard'], ['serif', 'Serif'], ['mono', 'Mono']], s.font))}
            ${row('Breite', '', seg('width', [['normal', 'Normal'], ['wide', 'Breit']], s.width))}
            ${row('Kleine Schrift', '', sw('small', !!s.small))}
            <div class="dc-set-sec">Dokument</div>
            ${row('Infos', 'Tabelle unter dem Titel (Erstellt, Bearbeitet, Priorität …)', sw('infos', s.infos !== false))}
            ${row('Gliederung links', 'Striche zu den Überschriften', sw('nav', s.nav))}
            ${row('Rechtschreibprüfung', '', sw('spell', s.spell))}
          </div></div>`;
      };
      const set = (patch) => { doc.settings = { ...docSet(), ...patch }; touch(doc); save(); applySettings(); draw(); };
      const close = () => { ov.classList.add('closing'); document.removeEventListener('keydown', key, true); setTimeout(() => ov.remove(), 200); };
      const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
      ov.addEventListener('pointerdown', (e) => { if (e.target === ov) close(); });
      ov.addEventListener('click', (e) => {
        const t = e.target.closest('button'); if (!t) return;
        if (t.hasAttribute('data-close')) { close(); return; }
        if (t.dataset.acc) { set({ accent: t.dataset.acc }); return; }
        if (t.dataset.sw) { set({ [t.dataset.sw]: !docSet()[t.dataset.sw] }); return; }
        const sg = t.closest('[data-k]'); if (sg && t.dataset.v) set({ [sg.dataset.k]: t.dataset.v });
      });
      document.addEventListener('keydown', key, true);
      draw(); document.body.append(ov);
    }
    // für den Sprach-Agenten: Einstellungen des offenen Dokuments ändern oder das Fenster öffnen
    api.openSettings = () => { if (doc) openSettings(); return !!doc; };
    api.applyDocSettings = (patch) => {
      if (!doc) return false;
      if (patch) doc.settings = { ...docSet(), ...patch };
      touch(doc); save(); applySettings(); return true;
    };
    api.currentId = () => doc?.id || null;
    function drawIcon() {
      const btn = view.querySelector('.dc-icon'); if (!btn) return;
      const ic = iconOf(doc), cover = !!coverCss(doc.cover);
      btn.hidden = !ic;
      if (ic) { btn.style.setProperty('--c', ic.c); btn.querySelector('.dc-icon-g').innerHTML = DocIcons.svg(ic.name, 42, '', !!ic.line); }
      view.querySelector('.dc-page')?.classList.toggle('with-icon', !!ic);
      view.querySelectorAll('.dc-add').forEach((b) => { b.hidden = b.dataset.add === 'icon' ? !!ic : cover; });
      view.querySelector('.dc-adds').hidden = !!ic && cover;
      window.setTabIcon?.(tab, ic);
    }
    function setIcon(ic) {
      if (ic) doc.icon = ic; else delete doc.icon;
      changed(); save(); drawIcon();
    }
    let iconPop = null;
    // gleicher Ablauf wie beim Cover: erst die Icons, Klick → oben Vorschau (so wie im Dokument), darunter die Farben;
    // Klick auf eine Farbe übernimmt und schließt
    function openIconPop() {
      if (iconPop) { iconPop.close(); return; }
      const modal = el('div', 'tk-modal dc-cmodal dc-imodal');
      const pop = el('div', 'tk-form dc-cpop dc-ipop');
      pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Icon');
      pop.innerHTML = `<div class="dc-cpop-head"><span class="dc-cpop-title">Icon</span><span class="grow"></span>${iconOf(doc) ? '<button type="button" class="dc-ipop-del" data-del>Entfernen</button>' : ''}<button type="button" class="tk-x dc-cpop-x" aria-label="Schließen" title="Schließen">${fi('x', 12)}</button></div>
        <div class="dc-cpop-body"></div>`;
      modal.append(pop);
      document.body.append(modal);
      const body = pop.querySelector('.dc-cpop-body'), title = pop.querySelector('.dc-cpop-title');
      let step = null; // null = Übersicht, sonst der Name des gewählten Icons
      const pick = { c: iconOf(doc)?.c || '#a3a3a3', line: false }; // nur gefüllte Icons (keine Linien-Fassung mehr)
      const onCover = !!coverCss(doc.cover);
      const ttl = esc(doc.title.trim() || 'Unbenannt');
      const preview = (name, c) => (onCover
        ? `<div class="dc-ipreview cover"><div class="dc-ipv-cover" style="background:${esc(coverCss(doc.cover))}"></div><div class="dc-ipv-row"><span class="dc-icon dc-ipv on-cover" style="--c:${esc(c)}"><span class="dc-icon-g">${DocIcons.svg(name, 42, '', pick.line)}</span></span></div><div class="dc-ipv-title">${ttl}</div></div>`
        : `<div class="dc-ipreview"><div class="dc-ipv-line"><span class="dc-icon dc-ipv small" style="--c:${esc(c)}"><span class="dc-icon-g">${DocIcons.svg(name, 26, '', pick.line)}</span></span><span class="dc-ipv-title">${ttl}</span></div></div>`);
      function render(dir = 0) {
        if (!step) {
          title.textContent = 'Icon';
          // Übersicht immer grau (nicht in der Farbe des aktuellen Icons); nur gefüllte Icons
          body.innerHTML = `<div class="dc-igrid">${DocIcons.names.map((n) => `<button type="button" class="dc-itile${iconOf(doc)?.name === n ? ' on' : ''}" data-icon="${n}" aria-label="Icon wählen">${DocIcons.svg(n, 22, '', pick.line)}</button>`).join('')}</div>`;
        } else {
          title.innerHTML = `<button type="button" class="dc-cback" data-back aria-label="Zurück" title="Zurück">${fi('back', 13)}</button>Farbe`;
          body.innerHTML = `${preview(step, pick.c)}<div class="dc-clabel">Farbe</div>${UIKit.colorRow(pick.c, 'data-c')}`;
        }
        // beide Ansichten gleich hoch: Übersicht scrollt darin, die Farbauswahl darf (Farbwähler) länger werden
        body.style.height = step ? '' : `${viewH()}px`;
        body.style.minHeight = step ? `${viewH()}px` : '';
        if (dir) body.animate([{ opacity: 0, transform: `translateX(${dir * 10}px)` }, { opacity: 1, transform: 'none' }], { duration: 260, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' });
      }
      // Höhe der Farbauswahl einmal messen (ohne Farbwähler) – das ist die Höhe des Fensters
      let colorH = 0;
      function viewH() {
        if (colorH) return colorH;
        const probe = body.cloneNode(false); probe.style.cssText = 'position:absolute;visibility:hidden;left:0;right:0;height:auto';
        probe.innerHTML = `${preview(DocIcons.names[0], pick.c)}<div class="dc-clabel">Farbe</div>${UIKit.colorRow(pick.c, 'data-c')}`;
        body.parentElement.append(probe); colorH = Math.round(probe.offsetHeight); probe.remove();
        return colorH;
      }
      const showPreview = (hex) => body.querySelector('.dc-ipv')?.style.setProperty('--c', hex);
      const apply = (hex) => { pick.c = hex; setIcon({ name: step, c: hex, ...(pick.line ? { line: true } : {}) }); };
      modal.addEventListener('pointerdown', (e) => { if (e.target === modal) close(); });
      // Darüberfahren zeigt die Farbe schon in der Vorschau, Verlassen zeigt wieder die gewählte
      body.addEventListener('pointerover', (e) => { const sw = e.target.closest('[data-c]'); if (sw && step) showPreview(sw.dataset.c); });
      body.addEventListener('pointerout', (e) => { if (e.target.closest('[data-c]') && step && !e.relatedTarget?.closest?.('[data-c]')) showPreview(pick.c); });
      pop.addEventListener('click', (e) => {
        if (e.target.closest('.dc-cpop-x')) { close(); return; }
        if (e.target.closest('[data-del]')) { setIcon(null); close(); return; }
        if (e.target.closest('[data-back]')) { step = null; render(-1); return; }
        const is = e.target.closest('[data-istyle]');
        if (is) { const line = is.dataset.istyle === 'line'; if (line !== pick.line) { const top = body.querySelector('.dc-igrid')?.scrollTop || body.scrollTop; pick.line = line; render(); body.scrollTop = top; } return; }
        const it = e.target.closest('[data-icon]');
        if (it) { step = it.dataset.icon; render(1); return; }
        if (e.target.closest('.tk-picker')) return;
        const cu = e.target.closest('[data-custom]');
        if (cu) { // eigene Farbe: Farbwähler zum Ziehen (wie beim Cover)
          const host = cu.closest('.tk-colors').nextElementSibling;
          if (host.firstChild) { host.replaceChildren(); return; }
          host.append(UIKit.colorPicker(pick.c, (hex, done) => {
            cu.style.setProperty('--c', hex); cu.classList.add('on');
            showPreview(hex);
            if (done) { apply(hex); close(); } // „Übernehmen“ → Icon setzen, Fenster zu
          }));
          return;
        }
        const sw = e.target.closest('[data-c]'); if (sw) { apply(sw.dataset.c); showPreview(sw.dataset.c); setTimeout(close, 160); } // Farbe gewählt → übernehmen und schließen
      });
      const esc_ = (e) => { if (e.key === 'Escape') close(); };
      function close() {
        document.removeEventListener('keydown', esc_);
        modal.classList.add('closing');
        setTimeout(() => modal.remove(), 220);
        iconPop = null;
      }
      document.addEventListener('keydown', esc_);
      iconPop = { close };
      render();
    }
    function setCover(cv) {
      const box = view.querySelector('.dc-cover');
      const removing = !cv && box?.classList.contains('has');
      doc.cover = cv || null;
      if (!cv) delete doc.cover;
      changed(); save();
      if (!removing || reduced()) { drawCover(true); return; }
      // Entfernen: alles gleichzeitig – das Banner blendet als Abbild aus, das Icon wird kleiner und gleitet neben den Titel, der Text rückt nach
      const page = view.querySelector('.dc-page'), r = box.getBoundingClientRect(), pr = page.getBoundingClientRect();
      const ghost = box.cloneNode(true);
      ghost.style.cssText = `position:absolute;left:${r.left - pr.left}px;top:${r.top - pr.top}px;width:${r.width}px;height:${r.height}px;margin:0;animation:none;pointer-events:none;z-index:1`;
      drawCover(true);
      page.append(ghost);
      ghost.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-8px) scale(0.98)' }], { duration: 320, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' }).onfinish = () => ghost.remove();
      setTimeout(() => ghost.remove(), 700); // falls die Animation nicht zu Ende läuft (z. B. Tab im Hintergrund)
    }
    // Bild verkleinern (max. 2400 px breit), damit Dokumente nicht zu groß werden
    // Vorlage-Foto für das KI-Cover: klein (höchstens 768 px), JPEG – reicht der KI zur Orientierung
    function smallPhoto(file) {
      return new Promise((resolve, reject) => {
        if (!/^image\//.test(file.type)) { reject(new Error('Kein Bild')); return; }
        const img = new Image();
        img.onload = () => { const k = Math.min(1, 768 / Math.max(img.width, img.height)); const cv = document.createElement('canvas'); cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k); cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height); URL.revokeObjectURL(img.src); resolve(cv.toDataURL('image/jpeg', 0.85)); };
        img.onerror = () => reject(new Error('Bild nicht lesbar'));
        img.src = URL.createObjectURL(file);
      });
    }
    function readImage(file) {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          // scharf genug für hochauflösende Bildschirme (2×), weich verkleinert, hohe JPEG-Qualität
          const k = Math.min(1, 2400 / img.width);
          const cv = document.createElement('canvas');
          cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
          const g = cv.getContext('2d');
          g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
          g.drawImage(img, 0, 0, cv.width, cv.height);
          URL.revokeObjectURL(img.src);
          resolve({ src: cv.toDataURL('image/jpeg', 0.93), ratio: +(cv.width / cv.height).toFixed(4) });
        };
        img.onerror = () => reject(new Error('Bild konnte nicht gelesen werden'));
        img.src = URL.createObjectURL(file);
      });
    }
    // eigene Bilder: alle, die in irgendeinem Dokument als Cover benutzt werden (ohne Doppelte)
    // eigene Bilder (KI-Cover behalten ihr Banner-Format: ai-Merker geht mit)
    const ownImages = () => { const m = new Map(); docs.forEach((d) => { if (d.cover?.kind === 'image' && d.cover.src && !m.has(d.cover.src)) m.set(d.cover.src, !!d.cover.ai); }); return [...m].slice(0, 24); };

    let coverPop = null;
    // Stile: erst Stil wählen, dann Farbe (Varianten des Stils oder eigene Farbe)
    // Vorschau in der Übersicht: Wellen/Dünen mit ihrem schönsten Motiv, die übrigen in einer passenden Farbe
    const COVER_STYLES = [
      { id: 'waves', name: 'Wellen', preview: 'w-sunset', color: '#f0913a' }, { id: 'dunes', name: 'Dünen', preview: 'd-desert', color: '#f0913a' },
      { id: 'ribbons', name: 'Bänder', color: '#b49cff' }, { id: 'arcs', name: 'Bögen', color: '#6aa8ff' }, { id: 'plain', name: 'Schlicht', color: '#2dd4bf' },
      { id: 'peaks', name: 'Gipfel', color: '#6aa8ff' }, { id: 'prism', name: 'Prisma', color: '#f472b6' }, { id: 'dots', name: 'Punkte', color: '#4fcf8a' },
      { id: 'bokeh', name: 'Bokeh', color: '#facc15' }, { id: 'bauhaus', name: 'Bauhaus', color: '#f0913a' }, { id: 'silk', name: 'Seide', color: '#b49cff' },
      { id: 'stripes', name: 'Streifen', color: '#2dd4bf' }, { id: 'mosaic', name: 'Mosaik', color: '#2dd4bf' },
      // Horizont, Wirbel, Marmor, Konfetti, Strahlen, Flüssig: nicht mehr wählbar (bestehende Cover werden weiter gezeichnet)
    ];
    const OLD_STYLE = { wave: 'waves', soft: 'dunes', mesh: 'ribbons', aurora: 'ribbons', lines: 'arcs', flat: 'plain' };
    const styleOfCover = (cv) => (cv?.kind === 'preset' ? COVER_PRESETS.find((p) => p.id === cv.id)?.group : cv?.kind === 'color' ? (OLD_STYLE[cv.style] || cv.style) : null);
    function openCoverPop() {
      if (coverPop) { coverPop.close(); return; }
      // gleiches Fenster wie bei Kalender und Aufgaben: mittig über einer leicht abgedunkelten Fläche
      const modal = el('div', 'tk-modal dc-cmodal');
      const pop = el('div', 'tk-form dc-cpop');
      pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Cover');
      pop.innerHTML = `<div class="dc-cpop-head"><span class="dc-cpop-title">Cover</span><button type="button" class="tk-x dc-cpop-x" aria-label="Schließen" title="Schließen">${fi('x', 12)}</button></div>
        <div class="dc-cpop-body"></div>
        <input type="file" accept="image/png,image/jpeg,image/webp" hidden />`;
      modal.append(pop);
      document.body.append(modal);
      modal.addEventListener('pointerdown', (e) => { if (e.target === modal) close(); });
      const body = pop.querySelector('.dc-cpop-body'), file = pop.querySelector('input[type=file]'), title = pop.querySelector('.dc-cpop-title');
      let step = null; // null = Übersicht, sonst die ID des gewählten Stils
      let pick = { c: doc.cover?.kind === 'color' ? doc.cover.c : UIKit.COLORS[0] };
      const ai = { open: false, busy: false, text: '', err: '', photos: [] }; // „Mit KI“: nur noch ein kleines Eingabefeld (wie im Chat) – Fenster bleibt offen
      const isOn = (cv) => JSON.stringify(cv) === JSON.stringify(doc.cover || null);
      const tile = (cv, bg, label, extra = '') => `<button type="button" class="dc-ctile${isOn(cv) ? ' on' : ''}${extra}" data-cv='${esc(JSON.stringify(cv))}' title="${esc(label)}" aria-label="${esc(label)}"><span style="background:${esc(bg)}"></span></button>`;
      const previewOf = (st) => { const x = COVER_STYLES.find((y) => y.id === st); return (x.preview && COVER_PRESETS.find((p) => p.id === x.preview)?.bg) || colorCover(x.color, st); };
      function render(dir = 0) {
        if (!step && (ai.open || ai.busy)) {
          // „Mit KI erstellen“: alles andere verschwindet – nur das Eingabefeld (Chat-Design, kleiner) bzw. die Bild-Animation
          title.innerHTML = `${ai.busy ? '' : `<button type="button" class="dc-cback" data-ai-back aria-label="Zurück" title="Zurück">${fi('back', 13)}</button>`}Mit KI erstellen`;
          body.innerHTML = ai.busy
            ? `<div class="dc-cai-gen"><div class="illustration-pending"><span class="shimmer ill-ico"></span><span class="shimmer">Cover erzeugen</span></div>${(window.illustrationWave?.() || '').replace('xMidYMid meet', 'xMidYMid slice')}</div>`
            : `<form class="dc-cai2" data-ai-form>
              ${ai.photos.length ? `<div class="dc-cai2-photos">${ai.photos.map((ph, i) => `<span class="dc-cai2-ph"><img src="${esc(ph)}" alt="" /><button type="button" data-ai-rm="${i}" aria-label="Foto entfernen">${fi('x', 10)}</button></span>`).join('')}</div>` : ''}
              <textarea class="dc-cai-in" rows="2" maxlength="400" placeholder="Was soll auf dem Cover sein?" aria-label="Cover beschreiben">${esc(ai.text)}</textarea>
              <div class="dc-cai2-bar"><button type="button" class="dc-cai2-btn" data-ai-photo aria-label="Foto als Vorlage hinzufügen">${fi('plus', 15)}</button><span class="grow"></span>
                <button type="button" class="dc-cai2-btn dc-cai2-mic" data-ai-mic aria-label="Sprachaufnahme">${fi('mic', 15)}</button>
                <button type="submit" class="dc-cai-go" aria-label="Erstellen">${fi('arrow-up', 14)}</button></div>
              <input type="file" class="dc-cai2-file" accept="image/png,image/jpeg,image/webp" multiple hidden />
            </form>${ai.err ? `<div class="dc-cerr">${esc(ai.err)}</div>` : ''}`;
          if (ai.busy) { const pend = body.querySelector('.illustration-pending'); if (pend) window.sweepRow?.(pend); }
          else {
            const f = body.querySelector('.dc-cai2-file');
            f.addEventListener('change', async () => { for (const x of [...f.files].slice(0, 3 - ai.photos.length)) { try { ai.photos.push(await smallPhoto(x)); } catch {} } ai.text = body.querySelector('.dc-cai-in').value; f.value = ''; render(); body.querySelector('.dc-cai-in')?.focus(); });
            const ta = body.querySelector('.dc-cai-in');
            ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ta.form.requestSubmit(); } });
          }
        } else if (!step) {
          title.textContent = 'Cover';
          const cur = styleOfCover(doc.cover);
          const own = ownImages();
          body.innerHTML = `<div class="dc-cgrid">
              <div class="dc-cstyle"><button type="button" class="dc-ctile dc-cupload" data-upload aria-label="Bild hochladen" title="Bild hochladen">
                <span class="dc-cup-in">${fi('cloud-up', 22)}</span></button></div>
              <div class="dc-cstyle"><button type="button" class="dc-ctile dc-cupload dc-caitile" data-ai aria-label="Mit KI erstellen">
                <span class="dc-cup-in">${fi('image', 20)}<i>Mit KI erstellen</i></span></button></div>
              ${COVER_STYLES.map((st) => `<div class="dc-cstyle"><button type="button" class="dc-ctile${cur === st.id ? ' on' : ''}" data-style="${st.id}" aria-label="${esc(st.name)}" title="${esc(st.name)}"><span style="background:${esc(previewOf(st.id))}"></span></button></div>`).join('')}
            </div>
            ${own.length ? `<div class="dc-clabel">Deine Bilder</div><div class="dc-cgrid">${own.map(([src, isAi]) => tile({ kind: 'image', src, ...(isAi ? { ai: true } : {}) }, `center / cover no-repeat url("${src}")`, 'Eigenes Bild')).join('')}</div>` : ''}`;
        } else {
          const st = COVER_STYLES.find((x) => x.id === step);
          title.innerHTML = `<button type="button" class="dc-cback" data-back aria-label="Zurück" title="Zurück">${fi('back', 13)}</button>${esc(st.name)}`;
          // nur Farbe wählen: oben groß die Vorschau, darunter die Farben (Klick übernimmt und schließt)
          body.innerHTML = `<div class="dc-cpreview"><span style="background:${esc(colorCover(pick.c, step))}"></span></div>
            <div class="dc-clabel">Farbe</div>${UIKit.colorRow(pick.c, 'data-c')}`;
        }
        // beide Ansichten gleich hoch: Übersicht scrollt darin, die Farbauswahl darf (Farbwähler) länger werden
        body.style.height = step ? '' : `${overviewH()}px`;
        body.style.minHeight = step ? `${overviewH()}px` : '';
        if (dir) body.animate([{ opacity: 0, transform: `translateX(${dir * 10}px)` }, { opacity: 1, transform: 'none' }], { duration: 260, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' });
      }
      // Höhe des Fensters einmal messen: Farbauswahl (ohne Farbwähler), mindestens gut 2½ Reihen Kacheln
      let colorH = 0;
      function overviewH() {
        if (colorH) return colorH;
        const probe = body.cloneNode(false); probe.style.cssText = 'position:absolute;visibility:hidden;left:0;right:0;height:auto';
        probe.innerHTML = `<div class="dc-cpreview"><span></span></div><div class="dc-clabel">Farbe</div>${UIKit.colorRow(UIKit.COLORS[0], 'data-c')}`;
        body.parentElement.append(probe);
        const cs = getComputedStyle(probe), pad = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
        const tileH = ((probe.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 16) / 3) * (9 / 16);
        colorH = Math.round(Math.max(probe.offsetHeight, pad + tileH * 2.6 + 16)); probe.remove();
        return colorH;
      }
      const showPreview = (hex) => { const p = body.querySelector('.dc-cpreview span'); if (p) p.style.background = colorCover(hex, step); };
      const applyColor = (hex) => { pick.c = hex; setCover({ kind: 'color', c: hex, style: step }); };
      // Darüberfahren zeigt die Farbe schon in der Vorschau, Verlassen zeigt wieder die gewählte
      body.addEventListener('pointerover', (e) => { const sw = e.target.closest('[data-c]'); if (sw && step) showPreview(sw.dataset.c); });
      body.addEventListener('pointerout', (e) => { if (e.target.closest('[data-c]') && step && !e.relatedTarget?.closest?.('[data-c]')) showPreview(pick.c); });
      pop.addEventListener('click', async (e) => {
        if (e.target.closest('.dc-cpop-x')) { close(); return; }
        if (e.target.closest('[data-back]')) { step = null; render(-1); return; }
        const sb = e.target.closest('[data-style]');
        if (sb) { // Startfarbe: die des aktuellen Covers (gleicher Stil), sonst die Farbe der Vorschau
          step = sb.dataset.style;
          pick.c = doc.cover?.kind === 'color' && styleOfCover(doc.cover) === step ? doc.cover.c : COVER_STYLES.find((x) => x.id === step).color;
          render(1); return;
        }
        if (e.target.closest('.tk-picker')) return; // Ziehen im Farbwähler
        const cu = e.target.closest('[data-custom]');
        if (cu) { // eigene Farbe: Farbwähler zum Ziehen (wie bei den Tags)
          const host = cu.closest('.tk-colors').nextElementSibling;
          if (host.firstChild) { host.replaceChildren(); return; }
          host.append(UIKit.colorPicker(pick.c, (hex, done) => {
            cu.style.setProperty('--c', hex); cu.classList.add('on');
            showPreview(hex);
            if (done) { applyColor(hex); close(); } // „Übernehmen“ → Cover setzen, Fenster zu
          }));
          return;
        }
        const sw = e.target.closest('[data-c]'); if (sw) { applyColor(sw.dataset.c); showPreview(sw.dataset.c); setTimeout(close, 160); return; } // Farbe gewählt → übernehmen und schließen
        if (e.target.closest('[data-upload]')) { file.click(); return; }
        if (e.target.closest('[data-ai]')) { if (ai.busy) return; ai.open = true; ai.err = ''; render(1); body.querySelector('.dc-cai-in')?.focus(); return; }
        if (e.target.closest('[data-ai-back]')) { window.stopDictateInto?.(); ai.open = false; ai.err = ''; render(-1); return; }
        if (e.target.closest('[data-ai-photo]')) { if (ai.photos.length < 3) body.querySelector('.dc-cai2-file')?.click(); return; }
        const rm = e.target.closest('[data-ai-rm]'); if (rm) { ai.photos.splice(+rm.dataset.aiRm, 1); ai.text = body.querySelector('.dc-cai-in').value; render(); return; }
        const mic = e.target.closest('[data-ai-mic]'); if (mic) { window.dictateInto?.(body.querySelector('.dc-cai-in'), mic); return; }
        const tl = e.target.closest('[data-cv]');
        if (tl) { const cv = JSON.parse(tl.dataset.cv); if (cv.kind === 'color') pick.c = cv.c; setCover(cv); render(); }
      });
      pop.addEventListener('submit', async (e) => {
        if (!e.target.closest('[data-ai-form]')) return;
        e.preventDefault();
        ai.text = body.querySelector('.dc-cai-in').value.trim();
        if (ai.text.length < 3 || ai.busy) { body.querySelector('.dc-cai-in')?.focus(); return; }
        window.stopDictateInto?.();
        ai.busy = true; ai.err = ''; render();
        try {
          const r = await fetch('/api/cover-image', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ wish: ai.text, photos: ai.photos }) });
          const j = await r.json().catch(() => ({}));
          if (!r.ok || !j.src) throw new Error(j.error || 'Das Cover konnte gerade nicht erstellt werden.');
          setCover({ kind: 'image', src: j.src, ai: true }); // KI-Cover: normales Banner-Format wie die anderen Cover (kein eigenes Seitenverhältnis)
          ai.open = false; ai.text = ''; ai.photos = [];
        } catch (err) { ai.err = err.message; }
        ai.busy = false;
        if (coverPop) render();
      });
      const upload = async (f) => {
        if (!f || !/^image\//.test(f.type)) return;
        try { const im = await readImage(f); setCover({ kind: 'image', src: im.src, ratio: im.ratio }); step = null; render(); } catch (err) { body.insertAdjacentHTML('afterbegin', `<div class="dc-cerr">${esc(err.message)}</div>`); }
      };
      file.addEventListener('change', () => { upload(file.files[0]); file.value = ''; });
      pop.addEventListener('dragover', (e) => { e.preventDefault(); pop.classList.add('drag'); });
      pop.addEventListener('dragleave', (e) => { if (!pop.contains(e.relatedTarget)) pop.classList.remove('drag'); });
      pop.addEventListener('drop', (e) => { e.preventDefault(); pop.classList.remove('drag'); upload(e.dataTransfer.files[0]); });
      const esc_ = (e) => { if (e.key === 'Escape') close(); };
      function close() {
        document.removeEventListener('keydown', esc_);
        window.stopDictateInto?.();
        modal.classList.add('closing');
        setTimeout(() => modal.remove(), 220);
        coverPop = null;
      }
      document.addEventListener('keydown', esc_);
      coverPop = { close, refresh: render };
      render();
    }

    // eingeklappt = Überschrift trägt data-fold; alles darunter (bis zur nächsten gleich hohen Überschrift) ist versteckt
    const SOFT = 'cubic-bezier(0.22, 1, 0.36, 1)';
    const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    function applyFolds(animate = false) {
      const c = content(); if (!c) return;
      const hide = new Set();
      [...c.children].forEach((h) => { if (isHead(h) && h.hasAttribute('data-fold')) sectionOf(h).slice(1).forEach((n) => hide.add(n)); });
      [...c.children].forEach((n) => {
        const was = n.classList.contains('dc-hid') || !!n._folding, now = hide.has(n);
        if (was === now) return;
        n._fold?.cancel();
        if (!animate || reduced()) { n.classList.toggle('dc-hid', now); return; }
        // Höhe, Abstände und Deckkraft gleiten gemeinsam – der Text darunter rückt weich nach
        if (now) {
          const cs = getComputedStyle(n);
          const full = { height: `${n.offsetHeight}px`, marginTop: cs.marginTop, marginBottom: cs.marginBottom, opacity: 1 };
          n.style.overflow = 'hidden';
          n._folding = true;
          const a = n.animate([full, { height: '0px', marginTop: '0px', marginBottom: '0px', opacity: 0 }], { duration: 300, easing: SOFT });
          n._fold = a;
          a.onfinish = () => { n.classList.add('dc-hid'); n.style.overflow = ''; n._fold = null; n._folding = false; };
          a.oncancel = () => { n.style.overflow = ''; n._folding = false; };
        } else {
          n.classList.remove('dc-hid');
          const h = n.offsetHeight, cs = getComputedStyle(n);
          n.style.overflow = 'hidden';
          const a = n.animate([{ height: '0px', marginTop: '0px', marginBottom: '0px', opacity: 0 }, { height: `${h}px`, marginTop: cs.marginTop, marginBottom: cs.marginBottom, opacity: 1 }], { duration: 360, easing: SOFT });
          n._fold = a;
          a.onfinish = a.oncancel = () => { n.style.overflow = ''; n._fold = null; };
        }
      });
    }
    // mittig auf die erste Zeile der Überschrift (auch wenn sie umbricht)
    function placeGutterAt(h) {
      const page = view.querySelector('.dc-page').getBoundingClientRect(), r = h.getBoundingClientRect();
      const lh = parseFloat(getComputedStyle(h).lineHeight) || Math.min(r.height, 32);
      const g = gutter(); g.hidden = false;
      g.style.top = `${Math.round(r.top - page.top + Math.min(lh, r.height) / 2 - 12)}px`;
      g.style.left = `${Math.round(r.left - page.left - g.offsetWidth - 2)}px`; // direkt links neben der Überschrift, nicht am Seitenrand
      g.classList.toggle('folded', h.hasAttribute('data-fold'));
    }
    let followRaf = 0, onSelection = null;
    // Überschrift, in der gerade der Cursor steht (oder null)
    function caretHead() {
      const c = content(), sel = window.getSelection();
      if (!c || !sel?.rangeCount || !c.contains(sel.anchorNode) || sel.anchorNode === c) return null;
      const t = topChild(sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentNode);
      return isHead(t) ? t : null;
    }
    // Pfeil + Griff neu ausrichten: gehört die Überschrift nicht mehr dazu (gelöscht, zu Text geworden) → ausblenden
    function refreshGutter() {
      if (dragging || !content()) return;
      const g = gutter(); if (!g) return;
      // leere Überschrift (Text gelöscht) zählt nicht mehr – dann verschwindet der Pfeil
      const ok = (h) => h && h.isConnected && h.parentNode === content() && isHead(h) && !h.classList.contains('dc-hid') && !!h.textContent.trim();
      const ch = caretHead();
      const h = (ok(ch) ? ch : null) || (ok(gutterFor) ? gutterFor : null);
      if (!h) { g.hidden = true; return; }
      if (g.hidden && h !== ch) return; // nur sichtbar halten, nicht ungefragt einblenden
      gutterFor = h; placeGutterAt(h);
    }
    function placeGutter(e) {
      if (dragging) return;
      const h = topChild(e.target);
      if (!isHead(h) || !h.textContent.trim()) return;
      gutterFor = h; placeGutterAt(h);
    }

    /* ---------- Navigation links (wie im Chat): ein Strich je Überschrift, nur zum Springen ---------- */
    let navItems = [], navHover = -1, navHideT = null, navT = null;
    const navEl = () => view.querySelector('.dc-nav');
    const navCard = () => view.querySelector('.dc-nav-card');
    function buildNav() {
      const nav = navEl(), c = content(); if (!nav || !c) return;
      const heads = [...c.children].filter(isHead);
      nav.classList.toggle('show', heads.length >= 2);
      navItems = heads.map((h) => ({ h }));
      nav.innerHTML = heads.map((h) => `<button type="button" class="pn-line dc-nav-l${level(h)}" aria-label="${esc(h.innerText.trim().slice(0, 80))}"></button>`).join('');
      [...nav.children].forEach((b, i) => { navItems[i].line = b; });
      markNav();
    }
    function markNav() {
      const scroll = view.querySelector('.dc-scroll'); if (!scroll || !navItems.length) return;
      const mid = scroll.getBoundingClientRect().top + scroll.clientHeight * 0.35;
      let idx = 0;
      navItems.forEach((x, i) => { if (!x.h.classList.contains('dc-hid') && x.h.getBoundingClientRect().top <= mid) idx = i; });
      if (scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 4) idx = navItems.length - 1;
      navItems.forEach((x, i) => x.line?.classList.toggle('active', i === idx));
    }
    const navPreview = (h) => sectionOf(h).slice(1).map((n) => n.innerText || '').join(' ').replace(/\s+/g, ' ').trim();
    function showNavCard(i) {
      clearTimeout(navHideT);
      const x = navItems[i]; if (!x) return;
      navHover = i;
      const card = navCard();
      card.querySelector('.pn-q').textContent = x.h.innerText.trim() || 'Überschrift';
      const a = navPreview(x.h);
      card.querySelector('.pn-a').textContent = a ? (a.length > 190 ? `${a.slice(0, 189)}…` : a) : 'Noch kein Text in diesem Abschnitt';
      const vr = view.getBoundingClientRect(), lr = x.line.getBoundingClientRect();
      card.style.top = `${Math.round(lr.top - vr.top + lr.height / 2)}px`;
      card.classList.add('open');
      navItems.forEach((y, k) => y.line.classList.toggle('hover', k === i));
    }
    function hideNavCard() {
      navHideT = setTimeout(() => { navCard()?.classList.remove('open'); navItems.forEach((y) => y.line?.classList.remove('hover')); navHover = -1; }, 120);
    }
    function jumpNav(i) {
      const x = navItems[i]; if (!x) return;
      // liegt die Überschrift in einem eingeklappten Abschnitt → diesen erst aufklappen
      const c = content();
      [...c.children].filter((h) => isHead(h) && h !== x.h && h.hasAttribute('data-fold') && sectionOf(h).includes(x.h)).forEach((h) => h.removeAttribute('data-fold'));
      applyFolds(true);
      const scroll = view.querySelector('.dc-scroll');
      const top = x.h.getBoundingClientRect().top - scroll.getBoundingClientRect().top + scroll.scrollTop;
      scroll.scrollTo({ top: Math.max(0, top - 24), behavior: 'smooth' });
      x.h.animate([{ backgroundColor: 'rgba(255, 255, 255, 0.07)' }, { backgroundColor: 'rgba(255, 255, 255, 0)' }], { duration: 900, easing: 'ease-out' });
    }
    function wireNav() {
      const nav = navEl(), card = navCard(); if (!nav) return;
      const idxOf = (e) => navItems.findIndex((x) => x.line === e.target.closest('.pn-line'));
      nav.addEventListener('pointermove', (e) => { const i = idxOf(e); if (i >= 0 && i !== navHover) showNavCard(i); });
      nav.addEventListener('pointerleave', hideNavCard);
      // Strich ziehen = Abschnitt verschieben (Gliederung erscheint); kurz klicken = hinspringen
      let press = null, dragged = false;
      nav.addEventListener('pointerdown', (e) => {
        const i = idxOf(e); if (i < 0 || e.button !== 0) return;
        e.preventDefault();
        nav.setPointerCapture(e.pointerId); // Bewegung bleibt bei der Leiste, auch wenn der Zeiger sie verlässt
        press = { i, y: e.clientY }; dragged = false;
      });
      nav.addEventListener('pointermove', (e) => {
        if (!press || dragged || Math.abs(e.clientY - press.y) < 4) return;
        dragged = true;
        clearTimeout(navHideT); navCard()?.classList.remove('open');
        const h = navItems[press.i]?.h; press = null;
        if (h) startDrag(e, h, true);
      });
      nav.addEventListener('pointerup', () => { press = null; });
      nav.addEventListener('click', (e) => { if (dragged) { dragged = false; return; } const i = idxOf(e); if (i >= 0) jumpNav(i); });
      card.addEventListener('pointerenter', () => clearTimeout(navHideT));
      card.addEventListener('pointerleave', hideNavCard);
      card.addEventListener('click', () => { if (navHover >= 0) jumpNav(navHover); });
    }

    /* ---------- Verschieben: Gliederung zeigen, die anderen Überschriften machen live Platz ---------- */
    // head: die Überschrift, deren Abschnitt verschoben wird; fromNav: gestartet an den Strichen links
    function startDrag(e, head = gutterFor, fromNav = false) {
      if (!head) return;
      e.preventDefault?.();
      const c = content(), scroll = view.querySelector('.dc-scroll');
      const nodes = sectionOf(head);
      // Beim Ziehen nur die Gliederung zeigen: so sieht man alle Abschnitte auf einmal
      const before = head.getBoundingClientRect().top;
      c.classList.add('dc-outline', 'dc-sorting');
      navEl()?.classList.add('dc-nav-drag');
      // von links gestartet: Überschrift unter den Zeiger holen, sonst an derselben Stelle lassen
      scroll.scrollTop += head.getBoundingClientRect().top - (fromNav ? e.clientY - head.offsetHeight / 2 : before);
      gutter().hidden = true;
      head.classList.add('dc-dragging');
      const origNext = nodes[nodes.length - 1].nextSibling;
      const grabY = e.clientY - head.getBoundingClientRect().top;
      dragging = {};
      // Ablageziele: nur Überschriften derselben oder einer höheren Ebene – so landet ein Kapitel immer zwischen
      // ganzen Kapiteln und reißt nie ein anderes Kapitel von seinen Unterpunkten los
      const others = () => [...c.children].filter((n) => isHead(n) && !nodes.includes(n) && level(n) <= level(head));
      // FLIP: die anderen Überschriften gleiten von der alten zur neuen Stelle
      const flip = (change) => {
        const list = [...c.children].filter((n) => isHead(n) && !nodes.includes(n)), pos = new Map(list.map((h) => [h, h.getBoundingClientRect().top]));
        change();
        if (reduced()) return;
        list.forEach((h) => {
          const dy = pos.get(h) - h.getBoundingClientRect().top;
          if (Math.abs(dy) < 1) return;
          h._slide?.cancel();
          h._slide = h.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 260, easing: SOFT });
        });
      };
      const place = (y) => {
        // Ziel: vor der ersten Überschrift, deren Mitte unter dem Zeiger liegt
        // Lage aus dem Layout (offsetTop), nicht aus der sichtbaren Position: während die anderen Überschriften
        // noch gleiten, stehen sie optisch an der alten Stelle – sonst springt ein nach oben gezogener Abschnitt zurück
        const midOf = (h) => h.offsetParent.getBoundingClientRect().top + h.offsetTop + h.offsetHeight / 2;
        const target = others().find((h) => y < midOf(h)) || null;
        if (target !== nodes[nodes.length - 1].nextSibling) {
          flip(() => { const frag = document.createDocumentFragment(); frag.append(...nodes); if (target) c.insertBefore(frag, target); else c.append(frag); });
        }
        // die gezogene Überschrift folgt dem Zeiger, gemessen von ihrem neuen Platz aus
        head.style.transform = 'none';
        const natural = head.getBoundingClientRect().top;
        head.style.transform = `translateY(${y - grabY - natural}px)`;
      };
      place(e.clientY);
      const move = (ev) => {
        place(ev.clientY);
        const sr = scroll.getBoundingClientRect();
        if (ev.clientY < sr.top + 40) scroll.scrollTop -= 12; else if (ev.clientY > sr.bottom - 40) scroll.scrollTop += 12;
      };
      const up = () => {
        window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
        // weich an den neuen Platz absetzen, dann Gliederung verlassen
        const cur = head.getBoundingClientRect().top;
        head.style.transform = '';
        const natural = head.getBoundingClientRect().top;
        const finish = () => {
          dragging = null;
          navEl()?.classList.remove('dc-nav-drag');
          head.classList.remove('dc-dragging');
          c.classList.remove('dc-sorting');
          if (nodes[nodes.length - 1].nextSibling !== origNext) commit();
          const keep = head.getBoundingClientRect().top;
          c.classList.remove('dc-outline');
          scroll.scrollTop += head.getBoundingClientRect().top - keep;
          applyFolds();
          head.animate([{ backgroundColor: 'rgba(255, 255, 255, 0.08)' }, { backgroundColor: 'rgba(255, 255, 255, 0)' }], { duration: 700, easing: 'ease-out' });
        };
        if (reduced()) { finish(); return; }
        head.animate([{ transform: `translateY(${cur - natural}px)` }, { transform: 'none' }], { duration: 280, easing: SOFT }).onfinish = finish;
      };
      window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
    }

    // breite Tabellen: in einen Rahmen, der seitlich scrollt, statt abgeschnitten zu werden
    function wrapTables(root) {
      root?.querySelectorAll('table').forEach((t) => {
        if (t.parentElement?.classList.contains('dc-tw')) return;
        const w = document.createElement('div'); w.className = 'dc-tw';
        t.replaceWith(w); w.append(t);
      });
    }
    /* ---------- KI schreibt ins Dokument: Blöcke erscheinen nacheinander ---------- */
    const writing = new Set();
    function setWriting(id, on) { on ? writing.add(id) : writing.delete(id); if (api.open && doc?.id === id) busy(on ? 'KI schreibt …' : ''); }
    async function typeIn(id, html) {
      const d = docOf(id); if (!d) return;
      d.content = html; touch(d);
      if (!(api.open && doc?.id === id)) return;
      const c = content(); if (!c) return;
      const tmp = document.createElement('div'); tmp.innerHTML = html;
      wrapTables(tmp);
      const blocks = [...tmp.childNodes];
      c.replaceChildren();
      for (const b of blocks) {
        if (!(api.open && doc?.id === id)) return;
        c.append(b);
        if (b.nodeType === 1) { b.classList.add('dc-in'); renderViz(b.matches?.('[data-viz], [data-math]') ? c : b); }
        await new Promise((r) => setTimeout(r, b.nodeType === 1 && /^(H[1-4])$/.test(b.tagName) ? 140 : 70));
      }
      await new Promise((r) => setTimeout(r, 450));
      c.querySelectorAll('.dc-in').forEach((n) => n.classList.remove('dc-in'));
      commit();
    }

    // Ergänzen: neue Blöcke einsetzen, ohne das Vorhandene anzufassen – ans Ende des Abschnitts unter der Überschrift „after“
    // (bis zur nächsten Überschrift gleicher oder höherer Ebene), sonst ans Ende des Dokuments; erscheinen nacheinander wie bei typeIn
    async function insertBlocks(id, html, after = '') {
      const d = docOf(id); if (!d) return;
      const live = api.open && doc?.id === id && content();
      if (!live) { d.content = insertInto(d.content, html, after); touch(d); return; }
      const ref = sectionEnd(live, after);
      const tmp = document.createElement('div'); tmp.innerHTML = html;
      wrapTables(tmp);
      for (const b of [...tmp.childNodes]) {
        live.insertBefore(b, ref);
        if (b.nodeType === 1) { b.classList.add('dc-in'); renderViz(b.matches?.('[data-viz], [data-math]') ? live : b); await new Promise((r) => setTimeout(r, 70)); }
      }
      await new Promise((r) => setTimeout(r, 450));
      live.querySelectorAll('.dc-in').forEach((n) => n.classList.remove('dc-in'));
      commit();
    }

    /* ---------- Format-Menü über der Markierung ---------- */
    const fmt = el('div', 'dc-fmt');
    fmt.hidden = true;
    fmt.innerHTML = `<div class="dc-fmt-row">
        <div class="dc-dd"><button type="button" class="dc-fb dc-fb-wide" data-dd="block"><span data-block-label>Text</span>${fi('chevron-down', 10)}</button>
          <div class="dc-ddm" data-ddm="block">${BLOCKS.map(([t, n]) => `<button type="button" class="tk-mi" data-block="${t}"><span class="dc-bk dc-bk-${t}">${n}</span></button>`).join('')}</div></div>
        <div class="dc-dd"><button type="button" class="dc-fb" data-dd="color" aria-label="Farbe"><i class="dc-dot"></i>${fi('chevron-down', 10)}</button>
          <div class="dc-ddm dc-colors" data-ddm="color">${COLORS.map(([n, c]) => `<button type="button" class="dc-sw" data-color="${c}" title="${n}" style="--c:${c}"></button>`).join('')}</div></div>
        <span class="dc-fsep"></span>
        <button type="button" class="dc-fb" data-cmd="bold" title="Fett"><b>B</b></button>
        <button type="button" class="dc-fb" data-cmd="italic" title="Kursiv"><i class="dc-it">I</i></button>
        <button type="button" class="dc-fb" data-cmd="underline" title="Unterstrichen"><u>U</u></button>
        <button type="button" class="dc-fb" data-cmd="strikeThrough" title="Durchgestrichen"><s>S</s></button>
        <button type="button" class="dc-fb" data-cmd="insertUnorderedList" title="Liste">${fi('list', 14)}</button>
        <div class="dc-dd"><button type="button" class="dc-fb dc-fb-wide" data-dd="align" aria-label="Ausrichtung">${fi('align-left', 14)}${fi('chevron-down', 10)}</button>
          <div class="dc-ddm dc-aligns" data-ddm="align">${ALIGNS.map(([c, i, n]) => `<button type="button" class="dc-fb" data-cmd="${c}" title="${n}">${fi(i, 14)}</button>`).join('')}</div></div>
        <button type="button" class="dc-fb" data-act="link" title="Link">${fi('link', 14)}</button>
        <span class="dc-fsep"></span>
        <button type="button" class="dc-fb dc-ai" data-act="ask" title="KI fragen" aria-label="KI fragen">Ask AI</button>
      </div>
      <div class="dc-fmt-in" data-in="ask" hidden><span class="dc-fmt-lab">Ask AI</span><input placeholder="den markierten Text zu …" maxlength="600" /><span class="dc-fmt-hint">↵</span></div>
      <div class="dc-fmt-in" data-in="link" hidden>${fi('link', 13)}<input placeholder="https://…" maxlength="500" /><span class="dc-fmt-hint">↵</span></div>`;
    document.body.append(fmt);
    let range = null, fmtBusy = false;
    const inContent = (n) => { const c = content(); return c && n && c.contains(n.nodeType === 1 ? n : n.parentNode); };
    function showFmt() {
      const sel = getSelection();
      if (!api.open || !sel.rangeCount || sel.isCollapsed || !inContent(sel.anchorNode)) {
        if (!fmt.contains(document.activeElement) && !fmtBusy) hideFmt();
        return;
      }
      range = sel.getRangeAt(0).cloneRange();
      const r = range.getBoundingClientRect();
      const blk = topChild(sel.anchorNode);
      const tag = blk?.nodeType === 1 ? blk.tagName.toLowerCase() : 'p';
      fmt.querySelector('[data-block-label]').textContent = (BLOCKS.find(([t]) => t === tag) || BLOCKS[0])[1];
      ['bold', 'italic', 'underline', 'strikeThrough', 'insertUnorderedList'].forEach((c) => fmt.querySelector(`[data-cmd="${c}"]`).classList.toggle('on', document.queryCommandState(c)));
      if (fmt.hidden) { fmt.hidden = false; fmt.classList.remove('in'); void fmt.offsetWidth; fmt.classList.add('in'); }
      const w = fmt.offsetWidth, h = fmt.offsetHeight;
      const x = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2));
      const y = r.top - h - 10 < 50 ? r.bottom + 10 : r.top - h - 10;
      fmt.style.left = `${x}px`; fmt.style.top = `${y}px`;
    }
    function hideFmt() {
      fmt.hidden = true; fmtBusy = false;
      fmt.querySelectorAll('.dc-dd.open').forEach((d) => d.classList.remove('open'));
      fmt.querySelectorAll('[data-in]').forEach((x) => { x.hidden = true; x.querySelector('input').value = ''; });
      fmt.querySelector('.dc-fmt-row').hidden = false;
    }
    const restore = () => { if (!range) return; content()?.focus({ preventScroll: true }); const s = getSelection(); s.removeAllRanges(); s.addRange(range); };
    function exec(cmd, val) { restore(); document.execCommand('styleWithCSS', false, cmd === 'foreColor'); document.execCommand(cmd, false, val); commit(); range = getSelection().rangeCount ? getSelection().getRangeAt(0).cloneRange() : range; showFmt(); }
    let selecting = false; // während die Maus gedrückt ist, kein Menü – erst beim Loslassen
    document.addEventListener('pointerdown', (e) => {
      if (fmt.contains(e.target)) return;
      // Klick irgendwo anders schließt das Menü – auch das offene KI-/Link-Feld (läuft die KI schon, bleibt es)
      if (!fmt.hidden && !fmt.querySelector('.dc-fmt-in.busy')) hideFmt();
      if (inContent(e.target)) selecting = true;
    }, true);
    window.addEventListener('pointerup', () => { if (!selecting) return; selecting = false; setTimeout(showFmt, 0); }, true);
    document.addEventListener('selectionchange', () => { if (!fmtBusy && !selecting) setTimeout(showFmt, 0); });
    fmt.addEventListener('mousedown', (e) => { if (!e.target.closest('input')) e.preventDefault(); }); // Markierung bleibt erhalten
    fmt.addEventListener('click', (e) => {
      const dd = e.target.closest('[data-dd]');
      if (dd) { const box = dd.parentElement, was = box.classList.contains('open'); fmt.querySelectorAll('.dc-dd.open').forEach((d) => d.classList.remove('open')); box.classList.toggle('open', !was); return; }
      const b = e.target.closest('[data-block]');
      if (b) { exec('formatBlock', b.dataset.block === 'p' ? 'p' : b.dataset.block); return; }
      const col = e.target.closest('[data-color]');
      if (col) { fmt.querySelector('.dc-dot').style.background = col.dataset.color; exec('foreColor', col.dataset.color); fmt.querySelectorAll('.dc-dd.open').forEach((d) => d.classList.remove('open')); return; }
      const cmd = e.target.closest('[data-cmd]');
      if (cmd) { exec(cmd.dataset.cmd); if (cmd.closest('.dc-dd')) cmd.closest('.dc-dd').classList.remove('open'); return; }
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'ask' || act === 'link') {
        fmtBusy = true;
        fmt.querySelector('.dc-fmt-row').hidden = true;
        const box = fmt.querySelector(`[data-in="${act}"]`); box.hidden = false;
        setTimeout(() => box.querySelector('input').focus(), 20);
      }
    });
    fmt.querySelectorAll('[data-in] input').forEach((inp) => inp.addEventListener('keydown', async (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') { hideFmt(); restore(); return; }
      if (e.key !== 'Enter' || !inp.value.trim()) return;
      e.preventDefault();
      const kind = inp.closest('[data-in]').dataset.in, val = inp.value.trim();
      if (kind === 'link') { fmtBusy = false; exec('createLink', /^https?:\/\//i.test(val) ? val : `https://${val}`); hideFmt(); return; }
      // Ask AI: markierten Text von der KI umschreiben lassen
      const box = inp.closest('[data-in]'), d = doc, r = range;
      const tmp = document.createElement('div'); tmp.append(r.cloneContents());
      inp.disabled = true; box.classList.add('busy'); inp.value = 'KI schreibt …';
      try {
        const o = await docAi({ mode: 'rewrite', instruction: val, selection: tmp.innerHTML, doc: { title: d.title, html: d.content } });
        if (doc === d) { range = r; restore(); document.execCommand('insertHTML', false, o.html); commit(); }
      } catch (err) { busy(err.message); setTimeout(() => busy(''), 4000); }
      inp.disabled = false; box.classList.remove('busy'); hideFmt();
    }));

    view.addEventListener('click', (e) => {
      if (!doc) return;
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'focus') { setFocus(!focusOn); return; }
      if (focusOn) return; // im Fokusmodus lässt sich nichts ändern
      if (act === 'pin') { doc.pinned = !doc.pinned; touch(doc); changed(); const b = view.querySelector('.dc-pinbtn'); b?.classList.toggle('on', !!doc.pinned); b?.setAttribute('aria-label', doc.pinned ? 'Lösen' : 'Anheften'); return; }
      if (act === 'undo' || act === 'redo') { stepHist(act === 'undo'); return; }
      if (act === 'pane') { paneOpen = !paneOpen; localStorage.setItem('docs.pane', paneOpen ? '1' : '0'); drawPane(); return; }
      if (act === 'cover') { openCoverPop(); return; }
      if (act === 'settings') { openSettings(); return; }
      if (act === 'icon') { openIconPop(); return; }
      if (act === 'cover-del') { setCover(null); return; }
    });

    Object.assign(api, {
      show(t) {
        tab = t; doc = docOf(t?.dataset.doc);
        if (!view.isConnected) panel()?.append(view);
        api.open = true; view.hidden = false; panel()?.classList.add('view-docs');
        if (ready || doc) draw();
      },
      hide() { if (!api.open) return; setFocus(false); api.open = false; view.hidden = true; hideFmt(); if (!list.open) panel()?.classList.remove('view-docs'); drawPane(); },
      redraw() { if (tab) { doc = docOf(tab.dataset.doc); draw(); } },
      isShowing: (id) => api.open && doc?.id === id,
      typeIn, insertBlocks, setWriting, remember: (prev, next) => remember(prev, next),
      refreshMeta() { if (!doc) return; const t = view.querySelector('.dc-title-in'), s2 = view.querySelector('.dc-sub-in'); if (t && document.activeElement !== t) { t.value = doc.title; grow(t); } if (s2 && document.activeElement !== s2) { s2.value = doc.subtitle || ''; grow(s2); s2.classList.add('dc-in'); setTimeout(() => s2.classList.remove('dc-in'), 500); } },
    });
    return api;
  })();

  /* ---------- Schnittstelle für den Chat (der Agent legt Dokumente an und bearbeitet sie) ---------- */
  function add({ title = '', subtitle = '', content = '', projectId = '' } = {}) {
    const d = { id: newId('d'), title: String(title).slice(0, 160), subtitle: String(subtitle).slice(0, 400), projectId, tags: [], content: clean(content), created: Date.now(), updated: Date.now(), ws: wsNow() };
    docs.unshift(d); save(); renderSide(); if (list.open) list.render();
    return d;
  }
  function update(id, patch) {
    const d = docOf(id); if (!d) return null;
    if (patch.content != null) { const next = clean(patch.content); if (editor.isShowing(id)) editor.remember(d.content, next); d.content = next; }
    if (patch.title != null) d.title = String(patch.title).slice(0, 160);
    if (patch.subtitle != null) d.subtitle = String(patch.subtitle).slice(0, 400);
    if (patch.ws != null) d.ws = String(patch.ws).slice(0, 30);
    touch(d); renderSide(); if (list.open) list.render();
    const tab = document.querySelector(`.tab[data-doc="${id}"]`);
    if (tab) window.setTabTitle?.(tab, d.title.trim() || 'Unbenannt');
    if (editor.isShowing(id)) { if (patch.content != null) editor.redraw(); else editor.refreshMeta(); }
    window.markDrafts?.();
    return d;
  }
  /* ---------- Fenster „Dokument erstellen“ (im Chat bzw. als Fenster in der Mitte) ----------
     Schlicht und klein: Titel (vom Chat), Beschreibung (leer lassen → die KI schreibt sie), unten „Abbrechen“ und der blaue Knopf.
     Kein × oben rechts, keine Tags – Tags gibt es später in den Infos des Dokuments. */
  function makeForm({ title = '', subtitle = '', cta = 'Dokument erstellen', onCreate, onCancel }) {
    const form = el('form', 'tk-form dc-make');
    form.autocomplete = 'off';
    form.innerHTML = `<div class="dc-make-head">${fi('file', 15)}<span>Neues Dokument</span></div>
      <input class="tk-f-title" placeholder="Titel" maxlength="160" aria-label="Titel" />
      <textarea class="tk-f-notes" rows="1" placeholder="Beschreibung – leer lassen, dann schreibt die KI sie" maxlength="400" aria-label="Beschreibung"></textarea>
      <div class="tk-form-foot"><span class="grow"></span>${onCancel ? '<button type="button" class="dc-make-cancel" data-x>Abbrechen</button>' : ''}<button type="submit" class="tk-create">${esc(cta)}</button></div>`;
    const ti = form.querySelector('.tk-f-title'), su = form.querySelector('.tk-f-notes');
    const growSu = () => { su.style.height = 'auto'; su.style.height = `${Math.min(su.scrollHeight, 120)}px`; };
    ti.value = title; su.value = subtitle;
    setTimeout(growSu);
    [ti, su].forEach((x) => x.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter' && x === su) { e.preventDefault(); form.requestSubmit(); } }));
    su.addEventListener('input', growSu);
    form.addEventListener('click', (e) => { if (e.target.closest('[data-x]')) onCancel?.(); });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const b = form.querySelector('.tk-create'); if (b.disabled) return;
      b.disabled = true; b.classList.add('saving');
      onCreate({ title: ti.value.trim(), subtitle: su.value.trim(), tags: [] });
    });
    return { el: form };
  }
  // als Fenster in der Mitte (z. B. „Ins Dokument“ unter einer Antwort)
  function offer(opts) {
    const modal = el('div', 'tk-modal dc-make-modal');
    const close = () => { modal.classList.add('closing'); setTimeout(() => modal.remove(), 220); document.removeEventListener('keydown', esc$); };
    const esc$ = (e) => { if (e.key === 'Escape') close(); };
    const f = makeForm({ ...opts, onCancel: close, onCreate: (v) => { close(); opts.onCreate(v); } });
    modal.append(f.el);
    // darunter: Antwort stattdessen ans Ende eines vorhandenen Dokuments hängen (Suche + zuletzt bearbeitete)
    if (opts.onAppend && docs.length) {
      const into = el('div', 'dc-make-into');
      into.innerHTML = `<div class="dc-into-l">Oder in ein bestehendes Dokument übernehmen</div><input class="dc-into-q" placeholder="Dokument suchen …" spellcheck="false" aria-label="Dokument suchen" /><div class="dc-into-list"></div>`;
      const q = into.querySelector('input'), listEl = into.querySelector('.dc-into-list');
      const draw = () => {
        const s = q.value.trim().toLowerCase();
        const hits = docs.filter((x) => !s || (x.title || '').toLowerCase().includes(s)).sort((x, y) => (y.updated || 0) - (x.updated || 0)).slice(0, 6);
        listEl.innerHTML = hits.map((x) => `<button type="button" class="dc-into-i" data-id="${esc(x.id)}">${x.icon && window.DocIcons?.has(x.icon.name) ? `<span style="color:${esc(x.icon.c)}">${DocIcons.svg(x.icon.name, 15, '', !!x.icon.line)}</span>` : fi('file', 14)}<span>${esc(x.title || 'Unbenannt')}</span></button>`).join('') || '<div class="dc-into-none">Kein Dokument gefunden</div>';
      };
      q.addEventListener('input', draw);
      q.addEventListener('keydown', (e) => e.stopPropagation());
      listEl.addEventListener('click', (e) => { const b = e.target.closest('[data-id]'); if (b) { close(); opts.onAppend(b.dataset.id); } });
      draw();
      f.el.append(into);
    }
    modal.addEventListener('pointerdown', (e) => { if (e.target === modal) close(); });
    document.addEventListener('keydown', esc$);
    document.body.append(modal);
    setTimeout(() => f.el.querySelector('.tk-f-title').focus({ preventScroll: true }), 60);
    return f;
  }
  // Dokument anlegen, öffnen und den Inhalt sichtbar hineinschreiben (fertiges HTML oder von der KI erzeugt)
  function make({ title, subtitle, tags = [], projectId = '', html, generate, describe }) {
    const d = add({ title, subtitle, projectId });
    d.tags = tags.slice(); save();
    open(d.id);
    // ohne eigene Beschreibung (oder Titel) schreibt die KI sie im Hintergrund
    if ((!subtitle || !title) && describe) describe().then((m = {}) => {
      const cur = docOf(d.id); if (!cur) return;
      const patch = {};
      if (m.subtitle && !(cur.subtitle || '').trim()) patch.subtitle = m.subtitle;
      if (m.title && !cur.title.trim()) patch.title = m.title;
      if (Object.keys(patch).length) update(d.id, patch);
    }).catch(() => {});
    const done = (async () => {
      editor.setWriting(d.id, true);
      try { await editor.typeIn(d.id, clean(html != null ? html : await generate())); }
      catch (err) { editor.setWriting(d.id, false); throw err; }
      editor.setWriting(d.id, false);
    })();
    return { doc: d, done };
  }
  // Inhalt (z. B. eine Chat-Antwort) ans Ende eines vorhandenen Dokuments hängen und das Dokument öffnen
  function appendTo(id, html) {
    const doc = docOf(id); if (!doc) return;
    const extra = clean(html || ''); if (!extra.trim()) { open(id); return; }
    update(id, { content: `${doc.content || ''}${extra}` });
    open(id);
  }
  // Dokumente, die auf dem Server entstanden sind (z. B. Ergebnis einer Agenten-Aufgabe), in die Liste übernehmen
  async function sync() {
    if (!ready) return;
    try {
      const r = await fetch('/api/docs', { cache: 'no-store' }); if (!r.ok) return;
      const all = (await r.json()).docs || [];
      const fresh = all.filter((d) => d?.id && !docOf(d.id) && !deletedIds.has(d.id));
      fresh.forEach((d) => { docs.unshift(d); sentDocs.set(d.id, JSON.stringify(d)); });
      // geteilte Workspaces: von anderen geänderte Dokumente übernehmen (nicht das gerade offene), gelöschte entfernen
      const shared = new Set((window.Workspaces?.list() || []).filter((w) => w.shared).map((w) => w.id));
      let changed = fresh.length;
      if (shared.size) {
        const open = editor.currentId?.();
        const there = new Map(all.map((d) => [d.id, d]));
        docs.forEach((d, i) => {
          if (!shared.has(d.ws) || d.id === open) return;
          const s = there.get(d.id);
          if (s && (Number(s.updated) || 0) > (Number(d.updated) || 0)) { docs[i] = s; sentDocs.set(s.id, JSON.stringify(s)); changed++; }
        });
        const gone = docs.filter((d) => shared.has(d.ws) && !there.has(d.id) && sentDocs.has(d.id) && d.id !== open);
        if (gone.length) { forget(gone.map((d) => d.id)); changed++; }
      }
      if (changed) { renderSide(); if (list.open) list.render(); }
    } catch {}
  }
  // Dokumente nur hier entfernen (z. B. Workspace verlassen – sie gehören dem Besitzer), nicht auf dem Server löschen
  function forget(ids) {
    const set = new Set(ids);
    docs = docs.filter((d) => !set.has(d.id));
    set.forEach((id) => sentDocs.delete(id));
    renderSide(); if (list.open) list.render();
  }
  const forgetWs = (ws) => forget(docs.filter((d) => d.ws === ws).map((d) => d.id));
  function discard(id) { const d = docOf(id); if (d && isEmpty(d)) { docs = docs.filter((x) => x !== d); deletedIds.add(id); save(); renderSide(); if (list.open) list.render(); } }

  return {
    list, editor, open, create, add, update, discard, sync, forget, forgetWs, remove, makeForm, offer, make, clean, appendTo,
    get: (id) => docOf(id),
    isEmpty: (id) => { const d = docOf(id); return !d || isEmpty(d); },
    titleOf: (id) => docOf(id)?.title || 'Unbenannt',
    get docs() { return docs.slice(); },
    inWs: (d) => inWs(d),
    refresh: () => { renderSide(); if (list.open) list.render(); },
  };
})();
window.Docs = Docs;
