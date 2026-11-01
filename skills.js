/* ===================================================================
   Skills im Chat-Eingabefeld
   - „/“ öffnet nach oben eine Liste aller Skills („/name  Beschreibung“), Tippen filtert, ↑/↓ + Enter/Tab oder Antippen wählt
   - Skills werden auch automatisch erkannt: ein starkes Stichwort („Präsentation“, „Karteikarten“) reicht, sonst zwei passende
     Wörter aus dem Umfeld („Design“ + „Farben“). Erkannte Wörter und „/skill“ werden farbig hinterlegt (getönte Fläche, getönte Schrift).
   - Beim Senden gehen die aktiven Skills als `skills: [id]` an den Server (lib/skills.js hängt die Spezial-Anweisungen an).
   Browser und Node (Tests) nutzen dieselbe Liste und dieselbe Erkennung.
   =================================================================== */
const Skills = (() => {
  const SKILLS = [
    { id: 'praesentation', name: 'praesentation', title: 'Präsentation', desc: 'Folien mit Bildern und Quellen – als PowerPoint, Keynote oder PDF', c: '#f0913a',
      strong: ['präsentation', 'praesentation', 'powerpoint', 'keynote', 'foliensatz', 'folien'], weak: ['vortrag', 'referat', 'slides', 'vortragen'] },
    { id: 'infografik', name: 'infografik', title: 'Infografik', desc: 'Zahlen als Diagramme mit kurzer Einordnung', c: '#6aa8ff',
      strong: ['infografik', 'diagramm', 'schaubild', 'statistik'], weak: ['zahlen', 'entwicklung', 'prozent', 'anteil', 'vergleich', 'daten'] },
    { id: 'karteikarten', name: 'karteikarten', title: 'Karteikarten', desc: 'Lernkarten zum Umdrehen und Selbst-Bewerten', c: '#2dd4bf',
      strong: ['karteikarte', 'lernkarte', 'flashcard'], weak: ['vokabeln', 'auswendig', 'begriffe lernen', 'abfragen'] },
    { id: 'quiz', name: 'quiz', title: 'Quiz', desc: 'Fragen mit Auswertung und Erklärungen', c: '#b49cff',
      strong: ['quiz', 'testfragen', 'übungsfragen', 'frag mich ab', 'teste mich'], weak: ['multiple choice', 'wissen testen', 'übungsaufgaben', 'abfragen'] },
    { id: 'probeklausur', name: 'probeklausur', title: 'Probeklausur', desc: 'Klausur mit Zeit, strenger Korrektur und Notenpunkten', c: '#f07a6e',
      strong: ['probeklausur', 'übungsklausur', 'klassenarbeit', 'probetest', 'probeprüfung'], weak: ['klausur', 'prüfung', 'abitur', 'notenpunkte', 'test'] },
    { id: 'mindmap', name: 'mindmap', title: 'Mindmap', desc: 'Thema als Baum mit Ästen und Stichworten', c: '#4fcf8a',
      strong: ['mindmap', 'mind map', 'mind-map', 'gedankenkarte'], weak: ['überblick', 'zusammenhänge', 'struktur', 'äste'] },
    { id: 'zeitstrahl', name: 'zeitstrahl', title: 'Zeitstrahl', desc: 'Ereignisse in zeitlicher Reihenfolge', c: '#facc15',
      strong: ['zeitstrahl', 'zeitleiste', 'chronologie', 'timeline'], weak: ['geschichte', 'epoche', 'jahrhundert', 'ereignisse', 'jahreszahlen', 'verlauf'] },
    { id: 'bild', name: 'bild', title: 'Bild erstellen', desc: 'Illustration genau nach deiner Beschreibung', c: '#f472b6',
      strong: ['bild erstellen', 'erstelle ein bild', 'erstell ein bild', 'erzeuge ein bild', 'zeichne', 'illustration', 'male mir'], weak: ['bild', 'abbildung', 'skizze', 'zeichnung', 'grafik', 'beschriftet'] },
    { id: 'designer', name: 'designer', title: 'Designer-Modus', desc: 'Gestaltung auf Profi-Niveau: Layout, Farben, Typografie, UI', c: '#a78bfa',
      strong: ['designer', 'webdesign', 'ui-design', 'ui design', 'ux', 'logo', 'poster', 'flyer', 'layout', 'mockup'], weak: ['design', 'farben', 'farbpalette', 'gestaltung', 'schriftart', 'ästhetisch', 'modern', 'abstände'] },
    { id: 'humanizer', name: 'humanizer', title: 'Humanizer', desc: 'Text klingt natürlich und menschlich – nicht nach KI', c: '#34d399',
      strong: ['humanizer', 'humanize', 'vermenschlich', 'menschlicher', 'natürlicher klingen', 'nicht nach ki'], weak: ['umschreiben', 'umformulieren', 'natürlich', 'klingt', 'ki-text', 'menschlich', 'flüssiger'] },
    { id: 'lernzettel', name: 'lernzettel', title: 'Lernzettel', desc: 'Kompakte Zusammenfassung mit allem Klausurrelevanten', c: '#60a5fa',
      strong: ['lernzettel', 'spickzettel', 'zusammenfassung'], weak: ['zusammenfassen', 'wichtigste', 'kompakt', 'klausurrelevant', 'stichpunkte'] },
    { id: 'hefteintrag', name: 'hefteintrag', title: 'Hefteintrag', desc: 'Lösung sauber so, wie sie ins Heft gehört', c: '#a3a3a3',
      strong: ['hefteintrag', 'ins heft', 'fürs heft'], weak: ['abschreiben', 'tafelbild', 'heft'] },
    { id: 'recherche', name: 'recherche', title: 'Recherche', desc: 'Gründlich mit mehreren Fachquellen und Belegen', c: '#22d3ee',
      strong: ['recherchiere', 'recherche', 'recherchier'], weak: ['quellen', 'studien', 'belege', 'aktuell', 'nachforschen', 'fakten'] },
  ];
  const byId = Object.fromEntries(SKILLS.map((s) => [s.id, s]));
  const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Wortanfang/-ende auch mit Umlauten; Stichwort = Wortanfang (Endungen erlaubt: „Präsentationen“, „Diagramme“)
  const wordRe = (w) => new RegExp(`(?<![\\p{L}\\p{N}])${reEsc(w).replace(/\s+/g, '\\s+')}\\p{L}*`, 'giu');
  const COMPILED = SKILLS.map((s) => ({ s, explicit: new RegExp(`(?<![\\p{L}\\p{N}/])/${s.name}(?![\\p{L}\\p{N}])`, 'giu'), strong: s.strong.map(wordRe), weak: s.weak.map(wordRe) }));
  const hits = (res, text) => res.flatMap((re) => [...text.matchAll(re)].map((m) => ({ a: m.index, b: m.index + m[0].length, w: m[0].toLowerCase() })));

  /* Erkennung: [{ id, ranges: [[a, b]], explicit }] – explizit „/skill“, ein starkes Stichwort oder zwei verschiedene schwache */
  function detect(text) {
    const t = String(text || '');
    const out = [];
    for (const { s, explicit, strong, weak } of COMPILED) {
      const ex = hits([explicit], t), st = hits(strong, t), wk = hits(weak, t);
      const weakOk = new Set(wk.map((h) => h.w)).size >= 2;
      if (!ex.length && !st.length && !weakOk) continue;
      out.push({ id: s.id, explicit: ex.length > 0, ranges: [...ex, ...st, ...(weakOk ? wk : [])].map((h) => [h.a, h.b]) });
    }
    return out;
  }
  const active = (text) => detect(text).map((d) => d.id);
  const list = (q = '') => { const k = String(q).toLowerCase(); return SKILLS.filter((s) => !k || s.name.startsWith(k) || s.title.toLowerCase().includes(k) || s.desc.toLowerCase().includes(k)); };

  /* ---------- Eingabefeld (nur im Browser) ---------- */
  function attach(input, host) {
    if (!input || !host || input._skills) return;
    input._skills = true;
    const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    // farbige Markierung: Spiegel hinter dem Textfeld (gleiche Schrift, gleiche Umbrüche), Textfeld-Schrift dann transparent
    const mirror = document.createElement('div');
    mirror.className = 'sk-mirror'; mirror.setAttribute('aria-hidden', 'true');
    input.before(mirror);
    const place = () => {
      const cs = getComputedStyle(input);
      Object.assign(mirror.style, { left: `${input.offsetLeft}px`, top: `${input.offsetTop}px`, width: `${input.clientWidth}px`, height: `${input.clientHeight}px`,
        paddingTop: cs.paddingTop, paddingRight: cs.paddingRight, paddingBottom: cs.paddingBottom, paddingLeft: cs.paddingLeft, font: cs.font, lineHeight: cs.lineHeight, letterSpacing: cs.letterSpacing });
      mirror.scrollTop = input.scrollTop;
    };
    const paint = () => {
      const text = input.value, found = detect(text);
      const ranges = found.flatMap((d) => d.ranges.map(([a, b]) => ({ a, b, c: byId[d.id].c }))).sort((x, y) => x.a - y.a || y.b - x.b);
      const keep = []; let end = -1;
      for (const r of ranges) if (r.a >= end) { keep.push(r); end = r.b; }
      input.classList.toggle('sk-on', keep.length > 0);
      mirror.hidden = !keep.length;
      if (!keep.length) return;
      let html = '', at = 0;
      for (const r of keep) { html += esc(text.slice(at, r.a)) + `<mark style="--c:${r.c}">${esc(text.slice(r.a, r.b))}</mark>`; at = r.b; }
      mirror.innerHTML = `${html}${esc(text.slice(at))}​`;
      place();
    };
    // Liste nach oben: „/“ am Anfang oder nach einem Leerzeichen
    const pop = document.createElement('div');
    pop.className = 'sk-pop'; pop.hidden = true; pop.setAttribute('role', 'listbox'); pop.setAttribute('aria-label', 'Skills');
    host.append(pop);
    let items = [], sel = 0, slash = null;
    const query = () => { const before = input.value.slice(0, input.selectionStart); const m = /(^|\s)\/([\p{L}\p{N}-]{0,24})$/u.exec(before); return m ? { q: m[2], start: before.length - m[2].length - 1 } : null; };
    const close = () => { pop.hidden = true; slash = null; };
    const draw = () => {
      pop.innerHTML = items.map((s, i) => `<button type="button" class="sk-row${i === sel ? ' on' : ''}" data-i="${i}" role="option"><b style="--c:${s.c}">/${s.name}</b><span>${esc(s.desc)}</span></button>`).join('');
      pop.querySelector('.on')?.scrollIntoView({ block: 'nearest' });
    };
    const update = () => {
      slash = query();
      items = slash ? list(slash.q) : [];
      if (!items.length) return close();
      sel = Math.min(sel, items.length - 1);
      const opening = pop.hidden;
      pop.hidden = false; draw();
      if (opening && !matchMedia('(prefers-reduced-motion: reduce)').matches) pop.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: 'cubic-bezier(.16,1,.3,1)' });
    };
    const choose = (i) => {
      const s = items[i]; if (!s || !slash) return;
      const end = input.selectionStart, ins = `/${s.name} `;
      input.value = input.value.slice(0, slash.start) + ins + input.value.slice(end);
      const pos = slash.start + ins.length; input.setSelectionRange(pos, pos);
      close(); input.focus();
      input.dispatchEvent(new Event('input', { bubbles: true }));
    };
    input.addEventListener('input', () => { sel = 0; update(); paint(); });
    input.addEventListener('click', update);
    input.addEventListener('scroll', () => { mirror.scrollTop = input.scrollTop; });
    input.addEventListener('blur', () => setTimeout(() => { if (!pop.matches(':hover')) close(); }, 150));
    // vor dem Abschicken mit Enter: Liste hat Vorrang
    input.addEventListener('keydown', (e) => {
      if (pop.hidden) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); e.stopImmediatePropagation(); sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length; draw(); }
      else if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Tab') { e.preventDefault(); e.stopImmediatePropagation(); choose(sel); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(); }
    }, true);
    pop.addEventListener('pointerdown', (e) => e.preventDefault()); // Fokus bleibt im Feld
    pop.addEventListener('click', (e) => { const b = e.target.closest('[data-i]'); if (b) choose(+b.dataset.i); });
    new ResizeObserver(() => { if (!mirror.hidden) place(); }).observe(input);
    // Wert wird auch von außen gesetzt (Abschicken leert das Feld, Diktat) → regelmäßig abgleichen
    let last = '';
    setInterval(() => { if (input.value !== last) { last = input.value; paint(); if (!input.value) close(); } }, 250);
    paint();
  }

  return { SKILLS, detect, active, list, attach };
})();
if (typeof window !== 'undefined') {
  window.Skills = Skills;
  const init = () => Skills.attach(document.getElementById('input'), document.getElementById('composer'));
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
}
if (typeof module !== 'undefined') module.exports = Skills;
