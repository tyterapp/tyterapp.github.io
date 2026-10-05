# Tyter: повторная публикация через Git Bash

Инструкция для уже существующего репозитория **tyterapp/tyterapp.github.io** и вашей распакованной папки **D:/Tyter/publication/tyterapp.github.io**.

Сайт приложения: https://tyterapp.github.io/. Список ключей хранится в уже созданном repository secret **TYTER_PRO_CODES** репозитория **tyterapp/tyterapp.github.io**, как на вашем скриншоте. GitHub Actions получает его при сборке и создаёт файл проверки https://tyterapp.github.io/codes-for-pro.txt. Браузер проверяет доступ по этому файлу; прежний адрес sergeybukharev.github.io не используется.

Сборка публикует только хеши пар «ключ + email», без самих кодов и адресов. В секрете остаётся обычный формат `[ABC123][person@example.com]`. Не создавайте открытый файл с исходным списком в репозитории.

Изменение секрета само по себе сайт не обновляет: после него обязательно нужен новый запуск **Publish Tyter MVP**.

В распакованной папке уже исправлены адрес проверки и сборка GitHub Pages. Переименование папки под репозиторий само по себе не связывает её с GitHub. Сейчас в ней нет `.git`, поэтому ниже создаётся отдельная локальная копия существующего репозитория, а затем в неё копируются исходники. История коммитов сохраняется.

Выполняйте блоки в **Git Bash**, а не PowerShell. Диск D: обозначается `/d/`. Вставка — **Shift + Insert**. Если команда завершилась ошибкой, сначала исправьте её, затем продолжайте.

## Шаг 1. Проверьте папку с исходниками

Откройте Git Bash и выполните:

```bash
cd /d/Tyter/publication/tyterapp.github.io
pwd
ls -a
head -n 2 src/pro-access.js
```

`pwd` должен показать `/d/Tyter/publication/tyterapp.github.io`. В списке должны быть `package.json`, `src`, `public`, `scripts` и `.github`.

Последняя команда должна показать:

```js
export const PRO_CODES_URL = "https://tyterapp.github.io/codes-for-pro.txt";
```

Если указан другой адрес, используйте обновлённые файлы из текущей папки D:/Tyter или свежий архив `D:/Tyter/publication/tyter-github-pages-source.zip`. Для распаковки свежего архива в эту папку:

```bash
unzip -o ../tyter-github-pages-source.zip
```

Если адрес правильный, повторно распаковывать архив не нужно.

## Шаг 2. Загрузите существующий репозиторий

Один раз создайте отдельную копию репозитория:

```bash
cd /d/Tyter/publication
git clone https://github.com/tyterapp/tyterapp.github.io.git github-pages-repo
cd /d/Tyter/publication/github-pages-repo
git remote -v
git status --short
```

Папка `github-pages-repo` — рабочая копия GitHub. Папка `tyterapp.github.io` рядом — ваши распакованные исходники. Новый репозиторий на GitHub создавать не нужно.

Если `github-pages-repo` уже существует и в ней есть `.git`, повторный `git clone` пропустите. Перейдите в неё и выполните только `git remote -v` и `git status --short`. `origin` должен вести на **tyterapp/tyterapp.github.io**. Если показаны незавершённые изменения, сначала сохраните свои правки отдельным коммитом или резервной копией.

Когда рабочая копия чистая, получите последнюю версию:

```bash
git switch main
git pull --ff-only origin main
```

## Шаг 3. Скопируйте обновлённые исходники

Находясь в `github-pages-repo`, выполните оба блока целиком:

```bash
cd /d/Tyter/publication/github-pages-repo
cp -R ../tyterapp.github.io/{.github,build-resources,checks,desktop,docs,public,scripts,server,src,tests} .
cp ../tyterapp.github.io/{.env.example,.gitignore,README.md,index.html,local-files-plugin.js,package.json,package-lock.json,payment-plugin.js,playwright.config.js,playwright.pages.config.js,vite.config.js,web-pro-plugin.js} .
```

