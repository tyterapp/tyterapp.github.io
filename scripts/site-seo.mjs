import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { BLOG_ARTICLES } from "../src/site-content.js";

const origin = "https://tyterapp.github.io";
const escape = (value) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
export function pageMetadata(html, route = "") {
  const article = BLOG_ARTICLES.find(({ slug }) => route === `blog/${slug}`);
  const pages = {
    "": [
      "Tyter — сценарий без хаоса",
      "Редактор сценариев с подсказками, версиями, карточками истории и подготовкой к съёмкам. Пишите бесплатно или выбирайте PRO.",
    ],
    b: [
      "Tyter PRO — 600 ₽ в месяц",
      "Сценарии без хаоса: редактор, аутлайн, реквизит и полный проект TYT. PRO за 600 ₽ в месяц через Boosty.",
    ],
    blog: [
      "Блог Tyter — о сценариях и работе с историей",
      "Сценарный формат, карточки истории и сохранение проектов. Практические статьи о работе в Tyter.",
    ],
    help: [
      "Помощь Tyter",
      "Ответы на вопросы о редакторе, экспорте, PRO и работе без интернета. Помощь и чат Tyter.",
    ],
    free: [
      "Tyter Free — бесплатный редактор сценариев",
      "Пишите сценарии бесплатно: форматирование, версии, комментарии и экспорт PDF, DOCX и FDX. Локальное сохранение на вашем устройстве.",
    ],
    pro: [
      "Tyter PRO — редактор сценариев",
      "Безлимитные проекты и компоненты, аутлайн, реквизит и файлы TYT. Вход в Tyter PRO.",
    ],
    beta: [
      "Tyter PRO — вход в редактор",
      "Вход в PRO-редактор Tyter по email и ключу. Ваши сценарии сохраняются локально.",
    ],
    house: ["Домик oiia — Tyter", "Снимок домика пользователя Tyter."],
    404: [
      "Страница не найдена — Tyter",
      "Проверьте адрес или вернитесь к своей истории в Tyter.",
    ],
  };
  const [title, description] = article
    ? [`${article.title[0]} — Tyter`, article.summary[0]]
    : pages[route] || pages.free;
  const url = origin + (route ? `/${route}` : "/");
  html = html.replace(
    /<title>[\s\S]*?<\/title>/,
    `<title>${escape(title)}</title>`,
  );
  html = html.replace(
    /(<meta\s+name="description"\s+content=")[^"]*("\s*\/>)/,
    `$1${escape(description)}$2`,
  );
  for (const [key, value] of Object.entries({
    "og:title": title,
    "og:description": description,
    "og:url": url,
    "og:type": article ? "article" : "website",
    "twitter:title": title,
    "twitter:description": description,
  }))
    html = html.replace(
      new RegExp(
        `(<meta\\s+(?:property|name)="${key}"\\s+content=")[^"]*("\\s*\\/>)`,
      ),
      `$1${escape(value)}$2`,
    );
  html = html.replace(
    /(<link rel="canonical" href=")[^"]*("\s*\/>)/,
    `$1${url}$2`,
  );
  if (route === "404")
    html = html.replace(
      "</head>",
      '<meta name="robots" content="noindex" /></head>',
    );
  return html;
}

export async function writeSiteSeo(output) {
  const index = path.join(output, "index.html");
  await writeFile(index, pageMetadata(await readFile(index, "utf8")));
  const urls = [
    "",
    "b",
    "blog",
    "help",
    ...BLOG_ARTICLES.map(({ slug }) => `blog/${slug}`),
  ];
  await writeFile(
    path.join(output, "sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((route) => `<url><loc>${origin}${route ? `/${route}` : "/"}</loc></url>`).join("")}</urlset>\n`,
  );
}
