/* ===================================================================
   Präsentationen des Lern-Agenten (Block ```praesentation im Chat)
   - Die KI liefert nur Inhalt (Titel, Folien, Stichpunkte mit **fett**, Bildwünsche); Gestaltung macht die App:
     EIN Layout-Rechner erzeugt je Folie einfache Bausteine (Fläche, Kreis, Text mit fertigen Zeilen, Bild) in Zoll (13,333 × 7,5 = 16:9).
     Daraus entstehen drei gleich aussehende Ausgaben: Vorschau im Chat (HTML), PowerPoint (.pptx, Text bearbeitbar) und PDF.
     „Keynote“ = dieselbe .pptx – auf dem iPad über das Teilen-Menü „In Keynote öffnen“ (.key kann ein Browser nicht schreiben).
   - **fett** im Text wird wirklich fett gesetzt (Vorschau, PDF und PowerPoint), die Sternchen verschwinden
   - Immer mit Gliederung: fehlt die Folie „gliederung“, setzt die App sie hinter die Titelfolie (aus den Abschnitten)
   - Fünf Designs zum Umschalten in der Karte: Klar · Nacht · Papier · Kräftig · Minimal (Wahl je Präsentation gemerkt)
   - Bilder: echte, freie Bilder (Wikimedia, über /api/illustration mit source "web" – wie im Chat), passend zugeschnitten, mit Bildnachweis
   - Ohne fremde Bibliotheken: ZIP (für .pptx) und PDF werden hier selbst geschrieben
   Folienarten: titel · gliederung · punkte · bild · zahlen · zwei · zitat · abschnitt · fazit
   =================================================================== */
