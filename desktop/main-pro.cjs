const path = require("node:path");
const { mkdirSync } = require("node:fs");
const { readFile, writeFile, rename } = require("node:fs/promises");
const { pathToFileURL } = require("node:url");
const {
  app,
  BrowserWindow,
  ipcMain,
  net,
  protocol,
  shell,
  Menu,
  clipboard,
  safeStorage,
} = require("electron");
const { createLocalStore } = require("./local-store.cjs");
const { DEFAULT_CODES_URL, verifyRemoteCode } = require("./remote-code.cjs");
const APP_URL = "tyter://app/";
const codesUrl =
  process.env.TYTER_CODES_URL ||
  require("../package.json").codesUrl ||
  DEFAULT_CODES_URL;
const dataRoot = process.env.TYTER_DATA_ROOT
  ? path.resolve(process.env.TYTER_DATA_ROOT)
  : path.join(app.getPath("appData"), "Tyter");
const profile = path.join(dataRoot, "Profile");
mkdirSync(profile, { recursive: true });
app.setPath("userData", profile);
protocol.registerSchemesAsPrivileged([
  {
    scheme: "tyter",
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
]);
let mainWindow,
  closing = false,
  verified = false;
let activation = { valid: false, saved: false, reason: "" };
const keyPath = path.join(profile, "activation.json");
async function savedCode() {
  try {
    const saved = JSON.parse(await readFile(keyPath, "utf8"));
    return saved.encrypted
      ? safeStorage.decryptString(Buffer.from(saved.value, "base64"))
      : saved.value;
  } catch {
    return "";
  }
}
async function checkCode(code, persist = false) {
  verified = false;
  const result = await verifyRemoteCode(code, { url: codesUrl });
  activation = { ...result, saved: !!(await savedCode()) };
  if (result.valid) {
    if (persist) {
      const encrypted = safeStorage.isEncryptionAvailable();
      const value = encrypted
        ? safeStorage.encryptString(code.trim()).toString("base64")
        : code.trim();
      await writeFile(keyPath + ".tmp", JSON.stringify({ encrypted, value }), {
        mode: 0o600,
      });
      await rename(keyPath + ".tmp", keyPath);
    }
    verified = true;
  }
  return result;
}
async function loadScreen() {
  const code = await savedCode();
  if (code) await checkCode(code);
  else {
    verified = false;
    activation = { valid: false, saved: false, reason: "" };
  }
  await mainWindow.loadURL(APP_URL + (verified ? "" : "activate.html"));
}
function bundledPath(requestUrl) {
  const url = new URL(requestUrl);
  if (url.host !== "app") return null;
  const pathname = decodeURIComponent(url.pathname);
  if (pathname === "/activate.html" || pathname === "/activation.js")
    return path.join(__dirname, pathname.slice(1));
  if (!verified && pathname !== "/brand/tyter-logo.svg") return null;
  const root = path.resolve(__dirname, "..", "dist");
  const target = path.resolve(
    root,
    `.${pathname === "/" ? "/index.html" : pathname}`,
  );
  const relative = path.relative(root, target);
  return relative.startsWith("..") || path.isAbsolute(relative) ? null : target;
}
function trusted(event, gate = false) {
  if (
    event.sender !== mainWindow?.webContents ||
    !event.senderFrame.url.startsWith(APP_URL) ||
    (gate && event.senderFrame.url !== APP_URL + "activate.html")
  )
    throw new Error("Недоступный источник запроса.");
}
async function contextMenu(event, params) {
  if (!verified || !params.isEditable) return;
  const inside = await mainWindow.webContents.executeJavaScript(
    `!!document.elementFromPoint(${Number(params.x)}, ${Number(params.y)})?.closest('.screenplay-editor')`,
  );
  if (!inside) return;
  const selected = !!params.selectionText;
  const action = (name) => () =>
    mainWindow.webContents.send("tyter:editor-action", name);
  const suggestions = (params.dictionarySuggestions || [])
    .slice(0, 6)
    .map((word) => ({
      label: word,
      click: () => mainWindow.webContents.replaceMisspelling(word),
    }));
  Menu.buildFromTemplate([
    { label: "Вставить", role: "paste", enabled: !!clipboard.readText() },
    { label: "Копировать", role: "copy", enabled: selected },
    { label: "Вырезать", role: "cut", enabled: selected },
    { label: "Выделить всё", role: "selectAll" },
    { type: "separator" },
    { label: "Жирный", enabled: selected, click: action("bold") },
    { label: "Курсив", enabled: selected, click: action("italic") },
    { label: "Компонент", enabled: selected, click: action("component") },
    { label: "Реквизит", enabled: selected, click: action("prop") },
    { type: "separator" },
    { label: "Орфография · русский", enabled: false },
    ...suggestions,
    ...(!suggestions.length
      ? [
          {
            label: params.misspelledWord
              ? "Нет вариантов замены"
              : "Нет ошибок в выбранном слове",
            enabled: false,
          },
        ]
      : []),
  ]).popup({ window: mainWindow });
}
async function createWindow() {
  closing = false;
  mainWindow = new BrowserWindow({
    width: 1380,
    height: 900,
    minWidth: 780,
    minHeight: 560,
    title: "Tyter Pro",
    autoHideMenuBar: true,
    backgroundColor: "#f6f6f8",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });
  const session = mainWindow.webContents.session;
  if (session.availableSpellCheckerLanguages.includes("ru"))
    session.setSpellCheckerLanguages(["ru"]);
  mainWindow.webContents.on("context-menu", (event, params) => {
    contextMenu(event, params).catch(() => {});
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (
      !url.startsWith(APP_URL) ||
      (!verified && url !== APP_URL + "activate.html")
    )
      event.preventDefault();
  });
  mainWindow.on("close", (event) => {
    if (closing || !verified) return;
    event.preventDefault();
    mainWindow.webContents.send("tyter:before-close");
    setTimeout(() => {
      if (!mainWindow?.isDestroyed() && !closing) {
        closing = true;
        mainWindow.close();
      }
    }, 5000);
  });
  await loadScreen();
}
app.whenReady().then(async () => {
  protocol.handle("tyter", (request) => {
    const target = bundledPath(request.url);
    return target
      ? net.fetch(pathToFileURL(target).toString())
      : new Response("Not found", { status: 404 });
  });
  const localStore = createLocalStore(
    path.join(dataRoot, "Documents"),
    (directory) => shell.openPath(directory),
  );
  ipcMain.handle("tyter:request", (event, endpoint, body) => {
    trusted(event);
    if (!verified || event.senderFrame.url === APP_URL + "activate.html")
      throw new Error("Сначала активируйте Tyter Pro.");
    return localStore(endpoint, body);
  });
  ipcMain.handle("tyter:activation-status", (event) => {
    trusted(event, true);
    return activation;
  });
  ipcMain.handle("tyter:activate-license", async (event, key) => {
    trusted(event, true);
    if (typeof key !== "string")
      return { valid: false, reason: "Введите 6 цифр." };
    const result = await checkCode(key, true);
    if (result.valid) setImmediate(() => mainWindow.loadURL(APP_URL));
    return result;
  });
  ipcMain.handle("tyter:retry-activation", async (event) => {
    trusted(event, true);
    const result = await checkCode(await savedCode());
    if (result.valid) setImmediate(() => mainWindow.loadURL(APP_URL));
    return result;
  });
  ipcMain.handle("tyter:open-support", async (event, kind) => {
    trusted(event);
    const targets = {
      donate: "https://boosty.to/sergeybuharev",
      email: "mailto:mrbuha@ya.ru",
      telegram: "https://t.me/SergeyBuharev",
    };
    if (targets[kind]) await shell.openExternal(targets[kind]);
  });
  ipcMain.on("tyter:flushed", (event) => {
    if (event.sender === mainWindow?.webContents) {
      closing = true;
      mainWindow.close();
    }
  });
  await createWindow();
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
