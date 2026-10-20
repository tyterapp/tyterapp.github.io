import {
  screenplayExportPages,
  continuesExportParagraph,
} from "./export-page-versions.js";
import { storyboardManifest } from "./storyboard-export.js";
import {
  SCRIPT_VERSIONS,
  scriptVersionExportStyle,
} from "./script-version-colors.js";
import { validFrameImage, STORY_STATUSES } from "./storyboard-data.js";
import { shotAspectRatio } from "./shot-image.js";
import { activeComponentUrl } from "./component-url.js";
import { isArrowOnly, splitArrowRun } from "./arrow-text.js";
import { getLanguage } from "./i18n.js";

const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );
const version = (id) =>
  SCRIPT_VERSIONS.find((item) => item.id === id) || SCRIPT_VERSIONS[0];
const sheetStyle = (id) =>
  `--sheet-light:${scriptVersionExportStyle(id).background};--sheet-dark:${version(id).id === "white" ? "var(--surface)" : `oklch(.31 ${version(id).chroma * 2} ${version(id).hue})`}`;

function inlineText(block, components) {
  return (block.content || [])
    .map((part) => {
      if (part.type === "hardBreak") return "<br>";
      if (part.type !== "text") return "";
      let text = splitArrowRun({ text: part.text || "" })
        .map((run) =>
          run.arrow
            ? `<span class="arrow">${escape(run.text)}</span>`
            : escape(run.text),
        )
        .join("");
      for (const mark of part.marks || []) {
        const tag = {
          bold: "strong",
          italic: "em",
          underline: "u",
          strike: "s",
        }[mark.type];
        if (tag) text = `<${tag}>${text}</${tag}>`;
        if (mark.type === "telegraph")
          text = `<span class="telegram">${text}</span>`;
        if (mark.type === "entity") {
          const component = components.find(
            (item) => item.id === mark.attrs?.id,
          );
          const color = /^#[\da-f]{6}$/i.test(component?.color || "")
            ? component.color
            : "";
          if (color) text = `<span style="color:${color}">${text}</span>`;
          const link = activeComponentUrl(component);
          if (link)
            text = `<a href="${escape(link)}" target="_blank" rel="noopener noreferrer">${text}</a>`;
        }
      }
      return text;
    })
    .join("");
}

const readerScript = `
(() => {
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  const select = (mode, updateHash = false) => {
    if (!['screenplay', 'storyboard'].includes(mode)) return;
    document.documentElement.dataset.view = mode;
    tabs.forEach(tab => {
      const selected = tab.dataset.view === mode;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      document.getElementById(tab.getAttribute('aria-controls')).hidden = !selected;
    });
    if (updateHash) history.replaceState(null, '', '#' + mode);
  };
  tabs.forEach(tab => {
    tab.addEventListener('click', () => select(tab.dataset.view, true));
    tab.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs[1] : tabs[1 - tabs.indexOf(tab)];
      select(next.dataset.view, true); next.focus();
    });
  });
  select(location.hash.slice(1) || document.documentElement.dataset.view);
  window.addEventListener('hashchange', () => select(location.hash.slice(1)));
})();`;

