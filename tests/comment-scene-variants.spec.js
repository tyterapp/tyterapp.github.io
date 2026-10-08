import { test, expect } from "@playwright/test";
import { createProject, validateImport } from "../src/data.js";
import { commentSceneIndex } from "../src/comment-scenes.js";
import { switchSceneVariant } from "../src/scene-variants.js";
import { grantPro } from "./helpers/pro-access.js";
import { selectAppOption } from "./helpers/app-select.js";

const paragraph = (format, text, blockId, commentId, variant) => ({
  type: "paragraph",
  attrs: { format, blockId, ...(variant ? { sceneVariant: variant } : {}) },
  content: [
    {
      type: "text",
      text,
      ...(commentId
        ? { marks: [{ type: "comment", attrs: { id: commentId } }] }
        : {}),
    },
  ],
});
function fixture() {
  const doc = createProject("Комментарии к вариантам");
  doc.id = "comment-variants";
  const nodes = (id, letter) => [
    paragraph("scene", `ИНТ. КОМНАТА ${id} ${letter} — ДЕНЬ`, id, null, letter),
    paragraph(
      "action",
      `Текст сцены ${id}, вариант ${letter}.`,
      `${id}-${letter}`,
      `comment-${id}-${letter}`,
    ),
  ];
  doc.content.content = [...nodes("scene-1", "A"), ...nodes("scene-2", "B")];
  doc.sceneVariants = Object.fromEntries(
    ["scene-1", "scene-2"].map((id) => [
      id,
      Object.fromEntries(
        ["A", "B", "C", "F"].map((letter) => [letter, nodes(id, letter)]),
      ),
    ]),
  );
  doc.comments = [
    {
      id: "comment-scene-1-A",
      blockId: "scene-1-A",
      text: "Заметка A",
      quote: "Текст сцены scene-1, вариант A.",
    },
    {
      id: "comment-scene-1-F",
      blockId: "scene-1-F",
      text: "Заметка F",
      quote: "Текст сцены scene-1, вариант F.",
      sceneId: "scene-1",
      sceneVariant: "F",
    },
    {
      id: "comment-scene-1-B",
      blockId: "scene-1-B",
      text: "Заметка B",
      quote: "Текст сцены scene-1, вариант B.",
    },
    {
      id: "comment-scene-2-F",
      blockId: "scene-2-F",
      text: "Другая сцена F",
      quote: "Текст сцены scene-2, вариант F.",
    },
  ].map((comment) => ({
    ...comment,
    createdAt: "2026-10-08T10:00:00.000Z",
    resolved: false,
  }));
  return doc;
}
async function open(page, document = fixture()) {
  await grantPro(page);
  await page.route("**/__tyter_local/**", (route) =>
    route.fulfill({ status: 404 }),
  );
  await page.addInitScript((doc) => {
    localStorage.setItem("tyter.onboarding.v1", "done");
    if (sessionStorage.getItem("comment-variants-seeded")) return;
    sessionStorage.setItem("comment-variants-seeded", "yes");
    localStorage.setItem("tyter.projects.v1", JSON.stringify([doc]));
    localStorage.setItem("tyter.active", doc.id);
    localStorage.setItem("tyter.language.v1", "ru");
  }, document);
  await page.goto("/pro");
  await expect(page.locator(".screenplay-editor")).toBeFocused();
}
const variant = (page, scene = 1) =>
  page.getByRole("combobox", { name: `Вариант сцены ${scene}`, exact: true });
const card = (page, id) =>
  page.locator(`.comment-card[data-comment-id="comment-${id}"]`);
const rail = (page) => page.locator(".workspace-tools .comments-toggle");
const saved = (page) =>
  page.evaluate(async () => {
    const { browserRequest } = await import("/src/browser-files.js");
    return (await browserRequest("documents")).documents.find(
      (doc) => doc.id === "comment-variants",
    );
  });
async function selectText(page, blockId) {
  await page
    .locator(`.screenplay-block[data-block-id="${blockId}"]`)
    .evaluate((element) => {
      element.closest('[contenteditable="true"]').focus();
      const range = document.createRange();
      range.selectNodeContents(element);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      document.dispatchEvent(new Event("selectionchange"));
    });
  await expect(page.locator(".selection-toolbar")).toBeVisible();
}

test("inactive and legacy comments identify their scene; TYT retains explicit bindings; new variants do not inherit comment marks", async ({
  page,
}) => {
  const doc = validateImport(fixture());
  const resolve = commentSceneIndex(doc);
  expect(doc.comments.map((comment) => resolve(comment)?.variant)).toEqual([
    "A",
    "F",
    "B",
    "F",
  ]);
  expect(resolve(doc.comments[3])).toMatchObject({
    sceneId: "scene-2",
    number: 2,
    variant: "F",
  });
  const next = switchSceneVariant(doc, "scene-1", "E");
  expect(
    next.content.content[1].content[0].marks?.some(
      (mark) => mark.type === "comment",
    ),
  ).toBeFalsy();
  expect(next.sceneVariants["scene-1"].A[1].content[0].marks[0].attrs.id).toBe(
    "comment-scene-1-A",
  );
  await open(page);
  const imported = await page.evaluate(async (doc) => {
    const { exportTYT, readTYT } = await import("/src/tyt-format.js");
    return readTYT(await (await exportTYT(doc)).text());
  }, doc);
  expect(
    imported.comments.find((comment) => comment.id === "comment-scene-1-F"),
  ).toMatchObject({ sceneId: "scene-1", sceneVariant: "F" });
});

