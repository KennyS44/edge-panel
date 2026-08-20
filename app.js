/* Edge Panel — phrases + notes. All state lives in localStorage. */

const STORE = {
  phrases: 'edge.phrases',
  notes: 'edge.notes',
  ui: 'edge.ui',
};

/* The desktop build injects this bridge; in a browser it is simply absent and
   everything below falls back to localStorage and CSS positioning. */
const HOST = window.edge || null;
const DESKTOP = HOST !== null;

const SLICE = { [STORE.phrases]: 'phrases', [STORE.notes]: 'notes', [STORE.ui]: 'ui' };

/* Folded, the panel becomes a plain app icon parked past the top-left corner.
   The shell owns that geometry; here it is only the size of the button. */
const PANEL_WIDTH = 320;

const DEFAULT_PHRASES = [
  'Сделал руками дважды — на третий раз automate it.',
  'Маленькое и working целиком бьёт большое и наполовину.',
  'Ты первый user. Не пользуешься сам — не делай.',
  'Не жди готовности. Готовым не станешь.',
  'Скучное и частое — вот что автоматизируют. Не сложное и редкое.',
  'Прочитанное без написанного не считается.',
  'Час английского сегодня. Догнать рывком нельзя.',
  'Закрывать проект не стыдно. Стыдно тянуть мёртвый.',
  'Полезная вещь, которой неудобно пользоваться, не используется.',
  'Читай ошибку целиком, до переводчика.',
  'Один шаг сегодня стоит десяти в плане.',
  'Строй себя, а не витрину.',
];

const ROTATE_MS = 15 * 60 * 1000;
const CONFIRM_MS = 4000;
const SNAP_MS = 240;

/* ---------- storage ---------- */

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* приватный режим или переполнение — молча работаем без сохранения */
  }
  /* on the desktop the file in userData is the real store; localStorage above
     just keeps the two builds on one code path */
  if (DESKTOP) HOST.save({ [SLICE[key]]: value });
}

let phrases = load(STORE.phrases, DEFAULT_PHRASES);
let notes = load(STORE.notes, []);
let ui = load(STORE.ui, {});

if (!Array.isArray(phrases)) phrases = DEFAULT_PHRASES.slice();
if (!Array.isArray(notes)) notes = [];

const EDGES = ['left', 'right', 'top', 'bottom'];
if (!EDGES.includes(ui.edge)) ui.edge = 'right';
if (typeof ui.offset !== 'number') ui.offset = 24;
if (ui.magnet === undefined) ui.magnet = true;
if (!ui.free || typeof ui.free.left !== 'number') ui.free = null;
ui.notesOpen = Boolean(ui.notesOpen);
ui.hidden = Boolean(ui.hidden);

/* ---------- elements ---------- */

const $ = (id) => document.getElementById(id);

const panel = $('panel');
const bar = $('bar');
const tab = $('tab');
const views = { main: $('viewMain'), note: $('viewNote'), phrases: $('viewPhrases') };
const phraseText = $('phraseText');
const nextBtn = $('nextBtn');
const notesToggle = $('notesToggle');
const notesBody = $('notesBody');
const noteList = $('noteList');
const notesEmpty = $('notesEmpty');
const notesCount = $('notesCount');
const noteTitle = $('noteTitle');
const noteBody = $('noteBody');
const phraseRows = $('phraseRows');
const phrasesCount = $('phrasesCount');
const edgeSensor = $('edgeSensor');
const magnetBtn = $('magnetBtn');

let openNoteId = null;
let lastPhrase = '';

/* ---------- views ---------- */

function showView(name) {
  for (const [key, el] of Object.entries(views)) {
    el.classList.toggle('view--hidden', key !== name);
  }
  scheduleSize();   /* a different view is a different height */
}

/* ---------- phrases ---------- */

function pickPhrase() {
  if (phrases.length === 0) return '';
  if (phrases.length === 1) return phrases[0];
  let next = lastPhrase;
  while (next === lastPhrase) {
    next = phrases[Math.floor(Math.random() * phrases.length)];
  }
  return next;
}

function renderPhrase(animate = true) {
  const next = pickPhrase();
  lastPhrase = next;
  nextBtn.disabled = phrases.length < 2;
  const text = next || 'Список фраз пуст.';
  if (!animate) {
    phraseText.textContent = text;
    return;
  }
  phraseText.classList.add('is-fading');
  setTimeout(() => {
    phraseText.textContent = text;
    phraseText.classList.remove('is-fading');
  }, 200);
}

