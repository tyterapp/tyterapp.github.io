import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { BLOG_ARTICLES } from "../src/site-content.js";
import {
  HOUSE_SNAPSHOT_SCENES,
  houseSnapshotScene,
  houseSnapshotRoute,
} from "../src/house-snapshot.js";

const origin = "https://tyterapp.github.io";
const escape = (value) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
export function pageMetadata(html, route = "") {
  const article = BLOG_ARTICLES.find(({ slug }) => route === `blog/${slug}`);
  const houseScene = houseSnapshotScene(`/${route}`);
  const house = route === "house" || !!houseScene;
  const pages = {
    telegraph: [
      "Телеграф Tyter — написать телеграмму",
      "Напишите телеграмму азбукой Морзе и поделитесь ею по ссылке. Телеграф, чистый лист и ничего лишнего.",
    ],
    case: [
      "Tyter — продуктовый кейс: от текста к кадру",
      "Как создавался Tyter: продуктовые решения, развитие редактора и раскадровок, дизайн-система, бренд и план измерения конверсии, удержания и маркетинга.",
    ],
    telegram: [
      "Телеграмма — Tyter",
      "Послушайте телеграмму, переданную азбукой Морзе в Tyter.",
    ],
    design: [
      "Дизайн Tyter — брендбук, гайдлайны и UI кит",
      "Логотип, палитра, типографика и элементы интерфейса Tyter. Материалы для работы с брендом.",
    ],
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
    house: [
      "Снимок домика — Tyter · OiiA",
      "Домик и питомец OiiA в Tyter. Посмотрите снимок и скачайте PNG.",
    ],
    404: [
      "Страница не найдена — Tyter",
      "Проверьте адрес или вернитесь к своей истории в Tyter.",
    ],
  };
  const [title, description] = article
    ? [`${article.title[0]} — Tyter`, article.summary[0]]
    : pages[house ? "house" : route] || pages.free;
  const url =
    origin +
    (houseScene
      ? houseSnapshotRoute(houseScene)
      : route === "telegraph"
        ? "/telegraph/"
        : route
          ? `/${route}`
          : "/");
  const cover = house
    ? `${origin}${houseSnapshotRoute(houseScene || HOUSE_SNAPSHOT_SCENES[0])}cover.png`
    : route === "telegram"
      ? `${origin}/telegram/cover-generic-v2.png`
      : route === "telegraph"
        ? `${origin}/telegraph/cover-white-v1.png`
        : null;
  const imageAlt =
    route === "telegram"
      ? "Телеграмма Tyter"
      : route === "telegraph"
        ? "Телеграф Tyter"
        : houseScene?.skin
          ? "Домик с котиком OiiA в Tyter"
          : "Домик OiiA в Tyter";
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
    ...(cover
      ? {
          "og:image": cover,
          "og:image:secure_url": cover,
          "og:image:type": "image/png",
          "og:image:width": "1200",
          "og:image:height": "630",
          "og:image:alt": imageAlt,
          "twitter:card": "summary_large_image",
          "twitter:image":
            route === "telegraph"
              ? `${origin}/telegraph/cover-x-v2.jpg`
              : cover,
          "twitter:image:alt": imageAlt,
        }
      : {}),
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
  if (route === "telegraph") {
    html = html.replace(
      /<link\s+rel="icon"[^>]*>/,
      '<link rel="icon" type="image/png" sizes="32x32" href="/telegraph/favicon-32.png" />',
    );
    html = html.replace(
      "</head>",
      `
    <link rel="apple-touch-icon" sizes="180x180" href="/telegraph/apple-touch-icon.png" />
    <link rel="manifest" href="/telegraph/manifest.webmanifest" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-title" content="Telegraph" />
    <meta name="apple-mobile-web-app-status-bar-style" content="default" />
    </head>`,
    );
  }
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
    "design",
    "case",
    "telegraph",
    ...BLOG_ARTICLES.map(({ slug }) => `blog/${slug}`),
  ];
  await writeFile(
    path.join(output, "sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((route) => `<url><loc>${origin}${route ? `/${route}` : "/"}</loc></url>`).join("")}</urlset>\n`,
  );
}
