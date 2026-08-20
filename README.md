# Edge Panel

A small always-on desktop widget that sits at the edge of the screen: a random
phrase from your own list, plus quick notes.

**Download:** [Releases](https://github.com/KennyS44/edge-panel/releases) —
installers for Windows, macOS and Linux.
**Try it in a browser:** https://kennys44.github.io/edge-panel/

The browser version is the development scaffold and keeps working; the desktop
app is the point — it starts with the system, floats above other windows and
needs no browser at all.

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
- **A magnet switch** in the title bar. Turn it off and an open panel stays
  wherever you drop it; folding still pulls it to the nearest edge, because
  that is the only place a tab makes sense, and unfolding brings it back to
  the spot you chose.
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

On the desktop it also:

- **Starts with the system** and lives in the tray: show, hide, quit, and a
  switch for launching at login.
- **Floats above other windows** in a frameless, transparent window with no
  taskbar entry.
- **Respects the taskbar.** Snapping measures the display's work area, so the
  panel sits beside the taskbar, not under it.
- **Handles several monitors.** The edge is computed on whichever display the
  window is currently on, so dragging it to the next screen sticks it there.
- **Keeps notes in a file** in `userData`, not in browser storage.

## Look

The menus of Cyberpunk 2077: near-black, soft acid yellow, chamfered corners, a
technical mono for labels and a plain sans for anything you actually read.
Faint scanlines over the panel. One style across every screen — a widget this
small cannot carry two.

## Stack

The panel itself is plain HTML, CSS and JavaScript — `index.html`,
`styles.css`, `app.js`, no framework and no build step. The same three files
run in a browser and inside the desktop shell; the shell is detected at
runtime, and without it everything falls back to `localStorage` and CSS
positioning.

Around them, `desktop/` holds a thin Electron shell:

| File | Job |
|---|---|
| `desktop/main.js` | the window: where it sits, which display owns it, the tray, the state file |
| `desktop/preload.js` | the only bridge to the page — seven calls, nothing else from Node |

The split is deliberate. The page never learns it is inside Electron beyond
one feature check, and the shell never touches the interface: it is told how
much room the panel needs and answers with a window that size.

## Building

The installers are built by CI, not by hand — see
`.github/workflows/desktop.yml`. Every push boots the real app on a virtual
screen and lets it verify its own geometry; pushing a `v*` tag builds the
Windows, macOS and Linux installers and attaches them to a Release.

## Roadmap

1. **Pictures inside notes** — paste or drop an image into a note, stored as a
   file next to the notes rather than base64 in a text field.
2. Keyboard shortcut to summon the panel without the mouse.
3. Signed builds, so the installers stop warning about an unknown publisher.

## Deliberately out of scope

- **A mobile version.** This lives on a computer.
- **Sync between devices** — it needs a server, and the value on a single
  device is already there.
- **Rich text in notes.** Plain text, like the Notes app on a phone.
