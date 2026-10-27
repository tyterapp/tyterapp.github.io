import { useEffect, useState } from "react";
import SiteLayout from "./SiteLayout.jsx";
import { useLanguage } from "./i18n.js";
import "./legal-page.css";

const sectionFromHash = () =>
  location.hash === "#agreement" ? "agreement" : "license";
const documents = {
  license: [
    [
      ["Использование Tyter", "Using Tyter"],
      [
        "Автор Tyter — Сергей Бухарев. Пользователю предоставляется неисключительное право использовать доступные функции веб-приложения для создания, редактирования и экспорта собственных проектов, в том числе в коммерческой работе.",
        "Tyter is created by Sergey Buharev. Users receive a non-exclusive right to use the available web application features to create, edit and export their own projects, including for commercial work.",
      ],
    ],
    [
      ["Бесплатная версия и PRO", "Free and PRO"],
      [
        "Объём доступных функций зависит от выбранной версии приложения. Условия доступа к PRO, срок и стоимость указываются при оформлении доступа. Эта лицензия сама по себе не оформляет подписку и не создаёт обязательства по оплате.",
        "Available features depend on the selected application version. PRO access conditions, duration and price are shown when access is purchased. This license does not itself create a subscription or a payment obligation.",
      ],
    ],
    [
      ["Права на ваши проекты", "Your project rights"],
      [
        "Права на сценарии, тексты, изображения и другие материалы пользователя сохраняются за пользователем или соответствующими правообладателями. Использование Tyter не передаёт автору сервиса права на эти материалы. Пользователь может сохранять, экспортировать и использовать свои проекты вне Tyter.",
        "Rights to users’ screenplays, text, images and other materials remain with the user or the respective rights holders. Using Tyter does not transfer those rights to the service creator. Users can save, export and use their projects outside Tyter.",
      ],
    ],
    [
      [
        "Приложение и сторонние материалы",
        "Application and third-party materials",
      ],
      [
        "Право пользоваться сервисом не означает передачу прав на название, логотип, дизайн и программный код Tyter. Шрифты, библиотеки и другие сторонние материалы распространяются на условиях их собственных лицензий; эти условия сохраняют силу независимо от лицензии Tyter.",
        "Permission to use the service does not transfer rights to Tyter’s name, logo, design or source code. Fonts, libraries and other third-party materials are governed by their own licenses, independently of this Tyter license.",
      ],
    ],
    [
      ["Связь с автором", "Contact the creator"],
      [
        "Вопросы об использовании приложения и лицензии можно направить автору через Telegram: @ultraproduct.",
        "Questions about the application and its license can be sent to the creator on Telegram: @ultraproduct.",
      ],
    ],
  ],
  agreement: [
    [
      ["Для чего нужен сервис", "Purpose of the service"],
      [
        "Tyter — приложение для работы со сценариями, раскадровками и текстом. Это соглашение описывает использование сервиса и порядок работы с вашими материалами. Доступные функции определяются выбранной версией приложения.",
        "Tyter is an application for screenplays, storyboards and text. This agreement describes use of the service and how your materials are handled. Available features depend on the application version you select.",
      ],
    ],
    [
      ["Ваши документы остаются у вас", "Your documents stay with you"],
      [
        "Сервис не сохраняет пользовательские документы на своих серверах. Сценарии, раскадровки, компоненты, комментарии и история проекта обрабатываются на устройстве пользователя. Работа с проектами выполняется через локальные файлы пользователя; доступ к выбранным файлам или папке предоставляется пользователем.",
        "The service does not save user documents on its servers. Screenplays, storyboards, components, comments and project history are processed on the user’s device. Projects are handled through the user’s local files; the user grants access to selected files or a folder.",
      ],
    ],
    [
      ["Локальное хранилище браузера", "Local browser storage"],
      [
        "Веб-версия также сохраняет рабочую копию проекта и настройки в локальном хранилище браузера на вашем устройстве. Это не облачное хранение и не автоматическая синхронизация между устройствами. Очистка данных браузера или потеря устройства могут удалить эту копию. Для резервного хранения сохраняйте проект в собственный файл TYT.",
        "The web version also keeps a working project copy and settings in local browser storage on your device. This is not cloud storage or automatic synchronization between devices. Clearing browser data or losing the device can remove this copy. Keep your own TYT project file as a backup.",
      ],
    ],
    [
      ["Передача материалов по вашему действию", "Sharing at your request"],
      [
        "Экспорт и отправка материалов выполняются по действию пользователя. В переносимой ссылке на телеграмму содержится её текст: любой получатель полной ссылки сможет его прочитать. Публикуйте такую ссылку только для материалов, которыми хотите поделиться. При отправке через сторонние сервисы действуют также условия этих сервисов.",
        "Exporting and sending materials happen at the user’s request. A portable telegram link contains its text: anyone with the complete link can read it. Share such a link only for materials you intend to disclose. Third-party services also apply their own terms when you send materials through them.",
      ],
    ],
    [
      ["Доступ к PRO и технические данные", "PRO access and technical data"],
      [
        "Для подтверждения доступа к PRO используются данные, которые вы вводите при активации, например email и ключ доступа. Загрузка сайта и оплата могут обрабатываться провайдерами хостинга и платежей. Эти операции отделены от содержимого ваших документов и не создают серверную копию сценария или проекта.",
        "PRO access verification uses the details you enter during activation, such as an email and access key. Website delivery and payments may be processed by hosting and payment providers. These operations are separate from document contents and do not create a server copy of your screenplay or project.",
      ],
    ],
    [
      [
        "Ответственность за материалы и резервные копии",
        "Materials and backups",
      ],
      [
        "Пользователь самостоятельно определяет содержание своих проектов, проверяет права на добавляемые материалы и сохраняет резервные копии. Для переноса проекта на другое устройство используйте экспорт и импорт TYT. При вопросах о работе сервиса свяжитесь с автором: @ultraproduct.",
        "Users choose their project contents, check rights to the materials they add and keep backups. Use TYT export and import to transfer a project to another device. Contact the creator at @ultraproduct for questions about the service.",
      ],
    ],
  ],
};

