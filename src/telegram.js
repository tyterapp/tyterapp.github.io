export const TELEGRAM_MAX_TEXT = 20000;

// Only marked text in the current screenplay is shared. History and other
// document content never enter the URL.
export function telegramText(content) {
  return (content?.content || [])
    .flatMap((block) => {
      let text = "",
        separated = false;
      for (const part of block.content || []) {
        if (
          part.type === "text" &&
          part.marks?.some((mark) => mark.type === "telegraph")
        ) {
          if (separated && text) text += "\n";
          text += part.text;
          separated = false;
        } else if (text) separated = true;
      }
      return text ? [text] : [];
    })
    .join("\n")
    .trim();
}

function descriptor(value) {
  return value?.version === 1 &&
    ["ru", "en"].includes(value.language) &&
    typeof value.text === "string" &&
    value.text.trim() &&
    value.text.length <= TELEGRAM_MAX_TEXT &&
    !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value.text)
    ? { version: 1, language: value.language, text: value.text }
    : null;
}

export function telegramLink(
  text,
  language = "ru",
  base = globalThis.location?.href,
) {
  const value = descriptor({ version: 1, text, language });
  if (!value) throw new Error("Invalid telegram");
  let origin = "https://tyterapp.github.io";
  try {
    const address = new URL(base);
    if (["http:", "https:"].includes(address.protocol)) origin = address.origin;
  } catch {
    /* Desktop telegrams open on the public website. */
  }
  const url = new URL("/telegram/", origin);
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const encoded = btoa(
    Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""),
  )
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  url.hash = `telegram=${encoded}`;
  return url.href;
}

export function readTelegram(hash) {
  if (typeof hash !== "string" || hash.length > 170000) return null;
  try {
    const encoded = new URLSearchParams(hash.replace(/^#/, "")).get("telegram");
    if (!encoded || !/^[\w-]+$/.test(encoded)) return null;
    const bytes = Uint8Array.from(
      atob(encoded.replace(/-/g, "+").replace(/_/g, "/")),
      (char) => char.charCodeAt(0),
    );
    return descriptor(
      JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
    );
  } catch {
    return null;
  }
}
