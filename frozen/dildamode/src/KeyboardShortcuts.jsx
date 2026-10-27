import { t, useLanguage } from "./i18n.js";
import { SHORTCUT_GROUPS } from "./keyboard-shortcuts.js";

export default function KeyboardShortcuts() {
  useLanguage();
  const mac = /Mac|iPhone|iPad/.test(navigator.platform);
  return (
    <>
      <h2>{t("Горячие клавиши")}</h2>
      <p className="shortcuts-intro">
        {t(
          "Сочетания для работы в редакторе. Действия с компонентами используют выделенный текст.",
        )}
      </p>
      {SHORTCUT_GROUPS.map((group) => (
        <section
          className="shortcuts-section"
          key={group.title}
          aria-label={t(group.title)}
        >
          <h3>{t(group.title)}</h3>
          <dl>
            {group.items.map(([keys, description, macKeys], index) => (
              <div className="shortcut-row" key={index}>
                <dt>
                  <kbd>
                    {t(mac ? macKeys || keys.replaceAll("Ctrl", "⌘") : keys)}
                  </kbd>
                </dt>
                <dd>{t(description)}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </>
  );
}