export default function LegalPage() {
  const language = useLanguage(),
    en = language === "en";
  const [section, setSection] = useState(sectionFromHash);
  useEffect(() => {
    const update = () => setSection(sectionFromHash());
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  const title =
    section === "license"
      ? en
        ? "Application license"
        : "Лицензия приложения"
      : en
        ? "User agreement"
        : "Пользовательское соглашение";
  return (
    <SiteLayout
      page="legal"
      legalSection={section}
      title={title}
      description={
        en
          ? "Terms for using Tyter and working with your local projects."
          : "Условия использования Tyter и работы с вашими локальными проектами."
      }
      feedLabel={title}
    >
      <article className="legal-document" lang={language} aria-label={title}>
        <p className="legal-date">
          {en
            ? "Version of 21 October 2026"
            : "Редакция от 21 октября 2026 года"}
        </p>
        {documents[section].map(([heading, text], index) => (
          <section key={`${section}-${index}`}>
            <h2>{heading[en ? 1 : 0]}</h2>
            <p>{text[en ? 1 : 0]}</p>
          </section>
        ))}
        <footer className="legal-document-footer">
          <a
            href="https://t.me/ultraproduct"
            target="_blank"
            rel="noopener noreferrer"
          >
            @ultraproduct
          </a>
          {section === "license" && (
            <span>
              Marginalis ·{" "}
              <a
                href="https://github.com/Bloorgard/marginalis"
                target="_blank"
                rel="noopener noreferrer"
              >
                Dmitrii Osadchuk
              </a>{" "}
              ·{" "}
              <a
                href="/dildamode/fonts/marginalis/OFL.txt"
                target="_blank"
                rel="noopener noreferrer"
              >
                SIL OFL 1.1
              </a>
            </span>
          )}
        </footer>
      </article>
    </SiteLayout>
  );
}
