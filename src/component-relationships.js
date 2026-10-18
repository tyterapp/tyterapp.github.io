const MAX_RELATIONSHIPS = 10000;
const text = (value, limit) =>
  typeof value === "string" ? value.trim().slice(0, limit) : "";
const copy = (value) => (value == null ? null : structuredClone(value));
const time = (value) =>
  typeof value === "string" && Number.isFinite(Date.parse(value))
    ? new Date(value).toISOString()
    : "1970-01-01T00:00:00.000Z";
const makeId = () =>
  globalThis.crypto?.randomUUID?.() ||
  `relation-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

export function cleanComponentRelationships(value) {
  if (!Array.isArray(value)) return [];
  const used = new Set();
  return value.slice(0, MAX_RELATIONSHIPS).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const id = text(item.id, 200);
    const sourceComponentId = text(item.sourceComponentId, 200);
    const targetComponentId = text(item.targetComponentId, 200);
    if (!id || !sourceComponentId || !targetComponentId || used.has(id))
      return [];
    used.add(id);
    const sourceSceneId = text(item.sourceSceneId, 200);
    const librarySource =
      item.librarySource && typeof item.librarySource === "object"
        ? Object.fromEntries(
            [
              "libraryId",
              "relationshipId",
              "sourceComponentId",
              "targetComponentId",
            ].map((key) => [key, text(item.librarySource[key], 200)]),
          )
        : null;
    return [
      {
        id,
        sourceComponentId,
        targetComponentId,
        type: text(item.type, 200),
        label: text(item.label, 200),
        direction:
          item.direction === "bidirectional" ? "bidirectional" : "directed",
        state: text(item.state, 200),
        description: text(item.description, 5000),
        ...(sourceSceneId ? { sourceSceneId } : {}),
        ...(librarySource && Object.values(librarySource).every(Boolean)
          ? { librarySource }
          : {}),
        createdAt: time(item.createdAt),
        updatedAt: time(item.updatedAt || item.createdAt),
      },
    ];
  });
}

export const characterComponents = (document) =>
  (document.components || []).filter(
    (component) =>
      component.type === "character" && component.enabled !== false,
  );

export function relationshipsForComponent(document, componentId) {
  const components = new Map(
    (document.components || []).map((component) => [component.id, component]),
  );
  const owner = components.get(componentId);
  if (owner?.type !== "character" || owner.enabled === false) return [];
  return (document.relationships || []).flatMap((relationship) => {
    if (
      relationship.sourceComponentId !== componentId &&
      relationship.targetComponentId !== componentId
    )
      return [];
    const outgoing = relationship.sourceComponentId === componentId;
    const other = components.get(
      outgoing
        ? relationship.targetComponentId
        : relationship.sourceComponentId,
    );
    // A category change hides the relationship; it never changes stored data.
    if (other && (other.type !== "character" || other.enabled === false))
      return [];
    return [
      {
        relationship,
        other: other || null,
        unresolved: !other,
        orientation:
          relationship.direction === "bidirectional"
            ? "bidirectional"
            : outgoing
              ? "outgoing"
              : "incoming",
      },
    ];
  });
}

export function relationshipIdentity(relationship) {
  const pair = [relationship.sourceComponentId, relationship.targetComponentId];
  if (relationship.direction === "bidirectional") pair.sort();
  return JSON.stringify([
    relationship.direction,
    ...pair,
    text(relationship.type, 200).toLocaleLowerCase(),
  ]);
}

export function validateRelationshipDraft(document, draft, editingId = null) {
  if (!draft.sourceComponentId || !draft.targetComponentId) return "endpoint";
  if (draft.sourceComponentId === draft.targetComponentId) return "self";
  const active = new Set(characterComponents(document).map(({ id }) => id));
  if (
    !active.has(draft.sourceComponentId) ||
    !active.has(draft.targetComponentId)
  )
    return "endpoint";
  if (!text(draft.type, 200)) return "type";
  if (!["directed", "bidirectional"].includes(draft.direction))
    return "direction";
  if (!editingId && (document.relationships || []).length >= MAX_RELATIONSHIPS)
    return "limit";
  if (
    editingId &&
    !(document.relationships || []).some(({ id }) => id === editingId)
  )
    return "missing";
  if (
    (document.relationships || []).some(
      (item) =>
        item.id !== editingId &&
        relationshipIdentity(item) === relationshipIdentity(draft),
    )
  )
    return "duplicate";
  return "";
}

export function saveCharacterRelationship(
  document,
  draft,
  { id, now = new Date().toISOString() } = {},
) {
  const before = draft.id
    ? (document.relationships || []).find(({ id }) => id === draft.id)
    : null;
  const error = validateRelationshipDraft(document, draft, draft.id || null);
  if (error) return { error };
  const relationship = cleanComponentRelationships([
    {
      ...before,
      ...draft,
      id: before?.id || id || makeId(),
      createdAt: before?.createdAt || now,
      updatedAt: now,
    },
  ])[0];
  if (
    !relationship ||
    (!before &&
      (document.relationships || []).some(({ id }) => id === relationship.id))
  )
    return { error: "missing" };
  const relationships = before
    ? document.relationships.map((item) =>
        item.id === relationship.id ? relationship : item,
      )
    : [...(document.relationships || []), relationship];
  return {
    relationships,
    relationship,
    change: {
      id: relationship.id,
      index: before
        ? document.relationships.findIndex(({ id }) => id === before.id)
        : relationships.length - 1,
      before: copy(before),
      after: copy(relationship),
    },
  };
}

export function deleteCharacterRelationship(relationships, id) {
  const before = (relationships || []).find((item) => item.id === id);
  if (!before) return { error: "missing" };
  return {
    relationships: relationships.filter((item) => item.id !== id),
    change: {
      id,
      index: relationships.findIndex((item) => item.id === id),
      before: copy(before),
      after: null,
    },
  };
}

export function undoRelationshipChange(relationships, change) {
  if (!change?.id) return { error: "changed" };
  const current = (relationships || []).find(({ id }) => id === change.id);
  if (JSON.stringify(current || null) !== JSON.stringify(change.after))
    return { error: "changed" };
  const next = (relationships || []).filter(({ id }) => id !== change.id);
  if (change.before) {
    const index = (relationships || []).findIndex(({ id }) => id === change.id);
    next.splice(
      index < 0
        ? Math.min(next.length, Math.max(0, change.index ?? next.length))
        : index,
      0,
      copy(change.before),
    );
  }
  return { relationships: next };
}

export function relationshipScenes(document) {
  const textOf = (node) =>
    node.text || (node.content || []).map(textOf).join("");
  return (document.content?.content || [])
    .filter((node) => node.attrs?.format === "scene")
    .map((node) => ({ id: node.attrs.blockId, title: textOf(node) }));
}
