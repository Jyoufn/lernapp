/* ===================================================================
   Chancen-Übersicht im Chat (Block ```chancen, vom Börsen-Bären bei „welche Aktien …“ / Empfehlungen):
   je Wert ein Kästchen mit Etikett Kaufen (grün) · Beobachten (grau) · Nicht kaufen (rot), Muster, Kurs, Einstieg, Stopp, Ziel,
   Chance:Risiko, Trefferquote und Begründung – jede Karte einzeln, ohne Sammelkasten. Klick irgendwo auf die Karte klappt ihren
   Aktienchart samt Bär (Begründung) auf; zugeklappt nimmt beides keinen Platz ein.
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
  // Begründung des Bären in kurzen Fach-Stichworten (aus dem Radar-Text und den Kennzahlen) – erst nach Klick auf den Bären
  function whyBox(p, v) {
    const keys = String(p.reason || '').split(/\s*[;·]\s*|\.\s+|,\s+(?=[A-ZÄÖÜ0-9])/).map((x) => x.replace(/\.$/, '').trim()).filter((x) => x.length > 2).slice(0, 5);
    const crv = crvOf(p);
    const nums = [p.type ? `Muster: ${p.type}` : '', crv ? `Chance : Risiko ${nf(crv, 1)} : 1` : '', p.hit ? `Trefferquote ${p.hit}` : '', p.stop ? `Stopp ${eur(p.stop)}` : ''].filter(Boolean);
    return `<b class="chn-why-h">${v === 'kaufen' ? 'Warum kaufen?' : 'Warum beobachten?'}</b><ul>${[...keys, ...nums].map((k) => `<li>${esc(k)}</li>`).join('')}</ul>`;
  }
  // „Stand“ unten links in der aufgeklappten Karte: wann der Radar gerechnet hat (und wie viele Werte)
  function standText(d) {
    const t = d?.asOf ? new Date(d.asOf) : null;
    if (!t || Number.isNaN(+t)) return '';
    const today = new Date().toDateString() === t.toDateString();
    const when = `${today ? 'heute' : t.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })}, ${t.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr`;
    return `Stand ${when}${d.checked ? ` · ${Number(d.checked).toLocaleString('de-DE')} Werte geprüft` : ''}`;
  }
  function row(p, stand = '') {
    const crv = crvOf(p), v = p.verdict === 'kaufen' ? 'kaufen' : 'beobachten';
    const meta = [p.sector, p.type].filter(Boolean).map(esc).join(' · ');
    const facts = [p.drop != null ? `<span>Gefallen&nbsp; <b class="neg">−${nf(p.drop, 1)} % in ${esc(p.dropDays || 5)} Tagen</b></span>` : '',
      crv ? `<span>Chance : Risiko&nbsp; <b>${nf(crv, 1)} : 1</b></span>` : '', p.hit ? `<span>Trefferquote&nbsp; <b>${esc(p.hit)}</b></span>` : ''].filter(Boolean).join('<i class="chn-dot"></i>');
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
        <div class="chn-chart"><div class="chn-chart-in"><div class="chn-chart-host"></div>
          <div class="chn-bear-row"><div class="chn-why-box" hidden>${whyBox(p, v)}</div>
            <span class="chn-asof">${esc(stand)}</span>
            <button type="button" class="chn-bear" data-why aria-label="Warum ${LABEL[v]}?" aria-expanded="false">${window.PixelDogs?.svg ? PixelDogs.svg('boerse', 20) : ''}</button></div>
        </div></div>
      </div>`;
  }
  // Nur die Karten, einzeln untereinander – erst alle „Kaufen“, dann höchstens 10 „Beobachten“. Kein Rahmen, keine Überschrift.
  function body(d) {
    const picks = (d.picks || []).filter((p) => p.verdict !== 'meiden');
    if (!picks.length) return '<div class="chn-empty">Gerade erfüllt kein Wert alle Bedingungen – heute lieber abwarten.</div>';
    const buy = picks.filter((p) => p.verdict === 'kaufen'), watch = picks.filter((p) => p.verdict !== 'kaufen').slice(0, 10);
    const stand = standText(d);
    return [...buy, ...watch].map((p) => row(p, stand)).join('');
  }

  function figure(raw) {
    const spec = parse(raw);
    const fig = document.createElement('div');
    fig.className = 'chn';
    // Erscheinen: erst, wenn die Karten wirklich im Chat hängen (sonst läuft die Animation schon, bevor man sie sieht) –
    // nacheinander, weich von unten, leicht wachsend
    const enter = () => {
      const go = () => fig.querySelectorAll('.chn-pick').forEach((c, i) => window.enterOnce?.(c, { y: 12, scale: 0.985, delay: Math.min(i, 6) * 70, dur: 620 }));
      let n = 0; const wait = () => (fig.isConnected || ++n > 30 ? go() : requestAnimationFrame(wait));
      wait();
    };
    if (Array.isArray(spec.picks)) { fig.innerHTML = body(spec); enter(); } else load().then((d) => { fig.innerHTML = body(d); enter(); });
    // Klick auf eine Karte: darunter klappt der Aktienchart auf (Kursdaten per Rechnung, keine KI); nochmal Klick klappt zu
    // Auf-/Zuklappen per Skript: Höhe läuft ruhig von 0 auf die volle Höhe (keine Feder, die sofort hochschießt), der Inhalt
    // blendet leicht verzögert ein; der Chart-Kopf hat seine Höhe schon beim Laden (style.css), damit danach nichts nachrutscht
    const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
    const toggle = (card) => {
      const open = !card.classList.contains('open');
      const box = card.querySelector('.chn-chart'), inner = box.querySelector('.chn-chart-in');
      const from = box.offsetHeight;
      box.getAnimations().forEach((a) => a.cancel()); inner.getAnimations().forEach((a) => a.cancel());
      const host = card.querySelector('.chn-chart-host');
      if (open && !host.firstChild && window.StockChart) host.append(StockChart.figure({ symbol: card.dataset.sym, name: card.dataset.name, range: '6M' }));
      card.classList.toggle('open', open);
      card.setAttribute('aria-expanded', String(open));
      if (reduced()) return;
      if (open) {
        const h = box.offsetHeight;
        box.animate([{ height: `${from}px` }, { height: `${h}px` }], { duration: 560, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' });
        inner.animate([{ opacity: 0, transform: 'translateY(-8px)' }, { opacity: 1, transform: 'none' }], { duration: 440, delay: 70, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'backwards' });
      } else {
        box.animate([{ height: `${from}px` }, { height: '0px' }], { duration: 420, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' });
        inner.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, easing: 'ease' });
      }
    };
    fig.addEventListener('click', (e) => {
      const why = e.target.closest('[data-why]');
      if (why) { const box = why.parentElement.querySelector('.chn-why-box'), on = box.hidden; box.hidden = !on; why.setAttribute('aria-expanded', String(on)); why.classList.toggle('on', on); return; }
      // die ganze Karte ist die Klickfläche (nicht nur der Name); nur im aufgeklappten Chart selbst wird nichts umgeschaltet
      const c = e.target.closest('.chn-pick'); if (c && !(c.classList.contains('open') && e.target.closest('.chn-chart'))) toggle(c);
    });
    fig.addEventListener('keydown', (e) => { const c = e.target.closest('.chn-pick'); if (c && e.target === c && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggle(c); } });
    return fig;
  }
  return { figure };
})();
window.ChancenCard = ChancenCard;