/* Grows a field to fit its text. Only works once the field is on screen —
   scrollHeight is 0 while the view is display:none. */
function autoGrow(el) {
  el.style.height = 'auto';
  if (el.scrollHeight) el.style.height = `${el.scrollHeight}px`;
}

/* Re-measure every field: adding rows can bring in a scrollbar, which narrows
   them and rewraps the text after the first measurement. */
function growAll() {
  const fields = phraseRows.querySelectorAll('.phrase-row__input');
  requestAnimationFrame(() => fields.forEach(autoGrow));
}

let phrasesSaveTimer = null;

function savePhrasesSoon() {
  clearTimeout(phrasesSaveTimer);
  phrasesSaveTimer = setTimeout(() => save(STORE.phrases, phrases), 400);
}

/* One block per phrase: a growing field plus its own delete button. */
function renderPhraseRows(focusIndex = -1) {
  phraseRows.textContent = '';

  phrases.forEach((text, i) => {
    const row = document.createElement('div');
    row.className = 'phrase-row';

    const field = document.createElement('textarea');
    field.className = 'phrase-row__input';
    field.rows = 1;
    field.value = text;
    field.placeholder = 'Текст фразы';
    field.addEventListener('input', () => {
      phrases[i] = field.value;
      autoGrow(field);
      savePhrasesSoon();
    });

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'icon-btn icon-btn--danger';
    del.title = 'Удалить фразу';
    del.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true">'
      + '<path d="M3 5h10M6.5 5V3.5h3V5M5 5l.6 8h4.8L11 5" fill="none" stroke="currentColor"'
      + ' stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    del.addEventListener('click', () => {
      phrases.splice(i, 1);
      save(STORE.phrases, phrases);
      renderPhraseRows();
      renderPhrase(false);
    });

    row.append(field, del);
    phraseRows.append(row);
    autoGrow(field);

    if (i === focusIndex) {
      field.focus();
      row.scrollIntoView({ block: 'nearest' });
    }
  });

  growAll();
  phrasesCount.textContent = String(phrases.length);
}

function leavePhrases() {
  phrases = phrases.map((p) => p.trim()).filter(Boolean);
  save(STORE.phrases, phrases);
  renderPhrase(false);
  showView('main');
}

/* ---------- notes ---------- */

function formatDate(ts) {
  const d = new Date(ts);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay
    ? d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

let confirmingRow = null;
let confirmTimer = null;

function clearConfirm() {
  clearTimeout(confirmTimer);
  if (confirmingRow) confirmingRow.classList.remove('is-confirming');
  confirmingRow = null;
}

function renderNotes() {
  clearConfirm();
  noteList.textContent = '';
  const sorted = [...notes].sort((a, b) => b.updated - a.updated);

  sorted.forEach((note, i) => {
    const li = document.createElement('li');
    const row = document.createElement('div');
    row.className = 'note-row';

    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'note-item';

    const idx = document.createElement('span');
    idx.className = 'note-item__idx';
    idx.textContent = String(i + 1).padStart(2, '0');

    const main = document.createElement('span');
    main.className = 'note-item__main';

    const title = document.createElement('span');
    title.className = 'note-item__title';
    title.textContent = note.title.trim() || 'Без названия';

    const date = document.createElement('span');
    date.className = 'note-item__date';
    date.textContent = formatDate(note.updated);

    main.append(title, date);
    open.append(idx, main);
    open.addEventListener('click', () => openNote(note.id));

    /* delete straight from the list, with one confirming tap */
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'icon-btn icon-btn--danger note-del';
    del.title = 'Удалить заметку';
    del.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true">'
      + '<path d="M3 5h10M6.5 5V3.5h3V5M5 5l.6 8h4.8L11 5" fill="none" stroke="currentColor"'
      + ' stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
      + '<span class="del-text">Удалить?</span>';

    del.addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirmingRow === row) {
        deleteNote(note.id);
        return;
      }
      clearConfirm();
      confirmingRow = row;
      row.classList.add('is-confirming');
      confirmTimer = setTimeout(clearConfirm, CONFIRM_MS);
    });

    row.append(open, del);
    li.append(row);
    noteList.append(li);
  });

  notesCount.textContent = String(notes.length);
  notesEmpty.hidden = notes.length > 0;
}

