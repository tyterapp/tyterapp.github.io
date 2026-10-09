export function localDay(now = Date.now()) {
  const date = new Date(now);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function cleanStreak(value) {
  const parsed = Date.parse(`${value?.day}T12:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(value?.day) &&
    Number.isFinite(parsed) &&
    new Date(parsed).toISOString().slice(0, 10) === value.day &&
    Number.isSafeInteger(value.count) &&
    value.count > 0
    ? {
        day: value.day,
        count: value.count,
        best: Math.max(
          value.count,
          Number.isSafeInteger(value.best) ? value.best : 0,
        ),
      }
    : null;
}
export function dailyVisit(wallet, now = Date.now()) {
  const day = localDay(now),
    previous = cleanStreak(wallet.streak);
  if (previous && previous.day >= day) return { wallet, reward: 0 };
  const days = (value) => Date.parse(`${value}T12:00:00Z`) / 86400000;
  const count =
    previous && days(day) - days(previous.day) === 1 ? previous.count + 1 : 1;
  const reward = 1 + (count % 5 === 0 ? 10 : 0);
  return {
    reward,
    wallet: {
      ...wallet,
      coins: wallet.coins + reward,
      streak: { day, count, best: Math.max(count, previous?.best || 0) },
    },
  };
}
