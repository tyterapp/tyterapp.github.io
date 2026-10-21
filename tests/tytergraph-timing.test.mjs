import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createMorseKeyer,
  decodeMorse,
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

test("SOS can be decoded as the continuous international distress sequence", () => {
  assert.equal(decodeMorse("...---...", "en"), "SOS");
  assert.equal(decodeMorse("...---...", "ru"), "СОС");
  assert.equal(decodeMorse("---------", "en"), null);
});
