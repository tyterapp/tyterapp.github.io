export function cleanComponentAliases(value, name = "") {
  const entries =
    typeof value === "string"
      ? value.split(/[,;\n\r]+/)
      : Array.isArray(value)
        ? value
        : [];
  const seen = new Set([name.trim().toLocaleLowerCase()]);
  const aliases = [];
  for (const entry of entries.slice(0, 100)) {
    if (typeof entry !== "string") continue;
    const text = entry
      .replace(/[\u0000-\u001f\u007f]/g, " ")
      .slice(0, 200)
      .trim();
    const key = text.toLocaleLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    aliases.push(text);
  }
  return aliases;
}

export function componentNames(component) {
  const name = component.name?.trim() || "";
  return [name, ...cleanComponentAliases(component.aliases, name)].filter(
    Boolean,
  );
}

export function componentNameCandidates(components) {
  return components
    .filter(
      (component) => component.enabled !== false && component.name?.trim(),
    )
    .flatMap((component) =>
      componentNames(component).map((text, index) => ({
        component,
        text,
        alias: index > 0,
      })),
    );
}
