import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  BriefcaseMedical,
  ChevronRight,
  Clapperboard,
  Flame,
  MapPin,
  Package,
  Play,
  RefreshCw,
  X,
} from "lucide-react";
import { useLanguage } from "./i18n.js";
import {
  DOCTOR_PRICE,
  HOUSE_PRICE,
  LIGHTER_PRICE,
  RADIO_PRICE,
  TIKITOK_PRICE,
  RESET_PROGRESS_PRICE,
} from "./writing-wallet.js";
import { MoneyIcon } from "./WritingTimerIcons.jsx";
import LighterIcon from "./LighterIcon.jsx";
import WritingRadio from "./WritingRadio.jsx";
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
  onBack,
  onResetProgress,
  onBurnPage,
  burnDisabled = false,
  dictation,
  onOpenTikiTok,
}) {
  const language = useLanguage();
  const text = (ru, en) => (language === "en" ? en : ru);
  const closeRef = useRef(null);
  const backRef = useRef(null);
  const categoryRefs = useRef({});
  const scrollRef = useRef(null);
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
  const recording = category === "misc" && dictation.active;
  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    if (category) backRef.current?.focus({ preventScroll: true });
  }, [category]);
  useEffect(() => {
    if (!timer.hasHouse && category && category !== "misc") setCategory("");
  }, [timer.hasHouse, category]);
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
  const doctor = {
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
  };
  const products = [
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
  const lighter = {
    id: "lighter",
    owned: timer.hasLighter,
    price: LIGHTER_PRICE,
    name: text("Зажигалка", "Lighter"),
    icon: LighterIcon,
    useIcon: Flame,
    description: text(
      "Сжигает последнюю страницу сценария. Покупка разовая, использование многократное.",
      "Burns the last screenplay page. Buy once, use repeatedly.",
    ),
    label: text("Купить зажигалку за 50 монет", "Buy lighter for 50 coins"),
    purchase: timer.purchaseLighter,
  };
  const tikitok = {
    id: "tikitok",
    owned: timer.hasTikiTok,
    price: TIKITOK_PRICE,
    name: "TikiTok",
    icon: Clapperboard,
    useIcon: Play,
    label: text("Купить TikiTok за 200 монет", "Buy TikiTok for 200 coins"),
    purchase: timer.purchaseTikiTok,
    useLabel: text("Открыть TikiTok", "Open TikiTok"),
    useDisabled: false,
    onUse: onOpenTikiTok,
  };
  const productTile = (product) => {
    const UseIcon = product.useIcon || product.icon;
    return (
      <div
        key={product.id}
        className="writing-shop-product"
        data-product={product.id}
      >
        <span className="writing-shop-product-icon">
          <product.icon size={24} aria-hidden="true" />
        </span>
        <div className="writing-shop-product-copy">
          <strong>{product.name}</strong>
          {product.description && <p>{product.description}</p>}
        </div>
        <button
          key={product.owned ? "use" : "buy"}
          type="button"
          className="writing-shop-buy"
          aria-label={
            product.owned
              ? product.useLabel ||
                text("Сжечь последнюю страницу", "Burn the last page")
              : product.label
          }
          disabled={
            !!buying ||
            closing ||
            (product.owned
              ? (product.useDisabled ?? burnDisabled)
              : timer.coins < product.price)
          }
          onClick={() =>
            product.owned
              ? (product.onUse || onBurnPage)?.()
              : purchase(product)
          }
        >
          {product.owned ? (
            <UseIcon size={18} aria-hidden="true" />
          ) : (
            <MoneyIcon />
          )}
          <span>
            {product.owned
              ? product.useLabel ||
                text("Сжечь последнюю страницу", "Burn the last page")
              : buying === product.id
                ? text("Покупка…", "Buying…")
                : product.price}
          </span>
        </button>
      </div>
    );
  };
  return (
    <div id="writing-shop" className="writing-shop-content">
      <header className="writing-shop-header">
        <button
          ref={backRef}
          type="button"
          className="writing-timer-button"
          aria-label={
            selected
              ? text("Назад к категориям", "Back to categories")
              : text("Назад к монетам", "Back to coins")
          }
          disabled={closing}
          onClick={() => {
            if (!selected) return onBack();
            setCategory("");
            requestAnimationFrame(() =>
              categoryRefs.current[category]?.focus({ preventScroll: true }),
            );
          }}
        >
          <ArrowLeft size={18} aria-hidden="true" />
        </button>
        <strong>
          {recording
            ? text("Рация", "Radio")
            : selected?.name || text("Магазин", "Shop")}
        </strong>
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
      <div ref={scrollRef} className="writing-popover-scroll">
        {selected ? (
          <div className="writing-shop-list">
            {category === "misc" && (
              <>
                {!recording && !doctor.owned && productTile(doctor)}
                {!recording && productTile(lighter)}
                <WritingRadio
                  owned={timer.hasRadio}
                  dictation={dictation}
                  buying={buying}
                  closing={closing}
                  onPurchase={
                    timer.coins >= RADIO_PRICE
                      ? () =>
                          purchase({
                            id: "radio",
                            purchase: timer.purchaseRadio,
                          })
                      : null
                  }
                />
                {!recording && productTile(tikitok)}
              </>
            )}
            {!recording && (
              <div className="writing-shop-product writing-shop-preview">
                <span className="writing-shop-product-icon">
                  <selected.itemIcon size={24} />
                </span>
                <div className="writing-shop-product-copy">
                  <strong>{selected.item}</strong>
                  <p>{text("Скоро в магазине", "Coming soon")}</p>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="writing-shop-list">
            {products.map(productTile)}
            {categories
              .filter((entry) => timer.hasHouse || entry.id === "misc")
              .map((entry) => (
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
        {error && (
          <p className="writing-shop-error" role="alert">
            {error}
          </p>
        )}
        {!recording && (
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
        )}
      </div>
    </div>
  );
}
