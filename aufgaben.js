/* ===================================================================
   Aufgaben (Englisch „To-dos“) – 18.11. spät: als Board mit vier Reitern
   Offen · In Arbeit · Erledigt · Archiviert. Jede Aufgabe lässt sich öffnen (Titel, Notiz, Datum, Status) und bekommt dort auf Wunsch ein
   Cover wie ein Dokument (Vorlagen, Farben, eigenes Bild, KI – Docs.editor.pickCover); Kalendertermine ebenso.
   - Gespeichert im Browser (localStorage „tasks.items.v1“) – auth.js gleicht das mit dem Konto ab
     (alle Geräte, Homescreen-Widgets über /api/widget).
   - Verschieben: Haken = erledigt, ▶ = in Arbeit, Archiv-Symbol = archivieren, oder die Zeile auf einen Reiter ziehen.
     Die Zeile gleitet zum Reiter, dessen Zahl springt kurz auf.
   =================================================================== */

const Aufgaben = (() => {
  const KEY = 'tasks.items.v1';
  const TABS = [['open', 'Offen'], ['doing', 'In Arbeit'], ['done', 'Erledigt'], ['archived', 'Archiviert']];
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const icon = (id, s = 14) => `<svg width="${s}" height="${s}" aria-hidden="true"><use href="#${id}"/></svg>`;
  const coverBg = (c) => (!c ? '' : typeof c === 'string' ? `center / cover no-repeat url("${c.replace(/"/g, '%22')}")` : window.Docs?.editor?.coverCss?.(c) || '');
  // 19.11.: eigene Kategorien (weitere Spalten mit eigenem Icon) – gespeichert in „tasks.cats.v1“ (wird mit dem Konto abgeglichen)
  const CKEY = 'tasks.cats.v1';
  let cats = (() => { try { const a = JSON.parse(localStorage.getItem(CKEY)); return Array.isArray(a) ? a.filter((c) => c && c.id && c.name) : []; } catch { return []; } })();
  const saveCats = () => { try { localStorage.setItem(CKEY, JSON.stringify(cats)); } catch {} };
  // 20.11.: Reihenfolge der Spalten frei wählbar (Seite „Reihenfolge“ im Spalten-Fenster) – „tasks.colorder.v1“
  const OKEY = 'tasks.colorder.v1';
  const colOrder = () => { try { const a = JSON.parse(localStorage.getItem(OKEY)); return Array.isArray(a) ? a : []; } catch { return []; } };
  const cols = () => { const all = [...TABS, ...cats.map((c) => [c.id, c.name])], o = colOrder(); const pos = (k) => { const i = o.indexOf(k); return i < 0 ? 1e3 + all.findIndex(([x]) => x === k) : i; }; return all.sort((a, b) => pos(a[0]) - pos(b[0])); };
  // 20.11.: Icon/Farbe auch für Offen, In Arbeit, Erledigt, Archiviert („⋯“ im Spaltenkopf) – gespeichert in „tasks.colprefs.v1“
  const PKEY = 'tasks.colprefs.v1', BASE_IC = { open: 'st-open', doing: 'st-doing', done: 'st-done', archived: 'st-arch' };
  let colPrefs = (() => { try { return JSON.parse(localStorage.getItem(PKEY)) || {}; } catch { return {}; } })();
  const savePrefs = () => { try { localStorage.setItem(PKEY, JSON.stringify(colPrefs)); } catch {} };
  const colInfo = (k) => { const c = cats.find((x) => x.id === k); if (c) return { id: k, name: c.name, icon: c.icon, color: c.color || '', custom: true, ref: c }; const n = TABS.find(([x]) => x === k)?.[1] || k; return { id: k, name: n, icon: colPrefs[k]?.icon || BASE_IC[k], color: colPrefs[k]?.color || '', custom: false }; };
  const known = (st) => TABS.some(([k]) => k === st) || cats.some((c) => c.id === st);
  const statusOf = (t) => { const st = t.status || (t.done ? 'done' : 'open'); return known(st) ? st : 'open'; }; // ältere Einträge kannten nur done: true/false; gelöschte Kategorie → Offen
  const load = () => { try { const a = JSON.parse(localStorage.getItem(KEY)); return Array.isArray(a) ? a.map((t) => ({ ...t, status: statusOf(t) })) : []; } catch { return []; } };
  let items = load();
  const save = () => {
    items.forEach((t) => { t.done = t.status === 'done' || t.status === 'archived'; }); // Widgets/ältere Stände lesen weiter „done“
    try { localStorage.setItem(KEY, JSON.stringify(items)); } catch {}
    window.dispatchEvent(new CustomEvent('tasks-changed'));
  };
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const today = () => iso(new Date());
  // kurz wie in der Vorlage: „7. Okt.“ (Englisch: „Oct 7“)
  const shortDay = (s) => new Date(`${s}T12:00:00`).toLocaleDateString(window.I18n?.lang?.() === 'en' ? 'en-US' : 'de-DE', { day: 'numeric', month: 'short' });
  const dayLabel = (s) => {
    if (!s) return '';
    const tm = new Date(); tm.setDate(tm.getDate() + 1);
    if (s === today()) return 'Heute';
    if (s === iso(tm)) return 'Morgen';
    return new Date(`${s}T12:00:00`).toLocaleDateString(window.I18n?.lang?.() === 'en' ? 'en-GB' : 'de-DE', { day: 'numeric', month: 'short' });
  };

  /* 18.11. (Vorlage „Kanban card drag“): Board mit vier Spalten nebeneinander – Kopf mit Status-Symbol, Name, Anzahl;
     Karten mit Cover oben, Titel, Notiz-Hinweis und Datum. Nur zum Anzeigen/Ordnen (keine KI-Aktionen).
     Ziehen mit Zeiger (Maus und Finger): Karte hebt sich leicht schräg ab, in der Zielspalte öffnet sich eine Lücke,
     die anderen Karten gleiten weich zur Seite; Loslassen setzt die Karte in die Lücke. Antippen öffnet das Detailfenster. */
  const view = document.createElement('section');
  view.className = 'tk-view au-view';
  view.hidden = true;
  view.setAttribute('aria-label', 'Aufgaben');
  const main = document.createElement('div');
  main.className = 'au-main';
  const SI = { open: icon('f-st-open', 14), doing: icon('f-st-doing', 14), done: icon('f-st-done', 14), archived: icon('f-st-arch', 14) }; // grau, runde Linien
  main.innerHTML = `<header class="au-head"><h1 class="au-title">Aufgaben</h1>
      <label class="au-search">${icon('f-search', 14)}<input type="search" placeholder="Aufgaben durchsuchen" aria-label="Aufgaben durchsuchen" autocomplete="off" /><button type="button" class="lb2-filter au-fbtn" data-au="filter" aria-label="Filter" title="Filter">${icon('f-filter', 14)}</button></label><span class="grow"></span>
      <button type="button" class="lb2-filter au-sbtn" data-au="sort" aria-label="Sortieren" title="Sortieren"><svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 13V3M2.5 5.5 5 3l2.5 2.5"/><path d="M11 3v10M8.5 10.5 11 13l2.5-2.5"/></svg></button>
      <button type="button" class="lb2-filter au-sbtn au-catbtn" data-au="cat" aria-label="Neue Kategorie" title="Neue Kategorie"><svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="2.5" width="4.5" height="11" rx="1.5"/><path d="M9.5 2.5h3a1.5 1.5 0 0 1 1.5 1.5v2.5M11.75 10v4M9.75 12h4"/></svg></button>
      <button class="cal-new" type="button" data-au="new" aria-label="Neue Aufgabe">${icon('f-plus')}<span>Neue Aufgabe</span></button></header>
    <div class="au-board"></div>`;
  view.append(main);
  const board = main.querySelector('.au-board');
  // 20.11.: nach dem Seitwärts-Scrollen immer genau an einer Spalte einrasten (Safari blieb mit CSS-Einrasten manchmal halb stehen → Streifen am linken Rand)
  { let tm = 0, busy = false;
    const settle = () => {
      if (document.body.classList.contains('au-dragging') || document.documentElement.classList.contains('is-ipad')) return;
      const cs = [...board.querySelectorAll(':scope > .au-col')]; if (cs.length < 2) return;
      const max = board.scrollWidth - board.clientWidth; if (max <= 0) return;
      const x0 = board.getBoundingClientRect().left - board.scrollLeft;
      const stops = cs.map((c) => Math.min(max, Math.round(c.getBoundingClientRect().left - x0))).concat(max);
      const sl = board.scrollLeft, best = stops.reduce((a, b) => (Math.abs(b - sl) < Math.abs(a - sl) ? b : a));
      if (Math.abs(best - sl) > 1) { busy = true; board.scrollTo({ left: best, behavior: 'smooth' }); setTimeout(() => { busy = false; }, 450); }
    };
    board.addEventListener('scroll', () => { if (busy) return; clearTimeout(tm); tm = setTimeout(settle, 140); }, { passive: true });
  }
  function buildBoard() {
    board.innerHTML = cols().map(([k, n]) => { const c = cats.find((x) => x.id === k);
      const ci = colInfo(k);
      return `<section class="au-col${c ? ' au-ccat' : ''}" data-col="${esc(k)}"><div class="au-ch"><span class="au-si"${ci.color ? ` style="color:${esc(ci.color)}"` : ''}>${icon(`f-${ci.icon}`, 14)}</span><span class="au-cn">${esc(n)}</span><span class="au-n" data-n="${esc(k)}"></span><button type="button" class="au-cmore" data-colmenu="${esc(k)}" aria-label="Spalte einstellen" title="Einstellungen">${icon('f-more', 14)}</button></div><div class="au-cards" data-cards="${esc(k)}"></div></section>`; }).join('');
    board.style.setProperty('--au-cols', cols().length);
    board.classList.toggle('au-many', cols().length > 4);
  }
  buildBoard();
  main.querySelector('.au-search input').addEventListener('input', (e) => { query = e.target.value.trim().toLowerCase(); render(); });
  const reduced = () => false; // 19.11.: Ziehen zeigt seine Bewegung immer (auf dem iPad mit „Bewegung reduzieren“ war sie sonst weg)

  function card(t) {
    const st = statusOf(t), over = (st === 'open' || st === 'doing') && t.due && t.due < today(), bg = coverBg(t.cover);
    return `<article class="au-card2 st-${st}${bg ? ' has-cov' : ''}" data-id="${esc(t.id)}" tabindex="0">
      ${bg ? `<div class="au-ccov" style="background:${esc(bg)}"></div>` : ''}
      ${(() => { // 19.11. (Vorlage): oben rechts die Priorität (Symbol + Name), dann der Titel, darunter die Tags, unten links Datum und Uhrzeit
        const pr = t.priority && t.priority !== 'none' ? (window.UIKit?.PRIOS || []).find((p) => p.id === t.priority) : null;
        const tg = (window.TagMenu?.all?.() || []).filter((g) => (t.tags || []).includes(g.id));
        const top = pr ? `<div class="au-ctop"><span class="au-cprio p-${esc(pr.id)}">${window.UIKit.prioIcon(pr.id, 12)}<span>${esc(pr.name)}</span></span></div>` : '';
        const tags = tg.length ? `<div class="au-ctags">${tg.slice(0, 3).map((g) => `<span class="lb2-tag" style="--c:${esc(g.c)}"><span>${esc(g.name)}</span></span>`).join('')}${tg.length > 3 ? `<span class="lb2-tag more">+${tg.length - 3}</span>` : ''}</div>` : '';
        const foot = t.due || t.time ? `<div class="au-cm${over ? ' over' : ''}">${t.due ? `<span class="au-cdue">${icon('o-calendar', 13)}${esc(shortDay(t.due))}</span>` : ''}${t.time ? `<span class="au-ctime">${icon('f-clock', 13)}${esc(t.time)} Uhr${t.end ? ` – ${esc(t.end)} Uhr` : ''}</span>` : ''}</div>` : '';
        return `<div class="au-cb"><div class="au-ctr"><span class="au-ct">${esc(t.title)}</span>${top}</div>${tags}${foot}</div></article>`; // Priorität in derselben Zeile rechts neben dem Titel
      })()}`;
  }
  function counts() {
    cols().forEach(([k]) => { const n = items.filter((t) => statusOf(t) === k).length; const el = main.querySelector(`[data-n="${k}"]`); if (el) el.textContent = String(n); });
  }
  // Suche oben in der Mitte: Titel, Notiz und Tag-Namen
  let query = '';
  /* 19.11.: Filter (wie bei Home: Menü .lb2-menu mit Haken) und Sortierung je Spalte – gemerkt im Browser */
  const VKEY = 'tasks.view.v1';
  const vs = (() => { try { const o = JSON.parse(localStorage.getItem(VKEY)) || {}; return { sort: o.sort || 'manual', due: o.due || 'any', prio: new Set(o.prio || []), tags: new Set(o.tags || []) }; } catch { return { sort: 'manual', due: 'any', prio: new Set(), tags: new Set() }; } })();
  const saveVs = () => { try { localStorage.setItem(VKEY, JSON.stringify({ sort: vs.sort, due: vs.due, prio: [...vs.prio], tags: [...vs.tags] })); } catch {} };
  const filtered = () => vs.due !== 'any' || vs.prio.size > 0 || vs.tags.size > 0;
  const weekEnd = () => { const d = new Date(); d.setDate(d.getDate() + 7); return iso(d); };
  const passFilter = (t) => {
    const td = today();
    if (vs.due === 'over' && !(t.due && t.due < td)) return false;
    if (vs.due === 'today' && !(t.due && t.due <= td)) return false;
    if (vs.due === 'week' && !(t.due && t.due <= weekEnd())) return false;
    if (vs.due === 'none' && t.due) return false;
    if (vs.prio.size && !vs.prio.has(t.priority || 'none')) return false;
    if (vs.tags.size && !(t.tags || []).some((id) => vs.tags.has(id))) return false;
    return true;
  };
  const PRANK = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 };
  const tagName = (t) => { const all = window.TagMenu?.all?.() || []; const n = (t.tags || []).map((id) => all.find((g) => g.id === id)?.name).filter(Boolean).sort((a, b) => a.localeCompare(b, 'de')); return n[0] || ''; };
  const dueKey = (t) => (t.due ? `${t.due} ${t.time || '99:99'}` : '9999');
  function sorted(list) {
    const by = {
      due: (a, b) => dueKey(a).localeCompare(dueKey(b)) || (PRANK[a.priority || 'none'] - PRANK[b.priority || 'none']), // was am nächsten fällig ist, oben
      prio: (a, b) => (PRANK[a.priority || 'none'] - PRANK[b.priority || 'none']) || dueKey(a).localeCompare(dueKey(b)),
      tags: (a, b) => { const x = tagName(a), y = tagName(b); return (!x - !y) || x.localeCompare(y, 'de') || dueKey(a).localeCompare(dueKey(b)); }, // ohne Tag ans Ende
      late: (a, b) => (!a.due - !b.due) || dueKey(b).localeCompare(dueKey(a)) || (PRANK[a.priority || 'none'] - PRANK[b.priority || 'none']), // am spätesten fällig oben, ohne Datum ans Ende
      title: (a, b) => a.title.localeCompare(b.title, 'de'),
      created: (a, b) => (b.created || 0) - (a.created || 0),
    }[vs.sort];
    return by ? list.slice().sort(by) : list;
  }
  const amenu = document.createElement('div'); amenu.className = 'chat-pop chat-menu au-menu open'; amenu.hidden = true; amenu.setAttribute('role', 'menu');
  document.body.append(amenu);
  let amenuFor = null;
  const closeAMenu = () => { amenu.hidden = true; amenuFor?.classList.remove('on'); amenuFor = null; };
  const mi = (v, label, on, ic = '', cls = '') => `<button type="button" role="menuitem" class="au-mi${cls}" data-v="${esc(v)}">${ic}<span>${esc(label)}</span>${on ? `<i class="au-tick">${icon('f-check', 13)}</i>` : ''}</button>`;
  const mic = (n) => icon(`f-${n}`, 14);
  const SEP = '<div class="cm-sep" role="separator"></div>';
  function openAMenu(btn, html, onPick) {
    if (amenuFor === btn) { closeAMenu(); return; }
    closeAMenu(); amenuFor = btn; btn.classList.add('on');
    amenu.innerHTML = html(); amenu.style.maxHeight = ''; amenu.hidden = false;
    const r = btn.getBoundingClientRect(), w = amenu.offsetWidth, h = amenu.offsetHeight, room = Math.max(160, innerHeight - r.bottom - 14);
    amenu.style.maxHeight = `${Math.min(h, room, 340)}px`;
    const nb = main.querySelector('.au-head .cal-new')?.getBoundingClientRect(); amenu.style.left = `${Math.max(8, Math.min(innerWidth - w - 8, btn.matches('.au-sbtn') && nb ? nb.right - w : r.right - w - 6))}px`; // Sortieren: rechtsbündig mit „Neue Aufgabe“ // Sortieren öffnet nach rechts (unter „Neue Aufgabe“)
    amenu.style.top = `${r.bottom + 6}px`;
    amenu.onclick = (e) => { const b = e.target.closest('[data-v]'); if (!b) return; e.stopPropagation(); onPick(b.dataset.v); const st = amenu.scrollTop; amenu.innerHTML = html(); amenu.scrollTop = st; };
  }
  document.addEventListener('pointerdown', (e) => { if (!amenu.hidden && !amenu.contains(e.target) && !e.target.closest('.au-fbtn, .au-sbtn')) closeAMenu(); });
  const syncHead = () => { main.querySelector('.au-fbtn')?.classList.toggle('set', filtered()); main.querySelector('.au-sbtn')?.classList.toggle('set', vs.sort !== 'manual'); };
  main.addEventListener('click', (e) => {
    const fb = e.target.closest('[data-au="filter"]');
    if (fb) {
      const DUE = [['any', 'Jederzeit', 'clock'], ['over', 'Überfällig', 'alert'], ['today', 'Heute fällig', 'sun'], ['week', 'In den nächsten 7 Tagen', 'calendar'], ['none', 'Ohne Datum', 'minus']];
      const prios = window.UIKit?.PRIOS || [];
      openAMenu(fb, () => {
        const tags = window.TagMenu?.all?.() || [];
        return DUE.map(([v, l, ic]) => mi(`d:${v}`, l, vs.due === v, mic(ic))).join('')
          + (prios.length ? SEP + prios.map((p) => mi(`p:${p.id}`, p.name, vs.prio.has(p.id), window.UIKit.prioIcon(p.id, 14))).join('') : '')
          + (tags.length ? SEP + tags.map((g) => mi(`g:${g.id}`, g.name, vs.tags.has(g.id), `<span class="au-mdot"><i style="background:${esc(g.c)}"></i></span>`)).join('') : '')
          + (filtered() ? SEP + mi('reset', 'Filter zurücksetzen', false, mic('x')) : '');
      }, (v) => {
        if (v.startsWith('d:')) vs.due = v.slice(2);
        else if (v.startsWith('p:')) { const id = v.slice(2); vs.prio.has(id) ? vs.prio.delete(id) : vs.prio.add(id); }
        else if (v.startsWith('g:')) { const id = v.slice(2); vs.tags.has(id) ? vs.tags.delete(id) : vs.tags.add(id); }
        else if (v === 'reset') { vs.due = 'any'; vs.prio.clear(); vs.tags.clear(); }
        saveVs(); syncHead(); render();
      });
      return;
    }
    const sb = e.target.closest('[data-au="sort"]');
    if (sb) {
      const SORTS = [['manual', 'Eigene Reihenfolge', 'grip'], ['due', 'Früheste zuerst', 'clock'], ['late', 'Späteste zuerst', 'clock'], ['prio', 'Priorität', 'flag'], ['tags', 'Tags', 'tag'], ['title', 'Titel (A–Z)', 'align-left'], ['created', 'Zuletzt erstellt', 'plus']];
      openAMenu(sb, () => SORTS.map(([v, l, ic]) => mi(v, l, vs.sort === v, mic(ic))).join(''), (v) => { vs.sort = v; saveVs(); syncHead(); render(); });
    }
  });
  /* Neue Kategorie / Kategorie bearbeiten: Fenster mittig (wie „Neue Aufgabe“) – Name + Icon im Linien-Stil */
  // 20.11.: ausgewählte Linien-Icons im einheitlichen Stil (ohne Ordner, Musik, Blitz, Doppel-Sterne, Auto …); dazu die Status-Symbole
  const CAT_ICONS = ['st-open', 'st-doing', 'st-done', 'st-arch', 'check-circle', 'star', 'heart', 'flag', 'target', 'bookmark', 'pin', 'tag', 'book', 'book-open', 'cap', 'bulb', 'file', 'filedoc', 'clipboard', 'list', 'quote', 'slides', 'calendar', 'clock', 'timer', 'bell', 'alert', 'chat', 'people', 'user', 'chart', 'analytics', 'trend', 'mindmap', 'palette', 'mic', 'camera', 'video', 'image', 'globe', 'map-pin', 'terminal', 'gamepad', 'dumbbell', 'medical', 'coffee', 'food', 'gift', 'leaf', 'sun', 'moon', 'briefcase', 'archive'];
  // eigene Farben bleiben gespeichert (mit dem Konto abgeglichen) und stehen beim nächsten Mal wieder in der Liste
  const MYC = 'tasks.mycolors.v1';
  const myCols = () => { try { const a = JSON.parse(localStorage.getItem(MYC)); return Array.isArray(a) ? a.filter((c) => /^#[\da-f]{6}$/i.test(c)) : []; } catch { return []; } };
  const addMyCol = (hex) => { const l = myCols().filter((c) => c.toLowerCase() !== hex.toLowerCase()); l.push(hex); try { localStorage.setItem(MYC, JSON.stringify(l.slice(-12))); } catch {} };
  function catDialog(cat = null, anchor = null) {
    // 20.11.: aufgebaut wie „Neue Aufgabe“ – oben der Name, darunter Menü-Zeilen (Icon, Farbe); eine Zeile antippen = eigene Seite mit „‹“
    const icons = CAT_ICONS.filter((n) => !window.LineIcons || window.LineIcons.f?.[n] || document.getElementById(`f-${n}`));
    const COLS = window.UIKit?.COLORS || ['#bbbbbb'];
    const info = cat ? (cat.custom === false ? cat : { ...colInfo(cat.id), ref: cat }) : null; // feste Spalte oder eigene Kategorie
    let pick = info?.icon || 'star', color = info?.color || '', page = 'main', name = info?.name || '';
    const custom = !info || info.custom;
    const modal = document.createElement('div'); modal.className = `tk-modal cal-emodal au-catmodal${anchor ? ' au-anch anchored' : ''}`;
    modal.innerHTML = '<form class="tk-form tk-sheet ce-card au-catform au-cat2" autocomplete="off"></form>';
    document.body.append(modal);
    const form = modal.querySelector('form');
    const tint = () => (color ? ` style="color:${esc(color)}"` : '');
    const draw = (dir = 0) => {
      if (page === 'main') {
        form.innerHTML = `<div class="tk-sheet-main ce-headbox">${custom ? `<input class="tk-f-title" name="name" value="${esc(name)}" placeholder="Name der Kategorie" maxlength="30" aria-label="Name der Kategorie" />` : `<div class="tk-f-title au-fixname">${esc(name)}</div>`}</div>
          <div class="ce-rows">
            <div class="tk-pop"><button type="button" class="tk-pill" data-pg="icon"><span class="tk-si"${tint()}>${icon(`f-${pick}`, 14)}</span><span class="tk-rv">Icon</span></button></div>
            <div class="tk-pop"><button type="button" class="tk-pill" data-pg="color"><span class="tk-si"><i class="au-cdot" style="background:${esc(color || '#8e8e93')}"></i></span><span class="tk-rv${color ? '' : ' ce-off'}">Farbe</span></button></div>
            ${cat ? `<div class="tk-pop"><button type="button" class="tk-pill" data-pg="order"><span class="tk-si">${icon('f-grip', 14)}</span><span class="tk-rv">Reihenfolge</span></button></div>` : ''}
          </div>
          <div class="tk-sheet-foot ce-foot">${cat && custom ? `<button type="button" class="tk-sheet-ib danger" data-act="del" aria-label="Kategorie löschen" title="Kategorie löschen">${icon('f-trash', 15)}</button>` : ''}<span class="grow"></span><button type="submit" class="tk-create tk-make">${cat ? 'Speichern' : 'Erstellen'}</button></div>`;
        const inp = form.querySelector('input'); inp?.addEventListener('input', () => { name = inp.value; });
      } else {
        const body = page === 'order' ? '' : page === 'icon'
          ? `<div class="au-icgrid" role="radiogroup" aria-label="Icon">${icons.map((n) => `<button type="button" class="au-ic${n === pick ? ' on' : ''}" data-ic="${n}" role="radio" aria-checked="${n === pick}" aria-label="${n}"${tint()}>${icon(`f-${n}`, 16)}</button>`).join('')}</div>`
          : `<div class="au-cgrid">${['', ...COLS, ...myCols().filter((c) => !COLS.includes(c))].map((c) => `<button type="button" class="au-cc${c === color ? ' on' : ''}" data-cc="${esc(c)}" aria-label="${c ? 'Farbe' : 'Keine Farbe'}"><i style="background:${esc(c || '#8e8e93')}"></i></button>`).join('')}<button type="button" class="au-cc au-ccustom" data-ccustom aria-label="Eigene Farbe" title="Eigene Farbe"><i></i></button></div><div class="au-cpick"></div>`;
        const ordBody = () => `<div class="au-ord">${cols().map(([k, n]) => { const ci = colInfo(k); return `<div class="au-ordrow${k === cat?.id ? ' me' : ''}" data-ok="${esc(k)}"><span class="au-ordg">${icon('f-grip', 14)}</span><span class="au-ordic"${ci.color ? ` style="color:${esc(ci.color)}"` : ''}>${icon(`f-${ci.icon}`, 14)}</span><span class="au-ordn">${esc(n)}</span></div>`; }).join('')}</div>`;
        form.innerHTML = `<button type="button" class="au-cback" data-pg="main">${icon('f-back', 13)}<span>${page === 'icon' ? 'Icon' : page === 'order' ? 'Reihenfolge' : 'Farbe'}</span></button>${page === 'order' ? ordBody() : body}`;
      }
      if (dir && !matchMedia('(prefers-reduced-motion: reduce)').matches) [...form.children].forEach((c) => c.animate([{ opacity: 0, transform: `translateX(${dir * 14}px)` }, { opacity: 1, transform: 'none' }], { duration: 280, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }));
    };
    const go = (pg) => { const h0 = form.offsetHeight; const dir = pg === 'main' ? -1 : 1; page = pg; draw(dir); const h1 = form.offsetHeight; if (!matchMedia('(prefers-reduced-motion: reduce)').matches) form.animate([{ height: `${h0}px` }, { height: `${h1}px` }], { duration: 320, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' }); };
    draw();
    if (anchor) { // kleines Menü direkt unter „⋯“, rechtsbündig
      const r = anchor.getBoundingClientRect(), w = form.offsetWidth;
      Object.assign(form.style, { position: 'fixed', left: `${Math.round(Math.max(8, Math.min(innerWidth - w - 8, r.right - w)))}px`, top: `${Math.round(r.bottom + 6)}px`, margin: '0' });
    }
    const close = () => { modal.classList.add('closing'); setTimeout(() => modal.remove(), 200); document.removeEventListener('keydown', onKey, true); };
    const onKey = (e) => { if (e.key !== 'Escape') return; e.stopPropagation(); if (page !== 'main') go('main'); else close(); };
    document.addEventListener('keydown', onKey, true);
    modal.addEventListener('pointerdown', (e) => { if (e.target === modal) close(); });
    form.addEventListener('keydown', (e) => e.stopPropagation());
    // 20.11.: Reihenfolge per Ziehen (oben ↔ unten), sofort gespeichert
    form.addEventListener('pointerdown', (e) => {
      const row = e.target.closest('.au-ordrow'); if (!row || e.button) return;
      e.preventDefault();
      const list = row.parentElement, y0 = e.clientY, top0 = row.offsetTop;
      row.classList.add('drag'); row.setPointerCapture?.(e.pointerId);
      const move = (m) => {
        const y = m.clientY - y0 + top0 + row.offsetHeight / 2;
        const others = [...list.children].filter((r) => r !== row);
        const next = others.find((r) => y < r.offsetTop + r.offsetHeight / 2);
        if (next !== row.nextElementSibling || (!next && list.lastElementChild !== row)) {
          // FLIP: die anderen Zeilen gleiten an ihren neuen Platz
          const before = new Map(others.map((r) => [r, r.offsetTop]));
          list.insertBefore(row, next || null);
          others.forEach((r) => { const d = before.get(r) - r.offsetTop; if (d) r.animate([{ transform: `translateY(${d}px)` }, { transform: 'none' }], { duration: 220, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' }); });
        }
        row.style.transform = `translateY(${m.clientY - y0 + top0 - row.offsetTop}px)`;
      };
      const up = () => {
        row.removeEventListener('pointermove', move); row.removeEventListener('pointerup', up); row.removeEventListener('pointercancel', up);
        const off = row.style.transform; row.classList.remove('drag'); row.style.transform = '';
        if (off) row.animate([{ transform: off, background: 'rgba(255, 255, 255, 0.09)' }, { transform: 'none' }], { duration: 240, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' });
        const ids = [...list.children].map((r) => r.dataset.ok);
        try { localStorage.setItem(OKEY, JSON.stringify(ids)); } catch {}
        buildBoard(); render();
      };
      row.addEventListener('pointermove', move); row.addEventListener('pointerup', up); row.addEventListener('pointercancel', up);
    });
    form.addEventListener('click', (e) => {
      const pg = e.target.closest('[data-pg]'); if (pg) { go(pg.dataset.pg); return; }
      const ic = e.target.closest('[data-ic]'); if (ic) { pick = ic.dataset.ic; go('main'); return; }
      if (e.target.closest('.tk-picker')) return;
      if (e.target.closest('[data-ccustom]')) { // 20.11.: eigene Farbe – Farbwähler der App (wie überall)
        const host = form.querySelector('.au-cpick'); if (!host) return;
        if (host.firstChild) { host.replaceChildren(); return; }
        const h0 = form.offsetHeight;
        host.append(window.UIKit.colorPicker(color || '#6d9fff', (hex, done) => { if (done) { color = hex; addMyCol(hex); go('main'); } }));
        if (!matchMedia('(prefers-reduced-motion: reduce)').matches) form.animate([{ height: `${h0}px` }, { height: `${form.offsetHeight}px` }], { duration: 300, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' });
        return;
      }
      const cc = e.target.closest('[data-cc]'); if (cc) { color = cc.dataset.cc; go('main'); return; }
      const d = e.target.closest('[data-act="del"]');
      if (d && cat && custom) {
        if (!d.classList.contains('confirm')) { d.classList.add('confirm'); d.insertAdjacentHTML('beforeend', '<span class="del-txt">Wirklich löschen</span>'); clearTimeout(d._t); d._t = setTimeout(() => { d.classList.remove('confirm'); d.querySelector('.del-txt')?.remove(); }, 3500); return; }
        items.forEach((t) => { if (t.status === cat.id) t.status = 'open'; }); // Aufgaben der Kategorie landen wieder in „Offen“
        cats = cats.filter((c) => c.id !== cat.id); saveCats(); save(); buildBoard(); render(); close();
      }
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (cat && !custom) { colPrefs[cat.id] = { icon: pick, ...(color ? { color } : {}) }; savePrefs(); buildBoard(); render(); close(); return; }
      const n = name.trim().slice(0, 30); if (!n) { form.querySelector('input')?.focus(); return; }
      if (cat) Object.assign(info.ref || cat, { name: n, icon: pick, color: color || undefined });
      else cats.push({ id: `c${Date.now().toString(36)}`, name: n, icon: pick, ...(color ? { color } : {}) });
      saveCats(); buildBoard(); render(); close();
      if (!cat) requestAnimationFrame(() => board.scrollTo({ left: board.scrollWidth, behavior: 'smooth' })); // neue Spalte zeigen
    });
    if (!anchor) requestAnimationFrame(() => form.querySelector('input')?.focus({ preventScroll: true }));
  }
  main.addEventListener('click', (e) => {
    if (e.target.closest('[data-au="cat"]')) { catDialog(); return; }
    const m = e.target.closest('[data-colmenu]'); if (m) { e.stopPropagation(); const k = m.dataset.colmenu, c = cats.find((x) => x.id === k); catDialog(c || colInfo(k)); }
  });
  const hit = (t) => {
    if (!passFilter(t)) return false;
    if (!query) return true;
    const tags = (window.TagMenu?.all?.() || []).filter((g) => (t.tags || []).includes(g.id)).map((g) => g.name).join(' ');
    return `${t.title} ${t.note || ''} ${tags}`.toLowerCase().includes(query);
  };
  function render() {
    counts(); syncHead();
    if (board.querySelectorAll('.au-col').length !== cols().length) buildBoard();
    cols().forEach(([k]) => {
      const box = board.querySelector(`[data-cards="${k}"]`);
      const mine = sorted(items.filter((t) => statusOf(t) === k && hit(t))).slice(0, 150);
      box.innerHTML = mine.map(card).join('');
    });
  }
  function add(a = {}) {
    const title = String(a.title || '').trim().slice(0, 200); if (!title) return null;
    const st = ['open', 'doing'].includes(a.status) ? a.status : 'open';
    const t = { id: `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, title, status: st, due: /^\d{4}-\d{2}-\d{2}$/.test(String(a.due || '')) ? a.due : '', created: Date.now(), movedAt: Date.now() };
    items.unshift(t); save(); if (open) render();
    return t;
  }
  // nur noch fürs Detailfenster und Widgets: Status setzen (ohne Fluganimation)
  function move(t, to) {
    if (to === 'del') { items = items.filter((x) => x !== t); save(); render(); return; }
    t.status = to; t.movedAt = Date.now(); if (to === 'done') t.doneAt = Date.now();
    save(); render();
  }
  /* ---------- Ziehen ---------- */
  // FLIP: Positionen merken, DOM ändern, dann jede verschobene Karte von der alten Stelle weich nachgleiten lassen
  const rectsOf = () => new Map([...board.querySelectorAll('.au-card2:not(.au-src), .au-ph')].map((el) => [el, el.getBoundingClientRect()]));
  const flip = (before) => {
    if (reduced()) return;
    before.forEach((r0, el) => { if (!el.isConnected) return; const r1 = el.getBoundingClientRect(), dx = r0.left - r1.left, dy = r0.top - r1.top; if (dx || dy) el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 240, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' }); });
  };
  let drag = null;
  board.addEventListener('pointerdown', (e) => {
    const c = e.target.closest('.au-card2'); if (!c || e.button > 0 || e.target.closest('.au-edit, .au-inl') || c.classList.contains('editing')) return;
    drag = { el: c, id: c.dataset.id, x0: e.clientX, y0: e.clientY, on: false, pid: e.pointerId };
  });
  function begin(e) {
    const c = drag.el, r = c.getBoundingClientRect();
    drag.on = true; drag.dx = e.clientX - r.left; drag.dy = e.clientY - r.top;
    const ghost = c.cloneNode(true); ghost.classList.add('au-ghost'); ghost.style.width = `${r.width}px`;
    ghost.style.left = `${r.left}px`; ghost.style.top = `${r.top}px`;
    document.body.append(ghost); drag.ghost = ghost;
    if (!reduced()) ghost.animate([{ transform: 'none' }, { transform: 'rotate(-2.5deg) scale(1.02)' }], { duration: 160, easing: 'ease-out', fill: 'forwards' });
    const ph = document.createElement('div'); ph.className = 'au-ph'; ph.style.height = `${r.height}px`;
    c.after(ph); c.classList.add('au-src'); drag.ph = ph;
    document.body.classList.add('au-dragging'); try { window.getSelection()?.removeAllRanges(); } catch {} // 20.11.: keine Markierung beim Ziehen
    try { board.setPointerCapture(drag.pid); } catch {}
  }
  board.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (!drag.on) { if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 6) return; begin(e); }
    e.preventDefault();
    drag.ghost.style.left = `${e.clientX - drag.dx}px`; drag.ghost.style.top = `${e.clientY - drag.dy}px`;
    { const br = board.getBoundingClientRect(); if (e.clientX < br.left + 48) board.scrollLeft -= 14; else if (e.clientX > br.right - 48) board.scrollLeft += 14; } // 19.11.: am Rand mitscrollen (viele Spalten)
    // Zielspalte und Lücke bestimmen
    const col = [...board.querySelectorAll('.au-col')].find((cl) => { const r = cl.getBoundingClientRect(); return e.clientX >= r.left && e.clientX <= r.right; });
    if (!col) return;
    const box = col.querySelector('.au-cards');
    const others = [...box.querySelectorAll('.au-card2:not(.au-src)')];
    const before = others.find((el) => { const r = el.getBoundingClientRect(); return e.clientY < r.top + r.height / 2; }) || null;
    if (drag.ph.parentElement === box && drag.ph.nextElementSibling === before) return;
    if (before && before.previousElementSibling === drag.ph) return;
    const snap = rectsOf();
    box.insertBefore(drag.ph, before);
    board.querySelectorAll('.au-col.over').forEach((x) => x !== col && x.classList.remove('over')); col.classList.add('over');
    flip(snap);
  });
  function finish(cancel) {
    const d = drag; drag = null;
    document.body.classList.remove('au-dragging');
    board.querySelectorAll('.au-col.over').forEach((x) => x.classList.remove('over'));
    const t = items.find((x) => x.id === d.id);
    const box = d.ph.parentElement, to = box?.dataset.cards;
    const end = () => {
      if (!cancel && t && to) {
        // Reihenfolge übernehmen: vor die Karte, die nach der Lücke steht – sonst ans Ende der Spalte
        const nextId = d.ph.nextElementSibling?.classList.contains('au-src') ? d.ph.nextElementSibling.nextElementSibling?.dataset.id : d.ph.nextElementSibling?.dataset.id;
        const changed = statusOf(t) !== to;
        if (vs.sort !== 'manual') { // 19.11.: sortierte Ansicht – eigene Reihenfolge bleibt erhalten, nur der Status ändert sich
          if (changed) { t.status = to; t.movedAt = Date.now(); if (to === 'done') t.doneAt = Date.now(); }
          save(); d.ph.remove(); d.ghost.remove(); render(); return; // Lücke und schwebende Kopie immer entfernen (blieben sonst stehen)
        }
        items = items.filter((x) => x !== t);
        if (changed) { t.status = to; t.movedAt = Date.now(); if (to === 'done') t.doneAt = Date.now(); }
        const i = nextId ? items.findIndex((x) => x.id === nextId) : -1;
        if (i >= 0) items.splice(i, 0, t);
        else { const last = items.map((x) => statusOf(x)).lastIndexOf(to); items.splice(last + 1, 0, t); }
        save();
      }
      // 19.11.: nicht alles neu zeichnen (ruckelt) – nur die eine Karte an die Stelle der Lücke setzen, Zähler aktualisieren
      let nc = null;
      if (!cancel && t && d.ph.isConnected) {
        const tmp = document.createElement('div'); tmp.innerHTML = card(t).trim(); nc = tmp.firstElementChild;
        d.ph.replaceWith(nc); d.el.remove();
      } else { d.ph.remove(); d.el.classList.remove('au-src'); nc = d.el; }
      d.ghost.remove(); counts();

    };
    const target = (cancel ? d.el : d.ph).getBoundingClientRect();
    if (reduced()) return end();
    // Startpunkt = die ungedrehte Lage (left/top), nicht der schräge Rahmen – sonst springt die Karte am Ende
    const gl = parseFloat(d.ghost.style.left) || 0, gt = parseFloat(d.ghost.style.top) || 0;
    d.ghost.getAnimations().forEach((a) => a.cancel());
    d.ghost.animate([{ transform: 'translate(0, 0) rotate(-2.5deg) scale(1.02)' }, { transform: `translate(${target.left - gl}px, ${target.top - gt}px) rotate(0) scale(1)` }], { duration: 260, easing: 'cubic-bezier(0.2, 0.9, 0.25, 1)', fill: 'forwards' }).finished.then(end, end);
  }
  board.addEventListener('pointerup', (e) => {
    if (!drag) return;
    // einmal antippen: Karte nur auswählen (Stift erscheint) – bearbeitet wird erst über den Stift
    // 19.11.: einmal antippen öffnet die Aufgabe direkt zum Bearbeiten (kein Stift mehr über der Priorität)
    if (!drag.on) { const el = drag.el; drag = null; const t = items.find((x) => x.id === el.dataset.id); if (t && !el.classList.contains('editing')) detail(t, null); return; }
    finish(false);
  });
  board.addEventListener('pointercancel', () => { if (drag?.on) finish(true); else drag = null; });
  board.addEventListener('click', (e) => {
    const b = e.target.closest('.au-edit'); if (!b) return;
    const c = b.closest('.au-card2'), t = items.find((x) => x.id === c.dataset.id); if (!t || c.classList.contains('editing')) return;
    // 19.11.: Bearbeiten wieder als Fenster – mittig, Hintergrund unscharf (wie „Neue Aufgabe“, gleiche Breite)
    c.classList.remove('sel');
    detail(t, null);
  });
  document.addEventListener('pointerdown', (e) => { if (open && !e.target.closest('.au-card2')) board.querySelectorAll('.au-card2.sel').forEach((x) => x.classList.remove('sel')); });
  board.addEventListener('keydown', (e) => { const c = e.target.closest?.('.au-card2'); if (c && e.key === 'Enter') { const t = items.find((x) => x.id === c.dataset.id); if (t) detail(t); } });

  /* Aufgabe anlegen/öffnen (18.11. spät): dasselbe Fenster wie ein Kalendertermin (Calendar.editTask) – Titel, Beschreibung,
     Status, Priorität, Fällig am, „Im Kalender eintragen“ (legt einen verknüpften Termin an: calId), Tags, Cover */
  function detail(t, anchor = null, inline = null) {
    const C = window.Calendar; if (!C?.editTask) return;
    const ev = t ? { id: t.id, title: t.title, description: t.note || '', date: t.due || '', time: t.time || '', end: t.end || '', status: statusOf(t), priority: t.priority || 'none', tags: t.tags || [], cover: t.cover || '', cal: !!t.calId } : null;
    C.editTask(ev, inline ? null : anchor, {
      onSave(item) {
        let x = t ? items.find((y) => y.id === t.id) : null;
        if (!x) { x = { id: `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, created: Date.now(), movedAt: Date.now() }; items.unshift(x); }
        if (x.status && x.status !== item.status) { x.movedAt = Date.now(); if (item.status === 'done') x.doneAt = Date.now(); }
        Object.assign(x, { title: item.title, note: item.description || '', due: item.date || '', time: item.time || '', end: item.end || '', status: item.status || 'open', priority: item.priority || 'none', tags: item.tags || [] });
        if (item.cover) x.cover = item.cover; else delete x.cover;
        // verknüpfter Kalendereintrag: an = anlegen/aktualisieren, aus = entfernen
        if (item.cal && item.date) {
          const evx = C.upsert({ ...(C.events.find((y) => y.id === x.calId) || {}), id: x.calId || '', title: x.title, description: x.note, date: x.due, time: x.time, end: x.end, tags: x.tags, cover: x.cover || '', color: (C.events.find((y) => y.id === x.calId) || {}).color || '#8e8e93', icon: 'f-calendar', task: x.id });
          x.calId = evx.id;
        } else if (x.calId) { C.removeEvent(x.calId); delete x.calId; }
        save(); if (open) render();
      },
      onDelete(id) { const x = items.find((y) => y.id === id); if (x?.calId) C.removeEvent(x.calId); items = items.filter((y) => y.id !== id); save(); if (open) render(); },
    }, inline ? { inline, onClose: () => { if (open) render(); } } : {});
  }
  main.querySelector('[data-au="new"]').addEventListener('click', (e) => detail(null, e.currentTarget));

  window.addEventListener('storage', (e) => { if (e.key === KEY) { items = load(); if (open) render(); } });

  let open = false;
  function show() {
    const panel = document.querySelector('.panel');
    if (panel && !view.isConnected) panel.append(view);
    items = load();
    open = true; view.hidden = false; render();
    document.querySelector('.panel')?.classList.add('view-tasks');
    
  }
  function hide() { if (!open) return; open = false; view.hidden = true; document.querySelector('.panel')?.classList.remove('view-tasks'); }
  window.AppActions = window.AppActions || {};
  window.AppActions.add_task = (a) => { add(a); window.openViewTab?.('tasks'); };
  return { show, hide, add, get items() { return items.slice(); }, get cats() { return cats.slice(); }, get open() { return open; } };
})();
window.Aufgaben = Aufgaben;
