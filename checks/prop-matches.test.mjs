import { test } from "node:test";
import assert from "node:assert/strict";
import { textMatches, propOccurrences } from "../src/prop-matches.js";
test("props match whole Cyrillic names case-insensitively across rich-text runs", () => {
  assert.equal(
    textMatches("Лампа, лампа. Подлампа и лампада", "лампа").length,
    2,
  );
  assert.equal(textMatches("(123) и 1234", "123").length, 1);
  assert.equal(textMatches("C++ и C++", "C++").length, 2);
  assert.equal(
    propOccurrences(
      {
        content: [
          {
            content: [
              { text: "лам" },
              { text: "па", marks: [{ type: "bold" }] },
            ],
          },
        ],
      },
      "лампа",
    ),
    1,
  );
});
