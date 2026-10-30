/* ===================================================================
   Präsentationen des Lern-Agenten (Block ```praesentation im Chat)
   - Die KI liefert nur Inhalt (Titel, Folien, Stichpunkte, Bildwünsche); Gestaltung und Aufteilung macht die App:
     EIN Layout-Rechner erzeugt je Folie einfache Bausteine (Fläche, Kreis, Text mit fertigen Zeilen, Bild) in Zoll (13,333 × 7,5 = 16:9).
     Daraus entstehen drei Ausgaben, die gleich aussehen: Vorschau im Chat (HTML), PowerPoint (.pptx, Text bleibt bearbeitbar)
     und PDF (jede Folie als Bild). „Keynote“ = dieselbe .pptx – auf dem iPad über das Teilen-Menü direkt „In Keynote öffnen“
     (ein .key-Format kann ein Browser nicht schreiben; Keynote übernimmt .pptx vollständig).
   - Bilder: echte, freie Bilder (Wikimedia, über /api/illustration mit source "web" – wie im Chat), passend zugeschnitten
   - Ohne fremde Bibliotheken: ZIP (für .pptx) und PDF werden hier selbst geschrieben
   Folienarten: titel · punkte · bild · zwei · zitat · abschnitt · fazit
   =================================================================== */
