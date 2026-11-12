/* Lernapp für den Mac (Electron): lädt die Web-App in einem Fenster mit echtem macOS-Glas (Vibrancy).
   Die Seite erkennt die Mac-App an window.lernappDesktop und bietet dann in Einstellungen → Aussehen den Modus „Glas“ (Hell/Dunkel) an.
   Adresse ändern: Umgebungsvariable LERNAPP_URL (z. B. für einen lokalen Server). */
const { app, BrowserWindow, ipcMain, nativeTheme, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

const URL_START = process.env.LERNAPP_URL || 'https://lernapp-6p99.vercel.app/';
const stateFile = () => path.join(app.getPath('userData'), 'fenster.json');
const readState = () => { try { return JSON.parse(fs.readFileSync(stateFile(), 'utf8')); } catch { return {}; } };

let win = null;
function createWindow() {
  const st = readState();
  win = new BrowserWindow({
    width: st.width || 1280, height: st.height || 820, x: st.x, y: st.y,
    minWidth: 760, minHeight: 520,
    title: 'Lernapp',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 18, y: 18 },
    vibrancy: 'sidebar',            // Glas: der Schreibtisch scheint weichgezeichnet durch (nur sichtbar, wo die Seite durchsichtig ist)
    visualEffectState: 'active',
    backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, spellcheck: true },
  });
  win.loadURL(URL_START);
  // Links nach draußen im normalen Browser öffnen, die App selbst bleibt im Fenster
  const own = (u) => { try { return new URL(u).host === new URL(URL_START).host; } catch { return false; } };
  win.webContents.setWindowOpenHandler(({ url }) => { if (!own(url)) { shell.openExternal(url); return { action: 'deny' }; } return { action: 'allow' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!own(url) && !/vercel\.com|github\.com\/login|accounts\.google\.com/.test(url)) { e.preventDefault(); shell.openExternal(url); } });
  const save = () => { if (!win || win.isDestroyed() || win.isMinimized()) return; try { fs.writeFileSync(stateFile(), JSON.stringify(win.getBounds())); } catch {} };
  win.on('resize', save); win.on('move', save);
  win.on('closed', () => { win = null; });
}

// Seite → Glas Hell/Dunkel: das native Glas folgt dem gewählten Ton
ipcMain.on('lernapp:theme', (_e, tone) => { nativeTheme.themeSource = tone === 'light' ? 'light' : tone === 'dark' ? 'dark' : 'system'; });

app.whenReady().then(() => {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { role: 'appMenu' }, { role: 'editMenu' },
    { label: 'Ansicht', submenu: [{ role: 'reload', label: 'Neu laden' }, { role: 'togglefullscreen', label: 'Vollbild' }, { type: 'separator' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'resetZoom' }] },
    { role: 'windowMenu' },
  ]));
  createWindow();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