for (const close of ["button", "Escape", "other sidebar", "rail"]) {
  test(`clicking several comments opens their variants and restores each original on ${close}`, async ({
    page,
  }) => {
    await open(page);
    await selectAppOption(page, variant(page), "C");
    await rail(page).click();
    await expect(
      card(page, "scene-1-F").locator(".comment-scene-variant"),
    ).toHaveText("Сцена 1 · вариант F");
    await expect(
      card(page, "scene-1-B").locator(".comment-scene-variant"),
    ).toHaveText("Сцена 1 · вариант B");
    for (const letter of ["F", "B", "F"]) {
      await card(page, `scene-1-${letter}`).locator(".comment-quote").click();
      await expect(variant(page)).toHaveAttribute("data-value", letter);
      await expect(
        page.locator(`.screenplay-block[data-block-id="scene-1-${letter}"]`),
      ).toHaveText(`Текст сцены scene-1, вариант ${letter}.`);
      await expect(page.locator(".comment-open-selected")).toContainText(
        `вариант ${letter}`,
      );
      const selectionBlock = await page.evaluate(
        () =>
          window
            .getSelection()
            ?.anchorNode?.parentElement?.closest(".screenplay-block")?.dataset
            .blockId,
      );
      expect(selectionBlock).toBe(`scene-1-${letter}`);
    }
    await card(page, "scene-2-F").click();
    await expect(variant(page, 2)).toHaveAttribute("data-value", "F");
    if (close === "button")
      await page
        .getByRole("button", { name: "Закрыть комментарии", exact: true })
        .click();
    if (close === "Escape") await page.keyboard.press("Escape");
    if (close === "other sidebar")
      await page
        .getByRole("button", { name: "Настройки документа", exact: true })
        .click();
    if (close === "rail") await rail(page).click();
    await expect(page.locator(".comments-drawer")).toHaveCount(0);
    await expect(variant(page)).toHaveAttribute("data-value", "C");
    await expect(variant(page, 2)).toHaveAttribute("data-value", "B");
    await expect
      .poll(
        async () => (await saved(page))?.content.content[0].attrs.sceneVariant,
      )
      .toBe("C");
    await page.reload();
    await expect(variant(page)).toHaveAttribute("data-value", "C");
    await expect(variant(page, 2)).toHaveAttribute("data-value", "B");
  });
}

test("creating a comment in F binds it to F; editing its text while viewing preserves the edit when returning to A", async ({
  page,
}) => {
  await open(page);
  await selectAppOption(page, variant(page), "F");
  await selectText(page, "scene-1-F");
  await page.keyboard.press("Control+q");
  await page
    .getByRole("textbox", { name: "Текст комментария", exact: true })
    .fill("Новое замечание F");
  await page.keyboard.press("Control+Enter");
  const created = page
    .locator(".comment-card")
    .filter({ has: page.locator("p", { hasText: "Новое замечание F" }) });
  await expect(created.locator(".comment-scene-variant")).toHaveText(
    "Сцена 1 · вариант F",
  );
  await expect
    .poll(
      async () =>
        (await saved(page))?.comments.find(
          (comment) => comment.text === "Новое замечание F",
        )?.sceneVariant,
    )
    .toBe("F");
  await selectAppOption(page, variant(page), "A");
  await created.click();
  await expect(variant(page)).toHaveAttribute("data-value", "F");
  await page.locator('.screenplay-block[data-block-id="scene-1-F"]').click();
  await page.keyboard.press("End");
  await page.keyboard.insertText(" Дополнение F.");
  await page
    .getByRole("button", { name: "Закрыть комментарии", exact: true })
    .click();
  await expect(variant(page)).toHaveAttribute("data-value", "A");
  await expect(
    page.locator('.screenplay-block[data-block-id="scene-1-A"]'),
  ).not.toContainText("Дополнение F.");
  await selectAppOption(page, variant(page), "F");
  await expect(
    page.locator('.screenplay-block[data-block-id="scene-1-F"]'),
  ).toContainText("Дополнение F.");
  await page.getByRole("button", { name: "ENG", exact: true }).click();
  await rail(page).click();
  await expect(created.locator(".comment-scene-variant")).toHaveText(
    "Scene 1 · variant F",
  );
});

