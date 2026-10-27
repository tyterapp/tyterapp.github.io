export const TYPEWRITER_LAYOUT_EVENT = "tyter:typewriter-layout";

// The rig lives outside document zoom; portal menus need its viewport bounds.
// No active desktop rig means the editor keeps its ordinary popup positioning.
export function typewriterPopupPosition(editor, width) {
  const root = editor.view.dom.closest('.minimal-app[data-typewriter="true"]');
  const body = root?.querySelector(".typewriter-body");
  if (!body || window.innerWidth < 832) return null;
  const rect = body.getBoundingClientRect();
  const top = rect.bottom + 6;
  return {
    left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
    top,
    maxHeight: Math.max(0, window.innerHeight - top - 12),
  };
}
