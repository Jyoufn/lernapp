/* ===================================================================
   Depot-Grafik (Block ```depot im Chat, vom Börsen-Bären): das echte Depot aus dem Planspiel Börse, live vom Server
   (/api/planspiel/depot – der Server meldet sich mit den gespeicherten Zugangsdaten an; an den Browser gehen nur Zahlen). Keine KI.
   Ruhig wie der Aktienchart: graue Karte, Zahlen in einem umrandeten Raster, Farbe nur für Plus (grün) und Minus (rot).
   Drei Reiter (Umschalter wie die Zeiträume im Aktienchart):
   - Übersicht: Depotwert, Wertverlauf (Woche · Monat · Gesamt, Fadenkreuz), darunter wie im Spiel: Summe Positionen, Bargeld,
     Gesamt-Depotwert, Performance (€ und %), Trades, Rang
   - Positionen: je Wert eine umrandete Zeile – Stück, Ø-Kaufkurs, 30-Tage-Verlauf, Wert, Plus/Minus, Empfehlung; Klick klappt Details auf
   - Performance: Liste wie im Spiel – je Wertpapier Status (im Depot / verkauft), Kaufwert, Wert bzw. Verkaufswert, Plus in € und % (ohne Gebühren)
   Die Karte bleibt beim Schreiben der Antwort dieselbe (app.js merkt sie sich) – kein Flackern; jede Minute neu, solange sie zu sehen ist.
   =================================================================== */