function setNotesOpen(open) {
  ui.notesOpen = open;
  notesBody.classList.toggle('is-open', open);
  notesToggle.setAttribute('aria-expanded', String(open));
  if (!open) clearConfirm();
  save(STORE.ui, ui);
}

function openNote(id) {
  const note = notes.find((n) => n.id === id);
  if (!note) return;
  clearConfirm();
  openNoteId = id;
  noteTitle.value = note.title;
  noteBody.value = note.body;
  showView('note');
  noteTitle.focus();
}

function createNote() {
  const note = { id: String(Date.now()), title: '', body: '', updated: Date.now() };
  notes.push(note);
  save(STORE.notes, notes);
  renderNotes();
  openNote(note.id);
}

function deleteNote(id) {
  clearConfirm();
  notes = notes.filter((n) => n.id !== id);
  save(STORE.notes, notes);
  renderNotes();
}

let saveTimer = null;

function touchOpenNote() {
  const note = notes.find((n) => n.id === openNoteId);
  if (!note) return;
  note.title = noteTitle.value;
  note.body = noteBody.value;
  note.updated = Date.now();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    save(STORE.notes, notes);
    renderNotes();
  }, 400);
}

function closeNote() {
  clearTimeout(saveTimer);
  const note = notes.find((n) => n.id === openNoteId);
  if (note && !note.title.trim() && !note.body.trim()) {
    notes = notes.filter((n) => n.id !== openNoteId);
  }
  save(STORE.notes, notes);
  openNoteId = null;
  renderNotes();
  showView('main');
}

/* ---------- position ---------- */

/* With the magnet on, the panel sticks to the nearest edge. With it off, an
   open panel stays wherever it was dropped — but folding still pulls it to
   the nearest edge, because that is the only place a tab makes sense. */

const isX = (edge) => edge === 'left' || edge === 'right';
const clamp = (v, min, max) => Math.min(Math.max(v, min), Math.max(min, max));

/* On the desktop the window itself is the position, so "free" only depends on
   the magnet — there is no stored CSS offset to wait for. */
const isFree = () => (DESKTOP ? !ui.magnet : !ui.magnet && ui.free !== null);

/* Switches to plain left/top positioning without moving the panel. */
function freezeToLeftTop() {
  const rect = panel.getBoundingClientRect();
  panel.style.right = 'auto';
  panel.style.bottom = 'auto';
  panel.style.left = `${rect.left}px`;
  panel.style.top = `${rect.top}px`;
  return rect;
}

function nearestEdge(rect) {
  const gap = {
    left: rect.left,
    right: window.innerWidth - rect.right,
    top: rect.top,
    bottom: window.innerHeight - rect.bottom,
  };
  return EDGES.reduce((a, b) => (gap[b] < gap[a] ? b : a));
}

/* Moves the panel flush against the closest edge; keeps left/top anchoring so
   the move animates. anchorPanel() takes over once it has arrived. */
function glideToEdge(rect) {
  const edge = nearestEdge(rect);
  const left = edge === 'left' ? 0
    : edge === 'right' ? window.innerWidth - rect.width : rect.left;
  const top = edge === 'top' ? 0
    : edge === 'bottom' ? window.innerHeight - rect.height : rect.top;
  panel.style.left = `${left}px`;
  panel.style.top = `${top}px`;
  ui.edge = edge;
  ui.offset = isX(edge) ? top : left;
  panel.dataset.edge = edge;
  panel.dataset.axis = isX(edge) ? 'x' : 'y';
  return edge;
}

function placeFree(left, top) {
  if (DESKTOP) { applyEdgeAttrs(); reportSize({ snap: false, restore: true }); return; }
  const w = panel.offsetWidth;
  const h = panel.offsetHeight;
  ui.free = {
    left: clamp(left, 0, window.innerWidth - w),
    top: clamp(top, 0, window.innerHeight - h),
  };
  panel.style.right = 'auto';
  panel.style.bottom = 'auto';
  panel.style.left = `${ui.free.left}px`;
  panel.style.top = `${ui.free.top}px`;
}

