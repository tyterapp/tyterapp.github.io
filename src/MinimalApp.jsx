import { t, useLanguage, languageLocale } from "./i18n.js";
import LanguageSwitch from "./LanguageSwitch.jsx";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
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
  MessageSquare,
  LogOut,
  Stethoscope,
  Maximize2,
  Minimize2,
} from "lucide-react";
import OutlineBoard from "./OutlineBoard.jsx";
import { exportTYT } from "./tyt-format.js";
import {
  chooseLocalDirectory,
  directoryComponentLibraries,
} from "./browser-files.js";
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
import FormatBar, { FORMATS } from "./FormatBar.jsx";
import {
  useEditorPreferences,
  useTypewriterSound,
} from "./editor-preferences.js";
import {
  switchSceneVariant,
  sceneRange,
  sceneLetter,
} from "./scene-variants.js";
import { activeSceneForBlock, commentSceneIndex } from "./comment-scenes.js";
import { cleanCommentOptions } from "./comment-options.js";
import ScriptDoctor from "./ScriptDoctor.jsx";
import CharacterDialogue from "./CharacterDialogue.jsx";
import ComponentLibraryDialog from "./ComponentLibraryDialog.jsx";
import {
  exportComponentLibrary,
  mergeComponentLibrary,
} from "./component-library.js";
import HistoryPanel from "./HistoryPanel.jsx";
import HistoryPreview from "./HistoryPreview.jsx";
import OutlineHistoryPreview from "./OutlineHistoryPreview.jsx";
import TooltipLayer from "./TooltipLayer.jsx";
import ThumbnailField from "./ThumbnailField.jsx";
import ThumbnailPreviewLayer from "./ThumbnailPreviewLayer.jsx";
import ImageComponentPaste from "./ImageComponentPaste.jsx";
import {
  changeLabel,
  deleteRevisions,
  recordRevision,
  importRevisions,
  snapshotOf,
  snapshotForArea,
} from "./history.js";
import { pageHeightFor } from "./pagination.js";
import {
  screenplayLayout,
  screenplayBlockLayout,
  dramaValue,
  clampDocumentZoom,
} from "./document-layout.js";
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
const BLOCK_LAYOUT_STYLE = Object.fromEntries(
  ["character", "speech", "parenthetical"].flatMap((format) => {
    const layout = screenplayBlockLayout(format);
    return [
      [`--${format}-left`, `${layout.left * 100}%`],
      [`--${format}-width`, `${layout.width * 100}%`],
    ];
  }),
);
const grandfatherDocuments = (documents, isPro = BUILD_IS_PRO) =>
  !isPro &&
  !window.tyterDesktop?.request &&
  documents.length > 2 &&
  !documents.some((doc) => doc.quotaExempt)
    ? documents.map((doc) => ({
        ...doc,
        quotaExempt: true,
      }))
    : documents;
const quotaFull = (documents, isPro = BUILD_IS_PRO) =>
  !isPro && documents.filter((doc) => !doc.quotaExempt).length >= 2;
