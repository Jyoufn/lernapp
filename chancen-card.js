/* ===================================================================
   Chancen-Übersicht im Chat (Block ```chancen, vom Börsen-Bären bei „welche Aktien …“ / Empfehlungen):
   je Wert ein Kästchen mit Etikett Kaufen (grün) · Beobachten (grau) · Nicht kaufen (rot), Muster, Kurs, Einstieg, Stopp, Ziel,
   Chance:Risiko, Trefferquote und Begründung – jede Karte einzeln, ohne Sammelkasten.
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

  function row(p) {
    const crv = crvOf(p), v = p.verdict === 'kaufen' ? 'kaufen' : 'beobachten';
    const nums = `<span><i>Kurs</i>${eur(p.price)}</span><span><i>Einstieg</i>${eur(p.entry)}</span><span><i>Stopp</i><em class="neg">${eur(p.stop)}</em></span><span><i>Ziel</i><em class="pos">${eur(p.target)}</em></span>${crv ? `<span><i>Chance : Risiko</i>${nf(crv, 1)} : 1</span>` : ''}${p.hit ? `<span><i>Treffer</i>${esc(p.hit)}</span>` : ''}`;
    return `<div class="chn-pick ${v}">
        <div class="chn-top"><span class="chn-name"><b>${esc(p.name)}</b><small>${esc(p.type || '')}${p.sector ? ` · ${esc(p.sector)}` : ''}</small></span>
          <span class="chn-badge ${v}">${LABEL[v]}</span></div>
        <div class="chn-nums">${nums}</div>
        ${p.reason ? `<p class="chn-why">${esc(p.reason)}</p>` : ''}
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
    return fig;
  }
  return { figure };
})();
window.ChancenCard = ChancenCard;
