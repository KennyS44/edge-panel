'use strict';

/* Edge Panel — Electron shell.
   The window IS the panel: frameless, transparent, always on top. The renderer
   owns what the panel looks like and how big it wants to be; this file owns
   where the window sits, which display it belongs to, and the tray. */

const { app, BrowserWindow, Tray, Menu, ipcMain, screen, nativeImage } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');

const EDGES = ['left', 'right', 'top', 'bottom'];
const DEFAULT_SIZE = { width: 320, height: 420 };

/* `--smoke` boots the app, checks the window came up where it should and
   exits. CI runs it headless, since a window cannot be unit-tested. */
const SMOKE = process.argv.includes('--smoke');

let win = null;
let tray = null;
let state = { phrases: null, notes: null, ui: {}, window: {} };
let freePos = null;      /* where a magnet-off panel was left standing */
let saveTimer = null;
let movedTimer = null;

/* ---------- state file ---------- */

const statePath = () => path.join(app.getPath('userData'), 'state.json');

async function loadState() {
  try {
    const raw = await fs.readFile(statePath(), 'utf8');
    const parsed = JSON.parse(raw);
    state = { phrases: null, notes: null, ui: {}, window: {}, ...parsed };
  } catch {
    /* first run, or a damaged file: start clean rather than crash */
  }
  if (!EDGES.includes(state.window.edge)) state.window.edge = 'right';
  if (typeof state.window.magnet !== 'boolean') state.window.magnet = true;
  return state;
}

function saveSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      await fs.mkdir(path.dirname(statePath()), { recursive: true });
      await fs.writeFile(statePath(), JSON.stringify(state, null, 2), 'utf8');
    } catch (err) {
      console.error('state save failed:', err.message);
    }
  }, 300);
}

/* ---------- geometry ---------- */

/* The display the window actually sits on — this is what makes several
   monitors work: everything below is measured against this one. */
function displayFor(bounds) {
  return screen.getDisplayMatching(bounds);
}

/* workArea, not bounds: it excludes the taskbar, so the panel sits beside it
   instead of under it. */
function nearestEdge(bounds) {
  const wa = displayFor(bounds).workArea;
  const gap = {
    left: bounds.x - wa.x,
    right: (wa.x + wa.width) - (bounds.x + bounds.width),
    top: bounds.y - wa.y,
    bottom: (wa.y + wa.height) - (bounds.y + bounds.height),
  };
  return EDGES.reduce((a, b) => (gap[b] < gap[a] ? b : a));
}

const clamp = (v, min, max) => Math.min(Math.max(v, min), Math.max(min, max));

/* Puts a box of this size flush against `edge`, keeping it centred on where
   it already was along that edge. */
function alignedBounds(size, from, edge) {
  const wa = displayFor(from).workArea;
  const width = Math.round(size.width);
  const height = Math.round(size.height);

  let x = from.x;
  let y = from.y;

  if (edge === 'left' || edge === 'right') {
    x = edge === 'left' ? wa.x : wa.x + wa.width - width;
    y = Math.round(from.y + from.height / 2 - height / 2);
  } else {
    y = edge === 'top' ? wa.y : wa.y + wa.height - height;
    x = Math.round(from.x + from.width / 2 - width / 2);
  }

  return {
    width,
    height,
    x: clamp(x, wa.x, wa.x + wa.width - width),
    y: clamp(y, wa.y, wa.y + wa.height - height),
  };
}

function snapToEdge() {
  if (!win) return;
  const bounds = win.getBounds();
  const edge = nearestEdge(bounds);
  state.window.edge = edge;
  win.setBounds(alignedBounds(bounds, bounds, edge));
  win.webContents.send('edge', edge);
  saveSoon();
}

/* ---------- window ---------- */

