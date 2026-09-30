import React, { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  Search,
  Files,
  History,
  Star,
  Folder,
  Plus,
  ArrowUpFromLine,
  X,
  FileText,
  ArrowUpRight,
  Clapperboard,
} from "lucide-react";
import "./project-library.css";

const COVER_POSITIONS = {
  wire: "28.814669% 29.457364%",
  hokum: "51.735429% 29.457364%",
  hoppers: "74.656189% 29.457364%",
};

export function ProjectCover({ cover, title = "Untitled" }) {
  if (COVER_POSITIONS[cover]) {
    return (
      <div
        className={`project-cover project-cover-${cover}`}
        role="img"
        aria-label={`${title} cover`}
        style={{
          backgroundImage: "url('/reference-home.png')",
          backgroundPosition: COVER_POSITIONS[cover],
        }}
      />
    );
  }
  if (typeof cover === "string" && cover.startsWith("data:image/")) {
    return (
      <div
        className="project-cover project-cover-uploaded"
        role="img"
        aria-label={`${title} cover`}
        style={{ backgroundImage: `url("${cover}")` }}
      />
    );
  }
  return (
    <div className="project-cover project-cover-script" aria-hidden="true">
      <div className="cover-page-number">1.</div>
      <p className="cover-slug">INT. A NEW BEGINNING — DAY</p>
      <p>
        A quiet room. A blank page. Somewhere, a story is waiting to be told.
      </p>
      <p>
        The morning light falls across the desk. A writer sits down, takes a
        breath, and begins.
      </p>
      <p className="cover-slug cover-character">THE WRITER</p>
      <p className="cover-dialogue">
        Every great story starts with a single line.
      </p>
      <p className="cover-slug">EXT. THE CITY — MORNING</p>
      <p>
        The city wakes. Windows fill with light. A thousand lives cross paths,
        each carrying a story of their own.
      </p>
      <div className="cover-lines">
        {Array.from({ length: 7 }, (_, i) => (
          <span
            key={i}
            style={{ width: `${[96, 100, 87, 99, 78, 94, 56][i]}%` }}
          />
        ))}
      </div>
    </div>
  );
}