const readerCSS = `
:root{color-scheme:light dark;--canvas:#f5f4f7;--surface:#fff;--text:#302c37;--muted:#77717e;--line:#e4e0e9;--accent:#625575;font:15px/1.5 system-ui,sans-serif}
*{box-sizing:border-box}body{margin:0;background:var(--canvas);color:var(--text)}a{color:inherit}button,a{-webkit-tap-highlight-color:transparent}button{font:inherit}button:focus-visible,a:focus-visible{outline:3px solid var(--accent);outline-offset:3px}
.reader-header{position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:20px;padding:12px 24px;background:var(--surface);box-shadow:0 1px 0 var(--line)}.reader-brand{font-weight:750;text-decoration:none}.reader-header h1{margin:0;min-width:0;flex:1;font-size:14px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
[role=tablist]{display:flex;gap:4px;padding:4px;border-radius:12px;background:var(--canvas)}[role=tab]{border:0;min-height:40px;padding:8px 14px;border-radius:8px;background:transparent;color:var(--muted);cursor:pointer}[role=tab][aria-selected=true]{color:var(--text);background:var(--surface);box-shadow:0 1px 4px #00000012}.edit-link{display:flex;align-items:center;gap:8px;min-height:44px;padding:8px 14px;border-radius:10px;color:white;background:var(--accent);text-decoration:none;white-space:nowrap}.edit-link svg{width:16px;height:16px}
main{padding:32px 20px 64px}.reader-intro{max-width:820px;margin:0 auto 24px}.reader-intro h2{margin:0 0 8px;font-size:24px;overflow-wrap:anywhere}.reader-intro p{margin:0;color:var(--muted)}.poster{display:block;max-width:100%;max-height:460px;margin:20px auto;object-fit:contain;border-radius:8px}
.paper{max-width:820px;min-height:1000px;margin:0 auto 24px;padding:44px clamp(24px,9vw,112px) 72px;background:var(--sheet-light,var(--surface));border-radius:8px;box-shadow:0 1px 2px #00000008,0 4px 24px #00000008}.page-heading{display:flex;justify-content:space-between;gap:20px;margin:0 -12px 56px;font:12px/1.4 ReaderMono,'Courier New',monospace;color:var(--muted)}.page-version{display:flex;align-items:center;gap:6px}.page-version i{font-style:normal}
.script-block{min-height:1.35em;margin:0 0 14px;white-space:pre-wrap;overflow-wrap:anywhere;font:16px/1.35 ReaderArrow,ReaderMono,'Courier New',monospace}.format-scene{margin-top:24px;font-weight:700;text-transform:uppercase}.scene-label{display:block;color:var(--muted);font-size:11px;font-weight:400;margin-bottom:4px}.format-character{margin-left:36%;width:55%;margin-bottom:0;font-weight:700;text-transform:uppercase}.format-speech{margin-left:17%;width:58%}.format-parenthetical{margin-left:27%;width:48%;margin-bottom:0}.format-transition{text-align:right;text-transform:uppercase}.arrow-only{margin-left:0;width:100%;text-align:center}.telegram{background:color-mix(in srgb,currentColor 5%,transparent);box-decoration-break:clone}.arrow{font-family:ReaderArrow,monospace}
.reader-board{max-width:1100px;margin:auto}.board-scene{padding:24px;margin-bottom:24px;border-radius:16px;background:var(--sheet-light,var(--surface));box-shadow:0 0 0 1px var(--line)}.board-scene h3{margin:0;font-size:16px;overflow-wrap:anywhere}.scene-meta{margin:8px 0 20px;font-size:12px;color:var(--muted)}.frames{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}.frame{margin:0;min-width:0}.frame-media{position:relative;display:grid;place-items:center;aspect-ratio:var(--ratio,1.7778);background:color-mix(in srgb,currentColor 5%,transparent);border-radius:8px;overflow:hidden}.frame-media img{position:absolute;inset:0;display:block;min-width:0;width:100%;height:100%;object-fit:cover}.frame figcaption{margin-top:8px;font-size:12px;color:var(--muted)}.empty-frame{color:var(--muted);font-size:12px}.scene-description{white-space:pre-wrap;overflow-wrap:anywhere}.reader-empty{padding:40px;text-align:center;color:var(--muted)}[hidden]{display:none!important}
@media(prefers-color-scheme:dark){:root{--canvas:#1b1920;--surface:#2b2732;--text:#e2dce8;--muted:#b1aab9;--line:#403a48;--accent:#bca9d5}.paper,.board-scene{background:var(--sheet-dark,var(--surface))}.edit-link{color:#211d27}}
@media(max-width:700px){.reader-header{flex-wrap:wrap;gap:8px;padding:12px}.reader-header h1{flex-basis:calc(100% - 64px)}[role=tablist]{flex:1}[role=tab]{flex:1;min-height:44px;padding:8px 10px}.edit-link{padding:8px 12px}main{padding:20px 12px 40px}.paper{min-height:700px;padding:32px 24px 48px}.page-heading{margin:0 0 36px}.script-block{font-size:14px}.format-character{margin-left:30%;width:70%}.format-speech{margin-left:10%;width:85%}.format-parenthetical{margin-left:18%;width:78%}.board-scene{padding:16px}.frames{grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.reader-intro h2{font-size:20px}}
@media(max-width:380px){.frames{grid-template-columns:1fr}.edit-link{width:44px;padding:12px}.edit-link span{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}}
@media print{.reader-header{display:none}main{padding:0}.reader-intro{break-after:page}.paper{box-shadow:none;border-radius:0;break-after:page}.board-scene{break-inside:avoid;box-shadow:none}.frames{grid-template-columns:repeat(3,minmax(0,1fr))}}
`;

