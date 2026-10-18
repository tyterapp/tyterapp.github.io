export const isArrowOnly = (text) =>
  /^[\s\u2190-\u21ff]+$/u.test(text) && /[\u2190-\u21ff]/u.test(text);

export const splitArrowRun = (run) =>
  (run.text.match(/[\u2190-\u21ff]+|[^\u2190-\u21ff]+/gu) || []).map(
    (text) => ({
      ...run,
      text,
      arrow: /^[\u2190-\u21ff]+$/u.test(text),
    }),
  );

export function wrapMeasuredText(text, maxWidth, measure) {
  const lines = [];
  let start = 0,
    at = 0,
    space = -1;
  while (at < text.length) {
    if (text[at] === "\n") {
      lines.push(text.slice(start, at));
      start = ++at;
      space = -1;
      continue;
    }
    const length = String.fromCodePoint(text.codePointAt(at)).length;
    if (at > start && measure(start, at + length) > maxWidth) {
      const end = space > start ? space : at;
      lines.push(text.slice(start, end).trimEnd());
      start = end;
      while (text[start] === " " || text[start] === "\t") start++;
      at = start;
      space = -1;
      continue;
    }
    if (/\s/u.test(text[at])) space = at;
    at += length;
  }
  if (start < text.length || !lines.length || text.endsWith("\n"))
    lines.push(text.slice(start));
  return lines;
}