function updatedLabel(value) {
  const timestamp = new Date(value || Date.now()).getTime();
  if (!Number.isFinite(timestamp)) return "Edited recently";
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
  if (minutes < 1) return "Edited just now";
  if (minutes < 60)
    return `Edited ${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24)
    return `Edited ${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `Edited ${days} ${days === 1 ? "day" : "days"} ago`;
  return `Edited ${new Date(timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

export default function ProjectLibrary({
  projects = [],
  onOpen,
  onCreate,
  onToggleStar,
  onImport,
  notify,
}) {
  const [view, setView] = useState("all");
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const titleRef = useRef(null);
  const createButtonRef = useRef(null);
  const searchRef = useRef(null);
  const importRef = useRef(null);
  const modalRef = useRef(null);
  const starred = projects.filter((project) => project.starred);
  const viewTitle =
    view === "recent"
      ? "Recent projects"
      : view === "starred"
        ? "Starred projects"
        : "All projects";
  const visibleProjects = projects
    .filter((project) => view !== "starred" || project.starred)
    .filter((project) =>
      project.title.toLowerCase().includes(query.trim().toLowerCase()),
    )
    .sort((a, b) =>
      view === "recent"
        ? new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        : 0,
    );

  useEffect(() => {
    if (!creating) return;
    titleRef.current?.focus();
    function handleKey(event) {
      if (event.key === "Escape") {
        setCreating(false);
        createButtonRef.current?.focus();
      }
      if (event.key === "Tab") {
        const controls = modalRef.current?.querySelectorAll(
          "button:not([disabled]), input",
        );
        if (!controls?.length) return;
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [creating]);

  function openCreate() {
    setTitle("");
    setCreating(true);
  }
  function closeCreate() {
    setCreating(false);
    createButtonRef.current?.focus();
  }
  function submitCreate(event) {
    event.preventDefault();
    if (!title.trim()) return;
    onCreate(title.trim());
    setCreating(false);
  }
  function changeView(nextView) {
    setView(nextView);
    setQuery("");
  }
  async function importFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      await onImport(file);
    } catch {
      notify?.(
        "This project could not be imported. Please choose a valid project file.",
      );
    }
    event.target.value = "";
  }

  return (
    <div className="project-library">
      <aside className="home-sidebar" aria-label="Project navigation">
        <div className="home-brand">
          <span className="home-brand-mark">
            <img src="/brand/tyter-logo.svg" width="25" height="25" alt="" />
          </span>
          <span>
            tyter<span className="home-brand-period">.</span>
          </span>
        </div>
        <div className="home-profile">
          <span className="home-avatar">A</span>
          <div>
            <strong>Alex Morgan</strong>
            <span>Personal workspace</span>
          </div>
          <ChevronDown size={16} />
        </div>
        <nav className="home-nav">
          <button
            className={view === "all" ? "is-active" : ""}
            onClick={() => changeView("all")}
          >
            <Files size={20} />
            <span>All projects</span>
            <span className="home-nav-count">{projects.length}</span>
          </button>
          <button
            className={view === "recent" ? "is-active" : ""}
            onClick={() => changeView("recent")}
          >
            <History size={20} />
            <span>Recent</span>
          </button>
          <button
            className={view === "starred" ? "is-active" : ""}
            onClick={() => changeView("starred")}
          >
            <Star size={20} />
            <span>Starred</span>
            {starred.length > 0 && (
              <span className="home-nav-count">{starred.length}</span>
            )}
          </button>
        </nav>
        {starred.length > 0 && (
          <section className="home-sidebar-group">
            <h2>STARRED</h2>
            {starred.map((project) => (
              <button
                key={project.id}
                className="home-shortcut"
                onClick={() => onOpen(project.id)}
              >
                <FileText size={18} />
                <span>{project.title}</span>
              </button>
            ))}
          </section>
        )}
        <section className="home-sidebar-group home-workspace-group">
          <h2>WORKSPACE</h2>
          <button className="home-shortcut" onClick={() => changeView("all")}>
            <Folder size={19} />
            <span>Personal projects</span>
          </button>
        </section>
        <div className="home-sidebar-bottom">
          <span className="home-status-dot" />
          <span>Your stories, saved on this device.</span>
        </div>
      </aside>

      <main className="home-main">
        <header className="home-topbar">
          <label className="home-search">
            <Search size={18} />
            <input
              ref={searchRef}
              aria-label="Search projects"
              placeholder="Search your projects..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            {query ? (
              <button
                aria-label="Clear search"
                onClick={() => {
                  setQuery("");
                  searchRef.current?.focus();
                }}
              >
                <X size={15} />
              </button>
            ) : (
              <kbd>Search</kbd>
            )}
          </label>
          <button
            className="home-import"
            onClick={() => importRef.current?.click()}
          >
            <ArrowUpFromLine size={17} />
            <span>Import project</span>
          </button>
          <input
            ref={importRef}
            type="file"
            accept=".json,application/json"
            onChange={importFile}
            hidden
          />
        </header>
        <section className="home-projects" aria-labelledby="projects-heading">
          <div className="home-heading">
            <div>
              <div className="home-eyebrow">YOUR WORKSPACE</div>
              <h1 id="projects-heading">
                {viewTitle}
                <span>{visibleProjects.length}</span>
              </h1>
              <p>A little space for your next big story.</p>
            </div>
            <button
              ref={createButtonRef}
              className="home-create-button"
              onClick={openCreate}
            >
              <Plus size={18} />
              New project
            </button>
          </div>
          {visibleProjects.length > 0 ? (
            <div className="home-project-grid">
              {visibleProjects.map((project) => (
                <article className="home-project-card" key={project.id}>
                  <div className="home-project-card-title">
                    <button
                      onClick={() => onOpen(project.id)}
                      className="home-project-title"
                    >
                      {project.title}
                    </button>
                    <button
                      className={`home-star-button ${project.starred ? "is-starred" : ""}`}
                      title={
                        project.starred
                          ? "Remove from starred"
                          : "Add to starred"
                      }
                      aria-label={`${project.starred ? "Unstar" : "Star"} ${project.title}`}
                      aria-pressed={!!project.starred}
                      onClick={() => onToggleStar(project.id)}
                    >
                      <Star size={18} />
                    </button>
                  </div>
                  <p className="home-updated">
                    {updatedLabel(project.updatedAt)}
                  </p>
                  <button
                    className="home-cover-button"
                    onClick={() => onOpen(project.id)}
                    aria-label={`Open ${project.title}`}
                  >
                    <ProjectCover cover={project.cover} title={project.title} />
                    <span className="home-cover-open">
                      Open screenplay <ArrowUpRight size={16} />
                    </span>
                  </button>
                  <div className="home-card-footer">
                    <span>
                      <FileText size={13} />
                      Screenplay
                    </span>
                    <span className="home-card-private">Private</span>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="home-empty-state">
              <div className="home-empty-icon">
                {query ? (
                  <Search size={26} />
                ) : view === "starred" ? (
                  <Star size={26} />
                ) : (
                  <Clapperboard size={28} />
                )}
              </div>
              <h2>
                {query
                  ? "No matching stories"
                  : view === "starred"
                    ? "Keep your favorites close"
                    : "Your next story starts here"}
              </h2>
              <p>
                {query
                  ? `No projects found for “${query}”. Try another title.`
                  : view === "starred"
                    ? "Click the star on a project to find it here."
                    : "Create a project and make room for your ideas."}
              </p>
              {!query && view !== "starred" && (
                <button className="home-create-button" onClick={openCreate}>
                  <Plus size={18} />
                  Create your first project
                </button>
              )}
              {query && (
                <button
                  className="home-clear-button"
                  onClick={() => setQuery("")}
                >
                  Clear search
                </button>
              )}
            </div>
          )}
          <div className="home-workspace-note">
            <span className="home-status-dot" />
            All changes are saved automatically.
          </div>
        </section>
      </main>

      {creating && (
        <div
          className="home-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeCreate();
          }}
        >
          <form
            ref={modalRef}
            className="home-create-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-project-heading"
            onSubmit={submitCreate}
          >
            <button
              type="button"
              className="home-modal-close"
              aria-label="Close new project"
              onClick={closeCreate}
            >
              <X size={20} />
            </button>
            <div className="home-modal-icon">
              <FileText size={23} />
            </div>
            <h2 id="new-project-heading">A new story.</h2>
            <p>Give your screenplay a name. You can change it anytime.</p>
            <label htmlFor="new-project-title">Project title</label>
            <input
              ref={titleRef}
              id="new-project-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={100}
              placeholder="Untitled screenplay"
              required
              autoComplete="off"
            />
            <div className="home-modal-actions">
              <button
                className="home-clear-button"
                type="button"
                onClick={closeCreate}
              >
                Cancel
              </button>
              <button
                className="home-create-button"
                type="submit"
                disabled={!title.trim()}
              >
                Create project
                <ArrowUpRight size={17} />
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
