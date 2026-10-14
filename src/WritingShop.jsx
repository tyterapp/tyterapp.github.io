import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  BriefcaseMedical,
  ChevronRight,
  MapPin,
  Package,
  RefreshCw,
  X,
} from "lucide-react";
import { useLanguage } from "./i18n.js";
import {
  DOCTOR_PRICE,
  HOUSE_PRICE,
  RESET_PROGRESS_PRICE,
} from "./writing-wallet.js";
import { MoneyIcon } from "./WritingTimerIcons.jsx";
import {
  CatIcon,
  DecorIcon,
  HouseIcon,
  SkinsIcon,
} from "./WritingHouseIcons.jsx";

export default function WritingShop({
  timer,
  closing,
  onClose,
  onResetProgress,
}) {
  const language = useLanguage();
  const text = (ru, en) => (language === "en" ? en : ru);
  const closeRef = useRef(null);
  const backRef = useRef(null);
  const categoryRefs = useRef({});
  const [buying, setBuying] = useState("");
  const [error, setError] = useState("");
  const [category, setCategory] = useState("");
  const categories = [
    {
      id: "skins",
      name: text("Скины", "Skins"),
      icon: SkinsIcon,
      item: text("Классическая кошка", "Classic cat"),
      itemIcon: CatIcon,
    },
    {
      id: "decor",
      name: text("Декор", "Decor"),
      icon: DecorIcon,
      item: text("Уютный коврик", "Cozy rug"),
      itemIcon: DecorIcon,
    },
    {
      id: "locations",
      name: text("Локации", "Locations"),
      icon: MapPin,
      item: text("Тихий сад", "Quiet garden"),
      itemIcon: MapPin,
    },
    {
      id: "misc",
      name: text("Разное", "Miscellaneous"),
      icon: Package,
      item: text("Подарочная коробка", "Gift box"),
      itemIcon: Package,
    },
  ];
  const selected = categories.find((entry) => entry.id === category);
  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    if (category) backRef.current?.focus({ preventScroll: true });
  }, [category]);
  useEffect(() => {
    if (!timer.hasHouse) setCategory("");
  }, [timer.hasHouse]);
  const purchase = async (product) => {
    if (buying) return;
    setBuying(product.id);
    setError("");
    try {
      const result = await product.purchase();
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
      setBuying("");
    }
  };
  const products = [
    {
      id: "doctor",
      owned: timer.hasDoctor,
      price: DOCTOR_PRICE,
      name: text("Доктор сценария", "Script doctor"),
      icon: BriefcaseMedical,
      description: text(
        "Проверяет ошибки и сценарный формат.",
        "Checks errors and screenplay formatting.",
      ),
      label: text(
        "Купить доктора сценария за 20 монет",
        "Buy script doctor for 20 coins",
      ),
      purchase: timer.purchaseDoctor,
    },
    {
      id: "house",
      owned: timer.hasHouse,
      price: HOUSE_PRICE,
      name: text("oiia домик", "oiia house"),
      icon: HouseIcon,
      description: text(
        "Ваш домик для будущего питомца и украшений.",
        "Your house for a future pet and decorations.",
      ),
      label: text(
        "Купить oiia домик за 100 монет",
        "Buy oiia house for 100 coins",
      ),
      purchase: timer.purchaseHouse,
    },
  ].filter((product) => !product.owned);
  return (
    <aside
      id="writing-shop"
      className={`writing-shop${closing ? " is-closing" : ""}`}
      role="dialog"
      aria-label={text("Магазин", "Shop")}
      aria-modal="false"
    >
      <header className="writing-shop-header">
        {selected ? (
          <button
            ref={backRef}
            type="button"
            className="writing-timer-button"
            aria-label={text("Назад к категориям", "Back to categories")}
            onClick={() => {
              setCategory("");
              requestAnimationFrame(() =>
                categoryRefs.current[category]?.focus({ preventScroll: true }),
              );
            }}
          >
            <ArrowLeft size={18} aria-hidden="true" />
          </button>
        ) : null}
        <strong>{selected?.name || text("Магазин", "Shop")}</strong>
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
      <div className="writing-popover-scroll">
        {selected ? (
          <div className="writing-shop-product writing-shop-preview">
            <span className="writing-shop-product-icon">
              <selected.itemIcon size={24} />
            </span>
            <div className="writing-shop-product-copy">
              <strong>{selected.item}</strong>
              <p>{text("Скоро в магазине", "Coming soon")}</p>
            </div>
          </div>
        ) : (
          <div className="writing-shop-list">
            {products.map((product) => (
              <div key={product.id} className="writing-shop-product">
                <span className="writing-shop-product-icon">
                  <product.icon size={24} aria-hidden="true" />
                </span>
                <div className="writing-shop-product-copy">
                  <strong>{product.name}</strong>
                  <p>{product.description}</p>
                </div>
                <button
                  type="button"
                  className="writing-shop-buy"
                  aria-label={product.label}
                  disabled={!!buying || closing || timer.coins < product.price}
                  onClick={() => purchase(product)}
                >
                  <MoneyIcon />
                  <span>
                    {buying === product.id
                      ? text("Покупка…", "Buying…")
                      : product.price}
                  </span>
                </button>
              </div>
            ))}
            {timer.hasHouse &&
              categories.map((entry) => (
                <button
                  type="button"
                  key={entry.id}
                  ref={(element) => {
                    categoryRefs.current[entry.id] = element;
                  }}
                  className="writing-shop-category"
                  onClick={() => setCategory(entry.id)}
                  disabled={closing}
                >
                  <span>{entry.name}</span>
                  <entry.icon size={22} aria-hidden="true" />
                  <ChevronRight size={16} aria-hidden="true" />
                </button>
              ))}
          </div>
        )}
        {!selected &&
          products.some((product) => timer.coins < product.price) && (
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
        <button
          type="button"
          className="writing-shop-reset"
          disabled={!!buying || closing || timer.coins < RESET_PROGRESS_PRICE}
          onClick={onResetProgress}
        >
          <RefreshCw size={18} aria-hidden="true" />
          <span>{text("Сбросить прогресс", "Reset progress")}</span>
          <MoneyIcon />
          <span>{RESET_PROGRESS_PRICE}</span>
        </button>
      </div>
    </aside>
  );
}
