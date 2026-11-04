/* ===================================================================
   Speicher für Konten (Nutzer, Codes, Sitzungen, Chats, Dokumente, Einstellungen)
   Drei Möglichkeiten, alle mit denselben Befehlen:
   - Upstash Redis (REST) – auf Vercel: UPSTASH_REDIS_REST_URL/TOKEN oder KV_REST_API_URL/TOKEN
     (entsteht automatisch, wenn man in Vercel unter „Storage“ Upstash Redis verbindet)
   - Dateien – am PC (npm start), Ordner „konten/“
   - Arbeitsspeicher – nur für Tests
   Werte sind immer Text (JSON macht der Aufrufer). Hashes = Gruppen von Feldern (z. B. alle Chats eines Kontos).
   =================================================================== */
const fs = require('fs');
const path = require('path');

/* ---------- Upstash Redis über REST (ohne Abhängigkeiten) ---------- */
const HASH_PACK_MAX = 7 * 1024 * 1024, HASH_FIELD_MAX = 9 * 1024 * 1024;
function redisStore(url, token) {
  const base = url.replace(/\/+$/, '');
  async function call(cmd) {
    const r = await fetch(base, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(cmd) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) throw new Error(`Speicher: ${j.error || `HTTP ${r.status}`}`);
    return j.result;
  }
  // mehrere Befehle in EINER Anfrage (Upstash-REST /pipeline)
  async function pipeline(cmds) {
    const out = [];
    for (let i = 0; i < cmds.length; i += 500) {
      const r = await fetch(`${base}/pipeline`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(cmds.slice(i, i + 500)) });
      const j = await r.json().catch(() => null);
      if (!r.ok || !Array.isArray(j)) throw new Error(`Speicher: ${j?.error || `HTTP ${r.status}`}`);
      out.push(...j.map((x) => x?.result ?? null));
    }
    return out;
  }
  const pairs = (arr) => { const o = {}; for (let i = 0; i + 1 < (arr || []).length; i += 2) o[arr[i]] = arr[i + 1]; return o; };
  return {
    kind: 'redis',
    get: (k) => call(['GET', k]),
    set: (k, v, ttl) => call(ttl ? ['SET', k, v, 'EX', String(Math.ceil(ttl))] : ['SET', k, v]),
    del: (k) => call(['DEL', k]),
    incr: async (k, ttl) => { const n = await call(['INCR', k]); if (n === 1 && ttl) await call(['EXPIRE', k, String(Math.ceil(ttl))]); return n; },
    hget: (h, f) => call(['HGET', h, f]),
    hmget: async (h, fs_) => (fs_.length ? call(['HMGET', h, ...fs_]) : []),
    hset: (h, obj) => { const flat = Object.entries(obj).flat(); return flat.length ? call(['HSET', h, ...flat]) : 0; },
    hdel: (h, fs_) => (fs_.length ? call(['HDEL', h, ...fs_]) : 0),
    // HGETALL in Paketen: Upstash gibt höchstens 10 MB je Anfrage heraus – die Chats eines Kontos waren größer (04.11.:
    // „ERR max request size exceeded … 10686713 bytes“), dann ließ sich gar nichts mehr laden. Erst Größen je Feld (HSTRLEN, eine
    // Pipeline), dann HMGET in Paketen ≤ 7 MB; ein einzelnes Feld über 9 MB wird übersprungen (im Log vermerkt).
    hgetall: async (h) => {
      const keys = (await call(['HKEYS', h])) || [];
      if (!keys.length) return {};
      const lens = await pipeline(keys.map((k) => ['HSTRLEN', h, k]));
      const out = {}, packs = [[]];
      let size = 0;
      keys.forEach((k, i) => {
        const n = Number(lens[i]) || 0;
        if (n > HASH_FIELD_MAX) { console.error(`[speicher] ${h} → ${k} übersprungen (${Math.round(n / 1048576)} MB)`); return; }
        if (size + n > HASH_PACK_MAX && packs[packs.length - 1].length) { packs.push([]); size = 0; }
        packs[packs.length - 1].push(k); size += n;
      });
      for (const ks of packs) if (ks.length) (await call(['HMGET', h, ...ks])).forEach((v, i) => { if (v != null) out[ks[i]] = v; });
      return out;
    },
    hkeys: (h) => call(['HKEYS', h]),
    dbsize: () => call(['DBSIZE']),
  };
}

