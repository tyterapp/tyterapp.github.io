import { zipSync, strToU8 } from "fflate";
import { xmlText } from "./shot-report-tables.js";

const namespace = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const relationships =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const declaration = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const columnName = (index) => {
  let name = "";
  for (let value = index + 1; value; value = Math.floor((value - 1) / 26)) {
    name = String.fromCharCode(65 + ((value - 1) % 26)) + name;
  }
  return name;
};

// Excel's 1900 date system includes a fictitious 29 February. Avoid timezone
// conversion, and retain pre-1900 shooting dates as ISO text rather than #VALUE.
function excelDate(value) {
  if (!value || value < "1900-01-01") return null;
  const day = Date.parse(`${value}T00:00:00Z`);
  return (
    (day - Date.UTC(1899, 11, 31)) / 86400000 + (value >= "1900-03-01" ? 1 : 0)
  );
}

function worksheet(columns, rows, stringCell) {
  const last = `${columnName(columns.length - 1)}${rows.length + 1}`;
  const cell = (row, column, columnIndex, rowIndex) => {
    let value = row[column.key];
    const alternate = rowIndex % 2;
    let style = alternate;
    if (column.type === "date") {
      const date = excelDate(value);
      if (date !== null && Number.isFinite(date)) {
        value = date;
        style = 7 + alternate;
      }
    } else if (typeof value === "number" && Number.isFinite(value)) {
      const base = { coordinate: 3, duration: 5, decimal: 9 }[column.type];
      if (base) style = base + alternate;
      if (column.type === "duration") value /= 86400;
    }
    const address = `${columnName(columnIndex)}${rowIndex + 2}`;
    return typeof value === "number" && Number.isFinite(value)
      ? `<c r="${address}" s="${style}"><v>${value}</v></c>`
      : stringCell(address, value, style);
  };
  const rowHeight = (row) =>
    Math.min(
      409,
      Math.max(
        28,
        ...columns.map((column) => {
          if (column.type !== "text") return 28;
          const lines = String(row[column.key] ?? "")
            .split(/\r\n?|\n/)
            .reduce(
              (total, line) =>
                total +
                Math.max(1, Math.ceil(line.length / (column.width / 7))),
              0,
            );
          return lines * 13 + 10;
        }),
      ),
    );
  return `${declaration}<worksheet xmlns="${namespace}"><dimension ref="A1:${last}"/>
    <sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane xSplit="3" ySplit="1" topLeftCell="D2" activePane="bottomRight" state="frozen"/><selection pane="bottomRight" activeCell="D2" sqref="D2"/></sheetView></sheetViews>
    <sheetFormatPr defaultRowHeight="28"/>
    <cols>${columns.map((column, index) => `<col min="${index + 1}" max="${index + 1}" width="${(column.width / 7).toFixed(2)}" customWidth="1"/>`).join("")}</cols>
    <sheetData><row r="1" ht="36" customHeight="1">${columns.map((column, index) => stringCell(`${columnName(index)}1`, column.label, 2)).join("")}</row>
    ${rows.map((row, index) => `<row r="${index + 2}" ht="${rowHeight(row)}" customHeight="1">${columns.map((column, columnIndex) => cell(row, column, columnIndex, index)).join("")}</row>`).join("")}</sheetData>
    <autoFilter ref="A1:${last}"/>
    <printOptions horizontalCentered="0"/><pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/>
    </worksheet>`;
}

function styles() {
  const xf = (fill, numFmtId = 0) =>
    `<xf numFmtId="${numFmtId}" fontId="0" fillId="${fill}" borderId="0" xfId="0" applyNumberFormat="1" applyFill="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>`;
  return `${declaration}<styleSheet xmlns="${namespace}">
    <numFmts count="4"><numFmt numFmtId="164" formatCode="0.000000"/><numFmt numFmtId="165" formatCode="[m]:ss"/><numFmt numFmtId="166" formatCode="dd.mm.yyyy"/><numFmt numFmtId="167" formatCode="0.0000"/></numFmts>
    <fonts count="2"><font><sz val="10"/><color rgb="FF302A37"/><name val="Arial"/></font><font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Arial"/></font></fonts>
    <fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF4F2F7"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF494251"/><bgColor indexed="64"/></patternFill></fill></fills>
    <borders count="2"><border/><border><right style="thin"><color rgb="FFFFFFFF"/></right></border></borders>
    <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
    <cellXfs count="11">${xf(0)}${xf(2)}<xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>${[164, 165, 166, 167].map((format) => xf(0, format) + xf(2, format)).join("")}</cellXfs>
    <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
    </styleSheet>`;
}

export function shotReportXLSX(report) {
  const strings = new Map();
  let stringCount = 0;
  const stringCell = (address, value, style) => {
    const text = String(value ?? "");
    if (!text) return `<c r="${address}" s="${style}"/>`;
    if (!strings.has(text)) strings.set(text, strings.size);
    stringCount++;
    return `<c r="${address}" s="${style}" t="s"><v>${strings.get(text)}</v></c>`;
  };
  const sheets = [
    { name: report.shotSheet, columns: report.columns, rows: report.rows },
    {
      name: report.textSheet,
      columns: report.blockColumns,
      rows: report.blocks,
    },
  ];
  const files = {
    "[Content_Types].xml": `${declaration}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>${sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`,
    "_rels/.rels": `${declaration}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${relationships}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    "xl/workbook.xml": `${declaration}<workbook xmlns="${namespace}" xmlns:r="${relationships}"><bookViews><workbookView activeTab="0"/></bookViews><sheets>${sheets.map((sheet, index) => `<sheet name="${xmlText(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("")}</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`,
    "xl/_rels/workbook.xml.rels": `${declaration}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="${relationships}/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join("")}<Relationship Id="rId3" Type="${relationships}/styles" Target="styles.xml"/><Relationship Id="rId4" Type="${relationships}/sharedStrings" Target="sharedStrings.xml"/></Relationships>`,
    "xl/styles.xml": styles(),
  };
  sheets.forEach((sheet, index) => {
    files[`xl/worksheets/sheet${index + 1}.xml`] = worksheet(
      sheet.columns,
      sheet.rows,
      stringCell,
    );
  });
  files["xl/sharedStrings.xml"] =
    `${declaration}<sst xmlns="${namespace}" count="${stringCount}" uniqueCount="${strings.size}">${[...strings.keys()].map((text) => `<si><t xml:space="preserve">${xmlText(text.replace(/_x[0-9a-f]{4}_/gi, (match) => `_x005F_${match.slice(1)}`))}</t></si>`).join("")}</sst>`;
  return new Blob(
    [
      zipSync(
        Object.fromEntries(
          Object.entries(files).map(([path, xml]) => [path, strToU8(xml)]),
        ),
        { level: 6 },
      ),
    ],
    {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    },
  );
}
