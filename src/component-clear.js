// Visit the live document and dormant page/scene versions so a version switch
// cannot bring cleared components back. Library files are not part of this tree.
function mapScopes(source, transform) {
  let next = { ...source };
  for (const key of ["scriptVersions", "legacyVersions", "versions"])
    if (source[key])
      next[key] = Object.fromEntries(
        Object.entries(source[key]).map(([id, scope]) => [
          id,
          mapScopes(scope, transform),
        ]),
      );
  if (source.pageVersions)
    next.pageVersions = mapScopes(source.pageVersions, transform);
  if (source.pages)
    next.pages = source.pages.map((page) => mapScopes(page, transform));
  return transform(next);
}

function removeMarks(value, ids) {
  if (Array.isArray(value)) return value.map((item) => removeMarks(item, ids));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, item]) => {
      if (key !== "marks") return [[key, removeMarks(item, ids)]];
      const marks = item.filter(
        (mark) => mark.type !== "entity" || !ids.has(mark.attrs?.id),
      );
      return marks.length ? [[key, marks]] : [];
    }),
  );
}

export function clearDocumentComponents(document) {
  const ids = new Set();
  mapScopes(document, (scope) => {
    for (const component of scope.components || []) ids.add(component.id);
    return scope;
  });
  return mapScopes(document, (scope) => {
    const next = { ...scope };
    if (scope.components) next.components = [];
    if (scope.relationships)
      next.relationships = scope.relationships.filter(
        (item) =>
          !ids.has(item.sourceComponentId) && !ids.has(item.targetComponentId),
      );
    for (const key of ["content", "sceneVariants", "slice"])
      if (scope[key]) next[key] = removeMarks(scope[key], ids);
    if (scope.notes)
      next.notes = {
        ...scope.notes,
        content: removeMarks(scope.notes.content, ids),
      };
    if (scope.props)
      next.props = scope.props.map((prop) =>
        ids.has(prop.componentId) ? { ...prop, componentId: null } : prop,
      );
    if (scope.graphLayout?.characterPositions)
      next.graphLayout = {
        ...scope.graphLayout,
        characterPositions: Object.fromEntries(
          Object.entries(scope.graphLayout.characterPositions).filter(
            ([id]) => !ids.has(id),
          ),
        ),
      };
    return next;
  });
}

// Only these resources change; undo must not replace unrelated document data.
export function componentClearState(document) {
  return structuredClone(
    Object.fromEntries(
      [
        "content",
        "notes",
        "components",
        "relationships",
        "props",
        "graphLayout",
        "sceneVariants",
        "scriptVersions",
        "pageVersions",
      ].map((key) => [key, document[key]]),
    ),
  );
}
