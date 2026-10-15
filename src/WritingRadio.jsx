import { useEffect } from "react";
import { Mic, MicOff } from "lucide-react";
import { t, useLanguage } from "./i18n.js";
import { RADIO_PRICE } from "./writing-wallet.js";
import { MoneyIcon } from "./WritingTimerIcons.jsx";
import RadioIcon from "./RadioIcon.jsx";
import DictationWave from "./DictationWave.jsx";

export default function WritingRadio({
  owned,
  dictation,
  buying,
  closing,
  onPurchase,
}) {
  useLanguage();
  // Leaving the item/category always switches the microphone off.
  useEffect(() => () => dictation.stop(), [dictation.stop]);
  const active = dictation.active;
  const label = active ? "Выключить микрофон" : "Включить микрофон";
  return (
    <section
      className="writing-shop-product writing-radio"
      aria-label={t("Рация")}
      data-recording={active || undefined}
    >
      {!active && (
        <>
          <span className="writing-shop-product-icon">
            <RadioIcon size={24} aria-hidden="true" />
          </span>
          <div className="writing-shop-product-copy">
            <strong>{t("Рация")}</strong>
            <p>
              {t(
                "Включает микрофон для диктовки текста в сценарий. Покупка разовая, использование многократное.",
              )}
            </p>
          </div>
        </>
      )}
      <div className="writing-radio-controls">
        <button
          key={owned ? "microphone" : "purchase"}
          type="button"
          className="writing-shop-buy"
          aria-label={t(owned ? label : "Купить рацию за 100 монет")}
          aria-pressed={owned ? active : undefined}
          disabled={
            !!buying ||
            closing ||
            !dictation.supported ||
            (owned
              ? (!dictation.enabled && !active) ||
                dictation.status === "stopping"
              : !onPurchase)
          }
          onClick={
            owned ? (active ? dictation.stop : dictation.start) : onPurchase
          }
        >
          {owned ? (
            active ? (
              <MicOff size={18} aria-hidden="true" />
            ) : (
              <Mic size={18} aria-hidden="true" />
            )
          ) : (
            <MoneyIcon />
          )}
          <span>
            {owned
              ? t(
                  dictation.status === "stopping"
                    ? "Выключаем микрофон…"
                    : label,
                )
              : buying === "radio"
                ? t("Покупка…")
                : RADIO_PRICE}
          </span>
        </button>
        {owned && active && <DictationWave sample={dictation.sample} />}
      </div>
      {owned && (
        <p className="writing-radio-status" role="status" aria-live="polite">
          {t(
            dictation.status === "starting"
              ? "Включаем микрофон…"
              : dictation.status === "listening"
                ? "Микрофон включён. Говорите — текст появится в сценарии."
                : dictation.status === "stopping"
                  ? "Завершаем диктовку…"
                  : "Микрофон выключен.",
          )}
        </p>
      )}
      {!dictation.supported && (
        <p className="writing-radio-note">
          {t("В этом браузере диктовка недоступна.")}
        </p>
      )}
      {owned && dictation.error && (
        <p className="writing-radio-note" role="alert">
          {t(dictation.error)}
        </p>
      )}
      {!active && (
        <p className="writing-radio-note">
          {t(
            "Речь распознаёт браузер; он может передавать звук своему сервису. Для диктовки может понадобиться интернет.",
          )}
        </p>
      )}
      {owned && !active && (
        <p className="writing-radio-note">
          {t(
            "Закрытие магазина выключает микрофон. Язык диктовки соответствует RU / ENG.",
          )}
        </p>
      )}
    </section>
  );
}
