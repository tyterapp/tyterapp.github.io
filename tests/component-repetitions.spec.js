import { test, expect } from "@playwright/test";
import { createProject } from "../src/data.js";

const paragraph = (format, text, id) => ({
  type: "paragraph",
  attrs: { format, blockId: id },
  content: [{ type: "text", text }],
});
const fixture = () => {
  const project = createProject("Повторения компонентов");
  project.components = [
    {
      id: "ivan",
      name: "Иван Петров",
      type: "character",
      color: "#8a799a",
      description: "",
    },
    {
      id: "room",
      name: "101",
      type: "place",
      color: "#738598",
      description: "",
    },
    {
      id: "symbol",
      name: "a+b",
      type: "character",
      color: "#8a799a",
      description: "",
    },
  ];
  project.content.content = [
    paragraph("scene", "ИНТ. КВАРТИРА 101 — ДЕНЬ", "scene"),
    {
      type: "paragraph",
      attrs: { format: "action", blockId: "action" },
      content: [
        {
          type: "text",
          text: "Ан",
          marks: [{ type: "bold" }, { type: "comment", attrs: { id: "note" } }],
        },
        { type: "text", text: "на", marks: [{ type: "italic" }] },
        {
          type: "text",
          text: ", Анна, анна и АННА. Аннабет, Сюзанна, _Анна, Анна2.",
        },
      ],
    },
    paragraph("character", "АННА", "character"),
    {
      type: "paragraph",
      attrs: { format: "speech", blockId: "speech" },
      content: [
        { type: "text", text: "Иван", marks: [{ type: "italic" }] },
        { type: "text", text: " Петров; иван петров. 101 и 1010. a+b; xa+b." },
      ],
    },
    paragraph("action", "Продолжение.", "typing"),
  ];
  project.comments = [
    {
      id: "note",
      quote: "Ан",
      blockId: "action",
      text: "Проверить имя",
      resolved: false,
    },
  ];
  return project;
};
async function open(page, project = fixture()) {
  await page.route("**/__tyter_local/**", (route) =>
    route.fulfill({ json: { documents: [], directory: "Test" } }),
  );
  await page.addInitScript((project) => {
    localStorage.setItem("tyter.onboarding.v1", "done");
    if (!sessionStorage.getItem("repetitions-seeded")) {
      localStorage.setItem("tyter.projects.v1", JSON.stringify([project]));
      localStorage.setItem("tyter.active", project.id);
      sessionStorage.setItem("repetitions-seeded", "true");
    }
  }, project);
  await page.goto("/free");
  await expect(page.locator(".screenplay-editor")).toBeVisible();
}
const block = (page, id) =>
  page.locator(`.screenplay-editor p[data-block-id="${id}"]`);
