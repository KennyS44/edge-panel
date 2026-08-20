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
const CONFIRM_MS = 4000;

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
let ui = load(STORE.ui, { right: null, top: null, notesOpen: false, hidden: false });

if (!Array.isArray(phrases)) phrases = DEFAULT_PHRASES.slice();
if (!Array.isArray(notes)) notes = [];

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

  phrasesCount.textContent = String(phrases.length);
}

function trimPhrases() {
  phrases = phrases.map((p) => p.trim()).filter(Boolean);
  save(STORE.phrases, phrases);
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

  for (const note of sorted) {
    const li = document.createElement('li');
    const row = document.createElement('div');
    row.className = 'note-row';

    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'note-item';

    const title = document.createElement('span');
    title.className = 'note-item__title';
    title.textContent = note.title.trim() || 'Без названия';

    const date = document.createElement('span');
    date.className = 'note-item__date';
    date.textContent = formatDate(note.updated);

    open.append(title, date);
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
  }

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

/* Anchored by the right edge, so collapsing folds the panel into that edge. */
function placePanel(right, top) {
  const w = panel.offsetWidth;
  const h = panel.offsetHeight;
  const maxRight = Math.max(0, window.innerWidth - w);
  const maxTop = Math.max(0, window.innerHeight - h);
  ui.right = Math.min(Math.max(0, right), maxRight);
  ui.top = Math.min(Math.max(0, top), maxTop);
  panel.style.right = `${ui.right}px`;
  panel.style.top = `${ui.top}px`;
  panel.style.left = 'auto';
}

let drag = null;

bar.addEventListener('pointerdown', (e) => {
  if (e.target.closest('button')) return;
  const rect = panel.getBoundingClientRect();
  drag = { dx: rect.right - e.clientX, dy: e.clientY - rect.top };
  panel.classList.add('panel--dragging');
  bar.setPointerCapture(e.pointerId);
});

bar.addEventListener('pointermove', (e) => {
  if (!drag) return;
  placePanel(window.innerWidth - (e.clientX + drag.dx), e.clientY - drag.dy);
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
  if (ui.right !== null) placePanel(ui.right, ui.top);
  if (ui.hidden) placeTab();
});

/* ---------- fold / unfold ---------- */

function placeTab() {
  const rect = panel.getBoundingClientRect();
  tab.style.right = `${Math.max(0, window.innerWidth - rect.right)}px`;
  tab.style.top = `${rect.top + rect.height / 2}px`;
}

function setHidden(hidden) {
  ui.hidden = hidden;
  if (hidden) placeTab();
  panel.classList.toggle('panel--collapsed', hidden);
  tab.classList.toggle('is-visible', hidden);
  save(STORE.ui, ui);
}

/* ---------- wiring ---------- */

nextBtn.addEventListener('click', () => renderPhrase());
$('hideBtn').addEventListener('click', () => setHidden(true));
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

$('phrasesBackBtn').addEventListener('click', () => {
  trimPhrases();
  renderPhrase(false);
  showView('main');
});

$('addPhraseBtn').addEventListener('click', () => {
  phrases.push('');
  save(STORE.phrases, phrases);
  renderPhraseRows(phrases.length - 1);
});

$('phrasesResetBtn').addEventListener('click', () => {
  phrases = DEFAULT_PHRASES.slice();
  save(STORE.phrases, phrases);
  renderPhraseRows();
  renderPhrase(false);
});

document.addEventListener('click', (e) => {
  if (confirmingRow && !e.target.closest('.note-del')) clearConfirm();
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (confirmingRow) { clearConfirm(); return; }
  if (!views.note.classList.contains('view--hidden')) closeNote();
  else if (!views.phrases.classList.contains('view--hidden')) {
    trimPhrases();
    renderPhrase(false);
    showView('main');
  }
});

/* ---------- start ---------- */

renderNotes();
renderPhrase(false);
setNotesOpen(Boolean(ui.notesOpen));
if (ui.right !== null && ui.top !== null) placePanel(ui.right, ui.top);
setHidden(Boolean(ui.hidden));
setInterval(() => renderPhrase(), ROTATE_MS);
