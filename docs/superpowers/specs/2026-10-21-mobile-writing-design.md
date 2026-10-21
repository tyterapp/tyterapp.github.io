# Tyter mobile writing

The user authorized a separate mobile presentation, preserving desktop behavior and the existing document model. Target: Android/Chrome, 320–831 CSS px, browser/PWA. Use Superpowers and the local Appllama reference. Mobbin MCP was queried for mobile document editing with a keyboard on 2026-10-21; it returned a paid-plan restriction, so no Mobbin screens were available or used.

## Interaction

- Header: document identity and tools menu. Components retain their icon inside the menu in both screenplay and storyboard.
- The page chooser is removed on mobile. A pinned strip above the scroll area shows the number and revision color of the page at the top of the viewport. Tapping the revision opens the existing accessible color menu. Scrolling to the next page updates the strip without moving the caret.
- Page fills and separators span the viewport. Mobile-only CSS uses existing revision colors and light/dark tokens.
- Formatting appears after actual user input, including paste/composition, and remains usable without dismissing the keyboard. Reading, autofocus and selection alone do not show it. Fullscreen still hides formatting.
- A revision change gives its geometric icon a short gentle bounce. Respect reduced motion; no animation on initial load or page scroll.

## Performance and data safety

The baseline uses 360 paragraphs, mobile 390×844, headless Edge with 4× CPU throttling. It is emulation, not a physical Android measurement. Baseline: 30 full canonical DOM copies for 33 characters, p95 input-to-frame 67.5 ms, p95 document dispatch 10.1 ms, 29 long tasks.

Root cause: mapped page ranges emit `pageVersionLayout`, bypassing the mobile hook's 160 ms typing debounce and rebuilding the entire offscreen document. Repaint mapped boundaries immediately; refresh canonical geometry after a typing pause. Keep document updates, persistence, history, composition, resize and font handling intact. Changes to actual forced page breaks must still trigger measurement.

Tests use synthetic documents and intercept all `/__tyter_local/` requests before navigation. No user documents or publication Git checkout are touched. Desktop pagination and export geometry stay unchanged.

## Verification

Regression-first pagination test; mobile header/menu/formatting/page controls/colors/scroll/motion/keyboard/paste/undo/persistence; desktop controls and resize behavior; same-profile before/after measurement. Check both themes, narrow screens, and PRO access where relevant. Finish with build, static-site browser checks, and source archive. Physical Android/PWA testing is unavailable and must be reported honestly.