test("an older comment on a shared scene heading opens F even when its mark has been lost", async ({
  page,
}) => {
  const doc = fixture();
  const comment = doc.comments.find(
    (comment) => comment.id === "comment-scene-1-F",
  );
  delete comment.sceneId;
  delete comment.sceneVariant;
  comment.blockId = "scene-1";
  comment.quote = "ИНТ. КОМНАТА scene-1 F — ДЕНЬ";
  delete doc.sceneVariants["scene-1"].F[1].content[0].marks;
  await open(page, doc);
  await rail(page).click();
  await card(page, "scene-1-F").locator(".comment-quote").click();
  await expect(variant(page)).toHaveAttribute("data-value", "F");
  await expect(
    card(page, "scene-1-F").locator(".comment-scene-variant"),
  ).toHaveText("Сцена 1 · вариант F");
  await page
    .getByRole("button", { name: "Закрыть комментарии", exact: true })
    .click();
  await expect(variant(page)).toHaveAttribute("data-value", "A");
  await expect
    .poll(
      async () =>
        (await saved(page))?.comments.find(
          (comment) => comment.id === "comment-scene-1-F",
        )?.sceneVariant,
    )
    .toBe("F");
  await page.reload();
  await rail(page).click();
  await card(page, "scene-1-F").locator(".comment-quote").click();
  await expect(variant(page)).toHaveAttribute("data-value", "F");
});

test("a comment draft remembers F when the scene variant changes before it is submitted", async ({
  page,
}) => {
  const doc = fixture();
  for (const nodes of Object.values(doc.sceneVariants["scene-1"]))
    nodes[0].content[0].text = "ИНТ. ОБЩИЙ ЗАГОЛОВОК — ДЕНЬ";
  doc.content.content[0].content[0].text = "ИНТ. ОБЩИЙ ЗАГОЛОВОК — ДЕНЬ";
  await open(page, doc);
  await selectAppOption(page, variant(page), "F");
  await selectText(page, "scene-1");
  await page.keyboard.press("Control+q");
  const composer = page.getByRole("textbox", {
    name: "Текст комментария",
    exact: true,
  });
  await composer.fill("Комментарий к заголовку F");
  await selectAppOption(page, variant(page), "A");
  await composer.focus();
  await page.keyboard.press("Control+Enter");
  const created = page.locator(".comment-card").filter({
    has: page.locator("p", { hasText: "Комментарий к заголовку F" }),
  });
  await expect(created.locator(".comment-scene-variant")).toHaveText(
    "Сцена 1 · вариант F",
  );
  await expect(variant(page)).toHaveAttribute("data-value", "F");
  await page
    .getByRole("button", { name: "Закрыть комментарии", exact: true })
    .click();
  await expect(variant(page)).toHaveAttribute("data-value", "A");
  await rail(page).click();
  await created.locator(".comment-quote").click();
  await expect(variant(page)).toHaveAttribute("data-value", "F");
});

test("F opens and its distant comment stays visible at 200% before returning to A", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1100, height: 820 });
  const doc = fixture();
  doc.metadata.documentZoom = 200;
  const nodes = doc.sceneVariants["scene-1"].F;
  delete nodes[1].content[0].marks;
  nodes.push(
    ...Array.from({ length: 45 }, (_, index) =>
      paragraph(
        "action",
        `Строка ${index + 1}. Героиня идёт по городу. `.repeat(3),
        `f-long-${index}`,
      ),
    ),
  );
  nodes.push(
    paragraph("action", "ФИНАЛ ВАРИАНТА F.", "f-final", "comment-scene-1-F"),
  );
  const comment = doc.comments.find(
    (comment) => comment.id === "comment-scene-1-F",
  );
  comment.blockId = "f-final";
  comment.quote = "ФИНАЛ ВАРИАНТА F.";
  await open(page, doc);
  await page.evaluate(() => document.fonts.ready);
  await rail(page).click();
  await card(page, "scene-1-F").locator(".comment-quote").click();
  await expect(variant(page)).toHaveAttribute("data-value", "F");
  await expect(page.locator(".comment-open-selected")).toHaveText(
    "ФИНАЛ ВАРИАНТА F.",
  );
  await expect
    .poll(() =>
      page.locator(".comment-open-selected").evaluate((node) => {
        const rect = node.getBoundingClientRect(),
          scroller = node.closest(".minimal-scroll");
        const viewport = scroller.getBoundingClientRect(),
          footer = document
            .querySelector(".minimal-footer")
            .getBoundingClientRect();
        const midpoint = (rect.top + rect.bottom) / 2;
        return (
          rect.top > viewport.top + 16 &&
          rect.bottom < footer.top - 16 &&
          midpoint < viewport.top + scroller.clientHeight * 0.6 &&
          rect.left >= viewport.left &&
          rect.left < viewport.left + scroller.clientWidth
        );
      }),
    )
    .toBe(true);
  await page
    .getByRole("button", { name: "Закрыть комментарии", exact: true })
    .click();
  await expect(variant(page)).toHaveAttribute("data-value", "A");
  await expect
    .poll(() =>
      page.locator(".minimal-scroll").evaluate((node) => node.scrollTop),
    )
    .toBe(0);
});
