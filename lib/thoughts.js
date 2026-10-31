/* ===================================================================
   Gedanken (Thinking) für die Anzeige aufbereiten – nur Gemini.
   Gemini liefert Zusammenfassungen seiner Gedanken, meist englisch und je Abschnitt mit **Überschrift**.
   Angezeigt wird nur, was wirklich gedacht wurde und inhaltlich etwas sagt:
   - Abschnitte über Form/Aufbau/Ton der Antwort („Refining the format“, „Structuring the response“) fallen weg
   - der Rest wird kurz und sinngetreu ins Deutsche übertragen (ein kleiner Modellaufruf je Abschnitt)
   - klappt die Übertragung nicht, wird der Abschnitt nicht gezeigt (lieber nichts als Englisch)
   Reihenfolge bleibt erhalten; flush() wartet, bis alles gemeldet ist (vor dem ersten Antworttext).
   =================================================================== */
const P = require('./providers');

// Überschriften, die nur das Formulieren/Gliedern der Antwort beschreiben – kein Inhalt
const META_HEAD = /\b(format\w*|structur\w*|polish\w*|finali[sz]\w*|draft\w*|wording|phras\w*|tone|style|layout|markdown|output|compos\w*|craft\w*|outlin\w* the (response|answer)|refin\w* the (response|answer)|gliederung|formulier\w*|aufbau der antwort|struktur\w*)\b/i; // nur reine Formulierungs-/Gestaltungsgedanken
const GERMAN = /\b(und|der|die|das|ist|nicht|ich|wird|werden|mit|für|eine?n?|zu|auf|den|dem|des|sich|auch|wie|aus)\b/gi;
const isGerman = (t) => (String(t).match(GERMAN) || []).length >= Math.max(2, String(t).split(/\s+/).length * 0.08);

const SYSTEM = `Du bekommst Abschnitte aus den Gedanken von Gemini (meist Englisch), nummeriert. Antworte NUR mit JSON: {"items": [{"i": 0, "keep": true, "title": "…", "body": "…"}]}
Übersetze treu ins Deutsche – so, wie Gemini gedacht hat: nichts umdeuten, nichts zusammenfassen, nichts dazuerfinden.
title: die Überschrift des Abschnitts, treu übersetzt (2–6 Wörter, z. B. „Analyzing the Worksheet“ → „Arbeitsblatt analysieren“).
body: der Text des Abschnitts, vollständig und treu übersetzt. Kein Markdown.
keep = false NUR, wenn ein Abschnitt ausschließlich Formatierung/Gestaltung der Antwort behandelt (Markdown, Überschriften, Ton, Länge) – sonst true.`;

/* Gedanken LIVE zeigen, mit wenigen Übersetzungs-Aufrufen: jeder fertige Abschnitt kommt in eine Warteschlange; läuft gerade keine
   Übersetzung, gehen alle wartenden Abschnitte in EINEN Aufruf (typisch 2–4 je Antwort statt einer am Ende). Deutsche Abschnitte gehen sofort.
   Scheitert die Übersetzung, erscheint der Abschnitt im Original (lieber das als gar keine Gedanken). flush() wartet, bis alles gezeigt ist. */
function createThoughtFilter({ env, onThought, signal, maxSections = 14 }) {
  let buf = '', closed = false, count = 0, busy = null;
  const pending = []; // { head, body, retry }
  const shown = new Set(); // gezeigte Überschriften – Gemini wiederholt Abschnitte oft fast wörtlich („Den Inhalt interpretieren“ 3×)
  const norm = (t) => String(t).toLowerCase().replace(/[^a-zäöüß]+/g, ' ').trim();
  const emit = (title, body) => {
    if (!title || shown.has(norm(title))) return;
    shown.add(norm(title));
    onThought(`**${title}**\n\n${body || ''}\n\n`);
  };
  const translate = async (batch) => {
    if (batch.every((x) => isGerman(`${x.head} ${x.body}`))) { batch.forEach((x) => emit(x.head, x.body)); return; }
    const user = batch.map((x, i) => `[${i}] ÜBERSCHRIFT: ${x.head}\nTEXT: ${x.body.slice(0, 1500)}`).join('\n\n');
    const r = await P.smallJsonTask(env, { system: SYSTEM, user, maxTokens: 3000, timeoutMs: 12000, signal, prefer: 'gemini' }).catch(() => null);
    const items = Array.isArray(r?.items) ? r.items : null;
    // Übersetzung fehlgeschlagen (Limit/Überlastung): einmal mit dem nächsten Schwung erneut versuchen, erst dann das Original zeigen
    if (!items && !closed && batch.some((x) => !x.retry)) { pending.unshift(...batch.map((x) => ({ ...x, retry: true }))); return; }
    batch.forEach((x, i) => {
      const it = items?.find((y) => Number(y?.i) === i);
      if (!items || !it || !String(it.title || '').trim()) { emit(x.head.slice(0, 70), x.body.slice(0, 1500)); return; } // Original statt nichts
      if (it.keep !== false && !META_HEAD.test(String(it.title))) emit(String(it.title).trim().slice(0, 70), String(it.body || '').trim().slice(0, 1500));
    });
  };
  const pump = () => {
    if (busy || !pending.length) return busy;
    const batch = pending.splice(0);
    busy = translate(batch).catch(() => {}).finally(() => { busy = null; pump(); });
    return busy;
  };
  const collect = (section) => {
    const m = /^\s*\*\*([^*\n]{2,90})\*\*\s*([\s\S]*)$/.exec(section);
    const head = (m ? m[1] : section.split(/[.!?\n]/)[0]).trim().replace(/[:.]$/, '');
    const body = (m ? m[2] : section).replace(/\*\*/g, '').trim();
    if (!head || META_HEAD.test(head) || count >= maxSections) return; // reine Formulierungs-/Gestaltungsgedanken: nicht zeigen
    count++;
    pending.push({ head, body });
    pump();
  };
  const split = (t) => t.split(/(?=(?:^|\n)\s*\*\*[^*\n]{2,90}\*\*)/).map((x) => x.trim()).filter(Boolean);
  const cut = () => {
    const heads = [...buf.matchAll(/(^|\n)\s*\*\*[^*\n]{2,90}\*\*/g)];
    if (heads.length < 2) return;
    const last = heads[heads.length - 1].index;
    split(buf.slice(0, last)).forEach(collect);
    buf = buf.slice(last);
  };
  return {
    push(text) { if (closed) return; buf += text; cut(); },
    async flush() {
      if (closed) { while (busy) await busy; return; }
      closed = true;
      if (buf.trim()) {
        if (!/\*\*[^*\n]{2,90}\*\*/.test(buf) && !count) {
          // rohe Gedanken ohne Überschriften (Groq, OpenRouter): Absätze zu höchstens 5 Abschnitten bündeln
          const paras = buf.split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);
          const per = Math.max(1, Math.ceil(paras.length / 5));
          for (let i = 0; i < paras.length; i += per) { const t = paras.slice(i, i + per).join('\n'); count++; pending.push({ head: (/^(.{6,80}?[.!?:])(\s|$)/.exec(t) || [, t.slice(0, 60)])[1], body: t }); }
        } else split(buf).forEach(collect);
        buf = '';
      }
      pump();
      while (busy) await busy;
    },
  };
}

