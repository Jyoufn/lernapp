/* ===================================================================
   Bereich „UI“ (Sidebar, 14.11.): Sammlung der Bausteine, aus denen später das Design der App entsteht.
   Noch fast leer – die Bausteine kommen einzeln dazu. Bisher: Tableiste (UIKit.tabBar) oben mittig.
   Öffnet als eigener Tab (app.js → VIEW_TABS.ui).
   =================================================================== */
const UILab = (() => {
  const TABS = [{ id: 'all', label: 'Alle' }, { id: 'images', label: 'Bilder' }, { id: 'videos', label: 'Videos' }, { id: 'pages', label: 'Seiten' }];
  let view = null, open = false;

  function build() {
    view = document.createElement('section');
    view.className = 'uiv-view';
    view.setAttribute('aria-label', 'UI');
    view.innerHTML = '<header class="uiv-head"><h2>UI</h2><div class="uiv-mid"></div><span class="uiv-right"></span></header><div class="uiv-body"></div>';
    view.querySelector('.uiv-mid').append(window.UIKit.tabBar({ items: TABS, value: 'all', label: 'Tableiste' }));
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
