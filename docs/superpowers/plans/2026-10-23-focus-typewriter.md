# Desktop Typewriter Implementation Plan

> Execute inline with Superpowers executing-plans; request one fresh whole-change review at the end. Existing user authorization supersedes routine approval defaults.

**Goal:** Implement the supplied desktop fullscreen dark typewriter, with moving caret, lamp, live indicators and width-only tube zoom.
**Architecture:** A standalone FocusTypewriter component owns rig geometry, input subscriptions, spelling worker and lamp audio. MinimalApp gates state strictly to desktop fullscreen dark screenplay. A small caret helper is testable against ProseMirror; ScreenplayEditor gains a presentation-only layout flag.
**Tech stack:** Existing React DOM, ProseMirror, CSS, SVG, local dictionary worker and WebAudio; no new packages.
**Spec:** docs/superpowers/specs/2026-10-23-focus-typewriter-design.md

Root has no Git checkout; preserve source backups under .cache/focus-typewriter-2026-10-23/before. No worktree/commit is possible. Do not access secrets or publication/github-pages-repo.

- [x] Add failing caret model and browser activation regression; observe RED.
- [x] Copy supplied assets to public/typewriter; add caret/geometry helper, local check-only spelling and switch audio.
- [x] Build FocusTypewriter.jsx and scoped desktop stylesheet. Integrate mode, lamp button, format/status, cursor movement, continuous visual spacing and canonical measurement.
- [x] Test live format, spelling/link bulbs, lamp fade/audio, drag axes/caret, 100→200% tube-only width, lifecycle and content preservation. Update desktop toolbar expectations; verify mobile unchanged.
- [x] Fresh review, resolve concrete findings, run final relevant model/browser checks and inspect screenshots.
- [x] Run app/site/GitHub Pages builds, generated-site checks, source archive and publication-copy verification. Report checks and limitations.
