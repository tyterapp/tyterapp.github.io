import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { MessageSquare } from "lucide-react";
import ScreenplayEditor from "./ScreenplayEditor.jsx";
import MobileSheet from "./MobileSheet.jsx";
import DocumentSearch from "./DocumentSearch.jsx";
import StatisticsPanel from "./StatisticsPanel.jsx";
import { CommentsPanel } from "./EditorPanels.jsx";
import { cleanNotes } from "./notes.js";
import { cleanCommentOptions } from "./comment-options.js";
import { t } from "./i18n.js";

export default forwardRef(function NotesWorkspace(
  {
    document,
    scope,
    editorRef,
    mobile,
    onChange,
    onClose,
    onCreateComponent,
    onEditComponent,
    onCreateProp,
    onEditProp,
  },
  ref,
) {
  const initial = useRef(null);
  if (!initial.current) initial.current = cleanNotes(null);
  const notes = document.notes
    ? { ...document.notes, comments: document.notes.comments || [] }
    : initial.current;
  const latest = useRef(notes);
  latest.current = notes;
  const [panel, setPanel] = useState(null),
    [query, setQuery] = useState(""),
    [index, setIndex] = useState(0),
    [source, setSource] = useState(null),
    [active, setActive] = useState(null);
  useImperativeHandle(ref, () => ({ openTool: (kind) => setPanel(kind) }), []);
  const update = (patch) => onChange({ ...latest.current, ...patch });
  const matches = [];
  for (const block of notes.content.content) {
    const text = (block.content || [])
      .map((node) => node.text || "\n")
      .join("");
    if (!query.trim()) continue;
    const lower = text.toLocaleLowerCase(),
      needle = query.toLocaleLowerCase();
    for (
      let at = lower.indexOf(needle);
      at >= 0;
      at = lower.indexOf(needle, at + needle.length)
    )
      matches.push({
        blockId: block.attrs.blockId,
        at,
        length: needle.length,
        text,
        format: "plain",
      });
  }
  const close = () => {
    setPanel(null);
    setSource(null);
    setActive(null);
  };
  useEffect(() => {
    if (!panel) return;
    const escape = (event) => {
      if (event.key === "Escape") close();
    };
    window.document.addEventListener("keydown", escape);
    return () => window.document.removeEventListener("keydown", escape);
  }, [panel]);
  const comments = (
    <CommentsPanel
      comments={notes.comments}
      content={notes.content}
      quote={source}
      activeId={active}
      onClose={close}
      onClearQuote={() => setSource(null)}
      onFilterChange={() => setActive(null)}
      onAdd={(text, options) => {
        const id = crypto.randomUUID(),
          target = editorRef.current?.addComment(id, source);
        onChange({
          ...latest.current,
          content: editorRef.current?.getJSON() || latest.current.content,
          comments: [
            ...latest.current.comments,
            {
              id,
              text,
              quote: source?.text || "",
              blockId: target?.blockId || source?.blockId || null,
              createdAt: new Date().toISOString(),
              ...cleanCommentOptions(options),
            },
          ],
        });
        setSource(null);
        setActive(id);
      }}
      onToggle={(comment) =>
        update({
          comments: latest.current.comments.map((item) =>
            item.id === comment.id
              ? {
                  ...item,
                  resolved: !item.resolved,
                  status: item.resolved ? "open" : "resolved",
                }
              : item,
          ),
        })
      }
      onUpdate={(id, changes) =>
        update({
          comments: latest.current.comments.map((item) =>
            item.id === id
              ? {
                  ...item,
                  ...changes,
                  ...cleanCommentOptions({ ...item, ...changes }),
                }
              : item,
          ),
        })
      }
      onFocus={(comment) => {
        setActive(comment.id);
        editorRef.current?.focusComment(comment.id, comment.blockId);
      }}
    />
  );
  const tools =
    panel === "comments" ? (
      comments
    ) : panel === "statistics" ? (
      <StatisticsPanel
        document={{
          ...document,
          content: notes.content,
          comments: notes.comments,
        }}
        onClose={close}
        onCharacter={() => {}}
      />
    ) : (
      <DocumentSearch
        hideFormat
        matches={matches}
        query={query}
        format="all"
        onFormat={() => {}}
        index={index}
        onQuery={(value) => {
          setQuery(value);
          setIndex(0);
        }}
        onSelect={(value) => setIndex(value)}
        onClose={close}
      />
    );
  return (
    <>
      <div className="notes-heading">
        <button type="button" className="quiet-button" onClick={onClose}>
          {t("Вернуться к сценарию")}
        </button>
        <span>
          {t("Заметки")} · {document.title}
        </span>
        <button
          type="button"
          className="icon-button"
          aria-label={t("Комментарии к заметкам")}
          onClick={() => setPanel("comments")}
        >
          <MessageSquare size={18} />
        </button>
      </div>
      <ScreenplayEditor
        key={scope}
        ref={editorRef}
        documentId={`${scope}::notes`}
        content={notes.content}
        plainOnly
        continuous
        minimal
        autoFocus={!mobile && !panel}
        comments={notes.comments}
        activeComment={active}
        fontSize={13.5}
        fontFamily="inter"
        components={document.components}
        props={document.props}
        showLineHighlight={false}
        spellcheck={document.settings.spellcheck}
        searchQuery={panel === "search" ? query : ""}
        searchIndex={index}
        searchCardIndex={index}
        selectionToolbarDisabled={!!panel}
        onChange={(content, anchors) =>
          update({
            content,
            comments: latest.current.comments.map((comment) => ({
              ...comment,
              anchor: anchors?.[comment.id] ?? comment.anchor,
            })),
          })
        }
        onComments={(value) => {
          setSource(value?.text ? value : null);
          setActive(value?.commentId || null);
          setPanel("comments");
        }}
        onCommentFromSelection={(value) => {
          setSource(value);
          setPanel("comments");
        }}
        onCreateComponent={onCreateComponent}
        onEditComponent={onEditComponent}
        onCreateProp={onCreateProp}
        onEditProp={onEditProp}
      />
      {panel &&
        (mobile ? (
          <MobileSheet mobile open label={t("Заметки")} onClose={close}>
            {tools}
          </MobileSheet>
        ) : (
          createPortal(
            <div className="notes-tool-panel">{tools}</div>,
            window.document.body,
          )
        ))}
    </>
  );
});
