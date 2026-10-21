import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createMorseKeyer,
  decodeMorse,
  encodeMorse,
  TYTERGRAPH_TIMING,
} from "../src/morse.js";

test("Tytergraph press boundaries: 10–249ms dots, 250–2000ms dashes; ignore out-of-range presses", (t) => {
  let now = 0;
  t.mock.method(performance, "now", () => now);
  const signals = [];
  const keyer = createMorseKeyer({
    language: "en",
    timing: TYTERGRAPH_TIMING,
    onSignal: (signal) => signals.push(signal),
  });
  for (const duration of [9, 10, 249, 250, 2000, 2001]) {
    keyer.press();
    now += duration;
    keyer.release();
    now += 20;
  }
  assert.deepEqual(signals, [".", ".", "-", "-"]);
  keyer.dispose();
});

test("every reference alphabet code is accepted, including unique Russian codes in ENG and Ё playback", () => {
  for (const [language, alphabet] of [
    ["en", "ABCDEFGHIJKLMNOPQRSTUVWXYZ"],
    ["ru", "АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ"],
  ]) {
    for (const letter of alphabet)
      assert.equal(decodeMorse(encodeMorse(letter), language), letter);
  }
  assert.equal(encodeMorse("Ё"), ".");
  assert.equal(decodeMorse("----", "en"), "Ш");
  assert.equal(decodeMorse("..-..", "en"), "Э");
});

test("cancelled pointer press preserves accepted symbols and the pending letter", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let now = 0;
  t.mock.method(performance, "now", () => now);
  const output = [];
  const keyer = createMorseKeyer({
    language: "en",
    timing: TYTERGRAPH_TIMING,
    onText: (value) => {
      output.push(value);
    },
  });
  keyer.press();
  now += 60;
  keyer.release();
  now += 60;
  keyer.press();
  now += 30;
  keyer.abortPress();
  t.mock.timers.tick(600);
  assert.deepEqual(output, ["E"]);
  keyer.dispose();
});

test("SOS can be decoded as the continuous international distress sequence", () => {
  assert.equal(decodeMorse("...---...", "en"), "SOS");
  assert.equal(decodeMorse("...---...", "ru"), "СОС");
  assert.equal(decodeMorse("---------", "en"), null);
});

test("a valid letter waits for composition to finish instead of being lost", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let now = 0,
    locked = true;
  t.mock.method(performance, "now", () => now);
  const output = [];
  const keyer = createMorseKeyer({
    language: "en",
    timing: TYTERGRAPH_TIMING,
    onText: (value) => {
      if (locked) return false;
      output.push(value);
      return true;
    },
  });
  keyer.press();
  now += 60;
  keyer.release();
  t.mock.timers.tick(600);
  assert.deepEqual(output, []);
  locked = false;
  t.mock.timers.tick(100);
  assert.deepEqual(output, ["E"]);
  keyer.dispose();
  t.mock.timers.tick(2000);
  assert.deepEqual(output, ["E"]);
});

test("switching alphabets preserves the pending letter and uses the new language for the next one", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let now = 0;
  t.mock.method(performance, "now", () => now);
  const output = [];
  const keyer = createMorseKeyer({
    language: "en",
    timing: TYTERGRAPH_TIMING,
    onText: (value) => output.push(value),
  });
  const type = () => {
    for (const duration of [60, 300, 300]) {
      keyer.press();
      now += duration;
      keyer.release();
      now += 60;
    }
  };
  type();
  keyer.setLanguage("ru");
  t.mock.timers.tick(600);
  type();
  t.mock.timers.tick(600);
  assert.deepEqual(output, ["W", "В"]);
  keyer.dispose();
});
