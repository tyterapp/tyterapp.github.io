const STORYBOARD_FIELDS = new Set(['content', 'pageVersions', 'sceneVariants', 'sceneShots', 'comments', 'storyboardVersion']);

function sameField(before, after) {
  if (Object.is(before, after)) return true;
  // snapshotOf supplies fresh empty defaults for legacy documents.
  return before && after && typeof before === 'object' && typeof after === 'object' &&
    Array.isArray(before) === Array.isArray(after) && !Object.keys(before).length && !Object.keys(after).length;
}

// Documents are updated immutably. Reference comparisons avoid serializing all
// artwork/base64 assets on each keystroke; viewing zoom is not a document edit.
export function historySnapshotChanged(before, after, area = 'screenplay') {
  if (!before || !after) return before !== after;
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of keys) {
    if (area === 'storyboard' ? !STORYBOARD_FIELDS.has(key) : key === 'notes' || key === 'outline') continue;
    if (key === 'metadata') {
      const left = before.metadata || {}, right = after.metadata || {};
      for (const name of new Set([...Object.keys(left), ...Object.keys(right)]))
        if (name !== 'documentZoom' && !sameField(left[name], right[name])) return true;
    } else if (!sameField(before[key], after[key])) return true;
  }
  return false;
}
