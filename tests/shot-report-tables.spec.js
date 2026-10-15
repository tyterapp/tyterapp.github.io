import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { unzipSync, strFromU8 } from "fflate";
import { createProject } from "../src/data.js";
import { updateShotSettings } from "../src/shot-info.js";
import {
  exportShotReportCSV,
  exportShotReportXML,
  exportShotReportXLSX,
  shotReportTables,
} from "../src/shot-report-tables.js";
import { grantPro } from "./helpers/pro-access.js";
import { selectAppOption } from "./helpers/app-select.js";

const paragraph = (format, text, blockId, sceneVariant) => ({
  type: "paragraph",
  attrs: { format, blockId, ...(sceneVariant ? { sceneVariant } : {}) },
  ...(text ? { content: [{ type: "text", text }] } : {}),
});
const trickyText = '=SUM(A1:A2), "Привет"\nВторая строка; _x0041_ & < > 🎬';
function fixture(long = false) {
  let document = createProject("Кадры, таблица 🎬");
  document.id = "shot-tables-test";
  document.content.content = [
    paragraph("scene", "ИНТ. КАФЕ — ДЕНЬ", "scene", "A"),
    paragraph("action", "Анна у окна.", "action"),
    paragraph("character", "АННА", "character"),
    paragraph("speech", trickyText, "dialogue"),
    paragraph("plain", "", "empty"),
    ...(long
      ? [
          paragraph(
            "action",
            "я".repeat(29999) + "🎬" + "х".repeat(30005),
            "long",
          ),
        ]
      : []),
    paragraph("scene", "ЭКС. САД — НОЧЬ", "garden", "A"),
    paragraph("action", "Без настроек.", "garden-action"),
  ];
  document.sceneVariants = {
    scene: {
      F: [
        paragraph("scene", "ИНТ. КАФЕ — СУМЕРКИ", "scene", "F"),
        paragraph("action", "Иной вариант.", "f-action"),
      ],
    },
  };
  document.scriptVersions = {
    blue: {
      content: {
        type: "doc",
        content: [
          paragraph("scene", "НЕ ДОЛЖНО ПОПАСТЬ В ОТЧЁТ", "other-version", "A"),
        ],
      },
    },
  };
  document = updateShotSettings(document, "scene", "A", {
    name: 'Окно, "дубль"',
    aspectRatio: "2.39",
    frameSize: "close",
    people: "2",
    shootingDate: "2026-10-21",
    lighting: "back",
    excludeViolence: false,
    location: {
      name: "Кафе, берег",
      latitude: -33.867851,
      longitude: 151.20732,
    },
  });
  return updateShotSettings(document, "scene", "F", { name: "Вечер" });
}

// RFC 4180 reader, independent of the exporter (embedded newlines and quotes).
function parseCSV(text) {
  const rows = [];
  let row = [],
    cell = "",
    quoted = false;
  text = text.replace(/^\uFEFF/, "");
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"';
        index++;
      } else quoted = !quoted;
    } else if (!quoted && char === ",") {
      row.push(cell);
      cell = "";
    } else if (!quoted && char === "\r" && text[index + 1] === "\n") {
      rows.push([...row, cell]);
      row = [];
      cell = "";
      index++;
    } else cell += char;
  }
  if (cell || row.length) rows.push([...row, cell]);
  expect(quoted).toBe(false);
  return rows;
}

test("CSV preserves Unicode, quoted multiline blocks, all variants and safe numeric values", async () => {
  const document = fixture(true);
  const bytes = new Uint8Array(
    await exportShotReportCSV(document).arrayBuffer(),
  );
  expect([...bytes.slice(0, 3)]).toEqual([239, 187, 191]);
  const rows = parseCSV(new TextDecoder().decode(bytes));
  const header = rows.shift();
  const records = rows.map((row) =>
    Object.fromEntries(header.map((key, index) => [key, row[index]])),
  );
  expect(rows.every((row) => row.length === header.length)).toBe(true);
  expect(new Set(records.map((row) => `${row.Сцена}-${row.Вариант}`))).toEqual(
    new Set(["1-A", "1-F", "2-A"]),
  );
  expect(records[0]["Название шота"]).toBe('1-A: Окно, "дубль"');
  expect(records[0]["Дата съёмок"]).toBe("2026-10-21");
  expect(records[0].Широта).toBe("-33.867851");
  expect(records[0].Долгота).toBe("151.20732");
  expect(records[0]["Время суток"]).toBe("ДЕНЬ");
  expect(records.find((row) => row.Вариант === "F")["Время суток"]).toBe(
    "СУМЕРКИ",
  );
  expect(records.find((row) => row["Тип текста"] === "Диалог").Текст).toBe(
    `'${trickyText}`,
  );
  const long = records.filter(
    (row) => row.Сцена === "1" && row.Вариант === "A" && row.Блок === "6",
  );
  expect(long).toHaveLength(3);
  expect(long.map((row) => row.Текст).join("")).toBe(
    "я".repeat(29999) + "🎬" + "х".repeat(30005),
  );
  expect(
    long.every((row) => row.Текст.length <= 30000 && row.Текст.isWellFormed()),
  ).toBe(true);
  expect(records.some((row) => row.Текст === "")).toBe(true);
  expect(JSON.stringify(records)).not.toContain("НЕ ДОЛЖНО");
});