const Praesentation = (() => {
  const W = 13.333, H = 7.5; // Zoll, 16:9 wie PowerPoint
  const FONT = 'Helvetica Neue';
  const CSS_FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif';
  const THEMES = {
    hell: { bg: '#FFFFFF', text: '#1D1D1F', sub: '#6E6E73', panel: '#F4F5F7', line: '#E3E4E8', accent: '#2F86FF', onAccent: '#FFFFFF' },
    dunkel: { bg: '#121418', text: '#F5F5F7', sub: '#A1A1A6', panel: '#1E2128', line: '#2C3038', accent: '#6AA8FF', onAccent: '#0E1116' },
    warm: { bg: '#FBF7F0', text: '#2B2118', sub: '#7A6A58', panel: '#F2E9DB', line: '#E6D9C4', accent: '#C8642A', onAccent: '#FFFFFF' },
  };
  const TYPES = ['titel', 'punkte', 'bild', 'zwei', 'zitat', 'abschnitt', 'fazit'];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const xmlEsc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  const str = (x, n) => String(x ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
  const hex = (c) => (/^#[0-9a-f]{6}$/i.test(String(c || '')) ? String(c).toUpperCase() : null);

  /* ---------- Daten prüfen ---------- */
  function parse(raw) {
    let o = null;
    try { o = JSON.parse(String(raw || '').trim()); } catch { return null; }
    if (!o || typeof o !== 'object' || !Array.isArray(o.slides) || !o.slides.length) return null;
    const pts = (a) => (Array.isArray(a) ? a.map((p) => str(p, 160)).filter(Boolean).slice(0, 6) : []);
    const img = (i) => (i && typeof i === 'object' && (i.query || i.prompt) ? { query: str(i.query, 80), prompt: str(i.prompt || i.query, 400) } : null);
    const slides = o.slides.slice(0, 16).map((s) => ({
      type: TYPES.includes(s?.type) ? s.type : 'punkte',
      title: str(s?.title, 110), text: str(s?.text, 420), points: pts(s?.points),
      left: s?.left ? { title: str(s.left.title, 60), points: pts(s.left.points) } : null,
      right: s?.right ? { title: str(s.right.title, 60), points: pts(s.right.points) } : null,
      image: img(s?.image), notes: str(s?.notes, 1200),
    })).filter((s) => s.title || s.text || s.points.length);
    if (!slides.length) return null;
    const theme = THEMES[o.theme] ? o.theme : 'hell';
    return { title: str(o.title || slides[0].title, 110), subtitle: str(o.subtitle, 160), theme, accent: hex(o.accent), slides };
  }

  /* ---------- Text messen und umbrechen (eine Messung für alle drei Ausgaben) ---------- */
  const meas = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;
  const PT = 1 / 72; // Zoll je Punkt
  const widthOf = (t, size, bold) => { if (!meas) return t.length * size * 0.52 * PT; meas.font = `${bold ? 600 : 400} ${size}px ${CSS_FONT}`; return meas.measureText(t).width * PT; };
  function wrap(text, size, bold, maxW) {
    const out = [];
    String(text || '').split('\n').forEach((para) => {
      let line = '';
      para.split(/\s+/).filter(Boolean).forEach((w) => {
        const t = line ? `${line} ${w}` : w;
        if (widthOf(t, size, bold) <= maxW || !line) line = t; else { out.push(line); line = w; }
      });
      out.push(line);
    });
    return out;
  }
  // größte Schrift (in 1-pt-Schritten), bei der der Text in die Fläche passt
  function fit(text, { max, min, bold = false, w, h, lh = 1.2, maxLines = 99 }) {
    for (let s = max; s >= min; s--) {
      const lines = wrap(text, s, bold, w);
      if (lines.length <= maxLines && lines.length * s * lh * PT <= h) return { size: s, lines };
    }
    const lines = wrap(text, min, bold, w);
    const keep = Math.max(1, Math.min(maxLines, Math.floor(h / (min * lh * PT))));
    if (lines.length > keep) { lines.length = keep; lines[keep - 1] = `${lines[keep - 1].replace(/\s+\S*$/, '')} …`; }
    return { size: min, lines };
  }
  // Stichpunkte: gemeinsame Schriftgröße, damit alle in die Fläche passen; Punkt in Akzentfarbe davor
  function bulletList(points, { x, y, w, h, max = 22, min = 13, color, dot, gap = 0.3 }) {
    let size = max, blocks;
    for (; size >= min; size--) {
      blocks = points.map((p) => wrap(p, size, false, w - 0.42));
      const total = blocks.reduce((n, l) => n + l.length * size * 1.25 * PT, 0) + (points.length - 1) * gap * size / 22;
      if (total <= h) break;
    }
    size = Math.max(size, min);
    const items = [];
    let cy = y;
    blocks.forEach((lines) => {
      const lhIn = size * 1.25 * PT;
      items.push({ k: 'ellipse', x: x + 0.04, y: cy + lhIn / 2 - 0.055, w: 0.11, h: 0.11, fill: dot });
      items.push({ k: 'text', x: x + 0.42, y: cy, w: w - 0.42, lines, size, color, lh: 1.25 });
      cy += lines.length * lhIn + gap * size / 22;
    });
    return items;
  }

  /* ---------- Layout: Folie → Bausteine ---------- */
  function layout(deck, slide, i, n, images) {
    const T = { ...THEMES[deck.theme], ...(deck.accent ? { accent: deck.accent } : {}) };
    const im = images.get(slide);
    const out = [{ k: 'rect', x: 0, y: 0, w: W, h: H, fill: T.bg }];
    const text = (txt, o) => { const f = fit(txt, o); out.push({ k: 'text', x: o.x, y: o.y, w: o.w, lines: f.lines, size: f.size, bold: o.bold, color: o.color, align: o.align, lh: o.lh || 1.2 }); return f; };
    const footer = (dark) => {
      out.push({ k: 'text', x: 0.7, y: H - 0.48, w: 8, lines: [deck.title], size: 10, color: dark ? 'rgba(255,255,255,0.7)' : T.sub, lh: 1.2 });
      out.push({ k: 'text', x: W - 1.7, y: H - 0.48, w: 1, lines: [String(i + 1)], size: 10, color: dark ? 'rgba(255,255,255,0.7)' : T.sub, align: 'r', lh: 1.2 });
    };
    const heading = (t, w = W - 1.4) => {
      const f = text(t, { x: 0.7, y: 0.6, w, h: 1.1, max: 32, min: 22, bold: true, color: T.text, maxLines: 2, lh: 1.1 });
      const bottom = 0.6 + f.lines.length * f.size * 1.1 * PT;
      out.push({ k: 'rect', x: 0.7, y: bottom + 0.16, w: 0.7, h: 0.07, fill: T.accent, r: 0.035 });
      return bottom + 0.55;
    };
    const s = slide;
    if (s.type === 'titel') {
      const hasImg = !!im;
      const tw = hasImg ? 5.7 : 10.2;
      if (hasImg) out.push({ k: 'image', x: 6.9, y: 0, w: W - 6.9, h: H, src: im });
      else { out.push({ k: 'ellipse', x: 9.4, y: -1.6, w: 6, h: 6, fill: T.panel }); out.push({ k: 'ellipse', x: 11.2, y: 4.6, w: 2.6, h: 2.6, fill: T.accent, alpha: 0.18 }); }
      out.push({ k: 'rect', x: 0.8, y: 2.05, w: 0.9, h: 0.08, fill: T.accent, r: 0.04 });
      const f = text(s.title || deck.title, { x: 0.8, y: 2.4, w: tw, h: 2.5, max: 46, min: 30, bold: true, color: T.text, maxLines: 3, lh: 1.08 });
      const sub = s.text || deck.subtitle;
      if (sub) text(sub, { x: 0.8, y: 2.4 + f.lines.length * f.size * 1.08 * PT + 0.3, w: tw, h: 1.4, max: 20, min: 14, color: T.sub, maxLines: 3, lh: 1.3 });
    } else if (s.type === 'abschnitt') {
      out[0].fill = T.accent;
      out.push({ k: 'text', x: 0.8, y: 1.6, w: 4, lines: [String(i).padStart(2, '0')], size: 80, bold: true, color: T.onAccent, alpha: 0.35, lh: 1 });
      text(s.title, { x: 0.8, y: 3.2, w: W - 1.6, h: 1.8, max: 44, min: 28, bold: true, color: T.onAccent, maxLines: 2, lh: 1.08 });
      if (s.text) text(s.text, { x: 0.8, y: 5.0, w: W - 3, h: 1.2, max: 20, min: 14, color: T.onAccent, maxLines: 2, alpha: 0.85 });
    } else if (s.type === 'bild' && im) {
      out.push({ k: 'image', x: 0, y: 0, w: W, h: H, src: im });
      out.push({ k: 'rect', x: 0, y: H * 0.45, w: W, h: H * 0.55, fill: '#000000', alpha: 0.5 });
      const f = text(s.title, { x: 0.8, y: 4.4, w: W - 1.6, h: 1.2, max: 36, min: 24, bold: true, color: '#FFFFFF', maxLines: 2, lh: 1.08 });
      const body = s.text || s.points.join(' · ');
      if (body) text(body, { x: 0.8, y: 4.4 + f.lines.length * f.size * 1.08 * PT + 0.2, w: W - 2.4, h: 1.4, max: 18, min: 13, color: 'rgba(255,255,255,0.88)', maxLines: 3, lh: 1.35 });
      footer(true);
    } else if (s.type === 'zwei') {
      const top = heading(s.title);
      const colW = (W - 1.4 - 0.4) / 2;
      [s.left, s.right].forEach((c, k) => {
        const x = 0.7 + k * (colW + 0.4), y = top + 0.05, h = H - y - 0.85;
        out.push({ k: 'rect', x, y, w: colW, h, fill: T.panel, r: 0.18 });
        const ht = c?.title ? text(c.title, { x: x + 0.4, y: y + 0.35, w: colW - 0.8, h: 0.8, max: 20, min: 15, bold: true, color: T.accent, maxLines: 2 }) : null;
        const by = y + 0.35 + (ht ? ht.lines.length * ht.size * 1.2 * PT + 0.25 : 0);
        out.push(...bulletList(c?.points || [], { x: x + 0.4, y: by, w: colW - 0.8, h: y + h - by - 0.3, max: 18, min: 12, color: T.text, dot: T.accent }));
      });
      footer();
    } else if (s.type === 'zitat') {
      out.push({ k: 'rect', x: 0.7, y: 0.7, w: W - 1.4, h: H - 1.6, fill: T.panel, r: 0.25 });
      out.push({ k: 'text', x: 1.3, y: 0.95, w: 2, lines: ['“'], size: 110, bold: true, color: T.accent, lh: 1 });
      const f = text(s.text || s.title, { x: 1.6, y: 2.4, w: W - 3.2, h: 3, max: 32, min: 20, bold: true, color: T.text, align: 'c', maxLines: 5, lh: 1.25 });
      if (s.text && s.title) text(s.title, { x: 1.6, y: 2.4 + f.lines.length * f.size * 1.25 * PT + 0.35, w: W - 3.2, h: 0.6, max: 16, min: 12, color: T.sub, align: 'c', maxLines: 1 });
      footer();
    } else if (s.type === 'fazit') {
      const top = heading(s.title || 'Das Wichtigste');
      const pts = s.points.length ? s.points : [s.text].filter(Boolean);
      if (pts.length <= 3) {
        const cw = (W - 1.4 - (pts.length - 1) * 0.35) / pts.length, y = top + 0.15, h = H - y - 0.95;
        pts.forEach((p, k) => {
          const x = 0.7 + k * (cw + 0.35);
          out.push({ k: 'rect', x, y, w: cw, h, fill: T.panel, r: 0.2 });
          out.push({ k: 'ellipse', x: x + 0.4, y: y + 0.4, w: 0.62, h: 0.62, fill: T.accent });
          out.push({ k: 'text', x: x + 0.4, y: y + 0.52, w: 0.62, lines: [String(k + 1)], size: 18, bold: true, color: T.onAccent, align: 'c', lh: 1 });
          text(p, { x: x + 0.4, y: y + 1.35, w: cw - 0.8, h: h - 1.7, max: 20, min: 13, color: T.text, lh: 1.3 });
        });
      } else out.push(...bulletList(pts, { x: 0.7, y: top + 0.1, w: W - 1.4, h: H - top - 1.0, color: T.text, dot: T.accent }));
      footer();
    } else { // punkte (auch „bild“ ohne Bild)
      const hasImg = !!im;
      const top = heading(s.title, hasImg ? 6.5 : W - 1.4);
      const bw = hasImg ? 6.3 : W - 1.4;
      let y = top;
      if (s.text) { const f = text(s.text, { x: 0.7, y, w: bw, h: s.points.length ? 1.4 : H - y - 1, max: 20, min: 13, color: T.sub, maxLines: s.points.length ? 3 : 12, lh: 1.35 }); y += f.lines.length * f.size * 1.35 * PT + 0.3; }
      if (s.points.length) out.push(...bulletList(s.points, { x: 0.7, y, w: bw, h: H - y - 0.9, color: T.text, dot: T.accent }));
      if (hasImg) out.push({ k: 'image', x: 7.45, y: 0.6, w: W - 7.45 - 0.7, h: H - 1.45, src: im, r: 0.2 });
      footer();
    }
    return out;
  }

  /* ---------- Bilder: freie Bilder über /api/illustration (wie im Chat), passend zugeschnitten ---------- */
  const imgMemo = new Map();
  function loadImage(want) {
    const key = `${want.query}|${want.prompt}`;
    if (imgMemo.has(key)) return imgMemo.get(key);
    const prompt = want.prompt.length >= 20 ? want.prompt : `Foto zum Thema ${want.query || want.prompt}, sachlich, gut erkennbar`;
    const p = (typeof requestIllustration === 'function'
      ? requestIllustration(prompt, want.query || '', 'web')
      : fetch('/api/illustration', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt, query: want.query, source: 'web' }) }).then((r) => (r.ok ? r.json() : Promise.reject(new Error('kein Bild')))))
      .then((r) => {
        if (r.source === 'commons' && /^https:\/\/(upload|thumb)\.wikimedia\.org\//.test(r.url)) return { src: r.url, credit: [r.author, r.license].filter(Boolean).join(' · ') };
        if (/^image\/(png|jpeg|webp)$/.test(r.mime) && r.data) return { src: `data:${r.mime};base64,${r.data}`, credit: '' };
        throw new Error('Bildformat');
      })
      .then((r) => new Promise((res, rej) => { const img = new Image(); img.crossOrigin = 'anonymous'; img.onload = () => res({ img, credit: r.credit }); img.onerror = rej; img.src = r.src; }));
    p.catch(() => imgMemo.delete(key));
    imgMemo.set(key, p);
    return p;
  }
  // Ausschnitt in genau dem Seitenverhältnis der Fläche (wie „cover“), als JPEG
  const cropMemo = new WeakMap();
  function crop(img, w, h) {
    const k = `${w.toFixed(2)}x${h.toFixed(2)}`;
    const m = cropMemo.get(img) || new Map(); cropMemo.set(img, m);
    if (m.has(k)) return m.get(k);
    const PX = 150, cw = Math.round(w * PX), ch = Math.round(h * PX);
    const c = document.createElement('canvas'); c.width = cw; c.height = ch;
    const g = c.getContext('2d');
    const s = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
    const dw = img.naturalWidth * s, dh = img.naturalHeight * s;
    g.drawImage(img, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
    let url = '';
    try { url = c.toDataURL('image/jpeg', 0.86); } catch { url = ''; } // fremdes Bild ohne Freigabe → ohne Bild weiter
    m.set(k, url);
    return url;
  }
  // je Folie mit Bildwunsch das geladene Bild (höchstens 8 Bilder je Präsentation)
  async function loadAll(deck, timeoutMs = 25000) {
    const map = new Map();
    const want = deck.slides.filter((s) => s.image).slice(0, 8);
    await Promise.all(want.map((s) => Promise.race([loadImage(s.image), new Promise((r) => setTimeout(() => r(null), timeoutMs))])
      .then((x) => { if (x?.img) map.set(s, x.img); }).catch(() => {})));
    return map;
  }

  /* ---------- Ausgabe 1: Vorschau (HTML, skaliert mit der Breite der Folie) ---------- */
  const pct = (v, of) => `${((v / of) * 100).toFixed(3)}%`;
  const cq = (pt) => `${((pt * PT) / W * 100).toFixed(3)}cqw`; // Schriftgröße relativ zur Folienbreite
  function slideHtml(items) {
    return items.map((it) => {
      const box = `left:${pct(it.x, W)};top:${pct(it.y, H)};width:${pct(it.w, W)};${it.h != null ? `height:${pct(it.h, H)};` : ''}`;
      const op = it.alpha != null ? `opacity:${it.alpha};` : '';
      if (it.k === 'rect') return `<i class="pz-r" style="${box}background:${it.fill};${op}${it.r ? `border-radius:${cq(it.r * 72)};` : ''}"></i>`;
      if (it.k === 'ellipse') return `<i class="pz-r" style="${box}background:${it.fill};${op}border-radius:50%"></i>`;
      if (it.k === 'image') { const src = crop(it.src, it.w, it.h); return src ? `<img class="pz-i" alt="" src="${src}" style="${box}${it.r ? `border-radius:${cq(it.r * 72)};` : ''}">` : ''; }
      return `<span class="pz-t" style="${box}color:${it.color};${op}font-size:${cq(it.size)};line-height:${it.lh};font-weight:${it.bold ? 600 : 400};text-align:${it.align === 'c' ? 'center' : it.align === 'r' ? 'right' : 'left'}">${it.lines.map(esc).join('<br>')}</span>`;
    }).join('');
  }

  /* ---------- Ausgabe 2: PDF (jede Folie als Bild in voller Größe) ---------- */
  function drawCanvas(items, px = 144) {
    const c = document.createElement('canvas'); c.width = Math.round(W * px); c.height = Math.round(H * px);
    const g = c.getContext('2d');
    const P = (v) => v * px;
    const rr = (x, y, w, h, r) => { g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h); };
    items.forEach((it) => {
      g.save(); g.globalAlpha = it.alpha ?? 1;
      if (it.k === 'rect') { g.fillStyle = it.fill; rr(P(it.x), P(it.y), P(it.w), P(it.h), P(it.r || 0)); g.fill(); }
      else if (it.k === 'ellipse') { g.fillStyle = it.fill; g.beginPath(); g.ellipse(P(it.x + it.w / 2), P(it.y + it.h / 2), P(it.w / 2), P(it.h / 2), 0, 0, Math.PI * 2); g.fill(); }
      else if (it.k === 'image') {
        const src = crop(it.src, it.w, it.h);
        if (src && it._img) { rr(P(it.x), P(it.y), P(it.w), P(it.h), P(it.r || 0)); g.clip(); g.drawImage(it._img, P(it.x), P(it.y), P(it.w), P(it.h)); }
      } else {
        g.fillStyle = it.color; g.textBaseline = 'top';
        const size = it.size * PT * px;
        g.font = `${it.bold ? 600 : 400} ${size}px ${CSS_FONT}`;
        g.textAlign = it.align === 'c' ? 'center' : it.align === 'r' ? 'right' : 'left';
        const ax = it.align === 'c' ? it.x + it.w / 2 : it.align === 'r' ? it.x + it.w : it.x;
        it.lines.forEach((l, k) => g.fillText(l, P(ax), P(it.y) + k * size * it.lh + (size * (it.lh - 1)) / 2));
      }
      g.restore();
    });
    return c;
  }
  // zugeschnittene Bilder vorab als <img> laden (Canvas zeichnet nur fertige Bilder)
  async function readyImages(slidesItems) {
    const all = slidesItems.flat().filter((it) => it.k === 'image');
    await Promise.all(all.map((it) => new Promise((res) => { const src = crop(it.src, it.w, it.h); if (!src) return res(); const im = new Image(); im.onload = () => { it._img = im; res(); }; im.onerror = res; im.src = src; })));
  }
  const b64bytes = (dataUrl) => { const b = atob(dataUrl.split(',')[1]); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };
  const enc = new TextEncoder();
  function pdf(slidesItems, title) {
    const pages = slidesItems.map((items) => b64bytes(drawCanvas(items).toDataURL('image/jpeg', 0.9)));
    const pw = W * 72, ph = H * 72, cw = Math.round(W * 144), ch = Math.round(H * 144);
    const parts = [], offsets = [];
    let len = 0;
    const put = (x) => { const b = typeof x === 'string' ? enc.encode(x) : x; parts.push(b); len += b.length; };
    const obj = (n, body) => { offsets[n] = len; put(`${n} 0 obj\n`); body(); put('\nendobj\n'); };
    put('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
    const n = pages.length, first = 4; // 1 Katalog, 2 Seiten, 3 Infos; je Seite: Seite, Inhalt, Bild
    obj(1, () => put('<< /Type /Catalog /Pages 2 0 R >>'));
    obj(2, () => put(`<< /Type /Pages /Count ${n} /Kids [${pages.map((_, i) => `${first + i * 3} 0 R`).join(' ')}] >>`));
    const pdfStr = (s) => `(${String(s).replace(/[\\()]/g, '\\$&').replace(/[^\x20-\x7E]/g, '')})`;
    obj(3, () => put(`<< /Title ${pdfStr(title)} /Producer (Lern-App) >>`));
    pages.forEach((jpg, i) => {
      const pn = first + i * 3;
      const content = `q ${pw} 0 0 ${ph} 0 0 cm /Im0 Do Q`;
      obj(pn, () => put(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im0 ${pn + 2} 0 R >> >> /Contents ${pn + 1} 0 R >>`));
      obj(pn + 1, () => put(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`));
      obj(pn + 2, () => { put(`<< /Type /XObject /Subtype /Image /Width ${cw} /Height ${ch} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`); put(jpg); put('\nendstream'); });
    });
    const total = first + n * 3;
    const xref = len;
    put(`xref\n0 ${total}\n0000000000 65535 f \n${Array.from({ length: total - 1 }, (_, k) => `${String(offsets[k + 1]).padStart(10, '0')} 00000 n \n`).join('')}`);
    put(`trailer\n<< /Size ${total} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF`);
    return new Blob(parts, { type: 'application/pdf' });
  }

  /* ---------- Ausgabe 3: PowerPoint (.pptx = ZIP mit XML; Text bleibt bearbeitbar) ---------- */
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = (u) => { let c = 0xFFFFFFFF; for (let i = 0; i < u.length; i++) c = CRC[(c ^ u[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  function zip(files) { // ohne Kompression („stored“) – gültig für PowerPoint, Keynote und Google Präsentationen
    const parts = [], central = [];
    let off = 0;
    const u16 = (v) => [v & 255, (v >>> 8) & 255], u32 = (v) => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];
    files.forEach(({ name, data }) => {
      const nb = enc.encode(name), d = typeof data === 'string' ? enc.encode(data) : data, c = crc32(d);
      const head = new Uint8Array([...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(c), ...u32(d.length), ...u32(d.length), ...u16(nb.length), ...u16(0)]);
      parts.push(head, nb, d);
      central.push(new Uint8Array([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(c), ...u32(d.length), ...u32(d.length), ...u16(nb.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(off)]), nb);
      off += head.length + nb.length + d.length;
    });
    const csize = central.reduce((n, b) => n + b.length, 0);
    const end = new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(csize), ...u32(off), ...u16(0)]);
    return new Blob([...parts, ...central, end], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
  }
  const EMU = 914400, e = (v) => Math.round(v * EMU);
  const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
  const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  // Farbe als RGB + Deckkraft (auch „rgba(…)“ aus dem Layout)
  const colorOf = (c, alpha = 1) => {
    const m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/.exec(c || '');
    const rgb = m ? [m[1], m[2], m[3]].map((v) => (+v).toString(16).padStart(2, '0')).join('').toUpperCase() : String(c || '#000000').replace('#', '').toUpperCase();
    const a = (m && m[4] != null ? +m[4] : 1) * alpha;
    return `<a:srgbClr val="${rgb}">${a < 1 ? `<a:alpha val="${Math.round(a * 100000)}"/>` : ''}</a:srgbClr>`;
  };
  function slideXml(items, media) {
    let id = 2;
    const xfrm = (it) => `<a:xfrm><a:off x="${e(it.x)}" y="${e(it.y)}"/><a:ext cx="${Math.max(1, e(it.w))}" cy="${Math.max(1, e(it.h ?? 0.1))}"/></a:xfrm>`;
    const shapes = items.map((it) => {
      const nid = id++;
      if (it.k === 'rect' || it.k === 'ellipse') {
        const geom = it.k === 'ellipse' ? '<a:prstGeom prst="ellipse"><a:avLst/></a:prstGeom>'
          : it.r ? `<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val ${Math.round(Math.min(50000, (it.r / Math.min(it.w, it.h)) * 100000))}"/></a:avLst></a:prstGeom>` : '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>';
        return `<p:sp><p:nvSpPr><p:cNvPr id="${nid}" name="Form ${nid}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(it)}${geom}<a:solidFill>${colorOf(it.fill, it.alpha ?? 1)}</a:solidFill><a:ln><a:noFill/></a:ln></p:spPr></p:sp>`;
      }
      if (it.k === 'image') {
        const m = media.get(it); if (!m) return '';
        const geom = it.r ? `<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val ${Math.round(Math.min(50000, (it.r / Math.min(it.w, it.h)) * 100000))}"/></a:avLst></a:prstGeom>` : '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>';
        return `<p:pic><p:nvPicPr><p:cNvPr id="${nid}" name="Bild ${nid}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${m.rid}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>${xfrm(it)}${geom}</p:spPr></p:pic>`;
      }
      const h = it.lines.length * it.size * it.lh * PT + 0.05;
      const algn = it.align === 'c' ? 'ctr' : it.align === 'r' ? 'r' : 'l';
      const run = (t) => `<a:r><a:rPr lang="de-DE" sz="${Math.round(it.size * 100)}" b="${it.bold ? 1 : 0}" dirty="0"><a:solidFill>${colorOf(it.color, it.alpha ?? 1)}</a:solidFill><a:latin typeface="${FONT}"/><a:cs typeface="${FONT}"/></a:rPr><a:t>${xmlEsc(t)}</a:t></a:r>`;
      const para = `<a:p><a:pPr algn="${algn}"><a:lnSpc><a:spcPct val="${Math.round(it.lh * 100000 * 0.86)}"/></a:lnSpc></a:pPr>${it.lines.map((l, k) => `${k ? `<a:br><a:rPr lang="de-DE" sz="${Math.round(it.size * 100)}"/></a:br>` : ''}${run(l)}`).join('')}</a:p>`;
      return `<p:sp><p:nvSpPr><p:cNvPr id="${nid}" name="Text ${nid}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm({ ...it, h })}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr><p:txBody><a:bodyPr wrap="square" lIns="0" tIns="0" rIns="0" bIns="0" anchor="t"><a:noAutofit/></a:bodyPr><a:lstStyle/>${para}</p:txBody></p:sp>`;
    }).join('');
    return `${XML}<p:sld ${NS}><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${shapes}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
  }
  const THEME_XML = (T) => `${XML}<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Lern-App"><a:themeElements>
<a:clrScheme name="Lern-App"><a:dk1><a:srgbClr val="${T.text.slice(1)}"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="1D1D1F"/></a:dk2><a:lt2><a:srgbClr val="F4F5F7"/></a:lt2><a:accent1><a:srgbClr val="${T.accent.slice(1)}"/></a:accent1><a:accent2><a:srgbClr val="4FCF8A"/></a:accent2><a:accent3><a:srgbClr val="FB9A52"/></a:accent3><a:accent4><a:srgbClr val="B49CFF"/></a:accent4><a:accent5><a:srgbClr val="F07A6E"/></a:accent5><a:accent6><a:srgbClr val="2DD4BF"/></a:accent6><a:hlink><a:srgbClr val="2F86FF"/></a:hlink><a:folHlink><a:srgbClr val="6E6E73"/></a:folHlink></a:clrScheme>
<a:fontScheme name="Lern-App"><a:majorFont><a:latin typeface="${FONT}"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="${FONT}"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>
<a:fmtScheme name="Lern-App"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst>
<a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst>
<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>
<a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>`;
  function pptx(slidesItems, deck) {
    const T = { ...THEMES[deck.theme], ...(deck.accent ? { accent: deck.accent } : {}) };
    const files = [], n = slidesItems.length;
    let mediaN = 0;
    const slideFiles = slidesItems.map((items, i) => {
      const media = new Map(), rels = ['<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>'];
      items.filter((it) => it.k === 'image').forEach((it, k) => {
        const src = crop(it.src, it.w, it.h); if (!src) return;
        const name = `image${++mediaN}.jpeg`, rid = `rId${k + 2}`;
        files.push({ name: `ppt/media/${name}`, data: b64bytes(src) });
        rels.push(`<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${name}"/>`);
        media.set(it, { rid });
      });
      files.push({ name: `ppt/slides/slide${i + 1}.xml`, data: slideXml(items, media) });
      files.push({ name: `ppt/slides/_rels/slide${i + 1}.xml.rels`, data: `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join('')}</Relationships>` });
      return i + 1;
    });
    const ct = `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpeg" ContentType="image/jpeg"/>`
      + '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>'
      + '<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>'
      + '<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>'
      + '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>'
      + '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
      + '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>'
      + slideFiles.map((k) => `<Override PartName="/ppt/slides/slide${k}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join('')
      + '</Types>';
    const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    files.unshift(
      { name: '[Content_Types].xml', data: ct },
      { name: '_rels/.rels', data: `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>` },
      { name: 'docProps/core.xml', data: `${XML}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xmlEsc(deck.title)}</dc:title><dc:creator>Lern-App</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>` },
      { name: 'docProps/app.xml', data: `${XML}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Lern-App</Application><Slides>${n}</Slides></Properties>` },
      { name: 'ppt/presentation.xml', data: `${XML}<p:presentation ${NS} saveSubsetFonts="1"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${slideFiles.map((k) => `<p:sldId id="${255 + k}" r:id="rId${k + 2}"/>`).join('')}</p:sldIdLst><p:sldSz cx="${e(W)}" cy="${e(H)}"/><p:notesSz cx="6858000" cy="9144000"/><p:defaultTextStyle><a:defPPr><a:defRPr lang="de-DE"/></a:defPPr></p:defaultTextStyle></p:presentation>` },
      { name: 'ppt/_rels/presentation.xml.rels', data: `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>${slideFiles.map((k) => `<Relationship Id="rId${k + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${k}.xml"/>`).join('')}</Relationships>` },
      { name: 'ppt/slideMasters/slideMaster1.xml', data: `${XML}<p:sldMaster ${NS}><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="${T.bg.slice(1)}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle><a:lvl1pPr><a:defRPr sz="3200"/></a:lvl1pPr></p:titleStyle><p:bodyStyle><a:lvl1pPr><a:defRPr sz="2000"/></a:lvl1pPr></p:bodyStyle><p:otherStyle><a:lvl1pPr><a:defRPr sz="1800"/></a:lvl1pPr></p:otherStyle></p:txStyles></p:sldMaster>` },
      { name: 'ppt/slideMasters/_rels/slideMaster1.xml.rels', data: `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/></Relationships>` },
      { name: 'ppt/slideLayouts/slideLayout1.xml', data: `${XML}<p:sldLayout ${NS} type="blank" preserve="1"><p:cSld name="Leer"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>` },
      { name: 'ppt/slideLayouts/_rels/slideLayout1.xml.rels', data: `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>` },
      { name: 'ppt/theme/theme1.xml', data: THEME_XML(T) },
    );
    return zip(files);
  }

  /* ---------- Speichern / Teilen ---------- */
  const fileName = (deck, ext) => `${(deck.title || 'Präsentation').replace(/[\\/:*?"<>|]+/g, '').trim().slice(0, 70) || 'Präsentation'}.${ext}`;
  function download(blob, name) {
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  // Keynote: auf iPad/iPhone/Mac das Teilen-Menü mit der .pptx („In Keynote öffnen“); sonst normal laden
  async function share(blob, name) {
    const file = new File([blob], name, { type: blob.type });
    if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title: name }); return true; } catch (err) { if (err?.name === 'AbortError') return true; } }
    download(blob, name);
    return false;
  }

  /* ---------- Karte im Chat ---------- */
  const fi = (n, s = 13) => `<svg width="${s}" height="${s}" aria-hidden="true"><use href="#f-${n}"/></svg>`;
  function figure(raw) {
    const deck = parse(raw);
    const fig = document.createElement('figure');
    fig.className = 'pz';
    if (!deck) { fig.innerHTML = '<div class="pz-wait"><span class="shimmer">Präsentation wird erstellt …</span></div>'; return fig; }
    const n = deck.slides.length;
    fig.innerHTML = `<div class="pz-head"><span class="pz-ic">${fi('slides', 15)}</span><span class="pz-tt"><b>${esc(deck.title)}</b><small>${n} Folien${deck.subtitle ? ` · ${esc(deck.subtitle)}` : ''}</small></span></div>
      <div class="pz-stage"><div class="pz-slide pz-big"></div>
        <button type="button" class="pz-nav prev" data-go="-1" aria-label="Vorherige Folie">${fi('back', 14)}</button><button type="button" class="pz-nav next" data-go="1" aria-label="Nächste Folie">${fi('forward', 14)}</button>
        <span class="pz-count"></span></div>
      <div class="pz-strip">${deck.slides.map((_, i) => `<button type="button" class="pz-thumb" data-i="${i}" aria-label="Folie ${i + 1}"><span class="pz-slide"></span></button>`).join('')}</div>
      <div class="pz-acts">
        <button type="button" class="pz-btn primary" data-out="pptx">${fi('download', 13)}PowerPoint</button>
        <button type="button" class="pz-btn" data-out="key">${fi('share', 13)}Keynote</button>
        <button type="button" class="pz-btn" data-out="pdf">${fi('file', 13)}PDF</button>
        <span class="pz-msg" aria-live="polite"></span>
      </div>`;
    let images = new Map(), cur = 0, items = [];
    const big = fig.querySelector('.pz-big'), thumbs = [...fig.querySelectorAll('.pz-thumb .pz-slide')], msg = fig.querySelector('.pz-msg');
    const draw = () => {
      items = deck.slides.map((s, i) => layout(deck, s, i, n, images));
      thumbs.forEach((t, i) => { t.innerHTML = slideHtml(items[i]); });
      show(cur, 0);
    };
    const show = (i, dir) => {
      cur = Math.max(0, Math.min(n - 1, i));
      big.innerHTML = slideHtml(items[cur]);
      if (dir) { big.classList.remove('in-l', 'in-r'); void big.offsetWidth; big.classList.add(dir > 0 ? 'in-l' : 'in-r'); }
      fig.querySelector('.pz-count').textContent = `${cur + 1} / ${n}`;
      fig.querySelectorAll('.pz-thumb').forEach((b, k) => b.classList.toggle('on', k === cur));
      fig.querySelector('.pz-thumb.on')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    };
    draw();
    // Bilder kommen nach und nach – Folien werden dann neu gesetzt (Text rückt neben das Bild)
    const loading = loadAll(deck).then((m) => { images = m; if (m.size) draw(); return m; });
    if (deck.slides.some((s) => s.image)) { fig.classList.add('loading'); loading.finally(() => fig.classList.remove('loading')); }
    fig.addEventListener('click', async (ev) => {
      const go = ev.target.closest('[data-go]'); if (go) { show(cur + +go.dataset.go, +go.dataset.go); return; }
      const th = ev.target.closest('[data-i]'); if (th) { show(+th.dataset.i, +th.dataset.i - cur); return; }
      const out = ev.target.closest('[data-out]'); if (!out || out.disabled) return;
      fig.querySelectorAll('[data-out]').forEach((b) => { b.disabled = true; });
      msg.textContent = 'Wird erstellt …';
      try {
        await loading;
        await readyImages(items);
        if (out.dataset.out === 'pdf') download(pdf(items, deck.title), fileName(deck, 'pdf'));
        else if (out.dataset.out === 'pptx') download(pptx(items, deck), fileName(deck, 'pptx'));
        else await share(pptx(items, deck), fileName(deck, 'pptx'));
        msg.textContent = out.dataset.out === 'key' ? 'In Keynote öffnen: im Teilen-Menü „Keynote“ wählen' : 'Fertig';
        setTimeout(() => { if (msg.textContent !== 'Wird erstellt …') msg.textContent = ''; }, 5000);
      } catch (err) { msg.textContent = `Hat nicht geklappt (${err.message || 'Fehler'})`; }
      finally { fig.querySelectorAll('[data-out]').forEach((b) => { b.disabled = false; }); }
    });
    fig.addEventListener('keydown', (ev) => { if (ev.key === 'ArrowRight') show(cur + 1, 1); if (ev.key === 'ArrowLeft') show(cur - 1, -1); });
    // Wischen auf dem iPad
    let sx = null;
    big.addEventListener('touchstart', (ev) => { sx = ev.touches[0].clientX; }, { passive: true });
    big.addEventListener('touchend', (ev) => { if (sx == null) return; const dx = ev.changedTouches[0].clientX - sx; if (Math.abs(dx) > 50) show(cur + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1); sx = null; }, { passive: true });
    return fig;
  }
  return { parse, figure, layout, pptx, pdf, THEMES };
})();
if (typeof window !== 'undefined') window.Praesentation = Praesentation;
if (typeof module !== 'undefined') module.exports = Praesentation;
