# Betrieb – Vercel, Konten, Schlüssel

- Befehle: `npm start` (localhost:3000), `npm test`, `npm run check`.
- Vercel: alle `/api/*` → `api/index.js` (ruft `handler` aus `app-server.js`), Browser-Dateien baut `vercel-build.js` nach `public/`. Keine `.env` hochladen.
- Speicher: Upstash Redis (`KV_REST_API_URL`, `KV_REST_API_TOKEN`), am PC Ordner `konten/`, in Tests Arbeitsspeicher (`require('./lib/store').memoryStore()`).
- Konten: `LOGIN_EMAIL`/`LOGIN_PASSWORD` (Hauptkonto, ohne Code), weitere `LOGIN_EMAIL_2…_5` (darf auch ein Benutzername ohne @ sein; Anmeldefeld „E-Mail oder Benutzername“). Zugangsdaten nie ins Repo (öffentlich), nur in Vercel. Optional `RESEND_API_KEY` für Code per E-Mail. Sitzung per Cookie `sid`.
- API-Keys (Gemini, MiniMax über NVIDIA – nur der Teil ab `nvapi-`, ohne „Bearer“ –, Groq, OpenRouter, FLUX für Bilder – mehrere je Anbieter, zeilenweise) pro Konto in Einstellungen → Agenten → Verbindung (`settings.keys.v1`); Server-Fallback aus `.env` (`GEMINI_API_KEY`, `NVIDIA_API_KEY`, `OPENROUTER_API_KEY` …).
- Automatisierungen: bei offener App stößt der Browser fällige Läufe an (`/api/agent-tasks/due`), am PC prüft der Server minütlich. Für geschlossene App auf Vercel: `CRON_SECRET` setzen und z. B. cron-job.org alle 10 min `https://<app>.vercel.app/api/agent-tasks/cron?key=<CRON_SECRET>` aufrufen lassen.
- Börsen-Radar hat eigenen Cron-Endpunkt `/api/boerse/radar-cron`.
- Löschen ist endgültig (kein Papierkorb); gelöschte IDs bleiben gemerkt, damit andere Geräte sie nicht zurückbringen.
- **Speichern geht nicht?** Angemeldet `https://<app>/api/speicher-check` öffnen: Probe-Schreiben, Größe der Chat-/Dokument-Antwort (Vercel ≤ ~4,5 MB), Zahl der Rettungs-Kopien, Schlüssel in Upstash. Speicherfehler stehen im Vercel-Log als `[speicher]`.
- **Upstash gibt höchstens 10 MB je Anfrage heraus** → `redisStore.hgetall` liest Hashes in Paketen (HKEYS → HSTRLEN-Pipeline → HMGET ≤ 7 MB, Feld > 9 MB übersprungen). Nie wieder `HGETALL` am Stück auf Chats/Dokumente. Vercel-Projekt der App: **`lernapp-6p99`** (hat Upstash + Login); `lernapp` (lernapp-pearl) hat keine Umgebungsvariablen und speichert nichts.
- Prüfseite Suche: `/api/diag/suche?q=…` (ohne Anmeldung, gedrosselt) zeigt je Suchmaschine Treffer/Fehler vom Server aus – abrufbar über das Vercel-MCP (`web_fetch_vercel_url`).
