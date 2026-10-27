import { localDay } from "./daily-streak.js";
import { HOUSE_SKINS, findHouseSkin } from "./house-skins.js";

export const DOCTOR_PRODUCT = "script-doctor";
export const DOCTOR_PRICE = 20;
export const HOUSE_PRODUCT = "oiia-house";
export const HOUSE_PRICE = 100;
export const LIGHTER_PRODUCT = "paper-lighter";
export const LIGHTER_PRICE = 50;
export const RADIO_PRODUCT = "dictation-radio";
export const RADIO_PRICE = 100;
export const DILDA_PRODUCT = "dildamode";
export const DILDA_PRICE = 100;
export const TIKITOK_PRODUCT = "tikitok";
export const TIKITOK_PRICE = 200;
export const BURN_ACHIEVEMENT = "burn-after-reading";
export const RESET_PROGRESS_PRICE = 200;
export const SCAVENGER_ACHIEVEMENT = "scavenger";
export const PENDING_DELETION_PREFIX = "tyter.dildamode.pending-deletion.v1:";
const validId = (value) =>
  typeof value === "string" && value.length > 0 && value.length <= 256;
const validDay = (value) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(`${value}T12:00:00Z`)) &&
  new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
const safeCount = (value) =>
  Number.isSafeInteger(value) && value >= 0 ? value : 0;

export function deletionConfirmationReceipt(deletion, now = Date.now()) {
  const date = deletion?.date || localDay(now);
  if (
    !validId(deletion?.id) ||
    !validId(deletion.documentId) ||
    !validId(deletion.versionId) ||
    typeof deletion.label !== "string" ||
    !validDay(date)
  )
    return null;
  return {
    id: deletion.id,
    documentId: deletion.documentId,
    versionId: deletion.versionId,
    label: deletion.label.slice(0, 180),
    date,
    deletedAt:
      Number.isFinite(deletion.deletedAt) && deletion.deletedAt >= 0
        ? deletion.deletedAt
        : now,
  };
}

// A separate key per confirmation is written synchronously before requesting the wallet lock.
// If an unloading tab cannot finish the lock callback, the next tab recovers this receipt.
export function queueDeletionConfirmation(deletion, storage, now = Date.now()) {
  const receipt = deletionConfirmationReceipt(deletion, now);
  if (!receipt) return { ok: false, reason: "deletion" };
  const key = `${PENDING_DELETION_PREFIX}${encodeURIComponent(receipt.id)}`;
  try {
    storage ||= globalThis.localStorage;
    storage.setItem(key, JSON.stringify(receipt));
    return { ok: true, receipt, key };
  } catch {
    return { ok: false, reason: "storage", receipt, key };
  }
}

export function pendingDeletionConfirmations(storage) {
  try {
    storage ||= globalThis.localStorage;
    const keys = Array.from({ length: storage.length }, (_, index) =>
      storage.key(index),
    ).filter((key) => key?.startsWith(PENDING_DELETION_PREFIX));
    return keys.flatMap((key) => {
      try {
        const receipt = deletionConfirmationReceipt(
          JSON.parse(storage.getItem(key)),
        );
        return receipt &&
          key === `${PENDING_DELETION_PREFIX}${encodeURIComponent(receipt.id)}`
          ? [{ key, receipt }]
          : [];
      } catch {
        return [];
      }
    });
  } catch {
    return [];
  }
}

export function clearDeletionConfirmation(key, storage) {
  if (!key?.startsWith(PENDING_DELETION_PREFIX)) return;
  try {
    (storage || globalThis.localStorage).removeItem(key);
  } catch {
    /* Safe to retry recovery; wallet receipt IDs prevent duplicate credit. */
  }
}

