import { nodeText } from "../../data.js";

export const IDEA_PRICE = 5;
export const WORDS_PER_CARD = 100;
export const QUEST_LIBRARY = [
  {
    id: "animal",
    theme: "animal",
    hue: 145,
    title: "Девять жизней",
    type: "Животные",
    prompt:
      "Напишите историю про кошку или другое животное. Покажите мир его глазами и дайте ему неожиданную цель.",
    hint: "Пусть одна маленькая деталь изменит всё.",
    rarity: "Обычная",
  },
  {
    id: "friends",
    theme: "journey",
    hue: 235,
    title: "Двое в пути",
    type: "Приключение",
    prompt:
      "Напишите про путешествие двух друзей. На полпути один признаётся, зачем на самом деле отправился в дорогу.",
    hint: "Одно место, два совершенно разных желания.",
    rarity: "Редкая",
  },
  {
    id: "parting",
    theme: "parting",
    hue: 330,
    title: "Последний поезд",
    type: "Разлука",
    prompt:
      "Напишите про разлуку. Герои должны попрощаться, но самый важный разговор ещё не состоялся.",
    hint: "Что они не решаются сказать вслух?",
    rarity: "Обычная",
  },
  {
    id: "hope",
    theme: "hope",
    hue: 85,
    title: "Свет в окне",
    type: "Надежда и любовь",
    prompt:
      "Напишите про надежду и любовь. Герой получает крошечный знак, что всё ещё можно изменить.",
    hint: "Покажите любовь поступком, а не признанием.",
    rarity: "Редкая",
  },
  {
    id: "animal-home",
    theme: "animal",
    hue: 165,
    title: "Дорога домой",
    type: "Животные",
    prompt:
      "Домашнее животное потерялось в незнакомом городе. Напишите сцену встречи с человеком, который сам ищет дорогу домой.",
    hint: "Они помогут друг другу без единого слова.",
    rarity: "Обычная",
  },
  {
    id: "friends-map",
    theme: "journey",
    hue: 265,
    title: "Без карты",
    type: "Приключение",
    prompt:
      "Двое друзей находят письмо со странным маршрутом. Напишите сцену, в которой они выбирают между безопасной дорогой и приключением.",
    hint: "У каждого решения должна быть цена.",
    rarity: "Редкая",
  },
  {
    id: "parting-letter",
    theme: "parting",
    hue: 20,
    title: "Неотправленное",
    type: "Разлука",
    prompt:
      "Напишите про письмо, которое так и не отправили после разлуки. Сегодня его случайно находит тот, кому оно предназначалось.",
    hint: "Один предмет соединяет прошлое и настоящее.",
    rarity: "Редкая",
  },
  {
    id: "hope-dawn",
    theme: "hope",
    hue: 65,
    title: "До рассвета",
    type: "Надежда и любовь",
    prompt:
      "У героя есть одна ночь, чтобы вернуть надежду близкому человеку. Напишите сцену, где простой поступок оказывается важнее большого обещания.",
    hint: "Пусть утро начнётся иначе, чем ожидалось.",
    rarity: "Особенная",
  },
].map((card) => ({ ...card, goal: 100 }));

export function questDay(now = Date.now()) {
  const date = new Date(now);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function hash(text) {
  let value = 2166136261;
  for (const char of text)
    value = Math.imul(value ^ char.codePointAt(0), 16777619);
  return value >>> 0;
}
export function dailyQuestLibrary(scope, day) {
  return [...QUEST_LIBRARY].sort(
    (a, b) => hash(`${day}:${scope}:${a.id}`) - hash(`${day}:${scope}:${b.id}`),
  );
}

// A local idea generator: combine story context with curated plot turns.
// It never sends screenplay text to a service or claims to be an AI model.
export function continuationIdea(document, day, sequence = 0, language = "ru") {
  const blocks = document.content?.content || [];
  const characters = [
    ...new Set(
      blocks
        .filter((node) => node.attrs?.format === "character")
        .map((node) =>
          nodeText(node)
            .replace(/\s*\([^)]*\)\s*$/u, "")
            .trim(),
        )
        .filter(Boolean),
    ),
  ];
  const hero =
    characters[0] || (language === "en" ? "the protagonist" : "главный герой");
  const other =
    characters[1] ||
    (language === "en" ? "an unexpected ally" : "неожиданный союзник");
  const heading = [...blocks]
    .reverse()
    .find((node) => node.attrs?.format === "scene");
  const place = heading
    ? nodeText(heading).trim()
    : language === "en"
      ? "a familiar place"
      : "знакомое место";
  const last = [...blocks]
    .reverse()
    .find(
      (node) =>
        ["action", "speech"].includes(node.attrs?.format) &&
        nodeText(node).trim(),
    );
  const anchor = nodeText(last || {})
    .trim()
    .slice(-220);
  const variants =
    language === "en"
      ? [
          `${hero} notices something in this place that contradicts everything they knew. ${other} recognises it but refuses to explain. Give them a shared problem they can only solve by telling the truth.`,
          `A message arrives for ${hero}, but ${other} has already read it. Let them disagree over one concrete choice. End the scene with a decision that sends them somewhere neither planned to go.`,
          `${hero} returns to a familiar place to find one small thing missing. ${other} offers help in exchange for a promise. Make that promise the source of the next scene's conflict.`,
          `Just as ${hero} is ready to leave, ${other} reveals a secret tied to their shared past. Show their reaction through an action. End with a small gesture of trust that changes their plan.`,
        ]
      : [
          `${hero} замечает в этом месте деталь, которая противоречит всему, что было известно раньше. ${other} узнаёт её, но отказывается объяснять. Дайте им общую проблему, которую можно решить только после честного разговора.`,
          `${hero} получает сообщение, но ${other} уже успел прочитать его. Пусть герои спорят о конкретном выборе. Завершите сцену решением отправиться туда, куда никто из них не собирался.`,
          `${hero} возвращается в знакомое место и обнаруживает, что исчезла одна небольшая вещь. ${other} предлагает помощь в обмен на обещание. Сделайте это обещание источником конфликта следующей сцены.`,
          `Когда ${hero} уже готов уйти, ${other} раскрывает тайну, связанную с их общим прошлым. Покажите реакцию действием. Закончите маленьким жестом доверия, который меняет их план.`,
        ];
  const turn =
    variants[(hash(`${document.id}:${day}`) + sequence) % variants.length];
  return language === "en"
    ? `Continue after: “${anchor || place}”\n\n${turn}\n\nNext scene: ${place}.`
    : `Продолжите после: «${anchor || place}»\n\n${turn}\n\nСледующая сцена: ${place}.`;
}
