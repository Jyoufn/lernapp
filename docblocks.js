/* ===================================================================
   Dokument-Blöcke: Slash-Menü („/“ im Text) und die Blöcke dazu
   - Text-Blöcke stehen als normales HTML im Dokument: Aufgaben (<ul data-todo>), Tabelle, Trennlinie (<hr>),
     Hervorhebung (<div data-callout>), Seitenlink (<a data-doclink="id">)
   - alle anderen Blöcke stehen nur als Platzhalter <div data-blk="…" data-cfg="{…}"></div> im Dokument
     und werden beim Anzeigen gezeichnet (wie die Grafiken mit data-viz)
   =================================================================== */
const DocBlocks = (() => {
  const fi = (n, s = 14) => FadeIcons.svg(n, s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const ACC = '#2f86ff';
  const COLORS = () => window.UIKit?.COLORS || ['#6aa8ff', '#b49cff', '#f472b6', '#f07a6e', '#f0913a', '#facc15', '#4fcf8a', '#2dd4bf', '#a3a3a3'];
  const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  const pad2 = (n) => String(n).padStart(2, '0');
  const isoDay = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const localDT = (d) => `${isoDay(d)}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  const httpUrl = (u) => /^https?:\/\/[^\s]+$/i.test(String(u || '').trim());
  const mediaSrc = (u, kind) => httpUrl(u) || new RegExp(`^data:${kind}\\/[\\w.+-]+;base64,`).test(String(u || ''));
  const num = (v) => { const n = Number(String(v).replace(',', '.')); return Number.isFinite(n) ? n : 0; };
  const fmtNum = (v) => (+v).toLocaleString('de-DE', { maximumFractionDigits: 2 });

  /* ---------- Einträge im Slash-Menü ---------- */
  // glyph = Schriftzeichen statt Icon (Text, Überschriften), hint = Markdown-Kürzel rechts
  const ITEMS = [
    { id: 'p', group: 'Basis-Blöcke', name: 'Text', glyph: 'T', keys: 'text absatz paragraph' },
    { id: 'h1', group: 'Basis-Blöcke', name: 'Überschrift 1', glyph: 'H<sub>1</sub>', hint: '#', keys: 'überschrift titel heading h1' },
    { id: 'h2', group: 'Basis-Blöcke', name: 'Überschrift 2', glyph: 'H<sub>2</sub>', hint: '##', keys: 'überschrift heading h2' },
    { id: 'h3', group: 'Basis-Blöcke', name: 'Überschrift 3', glyph: 'H<sub>3</sub>', hint: '###', keys: 'überschrift heading h3' },
    { id: 'h4', group: 'Basis-Blöcke', name: 'Überschrift 4', glyph: 'H<sub>4</sub>', hint: '####', keys: 'überschrift heading h4' },
    { id: 'ul', group: 'Basis-Blöcke', name: 'Aufzählung', icon: 'list', hint: '-', keys: 'aufzählung liste stichpunkte bullet' },
    { id: 'ol', group: 'Basis-Blöcke', name: 'Nummerierte Liste', icon: 'list-num', hint: '1.', keys: 'nummeriert liste zahlen numbered' },
    { id: 'todo', group: 'Basis-Blöcke', name: 'Aufgabenliste', icon: 'tasks', hint: '[]', keys: 'aufgabe todo task checkbox abhaken' },
    { id: 'quote', group: 'Basis-Blöcke', name: 'Zitat', icon: 'quote', hint: '>', keys: 'zitat quote' },
    { id: 'callout', group: 'Basis-Blöcke', name: 'Hervorhebung', icon: 'callout', keys: 'hervorhebung callout hinweis kasten box' },
    { id: 'divider', group: 'Basis-Blöcke', name: 'Trennlinie', icon: 'divider', hint: '---', keys: 'linie trenner trennlinie hr divider' },
    { id: 'table', group: 'Basis-Blöcke', name: 'Tabelle', icon: 'table', keys: 'tabelle table spalten' },
    { id: 'page', group: 'Basis-Blöcke', name: 'Seite verlinken', icon: 'file', keys: 'seite verlinken link dokument page' },
    { id: 'image', group: 'Medien', name: 'Bild', icon: 'image', keys: 'bild foto image' },
    { id: 'video', group: 'Medien', name: 'Video', icon: 'video', keys: 'video youtube vimeo film' },
    { id: 'audio', group: 'Medien', name: 'Audio', icon: 'music', keys: 'audio ton musik aufnahme' },
    { id: 'web', group: 'Medien', name: 'Website', icon: 'globe', keys: 'website webseite link url web lesezeichen' },
    { id: 'gallery', group: 'Medien', name: 'Galerie', icon: 'gallery', keys: 'galerie bilder gallery' },
    { id: 'calendar', group: 'Ansichten', name: 'Kalender', icon: 'calendar', keys: 'kalender termine monat calendar' },
    { id: 'time', group: 'Ansichten', name: 'Zeit', icon: 'timer', keys: 'zeit countdown timer frist zeitraum' },
    { id: 'board', group: 'Ansichten', name: 'Aufgaben-Board', icon: 'kanban', keys: 'aufgaben board kanban todo to-do tasks spalten' },
    { id: 'dashboard', group: 'Ansichten', name: 'Dashboard', icon: 'dashboard', keys: 'dashboard übersicht diagramme kacheln' },
    { id: 'map', group: 'Ansichten', name: 'Karte', icon: 'map-pin', keys: 'karte map ort standort maps' },
    { id: 'bar', group: 'Diagramme', name: 'Säulendiagramm', icon: 'analytics', keys: 'säulen balken vertikal bar diagramm' },
    { id: 'hbar', group: 'Diagramme', name: 'Balkendiagramm', icon: 'bars-h', keys: 'balken horizontal rangliste diagramm' },
    { id: 'line', group: 'Diagramme', name: 'Liniendiagramm', icon: 'trend', keys: 'linie verlauf line diagramm' },
  ];
  const PH = 'Titel hinzufügen';
  const sampleChart = (type, two = false) => ({ type, title: '', unit: '', labels: ['Mo', 'Di', 'Mi', 'Do', 'Fr'],
    series: [{ name: two ? 'Diese Woche' : 'Werte', c: ACC, values: [4, 7, 5, 9, 6] }, ...(two ? [{ name: 'Letzte Woche', c: '#4fcf8a', values: [3, 5, 6, 6, 8] }] : [])] });
  function defaults(id) {
    const now = new Date();
    if (['bar', 'hbar', 'line'].includes(id)) return { blk: 'chart', cfg: sampleChart(id) };
    if (id === 'dashboard') return { blk: id, cfg: { items: [] } }; // startet leer, Kacheln kommen über das „+“
    if (id === 'board') return { blk: id, cfg: { tasks: [] } };
    if (id === 'time') return { blk: id, cfg: { mode: 'countdown', title: '', start: localDT(now), end: localDT(new Date(now.getTime() + 7 * 864e5)) } };
    if (id === 'calendar') return { blk: id, cfg: { events: [] } };
    if (id === 'map') return { blk: id, cfg: { q: '', label: '', lat: 52.52, lon: 13.405, zoom: 12 } };
    if (id === 'gallery') return { blk: id, cfg: { items: [] } };
    return { blk: id, cfg: {} };
  }
  // HTML, das beim Auswählen ins Dokument kommt
  function html(id) {
    if (id === 'p') return '<p><br></p>';
    if (/^h[1-4]$/.test(id)) return `<${id}><br></${id}>`;
    if (id === 'ul' || id === 'ol') return `<${id}><li><br></li></${id}>`;
    if (id === 'quote') return '<blockquote><br></blockquote>';
    if (id === 'todo') return '<ul data-todo><li><br></li></ul>';
    if (id === 'table') return `<table><tbody>${'<tr><td><br></td><td><br></td><td><br></td></tr>'.repeat(3)}</tbody></table>`; // schlichtes Raster 3 × 3 wie in Notion
    if (id === 'divider') return '<hr>';
    if (id === 'callout') return '<div data-callout="#2f86ff" data-radius="12"><p><br></p></div>';
    const d = defaults(id);
    return `<div data-blk="${d.blk}" data-cfg="${esc(JSON.stringify(d.cfg))}"></div>`;
  }

  /* ---------- Gemeinsames: Datei wählen, Bild verkleinern, kleines Fenster ---------- */
  const pickFiles = (accept, multiple = false) => new Promise((res) => {
    const i = document.createElement('input'); i.type = 'file'; i.accept = accept; i.multiple = multiple;
    i.addEventListener('change', () => res([...i.files])); i.click();
  });
  const readData = (f) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error('Datei konnte nicht gelesen werden')); r.readAsDataURL(f); });
  // Bilder verkleinern (max. 1800 px breit), damit Dokumente klein bleiben
  function imageData(f, max = 1800) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, max / img.width), c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(img.src);
        res(c.toDataURL('image/jpeg', 0.9));
      };
      img.onerror = () => rej(new Error('Bild konnte nicht gelesen werden'));
      img.src = URL.createObjectURL(f);
    });
  }
  // Fenster in der Mitte – gleicher Stil wie Cover- und Icon-Fenster
  function modal(title, body, { onClose, wide, head } = {}) {
    const m = el('div', 'tk-modal dc-cmodal dcb-modal');
    const pop = el('div', `tk-form dc-cpop dcb-mpop${wide ? ' wide' : ''}`);
    pop.innerHTML = `<div class="dc-cpop-head"><span class="dc-cpop-title">${esc(title)}</span><button type="button" class="tk-x dc-cpop-x" aria-label="Schließen" title="Schließen">${fi('x', 12)}</button></div>`;
    if (head) pop.querySelector('.dc-cpop-title').replaceWith(head); // z. B. Titel des Diagramms direkt oben links
    const wrap = el('div', 'dc-cpop-body'); wrap.append(body); pop.append(wrap); m.append(pop);
    document.body.append(m);
    const close = () => { document.removeEventListener('keydown', key); m.classList.add('closing'); setTimeout(() => m.remove(), 220); onClose?.(); };
    const key = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', key);
    m.addEventListener('pointerdown', (e) => { if (e.target === m) close(); });
    pop.querySelector('.dc-cpop-x').addEventListener('click', close);
    pop.addEventListener('keydown', (e) => e.stopPropagation());
    return { close, pop };
  }
  // Werkzeuge oben rechts an jedem Block (beim Darüberfahren)
  function tools(b, api, extra = []) {
    b._menu = extra; // Zusatz-Aktionen (Bearbeiten, Fixieren …) erscheinen auch im Rechtsklick-Menü
    const t = el('div', 'dcb-tools');
    [...extra, { icon: 'trash', label: 'Block entfernen', fn: () => api.remove(), danger: true }].forEach((x) => {
      const btn = el('button', `dcb-tool${x.danger ? ' danger' : ''}`, `${fi(x.icon, 13)}${x.text ? `<span>${esc(x.text)}</span>` : ''}`);
      btn.type = 'button'; btn.title = x.label; btn.setAttribute('aria-label', x.label);
      btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); x.fn(); });
      t.append(btn);
    });
    b.append(t);
  }
  // Fläche „leer“: Hochladen / Link einfügen
  function emptyState(b, { icon, text, accept, urlHint, onFile, onUrl, multiple }) {
    const box = el('div', 'dcb-empty-box');
    box.innerHTML = `<span class="dcb-empty-ic">${fi(icon, 16)}</span><span class="dcb-empty-t">${esc(text)}</span>
      <div class="dcb-empty-row">${accept ? `<button type="button" class="dcb-btn" data-up>${fi('upload', 12)}Hochladen</button>` : ''}
        <input class="dcb-in" placeholder="${esc(urlHint)}" spellcheck="false" /></div><div class="dcb-err" hidden></div>`;
    const err = box.querySelector('.dcb-err');
    const fail = (m) => { err.hidden = false; err.textContent = m; };
    box.querySelector('[data-up]')?.addEventListener('click', async () => { const fs = await pickFiles(accept, multiple); if (fs.length) onFile(fs).catch((e) => fail(e.message)); });
    const inp = box.querySelector('input');
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); const v = inp.value.trim(); if (!httpUrl(v)) fail('Bitte einen Link mit https:// einfügen'); else onUrl(v); } });
    box.addEventListener('dragover', (e) => { if (!accept) return; e.preventDefault(); box.classList.add('drag'); });
    box.addEventListener('dragleave', () => box.classList.remove('drag'));
    box.addEventListener('drop', (e) => { if (!accept) return; e.preventDefault(); box.classList.remove('drag'); const fs = [...e.dataTransfer.files]; if (fs.length) onFile(fs).catch((x) => fail(x.message)); });
    b.append(box);
    return box;
  }

  /* ---------- Diagramme: Säulen, Balken, Linie – eine oder mehrere Datenreihen ---------- */
  const SERIES_C = ['#2f86ff', '#4fcf8a', '#f0913a', '#b49cff', '#f472b6', '#2dd4bf', '#facc15', '#f07a6e'];
  // ältere Diagramme (eine Werte-Reihe oder „Zahl“) in das Format mit Datenreihen bringen
  function normChart(c = {}) {
    const o = { type: ['bar', 'hbar', 'line'].includes(c.type) ? c.type : 'bar', title: String(c.title || ''), unit: String(c.unit || ''), labels: Array.isArray(c.labels) ? c.labels.map(String) : [], bare: !!c.bare };
    if (c.type === 'number' && !o.labels.length) { o.labels = [o.title || 'Wert']; c = { ...c, values: [c.value] }; }
    const src = Array.isArray(c.series) && c.series.length ? c.series : [{ name: c.title || 'Werte', c: c.c, values: c.values }];
    o.series = src.slice(0, 8).map((s, i) => ({ name: String(s?.name || `Reihe ${i + 1}`), c: /^#[\da-f]{6}$/i.test(s?.c || '') ? s.c : SERIES_C[i % SERIES_C.length], values: o.labels.map((_, k) => num(s?.values?.[k] ?? 0)) }));
    return o;
  }
  function smooth(pts) {
    if (pts.length < 2) return '';
    let d = `M${pts[0][0]},${pts[0][1]}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i - 1] || pts[i], [x1, y1] = pts[i], [x2, y2] = pts[i + 1], [x3, y3] = pts[i + 2] || pts[i + 1];
      d += ` C${(x1 + (x2 - x0) / 6).toFixed(1)},${(y1 + (y2 - y0) / 6).toFixed(1)} ${(x2 - (x3 - x1) / 6).toFixed(1)},${(y2 - (y3 - y1) / 6).toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`;
    }
    return d;
  }
  const short = (s) => (s.length > 12 ? `${s.slice(0, 11)}…` : s);
  function chartView(raw, compact = false) {
    const cfg = normChart(raw);
    const S = cfg.series, multi = S.length > 1, labels = cfg.labels, n = labels.length, unit = cfg.unit ? ` ${cfg.unit}` : '';
    const box = el('div', `dcb-chart t-${cfg.type}${compact ? ' compact' : ''}${cfg.bare ? ' bare' : ''}`);
    box.style.setProperty('--cc', S[0]?.c || ACC);
    box.innerHTML = `<div class="dcb-ct${cfg.title ? '' : ' ph'}">${esc(cfg.title || PH)}</div>${multi ? `<div class="dcb-legend">${S.map((s) => `<span><i style="background:${esc(s.c)}"></i>${esc(s.name)}</span>`).join('')}</div>` : ''}`;
    if (!n) { box.append(el('div', 'dcb-none', 'Noch keine Werte')); return box; }
    // alle Werte gleich stark in ihrer Farbe (kein „bester“ Wert hervorgehoben)
    const all = S.flatMap((s) => s.values);
    if (cfg.type === 'hbar') {
      const max = Math.max(...all.map(Math.abs), 0) || 1;
      const list = el('div', `dcb-hbars${multi ? ' multi' : ''}`);
      labels.forEach((lab, i) => {
        const row = el('div', 'dcb-hrow');
        row.innerHTML = `<span class="dcb-hl">${esc(lab)}</span><span class="dcb-hbs">${S.map((s, j) => `<span class="dcb-hb"><i style="width:${Math.max(2, (Math.abs(s.values[i]) / max) * 100)}%;animation-delay:${(i * S.length + j) * 40}ms${multi ? `;background:${esc(s.c)}` : ''}"></i></span>`).join('')}</span>
          <span class="dcb-hvs">${S.map((s) => `<b>${esc(fmtNum(s.values[i]) + unit)}</b>`).join('')}</span>`;
        list.append(row);
      });
      box.append(list);
      return box;
    }
    // in echter Breite zeichnen (Schrift bleibt 11 px); bei Größenänderung neu, dann ohne Animation
    const host = el('div', 'dcb-svg');
    box.append(host);
    let lastW = 0;
    const build = (W) => {
      lastW = W;
      const H = compact ? 170 : 230, top = 22, bot = 26;
      const mx = Math.max(...all, 0), mn = Math.min(...all, 0), span = mx - mn || 1;
      const yOf = (v) => top + (H - top - bot) * (1 - (v - mn) / span);
      let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(cfg.title || 'Diagramm')}">`;
      [0, 0.5, 1].forEach((k) => { const y = top + (H - top - bot) * k; svg += `<line class="dcb-grid" x1="0" x2="${W}" y1="${y}" y2="${y}"/>`; });
      if (cfg.type === 'bar') {
        const slot = W / n, k = S.length, gap = 4, gw = Math.min(slot * 0.7, k * 34 + (k - 1) * gap), bw = (gw - (k - 1) * gap) / k, y0 = yOf(0);
        labels.forEach((lab, i) => {
          const x0 = slot * i + (slot - gw) / 2;
          S.forEach((s, j) => {
            const v = s.values[i], x = x0 + j * (bw + gap), y = Math.min(yOf(v), y0), h = Math.max(2, Math.abs(yOf(v) - y0));
            svg += `<g class="dcb-bar solid" style="--cc:${esc(s.c)}"><rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="${Math.min(6, bw / 3).toFixed(1)}" style="animation-delay:${(i * k + j) * 35}ms"/>
              <text class="dcb-val" x="${(x + bw / 2).toFixed(1)}" y="${(y - 7).toFixed(1)}" text-anchor="middle">${esc(fmtNum(v) + unit)}</text></g>`;
          });
          svg += `<text class="dcb-lab" x="${(x0 + gw / 2).toFixed(1)}" y="${H - 7}" text-anchor="middle">${esc(short(lab))}</text>`;
        });
      } else {
        const xOf = (i) => 24 + i * ((W - 48) / Math.max(1, n - 1));
        S.forEach((s, j) => {
          const pts = s.values.map((v, i) => [xOf(i), yOf(v)]), d = smooth(pts), id = `g${Math.random().toString(36).slice(2, 8)}`;
          svg += `<g style="--cc:${esc(s.c)}"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${esc(s.c)}" stop-opacity="${multi ? '.12' : '.24'}"/><stop offset="1" stop-color="${esc(s.c)}" stop-opacity="0"/></linearGradient></defs>`;
          if (n > 1) svg += `<path class="dcb-area" d="${d} L${pts[n - 1][0]},${H - bot} L${pts[0][0]},${H - bot} Z" fill="url(#${id})"/><path class="dcb-line" d="${d}" pathLength="1" style="animation-delay:${j * 120}ms"/>`;
          pts.forEach(([x, y], i) => {
            svg += `<g class="dcb-pt"><circle cx="${x}" cy="${y}" r="10" class="dcb-hit"/><circle cx="${x}" cy="${y}" r="3.5" class="dcb-dot"/><text class="dcb-val" x="${x}" y="${y - 12}" text-anchor="middle">${esc(fmtNum(s.values[i]) + unit)}</text></g>`;
          });
          svg += '</g>';
        });
        labels.forEach((lab, i) => { svg += `<text class="dcb-lab" x="${xOf(i)}" y="${H - 7}" text-anchor="middle">${esc(short(lab))}</text>`; });
      }
      svg += '</svg>';
      host.innerHTML = svg;
    };
    build(600);
    new ResizeObserver(() => setTimeout(() => { const w = Math.round(host.clientWidth); if (w > 120 && Math.abs(w - lastW) > 4) { host.classList.toggle('still', host.dataset.drawn === '1'); host.dataset.drawn = '1'; build(w); } })).observe(host);
    return box;
  }

  /* Fenster „Diagramm“: oben Titel, Vorschau, Art als Kacheln; darunter die Werte als Tabelle
     (Zeilen = Beschriftungen, Spalten = Datenreihen mit eigener Farbe), unten Einheit und „Fertig“ */
  const KINDS = [['bar', 'analytics', 'Säulen'], ['hbar', 'bars-h', 'Balken'], ['line', 'trend', 'Linie']];
  function chartEditor(cfg, onSave) {
    const c = normChart(cfg);
    const body = el('div', 'dcb-ed dcb-ced');
    body.innerHTML = `<div class="dcb-ed-prev"></div>
      <div class="dcb-kinds">${KINDS.map(([id, ic, name]) => `<button type="button" data-type="${id}"${c.type === id ? ' class="on"' : ''}>${fi(ic, 16)}<span>${name}</span></button>`).join('')}</div>
      <div class="dcb-sheet"></div>
      <div class="dcb-ed-foot"><label class="dcb-unit">Einheit<input data-f="unit" value="${esc(c.unit)}" placeholder="z. B. €, %, h" /></label><button type="button" class="dcb-bgsw" data-bare aria-pressed="${!c.bare}"><span>Hintergrund</span><i class="ce-switch${c.bare ? '' : ' on'}"><i></i></i></button><span class="grow"></span><button type="button" class="tk-create" data-done>Fertig</button></div>`;
    const prev = body.querySelector('.dcb-ed-prev'), sheet = body.querySelector('.dcb-sheet');
    const paint = () => { prev.replaceChildren(chartView(c, true)); onSave(JSON.parse(JSON.stringify(c))); };
    function drawSheet() {
      const multi = c.series.length > 1;
      sheet.innerHTML = `<table class="dcb-tbl"><thead><tr><th class="lab">Beschriftung</th>
          ${c.series.map((s, j) => `<th class="ser"><div class="dcb-sh"><button type="button" class="dcb-dot" data-color="${j}" style="--c:${esc(s.c)}" aria-label="Farbe der Reihe" title="Farbe"></button><input data-sname="${j}" value="${esc(s.name)}" aria-label="Name der Reihe" />${multi ? `<button type="button" class="dcb-x" data-sdel="${j}" aria-label="Reihe entfernen" title="Reihe entfernen">${fi('x', 9)}</button>` : ''}</div></th>`).join('')}
          <th class="add"><button type="button" class="dcb-x" data-sadd aria-label="Datenreihe hinzufügen" title="Datenreihe hinzufügen">${fi('plus', 11)}</button></th></tr></thead>
        <tbody>${c.labels.map((lab, i) => `<tr><td><input data-lab="${i}" value="${esc(lab)}" placeholder="Beschriftung" /></td>${c.series.map((s, j) => `<td><input class="num" data-v="${i},${j}" value="${esc(fmtIn(s.values[i]))}" inputmode="decimal" /></td>`).join('')}<td class="add"><button type="button" class="dcb-x" data-rdel="${i}" aria-label="Wert entfernen" title="Entfernen">${fi('x', 9)}</button></td></tr>`).join('')}</tbody></table>
        <button type="button" class="dcb-addrow" data-radd>${fi('plus', 11)}Wert hinzufügen</button>`;
    }
    const fmtIn = (v) => String(v).replace('.', ',');
    const addRow = () => { c.labels.push(`Wert ${c.labels.length + 1}`); c.series.forEach((s) => s.values.push(0)); drawSheet(); paint(); const ins = sheet.querySelectorAll('[data-lab]'); ins[ins.length - 1]?.select(); };
    body.addEventListener('input', (e) => {
      const t = e.target, d = t.dataset;
      if (d.f) c[d.f] = t.value;
      else if (d.lab != null) c.labels[+d.lab] = t.value;
      else if (d.sname != null) c.series[+d.sname].name = t.value;
      else if (d.v) { const [i, j] = d.v.split(',').map(Number); c.series[j].values[i] = num(t.value); }
      else return;
      paint();
    });
    body.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || !e.target.closest('tbody')) return;
      e.preventDefault();
      const tr = e.target.closest('tr'), next = tr.nextElementSibling;
      if (next) next.querySelector('input')?.select(); else addRow(); // Enter: nächste Zeile, in der letzten eine neue
    });
    let pop = null;
    const closePop = () => { pop?.remove(); pop = null; document.removeEventListener('pointerdown', popOutside, true); };
    const popOutside = (e) => { if (pop && !pop.contains(e.target) && !e.target.closest?.('[data-color]')) closePop(); };
    body.addEventListener('click', (e) => {
      const t = e.target.closest('[data-type]');
      if (t) { c.type = t.dataset.type; body.querySelectorAll('.dcb-kinds button').forEach((b) => b.classList.toggle('on', b === t)); paint(); return; }
      if (e.target.closest('[data-radd]')) { addRow(); return; }
      const bg = e.target.closest('[data-bare]');
      if (bg) { c.bare = !c.bare; bg.querySelector('.ce-switch').classList.toggle('on', !c.bare); bg.setAttribute('aria-pressed', String(!c.bare)); paint(); return; }
      const rd = e.target.closest('[data-rdel]');
      if (rd) { const i = +rd.dataset.rdel; c.labels.splice(i, 1); c.series.forEach((s) => s.values.splice(i, 1)); drawSheet(); paint(); return; }
      if (e.target.closest('[data-sadd]')) { if (c.series.length >= 8) return; c.series.push({ name: `Reihe ${c.series.length + 1}`, c: SERIES_C[c.series.length % SERIES_C.length], values: c.labels.map(() => 0) }); drawSheet(); paint(); sheet.querySelector(`[data-sname="${c.series.length - 1}"]`)?.select(); return; }
      const sd = e.target.closest('[data-sdel]');
      if (sd) { c.series.splice(+sd.dataset.sdel, 1); drawSheet(); paint(); return; }
      const dot = e.target.closest('[data-color]');
      if (dot) { // Farbe der Reihe: kleines Menü mit den Farben (wie bei den Tags)
        const j = +dot.dataset.color, again = pop?.dataset.j === String(j); closePop();
        if (again) return;
        pop = el('div', 'dcb-cpop-mini', `${UIKit.colorRow(c.series[j].c, 'data-c')}`);
        document.body.append(pop); // fest unter dem Farbpunkt, über dem Fenster
        const r = dot.getBoundingClientRect();
        pop.style.left = `${Math.max(8, Math.min(r.left - 8, innerWidth - pop.offsetWidth - 8))}px`; pop.style.top = `${r.bottom + 8}px`;
        pop.dataset.j = j;
        pop.addEventListener('click', onPop);
        document.addEventListener('pointerdown', popOutside, true);
        return;
      }
      closePop();
    });
    function onPop(e) {
      if (e.target.closest('.tk-picker')) return;
      const j = +pop.dataset.j, cu = e.target.closest('[data-custom]');
      if (cu) { const host = pop.querySelector('.tk-picker-host'); if (host.firstChild) { host.replaceChildren(); return; } host.append(UIKit.colorPicker(c.series[j].c, (hex, done) => { c.series[j].c = hex; paint(); if (done) { closePop(); drawSheet(); } })); return; }
      const sw = e.target.closest('[data-c]'); if (sw) { c.series[j].c = sw.dataset.c; closePop(); drawSheet(); paint(); }
    }
    drawSheet(); prev.replaceChildren(chartView(c, true));
    const head = el('input', 'dcb-title-in'); head.dataset.f = 'title'; head.placeholder = 'Titel des Diagramms'; head.value = c.title;
    head.addEventListener('input', () => { c.title = head.value; paint(); });
    head.addEventListener('keydown', (e) => e.stopPropagation());
    const m = modal('Diagramm', body, { wide: true, onClose: closePop, head });
    body.querySelector('[data-done]').addEventListener('click', m.close);
  }
  function chartBlk(b, cfg, api) {
    let view = chartView(cfg);
    const refresh = () => { const v = chartView(cfg); view.replaceWith(v); view = v; v.addEventListener('dblclick', edit); paintHead(b); };
    const edit = () => chartEditor(cfg, (next) => { const ic = cfg.icon; Object.keys(cfg).forEach((k) => delete cfg[k]); Object.assign(cfg, next); if (ic) cfg.icon = ic; api.save(cfg); refresh(); });
    b.append(view);
    tools(b, api, [{ icon: 'sliders', label: 'Diagramm bearbeiten', fn: edit },
      { icon: 'frame', label: 'Hintergrund', toggle: true, toggleLabel: 'Hintergrund', get on() { return !cfg.bare; }, fn: () => { cfg.bare = !cfg.bare; api.save(cfg); refresh(); } }]);
    view.addEventListener('dblclick', edit);
  }

  /* ---------- Dashboard: Kacheln (Diagramm, Liste, Tabelle, Aufgaben, Karte) im automatischen Raster ----------
     startet leer; das „+“ darunter fügt eine Kachel hinzu, das Raster teilt sich nach der Anzahl selbst auf.
     Oben rechts an jeder Kachel: Einstellungen (Regler) und Entfernen */
  const TILES = [['bar', 'analytics', 'Säulen'], ['hbar', 'bars-h', 'Balken'], ['line', 'trend', 'Linie'], ['list', 'list', 'Liste'], ['table', 'table', 'Tabelle'], ['tasks', 'tasks', 'Aufgaben'], ['map', 'map-pin', 'Karte']];
  const TILE_NAME = { chart: 'Diagramm', list: 'Liste', table: 'Tabelle', tasks: 'Aufgaben', map: 'Karte' };
  function newTile(t) {
    if (['bar', 'hbar', 'line'].includes(t)) return { kind: 'chart', chart: sampleChart(t) };
    if (t === 'list') return { kind: 'list', title: '', items: ['Erster Punkt', 'Zweiter Punkt'] };
    if (t === 'table') return { kind: 'table', title: '', rows: [['Spalte 1', 'Spalte 2'], ['', ''], ['', '']] };
    if (t === 'tasks') return { kind: 'tasks', title: '', items: [] };
    return { kind: 'map', title: '', lat: 52.52, lon: 13.405, zoom: 12, markers: [] };
  }
  // ältere Dashboards bestanden nur aus Diagrammen ({ charts: […] })
  function normTile(x) {
    const k = ['chart', 'list', 'table', 'tasks', 'map'].includes(x?.kind) ? x.kind : 'chart';
    if (k === 'chart') return { kind: k, chart: normChart(x?.kind ? x.chart : x) };
    const o = { ...x, kind: k, title: String(x.title || '') };
    if (k === 'list') o.items = (Array.isArray(x.items) ? x.items : []).map((s) => String(s ?? ''));
    if (k === 'tasks') o.items = (Array.isArray(x.items) ? x.items : []).map((s) => (typeof s === 'string' ? { t: s, done: false } : { t: String(s?.t ?? s?.title ?? ''), done: !!s?.done }));
    if (k === 'table') { const rows = (Array.isArray(x.rows) && x.rows.length ? x.rows : [['', '']]).map((r) => (Array.isArray(r) ? r.map((c) => String(c ?? '')) : [])); const w = Math.max(1, ...rows.map((r) => r.length)); o.rows = rows.map((r) => [...r, ...Array(w - r.length).fill('')]); }
    return o;
  }
  const tileTitle = (x) => (x.kind === 'chart' ? x.chart.title : x.title);
  // Inhalt einer Kachel (ohne Werkzeuge); Diagramme bringen ihren Titel selbst mit
  function tileView(x, onChange) {
    if (x.kind === 'chart') return chartView(x.chart, true);
    const box = el('div', `dcb-tile t-${x.kind}`);
    box.innerHTML = `<div class="dcb-ct${x.title ? '' : ' ph'}">${esc(x.title || TILE_NAME[x.kind])}</div>`;
    if (x.kind === 'list') box.append(x.items.length ? el('ul', 'dcb-tl', x.items.map((s) => `<li>${esc(s)}</li>`).join('')) : el('div', 'dcb-none', 'Noch keine Einträge'));
    if (x.kind === 'table') box.append(el('div', 'dcb-tt', `<table><thead><tr>${x.rows[0].map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${x.rows.slice(1).map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`));
    if (x.kind === 'tasks') {
      // Aufgaben direkt in der Kachel abhaken und unten neue eintippen
      const list = el('div', 'dcb-tk');
      const paint = () => {
        const open = x.items.filter((it) => !it.done).length;
        list.innerHTML = (x.items.length ? `<div class="dcb-tk-sum">${open ? `${open} offen` : 'Alles erledigt'} · ${x.items.length - open} erledigt</div>` : '')
          + x.items.map((it, i) => `<div class="dcb-tk-i${it.done ? ' done' : ''}" data-i="${i}"><button type="button" class="dcb-tk-c" aria-label="${it.done ? 'Als offen markieren' : 'Erledigt'}">${fi('check', 10)}</button><span>${esc(it.t)}</span></div>`).join('')
          + `<label class="dcb-tk-new"><span class="dcb-tk-c ghost">${fi('plus', 10)}</span><input class="dcb-tk-in" placeholder="Aufgabe hinzufügen …" maxlength="120" spellcheck="false" /></label>`;
        const inp = list.querySelector('input');
        inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter' && inp.value.trim()) { e.preventDefault(); x.items.push({ t: inp.value.trim(), done: false }); onChange(); paint(); list.querySelector('.dcb-tk-i:last-of-type')?.classList.add('fresh'); list.querySelector('input').focus(); } });
      };
      list.addEventListener('click', (e) => { const r = e.target.closest('.dcb-tk-c'); if (!r) return; const it = x.items[+r.parentElement.dataset.i]; it.done = !it.done; onChange(); paint(); });
      paint();
      box.append(list);
    }
    if (x.kind === 'map') {
      // dieselbe Karte wie der Karten-Block, nur kleiner; deren eigene Werkzeuge braucht die Kachel nicht
      const holder = el('div', 'dcb-tile-map');
      box.append(holder);
      mapBlk(holder, x, { save: () => onChange(), redraw: () => onChange(true), remove: () => {} }); // speichern ohne Neuzeichnen (sonst neue Karte bei jedem Verschieben)
      holder.querySelector(':scope > .dcb-tools')?.remove();
    }
    return box;
  }
  // Einstellungen einer Kachel (Liste, Tabelle, Aufgaben, Karte) – gleicher Aufbau wie das Diagramm-Fenster
  function tileEditor(x, onChange) {
    const body = el('div', 'dcb-ed dcb-ted');
    const done = () => { onChange(); };
    function draw() {
      if (x.kind === 'list' || x.kind === 'tasks') {
        const rows = x.items.map((it, i) => `<tr>${x.kind === 'tasks' ? `<td class="add"><button type="button" class="dcb-tk-c${it.done ? ' on' : ''}" data-tog="${i}" aria-label="Erledigt">${fi('check', 9)}</button></td>` : ''}<td><input data-it="${i}" value="${esc(x.kind === 'tasks' ? it.t : it)}" placeholder="Eintrag" /></td><td class="add"><button type="button" class="dcb-x" data-del="${i}" aria-label="Entfernen" title="Entfernen">${fi('x', 9)}</button></td></tr>`).join('');
        body.innerHTML = `<div class="dcb-sheet"><table class="dcb-tbl"><tbody>${rows}</tbody></table><button type="button" class="dcb-addrow" data-add>${fi('plus', 11)}Eintrag hinzufügen</button></div>`;
      } else if (x.kind === 'table') {
        const w = x.rows[0].length;
        body.innerHTML = `<div class="dcb-sheet"><table class="dcb-tbl"><tbody>${x.rows.map((r, i) => `<tr>${r.map((c, j) => `<td><input data-cell="${i},${j}" value="${esc(c)}" placeholder="${i ? '' : `Spalte ${j + 1}`}"${i ? '' : ' class="hd"'} /></td>`).join('')}<td class="add">${i ? `<button type="button" class="dcb-x" data-rdel="${i}" aria-label="Zeile entfernen" title="Zeile entfernen">${fi('x', 9)}</button>` : `<button type="button" class="dcb-x" data-cadd aria-label="Spalte hinzufügen" title="Spalte hinzufügen">${fi('plus', 11)}</button>`}</td></tr>`).join('')}
          ${w > 1 ? `<tr class="dcb-cdel">${x.rows[0].map((_, j) => `<td><button type="button" class="dcb-x" data-cdel="${j}" aria-label="Spalte entfernen" title="Spalte entfernen">${fi('x', 9)}</button></td>`).join('')}<td></td></tr>` : ''}</tbody></table>
          <button type="button" class="dcb-addrow" data-add>${fi('plus', 11)}Zeile hinzufügen</button></div>`;
      } else if (x.kind === 'map') {
        body.innerHTML = `<button type="button" class="dcb-bgsw" data-lock aria-pressed="${!!x.locked}"><span>Ansicht fixieren</span><i class="ce-switch${x.locked ? ' on' : ''}"><i></i></i></button><p class="dcb-ted-hint">Ort suchen und Markierungen setzen geht direkt in der Karte.</p>`;
      }
      body.insertAdjacentHTML('beforeend', '<div class="dcb-ed-foot"><span class="grow"></span><button type="button" class="tk-create" data-done>Fertig</button></div>');
      body.querySelector('[data-done]').addEventListener('click', () => m.close());
    }
    body.addEventListener('input', (e) => {
      const d = e.target.dataset;
      if (d.it != null) { if (x.kind === 'tasks') x.items[+d.it].t = e.target.value; else x.items[+d.it] = e.target.value; }
      else if (d.cell) { const [i, j] = d.cell.split(',').map(Number); x.rows[i][j] = e.target.value; }
      else return;
      done();
    });
    body.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('[data-it]')) { e.preventDefault(); body.querySelector('[data-add]')?.click(); } });
    body.addEventListener('click', (e) => {
      const t = e.target.closest('button'); if (!t || t.hasAttribute('data-done')) return;
      const d = t.dataset;
      if (d.add != null) { if (x.kind === 'table') x.rows.push(x.rows[0].map(() => '')); else x.items.push(x.kind === 'tasks' ? { t: '', done: false } : ''); }
      else if (d.del != null) x.items.splice(+d.del, 1);
      else if (d.tog != null) x.items[+d.tog].done = !x.items[+d.tog].done;
      else if (d.rdel != null) x.rows.splice(+d.rdel, 1);
      else if (d.cadd != null) x.rows.forEach((r, i) => r.push(i ? '' : `Spalte ${r.length + 1}`));
      else if (d.cdel != null) x.rows.forEach((r) => r.splice(+d.cdel, 1));
      else if (d.lock != null) x.locked = !x.locked;
      else return;
      done(); draw();
      if (d.add != null) { const ins = body.querySelectorAll('[data-it], [data-cell]'); ins[ins.length - (x.kind === 'table' ? x.rows[0].length : 1)]?.focus(); }
    });
    draw();
    const head = el('input', 'dcb-title-in'); head.placeholder = `Titel (${TILE_NAME[x.kind]})`; head.value = x.title;
    head.addEventListener('input', () => { x.title = head.value; done(); });
    head.addEventListener('keydown', (e) => e.stopPropagation());
    const m = modal(TILE_NAME[x.kind], body, { head, onClose: () => onChange(true) });
  }
  function dashboardBlk(b, cfg, api) {
    cfg.items = Array.isArray(cfg.items) ? cfg.items.map(normTile) : (Array.isArray(cfg.charts) ? cfg.charts : []).map((c) => normTile({ kind: 'chart', chart: c }));
    delete cfg.charts;
    const grid = el('div', 'dcb-dash'), add = el('button', 'dcb-dash-add');
    add.type = 'button';
    b.append(grid, add);
    tools(b, api);
    // Spalten nach Anzahl: 1 → ganz, sonst höchstens zwei nebeneinander
    const cols = (n) => (n <= 1 ? 1 : 2);
    function card(x, fresh) {
      const c = el('div', `dcb-card k-${x.kind}${fresh ? ' fresh' : ''}`);
      const paint = () => { const v = tileView(x, (re) => { api.save(cfg); if (re) paint(); }); if (c.firstChild && !c.firstChild.classList.contains('dcb-tset')) c.firstChild.replaceWith(v); else c.prepend(v); };
      paint();
      const i = () => cfg.items.indexOf(x);
      const edit = () => (x.kind === 'chart'
        ? chartEditor(x.chart, (next) => { x.chart = next; api.save(cfg); paint(); })
        : tileEditor(x, (re) => { api.save(cfg); if (re || x.kind !== 'map') paint(); }));
      const drop = () => vanish(c, () => { cfg.items.splice(i(), 1); api.save(cfg); draw(); });
      // Einstellungen oben rechts (beim Darüberfahren); Entfernen über Rechtsklick wie bei allen Blöcken
      const t = el('button', 'dcb-tset', fi('sliders', 13));
      Object.assign(t, { type: 'button', title: 'Einstellungen' }); t.setAttribute('aria-label', 'Einstellungen');
      t.addEventListener('click', (e) => { e.stopPropagation(); edit(); });
      c.append(t);
      c._menu = [{ icon: 'sliders', label: 'Einstellungen', fn: edit }];
      c._drop = { get name() { return tileTitle(x) || TILE_NAME[x.kind]; }, fn: drop }; // erscheint im Rechtsklick-Menü bei „Löschen“
      c._rename = () => editInline(c.querySelector('.dcb-ct'), tileTitle(x), (v, changed) => { if (changed) { if (x.kind === 'chart') x.chart = { ...x.chart, title: v }; else x.title = v; api.save(cfg); } paint(); });
      if (x.kind !== 'map' && x.kind !== 'tasks') c.addEventListener('dblclick', (e) => { if (!e.target.closest('.dcb-inl')) edit(); });
      return c;
    }
    function draw(freshAt = -1) {
      grid.style.setProperty('--cols', cols(cfg.items.length));
      grid.replaceChildren(...cfg.items.map((x, i) => card(x, i === freshAt)));
      grid.hidden = !cfg.items.length;
      add.classList.toggle('empty', !cfg.items.length);
      add.innerHTML = cfg.items.length ? fi('plus', 11) : `${fi('plus', 12)}<span>Kachel hinzufügen</span>`;
      add.title = 'Kachel hinzufügen'; add.setAttribute('aria-label', 'Kachel hinzufügen');
    }
    // Plus: kleines Menü mit den Kachel-Arten direkt darunter
    let pop = null;
    const closePop = () => { pop?.remove(); pop = null; document.removeEventListener('pointerdown', out, true); };
    const out = (e) => { if (pop && !pop.contains(e.target) && !add.contains(e.target)) closePop(); };
    add.addEventListener('mousedown', (e) => e.preventDefault());
    add.addEventListener('click', () => {
      if (pop) { closePop(); return; }
      pop = el('div', 'dcb-tilepop', TILES.map(([id, ic, name]) => `<button type="button" data-t="${id}">${fi(ic, 15)}<span>${name}</span></button>`).join(''));
      document.body.append(pop);
      const r = add.getBoundingClientRect();
      pop.style.left = `${Math.max(8, Math.min(r.left + r.width / 2 - pop.offsetWidth / 2, innerWidth - pop.offsetWidth - 8))}px`;
      pop.style.top = `${r.bottom + 6 + pop.offsetHeight > innerHeight - 8 ? r.top - 6 - pop.offsetHeight : r.bottom + 6}px`;
      pop.addEventListener('click', (e) => { const bt = e.target.closest('[data-t]'); if (!bt) return; closePop(); cfg.items.push(newTile(bt.dataset.t)); api.save(cfg); draw(cfg.items.length - 1); });
      setTimeout(() => document.addEventListener('pointerdown', out, true), 0);
    });
    draw();
  }

  /* ---------- Aufgaben-Board: wie „Tasks“ (Spalten, Karten ziehen, gleiches Fenster),
     aber mit eigenen Aufgaben, die nur in diesem Dokument gespeichert sind ---------- */
  function boardBlk(b, cfg, api) {
    cfg.tasks = (Array.isArray(cfg.tasks) ? cfg.tasks : []).filter((t) => t && typeof t === 'object').map((t, i) => ({ ...t, id: String(t.id || `t${Date.now().toString(36)}${i}`), title: String(t.title || 'Aufgabe'), notes: String(t.notes || ''),
      status: ['backlog', 'doing', 'done'].includes(t.status) ? t.status : t.status === 'review' ? 'doing' : 'backlog', tags: Array.isArray(t.tags) ? t.tags : [], prio: t.prio || 'none', date: /^\d{4}-\d{2}-\d{2}$/.test(t.date || '') ? t.date : '', order: t.order ?? i }));
    if (!window.Tasks?.createBoard) { b.append(el('div', 'dcb-none', 'Aufgaben-Board konnte nicht geladen werden.')); tools(b, api); return; }
    const bd = Tasks.createBoard({ load: () => cfg.tasks, save: (list) => { cfg.tasks = list; api.save(cfg); } }, { title: '', cls: 'tk-embed', cols: ['backlog', 'doing', 'done'] }); // im Dokument ohne „Prüfen“
    bd.view.addEventListener('keydown', (e) => e.stopPropagation()); // Suche & Co. nicht als Dokument-Eingabe werten
    b.append(bd.view);
    tools(b, api);
  }

  /* ---------- Bild ---------- */
  function imageBlk(b, cfg, api) {
    if (!mediaSrc(cfg.src, 'image')) {
      emptyState(b, { icon: 'image', text: 'Bild hochladen, hierher ziehen oder Link einfügen', accept: 'image/*', urlHint: 'Bild-Link einfügen und Enter drücken …',
        onFile: async ([f]) => { cfg.src = await imageData(f); api.save(cfg); api.redraw(); }, onUrl: (u) => { cfg.src = u; api.save(cfg); api.redraw(); } });
      tools(b, api);
      return;
    }
    const fig = el('figure', `dcb-img s-${IMG_SIZES.some(([id]) => id === cfg.size) ? cfg.size : 'full'}`);
    fig.innerHTML = `<img alt="${esc(cfg.caption || '')}" draggable="false" />${cfg.noCap ? '' : `<input class="dcb-cap" placeholder="Bildunterschrift …" value="${esc(cfg.caption || '')}" />`}`;
    fig.querySelector('img').src = cfg.src;
    fig.querySelector('img').addEventListener('click', () => lightbox(cfg.src));
    fig.querySelector('.dcb-cap')?.addEventListener('input', (e) => { cfg.caption = e.target.value; api.save(cfg); });
    b.append(fig);
    // Rechtsklick: Bild bearbeiten (Größe, Unterschrift), mit KI bearbeiten, ggf. rückgängig, ersetzen, löschen
    tools(b, api, [
      { icon: 'sliders', label: 'Bild bearbeiten', fn: () => imageSettings(cfg, api) },
      { icon: 'sparkle', label: 'Mit KI bearbeiten', fn: () => imageAiEdit(fig, cfg, api) },
      ...(cfg.prev ? [{ icon: 'undo', label: 'KI-Änderung rückgängig', fn: () => { cfg.src = cfg.prev; delete cfg.prev; api.save(cfg); api.redraw(); } }] : []),
      { icon: 'image', label: 'Bild ersetzen', fn: () => { delete cfg.src; delete cfg.prev; api.save(cfg); api.redraw(); } },
      { icon: 'trash', label: 'Bild löschen', fn: () => api.remove() },
    ]);
  }
  const IMG_SIZES = [['small', 'Klein'], ['medium', 'Mittel'], ['large', 'Groß'], ['full', 'Volle Breite']];
  function imageSettings(cfg, api) {
    const body = el('div', 'dcb-ed dcb-imged');
    const draw = () => {
      body.innerHTML = `<div class="dcb-sub-l">Größe</div><div class="dcb-kinds">${IMG_SIZES.map(([id, name]) => `<button type="button" data-size="${id}"${(cfg.size || 'full') === id ? ' class="on"' : ''}><span>${name}</span></button>`).join('')}</div>
        <div class="dcb-ed-foot"><button type="button" class="dcb-bgsw" data-cap aria-pressed="${!cfg.noCap}"><span>Bildunterschrift</span><i class="ce-switch${cfg.noCap ? '' : ' on'}"><i></i></i></button><span class="grow"></span><button type="button" class="tk-create" data-done>Fertig</button></div>`;
    };
    body.addEventListener('click', (e) => {
      const s = e.target.closest('[data-size]');
      if (s) { cfg.size = s.dataset.size; api.save(cfg); api.redraw(); draw(); return; }
      if (e.target.closest('[data-cap]')) { cfg.noCap = !cfg.noCap; api.save(cfg); api.redraw(); draw(); return; }
      if (e.target.closest('[data-done]')) m.close();
    });
    draw();
    const m = modal('Bild bearbeiten', body);
  }
  // Mit KI bearbeiten: Wunsch eintippen → /api/image-edit malt das geänderte Bild; das alte bleibt für „rückgängig“
  function imageAiEdit(fig, cfg, api) {
    const body = el('div', 'dcb-ed dcb-imgai');
    body.innerHTML = `<textarea class="dcb-ai-in" rows="3" maxlength="500" placeholder="Was soll sich ändern? z. B. „Hintergrund dunkelgrau“, „Zellkern größer zeigen“"></textarea>
      <div class="dcb-ed-foot"><span class="grow"></span><button type="button" class="tk-create" data-go>Ändern</button></div>`;
    const ta = body.querySelector('textarea');
    const go = async () => {
      const wish = ta.value.trim(); if (!wish) { ta.focus(); return; }
      m.close();
      const wait = el('div', 'dcb-img-busy', '<span class="shimmer">Generating picture</span>');
      fig.append(wait); fig.classList.add('busy');
      try {
        const r = await fetch('/api/image-edit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ src: cfg.src, instruction: wish }) });
        const o = await r.json().catch(() => ({}));
        if (!r.ok || !o.src) throw new Error(o.error || 'Das Bild konnte gerade nicht geändert werden.');
        cfg.prev = cfg.src; cfg.src = o.src; api.save(cfg); api.redraw();
      } catch (err) {
        wait.innerHTML = `<span>${esc(err.message)}</span>`; fig.classList.remove('busy');
        setTimeout(() => wait.remove(), 3500);
      }
    };
    body.querySelector('[data-go]').addEventListener('click', go);
    ta.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); go(); } });
    const m = modal('Mit KI bearbeiten', body);
    setTimeout(() => ta.focus(), 60);
  }
  function lightbox(src) {
    const o = el('div', 'dcb-light'); const img = new Image(); img.src = src; o.append(img);
    const close = () => { o.classList.add('closing'); setTimeout(() => o.remove(), 200); document.removeEventListener('keydown', key); };
    const key = (e) => { if (e.key === 'Escape') close(); };
    o.addEventListener('click', close); document.addEventListener('keydown', key);
    document.body.append(o);
  }

  /* ---------- Video ---------- */
  const ytId = (u) => /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/.exec(u || '')?.[1];
  const vimeoId = (u) => /vimeo\.com\/(?:video\/)?(\d+)/.exec(u || '')?.[1];
  function videoBlk(b, cfg, api) {
    if (!cfg.src) {
      emptyState(b, { icon: 'play', text: 'YouTube- oder Vimeo-Link einfügen oder Video hochladen (bis 20 MB)', accept: 'video/*', urlHint: 'Video-Link einfügen und Enter drücken …',
        onFile: async ([f]) => { if (f.size > 20 * 1024 * 1024) throw new Error('Das Video ist größer als 20 MB – bitte als Link einfügen.'); cfg.src = await readData(f); cfg.name = f.name; api.save(cfg); api.redraw(); },
        onUrl: (u) => { cfg.src = u; api.save(cfg); api.redraw(); } });
      tools(b, api);
      return;
    }
    const box = el('div', 'dcb-video');
    const yt = ytId(cfg.src), vm = vimeoId(cfg.src);
    if (yt || vm) {
      const f = document.createElement('iframe');
      f.src = yt ? `https://www.youtube-nocookie.com/embed/${yt}` : `https://player.vimeo.com/video/${vm}`;
      f.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen';
      f.allowFullscreen = true; f.title = 'Video';
      box.append(f);
    } else if (mediaSrc(cfg.src, 'video')) {
      const v = document.createElement('video'); v.controls = true; v.preload = 'metadata'; v.src = cfg.src; box.append(v);
    } else box.append(el('div', 'dcb-none', 'Dieser Link lässt sich nicht abspielen.'));
    b.append(box);
    tools(b, api, [{ icon: 'play', label: 'Video ersetzen', fn: () => { delete cfg.src; api.save(cfg); api.redraw(); } }]);
  }

  /* ---------- Audio: eigener ruhiger Player ---------- */
  const mmss = (s) => (Number.isFinite(s) ? `${Math.floor(s / 60)}:${pad2(Math.floor(s % 60))}` : '0:00');
  function audioBlk(b, cfg, api) {
    if (!mediaSrc(cfg.src, 'audio')) {
      emptyState(b, { icon: 'music', text: 'Audiodatei hochladen (bis 15 MB) oder Link einfügen', accept: 'audio/*', urlHint: 'Audio-Link einfügen und Enter drücken …',
        onFile: async ([f]) => { if (f.size > 15 * 1024 * 1024) throw new Error('Die Datei ist größer als 15 MB – bitte als Link einfügen.'); cfg.src = await readData(f); cfg.name = f.name.replace(/\.[^.]+$/, ''); api.save(cfg); api.redraw(); },
        onUrl: (u) => { cfg.src = u; cfg.name = decodeURIComponent(u.split('/').pop() || 'Audio').replace(/\.[^.]+$/, ''); api.save(cfg); api.redraw(); } });
      tools(b, api);
      return;
    }
    const box = el('div', 'dcb-audio');
    box.innerHTML = `<button type="button" class="dcb-play" aria-label="Abspielen">${fi('play', 14)}</button>
      <div class="dcb-au-m"><input class="dcb-au-t" value="${esc(cfg.name || 'Audio')}" aria-label="Titel" /><div class="dcb-au-bar"><i></i></div></div><span class="dcb-au-time">0:00</span>`;
    const a = new Audio(); a.preload = 'metadata'; a.src = cfg.src;
    const btn = box.querySelector('.dcb-play'), bar = box.querySelector('.dcb-au-bar'), fill = bar.firstChild, time = box.querySelector('.dcb-au-time');
    const paint = () => { fill.style.width = `${a.duration ? (a.currentTime / a.duration) * 100 : 0}%`; time.textContent = `${mmss(a.currentTime)} / ${mmss(a.duration)}`; };
    a.addEventListener('loadedmetadata', paint); a.addEventListener('timeupdate', paint);
    a.addEventListener('play', () => { btn.innerHTML = fi('pause', 14); box.classList.add('playing'); });
    a.addEventListener('pause', () => { btn.innerHTML = fi('play', 14); box.classList.remove('playing'); });
    btn.addEventListener('click', () => (a.paused ? a.play() : a.pause()));
    bar.addEventListener('pointerdown', (e) => { const r = bar.getBoundingClientRect(); if (a.duration) a.currentTime = ((e.clientX - r.left) / r.width) * a.duration; });
    box.querySelector('.dcb-au-t').addEventListener('input', (e) => { cfg.name = e.target.value; api.save(cfg); });
    b.append(box);
    tools(b, api, [{ icon: 'music', label: 'Audio ersetzen', fn: () => { a.pause(); delete cfg.src; api.save(cfg); api.redraw(); } }]);
  }

  /* ---------- Website als Karte ---------- */
  function webBlk(b, cfg, api) {
    if (!httpUrl(cfg.url)) {
      emptyState(b, { icon: 'globe', text: 'Link zu einer Website einfügen', urlHint: 'https://… einfügen und Enter drücken', onUrl: (u) => { cfg.url = u; cfg.title = new URL(u).hostname.replace(/^www\./, ''); api.save(cfg); api.redraw(); } });
      tools(b, api);
      return;
    }
    const u = new URL(cfg.url), host = u.hostname.replace(/^www\./, '');
    const card = el('div', 'dcb-web');
    card.innerHTML = `<img class="dcb-fav" alt="" src="https://www.google.com/s2/favicons?domain=${encodeURIComponent(u.hostname)}&sz=64" />
      <div class="dcb-web-m"><input class="dcb-web-t" value="${esc(cfg.title || host)}" aria-label="Titel" /><span class="dcb-web-u">${esc(cfg.url)}</span></div>
      <a class="dcb-btn" href="${esc(cfg.url)}" target="_blank" rel="noopener">${fi('link', 12)}Öffnen</a>`;
    card.querySelector('.dcb-fav').addEventListener('error', (e) => { e.target.replaceWith(el('span', 'dcb-fav', fi('globe', 14))); });
    card.querySelector('.dcb-web-t').addEventListener('input', (e) => { cfg.title = e.target.value; api.save(cfg); });
    b.append(card);
    tools(b, api);
  }

  /* ---------- Galerie ---------- */
  function galleryBlk(b, cfg, api) {
    cfg.items = (Array.isArray(cfg.items) ? cfg.items : []).filter((x) => mediaSrc(x?.src, 'image'));
    const grid = el('div', 'dcb-gal');
    b.append(grid);
    tools(b, api);
    const add = async (files) => { for (const f of files.filter((x) => x.type.startsWith('image/')).slice(0, 12)) cfg.items.push({ src: await imageData(f, 1400), title: f.name.replace(/\.[^.]+$/, '') }); api.save(cfg); draw(); };
    function draw() {
      grid.innerHTML = cfg.items.map((x, i) => `<div class="dcb-gi" data-i="${i}"><div class="dcb-gi-img"></div><input class="dcb-gi-t" value="${esc(x.title || '')}" placeholder="Titel" /><button type="button" class="dcb-x" data-del aria-label="Bild entfernen" title="Entfernen">${fi('x', 10)}</button></div>`).join('')
        + `<button type="button" class="dcb-gi dcb-gadd">${fi('plus', 14)}<span>Bilder hinzufügen</span></button>`;
      grid.querySelectorAll('.dcb-gi[data-i]').forEach((g) => { g.querySelector('.dcb-gi-img').style.backgroundImage = `url("${cfg.items[+g.dataset.i].src}")`; });
    }
    grid.addEventListener('click', async (e) => {
      if (e.target.closest('.dcb-gadd')) { add(await pickFiles('image/*', true)); return; }
      const g = e.target.closest('.dcb-gi[data-i]'); if (!g) return;
      if (e.target.closest('[data-del]')) { cfg.items.splice(+g.dataset.i, 1); api.save(cfg); draw(); return; }
      if (e.target.closest('.dcb-gi-img')) lightbox(cfg.items[+g.dataset.i].src);
    });
    grid.addEventListener('input', (e) => { const g = e.target.closest('.dcb-gi[data-i]'); if (g) { cfg.items[+g.dataset.i].title = e.target.value; api.save(cfg); } });
    grid.addEventListener('dragover', (e) => { e.preventDefault(); grid.classList.add('drag'); });
    grid.addEventListener('dragleave', () => grid.classList.remove('drag'));
    grid.addEventListener('drop', (e) => { e.preventDefault(); grid.classList.remove('drag'); add([...e.dataTransfer.files]); });
    draw();
  }

  /* ---------- Kalender: eigener Kalender des Dokuments (oder „Mein Kalender“ der App) ----------
     Termine anlegen/bearbeiten mit demselben Fenster wie im Kalender der App; nur so viele Wochen wie der Monat braucht */
  const normEv = (e, i) => ({ id: String(e?.id || `d${i}${Date.now().toString(36)}`), title: String(e?.title ?? e?.t ?? 'Termin').slice(0, 80), description: String(e?.description || '').slice(0, 400),
    date: /^\d{4}-\d{2}-\d{2}$/.test(e?.date ?? e?.d ?? '') ? (e.date ?? e.d) : isoDay(new Date()), time: /^\d{2}:\d{2}$/.test(e?.time || '') ? e.time : '', end: /^\d{2}:\d{2}$/.test(e?.end || '') ? e.end : '',
    color: /^#[\da-f]{6}$/i.test(e?.color ?? e?.c ?? '') ? (e.color ?? e.c) : COLORS()[i % COLORS().length], icon: String(e?.icon || 'f-calendar') });
  function calendarBlk(b, cfg, api) {
    cfg.events = (Array.isArray(cfg.events) ? cfg.events : []).map(normEv);
    cfg.source = cfg.source === 'main' ? 'main' : 'doc';
    const today = isoDay(new Date());
    let [y, m] = today.slice(0, 7).split('-').map(Number);
    const box = el('div', 'dcb-cal');
    b.append(box);
    tools(b, api);
    const main = () => cfg.source === 'main' && window.Calendar;
    const events = () => (main() ? Calendar.events : cfg.events);
    // eigener Speicherort: die Termine stehen im Dokument
    const store = {
      onSave: (item) => { const i = cfg.events.findIndex((x) => x.id === item.id); if (i >= 0) cfg.events[i] = item; else cfg.events.push(item); api.save(cfg); draw(); },
      onDelete: (id) => { cfg.events = cfg.events.filter((x) => x.id !== id); api.save(cfg); draw(); },
    };
    const editor = (ev, date) => { if (!window.Calendar?.openEditor) return; if (main()) Calendar.openEditor(ev, date); else Calendar.openEditor(ev, date, store); };
    // „Mein Kalender“: bei Änderungen im App-Kalender neu zeichnen
    const onCal = () => { if (!b.isConnected) { window.removeEventListener('calendar-changed', onCal); return; } if (main()) draw(); };
    window.addEventListener('calendar-changed', onCal);
    function draw() {
      const first = new Date(y, m - 1, 1), off = (first.getDay() + 6) % 7, days = new Date(y, m, 0).getDate();
      const weeks = Math.ceil((off + days) / 7), start = new Date(y, m - 1, 1 - off);
      const evs = events();
      let cells = '';
      for (let i = 0; i < weeks * 7; i++) {
        const d = new Date(start); d.setDate(start.getDate() + i);
        const iso = isoDay(d), list = evs.filter((e) => e.date === iso).sort((a, c) => (a.time || '99').localeCompare(c.time || '99'));
        cells += `<div class="dcb-day${d.getMonth() !== m - 1 ? ' out' : ''}${iso === today ? ' today' : ''}" data-d="${iso}"><span class="dcb-dn">${d.getDate()}</span>
          ${list.slice(0, 3).map((e) => `<span class="dcb-ev" data-id="${esc(e.id)}" style="--c:${esc(e.color || ACC)}"><i></i><span>${e.time ? `<em>${esc(e.time)}</em>` : ''}${esc(e.title)}</span></span>`).join('')}
          ${list.length > 3 ? `<span class="dcb-more">+${list.length - 3} weitere</span>` : ''}</div>`;
      }
      box.innerHTML = `<div class="dcb-cal-h"><b>${MONTHS[m - 1]} ${y}</b>${main() ? '<span class="dcb-cal-src">Mein Kalender</span>' : ''}<span class="grow"></span>
          <button type="button" class="dcb-nav" data-nav="-1" aria-label="Voriger Monat" title="Voriger Monat">${fi('chevron-right', 11)}</button>
          <button type="button" class="dcb-btn ghost sm" data-nav="0">Heute</button>
          <button type="button" class="dcb-nav next" data-nav="1" aria-label="Nächster Monat" title="Nächster Monat">${fi('chevron-right', 11)}</button>
          <span class="dcb-cal-sep"></span>
          <button type="button" class="dcb-nav" data-set aria-label="Einstellungen" title="Einstellungen">${fi('sliders', 13)}</button>
          <button type="button" class="dcb-nav" data-add aria-label="Termin erstellen" title="Termin erstellen">${fi('plus', 13)}</button></div>
        <div class="dcb-wd">${['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((w) => `<span>${w}</span>`).join('')}</div><div class="dcb-days">${cells}</div>`;
    }
    // Einstellungen: welcher Kalender wird gezeigt
    let setPop = null;
    const closeSet = () => { setPop?.remove(); setPop = null; document.removeEventListener('pointerdown', outSet, true); };
    const outSet = (e) => { if (setPop && !setPop.contains(e.target) && !e.target.closest?.('[data-set]')) closeSet(); };
    function openSet(btn) {
      if (setPop) { closeSet(); return; }
      setPop = el('div', 'dcb-setpop', `<div class="dcb-co-l">Anzeigen</div>${[['doc', 'Kalender dieses Dokuments'], ['main', 'Mein Kalender']].map(([id, name]) => `<button type="button" data-src="${id}" class="${cfg.source === id ? 'on' : ''}"><span>${name}</span>${fi('check', 12)}</button>`).join('')}`);
      document.body.append(setPop);
      const r = btn.getBoundingClientRect();
      setPop.style.left = `${Math.min(innerWidth - setPop.offsetWidth - 8, r.right - setPop.offsetWidth)}px`; setPop.style.top = `${r.bottom + 6}px`;
      setPop.addEventListener('click', (e) => { const o = e.target.closest('[data-src]'); if (!o) return; cfg.source = o.dataset.src; api.save(cfg); closeSet(); draw(); });
      setTimeout(() => document.addEventListener('pointerdown', outSet, true), 0);
    }
    box.addEventListener('click', (e) => {
      const nav = e.target.closest('[data-nav]');
      if (nav) { const v = +nav.dataset.nav; if (!v) [y, m] = today.slice(0, 7).split('-').map(Number); else { m += v; if (m < 1) { m = 12; y--; } if (m > 12) { m = 1; y++; } } draw(); return; }
      if (e.target.closest('[data-set]')) { openSet(e.target.closest('[data-set]')); return; }
      if (e.target.closest('[data-add]')) { editor(null, today.slice(0, 7) === `${y}-${pad2(m)}` ? today : `${y}-${pad2(m)}-01`); return; }
      const ev = e.target.closest('.dcb-ev');
      if (ev) { editor(events().find((x) => x.id === ev.dataset.id), null); return; }
      const day = e.target.closest('.dcb-day');
      if (day) editor(null, day.dataset.d);
    });
    draw();
  }

  /* ---------- Zeit: Countdown, Zeitraum oder „seit“ ---------- */
  const MODES = [['countdown', 'timer', 'Countdown'], ['range', 'calendar', 'Zeitraum'], ['since', 'clock', 'Seit']];
  function timeBlk(b, cfg, api) {
    const box = el('div', 'dcb-time');
    b.append(box);
    let prevBox = null;
    tools(b, api, [{ icon: 'sliders', label: 'Zeit bearbeiten', fn: settings },
      { icon: 'eye', label: 'Titel anzeigen', toggle: true, toggleLabel: 'Titel anzeigen', get on() { return !cfg.hideTitle; }, fn: () => { cfg.hideTitle = !cfg.hideTitle; api.save(cfg); paint(); } }]);
    box.addEventListener('dblclick', (e) => { if (!e.target.closest('.dcb-inl')) settings(); });
    const parts = (ms) => { ms = Math.max(0, ms); return [[Math.floor(ms / 864e5), 'Tage'], [Math.floor(ms / 36e5) % 24, 'Std.'], [Math.floor(ms / 6e4) % 60, 'Min.'], [Math.floor(ms / 1e3) % 60, 'Sek.']]; };
    const fmt = (s) => { const d = new Date(s); return Number.isNaN(+d) ? '–' : d.toLocaleString('de-DE', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }); };
    /* Klein in einer Zeile: (Icon) Titel · Zahlen mit Doppelpunkten, darunter winzig TAGE / STD / MIN / SEK.
       Ändert sich eine Ziffer, rollt nur diese: die alte gleitet nach oben weg, die neue kommt von unten.
       Zieldatum steht im Tooltip; Titel lässt sich ausblenden (cfg.hideTitle) */
    const short = (t) => new Date(t).toLocaleString('de-DE', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const last = new WeakMap(); // je Anzeige die zuletzt gezeigten Zahlen → nur geänderte Ziffern rollen
    function render(target) {
      const now = Date.now(), start = +new Date(cfg.start), end = +new Date(cfg.end), mode = cfg.mode || 'countdown';
      const title = cfg.title || { countdown: 'Countdown', range: 'Zeitraum', since: 'Seit' }[mode];
      const prev = last.get(target) || {}, next = {};
      const digits = (k, v) => { next[k] = v = String(v); const o = prev[k];
        return [...v].map((c, j) => (o && o.length === v.length && o[j] !== c ? `<span class="dg roll"><i class="o">${o[j]}</i><i>${c}</i></span>` : `<span class="dg"><i>${c}</i></span>`)).join(''); };
      // Uhr ganz ohne Beschriftung: Tage (nur wenn nötig) als erste Stelle, dann hh:mm:ss – z. B. 12:04:33:09
      const clock = (ms) => {
        const [[d], [h], [m], [sec]] = parts(ms), col = '<span class="dcb-tm-col">:</span>';
        return `<span class="dcb-tm-seg">${d ? `<b>${digits('d', d)}</b>${col}` : ''}<b>${digits('h', pad2(h))}</b>${col}<b>${digits('m', pad2(m))}</b>${col}<b>${digits('s', pad2(sec))}</b></span>`;
      };
      const note = (t) => `<span class="dcb-tm-note">${t}</span>`;
      let big = '';
      if (mode === 'range') {
        // Zeitraum: vor dem Anfang „beginnt in“, währenddessen „noch“ bis zum Ende, danach „abgeschlossen“
        target.title = `${short(start)} – ${short(end)}`;
        if (Number.isNaN(start) || Number.isNaN(end)) big = note('Noch kein Datum');
        else if (now < start) big = note('beginnt in') + clock(start - now);
        else if (now < end) big = note('noch') + clock(end - now);
        else big = `<span class="dcb-tm-done">${fi('check', 13)}Abgeschlossen</span>`;
      } else {
        const since = mode === 'since', at = since ? start : end, ms = since ? now - at : at - now;
        target.title = Number.isNaN(at) ? '' : `${since ? 'seit' : 'bis'} ${short(at)}`;
        if (Number.isNaN(at)) big = note('Noch kein Datum');
        else if (!since && ms <= 0) big = `<span class="dcb-tm-done">${fi('check', 13)}Abgelaufen</span>`;
        else big = clock(ms);
      }
      last.set(target, next);
      const ic = iconHtml(cfg.icon, null, 15);
      target.className = `dcb-time m-${mode}`;
      target.innerHTML = `${ic ? `<span class="dcb-tm-ic">${ic}</span>` : ''}${cfg.hideTitle ? '' : `<span class="dcb-tm-t">${esc(title)}</span>`}<span class="dcb-tm-big">${big}</span>`;
    }
    let naming = false; // solange der Titel bearbeitet wird, nicht neu zeichnen
    const paint = () => { if (!naming) render(box); if (prevBox?.isConnected) render(prevBox); };
    // Umbenennen: Feld startet leer und bleibt so breit wie der Titel (nichts springt)
    b._rename = (after) => { naming = true; editInline(box.querySelector('.dcb-tm-t'), cfg.title, (v, changed, key) => { naming = false; if (changed) { cfg.title = v; api.save(cfg); } paint(); if (key) after?.(); }, { empty: true }); };
    function settings() {
      const body = el('div', 'dcb-ed dcb-ced dcb-tmed');
      body.innerHTML = `<div class="dcb-ed-prev"><div class="dcb-time"></div></div>
        <div class="dcb-kinds">${MODES.map(([id, ic, name]) => `<button type="button" data-m="${id}"${cfg.mode === id ? ' class="on"' : ''}>${fi(ic, 16)}<span>${name}</span></button>`).join('')}</div>
        <div class="dcb-dates"></div>
        <div class="dcb-ed-foot"><button type="button" class="dcb-bgsw" data-showtitle aria-pressed="${!cfg.hideTitle}"><span>Titel anzeigen</span><i class="ce-switch${cfg.hideTitle ? '' : ' on'}"><i></i></i></button><span class="grow"></span><button type="button" class="tk-create" data-done>Fertig</button></div>`;
      prevBox = body.querySelector('.dcb-ed-prev .dcb-time');
      const dates = body.querySelector('.dcb-dates');
      // Datum und Uhrzeit wie bei Kalender und Aufgaben: Pillen, darunter kleiner Kalender bzw. Uhrzeit-Rad
      const WDS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
      const dayOf = (f) => (/^\d{4}-\d{2}-\d{2}/.exec(cfg[f] || '') || [isoDay(new Date())])[0];
      const timeOf = (f) => (/T(\d{2}:\d{2})/.exec(cfg[f] || '') || [0, '09:00'])[1];
      const set = (f, day, time) => { cfg[f] = `${day}T${time}`; api.save(cfg); paint(); label(); };
      const label = () => dates.querySelectorAll('[data-fd]').forEach((p) => {
        const f = p.dataset.fd, d = new Date(`${dayOf(f)}T12:00:00`);
        p.querySelector('[data-open$="-d"]').innerHTML = `${fi('calendar', 13)}${WDS[d.getDay()]}, ${d.getDate()}. ${MONTHS[d.getMonth()].slice(0, 3)}. ${d.getFullYear()}`;
        p.querySelector('[data-open$="-t"]').innerHTML = `${fi('clock', 13)}${timeOf(f)}`;
      });
      const pill = (k, menu, cls) => `<div class="tk-pop" data-k="${k}"><button type="button" class="tk-pill" data-open="${k}"></button><div class="tk-menu ${cls}">${menu}</div></div>`;
      let cals = {}, wheels = {};
      const drawDates = () => {
        const fields = [...(cfg.mode !== 'countdown' ? [['start', 'Anfang']] : []), ...(cfg.mode !== 'since' ? [['end', cfg.mode === 'countdown' ? 'Bis' : 'Ende']] : [])];
        dates.innerHTML = fields.map(([f, name]) => `<div class="dcb-tm-f" data-fd="${f}"><span class="dcb-tm-fl">${name}</span><div class="tk-pills">${pill(`${f}-d`, '<div class="tk-cal"></div>', 'date')}${pill(`${f}-t`, '<div data-wheel></div>', 'time')}</div></div>`).join('');
        dates.classList.toggle('one', fields.length < 2);
        cals = {}; wheels = {};
        fields.forEach(([f]) => {
          const p = dates.querySelector(`[data-fd="${f}"]`);
          cals[f] = UIKit.miniCalendar(p.querySelector('.tk-cal'), () => dayOf(f), (iso) => { set(f, iso, timeOf(f)); setTimeout(() => p.querySelector('.tk-pop.open')?.classList.remove('open'), 140); });
          wheels[f] = UIKit.timeWheel(timeOf(f), (v) => set(f, dayOf(f), v));
          p.querySelector('[data-wheel]').append(wheels[f]);
        });
        label();
      };
      body.addEventListener('click', (e) => {
        const op = e.target.closest('[data-open]');
        if (op) {
          const pop = op.parentElement, open = !pop.classList.contains('open');
          body.querySelectorAll('.tk-pop.open').forEach((x) => x.classList.remove('open'));
          if (open) { pop.classList.add('open'); const [f, kind] = op.dataset.open.split('-'); if (kind === 'd') cals[f]?.open(); else requestAnimationFrame(() => wheels[f]?.setValue(timeOf(f))); }
          return;
        }
        if (!e.target.closest('.tk-menu')) body.querySelectorAll('.tk-pop.open').forEach((x) => x.classList.remove('open'));
        const st = e.target.closest('[data-showtitle]');
        if (st) { cfg.hideTitle = !cfg.hideTitle; st.querySelector('.ce-switch').classList.toggle('on', !cfg.hideTitle); st.setAttribute('aria-pressed', String(!cfg.hideTitle)); api.save(cfg); paint(); return; }
        const mb = e.target.closest('[data-m]'); if (!mb) return;
        cfg.mode = mb.dataset.m; body.querySelectorAll('.dcb-kinds button').forEach((x) => x.classList.toggle('on', x === mb));
        api.save(cfg); drawDates(); paint();
      });
      drawDates(); paint();
      const head = el('input', 'dcb-title-in'); head.placeholder = 'Titel, z. B. Prüfung Biologie'; head.value = cfg.title || '';
      head.addEventListener('input', () => { cfg.title = head.value; api.save(cfg); paint(); });
      head.addEventListener('keydown', (e) => e.stopPropagation());
      const m = modal('Zeit', body, { wide: true, head });
      body.querySelector('[data-done]').addEventListener('click', m.close);
    }
    paint();
    const t = setInterval(() => { if (!b.isConnected) { clearInterval(t); return; } paint(); }, 1000);
  }

  /* ---------- Karte: eigene Vektorkarte (MapLibre + OpenFreeMap, ohne API-Schlüssel), nur Grautöne:
     dunkelgrauer Grund, abgestufte graue Straßen, dunkles Wasser, Beschriftung in Fira Sans ---------- */
  let mapLibP = null;
  function mapLib() {
    if (window.maplibregl) return Promise.resolve(window.maplibregl);
    mapLibP ||= new Promise((res, rej) => {
      const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'https://cdnjs.cloudflare.com/ajax/libs/maplibre-gl/4.7.1/maplibre-gl.min.css';
      const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/maplibre-gl/4.7.1/maplibre-gl.min.js';
      s.onload = () => res(window.maplibregl); s.onerror = () => { mapLibP = null; rej(new Error('Karte konnte nicht geladen werden (keine Verbindung?)')); };
      document.head.append(css, s);
    });
    return mapLibP;
  }
  // Farben: schwarzer Grund, Straßen in abgestuften Grautönen (Hauptstraßen heller und breiter),
  // Wasser ganz schwarz, Parks/Bebauung eine Spur heller – keine Farbakzente
  const MAP_C = { land: '#050505', block: '#0b0b0b', park: '#101010', water: '#000000', minor: '#262626', mid: '#333333', major: '#454545', path: '#1c1c1c', rail: '#202020', text: '#8c8c8c', textSoft: '#666666' };
  const nameDe = ['coalesce', ['get', 'name:de'], ['get', 'name']];
  const MAP_FONT = ['fira_sans_medium'], MAP_FONT_R = ['fira_sans_regular'];
  const ROAD = (cls) => ['in', ['get', 'class'], ['literal', cls]];
  const MAJOR = ['motorway', 'trunk', 'primary'], MID = ['secondary', 'tertiary'], MINOR = ['minor', 'service', 'track'];
  const W = (z) => ['interpolate', ['exponential', 1.5], ['zoom'], ...z]; // Breite weich mit dem Zoom
  const roadLayer = (id, cls, color, widths, extra = {}) => ({ id, type: 'line', source: 'omt', 'source-layer': 'transportation', ...extra,
    filter: ['all', ROAD(cls), ['!=', ['get', 'brunnel'], 'tunnel']], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': color, 'line-width': W(widths) } });
  const MAP_STYLE = {
    version: 8,
    sources: { omt: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' } },
    glyphs: 'https://tiles.versatiles.org/assets/glyphs/{fontstack}/{range}.pbf', // Fira Sans: klare, moderne Schrift
    layers: [
      { id: 'land', type: 'background', paint: { 'background-color': MAP_C.land } },
      { id: 'blocks', type: 'fill', source: 'omt', 'source-layer': 'landuse', filter: ROAD(['residential', 'commercial', 'industrial', 'retail']), paint: { 'fill-color': MAP_C.block } },
      { id: 'park', type: 'fill', source: 'omt', 'source-layer': 'park', paint: { 'fill-color': MAP_C.park } },
      { id: 'green', type: 'fill', source: 'omt', 'source-layer': 'landcover', filter: ROAD(['grass', 'wood']), paint: { 'fill-color': MAP_C.park } },
      { id: 'water', type: 'fill', source: 'omt', 'source-layer': 'water', paint: { 'fill-color': MAP_C.water } },
      { id: 'waterway', type: 'line', source: 'omt', 'source-layer': 'waterway', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': MAP_C.water, 'line-width': W([10, 0.8, 14, 2, 18, 8]) } },
      { id: 'rail', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 13, filter: ['all', ROAD(['rail', 'transit']), ['!=', ['get', 'brunnel'], 'tunnel']], paint: { 'line-color': MAP_C.rail, 'line-width': W([13, 0.6, 18, 2]) } },
      roadLayer('paths', ['path'], MAP_C.path, [14, 0.5, 18, 1.8], { minzoom: 14 }),
      roadLayer('roads-minor', MINOR, MAP_C.minor, [12, 0.4, 14, 1.4, 16, 4, 18, 12], { minzoom: 12 }),
      roadLayer('roads-mid', MID, MAP_C.mid, [10, 0.6, 14, 2.6, 16, 6, 18, 18]),
      roadLayer('roads-major', MAJOR, MAP_C.major, [8, 0.8, 12, 2, 14, 4, 16, 9, 18, 26]),
      { id: 'water-name', type: 'symbol', source: 'omt', 'source-layer': 'water_name', minzoom: 12, filter: ['==', ['geometry-type'], 'Point'],
        layout: { 'text-field': nameDe, 'text-font': MAP_FONT_R, 'text-size': 11.5, 'text-letter-spacing': 0.03, 'text-max-width': 8 }, paint: { 'text-color': MAP_C.textSoft } },
      { id: 'road-name', type: 'symbol', source: 'omt', 'source-layer': 'transportation_name', minzoom: 15, filter: ROAD([...MAJOR, ...MID]),
        layout: { 'symbol-placement': 'line', 'text-field': nameDe, 'text-font': MAP_FONT_R, 'text-size': 10.5, 'text-letter-spacing': 0.04, 'symbol-spacing': 320 },
        paint: { 'text-color': MAP_C.textSoft, 'text-halo-color': MAP_C.land, 'text-halo-width': 1.2 } },
      { id: 'place', type: 'symbol', source: 'omt', 'source-layer': 'place', filter: ROAD(['city', 'town', 'suburb', 'quarter']),
        layout: { 'text-field': nameDe, 'text-font': MAP_FONT, 'text-size': ['match', ['get', 'class'], 'city', 14, 'town', 13, 11.5], 'text-letter-spacing': 0.04, 'text-max-width': 8 },
        paint: { 'text-color': MAP_C.text, 'text-halo-color': MAP_C.land, 'text-halo-width': 1.2 } },
    ],
  };
  const MK_COLORS = ['#f2f2f2', '#6aa8ff', '#4fcf8a', '#f0913a', '#f07a6e', '#b49cff', '#facc15', '#2dd4bf'];
  // Zoomstufe wird wie früher (Leaflet, 256er-Kacheln) gespeichert; MapLibre zählt eine Stufe weniger
  const toML = (z) => (z ?? 13) - 1, fromML = (z) => +(z + 1).toFixed(2);
  /* Markierungen: Namensschild oben, darunter eine feine Linie zum Ring, der genau auf dem Ort sitzt.
     Fest (nicht verschiebbar); Klick öffnet Name, Farbe und „Entfernen“, Rechtsklick ebenso. */
  function mapBlk(b, cfg, api) {
    cfg.markers = (Array.isArray(cfg.markers) ? cfg.markers : []).filter((m) => Number.isFinite(+m?.lat) && Number.isFinite(+m?.lon));
    cfg.markers.forEach((m, i) => { m.id ||= `m${i}${Date.now().toString(36)}`; });
    const box = el('div', `dcb-map${cfg.locked ? ' locked' : ''}`);
    box.innerHTML = `<div class="dcb-map-c"></div>
      <form class="dcb-map-q"${cfg.locked ? ' hidden' : ''}>${fi('search', 14)}<input placeholder="Ort oder Adresse suchen" value="${esc(cfg.q || '')}" spellcheck="false" autocomplete="off" aria-label="Ort oder Adresse suchen" /></form>
      <div class="dcb-map-sug" role="listbox" hidden></div>
      <div class="dcb-map-z"${cfg.locked ? ' hidden' : ''}><button type="button" data-z="-1" aria-label="Verkleinern" title="Verkleinern">${fi('minus', 12)}</button><button type="button" data-z="1" aria-label="Vergrößern" title="Vergrößern">${fi('plus', 12)}</button></div>
      <div class="dcb-map-src"><button type="button" aria-label="Kartenquellen">${fi('info', 12)}</button><span>© <a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> · © <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> · Daten © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a></span></div>`;
    b.append(box);
    const lock = () => { cfg.locked = !cfg.locked; api.save(cfg); api.redraw(); };
    const route = () => { cfg.route = !cfg.route; api.save(cfg); api.redraw(); };
    const extra = [{ icon: 'lock', label: 'Ansicht fixieren', fn: lock, toggle: true, toggleLabel: 'Ansicht fixieren', on: !!cfg.locked }];
    if (cfg.markers.length > 1) extra.push({ icon: 'trend', label: 'Markierungen verbinden', fn: route, toggle: true, toggleLabel: 'Markierungen verbinden', on: !!cfg.route });
    tools(b, api, extra);
    const host = box.querySelector('.dcb-map-c'), form = box.querySelector('form'), inp = form.querySelector('input');
    inp.addEventListener('keydown', (e) => e.stopPropagation());
    const src = box.querySelector('.dcb-map-src');
    src.querySelector('button').addEventListener('click', () => src.classList.toggle('open'));
    mapLib().then((ML) => {
      if (!host.isConnected) return;
      const free = !cfg.locked;
      let map;
      try {
        map = new ML.Map({ container: host, style: MAP_STYLE, center: [cfg.lon ?? 13.405, cfg.lat ?? 52.52], zoom: toML(cfg.zoom), attributionControl: false,
          interactive: free, dragRotate: false, pitchWithRotate: false, touchPitch: false, scrollZoom: false, boxZoom: false, keyboard: false, maxZoom: 19 });
      } catch { host.innerHTML = '<div class="dcb-none">Karte braucht WebGL – im Browser nicht verfügbar.</div>'; return; }
      map.touchZoomRotate?.disableRotation();
      b._map = map;
      box.querySelector('.dcb-map-z').addEventListener('click', (e) => { const z = e.target.closest('[data-z]'); if (z) map.easeTo({ zoom: map.getZoom() + +z.dataset.z, duration: 260 }); });
      // Route: helle graue Linie (Karte bleibt schwarz-grau)
      const lineData = () => ({ type: 'Feature', geometry: { type: 'LineString', coordinates: cfg.markers.map((m) => [m.lon, m.lat]) } });
      map.on('load', () => {
        if (cfg.route && cfg.markers.length > 1) {
          map.addSource('route', { type: 'geojson', data: lineData() });
          map.addLayer({ id: 'route', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#d9d9d9', 'line-width': 3 } });
        }
      });
      const pins = new Map();
      function pinEl(m) {
        const e = el('div', `dcb-mpin${m.label ? '' : ' bare'}`);
        e.dataset.id = m.id; e.style.setProperty('--m', m.c || MK_COLORS[0]);
        e.innerHTML = `${m.label ? `<span class="dcb-mpin-l">${esc(m.label)}</span>` : ''}<span class="dcb-mpin-o"></span>`;
        e.addEventListener('click', (ev) => { ev.stopPropagation(); editMarker(m); });
        return e;
      }
      function drawMarkers() {
        pins.forEach((p) => p.remove()); pins.clear();
        cfg.markers.forEach((m) => pins.set(m.id, new ML.Marker({ element: pinEl(m), anchor: 'bottom', offset: [0, m.label ? 4 : 5] }).setLngLat([m.lon, m.lat]).addTo(map)));
        map.getSource('route')?.setData(lineData());
      }
      // kleines Menü an der Markierung: Name, Farbe, Entfernen
      function editMarker(m) {
        document.querySelector('.dcb-mkpop')?.remove();
        const pin = pins.get(m.id)?.getElement(); if (!pin) return;
        const pop = el('div', 'dcb-mkpop', `<div class="dcb-sub-l">Name</div><input value="${esc(m.label || '')}" placeholder="z. B. Treffpunkt" maxlength="60" spellcheck="false" />
          <div class="dcb-cx-sep"></div><div class="dcb-sub-l">Farbe</div>
          <div class="dcb-mk-cols">${MK_COLORS.map((c) => `<button type="button" data-c="${c}" style="--c:${c}" class="${(m.c || MK_COLORS[0]) === c ? 'on' : ''}" aria-label="Farbe"></button>`).join('')}</div>
          <div class="dcb-cx-sep"></div><button type="button" class="dcb-cx danger" data-del>${fi('trash', 16)}<span>Markierung entfernen</span></button>`);
        document.body.append(pop);
        const r = pin.getBoundingClientRect();
        pop.style.left = `${Math.max(8, Math.min(r.right + 10, innerWidth - pop.offsetWidth - 8))}px`;
        pop.style.top = `${Math.max(8, Math.min(r.top, innerHeight - pop.offsetHeight - 8))}px`;
        const name = pop.querySelector('input'); name.focus();
        const close = () => { pop.remove(); document.removeEventListener('pointerdown', out, true); };
        const out = (e) => { if (!pop.contains(e.target)) close(); };
        setTimeout(() => document.addEventListener('pointerdown', out, true), 0);
        name.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter' || e.key === 'Escape') close(); });
        name.addEventListener('input', () => { m.label = name.value.trim(); api.save(cfg); drawMarkers(); });
        pop.addEventListener('click', (e) => {
          const c = e.target.closest('[data-c]');
          if (c) { m.c = c.dataset.c; pop.querySelectorAll('[data-c]').forEach((x) => x.classList.toggle('on', x === c)); api.save(cfg); drawMarkers(); return; }
          if (e.target.closest('[data-del]')) { close(); removeMarker(m.id); }
        });
      }
      function removeMarker(id) {
        const had = cfg.markers.length;
        cfg.markers = cfg.markers.filter((x) => x.id !== id); api.save(cfg);
        if (had > 1 && cfg.markers.length < 2 && cfg.route) api.redraw(); else drawMarkers();
      }
      // für das Rechtsklick-Menü: Markierung setzen, bearbeiten, entfernen
      b._addMarker = (ev) => {
        const r = host.getBoundingClientRect(), p = map.unproject([ev.clientX - r.left, ev.clientY - r.top]);
        const m = { id: `m${Date.now().toString(36)}`, lat: +p.lat.toFixed(5), lon: +p.lng.toFixed(5), c: MK_COLORS[cfg.markers.length % MK_COLORS.length], label: '' };
        cfg.markers.push(m); api.save(cfg);
        if (cfg.markers.length === 2) api.redraw(); // „Markierungen verbinden“ erscheint im Menü
        else { drawMarkers(); editMarker(m); } // gleich benennen
      };
      b._pin = (id, what) => { const m = cfg.markers.find((x) => x.id === id); if (!m) return; if (what === 'del') removeMarker(id); else editMarker(m); };
      drawMarkers();
      if (free) { host.addEventListener('click', () => map.scrollZoom.enable()); host.addEventListener('mouseleave', () => map.scrollZoom.disable()); }
      let st = 0;
      map.on('moveend', () => { if (cfg.locked) return; clearTimeout(st); st = setTimeout(() => { const c = map.getCenter(); cfg.lat = +c.lat.toFixed(5); cfg.lon = +c.lng.toFixed(5); cfg.zoom = fromML(map.getZoom()); api.save(cfg); }, 500); });
      new ResizeObserver(() => map.resize()).observe(host);
      // Ort anfliegen und als Markierung setzen (die erste bleibt „der Ort“)
      function goTo({ lat, lon, name, full }, q) {
        lat = +(+lat).toFixed(5); lon = +(+lon).toFixed(5);
        inp.value = name; // im Feld steht danach der gewählte Ort
        Object.assign(cfg, { q: name || q, label: full || name, lat, lon, zoom: 15 });
        const first = cfg.markers.find((x) => x.place);
        if (first) Object.assign(first, { lat, lon, label: name }); else cfg.markers.unshift({ id: `m${Date.now().toString(36)}`, lat, lon, c: MK_COLORS[0], label: name, place: true });
        api.save(cfg);
        map.flyTo({ center: [lon, lat], zoom: toML(15), duration: 1100 });
        drawMarkers();
        hideSug(); inp.blur();
      }
      const sug = box.querySelector('.dcb-map-sug');
      let hits = [], act = -1, sugT = 0, sugN = 0;
      const hideSug = () => { sug.hidden = true; hits = []; act = -1; };
      const paintSug = () => {
        sug.innerHTML = hits.map((h, i) => `<button type="button" role="option" data-i="${i}" class="${i === act ? 'on' : ''}">${fi('map-pin', 14)}<span><b>${esc(h.name)}</b>${h.sub ? `<em>${esc(h.sub)}</em>` : ''}</span></button>`).join('');
        sug.hidden = !hits.length;
      };
      async function suggest(q) {
        const n = ++sugN, c = map.getCenter();
        try {
          const r = await fetch(`https://photon.komoot.io/api/?limit=5&lang=de&lat=${c.lat.toFixed(3)}&lon=${c.lng.toFixed(3)}&q=${encodeURIComponent(q)}`);
          const j = await r.json();
          if (n !== sugN || document.activeElement !== inp) return;
          hits = (j.features || []).map((f) => {
            const p = f.properties || {}, [lon, lat] = f.geometry?.coordinates || [];
            const name = p.name || [p.street, p.housenumber].filter(Boolean).join(' ') || p.city || q;
            const sub = [p.name && p.street ? [p.street, p.housenumber].filter(Boolean).join(' ') : '', p.city || p.county, p.country].filter((x) => x && x !== name).join(', ');
            return { lat, lon, name, sub, full: [name, sub].filter(Boolean).join(', ') };
          }).filter((h, i, all) => Number.isFinite(h.lat) && Number.isFinite(h.lon) && all.findIndex((x) => x.full === h.full) === i); // gleiche Namen nur einmal
          act = hits.length ? 0 : -1; paintSug();
        } catch { hideSug(); }
      }
      inp.addEventListener('input', () => { clearTimeout(sugT); const q = inp.value.trim(); if (q.length < 2) { sugN++; hideSug(); return; } sugT = setTimeout(() => suggest(q), 220); });
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { if (!hits.length) return; e.preventDefault(); act = (act + (e.key === 'ArrowDown' ? 1 : -1) + hits.length) % hits.length; paintSug(); }
        else if (e.key === 'Escape') { hideSug(); inp.blur(); }
      });
      inp.addEventListener('blur', () => setTimeout(hideSug, 150));
      sug.addEventListener('pointerdown', (e) => e.preventDefault()); // Fokus bleibt im Feld, bis gewählt ist
      sug.addEventListener('click', (e) => { const bt = e.target.closest('[data-i]'); if (bt) goTo(hits[+bt.dataset.i], inp.value.trim()); });
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const q = inp.value.trim(); if (!q) return;
        if (hits[act]) { goTo(hits[act], q); return; }
        form.classList.add('busy');
        try {
          const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&accept-language=de&q=${encodeURIComponent(q)}`);
          const [hit] = await r.json();
          if (!hit) { form.classList.add('miss'); setTimeout(() => form.classList.remove('miss'), 1200); return; }
          goTo({ lat: hit.lat, lon: hit.lon, name: (hit.name || hit.display_name.split(',')[0] || q).trim(), full: hit.display_name.split(',').slice(0, 3).join(',').trim() }, q);
        } catch { form.classList.add('miss'); setTimeout(() => form.classList.remove('miss'), 1200); } finally { form.classList.remove('busy'); }
      });
    }).catch((err) => { host.innerHTML = `<div class="dcb-none">${esc(err.message)}</div>`; });
  }

  const KIND = { chart: 'Diagramm', dashboard: 'Dashboard', board: 'Aufgaben', calendar: 'Kalender', map: 'Karte', gallery: 'Galerie', time: 'Zeit', image: 'Bild', video: 'Video', audio: 'Audio', web: 'Website' };
  const HEAD_TYPES = ['chart', 'dashboard', 'board', 'calendar', 'map', 'gallery']; // diese Blöcke zeigen oben ihren Namen (Icon nur, wenn gewählt)
  const PH_TYPES = ['chart', 'dashboard']; // ohne Namen: grauer Platzhalter statt eines Standardnamens
  const nameKey = (type) => ({ chart: 'title', time: 'title', image: 'caption', audio: 'name', web: 'title' }[type] || 'name');
  // Icon-Wert: „d:name“ = Dokument-Icon; ohne gewähltes Icon nur das Ersatz-Icon (falls angegeben), sonst keins
  const iconHtml = (ic, fallback, size = 15) => (typeof ic === 'string' && ic.startsWith('d:') && window.DocIcons?.has(ic.slice(2)) ? DocIcons.svg(ic.slice(2), size) : fallback ? fi(fallback, size) : '');
  function blockInfo(b) { const type = b.dataset.blk, cfg = b._cfg || {}, named = HEAD_TYPES.includes(type) || type === 'time'; return { kind: KIND[type] || 'Block', name: cfg[nameKey(type)] || KIND[type] || 'Block', icon: named, named, hasIcon: !!iconHtml(cfg.icon) }; }
  function tableInfo(w) { const t = w.querySelector('table'); return { kind: 'Tabelle', name: t?.dataset.name || 'Tabelle', icon: true, named: true, hasIcon: !!iconHtml(t?.dataset.icon) }; }
  const headFor = (name, icon) => { const h = el('div', 'dcb-head', `${icon ? `<span class="dcb-head-ic">${icon}</span>` : ''}<span class="dcb-head-t${name ? '' : ' ph'}">${esc(name || PH)}</span>`); h.contentEditable = 'false'; return h; };
  const blockHead = (b) => { const type = b.dataset.blk, cfg = b._cfg || {}; return headFor(cfg[nameKey(type)] || (PH_TYPES.includes(type) ? '' : KIND[type]), iconHtml(cfg.icon)); };
  function paintHead(b) { b.querySelector(':scope > .dcb-head')?.replaceWith(blockHead(b)); }
  // Tabelle: Kopfzeile nur, wenn sie einen Namen oder ein Icon hat (oder gerade benannt wird)
  function tableHead(w, force = false) {
    w.querySelector(':scope > .dcb-head')?.remove();
    const t = w.querySelector('table'); if (!t || !(force || t.dataset.name || t.dataset.icon)) return;
    w.prepend(headFor(t.dataset.name || '', iconHtml(t.dataset.icon)));
  }
  // Namen direkt an Ort und Stelle bearbeiten: ein Textfeld im selben Stil ersetzt kurz die Beschriftung
  // done(wert, geändert, perTaste) – Enter/Wegklicken speichert, Esc verwirft
  // opts.empty: Feld startet leer (alter Name als Platzhalter; leer lassen = alter Name bleibt), feste Breite wie die Beschriftung
  function editInline(span, value, done, opts = {}) {
    if (!span || span._inl) return;
    value = value || '';
    const inp = el('input', `dcb-inl ${span.className.replace(/\bph\b/, '')}`);
    Object.assign(inp, { value: opts.empty ? '' : value, placeholder: opts.empty ? (span.textContent.trim() || PH) : PH, maxLength: 80, spellcheck: false });
    if (opts.empty) inp.style.width = `${Math.max(90, Math.ceil(span.getBoundingClientRect().width) + 4)}px`;
    span._inl = true; span.hidden = true; span.after(inp);
    inp.focus(); inp.select();
    let over = false;
    const finish = (save, key) => {
      if (over) return; over = true;
      const v = save ? (inp.value.trim().slice(0, 80) || (opts.empty ? value : '')) : value;
      inp.remove(); span.hidden = false; span._inl = false;
      done(v, v !== value, key);
    };
    inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); finish(true, true); } else if (e.key === 'Escape') { e.preventDefault(); finish(false, true); } });
    inp.addEventListener('blur', () => finish(true, false));
    ['mousedown', 'click', 'dblclick', 'input', 'beforeinput', 'paste', 'keyup'].forEach((ev) => inp.addEventListener(ev, (e) => e.stopPropagation()));
  }
  function renameBlock(b, after) {
    if (b._rename) { b._rename(after); return; }
    const key = nameKey(b.dataset.blk), cfg = b._cfg;
    editInline(b.querySelector(':scope > .dcb-head .dcb-head-t'), cfg?.[key], (v, changed, viaKey) => { if (changed) { cfg[key] = v; b._api.save(cfg); } paintHead(b); if (viaKey) after?.(); });
  }
  const RENDER = { chart: chartBlk, dashboard: dashboardBlk, board: boardBlk, image: imageBlk, video: videoBlk, audio: audioBlk, web: webBlk, gallery: galleryBlk, calendar: calendarBlk, time: timeBlk, map: mapBlk };
  const TYPES = Object.keys(RENDER);

  /* ---------- Zeichnen ---------- */
  function mount(b, ctx) {
    const type = b.dataset.blk;
    b._blk = true;
    b.contentEditable = 'false';
    b.className = `dc-blk dcb-k-${type}`; // eigener Name, damit er nicht mit dem Innenteil (z. B. .dcb-time) zusammenfällt
    b.replaceChildren();
    let cfg = {};
    try { cfg = JSON.parse(b.dataset.cfg || '{}') || {}; } catch {}
    const api = {
      save: (c) => { b.dataset.cfg = JSON.stringify(c); ctx.onChange(); },
      redraw: () => { b._blk = false; mount(b, ctx); },
      remove: () => { const next = b.nextElementSibling; vanish(b, () => { b.remove(); ctx.onChange(); if (next?.isConnected) placeCaret(next); }); },
    };
    if (!RENDER[type]) { b.append(el('div', 'dcb-none', 'Unbekannter Block')); tools(b, api); return; }
    b._cfg = cfg; b._api = api; // für Umbenennen / Icon im Rechtsklick-Menü
    try { RENDER[type](b, cfg, api); } catch (err) { b.replaceChildren(el('div', 'dcb-none', 'Block konnte nicht dargestellt werden.')); tools(b, api); }
    if (HEAD_TYPES.includes(type)) b.prepend(blockHead(b));
  }
  function drawDocLink(a, ctx) {
    const id = a.dataset.doclink, info = ctx.docInfo(id);
    a.contentEditable = 'false';
    a.classList.add('dc-doclink');
    a.classList.toggle('gone', !info);
    a.removeAttribute('href'); a.removeAttribute('target');
    const title = info ? info.title : (a.textContent.trim() || 'Dokument');
    const ic = info?.icon && window.DocIcons?.has(info.icon.name) ? `<span class="dl-ic" style="color:${esc(info.icon.c)}">${DocIcons.svg(info.icon.name, 15)}</span>` : `<span class="dl-ic">${fi('file', 13)}</span>`;
    a.innerHTML = `${ic}<span class="dl-t">${esc(info ? title : `${title} (gelöscht)`)}</span>`;
    if (!a._wired) { a._wired = true; a.addEventListener('click', (e) => { e.preventDefault(); if (ctx.docInfo(id)) ctx.openDoc(id); }); }
  }
  // Tabellen: beim Darüberfahren eine Plus-Leiste unten (neue Zeile) und rechts (neue Spalte), wie in Notion
  // (wird beim Speichern wieder entfernt; ganze Tabelle löschen geht über den Rechtsklick)
  function tableControls(w, ctx) {
    if (w.querySelector(':scope > .dc-tadd')) return;
    const mk = (cls, label, fn) => {
      const bt = el('div', `dc-tadd dc-tplus ${cls}`, fi('plus', 11));
      Object.assign(bt, { contentEditable: 'false', title: label }); bt.setAttribute('role', 'button'); bt.setAttribute('aria-label', label);
      bt.addEventListener('mousedown', (e) => e.preventDefault());
      bt.addEventListener('click', (e) => { e.preventDefault(); fn(); ctx.onChange(); });
      w.append(bt);
    };
    // Neue Zellen kurz einblenden; die Klasse verschwindet danach wieder, damit sie nicht mitgespeichert wird
    const pop = (cells, cls) => cells.forEach((c, i) => { c.classList.add(cls); c.style.animationDelay = `${i * 18}ms`;
      const done = () => { c.classList.remove(cls); c.style.removeProperty('animation-delay'); if (!c.getAttribute('style')) c.removeAttribute('style'); if (!c.className) c.removeAttribute('class'); };
      c.addEventListener('animationend', done, { once: true }); setTimeout(done, 700); });
    mk('r', 'Zeile hinzufügen', () => { const t = w.querySelector('table'), last = t.querySelector('tr:last-child'); const r = document.createElement('tr'); r.innerHTML = [...last.children].map(() => '<td><br></td>').join(''); (t.tBodies[0] || t).append(r); pop([...r.children], 'dc-tnew-r'); placeCaret(r.firstChild); });
    mk('c', 'Spalte hinzufügen', () => { const cells = []; w.querySelectorAll('tr').forEach((r) => { const c = document.createElement(r.parentElement.tagName === 'THEAD' ? 'th' : 'td'); c.innerHTML = '<br>'; r.append(c); cells.push(c); }); pop(cells, 'dc-tnew-c'); });
  }
  // Reste aufräumen (Tabellenrahmen ohne Tabelle, verwaiste Leisten) und nach Blöcken immer eine Zeile zum Weiterschreiben
  function tidy(root) {
    if (!root) return;
    root.querySelectorAll('.dc-tw').forEach((w) => { if (!w.querySelector('table')) w.remove(); });
    root.querySelectorAll('.dc-tadd').forEach((b) => { if (!b.parentElement?.classList.contains('dc-tw')) b.remove(); });
    const solid = (n) => n?.nodeType === 1 && (n.classList.contains('dc-blk') || n.hasAttribute('data-blk') || n.classList.contains('dc-tw') || n.tagName === 'HR' || n.tagName === 'TABLE');
    [...root.children].forEach((n) => { if (solid(n) && (!n.nextElementSibling || solid(n.nextElementSibling))) n.after(Object.assign(document.createElement('p'), { innerHTML: '<br>' })); });
  }
  // Hervorhebung: data-callout="#farbe", data-solid (deckend statt transparent), data-radius="0…24"
  function styleCallout(n) {
    const c = /^#[\da-f]{6}$/i.test(n.dataset.callout || '') ? n.dataset.callout : '#2f86ff';
    const r = n.dataset.radius === undefined || n.dataset.radius === '' ? 12 : Math.max(0, Math.min(24, +n.dataset.radius || 0));
    n.style.setProperty('--co', c); n.style.setProperty('--cr', `${r}px`);
  }
  // Farbe und Form der Hervorhebung – als Untermenü (Rechtsklick) oder kleines Fenster (Griff links)
  function calloutPanel(n, ctx, box) {
    const r = () => (n.dataset.radius === undefined || n.dataset.radius === '' ? 12 : +n.dataset.radius);
    const cur = () => (/^#[\da-f]{6}$/i.test(n.dataset.callout || '') ? n.dataset.callout : '#2f86ff');
    box.classList.add('dcb-sub-callout');
    box.innerHTML = `<div class="dcb-sub-l">Farbe</div><div class="dcb-sub-colors">${UIKit.colorRow(cur(), 'data-c')}</div>
      <div class="dcb-cx-sep"></div>
      <button type="button" class="dcb-cx" data-solid>${fi('stack', 16)}<span>Transparent</span><i class="ce-switch${n.hasAttribute('data-solid') ? '' : ' on'}"><i></i></i></button>
      <div class="dcb-cx dcb-cx-static">${fi('callout', 16)}<span>Abrundung</span><b>${r()} px</b></div>
      <div class="dcb-sub-range"><input type="range" class="mu-range" min="0" max="24" step="1" value="${r()}" aria-label="Abrundung" /></div>`;
    const range = box.querySelector('input'), lab = box.querySelector('.dcb-cx-static b');
    const paintRange = () => range.style.setProperty('--val', `${(range.value / 24) * 100}%`);
    paintRange();
    const changed = () => { styleCallout(n); ctx.onChange(); };
    range.addEventListener('input', () => { n.dataset.radius = range.value; lab.textContent = `${range.value} px`; paintRange(); changed(); });
    box.addEventListener('click', (e) => {
      if (e.target.closest('.tk-picker')) return;
      const sw = e.target.closest('[data-solid]');
      if (sw) { const on = sw.querySelector('.ce-switch'); on.classList.toggle('on'); if (on.classList.contains('on')) n.removeAttribute('data-solid'); else n.setAttribute('data-solid', ''); changed(); return; }
      const cu = e.target.closest('[data-custom]');
      if (cu) {
        const host = cu.closest('.tk-colors').nextElementSibling;
        if (host.firstChild) { host.replaceChildren(); return; }
        host.append(UIKit.colorPicker(cur(), (hex, done) => { n.dataset.callout = hex; cu.style.setProperty('--c', hex); cu.classList.add('on'); changed(); if (done) host.replaceChildren(); }));
        return;
      }
      const c = e.target.closest('[data-c]');
      if (c) { n.dataset.callout = c.dataset.c; box.querySelectorAll('.tk-colors [data-c]').forEach((b) => b.classList.toggle('on', b === c)); box.querySelector('.tk-custom')?.classList.remove('on'); changed(); }
    });
    box.addEventListener('keydown', (e) => e.stopPropagation());
  }
  let coPop = null;
  function closeCallout() { if (!coPop) return; coPop.el.remove(); document.removeEventListener('pointerdown', coPop.out, true); coPop = null; }
  function openCallout(n, ctx) {
    closeCallout();
    const box = el('div', 'dcb-ctx dcb-sub open');
    document.body.append(box);
    calloutPanel(n, ctx, box);
    const rect = n.getBoundingClientRect();
    box.style.left = `${Math.max(8, rect.left - 30)}px`;
    box.style.top = `${Math.max(8, Math.min(innerHeight - box.offsetHeight - 8, rect.top))}px`;
    box.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeCallout(); });
    const out = (e) => { if (!box.contains(e.target) && !e.target.closest?.('.tk-picker')) closeCallout(); };
    setTimeout(() => document.addEventListener('pointerdown', out, true), 0);
    coPop = { el: box, out };
  }
  // lose Bilder im Text (z. B. früher hineingezogen) → richtige Bild-Blöcke (abgerundet, Rechtsklick-Menü, löschbar)
  function adoptImages(root, ctx) {
    let changed = false;
    root.querySelectorAll('img').forEach((img) => {
      if (img.closest('.dc-blk, [data-blk], .dc-viz, [data-viz]')) return;
      const src = img.getAttribute('src') || '';
      let top = img; while (top.parentNode && top.parentNode !== root) top = top.parentNode;
      const b = document.createElement('div');
      b.dataset.blk = 'image';
      if (top === img) img.replaceWith(b);
      else { top.after(b); img.remove(); if (!top.textContent.trim() && !top.querySelector('img, [data-blk]')) top.remove(); }
      changed = true;
      const done = (s) => { b.dataset.cfg = JSON.stringify(mediaSrc(s, 'image') ? { src: s } : {}); b._blk = false; mount(b, ctx); ctx.onChange?.(); };
      if (/^blob:/.test(src)) fetch(src).then((r) => r.blob()).then((bl) => imageData(bl)).then(done).catch(() => done('')); // nur im Browser gültig → dauerhaft speichern
      else b.dataset.cfg = JSON.stringify(mediaSrc(src, 'image') ? { src } : {});
    });
    return changed;
  }
  function render(root, ctx) {
    if (!root) return;
    const adopted = adoptImages(root, ctx);
    tidy(root);
    root.querySelectorAll('[data-callout]').forEach(styleCallout);
    root.querySelectorAll('[data-blk]').forEach((b) => { if (!b._blk) mount(b, ctx); });
    root.querySelectorAll('a[data-doclink]').forEach((a) => drawDocLink(a, ctx));
    root.querySelectorAll('.dc-tw').forEach((w) => { tableControls(w, ctx); tableHead(w); });
    if (adopted) ctx.onChange?.(); // umgewandelte Bilder gleich speichern
  }
  // vor dem Speichern: nur Platzhalter und reiner Text bleiben übrig
  function strip(root) {
    root.querySelectorAll('[data-blk]').forEach((b) => { b.replaceChildren(); b.className = 'dc-blk'; b.removeAttribute('contenteditable'); });
    root.querySelectorAll('a[data-doclink]').forEach((a) => { const t = a.querySelector('.dl-t')?.textContent.replace(/ \(gelöscht\)$/, '') || a.textContent; a.replaceChildren(t); a.removeAttribute('contenteditable'); a.removeAttribute('class'); });
    root.querySelectorAll('.dc-tadd, .dc-tw > .dcb-head').forEach((x) => x.remove());
  }

  /* ---------- Entfernen mit Animation ---------- */
  function vanish(n, done) {
    let called = false;
    const fin = () => { if (called) return; called = true; done(); };
    if (!n?.isConnected || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { fin(); return; }
    const cs = getComputedStyle(n), h = n.offsetHeight;
    n.style.overflow = 'hidden'; n.style.pointerEvents = 'none';
    n.animate([{ height: `${h}px`, marginTop: cs.marginTop, marginBottom: cs.marginBottom, opacity: 1, transform: 'none', filter: 'blur(0px)' },
      { height: '0px', marginTop: '0px', marginBottom: '0px', opacity: 0, transform: 'scale(0.97)', filter: 'blur(2px)' }],
    { duration: 340, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' }).onfinish = fin;
    setTimeout(fin, 500); // falls die Animation nicht zu Ende läuft (Tab im Hintergrund)
  }
  /* ---------- Schreibmarke ---------- */
  function placeCaret(node, atEnd = false) {
    const r = document.createRange(), s = getSelection();
    r.selectNodeContents(node); r.collapse(!atEnd);
    s.removeAllRanges(); s.addRange(r);
  }

  /* ---------- Slash-Menü ---------- */
  let menu = null; // { el, query, node, start, idx, mode, list }
  let ctxMenu = null, ctxSub = null; // Rechtsklick-Menü und sein Untermenü rechts daneben
  function attach(content, ctx) {
    if (content._slash) return;
    content._slash = true;
    const topChild = (n) => { while (n && n.parentNode !== content) n = n.parentNode; return n; };
    const inBlock = (n) => (n?.nodeType === 1 ? n : n?.parentElement)?.closest?.('.dc-blk');

    content.addEventListener('input', (e) => {
      if (inBlock(e.target) || inBlock(getSelection().anchorNode)) return;
      const s = getSelection();
      if (!s.isCollapsed || !s.anchorNode || s.anchorNode.nodeType !== 3 || !content.contains(s.anchorNode)) { if (menu?.mode !== 'page') close(); return; }
      const node = s.anchorNode, before = node.data.slice(0, s.anchorOffset);
      if (shortcut(node)) return;
      const m = /(?:^|\s)\/([^\s/]{0,24})$/.exec(before);
      if (!m) { if (menu && menu.mode !== 'page') close(); return; }
      open({ node, start: s.anchorOffset - m[1].length - 1, query: m[1] });
    });
    // Tasten, solange das Menü offen ist (vor allen anderen Tasten-Handlern)
    content.addEventListener('keydown', (e) => {
      if (menu && menu.mode === 'items') {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); move(e.key === 'ArrowDown' ? 1 : -1); return; }
        if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); const it = menu.list[menu.idx]; if (it) choose(it); else close(); return; }
        if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      }
      // Aufgaben: neue Zeile startet immer offen
      if (e.key === 'Enter' && !e.shiftKey) {
        const li = (getSelection().anchorNode?.nodeType === 1 ? getSelection().anchorNode : getSelection().anchorNode?.parentElement)?.closest?.('ul[data-todo] > li');
        if (li) setTimeout(() => { const cur = (getSelection().anchorNode?.nodeType === 1 ? getSelection().anchorNode : getSelection().anchorNode?.parentElement)?.closest?.('ul[data-todo] > li'); if (cur && cur !== li) cur.removeAttribute('data-done'); }, 0);
      }
      // Tabellen: Tab springt zur nächsten Zelle, in der letzten Zelle entsteht eine neue Zeile
      if (e.key === 'Tab') {
        const cell = (getSelection().anchorNode?.nodeType === 1 ? getSelection().anchorNode : getSelection().anchorNode?.parentElement)?.closest?.('td, th');
        if (cell && content.contains(cell)) {
          e.preventDefault();
          const cells = [...cell.closest('table').querySelectorAll('th, td')], i = cells.indexOf(cell);
          let next = cells[i + (e.shiftKey ? -1 : 1)];
          if (!next && !e.shiftKey) { const row = cell.closest('tr'), r = document.createElement('tr'); r.innerHTML = [...row.children].map(() => '<td><br></td>').join(''); (cell.closest('table').tBodies[0] || cell.closest('table')).append(r); next = r.firstChild; ctx.onChange(); }
          if (next) placeCaret(next, true);
        }
      }
    }, true);
    // iPad/Touch: kein Gedrückthalten/Doppeltippen mehr (störte Markieren und Tabellen). Stattdessen: tippt man in einen Block
    // (Tabelle, Bild/Diagramm, Block, Hervorhebung, Liste, Trennlinie, Seitenlink), erscheint rechts daneben ein kleiner „•••“-Knopf –
    // erst der öffnet das Menü (wie der Rechtsklick, für genau die Stelle, die man angetippt hat). Markieren und Tippen bleiben normal.
    const MENU_NODE = '.dc-blk, .dc-tw, [data-viz], .dc-viz, [data-callout], a[data-doclink], ul[data-todo], hr';
    const handle = document.createElement('button');
    handle.type = 'button';
    handle.className = 'dc-handle';
    handle.setAttribute('aria-label', 'Block-Menü');
    handle.innerHTML = '<svg width="14" height="14" aria-hidden="true"><use href="#f-more"/></svg>';
    handle.hidden = true;
    let handleFor = null, handleTarget = null;
    const touchy = () => matchMedia('(hover: none)').matches;
    const placeHandle = () => {
      if (!handleFor?.isConnected || !content.contains(handleFor)) { handle.hidden = true; return; }
      const host = content.offsetParent || content.parentElement;
      if (handle.parentElement !== host) host.append(handle);
      const r = handleFor.getBoundingClientRect(), h = host.getBoundingClientRect();
      handle.style.top = `${r.top - h.top + host.scrollTop + (handleFor.tagName === 'HR' ? -13 : 2)}px`;
      handle.style.left = `${Math.min(h.width - 34, r.right - h.left + 6)}px`;
      handle.hidden = false;
    };
    content.addEventListener('pointerup', (e) => {
      if (e.pointerType === 'mouse' || !touchy()) return;
      const node = e.target.closest?.(MENU_NODE);
      handleFor = node && content.contains(node) ? (node.closest('.dc-tw, .dc-blk, [data-viz], .dc-viz') || node) : null;
      handleTarget = e.target;
      placeHandle();
    });
    content.addEventListener('input', () => { if (!handle.hidden) placeHandle(); });
    window.addEventListener('resize', () => { if (!handle.hidden) placeHandle(); });
    document.addEventListener('pointerdown', (e) => { if (!handle.hidden && e.target !== handle && !handle.contains(e.target) && !content.contains(e.target)) handle.hidden = true; }, true);
    handle.addEventListener('pointerdown', (e) => e.preventDefault()); // Tastatur/Markierung bleibt
    handle.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      const t = handleTarget?.isConnected && handleFor?.contains(handleTarget) ? handleTarget : handleFor;
      if (!t) return;
      const r = handle.getBoundingClientRect();
      t.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left, clientY: r.bottom + 4, view: window }));
      handle.hidden = true;
    });
    // Rechtsklick auf Blöcke, Tabellen, Hervorhebungen, Trennlinien, Listen, Seitenlinks:
    // schlichtes Menü mit Gruppen; was ein eigenes Fenster braucht, öffnet sich als Untermenü rechts daneben
    content.addEventListener('contextmenu', (e) => {
      const t = e.target;
      const blk = t.closest?.('.dc-blk'), tw = t.closest?.('.dc-tw'), co = t.closest?.('[data-callout]'), link = t.closest?.('a[data-doclink]');
      const hr = t.tagName === 'HR' ? t : null, todo = t.closest?.('ul[data-todo]');
      const viz = t.closest?.('[data-viz], .dc-viz'); // visuelle Hilfen aus dem Chat (Bild, Diagramm, Mindmap, Zeitstrahl)
      const node = blk || tw || viz || hr || link || co || todo;
      if (!node || !content.contains(node)) return; // sonst normales Menü (z. B. Rechtschreibung)
      e.preventDefault();
      const top = topChild(node);
      const info = blk ? blockInfo(blk) : tw ? tableInfo(tw) : null;
      const groups = [];
      // 1) Name, Icon, Block-Aktionen
      const g1 = [], card = t.closest?.('.dcb-card');
      if (info?.icon) g1.push({ icon: 'image', label: info.hasIcon ? 'Icon ändern' : 'Icon hinzufügen', sub: (p) => iconPanel(blk || tw, p, info.hasIcon) });
      if (info?.named) g1.push({ icon: 'pencil', label: 'Umbenennen', keep: true, fn: () => (card?._rename ? card._rename() : blk ? renameBlock(blk) : renameTable(tw)) });
      const pin = t.closest?.('.dcb-mpin');
      if (pin && blk?._pin) { g1.push({ icon: 'pencil', label: 'Markierung bearbeiten', fn: () => blk._pin(pin.dataset.id, 'edit'), keep: true }); g1.push({ icon: 'trash', label: 'Markierung entfernen', fn: () => blk._pin(pin.dataset.id, 'del'), keep: true }); }
      else if (blk?._addMarker && t.closest('.dcb-map-c')) g1.push({ icon: 'map-pin', label: 'Markierung hier setzen', fn: () => blk._addMarker(e), keep: true });
      if (card?._menu) card._menu.forEach((x) => g1.push({ icon: x.icon, label: x.label, fn: x.fn, keep: true }));
      if (blk) (blk._menu || []).forEach((x) => g1.push(x.toggle ? { icon: x.icon, label: x.toggleLabel, on: x.on, fn: x.fn } : { icon: x.icon, label: x.label, fn: x.fn }));
      if (co && !blk && !tw) { g1.push({ icon: 'palette', label: 'Farbe und Form', sub: (p) => calloutPanel(co, ctx, p) }); g1.push({ icon: 'callout', label: 'Hervorhebung aufheben', fn: () => co.replaceWith(...co.childNodes) }); }
      if (link) g1.push({ icon: 'file', label: 'Dokument öffnen', fn: () => link.click(), keep: true });
      if (g1.length) groups.push(g1);
      // 2) Tabelle bearbeiten
      if (tw) {
        // Rechtsklick auf die Plus-Leiste unten/rechts zählt wie auf die letzte Zeile / letzte Spalte
        const plus = t.closest('.dc-tplus'), firstRow = tw.querySelector('tr');
        const cell = t.closest('td, th') || (plus?.classList.contains('r') ? tw.querySelector('tbody tr:last-child > :first-child') : plus?.classList.contains('c') ? firstRow?.lastElementChild : null);
        const row = cell?.closest('tr'), g = [];
        // Zellen erst weich ausblenden, dann entfernen und speichern
        const fade = (cells) => { cells.forEach((c) => c.classList.add('dc-tgone')); setTimeout(() => { cells.forEach((c) => c.remove()); tw.querySelectorAll('tr').forEach((r) => { if (!r.children.length) r.remove(); }); tidy(content); ctx.onChange(); }, 200); };
        g.push({ icon: 'plus', label: 'Zeile hinzufügen', fn: () => { const ref = row && row.parentElement.tagName === 'TBODY' ? row : tw.querySelector('tbody tr:last-child'); const r = document.createElement('tr'); r.innerHTML = [...(ref || tw.querySelector('tr')).children].map(() => '<td><br></td>').join(''); if (ref) ref.after(r); else (tw.querySelector('tbody') || tw.querySelector('table')).append(r); } });
        g.push({ icon: 'plus', label: 'Spalte hinzufügen', fn: () => { const i = cell ? [...cell.parentElement.children].indexOf(cell) : -1; tw.querySelectorAll('tr').forEach((r) => { const head = r.parentElement.tagName === 'THEAD', c = document.createElement(head ? 'th' : 'td'); c.innerHTML = '<br>'; const ref = r.children[i]; if (ref) ref.after(c); else r.append(c); }); } });
        groups.push(g);
        // Entfernen: nur dieses Feld leeren, die Zeile oder die Spalte (die ganze Tabelle über „Löschen“ unten)
        const gd = [];
        if (cell && !plus && cell.textContent.trim()) gd.push({ icon: 'x', label: 'Feld leeren', fn: () => { cell.innerHTML = '<br>'; placeCaret(cell); } });
        if (row && row.parentElement.tagName === 'TBODY' && row.parentElement.children.length > 1) gd.push({ icon: 'trash', label: 'Zeile löschen', keep: true, fn: () => fade([...row.children]) });
        if (cell && cell.parentElement.children.length > 1) gd.push({ icon: 'trash', label: 'Spalte löschen', keep: true, fn: () => { const i = [...cell.parentElement.children].indexOf(cell); fade([...tw.querySelectorAll('tr')].map((r) => r.children[i]).filter(Boolean)); } });
        if (gd.length) groups.push(gd);
      }
      // 3) Duplizieren, Verschieben nach
      const g3 = [];
      if (!link) g3.push({ icon: 'copy', label: 'Duplizieren', fn: () => { const w = document.createElement('div'); w.append(top.cloneNode(true)); strip(w); top.after(...w.childNodes); } });
      if (!link && ctx.moveTo) g3.push({ icon: 'arrow-right', label: 'Verschieben nach', sub: (p) => movePanel(top, p) });
      groups.push(g3);
      // 4) Löschen (im Dashboard zuerst nur die angeklickte Kachel, darunter das ganze Dashboard)
      const g4 = [];
      if (card?._drop) g4.push({ icon: 'trash', label: `„${card._drop.name.length > 24 ? `${card._drop.name.slice(0, 23)}…` : card._drop.name}“ löschen`, danger: true, keep: true, fn: card._drop.fn });
      groups.push([...g4, { icon: 'trash', label: card?._drop ? 'Ganzes Dashboard löschen' : viz && !blk && !tw ? (viz.dataset.viz === 'illustration' ? 'Bild löschen' : 'Grafik löschen') : 'Löschen', danger: true, keep: true, fn: () => { const gone = link || top, next = link ? null : top?.nextElementSibling; vanish(gone, () => { gone.remove(); tidy(content); ctx.afterInsert?.(); ctx.onChange(); if (next?.isConnected) placeCaret(next); }); } }]);
      // 5) KI
      if (ctx.askAi) groups.push([{ icon: 'sparkle', label: 'Frag die KI', fn: () => ctx.askAi(`Zu „${info?.name || 'diesem Abschnitt'}“: `), keep: true }]);
      showCtx(e.clientX, e.clientY, groups);
    });
    function showCtx(x, y, groups) {
      hideCtx();
      ctxMenu ||= document.body.appendChild(el('div', 'dcb-ctx'));
      ctxMenu.setAttribute('role', 'menu');
      const items = groups.flat();
      ctxMenu.innerHTML = groups.filter((g) => g.length).map((g) => g.map((it) => `<button type="button" data-i="${items.indexOf(it)}" class="dcb-cx${it.danger ? ' danger' : ''}${it.sub ? ' has-sub' : ''}">${fi(it.icon, 16)}<span>${esc(it.label)}</span>${it.on !== undefined ? `<i class="ce-switch${it.on ? ' on' : ''}"><i></i></i>` : ''}${it.sub ? `<em>${fi('chevron-right', 10)}</em>` : ''}</button>`).join('')).join('<div class="dcb-cx-sep"></div>');
      // Untermenü: beim Darüberfahren (kurz verweilen) oder Klick rechts daneben öffnen
      let hoverT = 0, subFor = null;
      const openSub = (b) => {
        const it = items[+b.dataset.i]; if (!it?.sub || subFor === b) return;
        closeSub(); subFor = b; b.classList.add('open');
        ctxSub = document.body.appendChild(el('div', 'dcb-ctx dcb-sub open'));
        it.sub(ctxSub);
        const m = ctxMenu.getBoundingClientRect(), r = b.getBoundingClientRect(), w = ctxSub.offsetWidth, h = ctxSub.offsetHeight;
        const left = m.right + 4 + w < innerWidth - 8 ? m.right + 4 : m.left - 4 - w;
        ctxSub.style.left = `${Math.max(8, left)}px`;
        ctxSub.style.top = `${Math.max(8, Math.min(r.top - 6, innerHeight - h - 8))}px`;
      };
      const closeSub = () => { ctxSub?.remove(); ctxSub = null; subFor?.classList.remove('open'); subFor = null; };
      ctxMenu.onpointerover = (e) => {
        const b = e.target.closest('[data-i]'); clearTimeout(hoverT); if (!b) return;
        if (items[+b.dataset.i].sub) hoverT = setTimeout(() => openSub(b), 220); else if (subFor && b !== subFor) hoverT = setTimeout(closeSub, 220);
      };
      ctxMenu.onclick = (e) => {
        const b = e.target.closest('[data-i]'); if (!b) return;
        const it = items[+b.dataset.i];
        if (it.sub) { clearTimeout(hoverT); openSub(b); return; }
        hideCtx();
        it.fn();
        if (!it.keep) { tidy(content); ctx.afterInsert?.(); ctx.onChange(); }
      };
      ctxMenu.classList.add('open');
      const w = ctxMenu.offsetWidth || 240, h = ctxMenu.offsetHeight || 300;
      ctxMenu.style.left = `${Math.max(8, Math.min(x, innerWidth - w - 8))}px`;
      ctxMenu.style.top = `${Math.max(8, Math.min(y + 4, innerHeight - h - 8))}px`;
      setTimeout(() => document.addEventListener('pointerdown', ctxOut, true), 0);
      document.addEventListener('keydown', ctxKey, true);
    }
    const ctxOut = (e) => { if (!ctxMenu?.contains(e.target) && !ctxSub?.contains(e.target) && !e.target.closest?.('.tk-picker')) hideCtx(); };
    const ctxKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); hideCtx(); } };
    function hideCtx() { ctxMenu?.classList.remove('open'); ctxSub?.remove(); ctxSub = null; document.removeEventListener('pointerdown', ctxOut, true); document.removeEventListener('keydown', ctxKey, true); }
    // Untermenüs (füllen das Fenster rechts neben dem Menü)
    function movePanel(top, p) {
      const docs = ctx.docs();
      p.classList.add('dcb-sub-list');
      p.innerHTML = (docs.length ? docs.slice(0, 40).map((d) => `<button type="button" class="dcb-cx" data-doc="${esc(d.id)}">${d.icon && window.DocIcons?.has(d.icon.name) ? `<span class="dcb-cx-di" style="color:${esc(d.icon.c)}">${DocIcons.svg(d.icon.name, 16)}</span>` : fi('file', 16)}<span>${esc(d.title)}</span></button>`).join('') : '<div class="dcb-cx-none">Noch keine anderen Dokumente</div>')
        + (ctx.newDoc ? `<div class="dcb-cx-sep"></div><button type="button" class="dcb-cx" data-doc="">${fi('plus', 16)}<span>Neues Dokument</span></button>` : '');
      p.addEventListener('click', (e) => {
        const b = e.target.closest('[data-doc]'); if (!b) return;
        if (!b.dataset.doc) b.dataset.doc = ctx.newDoc();
        const wrap = document.createElement('div'); wrap.append(top.cloneNode(true)); strip(wrap);
        hideCtx();
        const next = top.nextElementSibling;
        vanish(top, () => { top.remove(); tidy(content); ctx.onChange(); if (next?.isConnected) placeCaret(next); ctx.moveTo(b.dataset.doc, wrap.innerHTML); });
      });
    }
    function renameTable(w) {
      const t = w.querySelector('table'); if (!t) return;
      if (!w.querySelector(':scope > .dcb-head')) tableHead(w, true);
      editInline(w.querySelector(':scope > .dcb-head .dcb-head-t'), t.dataset.name, (v, changed) => { if (v) t.dataset.name = v; else t.removeAttribute('data-name'); tableHead(w); if (changed) ctx.onChange(); });
    }
    function iconPanel(node, p, has) {
      const isT = node.classList.contains('dc-tw'), t = isT ? node.querySelector('table') : null;
      p.classList.add('dcb-sub-icons');
      p.innerHTML = `${has ? `<button type="button" class="dcb-cx" data-std>${fi('x', 16)}<span>Icon entfernen</span></button><div class="dcb-cx-sep"></div>` : ''}<div class="dcb-icgrid">${(window.DocIcons?.names || []).map((n) => `<button type="button" data-n="${n}" aria-label="Icon wählen">${DocIcons.svg(n, 18)}</button>`).join('')}</div>`;
      p.addEventListener('click', (e) => {
        const b = e.target.closest('[data-n], [data-std]'); if (!b) return;
        const ic = b.dataset.n ? `d:${b.dataset.n}` : '';
        hideCtx();
        if (isT) { if (ic) t.dataset.icon = ic; else t.removeAttribute('data-icon'); tableHead(node); ctx.onChange(); }
        else { if (ic) node._cfg.icon = ic; else delete node._cfg.icon; node._api.save(node._cfg); if (HEAD_TYPES.includes(node.dataset.blk)) paintHead(node); else node._api.redraw(); }
      });
    }
    // Hervorhebung: Griff links daneben (erscheint beim Darüberfahren) öffnet Farbe / Transparenz / Abrundung
    content.addEventListener('mousedown', (e) => {
      const co = e.target.closest?.('[data-callout]');
      if (!co || e.clientX >= co.getBoundingClientRect().left) return;
      e.preventDefault();
      openCallout(co, ctx);
    });
    // Klick auf den Titel eines Blocks, einer Tabelle oder einer Dashboard-Karte: direkt umbenennen
    content.addEventListener('click', (e) => {
      const ht = e.target.closest?.('.dcb-head-t, .dcb-card .dcb-ct, .dcb-tm-t');
      if (!ht || !content.contains(ht)) return;
      const card = ht.closest('.dcb-card'), blk = ht.closest('.dc-blk'), tw = ht.closest('.dc-tw');
      e.preventDefault();
      if (card?._rename) card._rename(); else if (blk) renameBlock(blk); else if (tw) renameTable(tw);
    });
    // Aufgabe abhaken: Klick auf das Kästchen links
    content.addEventListener('click', (e) => {
      const li = e.target.closest?.('ul[data-todo] > li');
      if (!li || e.target !== li) return;
      const r = li.getBoundingClientRect();
      if (e.clientX - r.left > 24) return;
      e.preventDefault();
      li.toggleAttribute('data-done');
      if (li.hasAttribute('data-done')) li.setAttribute('data-done', '');
      ctx.onChange();
    });
    // Schreibmarke steht (wieder) direkt hinter einem „/…“ → Menü erscheint erneut (Wegklicken schließt es)
    const onSel = () => {
      if (!content.isConnected) { document.removeEventListener('selectionchange', onSel); return; }
      if (menu || document.activeElement !== content) return;
      const s = getSelection();
      if (!s.isCollapsed || s.anchorNode?.nodeType !== 3 || !content.contains(s.anchorNode) || inBlock(s.anchorNode)) return;
      const m = /(?:^|\s)\/([^\s/]{0,24})$/.exec(s.anchorNode.data.slice(0, s.anchorOffset));
      if (m) open({ node: s.anchorNode, start: s.anchorOffset - m[1].length - 1, query: m[1] });
    };
    document.addEventListener('selectionchange', onSel);
    // selectionchange kommt beim Zurückklicken oft vor dem Fokus → zusätzlich nach Fokus, Klick und Pfeiltasten prüfen
    const later = () => setTimeout(onSel, 0);
    content.addEventListener('focus', later);
    content.addEventListener('mouseup', later);
    content.addEventListener('keyup', (e) => { if (/^(Arrow|Home|End)/.test(e.key)) later(); });
    content.addEventListener('blur', () => setTimeout(() => { if (menu && menu.mode === 'items' && !menu.el.contains(document.activeElement)) close(); }, 120));

    const SHORT = [[/^#### $/, 'h4'], [/^### $/, 'h3'], [/^## $/, 'h2'], [/^# $/, 'h1'], [/^[-*] $/, 'ul'], [/^1[.)] $/, 'ol'], [/^\[\s?\] $/, 'todo'], [/^> $/, 'quote'], [/^---$/, 'divider']];
    function shortcut(node) {
      const top = topChild(node);
      if (!top || top.tagName !== 'P' || top.childNodes.length !== 1 || top.firstChild !== node) return false;
      const t = node.data.replace(/\u00a0/g, ' ');
      const hit = SHORT.find(([re]) => re.test(t)); if (!hit) return false;
      const nodes = insert(top, html(hit[1]));
      ctx.afterInsert?.();
      const n = nodes[0];
      if (hit[1] === 'divider') { const p = n.nextElementSibling; if (p) placeCaret(p); } else placeCaret(n.querySelector('li') || n);
      ctx.onChange();
      return true;
    }
    function open({ node, start, query }) {
      if (!menu) {
        const m = el('div', 'dcs-menu'); m.setAttribute('role', 'listbox');
        document.body.append(m);
        m.addEventListener('pointerdown', (e) => { if (!e.target.closest('input')) e.preventDefault(); }); // Schreibmarke bleibt im Text
        m.addEventListener('click', (e) => {
          if (e.target.closest('[data-close]')) { close(); return; }
          const row = e.target.closest('[data-i]'); if (!row) return;
          if (menu.mode === 'page') pickPage(menu.pages[+row.dataset.i]); else choose(menu.list[+row.dataset.i]);
        });
        m.addEventListener('pointermove', (e) => { const row = e.target.closest('[data-i]'); if (row && menu.mode === 'items' && +row.dataset.i !== menu.idx) { menu.idx = +row.dataset.i; mark(); } });
        menu = { el: m, idx: 0, mode: 'items' };
        setTimeout(() => document.addEventListener('pointerdown', outside), 0);
      }
      Object.assign(menu, { node, start, query, mode: 'items' });
      const q = query.toLowerCase();
      // Treffer nach Relevanz: Name beginnt mit … > Name enthält … > Stichwort beginnt mit … > irgendwo enthalten
      const score = (it) => { const n = it.name.toLowerCase(), k = it.keys.split(' '); return n.startsWith(q) ? 0 : n.includes(q) ? 1 : k.some((w) => w.startsWith(q)) ? 2 : it.keys.includes(q) ? 3 : 9; };
      menu.list = !q ? ITEMS : ITEMS.map((it) => [it, score(it)]).filter(([, sc]) => sc < 9).sort((a, b) => a[1] - b[1]).map(([it]) => it);
      menu.idx = Math.min(menu.idx, Math.max(0, menu.list.length - 1));
      if (q && !menu.list.length && q.length > 3) { close(); return; }
      paint();
      position();
      hint(!query);
    }
    function paint() {
      let g = '', out = '';
      menu.list.forEach((it, i) => {
        if (!menu.query && it.group !== g) { out += `${g ? '<div class="dcs-line"></div>' : ''}<div class="dcs-sec">${esc(it.group)}</div>`; g = it.group; } // beim Suchen ohne Gruppen, beste Treffer oben
        out += `<div class="dcs-item${i === menu.idx ? ' on' : ''}" data-i="${i}" role="option"><span class="dcs-ic">${it.glyph ? `<span class="dcs-glyph">${it.glyph}</span>` : fi(it.icon, 16)}</span><span class="dcs-name">${esc(it.name)}</span>${it.hint ? `<kbd>${esc(it.hint)}</kbd>` : ''}</div>`;
      });
      menu.el.innerHTML = `<div class="dcs-list">${out || '<div class="dcs-empty">Keine Treffer</div>'}</div>`;
    }
    // grauer Hinweis „Schreibe zum Suchen“ direkt hinter dem Schrägstrich, solange noch nichts getippt ist
    let hintEl = null;
    function hint(show) {
      if (!show || !menu) { hintEl?.remove(); hintEl = null; return; }
      const r = document.createRange();
      try { r.setStart(menu.node, menu.start); r.setEnd(menu.node, menu.start + 1); } catch { return; }
      const rect = r.getBoundingClientRect(), cs = getComputedStyle(menu.node.parentElement);
      hintEl ||= document.body.appendChild(el('div', 'dcs-hint', 'Schreibe zum Suchen'));
      Object.assign(hintEl.style, { left: `${rect.right + 1}px`, top: `${rect.top}px`, height: `${rect.height}px`, lineHeight: `${rect.height}px`, fontSize: cs.fontSize });
    }
    function mark() { menu.el.querySelectorAll('.dcs-item').forEach((r) => r.classList.toggle('on', +r.dataset.i === menu.idx)); menu.el.querySelector('.dcs-item.on')?.scrollIntoView({ block: 'nearest' }); }
    function move(d) { if (!menu.list.length) return; menu.idx = (menu.idx + d + menu.list.length) % menu.list.length; mark(); }
    function position() {
      const r = document.createRange();
      try { r.setStart(menu.node, menu.start); r.setEnd(menu.node, Math.min(menu.node.length, menu.start + 1)); } catch { return; }
      const rect = r.getBoundingClientRect(), h = menu.el.offsetHeight || 340, w = 320;
      const below = rect.bottom + 6 + h < innerHeight - 8;
      menu.el.style.left = `${Math.max(8, Math.min(innerWidth - w - 8, rect.left - 4))}px`;
      menu.el.style.top = `${below ? rect.bottom + 6 : Math.max(8, rect.top - h - 6)}px`;
    }
    function outside(e) { if (menu && !menu.el.contains(e.target)) close(); }
    function close() {
      if (!menu) return;
      const m = menu.el; menu = null;
      hint(false);
      document.removeEventListener('pointerdown', outside);
      m.classList.add('closing'); setTimeout(() => m.remove(), 140);
    }
    // „/…“ aus dem Text entfernen und den Block an der Stelle einsetzen
    function takeSlash() {
      const { node, start, query } = menu;
      if (node.isConnected && node.data.slice(start, start + 1) === '/') node.deleteData(start, Math.min(node.length - start, query.length + 1));
      return topChild(node);
    }
    function insert(top, htmlStr) {
      if (top?.tagName === 'P' && SHORT.some(([re]) => re.test(top.textContent.replace(/\u00a0/g, ' ')))) top.textContent = '';
      const t = document.createElement('template'); t.innerHTML = htmlStr;
      const nodes = [...t.content.childNodes];
      const emptyTop = top && /^(P|DIV|H[1-4]|BLOCKQUOTE)$/.test(top.tagName) && !top.hasAttribute('data-blk') && !top.textContent.trim() && !top.querySelector('img, [data-blk]');
      if (!top) content.append(...nodes);
      else if (emptyTop) top.replaceWith(...nodes);
      else top.after(...nodes);
      const last = nodes[nodes.length - 1];
      // nach Blöcken ohne eigene Schreibstelle braucht es einen Absatz zum Weiterschreiben
      if (last?.nodeType === 1 && (last.tagName === 'HR' || last.hasAttribute('data-blk') || last.tagName === 'TABLE') && !(last.nextElementSibling?.tagName === 'P')) last.after(Object.assign(document.createElement('p'), { innerHTML: '<br>' }));
      return nodes;
    }
    function choose(it) {
      if (it.id === 'page') { openPages(); return; }
      const top = takeSlash();
      close();
      const nodes = insert(top, html(it.id));
      ctx.afterInsert?.();
      const n = nodes[0];
      if (it.id === 'p' || /^h[1-4]$/.test(it.id) || it.id === 'quote') placeCaret(n);
      else if (it.id === 'todo' || it.id === 'ul' || it.id === 'ol') placeCaret(n.querySelector('li'));
      else if (it.id === 'table') placeCaret(n.querySelector('th, td') || n, true);
      else if (it.id === 'callout') placeCaret(n.querySelector('p'));
      else {
        const p = nodes[nodes.length - 1].nextElementSibling;
        if (['bar', 'hbar', 'line'].includes(it.id) && n.querySelector?.('.dcb-head-t')) renameBlock(n, () => p?.isConnected && placeCaret(p)); // neues Diagramm: gleich einen Titel geben
        else if (p) placeCaret(p);
      }
      ctx.onChange();
    }
    // Seite verlinken: Liste der Dokumente mit Suche
    function openPages() {
      menu.mode = 'page';
      hint(false);
      menu.pages = ctx.docs();
      menu.el.innerHTML = `<div class="dcs-search">${fi('search', 12)}<input placeholder="Dokument suchen …" /></div><div class="dcs-list dcs-pages"></div>`;
      const inp = menu.el.querySelector('input'), box = menu.el.querySelector('.dcs-pages');
      let idx = 0, list = menu.pages;
      const draw = () => {
        const q = inp.value.trim().toLowerCase();
        list = menu.pages.filter((d) => !q || d.title.toLowerCase().includes(q));
        idx = Math.min(idx, Math.max(0, list.length - 1));
        box.innerHTML = list.length ? list.map((d) => `<div class="dcs-item${list[idx] === d ? ' on' : ''}" data-i="${menu.pages.indexOf(d)}"><span class="dcs-ic"${d.icon ? ` style="color:${esc(d.icon.c)}"` : ''}>${d.icon && window.DocIcons?.has(d.icon.name) ? DocIcons.svg(d.icon.name, 16) : fi('file', 16)}</span><span class="dcs-name">${esc(d.title)}</span></div>`).join('') : '<div class="dcs-empty">Keine Dokumente</div>';
      };
      inp.addEventListener('input', () => { idx = 0; draw(); });
      inp.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); idx = (idx + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % Math.max(1, list.length); draw(); }
        if (e.key === 'Enter') { e.preventDefault(); if (list[idx]) pickPage(list[idx]); }
        if (e.key === 'Escape') { e.preventDefault(); close(); content.focus(); }
      });
      draw(); position(); inp.focus();
    }
    function pickPage(d) {
      if (!d) return;
      const top = takeSlash();
      close();
      const nodes = insert(top, `<p><a data-doclink="${esc(d.id)}">${esc(d.title)}</a></p>`);
      ctx.afterInsert?.();
      const p = Object.assign(document.createElement('p'), { innerHTML: '<br>' });
      nodes[0].after(p); placeCaret(p);
      ctx.onChange();
    }
  }

  return { ITEMS, TYPES, html, render, strip, attach, chartView, tidy, imageData }; // imageData: Bilder fürs Dokument verkleinern (Ziehen/Einfügen)
})();
window.DocBlocks = DocBlocks;
