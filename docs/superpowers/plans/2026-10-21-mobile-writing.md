# Mobile writing implementation

Design: `docs/superpowers/specs/2026-10-21-mobile-writing-design.md`.
Execute inline under existing authorization. Root workspace has no Git repository; preserve backups in `.cache/mobile-writing-2026-10-21/before` and deliver the established source archive. Do not create a worktree or touch `publication/github-pages-repo`.

- [x] Add and run failing mobile pagination regression (`tests/mobile-writing.spec.js`).
- [x] Fix redundant measurement in `src/mobile-revision-pages.js`; retain idle measurement, forced breaks and IME guards.
- [x] Add `MobilePageControls.jsx`: scroll-aware sticky number/revision, existing accessible picker, no caret navigation.
- [x] Add input-session visibility hook; integrate mobile header/menu/toolbar in `MinimalApp.jsx`.
- [x] Apply full-bleed colors, separators, safe areas and reduced-motion bounce via scoped mobile styles/picker opt-in.
- [x] Verify mobile editing, color persistence/undo, menu access in both modes, composition/paste, desktop unchanged and breakpoint resize.
- [x] Rerun the same 4× CPU benchmark and record measured results.
- [x] Request one fresh whole-change review; resolve findings and rerun affected checks.
- [x] Run sequential app/site/GitHub-site builds, generated-site checks, source packaging and publication-folder sync. Report exact check counts and physical-device limitations.