function createWindow() {
  const stored = state.window;

  win = new BrowserWindow({
    width: DEFAULT_SIZE.width,
    height: DEFAULT_SIZE.height,
    x: Number.isInteger(stored.x) ? stored.x : undefined,
    y: Number.isInteger(stored.y) ? stored.y : undefined,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.setAlwaysOnTop(true, 'floating');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.loadFile(path.join(__dirname, '..', 'index.html'));

  win.once('ready-to-show', () => {
    win.show();
    win.webContents.send('edge', state.window.edge);
    if (SMOKE) setTimeout(runSmoke, 2500);
  });

  /* the OS moves the window (the title bar is an app-region), we tidy up after */
  win.on('moved', () => {
    clearTimeout(movedTimer);
    movedTimer = setTimeout(() => {
      if (!win) return;
      const bounds = win.getBounds();
      if (state.window.magnet) {
        snapToEdge();
      } else {
        freePos = { x: bounds.x, y: bounds.y };
        state.window.x = bounds.x;
        state.window.y = bounds.y;
        const edge = nearestEdge(bounds);
        state.window.edge = edge;
        win.webContents.send('edge', edge);
        saveSoon();
      }
    }, 80);
  });
}

/* ---------- smoke test ---------- */

function isFlush(b, wa, edge) {
  if (edge === 'left') return b.x === wa.x;
  if (edge === 'right') return b.x + b.width === wa.x + wa.width;
  if (edge === 'top') return b.y === wa.y;
  return b.y + b.height === wa.y + wa.height;
}

function runSmoke() {
  const bounds = win.getBounds();
  const wa = displayFor(bounds).workArea;
  const checks = {
    visible: win.isVisible(),
    alwaysOnTop: win.isAlwaysOnTop(),
    /* the renderer measured itself and the shell obeyed */
    widthFromRenderer: bounds.width === 320,
    heightFromRenderer: bounds.height > 150,
    flushToEdge: isFlush(bounds, wa, state.window.edge),
    insideWorkArea: bounds.y >= wa.y && bounds.y + bounds.height <= wa.y + wa.height,
    trayCreated: tray !== null,
  };

  const failed = Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name);
  console.log('SMOKE ' + JSON.stringify({ edge: state.window.edge, bounds, workArea: wa, checks }));
  console.log(failed.length ? `SMOKE FAILED: ${failed.join(', ')}` : 'SMOKE OK');

  app.isQuitting = true;
  app.exit(failed.length ? 1 : 0);
}

/* ---------- tray ---------- */

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'tray.png'));
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  tray.setToolTip('Edge Panel');

  const rebuild = () => {
    tray.setContextMenu(Menu.buildFromTemplate([
      {
        label: win && win.isVisible() ? 'Скрыть' : 'Показать',
        click: () => {
          if (!win) return;
          if (win.isVisible()) win.hide();
          else win.show();
          rebuild();
        },
      },
      {
        label: 'Запускать при входе в систему',
        type: 'checkbox',
        checked: app.getLoginItemSettings().openAtLogin,
        click: (item) => {
          app.setLoginItemSettings({ openAtLogin: item.checked, openAsHidden: true });
        },
      },
      { type: 'separator' },
      { label: 'Выход', click: () => { app.isQuitting = true; app.quit(); } },
    ]));
  };

  rebuild();
  tray.on('click', () => {
    if (!win) return;
    if (win.isVisible()) win.hide();
    else win.show();
    rebuild();
  });
}

/* ---------- ipc ---------- */

ipcMain.handle('state:load', async () => {
  const { phrases, notes, ui } = state;
  return { phrases, notes, ui, magnet: state.window.magnet, edge: state.window.edge };
});

ipcMain.on('state:save', (_e, patch) => {
  if (patch.phrases !== undefined) state.phrases = patch.phrases;
  if (patch.notes !== undefined) state.notes = patch.notes;
  if (patch.ui !== undefined) state.ui = patch.ui;
  saveSoon();
});

ipcMain.on('window:magnet', (_e, on) => {
  state.window.magnet = Boolean(on);
  if (on) snapToEdge();
  else freePos = win ? { x: win.getBounds().x, y: win.getBounds().y } : null;
  saveSoon();
});

/* The renderer measures itself and asks for room. `snap` means "put me against
   the edge" — used when folding, and always when the magnet is on. */
ipcMain.on('window:size', (_e, { width, height, snap, restore }) => {
  if (!win) return;
  const from = win.getBounds();
  const size = { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) };

  if (snap) {
    win.setBounds(alignedBounds(size, from, state.window.edge));
    return;
  }

  const target = restore && freePos ? { ...from, ...freePos } : from;
  const wa = displayFor(target).workArea;
  win.setBounds({
    width: size.width,
    height: size.height,
    x: clamp(target.x, wa.x, wa.x + wa.width - size.width),
    y: clamp(target.y, wa.y, wa.y + wa.height - size.height),
  });
});

ipcMain.handle('app:autostart', (_e, value) => {
  if (typeof value === 'boolean') {
    app.setLoginItemSettings({ openAtLogin: value, openAsHidden: true });
  }
  return app.getLoginItemSettings().openAtLogin;
});

ipcMain.on('app:quit', () => { app.isQuitting = true; app.quit(); });

/* ---------- lifecycle ---------- */

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) { win.show(); win.focus(); }
  });

  app.whenReady().then(async () => {
    await loadState();
    createWindow();
    try {
      createTray();
    } catch (err) {
      /* some Linux desktops ship without a tray daemon — the panel still works */
      console.error('tray unavailable:', err.message);
    }
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