export function cleanWalletExtras(value) {
  const purchases = Object.fromEntries(
    [
      [DOCTOR_PRODUCT, DOCTOR_PRICE],
      [HOUSE_PRODUCT, HOUSE_PRICE],
      [LIGHTER_PRODUCT, LIGHTER_PRICE],
      [RADIO_PRODUCT, RADIO_PRICE],
      [TIKITOK_PRODUCT, TIKITOK_PRICE],
      [DILDA_PRODUCT, DILDA_PRICE],
      ...HOUSE_SKINS.map((skin) => [skin.product, skin.price]),
    ].flatMap(([id, cost]) => {
      const purchase = value?.purchases?.[id];
      return Number.isFinite(purchase?.purchasedAt) && purchase.purchasedAt >= 0
        ? [[id, { purchasedAt: purchase.purchasedAt, cost }]]
        : [];
    }),
  );
  const achievements = Object.fromEntries(
    [
      [SCAVENGER_ACHIEVEMENT, "Мусорщик", 10],
      [BURN_ACHIEVEMENT, "После прочтения сжечь", 0],
    ].flatMap(([id, name, reward]) =>
      validDay(value?.achievements?.[id]?.date)
        ? [[id, { id, name, date: value.achievements[id].date, reward }]]
        : [],
    ),
  );
  const characters = safeCount(value?.writing?.characters);
  const receipts = Array.isArray(value?.writing?.receipts)
    ? [...new Set(value.writing.receipts.filter(validId))].slice(-2000)
    : [];
  const deletions = Array.isArray(value?.deletions)
    ? value.deletions
        .filter(
          (entry) =>
            validId(entry?.id) &&
            validId(entry.documentId) &&
            validId(entry.versionId) &&
            typeof entry.label === "string" &&
            validDay(entry.date),
        )
        .slice(-5000)
        .map(({ id, documentId, versionId, label, date, deletedAt }) => ({
          id,
          documentId,
          versionId,
          label: label.slice(0, 180),
          date,
          ...(Number.isFinite(deletedAt) && deletedAt >= 0
            ? { deletedAt }
            : {}),
        }))
    : [];
  return {
    ...(Object.keys(purchases).length ? { purchases } : {}),
    ...(purchases[HOUSE_PRODUCT] &&
    purchases[findHouseSkin(value?.houseSkin)?.product]
      ? { houseSkin: value.houseSkin }
      : {}),
    ...(validDay(value?.progressResetDay)
      ? { progressResetDay: value.progressResetDay }
      : {}),
    ...(Object.keys(achievements).length ? { achievements } : {}),
    ...(characters || receipts.length
      ? { writing: { characters, receipts } }
      : {}),
    ...(deletions.length ? { deletions } : {}),
  };
}

export function walletHasDoctor(wallet) {
  return Number.isFinite(wallet?.purchases?.[DOCTOR_PRODUCT]?.purchasedAt);
}

export function resetWalletProgress(wallet, now = Date.now()) {
  if (wallet.coins < RESET_PROGRESS_PRICE)
    return { wallet, ok: false, reason: "coins", reward: 0 };
  return {
    ok: true,
    reward: 0,
    wallet: {
      coins: 0,
      session: null,
      progressResetDay: localDay(now),
      // Keep the document deletion audit and deduplication receipts, not earned progress.
      ...(wallet.deletions?.length ? { deletions: wallet.deletions } : {}),
      ...(wallet.writing?.receipts?.length
        ? { writing: { characters: 0, receipts: wallet.writing.receipts } }
        : {}),
    },
  };
}

export function purchaseWalletDoctor(wallet, now = Date.now()) {
  return purchaseWalletProduct(wallet, DOCTOR_PRODUCT, DOCTOR_PRICE, now);
}

export function walletHasHouse(wallet) {
  return Number.isFinite(wallet?.purchases?.[HOUSE_PRODUCT]?.purchasedAt);
}

export function purchaseWalletHouse(wallet, now = Date.now()) {
  return purchaseWalletProduct(wallet, HOUSE_PRODUCT, HOUSE_PRICE, now);
}

export function walletHasSkin(wallet, id) {
  const skin = findHouseSkin(id);
  return (
    !!skin && Number.isFinite(wallet?.purchases?.[skin.product]?.purchasedAt)
  );
}

export function walletHouseSkin(wallet) {
  return walletHasHouse(wallet) && walletHasSkin(wallet, wallet.houseSkin)
    ? wallet.houseSkin
    : null;
}

export function purchaseWalletSkin(wallet, id, now = Date.now()) {
  const skin = findHouseSkin(id);
  if (!skin) return { wallet, ok: false, reason: "product" };
  if (!walletHasHouse(wallet))
    return { wallet, ok: false, reason: "ownership" };
  const result = purchaseWalletProduct(wallet, skin.product, skin.price, now);
  return result.ok && result.wallet.houseSkin !== id
    ? { ...result, wallet: { ...result.wallet, houseSkin: id } }
    : result;
}

export function selectWalletSkin(wallet, id) {
  if (!walletHasHouse(wallet) || (id !== null && !walletHasSkin(wallet, id)))
    return { wallet, ok: false, reason: "ownership" };
  if (walletHouseSkin(wallet) === id) return { wallet, ok: true };
  const { houseSkin: _previous, ...rest } = wallet;
  return { wallet: id === null ? rest : { ...rest, houseSkin: id }, ok: true };
}

export function walletHasLighter(wallet) {
  return Number.isFinite(wallet?.purchases?.[LIGHTER_PRODUCT]?.purchasedAt);
}

