import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { unzipSync, strFromU8 } from "fflate";

test.beforeEach(async ({ page }) => {
  await page.route("**/__tyter_local/**", (route) =>
    route.fulfill({ json: { documents: [], directory: "Test" } }),
  );
  await page.addInitScript(() => {
    localStorage.setItem("tyter.onboarding.v1", "done");
    localStorage.setItem(
      "tyter.projects.v1",
      JSON.stringify([
        {
          id: "limits-test",
          title: "Тест",
          updatedAt: new Date().toISOString(),
          content: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                attrs: { format: "action", blockId: "text" },
                content: [{ type: "text", text: "Имя0 и лампа." }],
              },
            ],
          },
          components: Array.from({ length: 10 }, (_, i) => ({
            id: `c${i}`,
            name: `Имя${i}`,
            type: "character",
            color: "#8a799a",
          })),
          props: [],
          comments: [],
        },
      ]),
    );
    localStorage.setItem("tyter.active", "limits-test");
  });
});
test("Free limits all new component entry points and allows editing existing components", async ({
  page,
}) => {
  await page.goto("/app");
  await page.getByRole("button", { name: "Компоненты", exact: true }).click();
  await expect(page.locator(".component-quota")).toHaveText(
    "10 / 10 компонентов",
  );
  await page
    .getByRole("button", { name: "Добавить: Персонажи", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Полная версия Tyter" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Закрыть подписку" }).click();
  await page.locator('[data-component-id="c0"] .component-item').click();
  await expect(page.locator(".component-editor input").first()).toHaveValue(
    "Имя0",
  );
  await page.getByRole("button", { name: "Закрыть компоненты" }).click();
  const select = async (text) => {
    await page
      .locator(".screenplay-editor p")
      .first()
      .evaluate((element, word) => {
        element.closest("[contenteditable]").focus();
        const start = element.textContent.indexOf(word);
        const point = (offset) => {
          const walker = document.createTreeWalker(
            element,
            NodeFilter.SHOW_TEXT,
          );
          let node;
          while ((node = walker.nextNode())) {
            if (offset <= node.length) return [node, offset];
            offset -= node.length;
          }
          throw new Error("Selected fixture text was not found");
        };
        const range = document.createRange();
        range.setStart(...point(start));
        range.setEnd(...point(start + word.length));
        window.getSelection().removeAllRanges();
        window.getSelection().addRange(range);
        document.dispatchEvent(new Event("selectionchange"));
      }, text);
    await page.keyboard.press("Shift");
  };
  await select("лампа");
  await page.keyboard.press("Control+D");
  await expect(
    page.getByRole("dialog", { name: "Полная версия Tyter" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Закрыть подписку" }).click();
  await select("Имя0");
  await page.keyboard.press("Control+D");
  await expect(page.locator(".component-editor input").first()).toHaveValue(
    "Имя0",
  );
  await page.getByRole("button", { name: "Закрыть компоненты" }).click();
  await page.getByRole("button", { name: "Реквизит", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Полная версия Tyter" }),
  ).toContainText("Реквизит");
});
test("display font changes independently of Courier DOCX export", async ({
  page,
}, testInfo) => {
  await page.goto("/app");
  await page
    .getByRole("button", { name: "Настройки документа", exact: true })
    .click();
  await page.getByLabel("Шрифт в редакторе").selectOption("arial");
  await expect(page.locator(".screenplay-editor")).toHaveCSS(
    "font-family",
    /Arial/,
  );
  await page.getByRole("button", { name: "Закрыть настройки" }).click();
  const button = page.getByRole("button", {
    name: "Скачать сценарий",
    exact: true,
  });
  await expect(button).not.toContainText("Скачать");
  await button.click();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Word · DOCX" }).click();
  const download = await pending;
  const target = testInfo.outputPath("font.docx");
  await download.saveAs(target);
  const archive = unzipSync(new Uint8Array(await readFile(target)));
  const xml = strFromU8(archive["word/document.xml"]);
  expect(xml).toContain("Courier New");
  expect(xml).not.toContain("Arial");
});
