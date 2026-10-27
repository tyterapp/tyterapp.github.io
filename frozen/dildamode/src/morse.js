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
  const normalized = letter.toUpperCase().replaceAll("Ё", "Е");
  return { ...latin, ...cyrillic, ...common }[normalized] || null;
}
export function decodeMorse(code, language = "ru") {
  if (code === "...---...") return language === "en" ? "SOS" : "СОС";
  // The reference shows both alphabets. Unique codes from either alphabet
  // remain usable; shared codes follow the selected writing language.
  return (
    alphabets[language === "en" ? "en" : "ru"][code] ||
    alphabets[language === "en" ? "ru" : "en"][code] ||
    null
  );
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
  let currentLanguage = language,
    codeLanguage = null;
  let downAt = null,
    lastUp = null,
    code = "",
    hasText = false,
    wordPending = false;
  let letterTimer,
    wordTimer,
    deliveryTimer,
    disposed = false;
  const pending = [];
  const deliver = () => {
    clearTimeout(deliveryTimer);
    if (disposed) return;
    while (pending.length) {
      if (onText?.(pending[0]) === false) {
        deliveryTimer = setTimeout(deliver, 50);
        return;
      }
      pending.shift();
    }
  };
  const clearTimers = () => {
    clearTimeout(letterTimer);
    clearTimeout(wordTimer);
  };
  const resume = () => {
    if (lastUp === null) return;
    const elapsed = performance.now() - lastUp;
    letterTimer = setTimeout(letter, Math.max(0, MORSE_LETTER_GAP - elapsed));
    wordTimer = setTimeout(word, Math.max(0, MORSE_WORD_GAP - elapsed));
  };
  const letter = () => {
    if (!code || disposed) return;
    const value = decodeMorse(code, codeLanguage || currentLanguage);
    if (value) {
      // Composition can temporarily lock the document. Keep accepted letters
      // in order until insertion is available instead of silently losing them.
      pending.push((wordPending && hasText ? " " : "") + value);
      hasText = true;
      wordPending = false;
      deliver();
    }
    onBoundary?.("letter", value);
    code = "";
    codeLanguage = null;
    onCode?.(code);
  };
  const word = () => {
    if (!hasText || disposed) return;
    wordPending = true;
    onBoundary?.("word");
  };
  const cancel = () => {
    clearTimers();
    clearTimeout(deliveryTimer);
    pending.length = 0;
    downAt = null;
    lastUp = null;
    code = "";
    codeLanguage = null;
    wordPending = false;
    onCode?.(code);
  };
  return {
    setLanguage(value) {
      currentLanguage = value;
    },
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
        resume();
        return false;
      }
      const symbol = duration >= dash ? "-" : ".";
      lastUp = now;
      if (!code) codeLanguage = currentLanguage;
      // Bound malformed sequences without ever turning them into valid letters.
      code = (code + symbol).slice(0, 9);
      onSignal?.(symbol);
      onCode?.(code);
      letterTimer = setTimeout(letter, MORSE_LETTER_GAP);
      wordTimer = setTimeout(word, MORSE_WORD_GAP);
      return true;
    },
    cancel,
    abortPress() {
      // Pointer cancellation rejects only the unfinished press, not the
      // already accepted dots and dashes waiting for their letter boundary.
      if (disposed || downAt === null) return;
      downAt = null;
      clearTimers();
      resume();
    },
    dispose() {
      cancel();
      disposed = true;
    },
  };
}
