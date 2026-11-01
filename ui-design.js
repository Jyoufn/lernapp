/* ===================================================================
   UI-Design – Vorschau eines neuen Stils (nur Ansicht, noch nicht in der App umgesetzt)
   Vorlage des Nutzers („Pricing“-Karte) – übernommen werden Größenverhältnisse, Farben und Rundungen (Schrift bleibt Inter):
   heller Rahmen (#212121) mit Kopfzeile (Name links, kleine graue Angaben rechts), darin dunklere Innenflächen (#191919) mit 3 px Abstand,
   Radius 9 außen / 6 innen, feine Ränder, gerasterter Grund. Aufbau wie eine Website: Kopf mit Sprungleiste, dann je Baustein ein
   Abschnitt in voller Breite (Text links, große spielbare Vorschau rechts – so, wie es im Chat aussähe).
   Öffnen über die Sidebar „UI-Design“ (app.js → VIEW_TABS.uidesign).
   =================================================================== */
const UIDesign = (() => {
  const fi = (n, s = 14) => (window.FadeIcons ? FadeIcons.svg(n, s) : '');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const view = document.createElement('section');
  view.className = 'uid-view';
  view.hidden = true;
  let open = false, built = false, timer = null;

  // Baustein-Rahmen: Kopfzeile + Innenflächen
  const frame = (name, tags, panels, cls = '') => `<div class="u-frame ${cls}"><div class="u-fh"><b>${name}</b><span>${tags.map((t) => `<i>${t}</i>`).join('')}</span></div>${panels}</div>`;
  const section = (id, eye, title, text, rules, demo) => `<section class="u-sec" id="u-${id}"><div class="u-side"><span class="u-eye">${eye}</span><h2>${title}</h2><p>${text}</p>
    <ul>${rules.map((r) => `<li>${fi('check', 11)}<span>${r}</span></li>`).join('')}</ul></div><div class="u-demo">${demo}</div></section>`;

  const CARDS = [
    { front: 'Mitochondrium', back: 'Ort der Zellatmung: Aus Glucose und Sauerstoff entsteht ATP – die Energiewährung der Zelle.' },
    { front: 'Ribosom', back: 'Baut Proteine nach der Vorlage der mRNA (Translation).' },
    { front: 'Chloroplast', back: 'Ort der Fotosynthese in Pflanzenzellen – enthält Chlorophyll.' },
  ];
  const QUIZ = { q: 'Welches Organell ist das „Kraftwerk“ der Zelle?', opts: ['Zellkern', 'Mitochondrium', 'Ribosom', 'Golgi-Apparat'], right: 1,
    why: 'In den Mitochondrien läuft die Zellatmung ab. Dabei wird die Energie aus Glucose in ATP gespeichert – der Zellkern steuert dagegen nur, er liefert keine Energie.' };
  const TAGS = [['Biologie', '#4fcf8a'], ['Mathe', '#6aa8ff'], ['Deutsch', '#f0913a'], ['Klausur', '#f07a6e'], ['Wiederholen', '#b49cff']];
  const PRIOS = [['Dringend', '#f07a6e'], ['Hoch', '#f0913a'], ['Mittel', '#facc15'], ['Niedrig', '#6aa8ff'], ['Keine', '#6e6e6e']];
  const FILE = (c) => `<svg width="22" height="22" viewBox="0 0 30 30" aria-hidden="true"><path d="M8 3h10.5L25 9.5V25a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" fill="${c}"/><path d="M18.5 3v4.5a2 2 0 0 0 2 2H25Z" fill="#fff" fill-opacity=".35"/></svg>`;

  function build() {
    const nav = [['karten', 'Karteikarten'], ['quiz', 'Quiz'], ['praes', 'Präsentation'], ['klausur', 'Probeklausur'], ['menues', 'Menüs'], ['eingaben', 'Eingaben']];
    view.innerHTML = `<div class="u-page">
      <header class="u-hero"><span class="u-eye">Designsystem · Vorschau</span><h1>Ein ruhiger Stil<br>für alles, was du lernst.</h1>
        <p>Heller Rahmen, dunkle Innenflächen, feine Kanten. So würden die Bausteine im Chat aussehen – noch nicht in der App umgesetzt, aber alles hier ist anklickbar.</p>
        <nav class="u-nav">${nav.map(([id, n]) => `<button type="button" data-go="${id}">${n}</button>`).join('')}</nav></header>

      ${section('karten', 'Lernen', 'Karteikarten', 'Eine Karte, volle Aufmerksamkeit. Antippen dreht sie um, darunter bewertest du dich selbst.',
        ['Vorder- und Rückseite gleich dunkel', 'Bewertung färbt nur kurz den Rand', 'Pfeile und Wischen zum Blättern'],
        frame('Zellorganellen', ['<span class="u-fc-n">Karte 1 von 3</span>', 'Biologie'], `
          <div class="u-in u-flash" tabindex="0"><span class="u-k u-fc-k">Vorderseite</span><p class="u-fc-t"></p><span class="u-k u-fc-h">Zum Umdrehen antippen</span></div>
          <div class="u-in u-bar"><button type="button" class="u-ib" data-fc="-1" aria-label="Vorherige Karte">${fi('chevron-right', 12)}</button>
            <div class="u-rate">${[['r0', 'Nicht gewusst'], ['r1', 'Unsicher'], ['r2', 'Gewusst']].map(([c, t], i) => `<button type="button" data-r="${i}"><i class="${c}"></i>${t}</button>`).join('')}</div>
            <button type="button" class="u-ib" data-fc="1" aria-label="Nächste Karte">${fi('chevron-right', 12)}</button></div>`))}

      ${section('quiz', 'Üben', 'Quiz', 'Antwort wählen, bestätigen, verstehen. Die Erklärung klappt nur auf, wenn du sie willst.',
        ['Auswahl ist voll blau, der Rand bleibt', 'Erst nach „Bestätigen“ richtig oder falsch', 'Fortschritt als feine Segmente'],
        frame('Die Zelle', ['Frage 3 von 9', 'Multiple Choice'], `
          <div class="u-in u-quiz"><div class="u-segs">${Array.from({ length: 9 }, (_, i) => `<i class="${i < 2 ? (i ? 'no' : 'ok') : i === 2 ? 'on' : ''}"></i>`).join('')}</div>
            <p class="u-q">${QUIZ.q}</p><div class="u-opts">${QUIZ.opts.map((o, i) => `<button type="button" class="u-opt" data-o="${i}"><span class="u-key">${'ABCD'[i]}</span><span>${o}</span></button>`).join('')}</div></div>
          <div class="u-in u-foot"><div class="u-st"><button type="button" class="u-link" data-skip>Überspringen</button></div><button type="button" class="u-btn" data-quiz disabled>Bestätigen</button></div>
          <div class="u-in u-why" hidden><p>${QUIZ.why}</p></div>`))}

      ${section('praes', 'Vortragen', 'Präsentation', 'Die Folien stehen im Mittelpunkt, die Ausgabe darunter – ein Tipp und die Datei ist da.',
        ['Vorschau im echten 16:9-Format', 'Eigene Datei-Icons je Format', 'Blättern direkt in der Vorschau'],
        frame('Die Zelle – Bausteine des Lebens', ['<span class="u-sl-n">Folie 1 von 3</span>', '16:9'], `
          <div class="u-in u-stage"><div class="u-slide"></div><button type="button" class="u-ib u-sl-p" data-sl="-1" aria-label="Vorherige Folie">${fi('chevron-right', 12)}</button><button type="button" class="u-ib u-sl-n2" data-sl="1" aria-label="Nächste Folie">${fi('chevron-right', 12)}</button></div>
          <div class="u-outs">${[['PowerPoint', 'Bearbeitbar', '#E5673E'], ['Keynote', 'iPad & Mac', '#3D8BFF'], ['PDF', 'Zum Teilen', '#E5534B']].map(([n, h, c]) => `<button type="button" class="u-in u-out">${FILE(c)}<span><b>${n}</b><small>${h}</small></span>${fi('download', 12)}</button>`).join('')}</div>`))}

      ${section('klausur', 'Prüfen', 'Probeklausur', 'Wie in der Oberstufe: Aufgabe für Aufgabe, die Zeit läuft mit, am Ende Notenpunkte.',
        ['Material klar abgesetzt', 'Antwortfeld nur mit Umrandung', 'Zeit und Navigation in einer Leiste'],
        frame('Zellbiologie', ['Aufgabe 1 von 4', '8 BE', '45 Min'], `
          <div class="u-in u-exam"><div class="u-mat"><span class="u-k">Material M1</span><p>Würfel mit 1, 2 und 4 cm Kantenlänge: Oberfläche 6, 24 und 96 cm², Volumen 1, 8 und 64 cm³.</p></div>
            <p class="u-q">Erläutern Sie mithilfe von M1 den Zusammenhang zwischen Oberflächen-Volumen-Verhältnis und Zellgröße.</p>
            <textarea class="u-field" rows="4" placeholder="Deine Antwort …"></textarea></div>
          <div class="u-in u-foot"><span class="u-time">${fi('clock', 12)}<b class="u-timer">45:00</b></span><div class="u-acts"><button type="button" class="u-btn2" disabled>Zurück</button><button type="button" class="u-btn" data-exam>Starten</button></div></div>`))}

      ${section('menues', 'Auswählen', 'Menüs', 'Ein Menü sieht überall gleich aus: Suche oben, darunter die Einträge, Auswahl als blauer Haken.',
        ['Kein dunkler Kasten um die Suche', 'Neuer Eintrag: Name → „hinzufügen“ → Farbe', 'Nichts wird beim Antippen heller'],
        `<div class="u-props">${frame('Eigenschaften', ['Dokument'], `
          <div class="u-in u-prow"><span class="u-pl">${fi('tag', 13)}Tags</span><div class="u-pop"><button type="button" class="u-trig" data-menu="tags"><span class="u-chips"></span></button><div class="u-menu" data-m="tags" hidden><label class="u-search">${fi('search', 12)}<input placeholder="Suchen oder neu" /></label><div class="u-list"></div></div></div></div>
          <div class="u-in u-prow"><span class="u-pl">${fi('flag', 13)}Priorität</span><div class="u-pop"><button type="button" class="u-trig" data-menu="prio"><span class="u-pv"></span></button><div class="u-menu" data-m="prio" hidden><div class="u-list"></div></div></div></div>`)}</div>`)}

      ${section('eingaben', 'Grundlagen', 'Eingaben & Knöpfe', 'Blau nur für die wichtigste Aktion. Felder haben nur eine feine Umrandung.',
        ['Hauptknopf blau, Nebenknopf mit Rand', 'Umschalter mit ruhiger Fläche', 'Eingabefeld wie im Chat'],
        frame('Neue Aufgabe', ['Entwurf'], `
          <div class="u-in u-form"><input class="u-field" placeholder="Titel" value="Lernzettel Zellbiologie" />
            <div class="u-line"><div class="u-seg">${['Auto', 'Mittel', 'Hoch', 'Max'].map((t, i) => `<button type="button"${i === 0 ? ' class="on"' : ''}>${t}</button>`).join('')}</div>
            <label class="u-swl">Erinnern<button type="button" class="u-sw on" role="switch" aria-label="Erinnern"><i></i></button></label></div></div>
          <div class="u-in u-foot"><span class="u-k">Wird im Kalender eingetragen</span><div class="u-acts"><button type="button" class="u-btn2">Abbrechen</button><button type="button" class="u-btn">Erstellen</button></div></div>`))}
    </div>`;
    wire();
  }

  function wire() {
    view.querySelector('.u-nav').addEventListener('click', (e) => { const b = e.target.closest('[data-go]'); if (b) view.querySelector(`#u-${b.dataset.go}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    // Karteikarten
    let at = 0, back = false;
    const fl = view.querySelector('.u-flash');
    const drawFc = () => { const c = CARDS[at]; fl.querySelector('.u-fc-t').textContent = back ? c.back : c.front; fl.querySelector('.u-fc-k').textContent = back ? 'Rückseite' : 'Vorderseite'; fl.classList.toggle('back', back); view.querySelector('.u-fc-n').textContent = `Karte ${at + 1} von ${CARDS.length}`; };
    fl.addEventListener('click', () => { fl.animate([{ transform: 'none', opacity: 1 }, { transform: 'scale(.985)', opacity: 0, offset: .45 }, { transform: 'none', opacity: 1 }], { duration: 380, easing: 'cubic-bezier(.32,.72,0,1)' }); setTimeout(() => { back = !back; drawFc(); }, 170); });
    const go = (d) => { at = (at + d + CARDS.length) % CARDS.length; back = false; drawFc(); fl.animate([{ opacity: 0, transform: `translateX(${d * 18}px)` }, { opacity: 1, transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.16,1,.3,1)' }); };
    view.querySelectorAll('[data-fc]').forEach((b) => b.addEventListener('click', () => go(+b.dataset.fc)));
    view.querySelector('.u-rate').addEventListener('click', (e) => { const b = e.target.closest('[data-r]'); if (!b) return; fl.dataset.r = b.dataset.r; setTimeout(() => { delete fl.dataset.r; go(1); }, 420); });
    drawFc();
    // Quiz
    let pick = null, done = false;
    const qb = view.querySelector('[data-quiz]'), st = view.querySelector('#u-quiz .u-st'), why = view.querySelector('.u-why');
    const resetQuiz = () => { done = false; pick = null; view.querySelectorAll('.u-opt').forEach((o) => { o.className = 'u-opt'; }); qb.textContent = 'Bestätigen'; qb.disabled = true; why.hidden = true; st.innerHTML = '<button type="button" class="u-link" data-skip>Überspringen</button>'; };
    view.querySelector('.u-opts').addEventListener('click', (e) => { const b = e.target.closest('.u-opt'); if (!b || done) return; view.querySelectorAll('.u-opt').forEach((o) => o.classList.toggle('on', o === b)); pick = +b.dataset.o; qb.disabled = false; });
    qb.addEventListener('click', () => {
      if (done) return resetQuiz();
      done = true;
      view.querySelectorAll('.u-opt').forEach((o, k) => { const i = +o.dataset.o; o.style.transitionDelay = `${k * 40}ms`; o.classList.toggle('right', i === QUIZ.right); o.classList.toggle('wrong', i === pick && i !== QUIZ.right); o.classList.toggle('dim', i !== QUIZ.right && i !== pick); });
      const ok = pick === QUIZ.right;
      st.innerHTML = `<span class="u-verdict ${ok ? 'ok' : 'no'}">${fi(ok ? 'check-circle' : 'x-circle', 13)}${ok ? 'Richtig' : 'Leider falsch'}</span><button type="button" class="u-link" data-why>Erklärung${fi('chevron-down', 10)}</button>`;
      qb.textContent = 'Weiter';
    });
    st.addEventListener('click', (e) => { if (e.target.closest('[data-why]')) { why.hidden = !why.hidden; e.target.closest('[data-why]').classList.toggle('open', !why.hidden); } if (e.target.closest('[data-skip]')) resetQuiz(); });
    // Präsentation: drei Beispielfolien
    const SL = [
      '<div class="s-title"><span>Biologie · Klasse 10</span><b>Die Zelle</b><small>Bausteine des Lebens</small></div><div class="s-pic"></div>',
      '<div class="s-content"><b>Jede Zelle hat dieselben Grundbausteine</b><ul><li><i></i><span><strong>Zellmembran</strong> grenzt ab und regelt den Stoffaustausch</span></li><li><i></i><span><strong>Zellkern</strong> enthält die Erbinformation</span></li><li><i></i><span><strong>Mitochondrien</strong> liefern Energie</span></li></ul></div>',
      '<div class="s-stat"><b>Wie groß ist eine Zelle?</b><div><span><strong>10 µm</strong>Tierzelle</span><span><strong>50 µm</strong>Pflanzenzelle</span><span><strong>1 µm</strong>Bakterium</span></div></div>',
    ];
    let sl = 0;
    const slide = view.querySelector('.u-slide');
    const drawSl = (d = 0) => { slide.innerHTML = SL[sl]; view.querySelector('.u-sl-n').textContent = `Folie ${sl + 1} von ${SL.length}`; if (d) slide.animate([{ opacity: 0, transform: `translateX(${d * 14}px)` }, { opacity: 1, transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.16,1,.3,1)' }); };
    view.querySelectorAll('[data-sl]').forEach((b) => b.addEventListener('click', () => { const d = +b.dataset.sl; sl = (sl + d + SL.length) % SL.length; drawSl(d); }));
    drawSl();
    // Probeklausur: Zeit
    view.querySelector('[data-exam]').addEventListener('click', (e) => {
      const b = e.currentTarget, out = view.querySelector('.u-timer');
      if (timer) { clearInterval(timer); timer = null; out.textContent = '45:00'; b.textContent = 'Starten'; return; }
      let s = 45 * 60; b.textContent = 'Weiter';
      timer = setInterval(() => { if (!open) return; s = Math.max(0, s - 1); out.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }, 1000);
    });
    // Menüs: Tags (mehrfach, neu anlegen) und Priorität (einfach)
    const chosen = new Set(['Biologie', 'Klausur']); let adding = '', prio = 'Hoch';
    const tm = view.querySelector('[data-m="tags"]'), pm = view.querySelector('[data-m="prio"]'), inp = tm.querySelector('input');
    const chip = (nm) => { const c = (TAGS.find((x) => x[0] === nm) || [nm, '#a3a3a3'])[1]; return `<span class="u-tag" style="--c:${c}">${esc(nm)}</span>`; };
    const drawTags = () => {
      view.querySelector('.u-chips').innerHTML = chosen.size ? [...chosen].map(chip).join('') : '<span class="u-ph">Leer</span>';
      const list = tm.querySelector('.u-list');
      if (adding) { list.innerHTML = `<span class="u-ml">Farbe für „${esc(adding)}“</span><div class="u-colors">${['#6aa8ff', '#b49cff', '#f472b6', '#f07a6e', '#f0913a', '#facc15', '#4fcf8a', '#2dd4bf', '#a3a3a3'].map((c) => `<button type="button" style="--c:${c}" data-c="${c}" aria-label="Farbe"></button>`).join('')}</div>`; return; }
      const q = inp.value.trim(), ql = q.toLowerCase(), found = TAGS.filter(([nm]) => nm.toLowerCase().includes(ql));
      list.innerHTML = (q && !TAGS.some(([nm]) => nm.toLowerCase() === ql) ? `<button type="button" class="u-mi u-add" data-add>${fi('plus', 11)}<span><b>${esc(q)}</b> hinzufügen</span></button>` : '')
        + found.map(([nm, c]) => `<button type="button" class="u-mi${chosen.has(nm) ? ' on' : ''}" data-t="${esc(nm)}"><i style="background:${c}"></i><span>${esc(nm)}</span>${fi('check', 12)}</button>`).join('');
    };
    const drawPrio = () => {
      const c = PRIOS.find((x) => x[0] === prio)[1];
      view.querySelector('.u-pv').innerHTML = `<i style="background:${c}"></i>${prio}`;
      pm.querySelector('.u-list').innerHTML = PRIOS.map(([nm, col]) => `<button type="button" class="u-mi${nm === prio ? ' on' : ''}" data-p="${nm}"><i style="background:${col}"></i><span>${nm}</span>${fi('check', 12)}</button>`).join('');
    };
    const toggle = (m, show) => { [tm, pm].forEach((x) => { const on = x === m && show; x.hidden = !on; x.previousElementSibling.classList.toggle('open', on); }); };
    view.querySelectorAll('[data-menu]').forEach((b) => b.addEventListener('click', () => { const m = b.dataset.menu === 'tags' ? tm : pm; const show = m.hidden; toggle(m, show); if (show && m === tm) { adding = ''; inp.value = ''; drawTags(); inp.focus(); } }));
    inp.addEventListener('input', () => { adding = ''; drawTags(); });
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter' && inp.value.trim()) { adding = inp.value.trim(); drawTags(); } });
    tm.addEventListener('click', (e) => {
      const t = e.target.closest('[data-t]'); if (t) { const nm = t.dataset.t; if (chosen.has(nm)) chosen.delete(nm); else chosen.add(nm); drawTags(); return; }
      if (e.target.closest('[data-add]')) { adding = inp.value.trim(); drawTags(); return; }
      const c = e.target.closest('[data-c]'); if (c && adding) { TAGS.push([adding, c.dataset.c]); chosen.add(adding); adding = ''; inp.value = ''; drawTags(); }
    });
    pm.addEventListener('click', (e) => { const b = e.target.closest('[data-p]'); if (b) { prio = b.dataset.p; drawPrio(); toggle(pm, false); } });
    document.addEventListener('pointerdown', (e) => { if (open && !e.target.closest('.u-pop')) toggle(null, false); });
    drawTags(); drawPrio();
    // Grundlagen
    view.querySelector('.u-seg').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) view.querySelectorAll('.u-seg button').forEach((x) => x.classList.toggle('on', x === b)); });
    view.querySelector('.u-sw').addEventListener('click', (e) => e.currentTarget.classList.toggle('on'));
  }

  function show() {
    const panel = document.querySelector('.panel');
    if (panel && !view.isConnected) panel.append(view);
    if (!built) { build(); built = true; }
    open = true; view.hidden = false;
    panel?.classList.add('view-uid');
  }
  function hide() {
    if (!open) return;
    open = false; view.hidden = true;
    document.querySelector('.panel')?.classList.remove('view-uid');
  }
  return { show, hide, get open() { return open; } };
})();
window.UIDesign = UIDesign;
