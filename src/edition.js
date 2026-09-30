import { createContext, useContext } from "react";

export const IS_PRO = location.protocol === "tyter:" && window.tyterDesktop?.edition === "pro";
export const HISTORY_DAYS = IS_PRO ? Infinity : 14;
export const EditionContext = createContext(IS_PRO);
export function useEdition() {
  const isPro = useContext(EditionContext);
  return { isPro, historyDays: isPro ? Infinity : 14 };
}
