# Tyter MVP: публикация на GitHub Pages через Git Bash

Готовый сайт будет работать по адресу [tyterapp.github.io](https://tyterapp.github.io/). Репозиторий — [tyterapp/tyterapp.github.io](https://github.com/tyterapp/tyterapp.github.io).

| Страница          | Адрес                           |
| ----------------- | ------------------------------- |
| Лендинг           | https://tyterapp.github.io      |
| Бесплатная версия | https://tyterapp.github.io/free |
| PRO               | https://tyterapp.github.io/pro  |
| Страница 404      | https://tyterapp.github.io/404  |

Используйте ваш новый аккаунт **tyterapp** и репозиторий **tyterapp/tyterapp.github.io**. Название репозитория должно точно совпадать с **tyterapp.github.io**, чтобы сайт открывался в корне этого домена. [Правило адресов GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages).

Лендинг, бесплатный редактор и PRO работают без отдельного сервера. PRO проверяет пару email/ключ из [codes-for-pro.txt](https://tyterapp.github.io/codes-for-pro.txt). Сценарии пользователей сохраняются на их устройствах.

Ниже команды предназначены именно для **Git Bash**, а не PowerShell или командной строки Windows. Выполняйте блоки по очереди; если команда завершилась ошибкой, сначала исправьте её. Вставить команду в Git Bash можно через **Shift + Insert** или правую кнопку мыши → **Paste**.

## 1. Подготовьте Git Bash и архив проекта

1. Установите [Git for Windows](https://git-scm.com/install/windows). Оставьте включённым Git Credential Manager для входа в GitHub.
2. Откройте **Git Bash** из меню «Пуск».
3. Проверьте установку:

```bash
git --version
```

Используйте подготовленный архив **D:/Tyter/publication/tyter-github-pages-source.zip**. Он содержит исходники и workflow публикации; зависимости и установщики в него не включены.

Если вы меняли исходники в D:/Tyter после создания архива, обновите его. Для этой команды нужен [Node.js](https://nodejs.org/) версии 22 или новее:

```bash
cd /d/Tyter
npm run site:github:source
```

В Git Bash диск D: обозначается **/d/**, например D:/Tyter → /d/Tyter. Если архив находится в другой папке, замените его путь в команде распаковки ниже. Путь с пробелами заключайте в двойные кавычки.

Если npm run site:github:source сообщает, что модуль fflate не найден, один раз выполните **npm ci** в папке D:/Tyter и повторите создание архива.

## 2. Подготовьте репозиторий и GitHub Pages

1. Войдите на github.com под вашим новым аккаунтом **tyterapp**.
2. Откройте **tyterapp/tyterapp.github.io**. Если репозитория ещё нет, создайте публичный репозиторий **tyterapp.github.io**, выбрав **Owner: tyterapp**, добавьте README и выберите основную ветку **main**.
3. Откройте **Settings → Pages**.
4. В **Build and deployment → Source** выберите **GitHub Actions**. Предлагаемый шаблон добавлять не нужно: в проекте уже есть .github/workflows/pages.yml. [Инструкция GitHub](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

Используйте именно этот репозиторий: приложение рассчитано на корень tyterapp.github.io, без дополнительного пути /Tyter/. Публикация заменит главную страницу существующего сайта, сохранив историю репозитория.

## 3. Добавьте список пользователей PRO

Это нужно сделать **до первой отправки проекта**, чтобы сборка сразу получила список ключей.

Откройте ваш codes-for-pro.txt на компьютере. Одна строка — одна пара:

```text
[AB12CD][person@example.com]
[EF34GH][another@example.com]
[JK56LM][]
```

Это примеры формата; используйте свои ключи и email. Ключ содержит ровно шесть латинских букв или цифр. Регистр ключа и email не важен. Пустой email, null или некорректный адрес не дают доступа. Email должен находиться в той же строке, что и ключ пользователя.

1. В репозитории откройте **Settings → Secrets and variables → Actions**.
2. На вкладке **Secrets** нажмите **New repository secret**.
3. В **Name** введите **TYTER_PRO_CODES**.
4. В **Secret** вставьте всё содержимое вашего codes-for-pro.txt.
5. Нажмите **Add secret**. [Инструкция GitHub](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets).

Workflow возьмёт этот список и положит codes-for-pro.txt в корень готового сайта. Исходный файл не входит в архив проекта. Если список не задан, сборка остановится и объяснит, что нужно добавить TYTER_PRO_CODES.

По выбранной схеме готовый файл с email и ключами **общедоступен**. Secret исключает список из архива исходников, но не скрывает опубликованный файл. Проверку доступа в JavaScript можно обойти; это ограничение статического MVP.

## 4. Клонируйте репозиторий через Git Bash

Создайте отдельную рабочую папку и загрузите в неё репозиторий:

```bash
mkdir -p /d/GitHub
cd /d/GitHub
git clone https://github.com/tyterapp/tyterapp.github.io.git tyterapp.github.io
cd /d/GitHub/tyterapp.github.io
git switch main
```

Это обычное клонирование через HTTPS. [Инструкция GitHub](https://docs.github.com/en/repositories/creating-and-managing-repositories/cloning-a-repository).

Если вы уже клонировали репозиторий в эту папку, не выполняйте git clone повторно. Вместо этого:

```bash
cd /d/GitHub/tyterapp.github.io
git status --short
```

Если команда показывает изменения, сначала сохраните или завершите свои текущие правки. Когда рабочая папка чистая:

```bash
git switch main
git pull --ff-only origin main
```

## 5. Распакуйте проект и отправьте изменения

Убедитесь, что вы находитесь в клонированном репозитории:

```bash
cd /d/GitHub/tyterapp.github.io
pwd
git remote -v
```

Адрес origin должен вести на **tyterapp/tyterapp.github.io**. Теперь распакуйте подготовленные исходники прямо в эту папку:

```bash
unzip -o /d/Tyter/publication/tyter-github-pages-source.zip
ls -a
```

unzip обновит файлы с совпадающими именами. В корне должны появиться **package.json**, **package-lock.json**, **index.html**, **vite.config.js**, папки **src**, **public**, **scripts**, **.github**. Дополнительной вложенной папки Tyter быть не должно. Папку .git и историю репозитория архив не меняет.

Если unzip недоступен, распакуйте архив через Проводник в **D:/GitHub/tyterapp.github.io**, сохранив папку .github, затем продолжайте команды в Git Bash.

Один раз задайте автора коммитов для этого репозитория. Замените имя и email своими данными GitHub; email для входа в PRO здесь не нужен:

```bash
git config user.name "Ваше имя"
git config user.email "you@example.com"
```

Просмотрите и подготовьте изменения:

```bash
git status --short
git add .
git diff --cached --stat
git diff --cached --name-only
```

В списке должны быть исходники проекта и **.github/workflows/pages.yml**. Не должно быть .env с реальными секретами, файлов сессий, личных сценариев, node_modules, release или установщиков. Файл .env.example — шаблон, он входит в проект. Проверьте список перед следующими командами.

Отправьте проект:

```bash
git commit -m "Publish Tyter MVP"
git push -u origin main
```

При первом push Git Credential Manager может открыть окно входа в браузере: войдите в аккаунт с правами на **tyterapp/tyterapp.github.io**. Пароль аккаунта GitHub не подходит для обычного HTTPS-запроса Git; используйте предложенный вход через браузер. [Авторизация GitHub](https://docs.github.com/en/get-started/git-basics/caching-your-github-credentials-in-git).

Если git commit отвечает **nothing to commit**, файлы уже совпадают с текущим коммитом. Это нормально. Не используйте принудительную отправку: при отказе push сначала разберите причину ошибки.

Не отправляйте ZIP единственным файлом: GitHub Pages его не распаковывает. Здесь отправляются распакованные исходники; GitHub Actions самостоятельно установит зависимости и соберёт сайт.

## 6. Дождитесь публикации

1. Откройте репозиторий на GitHub → **Actions**.
2. Выберите **Publish Tyter MVP**.
3. Дождитесь зелёного статуса сборки и публикации.
4. Откройте **Settings → Pages → Visit site**.

Workflow запускается после push в main. Также его можно запустить вручную: **Actions → Publish Tyter MVP → Run workflow → main → Run workflow**. Сборка публикует папку github-pages через Actions; выбирать ветку gh-pages или папку docs для Pages не нужно. [Публикация через Actions](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

Проверьте готовый сайт:

- [Главная](https://tyterapp.github.io/) — лендинг.
- [Бесплатный редактор](https://tyterapp.github.io/free/) — 2 документа, 10 компонентов на сценарий, 14 дней истории.
- [PRO](https://tyterapp.github.io/pro/) — вход по email и ключу, затем редактор без этих ограничений.
- [Страница 404](https://tyterapp.github.io/404/) — сообщение о ненайденной странице и ссылки в приложение.
- [Список доступа](https://tyterapp.github.io/codes-for-pro.txt) — текстовый файл.
- Обновление страницы на /free/ и /pro/ работает без ошибки 404.
- Верная пара открывает PRO; неверный ключ, чужой или пустой email дают ошибку.

Адреса /free, /pro и /404 могут получить завершающий слеш: GitHub Pages обслуживает их как папки с index.html. Это те же страницы. Для неизвестных адресов сборка также создаёт **404.html** в корне сайта: GitHub Pages покажет эту страницу с ошибкой HTTP 404. Создавать её вручную не нужно. [Страница ошибок GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-custom-404-page-for-your-github-pages-site).

Проверка PRO теперь обращается к **https://tyterapp.github.io/codes-for-pro.txt**. Добавьте TYTER_PRO_CODES именно в репозиторий tyterapp/tyterapp.github.io. Прежний файл на sergeybukharev.github.io больше не используется веб-версией. При переходе со старого сайта экспортируйте проекты в TYT и импортируйте на новом: браузерные хранилища двух доменов независимы.

## 7. Как обновлять проект через Git Bash

Сначала получите изменения из репозитория. Рабочая папка должна быть чистой:

```bash
cd /d/GitHub/tyterapp.github.io
git status --short
git pull --ff-only origin main
```

Если вы продолжаете менять приложение в **D:/Tyter**, сначала обновите архив:

```bash
cd /d/Tyter
npm run site:github:source
```

Затем обновите исходники в клонированном репозитории и проверьте изменения:

```bash
cd /d/GitHub/tyterapp.github.io
unzip -o /d/Tyter/publication/tyter-github-pages-source.zip
git add .
git diff --cached --stat
git diff --cached --name-only
```

После проверки отправьте новую версию:

```bash
git commit -m "Update Tyter MVP"
git push origin main
```

Если редактируете файлы прямо в клонированной папке, повторная распаковка не нужна. После push дождитесь успешного **Publish Tyter MVP**. Локальную папку github-pages загружать в репозиторий не нужно — её заново соберёт workflow.

## 8. Как выдавать и отзывать доступ PRO

После доната на [Boosty](https://boosty.to/sergeybuharev) впишите email пользователя рядом с назначенным ключом в своём списке. Отправьте ему email и ключ вручную; автоматическая оплата и отправка письма не подключены.

Для публикации обновлённого списка:

1. Откройте **Settings → Secrets and variables → Actions → Secrets**.
2. Отредактируйте **TYTER_PRO_CODES**, вставьте актуальный список целиком и сохраните.
3. Запустите **Actions → Publish Tyter MVP → Run workflow → main → Run workflow**.
4. Дождитесь успешной публикации и проверьте codes-for-pro.txt на сайте.

Изменение секрета или файла на компьютере само по себе не обновляет сайт. Коммит для изменения секрета не нужен, но запуск workflow обязателен. Загруженный отдельно codes-for-pro.txt будет заменён значением секрета при следующей публикации.

Для отзыва доступа удалите строку или очистите email, затем повторите публикацию. Открытый PRO проверяет список раз в минуту и при возвращении во вкладку. После отзыва доступ закроется, локальные документы сохранятся.

Успешный вход запоминается в браузере без установленного срока истечения: хранится хеш пары, исходные email и ключ в localStorage не записываются. При каждом новом открытии PRO список проверяется снова. Очистка данных сайта, смена браузера или приватное окно потребуют повторного входа.

Если интернет или файл недоступны, редактор закрывается с ошибкой. Сохранённый вход остаётся для кнопки **Повторить проверку**. Если пара удалена из списка, сохранённый вход сбрасывается.

## 9. Где хранятся документы пользователей

Сценарии, комментарии, компоненты, реквизит, аутлайн и история сохраняются локально в браузере. Они не отправляются в репозиторий или на GitHub Pages.

В Chrome и Edge на HTTPS PRO позволяет выбрать локальную папку через иконку папки. После разрешения браузера приложение создаёт и обновляет в ней файлы .tyt. В остальных браузерах можно скачивать TYT вручную через иконку экспорта → **Проект Tyter · TYT**.

TYT включает весь проект: сценарий, форматирование, компоненты и папки, реквизит, комментарии, аутлайн, настройки, автора/email/год, постер и историю. Для переноса на другое устройство импортируйте TYT.

Сохраняйте резервные TYT. Хранилища localhost и github.io независимы: перед переходом экспортируйте проекты с локального адреса и импортируйте на опубликованном сайте. Очистка данных браузера может удалить его библиотеку.

## Локальная проверка сайта через Git Bash

Для разработки нужен Node.js 22+. Откройте клонированный проект:

```bash
cd /d/GitHub/tyterapp.github.io
npm ci
npm run dev
```

Откройте http://127.0.0.1:5173/. Остановить локальный сервер — **Ctrl + C**.

Чтобы проверить именно сборку GitHub Pages, положите свой codes-for-pro.txt в корень клонированного проекта: файл уже исключён через .gitignore. Затем:

```bash
npm run site:github
npm run site:github:preview
```

Откройте http://127.0.0.1:4181/. PRO при локальной проверке читает реальный список по адресу github.io. Для проверки статических маршрутов и доступа есть команда **npm run test:pages**; для неё нужен установленный Microsoft Edge.

## Если что-то не работает

**git или npm не найдены.** Установите Git for Windows или Node.js соответственно, затем заново откройте Git Bash. Node.js нужен для локальной разработки и обновления архива; сборка на GitHub выполняется автоматически.

**Destination path already exists.** Репозиторий уже клонирован. Перейдите в его папку и используйте git pull, как описано в разделе 4.

**Author identity unknown.** Задайте git config user.name и git config user.email в клонированной папке, затем повторите commit.

**Push отклонён: non-fast-forward.** Пока ваша рабочая папка чистая, выполните git pull --rebase origin main, затем git push origin main. При конфликте сохраните обе нужные правки, выполните git add для исправленных файлов и git rebase --continue. Для отмены начатого rebase используйте git rebase --abort. Не обходите ошибку через force push.

**Permission denied или 403.** Проверьте origin через git remote -v и войдите в GitHub под владельцем репозитория. Не вставляйте токены в команды или URL.

**Сборка просит TYTER_PRO_CODES.** Проверьте точное название секрета и что его содержимое не пустое.

**Сборка сообщает номер строки.** Исправьте формат указанной строки: [ABC123][email]. Номер выводится без самого ключа и email.

**Pages возвращает 404.** Проверьте имя репозитория, Source = GitHub Actions и зелёный статус Publish Tyter MVP. Если workflow отключён, разрешите его запуск во вкладке Actions.

**PRO сообщает, что файл недоступен.** Откройте https://tyterapp.github.io/codes-for-pro.txt. Он должен возвращать текст, а не HTML или страницу ошибки. Проверьте публикацию и интернет.

**Ключ не подходит.** Ключ и действительный email должны быть в одной строке опубликованного списка.

**Изменения ключей не применились.** Обновите секрет, вручную запустите workflow и дождитесь публикации. Проверка не использует браузерный кеш, но обновление Pages может занять время.

**После перехода с локального адреса документы исчезли.** Импортируйте ранее сохранённые TYT: разные адреса сайта используют разные локальные хранилища.
