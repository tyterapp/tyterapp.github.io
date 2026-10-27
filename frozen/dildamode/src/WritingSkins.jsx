import { Check } from "lucide-react";
import { HOUSE_SKINS } from "./house-skins.js";
import { walletHasSkin } from "./writing-wallet.js";
import { CatIcon } from "./WritingHouseIcons.jsx";
import { MoneyIcon } from "./WritingTimerIcons.jsx";
import { useLanguage } from "./i18n.js";

export default function WritingSkins({ timer, buying, closing, onPurchase }) {
  const language = useLanguage();
  const english = language === "en";
  const entries = [null, ...HOUSE_SKINS];
  return entries.map((skin) => {
    const id = skin?.id ?? null;
    const owned = !skin || walletHasSkin(timer, id);
    const selected = timer.houseSkin === id;
    const name = skin ? skin[language] : english ? "No skin" : "Без скина";
    return (
      <button
        key={id || "none"}
        type="button"
        className={`writing-shop-skin${selected ? " is-selected" : ""}`}
        data-skin={id || "none"}
        aria-pressed={owned ? selected : undefined}
        aria-label={
          owned
            ? `${english ? "Choose skin" : "Выбрать скин"} ${name}`
            : english
              ? `Buy ${name} for ${skin.price} coins`
              : `Купить ${name} за ${skin.price} монет`
        }
        disabled={!!buying || closing || (!owned && timer.coins < skin.price)}
        onClick={() =>
          onPurchase({
            id: skin?.product || "skin-none",
            purchase: () =>
              owned ? timer.selectSkin(id) : timer.purchaseSkin(id),
          })
        }
      >
        <span className="writing-shop-product-icon">
          {skin ? (
            <img src={skin.frames[0]} width="40" height="40" alt="" />
          ) : (
            <CatIcon size={24} aria-hidden="true" />
          )}
        </span>
        <strong>{name}</strong>
        <span className="writing-shop-skin-status">
          {selected ? (
            <Check size={20} aria-hidden="true" />
          ) : owned ? (
            english ? (
              "Choose"
            ) : (
              "Выбрать"
            )
          ) : buying === skin.product ? (
            english ? (
              "Buying…"
            ) : (
              "Покупка…"
            )
          ) : (
            <>
              <MoneyIcon />
              <span>{skin.price}</span>
            </>
          )}
        </span>
      </button>
    );
  });
}
