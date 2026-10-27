import { getLanguage } from "./i18n.js";
import { scriptVersion } from "./script-versions.js";
import {
  SHOT_FIELDS,
  FORMAT_NAMES,
  cleanShootingDate,
  durationLabel,
  shotScenes,
  shotReportName,
  shotText,
} from "./shot-info.js";

// A shared data model keeps the three table formats in step with the PDF report.
export function shotReportTables(document) {
  const language = getLanguage() === "en" ? 1 : 0;
  const label = (ru, en) => (language ? en : ru);
  const column = (key, ru, en, width = 130, type = "text") => ({
    key,
    label: label(ru, en),
    width,
    type,
  });
  const columns = [
    column("scene", "Сцена", "Scene", 60, "number"),
    column("variant", "Вариант", "Variant", 70),
    column("name", "Название шота", "Shot name", 220),
    column("heading", "Заголовок сцены", "Scene heading", 280),
    column("date", "Дата съёмок", "Shooting date", 110, "date"),
    column("location", "Локация съёмок", "Shooting location", 220),
    column("latitude", "Широта", "Latitude", 110, "coordinate"),
    column("longitude", "Долгота", "Longitude", 110, "coordinate"),
    column(
      "duration",
      "Хронометраж, мин:сек",
      "Duration, min:sec",
      135,
      "duration",
    ),
    column("seconds", "Длительность, сек.", "Duration, sec", 125, "number"),
    column("pages", "Страниц (оценка)", "Pages (estimate)", 125, "decimal"),
    ...SHOT_FIELDS.map((field) => ({
      key: field.key,
      label: field.label[language],
      width: 150,
      type: "text",
    })),
    column("excludeNudity", "Исключить наготу", "Exclude nudity"),
    column("excludeViolence", "Исключить насилие", "Exclude violence"),
    column("image", "Изображение загружено", "Image attached", 150),
    column("project", "Сценарий", "Screenplay", 200),
    column("version", "Версия сценария", "Script version", 130),
  ];
  const rows = [],
    blocks = [];
  const yesNo = (value) => (value ? label("Да", "Yes") : label("Нет", "No"));
  for (const scene of shotScenes(document, { allVariants: true })) {
    const settings = scene.settings;
    const row = {
      scene: scene.number,
      variant: scene.letter,
      name: shotReportName(scene),
      heading: scene.title,
      date: cleanShootingDate(settings.shootingDate),
      location: settings.location?.name || "",
      latitude: settings.location?.latitude ?? "",
      longitude: settings.location?.longitude ?? "",
      duration: scene.seconds,
      seconds: scene.seconds,
      pages: Number(scene.pages.toFixed(4)),
      excludeNudity: yesNo(settings.excludeNudity !== false),
      excludeViolence: yesNo(settings.excludeViolence !== false),
      image: yesNo(!!settings.image),
      project: document.title || "",
      version: scriptVersion(document).label,
    };
    for (const field of SHOT_FIELDS) {
      const value =
        settings[field.key] ||
        (field.key === "timeOfDay" ? scene.timeOfDay : "");
      row[field.key] =
        field.options.find((option) => option[0] === value)?.[language + 1] ||
        "";
    }
    rows.push(row);
    scene.blocks.forEach((block, index) => {
      const content = shotText(block);
      let offset = 0,
        part = 0;
      do {
        // Both Excel and Sheets have a per-cell text limit. Keep all text in
        // numbered parts, including surrogate pairs spanning the boundary.
        let end = Math.min(content.length, offset + 30000);
        if (end < content.length && /[\uD800-\uDBFF]/.test(content[end - 1]))
          end--;
        blocks.push({
          scene: scene.number,
          variant: scene.letter,
          name: row.name,
          block: index + 1,
          part: ++part,
          format: (FORMAT_NAMES[block.attrs?.format] || FORMAT_NAMES.action)[
            language
          ],
          text: content.slice(offset, end),
        });
        offset = end;
      } while (offset < content.length);
    });
  }
  return {
    columns,
    rows,
    blocks,
    blockColumns: [
      ...columns.slice(0, 3),
      column("block", "Блок", "Block", 60, "number"),
      column("part", "Часть блока", "Block part", 90, "number"),
      column("format", "Тип текста", "Text type", 120),
      column("text", "Текст", "Text", 600),
    ],
    shotSheet: label("Кадры", "Shots"),
    textSheet: label("Текст сцен", "Scene text"),
  };
}