function applyPlacement() {
  panel.classList.toggle('panel--free', isFree() && !ui.hidden);
  if (isFree() && !ui.hidden) {
    /* keep the fold direction pointing at the edge it will collapse into */
    panel.dataset.edge = ui.edge;
    panel.dataset.axis = isX(ui.edge) ? 'x' : 'y';
    placeFree(ui.free.left, ui.free.top);
  } else {
    anchorPanel();
  }
}

/* Points the panel at its edge. On the desktop the window is exactly the size
   of the panel, so pinning to the window edge is all the positioning needed. */
function applyEdgeAttrs() {
  panel.dataset.edge = ui.edge;
  panel.dataset.axis = isX(ui.edge) ? 'x' : 'y';

  if (DESKTOP) {
    /* the panel simply is the window, so it fills it — that is also what lets
       the view scroll once the window hits the edge of the screen */
    panel.style.inset = '0px';
    return;
  }

  panel.style.inset = 'auto';
  panel.style[ui.edge] = '0px';
  panel.style[isX(ui.edge) ? 'top' : 'left'] = '0px';
}

/* How tall the panel wants to be: the title bar plus everything in the open
   view. Measured from the view's own content — never from the rendered height,
   which the window itself limits, so asking that would lock the size in place
   and the notes could never open. */
function desiredHeight() {
  const view = panel.querySelector('.view:not(.view--hidden)');
  if (!view) return bar.offsetHeight;

  /* The cap that keeps the panel inside the window is 100vh — and in a window
     sized to its own content, that is the current height. Measuring under it
     would only ever return the size we already have, so it comes off for the
     measurement and goes back on before anything is painted. */
  const content = panel.querySelector('.panel__content');
  const capped = content.style.maxHeight;
  measuring = true;                    /* our own style change is not news */
  content.style.maxHeight = 'none';
  const wanted = bar.offsetHeight + view.scrollHeight;
  content.style.maxHeight = capped;
  measuring = false;

  return Math.ceil(wanted);
}

/* Every change of content — a view opening, a note added, a phrase wrapping
   onto another line — reports a new size, collapsed into one frame. */
let sizeFrame = 0;
let measuring = false;
let lastSent = '';

function scheduleSize() {
  if (!DESKTOP || ui.hidden || measuring) return;
  cancelAnimationFrame(sizeFrame);
  sizeFrame = requestAnimationFrame(() => {
    /* re-checked here, not only when scheduling: a frame queued a moment
       before a fold would otherwise land afterwards and undo it */
    if (!ui.hidden) reportSize();
  });
}

/* Tells the shell how much room the panel needs right now. Folding is the only
   case that re-centres and animates; a phrase gaining a line must not move the
   window around. */
function reportSize({ snap = ui.magnet, restore = false, centre = false, animate = false } = {}) {
  if (!DESKTOP) return;
  if (ui.hidden) return;      /* folded: the shell owns the geometry */

  const height = desiredHeight();

  /* nothing new to say: repeating it would keep the window resizing itself
     for no reason */
  const said = `${height}:${snap}${restore}`;
  if (said === lastSent && !animate) return;
  lastSent = said;

  HOST.setSize(PANEL_WIDTH, height, { snap, restore, animate });
}

/* Anchors the panel to its edge, so folding collapses into that edge. */
function anchorPanel() {
  if (DESKTOP) { applyEdgeAttrs(); reportSize(); return; }
  const rect = panel.getBoundingClientRect();
  const limit = isX(ui.edge)
    ? window.innerHeight - rect.height
    : window.innerWidth - rect.width;
  ui.offset = clamp(ui.offset, 0, limit);

  panel.dataset.edge = ui.edge;
  panel.dataset.axis = isX(ui.edge) ? 'x' : 'y';
  panel.style.left = 'auto';
  panel.style.right = 'auto';
  panel.style.top = 'auto';
  panel.style.bottom = 'auto';
  panel.style[ui.edge] = '0px';
  if (isX(ui.edge)) panel.style.top = `${ui.offset}px`;
  else panel.style.left = `${ui.offset}px`;
}

let drag = null;
let snapTimer = null;

bar.addEventListener('pointerdown', (e) => {
  if (DESKTOP) return;   /* the OS drags the window by the title bar */
  if (e.target.closest('button')) return;
  clearTimeout(snapTimer);
  const rect = panel.getBoundingClientRect();
  /* switch to free left/top positioning for the duration of the drag */
  panel.style.right = 'auto';
  panel.style.bottom = 'auto';
  panel.style.left = `${rect.left}px`;
  panel.style.top = `${rect.top}px`;
  drag = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
  panel.classList.add('panel--dragging');
  bar.setPointerCapture(e.pointerId);
});

