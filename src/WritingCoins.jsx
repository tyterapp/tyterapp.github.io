import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Award,
  Check,
  ChevronRight,
  Flame,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import { t, useLanguage } from "./i18n.js";
import { localDay } from "./daily-streak.js";
import { SCAVENGER_ACHIEVEMENT, BURN_ACHIEVEMENT } from "./writing-wallet.js";
import { MoneyIcon, TimerIcon } from "./WritingTimerIcons.jsx";

export default function WritingCoins({ timer, closing, onClose }) {
  const language = useLanguage();
  const text = (ru, en) => (language === "en" ? en : ru);
  const [section, setSection] = useState("");
  const panelRef = useRef(null);
  const closeRef = useRef(null);
  const backRef = useRef(null);
  const sectionRefs = useRef({});
  const count = timer.streak?.count || 0;
  const best = timer.streak?.best || 0;
  const today = timer.streak?.day === localDay(timer.now);
  const cycle = count > 0 ? ((count - 1) % 5) + 1 : 0;
  const scavenger = timer.achievements.find(
    (entry) => entry.id === SCAVENGER_ACHIEVEMENT,
  );
  const burned = timer.achievements.find(
    (entry) => entry.id === BURN_ACHIEVEMENT,
  );
  const earnedCount = Number(!!scavenger) + Number(!!burned);
  const achievements = [
    {
      id: SCAVENGER_ACHIEVEMENT,
      earned: scavenger,
      icon: Trash2,
      reward: 10,
      name: text("Мусорщик", "Scavenger"),
      description: text(
        "Удалите все созданные копии сценария. Достижение приносит 10 монет один раз.",
        "Delete all created script copies. This achievement awards 10 coins once.",
      ),
    },
    {
      id: BURN_ACHIEVEMENT,
      earned: burned,
      icon: Flame,
      reward: 0,
      name: text("После прочтения сжечь", "Burn after reading"),
      description: text(
        "Сожгите последнюю страницу сценария с помощью зажигалки.",
        "Burn the last screenplay page with your lighter.",
      ),
    },
  ];
  const sections = [
    {
      id: "streak",
      title: text("Стрики за день", "Daily streaks"),
      detail: t("Дней подряд: {0}", count),
      icon: Flame,
    },
    {
      id: "achievements",
      title: text("Достижения", "Achievements"),
      detail: earnedCount
        ? text(`Получено: ${earnedCount} из 2`, `Unlocked: ${earnedCount} of 2`)
        : text("Пока нет достижений", "No achievements yet"),
      icon: Award,
    },
  ];
  const selected = sections.find((entry) => entry.id === section);

  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    if (panelRef.current) panelRef.current.scrollTop = 0;
    if (section) backRef.current?.focus({ preventScroll: true });
  }, [section]);

  return (
    <aside
      id="writing-coins"
      className={`writing-coins${closing ? " is-closing" : ""}`}
      role="dialog"
      aria-label={text("Монеты", "Coins")}
      aria-modal="false"
    >
      <header className="writing-shop-header">
        {selected && (
          <button
            ref={backRef}
            type="button"
            className="writing-timer-button"
            aria-label={text("Назад к монетам", "Back to coins")}
            disabled={closing}
            onClick={() => {
              setSection("");
              requestAnimationFrame(() =>
                sectionRefs.current[section]?.focus({ preventScroll: true }),
              );
            }}
          >
            <ArrowLeft size={18} aria-hidden="true" />
          </button>
        )}
        <strong>{selected?.title || text("Монеты", "Coins")}</strong>
        <button
          ref={closeRef}
          type="button"
          className="writing-timer-button"
          aria-label={text("Закрыть монеты", "Close coins")}
          onClick={onClose}
        >
          <X size={18} aria-hidden="true" />
        </button>
      </header>
      <div ref={panelRef} className="writing-popover-scroll">
        {!section && (
          <div className="writing-shop-list">
            <div className="writing-shop-product writing-coins-guide">
              <span className="writing-shop-product-icon" aria-hidden="true">
                <TimerIcon />
              </span>
              <div className="writing-shop-product-copy">
                <strong>{t("Таймер письма")}</strong>
                <p>
                  {text(
                    "За полный отсчёт: 5 минут = 5 монет, 25 минут = 25 монет. Досрочное завершение — без награды.",
                    "Complete the countdown: 5 minutes = 5 coins, 25 minutes = 25 coins. Ending early gives no reward.",
                  )}
                </p>
              </div>
            </div>
            <div className="writing-shop-product writing-coins-guide">
              <span className="writing-shop-product-icon" aria-hidden="true">
                <Pencil size={20} />
              </span>
              <div className="writing-shop-product-copy">
                <strong>{text("Пишите историю", "Write your story")}</strong>
                <p>
                  {text(
                    "Каждые 100 новых символов истории приносят 10 монет.",
                    "Every 100 new characters in your story earn 10 coins.",
                  )}
                </p>
                <p className="writing-coins-progress">
                  {text(
                    `До следующих 10 монет: ${100 - timer.writingRemainder} символов.`,
                    `${100 - timer.writingRemainder} characters until the next 10 coins.`,
                  )}
                </p>
              </div>
            </div>
            {sections.map((entry) => (
              <button
                key={entry.id}
                ref={(element) => {
                  sectionRefs.current[entry.id] = element;
                }}
                type="button"
                className="writing-shop-category writing-coins-section"
                aria-label={entry.title}
                disabled={closing}
                onClick={() => setSection(entry.id)}
              >
                <span>
                  {entry.title}
                  <small>{entry.detail}</small>
                </span>
                <entry.icon size={22} aria-hidden="true" />
                <ChevronRight size={16} aria-hidden="true" />
              </button>
            ))}
          </div>
        )}
        {section === "streak" && (
          <div className="writing-shop-list">
            <dl className="writing-coins-stats">
              <div>
                <dt>{text("Дней подряд", "Consecutive days")}</dt>
                <dd>{count}</dd>
              </div>
              <div>
                <dt>{text("Рекорд", "Best streak")}</dt>
                <dd>{best}</dd>
              </div>
            </dl>
            <div className="writing-coins-streak">
              <ol
                aria-label={text(
                  "Прогресс до бонуса за 5 дней",
                  "Progress toward the 5-day bonus",
                )}
              >
                {Array.from({ length: 5 }, (_, index) => (
                  <li
                    key={index}
                    className={index < cycle ? "is-complete" : ""}
                  >
                    <span className="visually-hidden">
                      {text("День", "Day")}{" "}
                    </span>
                    {index + 1}
                    {index < cycle && (
                      <span className="visually-hidden">
                        {text(": учтён", ": counted")}
                      </span>
                    )}
                    {index < cycle && <Check size={12} aria-hidden="true" />}
                  </li>
                ))}
              </ol>
              <p>
                {text(
                  "За вход каждый день — 1 монета. За каждые 5 дней подряд — ещё 10 монет.",
                  "Earn 1 coin for each daily visit, plus 10 extra coins every 5 consecutive days.",
                )}
              </p>
            </div>
            <p className="writing-coins-status">
              {today
                ? text(
                    "Сегодняшний вход учтён. Возвращайтесь завтра, чтобы продолжить стрик.",
                    "Today's visit is counted. Come back tomorrow to continue your streak.",
                  )
                : text(
                    "Стрик начинается с ежедневного входа в редактор.",
                    "Your streak starts with a daily visit to the editor.",
                  )}
            </p>
          </div>
        )}
        {section === "achievements" && (
          <div className="writing-shop-list">
            {achievements.map((achievement) => (
              <div
                key={achievement.id}
                className="writing-shop-product writing-coins-achievement"
                data-earned={!!achievement.earned}
              >
                <span className="writing-shop-product-icon" aria-hidden="true">
                  <achievement.icon size={24} />
                </span>
                <div className="writing-shop-product-copy">
                  <strong>{achievement.name}</strong>
                  <p>{achievement.description}</p>
                </div>
                <div className="writing-coins-achievement-status">
                  {achievement.earned ? (
                    <>
                      <Check size={16} aria-hidden="true" />
                      <span>{text("Получено", "Unlocked")}</span>
                      <time dateTime={achievement.earned.date}>
                        {new Date(
                          `${achievement.earned.date}T12:00:00`,
                        ).toLocaleDateString(
                          language === "en" ? "en-US" : "ru-RU",
                        )}
                      </time>
                    </>
                  ) : (
                    <>
                      {!!achievement.reward && (
                        <>
                          <MoneyIcon />
                          <span>+{achievement.reward}</span>
                        </>
                      )}
                      <span>{text("Ещё не получено", "Not unlocked yet")}</span>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
