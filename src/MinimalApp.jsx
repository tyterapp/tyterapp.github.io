import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  Download,
  FileText,
  FolderOpen,
  Pencil,
  MoreHorizontal,
  Plus,
  Search,
  Shapes,
  Trash2,
  X,
  ChartNoAxesColumn,
  CircleHelp,
  Settings2,
  RefreshCw,
  History,
  Box,
  ListTree,
  AlignLeft,
} from "lucide-react";
import OutlineBoard from "./OutlineBoard.jsx";
import { exportTYT } from "./tyt-format.js";
import { chooseLocalDirectory } from "./browser-files.js";
import PropsPanel from "./PropsPanel.jsx";
import AnnotationsPanel from "./AnnotationsPanel.jsx";
import { documentFont } from "./document-fonts.js";
import { CommentsPanel, Onboarding } from "./EditorPanels.jsx";
import DocumentSearch from "./DocumentSearch.jsx";
import DocumentSettings from "./DocumentSettings.jsx";
import SubscriptionDialog from "./SubscriptionDialog.jsx";
import { IS_PRO as BUILD_IS_PRO, useEdition } from "./edition.js";
import { importDocument } from "./imports.js";
import StatisticsPanel from "./StatisticsPanel.jsx";
import ComponentsPanel from "./ComponentsPanel.jsx";
import FormatBar from "./FormatBar.jsx";
import HistoryPanel from "./HistoryPanel.jsx";
import HistoryPreview from "./HistoryPreview.jsx";
import TooltipLayer from "./TooltipLayer.jsx";
import {
  changeLabel,
  deleteRevisions,
  recordRevision,
  importRevisions,
  snapshotOf,
} from "./history.js";
import { pageHeightFor } from "./pagination.js";
import {
  localRequest,
  saveLocalFiles,
  deleteLocalFile,
  isWebPro,
} from "./local-files.js";
import ScreenplayEditor from "./ScreenplayEditor.jsx";
import { createProject, uid, validateImport } from "./data.js";
import {
  exportPDF,
  exportDOCX,
  exportFDX,
  exportPropsPDF,
  saveBlob,
} from "./exports.js";

const STORAGE = "tyter.projects.v1";
const EMPTY_PROPS = [];
const grandfatherDocuments = (documents, isPro = BUILD_IS_PRO) =>
  !isPro &&
  !window.tyterDesktop?.request &&
  documents.length > 2 &&
  !documents.some((doc) => doc.quotaExempt)
    ? documents.map((doc) => ({ ...doc, quotaExempt: true }))
    : documents;
const quotaFull = (documents, isPro = BUILD_IS_PRO) =>
  !isPro && documents.filter((doc) => !doc.quotaExempt).length >= 2;
function newDocument() {
  const doc = createProject("Без названия");
  doc.content.content = [
    { type: "paragraph", attrs: { format: "scene", blockId: uid() } },
  ];
  return doc;
}
function sampleDocuments() {
  const cat = createProject("Глазами кошки");
  cat.content.content = [
    {
      type: "paragraph",
      attrs: { format: "scene", blockId: uid() },
      content: [{ type: "text", text: "ИНТ. КВАРТИРА — УТРО" }],
    },
    {
      type: "paragraph",
      attrs: { format: "action", blockId: uid() },
      content: [
        {
          type: "text",
          text: "Кошка наблюдает за городом с подоконника. Внизу спешат люди, а на кухне тихо звенит её пустая миска.",
        },
      ],
    },
    {
      type: "paragraph",
      attrs: { format: "character", blockId: uid() },
      content: [{ type: "text", text: "КОШКА" }],
    },
    {
      type: "paragraph",
      attrs: { format: "speech", blockId: uid() },
      content: [
        { type: "text", text: "Кажется, у них опять свои планы на завтрак." },
      ],
    },
  ];
  return [newDocument(), cat];
}
function loadDocuments(isPro = BUILD_IS_PRO) {
  try {
    const raw = localStorage.getItem(STORAGE);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) throw new Error();
      if (parsed.length)
        return {
          documents: grandfatherDocuments(parsed.map(validateImport), isPro),
          error: false,
          hasSaved: true,
        };
    }
    return { documents: sampleDocuments(), error: false };
  } catch {
    // Keep the original storage untouched if an older or damaged file cannot be read.
    return { documents: [newDocument()], error: !isWebPro() };
  }
}
function Dialog({ title, children, onClose }) {
  const ref = useRef(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="minimal-dialog"
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        close.current();
      }}
      onClick={(e) => {
        if (e.target === ref.current) close.current();
      }}
    >
      <div className="dialog-heading">
        <h2>{title}</h2>
        <button className="icon-button" onClick={onClose} aria-label="Закрыть">
          <X size={18} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
