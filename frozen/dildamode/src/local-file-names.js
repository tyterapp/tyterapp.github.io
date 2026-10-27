export function documentFileStem(title) {
  let name = String(title || "Без названия")
    .normalize("NFC")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .trim()
    .replace(/[. ]+$/g, "");
  if (/^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(name))
    name = "_" + name;
  let result = "";
  const encoder = new TextEncoder();
  for (const character of name) {
    if (
      result.length + character.length > 120 ||
      encoder.encode(result + character).length > 220
    )
      break;
    result += character;
  }
  return result.replace(/[. ]+$/g, "") || "Без названия";
}
export const fileNameKey = (name) => name.normalize("NFC").toLowerCase();
export function friendlyTytName(title, primary, entries) {
  const stem = documentFileStem(title);
  const occupied = new Set(entries.map((entry) => fileNameKey(entry.name)));
  for (let suffix = 1; ; suffix++) {
    const name = `${stem}${suffix > 1 ? ` (${suffix})` : ""}.tyt`;
    if (name === primary?.name || !occupied.has(fileNameKey(name))) return name;
  }
}
