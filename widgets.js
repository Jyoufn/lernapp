/* ===================================================================
   Kurzbefehle (18.11. spät, statt Scriptable): Einstellungen → Kurzbefehle.
   - Daten-Links mit persönlichem Schlüssel (nur lesen): /api/kurzbefehl?t=…&w=heute|kalender|aufgaben liefert fertigen
     deutschen Text. In der App „Kurzbefehle“: „Inhalt von URL abrufen“ → „Ergebnis anzeigen“ (oder Siri liest ihn vor).
   - Öffnen-Links ohne Schlüssel: ?open=calendar · ?open=tasks · ?open=create · ?ask=Text (handleLink unten).
   iOS öffnet Links aus Kurzbefehlen immer in Safari, nie in der Homescreen-App – das kann eine Web-App nicht ändern.
   =================================================================== */
const Widgets = (() => {
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let token = '';
  async function getToken(renew = false) {
    if (token && !renew) return token;
    const r = await fetch('/api/widget/token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ renew }) });
    const j = await r.json(); if (!j.token) throw new Error(j.error || 'Kein Schlüssel');
    token = j.token; return token;
  }
  const DATA = [['heute', 'Mein Tag', 'Heutige Termine und die wichtigsten Aufgaben', 'f-sun'], ['kalender', 'Meine Termine', 'Die nächsten 14 Tage', 'f-calendar'], ['aufgaben', 'Meine Aufgaben', 'Offene Aufgaben, wichtigste zuerst', 'o-todo']];
  const OPEN = [['?open=create', 'Neuer Chat', 'f-chat'], ['?open=calendar', 'Kalender öffnen', 'f-calendar'], ['?open=tasks', 'Aufgaben öffnen', 'o-todo']];
  const ic = (id) => `<svg width="15" height="15" aria-hidden="true"><use href="#${id}"/></svg>`;
  function page() {
    return `<h2>Apple Kalender</h2>
      <p class="st-kb-intro">Empfohlen: Abonniere deine Termine und fälligen Aufgaben in Apple Kalender. Dann zeigen die normalen Apple-Widgets (Kalender, „Als Nächstes“) alles im Apple-Design an, aktualisieren sich von selbst und öffnen beim Antippen nichts Fremdes.</p>
      <div class="st-card"><div class="st-row"><span class="st-kb-ic">${ic('f-calendar')}</span><span class="st-name">Kalender abonnieren<em class="st-sub">Nur lesen – Änderungen machst du in der Lern-App</em></span><span class="grow"></span><button type="button" class="st-btn" data-ics-copy>Link kopieren</button><button type="button" class="st-btn dark" data-ics>Abonnieren</button></div></div>
      <ol class="st-wg-steps"><li><b>Abonnieren</b> tippen → „Abonnieren“ bestätigen (Apple Kalender öffnet sich).</li><li>Klappt das nicht: Einstellungen → Kalender → Accounts → Account hinzufügen → Andere → <b>Kalenderabo hinzufügen</b> → kopierten Link einfügen.</li><li>Homescreen lange drücken → <b>+</b> → <b>Kalender</b> → Widget wählen.</li></ol>
      <h2>Kurzbefehle</h2>
      <p class="st-kb-intro">Mit der App <b>Kurzbefehle</b> auf iPhone und iPad zeigt Siri, ein Homescreen-Symbol oder das Kurzbefehle-Widget deine Termine und Aufgaben an – ohne die Lern-App zu öffnen.</p>
      <div class="st-card">${DATA.map(([w, n, sub, i]) => `<div class="st-row"><span class="st-kb-ic">${ic(i)}</span><span class="st-name">${n}<em class="st-sub">${sub}</em></span><span class="grow"></span><button type="button" class="st-btn dark" data-kb="${w}">Link kopieren</button></div>`).join('')}</div>
      <ol class="st-wg-steps"><li>Oben einen Link kopieren.</li><li>App <b>Kurzbefehle</b> öffnen → <b>+</b> → Aktion <b>„Inhalt von URL abrufen“</b> → Link einfügen.</li>
        <li>Darunter die Aktion <b>„Ergebnis anzeigen“</b> hinzufügen.</li><li>Oben den Namen geben, z. B. „Meine Termine“ – dann reicht „Hey Siri, meine Termine“. Fürs Homescreen-Symbol: <b>Teilen → Zum Home-Bildschirm</b>.</li></ol>
      <h2>Lern-App öffnen</h2>
      <div class="st-card">${OPEN.map(([q, n, i]) => `<div class="st-row"><span class="st-kb-ic">${ic(i)}</span><span class="st-name">${n}</span><span class="grow"></span><button type="button" class="st-btn dark" data-kbo="${esc(q)}">Link kopieren</button></div>`).join('')}</div>
      <p class="st-kb-intro">Kurzbefehl mit <b>„URL öffnen“</b> und diesem Link. Für „Frag die KI“: zuerst <b>„Nach Eingabe fragen“</b>, dann „URL öffnen“ mit <b>${esc(location.origin)}/?ask=</b> und dahinter die Eingabe. iOS öffnet solche Links in Safari, nicht in der App auf dem Homescreen.</p>
      <div class="st-card"><div class="st-row"><span class="st-name">Schlüssel erneuern<em class="st-sub">Alte Daten-Links funktionieren danach nicht mehr</em></span><span class="grow"></span><button type="button" class="st-btn" data-kb-renew>Erneuern</button></div></div>`;
  }
  const copy = async (btn, text) => {
    let ok = false; try { await navigator.clipboard.writeText(text); ok = true; } catch {}
    if (!ok) window.prompt('Link kopieren:', text);
    const was = btn.textContent; btn.textContent = ok ? 'Kopiert' : was; setTimeout(() => { btn.textContent = 'Link kopieren'; }, 1600);
  };
  function click(e) {
    const ics = e.target.closest('[data-ics], [data-ics-copy]');
    if (ics) {
      ics.disabled = true;
      getToken().then((t) => { const url = `${location.host}/api/kalender.ics?t=${encodeURIComponent(t)}`;
        if (ics.hasAttribute('data-ics')) location.href = `webcal://${url}`; else return copy(ics, `${location.protocol}//${url}`); })
        .catch(() => { ics.textContent = 'Fehler'; }).finally(() => { ics.disabled = false; });
      return true;
    }
    const d = e.target.closest('[data-kb]'), o = e.target.closest('[data-kbo]'), rn = e.target.closest('[data-kb-renew]');
    if (o) { copy(o, location.origin + '/' + o.dataset.kbo); return true; }
    if (d || rn) {
      const btn = d || rn; btn.disabled = true;
      getToken(!!rn).then((t) => { if (d) return copy(d, `${location.origin}/api/kurzbefehl?w=${d.dataset.kb}&t=${encodeURIComponent(t)}`); rn.textContent = 'Erneuert'; })
        .catch(() => { btn.textContent = 'Fehler'; }).finally(() => { btn.disabled = false; });
      return true;
    }
    return false;
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
  return { page, click, getToken };
})();
window.Widgets = Widgets;
