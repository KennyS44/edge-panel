/* Edge Panel — phrases + notes. All state lives in localStorage. */

const STORE = {
  phrases: 'edge.phrases',
  notes: 'edge.notes',
  ui: 'edge.ui',
};

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
}

let phrases = load(STORE.phrases, DEFAULT_PHRASES);
let notes = load(STORE.notes, []);
let ui = load(STORE.ui, { x: null, y: null, notesOpen: false, hidden: false });

if (!Array.isArray(phrases) || phrases.length === 0) phrases = DEFAULT_PHRASES.slice();
if (!Array.isArray(notes)) notes = [];

/* ---------- elements ---------- */

const $ = (id) => document.getElementById(id);

const panel = $('panel');
const bar = $('bar');
const tab = $('tab');
const views = { main: $('viewMain'), note: $('viewNote'), phrases: $('viewPhrases') };
const phraseText = $('phraseText');
const notesToggle = $('notesToggle');
const notesBody = $('notesBody');
const noteList = $('noteList');
const notesEmpty = $('notesEmpty');
const notesCount = $('notesCount');
const noteTitle = $('noteTitle');
const noteBody = $('noteBody');
const phrasesArea = $('phrasesArea');

let openNoteId = null;
let lastPhrase = '';

/* ---------- views ---------- */

function showView(name) {
  for (const [key, el] of Object.entries(views)) {
    el.classList.toggle('view--hidden', key !== name);
  }
}

/* ---------- phrases ---------- */

function pickPhrase() {
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
  if (!animate) {
    phraseText.textContent = next;
    return;
  }
  phraseText.classList.add('is-fading');
  setTimeout(() => {
    phraseText.textContent = next;
    phraseText.classList.remove('is-fading');
  }, 200);
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

function renderNotes() {
  noteList.textContent = '';
  const sorted = [...notes].sort((a, b) => b.updated - a.updated);

  for (const note of sorted) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'note-item';

    const title = document.createElement('span');
    title.className = 'note-item__title';
    title.textContent = note.title.trim() || 'Без названия';

    const date = document.createElement('span');
    date.className = 'note-item__date';
    date.textContent = formatDate(note.updated);

    btn.append(title, date);
    btn.addEventListener('click', () => openNote(note.id));
    li.append(btn);
    noteList.append(li);
  }

  notesCount.textContent = String(notes.length);
  notesEmpty.hidden = notes.length > 0;
}

function setNotesOpen(open) {
  ui.notesOpen = open;
  notesBody.classList.toggle('is-open', open);
  notesToggle.setAttribute('aria-expanded', String(open));
  save(STORE.ui, ui);
}

function openNote(id) {
  const note = notes.find((n) => n.id === id);
  if (!note) return;
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

function deleteOpenNote() {
  clearTimeout(saveTimer);
  notes = notes.filter((n) => n.id !== openNoteId);
  save(STORE.notes, notes);
  openNoteId = null;
  renderNotes();
  showView('main');
}

/* ---------- drag ---------- */

function clampPosition(x, y) {
  const maxX = Math.max(0, window.innerWidth - panel.offsetWidth);
  const maxY = Math.max(0, window.innerHeight - panel.offsetHeight);
  return [Math.min(Math.max(0, x), maxX), Math.min(Math.max(0, y), maxY)];
}

function placePanel(x, y) {
  const [cx, cy] = clampPosition(x, y);
  ui.x = cx;
  ui.y = cy;
  panel.style.left = `${cx}px`;
  panel.style.top = `${cy}px`;
  panel.style.right = 'auto';
}

let drag = null;

bar.addEventListener('pointerdown', (e) => {
  if (e.target.closest('button')) return;
  const rect = panel.getBoundingClientRect();
  drag = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
  panel.classList.add('panel--dragging');
  bar.setPointerCapture(e.pointerId);
});

bar.addEventListener('pointermove', (e) => {
  if (!drag) return;
  placePanel(e.clientX - drag.dx, e.clientY - drag.dy);
});

function endDrag(e) {
  if (!drag) return;
  drag = null;
  panel.classList.remove('panel--dragging');
  if (bar.hasPointerCapture(e.pointerId)) bar.releasePointerCapture(e.pointerId);
  save(STORE.ui, ui);
}

bar.addEventListener('pointerup', endDrag);
bar.addEventListener('pointercancel', endDrag);

window.addEventListener('resize', () => {
  if (ui.x !== null) placePanel(ui.x, ui.y);
});

/* ---------- hide / restore ---------- */

function setHidden(hidden) {
  ui.hidden = hidden;
  panel.classList.toggle('panel--hidden', hidden);
  tab.classList.toggle('is-visible', hidden);
  save(STORE.ui, ui);
}

/* ---------- wiring ---------- */

$('nextBtn').addEventListener('click', () => renderPhrase());
$('hideBtn').addEventListener('click', () => setHidden(true));
tab.addEventListener('click', () => setHidden(false));

notesToggle.addEventListener('click', () => setNotesOpen(!ui.notesOpen));
$('newNoteBtn').addEventListener('click', createNote);
$('noteBackBtn').addEventListener('click', closeNote);
$('noteDeleteBtn').addEventListener('click', deleteOpenNote);
noteTitle.addEventListener('input', touchOpenNote);
noteBody.addEventListener('input', touchOpenNote);

$('editPhrasesBtn').addEventListener('click', () => {
  phrasesArea.value = phrases.join('\n');
  showView('phrases');
});

$('phrasesBackBtn').addEventListener('click', () => showView('main'));

$('phrasesSaveBtn').addEventListener('click', () => {
  const lines = phrasesArea.value.split('\n').map((s) => s.trim()).filter(Boolean);
  phrases = lines.length ? lines : DEFAULT_PHRASES.slice();
  save(STORE.phrases, phrases);
  renderPhrase(false);
  showView('main');
});

$('phrasesResetBtn').addEventListener('click', () => {
  phrasesArea.value = DEFAULT_PHRASES.join('\n');
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!views.note.classList.contains('view--hidden')) closeNote();
  else if (!views.phrases.classList.contains('view--hidden')) showView('main');
});

/* ---------- start ---------- */

if (ui.x !== null && ui.y !== null) placePanel(ui.x, ui.y);
setNotesOpen(Boolean(ui.notesOpen));
setHidden(Boolean(ui.hidden));
renderNotes();
renderPhrase(false);
setInterval(() => renderPhrase(), ROTATE_MS);
