/* ===================================================================
   Chancen-Radar in der App (Börsen-Bär): fragt den Radar (/api/boerse/radar – reiner Algorithmus, keine KI) zur Börsenzeit
   alle 30 min ab, solange die App offen ist (der Server rechnet außerdem zur Börseneröffnung per Zeitplan).
   Neue Chancen → Nachricht in der Inbox (Seitenleiste, Absender „Börsen-Bär“, als Karte mit Kurs, Einstieg, Stopp, Ziel und
   „Mit dem Bären besprechen“) und – wenn Mitteilungen schon erlaubt sind – eine Mitteilung des Systems. Keine Hinweise unten im Bild. Jede Chance nur einmal (gemerkt in boerse.radar.seen).
   Läuft erst, wenn der Börsen-Agent einmal gewählt wurde (boerse.radar.on).
   =================================================================== */
const BoerseRadar = (() => {
  const ON = 'boerse.radar.on', SEEN = 'boerse.radar.seen';
  const TYPE = { ruecksetzer: 'Rücksetzer in starker Branche', nachrichten: 'Nachrichten-Rückenwind', ausbruch: 'Ausbruch' };
  const get = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
  const set = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

  // Börsenzeit (Tradegate/Stuttgart): Mo–Fr 8–22 Uhr deutscher Zeit
  const tradingNow = () => {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', weekday: 'short', hour: '2-digit', hour12: false }).formatToParts(new Date()).map((x) => [x.type, x.value]));
    return !['Sat', 'Sun'].includes(p.weekday) && +p.hour >= 8 && +p.hour < 22;
  };

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
        const q = `Schau dir die Chance bei ${p.name} (${p.symbol}) aus dem Chancen-Radar genauer an: ${TYPE[p.type] || p.type} – jetzt kaufen oder nicht?`;
        window.Inbox?.add({
          from: 'Börsen-Bär', kind: 'boerse', key: `boerse|${p.symbol}|${p.type}`, subject: `${p.name}: ${TYPE[p.type] || p.type}`, text: p.reason || '',
          data: { symbol: p.symbol, name: p.name, type: TYPE[p.type] || p.type, price: p.price, entry: p.entry, stop: p.stop, target: p.target,
            history: p.history || null, news: (p.news || []).slice(0, 3).map((n) => ({ title: n.title, source: n.source || '', url: n.link || n.url || '' })), ask: q },
        });
      });
      fresh.slice(0, 2).forEach((p) => {
        try { if ('Notification' in window && Notification.permission === 'granted') new Notification(`Chance: ${p.name}`, { body: `${TYPE[p.type]} – ${p.reason}`, tag: `${p.symbol}|${p.type}`, icon: 'icon-180.png' }); } catch {}
      });
    } catch {} finally { busy = false; }
  }

  // einschalten, sobald der Börsen-Agent einmal gewählt wurde
  const arm = () => { if (window.PixelDogs?.mode === 'boerse' && !get(ON, false)) { set(ON, true); setTimeout(() => check({ force: true }), 3000); } };
  document.addEventListener('dogmodechange', arm);
  setTimeout(() => { arm(); check(); }, 8000);
  setInterval(check, 30 * 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
  document.addEventListener('inbox:ask', (e) => ask(e.detail)); // „Mit dem Bären besprechen“ in der Inbox
  return { check, ask };
})();
window.BoerseRadar = BoerseRadar;
