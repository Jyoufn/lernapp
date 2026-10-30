/* ===================================================================
   Chancen-Übersicht im Chat (Block ```chancen, vom Börsen-Bären bei „welche Aktien …“ / Empfehlungen):
   je Wert ein Kästchen mit Etikett Kaufen (grün) · Beobachten (grau) · Nicht kaufen (rot), Muster, Kurs, Einstieg, Stopp, Ziel,
   Chance:Risiko, Trefferquote und Begründung – jede Karte einzeln, ohne Sammelkasten. Klick auf eine Karte klappt ihren Aktienchart auf.
   Daten: stehen im Block (vom Server angehängt) – sonst aus dem GESPEICHERTEN Radar (/api/boerse/chancen, ohne Neu-Rechnen, ohne KI).
   Es gibt keine automatischen Abfragen im Hintergrund: Chancen kommen nur, wenn man danach fragt.
   =================================================================== */
const ChancenCard = (() => {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nf = (x, d = 2) => (x == null || !Number.isFinite(+x) ? '–' : (+x).toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d }));
  const eur = (x) => (x == null ? '–' : `${nf(x)} €`);
  const LABEL = { kaufen: 'Kaufen', beobachten: 'Beobachten', meiden: 'Nicht kaufen' };
  const crvOf = (p) => (p.entry && p.stop && p.target && p.entry > p.stop ? (p.target - p.entry) / (p.entry - p.stop) : null);

  function parse(raw) {
    try { const o = JSON.parse(String(raw || '').trim() || '{}'); return o && typeof o === 'object' ? o : {}; } catch { return {}; }
  }
  let memo = null; // gespeicherter Radar: eine Anfrage für alle Karten (die Antwort wird beim Schreiben mehrfach neu gezeichnet)
  const load = () => {
    if (memo && Date.now() - memo.t < 60000) return memo.p;
    memo = { t: Date.now(), p: fetch('/api/boerse/chancen').then((r) => r.json()).catch(() => ({ picks: [] })) };
    return memo.p;
  };

  // Karte, aufgeräumt: oben Name + Index (DAX, MDAX …) und Etikett; darunter eine ruhige Zeile Branche · Muster;
  // dann der Kurs groß und Einstieg / Stopp / Ziel als drei gleich breite Felder; Chance:Risiko und Trefferquote klein darunter;
  // Begründung höchstens zwei Zeilen. Klick klappt den Chart auf.
  function row(p) {
    const crv = crvOf(p), v = p.verdict === 'kaufen' ? 'kaufen' : 'beobachten';
    const meta = [p.sector, p.type].filter(Boolean).map(esc).join(' · ');
    const facts = [crv ? `<span>Chance : Risiko&nbsp; <b>${nf(crv, 1)} : 1</b></span>` : '', p.hit ? `<span>Trefferquote&nbsp; <b>${esc(p.hit)}</b></span>` : ''].filter(Boolean).join('<i class="chn-dot"></i>');
    return `<div class="chn-pick ${v}" data-sym="${esc(p.symbol)}" data-name="${esc(p.name)}" role="button" tabindex="0" aria-expanded="false">
        <div class="chn-top">
          <span class="chn-name"><b>${esc(p.name)}</b>${p.index ? `<span class="chn-idx">${esc(p.index)}</span>` : ''}</span>
          <span class="chn-badge ${v}">${LABEL[v]}</span>
        </div>
        ${meta ? `<div class="chn-meta">${meta}</div>` : ''}
        <div class="chn-mid">
          <div class="chn-price"><span>Kurs</span><b>${eur(p.price)}</b></div>
          <div class="chn-levels">
            <span><i>Einstieg</i><b>${eur(p.entry)}</b></span>
            <span><i>Stopp</i><b class="neg">${eur(p.stop)}</b></span>
            <span><i>Ziel</i><b class="pos">${eur(p.target)}</b></span>
          </div>
        </div>
        ${facts ? `<div class="chn-facts">${facts}</div>` : ''}
        ${p.reason ? `<p class="chn-why">${esc(p.reason)}</p>` : ''}
        <div class="chn-chart"><div class="chn-chart-in"></div></div>
      </div>`;
  }
  // Nur die Karten, einzeln untereinander – erst alle „Kaufen“, dann höchstens 10 „Beobachten“. Kein Rahmen, keine Überschrift.
  function body(d) {
    const picks = (d.picks || []).filter((p) => p.verdict !== 'meiden');
    if (!picks.length) return '<div class="chn-empty">Gerade erfüllt kein Wert alle Bedingungen – heute lieber abwarten.</div>';
    const buy = picks.filter((p) => p.verdict === 'kaufen'), watch = picks.filter((p) => p.verdict !== 'kaufen').slice(0, 10);
    return [...buy, ...watch].map(row).join('');
  }

  function figure(raw) {
    const spec = parse(raw);
    const fig = document.createElement('div');
    fig.className = 'chn';
    if (Array.isArray(spec.picks)) fig.innerHTML = body(spec); else load().then((d) => { fig.innerHTML = body(d); });
    // Klick auf eine Karte: darunter klappt der Aktienchart auf (Kursdaten per Rechnung, keine KI); nochmal Klick klappt zu
    const toggle = (card) => {
      const open = !card.classList.contains('open');
      card.classList.toggle('open', open);
      card.setAttribute('aria-expanded', String(open));
      const host = card.querySelector('.chn-chart-in');
      if (open && !host.firstChild && window.StockChart) host.append(StockChart.figure({ symbol: card.dataset.sym, name: card.dataset.name, range: '6M' }));
    };
    fig.addEventListener('click', (e) => { const c = e.target.closest('.chn-pick'); if (c && !e.target.closest('.chn-chart')) toggle(c); });
    fig.addEventListener('keydown', (e) => { const c = e.target.closest('.chn-pick'); if (c && e.target === c && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggle(c); } });
    return fig;
  }
  return { figure };
})();
window.ChancenCard = ChancenCard;