bar.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const w = panel.offsetWidth;
  const h = panel.offsetHeight;
  panel.style.left = `${clamp(e.clientX - drag.dx, 0, window.innerWidth - w)}px`;
  panel.style.top = `${clamp(e.clientY - drag.dy, 0, window.innerHeight - h)}px`;

  /* the fold arrow follows the closest edge while you move */
  const edge = nearestEdge(panel.getBoundingClientRect());
  panel.dataset.edge = edge;
  panel.dataset.axis = isX(edge) ? 'x' : 'y';
});

function endDrag(e) {
  if (!drag) return;
  drag = null;
  if (bar.hasPointerCapture(e.pointerId)) bar.releasePointerCapture(e.pointerId);
  panel.classList.remove('panel--dragging');

  const rect = panel.getBoundingClientRect();

  if (ui.magnet) {
    ui.free = null;
    panel.classList.remove('panel--free');
    glideToEdge(rect);
    snapTimer = setTimeout(anchorPanel, SNAP_MS);
  } else {
    ui.free = { left: rect.left, top: rect.top };
    ui.edge = nearestEdge(rect);
    panel.classList.add('panel--free');
  }

  save(STORE.ui, ui);
}

bar.addEventListener('pointerup', endDrag);
bar.addEventListener('pointercancel', endDrag);

window.addEventListener('resize', () => {
  if (drag) return;
  /* On the desktop a resize is the shell's own doing — the window is not
     resizable — so there is nothing to answer, only fields to re-measure. */
  if (DESKTOP) {
    if (!views.phrases.classList.contains('view--hidden')) growAll();
    return;
  }
  if (!ui.hidden) applyPlacement();
  if (!views.phrases.classList.contains('view--hidden')) growAll();
});

/* ---------- magnet ---------- */

function setMagnet(on) {
  ui.magnet = on;
  magnetBtn.classList.toggle('is-on', on);
  magnetBtn.setAttribute('aria-pressed', String(on));
  magnetBtn.title = on
    ? 'Магнит: панель липнет к краю'
    : 'Магнит выключен: панель стоит где угодно';

  if (DESKTOP) {
    HOST.setMagnet(on);   /* the shell snaps the real window */
    panel.classList.toggle('panel--free', !on && !ui.hidden);
    save(STORE.ui, ui);
    return;
  }

  if (on) {
    ui.free = null;
    panel.classList.remove('panel--free');
    if (!ui.hidden) {
      const rect = freezeToLeftTop();
      glideToEdge(rect);
      clearTimeout(snapTimer);
      snapTimer = setTimeout(anchorPanel, SNAP_MS);
    }
  } else if (!ui.hidden) {
    const rect = freezeToLeftTop();
    ui.free = { left: rect.left, top: rect.top };
    panel.classList.add('panel--free');
  }

  save(STORE.ui, ui);
}

/* ---------- fold / unfold ---------- */

let foldTimer = null;

/* Nothing to place any more: the icon always sits in the same corner. In the
   browser that corner is the viewport's, on the desktop it is the screen's and
   the shell parks the window there. */
function armSensor(on) {
  edgeSensor.classList.toggle('is-armed', on);
}

function collapseNow() {
  armSensor(true);
  panel.classList.add(DESKTOP ? 'panel--gone' : 'panel--collapsed');
  tab.classList.add('is-visible');
}

function expandNow() {
  armSensor(false);
  panel.classList.remove('panel--collapsed', 'panel--gone');
  tab.classList.remove('is-visible');
}

