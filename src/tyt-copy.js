import { documentFileStem } from "./local-file-names.js";

const nameKey = (id) => `tyter.tyt-filename.v1.${id}`;
const validName = (name) =>
  typeof name === "string" &&
  name.length <= 255 &&
  !/[<>:"/\\|?*\u0000-\u001f]/.test(name) &&
  /.+\.tyt$/i.test(name);

export function rememberTytFileName(document, name) {
  if (!validName(name)) return;
  try {
    const value = JSON.stringify({ title: document.title, name });
    if (localStorage.getItem(nameKey(document.id)) !== value)
      localStorage.setItem(nameKey(document.id), value);
  } catch {
    // Remembering a name must never prevent saving the document.
  }
}

export function tytCopyFileName(document) {
  try {
    const saved = JSON.parse(localStorage.getItem(nameKey(document.id)));
    if (saved?.title === document.title && validName(saved.name))
      return saved.name;
  } catch {}
  return `${documentFileStem(document.title)}.tyt`;
}

// Call before any asynchronous work so the picker retains user activation.
export function chooseTytCopyTarget(name) {
  if (window.tyterDesktop?.saveCopy) {
    return Promise.resolve({
      async write(blob) {
        return window.tyterDesktop.saveCopy({ name, text: await blob.text() });
      },
    });
  }
  if (window.showSaveFilePicker) {
    return window
      .showSaveFilePicker({
        id: "tyter-save-copy",
        suggestedName: name,
        excludeAcceptAllOption: true,
        types: [
          {
            description: "Tyter (.tyt)",
            accept: { "application/vnd.tyter+json": [".tyt"] },
          },
        ],
      })
      .then((handle) => ({
        async write(blob) {
          const writable = await handle.createWritable();
          try {
            await writable.write(blob);
            await writable.close();
            return { name: handle.name };
          } catch (error) {
            await writable.abort().catch(() => {});
            throw error;
          }
        },
      }));
  }
  // Browsers without file system access use their own download/save dialog.
  return Promise.resolve({
    async write(blob) {
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      return { name };
    },
  });
}