test("XML and XLSX have two formatted sheets, typed dates, coordinates, filters and complete text", async ({
  page,
}, info) => {
  const document = fixture(true);
  const report = shotReportTables(document);
  const xlsx = await exportShotReportXLSX(document);
  const bytes = new Uint8Array(await xlsx.arrayBuffer());
  const files = unzipSync(bytes);
  const xml = await exportShotReportXML(document).text();
  await (
    await import("node:fs/promises")
  ).writeFile(info.outputPath("report.xlsx"), bytes);
  await (
    await import("node:fs/promises")
  ).writeFile(info.outputPath("report.xml"), xml);
  const parsed = await page.evaluate(
    ({ xml, sheetXML, textXML, styleXML, stringsXML }) => {
      const parse = (text) => {
        const doc = new DOMParser().parseFromString(text, "application/xml");
        if (doc.querySelector("parsererror"))
          throw new Error(doc.querySelector("parsererror").textContent);
        return doc;
      };
      const ss = "urn:schemas-microsoft-com:office:spreadsheet";
      const workbook = parse(xml),
        sheet = parse(sheetXML),
        textSheet = parse(textXML),
        styles = parse(styleXML);
      const data = [...workbook.querySelectorAll("Worksheet")].map(
        (worksheet) => ({
          name: worksheet.getAttributeNS(ss, "Name"),
          rows: [...worksheet.querySelectorAll("Row")].map((row) =>
            [...row.querySelectorAll("Data")].map((cell) => ({
              value: cell.textContent,
              type: cell.getAttributeNS(ss, "Type"),
            })),
          ),
          frozen: !!worksheet.querySelector("FreezePanes"),
          filter: !!worksheet.querySelector("AutoFilter"),
        }),
      );
      const strings = [...parse(stringsXML).querySelectorAll("si")].map(
        (item) => item.textContent.replace(/_x005F_/g, "_"),
      );
      const value = (cell) =>
        cell.getAttribute("t") === "s"
          ? strings[Number(cell.textContent)]
          : cell.textContent;
      return {
        data,
        xlsx: {
          cells: Object.fromEntries(
            [...sheet.querySelectorAll("c")].map((cell) => [
              cell.getAttribute("r"),
              {
                type: cell.getAttribute("t"),
                style: cell.getAttribute("s"),
                value: value(cell),
              },
            ]),
          ),
          texts: [...textSheet.querySelectorAll("row")]
            .slice(1)
            .map((row) => [...row.querySelectorAll("c")].map(value)),
          filter: sheet.querySelector("autoFilter").getAttribute("ref"),
          frozen: sheet.querySelector("pane").getAttribute("topLeftCell"),
          grid: sheet.querySelector("sheetView").getAttribute("showGridLines"),
          wrapped: styles.querySelectorAll('alignment[wrapText="1"]').length,
          formulaCount:
            sheet.querySelectorAll("f").length +
            textSheet.querySelectorAll("f").length,
        },
      };
    },
    {
      xml,
      sheetXML: strFromU8(files["xl/worksheets/sheet1.xml"]),
      textXML: strFromU8(files["xl/worksheets/sheet2.xml"]),
      styleXML: strFromU8(files["xl/styles.xml"]),
      stringsXML: strFromU8(files["xl/sharedStrings.xml"]),
    },
  );
  expect(parsed.data.map((sheet) => sheet.name)).toEqual([
    "Кадры",
    "Текст сцен",
  ]);
  expect(parsed.data.every((sheet) => sheet.frozen && sheet.filter)).toBe(true);
  expect(parsed.data[0].rows).toHaveLength(4);
  expect(parsed.data[0].rows[1][4]).toEqual({
    type: "DateTime",
    value: "2026-10-21T00:00:00.000",
  });
  expect(parsed.data[0].rows[1][6]).toEqual({
    type: "Number",
    value: "-33.867851",
  });
  expect(parsed.data[1].rows[4].at(-1).value).toBe(trickyText);
  expect(parsed.xlsx.cells.C2.value).toBe('1-A: Окно, "дубль"');
  expect(parsed.xlsx.cells.E2).toEqual({
    value: "46316",
    type: null,
    style: "7",
  });
  expect(parsed.xlsx.cells.G2).toEqual({
    value: "-33.867851",
    type: null,
    style: "3",
  });
  expect(parsed.xlsx.cells.I2.style).toBe("5");
  expect(parsed.xlsx.filter).toBe("A1:AA4");
  expect(parsed.xlsx.frozen).toBe("D2");
  expect(parsed.xlsx.grid).toBe("0");
  expect(parsed.xlsx.wrapped).toBe(11);
  expect(parsed.xlsx.formulaCount).toBe(0);
  expect(parsed.xlsx.texts[3][6]).toBe(trickyText);
  const longParts = parsed.xlsx.texts.filter(
    (row) => row[0] === "1" && row[1] === "A" && row[3] === "6",
  );
  expect(longParts.map((row) => row[6]).join("")).toBe(
    "я".repeat(29999) + "🎬" + "х".repeat(30005),
  );
  expect(report.rows).toHaveLength(3);
});

