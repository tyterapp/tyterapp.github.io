export const BLOG_CATEGORIES = [
  { id: "all", ru: "Все статьи", en: "All articles" },
  { id: "format", ru: "Сценарный формат", en: "Screenplay format" },
  { id: "workflow", ru: "Работа в Tyter", en: "Using Tyter" },
];
export const BLOG_ARTICLES = [
  {
    slug: "standarty-v-kino",
    category: "format",
    minutes: 3,
    title: [
      "Сценарный формат: с чего начать",
      "Screenplay format: where to start",
    ],
    summary: [
      "Courier, заголовки сцен и диалоги: как сделать текст удобным для чтения и подготовки к съёмкам.",
      "Courier, scene headings and dialogue: make your script easy to read and prepare for production.",
    ],
    sections: [
      [
        ["Сначала история, затем форма", "Story first, then format"],
        [
          "Сценарный формат помогает читателю различать место действия, события и реплики. В Tyter у этих частей есть отдельные типы абзацев: заголовок сцены, действие, персонаж, реплика, ремарка и переход.",
          "Screenplay formatting helps readers distinguish locations, action and dialogue. Tyter gives each part its own paragraph type: scene heading, action, character, dialogue, parenthetical and transition.",
        ],
      ],
      [
        ["Почему Courier", "Why Courier"],
        [
          "Для сценария обычно используют Courier размером 12 пунктов. У моноширинного шрифта одинаковая ширина символов, поэтому в сценариях сохраняется привычная плотность текста. В Tyter можно выбрать Courier и его варианты в настройках документа.",
          "Screenplays commonly use 12-point Courier. A monospaced font gives characters the same width and keeps scripts at a familiar text density. You can select Courier and its variants in Tyter’s document settings.",
        ],
      ],
      [
        ["Заголовок сцены", "Scene heading"],
        [
          "Начните заголовок с ИНТ. или ЭКС., затем укажите место и время дня. Например: ИНТ. КВАРТИРА — УТРО. Подсказки в редакторе помогают заполнить заголовок, а сведения о времени дня используются в свойствах кадра.",
          "Start with INT. or EXT., followed by the location and time of day. For example: INT. APARTMENT — MORNING. Editor suggestions help complete the heading, and the time of day is used in shot information.",
        ],
      ],
      [
        ["Действие и реплики", "Action and dialogue"],
        [
          "Описывайте то, что можно увидеть или услышать. Имя говорящего оформляйте абзацем «Персонаж», а его слова — «Реплика». Ремарку добавляйте отдельным абзацем, если читателю нужна короткая подсказка к реплике.",
          "Describe what can be seen or heard. Use a Character paragraph for the speaker’s name and Dialogue for their words. Add a separate Parenthetical when a line needs a short cue.",
        ],
      ],
      [
        ["Проверьте перед отправкой", "Check before sharing"],
        [
          "Откройте экспорт и проверьте итоговые страницы: заголовки, нумерацию сцен и выбранные варианты. PDF подходит для чтения и печати, DOCX — для работы в Word, FDX — для обмена с другими сценарными редакторами.",
          "Review the exported pages, including headings, scene numbers and selected variants. PDF is useful for reading and printing, DOCX for Word, and FDX for exchanging scripts with other screenwriting tools.",
        ],
      ],
    ],
    source: {
      url: "https://www.finaldraft.com/learn/how-to-format-a-screenplay/",
      label: "Final Draft — How to Format a Screenplay",
    },
  },
  {
    slug: "ot-kartochki-k-scene",
    category: "workflow",
    minutes: 2,
    title: ["От карточки к сцене", "From a card to a scene"],
    summary: [
      "Соберите раскадровку по сценам и работайте со слайдами и текстом в одном проекте.",
      "Build a storyboard by scene and work with slides and screenplay in one project.",
    ],
    sections: [
      [
        ["Разложите историю по актам", "Arrange the story into acts"],
        [
          "В PRO-версии карточка раскадровки соответствует сцене и её варианту A–F. Добавьте слайды, задайте порядок, длительность и переходы. В «Инфо» укажите акт, статус и драматичность от 0 до 10.",
          "Each PRO storyboard card represents a scene and its A–F variant. Add slides, set their order, duration and transitions. Use Info to choose the act, status and drama from 0 to 10.",
        ],
      ],
      [
        ["Откройте карточку из сценария", "Open a card from the script"],
        [
          "Нажмите на миниатюру рядом со сценой, чтобы открыть правую панель. В «Структуре» редактируется тот же текст, что и в сценарии. Кнопка сверху переключает вид между сценарием и раскадровкой.",
          "Click the thumbnail next to a scene to open the right panel. Structure edits the same text as the screenplay. The top button switches between screenplay and storyboard.",
        ],
      ],
      [
        ["Заполните пустую сцену", "Fill the empty scene"],
        [
          "Если карточка создала пустую сцену, вставьте в неё скопированный заголовок вместе с текстом. Форматирование сохраняется, а связь с карточкой остаётся на месте.",
          "If a card created an empty scene, paste a copied heading and text into it. Formatting is preserved and the link to the card stays intact.",
        ],
      ],
      [
        ["Работайте с вариантами", "Work with variants"],
        [
          "Варианты A–F сохраняют отдельные решения сцены со своими слайдами и настройками. Цвет страницы — отдельная пометка: выбор цвета не создаёт копию текста.",
          "Variants A–F keep separate scene alternatives with their own slides and settings. Page color is a label; selecting a color does not copy the text.",
        ],
      ],
    ],
  },
  {
    slug: "sohranenie-i-oflayn",
    category: "workflow",
    minutes: 2,
    title: ["Сохранение и работа без интернета", "Saving and working offline"],
    summary: [
      "Где хранится ваш сценарий, как перенести проект и подготовить редактор к работе без сети.",
      "Where your script is stored, how to transfer a project and prepare the editor for offline work.",
    ],
    sections: [
      [
        ["Документы остаются на устройстве", "Documents stay on your device"],
        [
          "Веб-редактор сохраняет документы в браузере. Используйте один и тот же браузер и профиль, чтобы вернуться к своей библиотеке. Очистка данных сайта удаляет локальное хранилище, поэтому сохраняйте копии важных проектов.",
          "The web editor stores documents in your browser. Return in the same browser and profile to access your library. Clearing site data removes local storage, so keep exported copies of important projects.",
        ],
      ],
      [
        ["Подготовьте офлайн-режим", "Prepare for offline use"],
        [
          "Откройте редактор с интернетом и дождитесь его загрузки. PRO требует первого подтверждения email и ключа онлайн. Затем уже подтверждённый вход продолжит работать без сети, включая сохранение текста и перезагрузку редактора.",
          "Open the editor online and let it finish loading. PRO needs its first email and key verification online. After that, the verified session works offline, including saving text and reloading the editor.",
        ],
      ],
      [
        ["Перенесите весь проект", "Transfer the whole project"],
        [
          "В PRO экспорт TYT собирает сценарий, раскадровку, компоненты, реквизит, комментарии и историю изменений в один файл. Импортируйте его на другом устройстве, чтобы продолжить работу с копией проекта.",
          "PRO’s TYT export collects the screenplay, storyboard, components, props, comments and revision history into one file. Import it on another device to continue with a copy of the project.",
        ],
      ],
      [
        ["Выберите формат для отправки", "Choose a sharing format"],
        [
          "Для чтения отправьте PDF, для редактирования в Word — DOCX, для другого сценарного редактора — FDX. Эти форматы удобны для передачи текста; TYT предназначен для сохранения всего проекта Tyter.",
          "Send PDF for reading, DOCX for editing in Word, or FDX for another screenplay editor. These formats share the script; TYT preserves the complete Tyter project.",
        ],
      ],
    ],
  },
];
export const SITE_ROUTES = [
  "design",
  "b",
  "house",
  "blog",
  "help",
  ...BLOG_ARTICLES.map(({ slug }) => `blog/${slug}`),
];
