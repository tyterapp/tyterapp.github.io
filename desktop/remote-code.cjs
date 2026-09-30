const DEFAULT_CODES_URL = "https://sergeybukharev.github.io/codes-for-pro.txt";
async function verifyRemoteCode(
  code,
  { url = DEFAULT_CODES_URL, fetcher = fetch, timeout = 10000 } = {},
) {
  if (!/^\d{6}$/.test(String(code).trim()))
    return {
      valid: false,
      kind: "invalid",
      reason: "Код не подошёл. Введите 6 цифр из сообщения автора.",
    };
  let target;
  try {
    target = new URL(url);
    if (target.protocol !== "https:") throw new Error();
  } catch {
    return {
      valid: false,
      kind: "configuration",
      reason: "Адрес проверки кода настроен неверно. Напишите автору.",
    };
  }
  target.searchParams.set("check", Date.now().toString());
  try {
    const response = await fetcher(target.toString(), {
      cache: "no-store",
      signal: AbortSignal.timeout(timeout),
    });
    if (!response.ok)
      return {
        valid: false,
        kind: "service",
        reason:
          "Файл кодов пока недоступен. Повторите проверку позже или напишите автору.",
      };
    const content = await response.text();
    if (content.length > 1048576) throw new Error("oversized");
    const codes = content
      .replace(/^\uFEFF/, "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => /^\d{6}$/.test(line));
    if (!codes.length)
      return {
        valid: false,
        kind: "service",
        reason: "В файле пока нет кодов активации. Напишите автору.",
      };
    return codes.includes(String(code).trim())
      ? { valid: true }
      : {
          valid: false,
          kind: "invalid",
          reason:
            "Код не подошёл или больше не действует. Проверьте цифры или напишите автору.",
        };
  } catch {
    return {
      valid: false,
      kind: "network",
      reason:
        "Не удалось проверить код. Для запуска нужен интернет. Проверьте подключение и повторите попытку.",
    };
  }
}
module.exports = { DEFAULT_CODES_URL, verifyRemoteCode };
