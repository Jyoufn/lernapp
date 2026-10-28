// Lokale Sprachausgabe mit Piper (Open Source, läuft auf diesem Rechner – gratis, ohne Limit, sehr schnell).
// Stimme: „Thorsten“ (de_DE, high). Piper läuft dauerhaft im Hintergrund, damit die Stimme nur einmal geladen wird.
// Dateien liegen in tts/ (nicht im Git):
//   Windows: tts/piper-win/piper/piper.exe     macOS: tts/piper-mac/piper/piper
//   Stimme:  tts/voices/de_DE-thorsten-high.onnx (+ .onnx.json)
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..', 'tts');
const MODEL = path.join(ROOT, 'voices', 'de_DE-thorsten-high.onnx');
const EXE = process.platform === 'win32'
  ? path.join(ROOT, 'piper-win', 'piper', 'piper.exe')
  : path.join(ROOT, process.platform === 'darwin' ? 'piper-mac' : 'piper-linux', 'piper', 'piper');
const OUT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'lernapp-tts-'));

let proc = null;
let buffer = '';
const waiting = []; // { file, resolve, reject, timer }

const available = () => fs.existsSync(EXE) && fs.existsSync(MODEL);

function start() {
  proc = spawn(EXE, ['--model', MODEL, '--json-input', '--length_scale', '1.0', '--sentence_silence', '0.18'], {
    cwd: path.dirname(EXE), windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'],
  });
  proc.stdout.on('data', (chunk) => {
    buffer += chunk.toString('utf8');
    let i;
    while ((i = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, i).trim();
      buffer = buffer.slice(i + 1);
      // Piper meldet den Pfad jeder fertigen Datei – in derselben Reihenfolge wie die Aufträge
      const job = waiting.find((w) => path.resolve(w.file) === path.resolve(line)) || waiting[0];
      if (!job) continue;
      waiting.splice(waiting.indexOf(job), 1);
      clearTimeout(job.timer);
      job.resolve(job.file);
    }
  });
  const fail = (err) => {
    proc = null;
    while (waiting.length) { const w = waiting.shift(); clearTimeout(w.timer); w.reject(err); }
  };
  proc.on('error', fail);
  proc.on('exit', () => fail(new Error('Piper beendet')));
}

/* Text → WAV-Datei (Buffer) */
async function synthesize(text) {
  if (!available()) throw new Error('Piper nicht installiert');
  if (!proc) start();
  const file = path.join(OUT_DIR, `${crypto.randomUUID()}.wav`);
  const clean = String(text).replace(/\s+/g, ' ').trim().slice(0, 1500); // \s erfasst auch Zeilenumbrüche
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { waiting.splice(waiting.findIndex((w) => w.file === file), 1); reject(new Error('Piper Zeitüberschreitung')); }, 20000);
    waiting.push({ file, resolve, reject, timer });
    proc.stdin.write(JSON.stringify({ text: clean, output_file: file }) + '\n');
  });
  const wav = fs.readFileSync(file);
  fs.unlink(file, () => {});
  return wav;
}

function stop() { try { proc?.kill(); } catch {} proc = null; }
process.on('exit', stop);

module.exports = { synthesize, available, stop };
