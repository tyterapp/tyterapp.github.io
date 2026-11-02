import { test } from 'node:test';
import assert from 'node:assert/strict';
import { historySnapshotChanged } from '../src/history-change-detection.js';

test('unchanged large document fields are never serialized to detect history changes', () => {
  const content = { type: 'doc', toJSON() { throw new Error('serialized content'); } };
  const image = { toJSON() { throw new Error('serialized images'); } };
  const before = { content, sceneShots: image, notes: null, metadata: { fontSize: 12, documentZoom: 100 } };
  assert.equal(historySnapshotChanged(before, { ...before, metadata: { fontSize: 12, documentZoom: 150 } }), false);
  assert.equal(historySnapshotChanged(before, { ...before, content: { type: 'doc' } }), true);
  assert.equal(historySnapshotChanged(before, { ...before, sceneShots: {} }, 'storyboard'), true);
});
test('notes and outline changes do not produce screenplay revisions; font and text do', () => {
  const before = { content: {}, notes: null, outline: {}, metadata: { fontSize: 12 } };
  assert.equal(historySnapshotChanged(before, { ...before, notes: { text: 'note' }, outline: { columns: [] } }), false);
  assert.equal(historySnapshotChanged(before, { ...before, metadata: { fontSize: 14 } }), true);
  assert.equal(historySnapshotChanged(before, { ...before, content: { type: 'doc' } }, 'storyboard'), true);
});
test('fresh empty fallback containers do not invent changes', () => {
  assert.equal(historySnapshotChanged({ components: [], settings: {} }, { components: [], settings: {} }), false);
});
