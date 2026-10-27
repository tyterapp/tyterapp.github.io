import { cleanComponentRelationships } from "./component-relationships.js";

export function mergeLibraryRelationships(
  document,
  library,
  selected,
  components,
  makeId,
) {
  const relationships = cleanComponentRelationships(document.relationships);
  const endpoints = new Map(
    components
      .filter((component) => component.librarySource?.libraryId === library.id)
      .map((component) => [component.librarySource.componentId, component.id]),
  );
  const localIds = new Set(components.map((component) => component.id));
  // Reuse unresolved identities across repeated updates. They never bind to a
  // component merely because its name or local ID happens to match a source.
  for (const relationship of relationships) {
    const origin = relationship.librarySource;
    if (origin?.libraryId !== library.id) continue;
    for (const [source, local] of [
      [origin.sourceComponentId, relationship.sourceComponentId],
      [origin.targetComponentId, relationship.targetComponentId],
    ])
      if (!endpoints.has(source) && !localIds.has(local))
        endpoints.set(source, local);
  }
  const endpoint = (source) => {
    if (!endpoints.has(source)) {
      let id;
      do {
        id = `unresolved-${makeId()}`;
      } while (localIds.has(id));
      endpoints.set(source, id);
      localIds.add(id);
    }
    return endpoints.get(source);
  };
  for (const original of cleanComponentRelationships(library.relationships)) {
    if (
      !selected.includes(original.sourceComponentId) &&
      !selected.includes(original.targetComponentId)
    )
      continue;
    const index = relationships.findIndex(
      (item) =>
        item.librarySource?.libraryId === library.id &&
        item.librarySource.relationshipId === original.id,
    );
    const imported = {
      ...original,
      id: index >= 0 ? relationships[index].id : makeId(),
      sourceComponentId: endpoint(original.sourceComponentId),
      targetComponentId: endpoint(original.targetComponentId),
      librarySource: {
        libraryId: library.id,
        relationshipId: original.id,
        sourceComponentId: original.sourceComponentId,
        targetComponentId: original.targetComponentId,
      },
    };
    if (index >= 0) relationships[index] = imported;
    else relationships.push(imported);
  }
  // A previously unresolved endpoint becomes available only through its exact
  // library identity. Category changes and selection never delete the edge.
  return {
    relationships: cleanComponentRelationships(
      relationships.map((relationship) => {
        const origin = relationship.librarySource;
        if (origin?.libraryId !== library.id) return relationship;
        return {
          ...relationship,
          sourceComponentId:
            endpoints.get(origin.sourceComponentId) ||
            relationship.sourceComponentId,
          targetComponentId:
            endpoints.get(origin.targetComponentId) ||
            relationship.targetComponentId,
        };
      }),
    ),
    endpoints,
  };
}
