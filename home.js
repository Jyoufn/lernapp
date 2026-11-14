/* ===================================================================
   Home (Wunsch 07.11., Vorbild „Home · Up Next“): ersetzt den Kopf der Bibliothek.
   - Keine Unterzeile unter „Home“ mehr (09.11. entfernt); rechts daneben das Plus-Menü (docs.js).
   - „Als Nächstes“: Karten nebeneinander zum Wischen (Scroll-Snap, Punkte + Pfeile), jede mit X zum Wegklicken
     (gemerkt in home.dismissed.v1). Karte = Icon-Kachel links, Titel + kurze Beschreibung, rechts ein Knopf.
     Quellen: nächster Termin (36 Std.), fällige/überfällige Aufgaben, Börse (nur bei starkem Ausschlag),
     „Weitermachen“ mit dem zuletzt bearbeiteten Dokument.
   - Börse wird NICHT ständig abgefragt: höchstens alle 3 Std. (home.boerse.v1), nur gespeicherter Radar + Depot.
     Alarm nur bei Auffälligkeit: Depot-Wert heute ≤ −4 % oder ≥ +8 %, bzw. Radar-Kaufsignal nach Rückgang ≥ 8 %.
   docs.js ruft Home.render(slot) beim Öffnen der Liste und Home.leave() beim Verlassen.
   =================================================================== */
