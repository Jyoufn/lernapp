/* ===================================================================
   Chancen-Radar in der App (Börsen-Bär): fragt den Radar (/api/boerse/radar – reiner Algorithmus, keine KI) zur Börsenzeit
   alle 30 min ab, solange die App offen ist (der Server rechnet außerdem zur Börseneröffnung per Zeitplan).
   Neue Chancen → Hinweis unten rechts (Klick = neuer Chat mit dem Bären dazu), Nachricht in der Inbox („Börse“) und – wenn
   Mitteilungen schon erlaubt sind – eine Mitteilung des Systems. Jede Chance nur einmal (gemerkt in boerse.radar.seen).
   Läuft erst, wenn der Börsen-Agent einmal gewählt wurde (boerse.radar.on).
   =================================================================== */
const BoerseRadar = (() => {
  const ON = 'boerse.radar.on', SEEN = 'boerse.radar.seen';
  const TYPE = { ruecksetzer: 'Rücksetzer in starker Branche', nachrichten: 'Nachrichten-Rückenwind', ausbruch: 'Ausbruch' };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const eur = (x) => (x == null ? '–' : `${(+x).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`);
  const get = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
  const set = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

  // Börsenzeit (Tradegate/Stuttgart): Mo–Fr 8–22 Uhr deutscher Zeit
  const tradingNow = () => {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', weekday: 'short', hour: '2-digit', hour12: false }).formatToParts(new Date()).map((x) => [x.type, x.value]));
    return !['Sat', 'Sun'].includes(p.weekday) && +p.hour >= 8 && +p.hour < 22;
  };

  const box = document.createElement('div');
  box.className = 'rd-toasts';
  document.body.append(box);
  function toast(title, text, onClick) {
    const t = document.createElement('button');
    t.type = 'button';
    t.className = 'rd-toast';
    t.innerHTML = `<span class="rd-dog">${window.PixelDogs?.svg('boerse', 24) || ''}</span><span class="rd-text"><strong>${esc(title)}</strong><span>${esc(text)}</span></span>`;
    t.addEventListener('click', () => { t.remove(); onClick?.(); });
    box.append(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, 12000);
  }
  // neuer Chat mit dem Bären, Frage schon gestellt
  function ask(text) {
    window.PixelDogs?.select('boerse');
    document.querySelector('.sidebar [data-nav="new"]')?.click();
    setTimeout(() => {
      const input = document.getElementById('input'), form = document.getElementById('composer');
      if (!input || !form) return;
      input.value = text;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      form.requestSubmit?.();
    }, 520);
  }

  let busy = false;
  async function check({ force = false } = {}) {
    if (busy || !get(ON, false) || document.hidden || (!force && !tradingNow())) return;
    busy = true;
    try {
      const r = await (await fetch('/api/boerse/radar')).json();
      if (!Array.isArray(r?.picks)) return;
      const seen = new Set(get(SEEN, []));
      const day = String(r.asOf || '').slice(0, 10);
      const fresh = r.picks.filter((p) => !seen.has(`${p.symbol}|${p.type}|${day}`));
      fresh.forEach((p) => seen.add(`${p.symbol}|${p.type}|${day}`));
      set(SEEN, [...seen].slice(-300));
      fresh.forEach((p) => {
        const text = `${p.reason}\n\nEinstieg ${eur(p.entry)} · Stopp ${eur(p.stop)} · Ziel ${eur(p.target)}${p.history?.cases ? ` · Trefferquote dieses Musters: ${p.history.winRate} % (${p.history.cases} Fälle)` : ''}${p.news?.length ? `\n\nNachrichten: ${p.news.map((n) => n.title).join(' · ')}` : ''}`;
        window.Inbox?.add({ from: 'Börse', subject: `Chance: ${p.name} – ${TYPE[p.type] || p.type}`, text });
      });
      fresh.slice(0, 2).forEach((p) => {
        const q = `Schau dir die Chance bei ${p.name} (${p.symbol}) aus dem Chancen-Radar genauer an: ${TYPE[p.type]} – jetzt kaufen oder nicht?`;
        toast(`Chance: ${p.name}`, `${TYPE[p.type]} · ${eur(p.price)} · Ziel ${eur(p.target)}`, () => ask(q));
        try { if ('Notification' in window && Notification.permission === 'granted') new Notification(`Chance: ${p.name}`, { body: `${TYPE[p.type]} – ${p.reason}`, tag: `${p.symbol}|${p.type}`, icon: 'icon-180.png' }); } catch {}
      });
      if (fresh.length > 2) toast(`${fresh.length - 2} weitere Chancen`, 'Alle stehen in der Inbox.', () => window.openViewTab?.('inbox'));
    } catch {} finally { busy = false; }
  }

  // einschalten, sobald der Börsen-Agent einmal gewählt wurde
  const arm = () => { if (window.PixelDogs?.mode === 'boerse' && !get(ON, false)) { set(ON, true); setTimeout(() => check({ force: true }), 3000); } };
  document.addEventListener('dogmodechange', arm);
  setTimeout(() => { arm(); check(); }, 8000);
  setInterval(check, 30 * 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
  return { check, ask };
})();
window.BoerseRadar = BoerseRadar;
