/* ===================================================================
   Bereich „UI“ (Sidebar, 14.11.): Sammlung der Bausteine, aus denen später das Design der App entsteht.
   Noch fast leer – die Bausteine kommen einzeln dazu. Bisher: Tableiste (UIKit.tabBar) oben mittig, darunter Knöpfe (UIKit.button).
   Öffnet als eigener Tab (app.js → VIEW_TABS.ui).
   =================================================================== */
const UILab = (() => {
  const TABS = [{ id: 'all', label: 'Alle' }, { id: 'images', label: 'Bilder' }, { id: 'videos', label: 'Videos' }, { id: 'pages', label: 'Seiten' }];
  let view = null, open = false;

  // Abschnitt: Überschrift + Zeilen (je Zeile ein leiser Name links, rechts die Beispiele)
  function section(title, rows) {
    const sec = document.createElement('section');
    sec.className = 'uiv-sec';
    const h = document.createElement('h3'); h.textContent = title; sec.append(h);
    rows.forEach(([name, items]) => {
      const row = document.createElement('div'); row.className = 'uiv-row';
      const n = document.createElement('span'); n.className = 'uiv-name'; n.textContent = name;
      const box = document.createElement('div'); box.className = 'uiv-items'; box.append(...items);
      row.append(n, box); sec.append(row);
    });
    return sec;
  }
  function buttons() {
    const B = window.UIKit.button;
    return section('Knöpfe', [
      ['Arten', [B({ label: 'Hell', kind: 'light' }), B({ label: 'Standard' }), B({ label: 'Umrandet', kind: 'line' }), B({ label: 'Leise', kind: 'ghost' }), B({ label: 'Löschen', kind: 'danger' })]],
      ['Mit Icon', [B({ label: 'Hinzufügen', icon: 'plus', kind: 'light' }), B({ label: 'Hinzufügen', icon: 'plus' }), B({ label: 'Hinzufügen', icon: 'plus', kind: 'line' }), B({ label: 'Hinzufügen', icon: 'plus', kind: 'ghost' }), B({ label: 'Löschen', icon: 'trash', kind: 'danger' })]],
      ['Nur Icon', [B({ icon: 'plus', kind: 'light', aria: 'Hinzufügen' }), B({ icon: 'search', aria: 'Suchen' }), B({ icon: 'filter', kind: 'line', aria: 'Filter' }), B({ icon: 'plus', kind: 'ghost', aria: 'Hinzufügen' }), B({ icon: 'trash', kind: 'danger', aria: 'Löschen' })]],
      ['Größen', [B({ label: 'Klein', size: 's' }), B({ label: 'Mittel' }), B({ label: 'Groß', size: 'l' }), B({ label: 'Klein', size: 's', kind: 'light' }), B({ label: 'Mittel', kind: 'light' }), B({ label: 'Groß', size: 'l', kind: 'light' })]],
      ['Gesperrt', [B({ label: 'Hell', kind: 'light', disabled: true }), B({ label: 'Standard', disabled: true }), B({ label: 'Umrandet', kind: 'line', disabled: true }), B({ label: 'Leise', kind: 'ghost', disabled: true })]],
    ]);
  }

  function build() {
    view = document.createElement('section');
    view.className = 'uiv-view';
    view.setAttribute('aria-label', 'UI');
    view.innerHTML = '<header class="uiv-head"><h2>UI</h2><div class="uiv-mid"></div><span class="uiv-right"></span></header><div class="uiv-body"></div>';
    view.querySelector('.uiv-mid').append(window.UIKit.tabBar({ items: TABS, value: 'all', label: 'Tableiste' }));
    view.querySelector('.uiv-body').append(buttons());
  }

  function show() {
    const panel = document.querySelector('.panel');
    if (!view) build();
    if (panel && !view.isConnected) panel.append(view);
    open = true;
    view.hidden = false;
    panel?.classList.add('view-ui');
  }
  function hide() {
    if (!open) return;
    open = false;
    view.hidden = true;
    document.querySelector('.panel')?.classList.remove('view-ui');
  }
  return { show, hide, get open() { return open; } };
})();
window.UILab = UILab;
