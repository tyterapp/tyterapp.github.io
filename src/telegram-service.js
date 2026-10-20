// GitHub Pages keeps using portable fragment links until a service is configured.
export async function publishTelegram(
  telegram,
  { signal, service = import.meta.env?.VITE_TELEGRAM_SERVICE_URL } = {},
) {
  if (!service) return null;
  const origin = new URL(service);
  if (
    origin.protocol !== "https:" &&
    !["localhost", "127.0.0.1"].includes(origin.hostname)
  )
    throw new Error("Invalid sharing service");
  const response = await fetch(new URL("/api/telegrams", origin), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(telegram),
    signal,
  });
  if (!response.ok) throw new Error("Telegram service unavailable");
  const result = await response.json();
  const link = new URL(result.url);
  if (
    link.origin !== origin.origin ||
    link.pathname !== "/telegram/" ||
    !/^[a-f\d]{32}$/.test(link.searchParams.get("id") || "")
  )
    throw new Error("Invalid sharing link");
  return link.href;
}
