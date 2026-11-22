# MidiStudio

A browser-based MIDI editor with piano-roll editing, a synchronized notation view, playback, and export.

## Features
- Import standard MIDI files (.mid / .midi)
- Add, select, move, resize, and delete notes in the piano roll
- Add notes in the sheet-music view; edits synchronize immediately
- Edit note pitch, start position, and duration
- Multiple tracks and tempo control
- Playback, undo/redo, zoom, and timeline extension
- Export edited MIDI files
- Print notation or choose **Save as PDF**
- Save project data as JSON; double-click the project name to reopen a project
- Files are processed locally in the browser

## Run locally
```bash
python -m http.server 8000
```
Open http://localhost:8000.

The app uses Tone.js and @tonejs/midi via browser modules from esm.sh. No backend or build step is required.

## GitHub Pages
The GitHub Actions workflow deploys the repository root. Set **Settings → Pages → Build and deployment → Source** to **GitHub Actions**.

## Notation limitations
The current notation view is an editable starter renderer, not a full engraving engine. Automatic key signatures, beaming, tuplets, voice separation, advanced rhythm layout, and clef assignment are not implemented yet.

## License
MIT
