const coreFields = new Set([
  "id",
  "name",
  "aliases",
  "type",
  "description",
  "color",
  "thumbnail",
  "enabled",
  "librarySource",
  "folderId",
  "quantity",
  "url",
  "urlEnabled",
]);

// Category-specific extensions are opaque JSON. A category only controls their
// visibility; loading a place or updating an old library cannot erase them.
export function componentExtraData(component, { prop = false } = {}) {
  const ignored = prop
    ? new Set([...coreFields, "quantity", "category", "componentId", "blockId"])
    : coreFields;
  let entries = 0;
  const copy = (value, depth = 0) => {
    if (++entries > 20000 || depth > 24)
      throw new Error("Расширения компонента слишком большие.");
    if (value === null || typeof value === "boolean") return value;
    if (typeof value === "string") {
      if (value.length > 250000)
        throw new Error("Расширения компонента слишком большие.");
      return value;
    }
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (Array.isArray(value)) return value.map((item) => copy(item, depth + 1));
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value)
          .filter(([, item]) => item !== undefined)
          .map(([key, item]) => [key, copy(item, depth + 1)]),
      );
    throw new Error("Некорректные расширения компонента.");
  };
  const result = Object.fromEntries(
    Object.entries(component)
      .filter(([key, value]) => !ignored.has(key) && value !== undefined)
      .map(([key, value]) => [key, copy(value)]),
  );
  if (JSON.stringify(result).length > 2 * 1024 * 1024)
    throw new Error("Расширения компонента слишком большие.");
  return result;
}

export function mergeComponentExtraData(existing, incoming) {
  const merge = (before, after) => {
    if (
      before !== undefined &&
      (after == null || after === "" || (Array.isArray(after) && !after.length))
    )
      return structuredClone(before);
    if (!after || typeof after !== "object" || Array.isArray(after))
      return structuredClone(after);
    const old =
      before && typeof before === "object" && !Array.isArray(before)
        ? before
        : {};
    return Object.fromEntries(
      [...new Set([...Object.keys(old), ...Object.keys(after)])].map((key) => [
        key,
        Object.hasOwn(after, key)
          ? merge(Object.hasOwn(old, key) ? old[key] : undefined, after[key])
          : structuredClone(old[key]),
      ]),
    );
  };
  return merge(
    componentExtraData(existing || {}),
    componentExtraData(incoming || {}),
  );
}
