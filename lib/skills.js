/* ===================================================================
   Skills – Spezial-Anweisungen für die KI (Liste und Erkennung: ../skills.js, auch im Browser)
   Der Browser schickt die aktiven Skills an der Nutzernachricht mit (`skills: [id]`); zur Sicherheit erkennt der Server sie
   zusätzlich selbst im Text. Karteikarten/Quiz/Probeklausur laufen über den Lernset-Block, Präsentation über den Präsentations-Block
   (lib/workflow.js), die übrigen bekommen hier ihre Anweisung.
   =================================================================== */
const S = require('../skills');

const LERNSET_KIND = { karteikarten: 'karten', quiz: 'quiz', probeklausur: 'klausur' };
const PROMPTS = {
  infografik: `SKILL INFOGRAFIK: Zeig die Zahlen als 2–3 passende \`\`\`chart-Blöcke (verschiedene Blickwinkel, z. B. Entwicklung + Anteile), je mit EINEM Satz Einordnung davor.
Nur echte, belegte Zahlen mit Einheit und Jahr (Quelle aus den QUELLEN, sonst gesichertes Wissen kenntlich); am Ende 2–3 Sätze Fazit. Kein langer Fließtext.`,
  mindmap: `SKILL MINDMAP: GENAU EIN \`\`\`mindmap-Block – "center" = Thema, 4–7 Äste, je 2–5 Unterpunkte als knappe Stichworte (keine Sätze),
fachlich vollständig und logisch gruppiert. Davor höchstens ein kurzer Satz.`,
  zeitstrahl: `SKILL ZEITSTRAHL: GENAU EIN \`\`\`timeline-Block mit 6–12 Ereignissen in richtiger Reihenfolge – genaues Datum, kurzer Titel, 1–2 Sätze, warum es wichtig ist.
Davor höchstens ein kurzer Satz.`,
  bild: `SKILL BILD ERSTELLEN: Erzeuge das gewünschte Bild als GENAU EIN \`\`\`illustration-Block (Format siehe oben). "prompt" beschreibt Motiv, Aufbau, Perspektive,
Farben, Stil und – bei Lernbildern – die Beschriftungen ganz genau; "query" = englische Suchwörter für eine Vorlage. Davor höchstens ein kurzer Satz, keine Bildbeschreibung als Text.`,
  designer: `SKILL DESIGNER-MODUS: Antworte wie eine erfahrene UI/UX- und Grafikdesignerin. Triff konkrete Entscheidungen statt allgemeiner Tipps:
Raster und Abstände (in px, 4er/8er-Schritte), Typografie (Schriftgrößen-Skala, Gewichte, Zeilenabstand), Farben als Hex mit Rolle und ausreichendem Kontrast,
Hierarchie, Ausrichtung, Zustände (Hover, Aktiv, Leer, Fehler) und Bewegung (Dauer, Kurve). Begründe jede Entscheidung kurz.
Bei Code: sauberes, modernes HTML/CSS ohne Deko-Verläufe und Glow. Bei Bildern/Postern: genaue Gestaltungsangaben oder ein \`\`\`illustration-Block.`,
  humanizer: `SKILL HUMANIZER: Der Text muss klingen, als hätte ihn ein Mensch geschrieben. Natürlicher Satzrhythmus (kurze und längere Sätze gemischt),
konkrete Wörter statt Floskeln, persönlicher, aber passender Ton (Schule: altersgerecht). KEINE typischen KI-Muster: keine Einleitungen wie „In der heutigen Zeit“,
kein „Zusammenfassend lässt sich sagen“, kein „Es ist wichtig zu beachten“, keine Dreier-Aufzählungen aus Gewohnheit, keine Ketten von Gedankenstrichen,
keine übertriebenen Adjektive, keine Emojis, keine Überschriften, wo ein Mensch keine setzen würde. Inhalt, Fakten und Länge bleiben erhalten.
Soll ein vorhandener Text umgeschrieben werden: nur den fertigen Text ausgeben (bei mehr als ein paar Sätzen im \`\`\`kopie-Block), ohne Vorwort.`,
  lernzettel: `SKILL LERNZETTEL: kompakt und klausurrelevant. Je Unterthema eine ## Überschrift, darunter Stichpunkte; Fachbegriffe **fett** mit Kurzdefinition,
Merksätze als Zitat (> …), Vergleiche als Tabelle, Formeln/Abläufe Schritt für Schritt. Am Ende „## Typische Klausurfragen“ (3–5 Fragen). Nichts Unwichtiges.`,
  hefteintrag: 'SKILL HEFTEINTRAG: Nach der Erklärung GENAU EIN ```heft-Block (Format siehe oben) – sauber, so wie es ins Heft gehört.',
  recherche: `SKILL RECHERCHE: gründlich mit mehreren verschiedenen Fachquellen (möglichst 3+), Kernaussagen mit Belegen [n], Widersprüche zwischen Quellen offen benennen,
am Ende kurz, was unsicher oder offen ist.`,
};

/* Skills einer Nachricht: vom Browser mitgeschickt + im Text erkannt (nur bekannte IDs) */
function of(msg) {
  const known = new Set(S.SKILLS.map((s) => s.id));
  const sent = (Array.isArray(msg?.skills) ? msg.skills : []).map(String).filter((id) => known.has(id));
  return [...new Set([...sent, ...S.active(msg?.text || '')])];
}
const lernsetKind = (ids) => ids.map((id) => LERNSET_KIND[id]).find(Boolean) || null;
function prompt(ids) {
  const parts = ids.map((id) => PROMPTS[id]).filter(Boolean);
  return parts.length ? `\n\nAKTIVE SKILLS (vom Nutzer gewählt oder erkannt – haben Vorrang vor allgemeinen Stilregeln):\n${parts.join('\n')}` : '';
}

module.exports = { of, prompt, lernsetKind, PROMPTS };