const Praesentation = (() => {
  const W = 13.333, H = 7.5; // Zoll, 16:9 wie PowerPoint
  const FONTS = { sans: { pptx: 'Helvetica Neue', css: '"Helvetica Neue", Helvetica, Arial, sans-serif' }, serif: { pptx: 'Georgia', css: 'Georgia, "Times New Roman", serif' } };
  const FONT = FONTS.sans.pptx;
  const THEMES = {
    klar: { name: 'Klar', bg: '#FFFFFF', soft: '#F3F5F8', text: '#14161A', sub: '#5F6672', panel: '#F2F4F7', line: '#E3E6EB', accent: '#2F6BFF', onAccent: '#FFFFFF', head: 'sans', title: 'split', radius: 0.22 },
    nacht: { name: 'Nacht', bg: '#0E1320', text: '#F4F6FB', sub: '#9AA3B5', panel: '#182033', line: '#273049', accent: '#5EA2FF', onAccent: '#0B1020', head: 'sans', title: 'full', radius: 0.22 },
    papier: { name: 'Papier', bg: '#F6F1E7', text: '#2A2118', sub: '#76695A', panel: '#ECE3D3', line: '#DDD1BC', accent: '#B5532A', onAccent: '#FFFFFF', head: 'serif', title: 'split', radius: 0.08 },
    kraeftig: { name: 'Kräftig', bg: '#FFFFFF', text: '#111111', sub: '#555B66', panel: '#F2F2F2', line: '#E6E6E6', accent: '#FF5A36', onAccent: '#FFFFFF', head: 'sans', title: 'block', radius: 0.3 },
    minimal: { name: 'Minimal', bg: '#FAFAFA', text: '#0A0A0A', sub: '#6B6B6B', panel: '#FFFFFF', line: '#D9D9D9', accent: '#0A0A0A', onAccent: '#FFFFFF', head: 'sans', title: 'minimal', radius: 0, fixedAccent: true },
  };
  const ALIAS = { hell: 'klar', dunkel: 'nacht', warm: 'papier' };
  const themeOf = (deck) => { const T = THEMES.klar; return { ...T, ...(deck.accent && !T.fixedAccent && deck.accent ? { accent: deck.accent } : {}) }; };
  const TYPES = ['titel', 'gliederung', 'punkte', 'bild', 'zahlen', 'zwei', 'zitat', 'abschnitt', 'schritte', 'definition', 'frage', 'fazit', 'quellen', 'ende'];
  // „Titel | Text“, „**Titel**: Text“ oder „Titel: Text“ → Karte/Schritt mit fetter Überschrift
  const splitPt = (p) => {
    const s = String(p || '');
    const m = /^\s*\*\*([^*]{2,60})\*\*\s*[:–—|-]?\s*(.+)$/.exec(s) || /^([^|]{2,70})\|(.+)$/.exec(s) || /^([^:.!?]{2,40}):\s+(.+)$/.exec(s);
    return m ? { t: plain(m[1]).trim(), b: m[2].trim() } : { t: '', b: s.trim() };
  };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const xmlEsc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  const str = (x, n) => String(x ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
  const plain = (x) => String(x ?? '').replace(/\s?\[\d{1,2}(?:\s*[,;–-]\s*\d{1,2})*\](?!\()/g, '').replace(/\*\*|__/g, '').replace(/(^|\s)\*(\S)/g, '$1$2').replace(/(\S)\*(\s|$)/g, '$1$2');
  const hex = (c) => (/^#[0-9a-f]{6}$/i.test(String(c || '')) ? String(c).toUpperCase() : null);

  /* ---------- Daten prüfen ---------- */
  function parse(raw) {
    let o = null;
    // tolerant lesen: Modelle setzen manchmal Kommas zu viel, typografische Anführungszeichen oder Text um das JSON herum
    const src = String(raw || '').trim();
    try { o = JSON.parse(src); } catch {
      try {
        const body = src.slice(src.indexOf('{'), src.lastIndexOf('}') + 1).replace(/,\s*([}\]])/g, '$1');
        try { o = JSON.parse(body); } catch { o = JSON.parse(body.replace(/([{,\[]\s*)[“„]([^"“”„]*)”(\s*:)/g, '$1"$2"$3')); } // typografische Anführungszeichen nur an Schlüsseln
      } catch { return null; }
    }
    if (!o || typeof o !== 'object' || !Array.isArray(o.slides) || !o.slides.length) return null;
    const pts = (a, n = 6) => (Array.isArray(a) ? a.map((p) => str(p, 180)).filter(Boolean).slice(0, n) : []);
    const img = (i) => (i && typeof i === 'object' && (i.query || i.prompt || i.src) ? { query: str(i.query, 80), prompt: str(i.prompt || i.query, 400), ...(i.src ? { src: String(i.src), credit: str(i.credit, 160) } : {}) } : null);
    let slides = o.slides.slice(0, 22).map((s) => ({
      type: TYPES.includes(s?.type) ? s.type : 'punkte',
      title: plain(str(s?.title, 110)), text: str(s?.text, 460), points: pts(s?.points, s?.type === 'gliederung' ? 8 : 6),
      left: s?.left ? { title: plain(str(s.left.title, 60)), points: pts(s.left.points) } : null,
      right: s?.right ? { title: plain(str(s.right.title, 60)), points: pts(s.right.points) } : null,
      image: img(s?.image), notes: str(s?.notes, 1200), ...(['links', 'rechts', 'karten', 'liste'].includes(s?.layout) ? { layout: s.layout } : {}),
    })).filter((s) => s.title || s.text || s.points.length);
    if (!slides.length) return null;
    // Gliederung ist Pflicht: fehlt sie, kommt sie hinter die Titelfolie (Abschnitte, sonst die Folientitel)
    if (!slides.some((s) => s.type === 'gliederung')) {
      const secs = slides.filter((s) => s.type === 'abschnitt').map((s) => s.title);
      const items = (secs.length >= 2 ? secs : slides.filter((s) => !['titel', 'fazit', 'zitat'].includes(s.type)).map((s) => s.title)).filter(Boolean).slice(0, 8);
      if (items.length >= 2) slides.splice(slides[0].type === 'titel' ? 1 : 0, 0, { type: 'gliederung', title: 'Gliederung', text: '', points: items, left: null, right: null, image: null, notes: '' });
    }
    // Ende immer mit Quellen und Schluss-Folie (fehlen sie, setzt die App sie dazu; Bildnachweise kommen beim Zeichnen dazu)
    const sources = (Array.isArray(o.sources) ? o.sources : []).filter((x) => typeof x !== 'number' && !/^\s*\[?\d{1,2}\]?\s*$/.test(String(x))).map((x) => str(typeof x === 'string' ? x : [x?.title, x?.publisher, x?.year, x?.url].filter(Boolean).join(' · '), 220)).filter(Boolean).slice(0, 14);
    if (!slides.some((x) => x.type === 'ende')) slides.push({ type: 'ende', title: 'Vielen Dank!', text: 'Fragen?', points: [], left: null, right: null, image: null, notes: '' });
    if (!slides.some((x) => x.type === 'quellen')) slides.splice(slides.length - 1, 0, { type: 'quellen', title: 'Quellen', text: '', points: [], left: null, right: null, image: null, notes: '' });
    const theme = 'klar'; // nur noch ein Design: „Klar“
    return { title: plain(str(o.title || slides[0].title, 110)), subtitle: plain(str(o.subtitle, 160)), theme, aiTheme: theme, accent: hex(o.accent), sources, slides };
  }

  /* ---------- Text: **fett** in Läufe zerlegen, messen und umbrechen (eine Messung für alle drei Ausgaben) ---------- */
  const meas = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;
  const PT = 1 / 72; // Zoll je Punkt
  const cssFont = (b, size, font) => `${b ? 700 : 400} ${size}px ${FONTS[font || 'sans'].css}`;
  const wWidth = (t, size, b, font) => { if (!meas) return t.length * size * (b ? 0.56 : 0.52) * PT; meas.font = cssFont(b, size, font); return meas.measureText(t).width * PT; };
  // Wörter mit Fett-Kennung; allBold = ganze Zeile fett (Überschriften)
  function words(text, allBold) {
    const out = [];
    String(text || '').split('**').forEach((part, i) => plain(part).split(/\s+/).filter(Boolean).forEach((w) => out.push({ w, b: allBold || i % 2 === 1 })));
    return out;
  }
  const lineWidth = (line, size, font) => line.reduce((n, x, i) => n + wWidth(x.w, size, x.b, font) + (i ? wWidth(' ', size, false, font) : 0), 0);
  function wrap(text, size, bold, maxW, font) {
    const out = [];
    String(text || '').split('\n').forEach((para) => {
      let line = [];
      words(para, bold).forEach((x) => {
        const t = [...line, x];
        if (!line.length || lineWidth(t, size, font) <= maxW) line = t; else { out.push(line); line = [x]; }
      });
      out.push(line);
    });
    return out;
  }
  const cut = (lines, keep) => { if (lines.length > keep) { lines.length = keep; const l = lines[keep - 1]; l[l.length - 1] = { ...l[l.length - 1], w: `${l[l.length - 1].w} …` }; } return lines; };
  // größte Schrift (in 1-pt-Schritten), bei der der Text in die Fläche passt
  function fit(text, { max, min, bold = false, w, h, lh = 1.2, maxLines = 99, font }) {
    for (let s = max; s >= min; s--) {
      const lines = wrap(text, s, bold, w, font);
      if (lines.length <= maxLines && lines.length * s * lh * PT <= h) return { size: s, lines };
    }
    return { size: min, lines: cut(wrap(text, min, bold, w, font), Math.max(1, Math.min(maxLines, Math.floor(h / (min * lh * PT))))) };
  }

  /* ---------- Layout: Folie → Bausteine ---------- */
  function layout(deck, slide, i, n, images) {
    const T = themeOf(deck);
    const imo = images.get(slide), im = imo?.img;
    const out = [{ k: 'rect', x: 0, y: 0, w: W, h: H, fill: T.bg }];
    const M = 0.75; // Rand
    const text = (txt, o) => {
      const f = fit(txt, { font: 'sans', ...o });
      out.push({ k: 'text', x: o.x, y: o.y, w: o.w, lines: f.lines, size: f.size, color: o.color, align: o.align, lh: o.lh || 1.2, alpha: o.alpha, font: o.font || 'sans' });
      return { ...f, bottom: o.y + f.lines.length * f.size * (o.lh || 1.2) * PT };
    };
    // side: Seite, auf der ein randloses Bild liegt ('l'/'r') – dort steht kein Fußtext, die Seitenzahl wird dann hell
    const footer = (dark, side = '') => {
      const c = dark ? 'rgba(255,255,255,0.75)' : T.sub;
      if (T.title === 'minimal' || T.head === 'serif') out.push({ k: 'rect', x: M, y: H - 0.62, w: W - 2 * M, h: 0.012, fill: dark ? 'rgba(255,255,255,0.35)' : T.line, foot: true });
      if (side !== 'l') out.push({ k: 'text', x: side === 'r' ? M : M, y: H - 0.5, w: side === 'r' ? 5 : 6, lines: [words(deck.title)], size: 10, color: c, lh: 1.2, foot: true });
      if (imo?.credit && !side) out.push({ k: 'text', x: 6.9, y: H - 0.5, w: 4.9, lines: [words(`Bild: ${imo.credit}`.slice(0, 80))], size: 8, color: c, align: 'r', lh: 1.2, alpha: 0.8, foot: true });
      out.push({ k: 'text', x: W - M - 0.6, y: H - 0.5, w: 0.6, lines: [words(String(i + 1))], size: 10, color: side === 'r' ? 'rgba(255,255,255,0.85)' : c, align: 'r', lh: 1.2, foot: true });
    };
    // Abschnitt, zu dem die Folie gehört (Kicker über der Überschrift)
    let sec = '';
    if (!['quellen', 'ende', 'fazit'].includes(slide.type)) for (let k = i; k >= 0; k--) if (deck.slides[k].type === 'abschnitt') { sec = deck.slides[k].title; break; }
    const heading = (t, w = W - 2 * M, x = M) => {
      let y = 0.62;
      if (sec && T.title !== 'minimal') { out.push({ k: 'text', x, y, w, lines: [words(sec.toUpperCase(), true)], size: 11, bold: true, color: T.accent, lh: 1.2 }); y += 0.3; }
      const f = text(t, { x, y, w, h: 1.15, max: T.head === 'serif' ? 34 : 32, min: 22, bold: T.head !== 'serif', font: T.head, color: T.text, maxLines: 2, lh: 1.1 });
      if (T.title === 'minimal') { out.push({ k: 'rect', x, y: f.bottom + 0.22, w, h: 0.014, fill: T.line }); return f.bottom + 0.55; }
      out.push({ k: 'rect', x, y: f.bottom + 0.17, w: 0.62, h: 0.07, fill: T.accent, r: 0.035 });
      return f.bottom + 0.58;
    };
    const bullets = (pts, { x, y, w, h, max = 21, min = 13, gap = 0.3 }) => {
      let size = max, blocks;
      for (; size >= min; size--) {
        blocks = pts.map((p) => wrap(p, size, false, w - 0.42));
        const total = blocks.reduce((m, l) => m + l.length * size * 1.28 * PT, 0) + (pts.length - 1) * gap;
        if (total <= h) break;
      }
      size = Math.max(size, min);
      let cy = y;
      blocks.forEach((lines) => {
        const lhIn = size * 1.28 * PT;
        if (T.title === 'minimal') out.push({ k: 'rect', x: x + 0.02, y: cy + lhIn / 2 - 0.01, w: 0.16, h: 0.022, fill: T.text });
        else out.push({ k: 'rect', x: x + 0.02, y: cy + lhIn / 2 - 0.016, w: 0.2, h: 0.032, fill: T.accent, r: 0.016 }); // ruhiger Strich statt Punkt
        out.push({ k: 'text', x: x + 0.42, y: cy, w: w - 0.42, lines, size, color: T.text, lh: 1.28 });
        cy += lines.length * lhIn + gap;
      });
    };
    const R = T.radius;
    const s = slide;
    if (s.type === 'titel') {
      const sub = s.text || deck.subtitle;
      if (T.title === 'full') {
        if (im) { out.push({ k: 'image', x: 0, y: 0, w: W, h: H, src: im }); out.push({ k: 'rect', x: 0, y: 0, w: W, h: H, fill: '#060A14', alpha: 0.55 }); }
        else { out.push({ k: 'ellipse', x: 8.6, y: -2.2, w: 7.4, h: 7.4, fill: T.accent, alpha: 0.16 }); out.push({ k: 'ellipse', x: 10.4, y: 4.4, w: 3.4, h: 3.4, fill: T.accent, alpha: 0.1 }); }
        out.push({ k: 'rect', x: M, y: 3.05, w: 0.9, h: 0.08, fill: T.accent, r: 0.04 });
        const f = text(s.title || deck.title, { x: M, y: 3.35, w: 9.5, h: 2.2, max: 50, min: 30, bold: true, color: '#FFFFFF', maxLines: 3, lh: 1.05 });
        if (sub) text(sub, { x: M, y: f.bottom + 0.3, w: 8.5, h: 1.2, max: 20, min: 14, color: 'rgba(255,255,255,0.82)', maxLines: 2, lh: 1.3 });
      } else if (T.title === 'block') {
        const bw = im ? 6.2 : W;
        out.push({ k: 'rect', x: 0, y: 0, w: bw, h: H, fill: T.accent });
        if (im) out.push({ k: 'image', x: bw, y: 0, w: W - bw, h: H, src: im });
        const f = text(s.title || deck.title, { x: M, y: 2.3, w: bw - 1.5, h: 2.8, max: 52, min: 30, bold: true, color: T.onAccent, maxLines: 3, lh: 1.02 });
        if (sub) text(sub, { x: M, y: f.bottom + 0.3, w: bw - 1.5, h: 1.3, max: 20, min: 14, color: T.onAccent, alpha: 0.88, maxLines: 3, lh: 1.3 });
      } else if (T.title === 'minimal') {
        if (im) out.push({ k: 'image', x: 8.4, y: M, w: W - 8.4 - M, h: H - 2 * M, src: im });
        const tw = im ? 6.9 : 11;
        const f = text(s.title || deck.title, { x: M, y: 2.4, w: tw, h: 2.6, max: 56, min: 32, bold: true, color: T.text, maxLines: 3, lh: 1.0 });
        out.push({ k: 'rect', x: M, y: f.bottom + 0.3, w: tw, h: 0.014, fill: T.text });
        if (sub) text(sub, { x: M, y: f.bottom + 0.5, w: tw, h: 1.2, max: 18, min: 13, color: T.sub, maxLines: 2, lh: 1.35 });
      } else if (im && T.title === 'split' && T.head !== 'serif') { // Klar mit Foto: bildfüllend, ruhiger Dunkelverlauf unten, Titel weiß
        out.push({ k: 'image', x: 0, y: 0, w: W, h: H, src: im });
        out.push({ k: 'rect', x: 0, y: 0, w: W, h: H, fill: '#05070C', alpha: 0.22 });
        out.push({ k: 'rect', x: 0, y: H * 0.4, w: W, h: H * 0.6, fill: '#05070C', alpha: 0.42 });
        out.push({ k: 'rect', x: M + 0.05, y: 3.6, w: 0.9, h: 0.08, fill: T.accent, r: 0.04 });
        const f = text(s.title || deck.title, { x: M + 0.05, y: 3.9, w: 10.8, h: 1.95, max: 50, min: 30, bold: true, color: '#FFFFFF', maxLines: 2, lh: 1.05 });
        if (sub) text(sub, { x: M + 0.05, y: f.bottom + 0.25, w: 9.6, h: 1.0, max: 20, min: 14, color: 'rgba(255,255,255,0.86)', maxLines: 2, lh: 1.3 });
      } else { // split (Klar ohne Foto, Papier)
        const tw = im ? 5.6 : 10.4;
        if (im) out.push({ k: 'image', x: 6.85, y: 0, w: W - 6.85, h: H, src: im });
        out.push({ k: 'rect', x: M + 0.05, y: 2.05, w: 0.9, h: 0.08, fill: T.accent, r: 0.04 });
        const f = text(s.title || deck.title, { x: M + 0.05, y: 2.4, w: tw, h: 2.6, max: T.head === 'serif' ? 50 : 46, min: 30, bold: T.head !== 'serif', font: T.head, color: T.text, maxLines: 3, lh: 1.06 });
        if (sub) text(sub, { x: M + 0.05, y: f.bottom + 0.3, w: tw, h: 1.4, max: 22, min: 16, color: T.text, maxLines: 3, lh: 1.3 });
      }
    } else if (s.type === 'gliederung') {
      sec = '';
      const top = heading(s.title || 'Gliederung');
      const items = s.points.length ? s.points : [];
      const two = items.length > 4, colW = two ? (W - 2 * M - 0.5) / 2 : W - 2 * M, rows = two ? Math.ceil(items.length / 2) : items.length;
      const rh = Math.min(1.05, (H - top - 0.95) / Math.max(rows, 1));
      items.forEach((p, k) => {
        const col = two && k >= rows ? 1 : 0, r = two ? k % rows : k;
        const x = M + col * (colW + 0.5), y = top + r * rh;
        out.push({ k: 'text', x, y: y + 0.02, w: 0.9, lines: [words(String(k + 1).padStart(2, '0'), true)], size: 26, bold: true, color: T.accent, lh: 1.1, font: T.head });
        text(p, { x: x + 0.95, y: y + 0.08, w: colW - 1.0, h: rh - 0.2, max: 21, min: 14, color: T.text, maxLines: 2, lh: 1.2 });
        if (r < rows - 1) out.push({ k: 'rect', x: x + 0.95, y: y + rh - 0.1, w: colW - 0.95, h: 0.012, fill: T.line });
      });
      footer();
    } else if (s.type === 'abschnitt' && im && T.title === 'split') { // Abschnitt mit Foto: bildfüllend, Nummer in Akzentfarbe, Titel weiß
      const num = deck.slides.slice(0, i + 1).filter((x) => x.type === 'abschnitt').length;
      out.push({ k: 'image', x: 0, y: 0, w: W, h: H, src: im });
      out.push({ k: 'rect', x: 0, y: 0, w: W, h: H, fill: '#05070C', alpha: 0.5 });
      out.push({ k: 'text', x: M, y: 2.1, w: 4, lines: [words(String(num).padStart(2, '0'), true)], size: 72, bold: true, color: T.accent, lh: 1 });
      text(s.title, { x: M, y: 3.45, w: W - 2 * M - 1, h: 1.9, max: 46, min: 28, bold: true, color: '#FFFFFF', maxLines: 2, lh: 1.06 });
    } else if (s.type === 'abschnitt') {
      const num = deck.slides.slice(0, i + 1).filter((x) => x.type === 'abschnitt').length;
      const dark = T.title !== 'minimal';
      if (dark) out[0].fill = T.title === 'full' ? T.panel : T.accent;
      const fg = T.title === 'minimal' ? T.text : T.title === 'full' ? T.text : T.onAccent;
      if (im && T.title !== 'minimal') { out.push({ k: 'image', x: 8.3, y: 0, w: W - 8.3, h: H, src: im }); }
      const tw = im && T.title !== 'minimal' ? 6.8 : W - 2 * M;
      out.push({ k: 'text', x: M, y: 1.55, w: 4, lines: [words(String(num).padStart(2, '0'), true)], size: T.title === 'minimal' ? 120 : 84, bold: true, color: T.title === 'full' ? T.accent : fg, alpha: T.title === 'full' ? 1 : 0.35, lh: 1, font: T.head });
      const f = text(s.title, { x: M, y: 3.35, w: tw, h: 1.9, max: 46, min: 28, bold: T.head !== 'serif', font: T.head, color: fg, maxLines: 2, lh: 1.06 });
      void f;
    } else if (s.type === 'bild' && im) {
      out.push({ k: 'image', x: 0, y: 0, w: W, h: H, src: im });
      out.push({ k: 'rect', x: 0, y: H * 0.5, w: W, h: H * 0.5, fill: '#05070C', alpha: 0.58 });
      const f = text(s.title, { x: M, y: 4.55, w: W - 2 * M, h: 1.1, max: 36, min: 24, bold: true, color: '#FFFFFF', maxLines: 2, lh: 1.06 });
      const body = s.text || s.points.join(' · ');
      if (body) text(body, { x: M, y: f.bottom + 0.18, w: W - 2.6, h: 1.25, max: 18, min: 13, color: 'rgba(255,255,255,0.9)', maxLines: 3, lh: 1.35 });
      footer(true);
    } else if (s.type === 'zahlen') {
      if (T.title === 'split') out[0].fill = T.soft;
      const top = heading(s.title);
      const items = (s.points.length ? s.points : [s.text]).filter(Boolean).slice(0, 4).map((p) => { const [v, ...l] = String(p).split('|'); return { v: plain(v.trim()), l: l.join('|').trim() }; });
      const cw = (W - 2 * M - (items.length - 1) * 0.35) / Math.max(items.length, 1), y = top + 0.2, h = H - y - 1.0;
      items.forEach((it, k) => {
        const x = M + k * (cw + 0.35);
        out.push({ k: 'rect', x, y, w: cw, h, fill: T.title === 'split' ? '#FFFFFF' : T.panel, r: R });
        const fv = text(it.v, { x: x + 0.35, y: y + 0.45, w: cw - 0.7, h: 1.2, max: 54, min: 26, bold: true, color: T.accent, maxLines: 1, lh: 1.05, font: T.head });
        if (it.l) text(it.l, { x: x + 0.35, y: fv.bottom + 0.25, w: cw - 0.7, h: y + h - fv.bottom - 0.6, max: 18, min: 12, color: T.text, lh: 1.3 });
      });
      footer();
    } else if (s.type === 'zwei') {
      const top = heading(s.title);
      const colW = (W - 2 * M - 0.4) / 2;
      [s.left, s.right].forEach((c, k) => {
        const x = M + k * (colW + 0.4), y = top + 0.05, h = H - y - 0.9;
        out.push({ k: 'rect', x, y, w: colW, h, fill: T.panel, r: R });
        if (T.title !== 'minimal') out.push({ k: 'rect', x, y, w: colW, h: 0.08, fill: k ? T.text : T.accent, alpha: k ? 0.85 : 1, r: Math.min(R, 0.04) });
        const ht = c?.title ? text(c.title, { x: x + 0.4, y: y + 0.38, w: colW - 0.8, h: 0.8, max: 20, min: 15, bold: true, color: k ? T.text : T.accent, maxLines: 2, font: T.head }) : null;
        bullets(c?.points || [], { x: x + 0.4, y: ht ? ht.bottom + 0.25 : y + 0.4, w: colW - 0.8, h: y + h - (ht ? ht.bottom + 0.25 : y + 0.4) - 0.3, max: 18, min: 12, gap: 0.22 });
      });
      footer();
    } else if (s.type === 'zitat') {
      if (T.title === 'minimal') out.push({ k: 'rect', x: M, y: 1.0, w: 0.06, h: H - 2.4, fill: T.text });
      else out.push({ k: 'rect', x: M, y: 0.75, w: W - 2 * M, h: H - 1.65, fill: T.panel, r: R });
      out.push({ k: 'text', x: 1.3, y: 0.95, w: 2, lines: [words('“', true)], size: 120, bold: true, color: T.accent, lh: 1, font: 'serif' });
      const f = text(s.text || s.title, { x: 1.7, y: 2.45, w: W - 3.4, h: 3, max: 32, min: 20, bold: T.head !== 'serif', font: T.head, color: T.text, align: 'c', maxLines: 5, lh: 1.25 });
      if (s.text && s.title) text(s.title, { x: 1.7, y: f.bottom + 0.35, w: W - 3.4, h: 0.6, max: 15, min: 12, color: T.sub, align: 'c', maxLines: 1 });
      footer();
    } else if (s.type === 'schritte') { // Ablauf/Zeitleiste: nummerierte Stationen auf einer Linie, darunter je eine Karte
      out[0].fill = T.soft;
      const top = heading(s.title);
      const parts = (s.points.length ? s.points : [s.text]).filter(Boolean).slice(0, 6).map(splitPt);
      const n = Math.max(parts.length, 1), gap = 0.24, cw = (W - 2 * M - (n - 1) * gap) / n, cy = top + 0.42;
      if (n > 1) out.push({ k: 'rect', x: M + cw / 2, y: cy - 0.012, w: (n - 1) * (cw + gap), h: 0.024, fill: T.accent, alpha: 0.35 });
      parts.forEach((p, k) => {
        const x = M + k * (cw + gap), by = cy + 0.58, bh = H - by - 0.95;
        out.push({ k: 'ellipse', x: x + cw / 2 - 0.29, y: cy - 0.29, w: 0.58, h: 0.58, fill: T.accent });
        out.push({ k: 'text', x: x + cw / 2 - 0.29, y: cy - 0.125, w: 0.58, lines: [words(String(k + 1), true)], size: 15, bold: true, color: T.onAccent, align: 'c', lh: 1 });
        out.push({ k: 'rect', x, y: by, w: cw, h: bh, fill: '#FFFFFF', r: R });
        let ty = by + 0.3;
        if (p.t) { const f = text(p.t, { x: x + 0.24, y: ty, w: cw - 0.48, h: 0.85, max: 21, min: 12, bold: true, color: T.text, maxLines: 2, lh: 1.15, align: 'c' }); ty = f.bottom + 0.14; }
        text(p.b, { x: x + 0.24, y: ty, w: cw - 0.48, h: by + bh - ty - 0.25, max: 18, min: 11, color: p.t ? T.sub : T.text, lh: 1.32, align: 'c' });
      });
      footer();
    } else if (s.type === 'definition') { // Begriff groß, Erklärung, Beispiele im ruhigen Kasten (optional Bild rechts)
      const iw = im ? 4.3 : 0, tw = W - 2 * M - (im ? iw + 0.5 : 0);
      out.push({ k: 'text', x: M, y: 0.85, w: tw, lines: [words('DEFINITION', true)], size: 11, bold: true, color: T.accent, lh: 1.2 });
      const ft = text(s.title, { x: M, y: 1.2, w: tw, h: 1.35, max: 44, min: 26, bold: true, color: T.text, maxLines: 2, lh: 1.05 });
      out.push({ k: 'rect', x: M, y: ft.bottom + 0.2, w: 0.62, h: 0.07, fill: T.accent, r: 0.035 });
      const fd = s.text ? text(s.text, { x: M, y: ft.bottom + 0.5, w: tw, h: 2.2, max: 23, min: 14, color: T.text, lh: 1.36, maxLines: 6 }) : { bottom: ft.bottom + 0.5 };
      if (s.points.length) {
        const y = Math.max(fd.bottom + 0.35, 4.2), h = H - y - 0.9;
        out.push({ k: 'rect', x: M, y, w: tw, h, fill: T.soft, r: R });
        bullets(s.points.slice(0, 3), { x: M + 0.35, y: y + 0.28, w: tw - 0.7, h: h - 0.5, max: 17, min: 11, gap: 0.16 });
      }
      if (im) out.push({ k: 'image', x: W - M - iw, y: 0.85, w: iw, h: H - 1.75, src: im, r: R });
      footer();
    } else if (s.type === 'frage') { // Einstieg: eine Frage groß in der Mitte (mit Foto bildfüllend)
      if (im) { out.push({ k: 'image', x: 0, y: 0, w: W, h: H, src: im }); out.push({ k: 'rect', x: 0, y: 0, w: W, h: H, fill: '#05070C', alpha: 0.58 }); } else out[0].fill = T.soft;
      out.push({ k: 'rect', x: W / 2 - 0.45, y: 2.45, w: 0.9, h: 0.08, fill: T.accent, r: 0.04 });
      text(s.title || s.text, { x: 1.3, y: 2.85, w: W - 2.6, h: 2.4, max: 40, min: 24, bold: true, color: im ? '#FFFFFF' : T.text, align: 'c', maxLines: 3, lh: 1.14 });
      footer(!!im);
    } else if (s.type === 'fazit') {
      if (T.title === 'split') out[0].fill = T.soft;
      const top = heading(s.title || 'Das Wichtigste');
      const pts = s.points.length ? s.points : [s.text].filter(Boolean);
      if (pts.length <= 4) {
        const cw = (W - 2 * M - (pts.length - 1) * 0.3) / pts.length, y = top + 0.15, h = H - y - 0.95;
        pts.forEach((p, k) => {
          const x = M + k * (cw + 0.3);
          out.push({ k: 'rect', x, y, w: cw, h, fill: T.title === 'split' ? '#FFFFFF' : T.panel, r: R });
          out.push({ k: 'ellipse', x: x + 0.38, y: y + 0.4, w: 0.62, h: 0.62, fill: T.accent });
          out.push({ k: 'text', x: x + 0.38, y: y + 0.53, w: 0.62, lines: [words(String(k + 1), true)], size: 18, bold: true, color: T.onAccent, align: 'c', lh: 1 });
          text(p, { x: x + 0.38, y: y + 1.35, w: cw - 0.76, h: h - 1.7, max: 19, min: 12, color: T.text, lh: 1.32 });
        });
      } else bullets(pts, { x: M, y: top + 0.1, w: W - 2 * M, h: H - top - 1.0 });
      footer();
    } else if (s.type === 'quellen') {
      const top = heading(s.title || 'Quellen');
      const credits = [...images.entries()].filter(([, v]) => v?.credit).map(([sl, v]) => `Bild „${sl.title || deck.title}“: ${v.credit}`.slice(0, 200));
      const list = [...(s.points.length ? s.points : deck.sources || []), ...credits];
      if (!list.length) list.push('Eigenes Wissen und Unterrichtsmaterial');
      const two = list.length > 7, colW = two ? (W - 2 * M - 0.5) / 2 : W - 2 * M, per = two ? Math.ceil(list.length / 2) : list.length;
      [list.slice(0, per), list.slice(per)].forEach((col, c) => {
        if (!col.length) return;
        let y = top;
        const avail = H - top - 0.9, each = avail / per;
        col.forEach((x) => {
          const href = (/https?:\/\/\S+/.exec(String(x)) || [])[0];
          const f = text(x, { x: M + c * (colW + 0.5) + 0.3, y, w: colW - 0.3, h: Math.max(0.35, each - 0.08), max: 15, min: 9, color: T.text, lh: 1.25, maxLines: 3 });
          if (href) out[out.length - 1].href = href.replace(/[).,;]+$/, ''); // Quelle als Link (Vorschau)
          out.push({ k: 'ellipse', x: M + c * (colW + 0.5) + 0.04, y: y + f.size * 1.25 * PT / 2 - 0.045, w: 0.09, h: 0.09, fill: T.accent });
          y = Math.max(f.bottom + 0.12, y + 0.3);
        });
      });
      footer();
    } else if (s.type === 'ende') {
      if (T.title === 'full' || T.title === 'block') out[0].fill = T.title === 'full' ? T.bg : T.accent;
      const fg = T.title === 'block' ? T.onAccent : T.text;
      if (im && T.title === 'full') { out.push({ k: 'image', x: 0, y: 0, w: W, h: H, src: im }); out.push({ k: 'rect', x: 0, y: 0, w: W, h: H, fill: '#060A14', alpha: 0.6 }); }
      const f = text(s.title || 'Vielen Dank!', { x: M, y: 2.6, w: W - 2 * M, h: 1.6, max: 60, min: 36, bold: T.head !== 'serif', font: T.head, color: im && T.title === 'full' ? '#FFFFFF' : fg, align: 'c', maxLines: 1, lh: 1.05 });
      if (s.text) text(s.text, { x: M, y: f.bottom + 0.25, w: W - 2 * M, h: 0.9, max: 24, min: 16, color: im && T.title === 'full' ? 'rgba(255,255,255,0.85)' : T.title === 'block' ? T.onAccent : T.sub, align: 'c', maxLines: 2 });
      out.push({ k: 'rect', x: W / 2 - 0.45, y: 2.25, w: 0.9, h: 0.08, fill: T.title === 'block' ? T.onAccent : T.accent, r: 0.04 });
    } else { // punkte (auch „bild“ ohne Bild) – Aufbau nach Inhalt: Bild als halbe Folie, Karten (mit Titel), zwei Spalten oder ruhige Liste
      const hasImg = !!im;
      const pts = s.points.length ? s.points : [];
      const parts = pts.map(splitPt);
      const titled = parts.length >= 2 && parts.length <= 4 && parts.every((p) => p.t);
      const cards = !hasImg && s.layout !== 'liste' && (s.layout === 'karten' || titled
        || (!s.layout && pts.length >= 3 && pts.length <= 4 && pts.every((x) => plain(x).length <= 80) && i % 2 === 1)); // kurze Kernaussagen → Kacheln
      const cols2 = !hasImg && !cards && s.layout !== 'liste' && pts.length >= 5;
      if (cards) {
        out[0].fill = T.soft; // Karten auf ruhigem Grau: weiße Kacheln
        const top = heading(s.title);
        const n = pts.length, cols = n === 4 ? 2 : Math.min(n, 3), rows = Math.ceil(n / cols), gap = 0.28;
        const avail = H - top - 0.95, cw = (W - 2 * M - (cols - 1) * gap) / cols;
        const ch = Math.min((avail - (rows - 1) * gap) / rows, rows === 1 ? 3.7 : 2.35); // Kacheln füllen die Folie, aber nicht bis zum Rand
        const y0 = top + Math.max(0, avail - rows * ch - (rows - 1) * gap) * 0.3;
        parts.forEach((p, k) => {
          const x = M + (k % cols) * (cw + gap), y = y0 + Math.floor(k / cols) * (ch + gap);
          out.push({ k: 'rect', x, y, w: cw, h: ch, fill: '#FFFFFF', r: R });
          out.push({ k: 'rect', x: x + 0.34, y: y + 0.36, w: 0.42, h: 0.05, fill: T.accent, r: 0.025 });
          let ty = y + 0.58;
          if (p.t) { const f = text(p.t, { x: x + 0.34, y: ty, w: cw - 0.68, h: 0.85, max: 23, min: 14, bold: true, color: T.text, maxLines: 2, lh: 1.15 }); ty = f.bottom + 0.14; }
          text(p.b, { x: x + 0.34, y: ty, w: cw - 0.68, h: y + ch - ty - 0.3, max: p.t ? 19 : 22, min: 12, color: p.t ? T.sub : T.text, lh: 1.34 });
        });
      } else if (cols2) { // viele Punkte: zwei ruhige Spalten statt einer langen Liste
        const top = heading(s.title);
        const half = Math.ceil(pts.length / 2), cw = (W - 2 * M - 0.6) / 2;
        [pts.slice(0, half), pts.slice(half)].forEach((col, c) => bullets(col, { x: M + c * (cw + 0.6), y: top, w: cw, h: H - top - 0.9, max: 19, min: 12, gap: 0.26 }));
      } else if (hasImg && T.title === 'split') { // Bild als halbe Folie bis an den Rand, Seite wechselt von Folie zu Folie
        const imgLeft = s.layout === 'links' || (s.layout !== 'rechts' && i % 2 === 0);
        const iw = 5.55, tx = imgLeft ? iw + 0.7 : M, tw = W - iw - 0.7 - M;
        out.push({ k: 'image', x: imgLeft ? 0 : W - iw, y: 0, w: iw, h: H, src: im });
        const top0 = heading(s.title, tw, tx);
        let y = top0;
        if (s.text && !pts.length) { const f = text(s.text, { x: tx, y, w: tw, h: H - y - 1, max: 20, min: 13, color: T.text, maxLines: 12, lh: 1.4 }); y = f.bottom + 0.3; }
        if (pts.length) bullets(pts, { x: tx, y, w: tw, h: H - y - 0.9, max: 19, min: 12 });
        footer(false, imgLeft ? 'l' : 'r');
        return out;
      } else {
        const imgLeft = hasImg && (s.layout === 'links' || (s.layout !== 'rechts' && i % 2 === 0));
        const bw = hasImg ? 6.35 : W - 2 * M, tx = imgLeft ? W - M - bw : M;
        const top0 = heading(s.title, hasImg ? bw : W - 2 * M);
        // Überschrift steht links; bei Bild links rückt der Inhalt nach rechts
        let y = top0;
        if (s.text && !pts.length) { const f = text(s.text, { x: tx, y, w: bw, h: H - y - 1, max: 21, min: 14, color: T.text, maxLines: 12, lh: 1.4 }); y = f.bottom + 0.3; }
        if (pts.length) bullets(pts, { x: tx, y, w: bw, h: H - y - 0.9 });
        if (hasImg) {
          const iw = W - bw - 2 * M - 0.45, ix = imgLeft ? M : W - M - iw, iy = T.title === 'minimal' ? M : 0.6;
          out.push({ k: 'image', x: ix, y: imgLeft ? top0 - 0.1 : iy, w: iw, h: imgLeft ? H - top0 - 0.8 : H - (T.title === 'minimal' ? 2 * M : 1.4), src: im, r: R });
        }
      }
      footer();
    }
    return out;
  }

  /* ---------- Bilder: freie Bilder über /api/illustration (wie im Chat), passend zugeschnitten ---------- */
  const imgMemo = new Map();
  const toImg = (src, credit) => new Promise((res, rej) => { const img = new Image(); img.crossOrigin = 'anonymous'; img.onload = () => res({ img, credit }); img.onerror = rej; img.src = src; });
  // Erst ein wirklich passendes freies Foto (Wikimedia, von Gemini geprüft); gibt es keins, ein passendes KI-Bild (Fotostil) – nie ein unpassendes Foto
  function loadImage(want) {
    const key = want.src ? `src:${want.src.slice(0, 120)}${want.src.length}` : `${want.query}|${want.prompt}`;
    if (imgMemo.has(key)) return imgMemo.get(key);
    const prompt = want.prompt.length >= 20 ? want.prompt : `Foto zum Thema ${want.query || want.prompt}, sachlich, gut erkennbar`;
    const p = (want.src ? toImg(want.src, want.credit || '')
      : fetch('/api/illustration', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt, query: want.query, source: 'webonly' }) })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error('kein Foto'))))
        .then((r) => {
          if (r.source === 'commons' && /^https:\/\/(upload|thumb)\.wikimedia\.org\//.test(r.url)) return toImg(r.url, [r.author, r.license].filter(Boolean).join(' · ').replace(/<[^>]+>/g, ''));
          if (r.source === 'ai' && /^data:image\//.test(r.url || '')) return toImg(r.url, 'KI-Bild'); // kein passendes Foto → passendes KI-Bild
          throw new Error('kein Foto');
        }));
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
  // je Folie mit Bildwunsch das geladene Bild (höchstens 10 Bilder je Präsentation)
  async function loadAll(deck, timeoutMs = 30000) {
    const map = new Map();
    const want = deck.slides.filter((s) => s.image).slice(0, 6); // max. 6 Bilder, 30 s – sonst dauert die Präsentation zu lange
    await Promise.all(want.map((s) => Promise.race([loadImage(s.image), new Promise((r) => setTimeout(() => r(null), timeoutMs))])
      .then((x) => { if (x?.img) map.set(s, x); }).catch(() => {})));
    return map;
  }

  /* ---------- Ausgabe 1: Vorschau (HTML, skaliert mit der Breite der Folie) ---------- */
  const pct = (v, of) => `${((v / of) * 100).toFixed(3)}%`;
  const cq = (pt) => `${((pt * PT) / W * 100).toFixed(3)}cqw`; // Schriftgröße relativ zur Folienbreite
  const lineHtml = (line) => line.map((x, i) => `${i ? ' ' : ''}${x.b ? `<b>${esc(x.w)}</b>` : esc(x.w)}`).join('');
  // anim: Elemente blenden nacheinander weich ein (wie die Animationen in PowerPoint/Keynote)
  function slideHtml(items, anim = false) {
    let order = 0;
    return items.map((it, idx) => {
      const a = anim && idx > 0 && !it.foot ? `animation-delay:${Math.min(order++, 14) * 70}ms;` : '';
      const box = `left:${pct(it.x, W)};top:${pct(it.y, H)};width:${pct(it.w, W)};${it.h != null ? `height:${pct(it.h, H)};` : ''}${a}`;
      const op = it.alpha != null ? `opacity:${it.alpha};` : '';
      if (it.k === 'rect') return `<i class="pz-r${a ? ' pz-a' : ''}" style="${box}background:${it.fill};${op}${it.r ? `border-radius:${cq(it.r * 72)};` : ''}"></i>`;
      if (it.k === 'ellipse') return `<i class="pz-r${a ? ' pz-a' : ''}" style="${box}background:${it.fill};${op}border-radius:50%"></i>`;
      if (it.k === 'image') { const src = crop(it.src, it.w, it.h); return src ? `<img class="pz-i${a ? ' pz-a' : ''}" alt="" src="${src}" style="${box}${it.r ? `border-radius:${cq(it.r * 72)};` : ''}">` : ''; }
      if (it.href) return `<a class="pz-t pz-link${a ? ' pz-a' : ''}" href="${esc(it.href)}" target="_blank" rel="noopener" style="${box}color:${it.color};${op}font-family:${FONTS[it.font || 'sans'].css.replace(/"/g, "'")};font-size:${cq(it.size)};line-height:${it.lh};text-align:${it.align === 'c' ? 'center' : it.align === 'r' ? 'right' : 'left'}">${it.lines.map(lineHtml).join('<br>')}</a>`;
      return `<span class="pz-t${a ? ' pz-a' : ''}" style="${box}color:${it.color};${op}font-family:${FONTS[it.font || 'sans'].css.replace(/"/g, "'")};font-size:${cq(it.size)};line-height:${it.lh};text-align:${it.align === 'c' ? 'center' : it.align === 'r' ? 'right' : 'left'}">${it.lines.map(lineHtml).join('<br>')}</span>`;
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
        if (it._img) { rr(P(it.x), P(it.y), P(it.w), P(it.h), P(it.r || 0)); g.clip(); g.drawImage(it._img, P(it.x), P(it.y), P(it.w), P(it.h)); }
      } else {
        g.fillStyle = it.color; g.textBaseline = 'top'; g.textAlign = 'left';
        const size = it.size * PT * px, sizePt = it.size;
        it.lines.forEach((line, k) => {
          const lw = lineWidth(line, sizePt, it.font) * px;
          let x = P(it.x) + (it.align === 'c' ? (P(it.w) - lw) / 2 : it.align === 'r' ? P(it.w) - lw : 0);
          const y = P(it.y) + k * size * it.lh + (size * (it.lh - 1)) / 2;
          line.forEach((wd, j) => {
            if (j) { g.font = cssFont(false, size, it.font); x += g.measureText(' ').width; }
            g.font = cssFont(wd.b, size, it.font);
            g.fillText(wd.w, x, y);
            x += g.measureText(wd.w).width;
          });
        });
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
  // Übergang (Überblenden) und Einblenden aller Elemente nacheinander, automatisch – PowerPoint und Keynote übernehmen das beim Öffnen
  function timingXml(targets) {
    if (!targets.length) return '';
    let cid = 4;
    const effects = targets.slice(0, 24).map((t, k) => {
      const a = cid++, b = cid++, c = cid++;
      return `<p:par><p:cTn id="${a}" presetID="10" presetClass="entr" presetSubtype="0" fill="hold"${t.text ? ' grpId="0"' : ''} nodeType="withEffect"><p:stCondLst><p:cond delay="${Math.min(k, 14) * 140}"/></p:stCondLst><p:childTnLst>`
        + `<p:set><p:cBhvr><p:cTn id="${b}" dur="1" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst></p:cTn><p:tgtEl><p:spTgt spid="${t.id}"/></p:tgtEl><p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr><p:to><p:strVal val="visible"/></p:to></p:set>`
        + `<p:animEffect transition="in" filter="fade"><p:cBhvr><p:cTn id="${c}" dur="500"/><p:tgtEl><p:spTgt spid="${t.id}"/></p:tgtEl></p:cBhvr></p:animEffect></p:childTnLst></p:cTn></p:par>`;
    }).join('');
    const bld = targets.slice(0, 24).filter((t) => t.text).map((t) => `<p:bldP spid="${t.id}" grpId="0"/>`).join('');
    return `<p:timing><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst><p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst>`
      + `<p:par><p:cTn id="3" fill="hold"><p:stCondLst><p:cond delay="indefinite"/><p:cond evt="onBegin" delay="0"><p:tn val="2"/></p:cond></p:stCondLst><p:childTnLst>`
      + `<p:par><p:cTn id="${cid++}" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>${effects}</p:childTnLst></p:cTn></p:par>`
      + `</p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn><p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst><p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst></p:seq></p:childTnLst></p:cTn></p:par></p:tnLst>${bld ? `<p:bldLst>${bld}</p:bldLst>` : ''}</p:timing>`;
  }
  function slideXml(items, media) {
    let id = 2;
    const targets = [];
    const xfrm = (it) => `<a:xfrm><a:off x="${e(it.x)}" y="${e(it.y)}"/><a:ext cx="${Math.max(1, e(it.w))}" cy="${Math.max(1, e(it.h ?? 0.1))}"/></a:xfrm>`;
    const geomOf = (it) => (it.r ? `<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val ${Math.round(Math.min(50000, (it.r / Math.min(it.w, it.h)) * 100000))}"/></a:avLst></a:prstGeom>` : '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>');
    const shapes = items.map((it, idx) => {
      const nid = id++;
      if (idx > 0 && !it.foot && (it.k !== 'image' || media.get(it))) targets.push({ id: nid, text: it.k === 'text' });
      if (it.k === 'rect' || it.k === 'ellipse') {
        const geom = it.k === 'ellipse' ? '<a:prstGeom prst="ellipse"><a:avLst/></a:prstGeom>' : geomOf(it);
        return `<p:sp><p:nvSpPr><p:cNvPr id="${nid}" name="Form ${nid}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(it)}${geom}<a:solidFill>${colorOf(it.fill, it.alpha ?? 1)}</a:solidFill><a:ln><a:noFill/></a:ln></p:spPr></p:sp>`;
      }
      if (it.k === 'image') {
        const m = media.get(it); if (!m) return '';
        return `<p:pic><p:nvPicPr><p:cNvPr id="${nid}" name="Bild ${nid}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${m.rid}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>${xfrm(it)}${geomOf(it)}</p:spPr></p:pic>`;
      }
      const h = it.lines.length * it.size * it.lh * PT + 0.05;
      const algn = it.align === 'c' ? 'ctr' : it.align === 'r' ? 'r' : 'l';
      const face = FONTS[it.font || 'sans'].pptx;
      const run = (t, b) => `<a:r><a:rPr lang="de-DE" sz="${Math.round(it.size * 100)}" b="${b ? 1 : 0}" dirty="0"><a:solidFill>${colorOf(it.color, it.alpha ?? 1)}</a:solidFill><a:latin typeface="${face}"/><a:cs typeface="${face}"/></a:rPr><a:t>${xmlEsc(t)}</a:t></a:r>`;
      // Zeile → Läufe (gleich fett zusammengefasst), Leerzeichen bleiben im Text
      const runs = (line) => {
        const parts = [];
        line.forEach((x, j) => { const t = `${j ? ' ' : ''}${x.w}`; if (parts.length && parts[parts.length - 1].b === x.b) parts[parts.length - 1].t += t; else parts.push({ t, b: x.b }); });
        return parts.map((p) => run(p.t, p.b)).join('');
      };
      const para = `<a:p><a:pPr algn="${algn}"><a:lnSpc><a:spcPct val="${Math.round(it.lh * 100000 * 0.86)}"/></a:lnSpc></a:pPr>${it.lines.map((l, k) => `${k ? `<a:br><a:rPr lang="de-DE" sz="${Math.round(it.size * 100)}"/></a:br>` : ''}${runs(l)}`).join('')}</a:p>`;
      return `<p:sp><p:nvSpPr><p:cNvPr id="${nid}" name="Text ${nid}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm({ ...it, h })}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr><p:txBody><a:bodyPr wrap="square" lIns="0" tIns="0" rIns="0" bIns="0" anchor="t"><a:noAutofit/></a:bodyPr><a:lstStyle/>${para}</p:txBody></p:sp>`;
    }).join('');
    return `${XML}<p:sld ${NS}><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${shapes}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr><p:transition spd="med"><p:fade/></p:transition>${timingXml(targets)}</p:sld>`;
  }
  const THEME_XML = (T) => `${XML}<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Lern-App"><a:themeElements>
<a:clrScheme name="Lern-App"><a:dk1><a:srgbClr val="${T.text.slice(1)}"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="1D1D1F"/></a:dk2><a:lt2><a:srgbClr val="F4F5F7"/></a:lt2><a:accent1><a:srgbClr val="${T.accent.slice(1)}"/></a:accent1><a:accent2><a:srgbClr val="4FCF8A"/></a:accent2><a:accent3><a:srgbClr val="FB9A52"/></a:accent3><a:accent4><a:srgbClr val="B49CFF"/></a:accent4><a:accent5><a:srgbClr val="F07A6E"/></a:accent5><a:accent6><a:srgbClr val="2DD4BF"/></a:accent6><a:hlink><a:srgbClr val="2F86FF"/></a:hlink><a:folHlink><a:srgbClr val="6E6E73"/></a:folHlink></a:clrScheme>
<a:fontScheme name="Lern-App"><a:majorFont><a:latin typeface="${FONT}"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="${FONT}"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>
<a:fmtScheme name="Lern-App"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst>
<a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst>
<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>
<a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>`;
  function pptx(slidesItems, deck) {
    const T = themeOf(deck);
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

  /* ---------- Karte im Chat: nur die Präsentation (ohne Kopf), Designs zum Umschalten, Ausgabe als drei Kacheln ---------- */
  const fi = (n, s = 13) => `<svg width="${s}" height="${s}" aria-hidden="true"><use href="#f-${n}"/></svg>`;
  const OUTS = [
    { id: 'pptx', label: 'PowerPoint', hint: 'Bearbeitbar', badge: 'PPTX' },
    { id: 'key', label: 'Keynote', hint: 'iPad & Mac', badge: 'KEY' },
    { id: 'pdf', label: 'PDF', hint: 'Zum Teilen', badge: 'PDF' },
  ];
  // Änderungen (Bearbeiten, Design, Bilder) je Präsentation im Konto gemerkt – Schlüssel aus dem Inhalt des Blocks
  const hash = (t) => { let h = 5381; for (let i = 0; i < t.length; i++) h = ((h * 33) ^ t.charCodeAt(i)) >>> 0; return h.toString(36); };
  const editKey = (raw) => `pz.edit.${hash(String(raw || '').trim())}`;
  const serial = (deck) => JSON.stringify({ title: deck.title, subtitle: deck.subtitle, theme: deck.theme, aiTheme: deck.aiTheme, accent: deck.accent, sources: deck.sources,
    slides: deck.slides.map((x) => ({ type: x.type, title: x.title, text: x.text, points: x.points, left: x.left, right: x.right, image: x.image, notes: x.notes, ...(x.layout ? { layout: x.layout } : {}) })) });
  const TYPE_NAMES = { titel: 'Titel', gliederung: 'Gliederung', punkte: 'Stichpunkte', bild: 'Großes Bild', zahlen: 'Zahlen', zwei: 'Vergleich', zitat: 'Merksatz / Zitat', abschnitt: 'Abschnitt', schritte: 'Ablauf / Schritte', definition: 'Definition', frage: 'Einstiegsfrage', fazit: 'Fazit', quellen: 'Quellen', ende: 'Schluss' };
  const ACCENTS = ['#2F6BFF', '#5EA2FF', '#14B8A6', '#22A55B', '#F59E0B', '#FF5A36', '#E11D74', '#8B5CF6', '#B5532A', '#0A0A0A'];
  // gemeinsamer Zustand einer Präsentation (Karte und Bearbeiten-Fenster): Folien, geladene Bilder, Layout
  function makeState(raw) {
    let deck = parse(raw);
    if (!deck) return null;
    const key = editKey(raw);
    try { const saved = localStorage.getItem(key); if (saved) { const d = parse(saved); if (d) deck = d; } } catch {}
    const st = { deck, images: new Map(), items: [], listeners: new Set(), loading: null };
    st.relayout = () => { st.items = deck.slides.map((x, i) => layout(deck, x, i, deck.slides.length, st.images)); st.listeners.forEach((f) => f()); };
    let saveT = 0;
    st.save = () => { clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem(key, serial(deck)); } catch {} }, 400); };
    // Bilder der Folien laden (nur, was fehlt oder geändert wurde)
    st.syncImages = () => {
      const want = deck.slides.filter((x) => x.image && (x.image.src || x.image.query || x.image.prompt)).slice(0, 14);
      const jobs = want.map((x) => {
        const k = JSON.stringify(x.image);
        if (st.images.get(x)?.k === k) return null;
        return Promise.race([loadImage(x.image), new Promise((r) => setTimeout(() => r(null), 25000))])
          .then((v) => { if (v?.img && JSON.stringify(x.image) === k) { st.images.set(x, { ...v, k }); st.relayout(); } }).catch(() => {});
      }).filter(Boolean);
      [...st.images.keys()].forEach((x) => { if (!deck.slides.includes(x) || !x.image) st.images.delete(x); });
      st.loading = Promise.all(jobs);
      return st.loading;
    };
    st.relayout();
    st.syncImages();
    return st;
  }

  // Fortschritt, solange der Block noch geschrieben wird: wie viele Folien schon stehen (die Wellen-Animation läuft ungestört weiter)
  function progress(fig, raw) {
    const n = (String(raw || '').match(/"type"\s*:/g) || []).length;
    const el = fig.querySelector('.pz-wait-n');
    if (el) el.textContent = n ? ` · Folie ${n}` : '';
  }
  /* ---------- Karte im Chat: nur die Präsentation (ohne Kopf), Designs, Bearbeiten, Ausgabe als drei Kacheln ---------- */
  function figure(raw) {
    const fig = document.createElement('figure');
    fig.className = 'pz';
    window.enterOnce?.(fig);
    const st = makeState(raw);
    // solange der Block noch geschrieben wird: dieselbe Wellen-Animation wie bei der Bilderstellung (16:9 wie eine Folie)
    if (!st) {
      fig.classList.add('pz-waiting');
      fig.innerHTML = `<div class="pz-wait pz-wave">${window.illustrationWave?.() || ''}</div><div class="pz-wait-l"><span class="shimmer">Präsentation wird gestaltet</span><span class="pz-wait-n"></span></div>`;
      progress(fig, raw);
      return fig;
    }
    const deck = st.deck;
    fig.innerHTML = `<div class="pz-stage"><div class="pz-slide pz-big"></div><button type="button" class="pz-pen" data-edit aria-label="Bearbeiten">${fi('pencil', 14)}</button>
        <button type="button" class="pz-nav prev" data-go="-1" aria-label="Vorherige Folie">${fi('back', 14)}</button><button type="button" class="pz-nav next" data-go="1" aria-label="Nächste Folie">${fi('forward', 14)}</button>
        <span class="pz-count"></span></div>
      <div class="pz-strip"></div>
      <div class="pz-bar">
        <div class="pz-outs">${OUTS.map((o) => `<button type="button" class="pz-out" data-out="${o.id}"><span class="pz-badge ${o.id}">${o.badge}</span><span class="pz-ol"><b>${o.label}</b><small>${o.hint}</small></span><span class="pz-oi">${fi('download', 13)}</span></button>`).join('')}</div>
      </div>
      <div class="pz-msg" aria-live="polite"></div>`;
    let cur = 0;
    const big = fig.querySelector('.pz-big'), strip = fig.querySelector('.pz-strip'), msg = fig.querySelector('.pz-msg');
    const show = (i, dir) => {
      const n = deck.slides.length;
      cur = Math.max(0, Math.min(n - 1, i));
      big.innerHTML = slideHtml(st.items[cur], !!dir);
      if (dir) { big.classList.remove('in-l', 'in-r'); void big.offsetWidth; big.classList.add(dir > 0 ? 'in-l' : 'in-r'); }
      fig.querySelector('.pz-count').textContent = `${cur + 1} / ${n}`;
      strip.querySelectorAll('.pz-thumb').forEach((b, k) => b.classList.toggle('on', k === cur));
      const th = strip.querySelector('.pz-thumb.on');
      if (th) strip.scrollTo({ left: th.offsetLeft - strip.clientWidth / 2 + th.offsetWidth / 2, behavior: 'smooth' });
    };
    const draw = () => {
      if (strip.children.length !== deck.slides.length) strip.innerHTML = deck.slides.map((_, i) => `<button type="button" class="pz-thumb" data-i="${i}" aria-label="Folie ${i + 1}"><span class="pz-slide"></span></button>`).join('');
      strip.querySelectorAll('.pz-thumb .pz-slide').forEach((t, i) => { t.innerHTML = slideHtml(st.items[i]); });
      show(cur, 0);
    };
    st.listeners.add(() => { if (fig.isConnected || !fig.parentNode) draw(); });
    draw();
    if (deck.slides.some((x) => x.image)) { fig.classList.add('loading'); st.loading?.finally(() => fig.classList.remove('loading')); }
    const say = (t, ms = 0) => { msg.textContent = t; msg.classList.toggle('on', !!t); if (ms) setTimeout(() => { if (msg.textContent === t) say(''); }, ms); };
    fig.addEventListener('click', async (ev) => {
      const go = ev.target.closest('[data-go]'); if (go) { show(cur + +go.dataset.go, +go.dataset.go); return; }
      const th = ev.target.closest('[data-i]'); if (th) { show(+th.dataset.i, +th.dataset.i - cur || 1); return; }
      if (ev.target.closest('[data-edit]')) { editor(st, cur, (i) => { cur = i; draw(); }); return; }
      const out = ev.target.closest('[data-out]'); if (!out || fig.classList.contains('busy')) return;
      fig.classList.add('busy'); out.classList.add('working');
      say('Wird erstellt …');
      try {
        await st.loading;
        await readyImages(st.items);
        if (out.dataset.out === 'pdf') download(pdf(st.items, deck.title), fileName(deck, 'pdf'));
        else if (out.dataset.out === 'pptx') download(pptx(st.items, deck), fileName(deck, 'pptx'));
        else await share(pptx(st.items, deck), fileName(deck, 'pptx'));
        out.classList.add('ok'); setTimeout(() => out.classList.remove('ok'), 1600);
        say(out.dataset.out === 'key' ? 'Im Teilen-Menü „Keynote“ wählen' : '', 5000);
      } catch (err) { say(`Hat nicht geklappt (${err.message || 'Fehler'})`, 6000); }
      finally { fig.classList.remove('busy'); out.classList.remove('working'); }
    });
    fig.addEventListener('keydown', (ev) => { if (ev.key === 'ArrowRight') show(cur + 1, 1); if (ev.key === 'ArrowLeft') show(cur - 1, -1); });
    let sx = null;
    big.addEventListener('touchstart', (ev) => { sx = ev.touches[0].clientX; }, { passive: true });
    big.addEventListener('touchend', (ev) => { if (sx == null) return; const dx = ev.changedTouches[0].clientX - sx; if (Math.abs(dx) > 50) show(cur + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1); sx = null; }, { passive: true });
    big.addEventListener('dblclick', () => editor(st, cur, (i) => { cur = i; draw(); }));
    return fig;
  }

  /* ---------- Bearbeiten: großes Fenster – links die Folie groß mit den Feldern darunter, rechts alle Folien (abgerundet, scrollbar).
     Text, Folienart, Bilder (echte Fotos auswählen oder eigenes Bild), Design und Akzentfarbe; Folien hinzufügen, verschieben, löschen ---------- */
  function editor(st, start, onClose) {
    const deck = st.deck;
    let cur = start;
    const wrap = document.createElement('div');
    wrap.className = 'pz-ed-wrap';
    wrap.innerHTML = `<div class="pz-ed" role="dialog" aria-label="Präsentation bearbeiten">
      <header class="pz-ed-head">
        <b>Präsentation bearbeiten</b>
        <div class="pz-accents" aria-label="Akzentfarbe">${ACCENTS.map((c) => `<button type="button" class="pz-acc" data-acc="${c}" style="--c:${c}" aria-label="Farbe ${c}"></button>`).join('')}<label class="pz-acc custom" aria-label="Eigene Farbe"><input type="color" data-acc-in /></label></div>
        <span class="grow"></span>
        <button type="button" class="pz-ed-done" data-close>Fertig</button>
      </header>
      <div class="pz-ed-body">
        <main class="pz-ed-main"><div class="pz-ed-stage"><div class="pz-slide pz-ed-big"></div></div><div class="pz-ed-form"></div></main>
        <aside class="pz-ed-side"><div class="pz-ed-list"></div>
          <div class="pz-ed-acts">
            <button type="button" data-slide="add">${fi('plus', 12)}Folie</button>
            <button type="button" data-slide="dup" aria-label="Duplizieren" title="Duplizieren">${fi('copy', 12)}</button>
            <button type="button" data-slide="up" aria-label="Nach oben" title="Nach oben">${fi('arrow-up', 12)}</button>
            <button type="button" data-slide="down" aria-label="Nach unten" title="Nach unten"><span style="display:inline-grid;transform:rotate(180deg)">${fi('arrow-up', 12)}</span></button>
            <button type="button" data-slide="del" class="danger" aria-label="Löschen" title="Löschen">${fi('trash', 12)}</button>
          </div></aside>
      </div></div>`;
    document.body.append(wrap);
    const big = wrap.querySelector('.pz-ed-big'), list = wrap.querySelector('.pz-ed-list'), form = wrap.querySelector('.pz-ed-form');
    const T = () => themeOf(deck);
    const drawList = () => {
      list.innerHTML = deck.slides.map((x, i) => `<button type="button" class="pz-ed-th${i === cur ? ' on' : ''}" data-i="${i}"><span class="pz-ed-n">${i + 1}</span><span class="pz-slide">${slideHtml(st.items[i] || [])}</span></button>`).join('');
      list.querySelector('.on')?.scrollIntoView({ block: 'nearest' });
    };
    const drawBig = (anim) => { big.innerHTML = slideHtml(st.items[cur] || [], anim); };
    const drawHead = () => {
      wrap.querySelectorAll('[data-acc]').forEach((b) => b.classList.toggle('on', b.dataset.acc.toUpperCase() === (T().accent || '').toUpperCase()));
    };
    const lines = (a) => (a || []).join('\n');
    const field = (label, html) => `<label class="pz-f"><span>${label}</span>${html}</label>`;
    const drawForm = () => {
      const x = deck.slides[cur];
      const im = st.images.get(x);
      const ptsLabel = { gliederung: 'Punkte der Gliederung (je Zeile einer)', zahlen: 'Zahlen (je Zeile „Wert | Erklärung“)', quellen: 'Quellen (je Zeile eine)', fazit: 'Kernaussagen (je Zeile eine)' }[x.type] || 'Stichpunkte (je Zeile einer, **fett** möglich)';
      form.innerHTML = `<div class="pz-f-row">${field('Folienart', `<select data-f="type">${TYPES.map((t) => `<option value="${t}"${t === x.type ? ' selected' : ''}>${TYPE_NAMES[t]}</option>`).join('')}</select>`)}</div>
        ${field('Titel', `<input data-f="title" value="${esc(x.title)}" maxlength="110" />`)}
        ${['titel', 'abschnitt', 'punkte', 'bild', 'zitat', 'definition', 'ende'].includes(x.type) ? field(x.type === 'zitat' ? 'Merksatz / Zitat' : x.type === 'titel' ? 'Untertitel' : x.type === 'definition' ? 'Erklärung' : 'Text', `<textarea data-f="text" rows="2" maxlength="460">${esc(x.text)}</textarea>`) : ''}
        ${x.type === 'zwei' ? `<div class="pz-f-two">${['left', 'right'].map((k) => `<div>${field(k === 'left' ? 'Links: Überschrift' : 'Rechts: Überschrift', `<input data-f="${k}.title" value="${esc(x[k]?.title || '')}" maxlength="60" />`)}${field('Stichpunkte', `<textarea data-f="${k}.points" rows="4">${esc(lines(x[k]?.points))}</textarea>`)}</div>`).join('')}</div>`
          : !['titel', 'abschnitt', 'zitat', 'frage', 'ende'].includes(x.type) ? field(ptsLabel, `<textarea data-f="points" rows="5">${esc(lines(x.type === 'quellen' && !x.points.length ? deck.sources : x.points))}</textarea>`) : ''}
        <div class="pz-f-img"><span class="pz-f-l">Bild</span>
          <div class="pz-img-row">${im ? `<span class="pz-img-prev"><img alt="" src="${esc(im.img.src)}"></span>` : `<span class="pz-img-prev none">${fi('image', 16)}</span>`}
            <button type="button" class="pz-mini" data-img="pick">${fi('search', 12)}${x.image ? 'Anderes Foto' : 'Foto hinzufügen'}</button>
            <label class="pz-mini">${fi('upload', 12)}Eigenes Bild<input type="file" accept="image/*" data-img="file" hidden /></label>
            ${x.image ? `<button type="button" class="pz-mini danger" data-img="none">${fi('x', 11)}Entfernen</button>` : ''}</div>
          <div class="pz-pick" hidden><div class="pz-pick-q"><input placeholder="Suchbegriff, z. B. Regenwald" value="${esc(x.image?.query || x.title)}" /><button type="button" class="pz-mini primary" data-img="search">Suchen</button></div><div class="pz-pick-grid"></div></div>
          ${im?.credit ? `<small class="pz-credit">Bild: ${esc(im.credit)}</small>` : ''}</div>`;
    };
    const redraw = (all = true, anim = false) => { st.relayout(); drawBig(anim); if (all) { drawList(); drawHead(); } else { const th = list.querySelectorAll('.pz-ed-th .pz-slide')[cur]; if (th) th.innerHTML = slideHtml(st.items[cur]); } };
    const go = (i) => { cur = Math.max(0, Math.min(deck.slides.length - 1, i)); drawBig(true); drawList(); drawForm(); };
    st.relayout(); drawBig(true); drawList(); drawHead(); drawForm();
    const onImages = () => { drawBig(); drawList(); if (!form.contains(document.activeElement)) drawForm(); };
    st.listeners.add(onImages);
    // Text ändern → Folie sofort neu setzen
    form.addEventListener('input', (e) => {
      const f = e.target.dataset.f; if (!f) return;
      const x = deck.slides[cur], v = e.target.value;
      if (f === 'points') { if (x.type === 'quellen') { x.points = v.split('\n').map((l) => l.trim()).filter(Boolean); } else x.points = v.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 8); }
      else if (f.includes('.')) { const [side, k] = f.split('.'); x[side] ||= { title: '', points: [] }; x[side][k] = k === 'points' ? v.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 6) : v; }
      else if (f === 'type') { x.type = v; drawForm(); }
      else x[f] = f === 'title' ? plain(v) : v;
      st.save(); redraw(f === 'type');
    });
    form.addEventListener('change', (e) => { if (e.target.dataset.f === 'type') { deck.slides[cur].type = e.target.value; st.save(); redraw(true); drawForm(); } });
    // Bilder: echte Fotos suchen und auswählen, eigenes Bild hochladen, entfernen
    const search = async () => {
      const box = form.querySelector('.pz-pick'), grid = form.querySelector('.pz-pick-grid'), q = form.querySelector('.pz-pick-q input').value.trim();
      if (!q) return;
      box.hidden = false; grid.innerHTML = '<span class="pz-pick-wait shimmer">Fotos werden gesucht …</span>';
      const r = await fetch(`/api/photos?q=${encodeURIComponent(q)}`).then((x) => x.json()).catch(() => ({ items: [] }));
      const items = (r.items || []).filter((x) => /^https:\/\/(upload|thumb)\.wikimedia\.org\//.test(x.url));
      grid.innerHTML = items.length ? items.map((x, i) => `<button type="button" class="pz-pick-it" data-pick="${i}"><img alt="" loading="lazy" src="${esc(x.url)}"></button>`).join('') : '<span class="pz-pick-wait">Keine Fotos gefunden – anderer Suchbegriff?</span>';
      grid._items = items; grid._q = q;
    };
    form.addEventListener('click', (e) => {
      const b = e.target.closest('[data-img]'); const x = deck.slides[cur];
      if (b?.dataset.img === 'pick') { const box = form.querySelector('.pz-pick'); box.hidden = !box.hidden; if (!box.hidden) search(); return; }
      if (b?.dataset.img === 'search') { search(); return; }
      if (b?.dataset.img === 'none') { x.image = null; st.images.delete(x); st.save(); redraw(); drawForm(); return; }
      const pk = e.target.closest('[data-pick]');
      if (pk) {
        const grid = pk.parentElement, it = grid._items[+pk.dataset.pick];
        x.image = { query: grid._q, prompt: x.image?.prompt || grid._q, src: it.url, credit: [it.author, it.license].filter(Boolean).join(' · ') };
        if (x.type === 'gliederung' || x.type === 'quellen') x.type = 'punkte';
        st.save(); st.syncImages().then(() => drawForm());
        form.querySelectorAll('.pz-pick-it').forEach((n) => n.classList.toggle('on', n === pk));
      }
    });
    form.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.closest('.pz-pick-q')) { e.preventDefault(); search(); } e.stopPropagation(); });
    form.addEventListener('change', (e) => {
      if (e.target.dataset.img !== 'file' || !e.target.files?.[0]) return;
      const file = e.target.files[0], x = deck.slides[cur];
      const rd = new FileReader();
      rd.onload = () => { const img = new Image(); img.onload = () => {
        const sc = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight)), c = document.createElement('canvas');
        c.width = Math.round(img.naturalWidth * sc); c.height = Math.round(img.naturalHeight * sc); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        x.image = { query: '', prompt: '', src: c.toDataURL('image/jpeg', 0.85), credit: '' };
        st.save(); st.syncImages().then(() => drawForm());
      }; img.src = rd.result; };
      rd.readAsDataURL(file);
    });
    wrap.addEventListener('click', (e) => {
      if (e.target === wrap || e.target.closest('[data-close]')) { close(); return; }
      const th = e.target.closest('.pz-ed-th'); if (th) { go(+th.dataset.i); return; }
      const ac = e.target.closest('[data-acc]'); if (ac) { deck.accent = ac.dataset.acc; deck.aiTheme = deck.theme; st.save(); redraw(true); return; }
      const sl = e.target.closest('[data-slide]'); if (!sl) return;
      const k = sl.dataset.slide, x = deck.slides[cur];
      if (k === 'add') { deck.slides.splice(cur + 1, 0, { type: 'punkte', title: 'Neue Folie', text: '', points: ['Erster Punkt', 'Zweiter Punkt'], left: null, right: null, image: null, notes: '' }); cur++; }
      if (k === 'dup') { deck.slides.splice(cur + 1, 0, JSON.parse(JSON.stringify(x))); cur++; }
      if (k === 'up' && cur > 0) { deck.slides.splice(cur, 1); deck.slides.splice(--cur, 0, x); }
      if (k === 'down' && cur < deck.slides.length - 1) { deck.slides.splice(cur, 1); deck.slides.splice(++cur, 0, x); }
      if (k === 'del' && deck.slides.length > 1) { deck.slides.splice(cur, 1); cur = Math.min(cur, deck.slides.length - 1); }
      st.save(); st.syncImages(); redraw(true, true); drawForm();
    });
    wrap.querySelector('[data-acc-in]').addEventListener('input', (e) => { deck.accent = e.target.value.toUpperCase(); deck.aiTheme = deck.theme; st.save(); redraw(true); });
    const esc2 = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', esc2);
    function close() {
      document.removeEventListener('keydown', esc2);
      st.listeners.delete(onImages);
      wrap.classList.add('closing');
      setTimeout(() => wrap.remove(), 220);
      onClose?.(cur);
    }
  }
  return { parse, figure, progress, layout, html: slideHtml, pptx, pdf, THEMES };
})();
if (typeof window !== 'undefined') window.Praesentation = Praesentation;
if (typeof module !== 'undefined') module.exports = Praesentation;
