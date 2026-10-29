/* ===================================================================
   Depot-Grafik (Block ```depot im Chat, vom Börsen-Bären): das echte Depot aus dem Planspiel Börse, live vom Server
   (/api/planspiel/depot – der Server meldet sich mit den gespeicherten Zugangsdaten an, an den Browser gehen nur die Zahlen).
   - Kopf: Bär, „Dein Depot“, Stand, Neu-laden-Knopf
   - großer Depotwert, Gewinn/Verlust seit Start (50.000 €) grün/rot
   - Aufteilung als ein Balken (je Position eine Farbe, Bargeld grau), darunter die Positionen:
     Name, Stück und Kaufkurs, Wert, Gewinn in € und %, Anteil am Depot
   - nicht verbunden → Hinweis mit Knopf zu den Einstellungen
   Aktualisiert sich jede Minute, solange die Karte zu sehen ist. Farben: README 3.1 (Grün #4fcf8a, Rot #f07a6e, Termin-Farben).
   =================================================================== */
const DepotCard = (() => {
  const COLORS = ['#6d9fff', '#4ade80', '#fb923c', '#a78bfa', '#2dd4bf', '#f472b6', '#facc15', '#f87171'];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nf = (x, d = 2) => (x == null || !Number.isFinite(+x) ? '–' : (+x).toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d }));
  const eur = (x) => (x == null ? '–' : `${nf(x)} €`);
  const signed = (x, unit) => (x == null ? '–' : `${x > 0 ? '+' : x < 0 ? '−' : ''}${nf(Math.abs(x))}${unit}`);
  const cls = (x) => (x == null ? '' : x > 0 ? ' up' : x < 0 ? ' down' : '');
  const fi = (n, s = 13) => `<svg width="${s}" height="${s}" aria-hidden="true"><use href="#f-${n}"/></svg>`;
  const clock = (t) => new Date(t).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

  // eine Anfrage für alle Karten (die Antwort wird beim Schreiben mehrfach neu gezeichnet)
  let memo = null;
  function load(fresh = false) {
    if (!fresh && memo && Date.now() - memo.t < 20000) return memo.p;
    const m = { t: Date.now(), d: memo?.d || null };
    m.p = fetch(`/api/planspiel/depot${fresh ? '?fresh=1' : ''}`).then((r) => r.json()).catch(() => ({ connected: true, error: 'Depot gerade nicht erreichbar.' }))
      .then((d) => { m.d = d; return d; });
    memo = m;
    return m.p;
  }

  function body(d) {
    if (!d.connected) {
      return `<div class="dpt-msg"><span>Dein Depot ist noch nicht mit dem Planspiel Börse verbunden.</span>
        <button type="button" class="dpt-btn" data-dpt="settings">Verbinden</button></div>`;
    }
    if (d.error) return `<div class="dpt-msg err"><span>${esc(d.error)}</span><button type="button" class="dpt-btn" data-dpt="reload">Nochmal</button></div>`;
    const pos = d.positions || [];
    const total = d.value || 1;
    const segs = pos.filter((p) => p.value > 0).map((p, i) => ({ w: (p.value / total) * 100, c: COLORS[i % COLORS.length], name: p.name }));
    const cashW = d.cash > 0 ? (d.cash / total) * 100 : 0;
    return `<div class="dpt-top">
        <div class="dpt-value">${eur(d.value)}</div>
        <div class="dpt-chg${cls(d.gainEur)}">${signed(d.gainEur, ' €')} <span>(${signed(d.gainPct, ' %')})</span> <i>seit Start</i></div>
      </div>
      <div class="dpt-stats">
        <div><span>Bargeld</span><b>${eur(d.cash)}</b></div>
        <div><span>Investiert</span><b>${eur(d.invested)}</b></div>
        <div><span>Positionen</span><b>${pos.length}${d.trades != null ? `<small> · ${d.trades} Orders</small>` : ''}</b></div>
      </div>
      <div class="dpt-bar" role="img" aria-label="Aufteilung des Depots">${segs.map((s) => `<span style="width:${s.w.toFixed(2)}%;background:${s.c}" title="${esc(s.name)} ${nf(s.w, 1)} %"></span>`).join('')}${cashW ? `<span class="cash" style="width:${cashW.toFixed(2)}%" title="Bargeld ${nf(cashW, 1)} %"></span>` : ''}</div>
      ${pos.length ? `<div class="dpt-list">${pos.map((p, i) => `<div class="dpt-row">
          <span class="dpt-dot" style="background:${COLORS[i % COLORS.length]}"></span>
          <span class="dpt-name"><b>${esc(p.name)}</b><small>${nf(p.qty, p.qty % 1 ? 2 : 0)} Stk · Kauf ${eur(p.buyPrice)}${p.price != null ? ` · jetzt ${eur(p.price)}` : ''}</small></span>
          <span class="dpt-num"><b>${eur(p.value)}</b><small class="${cls(p.gainEur).trim()}">${signed(p.gainEur, ' €')} · ${signed(p.gainPct, ' %')}</small></span>
          <span class="dpt-w">${p.weightPct != null ? `${nf(p.weightPct, 1)} %` : ''}</span>
        </div>`).join('')}
        ${d.cash != null ? `<div class="dpt-row cash"><span class="dpt-dot"></span><span class="dpt-name"><b>Bargeld</b><small>frei zum Kaufen</small></span><span class="dpt-num"><b>${eur(d.cash)}</b></span><span class="dpt-w">${nf(cashW, 1)} %</span></div>` : ''}
      </div>` : '<div class="dpt-msg"><span>Noch keine Aktien im Depot – alles liegt als Bargeld bereit.</span></div>'}`;
  }

  function figure() {
    const fig = document.createElement('figure');
    fig.className = 'dpt';
    const bear = window.PixelDogs?.svg ? window.PixelDogs.svg('boerse', 24) : '';
    fig.innerHTML = `<div class="dpt-head"><span class="dpt-av">${bear}</span><span class="dpt-title"><strong>Dein Depot</strong><span class="dpt-sub">Planspiel Börse · wird geladen …</span></span>
        <button type="button" class="dpt-icon" data-dpt="reload" title="Neu laden" aria-label="Depot neu laden">${fi('refresh')}</button></div>
      <div class="dpt-body"><div class="dpt-skel"><span></span><span></span><span></span></div></div>`;
    const sub = fig.querySelector('.dpt-sub'), host = fig.querySelector('.dpt-body');
    const draw = async (fresh) => {
      fig.classList.add('busy');
      const d = await load(fresh);
      fig.classList.remove('busy');
      host.innerHTML = body(d);
      sub.textContent = d.connected && !d.error ? `Planspiel Börse · ${d.name || 'Wettbewerbsdepot'} · Stand ${clock(d.asOf || Date.now())} Uhr` : 'Planspiel Börse';
    };
    fig.addEventListener('click', (e) => {
      const b = e.target.closest('[data-dpt]'); if (!b) return;
      if (b.dataset.dpt === 'reload') draw(true);
      if (b.dataset.dpt === 'settings') window.Settings?.open('agents');
    });
    // schon geladen (die Antwort wird beim Schreiben neu gezeichnet) → sofort zeigen, ohne Ladebalken
    if (memo?.d && Date.now() - memo.t < 20000) { host.innerHTML = body(memo.d); sub.textContent = memo.d.connected && !memo.d.error ? `Planspiel Börse · ${memo.d.name || 'Wettbewerbsdepot'} · Stand ${clock(memo.d.asOf || Date.now())} Uhr` : 'Planspiel Börse'; }
    else draw(false);
    // jede Minute neu, solange die Karte zu sehen ist
    const timer = setInterval(() => {
      if (!fig.isConnected) { clearInterval(timer); return; }
      if (!document.hidden) draw(true);
    }, 60000);
    return fig;
  }
  return { figure };
})();
window.DepotCard = DepotCard;