const stored = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("tyter.projects.v1"))[0]);
const linkedText = async (page, blockId, componentId) => {
  const project = await stored(page);
  return (
    project.content.content.find((node) => node.attrs.blockId === blockId)
      ?.content || []
  )
    .filter((node) =>
      node.marks?.some(
        (mark) => mark.type === "entity" && mark.attrs.id === componentId,
      ),
    )
    .map((node) => node.text)
    .join("");
};
async function addAnna(page) {
  await page.getByRole("button", { name: "Компоненты", exact: true }).click();
  const panel = page.getByRole("complementary", {
    name: "Компоненты сценария",
  });
  await panel
    .getByRole("button", { name: "Добавить: Персонажи", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Новый компонент",
    exact: true,
  });
  await dialog.getByLabel("Название", { exact: true }).fill("Анна");
  await dialog.getByRole("button", { name: "Создать", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(async () => (await stored(page)).components.length).toBe(4);
  return (await stored(page)).components.find(
    (component) => component.name === "Анна",
  ).id;
}
async function caretAtEnd(page, line) {
  await line.evaluate((element) => {
    element.closest("[contenteditable]").focus();
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let text, last;
    while ((text = walker.nextNode())) last = text;
    const range = document.createRange();
    range.setStart(last, last.length);
    range.collapse(true);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
  });
  await page.keyboard.press("Shift");
}

test("creating a component links existing repeats, rich text and scene/character headings, and saves TYT links", async ({
  page,
}) => {
  await open(page);
  await expect
    .poll(() => linkedText(page, "speech", "ivan"))
    .toBe("Иван Петровиван петров");
  await expect.poll(() => linkedText(page, "speech", "room")).toBe("101");
  await expect.poll(() => linkedText(page, "speech", "symbol")).toBe("a+b");
  const id = await addAnna(page);
  await expect
    .poll(() => linkedText(page, "action", id))
    .toBe("АннаАннааннаАННА");
  await expect.poll(() => linkedText(page, "character", id)).toBe("АННА");
  await expect(block(page, "action").locator("strong")).toHaveText("Ан");
  await expect(block(page, "action").locator("em")).toHaveText("на");
  await expect(
    block(page, "action").locator('[data-comment-id="note"]'),
  ).toHaveText("Ан");
  await page.getByRole("button", { name: "Закрыть компоненты" }).click();
  const mention = block(page, "action")
    .locator(`[data-entity-id="${id}"]`)
    .first();
  await expect(mention).toHaveCSS("color", "rgb(27, 46, 255)");
  await mention.click({ modifiers: ["Control"] });
  const panel = page.getByRole("complementary", {
    name: "Компоненты сценария",
  });
  await expect(panel.getByLabel("Название", { exact: true })).toHaveValue(
    "Анна",
  );
  const roundTrip = await page.evaluate(async () => {
    const project = JSON.parse(localStorage.getItem("tyter.projects.v1"))[0];
    const { exportTYT, readTYT } = await import("/src/tyt-format.js");
    const copy = readTYT(await (await exportTYT(project)).text());
    return { before: project.content, after: copy.content };
  });
  expect(roundTrip.after).toEqual(roundTrip.before);
  await page.reload();
  await expect(
    block(page, "character").locator(`[data-entity-id="${id}"]`),
  ).toHaveText("АННА");
  await expect
    .poll(() => linkedText(page, "action", id))
    .toBe("АннаАннааннаАННА");
});

test("newly typed mentions link immediately, stop matching inside longer words and undo/redo stays on the text", async ({
  page,
}) => {
  await open(page);
  const id = await addAnna(page);
  await page.getByRole("button", { name: "Закрыть компоненты" }).click();
  const line = block(page, "typing");
  await caretAtEnd(page, line);
  await page.keyboard.type(" Анна");
  await expect(line.locator(`[data-entity-id="${id}"]`)).toHaveText("Анна");
  await expect.poll(() => linkedText(page, "typing", id)).toBe("Анна");
  await page.waitForTimeout(600);
  await page.keyboard.type("бет");
  await expect(line).toHaveText("Продолжение. Аннабет");
  await expect(line.locator("[data-entity-id]")).toHaveCount(0);
  await page.keyboard.press("Control+z");
  await expect(line).toHaveText("Продолжение. Анна");
  await expect(line.locator(`[data-entity-id="${id}"]`)).toHaveText("Анна");
  await page.keyboard.press("Control+y");
  await expect(line).toHaveText("Продолжение. Аннабет");
  await expect(line.locator("[data-entity-id]")).toHaveCount(0);
});

test("deleting a component removes every automatic link and undo restores the component and all mentions", async ({
  page,
}) => {
  await open(page);
  const id = await addAnna(page);
  const panel = page.getByRole("complementary", {
    name: "Компоненты сценария",
  });
  await panel.locator(`[data-component-id="${id}"] .component-item`).click();
  await panel
    .getByRole("button", { name: "Удалить компонент", exact: true })
    .click();
  await expect(
    page.locator(`.screenplay-editor [data-entity-id="${id}"]`),
  ).toHaveCount(0);
  await page.keyboard.press("Control+z");
  await expect(panel.locator(`[data-component-id="${id}"]`)).toBeVisible();
  await expect
    .poll(() => linkedText(page, "action", id))
    .toBe("АннаАннааннаАННА");
  await expect(
    block(page, "character").locator(`[data-entity-id="${id}"]`),
  ).toHaveText("АННА");
  await page.keyboard.press("Control+y");
  await expect(panel.locator(`[data-component-id="${id}"]`)).toHaveCount(0);
  await expect(
    page.locator(`.screenplay-editor [data-entity-id="${id}"]`),
  ).toHaveCount(0);
  await page.reload();
  await expect(
    page.locator(`.screenplay-editor [data-entity-id="${id}"]`),
  ).toHaveCount(0);
});

test("the longest matching name owns a phrase and explicitly assigned components retain their ownership", async ({
  page,
}) => {
  const project = fixture();
  project.components = [
    { id: "anna", name: "Анна", type: "character", color: "#8a799a" },
    {
      id: "full-anna",
      name: "Анна Петрова",
      type: "character",
      color: "#738598",
    },
  ];
  project.content.content = [
    {
      type: "paragraph",
      attrs: { format: "action", blockId: "action" },
      content: [
        { type: "text", text: "Анна Петрова и Анна. " },
        {
          type: "text",
          text: "Анна Петрова",
          marks: [{ type: "entity", attrs: { id: "anna", color: "#8a799a" } }],
        },
      ],
    },
  ];
  project.comments = [];
  await open(page, project);
  await expect
    .poll(() => linkedText(page, "action", "full-anna"))
    .toBe("Анна Петрова");
  await expect
    .poll(() => linkedText(page, "action", "anna"))
    .toBe("АннаАнна Петрова");
  await expect(
    block(page, "action").locator('[data-entity-id="full-anna"]'),
  ).toHaveCount(1);
  await expect(
    block(page, "action").locator('[data-entity-id="anna"]'),
  ).toHaveCount(2);
});