function DeleteComponentFolderDialog({ folder, onClose, onConfirm }) {
  const [deleteComponents, setDeleteComponents] = useState(false);
  return (
    <Dialog title="Удалить папку?" onClose={onClose}>
      <p className="delete-document-copy">
        Папка «{folder.name}» исчезнет. Без галочки компоненты останутся в
        разделах «Персонажи» и «Места».
      </p>
      <label className="folder-delete-option">
        <input
          type="checkbox"
          checked={deleteComponents}
          onChange={(event) => setDeleteComponents(event.target.checked)}
        />
        <span>Удалить компоненты в папке</span>
      </label>
      <div className="dialog-actions">
        <button className="quiet-button" onClick={onClose}>
          Отмена
        </button>
        <button
          className="primary-button"
          onClick={() => onConfirm(deleteComponents)}
        >
          Удалить папку
        </button>
      </div>
    </Dialog>
  );
}
function ComponentForm({
  value,
  components,
  folders = [],
  inline = false,
  prop = false,
  onSubmit,
  onDelete,
  onClose,
}) {
  const [name, setName] = useState(value.name || "");
  const [description, setDescription] = useState(value.description || "");
  const [quantity, setQuantity] = useState(value.quantity || 1);
  const [folderId, setFolderId] = useState(
    value.folderId || value.type || "character",
  );
  const Wrapper = inline ? "div" : Dialog;
  const duplicate = components.some(
    (c) =>
      c.id !== value.id &&
      c.name.toLocaleLowerCase() === name.trim().toLocaleLowerCase(),
  );
  return (
    <Wrapper
      {...(inline
        ? { className: "component-editor minimal-dialog" }
        : {
            title: prop
              ? value.id
                ? "Реквизит"
                : "Новый реквизит"
              : value.id
                ? "Компонент"
                : "Новый компонент",
            onClose,
          })}
    >
      <form
        onKeyDown={(event) => {
          if (
            (event.ctrlKey || event.metaKey) &&
            event.key === "Enter" &&
            !event.altKey
          ) {
            event.preventDefault();
            if (!event.repeat) event.currentTarget.requestSubmit();
          }
        }}
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim() && !duplicate)
            onSubmit({
              ...value,
              name: name.trim(),
              ...(prop
                ? {
                    quantity: Math.max(
                      1,
                      Math.min(999999, Math.round(Number(quantity) || 1)),
                    ),
                    category: "Objects",
                  }
                : {}),
              type:
                folderId === "place"
                  ? "place"
                  : folderId === "character"
                    ? "character"
                    : value.type || "character",
              description: description.trim(),
              folderId:
                folderId === "place" || folderId === "character"
                  ? null
                  : folderId,
            });
        }}
      >
        <label>
          Название
          <input
            autoFocus
            required
            maxLength={200}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Например, Анна"
          />
        </label>
        {prop ? (
          <label>
            Количество
            <input
              aria-label="Количество реквизита"
              type="number"
              min="1"
              max="999999"
              required
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </label>
        ) : (
          <label>
            Папка
            <select
              aria-label="Папка"
              value={folderId}
              onChange={(e) => setFolderId(e.target.value)}
            >
              <option value="character">Персонажи</option>
              <option value="place">Места</option>
              {folders.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Описание <span className="muted">· необязательно</span>
          <textarea
            rows={3}
            maxLength={5000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={
              prop
                ? "Что важно помнить об этом реквизите"
                : "Что важно помнить об этом компоненте"
            }
          />
        </label>
        {duplicate && (
          <p className="form-error" role="alert">
            {prop
              ? "Реквизит с таким названием уже есть."
              : "Компонент с таким названием уже есть."}
          </p>
        )}
        <div className="dialog-actions">
          {value.id && (
            <button
              type="button"
              className="icon-button delete-component"
              aria-label={prop ? "Удалить реквизит" : "Удалить компонент"}
              data-tooltip={prop ? "Удалить реквизит" : "Удалить компонент"}
              onClick={() => onDelete(value.id)}
            >
              <Trash2 size={17} />
            </button>
          )}
          <button type="button" className="quiet-button" onClick={onClose}>
            Отмена
          </button>
          <button
            className="primary-button"
            aria-keyshortcuts="Control+Enter Meta+Enter"
            disabled={!name.trim() || duplicate}
          >
            {value.id ? "Сохранить" : "Создать"}
          </button>
        </div>
      </form>
    </Wrapper>
  );
}

export default function MinimalApp() {
  const { isPro: IS_PRO, historyDays } = useEdition();
  useEffect(() => {
    const keyboard = (event) => {
      if (event.key === "Tab" && !event.ctrlKey && !event.metaKey)
        document.documentElement.dataset.keyboardFocus = "true";
    };
    const pointer = () => {
      delete document.documentElement.dataset.keyboardFocus;
    };
    document.addEventListener("keydown", keyboard, true);
    document.addEventListener("pointerdown", pointer, true);
    return () => {
      document.removeEventListener("keydown", keyboard, true);
      document.removeEventListener("pointerdown", pointer, true);
      delete document.documentElement.dataset.keyboardFocus;
    };
  }, []);
  const [initial] = useState(() => loadDocuments(IS_PRO));
  const [documents, setDocuments] = useState(initial.documents);
  useEffect(() => {
    if (
      !IS_PRO &&
      !window.tyterDesktop?.request &&
      documents.length > 2 &&
      !documents.some((doc) => doc.quotaExempt)
    )
      setDocuments(grandfatherDocuments(documents, IS_PRO));
  }, [documents]);
  const [activeId, setActiveId] = useState(() => {
    try {
      return localStorage.getItem("tyter.active") || initial.documents[0].id;
    } catch {
      return initial.documents[0].id;
    }
  });
  const current = documents.find((d) => d.id === activeId) || documents[0];
  const documentsRef = useRef(documents);
  documentsRef.current = documents;
  const editorRef = useRef(null),
    menuRef = useRef(null),
    exportRef = useRef(null),
    importRef = useRef(null);
  const componentHistory = useRef({ undo: [], redo: [] });
  const [menu, setMenu] = useState(null);
  const [documentActions, setDocumentActions] = useState(null);
  const [query, setQuery] = useState("");
  const [componentsOpen, setComponentsOpen] = useState(false);
  const [view, setView] = useState("screenplay");
  const [outlineCard, setOutlineCard] = useState(null);
  const [sceneTarget, setSceneTarget] = useState(null);
  const [propsOpen, setPropsOpen] = useState(false);
  const [annotations, setAnnotations] = useState(null);
  const [propDialog, setPropDialog] = useState(null);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [statisticsOpen, setStatisticsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyRevision, setHistoryRevision] = useState(null);
  const [historyVersion, setHistoryVersion] = useState(0);
  const historyTracked = useRef(new Map());
  const historyWritten = useRef(new Map());
  const [subscriptionOpen, setSubscriptionOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [commentQuote, setCommentQuote] = useState(null);
  const [activeComment, setActiveComment] = useState(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [searchIndex, setSearchIndex] = useState(0);
  const [searchCardSelection, setSearchCardSelection] = useState(null);
  const searchCardRequest = useRef(0);
  const handledSearchCardRequest = useRef(0);
  const [searchCount, setSearchCount] = useState(0);
  const showSidebar = useCallback((kind) => {
    setOutlineCard(null);
    if (kind !== "annotations") setAnnotations(null);
    setSearchOpen(kind === "search");
    if (kind !== "search") setSearchCardSelection(null);
    setComponentsOpen(kind === "components");
    setPropsOpen(kind === "props");
    if (kind !== "props") setPropDialog(null);
    setCommentsOpen(kind === "comments");
    setStatisticsOpen(kind === "statistics");
    setSettingsOpen(kind === "settings");
    setHistoryOpen(kind === "history");
    if (kind !== "history") setHistoryRevision(null);
    if (kind !== "components") setComponentDialog(null);
  }, []);
  const [tourOpen, setTourOpen] = useState(() => {
    try {
      return !localStorage.getItem("tyter.onboarding.v1");
    } catch {
      return true;
    }
  });
  const [filesReady, setFilesReady] = useState(false);
  const [diskAvailable, setDiskAvailable] = useState(false);
  const [diskState, setDiskState] = useState("loading");
  const diskRevision = useRef(0);
  const [componentDialog, setComponentDialog] = useState(null);
  const [folderToDelete, setFolderToDelete] = useState(null);
  const [rename, setRename] = useState(null);
  const [selection, setSelection] = useState({ format: "scene" });
  const [pageCount, setPageCount] = useState(1);
  const [saveState, setSaveState] = useState("saving");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState(
    initial.error
      ? "Не удалось прочитать сохранённые документы. Исходные данные сохранены; новые изменения можно скачать в файл."
      : "",
  );
  const writeStorage = useCallback(() => {
    if (initial.error) {
      setSaveState("error");
      return;
    }
    try {
      const desktop = !!window.tyterDesktop?.request;
      const browserPro = isWebPro();
      if (!desktop && !browserPro) {
        localStorage.setItem(STORAGE, JSON.stringify(documentsRef.current));
        setSaveState("saved");
      }
      if (diskAvailable) {
        const revision = ++diskRevision.current;
        setDiskState("saving");
        saveLocalFiles(documentsRef.current)
          .then((result) => {
            if (revision === diskRevision.current) {
              setDiskState(result?.needsPermission ? "error" : "saved");
              if (desktop || browserPro) setSaveState("saved");
            }
          })
          .catch(() => {
            if (revision === diskRevision.current) {
              setDiskState("error");
              if (desktop || browserPro) setSaveState("error");
            }
          });
      } else if (desktop || browserPro) setSaveState("error");
    } catch {
      setSaveState("error");
    }
  }, [initial.error, diskAvailable]);
  useEffect(() => {
    let cancelled = false;
    if (initial.error) {
      setFilesReady(true);
      setDiskState("error");
      return;
    }
    localRequest("documents")
      .then(({ documents: stored, deletedIds = [] }) => {
        if (cancelled) return;
        const disk = stored.map(validateImport);
        if (disk.length || deletedIds.length)
          setDocuments((list) => {
            const merged = new Map(
              (initial.hasSaved ? list : [])
                .filter((d) => !deletedIds.includes(d.id))
                .map((d) => [d.id, d]),
            );
            for (const doc of disk) {
              const existing = merged.get(doc.id);
              if (!existing || doc.updatedAt > existing.updatedAt)
                merged.set(doc.id, doc);
            }
            return merged.size
              ? grandfatherDocuments([...merged.values()], IS_PRO)
              : [newDocument()];
          });
        setDiskAvailable(true);
        setDiskState("saved");
      })
      .catch(() => {
        if (!cancelled) setDiskState("unavailable");
      })
      .finally(() => {
        if (!cancelled) setFilesReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [initial]);
  useEffect(() => {
    if (!filesReady) return;
    setSaveState("saving");
    const timeout = setTimeout(writeStorage, 350);
    window.addEventListener("pagehide", writeStorage);
    window.addEventListener("beforeunload", writeStorage);
    window.addEventListener("tyter:save-now", writeStorage);
    return () => {
      clearTimeout(timeout);
      window.removeEventListener("pagehide", writeStorage);
      window.removeEventListener("beforeunload", writeStorage);
      window.removeEventListener("tyter:save-now", writeStorage);
    };
  }, [documents, writeStorage, filesReady]);
  useEffect(() => {
    if (!window.tyterDesktop?.onBeforeClose) return;
    return window.tyterDesktop.onBeforeClose(async () => {
      try {
        await saveLocalFiles(documentsRef.current);
      } finally {
        window.tyterDesktop.confirmClose();
      }
    });
  }, []);
  useEffect(() => {
    if (!filesReady) return;
    const snapshot = snapshotOf(current);
    const signature = JSON.stringify(snapshot);
    const previous = historyTracked.current.get(current.id);
    if (previous && previous.signature !== signature) {
      const now = Date.now();
      if (now - (historyWritten.current.get(current.id) || 0) > 30000) {
        historyWritten.current.set(current.id, now);
        recordRevision(
          current.id,
          previous.snapshot,
          changeLabel(previous.snapshot, snapshot),
          historyDays,
        )
          .then(() => setHistoryVersion((version) => version + 1))
          .catch(() => {});
      }
    }
    historyTracked.current.set(current.id, { snapshot, signature });
  }, [current, filesReady]);
  const restoreHistory = async (entry) => {
    try {
      historyWritten.current.set(current.id, Date.now());
      await recordRevision(
        current.id,
        snapshotOf(current),
        "восстановления",
        historyDays,
      );
      update((document) => ({
        ...document,
        ...structuredClone(entry.snapshot),
      }));
      setHistoryRevision(null);
      setHistoryVersion((version) => version + 1);
    } catch {
      setMessage("Не удалось восстановить локальную версию сценария.");
    }
  };
  useEffect(() => {
    window.document.title = `${current.title} — Tyter${IS_PRO ? " Pro" : ""}`;
    try {
      localStorage.setItem("tyter.active", current.id);
    } catch {
      setSaveState("error");
    }
  }, [current.id, current.title]);
  useEffect(() => {
    const outside = (e) => {
      if (
        ![menuRef, exportRef].some((ref) => ref.current?.contains(e.target))
      ) {
        setMenu(null);
        setDocumentActions(null);
      }
    };
    const keys = (e) => {
      if (e.key === "Escape") {
        setMenu(null);
        setDocumentActions(null);
      }
      if (
        (e.ctrlKey || e.metaKey) &&
        (e.code === "KeyF" || e.key.toLowerCase() === "f") &&
        !window.document.querySelector("dialog[open]")
      ) {
        e.preventDefault();
        if (view === "outline")
          window.document.querySelector(".outline-search input")?.focus();
        else showSidebar("search");
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        writeStorage();
      }
    };
    window.document.addEventListener("pointerdown", outside);
    window.document.addEventListener("keydown", keys);
    return () => {
      window.document.removeEventListener("pointerdown", outside);
      window.document.removeEventListener("keydown", keys);
    };
  }, [writeStorage, showSidebar, view]);
  const update = useCallback(
    (fn) =>
      setDocuments((list) =>
        list.map((d) =>
          d.id === current.id
            ? { ...fn(d), updatedAt: new Date().toISOString() }
            : d,
        ),
      ),
    [current.id],
  );
  const changeContent = useCallback(
    (content, anchors) =>
      update((d) => ({
        ...d,
        content,
        comments: anchors
          ? d.comments.map((c) => ({ ...c, anchor: anchors[c.id] ?? c.anchor }))
          : d.comments,
      })),
    [update],
  );
  const changeView = (next) => {
    if (next === "outline" && !IS_PRO) {
      setSubscriptionOpen(true);
      return;
    }
    showSidebar(null);
    setView(next);
    setMenu(null);
  };
  const outline = current.outline || { columns: [], cards: [] };
  const outlineWithLinks = {
    ...outline,
    cards: outline.cards.map((card) => ({
      ...card,
      blockId: current.content.content.some(
        (block) =>
          block.attrs?.blockId === card.blockId &&
          block.attrs?.format === "scene",
      )
        ? card.blockId
        : null,
    })),
  };
  const insertCardScene = (card) => {
    const blockId = uid();
    const textBlock = (format, text, id) => ({
      type: "paragraph",
      attrs: { format, blockId: id },
      ...(text ? { content: [{ type: "text", text }] } : {}),
    });
    return {
      blockId,
      blocks: [
        textBlock(
          "scene",
          card.title?.trim() && card.title !== "Без названия"
            ? card.title
            : "ИНТ. НОВАЯ СЦЕНА — ДЕНЬ",
          blockId,
        ),
        ...String(card.text || "")
          .split("\n")
          .map((line) => textBlock("action", line, uid())),
      ],
    };
  };
  const addOutlineCard = (columnId, source = {}) => {
    const card = {
      id: uid(),
      columnId,
      title: source.title || "Без названия",
      text: source.text || "",
      color: source.color || "#33313b",
      comments: [],
    };
    const { blockId, blocks } = insertCardScene(card);
    card.blockId = blockId;
    update((document) => ({
      ...document,
      outline: { ...outline, cards: [...outline.cards, card] },
      content: {
        ...document.content,
        content: [...document.content.content, ...blocks],
      },
    }));
    setOutlineCard(card.id);
  };
  const relinkOutlineCard = (card) => {
    const { blockId, blocks } = insertCardScene(card);
    update((document) => ({
      ...document,
      outline: {
        ...outline,
        cards: outline.cards.map((item) =>
          item.id === card.id ? { ...item, blockId } : item,
        ),
      },
      content: {
        ...document.content,
        content: [...document.content.content, ...blocks],
      },
    }));
    changeView("screenplay");
    setSceneTarget(blockId);
  };
  const locateOutlineCard = (card) => {
    changeView("screenplay");
    setSceneTarget(card.blockId);
  };
  useEffect(() => {
    if (view !== "screenplay" || !sceneTarget) return;
    const frame = requestAnimationFrame(() => {
      editorRef.current?.focusBlock(sceneTarget);
      setSceneTarget(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [view, sceneTarget, current.content]);
  useEffect(() => {
    setOutlineCard(null);
    setSceneTarget(null);
  }, [current.id]);
  useEffect(() => {
    const onUndoRedo = (event) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      const undo = key === "z" && !event.shiftKey;
      const redo = key === "y" || (key === "z" && event.shiftKey);
      if (!undo && !redo) return;
      if (
        event.target instanceof Element &&
        event.target.closest(
          "input, textarea, select, [contenteditable]:not(.tiptap)",
        )
      )
        return;
      const stack = componentHistory.current[undo ? "undo" : "redo"];
      const entry = stack.at(-1);
      const editor = editorRef.current;
      const actual = editor?.getJSON();
      const expected = undo ? entry?.afterContent : entry?.beforeContent;
      if (
        !entry ||
        entry.documentId !== activeId ||
        JSON.stringify(actual) !== JSON.stringify(expected)
      ) {
        if (
          event.target instanceof Element &&
          !event.target.closest(".tiptap")
        ) {
          event.preventDefault();
          if (undo) editor?.undo();
          else editor?.redo();
        }
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      stack.pop();
      componentHistory.current[undo ? "redo" : "undo"].push(entry);
      const content = undo ? entry.beforeContent : entry.afterContent;
      editor.restoreContent(content);
      setDocuments((list) =>
        list.map((document) => {
          if (document.id !== entry.documentId) return document;
          if (entry.kind === "folder")
            return {
              ...document,
              ...(undo ? entry.beforeFolderState : entry.afterFolderState),
              content,
              updatedAt: new Date().toISOString(),
            };
          const collection = entry.collection || "components";
          const components = document[collection].filter(
            (item) => item.id !== entry.component.id,
          );
          if (undo) components.splice(entry.index, 0, entry.component);
          return {
            ...document,
            [collection]: components,
            content,
            updatedAt: new Date().toISOString(),
          };
        }),
      );
    };
    document.addEventListener("keydown", onUndoRedo, true);
    return () => document.removeEventListener("keydown", onUndoRedo, true);
  }, [activeId]);
  const switchDocument = (doc) => {
    setActiveId(doc.id);
    setMenu(null);
    setDocumentActions(null);
    setQuery("");
    setComponentDialog(null);
    setPropDialog(null);
    setRename(null);
    setCommentQuote(null);
    setActiveComment(null);
    setSearchText("");
    setSearchIndex(0);
    setSearchCardSelection(null);
    setPageCount(1);
    setHistoryRevision(null);
  };
  const openComments = useCallback(
    (source) => {
      showSidebar("comments");
      if (source?.commentId) {
        setActiveComment(source.commentId);
        setCommentQuote(null);
      } else {
        setActiveComment(null);
        setCommentQuote(
          source && source.from !== source.to && source.text ? source : null,
        );
      }
    },
    [showSidebar],
  );
  const addComment = (text) => {
    const comment = {
      id: uid(),
      text,
      quote: commentQuote?.text || "",
      blockId: commentQuote?.blockId || null,
      author: "Вы",
      createdAt: new Date().toISOString(),
      resolved: false,
      anchor: commentQuote?.from ?? null,
    };
    if (
      commentQuote &&
      !editorRef.current?.addComment(comment.id, commentQuote)
    ) {
      setMessage("Выделенный текст изменился. Выделите его снова.");
      return;
    }
    update((d) => ({ ...d, comments: [...d.comments, comment] }));
    setCommentQuote(null);
    setActiveComment(comment.id);
  };
  useEffect(() => {
    if (!searchOpen) {
      setSearchCount(0);
      return;
    }
    const fromCard = searchCardSelection?.index === searchIndex;
    const scroll =
      !fromCard ||
      handledSearchCardRequest.current !== searchCardSelection.request;
    if (fromCard)
      handledSearchCardRequest.current = searchCardSelection.request;
    const count =
      editorRef.current?.findText(searchText, searchIndex, {
        fromCard,
        scroll,
      }) || 0;
    setSearchCount(count);
    if (count && searchIndex >= count) setSearchIndex(0);
  }, [
    searchOpen,
    searchText,
    searchIndex,
    searchCardSelection,
    current.content,
    current.id,
  ]);
  const closeTour = () => {
    setTourOpen(false);
    try {
      localStorage.setItem("tyter.onboarding.v1", "done");
    } catch {}
  };
  const openLocalFolder = async () => {
    if (isWebPro()) {
      try {
        const { documents: disk, name } = await chooseLocalDirectory();
        if (disk.length)
          setDocuments((list) => {
            const merged = new Map(
              list.map((document) => [document.id, document]),
            );
            for (const document of disk)
              if (
                !merged.has(document.id) ||
                document.updatedAt > merged.get(document.id).updatedAt
              )
                merged.set(document.id, document);
            return [...merged.values()];
          });
        setMessage(
          "Подключена папка «" +
            name +
            "». Файлы TYT будут сохраняться автоматически.",
        );
        setDiskAvailable(true);
      } catch (error) {
        if (error.name !== "AbortError") setMessage(error.message);
      }
      return;
    }
    if (!diskAvailable) {
      setMessage(
        "Папка доступна при локальном запуске Tyter. Сейчас документ сохранён в браузере; скачайте копию через «Скачать».",
      );
      return;
    }
    setBusy("folder");
    try {
      await saveLocalFiles(documentsRef.current);
      setDiskState("saved");
      await localRequest("open-folder", {});
    } catch {
      setMessage(
        "Не удалось открыть папку локальных файлов. Проверьте, что Tyter запущен на этом компьютере.",
      );
    } finally {
      setBusy("");
    }
  };
  const createDocument = () => {
    if (quotaFull(documents, IS_PRO)) {
      setMenu(null);
      setSubscriptionOpen(true);
      return;
    }
    const doc = newDocument();
    setDocuments((list) => [doc, ...list]);
    switchDocument(doc);
  };
  const deleteDocument = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      if (diskAvailable) {
        if (!isWebPro()) await saveLocalFiles([deleteTarget]);
        await deleteLocalFile(deleteTarget.id);
      }
      const remaining = documentsRef.current.filter(
        (d) => d.id !== deleteTarget.id,
      );
      if (!remaining.length) remaining.push(newDocument());
      if (!window.tyterDesktop?.request)
        localStorage.setItem(STORAGE, JSON.stringify(remaining));
      deleteRevisions(deleteTarget.id).catch(() => {});
      setDocuments(remaining);
      if (current.id === deleteTarget.id) switchDocument(remaining[0]);
      setDeleteTarget(null);
    } catch (error) {
      console.error("Document deletion failed", error);
      setMessage("Не удалось удалить документ. Попробуйте ещё раз.");
    } finally {
      setDeleting(false);
    }
  };
  const saveComponent = (value) => {
    const { source, ...fields } = value;
    const duplicate = current.components.find(
      (c) =>
        c.id !== fields.id &&
        c.name.toLocaleLowerCase() === fields.name.toLocaleLowerCase(),
    );
    if (duplicate) {
      setMessage("Компонент с таким названием уже есть.");
      return;
    }
    if (!fields.id && !IS_PRO && current.components.length >= 10) {
      setComponentDialog(null);
      setSubscriptionOpen(true);
      return;
    }
    const next = {
      ...fields,
      id: fields.id || uid(),
      color: fields.color || (fields.type === "place" ? "#738598" : "#8a799a"),
    };
    if (
      fields.id &&
      current.components.some((c) => c.id === fields.id && c.name !== next.name)
    )
      editorRef.current?.renameEntity(fields.id, next.name);
    update((d) => ({
      ...d,
      components: fields.id
        ? d.components.map((c) => (c.id === fields.id ? next : c))
        : [...d.components, next],
    }));
    if (source) editorRef.current?.addEntity(next, source);
    setComponentDialog(null);
    const pairedProp = current.props.find(
      (item) =>
        item.componentId === next.id ||
        item.name.trim().toLocaleLowerCase() ===
          next.name.trim().toLocaleLowerCase() ||
        (fields.id &&
          item.name ===
            current.components.find((c) => c.id === fields.id)?.name),
    );
    if (IS_PRO && pairedProp) {
      if (pairedProp.name !== next.name)
        editorRef.current?.renameProp(pairedProp, next.name);
      update((d) => ({
        ...d,
        props: d.props.map((item) =>
          item.id === pairedProp.id
            ? { ...item, name: next.name, componentId: next.id }
            : item,
        ),
      }));
      openAnnotations(next, pairedProp);
    } else showSidebar("components");
  };
  const openAnnotations = (component, prop) => {
    showSidebar("annotations");
    setAnnotations({ componentId: component.id, propId: prop.id });
  };
  const editComponent = (component) => {
    showSidebar("components");
    setComponentDialog(component);
    const folderId = component.folderId || component.type;
    if (current.collapsedComponentFolders?.includes(folderId))
      update((d) => ({
        ...d,
        collapsedComponentFolders: d.collapsedComponentFolders.filter(
          (id) => id !== folderId,
        ),
      }));
  };
  const componentFromSelection = (source) => {
    const existing =
      current.components.find((c) => c.id === source.entityId) ||
      current.components.find(
        (c) =>
          c.name.trim().toLocaleLowerCase() ===
          source.text.trim().toLocaleLowerCase(),
      );
    if (existing) {
      if (!source.entityId) editorRef.current?.addEntity(existing, source);
      const paired =
        IS_PRO &&
        current.props.find(
          (item) =>
            item.componentId === existing.id ||
            item.name.trim().toLocaleLowerCase() ===
              existing.name.trim().toLocaleLowerCase(),
        );
      if (paired) openAnnotations(existing, paired);
      else editComponent(existing);
    } else
      beginComponent({
        name: source.text.slice(0, 200),
        type: source.format === "scene" ? "place" : "character",
        source,
      });
  };
  const beginComponent = (value) => {
    if (!IS_PRO && current.components.length >= 10) {
      setSubscriptionOpen(true);
      return;
    }
    setComponentDialog(value);
  };
  const editProp = (prop) => {
    showSidebar("props");
    setPropDialog(prop);
  };
  useEffect(() => {
    setAnnotations(null);
  }, [current.id]);
  const beginProp = (value = {}) => {
    if (!IS_PRO) {
      setSubscriptionOpen(true);
      return;
    }
    setPropDialog(value);
  };
  const propFromSelection = (source) => {
    if (!IS_PRO) {
      setSubscriptionOpen(true);
      return;
    }
    const existing = current.props.find(
      (item) =>
        item.name.trim().toLocaleLowerCase() ===
        source.text.trim().toLocaleLowerCase(),
    );
    if (existing) {
      const paired = current.components.find(
        (item) =>
          item.id === source.entityId ||
          item.id === existing.componentId ||
          item.name.trim().toLocaleLowerCase() ===
            existing.name.trim().toLocaleLowerCase(),
      );
      if (paired) openAnnotations(paired, existing);
      else editProp(existing);
    } else beginProp({ name: source.text.slice(0, 200), quantity: 1 });
  };
  const saveProp = (value) => {
    if (!IS_PRO) return;
    const duplicate = current.props.find(
      (item) =>
        item.id !== value.id &&
        item.name.toLocaleLowerCase() === value.name.toLocaleLowerCase(),
    );
    if (duplicate) {
      setMessage("Реквизит с таким названием уже есть.");
      return;
    }
    const previous = current.props.find((item) => item.id === value.id);
    if (previous && previous.name !== value.name)
      editorRef.current?.renameProp(previous, value.name);
    const paired = current.components.find(
      (item) =>
        item.id === value.componentId ||
        item.name.trim().toLocaleLowerCase() ===
          (previous?.name || value.name).trim().toLocaleLowerCase(),
    );
    if (paired && paired.name !== value.name)
      editorRef.current?.renameEntity(paired.id, value.name);
    const next = {
      ...value,
      id: value.id || uid(),
      color: "#aa6032",
      ...(paired ? { componentId: paired.id } : {}),
    };
    update((d) => ({
      ...d,
      props: value.id
        ? d.props.map((item) => (item.id === value.id ? next : item))
        : [...d.props, next],
      components: paired
        ? d.components.map((item) =>
            item.id === paired.id ? { ...item, name: value.name } : item,
          )
        : d.components,
    }));
    if (paired) openAnnotations(paired, next);
    else showSidebar("props");
    setPropDialog(null);
  };
  const deleteProp = (id) => {
    const prop = current.props.find((item) => item.id === id);
    if (!prop) return;
    const beforeContent = editorRef.current?.getJSON() || current.content;
    editorRef.current?.removeEntity(id);
    const afterContent = editorRef.current?.getJSON() || current.content;
    componentHistory.current.undo.push({
      documentId: current.id,
      collection: "props",
      component: structuredClone(prop),
      index: current.props.findIndex((item) => item.id === id),
      beforeContent,
      afterContent,
    });
    componentHistory.current.redo = [];
    update((d) => ({ ...d, props: d.props.filter((item) => item.id !== id) }));
    setPropDialog(null);
  };
  const deleteComponent = (id) => {
    const component = current.components.find((item) => item.id === id);
    if (!component) return;
    const beforeContent = editorRef.current?.getJSON() || current.content;
    editorRef.current?.removeEntity(id);
    const afterContent = editorRef.current?.getJSON() || current.content;
    componentHistory.current.undo.push({
      documentId: current.id,
      component: structuredClone(component),
      index: current.components.findIndex((item) => item.id === id),
      beforeContent,
      afterContent,
    });
    componentHistory.current.redo = [];
    update((d) => ({
      ...d,
      components: d.components.filter((c) => c.id !== id),
    }));
    setComponentDialog(null);
  };
  const deleteComponentFolder = (deleteComponents = false) => {
    if (!folderToDelete) return;
    const folderId = folderToDelete.id;
    const ids = new Set(
      current.components
        .filter((component) => component.folderId === folderId)
        .map((component) => component.id),
    );
    const beforeContent = editorRef.current?.getJSON() || current.content;
    if (deleteComponents && ids.size)
      editorRef.current?.removeEntities([...ids]);
    const afterContent = editorRef.current?.getJSON() || beforeContent;
    const beforeFolderState = {
      componentFolders: structuredClone(current.componentFolders || []),
      collapsedComponentFolders: structuredClone(
        current.collapsedComponentFolders || [],
      ),
      components: structuredClone(current.components),
    };
    const afterFolderState = {
      componentFolders: beforeFolderState.componentFolders.filter(
        (folder) => folder.id !== folderId,
      ),
      collapsedComponentFolders:
        beforeFolderState.collapsedComponentFolders.filter(
          (id) => id !== folderId,
        ),
      components: deleteComponents
        ? beforeFolderState.components.filter(
            (component) => !ids.has(component.id),
          )
        : beforeFolderState.components.map((component) =>
            component.folderId === folderId
              ? { ...component, folderId: null }
              : component,
          ),
    };
    componentHistory.current.undo.push({
      kind: "folder",
      documentId: current.id,
      beforeContent,
      afterContent,
      beforeFolderState,
      afterFolderState,
    });
    componentHistory.current.redo = [];
    update((d) => ({ ...d, ...afterFolderState, content: afterContent }));
    setComponentDialog(null);
    setFolderToDelete(null);
  };
  const download = async (format) => {
    setMenu(null);
    setBusy(format);
    setMessage("");
    writeStorage();
    try {
      const blob = await {
        pdf: exportPDF,
        docx: exportDOCX,
        fdx: exportFDX,
        tyt: exportTYT,
      }[format](current);
      saveBlob(blob, current.title, format);
    } catch (error) {
      console.error(error);
      setMessage("Не удалось сохранить файл. Попробуйте ещё раз.");
    } finally {
      setBusy("");
    }
  };
  const openFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (/\.tyt$/i.test(file.name) && !IS_PRO) {
      setSubscriptionOpen(true);
      return;
    }
    if (quotaFull(documentsRef.current, IS_PRO)) {
      setMenu(null);
      setSubscriptionOpen(true);
      return;
    }
    setBusy("import");
    try {
      if (file.size > (/\.tyt$/i.test(file.name) ? 50 : 20) * 1024 * 1024)
        throw new Error("Файл слишком большой.");
      const imported = await importDocument(file);
      const doc = validateImport(imported);
      if (documentsRef.current.some((document) => document.id === doc.id))
        doc.id = uid();
      await importRevisions(
        doc.id,
        imported.importedHistory || [],
        historyDays,
      );
      if (quotaFull(documentsRef.current, IS_PRO)) {
        setSubscriptionOpen(true);
        return;
      }
      setDocuments((list) => [doc, ...list]);
      switchDocument(doc);
      if (/\.pdf$/i.test(file.name))
        setMessage(
          "PDF импортирован. Проверьте типы абзацев: они определены по расположению текста.",
        );
    } catch (error) {
      setMessage(error.message || "Не удалось открыть сценарий.");
    } finally {
      setBusy("");
    }
  };
  const fontSize = current.metadata?.fontSize || 12;
  const pageHeight = pageHeightFor(fontSize);
  const changeMetadata = (fields) =>
    update((d) => ({ ...d, metadata: { ...d.metadata, ...fields } }));
  const columnRef = useRef(null);
  const setFontSize = useCallback(
    (size) =>
      update((d) => ({
        ...d,
        metadata: { ...d.metadata, fontSize: Math.max(12, Math.min(26, size)) },
      })),
    [update],
  );
  useEffect(() => {
    const column = columnRef.current;
    const zoom = (event) => {
      if (!event.ctrlKey || !event.deltaY) return;
      event.preventDefault();
      update((d) => ({
        ...d,
        metadata: {
          ...d.metadata,
          fontSize: Math.max(
            12,
            Math.min(
              26,
              (d.metadata?.fontSize || 12) + (event.deltaY < 0 ? 1 : -1),
            ),
          ),
        },
      }));
    };
    column?.addEventListener("wheel", zoom, { passive: false });
    return () => column?.removeEventListener("wheel", zoom);
  }, [update]);
  return (
    <div
      className={`minimal-app${propsOpen || annotations ? " show-props" : ""}`}
    >
      <TooltipLayer />
      <header className="minimal-header">
        <div className="document-switcher" ref={menuRef}>
          <button
            className="document-trigger"
            aria-label="Документы"
            aria-expanded={menu === "documents"}
            onClick={() => {
              setDocumentActions(null);
              setMenu(menu === "documents" ? null : "documents");
            }}
          >
            <img
              className="brand-mark"
              src="/brand/tyter-logo.svg"
              alt=""
              width="31"
              height="31"
            />
            <span className="document-title">{current.title}</span>
            <ChevronDown size={15} />
          </button>
          {menu === "documents" && (
            <div className="minimal-popover document-menu">
              <div className="popover-heading">
                Документы <span>На этом устройстве</span>
              </div>
              <label className="document-search">
                <Search size={15} />
                <input
                  autoFocus
                  aria-label="Найти документ"
                  placeholder="Найти документ…"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setDocumentActions(null);
                  }}
                />
              </label>
              <div
                className="document-list"
                onScroll={() => setDocumentActions(null)}
              >
                {[...documents]
                  .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
                  .filter((d) =>
                    d.title
                      .toLocaleLowerCase()
                      .includes(query.toLocaleLowerCase()),
                  )
                  .map((d) => (
                    <div
                      className={`document-row${current.id === d.id ? " active" : ""}`}
                      data-document-id={d.id}
                      key={d.id}
                    >
                      <button
                        className="document-item"
                        aria-current={d.id === current.id ? "true" : undefined}
                        onClick={() => switchDocument(d)}
                      >
                        {d.metadata?.poster ? (
                          <img
                            className="document-cover"
                            src={d.metadata.poster}
                            alt=""
                          />
                        ) : (
                          <FileText size={17} />
                        )}
                        <span>
                          <strong>{d.title}</strong>
                          <small>
                            {new Date(d.updatedAt).toLocaleDateString("ru-RU", {
                              day: "numeric",
                              month: "short",
                            })}
                          </small>
                        </span>
                      </button>
                      <button
                        className="document-more"
                        aria-label={`Действия с документом: ${d.title}`}
                        aria-expanded={documentActions?.id === d.id}
                        data-tooltip="Действия с документом"
                        onClick={(event) => {
                          if (documentActions?.id === d.id) {
                            setDocumentActions(null);
                            return;
                          }
                          const rect =
                            event.currentTarget.getBoundingClientRect();
                          setDocumentActions({
                            id: d.id,
                            top: Math.min(
                              rect.bottom + 4,
                              window.innerHeight - 96,
                            ),
                            left: Math.max(
                              8,
                              Math.min(
                                rect.right - 174,
                                window.innerWidth - 182,
                              ),
                            ),
                          });
                        }}
                      >
                        <MoreHorizontal size={17} />
                      </button>
                    </div>
                  ))}
                {query &&
                  !documents.some((d) =>
                    d.title
                      .toLocaleLowerCase()
                      .includes(query.toLocaleLowerCase()),
                  ) && <p className="empty-search">Ничего не найдено</p>}
              </div>
              {documentActions &&
                (() => {
                  const target = documents.find(
                    (doc) => doc.id === documentActions.id,
                  );
                  return target ? (
                    <div
                      className="document-actions-popover"
                      style={{
                        top: documentActions.top,
                        left: documentActions.left,
                      }}
                    >
                      <button
                        onClick={() => {
                          setRename({ id: target.id, title: target.title });
                          setDocumentActions(null);
                          setMenu(null);
                        }}
                      >
                        <Pencil size={15} /> Переименовать
                      </button>
                      <button
                        className="danger-action"
                        onClick={() => {
                          setDeleteTarget(target);
                          setDocumentActions(null);
                          setMenu(null);
                        }}
                      >
                        <Trash2 size={15} /> Удалить документ
                      </button>
                    </div>
                  ) : null;
                })()}
              <div className="menu-divider" />
              <button className="menu-item" onClick={createDocument}>
                <Plus size={17} />
                Новый сценарий
              </button>
              <button
                className="menu-item"
                onClick={() => {
                  setMenu(null);
                  if (quotaFull(documents, IS_PRO)) {
                    setSubscriptionOpen(true);
                    return;
                  }
                  importRef.current?.click();
                }}
              >
                <FolderOpen size={17} />
                {IS_PRO
                  ? "Открыть TYT, FDX, DOCX, PDF"
                  : "Открыть FDX, DOCX, PDF"}
              </button>
            </div>
          )}
        </div>
        <button
          className={`save-status ${saveState === "error" || diskState === "error" ? "save-error" : ""}`}
          aria-label="Открыть папку сценариев"
          data-tooltip={
            saveState === "error"
              ? "Не сохранено — скачайте файл"
              : diskState === "error"
                ? "Файл не обновлён · копия в браузере"
                : "Открыть папку локальных файлов"
          }
          onClick={openLocalFolder}
        >
          {saveState === "saving" || diskState === "saving" || busy ? (
            <RefreshCw size={16} className="saving-spinner" />
          ) : (
            <FolderOpen size={16} />
          )}
          <span role="status" className="visually-hidden">
            {saveState === "saved" ? (
              <>
                {diskState === "saved"
                  ? "Сохранено на устройстве"
                  : diskState === "saving"
                    ? "Сохранение файла…"
                    : diskState === "error"
                      ? "Файл не обновлён · копия в браузере"
                      : "Сохранено в браузере"}
              </>
            ) : saveState === "saving" ? (
              "Сохранение…"
            ) : (
              "Не сохранено — скачайте файл"
            )}
          </span>
        </button>
        <div
          className="document-view-toggle"
          role="group"
          aria-label="Режим документа"
        >
          <button
            aria-pressed={view === "screenplay"}
            onClick={() => changeView("screenplay")}
          >
            <AlignLeft size={18} />
            Сценарий
          </button>
          <button
            aria-pressed={view === "outline"}
            data-tooltip={IS_PRO ? "Карточки истории" : "Аутлайн · Pro"}
            onClick={() => changeView("outline")}
          >
            <ListTree size={18} />
            Аутлайн
          </button>
        </div>
        <div className="header-actions">
          <button
            className="icon-button"
            aria-label="Поиск по сценарию"
            data-tooltip="Поиск · Ctrl+F"
            disabled={view === "outline"}
            onClick={() => showSidebar(searchOpen ? null : "search")}
          >
            <Search size={17} />
          </button>
          <button
            className={`icon-button${statisticsOpen ? " active" : ""}`}
            aria-label="Статистика документа"
            disabled={view === "outline"}
            data-tooltip="Статистика документа"
            aria-expanded={statisticsOpen}
            onClick={() => {
              showSidebar(statisticsOpen ? null : "statistics");
            }}
          >
            <ChartNoAxesColumn size={17} />
          </button>
          <button
            className={`quiet-button components-toggle${componentsOpen ? " active" : ""}`}
            aria-label="Компоненты"
            disabled={view === "outline"}
            aria-expanded={componentsOpen}
            onClick={() => {
              showSidebar(componentsOpen ? null : "components");
            }}
          >
            <Shapes size={17} />
            {current.components.length > 0 && (
              <small>{current.components.length}</small>
            )}
          </button>
          <button
            className={`icon-button${propsOpen ? " active" : ""}`}
            aria-label="Реквизит"
            disabled={view === "outline"}
            data-tooltip="Реквизит · Pro · Ctrl+E для выделения"
            aria-expanded={propsOpen}
            onClick={() =>
              IS_PRO
                ? showSidebar(propsOpen ? null : "props")
                : setSubscriptionOpen(true)
            }
          >
            <Box size={17} />
          </button>
          <button
            className={`icon-button${settingsOpen ? " active" : ""}`}
            aria-label="Настройки документа"
            data-tooltip="Настройки документа"
            aria-expanded={settingsOpen}
            onClick={() => showSidebar(settingsOpen ? null : "settings")}
          >
            <Settings2 size={17} />
          </button>
          <button
            className={`icon-button${historyOpen ? " active" : ""}`}
            aria-label="История изменений"
            data-tooltip="История изменений"
            aria-expanded={historyOpen}
            onClick={() => showSidebar(historyOpen ? null : "history")}
          >
            <History size={17} />
          </button>
          <span className="header-divider" />
          <div ref={exportRef} className="export-control">
            <button
              className="icon-button"
              disabled={!!busy}
              aria-label="Скачать сценарий"
              data-tooltip={busy ? "Подготовка файла…" : "Скачать сценарий"}
              aria-expanded={menu === "export"}
              onClick={() => setMenu(menu === "export" ? null : "export")}
            >
              <Download size={16} />
            </button>
            {menu === "export" && (
              <div className="minimal-popover export-menu">
                <div className="popover-heading">Сохранить файл</div>
                {[
                  ["pdf", "PDF", "Для чтения и печати"],
                  ["docx", "Word · DOCX", "Для работы в Word"],
                  ["fdx", "Final Draft · FDX", "Для сценарных редакторов"],
                  ...(IS_PRO
                    ? [
                        [
                          "tyt",
                          "Проект Tyter · TYT",
                          "Сценарий, аутлайн, комментарии и все детали",
                        ],
                      ]
                    : []),
                ].map(([format, label, hint]) => (
                  <button
                    className="export-item"
                    key={format}
                    onClick={() => download(format)}
                  >
                    <FileText size={18} />
                    <span>
                      <strong>{label}</strong>
                      <small>{hint}</small>
                    </span>
                    <span className="file-extension">.{format}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            className="icon-button"
            aria-label="Обучение"
            data-tooltip="Знакомство с редактором"
            onClick={() => setTourOpen(true)}
          >
            <CircleHelp size={17} />
          </button>
        </div>
      </header>
      {message && (
        <div className="app-message" role="alert">
          <span>{message}</span>
          <button
            className="icon-button"
            aria-label="Закрыть уведомление"
            onClick={() => setMessage("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
      <div className="minimal-workspace">
        {view === "outline" && (
          <OutlineBoard
            outline={outlineWithLinks}
            selectedId={outlineCard}
            onSelect={setOutlineCard}
            onChange={(value) =>
              update((document) => ({ ...document, outline: value }))
            }
            onAddCard={addOutlineCard}
            onLocate={locateOutlineCard}
            onRelink={relinkOutlineCard}
          />
        )}
        <div
          className="editor-column"
          ref={columnRef}
          style={view === "outline" ? { display: "none" } : undefined}
        >
          <main className="minimal-scroll" aria-label="Сценарий">
            <article
              className={`script-paper${historyRevision ? " history-preview-paper" : ""}`}
              style={{
                minHeight: pageCount * pageHeight,
                "--script-font-size": `${fontSize}pt`,
                "--script-font-family": documentFont(
                  current.metadata?.fontFamily,
                ).family,
                "--page-margin": `${88 * (fontSize / 12)}px`,
              }}
            >
              {!historyRevision && (
                <div className="page-guides" aria-hidden="true">
                  {Array.from({ length: pageCount }, (_, index) => (
                    <div
                      className="page-guide"
                      key={index}
                      style={{ top: index * pageHeight, height: pageHeight }}
                    >
                      {index > 0 && <div className="page-separator" />}
                      <span className="paper-label">{index + 1}</span>
                    </div>
                  ))}
                </div>
              )}
              {historyRevision ? (
                <HistoryPreview
                  revision={historyRevision}
                  onExit={() => setHistoryRevision(null)}
                />
              ) : (
                <ScreenplayEditor
                  key={current.id}
                  ref={editorRef}
                  minimal
                  outlineCards={IS_PRO ? outline.cards : EMPTY_PROPS}
                  onEditOutlineCard={(id) => {
                    if (IS_PRO) {
                      changeView("outline");
                      setOutlineCard(id);
                    }
                  }}
                  components={current.components}
                  props={IS_PRO ? current.props : EMPTY_PROPS}
                  activeProp={propDialog?.id}
                  onCreateProp={propFromSelection}
                  onEditAnnotations={({ componentId, propId }) => {
                    const component = current.components.find(
                      (item) => item.id === componentId,
                    );
                    const prop = current.props.find(
                      (item) => item.id === propId,
                    );
                    if (IS_PRO && component && prop)
                      openAnnotations(component, prop);
                  }}
                  onEditProp={(id) => {
                    const prop = current.props.find((item) => item.id === id);
                    if (prop) editProp(prop);
                  }}
                  comments={current.comments}
                  activeComment={commentsOpen ? activeComment : null}
                  onPageCount={setPageCount}
                  fontSize={fontSize}
                  fontFamily={current.metadata?.fontFamily}
                  content={current.content}
                  onChange={changeContent}
                  onSelection={setSelection}
                  showLineHighlight={false}
                  showComponents={componentsOpen}
                  searchQuery={searchOpen ? searchText : ""}
                  searchIndex={searchIndex}
                  searchCardIndex={
                    searchOpen ? searchCardSelection?.index : null
                  }
                  onComments={openComments}
                  onCommentFromSelection={openComments}
                  selectionToolbarDisabled={
                    view === "outline" ||
                    (!!componentDialog && !componentDialog.id) ||
                    (!!propDialog && !propDialog.id) ||
                    rename !== null ||
                    menu !== null ||
                    tourOpen ||
                    subscriptionOpen ||
                    !!deleteTarget ||
                    searchOpen
                  }
                  onCreateComponent={componentFromSelection}
                  onEditComponent={(id) => {
                    const component = current.components.find(
                      (c) => c.id === id,
                    );
                    if (component) editComponent(component);
                  }}
                />
              )}
            </article>
          </main>
          {!historyRevision && view === "screenplay" && (
            <FormatBar
              format={selection?.format}
              displayMode={current.metadata?.formatBarMode}
              onFormat={(key) => editorRef.current?.setFormat(key)}
              commentsOpen={commentsOpen}
              commentCount={current.comments.filter((c) => !c.resolved).length}
              onComments={() => {
                if (commentsOpen) {
                  setCommentsOpen(false);
                  setCommentQuote(null);
                } else openComments(selection);
              }}
            />
          )}
        </div>
        {searchOpen && (
          <DocumentSearch
            content={current.content}
            query={searchText}
            onQuery={(value) => {
              setSearchText(value);
              setSearchIndex(0);
              setSearchCardSelection(null);
            }}
            index={searchIndex}
            onSelect={(index, source) => {
              setSearchIndex(index);
              setSearchCardSelection(
                source === "card"
                  ? { index, request: ++searchCardRequest.current }
                  : null,
              );
            }}
            onClose={() => {
              setSearchOpen(false);
              setSearchCardSelection(null);
              requestAnimationFrame(() => editorRef.current?.focus());
            }}
          />
        )}
        {settingsOpen && (
          <DocumentSettings
            key={current.id}
            metadata={current.metadata}
            fontSize={fontSize}
            onSize={setFontSize}
            onChange={changeMetadata}
            onClose={() => setSettingsOpen(false)}
          />
        )}
        {statisticsOpen && (
          <StatisticsPanel
            document={current}
            pageCount={pageCount}
            onClose={() => setStatisticsOpen(false)}
          />
        )}
        {historyOpen && (
          <HistoryPanel
            key={current.id}
            documentId={current.id}
            version={historyVersion}
            selectedId={historyRevision?.id}
            onSelect={setHistoryRevision}
            onRestore={restoreHistory}
            onClose={() => {
              setHistoryOpen(false);
              setHistoryRevision(null);
            }}
          />
        )}
        {commentsOpen && (
          <CommentsPanel
            key={current.id}
            comments={current.comments}
            content={current.content}
            quote={commentQuote}
            activeId={activeComment}
            onClose={() => {
              setCommentsOpen(false);
              setCommentQuote(null);
            }}
            onClearQuote={() => setCommentQuote(null)}
            onAdd={addComment}
            onToggle={(comment) => {
              setActiveComment(null);
              update((d) => ({
                ...d,
                comments: d.comments.map((c) =>
                  c.id === comment.id ? { ...c, resolved: !c.resolved } : c,
                ),
              }));
            }}
            onFilterChange={() => setActiveComment(null)}
            onFocus={(comment) => {
              setActiveComment(comment.id);
              editorRef.current?.focusComment(comment.id, comment.blockId);
            }}
          />
        )}
        {componentsOpen && (
          <ComponentsPanel
            key={current.id}
            document={current}
            activeId={componentDialog?.id}
            onClose={() => {
              setComponentsOpen(false);
              setComponentDialog(null);
            }}
            onEdit={editComponent}
            onCloseEdit={() => setComponentDialog(null)}
            onCreate={beginComponent}
            onToggleFolder={(id) =>
              update((d) => {
                const collapsed = d.collapsedComponentFolders || [];
                return {
                  ...d,
                  collapsedComponentFolders: collapsed.includes(id)
                    ? collapsed.filter((value) => value !== id)
                    : [...collapsed, id],
                };
              })
            }
            onAddFolder={(name) =>
              update((d) => ({
                ...d,
                componentFolders: [
                  ...(d.componentFolders || []),
                  { id: uid(), name },
                ],
              }))
            }
            onDeleteFolder={(folder) => setFolderToDelete(folder)}
            renderEditor={(component) => (
              <ComponentForm
                key={component.id}
                inline
                value={component}
                components={current.components}
                folders={current.componentFolders}
                onSubmit={saveComponent}
                onDelete={deleteComponent}
                onClose={() => setComponentDialog(null)}
              />
            )}
          />
        )}
        {propsOpen && IS_PRO && (
          <PropsPanel
            key={current.id}
            document={current}
            activeId={propDialog?.id}
            onClose={() => {
              setPropsOpen(false);
              setPropDialog(null);
            }}
            onCreate={beginProp}
            onEdit={editProp}
            onCloseEdit={() => setPropDialog(null)}
            onExport={async () => {
              setBusy("props-pdf");
              try {
                saveBlob(
                  await exportPropsPDF(current),
                  `${current.title} — реквизит`,
                  "pdf",
                );
              } catch {
                setMessage("Не удалось сохранить отчёт реквизита.");
              } finally {
                setBusy("");
              }
            }}
            renderEditor={(prop) => (
              <ComponentForm
                key={prop.id}
                inline
                prop
                value={prop}
                components={current.props}
                onSubmit={saveProp}
                onDelete={deleteProp}
                onClose={() => setPropDialog(null)}
              />
            )}
          />
        )}
        {annotations && IS_PRO && (
          <AnnotationsPanel
            component={current.components.find(
              (item) => item.id === annotations.componentId,
            )}
            prop={current.props.find((item) => item.id === annotations.propId)}
            onComponent={editComponent}
            onProp={editProp}
            onClose={() => setAnnotations(null)}
            renderComponent={(component) => (
              <ComponentForm
                key={`${component.id}:${component.name}`}
                inline
                value={component}
                components={current.components}
                folders={current.componentFolders}
                onSubmit={saveComponent}
                onDelete={(id) => {
                  deleteComponent(id);
                  setAnnotations(null);
                  showSidebar("props");
                }}
                onClose={() => setAnnotations(null)}
              />
            )}
            renderProp={(prop) => (
              <ComponentForm
                key={`${prop.id}:${prop.name}`}
                inline
                prop
                value={prop}
                components={current.props}
                onSubmit={saveProp}
                onDelete={(id) => {
                  deleteProp(id);
                  setAnnotations(null);
                  showSidebar("components");
                }}
                onClose={() => setAnnotations(null)}
              />
            )}
          />
        )}
      </div>
      <input
        ref={importRef}
        type="file"
        accept={
          IS_PRO
            ? ".tyt,.fdx,.docx,.pdf"
            : ".fdx,.docx,.pdf,application/xml,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        }
        hidden
        onChange={openFile}
      />
      {componentDialog && !componentDialog.id && (
        <ComponentForm
          value={componentDialog}
          components={current.components}
          folders={current.componentFolders}
          onSubmit={saveComponent}
          onDelete={deleteComponent}
          onClose={() => setComponentDialog(null)}
        />
      )}
      {propDialog && !propDialog.id && IS_PRO && (
        <ComponentForm
          prop
          value={propDialog}
          components={current.props}
          onSubmit={saveProp}
          onDelete={deleteProp}
          onClose={() => setPropDialog(null)}
        />
      )}
      {rename !== null && (
        <Dialog title="Название сценария" onClose={() => setRename(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (rename.title.trim()) {
                setDocuments((list) =>
                  list.map((doc) =>
                    doc.id === rename.id
                      ? {
                          ...doc,
                          title: rename.title.trim(),
                          updatedAt: new Date().toISOString(),
                        }
                      : doc,
                  ),
                );
                setRename(null);
              }
            }}
          >
            <label>
              Название
              <input
                autoFocus
                required
                maxLength={160}
                value={rename.title}
                onChange={(e) =>
                  setRename({ ...rename, title: e.target.value })
                }
              />
            </label>
            <div className="dialog-actions">
              <button
                type="button"
                className="quiet-button"
                onClick={() => setRename(null)}
              >
                Отмена
              </button>
              <button
                className="primary-button"
                disabled={!rename.title.trim()}
              >
                Сохранить
              </button>
            </div>
          </form>
        </Dialog>
      )}
      {tourOpen && <Onboarding onClose={closeTour} />}
      {subscriptionOpen && (
        <SubscriptionDialog onClose={() => setSubscriptionOpen(false)} />
      )}
      {deleteTarget && (
        <Dialog
          title="Удалить документ?"
          onClose={() => !deleting && setDeleteTarget(null)}
        >
          <p className="delete-document-copy">
            «{deleteTarget.title}» будет удалён из списка документов.
          </p>
          <div className="dialog-actions">
            <button
              className="quiet-button"
              disabled={deleting}
              onClick={() => setDeleteTarget(null)}
            >
              Отмена
            </button>
            <button
              className="primary-button"
              disabled={deleting}
              onClick={deleteDocument}
            >
              {deleting ? "Удаление…" : "Удалить"}
            </button>
          </div>
        </Dialog>
      )}
      {folderToDelete && (
        <DeleteComponentFolderDialog
          key={folderToDelete.id}
          folder={folderToDelete}
          onClose={() => setFolderToDelete(null)}
          onConfirm={deleteComponentFolder}
        />
      )}
    </div>
  );
}
