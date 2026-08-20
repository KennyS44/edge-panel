'use strict';

/* Edge Panel — Electron shell.
   The window IS the panel: frameless, transparent, always on top. The renderer
   owns what the panel looks like and how big it wants to be; this file owns
   where the window sits, which display it belongs to, and the tray. */

const { app, BrowserWindow, Tray, Menu, ipcMain, screen, nativeImage } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');

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

function writeState() {
  try {
    fsSync.mkdirSync(path.dirname(statePath()), { recursive: true });
    fsSync.writeFileSync(statePath(), JSON.stringify(state, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('state save failed:', err.message);
    return false;
  }
}

function saveSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(writeState, 300);
}

/* Quitting must not eat the last note: the debounced write above may still be
   pending, so flush it synchronously on the way out. */
function flushState() {
  clearTimeout(saveTimer);
  return writeState();
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

/* Puts a box of this size flush against `edge`.
   `centre` keeps it on the same middle line — right for folding, where the tab
   should appear where the panel was. Without it the leading corner stays put,
   so a phrase growing by a line does not shove the whole panel around. */
function alignedBounds(size, from, edge, centre) {
  const wa = displayFor(from).workArea;
  const width = Math.round(size.width);
  const height = Math.round(size.height);

  let x = from.x;
  let y = from.y;

  if (edge === 'left' || edge === 'right') {
    x = edge === 'left' ? wa.x : wa.x + wa.width - width;
    if (centre) y = Math.round(from.y + from.height / 2 - height / 2);
  } else {
    y = edge === 'top' ? wa.y : wa.y + wa.height - height;
    if (centre) x = Math.round(from.x + from.width / 2 - width / 2);
  }

  return {
    width,
    height,
    x: clamp(x, wa.x, wa.x + wa.width - width),
    y: clamp(y, wa.y, wa.y + wa.height - height),
  };
}

/* Electron cannot tween setBounds on Windows, so we step it ourselves. The
   window has to shrink together with the fold, or a bare rectangle is left
   sitting on screen until it catches up. */
let animation = null;

function animateBounds(to, ms = 200) {
  if (!win) return;
  const from = win.getBounds();
  const started = Date.now();
  clearInterval(animation);

  animation = setInterval(() => {
    if (!win || win.isDestroyed()) { clearInterval(animation); animation = null; return; }
    const t = Math.min(1, (Date.now() - started) / ms);
    const e = 1 - Math.pow(1 - t, 3);   /* ease-out, matches the CSS curve */
    win.setBounds({
      x: Math.round(from.x + (to.x - from.x) * e),
      y: Math.round(from.y + (to.y - from.y) * e),
      width: Math.round(from.width + (to.width - from.width) * e),
      height: Math.round(from.height + (to.height - from.height) * e),
    });
    if (t === 1) { clearInterval(animation); animation = null; }
  }, 16);
}

function snapToEdge() {
  if (!win) return;
  const bounds = win.getBounds();
  const edge = nearestEdge(bounds);
  state.window.edge = edge;
  win.setBounds(alignedBounds(bounds, bounds, edge, false));
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
    /* Not a transparent window: on Windows the compositor blends one badly
       and the panel ends up washed out with the wallpaper showing through.
       The window is exactly the panel, so it can simply be opaque. */
    transparent: false,
    backgroundColor: '#0b0c0e',
    hasShadow: false,
    minWidth: 1,
    minHeight: 1,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
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

  /* The OS moves the window (the title bar is an app-region) and we tidy up
     after. Windows fires 'moved' all through a drag, so this waits for the
     movement to actually stop — snapping mid-drag fights the mouse. */
  win.on('moved', () => {
    clearTimeout(movedTimer);
    movedTimer = setTimeout(() => {
      if (!win || animation) return;
      const bounds = win.getBounds();
      /* folded always sticks: a tab floating in the middle of the screen is
         not a thing, whatever the magnet says */
      if (state.window.magnet || state.window.folded) {
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
    }, 250);
  });
}

/* ---------- smoke test ---------- */

function isFlush(b, wa, edge) {
  if (edge === 'left') return b.x === wa.x;
  if (edge === 'right') return b.x + b.width === wa.x + wa.width;
  if (edge === 'top') return b.y === wa.y;
  return b.y + b.height === wa.y + wa.height;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const click = (id) =>
  win.webContents.executeJavaScript(`document.getElementById('${id}').click()`);

async function runSmoke() {
  const checks = {};
  const note = (name, ok) => { checks[name] = ok; };

  const wa = displayFor(win.getBounds()).workArea;
  const opened = win.getBounds();

  note('visible', win.isVisible());
  note('alwaysOnTop', win.isAlwaysOnTop());
  note('widthFromRenderer', opened.width === 320);
  note('heightFromRenderer', opened.height > 150);
  note('flushToEdge', isFlush(opened, wa, state.window.edge));
  note('trayCreated', tray !== null);
  note('quitButtonPresent', await win.webContents.executeJavaScript(
    "getComputedStyle(document.getElementById('quitBtn')).display !== 'none'"));

  /* folding: the window must end up exactly the size of the tab, not a
     panel-sized rectangle painted yellow */
  const beforeFold = win.getBounds();
  await click('hideBtn');
  await wait(700);
  const folded = win.getBounds();
  /* the OS may refuse to go this small; what matters is that it is far below
     the panel and the tab covers it */
  note('foldedToTabSize', folded.width <= 40 && folded.height <= 130);
  note('foldedFlush', isFlush(folded, wa, state.window.edge));
  note('foldedCentred', Math.abs((folded.y + folded.height / 2) - (beforeFold.y + beforeFold.height / 2)) <= 2);

  await click('tab');
  await wait(700);
  const reopened = win.getBounds();
  note('unfoldedBack', reopened.width === 320 && reopened.height > 150);

  /* a phrase changing height must not drag the window around */
  const before = win.getBounds();
  for (let i = 0; i < 3; i++) { await click('nextBtn'); await wait(350); }
  const after = win.getBounds();
  note('staysPutOnPhraseChange', after.y === before.y && after.x === before.x);

  /* opening the notes has to make room for them */
  const shut = win.getBounds();
  await click('notesToggle');
  await wait(700);
  const open = win.getBounds();
  note('notesOpenGrowsWindow', open.height > shut.height + 40);

  /* a note survives quitting: the write must not still be pending */
  await win.webContents.executeJavaScript(
    "document.getElementById('newNoteBtn').click()");
  await wait(200);
  await win.webContents.executeJavaScript(
    "const t = document.getElementById('noteTitle');"
    + "t.value = 'выживает ли заметка';"
    + "t.dispatchEvent(new Event('input', { bubbles: true }));");
  await wait(700);
  flushState();
  const onDisk = JSON.parse(fsSync.readFileSync(statePath(), 'utf8'));
  note('noteReachedDisk',
    Array.isArray(onDisk.notes) && onDisk.notes.some((n) => n.title === 'выживает ли заметка'));

  await win.webContents.executeJavaScript(
    "document.getElementById('noteBackBtn').click()");
  await wait(300);

  /* with the magnet off nothing may pull it back to an edge */
  await click('magnetBtn');
  await wait(200);
  const size = win.getBounds();
  win.setBounds({ x: 400, y: 300, width: size.width, height: size.height });
  await wait(500);
  for (let i = 0; i < 2; i++) { await click('nextBtn'); await wait(350); }
  const free = win.getBounds();
  note('magnetOffStaysFree', free.x === 400 && free.y === 300);

  /* but folding still docks it, magnet or not */
  await click('hideBtn');
  await wait(700);
  const foldedFree = win.getBounds();
  note('foldedDocksWithMagnetOff', isFlush(foldedFree, wa, state.window.edge));
  note('tabFillsWindow', await win.webContents.executeJavaScript(
    "document.getElementById('tab').classList.contains('tab--fill')"));
  await click('tab');
  await wait(700);
  await click('magnetBtn');
  await wait(400);

  /* every view has its own height and the window has to follow */
  /* does the window equal bar + the view's unconstrained content? */
  const matchesWanted = async () => {
    const wanted = await win.webContents.executeJavaScript(`(() => {
      const v = document.querySelector('.view:not(.view--hidden)');
      const c = document.querySelector('.panel__content');
      const cap = c.style.maxHeight; c.style.maxHeight = 'none';
      const h = document.getElementById('bar').offsetHeight + v.scrollHeight;
      c.style.maxHeight = cap; return Math.ceil(h);
    })()`);
    return Math.abs(win.getBounds().height - wanted) <= 2;
  };

  const probe = () => win.webContents.executeJavaScript(`(() => {
    const v = document.querySelector('.view:not(.view--hidden)');
    return { view: v && v.id, scroll: v && v.scrollHeight, client: v && v.clientHeight,
             bar: document.getElementById('bar').offsetHeight,
             win: window.innerHeight };
  })()`);

  const onMain = win.getBounds().height;
  const mainProbe = await probe();
  await click('editPhrasesBtn');
  await wait(500);
  const phrasesProbe = await probe();
  const onPhrases = win.getBounds().height;
  await click('phrasesBackBtn');
  await wait(500);
  const backToMain = win.getBounds().height;
  note('phraseListResizesWindow', onPhrases > onMain + 40);
  note('windowMatchesWhatPanelWants', await matchesWanted());

  /* adding notes grows it, up to the screen, and then the list scrolls */
  const emptyList = win.getBounds().height;
  state.notes = Array.from({ length: 40 }, (_, i) => ({
    id: `bulk${i}`, title: `Заметка ${i + 1}`, body: 'т', updated: Date.now() - i * 1000,
  }));
  writeState();
  win.reload();                      /* the real path: file -> renderer -> size */
  await wait(2500);
  const fullList = win.getBounds();
  note('notesGrowWindow', fullList.height > emptyList);
  note('neverTallerThanScreen', fullList.height <= wa.height);
  note('listStillScrolls', await win.webContents.executeJavaScript(
    "const l = document.getElementById('noteList'); l.scrollHeight > l.clientHeight + 4"));
  note('viewStillScrollable', await win.webContents.executeJavaScript(
    "getComputedStyle(document.getElementById('viewMain')).overflowY === 'auto'"));

  const failed = Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name);
  console.log('SMOKE ' + JSON.stringify({
    edge: state.window.edge, workArea: wa,
    opened, beforeFold, folded, reopened, shut, open, free, foldedFree,
    heights: { onMain, onPhrases, backToMain, emptyList, fullList: fullList.height },
    mainProbe, phrasesProbe,
    checks,
  }));
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

ipcMain.on('window:folded', (_e, folded) => {
  state.window.folded = Boolean(folded);
});

ipcMain.on('window:magnet', (_e, on) => {
  state.window.magnet = Boolean(on);
  if (on) snapToEdge();
  else freePos = win ? { x: win.getBounds().x, y: win.getBounds().y } : null;
  saveSoon();
});

/* The renderer measures itself and asks for room.
   snap    — sit flush against the edge (always true while folded)
   centre  — keep the same middle line, used when folding and unfolding
   animate — tween there instead of jumping
   restore — a magnet-off panel returns to where it was left standing */
ipcMain.on('window:size', (_e, { width, height, snap, centre, animate, restore }) => {
  if (!win) return;
  const from = win.getBounds();
  const room = displayFor(from).workArea;
  /* never taller than the screen it is on — beyond that the panel scrolls */
  const size = {
    width: Math.max(1, Math.min(Math.round(width), room.width)),
    height: Math.max(1, Math.min(Math.round(height), room.height)),
  };

  if (SMOKE) console.log('SIZE ' + JSON.stringify({ width, height, snap, centre, animate, from }));

  let target;
  if (snap) {
    target = alignedBounds(size, from, state.window.edge, centre);
  } else {
    const base = restore && freePos ? { ...from, ...freePos } : from;
    const wa = displayFor(base).workArea;
    target = {
      ...size,
      x: clamp(base.x, wa.x, wa.x + wa.width - size.width),
      y: clamp(base.y, wa.y, wa.y + wa.height - size.height),
    };
  }

  if (animate) animateBounds(target);
  else { clearInterval(animation); animation = null; win.setBounds(target); }
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

  app.on('before-quit', flushState);

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
