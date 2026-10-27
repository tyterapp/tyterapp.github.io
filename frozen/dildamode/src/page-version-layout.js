import { syncPageColors } from "./page-colors.js";

export function preparePageVersionLayout(document, starts) {
  return syncPageColors(document, starts);
}

export const reflowPageVersions = preparePageVersionLayout;
