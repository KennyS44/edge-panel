# Edge Panel

A small always-on desktop widget that sits at the edge of the screen: a random
phrase from your own list, plus quick notes.

**Live demo:** https://kennys44.github.io/edge-panel/

The demo runs in the browser and is only a scaffold for development. The point
of the project is a desktop app that starts with the system, so no browser
window is needed.

## Why

I want one small surface always within reach — something to keep a thought in
front of me and to write down a note without opening anything. Existing note
apps are either too heavy or live behind a click I keep not making.

I am the first user. The test is simple: a week after it runs, do I open it
without reminding myself to?

## Features

- **Draggable panel.** Move it by the title bar; the position is remembered.
- **Collapse to the edge.** Hides into a thin tab, one click to bring it back.
- **Random phrase** on start, a button for the next one, and a slow auto-change
  every 15 minutes.
- **Editable phrase list** right inside the panel — one line per phrase, with a
  reset to the defaults.
- **Notes**, collapsed by default: a list of titles with dates, click to open,
  edit with autosave, delete. Empty notes are dropped instead of saved.
- Everything is kept in `localStorage` and survives a reload.

## Stack

Plain HTML, CSS and JavaScript. No build step, no dependencies — `index.html`,
`styles.css`, `app.js`.

## Roadmap — the desktop app

1. Wrap in Electron: frameless window, always on top, transparent background.
2. Dock to the monitor edge, dragging handled by the window itself.
3. Start with the system via `app.setLoginItemSettings({ openAtLogin: true })`.
4. Tray icon: show, hide, quit.
5. Move storage from `localStorage` to a file in `userData`, so notes do not
   depend on the browser cache.
6. Build an installer.

## Deliberately out of scope

- **A mobile version.** This lives on a computer.
- **Sync between devices** — it needs a server, and the value on a single
  device is already there.
- **Rich text in notes.** Plain text, like the Notes app on a phone.