/* ---------- Dateien (am PC): ein Schlüssel = eine Datei, ein Hash = ein Ordner mit einer Datei je Feld ---------- */
function fileStore(dir) {
  const safe = (s) => encodeURIComponent(String(s)).replace(/\*/g, '%2A').replace(/%/g, '~');
  const unsafe = (s) => decodeURIComponent(s.replace(/~/g, '%'));
  const kFile = (k) => path.join(dir, 'k', `${safe(k)}.json`);
  const hDir = (h) => path.join(dir, 'h', safe(h));
  const readK = (k) => {
    try {
      const o = JSON.parse(fs.readFileSync(kFile(k), 'utf8'));
      if (o.exp && o.exp < Date.now()) { try { fs.unlinkSync(kFile(k)); } catch {} return null; }
      return o;
    } catch { return null; }
  };
  const writeK = (k, o) => { fs.mkdirSync(path.dirname(kFile(k)), { recursive: true }); fs.writeFileSync(kFile(k), JSON.stringify(o)); };
  const hget = (h, f) => { try { return fs.readFileSync(path.join(hDir(h), safe(f)), 'utf8'); } catch { return null; } };
  return {
    kind: 'file',
    async get(k) { return readK(k)?.v ?? null; },
    async set(k, v, ttl) { writeK(k, { v: String(v), exp: ttl ? Date.now() + ttl * 1000 : 0 }); return 'OK'; },
    // wie Redis DEL: löscht einen Wert ODER eine ganze Gruppe (Hash)
    async del(k) { let n = 0; try { fs.unlinkSync(kFile(k)); n = 1; } catch {} try { fs.rmSync(hDir(k), { recursive: true, force: true }); } catch {} return n; },
    async incr(k, ttl) { const o = readK(k); const n = (Number(o?.v) || 0) + 1; writeK(k, { v: String(n), exp: o?.exp || (ttl ? Date.now() + ttl * 1000 : 0) }); return n; },
    async hget(h, f) { return hget(h, f); },
    async hmget(h, fs_) { return fs_.map((f) => hget(h, f)); },
    async hset(h, obj) {
      fs.mkdirSync(hDir(h), { recursive: true });
      for (const [f, v] of Object.entries(obj)) fs.writeFileSync(path.join(hDir(h), safe(f)), String(v));
      return Object.keys(obj).length;
    },
    async hdel(h, fs_) { let n = 0; for (const f of fs_) { try { fs.unlinkSync(path.join(hDir(h), safe(f))); n++; } catch {} } return n; },
    async hgetall(h) {
      const out = {};
      let names = [];
      try { names = fs.readdirSync(hDir(h)); } catch {}
      for (const n of names) { try { out[unsafe(n)] = fs.readFileSync(path.join(hDir(h), n), 'utf8'); } catch {} }
      return out;
    },
    async hkeys(h) { try { return fs.readdirSync(hDir(h)).map(unsafe); } catch { return []; } },
  };
}

/* ---------- Arbeitsspeicher (Tests) ---------- */
function memoryStore() {
  const k = new Map(), h = new Map();
  const live = (key) => { const o = k.get(key); if (o && o.exp && o.exp < Date.now()) { k.delete(key); return null; } return o || null; };
  const hash = (name) => { if (!h.has(name)) h.set(name, new Map()); return h.get(name); };
  return {
    kind: 'memory',
    async get(key) { return live(key)?.v ?? null; },
    async set(key, v, ttl) { k.set(key, { v: String(v), exp: ttl ? Date.now() + ttl * 1000 : 0 }); return 'OK'; },
    async del(key) { const a = k.delete(key), b = h.delete(key); return a || b ? 1 : 0; }, // wie Redis: Wert oder Gruppe
    async incr(key, ttl) { const o = live(key); const n = (Number(o?.v) || 0) + 1; k.set(key, { v: String(n), exp: o?.exp || (ttl ? Date.now() + ttl * 1000 : 0) }); return n; },
    async hget(name, f) { return hash(name).get(f) ?? null; },
    async hmget(name, fs_) { return fs_.map((f) => hash(name).get(f) ?? null); },
    async hset(name, obj) { for (const [f, v] of Object.entries(obj)) hash(name).set(f, String(v)); return Object.keys(obj).length; },
    async hdel(name, fs_) { let n = 0; for (const f of fs_) if (hash(name).delete(f)) n++; return n; },
    async hgetall(name) { return Object.fromEntries(hash(name)); },
    async hkeys(name) { return [...hash(name).keys()]; },
  };
}

/* Welcher Speicher? Redis, wenn eingerichtet; sonst am PC Dateien. Auf Vercel ohne Redis: keiner
   (Dateien in /tmp gingen bei jedem Neustart verloren – Konten dürfen nicht einfach verschwinden). */
function pickStore(env, { onVercel, dataRoot }) {
  const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
  if (url && token) return redisStore(url, token);
  if (onVercel) return null;
  return fileStore(path.join(dataRoot, 'konten'));
}

module.exports = { redisStore, fileStore, memoryStore, pickStore };
