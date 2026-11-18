/* ===================================================================
   Homescreen-Widgets (18.11.) für iPhone und iPad über die kostenlose App „Scriptable“.
   Eine Web-App darf auf iOS keine eigenen Widgets anlegen – deshalb erzeugt die App hier ein fertiges Scriptable-Skript mit dem
   persönlichen Widget-Schlüssel (nur lesen). Ein Skript für alle Widgets; welches Widget es zeigt, steht im Widget-Parameter:
     kalender  – heute + die nächsten Termine (Farbstreifen wie im Kalender)
     aufgaben  – offene Aufgaben mit Fälligkeit
     erstellen – „Frag die KI“: Antippen öffnet eine Eingabe, der Text geht direkt als neuer Chat in die App
   Aussehen im App-Stil von iOS (Systemschrift, hell/dunkel nach Gerät, runde Ecken, kein eigenes Design der Lern-App).
   Deep-Links in die App: ?open=calendar · ?open=tasks · ?open=create · ?ask=Text
   =================================================================== */
const Widgets = (() => {
  function script(base, token) {
    return `// Lern-App – Widgets (Kalender · Aufgaben · Erstellen)
// Widget-Parameter: kalender | aufgaben | erstellen
const BASE = ${JSON.stringify(base)};
const TOKEN = ${JSON.stringify(token)};
const KIND = String(args.widgetParameter || args.queryParameters?.w || 'kalender').toLowerCase().trim();

async function main() {
// in der App angetippt (Erstellen-Widget): Frage eingeben und als neuen Chat schicken
if (!config.runsInWidget && (args.queryParameters?.frage || KIND.startsWith('erst'))) {
  const a = new Alert(); a.title = 'Frag die KI'; a.addTextField('Was möchtest du wissen?', ''); a.addAction('Senden'); a.addCancelAction('Abbrechen');
  if (await a.presentAlert() === 0) { const q = a.textFieldValue(0).trim(); Safari.open(BASE + (q ? '/?ask=' + encodeURIComponent(q) : '/?open=create')); }
  return;
}

const dark = Device.isUsingDarkAppearance();
const C = { bg: dark ? new Color('#1c1c1e') : new Color('#ffffff'), t1: dark ? new Color('#ffffff') : new Color('#000000'),
  t2: dark ? new Color('#8e8e93') : new Color('#6c6c70'), red: new Color('#ff3b30'), acc: new Color('#0a84ff'), line: dark ? new Color('#3a3a3c') : new Color('#e5e5ea') };
const fam = config.widgetFamily || 'medium';
const w = new ListWidget(); w.backgroundColor = C.bg; w.setPadding(14, 15, 12, 15);

async function data() {
  try { const r = new Request(BASE + '/api/widget?t=' + encodeURIComponent(TOKEN)); r.timeoutInterval = 12; const j = await r.loadJSON();
    if (j && !j.error) { Keychain.set('lernapp.widget', JSON.stringify(j)); return j; } }
  catch (e) {}
  try { return JSON.parse(Keychain.get('lernapp.widget')); } catch (e) { return { events: [], tasks: [], today: '' }; } // offline: letzter Stand
}
const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const label = (s) => { const t = new Date(), m = new Date(); m.setDate(m.getDate() + 1); if (s === iso(t)) return 'Heute'; if (s === iso(m)) return 'Morgen';
  const d = new Date(s + 'T12:00:00'); return d.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' }); };
const txt = (s, size, color, weight) => { const x = w.addText(s); x.font = weight === 'bold' ? Font.boldSystemFont(size) : weight === 'semi' ? Font.semiboldSystemFont(size) : Font.systemFont(size); x.textColor = color; x.lineLimit = 1; return x; };

if (KIND.startsWith('auf') || KIND.startsWith('todo') || KIND.startsWith('task')) {
  const d = await data();
  w.url = BASE + '/?open=tasks';
  const h = w.addStack(); h.centerAlignContent();
  const ht = h.addText('Aufgaben'); ht.font = Font.boldSystemFont(15); ht.textColor = C.acc;
  h.addSpacer(); const hn = h.addText(String(d.openTasks || 0)); hn.font = Font.boldSystemFont(15); hn.textColor = C.t2;
  w.addSpacer(8);
  const max = fam === 'small' ? 4 : fam === 'large' ? 11 : 4;
  const list = (d.tasks || []).slice(0, max);
  if (!list.length) { w.addSpacer(); txt('Alles erledigt', 13, C.t2); w.addSpacer(); }
  list.forEach((t) => {
    const r = w.addStack(); r.centerAlignContent(); r.spacing = 8;
    const c = r.addImage(SFSymbol.named('circle').image); c.imageSize = new Size(15, 15); c.tintColor = C.t2;
    const tt = r.addText(t.title); tt.font = Font.systemFont(13); tt.textColor = C.t1; tt.lineLimit = 1;
    if (t.due && fam !== 'small') { r.addSpacer(); const du = r.addText(label(t.due)); du.font = Font.systemFont(11); du.textColor = t.due < iso(new Date()) ? C.red : C.t2; }
    w.addSpacer(6);
  });
  w.addSpacer();
} else if (KIND.startsWith('erst') || KIND.startsWith('create') || KIND.startsWith('ki')) {
  w.url = 'scriptable:///run/' + encodeURIComponent(Script.name()) + '?frage=1';
  const top = w.addStack(); top.centerAlignContent();
  const ic = top.addImage(SFSymbol.named('sparkles').image); ic.imageSize = new Size(18, 18); ic.tintColor = C.acc;
  top.addSpacer(6); const tt = top.addText('Erstellen'); tt.font = Font.boldSystemFont(15); tt.textColor = C.t1;
  w.addSpacer();
  const box = w.addStack(); box.layoutHorizontally(); box.centerAlignContent(); box.setPadding(9, 11, 9, 11); box.cornerRadius = 12;
  box.backgroundColor = dark ? new Color('#2c2c2e') : new Color('#f2f2f7');
  const q = box.addText('Frag die KI …'); q.font = Font.systemFont(13); q.textColor = C.t2; box.addSpacer();
  if (fam !== 'small') {
    w.addSpacer(8);
    const row = w.addStack(); row.spacing = 8;
    [['Neuer Chat', '/?open=create', 'bubble.left'], ['Kalender', '/?open=calendar', 'calendar'], ['Aufgaben', '/?open=tasks', 'checklist']].forEach(([n, u, s]) => {
      const b = row.addStack(); b.centerAlignContent(); b.setPadding(5, 8, 5, 8); b.cornerRadius = 9; b.url = BASE + u;
      b.backgroundColor = dark ? new Color('#2c2c2e') : new Color('#f2f2f7');
      const im = b.addImage(SFSymbol.named(s).image); im.imageSize = new Size(12, 12); im.tintColor = C.t1; b.addSpacer(4);
      const bt = b.addText(n); bt.font = Font.mediumSystemFont(11); bt.textColor = C.t1;
    });
  }
} else {
  const d = await data(), now = new Date();
  w.url = BASE + '/?open=calendar';
  const h = w.addStack(); h.layoutVertically();
  const wd = h.addText(now.toLocaleDateString('de-DE', { weekday: 'long' }).toUpperCase()); wd.font = Font.semiboldSystemFont(11); wd.textColor = C.red;
  const dn = h.addText(String(now.getDate())); dn.font = Font.lightSystemFont(fam === 'small' ? 30 : 26); dn.textColor = C.t1;
  w.addSpacer(4);
  const max = fam === 'small' ? 2 : fam === 'large' ? 9 : 3;
  const list = (d.events || []).slice(0, max);
  if (!list.length) txt('Keine Termine', 12, C.t2);
  list.forEach((e) => {
    const r = w.addStack(); r.spacing = 7; r.centerAlignContent();
    const bar = r.addStack(); bar.size = new Size(3, 28); bar.cornerRadius = 1.5; bar.backgroundColor = new Color(e.color || '#0a84ff');
    const col = r.addStack(); col.layoutVertically();
    const t = col.addText(e.title); t.font = Font.semiboldSystemFont(12); t.textColor = C.t1; t.lineLimit = 1;
    const s = col.addText((e.date === d.today ? '' : label(e.date) + ' · ') + (e.time ? e.time + (e.end ? '–' + e.end : '') : 'Ganztägig')); s.font = Font.systemFont(11); s.textColor = C.t2; s.lineLimit = 1;
    w.addSpacer(5);
  });
  w.addSpacer();
}
w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);
if (config.runsInWidget) Script.setWidget(w); else await (fam === 'small' ? w.presentSmall() : w.presentMedium());
}
await main();
Script.complete();
`;
  }
  async function setup(renew = false) {
    const r = await fetch('/api/widget/token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ renew }) });
    const j = await r.json(); if (!j.token) throw new Error(j.error || 'Kein Schlüssel');
    return script(location.origin, j.token);
  }
  /* ---------- Deep-Links aus den Widgets ---------- */
  function handleLink() {
    const p = new URLSearchParams(location.search);
    const open = p.get('open'), ask = p.get('ask');
    if (!open && !ask) return;
    const go = () => {
      window.history.replaceState(null, '', location.pathname); // erst jetzt entfernen (eine Anmeldung dazwischen lädt die Seite neu)
      if (open === 'calendar' || open === 'tasks') { window.openViewTab?.(open); return; }
      document.querySelector('.sidebar .sb-main [data-nav="new"]')?.click();
      if (!ask) return;
      setTimeout(() => {
        const input = document.getElementById('input'), form = document.getElementById('composer');
        if (!input || !form) return;
        input.value = ask.slice(0, 4000); input.dispatchEvent(new Event('input', { bubbles: true }));
        form.requestSubmit();
      }, 350);
    };
    let n = 0;
    const ready = () => { if (document.documentElement.classList.contains('auth-locked')) return false; try { return !restoring && !!document.querySelector('.tab'); } catch { return true; } }; // eslint-disable-line no-undef
    const wait = () => { if (ready() || ++n > 400) go(); else setTimeout(wait, 150); }; // erst, wenn die Chats geladen sind
    setTimeout(wait, 300);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', handleLink); else handleLink();
  return { setup, script };
})();
window.Widgets = Widgets;
