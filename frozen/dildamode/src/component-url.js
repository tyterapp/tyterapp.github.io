export function componentUrl(value) {
  if (typeof value !== "string") return "";
  const text = value.trim();
  if (!text || text.length > 2048 || /[\s<>]/.test(text)) return "";
  try {
    const url = new URL(/^www\./i.test(text) ? `https://${text}` : text);
    return ["http:", "https:"].includes(url.protocol) &&
      url.hostname &&
      !url.username &&
      !url.password
      ? url.href
      : "";
  } catch {
    return "";
  }
}
export function activeComponentUrl(component) {
  return component?.enabled !== false && component?.urlEnabled !== false
    ? componentUrl(component?.url)
    : "";
}
export function selectedComponentId(doc, from, to) {
  let common;
  doc.nodesBetween(from, to, (node) => {
    if (!node.isText) return;
    const ids = new Set(
      node.marks
        .filter((mark) => mark.type.name === "entity")
        .map((mark) => mark.attrs.id),
    );
    common = common ? new Set([...common].filter((id) => ids.has(id))) : ids;
  });
  return common?.size === 1 ? [...common][0] : null;
}