Команды заменяют совпадающие исходники и добавляют новые. `.git`, зависимости, личные документы и реальный список ключей не копируются. В текущем обновлении удалять старые файлы вручную не требуется.

Проверьте результат:

```bash
head -n 2 src/pro-access.js
git status --short
git diff --stat
```

Адрес в выводе снова должен быть `https://tyterapp.github.io/codes-for-pro.txt`.

## Шаг 4. Проверьте сборку

Для локальной проверки нужен **Node.js 22 или новее**. Проверьте версии:

```bash
node --version
npm --version
```

Если Node.js не установлен, установите его с [официального сайта](https://nodejs.org/en/download), закройте Git Bash и откройте снова. Затем вернитесь в `github-pages-repo`.

Установите зависимости и проверьте приложение:

```bash
cd /d/Tyter/publication/github-pages-repo
ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci
npm run build
```

Дождитесь успешного завершения сборки. Эта команда проверяет приложение без доступа к ключам. Полную сборку Pages выполнит GitHub Actions с вашим секретом; локально скачивать или вводить значение секрета не нужно.

Если Node.js пока не установлен, можно пропустить только локальную проверку этого шага: GitHub Actions сам установит Node.js и зависимости при публикации.

## Шаг 5. Проверьте настройку Pages на GitHub

Откройте [репозиторий tyterapp/tyterapp.github.io](https://github.com/tyterapp/tyterapp.github.io) → **Settings → Pages**.

В разделе **Build and deployment → Source** выберите **GitHub Actions**, если это ещё не сделано. Шаблон workflow добавлять не нужно: проект содержит `.github/workflows/pages.yml`. [Официальная инструкция GitHub](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

В **Settings → Secrets and variables → Actions → Secrets → Repository secrets** должен находиться ваш существующий секрет **TYTER_PRO_CODES**. Повторно создавать его не нужно. GitHub не показывает сохранённое значение; при необходимости нажмите карандаш справа и замените список целиком.

Формат значения — одна пара на строку:

```text
[ABC123][person@example.com]
[DEF456][]
```

Это примеры, а не действующие ключи. Используйте свои шестизначные коды из латинских букв или цифр и email пользователей. Строка с пустым email доступа не даёт. Регистр email и ключа не важен. Не присылайте содержимое секрета в чат и не вставляйте его в команды Git Bash. [Как GitHub Actions использует секреты](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets).

Workflow уже передаёт `secrets.TYTER_PRO_CODES` в сборку. В исходниках реального списка нет; на сайте публикуются только проверочные хеши.

## Шаг 6. Сохраните изменения и отправьте их

Если Git ещё не знает автора коммитов, один раз задайте свои данные. Замените примеры именем и email вашего аккаунта GitHub:

```bash
git config user.name "Ваше имя"
git config user.email "you@example.com"
```

Подготовьте обновление и просмотрите список:

```bash
git add .
git diff --cached --stat
git diff --cached --name-only
```

В списке должны быть исходники приложения и документация. Не должно быть личных сценариев, реального `codes-for-pro.txt`, `.env` с секретами, `node_modules`, установщиков или папки `github-pages`. `.env.example` — шаблон, он входит в проект.

Отправьте новую версию:

```bash
git commit -m "Update Tyter Pages and connect PRO codes secret"
git push origin main
```

При запросе входа используйте аккаунт с правами записи в этот репозиторий. Git Credential Manager может открыть браузер для входа.

Если `git commit` пишет `nothing to commit`, файлы уже совпадают с сохранённой версией. Если `git push` пишет `Everything up-to-date`, новых коммитов нет — для повторной публикации перейдите к ручному запуску в следующем шаге.

Если `push` отклонён из-за новых изменений на GitHub, после сохранения своих правок выполните:

```bash
git pull --rebase origin main
git push origin main
```

При конфликте остановитесь и разберите отмеченные файлы. Обычное обновление не требует `git push --force` или `git reset --hard`.

## Шаг 7. Дождитесь публикации или перезапустите её вручную

Откройте [Actions](https://github.com/tyterapp/tyterapp.github.io/actions) → **Publish Tyter MVP**. После `push` новый запуск начнётся автоматически.

Если нужно повторно опубликовать уже отправленные файлы, нажмите **Run workflow → Branch: main → Run workflow**. Этот запуск использует последнюю версию файлов в GitHub; неотправленные изменения на компьютере в него не попадут.

Дождитесь зелёного статуса задания **deploy**. Workflow установит зависимости, соберёт приложение и опубликует папку `github-pages`. [Публикация через GitHub Actions](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

Если статус красный, откройте запуск → **deploy** → шаг с ошибкой. Если ошибка сообщает, что `TYTER_PRO_CODES` отсутствует или пуст, проверьте имя секрета, его значение и репозиторий в шаге 5. Если указана ошибка формата строки, замените список в секрете правильным значением и повторите запуск. Не вставляйте секрет непосредственно в workflow. Если Pages не настроен, вернитесь к шагу 5. Если Actions отключены, включите их в **Settings → Actions → General**.

## Шаг 8. Проверьте сайт после публикации

| Что проверить       | Адрес / ожидаемый результат                  |
| ------------------- | -------------------------------------------- |
| Лендинг             | https://tyterapp.github.io/                  |
| Бесплатный редактор | https://tyterapp.github.io/free/             |
| PRO                 | https://tyterapp.github.io/pro/              |
| Страница ошибки     | https://tyterapp.github.io/404/              |
| Список доступа      | https://tyterapp.github.io/codes-for-pro.txt |

1. Откройте лендинг и бесплатную версию. Обновление страницы на `/free/` должно снова открыть редактор.
2. В PRO введите **email и ключ из одной строки списка в TYTER_PRO_CODES**. Формат строки: `[ABC123][person@example.com]`. Это пример, а не действующий ключ.
3. Верная пара открывает редактор; неизвестный ключ, чужой email или пустой email в файле дают сообщение об ошибке. Ключ без назначенного email доступа не даёт.
4. Закройте и снова откройте PRO в том же браузере: сохранённый вход проверится автоматически. Обновление страницы на `/pro/` должно работать.
5. Открытые до публикации вкладки обновите через **Ctrl + F5**. Данные сайта очищать не нужно: документы хранятся локально на том же домене. Важные проекты можно заранее сохранить в TYT.

Для проверки ключа нужен интернет. При недоступности файла PRO покажет ошибку и предложит повторить проверку; локальные документы сохранятся.

## Как менять ключи после публикации

1. Откройте **tyterapp/tyterapp.github.io → Settings → Secrets and variables → Actions → Secrets**.
2. Нажмите карандаш рядом с **TYTER_PRO_CODES**.
3. Вставьте актуальный список целиком в формате `[ключ][email]` и сохраните. Для отзыва доступа удалите строку или очистите email.
4. Откройте **Actions → Publish Tyter MVP → Run workflow → Branch: main → Run workflow**.
5. Дождитесь зелёного статуса. Только после этого список проверки на сайте будет обновлён.

Коммит для изменения секрета не нужен, но запуск workflow обязателен. Открытый PRO проверяет опубликованный список раз в минуту и при возвращении во вкладку. До новой публикации действует предыдущий список.

По адресу https://tyterapp.github.io/codes-for-pro.txt должен открываться текст с полями `version`, `pairs` и `unassigned` и длинными хешами. Кодов и email там быть не должно. Не редактируйте этот опубликованный файл вручную — он создаётся сборкой из секрета.

## Последующие обновления приложения

Обновите распакованные исходники в `D:/Tyter/publication/tyterapp.github.io`, затем повторите шаги 2–8: получите изменения из GitHub, скопируйте новые исходники, соберите, сохраните коммит и отправьте его. Если исходники уже изменялись прямо в `github-pages-repo`, копирование из соседней папки не требуется.