function csvCell(value) {
  let text = String(value ?? "").replace(/\r\n?/g, "\n");
  // Keep user-entered text as text when a spreadsheet interprets CSV cells.
  // Actual negative coordinates are numbers and must stay sortable numbers.
  if (typeof value === "string" && /^[\s\u0000-\u001f]*[=+\-@]/.test(text))
    text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function exportShotReportCSV(document) {
  const report = shotReportTables(document);
  const columns = [...report.columns, ...report.blockColumns.slice(3)];
  const scenes = new Map(
    report.rows.map((row) => [`${row.scene}-${row.variant}`, row]),
  );
  const rows = report.blocks.map((block) => ({
    ...scenes.get(`${block.scene}-${block.variant}`),
    ...block,
  }));
  const lines = [columns.map((column) => csvCell(column.label)).join(",")];
  rows.forEach((row) =>
    lines.push(
      columns
        .map((column) =>
          csvCell(
            column.type === "duration"
              ? durationLabel(row[column.key])
              : row[column.key],
          ),
        )
        .join(","),
    ),
  );
  // A comma delimiter (no locale-specific sep= row) works with Sheets' import;
  // UTF-8 BOM also keeps Cyrillic readable in desktop spreadsheet applications.
  return new Blob(["\uFEFF", lines.join("\r\n"), "\r\n"], {
    type: "text/csv;charset=utf-8",
  });
}

export function xmlText(value) {
  return String(value ?? "")
    .toWellFormed()
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\r/g, "&#13;")
    .replace(/\n/g, "&#10;");
}

export function exportShotReportXML(document) {
  const report = shotReportTables(document);
  const sheet = (name, columns, rows) => {
    const cell = (value, column, alternate) => {
      let type = "String",
        style = alternate ? "Alternate" : "Default";
      if (column.type === "date" && value) {
        type = "DateTime";
        value = `${value}T00:00:00.000`;
        style = alternate ? "DateAlternate" : "Date";
      } else if (typeof value === "number" && Number.isFinite(value)) {
        type = "Number";
        const kind = {
          coordinate: "Coordinate",
          duration: "Duration",
          decimal: "Decimal",
        }[column.type];
        if (kind) style = `${kind}${alternate ? "Alternate" : ""}`;
        if (column.type === "duration") value /= 86400;
      }
      return `<Cell ss:StyleID="${style}"><Data ss:Type="${type}">${xmlText(value)}</Data></Cell>`;
    };
    return `<Worksheet ss:Name="${xmlText(name)}"><Table ss:ExpandedColumnCount="${columns.length}" ss:ExpandedRowCount="${rows.length + 1}">
      ${columns.map((column) => `<Column ss:Width="${column.width * 0.75}"/>`).join("")}
      <Row ss:Height="36">${columns.map((column) => `<Cell ss:StyleID="Header"><Data ss:Type="String">${xmlText(column.label)}</Data></Cell>`).join("")}</Row>
      ${rows.map((row, index) => `<Row>${columns.map((column) => cell(row[column.key], column, index % 2 === 1)).join("")}</Row>`).join("")}
      </Table><WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><DoNotDisplayGridlines/><FreezePanes/><FrozenNoSplit/><SplitHorizontal>1</SplitHorizontal><TopRowBottomPane>1</TopRowBottomPane><SplitVertical>3</SplitVertical><LeftColumnRightPane>3</LeftColumnRightPane><ActivePane>0</ActivePane></WorksheetOptions>
      <AutoFilter x:Range="R1C1:R${rows.length + 1}C${columns.length}" xmlns="urn:schemas-microsoft-com:office:excel"/></Worksheet>`;
  };
  const formats = {
    Date: "dd.mm.yyyy",
    Coordinate: "0.000000",
    Duration: "[m]:ss",
    Decimal: "0.0000",
  };
  const styles = Object.entries(formats)
    .flatMap(([id, format]) =>
      [false, true].map(
        (alternate) =>
          `<Style ss:ID="${id}${alternate ? "Alternate" : ""}" ss:Parent="${alternate ? "Alternate" : "Default"}"><NumberFormat ss:Format="${format}"/></Style>`,
      ),
    )
    .join("");
  return new Blob(
    [
      `<?xml version="1.0" encoding="UTF-8"?>
    <?mso-application progid="Excel.Sheet"?>
    <Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet" xmlns:x="urn:schemas-microsoft-com:office:excel">
    <Styles><Style ss:ID="Default" ss:Name="Normal"><Alignment ss:Vertical="Top" ss:WrapText="1"/><Font ss:FontName="Arial" ss:Size="10" ss:Color="#302A37"/></Style>
    <Style ss:ID="Header"><Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/><Font ss:FontName="Arial" ss:Size="10" ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#494251" ss:Pattern="Solid"/><Borders><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FFFFFF"/></Borders></Style>
    <Style ss:ID="Alternate"><Interior ss:Color="#F4F2F7" ss:Pattern="Solid"/></Style>${styles}</Styles>
    ${sheet(report.shotSheet, report.columns, report.rows)}${sheet(report.textSheet, report.blockColumns, report.blocks)}</Workbook>`,
    ],
    { type: "application/xml;charset=utf-8" },
  );
}

export async function exportShotReportXLSX(document) {
  const { shotReportXLSX } = await import("./shot-report-xlsx.js");
  return shotReportXLSX(shotReportTables(document));
}
