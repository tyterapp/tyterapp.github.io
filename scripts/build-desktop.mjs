import { existsSync } from "node:fs";
import { copyFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as viteBuild } from "vite";
import { Arch, build as buildElectron, Platform } from "electron-builder";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const platform = args[0] || (process.platform === "darwin" ? "mac" : "win");
if (!["win", "mac", "pro"].includes(platform))
  throw new Error(
    "Установочное приложение — только Pro. Используйте win или mac.",
  );
const mac = platform === "mac";
if (mac && process.platform !== "darwin")
  throw new Error(
    "Для DMG запустите workflow Build Tyter Pro installers на GitHub или сборку на Mac.",
  );
const arch = args.includes("arm64") ? Arch.arm64 : Arch.x64;
process.env.ELECTRON_CACHE ||= path.join(root, ".electron-cache");
process.env.ELECTRON_BUILDER_CACHE ||= path.join(
  root,
  ".electron-builder-cache",
);
const electronDist = path.join(root, "node_modules", "electron", "dist");
if (!mac && !existsSync(path.join(electronDist, "electron.exe"))) {
  const result = spawnSync(
    process.execPath,
    [path.join(root, "node_modules", "electron", "install.js")],
    { stdio: "inherit", env: process.env },
  );
  if (result.status !== 0) throw new Error("Не удалось подготовить Electron.");
}
process.env.VITE_TYTER_EDITION = "pro";
await viteBuild({ root, mode: "production" });
await copyFile(
  path.join(root, "public", "brand", "tyter-logo.svg"),
  path.join(root, "build-resources", "pro.svg"),
);
await buildElectron({
  targets: mac
    ? Platform.MAC.createTarget(["dmg", "zip"], arch)
    : Platform.WINDOWS.createTarget(["nsis"], Arch.x64),
  publish: "never",
  config: {
    appId: "ru.tyter.pro",
    productName: "Tyter Pro",
    executableName: "Tyter Pro",
    extraMetadata: {
      edition: "pro",
      main: "desktop/main-pro.cjs",
      codesUrl: "https://sergeybukharev.github.io/codes-for-pro.txt",
    },
    ...(!mac ? { electronDist } : {}),
    directories: { output: mac ? "release/mac" : "release/pro" },
    files: [
      "dist/**/*",
      "desktop/main-pro.cjs",
      "desktop/remote-code.cjs",
      "desktop/local-store.cjs",
      "desktop/preload.cjs",
      "desktop/activate.html",
      "desktop/activation.js",
      "src/data.js",
      "package.json",
      "!node_modules/**/*",
    ],
    asar: true,
    win: {
      target: ["nsis"],
      icon: "build-resources/pro.ico",
      artifactName: "Tyter-Pro-Setup-${version}.${ext}",
    },
    nsis: {
      oneClick: false,
      perMachine: false,
      allowToChangeInstallationDirectory: true,
      createDesktopShortcut: true,
      uninstallDisplayName: "Tyter Pro",
    },
    mac: {
      target: ["dmg", "zip"],
      icon: "build-resources/pro.svg",
      category: "public.app-category.productivity",
      artifactName: "Tyter-Pro-${version}-${arch}.${ext}",
      hardenedRuntime: true,
    },
  },
});
