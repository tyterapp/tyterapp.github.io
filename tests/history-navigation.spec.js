import { test, expect } from "@playwright/test";
import { createProject } from "../src/data.js";
import { grantPro } from "./helpers/pro-access.js";

const paragraph = (format, text, blockId) => ({
  type: "paragraph",
  attrs: { format, blockId },
  content: [{ type: "text", text }],
});

async function open(page, theme, mobile = false) {
  await grantPro(page);
  if (mobile) await page.setViewportSize({ width: 320, height: 844 });
  await page.route("**/__tyter_local/**", (route) =>
    route.fulfill({ status: 404 }),
  );
  const doc = createProject("История версий");
  doc.id = "history-navigation";
  doc.content.content = [
    paragraph("scene", "ИНТ. ДОМ — ДЕНЬ", "scene"),
    paragraph("action", "Текущий рабочий текст.", "action"),
  ];
  const snapshot = structuredClone(doc);
  snapshot.content = {
    type: "doc",
    content: [
      paragraph("scene", "ИНТ. ДОМ — ДЕНЬ", "scene"),
      paragraph(
        "action",
        "Прежний текст. " + "длиннаярепликасценысдействиями".repeat(15),
        "action",
      ),
    ],
  };
  await page.addInitScript(
    ({ doc, theme }) => {
      if (sessionStorage.getItem("history-navigation-seeded")) return;
      sessionStorage.setItem("history-navigation-seeded", "yes");
      const now = Date.now();
      const date = new Date(now);
      const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      localStorage.setItem("tyter.projects.v1", JSON.stringify([doc]));
      localStorage.setItem("tyter.active", doc.id);
      localStorage.setItem("tyter.language.v1", "ru");
      localStorage.setItem(
        "tyter.editor-preferences.v1",
        JSON.stringify({ theme }),
      );
      localStorage.setItem(
        "tyter.writing-timer.v1",
        JSON.stringify({
          coins: 10,
          session: null,
          streak: { day, count: 1, best: 1 },
          achievements: { scavenger: { date: day } },
          deletions: [
            {
              id: "deleted-blue",
              documentId: doc.id,
              versionId: "blue",
              label: "v2 Blue",
              date: day,
              deletedAt: now,
            },
          ],
        }),
      );
    },
    { doc, theme },
  );
  await page.goto("/beta");
  await expect(page.locator(".screenplay-editor")).toBeVisible();
  // Use the real browser database so the same checks work against the published build.
  await page.evaluate(
    ({ documentId, snapshot }) =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open("tyter.history.v1", 1);
        request.onupgradeneeded = () => {
          const store = request.result.createObjectStore("revisions", {
            keyPath: "id",
            autoIncrement: true,
          });
          store.createIndex("documentId", "documentId");
        };
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction("revisions", "readwrite");
          for (const [i, label] of [
            "текста",
            "настроек кадров",
            "восстановления",
          ].entries()) {
            transaction
              .objectStore("revisions")
              .add({
                documentId,
                snapshot,
                label,
                area: "screenplay",
                createdAt: Date.now() - 60000 - i * 60000,
              });
          }
          transaction.oncomplete = () => {
            database.close();
            resolve();
          };
          transaction.onerror = () => {
            database.close();
            reject(transaction.error);
          };
        };
      }),
    { documentId: doc.id, snapshot },
  );
  if (mobile) {
    await page
      .getByRole("button", { name: "Открыть инструменты", exact: true })
      .click();
  }
  await page
    .getByRole("button", { name: "История изменений", exact: true })
    .click();
  await expect(page.locator(".history-card")).toHaveCount(3);
  await page.evaluate(() => document.fonts.ready);
}

for (const theme of ["light", "dark"]) {
  for (const mobile of [false, true]) {
    test(`${theme} ${mobile ? "320px" : "desktop"}: history returns to the live document and keeps inactive previews compact`, async ({
      page,
    }, info) => {
      await open(page, theme, mobile);
      const current = page.getByRole("button", {
        name: "Текущая версия",
        exact: true,
      });
      const cards = page.locator(".history-card");
      const preview = cards.first().locator(".history-card-preview");
      const achievement = page.locator(".history-achievement");
      const deleted = page.locator(".history-deletions li");
      const disclosure = page.locator(".history-deletions-heading");
      await expect(current).toHaveAttribute("aria-pressed", "true");
      await expect(page.locator(".history-card strong")).toHaveCount(0);
      await expect(cards.first()).not.toContainText("До изменения");
      await expect(cards.last()).not.toContainText("До восстановления");
      await expect(preview).toHaveCSS("-webkit-line-clamp", "3");
      const collapsed = await preview.evaluate((el) => ({
        height: el.getBoundingClientRect().height,
        line: parseFloat(getComputedStyle(el).lineHeight),
        contentHeight: el.scrollHeight,
      }));
      expect(collapsed.height).toBeLessThanOrEqual(collapsed.line * 3 + 1);
      expect(collapsed.contentHeight).toBeGreaterThan(collapsed.height);
      await expect(disclosure).toHaveAttribute("aria-expanded", "false");
      await expect(achievement).toBeHidden();
      await expect(deleted).toBeHidden();
      await page
        .locator(".history-drawer")
        .screenshot({ path: info.outputPath("history-collapsed.png") });

      await cards.first().click();
      await expect(current).toHaveAttribute("aria-pressed", "false");
      await expect(cards.first()).toHaveAttribute("aria-expanded", "true");
      await expect(preview).toHaveCSS("-webkit-line-clamp", "none");
      expect((await preview.boundingBox()).height).toBeGreaterThan(
        collapsed.height,
      );
      await expect(
        page.getByLabel("Текст выбранной версии", { exact: true }),
      ).toContainText("Прежний текст.");
      if (!mobile) {
        await current.focus();
        await page.keyboard.press("Space");
      } else {
        await current.click();
      }
      await expect(current).toHaveAttribute("aria-pressed", "true");
      await expect(page.locator(".history-document-preview")).toHaveCount(0);
      await expect(preview).toHaveCSS("-webkit-line-clamp", "3");
      await expect(
        page.locator('.screenplay-editor [data-block-id="action"]'),
      ).toHaveText("Текущий рабочий текст.");
      await expect(page.locator(".screenplay-editor")).toHaveAttribute(
        "contenteditable",
        "true",
      );
      await expect(
        page.getByRole("button", {
          name: "Восстановить эту версию",
          exact: true,
        }),
      ).toHaveCount(0);

      await disclosure.click();
      await expect(disclosure).toHaveAttribute("aria-expanded", "true");
      await expect(achievement).toBeVisible();
      await expect(deleted).toHaveText(/v2 Blue/);
      const before = await disclosure.boundingBox();
      expect(before.height).toBeGreaterThanOrEqual(mobile ? 44 : 40);
      expect(before.x).toBeGreaterThanOrEqual(0);
      expect(before.x + before.width).toBeLessThanOrEqual(mobile ? 320 : 1440);
      await disclosure.click();
      await expect(achievement).toBeHidden();
      await page
        .getByRole("button", { name: "Закрыть историю", exact: true })
        .click();
      if (mobile)
        await page
          .getByRole("button", { name: "Открыть инструменты", exact: true })
          .click();
      await page
        .getByRole("button", { name: "История изменений", exact: true })
        .click();
      await expect(disclosure).toHaveAttribute("aria-expanded", "false");
      await expect(current).toHaveAttribute("aria-pressed", "true");
    });
  }
}
