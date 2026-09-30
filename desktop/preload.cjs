const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("tyterDesktop", {
  edition: "pro",
  request: (endpoint, body) =>
    ipcRenderer.invoke("tyter:request", endpoint, body),
  activateLicense: (key) => ipcRenderer.invoke("tyter:activate-license", key),
  activationStatus: () => ipcRenderer.invoke("tyter:activation-status"),
  retryActivation: () => ipcRenderer.invoke("tyter:retry-activation"),
  openSupport: (kind) => ipcRenderer.invoke("tyter:open-support", kind),
  onEditorAction: (handler) => {
    const listener = (_event, action) => handler(action);
    ipcRenderer.on("tyter:editor-action", listener);
    return () => ipcRenderer.removeListener("tyter:editor-action", listener);
  },
  onBeforeClose: (handler) => {
    const listener = () => handler();
    ipcRenderer.on("tyter:before-close", listener);
    return () => ipcRenderer.removeListener("tyter:before-close", listener);
  },
  confirmClose: () => ipcRenderer.send("tyter:flushed"),
});
