/* ===================================================================
   Chancen-Radar in der App (Börsen-Bär): fragt den Radar (/api/boerse/radar – reiner Algorithmus, keine KI) zur Börsenzeit
   alle 30 min ab, solange die App offen ist (der Server rechnet außerdem zur Börseneröffnung per Zeitplan).
   In die Inbox kommt KEINE Meldung je Aktie, sondern:
   - EIN Tages-Überblick (Absender „Börsen-Bär“): Titel sagt klar „Heute kaufen: …“ oder „Heute abwarten …“, darin alle Kandidaten
     mit Kaufen/Beobachten, Einstieg, Stopp, Ziel. Spätere Läufe am selben Tag frischen den Überblick still auf.
   - Nur wenn im Lauf des Tages eine NEUE starke Chance dazukommt (Kaufen, Score ≥ 80), eine eigene Meldung „Jetzt kaufen: …“
     (höchstens zwei am Tag) – dann auch als Mitteilung des Systems, wenn erlaubt.
   Läuft erst, wenn der Börsen-Agent einmal gewählt wurde (boerse.radar.on).
   =================================================================== */
const BoerseRadar = (() => {
  const ON = 'boerse.radar.on', STATE = 'boerse.radar.digest';
  const TYPE = { ruecksetzer: 'Rücksetzer in starker Branche', nachrichten: 'Nachrichten-Rückenwind', ausbruch: 'Ausbruch' };
  const get = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
  const set = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  const nf = (x, d = 2) => (x == null ? '–' : (+x).toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d }));

  // Börsenzeit (Tradegate/Stuttgart): Mo–Fr 8–22 Uhr deutscher Zeit
  const tradingNow = () => {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', weekday: 'short', hour: '2-digit', hour12: false }).formatToParts(new Date()).map((x) => [x.type, x.value]));
    return !['Sat', 'Sun'].includes(p.weekday) && +p.hour >= 8 && +p.hour < 22;
  };

  // Kaufen nur, wenn alles passt: hoher Score, Chance:Risiko ≥ 1,5, Einstieg am aktuellen Kurs (Ausbruch = erst beim Auslöser → beobachten)
  function verdictOf(p) {
    const crv = p.entry && p.stop && p.target && p.entry > p.stop ? (p.target - p.entry) / (p.entry - p.stop) : 0;
    const near = p.price && p.entry ? Math.abs(p.entry / p.price - 1) <= 0.015 : false;
    return p.type !== 'ausbruch' && p.score >= 75 && crv >= 1.5 && near ? 'kaufen' : 'beobachten';
  }
  const askOf = (p) => `Schau dir die Chance bei ${p.name} (${p.symbol}) aus dem Chancen-Radar genauer an: ${TYPE[p.type] || p.type} – jetzt kaufen oder nicht?`;
  const names = (l) => (l.length <= 2 ? l.map((p) => p.name).join(' und ') : `${l.slice(0, 2).map((p) => p.name).join(', ')} +${l.length - 2}`);
  // Titel mit klarer Handlung
  function titleOf(picks) {
    const buy = picks.filter((p) => p.verdict === 'kaufen');
    if (buy.length) return `Heute kaufen: ${names(buy)}`;
    if (picks.length) return `Heute abwarten – ${picks.length} ${picks.length === 1 ? 'Wert' : 'Werte'} beobachten`;
    return 'Heute abwarten – keine gute Chance';
  }
  const moodWord = (s) => (s > 2 ? 'positiv' : s < -2 ? 'negativ' : 'neutral');

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
      deliver(r);
    } catch {} finally { busy = false; }
  }

  function deliver(r) {
    const day = String(r.asOf || new Date().toISOString()).slice(0, 10);
    const picks = r.picks.map((p) => ({
      symbol: p.symbol, name: p.name, type: TYPE[p.type] || p.type, rawType: p.type, sector: p.sector || '', price: p.price, entry: p.entry, stop: p.stop, target: p.target,
      score: p.score, reason: p.reason || '', verdict: verdictOf(p), hit: p.history?.cases ? `${p.history.winRate} % (${p.history.cases})` : '', ask: askOf(p),
    }));
    const sig = picks.map((p) => `${p.symbol}:${p.verdict}`).sort().join('|');
    const prev = get(STATE, {});
    const sameDay = prev.day === day;
    if (sameDay && prev.sig === sig) return; // nichts Neues
    const mood = moodWord(r.mood?.score || 0);
    const data = {
      day, picks, mood, moodText: `Stimmung ${mood}${r.mood?.top?.[0]?.title ? ` – „${r.mood.top[0].title}“` : ''}${r.checked ? ` · ${r.checked} Werte geprüft` : ''}`,
      ask: picks.length ? 'Gib mir einen Überblick über die heutigen Chancen aus dem Chancen-Radar – welche soll ich kaufen?' : 'Wie ist die Marktlage heute – lohnt sich gerade ein Kauf?',
    };
    const text = picks.map((p) => `${p.name}: ${p.verdict === 'kaufen' ? 'kaufen' : 'beobachten'} (${p.type}, Kurs ${nf(p.price)} €)`).join('\n');
    // erster Lauf des Tages → neuer Überblick (ungelesen); später nur still auffrischen
    const key = `boerse|digest|${day}`;
    if (!sameDay || window.Inbox?.has(key)) window.Inbox?.add({ kind: 'boerse-digest', key, subject: titleOf(picks), text, data, quiet: sameDay }); // gelöscht → heute nicht wiederholen

    // starke NEUE Chance im Lauf des Tages → eigene Meldung (höchstens zwei am Tag)
    const alerted = sameDay ? prev.alerted || [] : [];
    if (sameDay) {
      const before = new Set(prev.buy || []);
      const fresh = picks.filter((p) => p.verdict === 'kaufen' && p.score >= 80 && !before.has(p.symbol) && !alerted.includes(p.symbol)).slice(0, Math.max(0, 2 - alerted.length));
      fresh.forEach((p) => {
        const full = r.picks.find((x) => x.symbol === p.symbol) || {};
        window.Inbox?.add({
          kind: 'boerse', key: `boerse|alert|${day}|${p.symbol}`, subject: `Jetzt kaufen: ${p.name}`, text: p.reason,
          data: { symbol: p.symbol, name: p.name, type: p.type, price: p.price, entry: p.entry, stop: p.stop, target: p.target, verdict: 'kaufen',
            history: full.history || null, news: (full.news || []).slice(0, 3).map((n) => ({ title: n.title, source: n.source || '', url: n.link || n.url || '' })), ask: p.ask },
        });
        alerted.push(p.symbol);
        try { if ('Notification' in window && Notification.permission === 'granted') new Notification(`Börsen-Bär: Jetzt kaufen – ${p.name}`, { body: `${p.type}: Einstieg um ${nf(p.entry)} €, Stopp ${nf(p.stop)} €`, tag: `bb|${p.symbol}`, icon: 'icon-180.png' }); } catch {}
      });
    }
    set(STATE, { day, sig, buy: picks.filter((p) => p.verdict === 'kaufen').map((p) => p.symbol), alerted });
  }

  // einschalten, sobald der Börsen-Agent einmal gewählt wurde
  const arm = () => { if (window.PixelDogs?.mode === 'boerse' && !get(ON, false)) { set(ON, true); setTimeout(() => check({ force: true }), 3000); } };
  document.addEventListener('dogmodechange', arm);
  setTimeout(() => { arm(); check(); }, 8000);
  setInterval(check, 30 * 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
  document.addEventListener('inbox:ask', (e) => ask(e.detail)); // „Mit dem Bären besprechen“ in der Inbox
  return { check, ask, deliver, verdictOf, titleOf };
})();
window.BoerseRadar = BoerseRadar;
