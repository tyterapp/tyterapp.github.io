# SDD ledger — plan: docs/superpowers/plans/2026-10-23-focus-typewriter.md

Workspace D:/Tyter has no root Git repository. Ruling: use source backups under .cache/focus-typewriter-2026-10-23/before and this ledger instead of Git worktree/commit scripts. Do not touch publication/github-pages-repo. All browser checks intercept /__tyter_local/ before navigating and use synthetic projects.

Task 1: complete. Observed RED: missing src/typewriter-caret.js; browser activation failed because .typewriter-rig did not exist. Added 3 initial caret model checks and the initial activation scenario before implementation.

Task 2: complete. Copied provided SVG parts and Light_on.png; pure caret/geometry helpers, local check-only dictionary request, gesture-triggered WebAudio switch sound. Ruling: actual editor link mark is named link, not componentLink; fixed helper after observing the real schema and a failing mark regression. No new dependencies.

Task 3: complete. Desktop dark fullscreen gate; dedicated component, viewport geometry outside document zoom, fixed apparatus dimensions, width-only Tube, 4px paragraph spacing, canonical offscreen pagination. Mobile retains its existing button, DOM, spacing and handlers. Audio/worker/observers disposed on mode exit.

Task 4: complete. 10 feature browser scenarios passed in one run, including all formats, both blue indicator sources, local spelling/unavailable dictionary, 1s ease-in-out and audio trigger, drag/caret on both axes, content preservation, 100→200% dimensions, theme/fullscreen/viewport lifecycle, reduced motion, long-document canonical boundaries and print. Ruling: drag maps to existing text positions without inserting spaces; moving past the end of a line may keep the existing end position. Test now starts inside a line and verifies movement within its actual text.

Task 5: in progress. Fresh read-only reviewer found one P2: a silent content restore at the same numeric caret did not refresh spelling. Reproduced RED (red stayed on after qzzxx→Hello); switched spelling subscription to transaction with existing word/language deduplication; the dedicated regression then passed. No other actionable findings. Reviewed lamp-off/on screenshots and fixed-size zoom screenshot; audio gesture count is verified, sound quality was not physically assessed. Four caret model cases now include hard breaks/URLs.

Ruling: document-zoom's old mobile assertions expected a 580px sheet and responsive page counts. Existing mobile work intentionally uses a 390px full-bleed sheet with canonical desktop page boundaries. Both stale assertions were observed failing; updated only the test to expect full viewport width, unchanged canonical page count and pinned mobile page control. Production mobile code remains unchanged. First wide run: 46/47 UI passed and 32 models passed; later focused run passed all11 feature checks but exposed that second stale assertion. Final fresh full run is required.

Task 5: complete. Final model run:33 passed. Final broad UI run:48 passed. A final reference comparison showed the surrounding canvas did not dim with the paper; added two background assertions, observed RED, then applied scoped desktop background overrides. All14 affected feature/fullscreen-theme checks passed after that correction. No further production edits planned.

Task 6: in progress. Final app/site/GitHub Pages builds, generated-site browser verification and local source archive/copy verification. Generated-site suite excludes the existing local-session test that imports development /src modules; that scenario passed in the48-test development run.

All3 builds passed;69 generated asset copies match23 originals. First static run:35/37 passed; the2 failures came from the mobile test helper importing /src/browser-files.js, unavailable in production. Ruling: read the same persisted IndexedDB documents snapshot directly in the helper, retaining the actual persistence assertions. No application code changed. Verify those2 scenarios on development and rerun all37 static scenarios.

Both adjusted persistence scenarios passed on development. Final generated-site run:37/37 passed in1.1m. The excluded local-session scenario was green in the48-case development run. Final screenshots inspected, including the corrected full-canvas lamp fade and200% dimensions. Source archive/copy validation remains as the final step.

Task 6: complete. App, site and GitHub Pages builds succeeded;37 generated-site scenarios passed. Source archive contains599 files; both local publication source copies verified against every archive entry. Private files excluded. Publication Git checkout untouched, no remote publish. Archive refreshed once more to include this completed ledger and plan. No Git branch/worktree cleanup applies because the workspace is not a repository; retained reversible source backups.