for (const mobile of [false, true]) {
  test(`table report downloads include the current draft and fit ${mobile ? "mobile dark English" : "desktop light Russian"}`, async ({
    page,
  }, info) => {
    const language = mobile ? "en" : "ru";
    await page.setViewportSize({
      width: mobile ? 320 : 1440,
      height: mobile ? 844 : 1000,
    });
    await grantPro(page);
    await page.route("**/__tyter_local/**", (route) =>
      route.fulfill({ status: 404 }),
    );
    await page.route("https://tile.openstreetmap.org/**", (route) =>
      route.fulfill({
        contentType: "image/png",
        body: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
          "base64",
        ),
      }),
    );
    await page.addInitScript(
      ({ document, language, mobile }) => {
        localStorage.setItem("tyter.projects.v1", JSON.stringify([document]));
        localStorage.setItem("tyter.active", document.id);
        localStorage.setItem("tyter.language.v1", language);
        localStorage.setItem(
          "tyter.editor-preferences.v1",
          JSON.stringify({ theme: mobile ? "dark" : "light" }),
        );
      },
      { document: fixture(), language, mobile },
    );
    await page.goto("/beta");
    await expect(page.locator(".screenplay-editor")).toBeVisible();
    await page.locator('[data-block-id="action"]').click();
    await page.keyboard.press("End");
    await page.keyboard.type(" Fresh draft 2026");
    await page.locator(".scene-shot-button").first().click();
    const drawer = page.locator(".shot-info-drawer");
    const selector = drawer.getByRole("combobox", {
      name: mobile ? "Report format" : "Формат отчёта",
    });
    await expect(selector).toHaveAttribute("data-value", "pdf");
    for (const format of ["xlsx", "xml", "csv"]) {
      await selectAppOption(page, selector, format);
      const exporting = page.waitForEvent("download");
      await drawer.locator(".shot-export .primary-button").click();
      const download = await exporting;
      expect(download.suggestedFilename()).toMatch(new RegExp(`\\.${format}$`));
      const path = info.outputPath(`ui-report.${format}`);
      await download.saveAs(path);
      const bytes = await readFile(path);
      let text = bytes.toString("utf8");
      if (format === "xlsx")
        text = strFromU8(unzipSync(bytes)["xl/sharedStrings.xml"]);
      expect(text).toContain("Fresh draft 2026");
      expect(text).toContain(
        mobile
          ? format === "xlsx"
            ? "Dialogue"
            : "Scene"
          : format === "xlsx"
            ? "Диалог"
            : "Сцена",
      );
      const geometry = await drawer
        .locator(".shot-export")
        .evaluate((element) => {
          const rect = element.getBoundingClientRect();
          return {
            left: rect.left,
            right: rect.right,
            bottom: rect.bottom,
            width: innerWidth,
            height: innerHeight,
            overflow: element.scrollWidth > element.clientWidth,
          };
        });
      expect(geometry.left).toBeGreaterThanOrEqual(0);
      expect(geometry.right).toBeLessThanOrEqual(geometry.width + 1);
      expect(geometry.bottom).toBeLessThanOrEqual(geometry.height + 1);
      expect(geometry.overflow).toBe(false);
    }
    await selectAppOption(page, selector, "xlsx");
    await page.screenshot({ path: info.outputPath("shot-export.png") });
  });
}