const Home = (() => {
  const DISMISS_KEY = 'home.dismissed.v1', BX_KEY = 'home.boerse.v1';
  const BX_EVERY = 3 * 3600 * 1000;
  const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const use = (id, size = 16) => `<svg width="${size}" height="${size}" aria-hidden="true"><use href="#${id}"/></svg>`;
  const pad = (n) => String(n).padStart(2, '0');
  const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const num = (x, d = 1) => `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x).toFixed(d).replace('.', ',')}`;

  /* ---------- Karten ---------- */
  function eventCard(now) {
    const evs = window.Calendar?.events || [];
    const today = isoOf(now), tomorrow = isoOf(new Date(now.getTime() + 86400000));
    const list = [];
    for (const e of evs) {
      if (!e?.date || (e.date !== today && e.date !== tomorrow)) continue;
      if (!e.time) { if (e.date === today) list.push({ e, start: new Date(`${e.date}T00:00`).getTime(), end: new Date(`${e.date}T23:59`).getTime(), allDay: true }); continue; }
      const start = new Date(`${e.date}T${e.time}`).getTime();
      const end = e.end ? new Date(`${e.date}T${e.end}`).getTime() : start + 3600000;
      if (end < now.getTime()) continue;
      list.push({ e, start, end });
    }
    // laufende/kommende Termine mit Uhrzeit zuerst, ganztägige danach
    list.sort((a, b) => (a.allDay - b.allDay) || a.start - b.start);
    const hit = list[0]; if (!hit) return null;
    const { e } = hit, mins = Math.round((hit.start - now.getTime()) / 60000);
    const span = e.time ? `${e.time}${e.end ? `–${e.end}` : ''}` : 'ganztägig';
    let when, soon = false;
    if (hit.allDay) when = 'Heute';
    else if (mins <= 0) { when = 'Läuft gerade'; soon = true; }
    else if (mins < 60) { when = `In ${mins} Min.`; soon = true; }
    else if (e.date === today) when = mins < 180 ? `In ${Math.round(mins / 60)} Std.` : 'Heute';
    else when = 'Morgen';
    const more = list.length - 1;
    return {
      id: `ev:${e.id || e.title}:${e.date}:${e.time || ''}`, kind: 'event', icon: /^[if]-/.test(e.icon || '') ? e.icon : 'f-calendar', color: e.color,
      title: e.title || 'Termin', when, soon, desc: `${span}${more > 0 ? ` · noch ${more} weitere${more === 1 ? 'r' : ''}` : ''}`,
      act: 'Kalender', go: () => window.openViewTab?.('calendar'),
    };
  }
  function docCard(now) {
    const D = window.Docs; if (!D) return null;
    const d = D.docs.filter((x) => D.inWs(x) && !D.isEmpty(x.id)).sort((a, b) => (b.updated || 0) - (a.updated || 0))[0];
    if (!d || now.getTime() - (d.updated || 0) > 7 * 86400000) return null;
    const ago = now.getTime() - d.updated, h = Math.round(ago / 3600000);
    const when = ago < 3600000 ? 'Gerade eben' : h < 24 ? `Vor ${h} Std.` : `Vor ${Math.round(h / 24)} Tag${Math.round(h / 24) === 1 ? '' : 'en'}`;
    return { id: `doc:${d.id}:${new Date(d.updated).toDateString()}`, kind: 'doc', icon: 'f-file', title: d.title || 'Unbenannt', when, desc: 'Weitermachen, wo du aufgehört hast', act: 'Öffnen', go: () => D.open(d.id) };
  }
  // Börse: aus dem Zwischenspeicher (höchstens alle 3 Std. neu geholt)
  function boerseCards() {
    const c = read(BX_KEY, null); if (!c?.alerts) return [];
    return c.alerts.map((a) => ({
      id: `bx:${a.symbol}:${a.day}`, kind: 'boerse', icon: a.up ? 'f-trend' : 'f-alert', alarm: !a.up,
      title: a.title, when: a.when, desc: a.desc, act: 'Nachfragen',
      go: () => window.AppActions?.new_chat({ agent: 'boerse', prompt: a.ask, title: a.name }),
    }));
  }
  async function refreshBoerse(force = false) {
    const c = read(BX_KEY, null);
    if (!force && c && Date.now() - c.t < BX_EVERY) return false;
    write(BX_KEY, { ...(c || {}), t: Date.now() }); // sofort merken – kein zweiter Abruf, falls etwas hängt
    const get = (u) => fetch(u, { credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const [best, ch] = await Promise.all([get('/api/boerse/bestand'), get('/api/boerse/chancen')]);
    const day = isoOf(new Date()), alerts = [];
    for (const x of best?.items || []) {
      if (typeof x.day !== 'number' || !(x.day <= -4 || x.day >= 8)) continue;
      const up = x.day > 0, name = x.name || x.symbol;
      alerts.push({ symbol: x.symbol, name, day, up, title: `${name} ${num(x.day)} % heute`, when: 'Mein Depot',
        desc: up ? 'Ungewöhnlich starker Anstieg' : 'Ungewöhnlich starker Rückgang – lohnt ein Blick',
        ask: `${name} ist heute ${num(x.day)} % – was ist passiert, und soll ich etwas tun?` });
    }
    const pick = (ch?.picks || []).find((p) => p.verdict === 'kaufen' && typeof p.drop === 'number' && Math.abs(p.drop) >= 8);
    if (pick && !alerts.some((a) => a.symbol === pick.symbol)) {
      alerts.push({ symbol: pick.symbol, name: pick.name, day, up: false, title: `${pick.name} ${num(-Math.abs(pick.drop))} % in ${pick.dropDays || 5} Tagen`,
        when: 'Chancen-Radar', desc: 'Starker Rückgang mit Erholungschance', ask: `Der Radar zeigt ${pick.name} nach einem Rückgang als Chance. Wie schätzt du das ein?` });
    }
    write(BX_KEY, { t: Date.now(), alerts: alerts.slice(0, 2) });
    return true;
  }

  /* ---------- Darstellung ---------- */
  let slot = null, index = 0;
  const dismissed = () => new Set(read(DISMISS_KEY, []));
  function cards() {
    const now = new Date(), gone = dismissed();
    return [eventCard(now), ...boerseCards(), docCard(now)].filter((c) => c && !gone.has(c.id));
  }
  function cardHtml(c, i) {
    const tone = c.alarm || c.late ? ' hm-warn' : c.soon ? ' hm-soon' : '';
    return `<article class="hm-card hm-${c.kind}${tone}" data-i="${i}" data-id="${esc(c.id)}">
      <span class="hm-ic"${c.color ? ` style="--ic:${esc(c.color)}"` : ''}>${use(c.icon, 16)}</span>
      <span class="hm-txt"><span class="hm-title">${esc(c.title)}</span><span class="hm-desc"><b>${esc(c.when)}</b>${c.desc ? `<span class="hm-dot">·</span>${esc(c.desc)}` : ''}</span></span>
      <button type="button" class="hm-go" data-go="${i}">${esc(c.act)}</button>
      <button type="button" class="hm-x" data-x="${i}" aria-label="Ausblenden">${use('f-x', 10)}</button></article>`;
  }
  let shown = [];
  function draw() {
    if (!slot) return;
    shown = cards();
    if (index >= shown.length) index = Math.max(0, shown.length - 1);
    slot.hidden = !shown.length;
    if (!shown.length) { slot.innerHTML = ''; return; }
    const many = shown.length > 1;
    slot.innerHTML = `<div class="hm-head"><span class="hm-label">Als Nächstes</span>${many ? `<span class="hm-nav">
        <button type="button" class="hm-arrow" data-nav="-1" aria-label="Vorherige">${use('f-back', 11)}</button>
        <span class="hm-count">${index + 1}/${shown.length}</span>
        <button type="button" class="hm-arrow" data-nav="1" aria-label="Nächste">${use('f-forward', 11)}</button></span>` : ''}</div>
      <div class="hm-track" tabindex="-1">${shown.map(cardHtml).join('')}</div>
      ${many ? `<div class="hm-dots">${shown.map((_, i) => `<i class="${i === index ? 'on' : ''}"></i>`).join('')}</div>` : ''}`;
    const track = slot.querySelector('.hm-track');
    track.scrollLeft = index * track.clientWidth;
    track.addEventListener('scroll', () => {
      const i = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
      if (i !== index) { index = i; syncNav(); }
    }, { passive: true });
    syncNav();
  }
  function syncNav() {
    if (!slot) return;
    slot.querySelectorAll('.hm-dots i').forEach((d, i) => d.classList.toggle('on', i === index));
    const cnt = slot.querySelector('.hm-count'); if (cnt) cnt.textContent = `${index + 1}/${shown.length}`;
    const [prev, next] = slot.querySelectorAll('.hm-arrow');
    if (prev) prev.disabled = index === 0;
    if (next) next.disabled = index >= shown.length - 1;
  }
  const goTo = (i) => { const track = slot?.querySelector('.hm-track'); if (!track) return; index = Math.max(0, Math.min(shown.length - 1, i)); track.scrollTo({ left: index * track.clientWidth, behavior: 'smooth' }); syncNav(); };
  function dismiss(i) {
    const c = shown[i]; if (!c) return;
    const list = read(DISMISS_KEY, []).filter((x) => x !== c.id); list.push(c.id); write(DISMISS_KEY, list.slice(-60));
    const el = slot.querySelector(`.hm-card[data-i="${i}"]`);
    const done = () => { if (index > i || index >= shown.length - 1) index = Math.max(0, index - (index > i ? 1 : 0)); draw(); };
    if (!el || matchMedia('(prefers-reduced-motion: reduce)').matches) { done(); return; }
    el.classList.add('out'); el.addEventListener('animationend', done, { once: true }); setTimeout(done, 400);
  }
  function onClick(e) {
    const x = e.target.closest('[data-x]'); if (x) { dismiss(+x.dataset.x); return; }
    const n = e.target.closest('[data-nav]'); if (n && slot.contains(n)) { goTo(index + +n.dataset.nav); return; }
    const g = e.target.closest('[data-go]') || (e.target.closest('.hm-card') && !e.target.closest('button') ? e.target.closest('.hm-card') : null);
    const c = g && shown[+(g.dataset.go ?? g.dataset.i)];
    if (c) (window.softSwitch || ((f) => f()))(() => c.go());
  }

  return {
    render(slotEl) {
      if (slot !== slotEl) { slot = slotEl; slot.addEventListener('click', onClick); }
      draw();
      refreshBoerse().then((changed) => { if (changed && slot?.isConnected) draw(); });
    },
    redraw() { draw(); },
    leave() {},
    refreshBoerse, cards, // Tests / Konsole
  };
})();
window.Home = Home;
