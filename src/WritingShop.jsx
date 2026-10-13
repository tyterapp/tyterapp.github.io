import { useEffect, useRef, useState } from "react";
import { BriefcaseMedical, Check, X } from "lucide-react";
import { useLanguage } from "./i18n.js";
import { DOCTOR_PRICE } from "./writing-wallet.js";
import { MoneyIcon } from "./WritingTimerIcons.jsx";

export default function WritingShop({ timer, closing, onClose }) {
  const language = useLanguage();
  const text = (ru, en) => (language === "en" ? en : ru);
  const closeRef = useRef(null);
  const [buying, setBuying] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
  }, []);
  const purchase = async () => {
    if (buying || timer.hasDoctor) return;
    setBuying(true);
    setError("");
    try {
      const result = await timer.purchaseDoctor();
      if (!result.ok)
        setError(
          result.reason === "coins"
            ? text("Недостаточно монет.", "Not enough coins.")
            : text(
                "Не удалось сохранить покупку. Попробуйте ещё раз.",
                "The purchase could not be saved. Try again.",
              ),
        );
    } catch {
      setError(
        text(
          "Не удалось сохранить покупку. Попробуйте ещё раз.",
          "The purchase could not be saved. Try again.",
        ),
      );
    } finally {
      setBuying(false);
    }
  };
  return (
    <aside
      id="writing-shop"
      className={`writing-shop${closing ? " is-closing" : ""}`}
      role="dialog"
      aria-label={text("Магазин", "Shop")}
      aria-modal="false"
    >
      <header className="writing-shop-header">
        <strong>{text("Магазин", "Shop")}</strong>
        <button
          ref={closeRef}
          type="button"
          className="writing-timer-button"
          aria-label={text("Закрыть магазин", "Close shop")}
          onClick={onClose}
        >
          <X size={18} aria-hidden="true" />
        </button>
      </header>
      <div className="writing-shop-product">
        <span className="writing-shop-product-icon">
          <BriefcaseMedical size={24} aria-hidden="true" />
        </span>
        <div className="writing-shop-product-copy">
          <strong>{text("Доктор сценария", "Script doctor")}</strong>
          <p>
            {text(
              "Проверяет ошибки и сценарный формат.",
              "Checks errors and screenplay formatting.",
            )}
          </p>
        </div>
        {timer.hasDoctor ? (
          <span className="writing-shop-owned">
            <Check size={16} aria-hidden="true" />
            {text("Куплено", "Purchased")}
          </span>
        ) : (
          <button
            type="button"
            className="writing-shop-buy"
            disabled={buying || closing || timer.coins < DOCTOR_PRICE}
            aria-label={text(
              "Купить доктора сценария за 20 монет",
              "Buy script doctor for 20 coins",
            )}
            onClick={purchase}
          >
            <MoneyIcon />
            <span>{buying ? text("Покупка…", "Buying…") : DOCTOR_PRICE}</span>
          </button>
        )}
      </div>
      {!timer.hasDoctor && timer.coins < DOCTOR_PRICE && (
        <p className="writing-shop-hint">
          {text(
            "100 написанных символов = 10 монет. Таймер тоже приносит монеты.",
            "100 written characters = 10 coins. Timers earn coins too.",
          )}
        </p>
      )}
      {error && (
        <p className="writing-shop-error" role="alert">
          {error}
        </p>
      )}
    </aside>
  );
}
