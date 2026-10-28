/* ===================================================================
   Timer (auch mehrere gleichzeitig)
   - Per Sprache: „Erstelle einen Timer von 1 Stunde und 5 Minuten“, „Fokus-Timer 25 Minuten“,
     „Timer pausieren / weiter / stoppen“, „wie lange noch?“
   - Ohne Dauer („Erstelle einen Timer“): Agent fragt nach; im Agenten-Menü erscheinen Std / Min / Sek.
     Sagt man die Dauer, trägt er sie dort selbst ein und startet.
   - Anzeige oben: der Timer, der als Nächstes abläuft (+N, wenn mehrere laufen).
     Ausgeklappt: bei einem Timer die Felder zum Ändern, bei mehreren alle Timer einzeln.
   - Läuft nach dem Neuladen weiter (Endzeiten in localStorage)
   =================================================================== */
const FocusTimer = (() => {
  const KEY = 'focusTimer';
  // Timer: { id, label, total (ms), end (Zeitpunkt) | left (ms, pausiert), paused, done }
  function loadAll() {
    try {
      const v = JSON.parse(localStorage.getItem(KEY));
      if (!v) return [];
      const loaded = Array.isArray(v) ? v : v.alarm ? [] : [{ ...v, id: 1 }]; // alter Einzel-Timer
      return loaded.filter((x) => x && x.total && !x.done && (x.paused || x.end > Date.now()));
    } catch { return []; }
  }
  let timers = loadAll();
  const saveAll = () => { try { if (timers.length) localStorage.setItem(KEY, JSON.stringify(timers)); else localStorage.removeItem(KEY); } catch {} };
  let nextId = timers.reduce((n, x) => Math.max(n, x.id || 0), 0) + 1;
  let tick = null;
  let awaitingUntil = 0; // Agent hat nach der Dauer gefragt → nächste Antwort darf auch ohne „Timer“ sein
  let pickerEl = null;   // offene Eingabe im Agenten-Menü

  const leftOf = (x) => (x.done ? 0 : x.paused ? x.left : Math.max(0, x.end - Date.now()));
  // zuerst abgelaufene, dann laufende (nach Restzeit), dann pausierte
  const sorted = () => [...timers].sort((a, b) => (b.done - a.done) || (a.paused - b.paused) || leftOf(a) - leftOf(b));
  const primary = () => sorted()[0] || null;
  const fmt = (ms) => {
    const s = Math.ceil(ms / 1000);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };

  /* ---------- Drei Felder Std / Min / Sek (im Agenten und in der ausgeklappten Leiste) ---------- */
  function fieldsHtml(h = 0, m = 25, s = 0) {
    return `<div class="ft-fields">
      <label class="ft-field"><input inputmode="numeric" maxlength="2" value="${h}" data-u="h"><span>Std</span></label>
      <span class="ft-colon">:</span>
      <label class="ft-field"><input inputmode="numeric" maxlength="2" value="${m}" data-u="m"><span>Min</span></label>
      <span class="ft-colon">:</span>
      <label class="ft-field"><input inputmode="numeric" maxlength="2" value="${s}" data-u="s"><span>Sek</span></label>
    </div>`;
  }
  /* Jedes Feld einzeln ausfüllbar: nur Ziffern, max. 2; Pfeiltasten/Mausrad zählen hoch/runter */
  function wireFields(root, onEnter) {
    root.querySelectorAll('.ft-field input').forEach((inp) => {
      inp.addEventListener('focus', () => setTimeout(() => { const n = inp.value.length; inp.setSelectionRange(n, n); }, 0));
      inp.addEventListener('input', () => { inp.value = inp.value.replace(/\D/g, '').slice(0, 2); });
      inp.addEventListener('blur', () => { if (inp.value === '') inp.value = '0'; });
      inp.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          const max = inp.dataset.u === 'h' ? 99 : 59;
          const v = (parseInt(inp.value, 10) || 0) + (e.key === 'ArrowUp' ? 1 : -1);
          inp.value = String(Math.min(max, Math.max(0, v)));
        } else if (e.key === 'Enter') { e.preventDefault(); inp.blur(); onEnter(); }
      });
      inp.addEventListener('wheel', (e) => { e.preventDefault(); inp.dispatchEvent(new KeyboardEvent('keydown', { key: e.deltaY < 0 ? 'ArrowUp' : 'ArrowDown' })); }, { passive: false });
    });
  }
  const readMinutes = (root) => {
    const v = (u) => Math.max(0, parseInt(root.querySelector(`[data-u="${u}"]`).value, 10) || 0);
    return v('h') * 60 + v('m') + v('s') / 60;
  };
  function fillFields(root, minutes) {
    const total = Math.round(minutes * 60);
    const set = (u, n) => { const inp = root.querySelector(`[data-u="${u}"]`); inp.value = String(n); inp.classList.remove('filled'); void inp.offsetWidth; inp.classList.add('filled'); };
    set('h', Math.floor(total / 3600));
    set('m', Math.floor((total % 3600) / 60));
    set('s', total % 60);
  }

  /* ---------- Anzeige oben ---------- */
  const box = el('div', 'ft');
  box.hidden = true;
  box.innerHTML = `
    <div class="ft-bar">
      <svg class="ft-ico" width="16" height="16" aria-hidden="true"><use href="#i-timer"/></svg>
      <div class="ft-time" aria-live="off"></div>
      <span class="ft-count" hidden></span>
      <div class="ft-actions">
        <button class="va-btn" type="button" data-ft="toggle" title="Pause">${icon('i-pause')}</button>
        <button class="va-btn ft-expand" type="button" data-ft="expand" title="Aufklappen">${icon('i-chevron-down')}</button>
        <button class="va-btn" type="button" data-ft="close" title="Timer beenden">${icon('i-x')}</button>
      </div>
    </div>
    <div class="ft-more"><div class="ft-more-inner"></div></div>`;
  const more = box.querySelector('.ft-more-inner');
  let moreMode = null; // 'edit' (ein Timer) | 'list' (mehrere)

  function mount() {
    const stack = document.getElementById('topStack');
    if (stack && !box.isConnected) stack.append(box);
  }
  function render() {
    if (!timers.length) {
      if (!box.hidden && !box.classList.contains('closing')) {
        box.classList.remove('expanded');
        box.classList.add('closing');
        setTimeout(() => {
          if (timers.length) return;
          const hide = () => { box.hidden = true; box.classList.remove('closing'); };
          if (window.dockFlip) window.dockFlip(hide); else hide();
        }, 240);
      }
      return;
    }
    mount();
    if (box.hidden || box.classList.contains('closing')) {
      const show = () => { box.hidden = false; box.classList.remove('closing'); };
      if (window.dockFlip) window.dockFlip(show); else show();
      window.dockEnter?.(box);
    }
    const p = primary();
    box.querySelector('.ft-time').textContent = p.done ? '00:00' : fmt(leftOf(p));
    const count = box.querySelector('.ft-count');
    count.hidden = timers.length < 2;
    count.textContent = `+${timers.length - 1}`;
    box.classList.toggle('multi', timers.length > 1);
    box.classList.toggle('paused', !!p.paused);
    box.classList.toggle('done', !!p.done);
    const toggle = box.querySelector('[data-ft="toggle"]');
    const want = p.paused ? 'i-play' : 'i-pause';
    if (toggle.dataset.icon !== want) { toggle.innerHTML = icon(want); toggle.dataset.icon = want; }
    toggle.title = p.paused ? 'Weiter' : 'Pause';
    toggle.hidden = !!p.done;
    if (box.classList.contains('expanded')) {
      const mode = timers.length > 1 ? 'list' : 'edit';
      if (mode !== moreMode) buildMore();
      else if (mode === 'list') updateList();
    }
  }

  /* Ausgeklappt: ein Timer → Zeit ändern; mehrere → alle einzeln */
  function buildMore() {
    moreMode = timers.length > 1 ? 'list' : 'edit';
    if (moreMode === 'edit') {
      const total = Math.round(leftOf(primary()) / 1000);
      more.innerHTML = `${fieldsHtml(Math.floor(total / 3600), Math.floor((total % 3600) / 60), total % 60)}
        <div class="va-foot"><button class="ask-btn" type="button" data-ft="close">Timer beenden</button><div class="flex-spacer"></div><button class="ask-btn primary" type="button" data-ft="apply">Übernehmen</button></div>`;
      wireFields(more, () => more.querySelector('[data-ft="apply"]').click());
    } else {
      more.innerHTML = `<div class="ft-list"></div>
        <div class="va-foot"><div class="flex-spacer"></div><button class="ask-btn" type="button" data-ft="all">Alle beenden</button></div>`;
      updateList();
    }
  }
  function updateList() {
    const list = more.querySelector('.ft-list');
    if (!list) return;
    const items = sorted();
    if (list.children.length !== items.length || items.some((x, i) => list.children[i].dataset.id !== String(x.id))) {
      list.replaceChildren(...items.map((x, i) => {
        const row = el('div', 'ft-row');
        row.dataset.id = x.id;
        row.style.animationDelay = `${i * 40}ms`;
        row.innerHTML = `<svg class="ft-row-ico" width="16" height="16" aria-hidden="true"><use href="#i-timer"/></svg>
          <span class="ft-row-time"></span><span class="ft-row-label"></span>
          <button class="va-btn" type="button" data-ft-row="toggle"></button>
          <button class="va-btn" type="button" data-ft-row="remove" title="Beenden">${icon('i-x')}</button>`;
        return row;
      }));
    }
    items.forEach((x, i) => {
      const row = list.children[i];
      row.classList.toggle('paused', !!x.paused);
      row.classList.toggle('done', !!x.done);
      row.querySelector('.ft-row-time').textContent = x.done ? '00:00' : fmt(leftOf(x));
      row.querySelector('.ft-row-label').textContent = x.done ? 'Abgelaufen' : x.paused ? 'Pausiert' : x.label === 'Fokus' ? 'Fokus' : 'Timer';
      const t = row.querySelector('[data-ft-row="toggle"]');
      const want = x.paused ? 'i-play' : 'i-pause';
      if (t.dataset.icon !== want) { t.innerHTML = icon(want); t.dataset.icon = want; }
      t.hidden = !!x.done;
    });
  }
  function setExpanded(open) {
    if (open) buildMore();
    box.classList.toggle('expanded', open);
    if (open) document.dispatchEvent(new CustomEvent('dock:open', { detail: 'timer' }));
  }
  document.addEventListener('dock:open', (e) => { if (e.detail !== 'timer' && box.classList.contains('expanded')) setExpanded(false); });

  function loop() {
    clearInterval(tick);
    if (!timers.some((x) => !x.paused && !x.done)) { render(); return; }
    tick = setInterval(() => {
      timers.filter((x) => !x.paused && !x.done && leftOf(x) <= 0).forEach(finish);
      render();
      if (!timers.some((x) => !x.paused && !x.done)) clearInterval(tick);
    }, 250);
    render();
  }
  function chime() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      [[523.25, 0], [659.25, 0.16], [783.99, 0.32]].forEach(([f, at]) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, ctx.currentTime + at);
        g.gain.exponentialRampToValueAtTime(0.055, ctx.currentTime + at + 0.045);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + 0.85);
        o.connect(g).connect(ctx.destination);
        o.start(ctx.currentTime + at); o.stop(ctx.currentTime + at + 1);
      });
      setTimeout(() => ctx.close(), 2000);
    } catch {}
  }
  function finish(x) {
    timers = timers.filter((timer) => timer !== x);
    saveAll();
    chime();
    document.dispatchEvent(new CustomEvent('focus:done', { detail: { label: x.label } }));
  }

  /* ---------- Steuerung ---------- */
  function start(minutes, label = 'Timer') {
    const total = Math.max(1000, Math.round(minutes * 60 * 1000));
    timers.push({ id: nextId++, label, total, end: Date.now() + total, paused: false, done: false });
    awaitingUntil = 0;
    saveAll();
    if (box.classList.contains('expanded')) buildMore();
    loop();
    document.dispatchEvent(new Event('timer:started'));
  }
  const pauseOne = (x) => { if (!x || x.paused || x.done) return; x.left = leftOf(x); x.paused = true; };
  const resumeOne = (x) => { if (!x || !x.paused) return; x.end = Date.now() + x.left; x.paused = false; delete x.left; };
  function remove(x) { timers = timers.filter((y) => y !== x); saveAll(); if (box.classList.contains('expanded')) buildMore(); loop(); }
  // Sprachbefehle wirken auf alle Timer
  function pause() { timers.forEach(pauseOne); saveAll(); loop(); }
  function resume() { timers.forEach(resumeOne); saveAll(); loop(); }
  function stop() { timers = []; saveAll(); clearInterval(tick); render(); }

  box.addEventListener('click', (e) => {
    const rowBtn = e.target.closest('[data-ft-row]');
    if (rowBtn) {
      const x = timers.find((y) => String(y.id) === rowBtn.closest('.ft-row').dataset.id);
      if (rowBtn.dataset.ftRow === 'remove') remove(x);
      else { if (x?.paused) resumeOne(x); else pauseOne(x); saveAll(); loop(); }
      return;
    }
    const b = e.target.closest('[data-ft]');
    if (!b) { if (e.target.closest('.ft-bar')) setExpanded(!box.classList.contains('expanded')); return; } // Klick auf die Zeit: aufklappen
    const a = b.dataset.ft;
    const p = primary();
    if (a === 'toggle') { if (p?.paused) resumeOne(p); else pauseOne(p); saveAll(); loop(); }
    else if (a === 'expand') setExpanded(!box.classList.contains('expanded'));
    else if (a === 'close') { remove(p); if (timers.length < 2 && box.classList.contains('expanded') && !timers.length) setExpanded(false); }
    else if (a === 'all') { setExpanded(false); stop(); }
    else if (a === 'apply') {
      const min = readMinutes(more);
      if (min > 0 && p) { p.total = Math.round(min * 60000); p.end = Date.now() + p.total; p.paused = false; p.done = false; delete p.left; saveAll(); setExpanded(false); loop(); }
    }
  });

  /* ---------- Sprache verstehen ---------- */
  const NUM = { ein: 1, eins: 1, eine: 1, einen: 1, einer: 1, einem: 1, zwei: 2, drei: 3, vier: 4, fünf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10, elf: 11, zwölf: 12,
    fünfzehn: 15, zwanzig: 20, fünfundzwanzig: 25, dreißig: 30, vierzig: 40, fünfundvierzig: 45, fünfzig: 50, sechzig: 60, neunzig: 90, halbe: 0.5, halben: 0.5, anderthalb: 1.5, eineinhalb: 1.5, viertel: 0.25, dreiviertel: 0.75 };
  const numOf = (w) => NUM[w] ?? Number(String(w).replace(',', '.'));
  /* Dauer aus allen Angaben zusammenzählen: „1 Stunde und 5 Minuten“, „einer halben Stunde“, „90 Sekunden“ → Minuten */
  function parseDuration(low) {
    const re = /(\d+(?:[.,]\d+)?|[a-zäöüß]+)\s+(stunden?|std|h\b|minuten?|min\b|sekunden?|sek\b|s\b)/g;
    let total = 0, found = false, m;
    while ((m = re.exec(low))) {
      let n = numOf(m[1]);
      if (!Number.isFinite(n)) continue;
      const before = low.slice(Math.max(0, m.index - 12), m.index);
      if (/halbe[n]?\s*$/.test(before) && n === 1) n = 0.5;
      found = true;
      if (/^(st|h)/.test(m[2])) total += n * 60;
      else if (/^s/.test(m[2])) total += n / 60;
      else total += n;
    }
    if (/\bhalbe[n]?\s+stunde/.test(low) && !found) { total = 30; found = true; }
    if (/\bviertelstunde/.test(low)) { total += 15; found = true; }
    if (!found) { const n = low.match(/\b(\d{1,3})\b/); if (n && /(timer|fokus|countdown)/.test(low)) { total = Number(n[1]); found = true; } }
    return found && total > 0 ? total : null;
  }
  function sayDuration(minutes) {
    const total = Math.round(minutes * 60);
    const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
    const parts = [];
    if (h) parts.push(h === 1 ? 'eine Stunde' : `${h} Stunden`);
    if (m) parts.push(m === 1 ? 'eine Minute' : `${m} Minuten`);
    if (s) parts.push(s === 1 ? 'eine Sekunde' : `${s} Sekunden`);
    return parts.join(' und ') || '0 Sekunden';
  }

  /* Sprachbefehl → kurze Bestätigung (oder null, wenn es kein Timer-Befehl ist) */
  function command(text) {
    const low = String(text).toLowerCase().trim().replace(/[!?]+$/, '').replace(/\.$/, '');
    const awaiting = Date.now() < awaitingUntil;
    const isTimer = /(timer|fokus|focus|pomodoro|countdown|stoppuhr)/.test(low);
    if (!isTimer && !awaiting) return null;
    if (/(stopp|stop|beend|abbrech|lösch|ausschalten|abschalten|schlie(ß|ss)|entfern|cancel|weg\b|\baus\b)/.test(low)) {
      awaitingUntil = 0;
      const hadPicker = !!pickerEl?.isConnected;
      pickerEl = null;
      if (hadPicker) window.vaCloseTimerPanel?.();
      if (!timers.length) return hadPicker ? 'Okay.' : 'Es läuft gerade kein Timer.';
      const n = timers.length;
      stop(); // alles ganz beenden – nichts läuft im Hintergrund weiter
      return n > 1 ? 'Alle Timer beendet.' : 'Timer beendet.';
    }
    if (isTimer && /(pausier|pause|anhalten)/.test(low)) { if (!timers.length) return 'Es läuft gerade kein Timer.'; pause(); return timers.length > 1 ? 'Timer pausiert.' : 'Timer pausiert.'; }
    if (isTimer && /(weiter|fortsetzen|fortführen)/.test(low)) { if (!timers.length) return 'Es läuft gerade kein Timer.'; resume(); return 'Weiter geht’s.'; }
    if (/(wie lange|wie viel zeit|restzeit|noch übrig)/.test(low)) {
      const p = primary();
      if (!p) return isTimer ? 'Es läuft gerade kein Timer.' : null;
      const min = Math.ceil(leftOf(p) / 60000);
      return min <= 1 ? 'Noch weniger als eine Minute.' : `Noch ${sayDuration(min)}.`;
    }
    const label = /(fokus|focus|pomodoro|lernen|konzentr)/.test(low) ? 'Fokus' : 'Timer';
    const minutes = parseDuration(low) ?? (/(fokus|focus|pomodoro)/.test(low) && !awaiting ? 25 : null);
    if (!minutes) {
      if (!awaiting && !isTimer) return null;
      awaitingUntil = Date.now() + 90000;
      window.vaShowTimer?.(); // Eingabe im Agenten-Menü
      return 'Wie lange soll der Timer laufen?';
    }
    if (pickerEl?.isConnected) {
      // Dauer gesagt, während die Eingabe offen ist → sichtbar eintragen, dann starten
      fillFields(pickerEl, minutes);
      const p = pickerEl;
      setTimeout(() => { if (p.isConnected) p.querySelector('[data-act="start"]').click(); }, 650);
    } else {
      start(minutes, label);
      window.vaCloseTimerPanel?.();
    }
    const more2 = timers.length > 1 ? ' Er läuft zusätzlich.' : '';
    return (label === 'Fokus' ? `Fokus-Timer für ${sayDuration(minutes)} läuft.` : `Timer für ${sayDuration(minutes)} läuft.`) + more2;
  }

  /* ---------- Eingabe im Agenten-Menü: nur Std / Min / Sek ---------- */
  function mountPicker(container) {
    const wrap = el('div', 'ft-pick mu-in-agent');
    wrap.innerHTML = `${fieldsHtml(0, 25, 0)}
      <div class="va-foot">
        <button class="ask-btn ghost" type="button" data-act="skip">Überspringen</button>
        <div class="flex-spacer"></div>
        <button class="ask-btn primary" type="button" data-act="start">Starten</button>
      </div>`;
    container.replaceChildren(wrap);
    pickerEl = wrap;
    wireFields(wrap, () => wrap.querySelector('[data-act="start"]').click());
    wrap.querySelector('[data-act="skip"]').addEventListener('click', () => { awaitingUntil = 0; pickerEl = null; container.dispatchEvent(new CustomEvent('timer-close', { bubbles: true })); });
    wrap.querySelector('[data-act="start"]').addEventListener('click', () => {
      const minutes = readMinutes(wrap);
      if (minutes <= 0) return;
      pickerEl = null;
      start(minutes, 'Timer');
      container.dispatchEvent(new CustomEvent('timer-close', { bubbles: true }));
    });
    setTimeout(() => wrap.querySelector('[data-u="m"]').focus({ preventScroll: true }), 80);
  }

  /* Ausführen eines Timer-Blocks vom Sprachmodell: {"minutes": 65} */
  function run(a) {
    if (!a) return;
    if (a.action === 'stop' || a.stop) { awaitingUntil = 0; pickerEl = null; stop(); return; }
    const minutes = Number(a.minutes) || (Number(a.seconds) || 0) / 60;
    if (minutes > 0) start(minutes, a.label || 'Timer');
  }

  // nach dem Neuladen weiterlaufen lassen
  saveAll(); // alte, bereits abgelaufene Einträge aus dem Speicher entfernen
  if (timers.length) setTimeout(loop, 0);

  return { start, pause, resume, stop, command, run, mountPicker, parseDuration, get active() { return timers.length > 0; }, get count() { return timers.length; } };
})();
window.FocusTimer = FocusTimer;
