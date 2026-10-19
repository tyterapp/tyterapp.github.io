// Use rendered sheet positions so navigation also respects document zoom and
// the variable heights of logical screenplay pages in the mobile layout.
export function scrollDocumentPages(scroller, step) {
  if (!scroller || !step) return false;
  const paper = scroller.querySelector(
    ".script-paper:not(.notes-paper):not(.history-preview-paper)",
  );
  const pages = paper?.querySelectorAll(".revision-page-background");
  if (!pages?.length) return false;
  const sticky = scroller.querySelector(".mobile-page-version-bar");
  const top = scroller.scrollTop;
  const origin =
    scroller.getBoundingClientRect().top +
    scroller.clientTop +
    (sticky?.getBoundingClientRect().height || 0);
  const positions = Array.from(
    pages,
    (page) => page.getBoundingClientRect().top - origin + top,
  );
  let current = 0;
  for (let index = 1; index < positions.length; index++) {
    if (positions[index] > top + 1) break;
    current = index;
  }
  const target = Math.max(0, Math.min(positions.length - 1, current + step));
  scroller.scrollTo({
    top:
      target === current
        ? step > 0
          ? scroller.scrollHeight
          : 0
        : target === 0
          ? 0
          : positions[target],
    behavior: "instant",
  });
  return true;
}
