/* ===================================================================
   Funktionsgraphen (19.11.): ```graph-Block → Koordinatensystem mit x-/y-Achse, Gitter, Beschriftung,
   die Funktionen werden automatisch gezeichnet.
   Format (JSON): {"title":"Parabel","functions":[{"expr":"x^2-2x-3","label":"f(x)"}],
                   "x":[-4,6], "y":[-5,8], "points":[{"x":3,"y":0,"label":"Nullstelle"}]}
   - x/y optional (y wird sonst aus den Werten bestimmt), label optional (sonst „f(x) = …“).
   - Eigener, sicherer Formel-Leser (kein eval): + − · / ^, Klammern, sin cos tan asin acos atan sqrt abs ln log exp,
     pi, e, Komma als Dezimalzeichen, „2x“ / „3(x+1)“ / „x(x-2)“ (Mal-Zeichen darf fehlen).
   - Fahren mit Maus/Finger über den Graphen zeigt x und die Funktionswerte.
   =================================================================== */
const Graph = (() => {
  const FN = { sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan, sqrt: Math.sqrt, wurzel: Math.sqrt,
    abs: Math.abs, betrag: Math.abs, ln: Math.log, log: Math.log10, lg: Math.log10, exp: Math.exp, floor: Math.floor, ceil: Math.ceil, sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh };
  const CONST = { pi: Math.PI, 'π': Math.PI, e: Math.E };
  const COLORS = ['#6d9fff', '#f2994a', '#4fcf8a', '#e86ba8', '#b18cff', '#e5c454'];

  /* ---------- Formel lesen ---------- */
  function tokens(src) {
    const s = String(src || '').toLowerCase().replace(/\s+/g, '').replace(/[·×]/g, '*').replace(/[−–]/g, '-').replace(/÷/g, '/').replace(/²/g, '^2').replace(/³/g, '^3')
      .replace(/^[a-z]\(x\)=/, '').replace(/^y=/, '').replace(/(\d),(\d)/g, '$1.$2');
    const out = []; let i = 0;
    while (i < s.length) {
      const c = s[i];
      if (/[0-9.]/.test(c)) { let j = i; while (j < s.length && /[0-9.]/.test(s[j])) j++; out.push({ t: 'n', v: parseFloat(s.slice(i, j)) }); i = j; continue; }
      if (/[a-zπ]/.test(c)) {
        let j = i; while (j < s.length && /[a-zπ]/.test(s[j])) j++;
        let w = s.slice(i, j);
        // Wörter zerlegen: „2xsin“ → x, sin; bekannte Funktionen/Konstanten zuerst
        while (w) {
          const f = Object.keys(FN).sort((a, b) => b.length - a.length).find((k) => w.startsWith(k));
          const k = !f && Object.keys(CONST).sort((a, b) => b.length - a.length).find((q) => w.startsWith(q));
          if (f) { out.push({ t: 'f', v: f }); w = w.slice(f.length); }
          else if (k) { out.push({ t: 'n', v: CONST[k] }); w = w.slice(k.length); }
          else if (w[0] === 'x') { out.push({ t: 'x' }); w = w.slice(1); }
          else return null; // unbekannter Name
        }
        i = j; continue;
      }
      if ('+-*/^()'.includes(c)) { out.push({ t: c }); i++; continue; }
      return null;
    }
    // fehlendes Mal-Zeichen ergänzen: 2x, 2(…), )(, x(…), )x, 2sin
    const res = [];
    out.forEach((tk, k) => {
      const prev = res[res.length - 1];
      const endsVal = prev && (prev.t === 'n' || prev.t === 'x' || prev.t === ')');
      const startsVal = tk.t === 'n' || tk.t === 'x' || tk.t === '(' || tk.t === 'f';
      if (endsVal && startsVal) res.push({ t: '*' });
      res.push(tk);
    });
    return res;
  }
  // Rekursiver Abstieg → Funktion x ↦ y
  function compile(src) {
    const tk = tokens(src); if (!tk || !tk.length) return null;
    let p = 0;
    const peek = () => tk[p], eat = (t) => (tk[p] && tk[p].t === t ? tk[p++] : null);
    function expr() { let a = term(); for (;;) { if (eat('+')) { const l = a, r = term(); a = (x) => l(x) + r(x); } else if (eat('-')) { const l = a, r = term(); a = (x) => l(x) - r(x); } else return a; } }
    function term() { let a = unary(); for (;;) { if (eat('*')) { const l = a, r = unary(); a = (x) => l(x) * r(x); } else if (eat('/')) { const l = a, r = unary(); a = (x) => l(x) / r(x); } else return a; } }
    function unary() { if (eat('-')) { const a = unary(); return (x) => -a(x); } if (eat('+')) return unary(); return power(); }
    function power() { const b = atom(); if (eat('^')) { const e = unary(); return (x) => Math.pow(b(x), e(x)); } return b; }
    function atom() {
      const t = peek(); if (!t) throw new Error('Ende');
      if (t.t === 'n') { p++; const v = t.v; return () => v; }
      if (t.t === 'x') { p++; return (x) => x; }
      if (t.t === 'f') { p++; const f = FN[t.v]; const a = eat('(') ? (() => { const e = expr(); if (!eat(')')) throw new Error(')'); return e; })() : power(); return (x) => f(a(x)); }
      if (eat('(')) { const e = expr(); if (!eat(')')) throw new Error(')'); return e; }
      throw new Error('Zeichen');
    }
    try { const f = expr(); if (p !== tk.length) return null; f(1); return f; } catch { return null; }
  }

  /* ---------- Block lesen ---------- */
  function parse(raw) {
    let o; try { o = JSON.parse(String(raw || '').trim()); } catch { return null; }
    const list = (Array.isArray(o?.functions) ? o.functions : o?.expr ? [o] : []).slice(0, 6)
      .map((f, i) => { const expr = String(typeof f === 'string' ? f : f?.expr || '').slice(0, 120); const fn = compile(expr); return fn ? { expr, fn, label: String(f?.label || '').slice(0, 40), color: COLORS[i % COLORS.length] } : null; })
      .filter(Boolean);
    // 19.11.: gleiche Namen (zweimal „f(x)“) → g(x), h(x) …
    const used = new Set();
    list.forEach((f) => { const m = /^([a-z])\(x\)$/.exec(f.label); if (!m) return; let c = m[1]; while (used.has(c)) c = String.fromCharCode(c.charCodeAt(0) + 1); used.add(c); f.label = `${c}(x)`; });
    const pts = (Array.isArray(o?.points) ? o.points : []).slice(0, 12).filter((q) => Number.isFinite(+q?.x) && Number.isFinite(+q?.y)).map((q) => ({ x: +q.x, y: +q.y, label: String(q.label || '').slice(0, 30) }));
    if (!list.length && !pts.length) return null;
    const rng = (a) => (Array.isArray(a) && a.length === 2 && a.every((v) => Number.isFinite(+v)) && +a[1] > +a[0] ? [+a[0], +a[1]] : null);
    return { title: String(o.title || '').slice(0, 80), fns: list, points: pts, x: rng(o.x), y: rng(o.y) };
  }
  // „schöne“ Abstände für die Achsen (1, 2, 5 · 10^n)
  const nice = (span, want = 8) => { const raw = span / want, m = 10 ** Math.floor(Math.log10(raw)), f = raw / m; return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * m; };
  const fmt = (v) => { const r = Math.round(v * 1000) / 1000; return String(r).replace('.', ',').replace('-', '−'); };

  /* ---------- Ausschnitt ----------
     Markante Stellen (Nullstellen, Extrema, Wendepunkte) werden numerisch gesucht; x-Bereich umfasst sie (nächstliegende zuerst),
     y-Bereich so, dass sie gut erkennbar sind – statt starr [-6, 6] und Werte, die eine Kurve zur flachen Linie drücken.
     Bereiche der KI bleiben, wenn sie alle markanten Stellen enthalten. */
  function features(fn) {
    const out = [], A = -30, B = 30, N = 6000, h = 1e-4;
    const d1 = (x) => (fn(x + h) - fn(x - h)) / (2 * h), d2 = (x) => (fn(x + 1e-3) - 2 * fn(x) + fn(x - 1e-3)) / 1e-6;
    [fn, d1, d2].forEach((g) => {
      let xa = A, ga = g(xa);
      for (let i = 1; i <= N; i++) {
        const xb = A + (B - A) * i / N, gb = g(xb);
        if (Number.isFinite(ga) && Number.isFinite(gb) && (ga === 0 || ga * gb < 0)) {
          let lo = xa, hi = xb, glo = ga;
          for (let k = 0; k < 40 && ga !== 0; k++) { const m = (lo + hi) / 2, gm = g(m); if (!Number.isFinite(gm)) break; if (glo * gm <= 0) hi = m; else { lo = m; glo = gm; } }
          const x = ga === 0 ? xa : (lo + hi) / 2, y = fn(x);
          const jump = Math.abs(fn(x + 1e-3) - fn(x - 1e-3));
          if (Number.isFinite(y) && Math.abs(y) < 1e6 && jump < 1 + Math.abs(y) * 0.1) out.push({ x: Math.abs(x) < 1e-7 ? 0 : x, y }); // Polstellen fallen raus
        }
        xa = xb; ga = gb;
      }
    });
    const y0 = fn(0); if (Number.isFinite(y0) && Math.abs(y0) < 1e6) out.push({ x: 0, y: y0 }); // Schnitt mit der y-Achse
    return out;
  }
  function view(g) {
    let feats = [];
    g.fns.forEach((f) => { feats.push(...features(f.fn)); });
    feats.push(...g.points);
    // bei vielen Stellen (z. B. sin) nur die nächstliegenden
    feats.sort((a, b) => Math.abs(a.x) - Math.abs(b.x));
    feats = feats.filter((q) => Math.abs(q.x) <= 25);
    if (feats.length > 10) { const cut = Math.abs(feats[9].x) + 1e-6; feats = feats.filter((q) => Math.abs(q.x) <= cut); }
    let x;
    const fx = feats.map((q) => q.x);
    if (g.x && fx.every((q) => q > g.x[0] && q < g.x[1])) x = g.x;
    else {
      let lo = Math.min(0, ...fx), hi = Math.max(0, ...fx);
      if (!fx.length) { lo = -5; hi = 5; }
      const span = hi - lo, pad = Math.max(1.5, span * 0.3);
      lo -= pad; hi += pad;
      if (hi - lo < 10) { const c = (lo + hi) / 2; lo = c - 5; hi = c + 5; } // 19.11.: mindestens 10 Einheiten breit (vorher 6 – zu wenig x-Achse)
      x = [lo, hi];
    }
    if (g.y && feats.every((q) => q.x < x[0] || q.x > x[1] || (q.y > g.y[0] && q.y < g.y[1]))) return { x, y: g.y };
    // Werte im Bereich (Ausreißer bei Polstellen abschneiden)
    // 19.11.: je Funktion eigener Wertebereich; bei sehr unterschiedlichen Funktionen (z. B. 2x² und 5x³) bestimmt die FLACHERE den Ausschnitt,
    // damit ihre Form sichtbar bleibt – die steilere läuft oben/unten aus dem Bild (vorher wurde die Parabel zur flachen Linie gedrückt)
    const q = (arr) => { arr.sort((a, b) => a - b); return [arr[Math.floor(arr.length * 0.03)], arr[Math.ceil(arr.length * 0.97) - 1]]; };
    const ranges = g.fns.map((f) => { const v = []; for (let i = 0; i <= 300; i++) { const y = f.fn(x[0] + (x[1] - x[0]) * i / 300); if (Number.isFinite(y)) v.push(y); } return v.length ? q(v) : null; })
      .filter((r) => r && r[1] - r[0] > 1e-6);
    let lo, hi;
    if (ranges.length) {
      const tight = ranges.reduce((a, b) => (b[1] - b[0] < a[1] - a[0] ? b : a));
      const wide = ranges.reduce((a, b) => (b[1] - b[0] > a[1] - a[0] ? b : a));
      // ähnliche Größenordnung → alle ganz zeigen; sonst die flachste (mindestens ein Drittel der Höhe für die anderen nicht erzwingen)
      [lo, hi] = (wide[1] - wide[0]) <= 2 * (tight[1] - tight[0]) ? [Math.min(...ranges.map((r) => r[0])), Math.max(...ranges.map((r) => r[1]))] : tight;
      // die steilere Funktion läuft auch ins Negative/Positive → dort etwas Platz lassen, damit ihr Verlauf erkennbar bleibt
      const sp = hi - lo;
      if (lo >= -1e-9 && ranges.some((r) => r[0] < -sp * 0.1)) lo = -sp * 0.5;
      if (hi <= 1e-9 && ranges.some((r) => r[1] > sp * 0.1)) hi = sp * 0.5;
    } else { const v = g.fns.map((f) => f.fn((x[0] + x[1]) / 2)).filter(Number.isFinite); lo = (v[0] ?? 0) - 5; hi = (v[0] ?? 0) + 5; }
    g.points.forEach((p) => { lo = Math.min(lo, p.y); hi = Math.max(hi, p.y); });
    // markante Stellen sollen nicht zusammengedrückt werden: sie nehmen mindestens ~55 % der Höhe ein
    const fy = feats.filter((q) => q.x >= x[0] && q.x <= x[1]).map((q) => q.y);
    if (fy.length) {
      const flo = Math.min(...fy), fhi = Math.max(...fy), fs = fhi - flo;
      if (fs > 1e-9 && fs < (hi - lo) * 0.4) { const ext = fs; /* Äste sichtbar lassen (vorher abgeschnitten) */ lo = Math.max(lo, flo - ext); hi = Math.min(hi, fhi + ext); }
      lo = Math.min(lo, flo); hi = Math.max(hi, fhi);
    }
    if (hi - lo < 1e-9) { lo -= 2; hi += 2; }
    const pad = (hi - lo) * 0.12;
    lo -= pad; hi += pad;
    // x-Achse mit ins Bild, wenn sie nah dran ist
    if (lo > 0 && lo < (hi - lo) * 0.5) lo = -pad / 2;
    if (hi < 0 && -hi < (hi - lo) * 0.5) hi = pad / 2;
    return { x, y: [lo, hi] };
  }

  /* ---------- Zeichnen ---------- */
  function figure(raw) {
    const g = parse(raw); if (!g) return null;
    const W = 640, H = 400, PAD = 34;
    // 19.11.: Ausschnitt automatisch so wählen, dass die Grundform gut zu sehen ist (Nullstellen, Hoch-/Tiefpunkte, Wendepunkte)
    const vw = view(g);
    const [x0, x1] = vw.x, [y0, y1] = vw.y;
    const sx = (x) => PAD + (x - x0) / (x1 - x0) * (W - 2 * PAD), sy = (y) => H - PAD - (y - y0) / (y1 - y0) * (H - 2 * PAD);
    const dx = nice(x1 - x0), dy = nice(y1 - y0, 6);
    let grid = '', labels = '';
    for (let v = Math.ceil(x0 / dx) * dx; v <= x1 + 1e-9; v += dx) { const X = sx(v).toFixed(1); grid += `<line x1="${X}" y1="${PAD}" x2="${X}" y2="${H - PAD}"/>`; if (Math.abs(v) > dx / 2) labels += `<text x="${X}" y="${Math.min(H - PAD + 14, Math.max(PAD + 12, sy(0) + 15)).toFixed(1)}" text-anchor="middle">${fmt(v)}</text>`; }
    for (let v = Math.ceil(y0 / dy) * dy; v <= y1 + 1e-9; v += dy) { const Y = sy(v).toFixed(1); grid += `<line x1="${PAD}" y1="${Y}" x2="${W - PAD}" y2="${Y}"/>`; if (Math.abs(v) > dy / 2) labels += `<text x="${(Math.min(W - PAD - 4, Math.max(PAD + 4, sx(0) - 6))).toFixed(1)}" y="${(+Y + 4).toFixed(1)}" text-anchor="end">${fmt(v)}</text>`; }
    // Achsen (an x=0 / y=0, sonst am Rand) mit Pfeilen
    const ax = Math.min(H - PAD, Math.max(PAD, sy(0))), ay = Math.min(W - PAD, Math.max(PAD, sx(0)));
    const axes = `<line x1="${PAD - 6}" y1="${ax}" x2="${W - PAD + 10}" y2="${ax}"/><path d="M${W - PAD + 10} ${ax}l-7 -4v8z" class="g-arr"/><text x="${W - PAD + 8}" y="${ax - 8}" class="g-ax">x</text>`
      + `<line x1="${ay}" y1="${H - PAD + 6}" x2="${ay}" y2="${PAD - 10}"/><path d="M${ay} ${PAD - 10}l-4 7h8z" class="g-arr"/><text x="${ay + 9}" y="${PAD - 4}" class="g-ax">y</text>`;
    // Kurven: dicht abtasten, an Sprüngen/Polstellen absetzen
    const curves = g.fns.map((f) => {
      let d = '', pen = false, prevY = null;
      const N = 700;
      for (let i = 0; i <= N; i++) {
        const x = x0 + (x1 - x0) * i / N, y = f.fn(x);
        const ok = Number.isFinite(y) && y > y0 - (y1 - y0) * 2 && y < y1 + (y1 - y0) * 2;
        if (ok && pen && prevY != null && Math.abs(y - prevY) > (y1 - y0) * 0.9) pen = false; // Sprung → neu ansetzen
        if (ok) { d += `${pen ? 'L' : 'M'}${sx(x).toFixed(1)} ${sy(y).toFixed(1)}`; pen = true; prevY = y; } else { pen = false; prevY = null; }
      }
      return `<path class="g-fn" d="${d}" stroke="${f.color}"/>`;
    }).join('');
    const pts = g.points.map((q) => `<g class="g-pt"><circle cx="${sx(q.x).toFixed(1)}" cy="${sy(q.y).toFixed(1)}" r="4"/>${q.label ? `<text x="${(sx(q.x) + 8).toFixed(1)}" y="${(sy(q.y) - 8).toFixed(1)}">${esc(q.label)}</text>` : ''}</g>`).join('');
    const fig = document.createElement('figure');
    fig.className = 'chat-graph';
    fig.innerHTML = `<figcaption class="g-head"><svg width="14" height="14" aria-hidden="true"><use href="#f-trend"/></svg><span>${esc(g.title || 'Funktionsgraph')}</span></figcaption>
      <div class="g-wrap"><svg class="g-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(g.title || 'Funktionsgraph')}">
        <defs><clipPath id="gc${Math.random().toString(36).slice(2, 7)}"><rect x="${PAD}" y="${PAD}" width="${W - 2 * PAD}" height="${H - 2 * PAD}"/></clipPath></defs>
        <g class="g-grid">${grid}</g><g class="g-axes">${axes}</g><g class="g-lab">${labels}</g>
        <g class="g-curves">${curves}</g><g class="g-pts">${pts}</g>
        <g class="g-hover" visibility="hidden"><line class="g-hl" y1="${PAD}" y2="${H - PAD}"/>${g.fns.map((f) => `<circle r="4" fill="${f.color}"/>`).join('')}</g>
      </svg><div class="g-tip" hidden></div></div>
      <div class="g-legend">${g.fns.map((f, i) => `<span><i style="background:${f.color}"></i><span class="g-eq">${pretty(f.label ? `${f.label} = ${f.expr}` : `${String.fromCharCode(102 + i)}(x) = ${f.expr}`)}</span></span>`).join('')}</div>`;
    const clip = fig.querySelector('clipPath'); fig.querySelector('.g-curves').setAttribute('clip-path', `url(#${clip.id})`);
    // Fahren über den Graphen: senkrechte Linie, Punkte auf den Kurven, Werte daneben
    const svg = fig.querySelector('.g-svg'), hov = fig.querySelector('.g-hover'), tip = fig.querySelector('.g-tip');
    const move = (e) => {
      const r = svg.getBoundingClientRect(); const px = (e.clientX - r.left) / r.width * W;
      if (px < PAD || px > W - PAD) { hov.setAttribute('visibility', 'hidden'); tip.hidden = true; return; }
      const x = x0 + (px - PAD) / (W - 2 * PAD) * (x1 - x0);
      hov.setAttribute('visibility', 'visible'); hov.querySelector('.g-hl').setAttribute('x1', px); hov.querySelector('.g-hl').setAttribute('x2', px);
      const rows = [];
      hov.querySelectorAll('circle').forEach((c, i) => { const y = g.fns[i].fn(x); const ok = Number.isFinite(y) && y >= y0 && y <= y1; c.setAttribute('visibility', ok ? 'visible' : 'hidden'); if (ok) { c.setAttribute('cx', px); c.setAttribute('cy', sy(y)); } rows.push(`<span><i style="background:${g.fns[i].color}"></i>${Number.isFinite(y) ? fmt(y) : '–'}</span>`); });
      tip.innerHTML = `<b>x = ${fmt(x)}</b>${rows.join('')}`; tip.hidden = false;
      tip.style.left = `${Math.min(r.width - 120, Math.max(0, e.clientX - r.left + 12))}px`;
    };
    svg.addEventListener('pointermove', move);
    svg.addEventListener('pointerleave', () => { hov.setAttribute('visibility', 'hidden'); tip.hidden = true; });
    return fig;
  }
  // Formel lesbar: x^2 → x², x^(n+1) → hochgestellt, * → ·
  const pretty = (t) => esc(t).replace(/\*/g, '·').replace(/\^\(([^)]{1,20})\)/g, '<sup>$1</sup>').replace(/\^(-?(?:[\d.,]+|[a-zπ]))/g, '<sup>$1</sup>');
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  /* 19.11.: von selbst – steht in einer Antwort eine Funktionsgleichung (f(x) = …, y = … mit x; auch in LaTeX), wird der Graph
     darunter gezeichnet, ohne dass jemand „Graph“ sagen muss. Nur, wenn noch kein Graph da ist. */
  function fromLatex(t) {
    let s = String(t);
    for (let k = 0; k < 4; k++) s = s.replace(/\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '(($1)/($2))');
    return s.replace(/\\sqrt\s*\{([^{}]*)\}/g, 'sqrt($1)').replace(/\\(cdot|times)/g, '*').replace(/\\left|\\right|\\,|\;|\\!|\\ /g, '')
      .replace(/\^\{([^{}]*)\}/g, '^($1)').replace(/\\(sin|cos|tan|ln|log|exp|pi)/g, '$1').replace(/\{|\}/g, '').replace(/\(\(([\w.]+)\)\/\(([\w.]+)\)\)/g, '($1/$2)');
  }
  function find(text) {
    const src = String(text || '').replace(/```[\s\S]*?```/g, ' '), out = [], seen = new Set();
    const re = /(?:\b([a-zA-Z])\s*\(\s*x\s*\)|\by)\s*=\s*([^\n=;$€]{1,70})/g;
    let m;
    while ((m = re.exec(src)) && out.length < 3) {
      // bis zum ersten gewöhnlichen Wort (mit, und, schneidet …) – Funktionsnamen wie sin/sqrt bleiben drin
      let e = fromLatex(m[2]);
      const w = /(?:^|[\s,;])([a-zäöüß]{2,})/gi; let mw, cut = e.length;
      while ((mw = w.exec(e))) { if (!/^(sin|cos|tan|asin|acos|atan|sqrt|abs|ln|log|lg|exp|pi|sinh|cosh|tanh)$/i.test(mw[1]) && !/^x+$/i.test(mw[1])) { cut = mw.index; break; } }
      e = e.slice(0, cut).replace(/[\s.,:;!?]+$/, '');
      while ((e.match(/\)/g) || []).length > (e.match(/\(/g) || []).length && e.endsWith(')')) e = e.slice(0, -1);
      e = e.trim();
      e = e.replace(/\*\*/g, '').replace(/[“”"]/g, '').trim();
      if (!/x/.test(e) || e.length > 60) continue;
      const f = compile(e); if (!f) continue;
      const a = f(0), b = f(1.37); if (!Number.isFinite(a) && !Number.isFinite(b)) continue;
      if (a === b && f(-2.1) === a) continue; // hängt nicht von x ab
      const key = e.replace(/\s/g, ''); if (seen.has(key)) continue; seen.add(key);
      out.push({ expr: e, label: m[1] ? `${m[1]}(x)` : 'y' });
    }
    return out;
  }
  function auto(container, text) {
    if (!container || container.querySelector('.chat-graph')) return null;
    const fns = find(text); if (!fns.length) return null;
    const fig = figure(JSON.stringify({ title: fns.length > 1 ? 'Graphen' : `Graph von ${fns[0].label}`, functions: fns }));
    if (!fig) return null;
    fig.classList.add('g-auto');
    // hinter den Absatz mit der ersten Gleichung, sonst ans Ende
    const hit = [...container.querySelectorAll(':scope > p, :scope > ul, :scope > ol, :scope > .katex-display, :scope > div')].find((n) => /\(x\)|y\s*=/.test(n.textContent));
    if (hit) hit.after(fig); else container.append(fig);
    return fig;
  }
  return { compile, parse, figure, find, auto };
})();
if (typeof window !== 'undefined') window.Graph = Graph;
if (typeof module !== 'undefined') module.exports = Graph;