function newDocument() {
  const doc = createProject(t("Без названия"));
  doc.content.content = [
    {
      type: "paragraph",
      attrs: {
        format: "scene",
        blockId: uid(),
      },
    },
  ];
  return doc;
}
function sampleDocuments() {
  const cat = createProject("Глазами кошки");
  cat.content.content = [
    {
      type: "paragraph",
      attrs: {
        format: "scene",
        blockId: uid(),
      },
      content: [
        {
          type: "text",
          text: "ИНТ. КВАРТИРА — УТРО",
        },
      ],
    },
    {
      type: "paragraph",
      attrs: {
        format: "action",
        blockId: uid(),
      },
      content: [
        {
          type: "text",
          text: "Кошка наблюдает за городом с подоконника. Внизу спешат люди, а на кухне тихо звенит её пустая миска.",
        },
      ],
    },
    {
      type: "paragraph",
      attrs: {
        format: "character",
        blockId: uid(),
      },
      content: [
        {
          type: "text",
          text: "КОШКА",
        },
      ],
    },
    {
      type: "paragraph",
      attrs: {
        format: "speech",
        blockId: uid(),
      },
      content: [
        {
          type: "text",
          text: "Кажется, у них опять свои планы на завтрак.",
        },
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
    return {
      documents: sampleDocuments(),
      error: false,
    };
  } catch {
    // Keep the original storage untouched if an older or damaged file cannot be read.
    return {
      documents: [newDocument()],
      error: !isWebPro(),
    };
  }
}
function Dialog({ title, children, onClose }) {
  const language = useLanguage();
  const ref = useRef(null);
  const close = useRef(onClose);
  const backdropPress = useRef(false);
  close.current = onClose;
  const isBackdrop = (event) => {
    if (event.target !== event.currentTarget) return false;
    const bounds = event.currentTarget.getBoundingClientRect();
    return (
      event.clientX < bounds.left ||
      event.clientX >= bounds.right ||
      event.clientY < bounds.top ||
      event.clientY >= bounds.bottom
    );
  };
  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    dialog
      .querySelector("[data-dialog-autofocus]")
      ?.focus({ preventScroll: true });
    return () => dialog.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="minimal-dialog"
      aria-label={t(title)}
      onCancel={(e) => {
        e.preventDefault();
        close.current();
      }}
      onPointerDownCapture={(event) => {
        backdropPress.current = event.button === 0 && isBackdrop(event);
      }}
      onPointerCancelCapture={() => {
        backdropPress.current = false;
      }}
      onClick={(event) => {
        const startedOnBackdrop = backdropPress.current;
        backdropPress.current = false;
        if (startedOnBackdrop && isBackdrop(event)) close.current();
      }}
    >
      <div className="dialog-heading">
        <h2>{t(title)}</h2>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label={t("Закрыть")}
        >
          <X size={18} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
function DeleteComponentFolderDialog({ folder, onClose, onConfirm }) {
  const language = useLanguage();
  const [deleteComponents, setDeleteComponents] = useState(false);
  const propsFolder = folder.kind === "props";
  return (
    <Dialog title={t("Удалить папку?")} onClose={onClose}>
      <p className="delete-document-copy">
        {t("Папка «")}
        {folder.name}
        {t(
          propsFolder
            ? "» исчезнет. Реквизит останется в разделе «Без папки»."
            : "» исчезнет. Без галочки компоненты останутся в разделах «Персонажи» и «Места».",
        )}
      </p>
      {!propsFolder && (
        <label className="folder-delete-option">
          <input
            type="checkbox"
            checked={deleteComponents}
            onChange={(event) => setDeleteComponents(event.target.checked)}
          />
          <span>{t("Удалить компоненты в папке")}</span>
        </label>
      )}
      <div className="dialog-actions">
        <button className="quiet-button" onClick={onClose}>
          {t("Отмена")}
        </button>
        <button
          className="primary-button"
          onClick={() => onConfirm(deleteComponents)}
        >
          {t("Удалить папку")}
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
  const language = useLanguage();
  const [name, setName] = useState(value.name || "");
  const [description, setDescription] = useState(value.description || "");
  const [quantity, setQuantity] = useState(value.quantity || 1);
  const [thumbnail, setThumbnail] = useState(value.thumbnail || null);
  const [folderId, setFolderId] = useState(
    value.folderId || (prop ? "" : value.type || "character"),
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
        ? {
            className: "component-editor minimal-dialog",
          }
        : {
            title: prop
              ? value.id
                ? t("Реквизит")
                : t("Новый реквизит")
              : value.id
                ? t("Компонент")
                : t("Новый компонент"),
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
              thumbnail,
              folderId: prop
                ? folderId || null
                : folderId === "place" || folderId === "character"
                  ? null
                  : folderId,
            });
        }}
      >
        <label>
          {t("Название")}
          <input
            autoFocus
            data-dialog-autofocus
            required
            maxLength={200}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("Например, Анна")}
          />
        </label>
        {prop ? (
          <label>
            {t("Количество")}
            <input
              aria-label={t("Количество реквизита")}
              type="number"
              min="1"
              max="999999"
              required
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </label>
        ) : null}
        <label>
          {t("Папка")}
          <select
            aria-label={t("Папка")}
            value={folderId}
            onChange={(e) => setFolderId(e.target.value)}
          >
            {prop ? (
              <option value="">{t("Без папки")}</option>
            ) : (
              <>
                <option value="character">{t("Персонажи")}</option>
                <option value="place">{t("Места")}</option>
              </>
            )}
            {folders.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folder.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("Описание ")}
          <span className="muted">{t("· необязательно")}</span>
          <textarea
            rows={3}
            maxLength={5000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={
              prop
                ? t("Что важно помнить об этом реквизите")
                : t("Что важно помнить об этом компоненте")
            }
          />
        </label>
        {duplicate && (
          <p className="form-error" role="alert">
            {prop
              ? t("Реквизит с таким названием уже есть.")
              : t("Компонент с таким названием уже есть.")}
          </p>
        )}
        <ThumbnailField
          value={thumbnail}
          onChange={setThumbnail}
          name={name || (prop ? t("Реквизит") : t("Компонент"))}
        />
        <div className="dialog-actions">
          {value.id && (
            <button
              type="button"
              className="icon-button delete-component"
              aria-label={prop ? t("Удалить реквизит") : t("Удалить компонент")}
              data-tooltip={
                prop ? t("Удалить реквизит") : t("Удалить компонент")
              }
              onClick={() => onDelete(value.id)}
            >
              <Trash2 size={17} />
            </button>
          )}
          <button type="button" className="quiet-button" onClick={onClose}>
            {t("Отмена")}
          </button>
          <button
            className="primary-button"
            aria-keyshortcuts="Control+Enter Meta+Enter"
            disabled={!name.trim() || duplicate}
          >
            {value.id ? t("Сохранить") : t("Создать")}
          </button>
        </div>
      </form>
    </Wrapper>
  );
}
export default function MinimalApp({ onLogout }) {
  const language = useLanguage();
  const { isPro: IS_PRO, historyDays } = useEdition();
  const [preferences, setPreferences] = useEditorPreferences();
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
      language !== "ru" ||
      !documents.some((doc) => doc.metadata?.fontFamily === "courier-prime")
    )
      return;
    setDocuments((list) =>
      list.map((doc) =>
        doc.metadata?.fontFamily === "courier-prime"
          ? {
              ...doc,
              metadata: { ...doc.metadata, fontFamily: "courier" },
              updatedAt: new Date().toISOString(),
            }
          : doc,
      ),
    );
  }, [language, documents]);
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
  const [emptyDocument] = useState(newDocument);
  const current =
    documents.find((d) => d.id === activeId) || documents[0] || emptyDocument;
  const documentsRef = useRef(documents);
  documentsRef.current = documents;
  const editorRef = useRef(null),
    menuRef = useRef(null),
    exportRef = useRef(null),
    exportMenuRef = useRef(null),
    importRef = useRef(null);
  const imagePasteRef = useRef(null);
  const componentHistory = useRef({
    undo: [],
    redo: [],
  });
  const [menu, setMenu] = useState(null);
  const [exportPosition, setExportPosition] = useState(null);
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
  const [historyArea, setHistoryArea] = useState("screenplay");
  const [historyVersion, setHistoryVersion] = useState(0);
  const historyTracked = useRef(new Map());
  const historyWritten = useRef(new Map());
  const pendingOutlineHistory = useRef(new Map());
  const [subscriptionOpen, setSubscriptionOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [commentQuote, setCommentQuote] = useState(null);
  const [activeComment, setActiveComment] = useState(null);
  const commentPreview = useRef(null);
  const pendingCommentFocus = useRef(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [searchFormat, setSearchFormat] = useState("all");
  const [searchIndex, setSearchIndex] = useState(0);
  const [searchCardSelection, setSearchCardSelection] = useState(null);
  const searchCardRequest = useRef(0);
  const handledSearchCardRequest = useRef(0);
  const [searchCount, setSearchCount] = useState(0);
  const [doctorOpen, setDoctorOpen] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [characterView, setCharacterView] = useState(null);
  const [libraryDialog, setLibraryDialog] = useState(null);
  const checkedFolderLibraries = useRef(false);
  const showSidebar = useCallback((kind) => {
    setDoctorOpen(kind === "doctor");
    if (kind) {
      setFocusMode(false);
      setCharacterView(null);
    }
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
  const [selection, setSelection] = useState({
    format: "scene",
  });
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
          .catch((error) => {
            if (revision === diskRevision.current) {
              setDiskState("error");
              if (desktop || browserPro) setSaveState("error");
              if (
                error.message ===
                "Папка сценариев изменена в другой вкладке. Обновите страницу."
              )
                setMessage(error.message);
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
      .then(({ documents: stored, deletedIds = [], directoryName }) => {
        if (cancelled) return;
        const disk = stored.map(validateImport);
        if (isWebPro() && directoryName) {
          setDocuments(disk);
          showSidebar(null);
          setActiveId((id) =>
            disk.some((doc) => doc.id === id) ? id : disk[0]?.id || "",
          );
        } else if (disk.length || deletedIds.length)
          setDocuments((list) => {
            const merged = new Map(
              (initial.hasSaved ? list : [])
                .filter((d) => !deletedIds.includes(d.id))
                .map((d) => [d.id, d]),
            );
            for (const doc of disk) {
              const existing = merged.get(doc.id);
              // IndexedDB is authoritative in web Pro; editor initialization may
              // touch stale migration data before the local library finishes loading.
              if (isWebPro() || !existing || doc.updatedAt > existing.updatedAt)
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
  const flushOutlineHistory = useCallback(
    async (documentId) => {
      const writes = [];
      for (const [id, pending] of pendingOutlineHistory.current) {
        if (documentId && id !== documentId) continue;
        clearTimeout(pending.timer);
        pendingOutlineHistory.current.delete(id);
        writes.push(
          recordRevision(
            id,
            pending.snapshot,
            pending.label,
            historyDays,
            "outline",
          ),
        );
      }
      if (writes.length) {
        await Promise.all(writes);
        setHistoryVersion((version) => version + 1);
      }
    },
    [historyDays],
  );
  const historyFlushRef = useRef(flushOutlineHistory);
  historyFlushRef.current = flushOutlineHistory;
  useEffect(() => {
    const flush = () => historyFlushRef.current().catch(() => {});
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, []);
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
  }, [documents, writeStorage, filesReady, historyVersion]);
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
    if (!filesReady || !documents.length) return;
    const snapshot = snapshotOf(current);
    const signature = JSON.stringify(snapshot);
    const previous = historyTracked.current.get(current.id);
    if (previous && previous.signature !== signature) {
      const now = Date.now();
      const screenplayKey = `${current.id}:screenplay`;
      if (
        JSON.stringify(snapshotForArea(previous.snapshot, "screenplay")) !==
          JSON.stringify(snapshotForArea(snapshot, "screenplay")) &&
        now - (historyWritten.current.get(screenplayKey) || 0) > 30000
      ) {
        historyWritten.current.set(screenplayKey, now);
        recordRevision(
          current.id,
          previous.snapshot,
          changeLabel(
            snapshotForArea(previous.snapshot, "screenplay"),
            snapshotForArea(snapshot, "screenplay"),
          ),
          historyDays,
          "screenplay",
        )
          .then(() => setHistoryVersion((version) => version + 1))
          .catch(() => {});
      }
      if (
        JSON.stringify(previous.snapshot.outline) !==
        JSON.stringify(snapshot.outline)
      ) {
        const pending = pendingOutlineHistory.current.get(current.id) || {
          snapshot: previous.snapshot,
        };
        clearTimeout(pending.timer);
        pending.label =
          JSON.stringify(pending.snapshot.outline?.columns) !==
          JSON.stringify(snapshot.outline?.columns)
            ? "актов аутлайна"
            : "карточек аутлайна";
        pending.timer = setTimeout(
          () => flushOutlineHistory(current.id).catch(() => {}),
          650,
        );
        pendingOutlineHistory.current.set(current.id, pending);
      }
    }
    historyTracked.current.set(current.id, {
      snapshot,
      signature,
    });
  }, [current, filesReady, historyDays, flushOutlineHistory, documents.length]);
  const restoreHistory = async (entry) => {
    try {
      await flushOutlineHistory(current.id);
      historyWritten.current.set(`${current.id}:${historyArea}`, Date.now());
      await recordRevision(
        current.id,
        snapshotOf(current),
        "восстановления",
        historyDays,
        historyArea,
      );
      update((document) => {
        const restored = {
          ...document,
          ...structuredClone(snapshotForArea(entry.snapshot, historyArea)),
        };
        const snapshot = snapshotOf(restored);
        historyTracked.current.set(document.id, {
          snapshot,
          signature: JSON.stringify(snapshot),
        });
        return restored;
      });
      setHistoryRevision(null);
      setHistoryVersion((version) => version + 1);
    } catch {
      setMessage("Не удалось восстановить локальную версию.");
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
  const changeView = useCallback(
    (next, { focus = true } = {}) => {
      if (!documents.length) return;
      if (next === "outline" && !IS_PRO) {
        setSubscriptionOpen(true);
        return;
      }
      showSidebar(null);
      setView(next);
      setFocusMode(false);
      setCharacterView(null);
      setMenu(null);
      if (next === "screenplay" && focus)
        requestAnimationFrame(() => editorRef.current?.focus());
    },
    [IS_PRO, showSidebar, documents.length],
  );
  useLayoutEffect(() => {
    if (menu !== "export") {
      setExportPosition(null);
      return;
    }
    const place = () => {
      const anchor = exportRef.current?.getBoundingClientRect();
      const popup = exportMenuRef.current?.getBoundingClientRect();
      if (!anchor || !popup) return;
      setExportPosition({
        left: Math.max(
          8,
          Math.min(
            exportRef.current
              .closest(".workspace-tools")
              .getBoundingClientRect().right + 8,
            innerWidth - popup.width - 8,
          ),
        ),
        top: Math.max(8, Math.min(anchor.top, innerHeight - popup.height - 8)),
      });
    };
    place();
    window.addEventListener("resize", place);
    document.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      document.removeEventListener("scroll", place, true);
    };
  }, [menu]);
  useEffect(() => {
    const outside = (e) => {
      if (
        ![menuRef, exportRef, exportMenuRef].some((ref) =>
          ref.current?.contains(e.target),
        )
      ) {
        setMenu(null);
        setDocumentActions(null);
      }
    };
    const keys = (e) => {
      if (
        (e.ctrlKey || e.metaKey) &&
        (e.code === "KeyF" || e.key.toLowerCase() === "f") &&
        !window.document.querySelector(
          'dialog[open], [role="dialog"][aria-modal="true"]',
        )
      ) {
        e.preventDefault();
        if (view === "outline")
          window.document.querySelector(".outline-search input")?.focus();
        else showSidebar("search");
      }
      if (
        (e.ctrlKey || e.metaKey) &&
        !e.shiftKey &&
        !e.altKey &&
        (e.code === "KeyS" || e.key.toLowerCase() === "s")
      ) {
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
            ? {
                ...fn(d),
                updatedAt: new Date().toISOString(),
              }
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
          ? d.comments.map((c) => ({
              ...c,
              anchor: anchors[c.id] ?? c.anchor,
            }))
          : d.comments,
      })),
    [update],
  );
  const changeSceneVariant = (id, letter) => {
    const content = editorRef.current?.getJSON();
    const latest =
      documentsRef.current.find((doc) => doc.id === current.id) || current;
    const next = switchSceneVariant(
      { ...latest, content: content || latest.content },
      id,
      letter,
    );
    editorRef.current?.restoreContent(next.content);
    update(() => next);
    editorRef.current?.focusBlock(id, { highlight: false });
  };
  const resolveCommentScene = commentSceneIndex(current);
  const commentScenes = new Map(
    current.comments.map((comment) => [
      comment.id,
      resolveCommentScene(comment),
    ]),
  );
  const focusComment = (comment) => {
    const latest =
      documentsRef.current.find((doc) => doc.id === current.id) || current;
    const document = {
      ...latest,
      content: editorRef.current?.getJSON() || latest.content,
    };
    const reference = commentSceneIndex(document)(comment);
    const range = reference && sceneRange(document.content, reference.sceneId);
    const original = range && sceneLetter(range.nodes[0]);
    if (range && original !== reference.variant) {
      if (commentPreview.current?.documentId !== current.id)
        commentPreview.current = {
          documentId: current.id,
          variants: new Map(),
          caret: editorRef.current?.getCaret(),
        };
      const preview = commentPreview.current;
      if (!preview.variants.has(reference.sceneId))
        preview.variants.set(reference.sceneId, original);
      const next = switchSceneVariant(
        document,
        reference.sceneId,
        reference.variant,
      );
      editorRef.current?.restoreContent(next.content);
      update(() => next);
    }
    pendingCommentFocus.current = {
      documentId: current.id,
      id: comment.id,
      blockId: comment.blockId,
      sceneId: reference?.sceneId,
    };
    setCommentQuote(null);
    setActiveComment(comment.id);
    // Also handle clicking the same comment twice without a variant change.
    requestAnimationFrame(() => {
      const pending = pendingCommentFocus.current;
      if (!pending || pending.documentId !== current.id) return;
      pendingCommentFocus.current = null;
      editorRef.current?.focusComment(
        pending.id,
        pending.blockId,
        pending.sceneId,
      );
    });
  };
  useEffect(() => {
    if (!commentsOpen || pendingCommentFocus.current?.documentId !== current.id)
      pendingCommentFocus.current = null;
    const preview = commentPreview.current;
    if (!preview || (commentsOpen && preview.documentId === current.id)) return;
    commentPreview.current = null;
    pendingCommentFocus.current = null;
    const latest = documentsRef.current.find(
      (doc) => doc.id === preview.documentId,
    );
    if (!latest) return;
    const sameDocument = preview.documentId === current.id;
    let next = {
      ...latest,
      content: sameDocument
        ? editorRef.current?.getJSON() || latest.content
        : latest.content,
    };
    for (const [sceneId, variant] of preview.variants)
      next = switchSceneVariant(next, sceneId, variant);
    if (sameDocument) {
      editorRef.current?.restoreContent(next.content);
      editorRef.current?.restoreCaret(preview.caret);
    }
    setDocuments((list) =>
      list.map((doc) =>
        doc.id === preview.documentId
          ? { ...next, updatedAt: new Date().toISOString() }
          : doc,
      ),
    );
    setActiveComment(null);
  }, [commentsOpen, current.id]);
  const embedLibrary = (library, selected) => {
    const latest =
      documentsRef.current.find((doc) => doc.id === current.id) || current;
    const merged = mergeComponentLibrary(latest, library, selected);
    if (!IS_PRO && merged.document.components.length > 10) {
      setSubscriptionOpen(true);
      return false;
    }
    for (const component of merged.document.components) {
      const previous = latest.components.find(
        (item) => item.id === component.id,
      );
      if (previous && previous.name !== component.name)
        editorRef.current?.renameEntity(component.id, component.name);
    }
    merged.document.content = editorRef.current?.getJSON() || latest.content;
    update(() => merged.document);
    setMessage({
      key: "Компоненты: добавлено {0}, обновлено {1}, совпадений пропущено {2}.",
      values: [merged.added, merged.updated, merged.skipped],
    });
    return true;
  };
  const outline = current.outline || {
    columns: [],
    cards: [],
  };
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
  const insertCardScene = (card, { blank = false } = {}) => {
    const blockId = uid();
    const textBlock = (format, text, id) => ({
      type: "paragraph",
      attrs: {
        format,
        blockId: id,
      },
      ...(text
        ? {
            content: [
              {
                type: "text",
                text,
              },
            ],
          }
        : {}),
    });
    return {
      blockId,
      blocks: blank
        ? [textBlock("scene", "", blockId)]
        : [
            textBlock(
              "scene",
              card.title?.trim() &&
                !["Без названия", "Untitled"].includes(card.title)
                ? card.title
                : t("ИНТ. НОВАЯ СЦЕНА — ДЕНЬ"),
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
      title: source.title || t("Без названия"),
      text: source.text || "",
      color: source.color || "#33313b",
      drama: dramaValue(source.drama),
      comments: [],
    };
    const { blockId, blocks } = insertCardScene(card, { blank: true });
    card.blockId = blockId;
    update((document) => ({
      ...document,
      outline: {
        ...outline,
        columns: outline.columns.map((column) =>
          column.id === columnId
            ? {
                ...column,
                collapsed: false,
              }
            : column,
        ),
        cards: [...outline.cards, card],
      },
      content: {
        ...document.content,
        content: [...document.content.content, ...blocks],
      },
    }));
    setOutlineCard(card.id);
  };
  const relinkOutlineCard = (card) => {
    const { blockId, blocks } = insertCardScene(card);
    const content = editorRef.current?.insertOutlineScene(blocks);
    if (!content) {
      setMessage(
        "Не удалось вставить сцену. Вернитесь в сценарий и попробуйте снова.",
      );
      return;
    }
    update((document) => ({
      ...document,
      outline: {
        ...outline,
        cards: outline.cards.map((item) =>
          item.id === card.id
            ? {
                ...item,
                blockId,
              }
            : item,
        ),
      },
      content,
    }));
    changeView("screenplay", { focus: false });
    setSceneTarget(blockId);
  };
  const locateOutlineCard = (card) => {
    changeView("screenplay", { focus: false });
    setSceneTarget(card.blockId);
  };
  useEffect(() => {
    if (view !== "screenplay" || !sceneTarget) return;
    let attempts = 0;
    let frame = requestAnimationFrame(function focusScene() {
      if (editorRef.current?.focusBlock(sceneTarget)) setSceneTarget(null);
      else if (++attempts < 60) frame = requestAnimationFrame(focusScene);
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
    setFocusMode(false);
    setCharacterView(null);
    setLibraryDialog(null);
    setDoctorOpen(false);
    setActiveId(doc.id);
    setView("screenplay");
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
  const addComment = (text, options = {}) => {
    const comment = {
      id: uid(),
      text,
      quote: commentQuote?.text || "",
      blockId: commentQuote?.blockId || null,
      ...activeSceneForBlock(
        {
          ...current,
          content: editorRef.current?.getJSON() || current.content,
        },
        commentQuote?.blockId,
      ),
      author: "Вы",
      createdAt: new Date().toISOString(),
      ...cleanCommentOptions(options),
      anchor: commentQuote?.from ?? null,
    };
    if (
      commentQuote &&
      !editorRef.current?.addComment(comment.id, commentQuote)
    ) {
      setMessage("Выделенный текст изменился. Выделите его снова.");
      return;
    }
    update((d) => ({
      ...d,
      comments: [...d.comments, comment],
    }));
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
        format: searchFormat,
        fromCard,
        scroll,
      }) || 0;
    setSearchCount(count);
    if (count && searchIndex >= count) setSearchIndex(0);
  }, [
    searchOpen,
    searchText,
    searchFormat,
    searchIndex,
    searchCardSelection,
    current.content,
    current.id,
  ]);
  const closeTour = useCallback(() => {
    setTourOpen(false);
    try {
      localStorage.setItem("tyter.onboarding.v1", "done");
    } catch {}
  }, []);
  useEffect(() => {
    const keyboard = (event) => {
      if (event.isComposing) return;
      if (
        (event.ctrlKey || event.metaKey) &&
        !event.altKey &&
        !event.shiftKey &&
        (event.code === "KeyO" || event.key.toLowerCase() === "o")
      ) {
        event.preventDefault();
        if (
          !event.repeat &&
          !document.querySelector(
            'dialog[open], [role="dialog"][aria-modal="true"]',
          )
        ) {
          setMenu(null);
          importRef.current?.click();
        }
        return;
      }
      if (event.key === "Escape") {
        if (document.querySelector("[data-app-select-menu]")) return;
        event.preventDefault();
        setMenu(null);
        setDocumentActions(null);
        showSidebar(null);
        setCommentQuote(null);
        setActiveComment(null);
        setFocusMode(false);
        setCharacterView(null);
        setLibraryDialog(null);
        setSubscriptionOpen(false);
        setRename(null);
        setFolderToDelete(null);
        if (!deleting) setDeleteTarget(null);
        if (tourOpen) closeTour();
        if (view === "screenplay" && !deleting)
          requestAnimationFrame(() => editorRef.current?.focus());
        return;
      }
      if (
        !event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        document.querySelector(
          'dialog[open], [role="dialog"][aria-modal="true"]',
        )
      )
        return;
      const next =
        event.code === "Digit1" || event.key === "1"
          ? "screenplay"
          : event.code === "Digit2" || event.key === "2"
            ? "outline"
            : null;
      if (next) {
        event.preventDefault();
        if (!event.repeat) changeView(next);
      }
    };
    document.addEventListener("keydown", keyboard, true);
    return () => document.removeEventListener("keydown", keyboard, true);
  }, [showSidebar, closeTour, changeView, view, tourOpen, deleting]);
  const openLocalFolder = async () => {
    if (isWebPro()) {
      try {
        writeStorage();
        const { documents: disk, name } = await chooseLocalDirectory();
        setDocuments(disk);
        documentsRef.current = disk;
        showSidebar(null);
        setMenu(null);
        setQuery("");
        setView("screenplay");
        setActiveId(disk[0]?.id || "");
        if (disk[0]) switchDocument(disk[0]);
        setMessage({
          key: "Подключена папка «{0}». Файлы TYT будут сохраняться автоматически.",
          values: [name],
        });
        setDiskAvailable(true);
        const libraries = await directoryComponentLibraries().catch(() => []);
        if (libraries.length && disk.length) setLibraryDialog(libraries);
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
  useEffect(() => {
    if (
      !filesReady ||
      !documents.length ||
      !isWebPro() ||
      checkedFolderLibraries.current
    )
      return;
    checkedFolderLibraries.current = true;
    let cancelled = false;
    directoryComponentLibraries()
      .then((libraries) => {
        if (
          cancelled ||
          document.querySelector(
            'dialog[open], [role="dialog"][aria-modal="true"]',
          )
        )
          return;
        const existing =
          documentsRef.current.find((doc) => doc.id === current.id)
            ?.components || [];
        const available = libraries.filter((library) =>
          library.components.some(
            (component) =>
              !existing.some(
                (item) =>
                  item.librarySource?.libraryId === library.id &&
                  item.librarySource.componentId === component.id,
              ),
          ),
        );
        if (available.length) setLibraryDialog(available);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [filesReady, !!documents.length]);
  const createDocument = () => {
    if (quotaFull(documents, IS_PRO)) {
      setMenu(null);
      setSubscriptionOpen(true);
      return;
    }
    const doc = newDocument();
    showSidebar(null);
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
  const saveComponent = (value, { edit = false } = {}) => {
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
            ? {
                ...item,
                name: next.name,
                componentId: next.id,
              }
            : item,
        ),
      }));
      openAnnotations(next, pairedProp);
    } else if (edit) editComponent(next);
    else showSidebar("components");
  };
  const openAnnotations = (component, prop) => {
    showSidebar("annotations");
    setAnnotations({
      componentId: component.id,
      propId: prop.id,
    });
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
      saveComponent(
        {
          name: source.text.trim().slice(0, 200),
          type: source.format === "scene" ? "place" : "character",
          description: "",
          source,
        },
        { edit: true },
      );
  };
  const beginComponent = (value) => {
    if (!IS_PRO && current.components.length >= 10) {
      setSubscriptionOpen(true);
      return;
    }
    setComponentDialog(value);
  };
  const canCreateImageComponents = (amount, documentId) => {
    const doc = documentsRef.current.find((item) => item.id === documentId);
    if (!doc) return false;
    if (!IS_PRO && doc.components.length + amount > 10) {
      setSubscriptionOpen(true);
      return false;
    }
    return true;
  };
  const createImageComponents = (thumbnails, documentId, baseName) => {
    if (!canCreateImageComponents(thumbnails.length, documentId)) return;
    const doc = documentsRef.current.find((item) => item.id === documentId);
    const names = new Set(
      doc.components.map((component) => component.name.toLocaleLowerCase()),
    );
    let number = 1;
    const added = thumbnails.map((thumbnail) => {
      let name;
      do {
        name = number === 1 ? baseName : `${baseName} ${number}`;
        number++;
      } while (names.has(name.toLocaleLowerCase()));
      names.add(name.toLocaleLowerCase());
      return {
        id: uid(),
        name,
        type: "character",
        folderId: null,
        description: "",
        thumbnail,
        color: "#8a799a",
      };
    });
    const next = documentsRef.current.map((document) =>
      document.id === documentId
        ? {
            ...document,
            components: [...document.components, ...added],
            collapsedComponentFolders: (
              document.collapsedComponentFolders || []
            ).filter((id) => id !== "character"),
            updatedAt: new Date().toISOString(),
          }
        : document,
    );
    documentsRef.current = next;
    setDocuments(next);
    showSidebar("components");
    setComponentDialog(added.at(-1));
  };
  const editProp = (prop) => {
    showSidebar("props");
    setPropDialog(prop);
    const folderId = prop.folderId || "";
    if (current.collapsedPropFolders?.includes(folderId))
      update((document) => ({
        ...document,
        collapsedPropFolders: document.collapsedPropFolders.filter(
          (id) => id !== folderId,
        ),
      }));
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
    } else
      saveProp(
        {
          name: source.text.trim().slice(0, 200),
          quantity: 1,
          category: "Objects",
          description: "",
        },
        { edit: true },
      );
  };
  const saveProp = (value, { edit = false } = {}) => {
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
      ...(paired
        ? {
            componentId: paired.id,
          }
        : {}),
    };
    update((d) => ({
      ...d,
      props: value.id
        ? d.props.map((item) => (item.id === value.id ? next : item))
        : [...d.props, next],
      components: paired
        ? d.components.map((item) =>
            item.id === paired.id
              ? {
                  ...item,
                  name: value.name,
                }
              : item,
          )
        : d.components,
    }));
    setPropDialog(null);
    if (paired) openAnnotations(paired, next);
    else if (edit) editProp(next);
    else showSidebar("props");
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
    update((d) => ({
      ...d,
      props: d.props.filter((item) => item.id !== id),
    }));
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
    if (folderToDelete.kind === "props") {
      update((d) => ({
        ...d,
        propFolders: (d.propFolders || []).filter(
          (folder) => folder.id !== folderId,
        ),
        collapsedPropFolders: (d.collapsedPropFolders || []).filter(
          (id) => id !== folderId,
        ),
        props: d.props.map((item) =>
          item.folderId === folderId ? { ...item, folderId: null } : item,
        ),
      }));
      setPropDialog(null);
      setFolderToDelete(null);
      return;
    }
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
              ? {
                  ...component,
                  folderId: null,
                }
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
    update((d) => ({
      ...d,
      ...afterFolderState,
      content: afterContent,
    }));
    setComponentDialog(null);
    setFolderToDelete(null);
  };
  const download = async (format) => {
    setMenu(null);
    setBusy(format);
    setMessage("");
    writeStorage();
    try {
      await flushOutlineHistory(current.id);
      const document = structuredClone(
        documentsRef.current.find((item) => item.id === current.id) || current,
      );
      const blob = await {
        pdf: exportPDF,
        docx: exportDOCX,
        fdx: exportFDX,
        tyt: exportTYT,
      }[format](document);
      saveBlob(blob, document.title, format);
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
      const deletedIds =
        isWebPro() && /\.tyt$/i.test(file.name)
          ? (await localRequest("documents")).deletedIds || []
          : [];
      if (
        documentsRef.current.some((document) => document.id === doc.id) ||
        deletedIds.includes(doc.id)
      )
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
  const fontFamily = documentFont(current.metadata?.fontFamily, language).id;
  const documentZoom = clampDocumentZoom(current.metadata?.documentZoom);
  const sheet = screenplayLayout(fontSize);
  const pageHeight = pageHeightFor(fontSize);
  const changeMetadata = (fields) =>
    update((d) => ({
      ...d,
      metadata: {
        ...d.metadata,
        ...fields,
      },
    }));
  const columnRef = useRef(null);
  useTypewriterSound(preferences.typewriter, columnRef);
  const setDocumentZoom = useCallback(
    (zoom) =>
      update((d) => ({
        ...d,
        metadata: {
          ...d.metadata,
          documentZoom: clampDocumentZoom(zoom),
        },
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
          documentZoom: clampDocumentZoom(
            clampDocumentZoom(d.metadata?.documentZoom) +
              (event.deltaY < 0 ? 10 : -10),
          ),
        },
      }));
    };
    column?.addEventListener("wheel", zoom, {
      passive: false,
    });
    return () => column?.removeEventListener("wheel", zoom);
  }, [update]);
  return (
    <div
      className={`minimal-app${propsOpen || annotations ? " show-props" : ""}${focusMode ? " focus-mode" : ""}${characterView ? " character-reading" : ""}`}
    >
      <TooltipLayer />
      {!focusMode && (
        <ThumbnailPreviewLayer
          components={current.components}
          props={current.props || EMPTY_PROPS}
        />
      )}
      <header className="minimal-header">
        <div className="document-switcher" ref={menuRef}>
          <button
            className="document-trigger"
            aria-label={t("Документы")}
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
                {t("Документы ")}
                <span>{t("На этом устройстве")}</span>
              </div>
              <label className="document-search">
                <Search size={15} />
                <input
                  autoFocus
                  aria-label={t("Найти документ")}
                  placeholder={t("Найти документ…")}
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
                            {new Date(d.updatedAt).toLocaleDateString(
                              languageLocale(),
                              {
                                day: "numeric",
                                month: "short",
                              },
                            )}
                          </small>
                        </span>
                      </button>
                      <button
                        className="document-more"
                        aria-label={t("Действия с документом: {0}", d.title)}
                        aria-expanded={documentActions?.id === d.id}
                        data-tooltip={t("Действия с документом")}
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
                  ) && <p className="empty-search">{t("Ничего не найдено")}</p>}
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
                          setRename({
                            id: target.id,
                            title: target.title,
                          });
                          setDocumentActions(null);
                          setMenu(null);
                        }}
                      >
                        <Pencil size={15} />
                        {t(" Переименовать")}
                      </button>
                      <button
                        className="danger-action"
                        onClick={() => {
                          setDeleteTarget(target);
                          setDocumentActions(null);
                          setMenu(null);
                        }}
                      >
                        <Trash2 size={15} />
                        {t(" Удалить документ")}
                      </button>
                    </div>
                  ) : null;
                })()}
              <div className="menu-divider" />
              <button className="menu-item" onClick={createDocument}>
                <Plus size={17} />
                {t("Новый сценарий")}
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
                  ? t("Открыть TYT, FDX, DOCX, PDF")
                  : t("Открыть FDX, DOCX, PDF")}
              </button>
            </div>
          )}
        </div>
        <button
          className={`save-status ${saveState === "error" || diskState === "error" ? "save-error" : ""}`}
          aria-label={t("Открыть папку сценариев")}
          data-tooltip={
            saveState === "error"
              ? t("Не сохранено — скачайте файл")
              : diskState === "error"
                ? t("Файл не обновлён · копия в браузере")
                : t("Открыть папку локальных файлов")
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
                  ? t("Сохранено на устройстве")
                  : diskState === "saving"
                    ? t("Сохранение файла…")
                    : diskState === "error"
                      ? t("Файл не обновлён · копия в браузере")
                      : t("Сохранено в браузере")}
              </>
            ) : saveState === "saving" ? (
              t("Сохранение…")
            ) : (
              t("Не сохранено — скачайте файл")
            )}
          </span>
        </button>
        <div className="header-switches">
          <LanguageSwitch />
          <div
            className="document-view-toggle"
            role="group"
            aria-label={t("Режим документа")}
          >
            <button
              aria-pressed={view === "screenplay"}
              disabled={!documents.length}
              aria-keyshortcuts="Alt+1"
              onClick={() => changeView("screenplay")}
            >
              <AlignLeft size={18} />
              {t("Сценарий")}
            </button>
            <button
              aria-pressed={view === "outline"}
              disabled={!documents.length}
              aria-keyshortcuts="Alt+2"
              data-tooltip={IS_PRO ? t("Карточки истории") : t("Аутлайн · Pro")}
              onClick={() => changeView("outline")}
            >
              <ListTree size={18} />
              {t("Аутлайн")}
            </button>
          </div>
        </div>
      </header>
      {message && (
        <div className="app-message" role="alert">
          <span>
            {typeof message === "object"
              ? t(message.key, ...message.values)
              : t(message)}
          </span>
          <button
            className="icon-button"
            aria-label={t("Закрыть уведомление")}
            onClick={() => setMessage("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
      <div className="minimal-workspace">
        <nav
          className="workspace-tools"
          aria-label={t("Инструменты редактора")}
        >
          <div className="workspace-tools-scroll">
            {view === "screenplay" && !!documents.length && (
              <div className="workspace-tools-primary">
                <button
                  className={`icon-button${searchOpen ? " active" : ""}`}
                  aria-expanded={searchOpen}
                  aria-label={t("Поиск по сценарию")}
                  data-tooltip={t("Поиск · Ctrl+F")}
                  onClick={() => showSidebar(searchOpen ? null : "search")}
                >
                  <Search size={17} />
                </button>
                <button
                  className={`icon-button${statisticsOpen ? " active" : ""}`}
                  aria-label={t("Статистика документа")}
                  data-tooltip={t("Статистика документа")}
                  aria-expanded={statisticsOpen}
                  onClick={() => {
                    showSidebar(statisticsOpen ? null : "statistics");
                  }}
                >
                  <ChartNoAxesColumn size={17} />
                </button>
                <button
                  className={`icon-button${doctorOpen ? " active" : ""}`}
                  aria-label={t("Доктор сценария")}
                  data-tooltip={t("Доктор сценария")}
                  aria-expanded={doctorOpen}
                  onClick={() => showSidebar(doctorOpen ? null : "doctor")}
                >
                  <Stethoscope size={17} />
                </button>
                <button
                  className={`icon-button components-toggle${componentsOpen ? " active" : ""}`}
                  aria-label={t("Компоненты")}
                  data-tooltip={t("Компоненты")}
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
                  aria-label={t("Реквизит")}
                  data-tooltip={t("Реквизит · Pro")}
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
                  className={`icon-button comments-toggle${commentsOpen ? " active" : ""}`}
                  aria-label={t("Комментарии")}
                  data-tooltip={t("Комментарии")}
                  aria-expanded={commentsOpen}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    if (commentsOpen) {
                      showSidebar(null);
                      setCommentQuote(null);
                    } else openComments(editorRef.current?.getSelection());
                  }}
                >
                  <MessageSquare size={17} />
                  {current.comments.some((comment) => !comment.resolved) && (
                    <small>
                      {
                        current.comments.filter((comment) => !comment.resolved)
                          .length
                      }
                    </small>
                  )}
                </button>
              </div>
            )}
            <div className="workspace-tools-secondary">
              <button
                className={`icon-button${historyOpen ? " active" : ""}`}
                aria-label={t("История изменений")}
                disabled={!documents.length}
                data-tooltip={t("История изменений")}
                aria-expanded={historyOpen}
                onClick={() => {
                  setHistoryArea(view);
                  showSidebar(historyOpen ? null : "history");
                  flushOutlineHistory(current.id).catch(() => {});
                }}
              >
                <History size={17} />
              </button>
              <div ref={exportRef} className="export-control">
                <button
                  className={`icon-button${menu === "export" ? " active" : ""}`}
                  disabled={!!busy || !documents.length}
                  aria-label={t("Скачать сценарий")}
                  data-tooltip={
                    busy ? t("Подготовка файла…") : t("Скачать сценарий")
                  }
                  aria-expanded={menu === "export"}
                  onClick={() => setMenu(menu === "export" ? null : "export")}
                >
                  <Download size={17} />
                </button>
              </div>
              <button
                className={`icon-button${settingsOpen ? " active" : ""}`}
                aria-label={t("Настройки документа")}
                disabled={!documents.length}
                data-tooltip={t("Настройки документа")}
                aria-expanded={settingsOpen}
                onClick={() => showSidebar(settingsOpen ? null : "settings")}
              >
                <Settings2 size={17} />
              </button>
            </div>
          </div>
          <div className="workspace-tools-footer">
            <button
              className="icon-button"
              aria-label={t("Обучение")}
              data-tooltip={t("Онбординг и горячие клавиши")}
              onClick={() => {
                setMenu(null);
                setTourOpen(true);
              }}
            >
              <CircleHelp size={17} />
            </button>
            {onLogout && (
              <button
                className="icon-button workspace-signout"
                aria-label={t("Выйти из аккаунта")}
                data-tooltip={t("Выйти из аккаунта")}
                onClick={onLogout}
              >
                <LogOut size={17} />
              </button>
            )}
          </div>
        </nav>
        {view === "outline" &&
          (historyRevision ? (
            <OutlineHistoryPreview
              revision={historyRevision}
              onExit={() => setHistoryRevision(null)}
            />
          ) : (
            <OutlineBoard
              outline={outlineWithLinks}
              selectedId={outlineCard}
              onSelect={(id) => {
                if (historyOpen) showSidebar(null);
                setOutlineCard(id);
              }}
              onChange={(value) =>
                update((document) => ({
                  ...document,
                  outline: value,
                }))
              }
              onAddCard={addOutlineCard}
              onLocate={locateOutlineCard}
              onRelink={relinkOutlineCard}
            />
          ))}
        <div
          className="editor-column"
          ref={columnRef}
          style={
            view === "outline"
              ? {
                  display: "none",
                }
              : undefined
          }
        >
          <ImageComponentPaste
            ref={imagePasteRef}
            containerRef={columnRef}
            documentId={current.id}
            enabled={
              filesReady &&
              !!documents.length &&
              view === "screenplay" &&
              !historyRevision &&
              !characterView &&
              !libraryDialog &&
              !tourOpen &&
              !subscriptionOpen &&
              !deleteTarget &&
              !rename &&
              !folderToDelete &&
              !(componentDialog && !componentDialog.id) &&
              !(propDialog && !propDialog.id)
            }
            canCreate={canCreateImageComponents}
            onCreate={createImageComponents}
            onError={setMessage}
          />
          {filesReady && !documents.length && (
            <div className="local-library-empty" role="status">
              <p>{t("В папке нет сценариев")}</p>
              <button className="primary-button" onClick={createDocument}>
                <Plus size={17} />
                {t("Новый сценарий")}
              </button>
            </div>
          )}
          {characterView && (
            <CharacterDialogue
              content={current.content}
              name={characterView}
              onClose={() => {
                setCharacterView(null);
                requestAnimationFrame(() => editorRef.current?.focus());
              }}
              onGo={(id) => {
                setCharacterView(null);
                setSceneTarget(id);
              }}
            />
          )}
          <main
            className="minimal-scroll"
            aria-label={t("Сценарий")}
            style={
              !documents.length && filesReady ? { display: "none" } : undefined
            }
          >
            <article
              className={`script-paper${historyRevision ? " history-preview-paper" : ""}`}
              onMouseDownCapture={(event) => {
                if (
                  historyRevision ||
                  event.button !== 0 ||
                  (event.target !== event.currentTarget &&
                    !event.target.matches(
                      ".screenplay-editor, .screenplay-editor-shell",
                    ))
                )
                  return;
                if (
                  editorRef.current?.focusBlankSpace(
                    event.clientX,
                    event.clientY,
                  )
                )
                  event.preventDefault();
              }}
              style={{
                minHeight: pageCount * pageHeight,
                zoom: documentZoom / 100,
                "--document-zoom": documentZoom / 100,
                "--script-font-size": `${fontSize}pt`,
                "--script-font-family": documentFont(fontFamily).family,
                "--page-margin": `${sheet.top}px`,
                "--paper-width": `${sheet.width}px`,
                "--paper-left": `${sheet.left}px`,
                "--paper-right": `${sheet.right}px`,
                "--block-gap": `${sheet.gap}px`,
                "--scene-action-gap": `${sheet.sceneActionGap}px`,
                "--action-gap": `${sheet.actionGap}px`,
                "--sheet-line-height": sheet.lineHeight,
                ...BLOCK_LAYOUT_STYLE,
              }}
            >
              {!historyRevision && (
                <div className="page-guides" aria-hidden="true">
                  {Array.from(
                    {
                      length: pageCount,
                    },
                    (_, index) => (
                      <div
                        className="page-guide"
                        key={index}
                        style={{
                          top: index * pageHeight,
                          height: pageHeight,
                        }}
                      >
                        {index > 0 && <div className="page-separator" />}
                        <span className="paper-label">{index + 1}</span>
                      </div>
                    ),
                  )}
                </div>
              )}
              {historyRevision ? (
                <HistoryPreview
                  revision={historyRevision}
                  onExit={() => setHistoryRevision(null)}
                />
              ) : filesReady && documents.length ? (
                <ScreenplayEditor
                  key={current.id}
                  ref={editorRef}
                  documentId={current.id}
                  autoFocus={
                    filesReady &&
                    view === "screenplay" &&
                    !tourOpen &&
                    !subscriptionOpen &&
                    !deleteTarget &&
                    !folderToDelete &&
                    !rename &&
                    !menu &&
                    !componentDialog &&
                    !propDialog &&
                    !searchOpen &&
                    !settingsOpen &&
                    !historyOpen &&
                    !commentsOpen &&
                    !componentsOpen &&
                    !propsOpen &&
                    !annotations &&
                    !characterView &&
                    !libraryDialog &&
                    !doctorOpen
                  }
                  minimal
                  onSceneVariant={changeSceneVariant}
                  onCharacterDialogues={(name) => {
                    showSidebar(null);
                    setFocusMode(false);
                    setCharacterView(name);
                    setMenu(null);
                  }}
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
                  comments={current.comments.filter((comment) => {
                    const reference = commentScenes.get(comment.id);
                    return (
                      !reference ||
                      sceneLetter(
                        sceneRange(current.content, reference.sceneId)
                          ?.nodes[0],
                      ) === reference.variant
                    );
                  })}
                  activeComment={commentsOpen ? activeComment : null}
                  onPageCount={setPageCount}
                  fontSize={fontSize}
                  documentZoom={documentZoom}
                  fontFamily={fontFamily}
                  content={current.content}
                  onChange={changeContent}
                  onSelection={setSelection}
                  showLineHighlight={false}
                  spellcheck={current.settings.spellcheck}
                  showComponents={componentsOpen}
                  searchQuery={searchOpen ? searchText : ""}
                  searchFormat={searchFormat}
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
                    searchOpen ||
                    focusMode ||
                    !!characterView ||
                    !!libraryDialog
                  }
                  onCreateComponent={componentFromSelection}
                  onPasteImages={(files) =>
                    imagePasteRef.current?.insert(files)
                  }
                  onEditComponent={(id) => {
                    const component = current.components.find(
                      (c) => c.id === id,
                    );
                    if (component) editComponent(component);
                  }}
                />
              ) : (
                <p className="sidebar-empty" role="status">
                  {t("Открываем локальный документ…")}
                </p>
              )}
            </article>
          </main>
          {!!documents.length &&
            !historyRevision &&
            !characterView &&
            view === "screenplay" && (
              <FormatBar
                format={selection?.format}
                displayMode={current.metadata?.formatBarMode}
                onFormat={(key) => editorRef.current?.setFormat(key)}
              />
            )}
          {!!documents.length &&
            !historyRevision &&
            !characterView &&
            view === "screenplay" && (
              <button
                className="icon-button focus-mode-toggle"
                aria-label={t(
                  focusMode
                    ? "Выйти из полноэкранного режима"
                    : "Открыть во весь экран",
                )}
                data-tooltip={t(
                  focusMode
                    ? "Выйти из полноэкранного режима"
                    : "Открыть во весь экран",
                )}
                aria-pressed={focusMode}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  showSidebar(null);
                  setMenu(null);
                  setFocusMode((value) => !value);
                  requestAnimationFrame(() => editorRef.current?.focus());
                }}
              >
                {focusMode ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
              </button>
            )}
          {focusMode && (
            <div
              className="focus-format-hint"
              aria-label={t("Форматирование сценария")}
            >
              {FORMATS.map(([key, label], index) => (
                <span
                  className={selection?.format === key ? "current" : ""}
                  key={key}
                >
                  {t(label)} <kbd>Ctrl+{index + 1}</kbd>
                </span>
              ))}
            </div>
          )}
        </div>
        {doctorOpen && (
          <ScriptDoctor
            content={current.content}
            onClose={() => setDoctorOpen(false)}
            onGo={(id) => setSceneTarget(id)}
          />
        )}
        {searchOpen && (
          <DocumentSearch
            content={current.content}
            sceneVariants={current.sceneVariants}
            query={searchText}
            format={searchFormat}
            onFormat={(value) => {
              setSearchFormat(value);
              setSearchIndex(0);
              setSearchCardSelection(null);
            }}
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
                  ? {
                      index,
                      request: ++searchCardRequest.current,
                    }
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
            preferences={preferences}
            onPreferences={setPreferences}
            metadata={current.metadata}
            spellcheck={current.settings.spellcheck}
            onSpellcheck={(spellcheck) =>
              update((document) => ({
                ...document,
                settings: { ...document.settings, spellcheck },
              }))
            }
            documentZoom={documentZoom}
            onZoom={setDocumentZoom}
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
            area={historyArea}
            onArea={(area) => {
              setHistoryArea(area);
              setHistoryRevision(null);
              setView(area);
              setOutlineCard(null);
            }}
            selectedId={historyRevision?.id}
            onSelect={(revision) => {
              setHistoryRevision(revision);
              setView(historyArea);
            }}
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
            commentScenes={commentScenes}
            quote={commentQuote}
            activeId={activeComment}
            onClose={() => {
              setCommentsOpen(false);
              setCommentQuote(null);
              pendingCommentFocus.current = null;
            }}
            onClearQuote={() => setCommentQuote(null)}
            onAdd={addComment}
            onToggle={(comment) => {
              setActiveComment(null);
              update((d) => ({
                ...d,
                comments: d.comments.map((c) =>
                  c.id === comment.id
                    ? {
                        ...c,
                        resolved: !c.resolved,
                        status: c.resolved ? "open" : "resolved",
                      }
                    : c,
                ),
              }));
            }}
            onUpdate={(id, changes) => {
              if (changes.status) setActiveComment(null);
              update((d) => ({
                ...d,
                comments: d.comments.map((comment) =>
                  comment.id === id
                    ? {
                        ...comment,
                        ...cleanCommentOptions({ ...comment, ...changes }),
                      }
                    : comment,
                ),
              }));
            }}
            onFilterChange={() => setActiveComment(null)}
            onFocus={focusComment}
          />
        )}
        {componentsOpen && (
          <ComponentsPanel
            key={current.id}
            onExportLibrary={() =>
              saveBlob(
                exportComponentLibrary(current),
                `${current.title} — ${t("Компоненты")}`,
                "tytl",
              )
            }
            onImportLibrary={async () => {
              const libraries = await directoryComponentLibraries().catch(
                () => [],
              );
              setLibraryDialog(libraries);
            }}
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
                  {
                    id: uid(),
                    name,
                  },
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
            onToggleFolder={(id) =>
              update((d) => ({
                ...d,
                collapsedPropFolders: (d.collapsedPropFolders || []).includes(
                  id,
                )
                  ? d.collapsedPropFolders.filter((value) => value !== id)
                  : [...(d.collapsedPropFolders || []), id],
              }))
            }
            onAddFolder={(name) =>
              update((d) => ({
                ...d,
                propFolders: [...(d.propFolders || []), { id: uid(), name }],
              }))
            }
            onDeleteFolder={(folder) =>
              setFolderToDelete({ ...folder, kind: "props" })
            }
            onCloseEdit={() => setPropDialog(null)}
            onExport={async () => {
              setBusy("props-pdf");
              try {
                saveBlob(
                  await exportPropsPDF(current),
                  t("{0} — реквизит", current.title),
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
                folders={current.propFolders}
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
                folders={current.propFolders}
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
          folders={current.propFolders}
          onSubmit={saveProp}
          onDelete={deleteProp}
          onClose={() => setPropDialog(null)}
        />
      )}
      {rename !== null && (
        <Dialog title={t("Название сценария")} onClose={() => setRename(null)}>
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
              {t("Название")}
              <input
                autoFocus
                required
                maxLength={160}
                value={rename.title}
                onChange={(e) =>
                  setRename({
                    ...rename,
                    title: e.target.value,
                  })
                }
              />
            </label>
            <div className="dialog-actions">
              <button
                type="button"
                className="quiet-button"
                onClick={() => setRename(null)}
              >
                {t("Отмена")}
              </button>
              <button
                className="primary-button"
                disabled={!rename.title.trim()}
              >
                {t("Сохранить")}
              </button>
            </div>
          </form>
        </Dialog>
      )}
      {menu === "export" &&
        createPortal(
          <div
            ref={exportMenuRef}
            className="minimal-popover export-menu rail-export-menu"
            style={{
              left: exportPosition?.left ?? 72,
              top: exportPosition?.top ?? 8,
              visibility: exportPosition ? "visible" : "hidden",
            }}
          >
            <div className="popover-heading">{t("Сохранить файл")}</div>
            {[
              ["pdf", "PDF", t("Для чтения и печати")],
              ["docx", "Word · DOCX", t("Для работы в Word")],
              ["fdx", "Final Draft · FDX", t("Для сценарных редакторов")],
              ...(IS_PRO
                ? [
                    [
                      "tyt",
                      t("Проект Tyter · TYT"),
                      t("Сценарий, аутлайн, комментарии и все детали"),
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
                  <strong>{t(label)}</strong>
                  <small>{t(hint)}</small>
                </span>
                <span className="file-extension">.{format}</span>
              </button>
            ))}
          </div>,
          document.body,
        )}
      {libraryDialog && (
        <ComponentLibraryDialog
          discovered={libraryDialog}
          onClose={() => setLibraryDialog(null)}
          onEmbed={embedLibrary}
        />
      )}
      {tourOpen && <Onboarding onClose={closeTour} />}
      {subscriptionOpen && (
        <SubscriptionDialog onClose={() => setSubscriptionOpen(false)} />
      )}
      {deleteTarget && (
        <Dialog
          title={t("Удалить документ?")}
          onClose={() => !deleting && setDeleteTarget(null)}
        >
          <p className="delete-document-copy">
            «{deleteTarget.title}
            {t("» будет удалён из списка документов.")}
          </p>
          <div className="dialog-actions">
            <button
              className="quiet-button"
              disabled={deleting}
              onClick={() => setDeleteTarget(null)}
            >
              {t("Отмена")}
            </button>
            <button
              className="primary-button"
              disabled={deleting}
              onClick={deleteDocument}
            >
              {deleting ? t("Удаление…") : t("Удалить")}
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
