// One dot is the timing unit; letter and word gaps use the 3:7 ratio.
export const MORSE_UNIT = 180;
export const MORSE_DASH = MORSE_UNIT * 2;
export const MORSE_LETTER_GAP = MORSE_UNIT * 3;
export const MORSE_WORD_GAP = MORSE_UNIT * 7;
export const TYTERGRAPH_TIMING = Object.freeze({
  minPress: 10,
  dash: 250,
  maxPress: 2000,
});

const latin = {
  A: ".-",
  B: "-...",
  C: "-.-.",
  D: "-..",
  E: ".",
  F: "..-.",
  G: "--.",
  H: "....",
  I: "..",
  J: ".---",
  K: "-.-",
  L: ".-..",
  M: "--",
  N: "-.",
  O: "---",
  P: ".--.",
  Q: "--.-",
  R: ".-.",
  S: "...",
  T: "-",
  U: "..-",
  V: "...-",
  W: ".--",
  X: "-..-",
  Y: "-.--",
  Z: "--..",
};
const cyrillic = {
  А: ".-",
  Б: "-...",
  В: ".--",
  Г: "--.",
  Д: "-..",
  Е: ".",
  Ж: "...-",
  З: "--..",
  И: "..",
  Й: ".---",
  К: "-.-",
  Л: ".-..",
  М: "--",
  Н: "-.",
  О: "---",
  П: ".--.",
  Р: ".-.",
  С: "...",
  Т: "-",
  У: "..-",
  Ф: "..-.",
  Х: "....",
  Ц: "-.-.",
  Ч: "---.",
  Ш: "----",
  Щ: "--.-",
  Ъ: "--.--",
  Ы: "-.--",
  Ь: "-..-",
  Э: "..-..",
  Ю: "..--",
  Я: ".-.-",
};
const common = {
  0: "-----",
  1: ".----",
  2: "..---",
  3: "...--",
  4: "....-",
  5: ".....",
  6: "-....",
  7: "--...",
  8: "---..",
  9: "----.",
  ".": ".-.-.-",
  ",": "--..--",
  "?": "..--..",
  "'": ".----.",
  "!": "-.-.--",
  "/": "-..-.",
  "(": "-.--.",
  ")": "-.--.-",
  ":": "---...",
  ";": "-.-.-.",
  "=": "-...-",
  "+": ".-.-.",
  "-": "-....-",
  '"': ".-..-.",
  "@": ".--.-.",
};
const inverse = (alphabet) =>
  Object.fromEntries(
    Object.entries({ ...common, ...alphabet }).map(([letter, code]) => [
      code,
      letter,
    ]),
  );
const alphabets = { ru: inverse(cyrillic), en: inverse(latin) };
export function encodeMorse(letter) {
  return { ...latin, ...cyrillic, ...common }[letter.toUpperCase()] || null;
}
export function decodeMorse(code, language = "ru") {
  if (code === "...---...") return language === "en" ? "SOS" : "СОС";
  return alphabets[language === "en" ? "en" : "ru"][code] || null;
}

// No document references live here. Closing the key cancels every pending input.
export function createMorseKeyer({
  language = "ru",
  onText,
  onSignal,
  onBoundary,
  onCode,
  timing = {},
}) {
  const { minPress = 0, dash = MORSE_DASH, maxPress = Infinity } = timing;
  let downAt = null,
    lastUp = null,
    code = "",
    hasText = false,
    wordPending = false;
  let letterTimer,
    wordTimer,
    disposed = false;
  const clearTimers = () => {
    clearTimeout(letterTimer);
    clearTimeout(wordTimer);
  };
  const letter = () => {
    if (!code || disposed) return;
    const value = decodeMorse(code, language);
    if (
      value &&
      onText((wordPending && hasText ? " " : "") + value) !== false
    ) {
      hasText = true;
      wordPending = false;
    }
    onBoundary?.("letter", value);
    code = "";
    onCode?.(code);
  };
  const word = () => {
    if (!hasText || disposed) return;
    wordPending = true;
    onBoundary?.("word");
  };
  const cancel = () => {
    clearTimers();
    downAt = null;
    lastUp = null;
    code = "";
    wordPending = false;
    onCode?.(code);
  };
  return {
    press() {
      if (disposed || downAt !== null) return false;
      const now = performance.now();
      // Timers may be throttled; a new press must still respect the real gap.
      if (lastUp !== null && now - lastUp >= MORSE_LETTER_GAP) letter();
      if (lastUp !== null && now - lastUp >= MORSE_WORD_GAP) word();
      clearTimers();
      downAt = now;
      return true;
    },
    release() {
      if (disposed || downAt === null) return false;
      const now = performance.now();
      const duration = now - downAt;
      downAt = null;
      if (duration < minPress || duration > maxPress) {
        // Ignore accidental/overlong presses without losing the valid sequence.
        if (lastUp !== null) {
          const elapsed = now - lastUp;
          letterTimer = setTimeout(
            letter,
            Math.max(0, MORSE_LETTER_GAP - elapsed),
          );
          wordTimer = setTimeout(word, Math.max(0, MORSE_WORD_GAP - elapsed));
        }
        return false;
      }
      const symbol = duration >= dash ? "-" : ".";
      lastUp = now;
      // Bound malformed sequences without ever turning them into valid letters.
      code = (code + symbol).slice(0, 9);
      onSignal?.(symbol);
      onCode?.(code);
      letterTimer = setTimeout(letter, MORSE_LETTER_GAP);
      wordTimer = setTimeout(word, MORSE_WORD_GAP);
      return true;
    },
    cancel,
    dispose() {
      cancel();
      disposed = true;
    },
  };
}
