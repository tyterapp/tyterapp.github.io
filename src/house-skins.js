// Positions use the 536px-wide room in the supplied layout, including PNG padding.
export const HOUSE_SKIN_PLACEMENT = Object.freeze({
  x: 199 / 536,
  y: 161 / ((536 * 468) / 734),
  width: 137 / 536,
  height: 76 / ((536 * 468) / 734),
});

export const HOUSE_SKINS = Object.freeze([
  Object.freeze({
    id: "oiia",
    product: "skin-oiia",
    price: 50,
    ru: "ОииА",
    en: "OiiA",
    frames: Object.freeze(
      [1, 2, 3, 4].map((number) => `/oiia/skins/oiia/frame-0${number}.png`),
    ),
  }),
]);

export const findHouseSkin = (id) => HOUSE_SKINS.find((skin) => skin.id === id);
export const HOUSE_SKIN_IDLE_MS = 500;