export function purchaseWalletLighter(wallet, now = Date.now()) {
  return purchaseWalletProduct(wallet, LIGHTER_PRODUCT, LIGHTER_PRICE, now);
}

export function walletHasRadio(wallet) {
  return Number.isFinite(wallet?.purchases?.[RADIO_PRODUCT]?.purchasedAt);
}

export function purchaseWalletRadio(wallet, now = Date.now()) {
  return purchaseWalletProduct(wallet, RADIO_PRODUCT, RADIO_PRICE, now);
}

export function walletHasDilda(wallet) {
  return Number.isFinite(wallet?.purchases?.[DILDA_PRODUCT]?.purchasedAt);
}

export function purchaseWalletDilda(wallet, now = Date.now()) {
  return purchaseWalletProduct(wallet, DILDA_PRODUCT, DILDA_PRICE, now);
}

export function walletHasTikiTok(wallet) {
  return Number.isFinite(wallet?.purchases?.[TIKITOK_PRODUCT]?.purchasedAt);
}

export function purchaseWalletTikiTok(wallet, now = Date.now()) {
  return purchaseWalletProduct(wallet, TIKITOK_PRODUCT, TIKITOK_PRICE, now);
}

export function recordWalletBurn(wallet, now = Date.now()) {
  if (!walletHasLighter(wallet))
    return { wallet, ok: false, reason: "ownership" };
  if (wallet.achievements?.[BURN_ACHIEVEMENT])
    return { wallet, ok: true, unlocked: false };
  return {
    ok: true,
    unlocked: true,
    wallet: {
      ...wallet,
      achievements: {
        ...wallet.achievements,
        [BURN_ACHIEVEMENT]: {
          id: BURN_ACHIEVEMENT,
          name: "После прочтения сжечь",
          date: localDay(now),
          reward: 0,
        },
      },
    },
  };
}

function purchaseWalletProduct(wallet, product, price, now) {
  if (Number.isFinite(wallet?.purchases?.[product]?.purchasedAt))
    return { wallet, ok: true, alreadyOwned: true, reward: 0 };
  if (wallet.coins < price)
    return { wallet, ok: false, reason: "coins", reward: 0 };
  return {
    ok: true,
    reward: 0,
    wallet: {
      ...wallet,
      coins: wallet.coins - price,
      purchases: {
        ...wallet.purchases,
        [product]: { purchasedAt: now, cost: price },
      },
    },
  };
}

// The editor sends only fresh user insertions, never document loads, variant switches or undo/redo.
// The receipt makes retries and duplicate delivery safe under the shared wallet lock.
export function recordWalletWriting(wallet, activity) {
  if (
    !validId(activity?.id) ||
    !validId(activity.scope) ||
    !Number.isSafeInteger(activity.characters) ||
    activity.characters <= 0 ||
    activity.characters > 1_000_000
  )
    return { wallet, ok: false, reason: "activity", reward: 0 };
  if (wallet.writing?.receipts?.includes(activity.id))
    return { wallet, ok: true, reward: 0 };
  const before = safeCount(wallet.writing?.characters);
  const characters = before + activity.characters;
  if (!Number.isSafeInteger(characters))
    return { wallet, ok: false, reason: "activity", reward: 0 };
  const reward = (Math.floor(characters / 100) - Math.floor(before / 100)) * 10;
  return {
    ok: true,
    reward,
    wallet: {
      ...wallet,
      coins: wallet.coins + reward,
      writing: {
        characters,
        receipts: [...(wallet.writing?.receipts || []), activity.id].slice(
          -2000,
        ),
      },
    },
  };
}

export function recordWalletDeletion(wallet, deletion, now = Date.now()) {
  const receipt = deletionConfirmationReceipt(deletion, now);
  if (!receipt) return { wallet, ok: false, reason: "deletion", reward: 0 };
  const { date } = receipt;
  if (wallet.deletions?.some((entry) => entry.id === deletion.id))
    return { wallet, ok: true, reward: 0 };
  const reward = !wallet.achievements?.[SCAVENGER_ACHIEVEMENT] ? 10 : 0;
  return {
    ok: true,
    reward,
    ...(reward ? { achievement: SCAVENGER_ACHIEVEMENT } : {}),
    wallet: {
      ...wallet,
      coins: wallet.coins + reward,
      deletions: [...(wallet.deletions || []), receipt].slice(-5000),
      ...(reward
        ? {
            achievements: {
              ...wallet.achievements,
              [SCAVENGER_ACHIEVEMENT]: {
                id: SCAVENGER_ACHIEVEMENT,
                name: "Мусорщик",
                date,
                reward,
              },
            },
          }
        : {}),
    },
  };
}