/* Antwortanfang: Absätze, die nur das eigene Vorgehen beschreiben („**Analyzing the approach**“, „Ich strukturiere die Antwort …“),
   gehören nicht in die Antwort. Geprüft wird nur der Anfang; danach läuft alles unverändert durch. */
const META_PARA = /^\s*(\*\*(analy[sz]\w*|refin\w*|structur\w*|draft\w*|formulat\w*|craft\w*|consider\w*|plan\w*|review\w*|finali[sz]\w*|determin\w*|understand\w*|evaluat\w*|compos\w*|organi[sz]\w*|outlin\w*)\b[^*\n]*\*\*[\s\S]*|(ich (analysiere|strukturiere|plane|formuliere|gliedere) (die|deine|jetzt|nun|zuerst)|alright|let me|i('| a)m (going|now)|i will (now )?(analy|struct|draft|write))[\s\S]*)$/i;
// Deutsche Unterhaltung: ein englischer Absatz ganz am Anfang („**Executing Task**“, „Task Analysis Confirmed“, „I'm now …“) ist
// durchgerutschtes Nachdenken, keine Antwort
// nur Gedanken-Überschriften wie Gemini sie schreibt: ein ganzer Absatz aus „**Executing Task**“, „**Task Analysis Confirmed**“, „**Analyzing the Worksheet**“
// (englische -ing-Tätigkeit oder „confirmed/complete“). Englische Antworten auf Englisch-Hausaufgaben („I think …“, „## Task 2“) bleiben unberührt.
const ENGLISH_META = (para) => /^\s*\*\*([^*\n]{2,80})\*\*\s*$/.test(para) && !isGerman(para) && !/[äöüß]/i.test(para)
  && /\b([a-z]{3,}ing|confirmed|completed?|done|finali[sz]ed|identified|understood)\b/i.test(para) && !/\b(task|exercise|ex\.?)\s*\d/i.test(para);
function createAnswerGuard(onText, limit = 700, { german = false } = {}) {
  let head = '', open = true, parts = []; // parts: gehaltene Stücke – werden einzeln weitergegeben (Reihenfolge/Stückelung bleibt)
  const release = () => {
    open = false;
    const drop = parts.join('').length - head.length; // vorne verworfene Vorgehens-Absätze
    let skip = Math.max(0, drop);
    for (const p of parts) { if (skip >= p.length) { skip -= p.length; continue; } onText(p.slice(skip)); skip = 0; }
    parts = []; head = '';
  };
  return {
    push(text) {
      if (!open) { onText(text); return; }
      head += text; parts.push(text);
      // beginnt die Antwort offensichtlich normal (kein **…**, kein „Ich …“/„Let me …“), sofort durchlassen – flüssiges Streamen
      const st = head.trimStart();
      if (st.length >= 6 && !/^(\*\*|#|ich\s|let\s|alright|i\s|i'|okay|now\s|task\s|the user|first\s)/i.test(st)) { release(); return; }
      // ganze Absätze am Anfang prüfen
      for (;;) {
        const i = head.indexOf('\n\n');
        if (i < 0) break;
        const para = head.slice(0, i);
        if (para.trim() && (META_PARA.test(para) || (german && ENGLISH_META(para))) && !/^\s*```/.test(para)) { head = head.slice(i + 2); continue; }
        if (!para.trim()) { head = head.slice(i + 2); continue; }
        release(); return;
      }
      if (head.length > limit) release();
    },
    end() { if (open) { if (head.trim() && !META_PARA.test(head) && !(german && ENGLISH_META(head))) release(); head = ''; parts = []; open = false; } },
  };
}

module.exports = { createThoughtFilter, createAnswerGuard, META_HEAD, META_PARA };
