const app = document.getElementById('app');
const $ = (id) => document.getElementById(id);

/* ---------- Sidebar ein-/ausklappen: ein Knopf, immer oben links ---------- */
const toggle = $('sidebarToggle');
const STORAGE_KEY = 'sidebarCollapsed';

function setCollapsed(collapsed) {
  app.classList.toggle('collapsed', collapsed);
  toggle.setAttribute('aria-expanded', String(!collapsed));
  try { localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0'); } catch {}
}

// Gespeicherten Zustand ohne Animation wiederherstellen
app.classList.add('no-transition');
try { setCollapsed(localStorage.getItem(STORAGE_KEY) === '1'); } catch {}
requestAnimationFrame(() => requestAnimationFrame(() => app.classList.remove('no-transition')));

toggle.addEventListener('click', () => setCollapsed(!app.classList.contains('collapsed')));

/* ---------- Sidebar-Navigation: markiert ist immer der Bereich des offenen Tabs (Dokument → „Bibliothek“,
   offene Chat-Übersicht → „Chatverlauf“) – das übernimmt renderSideChats ---------- */
document.querySelectorAll('.sidebar a.nav-item').forEach((item) => item.addEventListener('click', (e) => e.preventDefault()));
window.addEventListener('chat-tab-switched', () => window.renderSideChats?.());

document.querySelectorAll('.more-toggle').forEach((btn) => {
  btn.setAttribute('aria-expanded', 'false');
  btn.addEventListener('click', () => {
    const group = btn.previousElementSibling;
    const open = group.hidden;
    group.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    btn.lastChild.textContent = open ? 'Less' : 'More';
  });
});

/* ---------- Tabs ---------- */
const tabsEl = $('tabs');
const newTabBtn = $('newTab');

const tabChats = new WeakMap(); // Tab → { nodes, history } (Chat der nicht sichtbaren Tabs)
let keepChatsView = false; // Chat in der Übersicht gelöscht → Übersicht bleibt offen, der Ersatz-Chat wartet dahinter
function activateTab(tab) {
  if (tab.hidden) { tab.hidden = false; saveChats(); } // geschlossener Chat wird wieder geöffnet
  const prev = tabsEl.querySelector('.tab.active');
  const drop = prev && prev !== tab && isDraft(prev) ? prev : null; // leerer Chat / leeres Dokument wird beim Verlassen verworfen
  if (prev && prev !== tab && typeof chat !== 'undefined' && !tab.dataset.view && chat.animate) {
    // Chat wechseln: Inhalt blendet weich ein und gleitet ein Stück hoch (statt hart umzuspringen)
    requestAnimationFrame(() => chat.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }));
  }
  if (prev && prev !== tab && typeof chat !== 'undefined') {
    const nodes = document.createDocumentFragment();
    nodes.append(...chat.childNodes);
    tabChats.set(prev, { nodes, history: history.splice(0) });
    const saved = tabChats.get(tab);
    if (saved) { chat.append(saved.nodes); history.push(...saved.history); tabChats.delete(tab); }
    chat.closest('.chat-scroll')?.scrollTo({ top: 1e9 });
  }
  tabsEl.querySelectorAll('.tab').forEach((t) => {
    t.classList.toggle('active', t === tab);
    t.setAttribute('aria-selected', String(t === tab));
  });
  // Kalender-/Aufgaben-Tab → passende Ansicht zeigen, Chat-Tab → alle Ansichten zu
  const kind = tab.dataset.view;
  Object.entries(VIEW_TABS).forEach(([k, v]) => { const x = v.view(); if (x) (k === kind ? x.show(tab) : x.hide()); });
  if (typeof chatsView !== 'undefined' && !keepChatsView) chatsView.hide();
  if (typeof renderChatBar === 'function') renderChatBar();
  if (drop) { if (drop.dataset.view === 'doc') window.Docs?.discard(drop.dataset.doc); tabChats.delete(drop); drop.remove(); }
  markDrafts();
  window.dispatchEvent(new CustomEvent('chat-tab-switched', { detail: tab }));
}
/* Leere Chats und leere Dokumente erscheinen erst oben als Tab, wenn etwas drin steht */
function isDraft(tab) {
  if (tab.classList.contains('uil-tab')) return false;
  if (tab.dataset.view === 'doc') return !!window.Docs?.isEmpty(tab.dataset.doc);
  if (tab.dataset.view) return false;
  return !historyOf(tab).length;
}
function markDrafts() { tabsEl.querySelectorAll('.tab').forEach((t) => t.classList.toggle('draft', isDraft(t))); }
window.markDrafts = markDrafts;

/* Kalender und Aufgaben öffnen als eigene Tabs (ein Tab je Ansicht) */
const VIEW_TABS = {
  calendar: { title: 'Kalender', icon: 'i-calendar', view: () => window.Calendar },
  tasks: { title: 'Aufgaben', icon: 'i-tasks', view: () => window.Tasks },
  docs: { title: 'Library', icon: 'f-file', view: () => window.Docs?.list },
  doc: { title: 'Dokument', icon: 'f-file', view: () => window.Docs?.editor },
};
function openViewTab(kind) {
  if (!VIEW_TABS[kind]) return; // z. B. ein gemerkter Tab einer Ansicht, die es nicht mehr gibt (Inbox)
  const tab = tabsEl.querySelector(`.tab[data-view="${kind}"]`);
  if (tab) activateTab(tab); else createTab(VIEW_TABS[kind].title, kind);
}
// ein Tab je Dokument
function openDocTab(id, title) {
  const tab = tabsEl.querySelector(`.tab[data-view="doc"][data-doc="${id}"]`);
  if (tab) activateTab(tab); else createTab(title || 'Unbenannt', 'doc', { doc: id });
}
window.openViewTab = openViewTab;
window.openDocTab = openDocTab;
const docTabIcon = (ic) => `<svg width="16" height="16" style="color:${ic.c};margin:-1px"><use href="#d-${ic.name}"/></svg>`;
// Icon eines Dokument-Tabs tauschen (ohne Icon wieder das normale Dokument-Symbol)
window.setTabIcon = (tab, ic) => {
  const old = tab?.querySelector(':scope > svg'); if (!old) return;
  old.outerHTML = ic ? docTabIcon(ic) : `<svg width="14" height="14" style="color:var(--text-3)"><use href="#${VIEW_TABS.doc.icon}"/></svg>`;
};
window.setTabTitle = (tab, title) => { if (!tab) return; tab.querySelector('.tab-title').textContent = title; snapToPixels([tab]); };
// Sidebar: Neuer Chat, Chatverlauf (Übersicht aller Chats), Bibliothek (Dokumente), Aufgaben, Kalender.
// Die Lupe oben öffnet den Chatverlauf (Suchfeld bekommt den Fokus).
document.querySelectorAll('.sidebar .sb-main a.nav-item[data-nav]').forEach((a) => a.addEventListener('click', (e) => {
  e.preventDefault();
  const k = a.dataset.nav;
  if (k === 'new') {
    const act = tabsEl.querySelector('.tab.active');
    if (!(act && !act.dataset.view && isDraft(act))) createTab('Neuer Chat'); // schon im leeren Chat → dort bleiben
    chatsView.hide();
    setTimeout(() => $('input')?.focus(), 50);
  } else if (k === 'history') openChatsFromAnywhere();
  else if (VIEW_TABS[k]) openViewTab(k);
}));
// Lupe oben: Suchfeld (search.js)

function closeTab(tab) {
  const tabs = [...tabsEl.querySelectorAll('.tab:not([hidden])')];
  if (tabs.length === 1) {
    // letzter Tab: dahinter wartet ein leerer Chat (ohne Tab) – die Tab-Leiste fährt dann nach oben
    if (isDraft(tab)) return;
    createTab('Neuer Chat');
  }
  if (tab.classList.contains('active')) {
    const i = tabs.indexOf(tab);
    activateTab(tabs[i + 1] || tabs[i - 1]);
  }
  // Chats mit Inhalt bleiben gespeichert (Liste „Chats“), nur der Tab ist zu – auch nach dem Neustart
  if (!tab.dataset.view && !tab.classList.contains('uil-tab') && historyOf(tab).length) { tab.hidden = true; saveChats(); return; }
  tab.remove();
  saveChats();
}

function createTab(title = 'Neuer Chat', view = '', data = {}, { background = false } = {}) {
  const tab = document.createElement('div');
  tab.className = 'tab';
  tab.setAttribute('role', 'tab');
  tab.tabIndex = 0;
  if (view) tab.dataset.view = view;
  Object.assign(tab.dataset, data); // z. B. data-doc für Dokument-Tabs
  const dIc = view === 'doc' ? window.Docs?.get(data.doc)?.icon : null; // Dokument mit eigenem Icon → dieses im Tab
  const ic = dIc && window.DocIcons?.has(dIc.name) ? docTabIcon(dIc) : view ? `<svg width="14" height="14" style="color:var(--text-3)"><use href="#${VIEW_TABS[view].icon}"/></svg>` : '<svg width="14" height="14" style="color:#e0533d"><use href="#i-agent"/></svg>';
  tab.innerHTML = `${ic}<span class="tab-title"></span><button class="tab-close" type="button" aria-label="Tab schließen"><svg width="16" height="16"><use href="#i-x"/></svg></button>`;
  tab.querySelector('.tab-title').textContent = title;
  tabsEl.insertBefore(tab, newTabBtn);
  snapToPixels([tab]);
  if (!background) activateTab(tab);
  return tab;
}

tabsEl.addEventListener('click', (e) => {
  const tab = e.target.closest('.tab');
  if (!tab) return;
  if (e.target.closest('.tab-close')) closeTab(tab);
  else activateTab(tab);
});
tabsEl.addEventListener('auxclick', (e) => { // Mittelklick schließt – wie im Browser
  const tab = e.target.closest('.tab');
  if (tab && e.button === 1) closeTab(tab);
});
tabsEl.addEventListener('keydown', (e) => {
  const tab = e.target.closest('.tab');
  if (tab && (e.key === 'Enter' || e.key === ' ') && e.target === tab) { e.preventDefault(); activateTab(tab); }
});
newTabBtn.addEventListener('click', () => createTab());

/* ---------- Modell-Auswahl ---------- */
const MODELS = [
  { id: 'gemini', label: 'Gemini 2.5 Flash', icon: 'i-gemini' },  // Hauptmodell (gratis): Thinking, Google-Suche
  { id: 'nvidia', label: 'Nemotron 3', icon: 'i-nvidia', hidden: true }, // Nemotron 3 Ultra über NVIDIA – nicht in der Auswahl, springt aber weiter ein, wenn Gemini am Limit ist
];
// „Auto“: die App schätzt die Schwierigkeit und wählt die Denktiefe selbst
const EFFORTS = ['Auto', 'Low', 'Medium', 'High', 'Max'];
const state = { model: 'gemini', effort: 0, fast: false };
try { Object.assign(state, JSON.parse(localStorage.getItem('modelState') || '{}')); } catch {}
state.fast = false; // Fast-Modus (Blitz) gibt es nicht mehr
if (!MODELS.some((m) => m.id === state.model && !m.hidden)) state.model = 'gemini'; // ausgeblendetes Modell → Gemini
state.effort = Math.min(EFFORTS.length - 1, Math.max(0, state.effort | 0));

const popover = $('modelPopover');
const chip = $('modelChip');
const modelList = $('modelList');
const effortList = $('effortList');

// Auswahl: Gemini und Nemotron 3 (mit NVIDIA-Logo); Nemotron springt außerdem automatisch ein, wenn Gemini am Limit ist
MODELS.filter((m) => !m.hidden).forEach((m) => {
  const item = document.createElement('button');
  item.type = 'button';
  item.className = 'mp-item';
  item.dataset.id = m.id;
  item.innerHTML = `<span>${m.label}</span><svg width="14" height="14"><use href="#f-check"/></svg>`;
  item.addEventListener('click', () => { state.model = m.id; render(); });
  modelList.append(item);
});

// Aufwand: Liste wie bei den Modellen – alle Stufen sichtbar, Haken an der gewählten
EFFORTS.forEach((e, i) => {
  const item = document.createElement('button');
  item.type = 'button';
  item.className = 'mp-item';
  item.setAttribute('role', 'option');
  item.dataset.i = String(i);
  item.innerHTML = `<span>${e}</span><svg width="14" height="14"><use href="#f-check"/></svg>`;
  item.addEventListener('click', () => { state.effort = i; render(); });
  effortList.append(item);
});

function render() {
  [...modelList.children].forEach((el) => el.classList.toggle('selected', el.dataset.id === state.model));
  [...effortList.children].forEach((el, i) => { el.classList.toggle('selected', i === state.effort); el.setAttribute('aria-selected', String(i === state.effort)); });
  const model = MODELS.find((m) => m.id === state.model);
  $('chipModel').textContent = model.label;
  $('chipEffort').textContent = EFFORTS[state.effort];
  snapToPixels(chip.querySelectorAll('span'));
  try { localStorage.setItem('modelState', JSON.stringify(state)); } catch {}
}

/* Texte haben krumme Breiten (z. B. 87,4 px) – alles dahinter würde auf halbe
   Pixel rutschen und unscharf wirken. Deshalb Breiten auf ganze Pixel aufrunden. */
function snapToPixels(elements) {
  elements.forEach((el) => {
    el.style.width = '';
    el.style.width = Math.ceil(el.getBoundingClientRect().width) + 'px';
  });
}
function snapAll() {
  snapToPixels(document.querySelectorAll('.tab, .tool-row > span, .ws-name, .model-chip > span'));
}
document.fonts.ready.then(snapAll);
// Bei Größenänderung des Fensters neu ausrichten (Breiten + Höhe des Eingabefelds)
let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { snapAll(); autoGrow(); }, 100);
});

function setPopover(open) {
  if (open) {
    const cr = chip.getBoundingClientRect();
    const fr = composer.getBoundingClientRect();
    // feste Breite (CSS), linksbündig unter dem Chip (6 px Abstand); ist unter dem Feld kein Platz (Feld ganz unten), öffnet es darüber
    const base = popover.offsetParent?.getBoundingClientRect() || fr;
    popover.style.left = `${Math.round(cr.left - base.left)}px`;
    const below = cr.bottom + 6 + popover.offsetHeight + 8 <= window.innerHeight;
    popover.classList.toggle('below', below);
    popover.style.top = below ? `${Math.round(cr.bottom - base.top + 6)}px` : 'auto';
    popover.style.bottom = below ? 'auto' : `${Math.round(base.bottom - cr.top + 6)}px`;
  }
  popover.classList.toggle('open', open);
  chip.setAttribute('aria-expanded', String(open));
}

chip.addEventListener('click', (e) => {
  e.stopPropagation();
  setPopover(!popover.classList.contains('open'));
});
popover.addEventListener('click', (e) => e.stopPropagation());
document.addEventListener('click', () => setPopover(false));

render();
function setEffortByName(name) {
  const i = EFFORTS.findIndex((e) => e.toLowerCase() === String(name || '').toLowerCase());
  if (i >= 0) { state.effort = i; render(); }
}
function setModelById(id) { if (MODELS.some((m) => m.id === id)) { state.model = id; render(); } }

/* ---------- Eingabefeld ---------- */
const composer = $('composer');
const input = $('input');
const micBtn = $('micBtn');
const fileInput = $('fileInput');
const attachmentsEl = $('attachments');
const listeningEl = $('listening');
const listeningText = $('listeningText');

let attachments = []; // { file, url }

function autoGrow() {
  input.style.height = 'auto';
  input.style.height = input.scrollHeight + 'px';
}

input.addEventListener('input', () => {
  autoGrow();
  // Tippt man während der Aufnahme, wird der getippte Text zur neuen Basis
  if (listening) { baseText = input.value; finalText = ''; }
});

input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    composer.requestSubmit();
  }
});

composer.addEventListener('submit', (e) => {
  e.preventDefault();
  const run = runOf(); if (run) { run.abort(); return; } // während der Antwort dieses Chats: Stopp-Button
  const text = input.value.trim();
  if (!text && attachments.length === 0) return;
  if (listening || recognition) stopListening(true); // Diktat endet sofort mit dem Abschicken
  const images = attachments.map((a) => ({ url: a.url, name: a.file.name, file: a.file, pdf: !!a.pdf })); // URLs bleiben für den Chat erhalten
  input.value = '';
  attachments = [];
  renderAttachments();
  autoGrow();
  input.focus();
  sendMessage(text, images);
});

/* iPad: Antippen sicher machen. Ist die Tastatur offen, schließt sie sich beim Tippen auf einen Knopf und das Fenster verschiebt sich –
   der Klick landet dann manchmal daneben (Auswahl/Senden „geht nicht“). Bei Touch löst deshalb schon das Loslassen auf dem Knopf aus
   (pointerup bleibt beim angetippten Element), der nachfolgende Klick wird verworfen. */
{
  const TAP = '#sendBtn, #askNext, .ask-opt:not(.ask-own-row), .ask-skip, .ask-back, .ask-mic, .as-go, .ah-go';
  let down = null, fired = null;
  document.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;
    const t = e.target.closest?.(TAP);
    down = t ? { t, x: e.clientX, y: e.clientY } : null;
  }, true);
  document.addEventListener('pointerup', (e) => {
    if (e.pointerType !== 'touch' || !down) return;
    const { t, x, y } = down;
    down = null;
    if (Math.hypot(e.clientX - x, e.clientY - y) > 12 || t.disabled || !t.isConnected) return; // gewischt/gescrollt → kein Tippen
    fired = { t, at: Date.now() };
    t.click();
  }, true);
  document.addEventListener('pointercancel', () => { down = null; }, true);
  document.addEventListener('click', (e) => {
    if (!fired || !e.isTrusted || Date.now() - fired.at > 800) return;
    e.preventDefault(); e.stopImmediatePropagation(); fired = null; // der Klick zum Tippen – auch wenn er nach dem Verschieben woanders landet
  }, true);
}

/* Fotos hinzufügen (+), oder Einfügen mit Strg/⌘+V */
$('attachBtn')?.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => { addFiles(fileInput.files); fileInput.value = ''; });
input.addEventListener('paste', (e) => {
  const files = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith('image/') || f.type === 'application/pdf');
  if (files.length) { e.preventDefault(); addFiles(files); }
});

function addFiles(files) {
  for (const file of files) {
    if (file.type.startsWith('image/')) attachments.push({ file, url: URL.createObjectURL(file) });
    else if (file.type === 'application/pdf' && file.size <= PDF_MAX_BYTES) attachments.push({ file, url: null, pdf: true });
  }
  renderAttachments();
}
// PDF als kleine Karte (Icon + Dateiname) – im Eingabefeld und in der eigenen Nachricht
const pdfChip = (name, cls) => el('div', cls, `<span class="pdf-ico">${FadeIcons.svg('file', 14)}</span><span class="pdf-name">${escapeHtml(name)}</span>`);

function renderAttachments() {
  attachmentsEl.replaceChildren(...attachments.map((a, i) => {
    const el = a.pdf ? pdfChip(a.file.name, 'thumb thumb-pdf') : document.createElement('div');
    if (!a.pdf) el.className = 'thumb';
    const img = document.createElement('img');
    img.src = a.url;
    img.alt = a.file.name;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.setAttribute('aria-label', a.pdf ? 'PDF entfernen' : 'Foto entfernen');
    remove.innerHTML = '<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 2l6 6M8 2L2 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
    remove.addEventListener('click', () => {
      if (a.url) URL.revokeObjectURL(a.url);
      attachments.splice(i, 1);
      renderAttachments();
    });
    if (a.pdf) el.append(remove); else el.append(img, remove);
    return el;
  }));
}

/* ---------- Spracheingabe ----------
   Läuft, bis man selbst stoppt. Chrome/Edge beenden nach Stille von sich aus –
   dann wird automatisch neu gestartet. */
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let listening = false;
let baseText = '';   // Text, der vor/zwischen den Aufnahme-Abschnitten schon da war
let finalText = '';  // bestätigter Text des aktuellen Abschnitts
let written = '';    // was die Spracheingabe zuletzt ins Feld geschrieben hat
let consumed = 0, seen = 0; // Erkennungs-Ergebnisse: ab hier zählen / bisher gesehen
let hintTimer = null;
// Während des Sprechens selbst etwas löschen oder ändern: das Feld so übernehmen, wie es jetzt ist,
// und bisher Erkanntes nicht wieder einsetzen – nur was danach gesprochen wird, kommt hinten dazu
input.addEventListener('input', () => {
  if (!listening || input.value === written) return;
  baseText = written = input.value; finalText = ''; consumed = seen;
});

/* Sprache: Deutsch als Basis. Die Browser-Erkennung kann nur eine Sprache pro
   Aufnahme – das deutsche Modell schreibt gängige englische Wörter („Thinking“,
   „Prompt“, „Feature“ …) aber direkt mit. Echtes Mischen → später Whisper in der App. */
const SPEECH_LANG = 'de-DE';

function joinText(a, b) {
  if (!a) return b.trimStart();
  if (!b) return a;
  return /\s$/.test(a) ? a + b.trimStart() : a + ' ' + b.trimStart();
}

function showListening(text, isHint = false) {
  clearTimeout(hintTimer);
  listeningText.textContent = text;
  listeningEl.classList.toggle('hint', isHint);
  listeningEl.classList.add('show');
}
function hideListening() { listeningEl.classList.remove('show'); }
function showHint(text) {
  showListening(text, true);
  hintTimer = setTimeout(hideListening, 3500);
}

function setMicUI(active) {
  micBtn.classList.toggle('active', active);
  micBtn.setAttribute('aria-pressed', String(active));
  const label = active ? 'Sprachaufnahme stoppen' : 'Sprachaufnahme starten';
  micBtn.setAttribute('aria-label', label);
  micBtn.title = label;
}

function startListening() {
  if (!SpeechRecognition) {
    showHint('Spracheingabe: Chrome, Edge oder Safari nutzen');
    return;
  }
  listening = true;
  baseText = written = input.value;
  finalText = ''; consumed = 0; seen = 0;

  recognition = new SpeechRecognition();
  recognition.lang = SPEECH_LANG;
  recognition.continuous = true;
  recognition.interimResults = true;

  recognition.onresult = (e) => {
    if (!listening && !input.value) return; // schon abgeschickt → nichts mehr hineinschreiben
    // nur Ergebnisse ab „consumed“ – was davor lag, steckt schon in baseText (bzw. wurde vom Nutzer gelöscht)
    let fin = '', interim = '';
    for (let i = consumed; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) fin = joinText(fin, r[0].transcript);
      else interim = joinText(interim, r[0].transcript);
    }
    finalText = fin; seen = e.results.length;
    written = input.value = joinText(joinText(baseText, finalText), interim);
    input.dispatchEvent(new Event('dictation')); // Senden-Knopf erscheint, sobald Text da ist (eigenes Ereignis – „input“ würde den Diktier-Stand zurücksetzen)
    autoGrow();
    input.scrollTop = input.scrollHeight;
  };

  recognition.onerror = (e) => {
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
      stopListening();
      showHint('Kein Mikrofon-Zugriff – im Browser erlauben');
    }
  };

  recognition.onend = () => {
    if (!listening) return;
    // Nicht von selbst aufhören: neuen Abschnitt starten
    baseText = joinText(baseText, finalText);
    finalText = ''; consumed = 0; seen = 0; // neuer Abschnitt zählt von vorn
    recognition.lang = SPEECH_LANG;
    try { recognition.start(); } catch {}
  };

  try { recognition.start(); } catch {}
  setMicUI(true);
  showListening('Listening');
}

// hard: beim Abschicken – sofort abbrechen, nichts mehr nachliefern lassen (sonst schreibt die Erkennung Reste ins geleerte Feld)
function stopListening(hard = false) {
  listening = false;
  if (recognition) {
    if (hard) { recognition.onresult = null; recognition.onend = null; recognition.onerror = null; try { recognition.abort(); } catch {} recognition = null; }
    else recognition.stop();
  }
  setMicUI(false);
  hideListening();
}

micBtn.addEventListener('click', () => (listening ? stopListening() : startListening()));

autoGrow();

/* ===================================================================
   Chat mit echter KI
   - schickt den Verlauf an server.js (der hält die API-Keys)
   - zeigt die echten Arbeitsstufen (Analyse, Quellensuche, Prüfung) und die Quellen
   - Antworten mit Markdown + Formeln (LaTeX), Rückfragen im Eingabefeld
   =================================================================== */
const chat = $('chat');
const chatScroll = $('chatScroll');
// Das Eingabefeld schwebt über dem Chat → unten so viel Platz lassen, wie es hoch ist
const composerArea = document.querySelector('.composer-area');
new ResizeObserver(() => chatScroll.style.setProperty('--composer-space', composerArea.offsetHeight + 'px')).observe(composerArea);
const sendBtn = $('sendBtn');
const MAX_VISIBLE_IMAGES = 4;   // ab 5 Bildern: 3 zeigen + Kachel „+N“
// Material (Fotos, PDFs) bleibt im ganzen Chat verfügbar – mitgeschickt werden die neuesten Anhänge, höchstens 8 Dateien / ~12 MB
const MATERIAL_MAX_FILES = 8, MATERIAL_MAX_BYTES = 12 * 1024 * 1024;
const PDF_MAX_BYTES = 15 * 1024 * 1024;
const history = [];             // { role: 'user' | 'assistant', text, images: [{ mime, data }] }
/* Mehrere Chats können gleichzeitig antworten – unabhängig voneinander. Je Chat-Tab ein eigener Lauf;
   Stopp-Knopf und Rückfragen-Feld zeigen immer nur den Zustand des gerade offenen Chats. */
const runs = new WeakMap(); // Chat-Tab → AbortController der laufenden Antwort
const runOf = (tab = activeTab()) => (tab && runs.get(tab)) || null;
function startRun(tab, controller) { runs.set(tab, controller); if (tab === activeTab()) setRunning(true); window.renderSideChats?.(); }
function endRun(tab, controller) {
  if (runs.get(tab) === controller) runs.delete(tab);
  if (tab === activeTab()) setRunning(false); else saveChats(); // Antwort im Hintergrund fertig → trotzdem sichern
  window.CodeAgent?.refresh(); // Coding-Agent fertig → wartende Vorschau startet jetzt
}
// offene Rückfrage des Chats: { msgEl, work, step, questions } – die Antwort läuft in derselben Nachricht weiter
const pendingOf = (tab = activeTab()) => tab?._pendingAsk || null;

function el(tag, className, html) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (html != null) node.innerHTML = html;
  return node;
}
function icon(id, size = 16) {
  return `<svg width="${size}" height="${size}"><use href="#${id}"/></svg>`;
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* Immer mitscrollen – außer man hat selbst nach oben gescrollt */
function isNearBottom() {
  return chatScroll.scrollHeight - chatScroll.scrollTop - chatScroll.clientHeight < 80;
}
function scrollToBottom(force = false) {
  if (force || isNearBottom()) chatScroll.scrollTop = chatScroll.scrollHeight;
}

/* Eigene Nachricht: Bilder über der Sprechblase */
function addUserMessage(text, images) {
  const msg = el('div', 'msg-out');
  const pdfs = images.filter((i) => i.pdf || i.mime === 'application/pdf');
  images = images.filter((i) => !(i.pdf || i.mime === 'application/pdf'));
  if (pdfs.length) { const row = el('div', 'out-pdfs'); pdfs.forEach((p) => row.append(pdfChip(p.name || 'PDF', 'oi-pdf'))); msg.append(row); }
  if (images.length) {
    const row = el('div', 'out-images');
    const overflow = images.length > MAX_VISIBLE_IMAGES;
    const moreIndex = MAX_VISIBLE_IMAGES - 1; // diese Kachel trägt das „+N“
    images.forEach((img, i) => {
      const tile = el('div', 'oi');
      const image = document.createElement('img');
      image.src = img.url;
      image.alt = img.name;
      tile.append(image);
      if (overflow && i === moreIndex) tile.append(el('div', 'oi-more', `+${images.length - moreIndex}`));
      if (overflow && i > moreIndex) tile.classList.add('is-hidden'); // bleibt für die Großansicht im DOM
      row.append(tile);
    });
    msg.append(row);
  }
  if (text) msg.append(userBubble(text, 'out-bubble'));
  chat.append(msg);
  scrollToBottom(true);
}

/* Eigene Nachricht als Blase. Lange Nachrichten (nur die eigenen, nie die der KI) sind eingeklappt:
   die ersten Zeilen sichtbar, unten weich ausgeblendet, darunter „Mehr anzeigen“ – Klick klappt weich auf/zu. */
const LONG_MSG_CHARS = 500, LONG_MSG_LINES = 8;
function userBubble(text, cls) {
  const bubble = el('div', cls);
  const long = text.length > LONG_MSG_CHARS || text.split('\n').length > LONG_MSG_LINES;
  if (!long) { bubble.innerHTML = escapeHtml(text); return bubble; }
  bubble.classList.add('ub-long', 'ub-clamped');
  const body = el('div', 'ub-text', escapeHtml(text));
  const more = el('button', 'ub-more', 'Mehr anzeigen');
  more.type = 'button';
  more.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = bubble.classList.contains('ub-clamped');
    const from = body.offsetHeight;
    bubble.classList.toggle('ub-clamped', !open);
    more.textContent = open ? 'Weniger anzeigen' : 'Mehr anzeigen';
    const to = body.offsetHeight;
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) body.animate([{ height: `${from}px` }, { height: `${to}px` }], { duration: 380, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' });
  });
  bubble.append(body, more);
  return bubble;
}

/* ---------- Markdown + Formeln → sicheres HTML ---------- */
/* Rückfragen-Block der KI (```ask … ```) – wird nicht als Text gezeigt, sondern als Fragefeld */
const ASK_BLOCK = /```ask\s*([\s\S]*?)(```|$)/;
/* Agent-Empfehlung der KI (```agent {"agent":"code"}```) – erscheint als Karte zum Wechseln, nicht als Text */
const AGENT_BLOCK = /```agent\s*([\s\S]*?)(```|$)/g;
const AGENT_NAMES = { general: 'Allgemein', research: 'Research', learn: 'Lernen', code: 'Coden', boerse: 'Börse' };
const AGENT_ROLE = { research: 'Recherche mit Quellen', learn: 'Erklären und Lernen', code: 'Programmieren', boerse: 'Aktien und Planspiel Börse' };
function parseAgentBlock(text) {
  const m = String(text || '').match(/```agent\s*([\s\S]*?)```/);
  if (!m) return null;
  try { const id = JSON.parse(m[1]).agent; return AGENT_NAMES[id] && id !== window.PixelDogs?.mode ? id : null; } catch { return null; }
}
// Karte: Hund + „Dafür ist … da“ + Knopf „Zu … wechseln“ → wechselt den Hund und stellt die Frage dort neu
function agentSuggestCard(msgEl, id) {
  const card = el('div', 'agent-suggest');
  card.innerHTML = '<span class="as-dog"></span><span class="as-text"><strong></strong><span></span></span>';
  card.querySelector('.as-dog').innerHTML = window.PixelDogs?.svg(id, 32) || '';
  card.querySelector('strong').textContent = 'Dafür ist ' + AGENT_NAMES[id] + ' da';
  card.querySelector('.as-text span').textContent = AGENT_ROLE[id] + ' – soll ich wechseln und die Frage dort stellen?';
  const go = el('button', 'as-go', 'Zu ' + AGENT_NAMES[id] + ' wechseln');
  go.type = 'button';
  go.addEventListener('click', () => {
    if (runOf()) return;
    card.classList.add('chosen');
    window.PixelDogs?.select(id); // Hund wechselt (abtauchen, neuer kommt hoch)
    setTimeout(() => regenerate(msgEl), 420); // gleiche Frage, jetzt mit dem passenden Agenten
  });
  card.append(go);
  return card;
}
/* Empfehlung schon beim Tippen: passt der Text klar zu einem anderen Agenten als dem gewählten, erscheint über dem Eingabefeld
   eine kleine Karte („Passt besser zu Coden“ + Wechseln). Beim Allgemein-Agenten nie – der kann alles. */
const AGENT_HINTS = {
  code: /(programmier|\bcod(e|en|ing)\b|skript|script|quellcode|\bbug|fehler im code|debug|javascript|typescript|python|\bhtml\b|\bcss\b|\bjava\b|c\+\+|c#|\bsql\b|\bapi\b|\blua\b|roblox studio|unity|godot|\bapp (bauen|programmieren|entwickeln)|website (bauen|programmieren|erstellen)|spiel (programmieren|bauen|entwickeln)|game (programmieren|bauen|entwickeln)|funktion schreiben|kompilier|syntax)/i,
  research: /(recherchier|quellen|studien?\b|wissenschaftlich|belege|forschung|aktuelle (daten|zahlen|lage)|statistik zu|faktencheck|stimmt es, dass)/i,
  boerse: /(\baktien?\b|-aktie\b|börse|boerse|mein depot|planspiel|\bdax\b|nasdaq|\betf\b|kursziel|stop-?loss|investier|einsteigen|aussteigen|dividende|charts?\b.*(aktie|kurs))/i,
  learn: /(präsentation|praesentation|powerpoint|keynote|\bfolien\b|hausaufgabe|arbeitsblatt|klausur|klassenarbeit|prüfung|lernzettel|abfragen|üben|erklär(e|en)? mir|versteh(e)? (ich )?nicht|schulstoff|lerne?n? für)/i,
};
function agentFor(text, current) {
  if (!current || current === 'general') return null;
  if (AGENT_HINTS[current]?.test(text)) return null; // passt zum gewählten Agenten
  return Object.keys(AGENT_HINTS).find((id) => id !== current && !window.PixelDogs?.UNAVAILABLE?.has(id) && AGENT_HINTS[id].test(text)) || null; // gesperrte Agenten nie vorschlagen
}
const agentHint = el('div', 'agent-hint');
agentHint.hidden = true;
let agentHintFor = null, agentHintOff = new Set(); // weggeklickte Empfehlungen gelten bis das Feld leer ist
function updateAgentHint() {
  const text = input.value.trim();
  if (!text) agentHintOff.clear();
  const id = text.length >= 10 ? agentFor(text, window.PixelDogs?.mode) : null;
  if (!id || agentHintOff.has(id) || composer.classList.contains('asking')) { agentHint.hidden = true; agentHintFor = null; return; }
  if (id === agentHintFor && !agentHint.hidden) return;
  agentHintFor = id;
  agentHint.innerHTML = `<span class="ah-dog">${window.PixelDogs?.svg(id, 20) || ''}</span><span class="ah-text">Passt besser zu <strong>${AGENT_NAMES[id]}</strong> · ${AGENT_ROLE[id]}</span>`
    + '<button type="button" class="ah-go">Wechseln</button><button type="button" class="ah-x" aria-label="Empfehlung ausblenden" title="Ausblenden"><svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 2l6 6M8 2L2 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></button>';
  agentHint.hidden = false;
}
agentHint.addEventListener('click', (e) => {
  if (e.target.closest('.ah-go') && agentHintFor) { window.PixelDogs?.select(agentHintFor); agentHint.hidden = true; agentHintFor = null; input.focus(); }
  else if (e.target.closest('.ah-x') && agentHintFor) { agentHintOff.add(agentHintFor); agentHint.hidden = true; agentHintFor = null; input.focus(); }
});
{
  let t = null;
  composer.prepend(agentHint);
  input.addEventListener('input', () => { clearTimeout(t); t = setTimeout(updateAgentHint, 350); });
  composer.addEventListener('submit', () => { agentHint.hidden = true; agentHintFor = null; agentHintOff.clear(); }, true);
  document.addEventListener('dogmodechange', updateAgentHint); // nach einem Wechsel neu prüfen
}
function stripAskBlock(text) { return text.replace(ASK_BLOCK, '').trimEnd(); }
function parseAskBlock(text) {
  const m = text.match(/```ask\s*([\s\S]*?)```/);
  if (!m) return null;
  try {
    const qs = JSON.parse(m[1]).questions;
    const valid = (Array.isArray(qs) ? qs : []).filter((q) => q && q.question).slice(0, 6).map((q) => ({
      question: String(q.question),
      options: (Array.isArray(q.options) ? q.options : []).map(String).filter(Boolean).slice(0, 6),
      multi: !!q.multi,
    }));
    return valid.length ? valid : null;
  } catch { return null; }
}

const svgNode = (tag, attrs = {}, content = '') => {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, String(value)));
  if (content !== '') node.textContent = content;
  return node;
};
const chartValue = (value, unit) => {
  // große Zahlen lesbar: 3,85 Mio. · 1,2 Mrd. · 773.068
  const abs = Math.abs(value);
  const num = abs >= 1e9 ? `${(value / 1e9).toLocaleString('de-DE', { maximumFractionDigits: 2 })} Mrd.`
    : abs >= 1e6 ? `${(value / 1e6).toLocaleString('de-DE', { maximumFractionDigits: 2 })} Mio.`
      : value.toLocaleString('de-DE', { maximumFractionDigits: 2 });
  return `${num}${unit ? ` ${unit}` : ''}`;
};
/* Diagramme im festgelegten Stil (README.md): Grau + Blau-Akzent, ruhige Animationen, Werte beim Drüberfahren */
const CHART_ACC = '#2f86ff';
// Ring: kräftiges Blau → helles Blau → Blaugrau; gut unterscheidbar, aber ruhig
const CHART_RING = ['#3d8bff', '#7bb2ff', '#b9d5ff', '#6b7a90', '#8d9bb0', '#4a5466', '#c3cad6', '#3a414d'];
const chartShort = (t, k) => (t.length > k ? `${t.slice(0, k - 1)}…` : t);
function chartSmooth(pts) {
  return pts.map(([x, y], i) => {
    if (!i) return `M${x},${y}`;
    const [px, py] = pts[i - 1], [ppx, ppy] = pts[i - 2] || pts[i - 1], [nx, ny] = pts[i + 1] || [x, y];
    return `C${px + (x - ppx) / 6},${py + (y - ppy) / 6} ${x - (nx - px) / 6},${y - (ny - py) / 6} ${x},${y}`;
  }).join(' ');
}
/* Seitlich scrollbarer Bereich für breite Diagramme: Mausrad, Wischen oder mit gedrückter Maus ziehen; weiche Kanten zeigen, dass es weitergeht */
function chartScroller(inner) {
  const sc = el('div', 'cv-scroll');
  sc.append(inner);
  const edges = () => {
    const max = sc.scrollWidth - sc.clientWidth;
    sc.classList.toggle('more-l', sc.scrollLeft > 2);
    sc.classList.toggle('more-r', max > 2 && sc.scrollLeft < max - 2);
  };
  sc.addEventListener('scroll', edges, { passive: true });
  new ResizeObserver(edges).observe(sc);
  let drag = null;
  sc.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse' && e.button === 0 && sc.scrollWidth > sc.clientWidth) drag = { x: e.clientX, left: sc.scrollLeft, moved: false }; });
  sc.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    if (!drag.moved && Math.abs(dx) < 4) return;
    if (!drag.moved) { drag.moved = true; sc.classList.add('dragging'); sc.setPointerCapture(e.pointerId); }
    sc.scrollLeft = drag.left - dx;
  });
  const end = () => { if (drag) { drag = null; sc.classList.remove('dragging'); } };
  sc.addEventListener('pointerup', end);
  sc.addEventListener('pointercancel', end);
  return sc;
}
function chartFigure(data) {
  const figure = el('figure', `chat-chart chart-${data.type}`);
  const n = data.labels.length;
  const total = data.values.reduce((x, y) => x + y, 0);
  const best = data.values.indexOf(Math.max(...data.values));
  const cap = el('figcaption', 'chart-title');
  cap.append(document.createTextNode(data.title));
  figure.append(cap);

  if (data.type === 'donut') {
    // dünner Ring, Mitte zeigt Summe bzw. den Wert des Fachs unter der Maus
    const pct = data.unit.trim() === '%';
    // dickerer Ring mit runden Enden und kleinen Lücken (runde Enden ragen je SW/2 über → in die Lücke einrechnen)
    const R = 62, SW = 14, L = 2 * Math.PI * R, gap = n > 1 ? 5 + SW : 0;
    const box = el('div', 'cv-ring');
    const rg = el('div', 'cv-rg');
    const svg = svgNode('svg', { viewBox: '0 0 160 160', width: 160, height: 160, role: 'img', 'aria-label': `${data.title}: ${data.labels.map((l, i) => `${l} ${chartValue(data.values[i], data.unit)}`).join(', ')}` });
    let off = 0;
    data.values.forEach((value, i) => {
      const len = total ? (value / total) * L : 0;
      const arc = svgNode('circle', { class: 'cv-arc', 'data-i': i, cx: 80, cy: 80, r: R, fill: 'none', stroke: CHART_RING[i % CHART_RING.length], 'stroke-width': SW, 'stroke-linecap': len > gap ? 'round' : 'butt', 'stroke-dasharray': `${len > gap ? len - gap : Math.max(1, len - 5)} ${L}`, 'stroke-dashoffset': -(off + (len > gap ? gap / 2 : 2.5)), transform: 'rotate(-90 80 80)' });
      arc.style.animationDelay = `${i * 70}ms`;
      svg.append(arc);
      off += len;
    });
    const center = el('div', 'cv-rc');
    const cv = el('b', '', pct ? chartValue(data.values[best], '%') : chartValue(total, data.unit));
    const cl = el('span', '', pct ? escapeHtml(chartShort(data.labels[best], 16)) : 'Gesamt');
    center.append(cv, cl);
    rg.append(svg, center);
    // Zahl in der Mitte muss in den Ring passen: Schrift schrittweise kleiner, bis sie in die Innenfläche passt
    const fit = () => {
      cv.style.fontSize = '';
      let size = parseFloat(getComputedStyle(cv).fontSize) || 16;
      while (cv.scrollWidth > cv.clientWidth && size > 10) { size -= 1; cv.style.fontSize = `${size}px`; }
    };
    new ResizeObserver(fit).observe(center);
    const list = el('div', 'cv-rl');
    data.labels.forEach((label, i) => {
      const row = el('div', 'cv-rr');
      row.dataset.i = i;
      const share = total ? Math.round((data.values[i] / total) * 100) : 0;
      row.innerHTML = `<i style="background:${CHART_RING[i % CHART_RING.length]}"></i><span></span><b></b><em>${pct ? '' : `${share} %`}</em>`;
      row.querySelector('span').textContent = label;
      row.querySelector('b').textContent = chartValue(data.values[i], data.unit);
      list.append(row);
    });
    box.append(rg, list);
    // lange Liste: scrollt nur, wenn sie höher als der Ring ist – weiche Kanten zeigen, dass es weitergeht
    const edges = () => {
      const more = list.scrollHeight - list.clientHeight;
      list.classList.toggle('more-t', list.scrollTop > 2);
      list.classList.toggle('more-b', more > 2 && list.scrollTop < more - 2);
    };
    list.addEventListener('scroll', edges, { passive: true });
    new ResizeObserver(edges).observe(list);
    let cur = null, t = 0;
    const focus = (i) => {
      if (i === cur) return;
      cur = i;
      box.classList.toggle('focus', i != null);
      box.querySelectorAll('[data-i]').forEach((x) => x.classList.toggle('on', x.dataset.i === String(i)));
      cv.textContent = i == null ? (pct ? chartValue(data.values[best], '%') : chartValue(total, data.unit)) : chartValue(data.values[i], data.unit);
      cl.textContent = i == null ? (pct ? chartShort(data.labels[best], 16) : 'Gesamt') : chartShort(data.labels[i], 16);
      fit();
    };
    box.addEventListener('pointerover', (e) => { const x = e.target.closest('[data-i]'); if (!x) return; clearTimeout(t); focus(+x.dataset.i); });
    box.addEventListener('pointerout', (e) => { if (!e.relatedTarget?.closest?.('[data-i]')) { clearTimeout(t); t = setTimeout(() => focus(null), 90); } });
    figure.append(box);
  } else if (data.type === 'hbar') {
    // Rangliste: sortiert, größter Wert blau, Rest grau
    const order = data.values.map((v, i) => i).sort((a, b) => data.values[b] - data.values[a]);
    const max = Math.max(...data.values.map((v) => Math.abs(v)), 0) || 1;
    const rank = el('div', 'cv-rank');
    order.forEach((i, k) => {
      const row = el('div', `cv-rk${i === best ? ' best' : ''}`);
      row.innerHTML = '<span class="cv-rt"></span><span class="cv-rbar"><i></i></span><b></b>';
      row.querySelector('.cv-rt').textContent = data.labels[i];
      row.querySelector('.cv-rbar i').style.width = `${Math.max(2, (Math.abs(data.values[i]) / max) * 100)}%`;
      row.querySelector('.cv-rbar i').style.animationDelay = `${k * 60}ms`;
      row.querySelector('b').textContent = chartValue(data.values[i], data.unit);
      rank.append(row);
    });
    figure.append(rank);
  } else {
    // Breite wächst mit der Zahl der Werte (mind. 56 px je Wert). Reicht der Platz nicht, wird seitlich gescrollt statt gequetscht.
    const W = Math.max(560, n * 56), H = 200, padB = 24, top = 22;
    const wrap = el('div', 'cv-rel');
    wrap.style.minWidth = `${Math.round(W * (n > 8 ? 0.95 : 0.6))}px`;
    const tip = el('div', 'cv-tip');
    const svg = svgNode('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `${data.title}: ${data.labels.map((l, i) => `${l} ${chartValue(data.values[i], data.unit)}`).join(', ')}` });
    const showTip = (x, y, i) => {
      const b = svg.getBoundingClientRect();
      tip.innerHTML = '<b></b><span></span>';
      tip.querySelector('b').textContent = chartValue(data.values[i], data.unit);
      tip.querySelector('span').textContent = data.labels[i];
      tip.style.left = `${(x / W) * b.width}px`;
      tip.style.top = `${(y / H) * b.height}px`;
      tip.classList.add('show');
    };
    // Linie bzw. Fläche: weich, mit auslaufender Fläche darunter
    const mn = Math.min(...data.values), mx = Math.max(...data.values), pad = (mx - mn || Math.abs(mx) || 1) * 0.25;
    const low = mn >= 0 && mn - pad < 0 ? 0 : mn - pad, high = mx + pad;
    const yOf = (v) => top + (H - top - padB) * (1 - (v - low) / (high - low || 1));
    const xOf = (i) => 20 + i * ((W - 40) / Math.max(1, n - 1));
    const pts = data.values.map((v, i) => [xOf(i), yOf(v)]);
    const d = chartSmooth(pts);
    const uid = Math.random().toString(36).slice(2, 8);
    const defs = svgNode('defs');
    const grad = svgNode('linearGradient', { id: `cva${uid}`, x1: 0, y1: 0, x2: 0, y2: 1 });
    grad.append(svgNode('stop', { offset: '0%', 'stop-color': CHART_ACC, 'stop-opacity': 0.22 }), svgNode('stop', { offset: '100%', 'stop-color': CHART_ACC, 'stop-opacity': 0 }));
    defs.append(grad);
    svg.append(defs, svgNode('path', { class: 'cv-area', d: `${d} L${pts[n - 1][0]},${H - padB} L${pts[0][0]},${H - padB} Z`, fill: `url(#cva${uid})` }));
    svg.append(svgNode('path', { class: 'cv-line', d, fill: 'none', stroke: CHART_ACC, 'stroke-width': 2, 'stroke-linecap': 'round', pathLength: 1 }));
    data.labels.forEach((label, i) => svg.append(svgNode('text', { class: 'cv-lab', x: xOf(i), y: H - 6, 'text-anchor': 'middle' }, chartShort(label, 10))));
    const hl = svgNode('line', { class: 'cv-hl', x1: 0, x2: 0, y1: top - 6, y2: H - padB });
    const hd = svgNode('circle', { class: 'cv-hd', r: 4, fill: '#101010', stroke: CHART_ACC, 'stroke-width': 2 });
    svg.append(hl, hd);
    svg.addEventListener('pointermove', (e) => {
      const b = svg.getBoundingClientRect(), x = ((e.clientX - b.left) / b.width) * W;
      const i = Math.max(0, Math.min(n - 1, Math.round((x - 20) / ((W - 40) / Math.max(1, n - 1)))));
      const [px, py] = pts[i];
      hl.setAttribute('x1', px); hl.setAttribute('x2', px); hd.setAttribute('cx', px); hd.setAttribute('cy', py);
      svg.classList.add('cv-hover');
      showTip(px, py, i);
    });
    svg.addEventListener('pointerleave', () => { svg.classList.remove('cv-hover'); tip.classList.remove('show'); });
    wrap.append(svg, tip);
    figure.append(chartScroller(wrap));
  }
  // keine „Quelle: …“-Zeile – die genutzten Quellen stehen als Kästchen unter der Antwort
  return figure;
}

/* Zeitstrahl (README.md): links die Linie mit Punkt, daneben das Kästchen (ohne Fläche, feiner Rand) – darin links das Datum, rechts der Titel.
   Klick klappt Text und Stichpunkte IM selben Kästchen weich auf (nur die Höhe läuft); mehrere können offen sein. Keine Obergrenze. */
function timelineFigure(data) {
  const figure = el('figure', 'chat-timeline tl4');
  if (data.title) { const h = el('figcaption', 'tl4-head'); h.textContent = data.title; figure.append(h); }
  const longest = Math.max(...data.events.map((e) => e.date.length));
  figure.style.setProperty('--tl-dw', `${Math.round(Math.min(150, Math.max(44, longest * 7.4 + 6)))}px`);
  const list = el('div', 'tl4-list');
  data.events.forEach((e, i) => {
    const row = el('div', 'tl4-row');
    row.style.animationDelay = `${Math.min(i, 14) * 45}ms`;
    const rail = el('div', 'tl4-rail', '<i class="tl4-dot"></i>');
    const box = el('div', 'tl4-box');
    const has = !!(e.text || e.points.length);
    const head = el(has ? 'button' : 'div', 'tl4-h');
    if (has) { head.type = 'button'; head.setAttribute('aria-expanded', 'false'); }
    head.innerHTML = `<span class="tl4-date"></span><span class="tl4-t"></span>${has ? icon('f-chevron-down', 12).replace('<svg', '<svg class="tl4-chev"') : ''}`;
    head.querySelector('.tl4-date').textContent = e.date;
    head.querySelector('.tl4-t').textContent = e.title;
    box.append(head);
    if (has) {
      const more = el('div', 'tl4-more'), inner = el('div', 'tl4-mi');
      if (e.text) { const p = el('p'); p.textContent = e.text; inner.append(p); }
      if (e.points.length) { const ul = el('ul'); e.points.forEach((x) => { const li = el('li'); li.textContent = x; ul.append(li); }); inner.append(ul); }
      more.append(inner); box.append(more);
    }
    row.append(rail, box);
    list.append(row);
  });
  figure.append(list);
  const toggle = (row) => {
    const more = row.querySelector('.tl4-more'); if (!more) return;
    const open = !row.classList.contains('open'), from = more.offsetHeight;
    more.getAnimations().forEach((a) => a.cancel());
    row.classList.toggle('open', open);
    row.querySelector('.tl4-h').setAttribute('aria-expanded', String(open));
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    more.animate([{ height: `${from}px` }, { height: `${more.offsetHeight}px` }], { duration: open ? 400 : 300, easing: open ? 'cubic-bezier(0.32, 0.72, 0, 1)' : 'cubic-bezier(0.4, 0, 0.2, 1)' });
  };
  list.addEventListener('mousedown', (ev) => { if (ev.detail > 1 && ev.target.closest('.tl4-h')) ev.preventDefault(); }); // Doppelklick markiert keinen Text
  list.addEventListener('click', (ev) => { const h = ev.target.closest('button.tl4-h'); if (h) toggle(h.closest('.tl4-row')); });
  return figure;
}
/* Mindmap im festgelegten Stil (README.md): Thema in der Mitte, Äste links/rechts ohne Kästen,
   Unterpunkte als Liste, feine graue Verbindungen – werden nach dem Einfügen vermessen und gezeichnet */
/* Hefteintrag: Kasten „So kommt es ins Heft“, darin Karopapier; „# …“ = Überschrift, „> …“ = Merkkasten, leere Zeile = Abstand.
   Die Formeln ($…$) sind beim Aufruf schon von KaTeX gesetzt (stehen als HTML im Code-Element). */
function heftFigure(code) {
  const fig = el('figure', 'heft');
  fig.dataset.viz = 'heft';
  fig.dataset.raw = code.textContent;
  fig.append(el('figcaption', 'heft-head', `${FadeIcons.svg('pencil', 13)}<span>So kommt es ins Heft</span>`));
  const page = el('div', 'heft-page');
  const lines = code.innerHTML.replace(/\n+$/, '').split('\n');
  while (lines.length && !lines[0].trim()) lines.shift();
  lines.forEach((line) => {
    const t = line.trim();
    if (!t) { page.append(el('div', 'heft-gap')); return; }
    if (/^#{1,3}\s/.test(t)) { page.append(el('div', 'heft-title', t.replace(/^#{1,3}\s+/, ''))); return; }
    if (/^&gt;\s?/.test(t)) { page.append(el('div', 'heft-line heft-note', t.replace(/^&gt;\s?/, ''))); return; }
    page.append(el('div', 'heft-line', line.replace(/^\s+/, (sp) => '&nbsp;'.repeat(sp.length))));
  });
  fig.append(page);
  return fig;
}
/* Mindmap als Baum (README.md): Thema in der Mitte, Äste links und rechts, jeder Unterpunkt ein eigenes Kästchen; Linien laufen
   immer von Kästchen-Rand zu Kästchen-Rand durch die freie Spalte dazwischen (nie durch ein Kästchen). Kästchen ohne Fläche, feiner Rand.
   Zoomen (−/+, Strg/⌘ + Mausrad, zwei Finger), Verschieben (ziehen), Prozent-Knopf = alles einpassen, Vollbild für große Mindmaps.
   Schmal (iPhone): alle Äste rechts. */
function mindmapFigure(data) {
  const figure = el('figure', 'chat-mindmap mm4');
  figure.setAttribute('aria-label', `Mindmap ${data.center}: ${data.branches.map((b) => b.label).join(', ')}`);
  const tools = el('div', 'mm4-tools', `<button type="button" data-z="out" aria-label="Verkleinern" title="Verkleinern">${FadeIcons.svg('minus', 11)}</button>`
    + '<button type="button" class="mm4-pct" data-z="fit" title="Alles einpassen">100 %</button>'
    + `<button type="button" data-z="in" aria-label="Vergrößern" title="Vergrößern">${FadeIcons.svg('plus', 11)}</button>`
    + `<button type="button" data-z="full" aria-label="Vollbild" title="Vollbild">${FadeIcons.svg('expand', 11)}</button>`);
  const view = el('div', 'mm4-view');
  const stage = el('div', 'mm4-stage');
  const svg = svgNode('svg', { class: 'mm4-lines', 'aria-hidden': 'true' });
  stage.append(svg);
  view.append(stage, tools); // Zoom-Leiste sitzt klein oben rechts IM Kasten
  figure.append(view);
  // Knoten anlegen (Maße erst, wenn die Mindmap im Chat steht)
  const all = [];
  const make = (n, depth, i) => {
    const box = el('div', `mm4-n d${Math.min(depth, 3)}${n.text ? ' has-text' : ''}`);
    const b = el('b'); b.textContent = n.label; box.append(b);
    if (n.text) { const p = el('p'); p.textContent = n.text; box.append(p); }
    box.style.animationDelay = `${depth * 110 + Math.min(i, 8) * 25}ms`;
    stage.append(box);
    const node = { el: box, depth, children: [] };
    all.push(node);
    node.children = (n.children || []).map((c, k) => make(c, depth + 1, k));
    return node;
  };
  const root = make({ label: data.center, children: data.branches }, 0, 0);
  const GX1 = 58, GX = 40, GY1 = 18, GY = 10, PAD = 18;
  let W = 0, H = 0, laid = null;
  const layout = (narrow) => {
    all.forEach((n) => { n.w = n.el.offsetWidth; n.h = n.el.offsetHeight; n.sh = null; });
    const gapY = (n) => (n.depth === 0 ? GY1 : GY);
    const sh = (n) => (n.sh ??= Math.max(n.h, n.children.reduce((t, c) => t + sh(c), 0) + gapY(n) * Math.max(0, n.children.length - 1)));
    const place = (n, x, top, dir) => {
      n.dir = dir; n.x = dir > 0 ? x : x - n.w;
      const kids = n.children.reduce((t, c) => t + sh(c), 0) + GY * Math.max(0, n.children.length - 1), span = Math.max(n.h, kids);
      n.y = top + (span - n.h) / 2;
      let y = top + (span - kids) / 2;
      const cx = dir > 0 ? n.x + n.w + GX : n.x - GX;
      n.children.forEach((c) => { place(c, cx, y, dir); y += sh(c) + GY; });
    };
    // Äste auf die Seiten verteilen: immer auf die gerade kürzere (Reihenfolge bleibt), schmal alle rechts
    const R = [], L = []; let hr = 0, hl = 0;
    root.children.forEach((b) => { if (narrow || hr <= hl) { R.push(b); hr += sh(b) + GY1; } else { L.push(b); hl += sh(b) + GY1; } });
    const side = (list) => list.reduce((t, c) => t + sh(c), 0) + GY1 * Math.max(0, list.length - 1);
    const total = Math.max(side(R), side(L), root.h);
    root.x = 0; root.y = (total - root.h) / 2; root.dir = 0;
    let y = (total - side(R)) / 2; R.forEach((b) => { place(b, root.w + GX1, y, 1); y += sh(b) + GY1; });
    y = (total - side(L)) / 2; L.forEach((b) => { place(b, -GX1, y, -1); y += sh(b) + GY1; });
    const minX = Math.min(...all.map((n) => n.x)), maxX = Math.max(...all.map((n) => n.x + n.w));
    const TOP = 36; // oben Platz für die Zoom-Leiste
    W = maxX - minX + PAD * 2; H = total + TOP + PAD;
    all.forEach((n) => { n.x += PAD - minX; n.y += TOP; n.el.style.left = `${n.x}px`; n.el.style.top = `${n.y}px`; });
    stage.style.width = `${W}px`; stage.style.height = `${H}px`;
    svg.setAttribute('width', W); svg.setAttribute('height', H); svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    // Linien: vom Rand des Elternteils (Mitte) zum Rand des Kindes (Mitte), weiche Kurve in der freien Spalte
    const paths = [];
    const link = (p, c) => {
      const dir = c.dir, x1 = dir > 0 ? p.x + p.w : p.x, x2 = dir > 0 ? c.x : c.x + c.w;
      const y1 = p.y + p.h / 2, y2 = c.y + c.h / 2, m = (x1 + x2) / 2;
      const path = svgNode('path', { d: `M${x1},${y1} C${m},${y1} ${m},${y2} ${x2},${y2}`, class: `mm4-l d${Math.min(c.depth, 3)}`, pathLength: 1 });
      path.style.animationDelay = `${c.depth * 110 - 40}ms`;
      paths.push(path);
      c.children.forEach((k) => link(c, k));
    };
    root.children.forEach((b) => link(root, b));
    svg.replaceChildren(...paths);
    laid = narrow;
  };
  // Zoom & Verschieben
  const st = { s: 1, tx: 0, ty: 0, fitS: 1 };
  const pct = tools.querySelector('.mm4-pct');
  const apply = () => { stage.style.transform = `translate(${st.tx}px, ${st.ty}px) scale(${st.s})`; pct.textContent = `${Math.round(st.s * 100)} %`; };
  const overlay = el('div', 'mm4-overlay');
  const full = () => overlay.isConnected;
  // all = alles einpassen (Prozent-Knopf, Vollbild); sonst lesbar starten (mind. 80 %) und auf das Thema mitteln – den Rest zieht man heran
  const fit = (all = false) => {
    const vw = view.clientWidth || 600;
    const maxH = full() ? view.clientHeight : 620;
    const whole = Math.min(1, (vw - 8) / W);
    let s = all || full() ? whole : Math.min(1, Math.max(0.8, whole));
    if (!full() && !all) view.style.height = `${Math.round(Math.max(180, Math.min(H * s + 8, maxH)))}px`;
    const vh = view.clientHeight;
    st.fitS = Math.min(whole, (vh - 4) / H, 1);
    if (all || full()) s = st.fitS;
    st.s = s;
    const cx = root.x + root.w / 2, cy = root.y + root.h / 2;
    st.tx = W * s <= vw ? (vw - W * s) / 2 : laid ? 4 : vw / 2 - cx * s; // schmal (alle Äste rechts): am linken Rand beginnen
    st.ty = H * s <= vh ? (vh - H * s) / 2 : Math.min(0, vh / 2 - cy * s);
    apply();
  };
  const clampS = (s) => Math.max(Math.min(0.25, st.fitS), Math.min(2.5, s));
  const zoomAt = (f, cx, cy) => {
    const s = clampS(st.s * f), k = s / st.s;
    st.tx = cx - (cx - st.tx) * k; st.ty = cy - (cy - st.ty) * k; st.s = s;
    stage.classList.add('smooth'); apply(); clearTimeout(st.sm); st.sm = setTimeout(() => stage.classList.remove('smooth'), 260);
  };
  const center = () => [view.clientWidth / 2, view.clientHeight / 2];
  tools.addEventListener('click', (e) => {
    const z = e.target.closest('[data-z]')?.dataset.z; if (!z) return;
    if (z === 'in') zoomAt(1.25, ...center());
    if (z === 'out') zoomAt(0.8, ...center());
    if (z === 'fit') { stage.classList.add('smooth'); fit(true); setTimeout(() => stage.classList.remove('smooth'), 260); }
    if (z === 'full') toggleFull();
  });
  const onKey = (e) => { if (e.key === 'Escape' && full()) toggleFull(); };
  // Vollbild: Ansicht in eine eigene Ebene direkt unter <body> (fixed klappt in einer animierten Nachricht nicht verlässlich)
  let keep = '';
  const toggleFull = () => {
    const on = !full();
    if (on) { keep = view.style.height; figure.style.height = `${figure.offsetHeight}px`; view.style.height = ''; overlay.append(view); document.body.append(overlay); }
    else { figure.append(view); overlay.remove(); figure.style.height = ''; view.style.height = keep; }
    figure.classList.toggle('full', on); overlay.classList.toggle('full', on);
    document.documentElement.classList.toggle('mm4-lock', on);
    tools.querySelector('[data-z="full"]').innerHTML = FadeIcons.svg(on ? 'shrink' : 'expand', 11);
    if (on) document.addEventListener('keydown', onKey); else document.removeEventListener('keydown', onKey);
    requestAnimationFrame(() => fit(on));
  };
  view.addEventListener('wheel', (e) => {
    if (e.ctrlKey || e.metaKey) { e.preventDefault(); const r = view.getBoundingClientRect(); zoomAt(Math.exp(-e.deltaY * 0.0022), e.clientX - r.left, e.clientY - r.top); }
    else if (full()) { e.preventDefault(); st.tx -= e.deltaX; st.ty -= e.deltaY; apply(); }
  }, { passive: false });
  view.addEventListener('dblclick', (e) => { if (e.target.closest('.mm4-tools')) return; const r = view.getBoundingClientRect(); zoomAt(1.5, e.clientX - r.left, e.clientY - r.top); });
  // ziehen = verschieben; zwei Finger = zoomen
  const pts = new Map(); let last = null;
  const mid = () => { const a = [...pts.values()]; return { x: (a[0].x + a[1].x) / 2, y: (a[0].y + a[1].y) / 2, d: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) }; };
  view.addEventListener('pointerdown', (e) => {
    if ((e.button !== 0 && e.pointerType === 'mouse') || e.target.closest('.mm4-tools')) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); view.setPointerCapture(e.pointerId);
    last = pts.size === 2 ? mid() : { x: e.clientX, y: e.clientY };
    view.classList.add('grab');
  });
  view.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2) {
      const m = mid(), r = view.getBoundingClientRect();
      if (last?.d) { const s = clampS(st.s * (m.d / last.d)), k = s / st.s; st.tx = m.x - r.left - (m.x - r.left - st.tx) * k + (m.x - last.x); st.ty = m.y - r.top - (m.y - r.top - st.ty) * k + (m.y - last.y); st.s = s; apply(); }
      last = m;
    } else if (last) { st.tx += e.clientX - last.x; st.ty += e.clientY - last.y; last = { x: e.clientX, y: e.clientY }; apply(); }
  });
  const up = (e) => { pts.delete(e.pointerId); last = pts.size === 1 ? { ...[...pts.values()][0] } : null; if (!pts.size) view.classList.remove('grab'); };
  view.addEventListener('pointerup', up); view.addEventListener('pointercancel', up);
  // erst messen, wenn sichtbar; bei anderer Breite neu einpassen (Seitenwechsel schmal ↔ breit baut neu auf)
  let lastW = 0;
  new ResizeObserver(() => requestAnimationFrame(() => {
    const vw = view.clientWidth; if (!vw || (Math.abs(vw - lastW) < 2 && laid != null)) return;
    lastW = vw;
    const narrow = vw < 560;
    if (laid !== narrow) layout(narrow);
    fit();
  })).observe(view);
  return figure;
}

/* Bild konnte nicht erstellt werden: ruhiger Rahmen mit Bild-Icon, kurzem Text und „Nochmal versuchen“ (stößt das Bild an derselben Stelle neu an) */
function illustrationError(figure, prompt) {
  const box = el('div', 'ill-error');
  box.innerHTML = `<span class="ie-ico">${FadeIcons.svg('image', 18)}</span><span class="ie-text"><strong>Das Bild konnte gerade nicht erstellt werden</strong><span>Das Bildmodell ist ausgelastet oder nicht erreichbar.</span></span>`;
  const retry = el('button', 'ie-retry', icon('i-refresh', 14) + 'Nochmal versuchen');
  retry.type = 'button';
  retry.addEventListener('click', () => {
    const fresh = illustrationFigure({ prompt, query: figure.dataset.query, alt: figure.dataset.alt, source: figure.dataset.source || '', edit: figure.dataset.edit || '' });
    figure.replaceWith(fresh);
    hydrateIllustration(fresh);
  });
  box.append(retry);
  return box;
}
async function hydrateIllustrations(target, signal) {
  // alle Bilder der Antwort gleichzeitig laden (höchstens zwei)
  await Promise.all([...target.querySelectorAll('.chat-illustration[data-prompt]')].map((figure) => hydrateIllustration(figure, signal)));
}
// SVG (mit eingebettetem Bild und Beschriftung) → JPEG in doppelter Auflösung, damit Kopieren/Speichern alles enthält
function svgToImage(src, scale = 2) {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => {
      try {
        // SVG ohne width/height (ältere gespeicherte Grafiken) meldet nur ~267×150 px → immer mindestens in voller Breite (1024) rastern
        const nw = im.naturalWidth || 1024, nh = im.naturalHeight || 576, base = Math.max(nw, 1024);
        const w = base * scale, h = Math.round(base * nh / nw) * scale;
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        c.getContext('2d').drawImage(im, 0, 0, w, h);
        resolve(c.toDataURL('image/jpeg', 0.92));
      } catch (e) { reject(e); }
    };
    im.onerror = () => reject(new Error('SVG nicht lesbar'));
    im.src = src;
  });
}
/* Bild beim Server anfordern – jedes Bild nur einmal: Steht ein Bild-Block im Text schon vollständig da, startet das Bild,
   während der übrige Text noch geschrieben wird; die Anzeige holt sich danach dieselbe laufende Anfrage. */
const illustrationJobs = new Map(); // "prompt|query|source" → laufende Anfrage (Ergebnis)
/* „wieder verfügbar ab 09:00 Uhr“ / „morgen ab 09:00 Uhr“ / „am 30.10. ab 09:00 Uhr“ */
function limitText(resetAt, what = 'Dein Limit') {
  const t = new Date(Number(resetAt) || Date.now() + 3600000);
  const time = t.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  const day = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((day(t) - day(new Date())) / 86400000);
  const when = diff <= 0 ? `ab ${time} Uhr` : diff === 1 ? `morgen ab ${time} Uhr` : `am ${t.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })} ab ${time} Uhr`;
  return `${what} ist aufgebraucht – wieder verfügbar ${when}.`;
}
const limitNote = (text) => el('div', 'limit-note', `${FadeIcons.svg('hourglass', 14)}<span>${escapeHtml(text)}</span>`);

// edit: Beschreibung eines früheren Bildes, das angepasst werden soll (gleiches Bild, nur die gewünschte Änderung)
function requestIllustration(prompt, query, source, signal, edit = '') {
  const key = `${prompt}|${query}|${source}|${edit}`;
  if (!illustrationJobs.has(key)) {
    // höchstens 4 min warten (Grafik wird gezeichnet, Ersatz über NVIDIA ist langsam) – danach verschwindet der Platzhalter statt ewig zu laden
    const limit = AbortSignal.timeout(240000);
    const job = fetch('/api/illustration', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt, query, source, edit }), signal: signal ? AbortSignal.any([signal, limit]) : limit })
      .then(async (response) => {
        if (response.status === 429) { const j = await response.json().catch(() => ({})); throw Object.assign(new Error('Limit erreicht'), { limit: true, resetAt: j.resetAt }); }
        if (!response.ok) throw new Error('Bild nicht verfügbar');
        return response.json();
      });
    job.catch(() => illustrationJobs.delete(key)); // fehlgeschlagen/gestoppt → beim nächsten Mal neu versuchen
    illustrationJobs.set(key, job);
  }
  return illustrationJobs.get(key);
}
/* Vollständige ```illustration-Blöcke im bisher geschriebenen Text sofort anfordern (höchstens 4 je Antwort, wie beim Zeichnen) */
function prefetchIllustrations(text, signal) {
  [...ChatVisuals.fenceBareIllustrations(text).matchAll(/```illustration[^\n]*\n([\s\S]*?)```/g)].slice(0, 4).forEach((m) => {
    const data = ChatVisuals.illustration(m[1]);
    if (data) requestIllustration(data.prompt, data.query, data.source || '', signal, data.edit || '');
  });
}
async function hydrateIllustration(figure, signal) {
  if (!figure) return;
  const prompt = figure.dataset.prompt;
  const query = figure.dataset.query;
  const source = figure.dataset.source || '';
  const edit = figure.dataset.edit || '';
  delete figure.dataset.prompt;
  try {
    const key = `${prompt}|${query}|${source}|${edit}`;
    const result = await requestIllustration(prompt, query, source, signal, edit);
    illustrationJobs.delete(key); // angezeigt – das Ergebnis nicht im Speicher behalten
    const img = document.createElement('img');
    if (result.source === 'commons') {
      const url = new URL(result.url);
      if (url.protocol !== 'https:' || !/^(upload|thumb)\.wikimedia\.org$/.test(url.hostname)) throw new Error('Bildquelle ungültig');
      img.src = url.href;
    } else {
      if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(result.mime) || !result.data) throw new Error('Bildformat ungültig'); // SVG = von Gemini gezeichnete Lerngrafik (im <img> ohne Skripte)
      img.src = `data:${result.mime};base64,${result.data}`;
      // beschriftete Grafik (SVG) in ein normales Bild umwandeln – so bleibt die Beschriftung beim Kopieren/Speichern erhalten
      if (result.mime === 'image/svg+xml') img.src = await svgToImage(img.src).catch(() => img.src);
    }
    img.alt = figure.dataset.alt;
    // nicht „lazy“: das Bild wird vor dem Einhängen vorbereitet – ein lazy-Bild außerhalb der Seite lädt nie (dann bliebe „Generating picture“ stehen)
    const caption = el('figcaption', '');
    if (result.source === 'commons') {
      caption.textContent = `${result.title ? result.title + ' · ' : ''}${result.author ? result.author + ' · ' : ''}${result.license || 'Freies Bild'} · `;
      const source = document.createElement('a');
      source.href = result.page;
      source.target = '_blank';
      source.rel = 'noopener noreferrer';
      source.textContent = 'Wikimedia Commons';
      caption.append(source);
      if (result.licenseUrl?.startsWith('https://')) {
        const license = document.createElement('a');
        license.href = result.licenseUrl;
        license.target = '_blank';
        license.rel = 'noopener noreferrer';
        license.textContent = ' · Lizenz';
        caption.append(license);
      }
    }
    // erst einblenden, wenn das Bild fertig vorbereitet ist – aber höchstens 2 s warten, dann sofort zeigen
    await Promise.race([img.decode().catch(() => {}), new Promise((r) => setTimeout(r, 2000))]);
    // KI-Bild: einfach das Bild – ohne Rahmen und ohne Unterschrift; Commons-Bilder behalten Quelle und Lizenz
    if (result.source === 'commons') figure.replaceChildren(img, caption);
    else { figure.classList.add('plain'); figure.replaceChildren(img); }
    figure.classList.add('ready');
  } catch (err) {
    // kein Bild verfügbar → kurzer, ruhiger Hinweis statt stillem Verschwinden
    if (signal?.aborted || !figure.isConnected) { figure.remove(); return; }
    figure.classList.add('plain');
    figure.replaceChildren(err?.limit ? limitNote(limitText(err.resetAt, 'Dein Bild-Limit')) : illustrationError(figure, prompt));
  }
}

function renderMarkdown(target, text, opts = {}) {
  text = stripAskBlock(ChatVisuals.fenceBareIllustrations(text)).replace(AGENT_BLOCK, '') // Bild-Auftrag ohne Rahmen → trotzdem als Bild
    .replace(/^[ \t]*\[\[\s*grafik\s*:[^\]\n]*\]\][ \t]*$/gim, '') // alte Grafik-Marker ausblenden
    .replace(/\[\[[^\]\n]*$/, ''); // halb getippter Marker
  // Coding-Agent: Datei- und Terminal-Blöcke werden zu Arbeitsschritten (code-agent.js)
  // nur bei Antworten des Coding-Agenten (bzw. alten Antworten mit Datei-Blöcken) – beim Allgemein-Agenten bleiben z. B. ```terminal-Blöcke normaler Code
  const codeParts = {};
  const codeAnswer = !!target.closest?.('[data-dog="code"]') || /^`{4,}file:/m.test(text);
  if (codeAnswer && window.CodeAgent?.has(text)) text = CodeAgent.mark(text, codeParts);
  const math = [];
  // Formeln vorher herausnehmen, damit Markdown sie nicht zerlegt
  const src = text.replace(/\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|\$([^\s$](?:[^$\n]*?[^\s$\\])?)\$/g,
    (m, a, b, c, d) => {
      math.push({ tex: a ?? b ?? c ?? d, display: a != null || b != null });
      return `@@MATH${math.length - 1}@@`;
    });
  let html;
  if (window.marked && window.DOMPurify) {
    html = DOMPurify.sanitize(marked.parse(window.ChatVisuals?.repairTables ? ChatVisuals.repairTables(src) : src, { gfm: true, breaks: false }));
  } else {
    html = escapeHtml(src).replace(/\n/g, '<br>'); // Fallback ohne Bibliotheken: reiner Text
  }
  html = html.replace(/@@MATH(\d+)@@/g, (_, i) => {
    const m = math[i];
    if (!window.katex) return escapeHtml(m.tex);
    try { return katex.renderToString(m.tex, { displayMode: m.display, throwOnError: false }); }
    catch { return escapeHtml(m.tex); }
  });
  // Belege [1], [2], [1, 3] … werden im Text nicht angezeigt – die Hauptquellen stehen in der Leiste unter der Antwort
  if (opts.sources?.length) html = html.replace(/\s*(?:\[\d{1,2}(?:\s*[,;]\s*\d{1,2})*\](?!\())+/g, '');
  target.innerHTML = html;
  // „Quelle: …“ / „Quellen: …“ / „Literatur:“ als Text am Ende (Absatz, Überschrift + Liste) gehört nicht in die Antwort –
  // die wirklich genutzten Quellen zeigt die App als Kästchen (unten rechts bzw. am letzten Satz)
  const SRC_LINE = /^\s*(quellen?|literatur|referenzen|sources?)\s*(\([^)]*\))?\s*:/i;            // „Quelle: Destatis 2023“
  const SRC_HEAD = /^\s*(quellen?|literatur|literaturverzeichnis|referenzen|sources?)\s*:?\s*$/i;     // Überschrift „Quellen“
  for (let last = target.lastElementChild, n = 0; last && n < 3; last = target.lastElementChild, n++) {
    const t = last.textContent || '', prev = last.previousElementSibling;
    if (last.matches('p') && SRC_LINE.test(t) && t.length < 400) { last.remove(); continue; }
    if (last.matches('ul, ol') && prev?.matches('h1, h2, h3, h4, p') && (SRC_HEAD.test(prev.textContent) || SRC_LINE.test(prev.textContent) && prev.textContent.length < 40)) { prev.remove(); last.remove(); continue; }
    if (last.matches('h1, h2, h3, h4') && SRC_HEAD.test(t)) { last.remove(); continue; }
    break;
  }
  target.querySelectorAll('a').forEach((a) => { a.target = '_blank'; a.rel = 'noopener noreferrer'; });
  // Tabellen: Rahmen + seitliches Scrollen bei vielen Spalten
  target.querySelectorAll('table').forEach((table) => {
    const wrap = el('div', 'table-wrap');
    table.replaceWith(wrap);
    wrap.append(table);
  });
  // jede Grafik merkt sich ihren Quelltext (data-viz/data-raw) → „Ins Dokument“ kann sie mitnehmen
  const tagViz = (node, kind, raw) => { node.dataset.viz = kind; node.dataset.raw = raw; return node; };
  // Zeitstrahl und Mindmap: beim Weiterschreiben dieselbe Darstellung wiederverwenden (aufgeklappter Punkt, Zoom bleiben erhalten)
  const vizCache = (target._vizCache ||= new Map());
  const reuse = (kind, raw, make) => { const k = `${kind}|${raw}`; if (!vizCache.has(k)) { const f = make(); if (f) vizCache.set(k, f); } return vizCache.get(k); };
  target.querySelectorAll('pre:has(code.language-timeline)').forEach((pre) => {
    const raw = pre.querySelector('code').textContent;
    const fig = reuse('timeline', raw, () => { const data = ChatVisuals.timeline(raw); return data ? tagViz(timelineFigure(data), 'timeline', raw) : null; });
    if (fig) pre.replaceWith(fig); else pre.remove();
  });
  target.querySelectorAll('pre:has(code.language-mindmap)').forEach((pre) => {
    const raw = pre.querySelector('code').textContent;
    const fig = reuse('mindmap', raw, () => { const data = ChatVisuals.mindmap(raw); return data ? tagViz(mindmapFigure(data), 'mindmap', raw) : null; });
    if (fig) pre.replaceWith(fig); else pre.remove();
  });
  // Hefteintrag (```heft): nur das, was ins Heft kommt – auf Karopapier, Zeile für Zeile, Formeln schon gesetzt
  target.querySelectorAll('pre:has(code.language-heft)').forEach((pre) => pre.replaceWith(heftFigure(pre.querySelector('code'))));
  // Aktienchart (```stock): Kerzen, Umsatz, Zeiträume, Echtzeitkurs – wie in einer Börsen-App (stock-chart.js)
  target.querySelectorAll('pre:has(code.language-stock)').forEach((pre) => {
    const raw = pre.querySelector('code').textContent, spec = window.StockChart?.parse(raw);
    if (!spec) { pre.remove(); return; }
    // gleicher Chart bleibt beim Weiterschreiben erhalten (kein Neuladen, kein Flackern)
    const keep = (target._stk ||= new Map());
    if (!keep.has(raw)) keep.set(raw, tagViz(StockChart.figure(spec), 'stock', raw));
    pre.replaceWith(keep.get(raw));
  });
  // „Meine Käufe“ (```bestand): Übersicht mit Live-Kursen und Empfehlung – Karte bleibt beim Weiterschreiben dieselbe; ```merken: Bestätigung „Notiert …“
  target.querySelectorAll('pre:has(code.language-bestand)').forEach((pre, i) => {
    if (i || !window.BoerseBestand) { pre.remove(); return; }
    pre.replaceWith(target._bstFig ||= BoerseBestand.figure());
  });
  target.querySelectorAll('pre:has(code.language-merken)').forEach((pre) => {
    if (!window.BoerseBestand) { pre.remove(); return; }
    pre.replaceWith(BoerseBestand.note(pre.querySelector('code').textContent));
  });
  // ```depot gibt es nicht mehr (kein Zugriff aufs Planspiel) – alte Blöcke ausblenden
  target.querySelectorAll('pre:has(code.language-depot)').forEach((pre) => pre.remove());

  // Chancen-Übersicht (```chancen): Kästchen Kaufen / Beobachten / Nicht kaufen (chancen-card.js) – höchstens eine je Antwort
  target.querySelectorAll('pre:has(code.language-chancen)').forEach((pre, i) => {
    if (i || !window.ChancenCard) { pre.remove(); return; }
    const raw = pre.querySelector('code').textContent;
    if (!target._chnFig || target._chnRaw !== raw) { target._chnFig = ChancenCard.figure(raw); target._chnRaw = raw; }
    pre.replaceWith(target._chnFig);
  });
  // Präsentation (```praesentation, Lern-Agent): Folien-Vorschau mit PowerPoint / Keynote / PDF (praesentation.js) – Karte bleibt beim Weiterschreiben
  // ```belege: echte Quellen (vom Server nach der Antwort angehängt) → ersetzen die Quellenliste der Präsentation
  let belege = null;
  target.querySelectorAll('pre:has(code.language-belege)').forEach((pre) => {
    try { const b = JSON.parse(pre.querySelector('code').textContent); if (Array.isArray(b) && b.length) belege = b; } catch {}
    pre.remove();
  });
  target.querySelectorAll('pre:has(code.language-praesentation)').forEach((pre) => {
    if (!window.Praesentation) { pre.remove(); return; }
    let raw = pre.querySelector('code').textContent;
    if (belege) { try { raw = JSON.stringify({ ...JSON.parse(raw), sources: belege }); } catch {} }
    const keep = (target._pz ||= new Map());
    if (!keep.has(raw)) { const ok = !!Praesentation.parse(raw); const f = Praesentation.figure(raw); if (!ok) { pre.replaceWith(f); return; } keep.set(raw, f); }
    pre.replaceWith(keep.get(raw));
  });
  const drawn = new Set(); // dieselbe Zahlenreihe nur einmal zeigen
  target.querySelectorAll('pre:has(code.language-chart)').forEach((pre) => {
    const raw = pre.querySelector('code').textContent, data = ChatVisuals.chart(raw);
    if (data && drawn.has(ChatVisuals.chartKey(data))) { pre.remove(); return; }
    if (data) drawn.add(ChatVisuals.chartKey(data));
    pre.replaceWith(data ? tagViz(chartFigure(data), 'chart', raw) : el('div', 'chart-error', 'Diagramm konnte nicht dargestellt werden.'));
  });
  let illustrationsPlaced = 0;
  const noPictures = !!target.closest?.('[data-dog="code"]'); // Antworten des Coding-Agenten: keine erzeugten Bilder
  target.querySelectorAll('pre:has(code.language-illustration)').forEach((pre) => {
    const raw = pre.querySelector('code').textContent, data = ChatVisuals.illustration(raw);
    if (!data || noPictures || illustrationsPlaced >= 4) { pre.remove(); return; } // bis zu 4 Bilder je Antwort (gleichzeitig erzeugt)
    illustrationsPlaced++;
    pre.replaceWith(tagViz(illustrationFigure(data), 'illustration', raw));
  });
  if (codeParts.parts) CodeAgent.build(target, codeParts);
}
/* Bild entsteht: abgerundete Vierecke in einem geraden Raster, das genau in den 16:9-Rahmen passt (31 × 17, überall gleicher
   Abstand, nichts angeschnitten, kein Zufall) – unsichtbar, bis eine weiche Welle Spalte für Spalte von links nach rechts
   durchfließt (oben minimal früher) und sie kurz aufleuchten lässt: höchstens 9 % Deckkraft. */
let illWaveSvg = '';
function illustrationWave() {
  if (illWaveSvg) return illWaveSvg;
  const W = 1024, H = 576, COLS = 31, ROWS = 17, SIZE = 24, GAP = 8, SWEEP = 2600;
  const ox = (W - COLS * SIZE - (COLS - 1) * GAP) / 2, oy = (H - ROWS * SIZE - (ROWS - 1) * GAP) / 2; // Rand = 20 px rundum
  let tiles = '';
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const delay = Math.round((c / (COLS - 1) * 0.85 + r / (ROWS - 1) * 0.15) * SWEEP);
      tiles += `<rect x="${ox + c * (SIZE + GAP)}" y="${oy + r * (SIZE + GAP)}" width="${SIZE}" height="${SIZE}" rx="6" style="animation-delay:${delay}ms"/>`;
    }
  }
  illWaveSvg = `<div class="ill-frame" aria-hidden="true"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet"><g fill="#fff" fill-opacity="0.09">${tiles}</g></svg></div>`;
  return illWaveSvg;
}
function illustrationFigure(data) {
  const figure = el('figure', 'chat-illustration');
  figure.dataset.prompt = data.prompt;
  figure.dataset.query = data.query;
  figure.dataset.alt = data.alt;
  if (data.source) figure.dataset.source = data.source;
  if (data.edit) figure.dataset.edit = data.edit;
  // während das Bild entsteht: nur eine Zeile mit Lade-Icon (wie „Thinking“), kein Kasten – dann erscheint das Bild
  const pending = el('div', 'illustration-pending', `<span class="shimmer ill-ico"></span><span class="shimmer">${data.source ? 'Searching picture' : 'Generating picture'}</span>`);
  figure.append(pending);
  figure.insertAdjacentHTML('beforeend', illustrationWave());
  sweepRow(pending); // ein durchgehender Lichtstreifen über Icon und Text
  return figure;
}
// Grafiken in Dokumenten: aus dem gespeicherten Quelltext neu zeichnen (gleiche Darstellung wie im Chat)
window.renderDocViz = (kind, raw, host) => {
  if (kind === 'stock') { const spec = window.StockChart?.parse(raw); return spec ? StockChart.figure(spec) : null; }
  const make = { chart: chartFigure, mindmap: mindmapFigure, timeline: timelineFigure, illustration: illustrationFigure }[kind];
  const data = make && ChatVisuals[kind]?.(String(raw || ''));
  if (!data) return null;
  const fig = make(data);
  if (kind === 'illustration' && host) setTimeout(() => hydrateIllustrations(host), 0);
  return fig;
};

/* ---------- Live-Text mit Animation ----------
   Die KI liefert Text in unregelmäßigen Stücken. Statt ruckartig ganze Stücke
   einzusetzen, fließt der Text gleichmäßig herein (wie getippt, bei großem
   Rückstand automatisch schneller). Jeder neue Absatz / Listenpunkt / jede
   Überschrift blendet zusätzlich weich ein. */
const REVEAL_TICK = 24;      // ms zwischen zwei Schritten
const REVEAL_MIN_CHARS = 2;  // mindestens so viele Zeichen pro Schritt (~80 Zeichen/s)
const REVEAL_CATCHUP = 12;   // Rückstand wird in ~12 Schritten aufgeholt
const BLOCK_FADE_MS = 420;   // Dauer des Einblendens neuer Blöcke

function makeRenderer(target, opts = {}) {
  let text = '';        // alles, was bisher angekommen ist
  let shown = 0;        // davon schon sichtbar
  let timer = null;
  let finishWaiters = [];
  const firstSeen = [];  // Zeitpunkt, an dem Block Nr. i zuerst erschien

  const blocksOf = () => target.querySelectorAll(':scope > *, :scope > ul > li, :scope > ol > li');

  const draw = () => {
    renderMarkdown(target, text.slice(0, shown), opts);
    // neue Blöcke weich einblenden – auch über Neuzeichnungen hinweg ohne Flackern
    const now = performance.now();
    blocksOf().forEach((block, i) => {
      if (firstSeen[i] == null) firstSeen[i] = now;
      const age = now - firstSeen[i];
      if (age < BLOCK_FADE_MS) {
        block.classList.add('md-in');
        block.style.animationDelay = `-${Math.round(age)}ms`;
      }
    });
    if (target.scrollHeight > target.clientHeight) target.scrollTop = target.scrollHeight; // Gedanken-Box scrollt mit
    if (chat.contains(target)) scrollToBottom(); // Antwort eines Chats im Hintergrund: offenen Chat nicht verschieben
  };

  const tick = () => {
    const backlog = text.length - shown;
    if (backlog <= 0) {
      timer = null;
      finishWaiters.forEach((resolve) => resolve());
      finishWaiters = [];
      return;
    }
    let step = Math.max(REVEAL_MIN_CHARS, Math.ceil(backlog / REVEAL_CATCHUP));
    // nicht mitten in einer Formel oder einem Wort stoppen, wenn es knapp ist
    const nextSpace = text.slice(shown + step).search(/[\s$]/);
    if (nextSpace >= 0 && nextSpace < 6) step += nextSpace;
    shown = Math.min(text.length, shown + step);
    // Coding-Agent: Datei-/Prüf-/Plan-Blöcke nicht Zeichen für Zeichen eintippen – sobald ein Block ganz da ist, erscheint er auf einmal
    if (window.CodeAgent) shown = CodeAgent.revealTo(text, shown);
    draw();
    timer = setTimeout(tick, REVEAL_TICK);
  };
  const start = () => { if (!timer) timer = setTimeout(tick, 0); };

  return {
    append(t) { text += t; start(); },
    /* sofort alles zeigen (z. B. beim Stoppen) */
    flush() { clearTimeout(timer); timer = null; shown = text.length; draw(); finishWaiters.forEach((r) => r()); finishWaiters = []; },
    /* warten, bis der Rest sauber zu Ende animiert ist */
    finish() { if (shown >= text.length) { draw(); return Promise.resolve(); } start(); return new Promise((r) => finishWaiters.push(r)); },
    get text() { return text; },
  };
}

/* ---------- Fotos fürs Modell vorbereiten (verkleinern, als Base64) ---------- */
async function fileToInline(file, max = 1600) {
  if (file.type === 'application/pdf') {
    const buf = new Uint8Array(await file.arrayBuffer());
    let bin = '';
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return { mime: 'application/pdf', data: btoa(bin), name: file.name };
  }
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; // transparente PNGs bekommen weißen Hintergrund
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return { mime: 'image/jpeg', data: canvas.toDataURL('image/jpeg', 0.9).split(',')[1] };
}

/* Verlauf für die Anfrage: alle Anhänge des Chats (Material), die neuesten zuerst – bis zur Obergrenze; ältere darüber hinaus bleiben weg */
// gespeicherte Gedanken einer Antwort (für den Verlauf) – gehen nicht mit an die KI
// Gedanken und Plan bleiben gespeichert → „Worked for“ zeigt nach dem Neuladen wieder den Plan (zuerst) und die Gedanken
const thoughtsOf = (msgEl) => (msgEl._thoughts?.length || msgEl._plan?.length
  ? { ...(msgEl._thoughts?.length ? { thoughts: msgEl._thoughts } : {}), ...(msgEl._plan?.length ? { plan: msgEl._plan } : {}), workTime: msgEl._workTime } : {});

function historyForRequest(list = history) {
  let files = 0, bytes = 0;
  return list.slice().reverse().map(({ thoughts, workTime, plan, ...m }) => {
    if (!m.images?.length) return m;
    const keep = m.images.filter((img) => {
      const size = Math.round((img.data || '').length * 0.75);
      if (files >= MATERIAL_MAX_FILES || bytes + size > MATERIAL_MAX_BYTES) return false;
      files++; bytes += size; return true;
    });
    return keep.length === m.images.length ? m : { ...m, images: keep };
  }).reverse();
}

/* ---------- Server-Sent Events lesen ---------- */
async function* readSse(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      const block = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      let event = 'message';
      let data = '';
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data += line.slice(5).trim();
      }
      try { yield { event, data: JSON.parse(data || '{}') }; } catch {}
    }
  }
}

/* ---------- Zeitleiste (Working / Worked for) ---------- */
function toggleWork(work, collapse) {
  const body = work.querySelector('.work-body');
  const head = work.querySelector('.work-head');
  clearTimeout(work._heightTimer);
  if (collapse) {
    body.style.height = body.scrollHeight + 'px';
    void body.offsetHeight; // Startwert festschreiben, damit die Animation greift
    work.classList.add('collapsed');
    body.style.height = '0px';
  } else {
    work.classList.remove('collapsed');
    body.style.height = '0px';
    void body.offsetHeight;
    body.style.height = body.scrollHeight + 'px';
    work._heightTimer = setTimeout(() => { if (!work.classList.contains('collapsed')) body.style.height = ''; }, 420);
  }
  head.setAttribute('aria-expanded', String(!collapse));
}

function createWork() {
  const work = el('div', 'work');
  const head = el('button', 'work-head');
  head.type = 'button';
  head.setAttribute('aria-expanded', 'true');
  head.innerHTML = `<span class="act" aria-hidden="true"></span><span class="work-title"></span><span class="t live">1s</span>${icon('i-chevron-down')}`;
  head.querySelector('svg').classList.add('chev');
  const body = el('div', 'work-body');
  const steps = el('div', 'steps');
  body.append(steps);
  work.append(head, body);
  head.addEventListener('click', () => toggleWork(work, !work.classList.contains('collapsed')));
  return { work, steps, head };
}

function stepLine(markerType, html) {
  const step = el('div', 'step');
  const marker = el('span', `marker ${markerType === 'spin' ? '' : 'dot'}`);
  if (markerType === 'spin') marker.append(el('span', 'spinner'));
  step.append(marker, el('div', 'step-line', html));
  return step;
}
function finishStep(step, html) {
  const marker = step.querySelector('.marker');
  marker.className = 'marker dot';
  marker.replaceChildren();
  if (html != null) step.querySelector('.step-line').innerHTML = html;
}
/* Marker als kleines Icon statt Punkt – Lupe bei der Suche, Haken beim Abschluss */
function markerIcon(step, name, cls = '') {
  const marker = step.querySelector('.marker');
  marker.className = `marker ico${cls ? ` ${cls}` : ''}`;
  marker.innerHTML = FadeIcons.svg(name, 12);
}

function setRunning(running) {
  sendBtn.classList.toggle('running', running);
  const label = running ? 'Antwort stoppen' : 'Senden';
  sendBtn.setAttribute('aria-label', label);
  sendBtn.title = label;
  if (!running && typeof saveChats === 'function') saveChats(); // Antwort fertig → Chats sichern
}

/* ---------- Eine Chat-Antwort live anzeigen ----------
   Der Server meldet echte Arbeitsstufen (status-Events) – gezeigt wird nur, was wirklich passiert:
   - Planning: die Analyse legt Vorgehen und Aufwand fest, danach bleibt „Planned the answer“.
   - Thinking: die echten Gedanken des Modells live, danach eingeklappt „Thought for …s“.
   - Quellensuche: die verwendeten Quellen als Chips (max. 2 Reihen, „+N“ öffnet alle Quellen).
   - Entwurf / Prüfung nur, wenn sie wirklich stattfinden.
   Der Aufwand (Effort) wird nicht angezeigt. */
const PENDING_DELAY = 700;    // „Working“-Hinweis, falls noch nichts zu sehen ist
const THINK_SHOW_DELAY = 900; // Thinking erst zeigen, wenn die Analyse nicht sofort fertig ist
const THINK_HOLD_MS = 700;    // geschriebenes Vorgehen kurz stehen lassen, dann „Planned the answer“
const STAGE_TEXT = {
  material: 'Analyzing your sources', // angehängte Fotos/PDFs: passt das Material zur Frage?
  market: 'Checking the charts', // Börsen-Agent: Live-Kurse, Signale, Depot, Marktscan
  browsing: 'Searching sources',
  searching_sources: 'Searching sources',
  processing: 'Drafting the answer',
  verifying: 'Checking facts and sources',
};

const safeUrl = (u) => (/^https?:\/\//i.test(u || '') ? u : '#');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* Logo der Quellen-Website – genau so, wie die Website es liefert; sonst ein Buchstabe */
function siteIcon(domain, fallback, cls = 'chip-ico') {
  const box = el('span', `${cls} has-fav`);
  const letter = String(fallback || domain || '?').charAt(0).toUpperCase();
  const useLetter = () => { box.classList.remove('has-fav'); box.textContent = letter; };
  if (!domain) { useLetter(); return box; }
  const img = document.createElement('img');
  img.alt = '';
  img.decoding = 'async';
  img.src = `/api/icon?domain=${encodeURIComponent(domain)}`;
  img.addEventListener('error', () => { img.remove(); useLetter(); }, { once: true });
  box.append(img);
  return box;
}

function sourceChip(s) {
  const label = s.title.length > 60 ? s.title.slice(0, 58) + '…' : s.title;
  const a = el('a', 'chip', `<span class="chip-label">${escapeHtml(label || s.domain)}</span>`);
  a.prepend(siteIcon(s.domain, s.title));
  a.href = safeUrl(s.url);
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.title = [s.title, s.seen || s.publisher || s.domain].filter(Boolean).join(' – ');
  return a;
}

/* Chips auf höchstens zwei Reihen (rows) begrenzen; ganz rechts in der letzten Reihe ein „+N“, das alle Quellen öffnet */
function fillChips(box, items, onMore, rows = 2) {
  box.replaceChildren(...items.map(sourceChip));
  const fit = () => {
    if (!box.isConnected || !box.clientWidth) return; // noch nicht sichtbar → später messen
    box.querySelector('.more-chip')?.remove();
    const chips = [...box.children];
    chips.forEach((c) => { c.hidden = false; });
    const tops = [...new Set(chips.map((c) => c.offsetTop))].sort((a, b) => a - b);
    if (tops.length <= rows) return;
    const limit = tops[rows - 1];
    const visible = chips.filter((c) => c.offsetTop <= limit);
    chips.filter((c) => c.offsetTop > limit).forEach((c) => { c.hidden = true; });
    const more = el('button', 'chip more-chip');
    more.type = 'button';
    more.title = 'Alle Quellen anzeigen';
    more.addEventListener('click', onMore);
    box.append(more);
    const update = () => { more.textContent = `+${chips.length - visible.length}`; };
    update();
    while (more.offsetTop > limit && visible.length) { visible.pop().hidden = true; update(); }
  };
  // neu messen, sobald sich die Breite ändert (z. B. wenn der Bereich erst nach dem Einfügen sichtbar wird)
  let lastWidth = -1;
  box._ro?.disconnect(); // bei erneutem Befüllen (z. B. weitere Website) nur ein Beobachter
  const ro = box._ro = new ResizeObserver(() => {
    if (!box.isConnected) { ro.disconnect(); return; }
    const w = box.clientWidth;
    if (w !== lastWidth) { lastWidth = w; fit(); }
  });
  ro.observe(box);
}

/* Fenster mit allen verwendeten Quellen – schlicht: Logo + Name, Klick öffnet die Quelle */
function sourceRow(s) {
  const a = el('a', 'src-item', `<span class="src-item-title">${escapeHtml(s.title || s.domain)}</span>`);
  a.prepend(siteIcon(s.domain, s.title, 'src-fav'));
  a.href = safeUrl(s.url);
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.title = s.url;
  return a;
}

const srcModal = el('div', 'src-modal');
srcModal.setAttribute('role', 'dialog');
srcModal.setAttribute('aria-modal', 'true');
srcModal.setAttribute('aria-label', 'Quellen');
srcModal.hidden = true;
document.body.append(srcModal);
function closeSourcesModal() { srcModal.hidden = true; srcModal.replaceChildren(); }
function openSourcesModal(sources, citations) {
  const panel = el('div', 'src-modal-panel');
  const head = el('div', 'src-modal-head', `<span>Quellen</span><span class="t">${sources.length}</span>`);
  const close = el('button', 'src-modal-close', icon('i-x'));
  close.type = 'button';
  close.setAttribute('aria-label', 'Schließen');
  close.addEventListener('click', closeSourcesModal);
  head.append(close);
  const list = el('div', 'src-modal-list');
  sources.forEach((s) => list.append(sourceRow(s)));
  panel.append(head, list);
  srcModal.replaceChildren(panel);
  srcModal.hidden = false;
  close.focus();
}
srcModal.addEventListener('click', (e) => { if (e.target === srcModal) closeSourcesModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !srcModal.hidden) closeSourcesModal(); });

/* Text weich austauschen – kein Verschwinden/Wiederkommen, sondern ein sauberer Wechsel */
function swapText(node, text) {
  if (!node || node.textContent === text) return;
  if (!node.textContent) { node.textContent = text; return; } // erster Text: ohne Wechsel-Animation
  clearTimeout(node._swap);
  if (node.animate) node.animate([{ opacity: 1, transform: 'translateY(0)', filter: 'blur(0)' }, { opacity: 0, transform: 'translateY(-5px)', filter: 'blur(2px)' }], { duration: 140, easing: 'ease-in', fill: 'forwards' });
  // Text per Timer tauschen (nicht über das Animationsende – das fehlt z. B. in Hintergrund-Tabs)
  node._swap = setTimeout(() => {
    node.getAnimations?.().forEach((an) => an.cancel());
    node.textContent = text;
    if (node.animate) node.animate([{ opacity: 0, transform: 'translateY(5px)', filter: 'blur(2px)' }, { opacity: 1, transform: 'translateY(0)', filter: 'blur(0)' }], { duration: 220, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' });
  }, 140);
}

/* Kleine Animationen links im Kopf – je Tätigkeit eine eigene */
const ACT_MARKUP = {
  think: '<span class="a-think"><i></i><i></i><i></i></span>',          // drei pulsierende Punkte
  search: '<span class="a-search"></span>',                              // kreisende Lupe
  read: '<span class="a-read"><i></i><i></i><i></i></span>',            // Zeilen werden „gelesen“
  write: '<span class="a-write"><i></i><i></i><i></i></span>',          // Balken wie beim Tippen
  check: '<span class="a-check"></span>',                                // Ring, der sich schließt
  wait: '<span class="a-load"></span>',                                // Lade-Kreis
  work: '<span class="a-work"></span>',                                  // dezenter Ring
};

/* Hauptquellen einer Antwort: die am häufigsten belegten (wirklich genutzten) Quellen */
function mainSources(sources, citations) {
  const freq = citations?.freq || {};
  const cited = sources.filter((s) => freq[s.n]).sort((a, b) => freq[b.n] - freq[a.n]);
  if (!cited.length) return [];
  const top = freq[cited[0].n];
  // bei vielen Quellen nur die tragenden: mindestens ein Viertel so oft belegt wie die wichtigste
  return cited.length > 4 ? cited.filter((s) => freq[s.n] >= Math.max(1, top / 4)) : cited;
}

/* API-Key fehlt oder wurde abgelehnt: Karte im Stil der Agent-Empfehlung (statt roter Box) – Knopf führt zu
   Einstellungen → Agenten → Verbindung */
function keyCard(kind, message) {
  const card = el('div', 'agent-suggest key-card');
  card.innerHTML = '<span class="as-dog"></span><span class="as-text"><strong></strong><span></span></span>';
  card.querySelector('.as-dog').innerHTML = window.PixelDogs?.svg(window.PixelDogs.mode, 32) || '';
  card.querySelector('strong').textContent = kind === 'rejected' ? 'API-Key abgelehnt' : 'Noch kein API-Key verbunden';
  card.querySelector('.as-text span').textContent = String(message || '').replace(/\s*–\s*(verbinde|prüf)[^.]*\.?$/i, '.') || 'Verbinde deinen Schlüssel in den Einstellungen.';
  const go = el('button', 'as-go', 'Zu den Einstellungen');
  go.type = 'button';
  go.addEventListener('click', () => window.Settings?.open('agents'));
  card.append(go);
  return card;
}
/* Fehler (z. B. Modelle überlastet): ruhige Karte im Stil der Agent-Empfehlung statt roter Box – „Nochmal versuchen“ startet die
   Antwort neu; darunter kommt die normale Leiste (Kopieren, Neu erzeugen, Ins Dokument) */
function errorCard(msgEl, message, status) {
  const busy = status === 503 || /überlastet/i.test(message || '');
  const card = el('div', 'agent-suggest error-card');
  card.innerHTML = '<span class="as-dog"></span><span class="as-text"><strong></strong><span></span></span>';
  card.querySelector('.as-dog').innerHTML = window.PixelDogs?.svg(window.PixelDogs.mode, 32) || '';
  card.querySelector('strong').textContent = busy ? 'Die Modelle sind gerade überlastet' : 'Das hat gerade nicht geklappt';
  card.querySelector('.as-text span').textContent = busy
    ? 'Gerade fragen sehr viele gleichzeitig an – das liegt nicht an dir. In ein paar Sekunden klappt es meistens wieder.'
    : String(message || 'Unbekannter Fehler');
  const go = el('button', 'as-go', 'Nochmal versuchen');
  go.type = 'button';
  go.addEventListener('click', () => { if (runOf()) return; card.classList.add('chosen'); setTimeout(() => regenerate(msgEl), 200); });
  card.append(go);
  return card;
}
/* Antwort mitten im Text abgebrochen: Karte im Stil der Agent-Empfehlung – „Weiterschreiben“ setzt genau an der Stelle fort */
function resumeCard(msgEl) {
  const card = el('div', 'agent-suggest resume');
  card.innerHTML = '<span class="as-dog"></span><span class="as-text"><strong>Die Antwort wurde unterbrochen</strong><span>Soll ich genau an der Stelle weiterschreiben?</span></span>';
  card.querySelector('.as-dog').innerHTML = window.PixelDogs?.svg(window.PixelDogs.mode, 32) || '';
  const go = el('button', 'as-go', 'Weiterschreiben');
  go.type = 'button';
  go.addEventListener('click', () => { if (runOf()) return; card.classList.add('chosen'); setTimeout(() => continueAnswer(msgEl), 300); });
  card.append(go);
  return card;
}
async function continueAnswer(msgEl) {
  const partial = msgEl._partial || '';
  if (runOf() || !partial || msgEl._historyAt == null) return;
  const tab = activeTab();
  const hist = historyOf(tab);
  hist.length = msgEl._historyAt; // unvollständige Antwort raus – die fortgesetzte kommt gleich als Ganzes hinein
  msgEl.replaceChildren();
  const controller = new AbortController();
  startRun(tab, controller);
  try {
    const answer = await runChat(msgEl, controller.signal, null, tab, partial);
    hist.push({ role: 'assistant', text: answer || partial, sources: msgEl._sources, ...thoughtsOf(msgEl) });
  } finally {
    endRun(tab, controller);
  }
}
/* Gestoppt, bevor eine Antwort da war (oder Rückfrage übersprungen): ruhige Karte wie bei „Bild konnte nicht erstellt werden“ –
   Stopp-Icon, kurzer Text, rechts „Neu starten“. Bleibt eine .msg-actions, damit Karten davor eingefügt werden können. */
// Gestoppt, bevor Text kam: keine Karte – darunter nur das Icon zum Neu erzeugen (wie unter jeder Antwort)
function restartBar(msgEl) {
  const bar = el('div', 'msg-actions late-in');
  const redo = el('button', 'msg-btn', icon('i-refresh'));
  redo.type = 'button';
  redo.title = 'Neu erzeugen';
  redo.setAttribute('aria-label', 'Antwort neu erzeugen');
  redo.addEventListener('click', () => regenerate(msgEl));
  bar.append(redo);
  return bar;
}
function messageFooter(msgEl, text) {
  const bar = el('div', 'msg-actions');
  const copy = el('button', 'msg-btn', icon('i-copy'));
  copy.type = 'button';
  copy.title = 'Kopieren';
  copy.setAttribute('aria-label', 'Antwort kopieren');
  copy.addEventListener('click', async () => {
    const plain = stripAskBlock(text).replace(/\s*(?:\[\d{1,2}(?:\s*[,;]\s*\d{1,2})*\](?!\())+/g, '');
    try { await navigator.clipboard.writeText(plain); } catch { return; }
    copy.innerHTML = icon('i-check');
    copy.classList.add('done');
    setTimeout(() => { copy.innerHTML = icon('i-copy'); copy.classList.remove('done'); }, 1400);
  });
  const redo = el('button', 'msg-btn', icon('i-refresh'));
  redo.type = 'button';
  redo.title = 'Neu erzeugen';
  redo.setAttribute('aria-label', 'Antwort neu erzeugen');
  redo.addEventListener('click', () => regenerate(msgEl));
  const toDoc = el('button', 'msg-btn', icon('i-import'));
  toDoc.type = 'button';
  toDoc.title = 'Ins Dokument übernehmen';
  toDoc.setAttribute('aria-label', 'Antwort als Dokument speichern');
  toDoc.addEventListener('click', () => importAnswer(msgEl));
  bar.append(copy, redo, toDoc);
  return bar;
}

/* Hauptquellen direkt hinter dem letzten Text der Antwort; endet die Antwort mit einer Tabelle (o. Ä.), darunter */
function placeSourceStack(answerEl, sources) {
  if (!sources.length) return null;
  const stack = el('button', 'src-stack');
  stack.type = 'button';
  stack.title = 'Hauptquellen anzeigen';
  sources.slice(0, 3).forEach((src) => stack.append(siteIcon(src.domain, src.title, 'stack-ico')));
  if (sources.length > 3) stack.append(el('span', 'stack-more', `+${sources.length - 3}`));
  stack.addEventListener('click', () => openSourcesModal(sources, null));
  let last = answerEl.lastElementChild;
  while (last && (last.matches('ul, ol') ? last.lastElementChild : null)) last = last.lastElementChild; // in Listen: letzter Punkt
  if (last && last.matches('p, li, h1, h2, h3, h4, blockquote') && last.textContent.trim()) {
    stack.classList.add('inline');
    last.append(stack);
    return null;
  }
  return stack; // kein Text am Ende (z. B. Tabelle) → kommt in die Leiste neben „Neu erzeugen“
}

/* Antwort neu erzeugen: nur bei der letzten Antwort, gleicher Verlauf bis zur Frage */
async function regenerate(msgEl) {
  if (runOf() || msgEl !== chat.querySelector('.msg-ai:last-of-type') || msgEl._historyAt == null) return;
  history.length = msgEl._historyAt;
  // Titel fehlt noch („Neuer Chat“)? → aus der ersten Frage erzeugen, auch beim Neu-Erzeugen
  const c = chatOf(activeTab());
  if (c && DEFAULT_TITLES.has(c.title)) { c.auto = true; autoTitle(history.find((h) => h.role === 'user')?.text || ''); }
  msgEl.replaceChildren();
  msgEl.classList.remove('pic-in-timeline'); // Zustand der vorigen Fassung nicht übernehmen (sonst bliebe „Generating picture“ unsichtbar)
  msgEl._partial = null;
  const controller = new AbortController();
  const tab = activeTab();
  startRun(tab, controller);
  try {
    const answer = await runChat(msgEl, controller.signal, null, tab);
    historyOf(tab).push({ role: 'assistant', text: answer || '(keine Antwort)', sources: msgEl._sources, ...thoughtsOf(msgEl) });
  } finally {
    endRun(tab, controller);
  }
}


/* cont: Zeitleiste einer vorherigen Runde derselben Nachricht (nach einer Rückfrage) – wird fortgesetzt
   Der Kopf neben der Antwort zeigt immer den Agenten, der diese Runde schreibt (z. B. nach „Zu Coden wechseln“ oder nach einer Rückfrage) */
// tab: der Chat, zu dem diese Antwort gehört – nur sein Verlauf wird mitgeschickt (Chats sind voneinander unabhängig)
async function runChat(msgEl, signal, cont = null, tab = activeTab(), prefix = '') {
  if (!cont && !prefix) msgEl._plan = null; // Plan dieser Runde (attachPlan) – nicht den einer früheren Fassung behalten; Weiterschreiben behält ihn
  if (window.PixelDogs?.mode) { msgEl.dataset.dog = window.PixelDogs.mode; chatOf(tab).agent = window.PixelDogs.mode; } // Kopf = Agent, der diese Runde schreibt; der Chat merkt sich den zuletzt genutzten
  let pictures = null; // Bilder der Antwort, die noch entstehen – bis dahin keine Fußzeile
  /* „Generating picture“ als Schritt in der Zeitleiste (Thinking/Working), sobald ein Bild-Block im Text steht – Bild-Icon und Text
     schimmern zusammen wie bisher über dem Rahmen; dort steht der Text dann nicht mehr. Ohne Zeitleiste (reine Bildbitte) bleibt alles wie gehabt. */
  let picStep = null;
  const showPicStep = () => {
    const web = /"source"\s*:\s*"web"/.test(answerR?.text || '');
    // Bildbitte: der Schritt steht schon von Anfang an – stellt sich heraus, dass das Bild gesucht wird, heißt er „Searching picture“
    if (picStep) {
      if (!picStep.done && web && !picStep.web) { picStep.web = true; picStep.step.querySelector('.step-line > .shimmer:not(.ill-ico)').textContent = 'Searching picture'; }
      return;
    }
    if (!work) return;
    const from = Date.now();
    const step = stepLine('spin', `<span class="shimmer ill-ico"></span><span class="shimmer">${web ? 'Searching picture' : 'Generating picture'}</span><span class="t">1s</span>`);
    step.classList.add('pic-step');
    work.steps.append(step);
    sweepRow(step.querySelector('.step-line'));
    const t = step.querySelector('.t');
    picStep = { step, from, web, done: false, tick: setInterval(() => { t.textContent = secs(from); }, 250) };
    if (!web && pictureAsk) { ensureActor(); actor?.set('paint'); } // reine Bildbitte: gleich an die Staffelei – mit Text erst, wenn der Text fertig ist
    msgEl.classList.add('pic-in-timeline');
    scrollToBottom();
  };
  const finishPicStep = (stopped) => {
    if (!picStep || picStep.done) return;
    picStep.done = true;
    clearInterval(picStep.tick);
    // Bildbitte, aber die Antwort enthält gar kein Bild (z. B. nur Text oder Fehler) → Schritt wieder weg
    if (!stopped && !answer.querySelector('.chat-illustration')) { picStep.step.remove(); msgEl.classList.remove('pic-in-timeline'); return; }
    const failed = !stopped && answer.querySelector('.ill-error, .limit-note');
    const n = answer.querySelectorAll('.chat-illustration.ready').length;
    const what = picStep.web ? (n > 1 ? 'Found pictures' : 'Found picture') : (n > 1 ? 'Generated pictures' : 'Generated picture');
    finishStep(picStep.step, stopped ? `${picStep.web ? 'Searching' : 'Generating'} picture – stopped` : failed && !n ? 'Picture not available' : `${what} <span class="t">${secs(picStep.from)}</span>`);
    picStep.step.querySelector('.step-line').classList.remove('sweep-row');
    if (!stopped) markerIcon(picStep.step, 'image');
  };
  const scrollToBottom = (force) => { if (tab === activeTab()) window.scrollToBottom(force); }; // im Hintergrund nicht den offenen Chat verschieben
  const started = Date.now();
  const secs = (from = started, to = Date.now()) => Math.max(1, Math.round((to - from) / 1000)) + 's';
  const timer = setInterval(() => msgEl.querySelectorAll('.t.live').forEach((t) => { t.textContent = secs(Number(t.dataset.from) || started); }), 250);

  const renderOpts = { sources: [] }; // nummerierte Quellen – für die Belege [1], [2] … im Text
  const answer = el('div', 'answer md');
  let answerR = null;
  // Rückfrage statt Antwort → „Asked a question“ (bzw. „Asked 2 questions“) statt „Wrote the answer“
  const wroteLabel = () => {
    const n = /```ask/.test(answerR?.text || '') ? parseAskBlock(answerR.text)?.length || 1 : 0;
    if (n) return `Asked ${n === 1 ? 'a question' : `${n} questions`}`;
    // Format gebaut: „Built mind map · 5 branches · 19 points“ (Zahlen aus dem Block)
    const F = fmt && window.Thinking?.FORMATS?.[fmt];
    if (F && workKey === 'work' && window.Thinking.blockFormat(answerR?.text || '') === fmt) {
      const st = Thinking.statsOf(fmt, answerR.text);
      return `${F.wrote}${st ? ` <span class="ph-x">· ${st}</span>` : ''}`;
    }
    return P(workKey).sub;
  };
  let work = null;
  let workKey = 'work';
  let citations = null;
  let failed = false;
  let interrupted = false; // Antwort mitten im Text abgebrochen (Fehler/Verbindung) → Karte „weiterschreiben?“
  const stages = {};       // Stufe → { step, from, chips }

  /* dezenter Hinweis, solange noch gar nichts zu sehen ist */
  let pending = null;
  let think = null;
  // Bildwunsch („erstelle mir ein Bild von …“): gleich „Generating picture“ mit Bild-Icon statt „Working“
  const lastAsk = [...historyOf(tab)].reverse().find((h) => h.role === 'user')?.text || '';
  const coding = msgEl.dataset.dog === 'code'; // Coding-Agent: baut Projekte – erzeugt nie Bilder
  // Denk-Ablauf dieses Agenten (thinking.js): Kopf = Hauptstatus, Schritte = Unterpunkte
  const agentId = msgEl.dataset.dog || window.PixelDogs?.mode || 'general';
  // Format (Präsentation, Mindmap, Zeitstrahl …): eigene Schritte – aus der Frage, sonst sobald die KI einen solchen Block schreibt
  let fmt = window.Thinking?.formatOf?.(lastAsk, agentId) || null;
  const P = (k) => window.Thinking ? Thinking.of(agentId, k, fmt) : { main: 'Working', sub: k, kind: 'work' };
  // Hund neben dem Hauptstatus (PixelDogs.actor): tut je Zustand etwas anderes; Wechsel weich und nie zu hektisch
  let actor = null;
  const ensureActor = () => {
    if (actor || !window.PixelDogs?.actor) return;
    actor = PixelDogs.actor(agentId);
    msgEl.prepend(actor.el);
    msgEl.classList.add('acting');
  };
  const phase = (k) => { setActivity(P(k).kind, P(k).main); ensureActor(); actor?.set(P(k).anim); };
  const live = (k, from = Date.now()) => `<span class="shimmer">${P(k).sub}</span><span class="t live" data-from="${from}">1s</span>`;
  const doneLine = (k, extra = '', dur = '') => `${P(k).sub}${extra ? ` <span class="ph-x">· ${extra}</span>` : ''}${dur ? ` <span class="t">${dur}</span>` : ''}`;
  const pictureAsk = !coding && lastAsk.length < 220 && /\b(bild|grafik|illustration|abbildung|schaubild|skizze|zeichnung)\w*/i.test(lastAsk) && /(erstell|mach|zeichne|generier|zeig|gib|such|nimm)/i.test(lastAsk) && !/(erklär|warum|wieso|vergleich|unterschied|analys|text|schreib|beschreib|zusammenfass|aufsatz|referat|und dazu|außerdem|präsentation|praesentation|folien|powerpoint|keynote|pptx)/i.test(lastAsk); // mit Textwunsch / Präsentation: normaler Ablauf
  let quiet = false; // Kurznachricht (z. B. „Moin“): kein Working/Thinking – die Antwort kommt einfach
  const pendingTimer = setTimeout(() => {
    if (signal.aborted || quiet) return;
    if (pictureAsk) { ensureWork(); showPicStep(); return; } // Bildbitte: „Generating picture“ als Schritt in der Zeitleiste, nicht frei
    if (answerR || work) return;
    pending = el('div', 'pending');
    pending.append(el('span', 'spinner'), el('span', 'shimmer', 'Working'));
    msgEl.append(pending);
    scrollToBottom();
  }, pictureAsk ? 0 : PENDING_DELAY);
  const removePending = () => { clearTimeout(pendingTimer); pending?.remove(); pending = null; };

  const ensureWork = () => {
    if (work) return work;
    removePending();
    if (cont) {
      work = cont;
      setActivity('work', 'Working');
      const t = work.head.querySelector('.t');
      t.hidden = false;
      t.classList.add('live');
      t.dataset.from = started;
      return work;
    }
    work = createWork();
    msgEl.insertBefore(work.work, answer.isConnected ? answer : null);
    // Erster Schritt: die Anfrage verstehen (Hauptstatus „Understanding“ bzw. „Planning research“). Er ist fertig, sobald der
    // nächste Schritt dazukommt – dann wandert der Kopf zum nächsten Hauptstatus.
    if (!pictureAsk) {
      const st = stepLine('spin', live('start'));
      st.classList.add('ph-start');
      work.steps.append(st);
      const from = Date.now();
      const mo = new MutationObserver(() => {
        if (work.steps.lastElementChild === st) return;
        mo.disconnect();
        finishStep(st, doneLine('start', '', secs(from)));
      });
      mo.observe(work.steps, { childList: true });
      work.endStart = () => { mo.disconnect(); if (st.querySelector('.spinner')) finishStep(st, doneLine('start', '', secs(from))); };
    }
    // Standard-Tätigkeit nur, wenn im selben Moment keine konkrete gesetzt wird (kein kurzes Aufblitzen)
    queueMicrotask(() => { if (!work.head.querySelector('.work-title').textContent) phase(pictureAsk ? 'picture' : 'start'); });
    return work;
  };
  /* Kopf zeigt immer, was gerade passiert – mit eigener kleiner Animation je Tätigkeit */
  function setActivity(kind, text) {
    const w = work || ensureWork();
    const act = w.head.querySelector('.act');
    if (act && act.dataset.kind !== kind) {
      act.dataset.kind = kind;
      act.innerHTML = ACT_MARKUP[kind] || ACT_MARKUP.work;
    }
    w.work.classList.add('active');
    const title = w.head.querySelector('.work-title');
    title.classList.add('sweep');
    swapText(title, text);
  }
  if (cont) ensureWork(); // nach einer Rückfrage: dieselbe Zeitleiste läuft sofort weiter („Working“)
  const addStep = (html, cls = '') => {
    const step = stepLine('dot', html);
    if (cls) step.classList.add(cls);
    ensureWork().steps.append(step);
    scrollToBottom();
    return step;
  };

  /* Planning: Der Kopf der Zeitleiste zeigt zuerst „Planning“ (mit Ladezeichen). Ist das Denken fertig,
     wechselt genau dieser Text weich zu „Working“ und darunter gleitet „Planned the answer“ herein.
     Das Vorgehen bleibt im Hintergrund (wird nicht eingeblendet). Nach einer Rückfrage: Schritt in der Zeitleiste. */
  const startThinking = () => {
    const from = Date.now();
    const inTimeline = !!work;
    think = { from, inTimeline, hidden: true, done: false };
    think.show = () => {
      if (!think.hidden) return;
      think.hidden = false;
      removePending();
      if (inTimeline) {
        think.el = stepLine('spin', live('plan', from));
        work.steps.append(think.el);
      } else {
        ensureWork();
        phase('plan');
        const startStep = work.steps.querySelector('.ph-start');
        // gleicher Unterpunkt wie der erste Schritt (z. B. Research „Defining research scope“) → kein doppelter Schritt
        if (startStep && P('plan').sub === P('start').sub && startStep.querySelector('.spinner')) think.el = startStep;
        else work.steps.append(think.el = stepLine('spin', live('plan', from)));
      }
      scrollToBottom();
    };
    think.showTimer = setTimeout(() => { if (!think.done) think.show(); }, THINK_SHOW_DELAY);
  };
  const endThinking = async (s) => {
    if (!think || think.done) return;
    think.done = true;
    think.failed = !!s?.meta?.analysisFailed; // Planung ausgefallen → nicht „Planned the answer“ behaupten
    think.points = Array.isArray(s?.meta?.points) ? s.meta.points : [];
    clearTimeout(think.showTimer);
    if (think.hidden) return; // schnell geklärt – nichts zu zeigen
    closeThinking();
  };
  const closeThinking = () => {
    if (!think || think.closed || think.hidden) return;
    think.closed = true;
    const dur = think.serverFrom && think.serverTo ? secs(think.serverFrom, think.serverTo) : secs(think.from);
    const label = think.failed ? `${P('plan').sub} <span class="ph-x">· not available</span> <span class="t">${dur}</span>` : doneLine('plan', cont ? 'continued' : '', dur);
    if (think.el) { finishStep(think.el, label); attachPlan(think.el, think.points); return; }
    const step = stepLine('dot', label);
    work.steps.append(step);
    attachPlan(step, think.points);
    scrollToBottom();
  };

  /* Plan unter „Planned the answer“ – gleich offen (Klick klappt zu): je Punkt links der Status (Kreis / Ladekreis / Haken), dann der Text.
     Abgehakt wird ein Punkt, sobald seine Kernbegriffe wirklich in der Antwort stehen; der erste offene lädt, solange geschrieben wird.
     Was am Ende nicht erkennbar behandelt wurde, bleibt offen – kein vorgetäuschter Haken. */
  const plan = { items: [] };
  // Gliederungswörter („Definition und Grundkonzept“, „Einleitung“) schreibt die Antwort nie wörtlich hin – sie zählen nicht als Kernbegriffe
  const PLAN_STOP = new Set(['erklären', 'erklärung', 'beispiel', 'beispiele', 'bedeutung', 'überblick', 'zusammenhang', 'zusammenhänge', 'wichtige', 'wichtigsten', 'verschiedene', 'einfach', 'kurze', 'kurzer',
    'definition', 'definitionen', 'grundkonzept', 'grundkonzepte', 'konzept', 'einleitung', 'einführung', 'grundlagen', 'grundidee', 'begriff', 'begriffe', 'begriffsklärung', 'zusammenfassung', 'fazit', 'ausblick', 'hintergrund', 'merkmale', 'aspekte', 'funktion', 'funktionen', 'funktionsweise', 'entwicklung', 'vorteile', 'nachteile']);
  const planTerms = (p) => [...new Set(String(p).toLowerCase().split(/[^a-zäöüß0-9]+/).filter((w) => w.length >= 5 && !PLAN_STOP.has(w)))];
  const attachPlan = (step, points) => {
    if (!points?.length || step.querySelector('.plan-list')) return;
    msgEl._plan = points.slice(0, 12);
    const list = el('div', 'plan-list');
    points.forEach((p) => {
      const row = el('div', 'plan-item', `<span class="pi-mark"></span><span class="pi-text">${escapeHtml(p)}</span>`);
      row.dataset.state = 'todo';
      list.append(row);
      plan.items.push({ row, terms: planTerms(p), state: 'todo' });
    });
    const fold = el('div', 'fold');
    const inner = el('div', 'fold-in');
    inner.append(list);
    fold.append(inner);
    step.append(fold);
    step.classList.add('foldable', 'has-box'); // Plan eingeklappt – Klick auf „Identifying requirements“ klappt ihn auf
    step.querySelector('.step-line').insertAdjacentHTML('beforeend', `<svg class="fold-chev" width="10" height="10" aria-hidden="true"><use href="#i-chevron-down"/></svg>`);
    step.querySelector('.step-line').addEventListener('click', () => step.classList.toggle('open'));
    updatePlan();
  };
  const updatePlan = (final = false) => {
    if (!plan.items.length) return;
    const text = (answerR?.text || '').toLowerCase();
    let active = false;
    // Wortformen zählen mit („Plattformen“ ↔ „Plattform“): verglichen wird der Wortanfang ohne die letzten zwei Buchstaben
    const has = (w) => text.includes(w.length > 6 ? w.slice(0, -2) : w);
    const covered = plan.items.map((it) => it.terms.length > 0 && it.terms.filter(has).length >= Math.ceil(it.terms.length / 2));
    plan.items.forEach((it, i) => {
      // Die Antwort folgt dem Plan: ist ein späterer Punkt behandelt, war der erste Punkt (oft „Definition …“, direkt erklärt)
      // bzw. ein Punkt ohne eigene Kernbegriffe schon dran
      const later = covered.slice(i + 1).some(Boolean);
      const done = covered[i] || ((i === 0 || !it.terms.length) && later) || (final && !it.terms.length && text.length > 200) || (final && it.terms.some(has));
      const state = done ? 'done' : !final && answerR && !active ? ((active = true), 'active') : 'todo';
      if (state === it.state) return;
      it.state = state;
      it.row.dataset.state = state;
      it.row.querySelector('.pi-mark').innerHTML = state === 'done' ? FadeIcons.svg('check-circle', 13) : '';
    });
  };

  /* Tiefen-Recherche (Research-Agent): ganz normale Schritte auf der Zeitleiste, Unterpunkte als Abzweig (wie der Plan):
     1. „Split into 4 questions“ – Abzweig mit den Teilfragen, blauer Haken sobald Quellen dazu gelesen sind
     2. „Searched for 9 things“ – Abzweig: jede eingegebene Suche, darunter ihre Quellen in EINER Reihe + „+N“ (Klick → Quellen-Fenster)
     3. „Compared the sources“
     4. „Searched again for gaps“ – wieder Abzweig mit Suchen und Quellen */
  const deep = { steps: {}, subs: new Map(), queries: new Map(), all: [] };
  // Tiefen-Recherche: Schlüssel der Schritte → Unterpunkt im Research-Ablauf (thinking.js)
  const DEEP_KEY = { plan: 'strategy', search: 'web', gaps: 'crosscheck', compare: 'compare', synth: 'synthesize' };
  const deepStep = (key, text) => {
    if (deep.steps[key]) return deep.steps[key];
    const from = Date.now();
    const step = stepLine('spin', DEEP_KEY[key] ? live(DEEP_KEY[key], from) : `<span class="shimmer">${text}</span><span class="t live" data-from="${from}">1s</span>`);
    deep.steps[key] = { step, from };
    ensureWork().steps.append(step);
    scrollToBottom();
    return deep.steps[key];
  };
  const deepDone = (key, html) => {
    const st = deep.steps[key]; if (!st || st.done) return;
    st.done = true;
    const fold = st.step.querySelector('.fold');
    finishStep(st.step, `${html} <span class="t">${secs(st.from)}</span>`);
    if (fold) { st.step.querySelector('.step-line').insertAdjacentHTML('beforeend', `<svg class="fold-chev" width="10" height="10" aria-hidden="true"><use href="#i-chevron-down"/></svg>`); }
    if (key === 'search' || key === 'gaps') markerIcon(st.step, 'search'); // Lupe wie bei der Websuche
    // Suchen fertig → die Liste der Suchen klappt weich zu (eine Zeile); Klick auf die Zeile öffnet sie wieder – sonst wird es zu voll
    if ((key === 'search' || key === 'gaps') && fold) setTimeout(() => st.step.classList.remove('open'), 500);
  };
  // fertiger Schritt ohne eigene Dauer (Ergebnis einer Phase, z. B. „Collecting key findings · 14 sources“)
  const noteStep = (k, extra) => { const st = stepLine('dot', doneLine(k, extra)); ensureWork().steps.append(st); scrollToBottom(); return st; };
  // Abzweig unter einem Schritt (aufklappbar über die Zeile)
  const branchOf = (st) => {
    if (st.list) return st.list;
    const list = el('div', 'plan-list branch');
    const fold = el('div', 'fold'), inner = el('div', 'fold-in');
    inner.append(list); fold.append(inner); st.step.append(fold);
    st.step.classList.add('foldable', 'open', 'has-box');
    st.step.querySelector('.step-line').addEventListener('click', () => st.step.classList.toggle('open'));
    st.list = list;
    return list;
  };
  const tick = (row) => { if (row && row.dataset.state !== 'done') { row.dataset.state = 'done'; row.querySelector('.pi-mark').innerHTML = FadeIcons.svg('check-circle', 13); } };
  /* Suchen: NICHT im Plan-Kasten. Je Suche ein schmaler Kasten mit Lupe und dem Suchtext, darunter ihre Quellen als kleine Kästchen
     (links das Logo der Website, rechts der Titel) in einer Reihe + „+N“. */
  const searchList = (st) => {
    if (st.list) return st.list;
    const list = el('div', 'dq-list');
    const fold = el('div', 'fold'), inner = el('div', 'fold-in');
    inner.append(list); fold.append(inner); st.step.append(fold);
    st.step.classList.add('foldable', 'open', 'has-box');
    st.step.querySelector('.step-line').addEventListener('click', () => st.step.classList.toggle('open'));
    st.list = list;
    return list;
  };
  const queryRow = (key, q) => {
    if (deep.queries.has(q)) return deep.queries.get(q);
    const row = el('div', 'dq', `<div class="dq-q"><span class="dq-ico"><span class="spinner"></span></span><span class="dq-text"></span></div><div class="chips one-row"></div>`);
    row.querySelector('.dq-text').textContent = q;
    row.dataset.state = 'active';
    searchList(deep.steps[key]).append(row);
    const item = { row, chips: row.querySelector('.chips'), list: [] };
    deep.queries.set(q, item);
    return item;
  };
  // Suche fertig → Lupe statt Ladekreis
  const settle = (it, state = 'done') => {
    if (!it || it.row.dataset.state === state) return;
    it.row.dataset.state = state;
    it.row.querySelector('.dq-ico').innerHTML = FadeIcons.svg('search', 12);
  };
  const onDeep = (e) => {
    if (e.phase === 'plan' && !e.done) { deepStep('plan'); phase('strategy'); }
    if (e.phase === 'plan' && e.done && e.subs) {
      const st = deepStep('plan');
      const list = branchOf(st);
      e.subs.forEach((x) => {
        const row = el('div', 'plan-item', `<span class="pi-mark"></span><span class="pi-text">${escapeHtml(x.q)}</span>`);
        row.dataset.state = 'active';
        list.append(row);
        deep.subs.set(x.id, row);
      });
      deepDone('plan', doneLine('strategy', `${e.subs.length} ${e.subs.length === 1 ? 'question' : 'questions'}`));
    }
    const key = deep.steps.gaps && !deep.steps.gaps.done ? 'gaps' : 'search';
    if (e.phase === 'deepen' && !e.done) { deepStep('gaps'); phase('crosscheck'); }
    if (e.phase === 'search' && e.query) {
      if (key === 'search') { deepStep('search'); phase('web'); }
      const it = queryRow(key, e.query);
      if (e.results != null) settle(it, e.results || it.list.length ? 'done' : 'empty');
    }
    if (e.phase === 'read' && e.source) {
      if (key === 'search') phase('discover');
      const src = { n: e.source.n, title: e.source.title, domain: e.source.domain, url: e.source.url };
      deep.all.push(src);
      const q = e.source.query || 'Wikipedia & Fachliteratur';
      if (!deep.steps[key]) deepStep(key);
      const it = queryRow(key, q);
      it.list.push(src);
      fillChips(it.chips, it.list, () => openSourcesModal(it.list, null), 1);
      settle(it);
      (e.source.subs || []).forEach((id) => tick(deep.subs.get(id)));
    }
    if (e.phase === 'read' && e.done && !deep.steps.gaps) {
      deepStep('search');
      const nq = deep.queries.size, ns = deep.all.length;
      deepDone('search', ns ? doneLine('web', `${nq} ${nq === 1 ? 'search' : 'searches'}`) : `${P('web').sub} <span class="ph-x">· no suitable sources found</span>`);
      if (ns) { noteStep('discover', `${ns} relevant ${ns === 1 ? 'source' : 'sources'}`); noteStep('gather', ''); phase('gather'); }
      deep.queries.forEach((it) => { if (it.row.dataset.state === 'active') settle(it, it.list.length ? 'done' : 'empty'); });
      if (!ns) deep.steps.search.step.classList.add('warn');
    }
    if (e.phase === 'compare' && !e.done) { deepStep('compare'); phase('compare'); }
    if (e.phase === 'compare' && e.done) {
      const st = e.stats;
      deepDone('compare', doneLine('compare', st ? `${st.agree} agree · ${st.conflict} conflicting · ${st.single} single-source` : ''));
      noteStep('credibility', st?.high ? `${st.high} high-quality ${st.high === 1 ? 'source' : 'sources'}` : '');
    }
    if (e.phase === 'deepen' && e.done) {
      const n = [...deep.queries.values()].filter((it) => it.row.parentElement === deep.steps.gaps?.list).reduce((t, it) => t + it.list.length, 0);
      deepDone('gaps', doneLine('crosscheck', n ? `+${n} ${n === 1 ? 'source' : 'sources'}` : 'nothing new'));
      deep.queries.forEach((it) => { if (it.row.dataset.state === 'active') settle(it, it.list.length ? 'done' : 'empty'); });
    }
    if (e.phase === 'write') { deepStep('synth'); phase('synthesize'); }
    scrollToBottom();
  };
  // Server-Stufe → Schritt im Ablauf des Agenten (thinking.js)
  const stageKey = (stage, news) => ({ material: 'material', market: 'market', browsing: news ? 'news' : 'search', searching_sources: 'search', processing: 'work', verifying: 'review' }[stage] || 'work');
  // „Analyzing · Evaluating information“: nur, wenn vorher wirklich recherchiert wurde (nicht bei Research – der hat eigene Schritte)
  let analyzedNoted = false;
  const noteAnalyze = () => {
    if (analyzedNoted || agentId === 'research' || agentId === 'boerse') return;
    const n = renderOpts.sources.filter(Boolean).length || stages.browsing?.pages?.length || 0;
    if (!n) return;
    analyzedNoted = true;
    noteStep('analyze', `${n} ${n === 1 ? 'source' : 'sources'}`);
    phase('analyze');
  };
  const startStage = (s) => {
    if (s.stage === 'searching_sources' && stages.browsing) stages.browsing.step.remove();
    if (s.stage === 'searching_sources' && s.meta?.deep) { // Tiefen-Recherche: eigene Schritte (siehe onDeep)
      stages[s.stage] = { step: el('div'), from: Date.now(), serverFrom: Date.parse(s.ts) || null, deep: true };
      return;
    }
    const from = Date.now();
    const news = s.stage === 'browsing' && s.meta?.news; // Börsen-Agent: liest nur Nachrichten seriöser Finanzseiten
    const key = s.stage === 'market' && s.meta?.first ? s.meta.first : stageKey(s.stage, news); // Börse: erster Schritt passend zur Frage
    if (key === 'work') noteAnalyze(); // nach einer Recherche: erst auswerten, dann schreiben
    const step = stepLine('spin', live(key, from));
    stages[s.stage] = { step, from, serverFrom: Date.parse(s.ts) || null, news, key };
    queueMicrotask(() => phase(key));
    if (s.stage === 'browsing') { stages.browsing.pages = []; stages.browsing.chips = el('div', 'chips'); }
    ensureWork().steps.append(step);
    scrollToBottom();
  };
  const endStage = (s) => {
    const st = stages[s.stage];
    if (!st || st.ended) return;
    st.ended = true;
    if (st.deep) { Object.keys(deep.steps).forEach((k) => { if (!deep.steps[k].done && k !== 'synth') deepDone(k, doneLine(DEEP_KEY[k] || 'web')); }); return; }
    const dur = `<span class="t">${st.serverFrom && s.ts ? secs(st.serverFrom, Date.parse(s.ts)) : secs(st.from)}</span>`;
    const line = st.step.querySelector('.step-line');
    finishStep(st.step);
    if ((s.stage === 'browsing' && !st.gathering) || s.stage === 'searching_sources') markerIcon(st.step, 'search');
    st.step.hidden = false;
    const sub = P(st.key || stageKey(s.stage, st.news)).sub;
    if (s.status === 'cancelled') { line.innerHTML = `${sub} – stopped`; return; }
    if (s.status === 'failed') { line.innerHTML = `${sub} – not completed`; st.step.classList.add('warn'); return; }
    if (s.stage === 'browsing') {
      const n = st.pages.length;
      const k = st.gathering ? 'gather' : st.key;
      line.innerHTML = n ? `${P(k).sub} <span class="ph-x">· ${n} ${st.news ? (n === 1 ? 'article' : 'articles') : (n === 1 ? 'source' : 'sources')}</span> ${dur}`
        : `${P(st.key).sub} <span class="ph-x">· ${st.news ? 'no recent articles from trusted sources' : 'no suitable sources found'}</span> ${dur}`;
    } else if (s.stage === 'searching_sources') {
      const used = renderOpts.sources.filter(Boolean);
      line.innerHTML = used.length ? doneLine('search', '', dur.replace(/<[^>]+>/g, '')) : `${P('search').sub} <span class="ph-x">· no suitable sources found</span> ${dur}`;
      if (used.length) {
        const g = noteStep('gather', `${used.length} ${used.length === 1 ? 'source' : 'sources'}`);
        const chips = el('div', 'chips');
        g.append(chips);
        fillChips(chips, used, () => openSourcesModal(renderOpts.sources.filter(Boolean), citations));
        phase('gather');
      }
    } else if (s.stage === 'market') {
      // Börse: aus dem, was wirklich gerechnet wurde, die einzelnen Analyse-Schritte (nur die, die zur Frage gehören)
      const m = s.meta || {}, n = m.count || 0;
      const notes = Array.isArray(m.steps) ? m.steps.map(([k, x]) => [k, x || '']) : []; // vom Server: genau die Schritte dieser Frage
      if (!Array.isArray(m.steps)) {
      if (m.depot != null) {
        notes.push(['portfolio', `${m.depot} ${m.depot === 1 ? 'position' : 'positions'}`]);
        if (m.depot > 1) notes.push(['allocation', '']);
      }
      if (m.indices || m.headlines) notes.push(['market', [m.indices ? `${m.indices} indices` : '', m.headlines ? `${m.headlines} headlines` : ''].filter(Boolean).join(' · ')]);
      if (n) notes.push(['charts', `${n} ${n === 1 ? 'stock' : 'stocks'}${m.frames ? ' · day, week, month' : ''}`]);
      if (m.fundamentals) notes.push(['fundamentals', '']);
      if (n && (m.mode === 'ideas' || m.mode === 'both')) notes.push(['opportunities', m.radar ? `${m.radar} ${m.radar === 1 ? 'chance' : 'chances'}` : 'none right now']);
      if (n || m.depot) notes.push(['risk', '']);
      }
      if (!notes.length) { line.innerHTML = `${P('market').sub} <span class="ph-x">· market data not reachable</span> ${dur}`; st.step.classList.add('warn'); }
      else {
        const [k0, x0] = notes.shift();
        line.innerHTML = `${doneLine(k0, x0)} ${dur}`;
        let after = st.step;
        notes.forEach(([k, x]) => { const n2 = stepLine('dot', doneLine(k, x)); after.after(n2); after = n2; });
        phase(notes.length ? notes[notes.length - 1][0] : k0);
      }
    } else if (s.stage === 'material') {
      const m = s.meta || {}; // Marker bleibt ein Punkt (kein Icon)
      line.innerHTML = `${doneLine('material', m.relevant === true ? 'answering from them' : m.relevant === false ? 'nothing on this topic' : '')} ${dur}`;
    } else if (s.stage === 'processing') {
      line.innerHTML = `${doneLine('work', 'draft')} ${dur}`;
    } else if (s.stage === 'verifying') {
      const m = s.meta || {};
      line.innerHTML = `${doneLine('review', m.checked === false ? 'not available' : m.corrected ? `corrected ${m.corrected} ${m.corrected === 1 ? 'point' : 'points'}` : 'no issues found')} ${dur}`;
    }
    scrollToBottom();
  };

  const onStatus = async (s) => {
    if (s.stage === 'working' && s.meta?.quiet) { quiet = true; removePending(); return; }
    if (s.stage === 'thinking') {
      if (s.status === 'active' && work) phase('plan');
      if (s.status === 'active') { startThinking(); think.serverFrom = Date.parse(s.ts) || null; } else { if (think) think.serverTo = Date.parse(s.ts) || null; await endThinking(s); }
    } else if (STAGE_TEXT[s.stage]) {
      if (s.status === 'active') startStage(s); else endStage(s);
    } else if (s.stage === 'search_failed') {
      addStep('Source search failed – answering without external sources', 'warn');
    } else if (s.stage === 'answering' && s.status === 'active' && /nicht möglich/.test(s.description)) {
      addStep('Revision not possible – showing the checked draft', 'warn');
    } else if (s.stage === 'generation_failed') {
      failed = true;
    } else if (s.stage === 'answering' && s.status === 'active' && work) {
      noteAnalyze();
      if (deep.steps.synth && !deep.steps.synth.done) deepDone('synth', doneLine('synthesize'));
      const wk = s.meta?.extract ? 'extract' : 'work'; // Bär: Käufe/Verkäufe aus Tagebuch/Nachricht auslesen
      workKey = wk;
      if (!thought || thought.done) phase(wk);
      if (!stages.answering && !pendingAskStep()) {
        const from = Date.now();
        const step = stepLine('spin', live(wk, from));
        stages.answering = { step, from, serverFrom: Date.parse(s.ts) || null };
        if (thought && !thought.done) step.hidden = true; // das Modell denkt noch – „Writing“ erst, wenn Text kommt
        work.steps.append(step);
        scrollToBottom();
      }
    } else if (s.stage === 'answering' && s.status === 'done' && stages.answering && !stages.answering.ended) {
      const st = stages.answering;
      st.ended = true;
      finishStep(st.step, `${wroteLabel()} <span class="t">${st.serverFrom && s.ts ? secs(st.serverFrom, Date.parse(s.ts)) : secs(st.from)}</span>`);
    }
  };

  const onResearch = (r) => {
    if (r.status === 'grounding') {
      // Google-Suche (nur bei aktuellen Themen): genutzte Websites als Chips
      let st = stages.web;
      if (!st) {
        const step = addStep('<span class="web-line"></span>');
        st = stages.web = { step, chips: el('div', 'chips'), ended: true };
        step.append(st.chips);
      }
      st.step.querySelector('.web-line').innerHTML = `Searched the web · <strong>${r.sources.length} ${r.sources.length === 1 ? 'source' : 'sources'}</strong>`;
      fillChips(st.chips, r.sources, () => openSourcesModal(r.sources, null));
      return;
    }
    if (r.status === 'done' || r.status === 'failed') {
      renderOpts.sources = [];
      (r.sources || []).forEach((s) => { renderOpts.sources[s.n - 1] = s; });
    }
  };

  /* Websites besuchen: besuchte Seiten erscheinen nach und nach als Chips (wie die Quellen), max. 2 Reihen + „+N“.
     Was auf der Seite stand, zeigt der Tooltip. */
  const onWeb = (e) => {
    const st = stages.browsing;
    if (st && e.action === 'visit' && !st.gathering) {
      // Suche fertig → „Gathering information“ als eigener Schritt, darunter die gelesenen Seiten
      st.gathering = true;
      finishStep(st.step, `${doneLine(st.key)} <span class="t">${secs(st.from)}</span>`);
      markerIcon(st.step, 'search');
      st.from = Date.now(); st.serverFrom = null;
      const g = stepLine('spin', live('gather', st.from));
      g.append(st.chips);
      st.step.after(g);
      st.step = g;
      phase('gather');
    }
    if (!st || e.action !== 'visited' || e.status !== 'done') return;
    st.pages.push({ title: e.title || e.domain, domain: e.domain, url: e.url, seen: e.seen });
    fillChips(st.chips, st.pages, () => openSourcesModal(st.pages, null));
    scrollToBottom();
  };

  /* Echte Gedanken des Modells (Gemini: Zusammenfassungen, Nemotron: Gedankengang) als einzelne Arbeitsschritte in der Zeitleiste:
     jeder Abschnitt eine Zeile (ChatVisuals.thoughtSteps), der laufende mit Ladezeichen. Ein Klick auf einen fertigen Schritt zeigt seinen Text. */
  let thought = null;
  const finishThoughtStep = (st) => {
    if (st.done) return;
    st.done = true;
    finishStep(st.step);
    st.head.textContent = st.title;
  };
  const onThought = (text) => {
    if (answerR || !text || pictureAsk || quiet) return; // Bildwunsch: nur „Generating picture“; Kurznachricht: gar nichts
    if (!thought) {
      ensureWork();
      if (stages.answering) stages.answering.step.hidden = true;
      phase('thoughts');
      thought = { from: Date.now(), raw: '', done: false, steps: [] };
    }
    thought.raw += text;
    ChatVisuals.thoughtSteps(thought.raw).forEach((seg, i) => {
      let st = thought.steps[i];
      if (!st) {
        if (thought.steps[i - 1]) finishThoughtStep(thought.steps[i - 1]); // neuer Abschnitt → der vorige ist fertig
        const step = stepLine('spin', '');
        step.classList.add('thought');
        const head = el('button', 'thought-head');
        head.type = 'button';
        const box = el('div', 'thought-text');
        const fold = el('div', 'fold'); // weiches Auf-/Zuklappen (Höhe + Einblenden)
        const inner = el('div', 'fold-in');
        inner.append(box);
        fold.append(inner);
        step.querySelector('.step-line').append(head);
        step.append(fold);
        st = thought.steps[i] = { step, head, box, title: '', done: false };
        head.addEventListener('click', () => { if (st.done && st.box.textContent) step.classList.toggle('open'); });
        work.steps.insertBefore(step, stages.answering?.step || null);
      }
      if (st.title !== seg.title) {
        st.title = seg.title;
        if (st.done) st.head.textContent = seg.title;
        else st.head.innerHTML = `<span class="shimmer">${escapeHtml(seg.title)}</span>`;
      }
      if (seg.body !== seg.title) st.box.textContent = seg.body;
    });
    scrollToBottom();
  };
  const endThought = () => {
    if (!thought || thought.done) return;
    thought.done = true;
    thought.steps.forEach(finishThoughtStep);
  };
  const pendingAskStep = () => false; // Rückfragen laufen über die Zeitleiste selbst
  let errorText = ''; // Fehlerkarte gezeigt → darunter die normale Leiste

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: historyForRequest(historyOf(tab)), model: state.model, effort: EFFORTS[state.effort].toLowerCase(), fast: state.fast, agent: window.PixelDogs?.mode, ...(prefix ? { partial: prefix } : {}) }),
      signal,
    });
    if (!response.ok || !response.body) throw new Error(`Server antwortet nicht (HTTP ${response.status}). Läuft node server.js?`);

    for await (const { event, data } of readSse(response)) {
      if (event === 'status') await onStatus(data);
      else if (event === 'research') onResearch(data);
      else if (event === 'web') onWeb(data);
      else if (event === 'deep') onDeep(data);
      else if (event === 'bestand') { // Bär hat Käufe/Verkäufe eingetragen → eigener Schritt mit dem Ergebnis
        const a = data.added?.length || 0, so = data.sold?.length || 0, sk = (data.skipped || 0) + (data.unchanged || 0), un = data.unknown?.length || 0;
        const rm = data.removed?.length || 0;
        const parts = [data.cleared ? 'depot cleared' : '', rm ? `${rm} removed` : '', a ? `${a} ${a === 1 ? 'buy' : 'buys'}` : '', so ? `${so} ${so === 1 ? 'sale' : 'sales'}` : '', sk ? `${sk} already there` : '', un ? `${un} not recognized` : ''].filter(Boolean);
        if (parts.length) { noteStep('saveDepot', parts.join(' · ')); phase('saveDepot'); }
      }
      else if (event === 'citations') citations = data;
      else if (event === 'thought') onThought(data.text);
      else if (event === 'codestatus') window.CodeAgent?.status(msgEl, data.text); // Coding-Agent: „Datei wird angelegt: …“ live unter der Antwort
      else if (event === 'reset') {
        // Prüfung hat Fehler gefunden: Entwurf weich ausblenden, korrigierte Fassung neu schreiben
        if (answerR) {
          answerR.flush();
          const old = answer.cloneNode(true);
          old.classList.add('answer-out');
          answer.replaceWith(old);
          setTimeout(() => old.remove(), 260);
          answer.replaceChildren();
          answerR = null;
        }
      }
      else if (event === 'text') {
        if (!answerR) {
          if (thought && !thought.done) { // Denken vorbei, jetzt erscheint der Text
            endThought();
            if (stages.answering) stages.answering.step.hidden = false;
            phase('work');
          }
          removePending();
          msgEl.append(answer);
          answerR = makeRenderer(answer, renderOpts);
          if (prefix) { answerR.append(prefix); answerR.flush(); } // Weiterschreiben: bisheriger Text steht sofort da
        }
        answerR.append(data.text);
        // die KI baut gerade eine Mindmap/einen Zeitstrahl/eine Präsentation, ohne dass die Frage es sagte → Schritt passend umbenennen
        if (!fmt && data.text.includes('`') && window.Thinking?.blockFormat) {
          const bf = Thinking.blockFormat(answerR.text);
          if (bf) {
            fmt = bf;
            const sh = stages.answering?.step.querySelector('.shimmer');
            if (sh && workKey === 'work') sh.textContent = P('work').sub;
            if (workKey === 'work') phase('work');
          }
        }
        updatePlan(); // Planpunkte abhaken, sobald sie in der Antwort stehen
        // Bild-Block fertig geschrieben → Bild schon jetzt erzeugen lassen, der Text läuft weiter
        if (!coding && /[`}]/.test(data.text)) {
          prefetchIllustrations(answerR.text, signal);
          if (/```illustration[^\n]*\n[\s\S]*?```/.test(answerR.text)) showPicStep(); // Bild wird erzeugt → Schritt in der Zeitleiste
        }
      } else if (event === 'error') {
        failed = true;
        if (data.detail?.limit) { msgEl.append(limitNote(limitText(data.detail.resetAt))); scrollToBottom(); } // Limit: ruhig, nicht rot
        else if (data.detail?.key) { msgEl.append(keyCard(data.detail.key, data.message)); scrollToBottom(); } // API-Key fehlt/abgelehnt: Karte mit Weg zu den Einstellungen
        else if (data.detail?.partial && answerR?.text.trim()) interrupted = true; // unterbrochen → Karte zum Weiterschreiben (unten)
        else { errorText = data.message || 'Unbekannter Fehler'; msgEl.append(errorCard(msgEl, errorText, data.detail?.status)); scrollToBottom(); }
      }
    }
  } catch (err) {
    if (err.name !== 'AbortError' && answerR?.text.trim()) interrupted = true; // Verbindung mitten in der Antwort weg → weiterschreiben anbieten
    else if (err.name !== 'AbortError') { errorText = err.message || 'Verbindung unterbrochen'; msgEl.append(errorCard(msgEl, errorText, null)); scrollToBottom(); } // gestoppt: kein Hinweis – unten erscheint „Neu starten“
  } finally {
    window.CodeAgent?.status(msgEl, ''); // Live-Zeile des Coding-Agenten weg
    [...deep.subs.values(), ...[...deep.queries.values()].map((q) => q.row)].forEach((row) => { if (row.dataset.state === 'active') row.dataset.state = 'todo'; }); // ohne eigene Quelle: offen, kein vorgetäuschter Haken
    clearInterval(timer);
    removePending();
    endThought();
    updatePlan(true); // Ende: Ladezeichen weg, nicht behandelte Punkte bleiben offen
    if (think && !think.done) {
      think.done = true;
      clearTimeout(think.showTimer);
      if (!think.hidden) closeThinking();
    }
    // offene Stufen sauber abschließen (z. B. beim Stoppen)
    if (stages.answering && !stages.answering.ended) {
      stages.answering.ended = true;
      finishStep(stages.answering.step, signal.aborted ? `${P('work').sub} – stopped` : `${wroteLabel()} <span class="t">${secs(stages.answering.from)}</span>`);
    }
    Object.entries(stages).forEach(([stage, st]) => {
      if (!st.ended && stage !== 'answering') endStage({ stage, status: signal.aborted ? 'cancelled' : 'failed' });
    });
    if (!answerR) finishPicStep(signal.aborted); // gar keine Antwort (Fehler/Stopp): kein hängendes „Generating picture“
    if (answerR) {
      if (signal.aborted) answerR.flush();
      else await answerR.finish();
      if (!signal.aborted) {
        if (!coding && answer.querySelector('.chat-illustration[data-prompt]')) { ensureWork(); showPicStep(); } // auch bei schnellen Antworten ohne Zeitleiste: jetzt „Painting“ zeigen
        pictures = hydrateIllustrations(answer, signal);
        if (picStep) pictures.finally(() => finishPicStep(signal.aborted));
      } else { answer.querySelectorAll('.chat-illustration[data-prompt]').forEach((f) => f.remove()); finishPicStep(true); } // gestoppt: keine hängenden Platzhalter
    }
    // Bild entsteht noch: erst den Text fertig schreiben, DANN malt der Hund an der Staffelei („Painting“), bis das Bild da ist –
    // erst danach Daumen hoch und „Completed“ (vorher sprang er schon zum Daumen, während das Bild noch lief)
    const okEnd = !signal.aborted && !failed && !/```ask/.test(answerR?.text || '');
    const picsPending = !!(picStep && !picStep.done && pictures && !signal.aborted);
    if (picsPending) {
      ensureActor(); actor?.set('paint');
      pictures.finally(() => actor?.finish(okEnd));
    } else actor?.finish(okEnd);
    if (work) {
      work.endStart?.();
      const wTitle = work.head.querySelector('.work-title');
      const endTitle = () => { work.work.classList.remove('active'); wTitle.classList.remove('sweep'); swapText(wTitle, signal.aborted || failed ? 'Stopped after' : P('done').main); };
      if (picsPending) {
        setActivity(P('picture').kind, P('picture').main);
        pictures.finally(() => { endTitle(); const tt = work.head.querySelector('.t'); tt.classList.remove('live'); tt.textContent = secs(); });
      } else endTitle();
      // Abschluss: blauer Haken mit kurzer Zusammenfassung (Schritte, Quellen) – nur, wenn wirklich fertig
      if (!signal.aborted && !failed && !/```ask/.test(answerR?.text || '') && !work.steps.querySelector('.step.finished')) {
        const n = work.steps.querySelectorAll(':scope > .step:not([hidden])').length;
        const used = renderOpts.sources.filter(Boolean).length;
        const meta = [n ? `${n} ${n === 1 ? 'step' : 'steps'}` : '', used ? `${used} ${used === 1 ? 'source' : 'sources'}` : ''].filter(Boolean).join(' · ');
        const fin = stepLine('dot', `<strong>${P('done').sub}</strong>${meta ? ` <span class="t">${meta}</span>` : ''}`);
        fin.classList.add('finished');
        markerIcon(fin, 'check-circle', 'done');
        work.steps.append(fin);
        // fertig → die Zeitleiste klappt kurz danach weich zu (per Klick wieder auf)
        const w = work.work;
        const collapse = () => setTimeout(() => { if (w.isConnected && !w.classList.contains('collapsed')) toggleWork(w, true); }, 900);
        if (picStep && !picStep.done && pictures) pictures.finally(collapse); else collapse(); // erst zuklappen, wenn auch das Bild fertig ist
      }
      const t = work.head.querySelector('.t');
      t.classList.remove('live');
      t.textContent = secs();
    }
    msgEl.querySelectorAll('.t.live').forEach((t) => t.classList.remove('live'));
  }
  // Hat die KI Rückfragen gestellt? → Eingabefeld wird zum Fragefeld
  const questions = answerR && !signal.aborted ? parseAskBlock(answerR.text) : null;
  if (answerR && !questions && answerR.text.trim()) {
    // Tiefen-Recherche: Quellen immer unten zeigen – ohne Belegzählung alle gelesenen Quellen
    const allSrc = renderOpts.sources.filter(Boolean);
    let main = mainSources(allSrc, citations);
    if (!main.length && deep.all.length) main = allSrc;
    const loose = placeSourceStack(answer, main);
    const footer = messageFooter(msgEl, answerR.text);
    if (loose) footer.append(loose);
    msgEl.append(footer);
    // „Generating picture“ läuft noch → Kopieren/Neu erzeugen/Ins Dokument erst danach einblenden
    if (pictures && answer.querySelector('.chat-illustration[data-prompt], .illustration-pending')) {
      footer.hidden = true;
      pictures.finally(() => { footer.hidden = false; footer.classList.add('late-in'); });
    }
  }
  else if (errorText && !signal.aborted && !questions) {
    // Fehler ohne Antworttext: unter der Karte dieselbe Leiste wie bei einer Antwort (Kopieren, Neu erzeugen, Ins Dokument)
    const footer = messageFooter(msgEl, errorText);
    footer.classList.add('late-in');
    msgEl.append(footer);
  }
  else if (signal.aborted && !questions) {
    // gestoppt, bevor Text kam: alles Bisherige bleibt sichtbar, darunter nur „Neu erzeugen“
    msgEl.append(restartBar(msgEl));
  }
  if (interrupted) { msgEl._partial = answerR.text; msgEl.insertBefore(resumeCard(msgEl), msgEl.querySelector('.msg-actions')); }
  // Der Agent passt nicht zur Aufgabe → Karte zum Wechseln (z. B. „Zu Coden wechseln“)
  const suggested = answerR && !signal.aborted ? parseAgentBlock(answerR.text) : null;
  if (suggested) msgEl.insertBefore(agentSuggestCard(msgEl, suggested), msgEl.querySelector('.msg-actions'));
  if (questions) {
    // Rückfrage gehört zum Denken: kein eigener Antworttext, sondern ein Schritt in der Zeitleiste
    if (stripAskBlock(answerR.text).trim().length < 300) answer.remove();
    const w = ensureWork();
    const step = stepLine('spin', '<span class="shimmer">Waiting for your answer</span>');
    w.steps.append(step);
    setActivity('wait', 'Needs your input');
    w.head.querySelector('.t').hidden = true;
    tab._pendingAsk = { msgEl, work: w, step, questions };
    if (tab === activeTab()) setTimeout(() => { if (tab === activeTab()) showAskPanel(questions); }, 150); // sonst beim Öffnen des Chats
  }
  msgEl._sources = renderOpts.sources.slice(); // für gespeicherte Chats (Belege [1], [2] … – Stelle = Nummer)
  // Gedanken dieser Runde mitspeichern, damit sie nach dem Neustart wieder in der Zeitleiste stehen
  msgEl._thoughts = thought?.steps.length ? thought.steps.map((s) => ({ title: s.title, body: s.box.textContent })) : null;
  msgEl._workTime = work?.head.querySelector('.t')?.textContent || '';
  return answerR ? answerR.text : '';
}

/* ===================================================================
   Rückfragen-Feld: ersetzt das Eingabefeld, solange die KI etwas wissen will.
   Eine Antwort anklicken (oder mehrere bei Mehrfachauswahl), oder eigene
   Antwort schreiben → Weiter / Senden. Tasten: 1–9 wählen, Enter weiter (nur mit Antwort). Überspringen nur per Klick.
   =================================================================== */
const askPanel = el('div', 'ask-panel');
askPanel.setAttribute('role', 'group');
askPanel.setAttribute('aria-label', 'Rückfragen der KI');
composer.prepend(askPanel);
let ask = null; // { questions, index, answers: [{ picked: Set, own: '' }] }

/* Kurzer Text mit Formeln/Fettdruck (ohne Absatz-Abstände) – für Fragen und Optionen */
function renderInline(target, text) {
  renderMarkdown(target, text);
  const p = target.querySelector(':scope > p:only-child');
  if (p) p.replaceWith(...p.childNodes);
}

function showAskPanel(questions) {
  askPanel.tabIndex = -1;
  ask = { questions, index: 0, answers: questions.map(() => ({ picked: new Set(), own: '' })) };
  composer.classList.add('asking');
  renderAsk();
  scrollToBottom(true);
}

// Chat gewechselt: Stopp-Knopf nur, wenn DIESER Chat gerade antwortet; offene Rückfrage dieses Chats wieder zeigen
window.addEventListener('chat-tab-switched', (e) => {
  setRunning(!!runOf(e.detail));
  if (ask) hideAskPanel();
  const pa = pendingOf(e.detail);
  if (pa?.questions && !runOf(e.detail)) setTimeout(() => { if (e.detail === activeTab() && !ask) showAskPanel(pa.questions); }, 60);
});
function skipAsk() {
  hideAskPanel();
  const pa = pendingOf();
  if (!pa) return;
  activeTab()._pendingAsk = null;
  finishStep(pa.step, 'Question skipped');
  const w = pa.work;
  w.work.classList.remove('active');
  swapText(w.head.querySelector('.work-title'), 'Stopped after');
  w.head.querySelector('.t').hidden = false;
  pa.msgEl.querySelector('.answer')?.remove();
  if (!pa.msgEl.querySelector('.msg-actions')) pa.msgEl.append(restartBar(pa.msgEl));
}
function hideAskPanel() {
  ask = null;
  stopDictateInto();
  composer.classList.remove('asking');
  askPanel.replaceChildren();
  input.focus();
}

/* dir: 1 = weiter, -1 = zurück → neue Frage gleitet aus dieser Richtung herein, die Höhe passt sich weich an */
function renderAsk(dir = 0) {
  stopDictateInto(); // Feld wird neu gebaut
  const h0 = dir ? askPanel.offsetHeight : 0;
  const q = ask.questions[ask.index];
  const a = ask.answers[ask.index];
  const last = ask.index === ask.questions.length - 1;
  const many = ask.questions.length > 1;

  // Kopfzeile: „Rückfrage“ bzw. „Frage x von y“ mit Fortschritts-Strichen, rechts × (= Überspringen); darunter die Frage
  const head = el('div', 'ask-head');
  const top = el('div', 'ask-top');
  top.append(el('span', 'ask-kicker', many ? `Frage ${ask.index + 1} von ${ask.questions.length}` : 'Rückfrage'));
  if (many) {
    const bars = el('span', 'ask-progress');
    ask.questions.forEach((_, k) => bars.append(el('i', k < ask.index ? 'done' : k === ask.index ? 'on' : '')));
    top.append(bars);
  }
  top.append(el('div', 'flex-spacer'));
  const close = el('button', 'ask-tool', icon('i-x', 14));
  close.type = 'button';
  close.setAttribute('aria-label', 'Überspringen');
  close.title = 'Überspringen';
  close.addEventListener('click', skipAsk);
  top.append(close);
  const qEl = el('div', 'ask-q md');
  renderInline(qEl, q.question);
  head.append(top, qEl);
  if (q.multi && q.options.length) head.append(el('div', 'ask-sub', 'Mehrere Antworten möglich'));

  const list = el('div', 'ask-options');
  list.setAttribute('role', q.multi ? 'group' : 'radiogroup');
  q.options.forEach((opt, i) => {
    const b = el('button', `ask-opt${a.picked.has(i) ? ' selected' : ''}${q.multi ? ' multi' : ''}`);
    b.type = 'button';
    b.setAttribute('role', q.multi ? 'checkbox' : 'radio');
    b.setAttribute('aria-checked', String(a.picked.has(i)));
    b.innerHTML = `<span class="ask-key">${i + 1}</span><span class="ask-label md"></span><span class="ask-mark">${icon('i-check')}</span>`;
    renderInline(b.querySelector('.ask-label'), opt);
    b.addEventListener('click', () => pickOption(i));
    list.append(b);
  });

  // „Eigene Antwort“: Zeile mit Stift – man tippt direkt hinein oder spricht über das Mikro rechts
  const ownRow = el('label', `ask-opt ask-own-row${a.own.trim() ? ' selected' : ''}`);
  ownRow.innerHTML = '<span class="ask-key ask-pen"><svg width="14" height="14"><use href="#f-pencil"/></svg></span>';
  const own = document.createElement('input');
  own.className = 'ask-own-in';
  own.type = 'text';
  own.placeholder = q.options.length ? 'Oder eigene Antwort schreiben' : 'Deine Antwort…';
  own.value = a.own;
  const ownMic = el('button', 'ask-mic', icon('i-mic', 14));
  ownMic.type = 'button';
  ownMic.setAttribute('aria-label', 'Antwort einsprechen');
  ownMic.title = 'Antwort einsprechen';
  ownMic.addEventListener('click', (e) => { e.preventDefault(); dictateInto(own, ownMic); });
  ownRow.append(own, ownMic);
  ownRow.insertAdjacentHTML('beforeend', `<span class="ask-mark">${icon('i-check')}</span>`);
  const markOwn = () => ownRow.classList.toggle('selected', document.activeElement === own || !!own.value.trim());
  own.addEventListener('focus', () => {
    // hineinklicken wählt die eigene Antwort (bei Einfachauswahl ersetzt sie die gewählte Option)
    if (!q.multi && a.picked.size) {
      a.picked.clear();
      list.querySelectorAll('.ask-opt:not(.ask-own-row)').forEach((btn) => { btn.classList.remove('selected'); btn.setAttribute('aria-checked', 'false'); });
      updateAskButtons();
    }
    markOwn();
  });
  own.addEventListener('blur', markOwn);
  own.addEventListener('input', () => {
    a.own = own.value;
    if (!q.multi && own.value.trim()) a.picked.clear(); // eigene Antwort ersetzt die Auswahl
    updateAskButtons();
    markOwn();
    list.querySelectorAll('.ask-opt:not(.ask-own-row)').forEach((btn, i) => {
      btn.classList.toggle('selected', a.picked.has(i));
      btn.setAttribute('aria-checked', String(a.picked.has(i)));
    });
  });
  list.append(ownRow);
  own.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); askNext(); } // weiter nur mit Antwort (askNext prüft das)
    e.stopPropagation(); // Zahlen im Textfeld nicht als Auswahl werten
  });

  // unten links: Überspringen, Zurück (ab Frage 2); rechts: Senden – bei weiteren Fragen „Weiter“; blau, sobald es geht
  const foot = el('div', 'ask-foot');
  const skip = el('button', 'ask-btn ghost ask-skip', 'Überspringen');
  skip.type = 'button';
  skip.addEventListener('click', skipAsk);
  foot.append(skip);
  if (ask.index > 0) {
    const back = el('button', 'ask-btn ghost ask-back', `${icon('i-back', 14)}Zurück`);
    back.type = 'button';
    back.addEventListener('click', () => { ask.index--; renderAsk(-1); });
    foot.append(back);
  }
  foot.append(el('div', 'flex-spacer'));
  const next = el('button', 'ask-btn primary', last ? 'Senden' : 'Weiter');
  next.type = 'button';
  next.id = 'askNext';
  next.addEventListener('click', askNext);
  foot.append(next);

  const body = el('div', 'ask-body');
  body.append(head, list);
  askPanel.replaceChildren(body, foot);
  updateAskButtons();
  if (dir && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const ease = 'cubic-bezier(0.16, 1, 0.3, 1)';
    body.animate([{ opacity: 0, transform: `translateX(${dir * 16}px)` }, { opacity: 1, transform: 'none' }], { duration: 380, easing: ease });
    const h1 = askPanel.offsetHeight;
    if (Math.abs(h1 - h0) > 1) {
      askPanel.style.overflow = 'hidden';
      askPanel.animate([{ height: `${h0}px` }, { height: `${h1}px` }], { duration: 380, easing: ease }).onfinish = () => { askPanel.style.overflow = ''; };
    }
  }
  // Fokus aufs Feld selbst, nicht auf Antwort 1 – sonst wählt Enter still die erste Antwort
  if (q.options.length) askPanel.focus({ preventScroll: true }); else own.focus({ preventScroll: true });
}

/* Spracheingabe direkt in ein Antwortfeld (Rückfragen): Klick startet, nochmal Klick stoppt */
let ownRec = null;
function stopDictateInto() {
  if (!ownRec) return;
  ownRec.btn.classList.remove('active');
  ownRec.rec.onend = null;
  try { ownRec.rec.stop(); } catch {}
  ownRec = null;
}
function dictateInto(field, btn) {
  if (ownRec) { const same = ownRec.field === field; stopDictateInto(); if (same) return; }
  if (!SpeechRecognition) { showHint('Spracheingabe: Chrome, Edge oder Safari nutzen'); return; }
  if (listening) stopListening();
  const rec = new SpeechRecognition();
  rec.lang = SPEECH_LANG;
  rec.continuous = true;
  rec.interimResults = true;
  const base = field.value;
  rec.onresult = (e) => {
    let text = '';
    for (let i = 0; i < e.results.length; i++) text = joinText(text, e.results[i][0].transcript);
    field.value = joinText(base, text);
    field.dispatchEvent(new Event('input'));
  };
  rec.onerror = (e) => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { stopDictateInto(); showHint('Kein Mikrofon-Zugriff – im Browser erlauben'); } };
  rec.onend = () => { if (ownRec?.rec === rec) stopDictateInto(); };
  ownRec = { rec, field, btn };
  btn.classList.add('active');
  field.focus();
  try { rec.start(); } catch { stopDictateInto(); }
}

function pickOption(i) {
  const q = ask.questions[ask.index];
  const a = ask.answers[ask.index];
  if (q.multi) { a.picked.has(i) ? a.picked.delete(i) : a.picked.add(i); }
  else { a.picked = new Set(a.picked.has(i) ? [] : [i]); a.own = ''; }
  // nur Zustände umschalten (kein Neuaufbau) – so blendet die Auswahl weich um
  askPanel.querySelectorAll('.ask-opt:not(.ask-own-row)').forEach((btn, k) => {
    btn.classList.toggle('selected', a.picked.has(k));
    btn.setAttribute('aria-checked', String(a.picked.has(k)));
  });
  const own = askPanel.querySelector('.ask-own-in');
  if (own && !q.multi) { own.value = ''; own.closest('.ask-own-row')?.classList.remove('selected'); }
  updateAskButtons();
}

function answerText(i) {
  const q = ask.questions[i];
  const a = ask.answers[i];
  const parts = [...a.picked].sort().map((k) => q.options[k]);
  if (a.own.trim()) parts.push(a.own.trim());
  return parts.join(', ');
}

// Weiter nur mit Antwort; Senden (letzte Frage) erst, wenn ALLE Fragen beantwortet sind – sonst wegklicken (×/Überspringen)
const allAnswered = () => ask.questions.every((_, k) => !!answerText(k));
function updateAskButtons() {
  const btn = askPanel.querySelector('#askNext');
  if (btn) btn.disabled = !answerText(ask.index) || (ask.index === ask.questions.length - 1 && !allAnswered());
}

function askNext() {
  if (!ask || !answerText(ask.index)) return;
  if (ask.index < ask.questions.length - 1) { ask.index++; renderAsk(1); return; }
  if (!allAnswered()) return;
  const qa = ask.questions.map((q, k) => {
    const a = ask.answers[k];
    const picked = [...a.picked].sort((x, y) => x - y).map((n) => ({ num: n + 1, text: q.options[n] }));
    if (a.own.trim()) picked.push({ num: null, text: a.own.trim() });
    return { question: q.question, picked };
  });
  hideAskPanel();
  if (runOf()) return;
  if (pendingOf()) continueAfterAsk(qa);
  else sendMessage(qaText(qa), []);
}

// Tasten im Fragefeld: 1–9 wählt eine Option, Enter = weiter (nur mit Antwort).
// Enter wählt nie eine Antwort aus und überspringt nie – Überspringen nur per Klick auf den Knopf.
document.addEventListener('keydown', (e) => {
  const target = e.target instanceof Element ? e.target : document.body;
  if (!ask || target.closest('input, textarea') || lightbox.classList.contains('open')) return;
  const n = parseInt(e.key, 10);
  const count = ask.questions[ask.index].options.length;
  if (n >= 1 && n <= count) { e.preventDefault(); pickOption(n - 1); }
  else if (n === count + 1) { e.preventDefault(); askPanel.querySelector('.ask-own-in')?.focus(); } // letzte Nummer = eigene Antwort
  else if (e.key === 'Enter') { e.preventDefault(); if (answerText(ask.index)) askNext(); }
});

const qaText = (qa) => qa.map((x) => `${x.question} → ${x.picked.map((p) => p.text).join(', ') || '(keine Angabe)'}`).join('\n');

/* Antwort auf eine Rückfrage: in der Zeitleiste zeigen (Frage + gewählte Antworten) und in derselben Nachricht weiterarbeiten */
async function continueAfterAsk(qa) {
  const tab = activeTab(), p = pendingOf(tab);
  tab._pendingAsk = null;
  finishStep(p.step, 'Your answer');
  const box = el('div', 'qa-box');
  qa.forEach(({ question, picked }) => {
    const row = el('div', 'qa-row');
    const q = el('div', 'qa-q md');
    renderInline(q, question);
    const a = el('div', 'qa-a');
    picked.forEach((p) => {
      const pill = el('span', 'qa-pick');
      if (p.num) pill.append(el('span', 'qa-num', String(p.num)));
      const label = el('span', 'qa-label md');
      renderInline(label, p.text);
      pill.append(label);
      a.append(pill);
    });
    if (!picked.length) a.append(el('span', 'qa-none', 'keine Angabe'));
    row.append(q, a);
    box.append(row);
  });
  p.step.append(box);
  scrollToBottom(true);
  history.push({ role: 'user', text: qaText(qa) });
  const controller = new AbortController();
  startRun(tab, controller);
  try {
    const answer = await runChat(p.msgEl, controller.signal, p.work, tab);
    historyOf(tab).push({ role: 'assistant', text: answer || '(keine Antwort)', sources: p.msgEl._sources, ...thoughtsOf(p.msgEl) });
  } finally {
    endRun(tab, controller);
  }
}

/* ---------- Senden ---------- */
/* ---------- Agent + Dokumente ----------
   „Erstelle dazu ein Dokument“ → im Chat erscheint das Fenster „Dokument erstellen“ (Stil wie bei den Aufgaben):
   Titel (vom Chat) und Beschreibung schlägt die KI vor, ein Klick auf den blauen Knopf legt es an, öffnet es
   und man sieht, wie die KI hineinschreibt. Der Chat merkt sich sein Dokument (docId): „Bearbeite …“ ändert es. */
// 'edit' | 'create' | 'maybe' (KI entscheidet, siehe docIntentAsk) | null
// „Notiz“ nur als eigenes Wort – „Randnotizen“, „Notizbuch“-Fragen usw. lösen nichts aus
function docIntent(text) {
  if (!window.Docs) return null;
  const t = text.toLowerCase();
  const linked = chatOf(activeTab())?.docId;
  const has = linked && window.Docs.get(linked);
  const NOUN = '(dokumente?|docs?|notiz|notizen)';
  const mentions = new RegExp(`\\b${NOUN}\\b`).test(t);
  if (!mentions && !has) return null;
  const fresh = new RegExp(`(neue[snm]?|weitere[snm]?|andere[snm]?|zweite[snm]?)\\s+${NOUN}\\b`).test(t);
  const editVerb = /(bearbeit|änder|ergänz|kürz|erweiter|überarbeit|umschreib|schreib\s.*\bum\b|formulier|verschieb|lösch|entfern|korrigier|füg|hinzu|pack|übernimm|tausch|aktualisier|verbesser)/.test(t);
  const editStart = /^(bitte\s+)?(bearbeite|ändere|ergänze|kürze|erweitere|überarbeite|formuliere|verschiebe|lösche|entferne|korrigiere|füge|aktualisiere|verbessere)\b/.test(t);
  if (has && !fresh && (mentions || editStart) && editVerb) return 'edit';
  if (!mentions) return null;
  // eindeutige Bitte: „erstell(e) mir ein Dokument“, „mach daraus eine Notiz“, „schreib das in ein Dokument“, „Dokument anlegen“
  const strict = new RegExp(`^(bitte\\s+|kannst du\\s+|könntest du\\s+)?(erstell|leg|mach|schreib|pack|speicher|übertrag|notier|sicher|füg)\\w*\\b[^.?!]{0,40}\\b(ein(e|en)?|daraus|draus|dazu|davon|in|ins|als)\\b[^.?!]{0,20}\\b${NOUN}`).test(t)
    || new RegExp(`\\b${NOUN}\\s+(erstellen|anlegen|machen|draus machen|daraus machen)\\b`).test(t);
  if (strict && !t.includes('?')) return 'create'; // Fragen („Soll ich mir eine Notiz machen?“) beurteilt die KI
  // „Dokument/Notiz“ mit einem Verb, aber nicht eindeutig → die KI beurteilt es
  if (strict || /(erstell|anleg|mach|daraus|draus|schreib|speicher|übernimm|übertrag|exportier|notier)/.test(t)) return 'maybe';
  return null;
}
// KI fragen, ob wirklich ein Dokument gewünscht ist (sonst normale Antwort). Ohne KI: lieber kein Dokument.
async function docIntentAsk(text) {
  try {
    const r = await fetch('/api/doc-intent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
    const o = await r.json();
    return o.create === true;
  } catch { return false; }
}
function chatContext(list) {
  return list.filter((h) => h.text && !h.doc).slice(-14).map((h) => `${h.role === 'user' ? 'Nutzer' : 'KI'}: ${stripAskBlock(h.text)}`).join('\n\n');
}
// die letzte richtige KI-Antwort (vollständig) – das, was mit „schreib das ins Dokument“ meistens gemeint ist
function lastAnswerText(list) {
  const a = [...list].reverse().find((h) => h.role === 'assistant' && !h.doc && h.text && h.text !== '(keine Antwort)');
  return a ? stripAskBlock(a.text).replace(AGENT_BLOCK, '').trim() : '';
}
// Bearbeiten-Wunsch, der nur etwas HINZUFÜGT („füg das hinzu“, „ergänze …“, „schreib das ins Dokument“) → nur das Neue schreiben lassen,
// das vorhandene Dokument bleibt unangetastet (früher schrieb die KI das ganze Dokument neu und ließ dabei Teile weg)
const DOC_ADD = /(füg|hinzu|ergänz|erweiter|übernimm|übertrag|pack|schreib\w*\b[^.?!]{0,30}\b(rein|hinein|dazu|ins|in das)\b|ins (dokument|doc|notiz)|anhäng|häng)/i;
const DOC_CHANGE = /(lösch|entfern|kürz|änder|umschreib|schreib\w*[^.?!]{0,30}\bum\b|überarbeit|korrigier|verschieb|tausch|formulier|verbesser|ersetz|sortier|struktur|gliedere)/i;
window.docWantsAppend = (t) => DOC_ADD.test(String(t || '')) && !DOC_CHANGE.test(String(t || '')); // auch für den Dokument-Chat (docs.js)
const chatTitleOf = (tab) => { const t = chatOf(tab)?.title || ''; return DEFAULT_TITLES.has(t) ? '' : t; };
async function docAiCall(body) {
  const r = await fetch('/api/doc-ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const o = await r.json().catch(() => ({}));
  if (!r.ok || !o.html) throw new Error(o.error || 'Die KI hat gerade nicht geantwortet.');
  return o;
}
// Titel + Beschreibung vorschlagen lassen (Titel des Chats hat Vorrang)
function docMeta(tab, extra = {}) {
  const chatTitle = chatTitleOf(tab);
  return docAiCall({ mode: 'meta', instruction: 'Titel und Beschreibung vorschlagen', chatTitle, chat: chatContext(historyOf(tab)), ...extra })
    .then((o) => ({ title: chatTitle || o.title, subtitle: o.subtitle }))
    .catch(() => ({ title: chatTitle }));
}
function docTurn(kind, text) {
  const tab = activeTab();
  history.push({ role: 'user', text });
  const entry = { role: 'assistant', text: '', doc: { kind, state: kind === 'create' ? 'ask' : 'work', instruction: text } };
  history.push(entry);
  const msgEl = el('div', 'msg-ai');
  msgEl._historyAt = history.length - 1;
  chat.append(msgEl);
  renderDocCard(msgEl, entry, tab);
  chatScroll.scrollTo({ top: chatScroll.scrollHeight, behavior: 'smooth' });
  saveChats();
  if (kind === 'edit') runDocEdit(msgEl, entry, tab);
}
const escDoc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function renderDocCard(msgEl, entry, tab = activeTab()) {
  const d = entry.doc;
  msgEl.replaceChildren();
  if (d.state === 'ask' && window.Docs) {
    const f = window.Docs.makeForm({
      title: d.title || chatTitleOf(tab), subtitle: '',
      onCancel: () => { d.state = 'no'; entry.text = 'Kein Dokument erstellt.'; msgEl.firstChild?.classList.add('closing'); setTimeout(() => renderDocCard(msgEl, entry), 180); saveChats(); },
      onCreate: (v) => runDocCreate(msgEl, entry, tab, v),
    });
    f.el.classList.add('dc-make-inline');
    msgEl.append(f.el); // ohne Frage davor – nur das schlichte Fenster
    return;
  }
  const doc = d.id && window.Docs?.get(d.id);
  if (d.state === 'no') { msgEl.innerHTML = '<div class="doc-note">Kein Dokument erstellt.</div>'; return; }
  if (d.state === 'fail') { msgEl.innerHTML = `<div class="doc-note">${escDoc(d.error || 'Das hat nicht geklappt.')} <button type="button" class="doc-link" data-doc-retry>Nochmal versuchen</button></div>`; return; }
  const label = d.state === 'work' ? (d.kind === 'create' ? 'Wird geschrieben …' : 'Wird bearbeitet …') : doc ? (d.kind === 'create' ? 'Dokument erstellt' : 'Dokument aktualisiert') : 'Dokument gelöscht';
  msgEl.innerHTML = `${entry.text ? `<p class="doc-reply">${escDoc(entry.text)}</p>` : ''}<button type="button" class="doc-done${d.state === 'work' ? ' work' : ''}" data-doc-open="${escDoc(d.id || '')}"${doc ? '' : ' disabled'}>${d.state === 'work' ? '<i class="dc-spin"></i>' : icon('f-file', 15)}<span class="doc-done-t">${escDoc(doc?.title || d.title || 'Dokument')}</span><span class="doc-done-s">${label}</span>${doc ? icon('f-chevron-right', 11) : ''}</button>`;
}
function runDocCreate(msgEl, entry, tab, v) {
  const d = entry.doc, c = chatOf(tab);
  const ctx = chatContext(historyOf(tab));
  const source = lastAnswerText(historyOf(tab));
  const { doc, done } = window.Docs.make({ ...v, describe: () => docMeta(tab), generate: () => docAiCall({ mode: 'create', instruction: `${d.instruction}${v.title ? `\nTitel: ${v.title}` : ''}`, chat: ctx, source }).then((o) => o.html) });
  c.docId = doc.id;
  Object.assign(d, { state: 'work', id: doc.id, title: v.title });
  renderDocCard(msgEl, entry, tab); saveChats();
  done.then(() => { d.state = 'done'; entry.text = ''; })
    .catch((err) => { Object.assign(d, { state: 'fail', error: err.message }); })
    .finally(() => { renderDocCard(msgEl, entry, tab); saveChats(); });
}
async function runDocEdit(msgEl, entry, tab) {
  const d = entry.doc, c = chatOf(tab);
  const linked = window.Docs.get(c.docId);
  Object.assign(d, { state: 'work', id: linked?.id, title: linked?.title });
  renderDocCard(msgEl, entry, tab);
  try {
    if (!linked) throw new Error('Das Dokument gibt es nicht mehr.');
    window.Docs.open(linked.id);
    window.Docs.editor.setWriting(linked.id, true);
    const adding = DOC_ADD.test(d.instruction) && !DOC_CHANGE.test(d.instruction);
    const o = await docAiCall({ mode: adding ? 'append' : 'edit', instruction: d.instruction, chat: chatContext(historyOf(tab)), source: lastAnswerText(historyOf(tab)), doc: { title: linked.title, html: linked.content } });
    if (adding) await window.Docs.editor.insertBlocks(linked.id, window.Docs.clean(o.html), String(o.after || ''));
    else await window.Docs.editor.typeIn(linked.id, window.Docs.clean(o.html));
    d.state = 'done';
    entry.text = String(o.reply || '').slice(0, 400);
  } catch (err) {
    Object.assign(d, { state: 'fail', error: err.message });
  }
  if (linked) window.Docs.editor.setWriting(linked.id, false);
  renderDocCard(msgEl, entry, tab);
  saveChats();
}
// Knopf „Ins Dokument“ unter einer Antwort: die Antwort VOLLSTÄNDIG so, wie sie dasteht, wird ein Dokument –
// mit Tabellen, Formeln (als data-math, das Dokument setzt sie neu), Hefteintrag (als Kasten), Code, Hoch-/Tiefstellung und Grafiken
const texOf = (k) => k.querySelector('annotation[encoding="application/x-tex"]')?.textContent ?? k.textContent;
function mathToDoc(root) {
  // erst die abgesetzten Formeln (Wrapper .katex-display), dann die übrigen im Fließtext
  root.querySelectorAll('.katex-display').forEach((k) => {
    const m = document.createElement('span'); m.dataset.math = texOf(k); m.dataset.display = ''; k.replaceWith(m);
  });
  root.querySelectorAll('.katex').forEach((k) => {
    const m = document.createElement('span'); m.dataset.math = texOf(k); k.replaceWith(m);
  });
}
function heftToDoc(fig) {
  // Hefteintrag → Hervorhebungs-Kasten mit Überschrift und jeder Zeile als Absatz (Formeln bleiben Formeln)
  const box = document.createElement('div');
  box.dataset.callout = '#4fcf8a'; box.dataset.radius = '12';
  const head = document.createElement('p'); head.innerHTML = '<b>So kommt es ins Heft</b>'; box.append(head);
  fig.querySelectorAll('.heft-page > *').forEach((n) => {
    if (n.classList.contains('heft-gap')) return;
    const p = document.createElement('p');
    const c = n.cloneNode(true); mathToDoc(c);
    p.innerHTML = c.innerHTML.replace(/^(&nbsp;)+/, '');
    if (n.classList.contains('heft-title')) p.innerHTML = `<b>${p.innerHTML}</b>`;
    else if (n.classList.contains('heft-note')) p.innerHTML = `<i>${p.innerHTML}</i>`;
    box.append(p);
  });
  return box;
}
function answerHtml(msgEl) {
  const answers = [...msgEl.querySelectorAll('.answer')]; if (!answers.length) return '';
  const x = document.createElement('div');
  answers.forEach((a) => x.append(...a.cloneNode(true).childNodes)); // alle Teile der Antwort, nicht nur den ersten
  x.querySelectorAll('figure.heft, [data-viz="heft"]').forEach((f) => f.replaceWith(heftToDoc(f)));
  mathToDoc(x); // vor dem Entfernen von aria-hidden (KaTeX zeichnet die sichtbare Formel als aria-hidden)
  // Diagramme, Mindmaps, Zeitstrahlen, Bilder: als Platzhalter mit Quelltext – das Dokument zeichnet sie selbst
  x.querySelectorAll('[data-viz]').forEach((f) => {
    const v = document.createElement('div');
    v.className = 'dc-viz'; v.dataset.viz = f.dataset.viz; v.dataset.spec = f.dataset.raw || '';
    f.replaceWith(v);
  });
  x.querySelectorAll('.msg-actions, .src-stack, .cite, .citation, button, svg, img, figure, canvas, [aria-hidden="true"]').forEach((n) => n.remove());
  // fett gesetzte Zwischenzeilen („**Erläuterung:**“) werden echte Überschriften → im Dokument ein-/ausklapp- und verschiebbar
  x.querySelectorAll('p').forEach((p) => {
    if (p.closest('[data-callout]')) return;
    const only = p.children.length === 1 && /^(B|STRONG)$/.test(p.firstElementChild.tagName) && p.textContent.trim() === p.firstElementChild.textContent.trim();
    if (!only || p.textContent.length > 90) return;
    const h = document.createElement('h2');
    h.textContent = p.textContent.trim().replace(/:$/, '');
    p.replaceWith(h);
  });
  return x.innerHTML;
}
function importAnswer(msgEl) {
  if (!window.Docs) return;
  const tab = activeTab(), c = chatOf(tab);
  const html = answerHtml(msgEl);
  window.Docs.offer({
    title: chatTitleOf(tab),
    onCreate: (v) => { const { doc } = window.Docs.make({ ...v, html, describe: () => docMeta(tab, { doc: { title: '', html: html.slice(0, 20000) } }) }); c.docId = doc.id; saveChats(); },
    onAppend: (id) => { window.Docs.appendTo(id, html); c.docId ||= id; saveChats(); }, // oder in ein bestehendes Dokument übernehmen
  });
}
chat.addEventListener('click', (e) => {
  const open = e.target.closest('[data-doc-open]');
  if (open && open.dataset.docOpen) { window.Docs?.open(open.dataset.docOpen); return; }
  const msgEl = e.target.closest('.msg-ai');
  const entry = msgEl && history[msgEl._historyAt];
  if (!entry?.doc) return;
  if (e.target.closest('[data-doc-retry]')) { entry.doc.state = entry.doc.kind === 'create' ? 'ask' : 'work'; renderDocCard(msgEl, entry); if (entry.doc.kind === 'edit') runDocEdit(msgEl, entry, activeTab()); }
});

async function sendMessage(text, images) {
  if (!history.length) autoTitle(text); // erste Anfrage → Titel erzeugen
  if (ask) hideAskPanel(); // offenes Fragefeld schließen, wenn stattdessen normal geschrieben wird
  const pa = pendingOf();
  if (pa) { // Rückfrage übersprungen → ganz normal weiter
    finishStep(pa.step, 'Question skipped');
    swapText(pa.work.head.querySelector('.work-title'), 'Completed');
    pa.work.head.querySelector('.t').hidden = false;
    activeTab()._pendingAsk = null;
  }
  addUserMessage(text, images);
  let docKind = !images.length && docIntent(text);
  if (docKind === 'maybe') docKind = (await docIntentAsk(text)) ? 'create' : null; // die KI beurteilt unklare Fälle
  if (docKind) { docTurn(docKind, text); return; }
  const controller = new AbortController();
  const tab = activeTab(); // Antwort gehört zu diesem Chat – auch wenn inzwischen ein anderer Tab offen ist
  startRun(tab, controller);
  const msgEl = el('div', 'msg-ai');
  chat.append(msgEl);
  try {
    const inline = await Promise.all(images.map((i) => fileToInline(i.file).catch(() => null)));
    const hist = historyOf(tab);
    hist.push({ role: 'user', text, images: inline.filter(Boolean) });
    markDrafts();
    msgEl._historyAt = hist.length; // hier landet die Antwort – für „Neu erzeugen“

    const answer = await runChat(msgEl, controller.signal, null, tab);
    historyOf(tab).push({ role: 'assistant', text: answer || '(keine Antwort)', sources: msgEl._sources, ...thoughtsOf(msgEl) });
  } finally {
    endRun(tab, controller);
  }
}

/* ---------- Bild-Großansicht ---------- */
const lightbox = $('lightbox');
const lbStage = $('lbStage');
let lbItems = [];
let lbIndex = 0;

function lbRender() {
  const src = lbItems[lbIndex];
  let el;
  if (src.tagName === 'IMG') {
    el = document.createElement('img');
    el.src = src.src;
    el.alt = src.alt;
  } else {
    el = document.createElement('div');
    el.className = src.className; // gleiche Darstellung wie das Vorschaubild, nur groß
  }
  el.dataset.lbClose = '';
  lbStage.replaceChildren(el);
  const many = lbItems.length > 1;
  $('lbPrev').hidden = !many;
  $('lbNext').hidden = !many;
  $('lbCount').textContent = many ? `${lbIndex + 1} / ${lbItems.length}` : '';
}

function openLightbox(items, index) {
  lbItems = items;
  lbIndex = index;
  lbRender();
  lightbox.classList.add('open');
}
function closeLightbox() { lightbox.classList.remove('open'); }
function lbStep(dir) {
  lbIndex = (lbIndex + dir + lbItems.length) % lbItems.length;
  lbRender();
}

document.addEventListener('click', (e) => {
  const chatTile = e.target.closest('.out-images .oi');
  const thumbImg = e.target.closest('.thumb img');
  if (chatTile) {
    const group = [...chatTile.parentElement.querySelectorAll('img')]; // auch die hinter „+N“ versteckten
    openLightbox(group, group.indexOf(chatTile.querySelector('img')));
  } else if (thumbImg) {
    const group = [...thumbImg.closest('.attachments').querySelectorAll('img')];
    openLightbox(group, group.indexOf(thumbImg));
  }
});
lightbox.addEventListener('click', (e) => { if (e.target.closest('[data-lb-close]') && !e.target.closest('#lbPrev, #lbNext')) closeLightbox(); });
$('lbPrev').addEventListener('click', () => lbStep(-1));
$('lbNext').addEventListener('click', () => lbStep(1));

/* ---------- Tastenkürzel (Windows + Mac) ---------- */
document.addEventListener('keydown', (e) => {
  // Strg/Cmd + B: Sidebar ein-/ausklappen
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
    e.preventDefault();
    toggle.click();
  }
  if (lightbox.classList.contains('open')) {
    if (e.key === 'Escape') closeLightbox();
    else if (e.key === 'ArrowLeft') lbStep(-1);
    else if (e.key === 'ArrowRight') lbStep(1);
    return;
  }
  if (e.key === 'Escape') setPopover(false);
  // Vollbild: F11 (Windows) bzw. Ctrl+Cmd+F (Mac) über die Fullscreen-API
  const macFullscreen = e.metaKey && e.ctrlKey && e.key.toLowerCase() === 'f';
  if (e.key === 'F11' || macFullscreen) {
    e.preventDefault();
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => {});
  }
});


/* ---------- Alle Schimmer-Effekte im gleichen Takt ----------
   Jeder Schimmer startet sonst, wenn sein Element erscheint – dadurch laufen sie versetzt.
   Hier bekommt jeder eine negative Verzögerung passend zu einer gemeinsamen Uhr (Periode 1,8 s). */
const SHIMMER_MS = 2800; // gemeinsame, ruhige Periode für Schimmer und Animationen (muss zu --pulse in style.css passen)
const syncShimmer = (node) => { node.style.setProperty('--sync', `-${Math.round(performance.now() % SHIMMER_MS)}ms`); };
new MutationObserver((records) => {
  for (const r of records) {
    if (r.type === 'attributes' && r.target.classList?.contains('sweep')) syncShimmer(r.target);
    r.addedNodes.forEach((n) => {
      if (n.nodeType !== 1) return;
      if (n.matches('.shimmer, .sweep, .act > *')) syncShimmer(n);
      n.querySelectorAll?.('.shimmer, .sweep, .act > *').forEach(syncShimmer);
    });
  }
}).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });

/* ---------- Markierter Text mit abgerundeten Ecken ----------
   ::selection kann keine runden Ecken. Deshalb wird die native Markierung (außerhalb von Eingabefeldern)
   unsichtbar gemacht und darüber eine eigene, abgerundete Markierung gezeichnet – Zeile für Zeile. */
const selLayer = el('div', 'sel-layer');
selLayer.setAttribute('aria-hidden', 'true');
document.body.append(selLayer);
let selFrame = 0;
function drawSelection() {
  selFrame = 0;
  let rects = [];
  const active = document.activeElement;
  const field = active && (active.tagName === 'TEXTAREA' || (active.tagName === 'INPUT' && /^(text|search|url|email)$/.test(active.type))) ? active : null;
  if (field && getComputedStyle(field).textAlign === 'center') {
    rects = []; // zentrierte Zahlenfelder (Timer): keine Markierung anzeigen
  } else if (field && field.selectionStart !== field.selectionEnd) {
    rects = fieldSelectionRects(field); // Markierung im Eingabefeld
  } else {
    // Markierung im übrigen Text (das Eingabefeld kann dabei fokussiert bleiben)
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed && sel.rangeCount) {
      for (let i = 0; i < sel.rangeCount; i++) rects.push(...sel.getRangeAt(i).getClientRects());
    }
  }
  // Rechtecke je Zeile zusammenfassen
  const lines = [];
  for (const r of rects) {
    const h = r.bottom - r.top;
    if (r.right - r.left < 0.5 || h < 1) continue;
    const line = lines.find((l) => Math.abs(l.top - r.top) < h / 2 && Math.abs(l.bottom - r.bottom) < h / 2);
    if (line) { line.left = Math.min(line.left, r.left); line.right = Math.max(line.right, r.right); line.top = Math.min(line.top, r.top); line.bottom = Math.max(line.bottom, r.bottom); }
    else lines.push({ left: r.left, right: r.right, top: r.top, bottom: r.bottom });
  }
  selLayer.replaceChildren(...lines.map((l) => {
    const d = el('div', 'sel-box');
    d.style.cssText = `left:${Math.round(l.left) - 2}px;top:${Math.round(l.top)}px;width:${Math.round(l.right - l.left) + 4}px;height:${Math.round(l.bottom - l.top)}px`;
    return d;
  }));
}
/* Eingabefeld: Markierung über ein unsichtbares Spiegel-Element vermessen und abgerundet zeichnen */
const MIRROR_PROPS = ['boxSizing', 'width', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'borderTopWidth', 'borderRightWidth',
  'borderBottomWidth', 'borderLeftWidth', 'borderStyle', 'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing', 'lineHeight',
  'textTransform', 'wordSpacing', 'textIndent', 'tabSize', 'whiteSpace', 'overflowWrap', 'wordBreak'];
const mirror = el('div', 'sel-mirror');
mirror.setAttribute('aria-hidden', 'true');
document.body.append(mirror);
function fieldSelectionRects(field) {
  const { selectionStart: a, selectionEnd: b, value } = field;
  if (a == null || a === b) return [];
  const cs = getComputedStyle(field);
  MIRROR_PROPS.forEach((p) => { mirror.style[p] = cs[p]; });
  const single = field.tagName === 'INPUT';
  mirror.style.whiteSpace = single ? 'pre' : 'pre-wrap';
  mirror.style.overflowWrap = single ? 'normal' : 'break-word';
  const box = field.getBoundingClientRect();
  if (single) {
    // einzeiliges Feld: Text liegt vertikal mittig; Breite ohne Umbruch, seitliches Scrollen berücksichtigen
    mirror.style.width = 'auto';
    mirror.style.height = `${box.height}px`;
    mirror.style.lineHeight = `${field.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)}px`;
    mirror.style.left = `${box.left - field.scrollLeft}px`;
    mirror.style.top = `${box.top}px`;
  } else {
    mirror.style.left = `${box.left}px`;
    mirror.style.top = `${box.top - field.scrollTop}px`;
  }
  mirror.replaceChildren(document.createTextNode(value.slice(0, a)));
  const mark = document.createElement('span');
  mark.textContent = value.slice(a, b);
  mirror.append(mark, document.createTextNode(value.slice(b) || ' '));
  // nur der sichtbare Teil des Feldes
  const fs = parseFloat(cs.fontSize) || 13;
  return [...mark.getClientRects()].map((r) => {
    let top = r.top, bottom = r.bottom;
    if (single) { const mid = box.top + box.height / 2; top = mid - fs * 0.68; bottom = mid + fs * 0.68; } // Markierung so hoch wie die Schrift
    return { left: Math.max(r.left, box.left), right: Math.min(r.right, box.right), top: Math.max(top, box.top), bottom: Math.min(bottom, box.bottom) };
  }).filter((r) => r.bottom - r.top > 2 && r.right - r.left > 0.5);
}

// iPad/iPhone: Safari zeichnet die Markierung selbst (mit Anfassern) und lässt sich nicht umgestalten – die eigene Markierung
// käme nur doppelt darüber (wirkt hell/verwaschen). Dort deshalb nur die Markierung des Systems.
const touchOnly = matchMedia('(hover: none) and (pointer: coarse)').matches;
if (touchOnly) document.documentElement.classList.add('native-selection');
const queueSelection = () => {
  if (touchOnly) return;
  if (selFrame) return;
  selFrame = requestAnimationFrame(drawSelection);
  setTimeout(() => { if (selFrame) { cancelAnimationFrame(selFrame); drawSelection(); } }, 60); // falls keine Frames kommen
};
document.addEventListener('selectionchange', queueSelection);
document.addEventListener('select', queueSelection, true);
document.addEventListener('input', queueSelection, true);
document.addEventListener('keyup', queueSelection, true);
document.addEventListener('mouseup', queueSelection, true);
window.addEventListener('resize', queueSelection);
document.addEventListener('scroll', queueSelection, true);


/* ===================================================================
   Voice Agent: zuhören → kurz antworten → mit natürlicher Stimme vorlesen
   - Spracherkennung: Web Speech API (Chrome/Edge/Safari), Deutsch
   - Antwort: /api/chat im Sprachmodus (Gemini Flash-Lite, kurze gesprochene Antworten)
   - Stimme: /api/tts → Gemini-Sprachmodell gestreamt (natürliche Stimme, erster Ton ~0,5 s); Ersatz: Piper lokal, zuletzt die Browser-Stimme.
   - Kopf: nur „Agent aktiv“ + „Mikro an/aus“. Aufklappbar: Gesprächsverlauf und Rückfragen zum Anklicken.
   =================================================================== */
const voiceBtn = $('voiceBtn');
const voiceEl = $('voiceAgent');
const vaStatus = $('vaStatus');
const vaMic = $('vaMic');
const vaToggle = $('vaToggle');
const vaAskBox = $('vaAsk');
const VA_MALE = /(conrad|stefan|killian|markus|yannick|viktor|martin|hans|florian|jonas|bernd|thomas|male|männlich)/i;
const VA_FEMALE = /(katja|hedda|anna|petra|helena|marlene|vicki|female|weiblich|amala|seraphina|louisa)/i;
const VA_VOICE = 'Orus'; // gewählt nach Hörprobe; später in den Einstellungen wählbar
const va = { on: false, muted: false, state: 'idle', rec: null, history: [], controller: null, buffer: '', chunks: 0,
  playQueue: [], sources: [], cursor: 0, ctx: null, endTimer: null, speaking: false, browserVoice: null, ask: null };

function vaPickBrowserVoice() {
  const voices = speechSynthesis.getVoices().filter((v) => /^de(-|_|$)/i.test(v.lang));
  return voices.find((v) => VA_MALE.test(v.name)) || voices.find((v) => !VA_FEMALE.test(v.name)) || voices[0] || null;
}
if ('speechSynthesis' in window) speechSynthesis.addEventListener?.('voiceschanged', () => { va.browserVoice = vaPickBrowserVoice(); });

/* Zustand nur über das Gesicht zeigen; Text im Kopf bleibt „Mikro an/aus“ */
const VA_STATE_LABEL = { listening: 'Hört zu', thinking: 'Denkt nach …', speaking: 'Spricht', muted: 'Agent aktiv', idle: 'Agent aktiv' };
function vaSetState(state) {
  va.state = state;
  voiceEl.dataset.state = state;
  voiceBtn.dataset.state = state;
  const title = voiceEl.querySelector('.va-title');
  const label = 'Agent is on it'; // fester Text – Zustand zeigt das Gesicht
  if (title && title.firstChild?.nodeType === 3 && title.firstChild.textContent.trim() !== label) title.firstChild.textContent = `${label} `;
  if (!va.noteTimer) swapText(vaStatus, vaStateText()); // kurze Hinweise (vaNote) bleiben stehen
}
// zweite Zeile unter „Agent is on it“: was der Agent gerade tut
function vaStateText() {
  if (va.muted) return 'Mikro aus';
  return { thinking: 'Denkt nach…', speaking: 'Spricht' }[va.state] || 'Hört zu';
}
function vaUpdateMic() {
  voiceEl.classList.toggle('is-muted', va.muted);
  vaMic.classList.toggle('off', va.muted);
  vaMic.title = va.muted ? 'Mikrofon einschalten' : 'Mikrofon stummschalten';
  vaMic.setAttribute('aria-label', vaMic.title);
  swapText(vaStatus, vaStateText());
}

/* Gesprächsverlauf im ausklappbaren Menü */
function vaLogLine(role, text) {
  // Kein Transkript in der Oberfläche – nur Hinweise kurz im Status zeigen
  const row = el('div', `va-line ${role}`);
  row.textContent = text;
  if (role === 'note') {
    swapText(vaStatus, text);
    clearTimeout(va.noteTimer);
    va.noteTimer = setTimeout(() => { va.noteTimer = null; swapText(vaStatus, vaStateText()); }, 4000);
  }
  return row;
}

function vaListen() {
  if (!va.on || va.muted || va.speaking || va.state === 'thinking') return;
  if (!SpeechRecognition) { vaLogLine('note', 'Spracherkennung wird von diesem Browser nicht unterstützt – bitte Chrome, Edge oder Safari nutzen.'); return; }
  try { va.rec?.abort(); } catch {}
  const rec = new SpeechRecognition();
  rec.lang = 'de-DE';
  rec.interimResults = true;
  rec.continuous = false; // eine Äußerung → Antwort
  let finalText = '';
  let live = null;
  rec.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) finalText += e.results[i][0].transcript;
      else interim += e.results[i][0].transcript;
    }
    const shown = (finalText + interim).trim();
    if (shown) { live ||= vaLogLine('user live', ''); live.textContent = shown; }
  };
  rec.onerror = (e) => {
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
      va.muted = true; vaUpdateMic(); vaSetState('muted');
      vaLogLine('note', 'Mikrofon nicht erlaubt – bitte im Browser freigeben.');
    }
  };
  rec.onend = () => {
    if (va.rec !== rec) return;
    va.rec = null;
    const text = finalText.trim();
    if (live) live.classList.remove('live');
    if (text) vaAsk(text, live);
    else { live?.remove(); if (va.on && !va.muted && !va.speaking && va.state !== 'thinking') setTimeout(vaListen, 150); }
  };
  va.rec = rec;
  vaSetState('listening');
  try { rec.start(); } catch { setTimeout(vaListen, 400); }
}

/* ---------- Vorlesen: natürliche Stimme, gestreamt ----------
   /api/tts liefert rohes PCM (Gemini-Sprachmodell, gestreamt) oder WAV (Piper als Ersatz).
   Jedes Tonstück wird sofort lückenlos hinter das vorige gelegt (Web Audio) – der erste Ton kommt nach ~0,5 s. */
function vaClean(text) {
  return String(text).replace(/```(?:ask|music|timer|app)[\s\S]*?(```|$)/g, '').replace(/[*_#`>|]/g, '').replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim();
}
function vaAudioCtx() {
  if (!va.ctx) va.ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (va.ctx.state === 'suspended') va.ctx.resume();
  return va.ctx;
}
function vaEnqueue(text) {
  const clean = vaClean(text);
  if (!clean) return;
  const job = { text: clean, chunks: [], next: 0, done: false, failed: false, wav: null, controller: new AbortController() };
  va.playQueue.push(job);
  vaStream(job);
  vaPump();
}
async function vaStream(job) {
  try {
    const r = await fetch('/api/tts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: job.text, voice: VA_VOICE }), signal: job.controller.signal,
    });
    if (!r.ok) throw new Error('tts');
    const type = r.headers.get('content-type') || '';
    if (/wav/.test(type)) {
      job.wav = await r.arrayBuffer();
    } else {
      job.rate = Number((type.match(/rate=(\d+)/) || [])[1]) || 24000;
      const reader = r.body.getReader();
      let rest = null;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        let bytes = value;
        if (rest) { bytes = new Uint8Array(rest.length + value.length); bytes.set(rest); bytes.set(value, rest.length); rest = null; }
        if (bytes.length % 2) { rest = bytes.slice(-1); bytes = bytes.slice(0, -1); } // 16-Bit-Grenze einhalten
        if (bytes.length) { job.chunks.push(bytes); vaPump(); }
      }
    }
  } catch (err) {
    if (err.name === 'AbortError') return;
    job.failed = true;
  }
  job.done = true;
  vaPump();
}
function vaSchedule(buffer) {
  const ctx = vaAudioCtx();
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.connect(ctx.destination);
  const at = Math.max(va.cursor || 0, ctx.currentTime + 0.04);
  src.start(at);
  va.cursor = at + buffer.duration;
  va.sources.push(src);
  src.onended = () => { va.sources = va.sources.filter((s) => s !== src); vaCheckEnd(); };
}
let vaPumping = false;
async function vaPump() {
  if (vaPumping || !va.on) return;
  vaPumping = true;
  try {
    while (va.playQueue.length) {
      const job = va.playQueue[0];
      if (job.chunks.length > job.next || job.wav || job.failed) {
        if (!va.speaking) { va.speaking = true; try { va.rec?.abort(); } catch {} vaSetState('speaking'); window.Music?.duck(true); }
      }
      const ctx = vaAudioCtx();
      while (job.next < job.chunks.length) { // neue PCM-Stücke sofort einplanen
        const bytes = job.chunks[job.next++];
        const pcm = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.length / 2);
        const buf = ctx.createBuffer(1, pcm.length, job.rate);
        const ch = buf.getChannelData(0);
        for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 32768;
        vaSchedule(buf);
      }
      if (job.wav) { const buf = await ctx.decodeAudioData(job.wav.slice(0)); job.wav = null; vaSchedule(buf); }
      if (job.failed) { // keine Stimme verfügbar → Browser-Stimme
        va.playQueue.shift();
        await new Promise((r) => setTimeout(r, Math.max(0, ((va.cursor || 0) - ctx.currentTime) * 1000)));
        await vaSpeakBrowser(job.text);
        continue;
      }
      if (!job.done) break; // auf weitere Stücke warten
      va.playQueue.shift();
    }
  } finally {
    vaPumping = false;
  }
  vaCheckEnd();
}
function vaCheckEnd() {
  clearTimeout(va.endTimer);
  if (!va.speaking) return;
  const ctx = va.ctx;
  const left = ctx ? Math.max(0, (va.cursor || 0) - ctx.currentTime) : 0;
  if (va.playQueue.length || va.sources.length || left > 0.05) { va.endTimer = setTimeout(vaCheckEnd, Math.max(80, left * 1000)); return; }
  va.speaking = false;
  window.Music?.duck(false);
  if (va.on && !va.controller) { vaSetState(va.muted ? 'muted' : 'listening'); vaListen(); }
}
function vaSpeakBrowser(text) {
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'de-DE';
    va.browserVoice ||= vaPickBrowserVoice();
    if (va.browserVoice) u.voice = va.browserVoice;
    u.onend = u.onerror = () => resolve();
    speechSynthesis.speak(u);
  });
}
function vaStopSpeaking() {
  va.playQueue.forEach((j) => j.controller.abort());
  va.playQueue = [];
  va.sources.forEach((s) => { try { s.stop(); } catch {} });
  va.sources = [];
  va.cursor = 0;
  speechSynthesis.cancel();
  va.speaking = false;
  window.Music?.duck(false);
}

/* Antworttext: als EIN Stück vertonen, sobald die (kurze) Antwort fertig ist – spart Anfragen
   (Gratis-Limit der Sprachmodelle: 3 pro Minute und Modell); der Ton selbst kommt gestreamt. */
function vaFeed(text, final = false) {
  va.buffer += text;
  if (!final) return;
  const all = va.buffer.replace(/```(?:ask|music|timer|app)[\s\S]*$/, '').trim();
  if (all) { vaEnqueue(all); va.chunks++; }
  va.buffer = '';
}

async function vaAsk(text, lineEl) {
  vaHideAsk();
  vaSetState('thinking');
  if (!lineEl) vaLogLine('user', text);
  va.history.push({ role: 'user', text });
  vaRenderSaid();
  va.buffer = '';
  va.chunks = 0;
  // Timer-Befehl? („Starte einen Fokus-Timer für 25 Minuten“, „Timer stoppen“) → sofort ausführen
  if (window.FocusTimer) {
    const reply = FocusTimer.command(text);
    if (reply) {
      va.history.push({ role: 'assistant', text: reply });
      va.lastSaid = reply;
      vaRenderSaid();
      vaEnqueue(reply);
      return;
    }
  }
  // Musikbefehl direkt ausführen; beim Start eines Lieds nichts vorlesen.
  if (window.Music) {
    const reply = await Music.command(text).catch(() => null);
    if (reply === '') { // still erledigt (z. B. Suche geöffnet) – nichts sagen, weiter zuhören
      va.history.push({ role: 'assistant', text: '(Musikbefehl ausgeführt)' });
      vaSetState(va.muted ? 'muted' : 'listening');
      vaListen();
      return;
    }
    if (reply) {
      va.history.push({ role: 'assistant', text: reply });
      va.lastSaid = reply;
      vaRenderSaid();
      vaEnqueue(reply);
      return;
    }
  }
  const controller = new AbortController();
  va.controller = controller;
  let answer = '';
  const line = vaLogLine('agent', '…');
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: va.history.slice(-12), voice: true, music: !!window.Music?.connected(), appState: appStateText(), model: 'gemini', effort: 'low' }),
      signal: controller.signal,
    });
    for await (const { event, data } of readSse(res)) {
      if (event === 'text') { answer += data.text; line.textContent = vaClean(answer) || '…'; va.lastSaid = answer; vaRenderSaid(); vaFeed(data.text); }
      else if (event === 'error') throw new Error(data.message);
    }
    vaFeed('', true);
    va.history.push({ role: 'assistant', text: answer || '…' });
    // Musik-Aktion vom Sprachmodell (z. B. „mach mal was von Drake an“)
    // alle ```app-Blöcke der Reihe nach ausführen (der Agent darf mehrere Schritte machen)
    for (const [, json] of answer.matchAll(/```app\s*([\s\S]*?)```/g)) { try { window.AppActions.run(JSON.parse(json)); } catch {} }
    const timerBlock = answer.match(/```timer\s*([\s\S]*?)```/);
    if (timerBlock && window.FocusTimer) { try { FocusTimer.run(JSON.parse(timerBlock[1])); } catch {} }
    const musicBlock = answer.match(/```music\s*([\s\S]*?)```/);
    if (musicBlock && window.Music) { try { await Music.run(JSON.parse(musicBlock[1])); } catch {} }
    if (musicBlock && !vaClean(answer)) line.remove();
    const questions = parseAskBlock(answer);
    if (questions) vaShowAsk(questions);
  } catch (err) {
    if (err.name !== 'AbortError') { line.textContent = err.message || 'Fehler'; line.classList.add('note'); vaEnqueue('Entschuldigung, da ist etwas schiefgelaufen.'); }
    else line.remove();
  } finally {
    if (va.controller === controller) va.controller = null;
    if (va.on && !va.speaking && !va.playQueue.length) { vaSetState(va.muted ? 'muted' : 'listening'); vaListen(); }
  }
}

/* ---------- Rückfragen im ausklappbaren Menü (wie im Eingabefeld, nur kleiner) ----------
   Mehrere Fragen nacheinander (Weiter/Zurück), immer auch eigene Antwort möglich, unten links „Überspringen“. */
function vaShowAsk(questions) {
  va.ask = { questions, index: 0, answers: questions.map(() => ({ picked: new Set(), own: '' })) };
  vaRenderAsk('in');
  vaExpand(true);
}
function vaHideAsk() {
  va.ask = null;
  vaRenderSaid();
}
/* Menü ohne Frage: zeigt, was der Agent zuletzt gesagt hat (live beim Sprechen) */
function vaRenderSaid() {
  // Kein Transkript: unter der Leiste klappt nur etwas auf, wenn es etwas zu tun gibt (Suche, Rückfrage, Timer …)
  if (va.ask || va.panel) return;
  vaAskBox.replaceChildren();
  voiceEl.classList.remove('has-panel');
  if (voiceEl.classList.contains('expanded')) vaExpand(false);
}
function vaAnswerText(i) {
  const q = va.ask.questions[i];
  const a = va.ask.answers[i];
  const parts = [...a.picked].sort((x, y) => x - y).map((n) => q.options[n]);
  if (a.own.trim()) parts.push(a.own.trim());
  return parts.join(', ');
}
// Gleicher Aufbau wie die Rückfrage im Chat (Kopf mit „Rückfrage“ bzw. „Frage x von y“ und ×, Frage, Antworten mit Nummer
// und Haken, eigene Antwort mit Stift, unten Überspringen/Zurück und Weiter/Senden) – nutzt dieselben Stile (.ask-panel)
function vaRenderAsk(dir = '') {
  const { questions, index, answers } = va.ask;
  const q = questions[index];
  const a = answers[index];
  const last = index === questions.length - 1;
  const many = questions.length > 1;
  const panel = el('div', `ask-panel va-q${dir ? ' slide-' + dir : ''}`);
  panel.tabIndex = -1;

  const head = el('div', 'ask-head');
  const top = el('div', 'ask-top');
  top.append(el('span', 'ask-kicker', many ? `Frage ${index + 1} von ${questions.length}` : 'Rückfrage'));
  if (many) {
    const bars = el('span', 'ask-progress');
    questions.forEach((_, k) => bars.append(el('i', k < index ? 'done' : k === index ? 'on' : '')));
    top.append(bars);
  }
  top.append(el('div', 'flex-spacer'));
  const skipAll = () => { vaHideAsk(); vaExpand(false); };
  const close = el('button', 'ask-tool', icon('i-x', 14));
  close.type = 'button';
  close.setAttribute('aria-label', 'Überspringen');
  close.title = 'Überspringen';
  close.addEventListener('click', skipAll);
  top.append(close);
  const qEl = el('div', 'ask-q md');
  renderInline(qEl, q.question);
  head.append(top, qEl);
  if (q.multi && q.options.length) head.append(el('div', 'ask-sub', 'Mehrere Antworten möglich'));

  const list = el('div', 'ask-options');
  list.setAttribute('role', q.multi ? 'group' : 'radiogroup');
  const sync = () => {
    list.querySelectorAll('.ask-opt:not(.ask-own-row)').forEach((btn, i) => {
      btn.classList.toggle('selected', a.picked.has(i));
      btn.setAttribute('aria-checked', String(a.picked.has(i)));
    });
    ownRow.classList.toggle('selected', document.activeElement === own || !!own.value.trim());
    next.disabled = !vaAnswerText(index);
  };
  q.options.forEach((opt, oi) => {
    const b = el('button', `ask-opt${a.picked.has(oi) ? ' selected' : ''}${q.multi ? ' multi' : ''}`);
    b.type = 'button';
    b.setAttribute('role', q.multi ? 'checkbox' : 'radio');
    b.setAttribute('aria-checked', String(a.picked.has(oi)));
    b.innerHTML = `<span class="ask-key">${oi + 1}</span><span class="ask-label md"></span><span class="ask-mark">${icon('i-check')}</span>`;
    renderInline(b.querySelector('.ask-label'), opt);
    b.addEventListener('click', () => {
      if (q.multi) { a.picked.has(oi) ? a.picked.delete(oi) : a.picked.add(oi); }
      else { a.picked = new Set(a.picked.has(oi) ? [] : [oi]); a.own = ''; own.value = ''; }
      sync();
    });
    list.append(b);
  });

  const ownRow = el('label', `ask-opt ask-own-row${a.own.trim() ? ' selected' : ''}`);
  ownRow.innerHTML = '<span class="ask-key ask-pen"><svg width="14" height="14"><use href="#f-pencil"/></svg></span>';
  const own = document.createElement('input');
  own.className = 'ask-own-in';
  own.type = 'text';
  own.placeholder = q.options.length ? 'Oder eigene Antwort schreiben' : 'Deine Antwort…';
  own.value = a.own;
  ownRow.append(own);
  ownRow.insertAdjacentHTML('beforeend', `<span class="ask-mark">${icon('i-check')}</span>`);
  own.addEventListener('focus', () => { if (!q.multi && a.picked.size) a.picked.clear(); sync(); });
  own.addEventListener('blur', sync);
  own.addEventListener('input', () => {
    a.own = own.value;
    if (!q.multi && own.value.trim()) a.picked.clear(); // eigene Antwort ersetzt die Auswahl
    sync();
  });
  own.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); next.click(); } e.stopPropagation(); });
  list.append(ownRow);
  // Enter auf einem Knopf (Antwort, Überspringen) löst ihn nicht aus – nur „Weiter“, wenn schon geantwortet wurde
  panel.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.closest('button')) { e.preventDefault(); if (!next.disabled) next.click(); } });

  const foot = el('div', 'ask-foot');
  const skip = el('button', 'ask-btn ghost ask-skip', 'Überspringen');
  skip.type = 'button';
  skip.addEventListener('click', skipAll);
  foot.append(skip);
  if (index > 0) {
    const back = el('button', 'ask-btn ghost ask-back', `${icon('i-back', 14)}Zurück`);
    back.type = 'button';
    back.addEventListener('click', () => { va.ask.index--; vaRenderAsk('back'); });
    foot.append(back);
  }
  foot.append(el('div', 'flex-spacer'));
  const next = el('button', 'ask-btn primary', last ? 'Senden' : 'Weiter');
  next.type = 'button';
  next.disabled = !vaAnswerText(index);
  next.addEventListener('click', () => {
    if (!vaAnswerText(index)) return;
    if (!last) { va.ask.index++; vaRenderAsk('next'); return; }
    const text = questions.length === 1 ? vaAnswerText(0)
      : questions.map((qq, i) => `${qq.question} → ${vaAnswerText(i) || '(keine Angabe)'}`).join('\n');
    vaHideAsk();
    vaExpand(false);
    vaStopSpeaking();
    va.controller?.abort();
    vaAsk(text);
  });
  foot.append(next);

  const body = el('div', 'ask-body');
  body.append(head, list);
  panel.append(body, foot);
  vaAskBox.replaceChildren(panel);
}

/* ---------- Öffnen / Schließen / Ausklappen ---------- */
function vaExpand(open) {
  if (open && !va.ask && !va.panel) vaShowQuick(); // nichts offen → Schnellaktionen
  if (!open && va.panel === 'quick') va.panel = null;
  if (open && !voiceEl.classList.contains('expanded')) document.dispatchEvent(new CustomEvent('dock:open', { detail: 'agent' }));
  voiceEl.classList.toggle('expanded', open);
  // Songsuche: Suchfeld direkt in der Leiste, darunter nur die Treffer
  const dock = $('topStack');
  const slot = $('dockSearch');
  // nur wenn der Agent allein in der Leiste ist; mit Musik/Timer klappt die Suche unten auf
  const alone = !dock.querySelector(':scope > .mu-mini:not([hidden]), :scope > .ft:not([hidden])');
  const inPanel = vaAskBox.querySelector('.mu-in-agent');
  const bar = slot?.querySelector('.mu-searchbar') || inPanel?.querySelector(':scope > .mu-searchbar');
  if (va.panel === 'search' && bar && slot && alone) { if (bar.parentNode !== slot) slot.replaceChildren(bar); dock.classList.add('searching'); }
  else {
    if (bar && slot && bar.parentNode === slot && va.panel === 'search' && inPanel) inPanel.prepend(bar); // zurück ins Fenster
    if (slot && va.panel !== 'search') slot.replaceChildren();
    dock.classList.remove('searching');
  }
  // Pfeil zum Ein-/Ausklappen nur, wenn es etwas Offenes gibt (Suche, Rückfrage, Timer-Eingabe)
  voiceEl.classList.toggle('has-panel', !!(va.ask || va.panel));
  vaToggle.setAttribute('aria-expanded', String(open));
  vaToggle.title = open ? 'Einklappen' : 'Gespräch anzeigen';
}
/* Timer-Eingabe im Agenten-Menü (Stunden / Minuten / Sekunden oder Uhrzeit) */
window.vaShowTimer = () => {
  if (!window.FocusTimer || !va.on) return;
  va.ask = null;
  va.panel = 'timer';
  FocusTimer.mountPicker(vaAskBox);
  vaExpand(true);
};
window.vaCloseTimerPanel = () => { if (va.panel === 'timer') { va.panel = null; vaRenderSaid(); vaExpand(false); } };
vaAskBox.addEventListener('timer-close', () => window.vaCloseTimerPanel());
document.addEventListener('timer:started', () => window.vaCloseTimerPanel());

/* Musik im Agenten-Menü: Suchleiste oder Playlists (wie die Fragen) */
window.vaShowMusic = (kind, query = '') => {
  if (!window.Music) return;
  va.ask = null;
  va.panel = kind;
  if (kind === 'search') Music.mountSearch(vaAskBox, query);
  else Music.mountPlaylists(vaAskBox);
  vaExpand(true);
};
function vaCloseMusicPanel() {
  if (!va.panel) return;
  va.panel = null;
  vaRenderSaid();
  vaExpand(false);
}
vaAskBox.addEventListener('music-close', vaCloseMusicPanel);
document.addEventListener('music:played', vaCloseMusicPanel);

function vaOpen() {
  va.on = true;
  va.muted = false;
  // frischer Start: kein alter Verlauf, keine alte Antwort, keine offene Frage/Suche
  va.history = [];
  va.lastSaid = '';
  va.ask = null;
  va.panel = null;
  window.Music?.clearPending?.();
  vaHideAsk();
  vaExpand(false);
  window.dockFlip(() => {
    window.Music?.setAgentOpen(true);
    voiceEl.hidden = false;
    voiceEl.classList.remove('closing');
  });
  window.dockEnter(voiceEl);
  voiceBtn.setAttribute('aria-pressed', 'true');
  vaUpdateMic();
  va.browserVoice = vaPickBrowserVoice();
  vaAudioCtx(); // Audio beim Klick freischalten (Browser-Regel)
  vaStartBargeIn();
  vaListen();
}
function vaClose() {
  va.on = false;
  try { va.rec?.abort(); } catch {}
  va.rec = null;
  va.controller?.abort();
  vaStopSpeaking();
  va.panel = null;
  vaHideAsk();
  vaSetState('idle');
  voiceBtn.setAttribute('aria-pressed', 'false');
  voiceEl.classList.add('closing');
  vaStopBargeIn();
  setTimeout(() => {
    if (va.on) return;
    window.dockFlip(() => {
      voiceEl.hidden = true;
      voiceEl.classList.remove('closing');
      window.Music?.setAgentOpen(false); // läuft Musik, erscheint an derselben Stelle der Mini-Player
    });
  }, 240);
}
voiceBtn.addEventListener('click', () => (va.on ? vaClose() : vaOpen()));
$('vaClose').addEventListener('click', vaClose);
vaToggle.addEventListener('click', () => vaExpand(!voiceEl.classList.contains('expanded')));
vaMic.addEventListener('click', () => {
  va.muted = !va.muted;
  vaUpdateMic();
  if (va.muted) { try { va.rec?.abort(); } catch {} va.rec = null; if (!va.speaking && va.state !== 'thinking') vaSetState('muted'); }
  else vaListen();
});
// Unterbrechen nur durch Sprechen – ein Klick auf das Gesicht öffnet das Transkript

/* Augen schauen ab und zu umher und blinzeln (Gesicht oben rechts und im Kästchen) */
function vaLookAround() {
  document.querySelectorAll('.va-face').forEach((face) => {
    const big = face.classList.contains('va-face');
    const k = big ? 1.6 : 0.8; // kleine Bewegung, oben rechts noch dezenter
    const dirs = [[0, 0], [0, 0], [-k, 0], [k, 0], [0, -k * 0.5], [k * 0.7, k * 0.4], [-k * 0.7, k * 0.4]];
    const [x, y] = dirs[Math.floor(Math.random() * dirs.length)];
    face.style.setProperty('--look-x', `${x}px`);
    face.style.setProperty('--look-y', `${y}px`);
    if (Math.random() < 0.4) { face.classList.add('blink'); setTimeout(() => face.classList.remove('blink'), 140); }
  });
  setTimeout(vaLookAround, 1800 + Math.random() * 2600);
}
// Augen bleiben ruhig in der Mitte (kein Umherschauen, kein Blinzeln)


/* ---------- Unterbrechen durch Sprechen ----------
   Während der Agent spricht, misst ein leiser Mikrofon-Pegelmesser (mit Echo-Unterdrückung) die Lautstärke.
   Sprichst du deutlich hinein (lauter als die eigene Stimme des Agenten, die zurückhallt), bricht er ab und hört zu. */
const bargeIn = { stream: null, ctx: null, analyser: null, timer: null, loud: 0, base: 0, samples: 0 };
async function vaStartBargeIn() {
  if (bargeIn.stream || !navigator.mediaDevices?.getUserMedia) return;
  try {
    bargeIn.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    bargeIn.ctx = new (window.AudioContext || window.webkitAudioContext)();
    const src = bargeIn.ctx.createMediaStreamSource(bargeIn.stream);
    bargeIn.analyser = bargeIn.ctx.createAnalyser();
    bargeIn.analyser.fftSize = 512;
    src.connect(bargeIn.analyser);
    const data = new Float32Array(bargeIn.analyser.fftSize);
    bargeIn.timer = setInterval(() => {
      if (!va.on || va.muted) { vaShowLevel(0); bargeIn.loud = 0; bargeIn.samples = 0; bargeIn.base = 0; return; }
      bargeIn.analyser.getFloatTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
      const rms = Math.sqrt(sum / data.length);
      vaShowLevel(va.state === 'listening' ? rms : 0); // Pegel beim Zuhören anzeigen
      if (!va.speaking) { bargeIn.loud = 0; bargeIn.samples = 0; bargeIn.base = 0; return; }
      // Grundpegel (Rest-Echo des Agenten) in den ersten ~0,5 s lernen
      if (bargeIn.samples < 10) { bargeIn.base = Math.max(bargeIn.base, rms); bargeIn.samples++; return; }
      const threshold = Math.max(0.045, bargeIn.base * 2.6);
      bargeIn.loud = rms > threshold ? bargeIn.loud + 1 : Math.max(0, bargeIn.loud - 1);
      if (bargeIn.loud >= 6) { // ~0,3 s deutlich lauter → unterbrechen
        bargeIn.loud = 0;
        va.controller?.abort();
        vaStopSpeaking();
        vaSetState('listening');
        vaListen();
      }
    }, 50);
  } catch {
    vaStopBargeIn(); // ohne Mikrofon-Freigabe einfach ohne Unterbrechen
  }
}
function vaStopBargeIn() {
  clearInterval(bargeIn.timer);
  bargeIn.stream?.getTracks().forEach((t) => t.stop());
  bargeIn.ctx?.close().catch(() => {});
  Object.assign(bargeIn, { stream: null, ctx: null, analyser: null, timer: null, loud: 0, base: 0, samples: 0 });
}


/* Pegel-Anzeige beim Zuhören: fünf kleine Balken reagieren auf die eigene Stimme */
const vaLevelBars = [...document.querySelectorAll('.va-level i')];
let vaLevelSmooth = 0;
function vaShowLevel(rms) {
  const target = Math.min(1, rms * 9); // normale Sprache ≈ 0,03–0,12
  vaLevelSmooth += (target - vaLevelSmooth) * (target > vaLevelSmooth ? 0.55 : 0.22);
  const on = vaLevelSmooth > 0.04;
  voiceEl.classList.toggle('talking', on);
  // Schwingung direkt am Gesicht
  voiceEl.style.setProperty('--lvl', on ? vaLevelSmooth.toFixed(3) : '0');
  const shape = [0.45, 0.8, 1, 0.75, 0.5];
  vaLevelBars.forEach((bar, i) => {
    const h = 3 + Math.round(vaLevelSmooth * shape[i] * 9 + (on ? Math.random() * 1.5 : 0));
    bar.style.height = `${h}px`;
  });
}



/* Fokus-Timer abgelaufen: ist der Agent aktiv, sagt er es kurz */
document.addEventListener('focus:done', (e) => {
  if (!va.on) return;
  const text = e.detail?.label === 'Fokus' ? 'Deine Fokuszeit ist um. Gönn dir eine kurze Pause.' : 'Dein Timer ist abgelaufen.';
  va.lastSaid = text;
  vaRenderSaid();
  vaEnqueue(text);
});


/* ===================================================================
   App-Aktionen: alles, was der Sprach-Agent auf der Website tun kann.
   Neue Funktionen hier eintragen (und in VOICE_APP in lib/workflow.js beschreiben) –
   dann kann der Agent sie sofort benutzen.
   =================================================================== */
window.AppActions = {
  // Neuen KI-Chat (eigener Tab) öffnen und die Frage direkt stellen
  new_chat({ prompt, title, effort, model } = {}) {
    const text = String(prompt || '').trim();
    const name = String(title || text || 'Neuer Chat').replace(/\s+/g, ' ').trim();
    createTab(name.length > 28 ? `${name.slice(0, 27).trim()}…` : name);
    setEffortByName(effort || 'auto');
    if (model) setModelById(model);
    if (text) sendMessage(text, []);
  },
  // Frage im aktuellen Chat stellen
  ask({ prompt, effort, model } = {}) {
    if (effort) setEffortByName(effort);
    if (model) setModelById(model);
    const text = String(prompt || '').trim();
    if (text) sendMessage(text, []);
  },
  set_effort({ effort } = {}) { setEffortByName(effort); },
  set_model({ model } = {}) { setModelById(model); },
  // Ansicht öffnen: chat (neuer Chat), calendar, tasks, docs, inbox, chats (Liste aller Chats)
  open({ view } = {}) {
    if (view === 'chat') { createTab('Neuer Chat'); return; }
    if (view === 'chats' && typeof chatsView !== 'undefined') { chatsView.show?.(); return; }
    if (VIEW_TABS[view] && view !== 'doc') openViewTab(view);
  },
  close_tab() { const t = tabsEl.querySelector('.tab.active'); if (t) closeTab(t); },
  // Dokumente: per Titel öffnen, neu anlegen (optional von der KI geschrieben), löschen, Einstellungen
  open_doc({ title } = {}) { const d = findDoc(title); if (d) openDocTab(d.id, d.title); return !!d; },
  new_doc({ title, prompt } = {}) {
    if (!window.Docs) return;
    const text = String(prompt || '').trim();
    Docs.make({ title: String(title || '').slice(0, 160), html: text ? undefined : '', generate: text ? () => docAiCall({ mode: 'create', instruction: text, chat: '' }).then((o) => o.html) : undefined });
  },
  delete_doc({ title } = {}) { const d = findDoc(title); if (d) Docs.remove(d.id); },
  doc_settings({ title, accent, font, width, small, nav, spell, open } = {}) {
    if (title) { const d = findDoc(title); if (d) openDocTab(d.id, d.title); }
    const ed = window.Docs?.editor; if (!ed?.currentId?.()) return;
    const patch = Object.fromEntries(Object.entries({ accent, font, width, small, nav, spell }).filter(([, v]) => v !== undefined));
    if (Object.keys(patch).length) ed.applyDocSettings(patch);
    if (open) ed.openSettings();
  },
  // Aufgaben (Tasks): anlegen, ändern (z. B. erledigt), löschen – gefunden wird per Titel
  add_task(a = {}) { window.Tasks?.add(a); },
  update_task(a = {}) { window.Tasks?.update(a.match || a.title, { ...a, title: a.match ? a.title : undefined }); },
  delete_task({ title } = {}) { window.Tasks?.remove(title); },
  delete_event(a = {}) { window.Calendar?.remove(a); },
  run(a) {
    if (Array.isArray(a?.actions)) { a.actions.forEach((x) => this.run(x)); return; } // mehrere Schritte auf einmal
    const fn = a && typeof a.action === 'string' && a.action !== 'run' ? this[a.action] : null;
    if (fn) fn.call(this, a);
  },
};
// Dokument per Titel finden (genau, sonst Teil des Titels)
function findDoc(title) {
  const q = String(title || '').toLowerCase().trim(), all = window.Docs?.docs || [];
  return q ? all.find((d) => (d.title || '').toLowerCase() === q) || all.find((d) => (d.title || '').toLowerCase().includes(q)) : null;
}
/* Stand der App für den Sprach-Agenten: was gerade offen ist, Aufgaben, nächste Termine, Dokumente, Timer, Musik.
   So kann er Fragen dazu beantworten („was steht heute an?“) und Dinge gezielt ändern. */
function appStateText() {
  const out = [], today = new Date().toISOString().slice(0, 10);
  const act = tabsEl.querySelector('.tab.active'), v = act?.dataset.view;
  out.push(`Gerade offen: ${v === 'doc' ? `Dokument „${window.Docs?.titleOf(act.dataset.doc)}“` : v ? VIEW_TABS[v]?.title || v : 'KI-Chat'}`);
  const st = Object.fromEntries((window.Tasks?.COLS || []).map((c) => [c.id, c.name]));
  const ts = window.Tasks?.tasks || [];
  out.push(`Aufgaben (${ts.length}):${ts.length ? '' : ' keine'}`, ...ts.slice(0, 40).map((t) => `- ${t.title} [${st[t.status] || t.status}${t.date ? `, fällig ${t.date}` : ''}${t.prio && t.prio !== 'none' ? `, Priorität ${t.prio}` : ''}]`));
  const ev = (window.Calendar?.events || []).filter((e) => e.date >= today).sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`)).slice(0, 30);
  out.push(`Nächste Termine:${ev.length ? '' : ' keine'}`, ...ev.map((e) => `- ${e.date}${e.time ? ` ${e.time}` : ''}: ${e.title}`));
  const ds = window.Docs?.docs || [];
  out.push(`Dokumente (${ds.length}):${ds.length ? '' : ' keine'}`, ...ds.slice(0, 60).map((d) => `- ${d.title || 'Unbenannt'}`));
  if (window.FocusTimer?.active) out.push(`Laufende Timer: ${FocusTimer.count}`);
  if (window.Music?.connected?.()) out.push(`Spotify verbunden${window.Music.isPlaying?.() ? ', Musik läuft' : ''}`);
  return out.join('\n').slice(0, 7000);
}



/* ===================================================================
   Leiste oben (Agent · Musik · Timer): der Chat beginnt darunter – nichts wird verdeckt.
   Immer nur ein Fenster unter der Leiste offen; Klick daneben klappt Player/Timer zu.
   =================================================================== */
(() => {
  const dock = $('topStack');
  const scroller = $('chatScroll');
  if (!dock || !scroller) return;
  const openPanel = () => [
    voiceEl.classList.contains('expanded') && voiceEl.querySelector('.va-panel'),
    window.Music && !Music.root.hidden && Music.root.isConnected && !Music.root.classList.contains('closing') && Music.root,
    dock.querySelector('.ft.expanded .ft-more'),
  ].find(Boolean);
  const segs = () => dock.querySelectorAll(':scope > .voice-agent, :scope > .mu-mini, :scope > .ft');
  const sync = () => {
    const on = [...segs()].some((s) => !s.hidden && !s.classList.contains('closing'));
    if (dock.classList.contains('dock-on') !== on) dock.classList.toggle('dock-on', on);
    const h = on ? dock.offsetHeight : 0;
    const searchEmpty = dock.classList.contains('searching') && !vaAskBox.querySelector('.mu-results .mu-row');
    const opened = on && !!(
      (voiceEl.classList.contains('expanded') && !voiceEl.hidden && !searchEmpty)
      || dock.querySelector(':scope > .ft.expanded:not([hidden])')
      || (window.Music && !Music.root.hidden && Music.root.isConnected && !Music.root.classList.contains('closing')));
    if (dock.classList.contains('dock-open') !== opened) dock.classList.toggle('dock-open', opened);
    const p = h ? openPanel() : null;
    const extra = p ? p.offsetHeight + 8 : 0;
    scroller.style.setProperty('--dock-space', h ? `${h + extra + 16}px` : '0px');
  };
  const ro = new ResizeObserver(sync);
  ro.observe(dock);
  setTimeout(() => [voiceEl.querySelector('.va-panel'), window.Music?.root].forEach((x) => x && ro.observe(x)), 0); // Musik lädt nach app.js
  new MutationObserver(() => { const f = dock.querySelector('.ft-more'); if (f) ro.observe(f); sync(); }).observe(dock, { subtree: true, attributes: true, attributeFilter: ['hidden', 'class'], childList: true });
  sync();
  document.addEventListener('dock:open', (e) => {
    if (e.detail !== 'agent' && voiceEl.classList.contains('expanded') && !va.ask && !va.panel) vaExpand(false);
  });
  // Klick auf den Baustein selbst (nicht auf einen Knopf) klappt sein Fenster auf/zu
  voiceEl.querySelector('.va-head').addEventListener('click', (e) => {
    if (e.target.closest('button:not(.agent-face)')) return;
    vaExpand(!voiceEl.classList.contains('expanded'));
  });
  document.addEventListener('pointerdown', (e) => {
    if (!dock.contains(e.target)) document.dispatchEvent(new CustomEvent('dock:open', { detail: 'outside' }));
  });
})();


/* ===================================================================
   Chats: Titel oben links (Menü: Umbenennen · Anheften · Löschen) und Liste aller Chats oben rechts.
   Jeder Tab ist ein Chat; der Titel wird aus der ersten Anfrage erzeugt.
   =================================================================== */
const chatTitleBtn = $('chatTitleBtn');
const chatTitleEl = $('chatTitle');
const chatMenu = $('chatMenu');
const chatsBtn = $('chatsBtn');
const chatsPop = $('chatsPop');
const cpList = $('cpList');
const DEFAULT_TITLES = new Set(['New Agent', 'Neuer Chat']);

function chatOf(tab) {
  if (!tab) return null;
  if (!tab._chat) {
    const t = tab.querySelector('.tab-title')?.textContent || 'Neuer Chat';
    tab._chat = { title: DEFAULT_TITLES.has(t) ? 'Neuer Chat' : t, auto: true, pinned: false, updated: Date.now(), ws: window.Workspaces?.active() || 'main' };
  }
  return tab._chat;
}
const activeTab = () => tabsEl.querySelector('.tab.active');
// Workspace eines Chats (ältere ohne Angabe: „main“) – Seitenleiste, Chatverlauf und Suche zeigen nur den aktiven Workspace
const inWorkspace = (tab) => (chatOf(tab)?.ws || 'main') === (window.Workspaces?.active() || 'main');
window.inWorkspace = inWorkspace;
// Hund des zuletzt genutzten Agenten als kleiner runder Kopf vor dem Chat-Titel (ältere Chats: Allgemein)
function chatAvatar(tab, cls = 'chat-av') {
  const dogs = window.PixelDogs?.DOGS;
  if (!dogs) return `<span class="${cls}"></span>`;
  const id = dogs[chatOf(tab)?.agent] ? chatOf(tab).agent : 'general';
  return `<span class="${cls}" data-dog="${id}">${window.PixelDogs.svg(id, 24)}</span>`;
}

function setChatTitle(tab, title, { auto = false } = {}) {
  const c = chatOf(tab);
  if (!c || !title) return;
  c.title = title;
  if (!auto) c.auto = false;
  const span = tab.querySelector('.tab-title');
  span.textContent = title;
  snapToPixels([tab]);
  if (tab === activeTab()) swapText(chatTitleEl, title);
  renderChatList();
  saveChats();
}

function renderChatBar() {
  const c = chatOf(activeTab());
  if (!c) return;
  if (chatTitleEl.textContent !== c.title) swapText(chatTitleEl, c.title);
  chatMenu.querySelector('[data-cm="pin"] span').textContent = c.pinned ? 'Lösen' : 'Anheften';
  closeChatPops();
}

/* Titel aus der ersten Anfrage erzeugen (nur, solange der Nutzer ihn nicht selbst gesetzt hat) */
async function autoTitle(text) {
  const tab = activeTab();
  const c = chatOf(tab);
  if (!c) return;
  c.updated = Date.now();
  if (!c.auto || !String(text || '').trim()) return;
  const fallback = String(text).replace(/\s+/g, ' ').trim().split(' ').slice(0, 5).join(' ').replace(/[?!.,:;]+$/, '');
  // KI-Titel; klappt es nicht (Modelle gerade ausgelastet), nach kurzer Pause ein zweiter Versuch – erst dann die ersten Wörter
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 4000));
    try {
      const r = await fetch('/api/title', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
      const { title } = await r.json();
      if (title) { if (c.auto) setChatTitle(tab, title, { auto: true }); return; }
    } catch {}
  }
  if (c.auto) setChatTitle(tab, fallback, { auto: true });
}

/* ---------- Menü oben links ---------- */
function closeChatPops(except) {
  if (except !== chatMenu) { chatMenu.classList.remove('open'); chatTitleBtn.setAttribute('aria-expanded', 'false'); chatMenu.querySelector('[data-cm="delete"]').classList.remove('confirm'); chatMenu.querySelector('[data-cm="delete"] span').textContent = 'Löschen'; }
  if (except !== chatsPop) { chatsPop.classList.remove('open'); chatsBtn.setAttribute('aria-expanded', 'false'); }
}
chatTitleBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  if (chatTitleBtn.querySelector('input')) return;
  const open = !chatMenu.classList.contains('open');
  closeChatPops(chatMenu);
  chatMenu.classList.toggle('open', open);
  chatTitleBtn.setAttribute('aria-expanded', String(open));
});
chatMenu.addEventListener('click', (e) => {
  e.stopPropagation();
  const b = e.target.closest('[data-cm]');
  if (!b) return;
  const tab = activeTab();
  const c = chatOf(tab);
  if (b.dataset.cm === 'rename') { closeChatPops(); startRename(tab); }
  else if (b.dataset.cm === 'pin') {
    closeChatPops();
    togglePin(tab);
  } else if (b.dataset.cm === 'delete') {
    if (!b.classList.contains('confirm')) { b.classList.add('confirm'); b.querySelector('span').textContent = 'Wirklich löschen?'; return; }
    closeChatPops();
    deleteChat(tab);
  }
});

function togglePin(tab) {
  const c = chatOf(tab);
  c.pinned = !c.pinned;
  tab.classList.toggle('pinned', c.pinned);
  if (c.pinned) tabsEl.prepend(tab); // angeheftet → nach vorn
  renderChatBar();
  renderChatList();
  saveChats();
}

function startRename(tab) {
  const c = chatOf(tab);
  const input = document.createElement('input');
  input.className = 'chat-title-input';
  input.value = c.title;
  input.maxLength = 60;
  input.setAttribute('aria-label', 'Chat umbenennen');
  chatTitleEl.replaceWith(input);
  input.focus();
  input.select();
  let done = false;
  const finish = (save) => {
    if (done) return;
    done = true;
    const v = input.value.replace(/\s+/g, ' ').trim();
    input.replaceWith(chatTitleEl);
    if (save && v && v !== c.title) setChatTitle(tab, v);
  };
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); finish(true); } else if (e.key === 'Escape') finish(false);
  });
  input.addEventListener('blur', () => finish(true));
  input.addEventListener('click', (e) => e.stopPropagation());
}

function deleteChat(tab) {
  // aktiver Chat gelöscht → im Chat bleiben: neuer, leerer Chat an derselben Stelle (nicht zum Nachbar-Tab wie Dokumente springen).
  // Passiert das in der Chat-Übersicht, bleibt man dort (ggf. „Noch keine Chats“); „Zurück“ führt dann in den neuen Chat.
  if (tab.classList.contains('active')) {
    keepChatsView = !!chatsView?.open;
    try { tabsEl.insertBefore(createTab('Neuer Chat'), tab); } finally { keepChatsView = false; }
  }
  tabChats.delete(tab);
  if (tab.dataset.cid) deletedChats.add(tab.dataset.cid);
  tab.remove();
  renderChatBar();
  renderChatList();
  saveChats();
}

/* ---------- Liste aller Chats oben rechts ---------- */
function relTime(t) {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return 'Gerade eben';
  if (s < 3600) return `Vor ${Math.round(s / 60)} Min.`;
  if (s < 86400) return `Vor ${Math.round(s / 3600)} Std.`;
  const d = Math.round(s / 86400);
  return d === 1 ? 'Gestern' : `Vor ${d} Tagen`;
}
function renderChatList() {
  if (!chatsPop.classList.contains('open')) return;
  const tabs = [...tabsEl.querySelectorAll('.tab:not(.uil-tab):not([data-view])')];
  const items = tabs.map((t) => ({ tab: t, c: chatOf(t) })).sort((a, b) => b.c.updated - a.c.updated);
  const groups = [['Angeheftet', items.filter((x) => x.c.pinned)], ['Zuletzt', items.filter((x) => !x.c.pinned)]];
  const frag = document.createDocumentFragment();
  groups.forEach(([label, list]) => {
    if (!list.length) return;
    frag.append(el('div', 'cp-label', label));
    list.forEach(({ tab, c }, i) => {
      const row = el('button', 'cp-row' + (tab.classList.contains('active') ? ' active' : ''));
      row.type = 'button';
      row.style.animationDelay = `${Math.min(i, 8) * 25}ms`;
      row.innerHTML = `${c.pinned ? '<svg class="cp-pin" width="16" height="16"><use href="#i-pin"/></svg>' : ''}<span class="cp-title"></span><span class="cp-sub"></span>`;
      row.querySelector('.cp-title').textContent = c.title;
      row.querySelector('.cp-sub').textContent = relTime(c.updated);
      row.addEventListener('click', () => { activateTab(tab); closeChatPops(); });
      frag.append(row);
    });
  });
  cpList.replaceChildren(frag);
}
// Klick auf das Chats-Symbol öffnet die ganze Liste im Hauptteil (beim Darüberfahren passiert nichts)
let hoverT = 0;
const showChatsPop = (open) => {
  if (open && chatsView.open) return;
  if (open) closeChatPops(chatsPop);
  chatsPop.classList.toggle('open', open);
  chatsBtn.setAttribute('aria-expanded', String(open));
  renderChatList();
};
chatsBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  clearTimeout(hoverT);
  showChatsPop(false);
  chatsView.toggle();
});
chatsPop.addEventListener('click', (e) => e.stopPropagation());
document.addEventListener('click', () => closeChatPops());
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeChatPops(); chatsView.hide(); } });

/* ---------- Alle Chats als Liste im Hauptteil ---------- */
/* Listen (Chatverlauf, Library): nach Anheften/Löschen gleiten die Zeilen weich an ihren neuen Platz (FLIP über data-key);
   die angeheftete Zeile ploppt kurz auf */
window.flipList = (box, change, popKey = null) => {
  const before = new Map([...box.querySelectorAll('[data-key]')].map((n) => [n.dataset.key, n.getBoundingClientRect().top]));
  change();
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  box.querySelectorAll('[data-key]').forEach((n) => {
    n.style.animation = 'none'; // kein erneutes Einblenden der ganzen Liste
    const a = before.get(n.dataset.key);
    if (a == null) return;
    const dy = a - n.getBoundingClientRect().top;
    if (Math.abs(dy) > 1) n.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 420, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' });
    if (n.dataset.key === popKey) n.querySelector('.cl-pin')?.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.35) rotate(-18deg)' }, { transform: 'none' }], { duration: 420, easing: 'cubic-bezier(0.2, 0.9, 0.25, 1.06)' });
  });
  box.querySelectorAll('.cl-label').forEach((n) => { n.style.animation = 'none'; });
};
const chatsView = (() => {
  const panel = document.querySelector('.panel');
  const view = el('section', 'chats-view');
  view.hidden = true;
  view.setAttribute('aria-label', 'Alle Chats');
  // kein „Zurück“: der Chatverlauf ist ein eigener Bereich, gewechselt wird über die Sidebar
  view.innerHTML = `<div class="cl-wrap">
    <div class="cl-head"><h2>Chats</h2><button type="button" class="cl-new" title="Neuer Chat"><svg width="14" height="14"><use href="#f-plus"/></svg><span>Neuer Chat</span></button></div>
    <label class="cl-search"><svg width="14" height="14"><use href="#f-search"/></svg><input type="search" placeholder="Chats durchsuchen" aria-label="Chats durchsuchen" /></label>
    <div class="cl-list"></div></div>`;
  const list = view.querySelector('.cl-list'), search = view.querySelector('input');
  view.querySelector('.cl-new').addEventListener('click', () => { hide(); createTab('Neuer Chat'); input.focus(); });
  const render = () => {
    const q = search.value.trim().toLowerCase();
    const all = [...tabsEl.querySelectorAll('.tab:not(.uil-tab):not([data-view])')].filter((t) => !isDraft(t) && inWorkspace(t)).map((t) => ({ tab: t, c: chatOf(t) })); // leere Chats zählen nicht
    const items = all.filter((x) => !q || x.c.title.toLowerCase().includes(q)).sort((a, b) => b.c.updated - a.c.updated);
    const frag = document.createDocumentFragment();
    [['Angeheftet', items.filter((x) => x.c.pinned)], ['Zuletzt', items.filter((x) => !x.c.pinned)]].forEach(([label, rows]) => {
      if (!rows.length) return;
      frag.append(el('div', 'cl-label', label));
      rows.forEach(({ tab, c }, i) => {
        const row = el('div', 'cl-row' + (tab.classList.contains('active') ? ' active' : ''));
        row.tabIndex = 0;
        row.dataset.key = chatId(tab);
        row.style.animationDelay = `${Math.min(i, 10) * 20}ms`;
        // rechts immer: Zeit, Anheften, Löschen (wie in der Library) – Löschen: 1. Klick rot, 2. Klick löscht
        row.innerHTML = `${chatAvatar(tab, 'cl-av')}<span class="cl-title"></span><span class="cl-time"></span><span class="cl-acts">`
          + `<button type="button" class="lb-act cl-pin${c.pinned ? ' on' : ''}" aria-label="${c.pinned ? 'Lösen' : 'Anheften'}" title="${c.pinned ? 'Lösen' : 'Anheften'}"><svg width="14" height="14"><use href="#f-pin"/></svg></button>`
          + '<button type="button" class="lb-act lb-del cl-del" aria-label="Chat löschen" title="Löschen"><svg width="14" height="14"><use href="#f-trash"/></svg></button></span>';
        row.querySelector('.cl-title').textContent = c.title;
        row.querySelector('.cl-time').textContent = relTime(c.updated);
        row.addEventListener('click', (e) => {
          if (e.target.closest('.cl-pin')) { window.flipList(list, () => { togglePin(tab); render(); }, chatId(tab)); return; }
          const del = e.target.closest('.cl-del');
          if (del) {
            if (!del.classList.contains('confirm')) { del.classList.add('confirm'); del.title = 'Nochmal klicken zum Löschen'; setTimeout(() => { del.classList.remove('confirm'); del.title = 'Löschen'; }, 2500); return; }
            window.flipList(list, () => { deleteChat(tab); render(); });
            return;
          }
          hide(); activateTab(tab);
        });
        row.addEventListener('keydown', (e) => { if (e.key === 'Enter') { hide(); activateTab(tab); } });
        frag.append(row);
      });
    });
    if (!items.length) frag.append(el('div', 'cl-empty', q ? 'Kein Chat gefunden' : 'Noch keine Chats'));
    list.replaceChildren(frag);
  };
  search.addEventListener('input', render);
  let open = false;
  let hideT = 0;
  function show() {
    if (panel && !view.isConnected) panel.append(view);
    window.Calendar?.hide();
    window.Tasks?.hide();
    clearTimeout(hideT);
    open = true;
    search.value = '';
    render();
    setTimeout(() => { if (open) search.focus({ preventScroll: true }); }, 60); // gleich lostippen zum Suchen
    view.classList.remove('closing');
    view.hidden = false;
    panel?.classList.add('view-chats');
    chatsBtn.classList.add('on');
    window.renderSideChats?.();
  }
  // weich ausblenden, dann erst verstecken; der Chat erscheint sofort darunter
  function hide() {
    if (!open) return;
    open = false;
    panel?.classList.remove('view-chats');
    chatsBtn.classList.remove('on');
    window.renderSideChats?.();
    view.classList.add('closing');
    hideT = setTimeout(() => { view.hidden = true; view.classList.remove('closing'); }, 200);
  }
  // Tab-Wechsel, neuer Tab oder Seitenleiste → zurück zum Chat
  tabsEl.addEventListener('click', (e) => { if (e.target.closest('.tab') && !e.target.closest('.tab-close')) hide(); });
  newTabBtn.addEventListener('click', hide);
  document.querySelectorAll('.sidebar .sb-main a.nav-item:not([data-nav="history"])').forEach((a) => a.addEventListener('click', hide));
  return { show, hide, toggle: () => (open ? hide() : show()), render, get open() { return open; } };
})();

/* ---------- Sidebar: Bereiche „Chats“ und „Dokumente“ lassen sich ein- und ausklappen (Klick auf die Überschrift,
   bleibt gemerkt). „Chats“ = die 8 neuesten (auch geschlossene); antwortet einer gerade, steht rechts ein Halbkreis. ---------- */
const SB_SEC_KEY = 'sidebar.closed.v1';
const sbClosed = new Set((() => { try { return JSON.parse(localStorage.getItem(SB_SEC_KEY)) || []; } catch { return []; } })());
window.sbSectionClosed = (k) => sbClosed.has(k);
window.sbSectionHead = (label, k) => `<button type="button" class="sb-sec-head" aria-expanded="${!sbClosed.has(k)}"><span>${label}</span><svg width="12" height="12"><use href="#o-chev"/></svg></button>`;
document.querySelector('.sidebar').addEventListener('click', (e) => {
  const head = e.target.closest('.sb-sec-head'); if (!head) return;
  e.preventDefault();
  const sec = head.closest('.sb-sec'), k = sec.dataset.sec;
  const closed = sec.classList.toggle('closed');
  head.setAttribute('aria-expanded', String(!closed));
  closed ? sbClosed.add(k) : sbClosed.delete(k);
  try { localStorage.setItem(SB_SEC_KEY, JSON.stringify([...sbClosed])); } catch {}
});
const sbChats = $('sbChats');
sbChats.classList.toggle('closed', sbClosed.has('chats'));
let sideChatsFrame = 0;
/* Chat in der Sidebar: beim Darüberfahren rechts Anheften und „⋯“ (Umbenennen · Anheften · Löschen); zu lange Namen enden mit … */
const sbChatMenu = el('div', 'chat-pop chat-menu sb-chat-menu', `<button type="button" role="menuitem" data-sbm="rename">${icon('f-pencil', 14)}<span>Umbenennen</span></button>`
  + `<button type="button" role="menuitem" data-sbm="pin">${icon('f-pin', 14)}<span>Anheften</span></button><div class="cm-sep" role="separator"></div>`
  + `<button type="button" role="menuitem" data-sbm="delete" class="danger">${icon('f-trash', 14)}<span>Löschen</span></button>`);
sbChatMenu.setAttribute('role', 'menu');
document.body.append(sbChatMenu);
let sbMenuTab = null, sbRenaming = false;
function closeSbChatMenu() {
  sbChatMenu.classList.remove('open');
  sbChats.querySelector('.sb-chat.menu-open')?.classList.remove('menu-open');
  const del = sbChatMenu.querySelector('[data-sbm="delete"]');
  del.classList.remove('confirm'); del.querySelector('span').textContent = 'Löschen';
  sbMenuTab = null;
}
function openSbChatMenu(tab, btn) {
  const same = sbMenuTab === tab && sbChatMenu.classList.contains('open');
  closeSbChatMenu();
  if (same) return;
  sbMenuTab = tab;
  btn.closest('.sb-chat').classList.add('menu-open');
  sbChatMenu.querySelector('[data-sbm="pin"] span').textContent = chatOf(tab).pinned ? 'Lösen' : 'Anheften';
  const r = btn.getBoundingClientRect();
  const below = r.bottom + 6 + 120 < innerHeight; // unten kein Platz → darüber
  sbChatMenu.style.left = `${Math.round(r.left - 4)}px`;
  sbChatMenu.style.top = below ? `${Math.round(r.bottom + 6)}px` : `${Math.round(r.top - 6 - sbChatMenu.offsetHeight)}px`;
  sbChatMenu.classList.add('open');
}
function renameSideChat(tab, row) {
  const c = chatOf(tab), t = row.querySelector('.sb-chat-t');
  const input = document.createElement('input');
  input.className = 'sb-chat-input';
  input.value = c.title;
  input.maxLength = 60;
  input.setAttribute('aria-label', 'Chat umbenennen');
  row.classList.add('renaming');
  t.replaceWith(input);
  sbRenaming = true;
  input.focus(); input.select();
  let done = false;
  const finish = (save) => {
    if (done) return;
    done = true; sbRenaming = false;
    const v = input.value.replace(/\s+/g, ' ').trim();
    if (save && v && v !== c.title) setChatTitle(tab, v); else window.renderSideChats();
  };
  input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); finish(true); } else if (e.key === 'Escape') finish(false); });
  input.addEventListener('blur', () => finish(true));
  input.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); });
}
sbChatMenu.addEventListener('click', (e) => {
  e.stopPropagation();
  const b = e.target.closest('[data-sbm]'), tab = sbMenuTab;
  if (!b || !tab) return;
  if (b.dataset.sbm === 'delete') {
    if (!b.classList.contains('confirm')) { b.classList.add('confirm'); b.querySelector('span').textContent = 'Wirklich löschen?'; return; }
    closeSbChatMenu(); deleteChat(tab); return;
  }
  const row = sbChats.querySelector('.sb-chat.menu-open');
  closeSbChatMenu();
  if (b.dataset.sbm === 'pin') togglePin(tab);
  else if (b.dataset.sbm === 'rename' && row) renameSideChat(tab, row);
});
document.addEventListener('click', (e) => { if (sbChatMenu.classList.contains('open') && !e.target.closest('.sb-chat-menu, [data-sbc="more"]')) closeSbChatMenu(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && sbChatMenu.classList.contains('open')) closeSbChatMenu(); });
window.addEventListener('resize', () => closeSbChatMenu());
window.renderSideChats = () => {
  cancelAnimationFrame(sideChatsFrame);
  sideChatsFrame = requestAnimationFrame(() => {
    if (sbRenaming) return; // Umbenennen läuft – danach wird neu gezeichnet
    closeSbChatMenu();
    // markiert: Bereich des offenen Tabs bzw. „Chatverlauf“, solange die Übersicht offen ist
    const v = activeTab()?.dataset.view;
    const kind = chatsView.open ? 'history' : v === 'doc' ? 'docs' : v || '';
    document.querySelectorAll('.sidebar .sb-main [data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === kind));
    const items = [...tabsEl.querySelectorAll('.tab:not(.uil-tab):not([data-view])')].filter((t) => !isDraft(t) && inWorkspace(t))
      .map((tab) => ({ tab, c: chatOf(tab) })).sort((a, b) => (b.c.pinned - a.c.pinned) || (b.c.updated - a.c.updated)).slice(0, 8); // angeheftete zuerst
    // „Chats“ steht immer da (auch ohne Chats, dann ohne Hinweis darunter); rechts ein Plus für einen neuen Chat – nur beim Darüberfahren
    const body = el('div', 'sb-sec-body');
    const inner = el('div', 'sb-sec-in');
    body.append(inner);
    inner.append(...items.map(({ tab, c }) => {
      const a = el('a', `nav-item sb-chat${tab.classList.contains('active') && !chatsView.open ? ' active' : ''}`, `${chatAvatar(tab, 'sb-av')}<span class="sb-chat-t"></span>${runOf(tab) ? '<span class="spinner sb-busy" role="img" aria-label="Antwortet gerade"></span>' : ''}`
        + `<span class="sb-chat-acts"><span class="sb-chat-act${c.pinned ? ' on' : ''}" data-sbc="pin" role="button" aria-label="${c.pinned ? 'Lösen' : 'Anheften'}" title="${c.pinned ? 'Lösen' : 'Anheften'}">${icon('f-pin', 13)}</span>`
        + `<span class="sb-chat-act" data-sbc="more" role="button" aria-label="Mehr" title="Mehr">${icon('f-more', 13)}</span></span>`);
      a.href = '#';
      a.querySelector('.sb-chat-t').textContent = c.title;
      a.addEventListener('click', (e) => {
        e.preventDefault();
        const act = e.target.closest('[data-sbc]');
        if (act) { e.stopPropagation(); act.dataset.sbc === 'pin' ? togglePin(tab) : openSbChatMenu(tab, act); return; }
        chatsView.hide(); activateTab(tab);
      });
      return a;
    }));
    sbChats.innerHTML = `<div class="sb-sec-row">${window.sbSectionHead('Chats', 'chats')}<button type="button" class="sb-sec-add" aria-label="Neuer Chat" title="Neuer Chat"><svg width="14" height="14"><use href="#o-plus"/></svg></button></div>`;
    sbChats.append(body);
  });
};
// Übersicht aller Chats auch aus Kalender, Aufgaben, Bibliothek … öffnen: vorher in einen Chat-Tab wechseln
function openChatsFromAnywhere() {
  const act = activeTab();
  if (!act || act.dataset.view) {
    const t = [...tabsEl.querySelectorAll('.tab:not([data-view]):not(.uil-tab):not([hidden])')][0];
    if (t) activateTab(t); else createTab('Neuer Chat');
  }
  if (!chatsView.open) chatsView.show();
}
window.renderSideChats();
sbChats.addEventListener('click', (e) => { if (e.target.closest('.sb-sec-add')) document.querySelector('.sidebar .sb-main [data-nav="new"]')?.click(); });
// anderen Agenten im offenen Chat gewählt → dieser Chat zeigt ab jetzt dessen Hund (Sidebar und Chatverlauf sofort)
document.addEventListener('dogmodechange', (e) => {
  const tab = activeTab();
  if (!tab || tab.dataset.view || isDraft(tab) || !e.detail?.id || chatOf(tab).agent === e.detail.id) return;
  chatOf(tab).agent = e.detail.id;
  saveChats();
  if (chatsView.open) chatsView.render();
});

/* ---------- Chats speichern (localStorage) und beim Start wiederherstellen ----------
   Pro Chat: Titel, angeheftet, Zeit und Verlauf (Text, Bilder, Quellen). Gezeichnet wird beim Laden
   aus dem Verlauf – ohne Denk-Zeitleiste, aber mit Diagrammen, Formeln und Belegen. */
const CHATS_KEY = 'chats.v1';
let restoring = false;
const deletedChats = new Set(); // ausdrücklich gelöschte Chats – der Server löscht nur diese
let saveT = 0;
function chatId(tab) {
  if (!tab.dataset.cid) tab.dataset.cid = `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  return tab.dataset.cid;
}
function historyOf(tab) {
  if (tab.classList.contains('active')) return history;
  return tabChats.get(tab)?.history || [];
}
function saveChats() {
  markDrafts();
  window.renderSideChats?.(); // Titel/Reihenfolge der letzten Chats in der Sidebar
  if (restoring) return;
  clearTimeout(saveT);
  saveT = setTimeout(writeChats, 150);
}
// Zuletzt an den Server geschickter Stand je Chat – geschickt werden nur geänderte Chats (Vercel nimmt höchstens ~4,5 MB je Anfrage)
const sentChats = new Map();
function chatItems(withImages) {
  return [...tabsEl.querySelectorAll('.tab:not(.uil-tab):not([data-view])')].map((tab) => {
    const c = chatOf(tab);
    return {
      id: chatId(tab), title: c.title, auto: c.auto, pinned: c.pinned, updated: c.updated, closed: tab.hidden || undefined, docId: c.docId || undefined, agent: c.agent || undefined, ws: c.ws && c.ws !== 'main' ? c.ws : undefined,
      history: historyOf(tab).map((h) => ({ role: h.role, text: h.text, ...(withImages && h.images?.length ? { images: h.images } : {}), ...(h.sources?.length ? { sources: h.sources } : {}), ...(h.thoughts?.length ? { thoughts: h.thoughts, workTime: h.workTime } : {}), ...(h.doc ? { doc: h.doc } : {}) })),
    };
  });
}
function markChatsSent() { sentChats.clear(); chatItems(true).forEach((c) => sentChats.set(c.id, JSON.stringify(c))); }
function writeChats() {
  clearTimeout(saveT);
  if (restoring) return;
  {
    const tabs = [...tabsEl.querySelectorAll('.tab:not(.uil-tab):not([data-view])')];
    if (!tabs.length) return;
    const act = activeTab();
    const sent = [...deletedChats];
    const active = chatId(act && !act.dataset.view ? act : tabs.find((t) => !t.hidden) || tabs[0]);
    const items = chatItems(true);
    const strs = new Map(items.map((c) => [c.id, JSON.stringify(c)]));
    const changed = items.filter((c) => sentChats.get(c.id) !== strs.get(c.id));
    // Hauptspeicher: das Konto auf dem Server (nur geänderte Chats + Reihenfolge; gelöschte ausdrücklich gemeldet)
    if (changed.length || sent.length || active !== writeChats.active) {
      const body = JSON.stringify({ deleted: sent, active, order: items.map((c) => c.id), chats: changed });
      fetch('/api/chats', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body, keepalive: body.length < 60000 })
        .then((r) => { if (!r.ok) return; sent.forEach((id) => deletedChats.delete(id)); changed.forEach((c) => sentChats.set(c.id, strs.get(c.id))); writeChats.active = active; }).catch(() => {});
    }
    // Ersatz im Browser, falls der Server mal nicht erreichbar ist
    const full = (withImages) => JSON.stringify({ deleted: sent, active, chats: withImages ? items : chatItems(false) });
    try { localStorage.setItem(CHATS_KEY, full(true)); } catch {
      try { localStorage.setItem(CHATS_KEY, full(false)); } catch {} // Speicher voll → ohne Bilder
    }
  }
}
/* Gespeicherte Gedanken: zugeklappte Zeitleiste „Worked for …“ wie nach einer fertigen Antwort – Klick klappt auf,
   Klick auf einen Gedanken zeigt seinen Text */
function savedThoughts(h) {
  const w = createWork();
  w.head.querySelector('.work-title').textContent = 'Completed';
  const t = w.head.querySelector('.t');
  t.classList.remove('live');
  t.textContent = h.workTime || '';
  if (h.plan?.length) { // Plan zuerst – wie während der Arbeit, alle Punkte erledigt
    const step = stepLine('dot', '<strong>Plan</strong>');
    const list = el('div', 'plan-list');
    h.plan.forEach((p) => list.append(el('div', 'plan-item', `<span class="pi-mark">${FadeIcons.svg('check-circle', 13)}</span><span class="pi-text">${escapeHtml(p)}</span>`)));
    list.querySelectorAll('.plan-item').forEach((r) => { r.dataset.state = 'done'; });
    const fold = el('div', 'fold');
    const inner = el('div', 'fold-in');
    inner.append(list);
    fold.append(inner);
    step.append(fold);
    step.classList.add('foldable', 'has-box');
    step.querySelector('.step-line').insertAdjacentHTML('beforeend', '<svg class="fold-chev" width="10" height="10" aria-hidden="true"><use href="#i-chevron-down"/></svg>');
    step.querySelector('.step-line').addEventListener('click', () => step.classList.toggle('open'));
    w.steps.append(step);
  }
  (h.thoughts || []).forEach(({ title, body }) => {
    const step = stepLine('dot', '');
    step.classList.add('thought');
    const head = el('button', 'thought-head');
    head.type = 'button';
    head.textContent = title || '';
    const fold = el('div', 'fold');
    const inner = el('div', 'fold-in');
    inner.append(el('div', 'thought-text'));
    inner.firstChild.textContent = body && body !== title ? body : '';
    fold.append(inner);
    step.querySelector('.step-line').append(head);
    step.append(fold);
    head.addEventListener('click', () => { if (inner.firstChild.textContent) step.classList.toggle('open'); });
    w.steps.append(step);
  });
  w.work.classList.add('collapsed');
  w.work.querySelector('.work-body').style.height = '0px';
  w.head.setAttribute('aria-expanded', 'false');
  return w.work;
}
function renderSavedHistory(list) {
  list.forEach((h, i) => {
    if (h.role === 'user') {
      addUserMessage(h.text || '', (h.images || []).map((img) => ({ url: `data:${img.mime};base64,${img.data}`, name: img.name || (img.mime === 'application/pdf' ? 'PDF' : 'Bild'), mime: img.mime })));
      return;
    }
    const msgEl = el('div', 'msg-ai');
    msgEl._historyAt = i;
    if (h.doc) { if (h.doc.state === 'work') h.doc.state = 'fail'; chat.append(msgEl); renderDocCard(msgEl, h); return; }
    const text = h.text || '';
    if (h.thoughts?.length || h.plan?.length) msgEl.append(savedThoughts(h));
    if (stripAskBlock(text).trim() && text !== '(keine Antwort)') {
      const answer = el('div', 'answer md');
      msgEl.append(answer);
      chat.append(msgEl);
      const r = makeRenderer(answer, { sources: h.sources || [] });
      r.append(text);
      r.flush();
      void hydrateIllustrations(answer); // Bilder der gespeicherten Antwort nachladen (kommen aus dem Speicher des Servers)
      msgEl.append(messageFooter(msgEl, text));
    } else { chat.append(msgEl); msgEl.append(restartBar(msgEl)); }
  });
}
restoring = true; // bis geladen ist, nichts speichern (sonst würde der leere Start die Dateien überschreiben)
(async function restoreChats() {
  // Nur vom Server laden; ist er kurz weg, weiter versuchen (bis dahin wird nichts gespeichert – restoring bleibt an).
  // Nie einen alten Stand aus dem Browser übernehmen: der würde beim nächsten Speichern den Server überschreiben.
  let saved = null;
  for (let i = 0; !saved; i++) {
    try { const r = await fetch('/api/chats'); if (r.ok) saved = await r.json(); } catch {}
    if (!saved) await new Promise((res) => setTimeout(res, Math.min(5000, 600 + i * 400)));
  }
  // Rettung: Chats, die nur noch im Browser-Speicher stehen, erst nach wiederherstellung/ sichern
  try {
    const old = JSON.parse(localStorage.getItem(CHATS_KEY) || 'null');
    const have = new Set((saved.chats || []).map((c) => c.id));
    const missing = (old?.chats || []).filter((c) => c?.id && !have.has(c.id) && (c.history || []).length);
    if (missing.length) await fetch('/api/recovery', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source: `Browser-Speicher ${location.origin}`, chats: missing }) });
  } catch {}
  if (!saved?.chats?.length) { restoring = false; renderBookmarks(); restoreLayout(); return; }
  const first = tabsEl.querySelector('.tab:not(.uil-tab):not([data-view])');
  let activeEl = null;
  saved.chats.forEach((s, i) => {
    const tab = i === 0 && first ? first : createTab(s.title);
    if (i === 0) activateTab(tab);
    tab.dataset.cid = s.id;
    tab._chat = { title: s.title, auto: s.auto, pinned: !!s.pinned, updated: s.updated || Date.now(), docId: s.docId, agent: s.agent, ws: s.ws || 'main' };
    tab.querySelector('.tab-title').textContent = s.title;
    tab.classList.toggle('pinned', !!s.pinned);
    chat.replaceChildren();
    history.length = 0;
    history.push(...(s.history || []));
    renderSavedHistory(s.history || []);
    if (s.id === saved.active) activeEl = tab;
  });
  activateTab(activeEl || first);
  // geschlossene Chats: Tab bleibt zu (der aktive bleibt immer offen)
  saved.chats.forEach((s) => { if (!s.closed) return; const t = tabsEl.querySelector(`.tab[data-cid="${s.id}"]`); if (t && !t.classList.contains('active')) t.hidden = true; });
  snapToPixels(tabsEl.querySelectorAll('.tab'));
  restoring = false;
  markChatsSent(); // so steht es schon auf dem Server
  writeChats.active = saved.active;
  renderBookmarks();
  chatScroll.scrollTop = chatScroll.scrollHeight;
  restoreLayout();
})();

/* Chat öffnen, der auf dem Server entstanden ist (z. B. Ergebnis einer Agenten-Aufgabe): schon als Tab da → aktivieren,
   sonst aus dem Konto laden und als Tab anlegen */
async function openSavedChat(id) {
  let tab = tabsEl.querySelector(`.tab[data-cid="${id}"]`);
  if (!tab) {
    let s = null;
    try { const r = await fetch('/api/chats'); if (r.ok) s = (await r.json()).chats?.find((c) => c.id === id); } catch {}
    if (!s) return false;
    tab = tabsEl.querySelector(`.tab[data-cid="${id}"]`); // inzwischen angelegt?
    if (!tab) {
      tab = createTab(s.title);
      tab.dataset.cid = s.id;
      tab._chat = { title: s.title, auto: s.auto, pinned: !!s.pinned, updated: s.updated || Date.now(), docId: s.docId, agent: s.agent, ws: s.ws || 'main' };
      tab.querySelector('.tab-title').textContent = s.title;
      chat.replaceChildren();
      history.length = 0;
      history.push(...(s.history || []));
      renderSavedHistory(s.history || []);
      sentChats.set(s.id, JSON.stringify(chatItems(true).find((c) => c.id === s.id) || {}));
      markDrafts(); renderBookmarks();
    }
  }
  activateTab(tab);
  chatScroll.scrollTop = 0;
  return true;
}
window.openSavedChat = openSavedChat;

/* ---------- Geteilte Workspaces: Chats der anderen übernehmen ----------
   Beim Öffnen, beim Zurückkehren in die App und jede Minute: neue Chats kommen als (geschlossene) Tabs dazu, geänderte werden
   neu gezeichnet (nicht während eine Antwort läuft), von anderen gelöschte verschwinden. Der sichtbare Chat bleibt, wo er ist. */
function renderDetached(hist) {
  const keep = document.createDocumentFragment(); keep.append(...chat.childNodes);
  const keepH = history.splice(0);
  history.push(...hist); renderSavedHistory(hist);
  const nodes = document.createDocumentFragment(); nodes.append(...chat.childNodes);
  const h = history.splice(0);
  chat.append(keep); history.push(...keepH);
  return { nodes, history: h };
}
const chatFields = (s) => ({ title: s.title, auto: s.auto, pinned: !!s.pinned, updated: s.updated || Date.now(), docId: s.docId, agent: s.agent, ws: s.ws || 'main' });
async function syncSharedChats() {
  if (restoring) return;
  const shared = new Set((window.Workspaces?.list() || []).filter((w) => w.shared).map((w) => w.id));
  if (!shared.size) return;
  void window.Docs?.sync?.();
  let data = null;
  try { const r = await fetch('/api/chats', { cache: 'no-store' }); if (r.ok) data = await r.json(); } catch {}
  if (!data || restoring) return;
  const top = chatScroll.scrollTop;
  const onServer = new Set();
  let changed = false;
  for (const s of data.chats || []) {
    if (!shared.has(s.ws)) continue;
    onServer.add(s.id);
    if (deletedChats.has(s.id)) continue;
    let tab = tabsEl.querySelector(`.tab[data-cid="${s.id}"]`);
    const stamp = JSON.stringify(s);
    if (tab && (runOf(tab) || (Number(s.updated) || 0) <= (Number(chatOf(tab).updated) || 0))) continue;
    if (!tab) { tab = createTab(s.title, '', {}, { background: true }); tab.dataset.cid = s.id; tab.hidden = true; }
    tab._chat = chatFields(s);
    tab.querySelector('.tab-title').textContent = s.title;
    if (tab.classList.contains('active')) {
      chat.replaceChildren(); history.length = 0; history.push(...(s.history || [])); renderSavedHistory(s.history || []);
    } else tabChats.set(tab, renderDetached(s.history || []));
    sentChats.set(s.id, JSON.stringify(chatItems(true).find((c) => c.id === s.id) || stamp));
    changed = true;
  }
  // von anderen gelöscht (war schon einmal auf dem Server) → hier nur den Tab entfernen
  tabsEl.querySelectorAll('.tab:not(.uil-tab):not([data-view])').forEach((t) => {
    const c = chatOf(t), id = t.dataset.cid;
    if (!id || !shared.has(c.ws) || onServer.has(id) || !sentChats.has(id) || runOf(t)) return;
    sentChats.delete(id); tabChats.delete(t);
    if (t.classList.contains('active')) { const next = tabsEl.querySelector('.tab:not(.uil-tab):not(.ws-off):not([hidden]):not(.active)'); if (next) activateTab(next); else createTab('Neuer Chat'); }
    t.remove(); changed = true;
  });
  if (!changed) return;
  chatScroll.scrollTop = top;
  markDrafts(); renderBookmarks(); window.renderSideChats?.(); window.Workspaces?.refreshTabs?.();
  if (chatsView?.open) chatsView.render?.();
}
// Workspace verlassen / Teilen beendet: dessen Chats nur hier entfernen (sie gehören dem Besitzer)
function dropWorkspaceChats(ws) {
  tabsEl.querySelectorAll('.tab:not(.uil-tab):not([data-view])').forEach((t) => {
    if (chatOf(t).ws !== ws || runOf(t)) return;
    sentChats.delete(t.dataset.cid); tabChats.delete(t);
    if (t.classList.contains('active')) { const next = tabsEl.querySelector('.tab:not(.uil-tab):not(.ws-off):not([hidden]):not(.active)'); if (next) activateTab(next); else createTab('Neuer Chat'); }
    t.remove();
  });
  markDrafts(); window.renderSideChats?.();
}
window.syncSharedChats = syncSharedChats;
window.dropWorkspaceChats = dropWorkspaceChats;
setInterval(() => { if (!document.hidden) void syncSharedChats(); }, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) void syncSharedChats(); });

/* ---------- Offene Tabs merken: welche Tabs (Chats, Kalender, Aufgaben, Inbox, Dokumente …) offen waren,
   in welcher Reihenfolge und welcher aktiv war – nach dem Neustart wieder genauso ---------- */
const LAYOUT_KEY = 'tabs.layout.v1';
let layoutReady = false;
function saveLayout() {
  if (!layoutReady || restoring) return;
  const tabs = [...tabsEl.querySelectorAll('.tab:not([hidden]):not(.draft)')];
  const act = activeTab();
  try { localStorage.setItem(LAYOUT_KEY, JSON.stringify({ order: tabs.map(bmKey), active: act ? bmKey(act) : null })); } catch {}
}
async function restoreLayout() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(LAYOUT_KEY) || 'null'); } catch {}
  if (saved?.order?.length) {
    // Dokumente sind evtl. noch nicht geladen → kurz warten, bis sie da sind
    const needDocs = saved.order.some((k) => k.startsWith('doc:'));
    for (let i = 0; needDocs && i < 40 && !saved.order.filter((k) => k.startsWith('doc:')).some((k) => window.Docs?.get(k.slice(4))); i++) await new Promise((r) => setTimeout(r, 150));
    const current = activeTab();
    saved.order.forEach((key) => {
      if (tabByKey(key)) return;
      const [kind, id] = key.split(':');
      if (kind === 'view' && VIEW_TABS[id] && id !== 'doc') openViewTab(id);
      else if (kind === 'doc' && window.Docs?.get(id)) openDocTab(id, window.Docs.get(id).title || 'Unbenannt');
    });
    // Reihenfolge wie vorher (unbekannte Tabs bleiben hinten)
    saved.order.map(tabByKey).filter(Boolean).forEach((t) => tabsEl.insertBefore(t, newTabBtn));
    const want = saved.active && tabByKey(saved.active);
    const target = want || current || tabsEl.querySelector('.tab:not([hidden])');
    // Layout verweist nur auf gelöschte Chats → kein Tab übrig: neuen Chat öffnen statt ganz ohne Tab zu starten
    if (target) activateTab(target); else createTab('Neuer Chat');
  }
  layoutReady = true;
  saveLayout();
  window.dispatchEvent(new Event('app-layout-ready')); // z. B. für auth.js: nach dem Anmelden „Neuer Chat“ öffnen
}
new MutationObserver(() => { clearTimeout(saveLayout.t); saveLayout.t = setTimeout(saveLayout, 200); })
  .observe(tabsEl, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden'] });
/* ---------- Rechtsklick auf einen Tab: Anheften, Lesezeichen, Umbenennen, Schließen ----------
   Angeheftete Tabs stehen vorn und zeigen nur ihr Icon. Lesezeichen erscheinen links in der Seitenleiste. */
const BM_KEY = 'bookmarks.v1';
let bookmarks = [];
try { bookmarks = JSON.parse(localStorage.getItem(BM_KEY)) || []; } catch {}
const saveBookmarks = () => { try { localStorage.setItem(BM_KEY, JSON.stringify(bookmarks)); } catch {} };
const bmKey = (tab) => (tab.dataset.doc ? `doc:${tab.dataset.doc}` : tab.dataset.view ? `view:${tab.dataset.view}` : `chat:${chatId(tab)}`);
const tabByKey = (key) => {
  const [kind, id] = key.split(':');
  return tabsEl.querySelector(kind === 'view' ? `.tab[data-view="${id}"]` : kind === 'doc' ? `.tab[data-doc="${id}"]` : `.tab[data-cid="${id}"]`);
};
const bmNav = el('nav', 'nav nav-bookmarks');
bmNav.setAttribute('aria-label', 'Lesezeichen');
$('sbChats').after(bmNav);
function renderBookmarks() {
  // Chats, deren Tab geschlossen wurde, gibt es nicht mehr → Lesezeichen weg (nicht während die Chats noch laden)
  // Dokumente bleiben gespeichert → ihre Lesezeichen bleiben auch ohne offenen Tab
  if (!restoring) { bookmarks = bookmarks.filter((b) => b.key.startsWith('view:') || b.key.startsWith('doc:') || tabByKey(b.key)); saveBookmarks(); }
  bmNav.hidden = !bookmarks.length;
  bmNav.replaceChildren(...(bookmarks.length ? [el('div', 'section-label', 'Lesezeichen')] : []), ...bookmarks.map((b) => {
    const tab = tabByKey(b.key);
    const view = b.key.startsWith('view:') ? VIEW_TABS[b.key.slice(5)] : null;
    const a = el('a', 'nav-item bm-item');
    a.href = '#';
    a.dataset.key = b.key;
    const isDoc = b.key.startsWith('doc:');
    a.innerHTML = `${view ? icon(view.icon) : icon(isDoc ? 'f-file' : 'f-chat')}<span class="bm-t"></span><button type="button" class="bm-x" aria-label="Lesezeichen entfernen" title="Lesezeichen entfernen">${icon('i-x', 14)}</button>`;
    a.querySelector('.bm-t').textContent = view ? view.title : isDoc ? (window.Docs?.titleOf(b.key.slice(4)) || b.title) : (tab ? chatOf(tab).title : b.title);
    return a;
  }));
}
bmNav.addEventListener('click', (e) => {
  const a = e.target.closest('.bm-item'); if (!a) return;
  e.preventDefault();
  if (e.target.closest('.bm-x')) { bookmarks = bookmarks.filter((b) => b.key !== a.dataset.key); renderBookmarks(); return; }
  const tab = tabByKey(a.dataset.key);
  if (tab) activateTab(tab);
  else if (a.dataset.key.startsWith('view:')) openViewTab(a.dataset.key.slice(5));
  else if (a.dataset.key.startsWith('doc:')) window.Docs?.open(a.dataset.key.slice(4));
});
function toggleBookmark(tab) {
  const key = bmKey(tab);
  if (bookmarks.some((b) => b.key === key)) bookmarks = bookmarks.filter((b) => b.key !== key);
  else bookmarks.push({ key, title: tab.querySelector('.tab-title').textContent });
  renderBookmarks();
}
function togglePinTab(tab) {
  if (tab.dataset.view) {
    const on = !tab.classList.contains('pinned');
    tab.classList.toggle('pinned', on);
    if (on) tabsEl.prepend(tab);
  } else togglePin(tab);
  // angeheftete Tabs immer vorn, in ihrer Reihenfolge
  [...tabsEl.querySelectorAll('.tab.pinned')].reverse().forEach((t) => tabsEl.prepend(t));
}

const tabMenu = el('div', 'chat-pop chat-menu tab-menu');
tabMenu.setAttribute('role', 'menu');
document.body.append(tabMenu);
let menuTab = null;
const hideTabMenu = () => { tabMenu.classList.remove('open'); menuTab = null; };
tabsEl.addEventListener('contextmenu', (e) => {
  const tab = e.target.closest('.tab:not(.uil-tab)'); if (!tab) return;
  e.preventDefault();
  menuTab = tab;
  const pinned = tab.classList.contains('pinned'), marked = bookmarks.some((b) => b.key === bmKey(tab));
  const only = tabsEl.querySelectorAll('.tab').length < 2;
  tabMenu.innerHTML = `<button type="button" data-tm="pin">${icon('f-pin', 14)}<span>${pinned ? 'Lösen' : 'Anheften'}</span></button>`
    + `<button type="button" data-tm="mark">${icon('f-bookmark', 14)}<span>${marked ? 'Lesezeichen entfernen' : 'Als Lesezeichen'}</span></button>`
    + (tab.dataset.view ? '' : `<button type="button" data-tm="rename">${icon('f-pencil', 14)}<span>Umbenennen</span></button>`)
    + `<div class="cm-sep"></div><button type="button" data-tm="close">${icon('f-x', 14)}<span>Tab schließen</span></button>`
    + `<button type="button" data-tm="others"${only ? ' disabled' : ''}>${icon('f-x-circle', 14)}<span>Andere Tabs schließen</span></button>`;
  tabMenu.style.left = `${Math.min(e.clientX, innerWidth - 210)}px`;
  tabMenu.style.top = `${e.clientY + 4}px`;
  closeChatPops();
  tabMenu.classList.add('open');
});
tabMenu.addEventListener('click', (e) => {
  e.stopPropagation();
  const b = e.target.closest('[data-tm]'); if (!b || b.disabled || !menuTab) return;
  const tab = menuTab;
  hideTabMenu();
  if (b.dataset.tm === 'pin') togglePinTab(tab);
  if (b.dataset.tm === 'mark') toggleBookmark(tab);
  if (b.dataset.tm === 'rename') { activateTab(tab); startRename(tab); }
  if (b.dataset.tm === 'close') closeTab(tab);
  if (b.dataset.tm === 'others') { activateTab(tab); [...tabsEl.querySelectorAll('.tab:not(.uil-tab)')].forEach((t) => { if (t !== tab && !t.classList.contains('pinned')) closeTab(t); }); }
  renderBookmarks();
  saveChats();
});
document.addEventListener('click', hideTabMenu);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideTabMenu(); });
window.addEventListener('blur', hideTabMenu);
new MutationObserver(() => renderBookmarks()).observe(tabsEl, { childList: true, subtree: true, characterData: true });
renderBookmarks();

new MutationObserver(saveChats).observe(tabsEl, { childList: true }); // neuer, geschlossener oder verschobener Tab
tabsEl.addEventListener('click', saveChats); // Tab-Wechsel merken
window.addEventListener('pagehide', writeChats); // beim Schließen/Neuladen sofort sichern
renderChatBar();


/* Chat-Menü: neuer Chat und Chat als Text kopieren */
chatMenu.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-cm]');
  if (!b) return;
  if (b.dataset.cm === 'new') { closeChatPops(); createTab('Neuer Chat'); input.focus(); }
  else if (b.dataset.cm === 'copy') {
    const text = history.map((h) => `${h.role === 'user' ? 'Du' : 'KI'}: ${h.text}`).join('\n\n');
    try { await navigator.clipboard.writeText(text || ''); } catch {}
    const label = b.querySelector('span');
    label.textContent = text ? 'Kopiert' : 'Noch leer';
    setTimeout(() => { label.textContent = 'Als Text kopieren'; closeChatPops(); }, 700);
  }
});


/* Agent-Fenster ohne offene Aufgabe: schlichter Hinweis */
function vaShowQuick() {
  va.panel = 'quick';
  vaAskBox.replaceChildren(el('div', 'va-empty', 'Noch nichts passiert.'));
}

/* ===================================================================
   Leiste: weiche Übergänge, wenn sich ihr Aufbau ändert (Agent ↔ Musik ↔ Timer).
   dockFlip: Positionen vorher merken → ändern → alles gleitet von alt nach neu.
   dockEnter: Element blendet nur beim echten Erscheinen ein (nicht bei jedem Umbau).
   Dauer und Kurve passen zu den Übergängen der Leiste in style.css (AGENT-LEISTE v7).
   =================================================================== */
const DOCK_MS = 360;
const DOCK_EASE = 'cubic-bezier(0.16, 1, 0.3, 1)';
window.dockFlip = (change) => {
  const dock = $('topStack');
  const sel = '.va-face, .va-text, .va-actions, .mu-mini, .mu-mini-cover, .mu-mini-text, .mu-mini-actions, :scope > .ft';
  const before = new Map();
  const dockWidth = dock.getBoundingClientRect().width;
  clearTimeout(dock._dockSizeTimer);
  dock.style.removeProperty('width');
  dock.querySelectorAll(sel).forEach((n) => {
    const r = n.getBoundingClientRect();
    if (r.width) before.set(n, r);
    n._dockMotion?.cancel();
    n._dockMotion = null;
  });
  change();
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const nextWidth = dock.getBoundingClientRect().width;
  if (dockWidth && nextWidth && Math.abs(dockWidth - nextWidth) > 1) {
    dock.style.setProperty('width', `${dockWidth}px`, 'important');
    void dock.offsetWidth;
    dock.style.setProperty('width', `${nextWidth}px`, 'important');
    dock._dockSizeTimer = setTimeout(() => dock.style.removeProperty('width'), DOCK_MS + 40); // erst nach dem Übergang (style.css: 360 ms)
  }
  dock.querySelectorAll(sel).forEach((n) => {
    const a = before.get(n);
    const b = n.getBoundingClientRect();
    if (!a || !b.width) return;
    const dx = a.left - b.left, dy = a.top - b.top;
    // Texte/Chips ziehen sich in der Breite weich groß bzw. klein (statt umzuspringen)
    if (n.matches('.mu-mini-text, .mu-mini, #topStack > .ft') && Math.abs(a.width - b.width) > 2) {
      n.animate([{ width: `${a.width}px`, minWidth: '0px', maxWidth: 'none', flexBasis: 'auto' }, { width: `${b.width}px`, minWidth: '0px', maxWidth: 'none', flexBasis: 'auto' }], { duration: DOCK_MS, easing: DOCK_EASE });
    }
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
    const motion = n.animate([{ translate: `${dx}px ${dy}px` }, { translate: '0 0' }], { duration: DOCK_MS, easing: DOCK_EASE });
    n._dockMotion = motion;
    motion.onfinish = () => { if (n._dockMotion === motion) n._dockMotion = null; };
  });
};
window.dockEnter = (node) => {
  if (!node || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  node.classList.remove('entering');
  void node.offsetWidth;
  node.classList.add('entering');
  clearTimeout(node._enterT);
  node._enterT = setTimeout(() => node.classList.remove('entering'), 500);
};


/* ===================================================================
   Tabs per Ziehen verschieben (die anderen Tabs gleiten weich zur Seite)
   - nur ab zwei Tabs; der gezogene Tab bleibt innerhalb der Tab-Reihe
   - gerechnet wird mit offsetLeft (ohne laufende Animationen), damit nichts hin- und herspringt
   =================================================================== */
(() => {
  const EASE = 'cubic-bezier(0.16, 1, 0.3, 1)';
  let drag = null;
  const tabsList = () => [...tabsEl.querySelectorAll('.tab')];
  const setX = (x) => { drag.tx = x; drag.tab.style.transform = `translateX(${x}px)`; };
  // Umstellen mit FLIP: die anderen Tabs gleiten von ihrer sichtbaren Position an den neuen Platz
  const flip = (fn) => {
    const before = new Map(tabsList().map((t) => [t, t.getBoundingClientRect().left]));
    fn();
    tabsList().forEach((t) => {
      if (t === drag.tab) return;
      t.getAnimations().forEach((a) => a.cancel());
      const dx = before.get(t) - t.getBoundingClientRect().left;
      if (Math.abs(dx) > 0.5) t.animate([{ transform: `translateX(${dx}px)` }, { transform: 'none' }], { duration: 240, easing: EASE });
    });
  };
  tabsEl.addEventListener('pointerdown', (e) => {
    const tab = e.target.closest('.tab');
    if (!tab || e.button !== 0 || e.target.closest('.tab-close')) return;
    if (tabsList().length < 2) return; // ein einzelner Tab lässt sich nicht verschieben
    tab.getAnimations().forEach((a) => a.cancel());
    drag = { tab, startX: e.clientX, tx: 0, moved: false, id: e.pointerId };
  });
  window.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const { tab } = drag;
    const dx = e.clientX - drag.startX;
    if (!drag.moved) {
      if (Math.abs(dx) < 5) return;
      drag.moved = true;
      drag.base = tab.offsetLeft; // Platz beim Start
      tab.classList.add('dragging');
      tabsEl.classList.add('reordering');
      window.getSelection()?.removeAllRanges();
    }
    // sichtbare Position, begrenzt auf die Tab-Reihe
    const tabs = tabsList();
    // 1 px Spielraum an den Enden, damit der Tab auch ganz außen den Nachbarn überholt
    const minL = Math.min(...tabs.map((t) => t.offsetLeft)) - 1;
    const maxL = Math.max(...tabs.map((t) => t.offsetLeft + t.offsetWidth)) - tab.offsetWidth + 1;
    const left = Math.min(maxL, Math.max(minL, drag.base + dx));
    // neuer Platz = Anzahl der anderen Tabs, deren Mitte links von der Mitte des gezogenen Tabs liegt
    const mid = left + tab.offsetWidth / 2;
    const others = tabs.filter((t) => t !== tab);
    const index = others.filter((t) => t.offsetLeft + t.offsetWidth / 2 < mid).length;
    if (index !== tabs.indexOf(tab)) flip(() => tabsEl.insertBefore(tab, others[index] || newTabBtn));
    setX(left - tab.offsetLeft);
  });
  const end = () => {
    if (!drag) return;
    const { tab, moved, tx } = drag;
    drag = null;
    if (!moved) return;
    tab.classList.remove('dragging');
    tabsEl.classList.remove('reordering');
    tab.style.transform = '';
    if (Math.abs(tx) > 0.5) tab.animate([{ transform: `translateX(${tx}px)` }, { transform: 'none' }], { duration: 240, easing: EASE });
    // Klick nach dem Ziehen nicht als Tab-Wechsel werten
    const swallow = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
    tabsEl.addEventListener('click', swallow, { capture: true, once: true });
    setTimeout(() => tabsEl.removeEventListener('click', swallow, { capture: true }), 50);
  };
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);
})();

/* ===================================================================
   Tab-Leiste in Bewegung
   - kein Tab offen (nur ein leerer Chat) → die Leiste fährt weich nach oben, das Plus verschwindet;
     kommt ein Tab dazu, fährt sie wieder herunter und das Plus erscheint hinter dem neuen Tab
   - Tabs, die dazukommen, gehen oder umziehen: die übrigen (und das Plus) gleiten an ihren neuen Platz (FLIP),
     ein neuer Tab ploppt leise auf, ein geschlossener blendet an seiner alten Stelle aus
   - gemessen wird mit offsetLeft (ohne laufende Animationen); beim Laden und beim Ziehen passiert nichts davon
   =================================================================== */
(() => {
  const EASE = 'cubic-bezier(0.16, 1, 0.3, 1)';
  const tabbar = tabsEl.closest('.tabbar');
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const shown = (t) => !t.hidden && !t.classList.contains('draft');
  const measure = () => new Map([...tabsEl.querySelectorAll('.tab'), newTabBtn].filter((n) => n === newTabBtn || shown(n))
    .map((n) => [n, { left: n.offsetLeft, top: n.offsetTop, width: n.offsetWidth }]));
  let last = new Map();
  const update = (records) => {
    const instant = restoring || !layoutReady;
    if (instant) app.classList.add('tabbar-instant'); // beim Laden: Leiste gleich richtig, ohne Fahrt
    app.classList.toggle('no-tabs', ![...tabsEl.querySelectorAll('.tab')].some(shown));
    if (!instant && app.classList.contains('tabbar-instant')) requestAnimationFrame(() => requestAnimationFrame(() => app.classList.remove('tabbar-instant')));
    const now = measure();
    if (records && !instant && !reduced() && !tabsEl.classList.contains('reordering')) {
      // geschlossen/versteckt: als „Geist“ an der alten Stelle ausblenden (liegt in der Leiste, nicht zwischen den Tabs)
      const gone = new Set();
      records.forEach((r) => {
        r.removedNodes.forEach((n) => { if (last.has(n) && !n.isConnected) gone.add(n); });
        if (r.type === 'attributes' && last.has(r.target) && !now.has(r.target)) gone.add(r.target);
      });
      gone.forEach((n) => {
        const was = last.get(n);
        const ghost = n.cloneNode(true);
        ghost.hidden = false;
        ghost.classList.remove('draft', 'tab-enter');
        ghost.classList.add('tab-ghost');
        ghost.removeAttribute('id');
        Object.assign(ghost.style, { left: `${tabsEl.offsetLeft + was.left}px`, top: `${tabsEl.offsetTop + was.top}px`, width: `${was.width}px` });
        tabbar.append(ghost);
        ghost.animate([{ opacity: 1, scale: '1' }, { opacity: 0, scale: '0.92' }], { duration: 180, easing: 'ease-out', fill: 'forwards' }).onfinish = () => ghost.remove();
      });
      now.forEach((b, n) => {
        const a = last.get(n);
        if (!a) { // neu sichtbar → leise aufploppen
          if (n !== newTabBtn) { n.classList.remove('tab-enter'); void n.offsetWidth; n.classList.add('tab-enter'); }
          return;
        }
        const cur = n._flip ? parseFloat(getComputedStyle(n).translate) || 0 : 0; // läuft noch eine Bewegung: von der sichtbaren Stelle aus
        n._flip?.cancel();
        const dx = a.left + cur - b.left;
        if (Math.abs(dx) < 0.5) { n._flip = null; return; }
        const anim = n.animate([{ translate: `${dx}px 0` }, { translate: '0 0' }], { duration: 340, easing: EASE });
        n._flip = anim;
        anim.onfinish = () => { if (n._flip === anim) n._flip = null; };
      });
    }
    last = now;
  };
  tabsEl.addEventListener('animationend', (e) => { if (e.animationName === 'tab-pop') e.target.classList.remove('tab-enter'); });
  new MutationObserver(update).observe(tabsEl, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class', 'hidden'] });
  window.addEventListener('resize', () => { last = measure(); });
  update(null);
})();

/* ===================================================================
   Prompt-Navigation am linken Rand: ein Strich pro Frage.
   Darüberfahren → Karte mit Frage + Antwort-Vorschau; Klick → weich dorthin springen.
   =================================================================== */
(() => {
  const panel = document.querySelector('.panel');
  if (!panel) return;
  const nav = el('nav', 'prompt-nav');
  nav.setAttribute('aria-label', 'Fragen in diesem Chat');
  const card = el('div', 'pn-card');
  card.innerHTML = '<div class="pn-q"></div><div class="pn-a"></div>';
  panel.append(nav, card);
  let items = [];
  let hoverIdx = -1;
  let hideT = null;

  const prompts = () => [...chat.querySelectorAll(':scope > .msg-out')];
  const answerOf = (msg) => {
    let n = msg.nextElementSibling;
    while (n && !n.classList.contains('msg-out')) {
      if (n.classList.contains('msg-ai')) {
        const a = n.querySelector('.answer, .md') || n;
        return a.innerText.replace(/\s+/g, ' ').trim();
      }
      n = n.nextElementSibling;
    }
    return '';
  };
  const textOf = (msg) => (msg.querySelector('.out-bubble')?.innerText || (msg.querySelector('img') ? 'Bild' : '')).replace(/\s+/g, ' ').trim();

  function build() {
    const list = prompts();
    nav.classList.toggle('show', list.length >= 2 && !panel.classList.contains('view-calendar'));
    if (list.length === items.length && list.every((m, i) => items[i].msg === m)) { markActive(); return; }
    items = list.map((msg) => {
      const line = el('button', 'pn-line');
      line.type = 'button';
      line.setAttribute('aria-label', textOf(msg).slice(0, 80) || 'Frage');
      return { msg, line };
    });
    nav.replaceChildren(...items.map((x) => x.line));
    markActive();
  }
  // aktive Frage: die letzte, deren Anfang schon über der Bildschirmmitte liegt
  function markActive() {
    const box = chatScroll.getBoundingClientRect();
    const mid = box.top + box.height * 0.4;
    let idx = 0;
    items.forEach((x, i) => { if (x.msg.getBoundingClientRect().top <= mid) idx = i; });
    if (chatScroll.scrollHeight - chatScroll.scrollTop - chatScroll.clientHeight < 4) idx = items.length - 1;
    items.forEach((x, i) => x.line.classList.toggle('active', i === idx));
  }
  function showCard(i) {
    clearTimeout(hideT);
    const x = items[i];
    if (!x) return;
    hoverIdx = i;
    card.querySelector('.pn-q').textContent = textOf(x.msg) || 'Frage';
    const a = answerOf(x.msg);
    card.querySelector('.pn-a').textContent = a ? (a.length > 190 ? `${a.slice(0, 189)}…` : a) : 'Antwort wird geschrieben …';
    const pr = panel.getBoundingClientRect();
    const lr = x.line.getBoundingClientRect();
    card.style.top = `${Math.round(lr.top - pr.top + lr.height / 2)}px`;
    card.classList.add('open');
    items.forEach((y, k) => y.line.classList.toggle('hover', k === i));
  }
  function hideCard() {
    hideT = setTimeout(() => { card.classList.remove('open'); items.forEach((y) => y.line.classList.remove('hover')); hoverIdx = -1; }, 120);
  }
  nav.addEventListener('pointermove', (e) => {
    const i = items.findIndex((x) => x.line === e.target.closest('.pn-line'));
    if (i >= 0 && i !== hoverIdx) showCard(i);
  });
  nav.addEventListener('pointerleave', hideCard);
  card.addEventListener('pointerenter', () => clearTimeout(hideT));
  card.addEventListener('pointerleave', hideCard);
  const jump = (i) => {
    const x = items[i];
    if (!x) return;
    const top = x.msg.getBoundingClientRect().top - chatScroll.getBoundingClientRect().top + chatScroll.scrollTop;
    const pad = parseFloat(getComputedStyle(chatScroll).paddingTop) || 0;
    chatScroll.scrollTo({ top: Math.max(0, top - pad + 4), behavior: 'smooth' });
    x.msg.classList.remove('pn-flash'); void x.msg.offsetWidth; x.msg.classList.add('pn-flash');
  };
  nav.addEventListener('click', (e) => { const i = items.findIndex((x) => x.line === e.target.closest('.pn-line')); if (i >= 0) jump(i); });
  card.addEventListener('click', () => { if (hoverIdx >= 0) jump(hoverIdx); });

  new MutationObserver(build).observe(chat, { childList: true });
  new MutationObserver(build).observe(panel, { attributes: true, attributeFilter: ['class'] });
  chatScroll.addEventListener('scroll', () => requestAnimationFrame(markActive), { passive: true });
  build();
})();

/* ===================================================================
   Keine Browser-Tooltips beim Verweilen (z. B. „Seitenfenster“): jedes title-Attribut wird entfernt.
   Für Screenreader wandert der Text nach aria-label, wenn das Element sonst keinen Namen hat.
   =================================================================== */
(() => {
  const strip = (n) => {
    if (n.nodeType !== 1 || n.tagName === 'IFRAME' || !n.hasAttribute('title')) return;
    const t = n.getAttribute('title');
    if (t && !n.hasAttribute('aria-label') && !n.textContent.trim()) n.setAttribute('aria-label', t);
    n.removeAttribute('title');
  };
  const all = (root) => { strip(root); root.querySelectorAll?.('[title]').forEach(strip); };
  new MutationObserver((ms) => ms.forEach((m) => (m.type === 'attributes' ? strip(m.target) : m.addedNodes.forEach(all))))
    .observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['title'] });
  all(document.body);
})();

/* Schimmer über eine ganze Zeile (z. B. Bild-Icon + „Generating picture“): alle Teile teilen sich EINEN Verlauf –
   der helle Streifen läuft vom Icon nahtlos in den Text weiter. --lw = Breite der Zeile, --ox = Abstand jedes Teils vom Zeilenanfang. */
function sweepRow(row) {
  const parts = [...row.querySelectorAll(':scope > .shimmer')];
  const measure = () => {
    const w = Math.round(row.getBoundingClientRect().width); if (!w) return;
    const x0 = row.getBoundingClientRect().left;
    row.style.setProperty('--lw', `${w}px`);
    parts.forEach((p) => p.style.setProperty('--ox', `${Math.round(p.getBoundingClientRect().left - x0)}px`));
  };
  row.classList.add('sweep-row');
  new ResizeObserver(measure).observe(row);
  requestAnimationFrame(measure);
}
window.sweepRow = sweepRow;

/* KI-Bilder per Klick groß ansehen (gleiche Großansicht wie bei Fotos, weich ein-/ausgeblendet);
   mehrere Bilder derselben Antwort lassen sich darin durchblättern */
document.addEventListener('click', (e) => {
  const img = e.target.closest?.('.chat-illustration.ready img');
  if (!img || lightbox.classList.contains('open')) return;
  const scope = img.closest('.msg-ai, .dcc-a') || document;
  const imgs = [...scope.querySelectorAll('.chat-illustration.ready img')];
  openLightbox(imgs, Math.max(0, imgs.indexOf(img)));
});

/* ---------- Startseite eines neuen Chats ----------
   Nur solange der aktive Chat leer ist: das Eingabefeld sitzt etwas unterhalb der Mitte, im Hintergrund ein Platz
   aus Kacheln, oben kein Titel. Beim ersten Senden blendet das weg und das Feld gleitet nach unten. Der Senden-Knopf erscheint erst, wenn etwas im Feld steht. */
(() => {
  const panel = document.querySelector('.panel');
  if (!panel) return;

  // Senden-Knopf nur mit Inhalt (oder während eine Antwort läuft – dann ist er der Stopp-Knopf)
  const syncSend = () => composer.classList.toggle('has-text', !!input.value.trim() || attachments.length > 0);
  input.addEventListener('input', syncSend);
  input.addEventListener('dictation', syncSend);
  composer.addEventListener('submit', () => setTimeout(syncSend, 0));
  new MutationObserver(syncSend).observe($('attachments'), { childList: true });

  /* Hintergrund: Ringe aus Kacheln um die Mitte, vereinzelt Dreiecke – einmal erzeugt, fest verteilt */
  const plaza = document.createElement('div');
  plaza.className = 'home-plaza';
  plaza.setAttribute('aria-hidden', 'true');
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  let tiles = '';
  for (let r = 70; r < 1150; r += 34) {
    const count = Math.floor((2 * Math.PI * r) / 34);
    const off = rnd() * Math.PI * 2;
    for (let k = 0; k < count; k++) {
      if (rnd() < 0.08) continue; // vereinzelte Lücken wirken natürlicher
      const a = off + (k / count) * Math.PI * 2, x = 800 + Math.cos(a) * r, y = 560 + Math.sin(a) * r * 0.82;
      const s = 21 + rnd() * 5, deg = (a * 180) / Math.PI;
      const op = (0.021 + rnd() * 0.033).toFixed(3); // Stärke regelt --plaza-strength (Darstellung → Kacheln)
      tiles += rnd() < 0.07
        ? `<path d="M0 ${-s / 2}L${s / 2} ${s / 2}H${-s / 2}Z" transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${(deg + 90).toFixed(1)})" fill-opacity="${op}"/>`
        : `<rect x="${(-s / 2).toFixed(1)}" y="${(-s / 2).toFixed(1)}" width="${s.toFixed(1)}" height="${s.toFixed(1)}" rx="5" transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${deg.toFixed(1)})" fill-opacity="${op}"/>`;
    }
  }
  plaza.innerHTML = `<svg viewBox="0 0 1600 1120" preserveAspectRatio="xMidYMid slice"><g fill="currentColor">${tiles}</g></svg>`;
  panel.prepend(plaza);

  /* An/aus: leerer Chat-Tab → Startseite */
  const lift = () => {
    const free = panel.clientHeight - composerArea.offsetHeight;
    panel.style.setProperty('--home-lift', `${Math.max(0, Math.round(free / 2 - 90))}px`); // Feld etwas unterhalb der Mitte
  };
  function updateHome() {
    const tab = activeTab();
    const on = !!tab && !tab.dataset.view && !historyOf(tab).length;
    panel.classList.toggle('home', on);
    if (on) setTimeout(lift, 0);
  }
  window.addEventListener('chat-tab-switched', () => setTimeout(updateHome, 0)); // nicht rAF: läuft in Hintergrund-Tabs nicht
  window.addEventListener('resize', () => { if (panel.classList.contains('home')) lift(); });
  // Leiste/Ideen klappen erst auf → Höhe ändert sich noch: dann neu mitteln
  new ResizeObserver(() => { if (panel.classList.contains('home')) lift(); }).observe(composerArea);
  // erstes Senden: weg mit Leiste, Ideen und Hintergrund – das Feld gleitet nach unten
  composer.addEventListener('submit', () => { if (panel.classList.contains('home') && (input.value.trim() || attachments.length)) panel.classList.remove('home'); }, true);
  setTimeout(updateHome, 0);
  syncSend();
})();

/* ---------- Darstellung (Einstellungen → Aussehen) ----------
   Modus (Dunkel, Schwarz, Hell – mit Mini-Vorschau), Akzentfarbe (Vorgaben oder eigene) und wie stark die Kacheln
   im Hintergrund zu sehen sind. Wird im Browser gespeichert und beim Start angewendet.
   Hell: die ganze Oberfläche wird farbtreu umgekehrt (style.css → [data-theme="light"]); Bilder bleiben unverändert. */
(() => {
  const KEY = 'appearance.v1';
  const root = document.documentElement;
  const base = getComputedStyle(root);
  // main/side: Flächen; field/fieldBorder: Eingabefeld; pv*: Farben der Mini-Vorschau (so, wie es auf dem Bildschirm aussieht)
  const MODES = {
    dark: { label: 'Dunkel', main: base.getPropertyValue('--main-bg').trim() || '#171717', side: base.getPropertyValue('--sidebar-bg').trim() || '#141414', field: '#1c1c1c', fieldBorder: '#272727',
      pv: { main: '#171717', side: '#141414', line: 'rgba(255,255,255,.16)', field: 'rgba(255,255,255,.16)' } },
    black: { label: 'Schwarz', main: '#0a0a0a', side: '#060606', field: '#111111', fieldBorder: '#1f1f1f',
      pv: { main: '#0a0a0a', side: '#060606', line: 'rgba(255,255,255,.14)', field: 'rgba(255,255,255,.14)' } },
    // Hell: Werte vor der Umkehrung (#101010 wird zu #efefef)
    light: { label: 'Hell', main: '#101010', side: '#0a0a0a', field: '#060606', fieldBorder: '#1c1c1c', light: true,
      pv: { main: '#f2f2f2', side: '#fafafa', line: 'rgba(0,0,0,.16)', field: 'rgba(0,0,0,.16)' } },
  };
  const ACCENTS = ['#2f86ff', '#a78bfa', '#f472b6', '#ff6363', '#fb923c', '#4ade80'];
  const DEFAULTS = { mode: 'dark', accent: '#2f86ff', tiles: 33 };
  const cfg = { ...DEFAULTS };
  try { Object.assign(cfg, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch {}
  if (!MODES[cfg.mode]) cfg.mode = 'dark'; // frühere Einstellung „Graphit“ gibt es nicht mehr

  function apply() {
    const m = MODES[cfg.mode];
    root.dataset.theme = m.light ? 'light' : 'dark';
    root.style.setProperty('--main-bg', m.main);
    root.style.setProperty('--sidebar-bg', m.side);
    root.style.setProperty('--field-bg', m.field);
    root.style.setProperty('--field-border', m.fieldBorder);
    // im hellen Modus wird umgekehrt → die Akzentfarbe vorher „gegenkehren“, damit sie am Ende stimmt
    root.style.setProperty('--accent', m.light ? invertHex(cfg.accent) : cfg.accent);
    root.style.setProperty('--plaza-strength', String(Math.max(0, Math.min(100, cfg.tiles)) / 100));
  }
  // Hell kehrt die Oberfläche um (invert(1) hue-rotate(180deg)). Diese Umkehr ist (fast) ihre eigene Umkehrung –
  // also die Akzentfarbe vorab genauso umkehren, dann erscheint am Ende genau die gewählte Farbe.
  function invertHex(hex) {
    const n = parseInt(hex.slice(1), 16);
    const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => (255 - v) / 255);
    const cos = -1, sin = 0; // 180°
    const m = [0.213 + cos * 0.787 - sin * 0.213, 0.715 - cos * 0.715 - sin * 0.715, 0.072 - cos * 0.072 + sin * 0.928,
      0.213 - cos * 0.213 + sin * 0.143, 0.715 + cos * 0.285 + sin * 0.14, 0.072 - cos * 0.072 - sin * 0.283,
      0.213 - cos * 0.213 - sin * 0.787, 0.715 - cos * 0.715 + sin * 0.715, 0.072 + cos * 0.928 + sin * 0.072];
    const out = [0, 1, 2].map((i) => Math.round(Math.max(0, Math.min(1, m[i * 3] * c[0] + m[i * 3 + 1] * c[1] + m[i * 3 + 2] * c[2])) * 255));
    return `#${out.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  }
  // gespeichert im Browser (sofort beim Start, kein Aufblitzen) UND auf dem Server (bleibt nach jedem Neustart und unter jeder Adresse gleich)
  let pushTimer = null;
  const save = () => {
    try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch {}
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => fetch('/api/appearance', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cfg) }).catch(() => {}), 250);
  };
  apply();
  fetch('/api/appearance').then((r) => r.json()).then((srv) => {
    if (!srv || !MODES[srv.mode]) { save(); return; } // noch nichts auf dem Server → aktuellen Stand dort ablegen
    Object.assign(cfg, { mode: srv.mode, accent: srv.accent, tiles: srv.tiles });
    try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch {}
    apply();
  }).catch(() => {});

  // eingestellt wird in den Einstellungen → Aussehen (settings.js); früher ein Fenster oben rechts im leeren Chat
  window.Appearance = {
    MODES: Object.fromEntries(Object.entries(MODES).map(([id, m]) => [id, m.label])),
    ACCENTS,
    get: () => ({ ...cfg }),
    set: (patch) => { Object.assign(cfg, patch); apply(); save(); },
  };
})();
