/* ===================================================================
   Aktienchart (Block ```stock im Chat, z. B. vom Börsen-Agenten) – wie in einer Börsen-App:
   - Kopf: Name, Kürzel, großer Kurs, Veränderung (grün/rot), „Echtzeit · 10:31:07“ mit pulsierendem Punkt
   - darunter Tag · Woche · Monat nebeneinander (Richtung, Prozent, kleiner Verlauf) – Klick zeigt den Zeitraum groß
   - Zeiträume 1T · 1W · 1M · 6M · 1J · 5J (gleitende Fläche), Umschalter Kerzen / Linie (gemerkt)
   - Kerzen mit Dochten, darunter Umsatz-Balken; 20- und 50-Tage-Linie (ab 1M); Vortageskurs gestrichelt (1T);
     Preis-Achse rechts mit Marke für den aktuellen Kurs; Zeit-Achse unten
   - Fadenkreuz mit Eröffnung/Hoch/Tief/Schluss/Umsatz (Maus und Finger)
   - immer live: Kurs alle 3 s (neue Kerzen entstehen), Verlauf jede Minute, sofort nach dem Zurückkommen (Server: /api/boerse/chart, /api/boerse/quote)
   - Depot (spec.pos): Kaufkurs als Linie mit Marke am Kauftag, oben im Chart „Seit Kauf ±… € (±… %)“ und Wert der Position
   - Linien (spec.levels): z. B. Stopp (rot) und Ziel (grün) als feine gestrichelte Linien mit kleiner Beschriftung
   - Prognose (spec.forecast): der Verlauf wird nach rechts weitergeführt – Mittelweg gestrichelt, Band = 80 % der wahrscheinlichen
     Kurse (Trend und Schwankung der letzten Monate fortgeschrieben; mit "target"/"low"/"high" vom Bären auf dessen Szenario ausgerichtet)
   Farben: Grün #4fcf8a, Rot #f07a6e, 20er #6aa8ff, 50er #fb9a52, Prognose Akzent-Blau #6aa8ff (README 3.1)
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
    const num = (x) => (Number.isFinite(+x) && +x > 0 ? +x : null);
    let forecast = null;
    if (o.forecast) {
      const f = typeof o.forecast === 'object' ? o.forecast : {};
      forecast = { horizon: HORIZON[f.horizon] ? f.horizon : '3M', target: num(f.target), low: num(f.low), high: num(f.high) };
    }
    const range = RANGES.includes(o.range) ? o.range : forecast ? (['6M', '1J'].includes(forecast.horizon) ? '1J' : '6M') : '6M';
    return { symbol: String(o.symbol), name: String(o.name || ''), range, ...(forecast ? { forecast } : {}) };
  }
  // Prognose-Zeiträume in Handelstagen
  const HORIZON = { '1W': 5, '1M': 21, '3M': 63, '6M': 126, '1J': 252 };
  const HORIZON_TEXT = { '1W': '1 Woche', '1M': '1 Monat', '3M': '3 Monate', '6M': '6 Monate', '1J': '1 Jahr' };
  // Prognose-Pfad: Trend (halbiert – Trends laufen selten ungebremst weiter) und Schwankung der geladenen Kurse fortgeschrieben.
  // k = Schritte in die Zukunft; mid/lo/hi = Mittelweg und 80-%-Band. target/low/high richten den Pfad auf das Szenario des Bären aus.
  function forecastPath(bars, steps, f) {
    const c = bars.map((b) => b.c).filter((x) => x > 0).slice(-160);
    const r = c.slice(1).map((x, i) => Math.log(x / c[i]));
    if (!r.length || !steps) return null;
    const mean = r.reduce((a, b) => a + b, 0) / r.length;
    const sd = Math.sqrt(r.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, r.length - 1)) || 0.01;
    const p0 = c[c.length - 1];
    const mu = f.target ? Math.log(f.target / p0) / steps : mean * 0.5;
    const z = 1.2816;
    const upW = f.high ? Math.max(0.0001, Math.log(f.high / (p0 * Math.exp(mu * steps)))) / Math.sqrt(steps) : z * sd;
    const dnW = f.low ? Math.max(0.0001, Math.log((p0 * Math.exp(mu * steps)) / f.low)) / Math.sqrt(steps) : z * sd;
    return Array.from({ length: steps + 1 }, (_, k) => ({ k, mid: p0 * Math.exp(mu * k), hi: p0 * Math.exp(mu * k + upW * Math.sqrt(k)), lo: p0 * Math.exp(mu * k - dnW * Math.sqrt(k)) }));
  }
  // nächste Handelstage (ohne Wochenende) für die Beschriftung der Zukunft
  const futureTime = (t, k, weekly) => {
    const d = new Date(t);
    if (weekly) { d.setDate(d.getDate() + 7 * k); return +d; }
    for (let i = 0; i < k;) { d.setDate(d.getDate() + 1); if (d.getDay() % 6) i++; }
    return +d;
  };

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
    window.enterOnce?.(fig);
    fig.innerHTML = `<div class="stk-head">
        <div class="stk-title"><strong>${esc(spec.name || spec.symbol)}</strong><span>${esc(spec.symbol)}</span></div>
        <div class="stk-quote"><span class="stk-price shimmer">Kurs wird geladen</span><span class="stk-chg"></span><span class="stk-time"></span></div>
      </div>
      <div class="stk-tf">${[['1T', 'Tag'], ['1W', 'Woche'], ['1M', 'Monat']].map(([r, l]) => `<button type="button" class="stk-mini" data-range="${r}"><span class="stk-mini-l">${l}</span><span class="stk-mini-c">–</span><span class="stk-mini-s"></span></button>`).join('')}</div>
      <div class="stk-bar">
        <div class="stk-seg" role="tablist">${RANGES.map((r) => `<button type="button" role="tab" data-range="${r}">${r}</button>`).join('')}<span class="stk-seg-bg"></span></div>
        <div class="stk-legend"><span class="s20">20 Tage</span><span class="s50">50 Tage</span></div>
        <div class="stk-type"><button type="button" data-type="candle" title="Kerzen" aria-label="Kerzen"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3.5 1v12M10.5 1v12" stroke="currentColor" stroke-width="1.2"/><rect x="2" y="3.5" width="3" height="6" rx=".6" fill="currentColor"/><rect x="9" y="5" width="3" height="5" rx=".6" fill="currentColor"/></svg></button><button type="button" data-type="line" title="Linie" aria-label="Linie"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M1 10.5 4.5 6l3 2.5L13 2.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div>
      </div>
      <div class="stk-plot"><div class="stk-tip" hidden></div><div class="stk-over" hidden></div></div>
      <div class="stk-foot"></div>`;
    const st = { spec, range: spec.range, type: typePref(), data: null, hover: null, timer: 0, seq: 0 };
    fig._stock = st;
    const plot = fig.querySelector('.stk-plot');

    const paintBar = () => {
      fig.querySelectorAll('.stk-mini').forEach((b) => b.classList.toggle('on', b.dataset.range === st.range));
      fig.querySelectorAll('.stk-seg [data-range]').forEach((b, i) => { const on = b.dataset.range === st.range; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); if (on) fig.querySelector('.stk-seg').style.setProperty('--i', i); });
      fig.querySelectorAll('.stk-type [data-type]').forEach((b) => b.classList.toggle('on', b.dataset.type === st.type));
    };
    // Tag, Woche, Monat nebeneinander: Richtung, Prozent, kleiner Verlauf – Klick zeigt den Zeitraum groß
    const mini = (range, d) => {
      const b = fig.querySelector(`.stk-mini[data-range="${range}"]`); if (!b || !d?.bars?.length) return;
      const v = d.bars.map((x) => x.c), base = range === '1T' && d.prevClose ? d.prevClose : v[0], last = v[v.length - 1];
      const ch = (last / base - 1) * 100, up = ch >= 0, lo = Math.min(...v, base), hi = Math.max(...v, base), r = hi - lo || 1, W = 72, H = 24;
      const pts = v.map((x, i) => `${((i / (v.length - 1)) * (W - 2) + 1).toFixed(1)},${(H - 2 - ((x - lo) / r) * (H - 4)).toFixed(1)}`).join(' ');
      b.querySelector('.stk-mini-c').textContent = `${up ? '▲' : '▼'} ${up ? '+' : '−'}${nf(Math.abs(ch), 2)} %`;
      b.querySelector('.stk-mini-c').className = `stk-mini-c ${up ? 'up' : 'down'}`;
      b.querySelector('.stk-mini-s').innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="${up ? UP : DOWN}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
    };
    const loadMinis = () => ['1T', '1W', '1M'].forEach((r) => load(st.spec.symbol, r).then((d) => mini(r, r === st.range && st.data ? st.data : d)).catch(() => {}));
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
      // keine Quellenangabe (Wunsch des Nutzers) – nur Geld/Brief und bei Prognosen der Hinweis
      const foot = [d.bid && d.ask ? `Geld ${eur(d.bid)} / Brief ${eur(d.ask)}` : '', st.spec.forecast ? 'Prognose: Trend und Schwankung fortgeschrieben, Band = 80 % Wahrscheinlichkeit – keine Garantie' : ''].filter(Boolean).join(' · ');
      fig.querySelector('.stk-foot').textContent = foot;
      fig.querySelector('.stk-foot').hidden = !foot;
      // Depot: Ergebnis der Position direkt im Chart (statt als Text darunter)
      const over = fig.querySelector('.stk-over'), pos = st.spec.pos;
      if (pos?.buyPrice && d.price) {
        const plus = (d.price - pos.buyPrice) * (pos.qty || 1), pct = (d.price / pos.buyPrice - 1) * 100, up = plus >= 0;
        over.innerHTML = `<span class="stk-over-l">Seit Kauf</span><b class="${up ? 'up' : 'down'}">${up ? '+' : '−'}${nf(Math.abs(plus), 2)} € <em>${up ? '+' : '−'}${nf(Math.abs(pct), 2)} %</em></b>`
          + (pos.qty ? `<span class="stk-over-s">${nf(pos.qty, pos.qty % 1 ? 2 : 0)} Stk · Wert ${nf(pos.qty * d.price, 2)} €</span>` : '');
        over.hidden = false;
      } else if (st.spec.forecast && st.fc) {
        const end = st.fc[st.fc.length - 1], up = end.mid >= d.price;
        over.innerHTML = `<span class="stk-over-l">Prognose ${HORIZON_TEXT[st.spec.forecast.horizon]}</span><b class="fc">${eur(end.mid)} <em class="${up ? 'up' : 'down'}">${up ? '+' : '−'}${nf(Math.abs((end.mid / d.price - 1) * 100), 1)} %</em></b><span class="stk-over-s">Spanne ${eur(end.lo)} – ${eur(end.hi)}</span>`;
        over.hidden = false;
      } else over.hidden = true;
      fig.querySelector('.stk-legend').hidden = !d.sma20;
    };

    function draw() {
      const d = st.data; if (!d) return;
      const W = Math.max(260, Math.round(plot.clientWidth || 600));
      const H = H_PRICE + GAP + H_VOL + AXIS_B;
      const bars = d.bars, n = bars.length;
      // Prognose nur auf Tages-/Wochenkerzen (nicht 1T/1W); Zukunft bekommt rechts eigene Plätze
      const weekly = st.range === '5J';
      const fSteps = st.spec.forecast && !['1T', '1W'].includes(st.range) ? Math.max(1, Math.round(HORIZON[st.spec.forecast.horizon] / (weekly ? 5 : 1))) : 0;
      const fc = fSteps ? forecastPath(bars, fSteps, st.spec.forecast) : null;
      st.fc = fc ? fc.map((p) => ({ ...p, mid: p.mid * (d.price / fc[0].mid), lo: p.lo * (d.price / fc[0].mid), hi: p.hi * (d.price / fc[0].mid) })) : null;
      const slots = n + (st.fc ? fSteps : 0);
      const iw = W - AXIS_R - PAD_L, step = iw / Math.max(slots, 1);
      const xOf = (i) => PAD_L + step * (i + 0.5);
      const vals = [];
      bars.forEach((b) => vals.push(st.type === 'candle' ? b.l : b.c, st.type === 'candle' ? b.h : b.c));
      (d.sma20 || []).forEach((v) => v != null && vals.push(v));
      (d.sma50 || []).forEach((v) => v != null && vals.push(v));
      if (st.range === '1T' && d.prevClose) vals.push(d.prevClose);
      (st.spec.levels || []).forEach((l) => l.price > 0 && vals.push(l.price));
      if (st.spec.pos?.buyPrice) vals.push(st.spec.pos.buyPrice);
      (st.fc || []).forEach((p) => vals.push(p.lo, p.hi));
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
        if (Math.abs(y - yNow) < 15) { svg.append(svgEl('line', { x1: PAD_L, x2: W - AXIS_R, y1: y, y2: y, class: 'stk-grid' })); return; } // Marke des aktuellen Kurses verdeckt sonst die Zahl
        svg.append(svgEl('line', { x1: PAD_L, x2: W - AXIS_R, y1: y, y2: y, class: 'stk-grid' }));
        const t = svgEl('text', { x: W - AXIS_R + 8, y: y + 4, class: 'stk-ax' }); t.textContent = nf(v, v >= 1000 ? 0 : dec(v)); svg.append(t);
      });
      // Zeit-Achse
      const fTicks = st.fc ? [{ i: n - 1 + fSteps, label: new Date(futureTime(bars[n - 1].t, fSteps, weekly)).toLocaleDateString('de-DE', fSteps > 60 ? { month: 'short', year: 'numeric' } : { day: 'numeric', month: 'short' }) }] : [];
      [...xTicks(bars, st.range).filter((t) => !st.fc || t.i < n - 2), ...fTicks].forEach(({ i, label }) => {
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
        svg.append(svgEl('rect', { x: xOf(i) - Math.max(0.5, step * 0.32), y: vTop + H_VOL - h, width: Math.max(1, step * 0.64), height: h, fill: '#8a8a8a', opacity: b.c >= b.o ? 0.28 : 0.18 })); // Umsatz grau – sonst wirkt der ganze Chart grünlich
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
        const defs = svgEl('defs', {});
        defs.innerHTML = '<linearGradient id="stk-fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.07"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>';
        svg.append(defs);
        svg.append(svgEl('path', { d: `M${pts[0]} L${pts.join(' L')} L${xOf(n - 1).toFixed(1)},${H_PRICE} L${xOf(0).toFixed(1)},${H_PRICE} Z`, fill: 'url(#stk-fade)' })); // Fläche unter der Linie: neutrales Grau, nach unten auslaufend (nicht grün/rot getönt)
        svg.append(svgEl('path', { d: `M${pts.join(' L')}`, fill: 'none', stroke: c, 'stroke-width': 1.8, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', class: 'stk-line', pathLength: 1 }));
        // nur beim ersten Zeichnen zieht sich die Linie von links nach rechts (Live-Kurse und Zeitraum-Wechsel zeichnen ohne Effekt)
        if (!fig.classList.contains('drawn')) setTimeout(() => fig.classList.add('drawn'), 1100);
      }
      // 20/50-Tage-Linie
      [[d.sma20, S20], [d.sma50, S50]].forEach(([arr, col]) => {
        if (!arr) return;
        let p = '';
        arr.forEach((v, i) => { if (v == null) return; p += `${p ? ' L' : 'M'}${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`; });
        if (p) svg.append(svgEl('path', { d: p, fill: 'none', stroke: col, 'stroke-width': 1.2, opacity: 0.9 }));
      });
      // Linien: Kaufkurs (grau), Stopp (rot), Ziel (grün) – fein gestrichelt, Beschriftung klein links über der Linie
      const lvl = [...(st.spec.pos?.buyPrice ? [{ price: st.spec.pos.buyPrice, label: 'Kauf', kind: 'buy' }] : []), ...(st.spec.levels || [])];
      lvl.forEach((l) => {
        if (!(l.price > 0)) return;
        const y = yOf(l.price), col = l.kind === 'stop' ? DOWN : l.kind === 'target' ? UP : '#9a9a9a';
        svg.append(svgEl('line', { x1: PAD_L, x2: W - AXIS_R, y1: y, y2: y, stroke: col, 'stroke-dasharray': '4 4', 'stroke-width': 1, opacity: 0.75 }));
        const t = svgEl('text', { x: PAD_L + 4, y: y - 5, class: 'stk-lvl', fill: col }); t.textContent = `${l.label} ${nf(l.price, dec(l.price))} €`; svg.append(t);
      });
      // Kauftag: Punkt auf der Kurslinie, wenn der Kauf im gezeigten Zeitraum liegt
      if (st.spec.pos?.date) {
        const bt = new Date(st.spec.pos.date).getTime();
        if (bt >= bars[0].t && bt <= bars[n - 1].t + 86400000) {
          let bi = 0; bars.forEach((b, i) => { if (b.t <= bt + 43200000) bi = i; });
          const cx = xOf(bi), cy = yOf(st.spec.pos.buyPrice || bars[bi].c);
          svg.append(svgEl('circle', { cx, cy, r: 5.5, fill: '#171717', stroke: '#e6e6e6', 'stroke-width': 1.6 }));
          svg.append(svgEl('circle', { cx, cy, r: 2, fill: '#e6e6e6' }));
        }
      }
      // Prognose: „Heute“-Strich, Band (80 %) und gestrichelter Mittelweg nach rechts
      if (st.fc) {
        const x0 = xOf(n - 1);
        svg.append(svgEl('line', { x1: x0, x2: x0, y1: 0, y2: H_PRICE, class: 'stk-today' }));
        const tt = svgEl('text', { x: x0 + 5, y: 12, class: 'stk-ax' }); tt.textContent = 'Heute'; svg.append(tt);
        const xs = st.fc.map((p) => xOf(n - 1 + p.k));
        const band = `M${st.fc.map((p, j) => `${xs[j].toFixed(1)},${yOf(p.hi).toFixed(1)}`).join(' L')} L${st.fc.slice().reverse().map((p, j) => `${xs[st.fc.length - 1 - j].toFixed(1)},${yOf(p.lo).toFixed(1)}`).join(' L')} Z`;
        svg.append(svgEl('path', { d: band, fill: S20, opacity: 0.13, class: 'stk-fc-band' }));
        svg.append(svgEl('path', { d: `M${st.fc.map((p, j) => `${xs[j].toFixed(1)},${yOf(p.hi).toFixed(1)}`).join(' L')}`, fill: 'none', stroke: S20, 'stroke-width': 1, opacity: 0.35 }));
        svg.append(svgEl('path', { d: `M${st.fc.map((p, j) => `${xs[j].toFixed(1)},${yOf(p.lo).toFixed(1)}`).join(' L')}`, fill: 'none', stroke: S20, 'stroke-width': 1, opacity: 0.35 }));
        svg.append(svgEl('path', { d: `M${st.fc.map((p, j) => `${xs[j].toFixed(1)},${yOf(p.mid).toFixed(1)}`).join(' L')}`, fill: 'none', stroke: S20, 'stroke-width': 1.8, 'stroke-dasharray': '5 4', 'stroke-linecap': 'round', class: 'stk-fc-line' }));
        const end = st.fc[st.fc.length - 1];
        svg.append(svgEl('circle', { cx: xs[xs.length - 1], cy: yOf(end.mid), r: 3.5, fill: S20 }));
      }
      // aktueller Kurs: Linie + Marke rechts
      const yl = yOf(d.price), lc = upAll ? UP : DOWN;
      svg.append(svgEl('line', { x1: PAD_L, x2: st.fc ? xOf(n - 1) : W - AXIS_R, y1: yl, y2: yl, stroke: lc, 'stroke-dasharray': '2 3', 'stroke-width': 1, opacity: 0.7 }));
      svg.append(svgEl('rect', { x: W - AXIS_R + 2, y: yl - 9, width: AXIS_R - 4, height: 18, rx: 4, fill: lc }));
      const tl = svgEl('text', { x: W - AXIS_R + 8, y: yl + 4, class: 'stk-ax tag' }); tl.textContent = nf(d.price, dec(d.price)); svg.append(tl);
      // Fadenkreuz
      if (st.hover != null && bars[st.hover]) {
        const b = bars[st.hover], x = xOf(st.hover), y = yOf(b.c);
        svg.append(svgEl('line', { x1: x, x2: x, y1: 0, y2: vTop + H_VOL, class: 'stk-cross' }));
        svg.append(svgEl('line', { x1: PAD_L, x2: W - AXIS_R, y1: y, y2: y, class: 'stk-cross' }));
        svg.append(svgEl('circle', { cx: x, cy: y, r: 3, fill: '#fff' }));
        svg.append(svgEl('rect', { x: W - AXIS_R + 2, y: y - 9, width: AXIS_R - 4, height: 18, rx: 4, fill: '#4a4a4a' }));
        const t = svgEl('text', { x: W - AXIS_R + 8, y: y + 4, class: 'stk-ax tag' }); t.textContent = nf(b.c, dec(b.c)); svg.append(t);
      }
      plot.querySelector('svg')?.remove();
      plot.prepend(svg);
      // Fadenkreuz in der Zukunft: Punkt auf dem Mittelweg
      if (st.hover != null && st.hover >= n && st.fc?.[st.hover - n + 1]) {
        const p = st.fc[st.hover - n + 1], x = xOf(st.hover);
        svg.append(svgEl('line', { x1: x, x2: x, y1: 0, y2: H_PRICE, class: 'stk-cross' }));
        svg.append(svgEl('circle', { cx: x, cy: yOf(p.mid), r: 3, fill: '#fff' }));
      }
      st.geo = { xOf, yOf, step, n, slots, W, weekly };
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

    // Immer live: alle 3 s der Kurs (neue Kerze, wenn ein neuer Abschnitt beginnt), jede Minute der ganze Verlauf neu.
    // Läuft, solange der Chart zu sehen ist; wird er wieder sichtbar (anderer Tab, App wieder vorn), sofort aktualisieren.
    const STEP = { '1T': 300000, '1W': 900000 };
    let visible = false, lastFull = Date.now(), busyTick = false, lastTick = 0;
    const tick = async () => {
      if (!fig.isConnected) { if (!fig._gone) { fig._gone = setTimeout(() => { if (!fig.isConnected) clearInterval(st.timer); fig._gone = 0; }, 4000); } return; } // kurz ausgehängt (Weiterschreiben) ≠ weg
      if (!visible || document.hidden || !st.data || busyTick || Date.now() - lastTick < 2500) return;
      lastTick = Date.now();
      busyTick = true;
      try {
        if (Date.now() - lastFull > 60000) { // ganzer Verlauf (z. B. neue Tageskerze, frische 20/50-Tage-Linie)
          lastFull = Date.now();
          memo.delete(`${st.spec.symbol}|${st.range}`);
          const d = await load(st.spec.symbol, st.range).catch(() => null);
          if (d) st.data = structuredClone(d);
        }
        const q = await (await fetch(`/api/boerse/quote?symbol=${encodeURIComponent(st.spec.symbol)}`)).json();
        if (!q?.price || !st.data) return;
        const d = st.data, last = d.bars[d.bars.length - 1];
        const step = STEP[st.range] || 86400000;
        const now = q.time || Date.now();
        const newBar = step < 86400000 ? Math.floor(now / step) > Math.floor(last.t / step) : new Date(now).toDateString() !== new Date(last.t).toDateString() && ['1M', '6M', '1J'].includes(st.range);
        if (newBar) {
          d.bars.push({ t: now, o: last.c, h: Math.max(last.c, q.price), l: Math.min(last.c, q.price), c: q.price, v: 0 });
          if (d.bars.length > 400) d.bars.shift();
          ['sma20', 'sma50'].forEach((k) => { if (d[k]) { d[k].push(d[k][d[k].length - 1]); if (d[k].length > d.bars.length) d[k].shift(); } });
        } else d.bars[d.bars.length - 1] = { ...last, c: q.price, h: Math.max(last.h, q.price), l: Math.min(last.l, q.price) };
        const base = st.range === '1T' ? (q.prevClose || d.prevClose) : d.prevClose;
        Object.assign(d, { price: q.price, time: q.time, realtime: q.realtime, bid: q.bid ?? d.bid, ask: q.ask ?? d.ask });
        if (base) { d.change = q.price - base; d.changePct = (q.price / base - 1) * 100; }
        paintHead(); draw(); mini(st.range, d);
        if (Date.now() - lastFull < 4000) loadMinis();
      } catch {} finally { busyTick = false; }
    };
    st.timer = setInterval(tick, 3000);
    if ('IntersectionObserver' in window) new IntersectionObserver((e) => { const was = visible; visible = e[0].isIntersecting; if (visible && !was) tick(); }).observe(fig);
    else visible = true;
    document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
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
      const i = Math.max(0, Math.min(st.geo.slots - 1, Math.floor((x - PAD_L) / st.geo.step)));
      if (i === st.hover) return;
      st.hover = i; draw();
      if (i >= st.geo.n && st.fc) { // Zukunft: Datum, Mittelweg und Spanne
        const p = st.fc[i - st.geo.n + 1], last = st.data.bars[st.geo.n - 1];
        tip.innerHTML = `<span class="stk-tip-t">Prognose · ${new Date(futureTime(last.t, p.k, st.geo.weekly)).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span><b>${nf(p.mid, dec(p.mid))} €</b><span class="stk-tip-s">Spanne ${nf(p.lo, dec(p.lo))} – ${nf(p.hi, dec(p.hi))} €</span>`;
        tip.hidden = false;
        const w = tip.offsetWidth, h = tip.offsetHeight, px = st.geo.xOf(i), py = st.geo.yOf(p.hi);
        tip.style.left = `${Math.max(2, Math.min(st.geo.W - AXIS_R - w, px - w / 2))}px`;
        tip.style.top = `${py - h - 12 >= 2 ? py - h - 12 : py + 14}px`;
        return;
      }
      const b = st.data.bars[i];
      const when = new Date(b.t).toLocaleString('de-DE', ['1T', '1W'].includes(st.range) ? { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' } : { day: '2-digit', month: '2-digit', year: 'numeric' });
      // kleine Marke direkt über dem Punkt: Zeit, Schlusskurs mit Veränderung zur Eröffnung, darunter Hoch/Tief/Umsatz in einer Zeile
      const ch = b.o ? ((b.c - b.o) / b.o) * 100 : 0;
      tip.innerHTML = `<span class="stk-tip-t">${esc(when)}</span><b>${nf(b.c, dec(b.c))} €<em class="${b.c >= b.o ? 'up' : 'down'}">${ch >= 0 ? '+' : '−'}${nf(Math.abs(ch), 2)} %</em></b>`
        + `<span class="stk-tip-s">H ${nf(b.h, dec(b.h))} · T ${nf(b.l, dec(b.l))}${b.v ? ` · ${vol(b.v)}` : ''}</span>`;
      tip.hidden = false;
      const px = st.geo.xOf(i), py = st.geo.yOf ? st.geo.yOf(Math.max(b.h, b.c)) : 0;
      const w = tip.offsetWidth, h = tip.offsetHeight;
      tip.style.left = `${Math.max(2, Math.min(st.geo.W - AXIS_R - w, px - w / 2))}px`;
      tip.style.top = `${py - h - 12 >= 2 ? py - h - 12 : py + 14}px`; // oben kein Platz → unter den Punkt
    };
    const leave = () => { if (st.hover == null) return; st.hover = null; tip.hidden = true; draw(); };
    plot.addEventListener('pointermove', hoverAt);
    plot.addEventListener('pointerdown', hoverAt);
    // Finger (iPad): Marke bleibt nach dem Tippen stehen; Tippen außerhalb blendet sie aus
    plot.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'touch') leave(); });
    document.addEventListener('pointerdown', (e) => { if (fig.isConnected && !plot.contains(e.target)) leave(); });

    paintBar();
    requestAnimationFrame(() => { show(st.range); loadMinis(); });
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
// Börsen-Karten blenden EINMAL ein – per Skript statt CSS: beim Weiterschreiben wird die Antwort bei jedem Schritt neu aufgebaut und die Karte
// aus- und wieder eingehängt; eine CSS-Animation startet dabei jedes Mal neu (Flackern/Ruckeln), eine Skript-Animation läuft einfach weiter
window.enterOnce = (node, { y = 8, delay = 0, dur = 520 } = {}) => {
  if (!node || node._entered) return node;
  node._entered = true;
  node.classList.add('shown');
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) node.animate([{ opacity: 0, transform: `translateY(${y}px)` }, { opacity: 1, transform: 'none' }], { duration: dur, delay, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'backwards' });
  return node;
};
// Börsen-Karten blenden nur EINMAL ein: beim Neuzeichnen der Antwort (Text läuft noch) würden sie sonst jedes Mal neu hereingleiten
if (typeof document !== 'undefined') document.addEventListener('animationend', (e) => { if (e.animationName === 'card-in') e.target.classList.add('shown'); });
