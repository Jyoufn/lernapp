/* ===================================================================
   UI-Design – Vorschau eines neuen Stils (nur Ansicht, noch nicht in der App umgesetzt)
   Vorlage des Nutzers (Screenshot „Pricing“-Karte) – übernommen werden nur Größenverhältnisse, Farben und Rundungen (Schrift bleibt Inter, kein Maskottchen):
   sehr dunkler, leicht gerasterter Grund, kleine graue Beschriftung oben,
   ruhige zentrierte Überschrift, Karten als Rahmen mit Kopfzeile (Name links, kleine graue Etiketten rechts) und darin dunklere
   Innenflächen mit kleinem Abstand. Jede Karte ist spielbar: Karteikarte, Quiz, Präsentation, Probeklausur, Auswahlmenü, Eingaben.
   Öffnen über die Sidebar „UI-Design“ (app.js → VIEW_TABS.uidesign).
   =================================================================== */
const UIDesign = (() => {
  const fi = (n, s = 14) => (window.FadeIcons ? FadeIcons.svg(n, s) : '');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const view = document.createElement('section');
  view.className = 'uid-view';
  view.hidden = true;
  let open = false, built = false;

  const frame = (name, tags, body, cls = '') => `<article class="uid-card ${cls}"><header class="uid-ch"><b>${name}</b><span>${tags.map((t) => `<i>${t}</i>`).join('')}</span></header>${body}</article>`;

  const CARDS = [
    { front: 'Mitochondrium', back: 'Ort der Zellatmung – hier entsteht ATP.' },
    { front: 'Ribosom', back: 'Baut Proteine nach der Vorlage der mRNA.' },
    { front: 'Chloroplast', back: 'Ort der Fotosynthese in Pflanzenzellen.' },
  ];
  const TAGS = [['Biologie', '#4fcf8a'], ['Mathe', '#6aa8ff'], ['Deutsch', '#f0913a'], ['Klausur', '#f07a6e']];

  function build() {
    view.innerHTML = `<div class="uid-page">
      <div class="uid-intro"><span class="uid-eye">UI-Design</span><h1>Ruhig, dunkel, präzise.</h1>
        <p>Vorschau des neuen Stils nach deiner Vorlage – noch nicht in der App umgesetzt. Alles hier lässt sich anklicken.</p></div>
      <div class="uid-grid">
        ${frame('Karteikarten', ['3 Karten', 'Biologie'], `<div class="uid-in uid-fc"><div class="uid-flash" tabindex="0"><span class="uid-mono uid-fc-k">Vorderseite</span><p></p></div>
          <div class="uid-row"><button type="button" class="uid-ib" data-fc="-1" aria-label="Zurück">${fi('chevron-right', 12)}</button><span class="uid-mono uid-fc-n"></span><button type="button" class="uid-ib" data-fc="1" aria-label="Weiter">${fi('chevron-right', 12)}</button></div></div>
          <div class="uid-in uid-rate"><button type="button" data-r="0">Nicht gewusst</button><button type="button" data-r="1">Unsicher</button><button type="button" data-r="2">Gewusst</button></div>`)}
        ${frame('Quiz', ['Frage 1/1', 'Multiple Choice'], `<div class="uid-in"><p class="uid-q">Welches Organell ist das „Kraftwerk“ der Zelle?</p>
          <div class="uid-opts">${['Zellkern', 'Mitochondrium', 'Ribosom'].map((o, i) => `<button type="button" class="uid-opt" data-o="${i}"><span class="uid-k">${'ABC'[i]}</span>${o}</button>`).join('')}</div></div>
          <div class="uid-in uid-foot"><span class="uid-st uid-mono">Antwort wählen</span><button type="button" class="uid-btn" data-quiz disabled>Bestätigen</button></div>`)}
        ${frame('Präsentation', ['12 Folien', 'Klar'], `<div class="uid-in uid-slide"><span class="uid-mono">Biologie · Klasse 10</span><b>Die Zelle</b><small>Bausteine des Lebens</small></div>
          <div class="uid-in uid-outs">${[['PowerPoint', 'Bearbeitbar', '#E5673E'], ['Keynote', 'iPad & Mac', '#3D8BFF'], ['PDF', 'Zum Teilen', '#E5534B']].map(([n, h, c]) => `<button type="button" class="uid-out"><svg width="22" height="22" viewBox="0 0 30 30" aria-hidden="true"><path d="M8 3h10.5L25 9.5V25a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" fill="${c}"/><path d="M18.5 3v4.5a2 2 0 0 0 2 2H25Z" fill="#fff" fill-opacity=".35"/></svg><span><b>${n}</b><small>${h}</small></span></button>`).join('')}</div>`)}
        ${frame('Probeklausur', ['45 Min', 'Oberstufe'], `<div class="uid-in uid-exam"><span class="uid-mono">Aufgabe 1 · 8 BE</span><p>Erläutern Sie den Zusammenhang zwischen Oberflächen-Volumen-Verhältnis und Zellgröße.</p>
          <textarea placeholder="Deine Antwort …" rows="3"></textarea></div>
          <div class="uid-in uid-foot"><span class="uid-mono uid-timer">45:00</span><button type="button" class="uid-btn" data-exam>Klausur starten</button></div>`)}
        ${frame('Auswahlmenü', ['Tags', 'Suche'], `<div class="uid-in"><div class="uid-sel"><button type="button" class="uid-selb" data-sel><span class="uid-chips"></span>${fi('chevron-down', 10)}</button>
          <div class="uid-menu" hidden><input class="uid-search" placeholder="Suchen oder neu" /><div class="uid-list"></div></div></div>
          <p class="uid-hint uid-mono">Name eintippen → „hinzufügen“ → Farbe</p></div>`)}
        ${frame('Knöpfe & Eingaben', ['Basis'], `<div class="uid-in uid-basics"><div class="uid-brow"><button type="button" class="uid-btn">Erstellen</button><button type="button" class="uid-btn2">Abbrechen</button><button type="button" class="uid-ib" aria-label="Mehr">${fi('more', 13)}</button></div>
          <input class="uid-field" placeholder="Eingabefeld – nur Umrandung" />
          <div class="uid-brow"><div class="uid-seg">${['Auto', 'Mittel', 'Max'].map((t, i) => `<button type="button"${i === 0 ? ' class="on"' : ''}>${t}</button>`).join('')}</div>
          <button type="button" class="uid-sw on" role="switch" aria-label="Schalter"><i></i></button></div></div>`)}
      </div></div>`;
    wire();
  }

  function wire() {
    // Karteikarte: antippen dreht um, Pfeile blättern, Bewertung färbt kurz den Rand
    let at = 0, back = false;
    const fl = view.querySelector('.uid-flash'), n = view.querySelector('.uid-fc-n');
    const drawFc = () => { fl.querySelector('p').textContent = back ? CARDS[at].back : CARDS[at].front; fl.querySelector('.uid-fc-k').textContent = back ? 'Rückseite' : 'Vorderseite'; fl.classList.toggle('back', back); n.textContent = `${at + 1} / ${CARDS.length}`; };
    const flip = () => { back = !back; fl.animate([{ transform: 'rotateX(0)' }, { transform: 'rotateX(90deg)', offset: .5 }, { transform: 'rotateX(0)' }], { duration: 420, easing: 'cubic-bezier(.32,.72,0,1)' }); setTimeout(drawFc, 200); };
    fl.addEventListener('click', flip);
    view.querySelectorAll('[data-fc]').forEach((b) => b.addEventListener('click', () => { at = (at + +b.dataset.fc + CARDS.length) % CARDS.length; back = false; drawFc(); fl.animate([{ opacity: 0, transform: `translateX(${+b.dataset.fc * 14}px)` }, { opacity: 1, transform: 'none' }], { duration: 380, easing: 'cubic-bezier(.16,1,.3,1)' }); }));
    view.querySelector('.uid-rate').addEventListener('click', (e) => { const b = e.target.closest('[data-r]'); if (!b) return; fl.dataset.r = b.dataset.r; setTimeout(() => { delete fl.dataset.r; at = (at + 1) % CARDS.length; back = false; drawFc(); }, 450); });
    drawFc();
    // Quiz: wählen → Bestätigen → richtig/falsch
    let pick = null, done = false;
    const qb = view.querySelector('[data-quiz]'), st = view.querySelector('.uid-st');
    view.querySelector('.uid-opts').addEventListener('click', (e) => { const b = e.target.closest('.uid-opt'); if (!b || done) return; view.querySelectorAll('.uid-opt').forEach((o) => o.classList.toggle('on', o === b)); pick = +b.dataset.o; qb.disabled = false; st.textContent = 'Auswahl getroffen'; });
    qb.addEventListener('click', () => {
      if (done) { done = false; pick = null; view.querySelectorAll('.uid-opt').forEach((o) => o.className = 'uid-opt'); qb.textContent = 'Bestätigen'; qb.disabled = true; st.textContent = 'Antwort wählen'; return; }
      done = true; view.querySelectorAll('.uid-opt').forEach((o) => { const i = +o.dataset.o; o.classList.toggle('right', i === 1); o.classList.toggle('wrong', i === pick && i !== 1); o.classList.toggle('dim', i !== 1 && i !== pick); });
      st.textContent = pick === 1 ? 'Richtig' : 'Leider falsch'; st.className = `uid-st uid-mono ${pick === 1 ? 'ok' : 'no'}`; qb.textContent = 'Nochmal';
    });
    // Probeklausur: Zeit läuft
    let t = null;
    view.querySelector('[data-exam]').addEventListener('click', (e) => {
      const b = e.currentTarget, out = view.querySelector('.uid-timer');
      if (t) { clearInterval(t); t = null; out.textContent = '45:00'; b.textContent = 'Klausur starten'; return; }
      let s = 45 * 60; b.textContent = 'Abgeben';
      t = setInterval(() => { s--; out.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; if (!view.isConnected || !open) { clearInterval(t); t = null; } }, 1000);
    });
    // Auswahlmenü: Tags wählen, suchen, neu hinzufügen (erst Farbe)
    const chosen = new Set(['Biologie']); let adding = '';
    const selb = view.querySelector('[data-sel]'), menu = view.querySelector('.uid-menu'), list = view.querySelector('.uid-list'), search = view.querySelector('.uid-search');
    const drawSel = () => {
      selb.querySelector('.uid-chips').innerHTML = chosen.size ? [...chosen].map((nm) => { const c = (TAGS.find((x) => x[0] === nm) || [nm, '#a3a3a3'])[1]; return `<span class="uid-tag" style="--c:${c}">${esc(nm)}</span>`; }).join('') : '<span class="uid-ph">Tags wählen</span>';
      if (adding) { list.innerHTML = `<span class="uid-mono uid-lab">Farbe für ${esc(adding)}</span><div class="uid-colors">${['#6aa8ff', '#b49cff', '#f472b6', '#f07a6e', '#f0913a', '#facc15', '#4fcf8a', '#2dd4bf', '#a3a3a3'].map((c) => `<button type="button" style="--c:${c}" data-c="${c}" aria-label="Farbe"></button>`).join('')}</div>`; return; }
      const q = search.value.trim(), ql = q.toLowerCase(), found = TAGS.filter(([nm]) => nm.toLowerCase().includes(ql));
      list.innerHTML = (q && !TAGS.some(([nm]) => nm.toLowerCase() === ql) ? `<button type="button" class="uid-mi uid-add" data-add>${fi('plus', 11)}<b>${esc(q)}</b> hinzufügen</button>` : '')
        + found.map(([nm, c]) => `<button type="button" class="uid-mi${chosen.has(nm) ? ' on' : ''}" data-t="${esc(nm)}"><i style="background:${c}"></i><span>${esc(nm)}</span>${fi('check', 12)}</button>`).join('');
    };
    selb.addEventListener('click', () => { menu.hidden = !menu.hidden; selb.classList.toggle('open', !menu.hidden); if (!menu.hidden) { adding = ''; search.value = ''; drawSel(); search.focus(); } });
    search.addEventListener('input', () => { adding = ''; drawSel(); });
    list.addEventListener('click', (e) => {
      const tb = e.target.closest('[data-t]'); if (tb) { const nm = tb.dataset.t; if (chosen.has(nm)) chosen.delete(nm); else chosen.add(nm); drawSel(); return; }
      if (e.target.closest('[data-add]')) { adding = search.value.trim(); drawSel(); return; }
      const cb = e.target.closest('[data-c]'); if (cb && adding) { TAGS.push([adding, cb.dataset.c]); chosen.add(adding); adding = ''; search.value = ''; drawSel(); }
    });
    document.addEventListener('pointerdown', (e) => { if (!menu.hidden && !e.target.closest('.uid-sel')) { menu.hidden = true; selb.classList.remove('open'); } });
    drawSel();
    // Basis: Umschalter und Schalter
    view.querySelector('.uid-seg').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) view.querySelectorAll('.uid-seg button').forEach((x) => x.classList.toggle('on', x === b)); });
    view.querySelector('.uid-sw').addEventListener('click', (e) => e.currentTarget.classList.toggle('on'));
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
