/* ===================================================================
   Chancen-Übersicht im Chat (Block ```chancen, vom Börsen-Bären bei „welche Aktien …“ / Empfehlungen):
   je Wert ein Kästchen mit Etikett Kaufen (grün) · Beobachten (grau) · Nicht kaufen (rot), Muster, Kurs, Einstieg, Stopp, Ziel,
   Chance:Risiko, Trefferquote, Begründung und „Mit dem Bären besprechen“.
   Daten: stehen im Block (vom Server angehängt) – sonst aus dem GESPEICHERTEN Radar (/api/boerse/chancen, ohne Neu-Rechnen, ohne KI).
   Es gibt keine automatischen Abfragen im Hintergrund: Chancen kommen nur, wenn man danach fragt.
   =================================================================== */
const ChancenCard = (() => {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nf = (x, d = 2) => (x == null || !Number.isFinite(+x) ? '–' : (+x).toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d }));
  const eur = (x) => (x == null ? '–' : `${nf(x)} €`);
  const fi = (n, s = 11) => `<svg width="${s}" height="${s}" aria-hidden="true"><use href="#f-${n}"/></svg>`;
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
    const crv = crvOf(p), v = LABEL[p.verdict] ? p.verdict : 'beobachten';
    const nums = v === 'meiden'
      ? `<span><i>Kurs</i>${eur(p.price)}</span>${p.score != null ? `<span><i>Score</i>${p.score}/100</span>` : ''}`
      : `<span><i>Kurs</i>${eur(p.price)}</span><span><i>Einstieg</i>${eur(p.entry)}</span><span><i>Stopp</i><em class="neg">${eur(p.stop)}</em></span><span><i>Ziel</i><em class="pos">${eur(p.target)}</em></span>${crv ? `<span><i>Chance : Risiko</i>${nf(crv, 1)} : 1</span>` : ''}${p.hit ? `<span><i>Treffer</i>${esc(p.hit)}</span>` : ''}`;
    const ask = `Schau dir ${p.name} (${p.symbol}) genauer an${p.type ? `: ${p.type}` : ''} – jetzt kaufen oder nicht?`;
    return `<div class="chn-pick ${v}">
        <div class="chn-top"><span class="chn-name"><b>${esc(p.name)}</b><small>${esc(p.type || '')}${p.sector ? ` · ${esc(p.sector)}` : ''}</small></span>
          <span class="chn-badge ${v}">${LABEL[v]}</span></div>
        <div class="chn-nums">${nums}</div>
        ${p.reason ? `<p class="chn-why">${esc(p.reason)}</p>` : ''}
        <button type="button" class="chn-link" data-q="${esc(ask)}">Mit dem Bären besprechen ${fi('chevron-right')}</button>
      </div>`;
  }
  function body(d) {
    const picks = d.picks || [];
    if (!picks.length) return '<div class="chn-empty">Gerade erfüllt kein Wert alle Bedingungen – heute lieber abwarten.</div>';
    const buy = picks.filter((p) => p.verdict === 'kaufen');
    return `<div class="chn-verdict ${buy.length ? 'kaufen' : 'beobachten'}"><span class="chn-vtag">${buy.length ? 'Kaufen' : 'Abwarten'}</span><span>${buy.length
        ? `${esc(buy.map((p) => p.name).join(', '))} ${buy.length === 1 ? 'erfüllt' : 'erfüllen'} alle Bedingungen.`
        : 'Keine Chance ist stark genug für einen Kauf jetzt – die Werte unten im Blick behalten.'}</span></div>
      <div class="chn-list">${picks.map(row).join('')}</div>`;
  }

  function figure(raw) {
    const spec = parse(raw);
    const fig = document.createElement('figure');
    fig.className = 'chn';
    const bear = window.PixelDogs?.svg ? window.PixelDogs.svg('boerse', 24) : '';
    fig.innerHTML = `<div class="chn-head"><span class="chn-av">${bear}</span><span class="chn-title"><strong>Chancen-Radar</strong><span class="chn-sub">wird geladen …</span></span></div><div class="chn-body"></div>`;
    const draw = (d) => {
      const t = d.asOf ? new Date(d.asOf).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '';
      fig.querySelector('.chn-sub').textContent = [d.checked ? `${d.checked} Planspiel-Werte geprüft` : 'Planspiel-Werte', d.mood ? `Markt ${d.mood}` : '', t ? `Stand ${t} Uhr` : ''].filter(Boolean).join(' · ');
      fig.querySelector('.chn-body').innerHTML = body(d) + '<p class="chn-note">Signale aus dem Chancen-Radar (Algorithmus) – Wahrscheinlichkeiten, keine Garantie.</p>';
    };
    if (Array.isArray(spec.picks)) draw(spec); else load().then(draw);
    // „Mit dem Bären besprechen“ → Frage ins Eingabefeld dieses Chats und abschicken
    fig.addEventListener('click', (e) => {
      const b = e.target.closest('.chn-link'); if (!b) return;
      const input = document.getElementById('input'), form = document.getElementById('composer');
      if (!input || !form) return;
      input.value = b.dataset.q;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      form.requestSubmit?.();
    });
    return fig;
  }
  return { figure };
})();
window.ChancenCard = ChancenCard;
