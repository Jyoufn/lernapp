/* ===================================================================
   Aktienchart (Block ```stock im Chat, z. B. vom Börsen-Agenten) – wie in einer Börsen-App:
   - Kopf: Name, Kürzel, großer Kurs, Veränderung (grün/rot), „Echtzeit · 10:31:07“ mit pulsierendem Punkt
   - Zeiträume 1T · 1W · 1M · 6M · 1J · 5J (gleitende Fläche), Umschalter Kerzen / Linie (gemerkt)
   - Kerzen mit Dochten, darunter Umsatz-Balken; 20- und 50-Tage-Linie (ab 1M); Vortageskurs gestrichelt (1T);
     Preis-Achse rechts mit Marke für den aktuellen Kurs; Zeit-Achse unten
   - Fadenkreuz mit Eröffnung/Hoch/Tief/Schluss/Umsatz (Maus und Finger)
   - Kurs wird alle 5 s nachgeladen, solange der Chart zu sehen ist (Server: /api/boerse/chart, /api/boerse/quote)
   Farben: Grün #4fcf8a, Rot #f07a6e, 20er #6aa8ff, 50er #fb9a52 (README 3.1)
   =================================================================== */
const StockChart = (() => {
  const RANGES = ['1T', '1W', '1M', '6M', '1J', '5J'];
  const UP = '#4fcf8a', DOWN = '#f07a6e', S20 = '#6aa8ff', S50 = '#fb9a52';
  const H_PRICE = 230, H_VOL = 46, GAP = 8, AXIS_R = 62, AXIS_B = 22, PAD_L = 6;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nf = (x, d) => (x == null || !Number.isFinite(+x) ? '–' : (+x).toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d }));
  const dec = (x) => (Math.abs(x) < 1 ? 4 : Math.abs(x) < 10 ? 3 : 2);
  const eur = (x) => `${nf(x, dec(x || 0))} €`;
  const vol = (v) => (v >= 1e9 ? `${nf(v / 1e9, 1)} Mrd.` : v >= 1e6 ? `${nf(v / 1e6, 1)} Mio.` : v >= 1e3 ? `${nf(v / 1e3, 0)} Tsd.` : nf(v, 0));
  const clock = (t) => new Date(t).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const svgEl = (tag, attrs = {}) => { const n = document.createElementNS('http://www.w3.org/2000/svg', tag); Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v)); return n; };
  const typePref = () => { try { return localStorage.getItem('stock.type') || 'candle'; } catch { return 'candle'; } };

  // ```stock {"symbol":"RHM.DE","name":"Rheinmetall","range":"6M"} – oder nur das Kürzel
  function parse(raw) {
    const t = String(raw || '').trim();
    let o = null;
    try { o = JSON.parse(t); } catch { o = t ? { symbol: t.split(/\s+/)[0] } : null; }
    if (!o || typeof o !== 'object' || !/^[\w.^=-]{1,20}$/.test(String(o.symbol || ''))) return null;
    return { symbol: String(o.symbol), name: String(o.name || ''), range: RANGES.includes(o.range) ? o.range : '6M' };
  }

  // Daten zwischenspeichern: die Antwort wird beim Schreiben mehrfach neu gezeichnet – nicht jedes Mal neu laden
  const memo = new Map();
  function load(symbol, range) {
    const k = `${symbol}|${range}`, hit = memo.get(k);
    if (hit && Date.now() - hit.t < 20000) return hit.p;
    const p = fetch(`/api/boerse/chart?symbol=${encodeURIComponent(symbol)}&range=${range}`).then(async (r) => {
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.bars?.length) throw new Error(j.error || 'keine Kursdaten');
      return j;
    });
    memo.set(k, { t: Date.now(), p });
    p.catch(() => memo.delete(k));
    return p;
  }

  function figure(spec) {
    const fig = document.createElement('figure');
    fig.className = 'stk';
    fig.innerHTML = `<div class="stk-head">
        <div class="stk-title"><strong>${esc(spec.name || spec.symbol)}</strong><span>${esc(spec.symbol)}</span></div>
        <div class="stk-quote"><span class="stk-price shimmer">Kurs wird geladen</span><span class="stk-chg"></span><span class="stk-time"></span></div>
      </div>
      <div class="stk-bar">
        <div class="stk-seg" role="tablist">${RANGES.map((r) => `<button type="button" role="tab" data-range="${r}">${r}</button>`).join('')}<span class="stk-seg-bg"></span></div>
        <div class="stk-legend"><span class="s20">20 Tage</span><span class="s50">50 Tage</span></div>
        <div class="stk-type"><button type="button" data-type="candle" title="Kerzen" aria-label="Kerzen"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3.5 1v12M10.5 1v12" stroke="currentColor" stroke-width="1.2"/><rect x="2" y="3.5" width="3" height="6" rx=".6" fill="currentColor"/><rect x="9" y="5" width="3" height="5" rx=".6" fill="currentColor"/></svg></button><button type="button" data-type="line" title="Linie" aria-label="Linie"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M1 10.5 4.5 6l3 2.5L13 2.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div>
      </div>
      <div class="stk-plot"><div class="stk-tip" hidden></div></div>
      <div class="stk-foot"></div>`;
    const st = { spec, range: spec.range, type: typePref(), data: null, hover: null, timer: 0, seq: 0 };
    fig._stock = st;
    const plot = fig.querySelector('.stk-plot');

    const paintBar = () => {
      fig.querySelectorAll('.stk-seg [data-range]').forEach((b, i) => { const on = b.dataset.range === st.range; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); if (on) fig.querySelector('.stk-seg').style.setProperty('--i', i); });
      fig.querySelectorAll('.stk-type [data-type]').forEach((b) => b.classList.toggle('on', b.dataset.type === st.type));
    };
    const paintHead = () => {
      const d = st.data; if (!d) return;
      const p = fig.querySelector('.stk-price');
      const old = p.dataset.v ? +p.dataset.v : null;
      p.classList.remove('shimmer');
      p.textContent = eur(d.price);
      p.dataset.v = d.price;
      if (old != null && old !== d.price) { p.classList.remove('flash-up', 'flash-down'); void p.offsetWidth; p.classList.add(d.price > old ? 'flash-up' : 'flash-down'); }
      const ch = fig.querySelector('.stk-chg');
      const up = (d.change || 0) >= 0;
      ch.className = `stk-chg ${up ? 'up' : 'down'}`;
      ch.textContent = d.change == null ? '' : `${up ? '+' : '−'}${nf(Math.abs(d.change), 2)} € (${up ? '+' : '−'}${nf(Math.abs(d.changePct), 2)} %) ${{ '1T': 'heute', '1W': '1 Woche', '1M': '1 Monat', '6M': '6 Monate', '1J': '1 Jahr', '5J': '5 Jahre' }[st.range]}`;
      fig.querySelector('.stk-time').innerHTML = d.realtime ? `<i class="stk-live"></i>Echtzeit · ${clock(d.time)}` : `Stand ${clock(d.time)}`;
      fig.querySelector('.stk-title strong').textContent = st.spec.name || d.name || d.symbol;
      fig.querySelector('.stk-foot').textContent = `Quelle: ${d.source}${d.bid && d.ask ? ` · Geld ${eur(d.bid)} / Brief ${eur(d.ask)}` : ''}`;
      fig.querySelector('.stk-legend').hidden = !d.sma20;
    };

    function draw() {
      const d = st.data; if (!d) return;
      const W = Math.max(260, Math.round(plot.clientWidth || 600));
      const H = H_PRICE + GAP + H_VOL + AXIS_B;
      const bars = d.bars, n = bars.length;
      const iw = W - AXIS_R - PAD_L, step = iw / Math.max(n, 1);
      const xOf = (i) => PAD_L + step * (i + 0.5);
      const vals = [];
      bars.forEach((b) => vals.push(st.type === 'candle' ? b.l : b.c, st.type === 'candle' ? b.h : b.c));
      (d.sma20 || []).forEach((v) => v != null && vals.push(v));
      (d.sma50 || []).forEach((v) => v != null && vals.push(v));
      if (st.range === '1T' && d.prevClose) vals.push(d.prevClose);
      let lo = Math.min(...vals), hi = Math.max(...vals);
      const pad = (hi - lo || hi * 0.01) * 0.08; lo -= pad; hi += pad;
      const yOf = (v) => 6 + (1 - (v - lo) / (hi - lo)) * (H_PRICE - 12);
      const vMax = Math.max(1, ...bars.map((b) => b.v || 0));
      const vTop = H_PRICE + GAP;
      const svg = svgEl('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, class: 'stk-svg' });
      // Gitter + Preise rechts
      const ticks = niceTicks(lo, hi, 5);
      const yNow = yOf(d.price);
      ticks.forEach((v) => {
        const y = yOf(v);
        if (Math.abs(y - yNow) < 12) { svg.append(svgEl('line', { x1: PAD_L, x2: W - AXIS_R, y1: y, y2: y, class: 'stk-grid' })); return; } // Marke des aktuellen Kurses verdeckt sonst die Zahl
        svg.append(svgEl('line', { x1: PAD_L, x2: W - AXIS_R, y1: y, y2: y, class: 'stk-grid' }));
        const t = svgEl('text', { x: W - AXIS_R + 8, y: y + 4, class: 'stk-ax' }); t.textContent = nf(v, v >= 1000 ? 0 : dec(v)); svg.append(t);
      });
      // Zeit-Achse
      xTicks(bars, st.range).forEach(({ i, label }) => {
        const x = xOf(i);
        svg.append(svgEl('line', { x1: x, x2: x, y1: 0, y2: H_PRICE, class: 'stk-grid v' }));
        const t = svgEl('text', { x, y: H - 6, class: 'stk-ax mid' }); t.textContent = label; svg.append(t);
      });
      // Vortageskurs (1T)
      if (st.range === '1T' && d.prevClose) {
        const y = yOf(d.prevClose);
        svg.append(svgEl('line', { x1: PAD_L, x2: W - AXIS_R, y1: y, y2: y, class: 'stk-prev' }));
      }
      const upAll = bars[n - 1].c >= (st.range === '1T' && d.prevClose ? d.prevClose : bars[0].o);
      // Umsatz
      bars.forEach((b, i) => {
        if (!b.v) return;
        const h = Math.max(1, (b.v / vMax) * H_VOL);
        svg.append(svgEl('rect', { x: xOf(i) - Math.max(0.5, step * 0.32), y: vTop + H_VOL - h, width: Math.max(1, step * 0.64), height: h, fill: b.c >= b.o ? UP : DOWN, opacity: 0.32 }));
      });
      // Kurs
      if (st.type === 'candle') {
        const bw = Math.max(1, Math.min(14, step * 0.64));
        bars.forEach((b, i) => {
          const x = xOf(i), c = b.c >= b.o ? UP : DOWN;
          svg.append(svgEl('line', { x1: x, x2: x, y1: yOf(b.h), y2: yOf(b.l), stroke: c, 'stroke-width': 1 }));
          const y1 = yOf(Math.max(b.o, b.c)), y2 = yOf(Math.min(b.o, b.c));
          svg.append(svgEl('rect', { x: x - bw / 2, y: y1, width: bw, height: Math.max(1, y2 - y1), fill: c, rx: bw > 4 ? 1 : 0 }));
        });
      } else {
        const c = upAll ? UP : DOWN;
        const pts = bars.map((b, i) => `${xOf(i).toFixed(1)},${yOf(b.c).toFixed(1)}`);
        svg.append(svgEl('path', { d: `M${pts[0]} L${pts.join(' L')} L${xOf(n - 1).toFixed(1)},${H_PRICE} L${xOf(0).toFixed(1)},${H_PRICE} Z`, fill: c, opacity: 0.09 }));
        svg.append(svgEl('path', { d: `M${pts.join(' L')}`, fill: 'none', stroke: c, 'stroke-width': 1.8, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', class: 'stk-line' }));
      }
      // 20/50-Tage-Linie
      [[d.sma20, S20], [d.sma50, S50]].forEach(([arr, col]) => {
        if (!arr) return;
        let p = '';
        arr.forEach((v, i) => { if (v == null) return; p += `${p ? ' L' : 'M'}${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`; });
        if (p) svg.append(svgEl('path', { d: p, fill: 'none', stroke: col, 'stroke-width': 1.2, opacity: 0.9 }));
      });
      // aktueller Kurs: Linie + Marke rechts
      const yl = yOf(d.price), lc = upAll ? UP : DOWN;
      svg.append(svgEl('line', { x1: PAD_L, x2: W - AXIS_R, y1: yl, y2: yl, stroke: lc, 'stroke-dasharray': '2 3', 'stroke-width': 1, opacity: 0.7 }));
      svg.append(svgEl('rect', { x: W - AXIS_R + 2, y: yl - 9, width: AXIS_R - 4, height: 18, rx: 4, fill: lc }));
      const tl = svgEl('text', { x: W - AXIS_R + 8, y: yl + 4, class: 'stk-ax tag' }); tl.textContent = nf(d.price, dec(d.price)); svg.append(tl);
      // Fadenkreuz
      if (st.hover != null && bars[st.hover]) {
        const b = bars[st.hover], x = xOf(st.hover), y = yOf(b.c);
        svg.append(svgEl('line', { x1: x, x2: x, y1: 0, y2: vTop + H_VOL, class: 'stk-cross' }));
        svg.append(svgEl('line', { x1: PAD_L, x2: W - AXIS_R, y1: y, y2: y, class: 'stk-cross' }));
        svg.append(svgEl('circle', { cx: x, cy: y, r: 3, fill: '#fff' }));
        svg.append(svgEl('rect', { x: W - AXIS_R + 2, y: y - 9, width: AXIS_R - 4, height: 18, rx: 4, fill: '#3a3a3a' }));
        const t = svgEl('text', { x: W - AXIS_R + 8, y: y + 4, class: 'stk-ax tag' }); t.textContent = nf(b.c, dec(b.c)); svg.append(t);
      }
      plot.querySelector('svg')?.remove();
      plot.prepend(svg);
      st.geo = { xOf, step, n, W };
    }

    async function show(range) {
      st.range = range; st.hover = null; paintBar();
      const my = ++st.seq;
      plot.classList.add('loading');
      try {
        const d = await load(st.spec.symbol, range);
        if (my !== st.seq) return;
        st.data = structuredClone(d);
        paintHead(); draw();
        fig.querySelector('.stk-err')?.remove();
      } catch (err) {
        if (my !== st.seq) return;
        if (!fig.querySelector('.stk-err')) plot.insertAdjacentHTML('beforeend', `<div class="stk-err">Chart konnte nicht geladen werden (${esc(err.message)})</div>`);
        const p = fig.querySelector('.stk-price'); p.classList.remove('shimmer'); if (!st.data) p.textContent = '–';
      } finally { if (my === st.seq) plot.classList.remove('loading'); }
    }

    // Echtzeit: alle 5 s den Kurs holen, solange der Chart zu sehen ist
    let visible = false;
    const tick = async () => {
      if (!fig.isConnected) { clearInterval(st.timer); return; }
      if (!visible || document.hidden || !st.data) return;
      try {
        const q = await (await fetch(`/api/boerse/quote?symbol=${encodeURIComponent(st.spec.symbol)}`)).json();
        if (!q?.price || !st.data) return;
        const d = st.data, last = d.bars[d.bars.length - 1];
        d.bars[d.bars.length - 1] = { ...last, c: q.price, h: Math.max(last.h, q.price), l: Math.min(last.l, q.price) };
        const base = st.range === '1T' ? (q.prevClose || d.prevClose) : d.prevClose;
        Object.assign(d, { price: q.price, time: q.time, realtime: q.realtime, bid: q.bid ?? d.bid, ask: q.ask ?? d.ask });
        if (base) { d.change = q.price - base; d.changePct = (q.price / base - 1) * 100; }
        paintHead(); draw();
      } catch {}
    };
    st.timer = setInterval(tick, 5000);
    if ('IntersectionObserver' in window) new IntersectionObserver((e) => { visible = e[0].isIntersecting; }).observe(fig);
    else visible = true;
    if ('ResizeObserver' in window) { let w = 0; new ResizeObserver(() => { const nw = plot.clientWidth; if (nw && Math.abs(nw - w) > 2) { w = nw; draw(); } }).observe(plot); }

    // Bedienung
    fig.addEventListener('click', (e) => {
      const r = e.target.closest('[data-range]'); if (r && r.dataset.range !== st.range) { show(r.dataset.range); return; }
      const t = e.target.closest('[data-type]');
      if (t && t.dataset.type !== st.type) { st.type = t.dataset.type; try { localStorage.setItem('stock.type', st.type); } catch {} paintBar(); draw(); }
    });
    const tip = plot.querySelector('.stk-tip');
    const hoverAt = (e) => {
      if (!st.geo || !st.data) return;
      const rect = plot.getBoundingClientRect();
      const x = e.clientX - rect.left;
      if (x > st.geo.W - AXIS_R) { leave(); return; }
      const i = Math.max(0, Math.min(st.geo.n - 1, Math.floor((x - PAD_L) / st.geo.step)));
      if (i === st.hover) return;
      st.hover = i; draw();
      const b = st.data.bars[i];
      const when = new Date(b.t).toLocaleString('de-DE', ['1T', '1W'].includes(st.range) ? { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' } : { day: '2-digit', month: '2-digit', year: 'numeric' });
      tip.innerHTML = `<b>${esc(when)}</b><span>Eröffnung <em>${nf(b.o, dec(b.o))}</em></span><span>Hoch <em>${nf(b.h, dec(b.h))}</em></span><span>Tief <em>${nf(b.l, dec(b.l))}</em></span><span>Schluss <em class="${b.c >= b.o ? 'up' : 'down'}">${nf(b.c, dec(b.c))}</em></span>${b.v ? `<span>Umsatz <em>${vol(b.v)}</em></span>` : ''}`;
      tip.hidden = false;
      tip.classList.toggle('right', st.geo.xOf(i) < st.geo.W / 2);
    };
    const leave = () => { if (st.hover == null) return; st.hover = null; tip.hidden = true; draw(); };
    plot.addEventListener('pointermove', hoverAt);
    plot.addEventListener('pointerdown', hoverAt);
    plot.addEventListener('pointerleave', leave);

    paintBar();
    requestAnimationFrame(() => show(st.range));
    return fig;
  }

  // runde Werte für die Preis-Achse
  function niceTicks(lo, hi, count) {
    const span = hi - lo, raw = span / count, mag = 10 ** Math.floor(Math.log10(raw));
    const stepV = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || raw;
    const out = [];
    for (let v = Math.ceil(lo / stepV) * stepV; v <= hi; v += stepV) out.push(+v.toFixed(10));
    return out;
  }
  // 4–6 Beschriftungen unten, passend zum Zeitraum
  function xTicks(bars, range) {
    const n = bars.length, want = 5, out = [];
    const fmt = (t) => {
      const d = new Date(t);
      if (range === '1T') return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
      if (range === '1W') return d.toLocaleDateString('de-DE', { weekday: 'short' });
      if (range === '5J') return String(d.getFullYear());
      if (range === '1J') return d.toLocaleDateString('de-DE', { month: 'short' });
      return d.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
    };
    let last = '';
    for (let k = 0; k < want; k++) {
      const i = Math.round(((k + 0.5) / want) * (n - 1));
      const label = fmt(bars[i].t);
      if (label !== last) out.push({ i, label });
      last = label;
    }
    return out;
  }

  return { parse, figure, RANGES };
})();
window.StockChart = StockChart;
