# Dilda Mode implementation plan

> **For agentic workers:** Use superpowers:executing-plans inline. Do not modify the main editor. Review the completed isolated edition once before freezing it.

**Goal:** Deliver a one-time isolated editor at `/dildamode/`, with a 100-coin shop unlock and a playful first-person mode.

**Architecture:** Copy the current editor sources into `frozen/dildamode/src`. Give this snapshot its own bootstrap, storage namespace, IndexedDB names and public assets. Compile it once to `public/dildamode`; normal builds copy these bytes without compiling the snapshot. Freeze both source and output with SHA-256 manifests and local AGENTS instructions.

**Tech stack:** Existing React, Tiptap, Vite and wallet transaction flow. Small native WebGL renderer for voxel geometry and a low-poly tomato; local synthesized vowel WAV. No new dependencies.

**Spec:** User messages of 2026-10-27 in this conversation.

## Constraints and implementation decisions

- Main Free/PRO editor functionality and shop remain unchanged.
- Shop entry `Dilda Mode` belongs to Miscellaneous, uses the attached PNG and costs 100 coins once. Uses the isolated edition's own earned coins; no transfer or writes to the main wallet.
- After purchase the same tile opens the mode. The tomato is included; two item buttons switch the held model.
- Fullscreen native dialog contains the current screenplay, first-person model, aiming reticle, hit counter and close action. A hit occurs only on document paper. Effects never modify screenplay JSON.
- Each shot plays a locally synthesized “УУУУ” sound, animates a projectile and recoil. Tomato hits leave red splats attached to paper across scrolling. Close or Escape restores editor focus; audio and rendering stop.
- Frozen edition has no service worker or dependency on current `/assets` or root public files. Local file access uses its own browser library. Explicit import/export remains available.
- URL metadata uses the requested `https://tyter.github.io/dildamode/`. Publishing to that GitHub account/domain needs the user's deployment context; this task prepares the route and local publication package.
- No root Git checkout exists. Back up changed integration files; do not touch `publication/github-pages-repo`.

## Review focus

Overspending/repeated purchase; leakage to main storage/files; exit and sound/render cleanup; hit position while scrolling; all resource paths staying within frozen edition; future builds not overwriting or recompiling frozen content.

## Tasks

- [x] Add behavior tests; observe missing route fail.
- [x] Snapshot and namespace the editor; add wallet product and shop callback inside the copy only.
- [x] Implement native-dialog game, voxel/tomato models, shots, sound, hits and exit.
- [x] Run focused browser tests and review actual screenshots. Obtain a fresh read-only review and fix material findings.
- [x] Freeze sources/output, add integrity check and future-work instructions. Include frozen source in publication archive.
- [x] Run all three builds, production route/regression checks, archive and verify local publication copies.

## Progress

Initial: request supplies design and interactions; implementation proceeds within existing authorization. A source snapshot is used because sharing live components would violate the requested isolation.

Initial implementation: missing route RED → five behavior checks GREEN. Counter-cap regression RED (300 instead of 305) → separate total counter GREEN. Final reviewer found background undo/settings shortcuts; both RED → modal/native-default guards GREEN. Seven final new-route checks pass. Fourteen data checks pass. Frozen 417 files; all three builds and 21 production browser checks pass. All 166 frozen output files match each build; all 242 main source files are unchanged. No deferred findings.

Completion: source archive/local copies updated after QA report. No remote publication, no changes to publication/github-pages-repo, and no changes to frozen bytes after FROZEN.json was created.
