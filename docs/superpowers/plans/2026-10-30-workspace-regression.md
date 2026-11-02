# Workspace regression and responsiveness plan

> Use Superpowers systematic debugging, test-driven development and verification before completion. The user's detailed request authorizes implementation and parallel agents.

**Goal:** Fix comment visibility, storyboard navigation/search/playback, image pasting, component dragging and viewport reset; remove measured typing/storage bottlenecks and deliver a verified GitHub source archive.

**Architecture:** Retain React DOM, TipTap history, local IndexedDB/files and the existing GitHub Pages build. Share one predicate for playable visual frames; keep frame drawing separate from comment annotations. Search has explicit Screenplay / Storyboard scopes with visual frame results. Existing generation gains a local adapter contract without credentials or a new paid service.

**Constraints:** Never modify or regenerate either Dilda Mode tree. Never touch the user's publication Git checkout or push. Use disposable test documents and block local-file server access. Preserve existing document data and undo/redo; do not clear user caches or files to improve measurements.

## Tasks

- [x] Frame editor agent: reproduce hidden-comment and layer-only playback bugs; add image layers, clipboard routing, generation context and regression tests. Own Canvas, frame data, generation, player and exports.
- [x] Search agent: model unnamed scenes/all scene alternatives; add bounded thumbnail results and tests. Own new search modules and stylesheet.
- [x] Performance agent: measure long-document typing; correct component decoration/editor hot paths and concrete storage defects; implement safe component drop. Own ScreenplayEditor and storage internals.
- [x] Root: integrate search scope, frame state and visibility; keep scene sidebar structural; move drama chart launcher to screenplay; expose draggable component cards and Ctrl+0 reset.
- [x] Root: remove unconditional hidden-panel searches and full snapshot serializations on unrelated renders. Preserve history baselines and save ordering.
- [x] Run model regression, focused browser suites, storage/reload/history, desktop/mobile smoke and bounded CPU/memory stress. Record measurements and remaining limits without broad retry loops.
- [x] Verify frozen manifest, build GitHub Pages and root production build; regenerate source ZIP and compare archive hashes with staging folders.

## Outcome (2026-11-02)

See `docs/reports/2026-11-02-workspace-regression.md` for 117 model checks, 65 selected browser scenarios including isolated confirmations, production CPU/memory measurements and remaining device/performance limits. A read-only reviewer identified two additional layer-content inconsistencies; both were reproduced and corrected. Frozen integrity remains 417 original files.

## Review focus

Empty or unnamed scenes, hidden or image-only drawing layers, inactive scene alternatives, dirty drafts during navigation, undo/redo after drag/paste, late persistence writes, failed storage permission, long documents with many component aliases, and browser zoom shortcuts while inputs are focused.