export function instantHTML(
  document,
  {
    fonts = [],
    view = "screenplay",
    language = "ru",
    editorURL = "https://tyterapp.github.io/free",
  } = {},
) {
  const en = language === "en",
    tr = (ru, english) => (en ? english : ru);
  const title = document.title || "untitled",
    manifest = storyboardManifest(document);
  const scenes = new Map(manifest.scenes.map((scene) => [scene.id, scene]));
  const pages = screenplayExportPages(document).pages;
  const screenplay = pages
    .map((page, index) => {
      const color = version(page.versionId),
        swatch = scriptVersionExportStyle(color.id);
      const paragraphs = page.content.content
        .map((block, blockIndex) => {
          const format = [
            "scene",
            "action",
            "character",
            "speech",
            "parenthetical",
            "transition",
            "plain",
          ].includes(block.attrs?.format)
            ? block.attrs.format
            : "action";
          const scene = scenes.get(block.attrs?.blockId);
          const label =
            format === "scene" &&
            scene &&
            !(
              blockIndex === 0 &&
              continuesExportParagraph(page, pages[index - 1])
            )
              ? [
                  document.settings?.exportSceneNumbers !== false
                    ? scene.number
                    : "",
                  document.settings?.exportSceneVariants !== false
                    ? scene.variant
                    : "",
                ]
                  .filter(Boolean)
                  .join(" ")
              : "";
          const text = (block.content || [])
            .map((part) => part.text || "")
            .join("");
          return `<p class="script-block format-${format}${isArrowOnly(text) ? " arrow-only" : ""}">${label ? `<span class="scene-label">${escape(label)}</span>` : ""}${inlineText(block, document.components || []) || "<br>"}</p>`;
        })
        .join("");
      return `<article class="paper" style="${sheetStyle(color.id)}" aria-label="${tr("Страница", "Page")} ${page.pageNumber}"><header class="page-heading"><span class="page-version"><i style="color:${swatch.color}">${swatch.symbol}</i>${escape(color.label)}</span><span>${page.pageNumber}</span></header>${paragraphs}</article>`;
    })
    .join("");
  const storyboard = manifest.scenes
    .map((scene) => {
      const status =
        STORY_STATUSES.find(([id]) => id === scene.settings.status) ||
        STORY_STATUSES[0];
      const meta = [
        `${tr("Страница", "Page")} ${scene.screenplayPage} · ${scene.pageVersion.label}`,
        `${tr("Акт", "Act")} ${scene.settings.act || 1}`,
        status[en ? 2 : 1],
        `${tr("Драматичность", "Drama")} ${scene.settings.drama || 0}/10`,
        scene.settings.shootingDate,
        scene.settings.location?.name || scene.settings.location?.address,
      ]
        .filter(Boolean)
        .map(escape)
        .join(" · ");
      const frames = scene.frames
        .map(
          (frame) =>
            `<figure class="frame"><div class="frame-media" style="--ratio:${shotAspectRatio(scene.settings.aspectRatio) || 16 / 9}">${validFrameImage(frame.image) ? `<img src="${frame.image}" alt="${escape(`${scene.number} ${scene.variant} / ${frame.number} — ${scene.title}`)}" loading="lazy">` : `<span class="empty-frame">${tr("Нет изображения", "No image")}</span>`}</div><figcaption>${scene.number} ${escape(scene.variant)} / ${frame.number} · ${frame.durationMs / 1000} ${tr("с", "s")}</figcaption></figure>`,
        )
        .join("");
      return `<article class="board-scene" style="${sheetStyle(scene.pageColor)}"><h3>${scene.number} ${escape(scene.variant)} · ${escape(scene.title)}</h3><p class="scene-meta">${meta}</p>${scene.settings.synopsis ? `<p class="scene-description">${escape(scene.settings.synopsis)}</p>` : ""}<div class="frames">${frames || `<p class="empty-frame">${tr("В сцене пока нет кадров", "No frames in this scene yet")}</p>`}</div>${scene.settings.frameComment ? `<p class="scene-description">${escape(scene.settings.frameComment)}</p>` : ""}</article>`;
    })
    .join("");
  const fontCSS = fonts
    .map(
      ({ style, base64 }) =>
        `@font-face{font-family:${style === "Arrow" ? "ReaderArrow" : "ReaderMono"};src:url(data:font/ttf;base64,${base64}) format('truetype');font-weight:${style.includes("Bold") ? 700 : 400};font-style:${style.includes("Italic") ? "italic" : "normal"};${style === "Arrow" ? "unicode-range:U+2190-21FF;" : ""}}`,
    )
    .join("");
  const initial = view === "storyboard" ? "storyboard" : "screenplay";
  const edit = /^https?:\/\//.test(editorURL)
    ? editorURL
    : "https://tyterapp.github.io/free";
  return `<!doctype html>
<html lang="${en ? "en" : "ru"}" data-view="${initial}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${escape(title)} — Tyter</title><meta name="description" content="${escape(tr("Сценарий и раскадровка · Только чтение", "Screenplay and storyboard · Read only"))}"><style>${fontCSS}${readerCSS}</style></head>
<body><header class="reader-header"><a class="reader-brand" href="https://tyterapp.github.io/">Tyter</a><h1>${escape(title)}</h1><nav role="tablist" aria-label="${tr("Режим просмотра", "Reading mode")}"><button id="tab-screenplay" role="tab" data-view="screenplay" aria-controls="screenplay" aria-selected="${initial === "screenplay"}" tabindex="${initial === "screenplay" ? 0 : -1}">${tr("Сценарий", "Screenplay")}</button><button id="tab-storyboard" role="tab" data-view="storyboard" aria-controls="storyboard" aria-selected="${initial === "storyboard"}" tabindex="${initial === "storyboard" ? 0 : -1}">${tr("Раскадровка", "Storyboard")}</button></nav><a class="edit-link" href="${escape(edit)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m15 5 4 4M4 20l5-1L20 8a3 3 0 0 0-4-4L5 15z"/></svg><span>${tr("Редактировать", "Edit")}</span></a></header>
<main><div class="reader-intro"><h2>${escape(title)}</h2><p>${[document.metadata?.author, document.metadata?.year, document.metadata?.email].filter(Boolean).map(escape).join(" · ")}</p>${validFrameImage(document.metadata?.poster) ? `<img class="poster" src="${document.metadata.poster}" alt="${escape(title)}">` : ""}</div><section id="screenplay" role="tabpanel" aria-labelledby="tab-screenplay"${initial !== "screenplay" ? " hidden" : ""}>${screenplay}</section><section id="storyboard" class="reader-board" role="tabpanel" aria-labelledby="tab-storyboard"${initial !== "storyboard" ? " hidden" : ""}>${storyboard || `<p class="reader-empty">${tr("В документе пока нет сцен", "No scenes in this document yet")}</p>`}</section></main><script>${readerScript}</script></body></html>`;
}

export async function exportInstantHTML(
  document,
  { view = "screenplay" } = {},
) {
  const { getFonts } = await import("./exports.js");
  const fonts = await getFonts();
  const response = await fetch("/fonts/OpenArrow-Regular.ttf");
  if (!response.ok) throw new Error("Не удалось загрузить шрифт стрелок.");
  const bytes = new Uint8Array(await response.arrayBuffer());
  const arrow = {
    style: "Arrow",
    base64: btoa(
      Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""),
    ),
  };
  const origin = ["http:", "https:"].includes(globalThis.location?.protocol)
    ? location.origin
    : "https://tyterapp.github.io";
  return new Blob(
    [
      instantHTML(document, {
        fonts: [...fonts, arrow],
        view,
        language: getLanguage(),
        editorURL: origin + "/free",
      }),
    ],
    { type: "text/html;charset=utf-8" },
  );
}