const DepotCard = (() => {
  const UP = '#4fcf8a', DOWN = '#f07a6e';
  const ACTION = { halten: ['Behalten', 'grey'], beobachten: ['Beobachten', 'orange'], nachkaufen: ['Nachkaufen', 'green'], teilgewinn: ['Teilgewinn', 'blue'], verkaufen: ['Verkaufen', 'red'] };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nf = (x, d = 2) => (x == null || !Number.isFinite(+x) ? '–' : (+x).toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d }));
  const eur = (x, d = 2) => (x == null ? '–' : `${nf(x, d)} €`);
  const signed = (x, unit = ' €', d = 2) => (x == null ? '–' : `${x > 0 ? '+' : x < 0 ? '−' : ''}${nf(Math.abs(x), d)}${unit}`);
  const tone = (x) => (x == null || Math.abs(x) < 1e-9 ? '' : x > 0 ? 'up' : 'down');
  const fi = (n, s = 14) => `<svg width="${s}" height="${s}" aria-hidden="true"><use href="#f-${n}"/></svg>`;
  const day = (iso) => new Date(`${String(iso).slice(0, 10)}T12:00:00`).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
  const clock = (t) => new Date(t).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

  // eine Anfrage für alle Karten
  let memo = null;
  function load(fresh = false) {
    if (!fresh && memo && Date.now() - memo.t < 30000) return memo.p;
    const m = { t: Date.now(), d: memo?.d || null };
    m.p = fetch(`/api/planspiel/depot${fresh ? '?fresh=1' : ''}`).then((r) => r.json()).catch(() => ({ connected: true, error: 'Depot gerade nicht erreichbar.' }))
      .then((d) => { m.d = d; return d; });
    memo = m;
    return m.p;
  }

  const cell = (k, v, cls = '') => `<div class="dpt-k"><span>${k}</span><b class="${cls}">${v}</b></div>`;
  const badge = (a) => { const [t, c] = ACTION[a] || ACTION.halten; return `<span class="dpt-badge ${c}">${t}</span>`; };
  function spark(v, w = 60, h = 20) {
    if (!v || v.length < 2) return '';
    const lo = Math.min(...v), hi = Math.max(...v), r = hi - lo || 1;
    const pts = v.map((x, i) => `${((i / (v.length - 1)) * (w - 2) + 1).toFixed(1)},${(h - 2 - ((x - lo) / r) * (h - 4)).toFixed(1)}`).join(' ');
    return `<svg class="dpt-spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="${v.at(-1) >= v[0] ? UP : DOWN}" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
  }

  /* ---------- Übersicht ---------- */
  function overview(d, st) {
    const pos = d.positions || [];
    return `<div class="dpt-top">
        <div class="dpt-value">${eur(d.value)}</div>
        <div class="dpt-chg ${tone(d.gainEur)}">${signed(d.gainEur)} (${signed(d.gainPct, ' %')}) <i>seit Start</i></div>
      </div>
      ${d.history?.length > 1 ? `<div class="dpt-chart">
        <div class="dpt-cbar"><div class="dpt-seg small" style="--i:${['1W', '1M', 'ALL'].indexOf(st.range)}">${[['1W', '1W'], ['1M', '1M'], ['ALL', 'Alles']].map(([k, l]) => `<button type="button" data-range="${k}" class="${st.range === k ? 'on' : ''}">${l}</button>`).join('')}<span class="dpt-seg-bg"></span></div>
          ${d.bench ? '<span class="dpt-leg"><i></i>DAX zum Vergleich</span>' : ''}</div>
        <div class="dpt-plot"><div class="dpt-tip" hidden></div></div></div>` : ''}
      <div class="dpt-grid">
        ${cell('Summe Positionen', eur(d.invested))}
        ${cell('Bargeld', eur(d.cash))}
        ${cell('Gesamt-Depotwert', eur(d.value))}
        ${cell('Performance', `${signed(d.gainEur)} <small>${signed(d.gainPct, ' %')}</small>`, tone(d.gainEur))}
        ${cell('Trades', d.trades != null ? nf(d.trades, 0) : nf((d.events || []).filter((e) => e.kind === 'BUY' || e.kind === 'SELL').length, 0))}
        ${cell('Rang', d.rank != null ? `${nf(d.rank, 0)}.${d.players ? ` <small>von ${nf(d.players, 0)}</small>` : ''}` : '–')}
      </div>
      ${pos.length ? '' : '<p class="dpt-note">Noch keine Aktien im Depot – alles liegt als Bargeld bereit.</p>'}`;
  }

  /* ---------- Positionen ---------- */
  function positions(d, st) {
    const pos = d.positions || [];
    if (!pos.length) return '<p class="dpt-note">Noch keine Aktien im Depot.</p>';
    return `<div class="dpt-rows">${[...pos].sort((a, b) => (b.value || 0) - (a.value || 0)).map((p) => {
      const open = st.open === p.isin;
      return `<div class="dpt-pos${open ? ' open' : ''}">
          <button type="button" class="dpt-ph" data-pos="${esc(p.isin)}" aria-expanded="${open}">
            <span class="dpt-pn"><b>${esc(p.name)}</b><small>${nf(p.qty, p.qty % 1 ? 2 : 0)} Stk · Ø ${eur(p.buyPrice)}</small></span>
            ${spark(p.spark)}
            <span class="dpt-pv"><b>${eur(p.value)}</b><small class="${tone(p.gainEur)}">${signed(p.gainEur)} · ${signed(p.gainPct, ' %', 1)}</small></span>
            ${p.action ? badge(p.action) : ''}
            <span class="dpt-chev">${fi('chevron-down', 12)}</span>
          </button>
          <div class="dpt-pd"><div class="dpt-pd-in">
            <div class="dpt-grid sm">
              ${cell('Kurs im Spiel', eur(p.price))}${cell('Kaufkurs', eur(p.buyPrice))}${cell('Stopp', p.stop ? eur(p.stop) : '–')}
              ${cell('Heute', p.day != null ? signed(p.day, ' %') : '–', tone(p.day))}${cell('Woche', p.week != null ? signed(p.week, ' %') : '–', tone(p.week))}${cell('Anteil', p.weightPct != null ? `${nf(p.weightPct, 1)} %` : '–')}
            </div>
            ${p.why ? `<p class="dpt-why">${esc(p.why)}</p>` : ''}
            <button type="button" class="dpt-link" data-ask="${esc(`Schau dir meine Position ${p.name}${p.symbol ? ` (${p.symbol})` : ''} an: behalten, beobachten oder verkaufen?`)}">Mit dem Bären besprechen ${fi('chevron-right', 11)}</button>
          </div></div>
        </div>`;
    }).join('')}</div>`;
  }

  /* ---------- Performance: Liste wie im Spiel (ohne Gebühren) ---------- */
  function performance(d) {
    const rows = [
      ...(d.positions || []).map((p) => ({ name: p.name, status: 'Im Depot', date: p.bought, buy: p.buyPrice != null ? p.buyPrice * p.qty : null, now: p.price != null ? p.price * p.qty : p.value })),
      ...(d.events || []).filter((e) => e.kind === 'SELL').map((e) => ({ name: e.name, status: 'Verkauft', date: e.date, buy: e.basis ?? null, now: e.qty * e.px })),
    ].map((r) => ({ ...r, plus: r.buy != null && r.now != null ? r.now - r.buy : null, pct: r.buy ? ((r.now - r.buy) / r.buy) * 100 : null }));
    if (!rows.length) return '<p class="dpt-note">Noch keine Käufe – hier steht später, wie viel Plus du je Wertpapier gemacht hast.</p>';
    rows.sort((a, b) => (a.status === b.status ? (b.plus || 0) - (a.plus || 0) : a.status === 'Im Depot' ? -1 : 1));
    const sum = rows.reduce((s, r) => s + (r.plus || 0), 0);
    return `<div class="dpt-table" role="table">
        <div class="dpt-tr head" role="row"><span>Wertpapier</span><span>Kaufwert</span><span>Wert</span><span>Plus / Minus</span></div>
        ${rows.map((r) => `<div class="dpt-tr" role="row">
          <span class="dpt-tn"><b>${esc(r.name)}</b><small><i class="dpt-st ${r.status === 'Verkauft' ? 'sold' : ''}">${r.status}</i>${r.date ? ` · ${day(r.date)}` : ''}</small></span>
          <span>${eur(r.buy)}</span><span>${eur(r.now)}</span>
          <span class="${tone(r.plus)}"><b>${signed(r.plus)}</b><small>${signed(r.pct, ' %')}</small></span>
        </div>`).join('')}
        <div class="dpt-tr foot" role="row"><span>Summe</span><span></span><span></span><span class="${tone(sum)}"><b>${signed(sum)}</b></span></div>
      </div>`;
  }

  /* ---------- Wertverlauf: Linie mit leichter Fläche, Startlinie, DAX gestrichelt, Fadenkreuz ---------- */
  function drawChart(fig, d, st) {
    const plot = fig.querySelector('.dpt-plot'); if (!plot || !d?.history?.length) return;
    const all = d.history.map((h, i) => ({ ...h, b: d.bench?.[i] ?? null }));
    const n = st.range === '1W' ? 6 : st.range === '1M' ? 22 : all.length;
    const pts = all.slice(-Math.max(2, n));
    const W = Math.round(plot.clientWidth || 600), H = 140, P = { l: 2, r: 50, t: 8, b: 18 };
    if (plot._w === W && plot._key === `${st.range}|${pts.length}|${pts.at(-1).v}`) return; // nichts geändert → nicht neu zeichnen
    plot._w = W; plot._key = `${st.range}|${pts.length}|${pts.at(-1).v}`;
    const start = d.start || 50000;
    const vals = [...pts.flatMap((p) => [p.v, p.b]).filter((x) => x != null), start];
    let lo = Math.min(...vals), hi = Math.max(...vals);
    const pad = (hi - lo || hi * 0.01) * 0.12; lo -= pad; hi += pad;
    const x = (i) => P.l + (i / (pts.length - 1)) * (W - P.l - P.r), y = (v) => P.t + (1 - (v - lo) / (hi - lo)) * (H - P.t - P.b);
    const col = pts.at(-1).v >= start ? UP : DOWN;
    const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join('');
    const bench = d.bench ? pts.map((p, i) => (p.b == null ? '' : `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.b).toFixed(1)}`)).join('') : '';
    const ticks = [hi - pad, (hi + lo) / 2, lo + pad].map((v) => `<text x="${W - P.r + 6}" y="${y(v) + 4}" class="dpt-ax">${nf(v, 0)}</text>`).join('');
    const labels = [0, pts.length - 1].map((i, k) => `<text x="${x(i)}" y="${H - 3}" class="dpt-ax" text-anchor="${k ? 'end' : 'start'}">${day(pts[i].d)}</text>`).join('');
    const gid = `dg${Math.random().toString(36).slice(2, 7)}`;
    plot.querySelector('svg')?.remove();
    plot.insertAdjacentHTML('afterbegin', `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-label="Wertverlauf des Depots">
      <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${col}" stop-opacity=".14"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></linearGradient></defs>
      <line x1="${P.l}" x2="${W - P.r}" y1="${y(start)}" y2="${y(start)}" class="dpt-start"/>
      <path d="${line}L${x(pts.length - 1)},${H - P.b}L${x(0)},${H - P.b}Z" fill="url(#${gid})"/>
      ${bench ? `<path d="${bench}" class="dpt-bench"/>` : ''}
      <path d="${line}" fill="none" stroke="${col}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>
      ${ticks}${labels}
      <g class="dpt-cross" visibility="hidden"><line class="dpt-cl" y1="${P.t}" y2="${H - P.b}"/><circle r="3.5" fill="${col}" stroke="#212121" stroke-width="2"/></g></svg>`);
    const svg = plot.querySelector('svg'), cross = svg.querySelector('.dpt-cross'), tip = plot.querySelector('.dpt-tip');
    svg.addEventListener('pointermove', (e) => {
      const r = svg.getBoundingClientRect();
      const i = Math.max(0, Math.min(pts.length - 1, Math.round(((e.clientX - r.left) / r.width * W - P.l) / (W - P.l - P.r) * (pts.length - 1))));
      const p = pts[i], g = p.v - start;
      cross.setAttribute('visibility', 'visible');
      cross.querySelector('line').setAttribute('x1', x(i)); cross.querySelector('line').setAttribute('x2', x(i));
      cross.querySelector('circle').setAttribute('cx', x(i)); cross.querySelector('circle').setAttribute('cy', y(p.v));
      tip.innerHTML = `<span>${day(p.d)}</span><b>${eur(p.v)} <em class="${tone(g)}">${signed((g / start) * 100, ' %')}</em></b>`;
      tip.hidden = false;
      const sc = r.width / W, tw = tip.offsetWidth, th = tip.offsetHeight;
      tip.style.left = `${Math.max(0, Math.min(r.width - tw, x(i) * sc - tw / 2))}px`;
      tip.style.top = `${y(p.v) * sc - th - 10 >= 0 ? y(p.v) * sc - th - 10 : y(p.v) * sc + 12}px`; // oben kein Platz → unter den Punkt
    });
    svg.addEventListener('pointerdown', (e) => svg.dispatchEvent(new PointerEvent('pointermove', e)));
    svg.addEventListener('pointerleave', (e) => { if (e.pointerType === 'touch') return; cross.setAttribute('visibility', 'hidden'); tip.hidden = true; });
  }

  /* ---------- Karte ---------- */
  function figure() {
    const fig = document.createElement('figure');
    fig.className = 'dpt';
    const bear = window.PixelDogs?.svg ? window.PixelDogs.svg('boerse', 20) : '';
    const TABS = [['over', 'Übersicht'], ['pos', 'Positionen'], ['perf', 'Performance']];
    fig.innerHTML = `<div class="dpt-head"><span class="dpt-av">${bear}</span><span class="dpt-title"><strong>Dein Depot</strong><span class="dpt-sub">Planspiel Börse</span></span>
        <button type="button" class="dpt-icon" data-dpt="reload" title="Aktualisieren" aria-label="Depot aktualisieren"><svg width="16" height="16" aria-hidden="true"><use href="#i-refresh"/></svg></button></div>
      <div class="dpt-seg" role="tablist" style="--i:0">${TABS.map(([k, l], i) => `<button type="button" role="tab" data-tab="${k}" class="${i ? '' : 'on'}" aria-selected="${!i}">${l}</button>`).join('')}<span class="dpt-seg-bg"></span></div>
      <div class="dpt-body"><div class="dpt-skel"><span></span><span></span><span></span></div></div>`;
    const st = { tab: 'over', range: 'ALL', open: null, d: null };
    const host = fig.querySelector('.dpt-body'), sub = fig.querySelector('.dpt-sub'), seg = fig.querySelector('.dpt-seg');
    const paint = () => {
      const d = st.d; if (!d) return;
      seg.querySelectorAll('[data-tab]').forEach((b, i) => { const on = b.dataset.tab === st.tab; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); if (on) seg.style.setProperty('--i', i); });
      if (!d.connected || d.error) {
        fig.classList.add('bare');
        host.innerHTML = !d.connected
          ? '<div class="dpt-msg"><span>Dein Depot ist noch nicht mit dem Planspiel Börse verbunden.</span><button type="button" class="dpt-btn" data-dpt="settings">Verbinden</button></div>'
          : `<div class="dpt-msg err"><span>${esc(d.error)}</span><button type="button" class="dpt-btn" data-dpt="reload">Nochmal</button></div>`;
        return;
      }
      fig.classList.remove('bare');
      sub.textContent = `Planspiel Börse · Stand ${clock(d.asOf || Date.now())} Uhr`;
      host.innerHTML = `<div class="dpt-pane">${st.tab === 'pos' ? positions(d, st) : st.tab === 'perf' ? performance(d) : overview(d, st)}</div>`;
      if (st.tab === 'over') drawChart(fig, d, st);
    };
    const draw = async (fresh) => {
      fig.classList.add('busy');
      const d = await load(fresh);
      fig.classList.remove('busy');
      // gleiche Zahlen → nichts neu zeichnen (verhindert Flackern)
      if (st.d && JSON.stringify(d) === JSON.stringify(st.d)) return;
      st.d = d;
      paint();
    };
    fig.addEventListener('click', (e) => {
      const t = e.target.closest('[data-tab]'); if (t) { if (st.tab !== t.dataset.tab) { st.tab = t.dataset.tab; paint(); } return; }
      const r = e.target.closest('[data-range]');
      if (r) {
        st.range = r.dataset.range;
        const s = r.closest('.dpt-seg'); s.querySelectorAll('[data-range]').forEach((b, i) => { b.classList.toggle('on', b === r); if (b === r) s.style.setProperty('--i', i); });
        drawChart(fig, st.d, st);
        return;
      }
      const p = e.target.closest('[data-pos]');
      if (p) {
        st.open = st.open === p.dataset.pos ? null : p.dataset.pos;
        fig.querySelectorAll('.dpt-pos').forEach((row) => { const on = row.querySelector('[data-pos]').dataset.pos === st.open; row.classList.toggle('open', on); row.querySelector('[data-pos]').setAttribute('aria-expanded', String(on)); });
        return;
      }
      const a = e.target.closest('[data-ask]');
      if (a) {
        const input = document.getElementById('input'), form = document.getElementById('composer');
        if (input && form) { input.value = a.dataset.ask; input.dispatchEvent(new Event('input', { bubbles: true })); form.requestSubmit?.(); }
        return;
      }
      const b = e.target.closest('[data-dpt]'); if (!b) return;
      if (b.dataset.dpt === 'reload') draw(true);
      if (b.dataset.dpt === 'settings') window.Settings?.open('agents');
    });
    if (memo?.d && Date.now() - memo.t < 30000) { st.d = memo.d; paint(); } else draw(false);
    const timer = setInterval(() => { if (!fig.isConnected) { clearInterval(timer); return; } if (!document.hidden) draw(true); }, 60000);
    if ('ResizeObserver' in window) new ResizeObserver(() => { if (st.tab === 'over') drawChart(fig, st.d, st); }).observe(fig);
    return fig;
  }
  return { figure };
})();
window.DepotCard = DepotCard;
