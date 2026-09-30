import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Search,
  AlignLeft,
  PanelLeft,
  FileText,
  Paintbrush,
  Shapes,
  Box,
  Image,
  PersonStanding,
  UserRound,
  Volume2,
  Parentheses,
  Scissors,
  Type,
  MessageSquare,
  Plus,
  X,
  Check,
  CheckCheck,
  CircleHelp,
  Share2,
  BookOpen,
  ArrowUpRight,
  ArrowUp,
  MoreHorizontal,
  Download,
  Copy,
  Focus,
  ArrowLeft,
  Settings2,
  Trash2,
  Clock3,
  RotateCcw,
  RotateCw,
  FileDown,
  CheckCircle2,
  Bell,
  Minus,
  LayoutGrid,
} from "lucide-react";
import ScreenplayEditor from "./ScreenplayEditor.jsx";
import ProjectLibrary, { ProjectCover } from "./ProjectLibrary.jsx";
import {
  initialProjects,
  createProject,
  getScenes,
  getWordCount,
  uid,
  validateImport,
  toFountain,
  makePropsCSV,
} from "./data.js";

const STORAGE = "tyter.projects.v1";
const formats = [
  {
    id: "scene",
    label: "INT / EXT",
    icon: Image,
    description: "Scene heading",
  },
  {
    id: "action",
    label: "Action",
    icon: PersonStanding,
    description: "What happens in the scene",
  },
  {
    id: "character",
    label: "Character",
    icon: UserRound,
    description: "Who is speaking",
  },
  {
    id: "speech",
    label: "Speech",
    icon: Volume2,
    description: "Character dialogue",
  },
  {
    id: "parenthetical",
    label: "Parenthetical",
    icon: Parentheses,
    description: "A short delivery direction",
  },
  {
    id: "transition",
    label: "Transition",
    icon: Scissors,
    description: "A cut between scenes",
  },
  { id: "plain", label: "Plain", icon: Type, description: "Unformatted text" },
];
const categories = {
  Costumes: "#e9785c",
  Locations: "#6482df",
  Objects: "#b089d2",
  Vehicles: "#65a18e",
  Sound: "#c19644",
};