function setHidden(hidden) {
  ui.hidden = hidden;
  clearTimeout(foldTimer);
  clearTimeout(snapTimer);

  if (DESKTOP) {
    /* the window and the panel move together: no bare rectangle is ever left
       standing while one waits for the other */
    if (hidden) {
      /* fade the panel out first, then let the shell shrink the window to an
         icon and walk it off the corner */
      collapseNow();
      foldTimer = setTimeout(() => HOST.fold(true), 140);
    } else {
      /* the other way round: room first, contents second */
      clearTimeout(foldTimer);
      HOST.fold(false);
      foldTimer = setTimeout(expandNow, 180);
    }
    save(STORE.ui, ui);
    return;
  }

  if (hidden) {
    panel.classList.remove('panel--free');
    if (isFree()) {
      /* a free panel travels to the nearest edge first, then folds into it */
      const rect = freezeToLeftTop();
      glideToEdge(rect);
      foldTimer = setTimeout(() => { anchorPanel(); collapseNow(); }, SNAP_MS);
    } else {
      collapseNow();
    }
  } else if (isFree()) {
    /* unfold and travel back to where it was left, in one motion */
    freezeToLeftTop();
    void panel.offsetWidth;
    expandNow();
    panel.classList.add('panel--free');
    requestAnimationFrame(() => placeFree(ui.free.left, ui.free.top));
  } else {
    expandNow();
  }

  save(STORE.ui, ui);
}

/* ---------- wiring ---------- */

nextBtn.addEventListener('click', () => renderPhrase());
magnetBtn.addEventListener('click', () => setMagnet(!ui.magnet));
$('hideBtn').addEventListener('click', () => setHidden(true));
$('quitBtn').addEventListener('click', () => { if (DESKTOP) HOST.quit(); });
tab.addEventListener('click', () => setHidden(false));

notesToggle.addEventListener('click', () => setNotesOpen(!ui.notesOpen));
$('newNoteBtn').addEventListener('click', createNote);
$('noteBackBtn').addEventListener('click', closeNote);
$('noteDeleteBtn').addEventListener('click', () => {
  clearTimeout(saveTimer);
  const id = openNoteId;
  openNoteId = null;
  deleteNote(id);
  showView('main');
});
noteTitle.addEventListener('input', touchOpenNote);
noteBody.addEventListener('input', touchOpenNote);

$('editPhrasesBtn').addEventListener('click', () => {
  showView('phrases');   /* before rendering: hidden fields cannot measure themselves */
  renderPhraseRows();
});

$('phrasesBackBtn').addEventListener('click', leavePhrases);

$('addPhraseBtn').addEventListener('click', () => {
  phrases.push('');
  save(STORE.phrases, phrases);
  renderPhraseRows(phrases.length - 1);
});

document.addEventListener('click', (e) => {
  if (confirmingRow && !e.target.closest('.note-del')) clearConfirm();
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (confirmingRow) { clearConfirm(); return; }
  if (!views.note.classList.contains('view--hidden')) closeNote();
  else if (!views.phrases.classList.contains('view--hidden')) leavePhrases();
});

/* ---------- start ---------- */

async function start() {
  if (DESKTOP) {
    document.body.classList.add('is-desktop');
    try {
      const saved = await HOST.load();
      if (Array.isArray(saved.phrases) && saved.phrases.length) phrases = saved.phrases;
      if (Array.isArray(saved.notes)) notes = saved.notes;
      if (saved.ui && typeof saved.ui === 'object') ui = { ...ui, ...saved.ui };
      if (typeof saved.magnet === 'boolean') ui.magnet = saved.magnet;
      if (EDGES.includes(saved.edge)) ui.edge = saved.edge;
    } catch {
      /* first run, or the shell answered late — carry on with defaults */
    }
    /* the shell decides which edge the window ended up on */
    HOST.onEdge((edge) => {
      if (!EDGES.includes(edge) || edge === ui.edge) return;
      ui.edge = edge;
      panel.classList.add('panel--no-anim');
      applyEdgeAttrs();
      requestAnimationFrame(() => panel.classList.remove('panel--no-anim'));
    });
  }

  renderNotes();
  renderPhrase(false);
  setNotesOpen(ui.notesOpen);

  magnetBtn.classList.toggle('is-on', ui.magnet);
  magnetBtn.setAttribute('aria-pressed', String(ui.magnet));
  applyPlacement();
  if (ui.hidden) collapseNow();

  if (DESKTOP) {
    /* Two watchers, because they catch different things: the observer sees
       animated heights (the notes accordion), the mutations see content
       appearing (a note added, a field grown). */
    const content = panel.querySelector('.panel__content');
    const resize = new ResizeObserver(scheduleSize);
    resize.observe(content);
    for (const view of Object.values(views)) resize.observe(view);

    new MutationObserver(scheduleSize).observe(content, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'hidden'],
    });

    reportSize({ snap: ui.magnet });
  }

  setInterval(() => renderPhrase(), ROTATE_MS);
}

start();
