import test from "node:test";
import assert from "node:assert/strict";
import { createProject, validateImport } from "../src/data.js";
import {
  telegramLink,
  readTelegram,
  telegramText,
  TELEGRAM_MAX_TEXT,
} from "../src/telegram.js";
import { encodeMorse } from "../src/morse.js";

test("telegram links round-trip Unicode and use the public viewer on desktop", () => {
  const text = "МИР & HELLO\n123, ёж 🐈 <script>alert(1)</script>";
  const url = new URL(telegramLink(text, "ru", "tyter://app/free"));
  assert.equal(url.origin, "https://tyterapp.github.io");
  assert.equal(url.pathname, "/telegram/");
  assert.equal(url.search, "");
  assert.deepEqual(readTelegram(url.hash), {
    version: 1,
    language: "ru",
    text,
  });
  assert.equal(
    new URL(telegramLink("HI", "en", "https://example.com/free")).origin,
    "https://example.com",
  );
});

test("invalid, unsupported and oversized telegram payloads are rejected", () => {
  for (const hash of [
    "",
    "#telegram=@@",
    "#telegram=e30",
    `#telegram=${"a".repeat(170001)}`,
  ])
    assert.equal(readTelegram(hash), null);
  for (const text of [" ", "a\u0000b", "x".repeat(TELEGRAM_MAX_TEXT + 1)])
    assert.throws(() => telegramLink(text));
  const invalid = btoa(
    JSON.stringify({ version: 2, text: "hello", language: "en" }),
  );
  assert.equal(readTelegram(`#telegram=${invalid}`), null);
});

test("sharing and project import preserve only the current document's marked telegram text", () => {
  const doc = createProject("Private screenplay title");
  const mark = { type: "telegraph" };
  doc.content.content = [
    {
      type: "paragraph",
      attrs: { format: "action", blockId: "telegram" },
      content: [
        { type: "text", text: "Private beginning " },
        { type: "text", text: "HEL", marks: [mark] },
        { type: "text", text: "LO", marks: [mark, { type: "bold" }] },
        { type: "text", text: " private interruption " },
        { type: "text", text: "МИР", marks: [mark] },
      ],
    },
  ];
  assert.equal(telegramText(doc.content), "HELLO\nМИР");
  const imported = validateImport(doc);
  assert.equal(telegramText(imported.content), "HELLO\nМИР");
  const shared = readTelegram(
    new URL(telegramLink(telegramText(imported.content))).hash,
  );
  assert.equal(shared.text, "HELLO\nМИР");
  assert.ok(!JSON.stringify(shared).includes("Private"));
  assert.equal(encodeMorse("М"), "--");
  assert.equal(encodeMorse("h"), "....");
  assert.equal(encodeMorse("?"), "..--..");
});