function loadProjects() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE));
    if (Array.isArray(saved) && saved.length) return saved.map(validateImport);
  } catch {}
  return initialProjects;
}
function download(name, content, type = "text/plain;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function IconButton({ icon: Icon, label, className = "", ...props }) {
  return (
    <button
      className={`icon-btn ${className}`}
      aria-label={label}
      title={label}
      {...props}
    >
      <Icon size={20} strokeWidth={1.65} />
    </button>
  );
}
function Modal({ title, children, onClose, className = "" }) {
  const ref = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    ref.current?.focus();
    const listener = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const items = ref.current?.querySelectorAll(
          'button,input,textarea,select,[tabindex="0"]',
        );
        if (!items?.length) return;
        const first = items[0],
          last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", listener);
    return () => {
      document.removeEventListener("keydown", listener);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <section
        ref={ref}
        tabIndex={-1}
        className={`modal ${className}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-heading">
          <h2>{title}</h2>
          <IconButton icon={X} label="Close dialog" onClick={onClose} />
        </div>
        {children}
      </section>
    </div>
  );
}

export default function App() {
  const [projects, setProjects] = useState(loadProjects);
  const [activeId, setActiveId] = useState(() => {
    try {
      return localStorage.getItem("tyter.active") || null;
    } catch {
      return null;
    }
  });
  const [view, setView] = useState("editor");
  const [tab, setTab] = useState("scenes");
  const [mode, setMode] = useState("screenplay");
  const [query, setQuery] = useState("");
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentFilter, setCommentFilter] = useState("open");
  const [commentDraft, setCommentDraft] = useState("");
  const [quote, setQuote] = useState(null);
  const [selection, setSelection] = useState({ format: "scene" });
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState("");
  const [saveState, setSaveState] = useState("saved");
  const [focusMode, setFocusMode] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState({});
  const editorRef = useRef(null),
    commentInputRef = useRef(null),
    searchRef = useRef(null),
    toastTimer = useRef(null),
    projectsRef = useRef(projects);
  const project = projects.find((p) => p.id === activeId) || projects[0];
  const settings = project.settings || {};
  const scenes = getScenes(project.content);
  const wordCount = getWordCount(project.content);
  const unresolved = project.comments.filter((c) => !c.resolved);
  projectsRef.current = projects;

  const notify = useCallback((message) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 3500);
  }, []);
  useEffect(() => {
    setSaveState("saving");
    const save = () => {
      try {
        localStorage.setItem(STORAGE, JSON.stringify(projectsRef.current));
        setSaveState("saved");
      } catch {
        setSaveState("error");
      }
    };
    const timer = setTimeout(save, 450);
    const unload = () => {
      try {
        localStorage.setItem(STORAGE, JSON.stringify(projectsRef.current));
      } catch {}
    };
    window.addEventListener("beforeunload", unload);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("beforeunload", unload);
    };
  }, [projects]);
  useEffect(() => {
    try {
      localStorage.setItem("tyter.active", project.id);
    } catch {}
    document.title = `${view === "home" ? "All projects" : project.title} — Tyter`;
  }, [project.id, project.title, view]);
  const updateProject = useCallback(
    (fn) =>
      setProjects((list) =>
        list.map((p) =>
          p.id === (list.find((x) => x.id === activeId) || list[0]).id
            ? { ...fn(p), updatedAt: new Date().toISOString() }
            : p,
        ),
      ),
    [activeId],
  );
  const changeContent = useCallback(
    (content) => updateProject((p) => ({ ...p, content })),
    [updateProject],
  );
  const openComments = useCallback((value) => {
    setCommentsOpen(true);
    if (value?.text) setQuote(value);
  }, []);
  const commentOnSelection = useCallback((source) => {
    setQuote(source);
    setCommentsOpen(true);
    setCommentFilter("open");
    requestAnimationFrame(() => commentInputRef.current?.focus());
  }, []);
  const createComponentFromSelection = useCallback((source) => {
    setModal({ kind: "components", type: "character", source });
  }, []);
  const createPropFromSelection = useCallback((source) => {
    setModal({ kind: "props", source });
  }, []);
  useEffect(() => {
    const key = (e) => {
      if (
        (e.ctrlKey || e.metaKey) &&
        e.key.toLowerCase() === "f" &&
        view === "editor"
      ) {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === "Escape") {
        setFocusMode(false);
        setSidebarOpen(false);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "8" && view === "editor") {
        e.preventDefault();
        if (mode === "outline") setMode("screenplay");
        openComments(editorRef.current?.getSelection());
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [view, openComments, mode]);

  function openProject(id) {
    setActiveId(id);
    setView("editor");
    setMode("screenplay");
    setQuery("");
    setCommentsOpen(false);
    setQuote(null);
  }
  function newProject(title) {
    const next = createProject(title);
    setProjects((p) => [...p, next]);
    openProject(next.id);
    notify("Your next story starts here.");
  }
  async function importProject(file) {
    if (!file) return;
    try {
      if (file.size > 8 * 1024 * 1024)
        throw new Error("Choose a project smaller than 8 MB.");
      const next = validateImport(JSON.parse(await file.text()));
      next.id = uid();
      setProjects((p) => [...p, next]);
      openProject(next.id);
      notify("Project imported.");
    } catch (error) {
      notify(error.message || "This project could not be imported.");
    }
  }
  function toggleSetting(key) {
    updateProject((p) => ({
      ...p,
      settings: { ...p.settings, [key]: !p.settings[key] },
    }));
  }
  function addScene() {
    setMode("screenplay");
    setTimeout(() => editorRef.current?.addScene(), 60);
  }
  function goToScene(id) {
    setMode("screenplay");
    setSidebarOpen(false);
    setTimeout(() => editorRef.current?.focusBlock(id), 60);
  }
  function postComment(e) {
    e.preventDefault();
    if (!commentDraft.trim()) return;
    const id = uid();
    const anchored = quote ? editorRef.current?.addComment(id, quote) : null;
    const source = anchored || quote;
    updateProject((p) => ({
      ...p,
      comments: [
        ...p.comments,
        {
          id,
          text: commentDraft.trim(),
          quote: source?.text || "",
          blockId: source?.blockId || "",
          author: "Alex Morgan",
          createdAt: new Date().toISOString(),
          resolved: false,
        },
      ],
    }));
    setCommentDraft("");
    setQuote(null);
    setCommentFilter("open");
    notify("Comment added.");
  }
  function resolveComment(comment) {
    updateProject((p) => ({
      ...p,
      comments: p.comments.map((c) =>
        c.id === comment.id ? { ...c, resolved: !c.resolved } : c,
      ),
    }));
    if (!comment.resolved) editorRef.current?.removeComment(comment.id);
    else if (comment.quote)
      editorRef.current?.addComment(comment.id, {
        blockId: comment.blockId,
        text: comment.quote,
      });
    notify(comment.resolved ? "Comment reopened." : "Comment resolved.");
  }
  function deleteComment(id) {
    updateProject((p) => ({
      ...p,
      comments: p.comments.filter((c) => c.id !== id),
    }));
    editorRef.current?.removeComment(id);
  }
  function saveItem(values) {
    const kind = modal.kind;
    const id = modal.item?.id || uid();
    const source =
      modal.source || (!modal.item ? editorRef.current?.getSelection() : null);
    const item = {
      ...values,
      id,
      blockId: modal.item?.blockId || source?.blockId || "",
    };
    updateProject((p) => ({
      ...p,
      [kind]: modal.item
        ? p[kind].map((x) => (x.id === id ? item : x))
        : [...p[kind], item],
    }));
    if (source?.text)
      editorRef.current?.addEntity({ id, color: values.color }, source);
    if (modal.source) {
      setTab(kind);
      setQuery("");
    }
    setModal(null);
    notify(kind === "components" ? "Component saved." : "Prop saved.");
  }
  function removeItem(kind, id) {
    updateProject((p) => ({
      ...p,
      [kind]: p[kind].filter((x) => x.id !== id),
    }));
    editorRef.current?.removeEntity(id);
    setModal(null);
    notify("Item removed.");
  }

  return (
    <>
      {view === "home" ? (
        <ProjectLibrary
          projects={projects}
          onOpen={openProject}
          onCreate={newProject}
          onToggleStar={(id) =>
            setProjects((list) =>
              list.map((p) =>
                p.id === id ? { ...p, starred: !p.starred } : p,
              ),
            )
          }
          onImport={importProject}
          notify={notify}
        />
      ) : (
        <div
          className={`app-shell ${focusMode ? "focus-mode" : ""} ${commentsOpen ? "with-comments" : ""}`}
        >
          <header className="topbar">
            <div className="workspace-switch">
              <button
                className="brand-button"
                onClick={() => setView("home")}
                title="All projects"
                aria-label="All projects"
              >
                <img src="/brand/tyter-logo.svg" width="26" height="26" alt="" />
                <ChevronDown size={14} />
              </button>
              <div className="workspace-modes">
                <button
                  className={mode === "screenplay" ? "active" : ""}
                  onClick={() => setMode("screenplay")}
                >
                  <AlignLeft size={19} /> <span>Screenplay</span>
                </button>
                <button
                  className={mode === "outline" ? "active" : ""}
                  onClick={() => setMode("outline")}
                >
                  <PanelLeft size={18} />
                  <span>Outline</span>
                </button>
              </div>
            </div>
            <div className="breadcrumbs">
              <button onClick={() => setView("home")}>All projects</button>
              <span className="crumb-slash">/</span>
              <button
                className="project-name"
                onClick={() => setModal({ kind: "rename" })}
              >
                {project.title}
                <ChevronDown size={13} />
              </button>
            </div>
            <div className="topbar-actions">
              <span className={`save-state ${saveState}`}>
                <span />
                {saveState === "saving"
                  ? "Saving…"
                  : saveState === "error"
                    ? "Could not save"
                    : "All changes saved"}
              </span>
              <IconButton
                icon={Focus}
                label={focusMode ? "Exit focus mode" : "Focus mode"}
                onClick={() => setFocusMode(!focusMode)}
              />
              <IconButton
                icon={CircleHelp}
                label="Keyboard shortcuts"
                onClick={() => setModal({ kind: "help" })}
              />
              <button
                className="avatar"
                aria-label="Your workspace"
                title="Alex Morgan · Personal workspace"
                onClick={() => setView("home")}
              >
                A
              </button>
              <button
                className="share-button"
                onClick={() => setModal({ kind: "export" })}
              >
                <Share2 size={18} /> <span>Share</span>
              </button>
            </div>
          </header>
          <div className="workspace">
            <aside className={`sidebar ${sidebarOpen ? "mobile-open" : ""}`}>
              <div className="search-field">
                <Search size={17} />
                <input
                  ref={searchRef}
                  aria-label="Search screenplay"
                  placeholder="Search screenplay"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                {query ? (
                  <button
                    aria-label="Clear search"
                    onClick={() => setQuery("")}
                  >
                    <X size={14} />
                  </button>
                ) : (
                  <kbd>Ctrl F</kbd>
                )}
              </div>
              <nav className="sidebar-tabs" aria-label="Project tools">
                {[
                  { id: "scenes", icon: FileText, label: "Scenes" },
                  {
                    id: "settings",
                    icon: Paintbrush,
                    label: "Project settings",
                  },
                  { id: "components", icon: Shapes, label: "Components" },
                  { id: "props", icon: Box, label: "Props" },
                ].map(({ id, icon: Icon, label }) => (
                  <button
                    key={id}
                    onClick={() => setTab(id)}
                    className={tab === id ? "active" : ""}
                    title={label}
                    aria-label={label}
                    aria-pressed={tab === id}
                  >
                    <Icon size={22} strokeWidth={1.6} />
                  </button>
                ))}
              </nav>
              <div className="sidebar-content">
                {tab === "scenes" && (
                  <>
                    <div className="section-heading">
                      <h1>
                        Scenes <span>{scenes.length}</span>
                      </h1>
                      <IconButton
                        icon={Plus}
                        label="Add scene"
                        onClick={addScene}
                      />
                    </div>
                    <div className="scene-list">
                      {scenes
                        .filter((s) =>
                          `${s.title} ${s.text}`
                            .toLowerCase()
                            .includes(query.toLowerCase()),
                        )
                        .map((s, i) => (
                          <button
                            className={`scene-item ${selection.blockId === s.id || (!selection.blockId && i === 0) ? "selected" : ""}`}
                            key={s.id}
                            onClick={() => goToScene(s.id)}
                          >
                            <span className="scene-number">
                              {String(i + 1).padStart(2, "0")}
                            </span>
                            <span className="scene-description">
                              <strong>{s.title || "UNTITLED SCENE"}</strong>
                              <span>Page {s.page || 1}</span>
                              <p>{s.text || "Your scene starts here."}</p>
                            </span>
                          </button>
                        ))}
                      {!scenes.length && (
                        <EmptyState
                          icon={Image}
                          title="Every story starts somewhere"
                          text="Add your first scene to begin."
                        />
                      )}
                      {query &&
                        !scenes.some((s) =>
                          `${s.title} ${s.text}`
                            .toLowerCase()
                            .includes(query.toLowerCase()),
                        ) && (
                          <p className="empty-note">
                            No scenes match “{query}”.
                          </p>
                        )}
                    </div>
                    <button
                      className="text-button add-scene"
                      onClick={addScene}
                    >
                      <Plus size={16} /> Add scene
                    </button>
                    <div className="sidebar-tip">
                      <span className="tip-line" />
                      <p>
                        A little structure.
                        <br />A lot of possibility.
                      </p>
                      <span>Make room for your next great scene.</span>
                    </div>
                  </>
                )}
                {tab === "components" && (
                  <>
                    <div className="section-heading">
                      <h1>Components</h1>
                      <IconButton
                        icon={BookOpen}
                        label="About components"
                        onClick={() =>
                          notify(
                            "Build your cast and places. Select text before adding a component to link it to your screenplay.",
                          )
                        }
                      />
                    </div>
                    {["character", "place"].map((type) => (
                      <section className="component-group" key={type}>
                        <div className="group-heading">
                          <h2>
                            {type === "character" ? "Characters" : "Places"}
                          </h2>
                          <IconButton
                            icon={Plus}
                            label={`Add ${type}`}
                            onClick={() =>
                              setModal({ kind: "components", type })
                            }
                          />
                        </div>
                        {project.components
                          .filter(
                            (c) =>
                              c.type === type &&
                              c.name
                                .toLowerCase()
                                .includes(query.toLowerCase()),
                          )
                          .map((c) => (
                            <button
                              key={c.id}
                              className="component-item"
                              onClick={() =>
                                setModal({ kind: "components", item: c })
                              }
                            >
                              <Shapes
                                size={17}
                                style={{ color: c.color || "#9b70c7" }}
                              />
                              <span>
                                <strong>{c.name}</strong>
                                {c.description && (
                                  <small>{c.description}</small>
                                )}
                              </span>
                              <ChevronRight size={14} />
                            </button>
                          ))}
                        {!project.components.some((c) => c.type === type) && (
                          <p className="empty-note">
                            Add a {type} to your story.
                          </p>
                        )}
                      </section>
                    ))}
                    <p className="panel-hint">
                      Select a passage in your screenplay, then create a
                      component to connect it to your story.
                    </p>
                  </>
                )}
                {tab === "props" && (
                  <>
                    <div className="section-heading">
                      <h1>Props</h1>
                      <IconButton
                        icon={Plus}
                        label="Add prop"
                        onClick={() => setModal({ kind: "props" })}
                      />
                    </div>
                    <button
                      className="report-button"
                      onClick={() => {
                        download(
                          `${project.title} — props.csv`,
                          makePropsCSV(project),
                          "text/csv;charset=utf-8",
                        );
                        notify("Props report downloaded.");
                      }}
                    >
                      <FileDown size={18} />
                      Create report
                      <ArrowUpRight size={15} />
                    </button>
                    {Object.entries(categories).map(([category, color]) => {
                      const items = project.props.filter(
                        (p) =>
                          p.category === category &&
                          p.name.toLowerCase().includes(query.toLowerCase()),
                      );
                      return items.length ? (
                        <section className="prop-group" key={category}>
                          <button
                            className="prop-group-heading"
                            onClick={() =>
                              setCollapsed((p) => ({
                                ...p,
                                [category]: !p[category],
                              }))
                            }
                          >
                            <ChevronDown
                              size={14}
                              className={collapsed[category] ? "collapsed" : ""}
                            />
                            <i style={{ background: color }} />
                            <h2>{category}</h2>
                            <span>
                              QTY ·{" "}
                              {items.reduce(
                                (a, p) => a + Number(p.quantity || 1),
                                0,
                              )}
                            </span>
                          </button>
                          {!collapsed[category] &&
                            items.map((p) => (
                              <button
                                className="prop-item"
                                key={p.id}
                                onClick={() =>
                                  setModal({ kind: "props", item: p })
                                }
                              >
                                <span>
                                  <strong>{p.name}</strong>
                                  {p.description && (
                                    <small>{p.description}</small>
                                  )}
                                  <small>
                                    {p.blockId
                                      ? "Linked to screenplay"
                                      : "Project prop"}
                                  </small>
                                </span>
                                <b>{p.quantity || 1}</b>
                              </button>
                            ))}
                        </section>
                      ) : null;
                    })}
                    <button
                      className="text-button add-scene"
                      onClick={() => setModal({ kind: "props" })}
                    >
                      <Plus size={16} /> Add prop
                    </button>
                    <p className="panel-hint">
                      Keep every costume, location, and little detail in one
                      place.
                    </p>
                  </>
                )}
                {tab === "settings" && (
                  <>
                    <div className="section-heading">
                      <h1>Project settings</h1>
                      <Settings2 size={17} />
                    </div>
                    <div className="settings-cover">
                      <ProjectCover
                        cover={project.cover}
                        title={project.title}
                      />
                      <button onClick={() => setModal({ kind: "cover" })}>
                        Edit cover <ArrowUpRight size={14} />
                      </button>
                    </div>
                    <div className="settings-options">
                      {[
                        { id: "lineHighlight", label: "Show line highlight" },
                        { id: "minimap", label: "Show minimap" },
                        { id: "timeline", label: "Show timeline" },
                        { id: "components", label: "Highlight components" },
                      ].map((option) => (
                        <label className="checkbox-row" key={option.id}>
                          <input
                            type="checkbox"
                            checked={!!settings[option.id]}
                            onChange={() => toggleSetting(option.id)}
                          />
                          <span className="custom-check">
                            {settings[option.id] && <Check size={14} />}
                          </span>
                          {option.label}
                        </label>
                      ))}
                    </div>
                    <div className="setting-divider" />
                    <h2 className="settings-subtitle">Format bar</h2>
                    <label className="checkbox-row">
                      <input
                        type="checkbox"
                        checked={!!settings.formatLabels}
                        onChange={() => toggleSetting("formatLabels")}
                      />
                      <span className="custom-check">
                        {settings.formatLabels && <Check size={14} />}
                      </span>
                      Show text labels
                    </label>
                    <button
                      className="text-button shortcut-link"
                      onClick={() => setModal({ kind: "help" })}
                    >
                      <CircleHelp size={16} /> Keyboard shortcuts
                    </button>
                  </>
                )}
              </div>
              <div className="sidebar-footer">
                <div>
                  <span className="live-dot" /> Your writing room
                </div>
                <span>
                  {scenes.length} scenes <span>·</span>{" "}
                  {wordCount.toLocaleString()} words
                </span>
              </div>
            </aside>
            <main className="main-workspace">
              <button
                className="mobile-sidebar icon-btn"
                aria-label="Toggle sidebar"
                onClick={() => setSidebarOpen(!sidebarOpen)}
              >
                <PanelLeft size={20} />
              </button>
              {focusMode && (
                <button
                  className="exit-focus button"
                  onClick={() => setFocusMode(false)}
                >
                  <Focus size={16} /> Exit focus <kbd>Esc</kbd>
                </button>
              )}
              {mode === "screenplay" ? (
                <div className="document-viewport">
                  <div
                    className={`screenplay-page ${settings.lineHighlight ? "line-highlight" : ""}`}
                    style={{ "--script-zoom": zoom / 100 }}
                  >
                    <div className="page-topline">
                      <span>FIRST DRAFT</span>
                      <span>1</span>
                    </div>
                    <ScreenplayEditor
                      key={project.id}
                      ref={editorRef}
                      content={project.content}
                      onChange={changeContent}
                      onSelection={setSelection}
                      comments={project.comments}
                      onComments={openComments}
                      onCommentFromSelection={commentOnSelection}
                      onCreateComponent={createComponentFromSelection}
                      onCreateProp={createPropFromSelection}
                      selectionToolbarDisabled={!!modal}
                      showLineHighlight={settings.lineHighlight}
                      showComponents={
                        settings.components ||
                        tab === "props" ||
                        tab === "components"
                      }
                      searchQuery={query}
                    />
                    <div className="page-end">
                      <span />
                      END OF DRAFT
                      <span />
                    </div>
                  </div>
                  {settings.minimap && (
                    <div className="minimap" aria-label="Scene minimap">
                      {scenes.map((s) => (
                        <button
                          key={s.id}
                          title={s.title}
                          onClick={() => goToScene(s.id)}
                        >
                          <b>{s.title}</b>
                          {[1, 2, 3, 4].map((n) => (
                            <i key={n} style={{ width: `${95 - n * 9}%` }} />
                          ))}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="outline-view">
                  <div className="outline-heading">
                    <div>
                      <span className="eyebrow">THE BIG PICTURE</span>
                      <h1>Your story, scene by scene.</h1>
                      <p>
                        {scenes.length} scenes in {project.title}
                      </p>
                    </div>
                    <button className="button" onClick={addScene}>
                      <Plus size={16} /> Add scene
                    </button>
                  </div>
                  <div className="outline-grid">
                    {scenes.map((s, i) => (
                      <button
                        className="outline-card"
                        key={s.id}
                        onClick={() => goToScene(s.id)}
                      >
                        <div>
                          <span>SCENE {String(i + 1).padStart(2, "0")}</span>
                          <ArrowUpRight size={16} />
                        </div>
                        <h2>{s.title}</h2>
                        <p>{s.text || "An unwritten possibility."}</p>
                        <footer>
                          Page {s.page || 1}
                          <span>
                            Open scene <ArrowUpRight size={13} />
                          </span>
                        </footer>
                      </button>
                    ))}
                    <button
                      className="outline-card new-scene-card"
                      onClick={addScene}
                    >
                      <Plus size={24} />
                      <span>Make room for another scene</span>
                    </button>
                  </div>
                </div>
              )}
              {settings.timeline && (
                <div className="timeline">
                  <span>STORYLINE</span>
                  {scenes.map((s, i) => (
                    <button key={s.id} onClick={() => goToScene(s.id)}>
                      <b>{i + 1}</b>
                      {s.title}
                    </button>
                  ))}
                </div>
              )}
              <footer className="document-footer">
                <span>
                  {wordCount.toLocaleString()} words <i>·</i>{" "}
                  {Math.max(1, Math.ceil(wordCount / 200))} min read
                </span>
                <div className="zoom-controls">
                  <IconButton
                    icon={Minus}
                    label="Zoom out"
                    onClick={() => setZoom((z) => Math.max(70, z - 10))}
                  />
                  <button onClick={() => setZoom(100)} title="Reset zoom">
                    {zoom}%
                  </button>
                  <IconButton
                    icon={Plus}
                    label="Zoom in"
                    onClick={() => setZoom((z) => Math.min(150, z + 10))}
                  />
                </div>
              </footer>
              {mode === "screenplay" && (
                <div
                  className={`format-bar ${settings.formatLabels ? "with-labels" : ""}`}
                  role="toolbar"
                  aria-label="Screenplay formatting"
                >
                  <div className="format-buttons">
                    {formats.map(({ id, label, icon: Icon }, i) => (
                      <button
                        key={id}
                        className={`format-button ${selection.format === id ? "active" : ""}`}
                        aria-label={`${label} (Ctrl+${i + 1})`}
                        aria-pressed={selection.format === id}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => editorRef.current?.setFormat(id)}
                      >
                        <Icon size={21} strokeWidth={1.65} />
                        {settings.formatLabels && (
                          <span className="format-label">{label}</span>
                        )}
                        <span className="format-tooltip">
                          {label}
                          <kbd>Ctrl {i + 1}</kbd>
                        </span>
                      </button>
                    ))}
                  </div>
                  <span className="format-divider" />
                  <button
                    className={`format-button comments-toggle ${commentsOpen ? "active" : ""}`}
                    aria-label="Comments (Ctrl+8)"
                    aria-expanded={commentsOpen}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() =>
                      commentsOpen
                        ? setCommentsOpen(false)
                        : openComments(editorRef.current?.getSelection())
                    }
                  >
                    <MessageSquare size={21} strokeWidth={1.65} />
                    {settings.formatLabels && (
                      <span className="format-label">Comments</span>
                    )}
                    <span className="comment-count">{unresolved.length}</span>
                    <span className="format-tooltip">
                      Comments<kbd>Ctrl 8</kbd>
                    </span>
                  </button>
                </div>
              )}
            </main>
            {commentsOpen && (
              <aside className="comments-panel">
                <div className="comments-heading">
                  <h2>
                    Comments <span>{unresolved.length}</span>
                  </h2>
                  <IconButton
                    icon={X}
                    label="Close comments"
                    onClick={() => setCommentsOpen(false)}
                  />
                </div>
                <div className="comment-filters">
                  <button
                    className={commentFilter === "open" ? "active" : ""}
                    onClick={() => setCommentFilter("open")}
                  >
                    Open <span>{unresolved.length}</span>
                  </button>
                  <button
                    className={commentFilter === "resolved" ? "active" : ""}
                    onClick={() => setCommentFilter("resolved")}
                  >
                    Resolved{" "}
                    <span>{project.comments.length - unresolved.length}</span>
                  </button>
                </div>
                <div className="comment-list">
                  {project.comments
                    .filter((c) =>
                      commentFilter === "resolved" ? c.resolved : !c.resolved,
                    )
                    .map((c) => (
                      <article className="comment-card" key={c.id}>
                        <div className="comment-author">
                          <span className="comment-avatar">
                            {(c.author || "Alex Morgan")[0]}
                          </span>
                          <div>
                            <strong>{c.author || "Alex Morgan"}</strong>
                            <span>
                              {new Date(c.createdAt).toLocaleDateString(
                                "en-US",
                                { month: "short", day: "numeric" },
                              )}
                            </span>
                          </div>
                          <IconButton
                            icon={c.resolved ? RotateCcw : Check}
                            label={
                              c.resolved ? "Reopen comment" : "Resolve comment"
                            }
                            onClick={() => resolveComment(c)}
                          />
                        </div>
                        {c.quote && (
                          <button
                            className="comment-quote"
                            onClick={() => goToScene(c.blockId)}
                          >
                            {c.quote}
                          </button>
                        )}
                        <p>{c.text}</p>
                        <button
                          className="delete-comment"
                          onClick={() => deleteComment(c.id)}
                        >
                          Delete
                        </button>
                      </article>
                    ))}
                  {!project.comments.some((c) =>
                    commentFilter === "resolved" ? c.resolved : !c.resolved,
                  ) && (
                    <EmptyState
                      icon={MessageSquare}
                      title={
                        commentFilter === "open"
                          ? "Room for a thought"
                          : "A fresh start"
                      }
                      text={
                        commentFilter === "open"
                          ? "Select a passage and leave a note for your next draft."
                          : "Resolved comments will appear here."
                      }
                    />
                  )}
                </div>
                <form className="comment-composer" onSubmit={postComment}>
                  {quote?.text && (
                    <div className="composer-quote">
                      <span>{quote.text}</span>
                      <button
                        type="button"
                        aria-label="Remove selected quote"
                        onClick={() => {
                          setQuote(null);
                        }}
                      >
                        <X size={13} />
                      </button>
                    </div>
                  )}
                  <textarea
                    ref={commentInputRef}
                    placeholder="Leave a thought…"
                    aria-label="Write a comment"
                    value={commentDraft}
                    onChange={(e) => setCommentDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if ((e.ctrlKey || e.metaKey) && e.key === "Enter")
                        postComment(e);
                    }}
                  />
                  <div>
                    <span>Only you, for now</span>
                    <button
                      type="submit"
                      className="send-comment"
                      disabled={!commentDraft.trim()}
                      aria-label="Post comment"
                    >
                      <ArrowUp size={17} />
                    </button>
                  </div>
                </form>
              </aside>
            )}
          </div>
        </div>
      )}
      {modal?.kind === "help" && (
        <Modal
          title="A shortcut to your next scene"
          onClose={() => setModal(null)}
        >
          <p className="modal-intro">
            Keep your hands on the keyboard. Formatting applies to the paragraph
            at your cursor.
          </p>
          <div className="shortcut-list">
            {formats.map((format, i) => (
              <div key={format.id}>
                <format.icon size={19} />
                <span>
                  <strong>{format.label}</strong>
                  <small>{format.description}</small>
                </span>
                <kbd>Ctrl + {i + 1}</kbd>
              </div>
            ))}
            <div>
              <MessageSquare size={19} />
              <span>
                <strong>Comments</strong>
                <small>Open notes on your screenplay</small>
              </span>
              <kbd>Ctrl + 8</kbd>
            </div>
          </div>
          <p className="modal-footnote">
            Tab cycles formats · Enter continues the screenplay flow.
            <br />
            Use ⌘ instead of Ctrl on Mac. Undo with Ctrl + Z.
          </p>
        </Modal>
      )}
      {modal?.kind === "rename" && (
        <TitleModal
          title={project.title}
          onClose={() => setModal(null)}
          onSave={(title) => {
            updateProject((p) => ({ ...p, title }));
            setModal(null);
          }}
        />
      )}
      {(modal?.kind === "components" || modal?.kind === "props") && (
        <ItemModal
          modal={modal}
          selection={modal.source || editorRef.current?.getSelection()}
          onClose={() => setModal(null)}
          onSave={saveItem}
          onDelete={() => removeItem(modal.kind, modal.item.id)}
        />
      )}
      {modal?.kind === "export" && (
        <Modal title="Take your story with you" onClose={() => setModal(null)}>
          <p className="modal-intro">
            Export “{project.title}” to share it with your team.
          </p>
          <div className="export-options">
            <button
              onClick={() => {
                download(`${project.title}.fountain`, toFountain(project));
                notify("Screenplay exported as Fountain.");
              }}
            >
              <FileText size={21} />
              <span>
                <strong>Screenplay</strong>
                <small>Fountain · works with screenwriting apps</small>
              </span>
              <Download size={17} />
            </button>
            <button
              onClick={() => {
                download(
                  `${project.title}.json`,
                  JSON.stringify(project, null, 2),
                  "application/json",
                );
                notify("Full project backup downloaded.");
              }}
            >
              <Box size={21} />
              <span>
                <strong>Full project</strong>
                <small>JSON · includes components, props, and comments</small>
              </span>
              <Download size={17} />
            </button>
            <button
              onClick={() => {
                setModal(null);
                setMode("screenplay");
                setTimeout(() => window.print(), 200);
              }}
            >
              <FileDown size={21} />
              <span>
                <strong>Print or save as PDF</strong>
                <small>A clean, formatted screenplay</small>
              </span>
              <ArrowUpRight size={17} />
            </button>
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(toFountain(project));
                  notify("Screenplay copied to clipboard.");
                } catch {
                  notify(
                    "Clipboard unavailable. Download a Fountain file instead.",
                  );
                }
              }}
            >
              <Copy size={21} />
              <span>
                <strong>Copy screenplay</strong>
                <small>Plain text with screenplay formatting</small>
              </span>
              <ArrowUpRight size={17} />
            </button>
          </div>
          <p className="modal-footnote">
            <span className="live-dot" /> Your projects are saved locally in
            this browser.
          </p>
        </Modal>
      )}
      {modal?.kind === "cover" && (
        <Modal title="Set the scene" onClose={() => setModal(null)}>
          <p className="modal-intro">Choose a cover for your project.</p>
          <div className="cover-options">
            {["wire", "hokum", "hoppers", null].map((cover, i) => (
              <button
                key={i}
                aria-label={`Choose ${cover || "screenplay"} cover`}
                className={project.cover === cover ? "selected" : ""}
                onClick={() => {
                  updateProject((p) => ({ ...p, cover }));
                  setModal(null);
                }}
              >
                <ProjectCover cover={cover} title={project.title} />
              </button>
            ))}
          </div>
        </Modal>
      )}
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={17} />
          {toast}
        </div>
      )}
    </>
  );
}

function EmptyState({ icon: Icon, title, text }) {
  return (
    <div className="empty-state">
      <Icon size={27} strokeWidth={1.2} />
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
function TitleModal({ title, onClose, onSave }) {
  const [value, setValue] = useState(title);
  return (
    <Modal title="Project name" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim()) onSave(value.trim());
        }}
      >
        <label className="form-label">
          Name
          <input
            autoFocus
            maxLength={80}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            required
          />
        </label>
        <div className="modal-actions">
          <button className="button" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" disabled={!value.trim()}>
            Save name
          </button>
        </div>
      </form>
    </Modal>
  );
}
function ItemModal({ modal, selection, onClose, onSave, onDelete }) {
  const isProp = modal.kind === "props";
  const [name, setName] = useState(
    modal.item?.name ||
      (selection?.to > selection?.from ? selection.text.slice(0, 80) : ""),
  );
  const [type, setType] = useState(
    modal.item?.type || modal.type || "character",
  );
  const [description, setDescription] = useState(modal.item?.description || "");
  const [category, setCategory] = useState(modal.item?.category || "Objects");
  const [quantity, setQuantity] = useState(modal.item?.quantity || 1);
  return (
    <Modal
      title={`${modal.item ? "Edit" : "New"} ${isProp ? "prop" : "component"}`}
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim())
            onSave({
              name: name.trim(),
              description: description.trim(),
              ...(isProp
                ? {
                    category,
                    quantity: Number(quantity),
                    color: categories[category],
                  }
                : {
                    type,
                    color: type === "character" ? "#9f72cc" : "#6086c0",
                  }),
            });
        }}
      >
        <label className="form-label">
          {isProp ? "Prop name" : "Name"}
          <input
            autoFocus
            value={name}
            maxLength={100}
            onChange={(e) => setName(e.target.value)}
            placeholder={isProp ? "e.g. Black suits" : "e.g. Mr. Pink"}
            required
          />
        </label>
        <div className="form-row">
          <label className="form-label">
            {isProp ? "Category" : "Type"}
            <select
              value={isProp ? category : type}
              onChange={(e) =>
                isProp ? setCategory(e.target.value) : setType(e.target.value)
              }
            >
              {isProp ? (
                Object.keys(categories).map((c) => <option key={c}>{c}</option>)
              ) : (
                <>
                  <option value="character">Character</option>
                  <option value="place">Place</option>
                </>
              )}
            </select>
          </label>
          {isProp && (
            <label className="form-label quantity-label">
              Quantity
              <input
                type="number"
                min="1"
                max="9999"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                required
              />
            </label>
          )}
        </div>
        <label className="form-label">
          Description <span>optional</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={
              isProp
                ? "Details, location, or production notes…"
                : "A little backstory goes a long way…"
            }
            rows={3}
          />
        </label>
        {selection?.text && (
          <p className="modal-footnote">
            <Shapes size={14} /> Will be linked to the current passage.
          </p>
        )}
        <div className="modal-actions">
          {modal.item && (
            <button type="button" className="button danger" onClick={onDelete}>
              <Trash2 size={15} />
              Delete
            </button>
          )}
          <button type="button" className="button" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" disabled={!name.trim()}>
            Save {isProp ? "prop" : "component"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
