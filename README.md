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
- **Snaps to the nearest screen edge** when you let go of it — left, right, top
  or bottom.
- **Folds into that edge**, leaving nothing but a small tab; one click brings it
  back. The fold runs sideways or up and down, whichever the edge calls for.
- **Random phrase** on start, a button for the next one, and a slow auto-change
  every 15 minutes.
- **Editable phrase list**: one block per phrase, each growing to fit its text,
  each with its own delete button. Changes save as you type.
- **Notes**, collapsed by default: a list of titles with dates, click to open,
  edit with autosave. Delete either from the list — one confirming tap — or from
  inside the note. Empty notes are dropped instead of saved.
- **Fixed footprint.** The note list, the note text and the phrase list scroll
  inside the panel, so it does not grow with the amount of content.
- Everything is kept in `localStorage` and survives a reload.

## Stack

Plain HTML, CSS and JavaScript. No build step, no dependencies — `index.html`,
`styles.css`, `app.js`.

## Roadmap — the desktop app

1. Wrap in Electron: frameless window, always on top, transparent background.
2. Snap to the real monitor edges, dragging handled by the window itself.
   Use the work area rather than the raw screen size, so the panel sits on top
   of the taskbar instead of underneath it.
3. **Several monitors.** Snapping follows the display under the cursor
   (`screen.getDisplayNearestPoint`), so one drag moves the panel to the next
   screen and it sticks to that screen's edge.
4. Start with the system via `app.setLoginItemSettings({ openAtLogin: true })`.
5. Tray icon: show, hide, quit.
6. Move storage from `localStorage` to a file in `userData`, so notes do not
   depend on the browser cache.
7. Build an installer.

## Deliberately out of scope

- **A mobile version.** This lives on a computer.
- **Sync between devices** — it needs a server, and the value on a single
  device is already there.
- **Rich text in notes.** Plain text, like the Notes app on a phone.
