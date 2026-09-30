let words = [];
const ready = fetch("/dictionary/words.txt")
  .then((r) => {
    if (!r.ok) throw new Error("dictionary");
    return r.text();
  })
  .then((text) => {
    words = [
      ...new Set(
        text
          .split(/\r?\n/)
          .map((w) => w.trim().toLocaleLowerCase("ru"))
          .filter((w) => /^[а-яё-]+$/i.test(w)),
      ),
    ].sort();
    postMessage({ type: "ready", count: words.length });
  })
  .catch(() => postMessage({ type: "error" }));
self.onmessage = async ({ data: { prefix, id, type, word } }) => {
  await ready;
  if (type === "spell") {
    const key = word.toLocaleLowerCase("ru");
    if (words.includes(key)) {
      postMessage({ type: "spelling", id, correct: true, words: [] });
      return;
    }
    const distance = (a, b) => {
      let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
      for (let i = 1; i <= a.length; i++) {
        const row = [i];
        for (let j = 1; j <= b.length; j++)
          row[j] = Math.min(
            row[j - 1] + 1,
            previous[j] + 1,
            previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
          );
        if (Math.min(...row) > 2) return 3;
        previous = row;
      }
      return previous[b.length];
    };
    const candidates = words
      .filter(
        (value) =>
          Math.abs(value.length - key.length) <= 1 &&
          (value[0] === key[0] || value.slice(1) === key.slice(1)),
      )
      .map((value) => ({
        value,
        score: distance(key.replace(/ё/g, "е"), value.replace(/ё/g, "е")),
      }))
      .filter((item) => item.score <= 2)
      .sort(
        (a, b) =>
          a.score - b.score ||
          a.value.length - b.value.length ||
          a.value.localeCompare(b.value, "ru"),
      );
    postMessage({
      type: "spelling",
      id,
      correct: false,
      words: candidates.slice(0, 5).map((item) => item.value),
    });
    return;
  }
  const key = prefix.toLocaleLowerCase("ru");
  let lo = 0,
    hi = words.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (words[mid] < key) lo = mid + 1;
    else hi = mid;
  }
  const matches = [];
  for (
    let i = lo;
    i < words.length && words[i].startsWith(key) && matches.length < 180;
    i++
  )
    if (words[i] !== key) matches.push(words[i]);
  matches.sort((a, b) => a.length - b.length || a.localeCompare(b, "ru"));
  postMessage({ type: "matches", id, words: matches.slice(0, 5) });
};
