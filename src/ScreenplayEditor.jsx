import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { t, useLanguage } from "./i18n.js";
import EditorContextMenu from "./EditorContextMenu.jsx";
import ComponentLinkHover from "./ComponentLinkHover.jsx";
import { TextLink } from "./TextLink.js";
import ComponentPicker from "./ComponentPicker.jsx";
import { EditorContent, useEditor } from "@tiptap/react";
import { Extension, Mark, Node, mergeAttributes } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { PlainNotes } from "./plain-notes.js";
import { ArrowTypography } from "./ArrowTypography.js";
import { TelegraphMark } from "./TelegraphMark.js";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { isHistoryTransaction, closeHistory } from "@tiptap/pm/history";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import SelectionToolbar from "./SelectionToolbar.jsx";
import Suggestions from "./Suggestions.jsx";
import { quoteDiff } from "./comment-review.js";
import { getWordCount } from "./data.js";
import { committedCharacters, writtenCharacters } from "./writing-activity.js";
import { useScreenplayPagination } from "./pagination.js";
import { canonicalScreenplayPages } from "./canonical-pages.js";
import { preparePageBurn } from "./burning-page.js";
import {
  pageVersionChanges,
  pageVersionLayoutStep,
  pageVersionStateStep,
} from "./page-version-history.js";
import { pageVersionBreaks } from "./page-versions.js";
import { ScriptRevisionMark } from "./screenplay-revisions.js";
import { revisionAttributes, revisionFromElement } from "./script-revisions.js";
import { useMobileRevisionPages } from "./mobile-revision-pages.js";
import {
  createDictationTarget,
  dictationPreviewPlugin,
  dictationPreviewKey,
} from "./screenplay-dictation.js";
import { propRanges } from "./prop-matches.js";
import { matchesSearchFormat, textSearchRanges } from "./document-search.js";
import { scrollToText } from "./editor-scroll.js";
import { characterThumbnailDecorations } from "./character-thumbnails.js";
import { cleanComponentAliases } from "./component-names.js";
import {
  componentUrl,
  activeComponentUrl,
  selectedComponentId,
} from "./component-url.js";
import { SCENE_VARIANTS, sceneLetter } from "./scene-variants.js";
import { hasShotSettings, shotSettings } from "./shot-info.js";
import { shotAspectRatio } from "./shot-image.js";
import { storyboardFrames, playSlides } from "./storyboard-data.js";
import { SelectMenu } from "./AppSelect.jsx";
import { commentColor, commentStyle } from "./comment-options.js";
import {
  copiedScreenplaySlice,
  pastedScreenplaySlice,
  pasteIntoScreenplayScene,
} from "./screenplay-clipboard.js";
import {
  captureCaret,
  selectionAtCaret,
  readCaret,
  writeCaret,
} from "./editor-caret.js";
import {
  componentLinksPlugin,
  componentLinksKey,
  SKIP_COMPONENT_LINKS,
} from "./component-links.js";
import "./screenplay-editor.css";
const FORMATS = [
  "scene",
  "action",
  "character",
  "speech",
  "parenthetical",
  "transition",
  "plain",
];
const NEXT_FORMAT = {
  scene: "action",
  action: "action",
  character: "speech",
  speech: "character",
  parenthetical: "speech",
  transition: "scene",
  plain: "plain",
};
const makeId = () =>
  globalThis.crypto?.randomUUID?.() ||
  `block-${Date.now()}-${Math.random().toString(36).slice(2)}`;
function paragraphAt(selection) {
  const resolved = selection.$head || selection.$from;
  for (let depth = resolved.depth; depth > 0; depth -= 1) {
    if (resolved.node(depth).type.name === "paragraph") {
      return {
        node: resolved.node(depth),
        pos: resolved.before(depth),
      };
    }
  }
  return null;
}
function selectionInfo(editor, wholeParagraph = false) {
  if (!editor) return null;
  const { selection, doc } = editor.state;
  const block = paragraphAt(selection);
  let { from, to } = selection;
  if (wholeParagraph && selection.empty && block) {
    from = block.pos + 1;
    to = from + block.node.content.size;
  }
  return {
    format: block?.node.attrs.format || "action",
    blockId: block?.node.attrs.blockId || null,
    text:
      from === to
        ? block?.node.textContent || ""
        : doc.textBetween(from, to, "\n"),
    from,
    to,
  };
}
function annotationTarget(editor, source) {
  if (!source) return selectionInfo(editor, true);
  const { doc } = editor.state;
  const quote = typeof source.text === "string" ? source.text : source.quote;
  if (typeof quote !== "string" || !quote.length) return null;
  let block = null;
  if (source.blockId) {
    doc.descendants((node, pos) => {
      if (
        node.type.name === "paragraph" &&
        node.attrs.blockId === source.blockId
      )
        block = {
          node,
          pos,
        };
    });
    // An annotation belongs to its original paragraph, even if another paragraph
    // happens to contain the same words after the source has been removed.
    if (!block) return null;
  }
  const { from, to } = source;
  const validRange =
    Number.isInteger(from) &&
    Number.isInteger(to) &&
    from >= 1 &&
    to > from &&
    to <= doc.content.size;
  const touchesOriginalBlock =
    !block ||
    (from < block.pos + block.node.nodeSize - 1 && to > block.pos + 1);
  if (
    validRange &&
    touchesOriginalBlock &&
    doc.textBetween(from, to, "\n") === quote
  ) {
    return {
      format: block?.node.attrs.format || source.format || "action",
      blockId: block?.node.attrs.blockId || null,
      text: quote,
      from,
      to,
    };
  }
  if (!block) return null;

  // Map the original quote back through rich-text marks and explicit line breaks.
  // Numeric positions may be stale when text was inserted while a panel was open.
  let text = "";
  const positions = [];
  block.node.descendants((node, offset) => {
    if (!node.isText && node.type.name !== "hardBreak") return;
    const value = node.isText ? node.text : "\n";
    for (let index = 0; index < value.length; index += 1) {
      text += value[index];
      positions.push(block.pos + 1 + offset + index);
    }
  });
  const start = text.indexOf(quote);
  if (start < 0 || text.indexOf(quote, start + 1) !== -1) return null;
  return {
    format: block.node.attrs.format || "action",
    blockId: block.node.attrs.blockId,
    text: quote,
    from: positions[start],
    to: positions[start + quote.length - 1] + 1,
  };
}
function removeAnnotation(editor, type, id, preserveHistory = false) {
  if (!editor) return false;
  const transaction = editor.state.tr;
  editor.state.doc.descendants((node, pos) => {
    if (!node.isText) return;
    node.marks
      .filter((mark) => mark.type.name === type && mark.attrs.id === id)
      .forEach((mark) => {
        transaction.removeMark(pos, pos + node.nodeSize, mark);
      });
  });
  transaction.removeStoredMark(editor.schema.marks[type]);
  if (type === "entity") transaction.setMeta(SKIP_COMPONENT_LINKS, true);
  if (preserveHistory) transaction.setMeta("addToHistory", false);
  if (transaction.docChanged || transaction.storedMarksSet)
    editor.view.dispatch(transaction);
  return transaction.docChanged;
}
function normalizeContent(content) {
  const source = Array.isArray(content)
    ? {
        type: "doc",
        content,
      }
    : content;
  if (!source || typeof source !== "object") {
    return {
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: {
            format: "scene",
            blockId: makeId(),
          },
        },
      ],
    };
  }
  const used = new Set();
  const paragraphs = (source.content || []).map((block) => {
    let blockId = block.attrs?.blockId;
    if (!blockId || used.has(blockId)) blockId = makeId();
    used.add(blockId);
    return {
      ...block,
      type: "paragraph",
      ...(Array.isArray(block.content)
        ? {
            content: block.content.flatMap((part) => {
              if (part.type !== "text" || !/[\r\n]/.test(part.text))
                return [part];
              return part.text.split(/\r\n?|\n/).flatMap((text, index) => [
                ...(index
                  ? [
                      {
                        type: "hardBreak",
                        ...(part.marks?.length ? { marks: part.marks } : {}),
                      },
                    ]
                  : []),
                ...(text ? [{ ...part, text }] : []),
              ]);
            }),
          }
        : {}),
      attrs: {
        ...block.attrs,
        format: FORMATS.includes(block.attrs?.format)
          ? block.attrs.format
          : "action",
        blockId,
      },
    };
  });
  return {
    type: "doc",
    content: paragraphs.length
      ? paragraphs
      : [
          {
            type: "paragraph",
            attrs: {
              format: "scene",
              blockId: makeId(),
            },
          },
        ],
  };
}
const ScreenplayParagraph = Node.create({
  name: "paragraph",
  group: "block",
  content: "inline*",
  addAttributes() {
    return {
      format: {
        default: "action",
        parseHTML: (element) =>
          FORMATS.includes(element.getAttribute("data-format"))
            ? element.getAttribute("data-format")
            : "action",
        renderHTML: (attributes) => ({
          "data-format": attributes.format,
        }),
      },
      blockId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-block-id"),
        renderHTML: (attributes) => ({
          "data-block-id": attributes.blockId,
        }),
      },
      sceneVariant: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-scene-variant"),
        renderHTML: (attributes) =>
          attributes.format === "scene"
            ? {
                "data-scene-variant": SCENE_VARIANTS.includes(
                  attributes.sceneVariant,
                )
                  ? attributes.sceneVariant
                  : "A",
              }
            : {},
      },
      scriptRevision: {
        default: null,
        parseHTML: revisionFromElement,
        renderHTML: (attributes) =>
          revisionAttributes(attributes.scriptRevision),
      },
    };
  },
  parseHTML() {
    return [
      {
        tag: "p",
      },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "p",
      mergeAttributes(HTMLAttributes, {
        class: "screenplay-block",
      }),
      0,
    ];
  },
});
const CommentMark = Mark.create({
  name: "comment",
  inclusive: false,
  excludes: "",
  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-comment-id"),
        renderHTML: (attributes) => ({
          "data-comment-id": attributes.id,
        }),
      },
    };
  },
  parseHTML() {
    return [
      {
        tag: "span[data-comment-id]",
      },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        class: "script-comment",
      }),
      0,
    ];
  },
});
const EntityMark = Mark.create({
  name: "entity",
  inclusive: false,
  excludes: "",
  addAttributes() {
    return {
      automatic: {
        default: false,
        parseHTML: (element) =>
          element.getAttribute("data-entity-automatic") === "true",
        renderHTML: (attributes) =>
          attributes.automatic
            ? {
                "data-entity-automatic": "true",
              }
            : {},
      },
      id: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-entity-id"),
        renderHTML: (attributes) => ({
          "data-entity-id": attributes.id,
        }),
      },
      color: {
        default: "#9b6ee7",
        parseHTML: (element) =>
          element.getAttribute("data-entity-color") || "#9b6ee7",
        renderHTML: (attributes) => {
          const color = /^#[0-9a-f]{3,8}$/i.test(attributes.color || "")
            ? attributes.color
            : "#9b6ee7";
          return {
            "data-entity-color": color,
            style: `--entity-color: ${color}`,
          };
        },
      },
    };
  },
  parseHTML() {
    return [
      {
        tag: "span[data-entity-id]",
      },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        class: "script-entity",
      }),
      0,
    ];
  },
});
const ScreenplayBehavior = Extension.create({
  name: "screenplayBehavior",
  priority: 1000,
  addOptions() {
    return {
      onComments: () => {},
      minimal: false,
    };
  },
  addCommands() {
    return {
      setScreenplayFormat:
        (format) =>
        ({ tr, dispatch }) => {
          if (!FORMATS.includes(format)) return false;
          const block = paragraphAt(tr.selection);
          if (!block) return false;
          if (dispatch)
            tr.setNodeMarkup(block.pos, undefined, {
              ...block.node.attrs,
              format,
              sceneVariant:
                format === "scene" && block.node.attrs.format === "scene"
                  ? block.node.attrs.sceneVariant
                  : null,
            });
          return true;
        },
    };
  },
  addKeyboardShortcuts() {
    const shortcuts = {};
    const cycleFormat = (direction) => {
      const format =
        paragraphAt(this.editor.state.selection)?.node.attrs.format || "action";
      return this.editor.commands.setScreenplayFormat(
        FORMATS[
          (FORMATS.indexOf(format) + direction + FORMATS.length) %
            FORMATS.length
        ],
      );
    };
    FORMATS.forEach((format, index) => {
      shortcuts[`Mod-${index + 1}`] = () =>
        this.editor.commands.setScreenplayFormat(format);
    });
    shortcuts["Ctrl-Alt-ArrowRight"] = () => cycleFormat(1);
    shortcuts["Ctrl-Alt-ArrowLeft"] = () => cycleFormat(-1);
    shortcuts.Enter = () => {
      const format =
        paragraphAt(this.editor.state.selection)?.node.attrs.format || "action";
      return this.editor
        .chain()
        .splitBlock({
          keepMarks: false,
        })
        .setScreenplayFormat(NEXT_FORMAT[format] || "action")
        .command(({ tr }) => {
          tr.setStoredMarks([]);
          return true;
        })
        .run();
    };
    shortcuts.Tab = () => {
      if (this.options.minimal) return false;
      return cycleFormat(1);
    };
    shortcuts["Shift-Tab"] = () => {
      if (this.options.minimal) return false;
      return cycleFormat(-1);
    };
    return shortcuts;
  },
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("screenplayBlockIds"),
        appendTransaction(transactions, oldState, newState) {
          if (!transactions.some((transaction) => transaction.docChanged))
            return null;
          const seen = new Set();
          const transaction = newState.tr;
          newState.doc.descendants((node, pos) => {
            if (node.type.name !== "paragraph") return;
            const { blockId } = node.attrs;
            if (!blockId || seen.has(blockId)) {
              const id = makeId();
              transaction.setNodeMarkup(pos, undefined, {
                ...node.attrs,
                blockId: id,
              });
              seen.add(id);
            } else seen.add(blockId);
          });
          return transaction.docChanged ? transaction : null;
        },
      }),
    ];
  },
});
const ScreenplayEditor = forwardRef(function ScreenplayEditor(
  {
    content,
    documentId,
    autoFocus = false,
    onChange,
    onWritingActivity,
    trackWritingActivity = false,
    continuous = false,
    plainOnly = false,
    onSelection,
    onComments,
    onCommentFromSelection,
    onCreateComponent,
    onPasteComponentUrl,
    onPasteImages,
    onEditComponent,
    onCreateProp,
    onEditProp,
    onEditAnnotations,
    outlineCards = [],
    onEditOutlineCard,
    onSceneVariant,
    sceneShots = null,
    onEditShot,
    activeShot = null,
    props = [],
    activeProp = null,
    selectionToolbarDisabled = false,
    suggestionsDisabled = selectionToolbarDisabled,
    onReady,
    showLineHighlight = true,
    spellcheck = false,
    showComponents = false,
    componentHints = true,
    activeEntity = null,
    searchQuery = "",
    searchFormat = "all",
    searchIndex = 0,
    searchCardIndex = null,
    minimal = false,
    components = [],
    comments = [],
    activeComment = null,
    onPageCount,
    revision = null,
    pageVersions = null,
    onRevisionPages,
    fontSize = 12,
    documentZoom = 100,
    fontFamily = "courier",
  },
  ref,
) {
  const language = useLanguage();
  const enabledSuggestions = useMemo(
    () => components.filter((component) => component.enabled !== false),
    [components],
  );
  const componentScenes = useMemo(
    () =>
      JSON.stringify(
        (content?.content || [])
          .filter((block) => block.attrs?.format === "scene")
          .map((block) => [block.attrs.blockId, sceneLetter(block)]),
      ),
    [content],
  );
  const characterThumbnails = useMemo(
    () =>
      new Map(
        components
          .filter(
            (component) => component.enabled !== false && component.thumbnail,
          )
          .map((component) => [
            component.id,
            { thumbnail: component.thumbnail, key: makeId() },
          ]),
      ),
    [components],
  );
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const [componentPickerOpen, setComponentPickerOpen] = useState(false);
  const [sceneVariantMenu, setSceneVariantMenu] = useState(null);
  const [caretReady, setCaretReady] = useState(false);
  const caretReadyRef = useRef(false);
  const focusPending = useRef(true);
  const rememberedCaret = useRef(null);
  const rememberCaret = (activeEditor) => {
    if (!caretReadyRef.current) return;
    const caret = captureCaret(activeEditor.state);
    const serialized = JSON.stringify(caret);
    if (serialized === rememberedCaret.current) return;
    rememberedCaret.current = serialized;
    writeCaret(documentId, caret);
  };
  const propsRef = useRef({
    onChange,
    onWritingActivity,
    trackWritingActivity,
    onSelection,
    onComments,
    onReady,
    onEditComponent,
    showLineHighlight,
    showComponents,
    activeEntity,
    searchQuery,
    searchFormat,
    searchIndex,
    searchCardIndex,
  });
  propsRef.current = {
    continuous,
    onPasteComponentUrl,
    components,
    characterThumbnails,
    outlineCards,
    onEditOutlineCard,
    onSceneVariant,
    sceneShots,
    onEditShot,
    activeShot,
    onOpenSceneVariants: setSceneVariantMenu,
    props,
    activeProp,
    onEditProp,
    onEditAnnotations,
    onChange,
    onWritingActivity,
    trackWritingActivity,
    onSelection,
    onComments,
    onReady,
    onEditComponent,
    showLineHighlight,
    showComponents,
    activeEntity,
    searchQuery,
    searchFormat,
    searchIndex,
    searchCardIndex,
    comments,
    activeComment,
    revision,
    pageVersions,
    onRevisionPages,
  };
  const lastEmitted = useRef(null);
  const writingComposition = useRef({});
  const lastReceived = useRef(JSON.stringify(content));
  const searchScrollFrame = useRef(null);
  const navigationFlash = useRef(null);
  const navigationFlashTimer = useRef(null);
  const shotVisuals = useRef({ entries: new Map(), sequence: 0 });
  const initialContent = useRef(null);
  if (!initialContent.current)
    initialContent.current = normalizeContent(content);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        ...(plainOnly
          ? { bold: false, italic: false, underline: false, strike: false }
          : {}),
        paragraph: false,
        heading: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        listKeymap: false,
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
        code: false,
        link: false,
        trailingNode: false,
      }),
      ScreenplayParagraph,
      ArrowTypography,
      TelegraphMark,
      TextLink,
      CommentMark,
      EntityMark,
      ScriptRevisionMark.configure({
        getRevision: () => propsRef.current.revision,
      }),
      ScreenplayBehavior.configure({
        onComments: (selection) => propsRef.current.onComments?.(selection),
        minimal,
      }),
      ...(plainOnly ? [PlainNotes] : []),
    ],
    content: initialContent.current,
    editorProps: {
      handleDOMEvents: {
        mousedown(view, event) {
          if (
            event.button === 1 &&
            event.target.closest?.("a.script-text-link")
          ) {
            event.preventDefault();
            view.focus();
            return true;
          }
          return false;
        },
        auxclick(view, event) {
          if (
            event.target.closest?.("a.script-text-link") &&
            view.dom.contains(event.target)
          ) {
            event.preventDefault();
            return true;
          }
          return false;
        },
      },
      transformCopied: copiedScreenplaySlice,
      transformPasted: (slice, view, plain) =>
        pastedScreenplaySlice(slice, propsRef.current.components, view, plain),
      handlePaste: (view, event, slice) => {
        if (plainOnly) return false;
        const url = componentUrl(event.clipboardData?.getData("text/plain"));
        if (
          url &&
          !view.state.selection.empty &&
          propsRef.current.onPasteComponentUrl
        ) {
          const source = selectionInfo({ state: view.state });
          if (source.text.trim()) {
            event.preventDefault();
            propsRef.current.onPasteComponentUrl(
              {
                ...source,
                entityId: selectedComponentId(
                  view.state.doc,
                  source.from,
                  source.to,
                ),
              },
              url,
            );
            return true;
          }
        }
        return pasteIntoScreenplayScene(view, slice);
      },
      attributes: {
        class: "screenplay-editor",
        role: "textbox",
        "aria-label": plainOnly ? t("Редактор заметок") : "Screenplay editor",
        "aria-multiline": "true",
        spellcheck: String(spellcheck),
        lang: language,
      },
      handleClick(view, pos, event) {
        const textLink = event.target.closest?.("a.script-text-link");
        if (textLink && view.dom.contains(textLink)) {
          // Text remains editable; only the separate link icon navigates.
          event.preventDefault();
          view.focus();
        }
        if ((event.ctrlKey || event.metaKey) && event.button === 0) {
          const prop = event.target.closest?.("[data-prop-id]");
          const component =
            event.target.closest?.("[data-entity-id]") ||
            prop?.querySelector("[data-entity-id]");
          if (
            prop &&
            component &&
            propsRef.current.onEditAnnotations &&
            propsRef.current.components.some(
              (c) =>
                c.id === component.getAttribute("data-entity-id") &&
                c.enabled !== false,
            )
          ) {
            event.preventDefault();
            propsRef.current.onEditAnnotations?.({
              componentId: component.getAttribute("data-entity-id"),
              propId: prop.getAttribute("data-prop-id"),
            });
            return true;
          }
          if (prop && view.dom.contains(prop) && propsRef.current.onEditProp) {
            event.preventDefault();
            propsRef.current.onEditProp?.(prop.getAttribute("data-prop-id"));
            return true;
          }
          const entity = event.target.closest?.("[data-entity-id]");
          if (
            entity &&
            view.dom.contains(entity) &&
            propsRef.current.components.some(
              (c) =>
                c.id === entity.getAttribute("data-entity-id") &&
                c.enabled !== false,
            )
          ) {
            event.preventDefault();
            propsRef.current.onEditComponent?.(
              entity.getAttribute("data-entity-id"),
            );
            return true;
          }
        }
        let comment = event.target.closest?.("[data-comment-id]");
        while (comment && view.dom.contains(comment)) {
          const commentId = comment.getAttribute("data-comment-id");
          const record = propsRef.current.comments?.find(
            (item) => item.id === commentId,
          );
          if (record && !record.resolved) {
            const block = paragraphAt(view.state.selection);
            propsRef.current.onComments?.({
              commentId,
              blockId: block?.node.attrs.blockId || null,
              text: comment.textContent || "",
              from: view.state.selection.from,
              to: view.state.selection.to,
              format: block?.node.attrs.format || "action",
            });
            break;
          }
          comment = comment.parentElement?.closest("[data-comment-id]");
        }
        return false;
      },
      decorations(state) {
        const decorations = plainOnly
          ? []
          : characterThumbnailDecorations(
              state.doc,
              propsRef.current.characterThumbnails,
            );
        const visibleShots = new Set();
        if (minimal)
          for (const range of propRanges(
            state.doc,
            propsRef.current.props || [],
          ))
            decorations.push(
              Decoration.inline(range.from, range.to, {
                class: `script-prop${range.prop.id === propsRef.current.activeProp ? " script-prop-active" : ""}`,
                "data-prop-id": range.prop.id,
              }),
            );
        const current = paragraphAt(state.selection);
        const query = propsRef.current.searchQuery.trim().toLocaleLowerCase();
        const entityId =
          typeof propsRef.current.activeEntity === "object"
            ? propsRef.current.activeEntity?.id
            : propsRef.current.activeEntity;
        let sceneNumber = 0;
        let matchIndex = 0;
        const documentEmpty = !state.doc.textContent.trim();
        const commentById = new Map(
          (propsRef.current.comments || []).map((c) => [c.id, c]),
        );
        const review = commentById.get(propsRef.current.activeComment);
        const reviewRanges = [];
        const componentUrls = new Map(
          propsRef.current.components.flatMap((component) => {
            const url = activeComponentUrl(component);
            return url ? [[component.id, url]] : [];
          }),
        );
        state.doc.descendants((node, pos) => {
          if (node.isText) {
            const url = node.marks
              .filter((mark) => mark.type.name === "entity")
              .map((mark) => componentUrls.get(mark.attrs.id))
              .find(Boolean);
            if (url)
              decorations.push(
                Decoration.inline(pos, pos + node.nodeSize, {
                  class: "script-component-url",
                }),
              );
          }
          if (
            node.isText &&
            node.marks.some(
              (mark) =>
                mark.type.name === "entity" &&
                propsRef.current.components.some(
                  (c) => c.id === mark.attrs.id && c.enabled === false,
                ),
            )
          )
            decorations.push(
              Decoration.inline(pos, pos + node.nodeSize, {
                class: "script-entity-disabled",
              }),
            );
          if (minimal && node.isText) {
            const marks = node.marks.filter(
              (mark) => mark.type.name === "comment",
            );
            const selected =
              review && marks.some((mark) => mark.attrs.id === review.id);
            const openComments = marks
              .map((mark) => commentById.get(mark.attrs.id))
              .filter((comment) => comment && !comment.resolved);
            if (
              marks.some((mark) => {
                const comment = commentById.get(mark.attrs.id);
                return comment && !comment.resolved;
              })
            ) {
              const colorComment =
                selected && !review.resolved ? review : openComments[0];
              const style = Object.entries(commentStyle(colorComment))
                .map(([key, value]) => `${key}:${value}`)
                .join(";");
              decorations.push(
                Decoration.inline(pos, pos + node.nodeSize, {
                  class: `comment-open${selected && !review.resolved ? " comment-open-selected" : ""}`,
                  "data-comment-color": commentColor(colorComment).value,
                  style,
                }),
              );
            }
            if (review?.resolved && selected) {
              decorations.push(
                Decoration.inline(pos, pos + node.nodeSize, {
                  class: "comment-resolved-selected",
                }),
              );
              reviewRanges.push({
                from: pos,
                to: pos + node.nodeSize,
                text: node.text,
              });
            }
          }
          if (node.type.name === "paragraph") {
            const attrs = {};
            if (node.attrs.blockId === navigationFlash.current) {
              attrs["data-outline-navigation-target"] = "true";
              if (node.content.size)
                decorations.push(
                  Decoration.inline(pos + 1, pos + node.content.size + 1, {
                    class: "outline-navigation-flash",
                  }),
                );
            }
            if (node.attrs.format === "scene") {
              const number = ++sceneNumber;
              attrs["data-scene-number"] = String(number);
              const shot = shotSettings(
                { sceneShots: propsRef.current.sceneShots },
                node.attrs.blockId,
                sceneLetter(node),
              );
              const shotScope = `${node.attrs.blockId}:${sceneLetter(node)}`;
              visibleShots.add(shotScope);
              let visual = shotVisuals.current.entries.get(shotScope);
              // Keep decoration keys small: never copy image data into a key.
              if (
                !visual ||
                visual.image !== shot.image ||
                visual.frames !== shot.frames ||
                visual.loop !== shot.playbackLoop ||
                visual.aspectRatio !== shot.aspectRatio
              ) {
                visual = {
                  image: shot.image,
                  frames: shot.frames,
                  loop: shot.playbackLoop,
                  aspectRatio: shot.aspectRatio,
                  key: ++shotVisuals.current.sequence,
                };
                shotVisuals.current.entries.set(shotScope, visual);
              }
              if (minimal)
                decorations.push(
                  Decoration.widget(
                    pos + 1,
                    () => {
                      const button = document.createElement("button");
                      button.type = "button";
                      button.className = `scene-shot-button${shot.image ? " has-thumbnail" : ""}`;
                      button.contentEditable = "false";
                      const configured = hasShotSettings(shot);
                      button.dataset.configured = String(configured);
                      button.setAttribute(
                        "aria-label",
                        t("Информация о кадре сцены {0}", number),
                      );
                      button.setAttribute(
                        "data-tooltip",
                        t("Информация о кадре"),
                      );
                      button.setAttribute(
                        "aria-expanded",
                        String(
                          propsRef.current.activeShot === node.attrs.blockId,
                        ),
                      );
                      if (shot.image) {
                        const frame = document.createElement("span");
                        frame.className = "scene-shot-thumbnail";
                        const ratio = shotAspectRatio(shot.aspectRatio);
                        if (ratio) {
                          frame.classList.add("is-cropped");
                          frame.style.setProperty(
                            "--shot-thumbnail-ratio",
                            ratio,
                          );
                        }
                        const image = document.createElement("img");
                        image.src = shot.image;
                        image.alt = "";
                        image.draggable = false;
                        frame.setAttribute("aria-hidden", "true");
                        let stop;
                        button.addEventListener("mouseenter", () => {
                          stop?.();
                          stop = playSlides(
                            shot,
                            (slide) => {
                              image.src = slide.image;
                            },
                            () => button.isConnected,
                          );
                        });
                        button.stopStorySlides = () => {
                          stop?.();
                          stop = null;
                          image.src = shot.image;
                        };
                        button.addEventListener(
                          "mouseleave",
                          button.stopStorySlides,
                        );
                        frame.append(image);
                        button.append(frame);
                      } else {
                        const icon = document.createElement("span");
                        icon.className = "scene-format-icon";
                        icon.setAttribute("aria-hidden", "true");
                        button.append(icon);
                      }
                      const grip = document.createElement("span");
                      grip.className = "scene-shot-grip";
                      grip.setAttribute("aria-hidden", "true");
                      grip.innerHTML =
                        '<svg width="16" height="24" viewBox="0 0 16 24" fill="currentColor"><circle cx="5" cy="5" r="1.5"/><circle cx="11" cy="5" r="1.5"/><circle cx="5" cy="12" r="1.5"/><circle cx="11" cy="12" r="1.5"/><circle cx="5" cy="19" r="1.5"/><circle cx="11" cy="19" r="1.5"/></svg>';
                      button.append(grip);
                      button.addEventListener("mousedown", (event) =>
                        event.preventDefault(),
                      );
                      button.addEventListener("click", (event) => {
                        event.preventDefault();
                        propsRef.current.onEditShot?.(node.attrs.blockId);
                      });
                      return button;
                    },
                    {
                      key: `shot-${shotScope}-${number}-${visual.key}-${hasShotSettings(shot)}-${propsRef.current.activeShot === node.attrs.blockId}-${language}`,
                      destroy: (node) => node.stopStorySlides?.(),
                      side: -1,
                      stopEvent: () => true,
                    },
                  ),
                  Decoration.widget(
                    pos + 1,
                    () => {
                      const gutter = document.createElement("span");
                      gutter.className = "scene-gutter";
                      gutter.contentEditable = "false";
                      const mobile = propsRef.current.continuous;
                      const label = document.createElement(
                        mobile ? "span" : "button",
                      );
                      label.className = mobile
                        ? "scene-number"
                        : "scene-number scene-drag-handle";
                      label.setAttribute("data-number", String(number));
                      if (mobile) label.setAttribute("aria-hidden", "true");
                      else {
                        label.type = "button";
                        label.setAttribute(
                          "aria-label",
                          t("Переместить сцену {0}", number),
                        );
                        label.setAttribute(
                          "aria-description",
                          t("Перетащите сцену или нажмите Alt + ↑ / ↓."),
                        );
                        label.setAttribute(
                          "data-tooltip",
                          t("Перетащите, чтобы переместить сцену"),
                        );
                        label.draggable = false;
                        label.innerHTML = `<span class="scene-drag-number" aria-hidden="true">${number}</span><svg width="14" height="18" viewBox="0 0 16 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="5" r="1.5"/><circle cx="11" cy="5" r="1.5"/><circle cx="5" cy="12" r="1.5"/><circle cx="11" cy="12" r="1.5"/><circle cx="5" cy="19" r="1.5"/><circle cx="11" cy="19" r="1.5"/></svg>`;
                      }
                      gutter.append(label);
                      const select = document.createElement("button");
                      select.type = "button";
                      select.className = "scene-variant-select";
                      select.contentEditable = "false";
                      select.setAttribute("role", "combobox");
                      select.setAttribute("aria-haspopup", "listbox");
                      select.setAttribute("aria-expanded", "false");
                      select.setAttribute(
                        "aria-label",
                        t("Вариант сцены {0}", number),
                      );
                      select.dataset.value = sceneLetter(node);
                      select.innerHTML = `<span>${sceneLetter(node)}</span><svg width="8" height="12" viewBox="5 6 14 12" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>`;
                      const openVariants = () =>
                        propsRef.current.onOpenSceneVariants?.({
                          anchor: select,
                          blockId: node.attrs.blockId,
                          number,
                          value: sceneLetter(node),
                        });
                      select.addEventListener("click", openVariants);
                      select.addEventListener("keydown", (event) => {
                        if (
                          event.key === "ArrowDown" ||
                          event.key === "ArrowUp"
                        ) {
                          event.preventDefault();
                          openVariants();
                        }
                      });
                      gutter.append(select);
                      return gutter;
                    },
                    {
                      key: `scene-${node.attrs.blockId}-${number}-${sceneLetter(node)}-${language}-${propsRef.current.continuous}`,
                      side: -1,
                      stopEvent: () => true,
                    },
                  ),
                );
            }
            if (propsRef.current.showLineHighlight && current?.pos === pos)
              attrs.class = "is-current-block";
            if (minimal && documentEmpty && pos === 0)
              attrs["data-placeholder"] = t("Начни писать свою историю...");
            else if (!minimal && !node.textContent)
              attrs["data-placeholder"] =
                node.attrs.format === "scene"
                  ? "INT. LOCATION — DAY"
                  : node.attrs.format === "character"
                    ? "CHARACTER"
                    : node.attrs.format === "parenthetical"
                      ? "(quietly)"
                      : "Write your story…";
            if (Object.keys(attrs).length)
              decorations.push(
                Decoration.node(pos, pos + node.nodeSize, attrs),
              );
          }
          if (
            node.type.name === "paragraph" &&
            query &&
            matchesSearchFormat(
              node.attrs.format,
              propsRef.current.searchFormat,
            )
          ) {
            const text = node.textBetween(0, node.content.size, "", "\n");
            for (const { at, length } of textSearchRanges(text, query)) {
              decorations.push(
                Decoration.inline(pos + 1 + at, pos + 1 + at + length, {
                  class: `script-search-result${matchIndex === propsRef.current.searchIndex ? " search-is-current" : ""}${matchIndex === propsRef.current.searchCardIndex ? " search-from-card" : ""}`,
                  "data-search-index": String(matchIndex),
                }),
              );
              matchIndex++;
            }
          }
          if (
            node.isText &&
            entityId &&
            node.marks.some(
              (mark) =>
                mark.type.name === "entity" && mark.attrs.id === entityId,
            )
          ) {
            decorations.push(
              Decoration.inline(pos, pos + node.nodeSize, {
                class: "entity-is-active",
              }),
            );
          }
        });
        for (const scope of shotVisuals.current.entries.keys())
          if (!visibleShots.has(scope))
            shotVisuals.current.entries.delete(scope);
        if (minimal && review?.resolved && review.quote) {
          const currentText = reviewRanges.map((range) => range.text).join("");
          let fallback = Number.isInteger(review.anchor)
            ? Math.max(1, Math.min(review.anchor, state.doc.content.size - 1))
            : 1;
          if (!Number.isInteger(review.anchor))
            state.doc.descendants((node, pos) => {
              if (node.attrs.blockId === review.blockId) fallback = pos + 1;
            });
          for (const [index, part] of quoteDiff(
            review.quote,
            currentText,
          ).entries()) {
            if (!part.deleted) continue;
            let offset = part.offset,
              position = reviewRanges.at(-1)?.to ?? fallback;
            for (const range of reviewRanges) {
              if (offset <= range.text.length) {
                position = range.from + offset;
                break;
              }
              offset -= range.text.length;
            }
            decorations.push(
              Decoration.widget(
                position,
                () => {
                  const deleted = document.createElement("span");
                  deleted.className = "comment-deleted-text";
                  deleted.textContent = part.text;
                  deleted.contentEditable = "false";
                  deleted.dataset.tooltip = t("Удалённый текст цитаты");
                  return deleted;
                },
                {
                  key: `deleted-${review.id}-${index}-${part.text}-${language}`,
                  side: -1,
                },
              ),
            );
          }
        }
        return DecorationSet.create(state.doc, decorations);
      },
    },
    onCreate({ editor: createdEditor }) {
      const caret = readCaret(documentId);
      if (caret)
        createdEditor.view.dispatch(
          createdEditor.state.tr.setSelection(
            selectionAtCaret(createdEditor.state.doc, caret),
          ),
        );
      caretReadyRef.current = true;
      rememberCaret(createdEditor);
      setCaretReady(true);
      propsRef.current.onReady?.(createdEditor);
      propsRef.current.onSelection?.(selectionInfo(createdEditor));
    },
    onTransaction({ editor: updatedEditor, transaction }) {
      const changes = pageVersionChanges(transaction);
      // Tiptap suppresses onUpdate when a resource-only step leaves the text equal.
      // Forward these steps explicitly, including their native undo/redo inverses.
      if (
        changes.some((step) => step.kind !== "pagination") &&
        transaction.before.eq(updatedEditor.state.doc)
      )
        propsRef.current.onChange?.(
          updatedEditor.getJSON(),
          undefined,
          undefined,
          transaction.mapping,
          changes,
          transaction,
        );
    },
    onUpdate({ editor: updatedEditor, transaction }) {
      rememberCaret(updatedEditor);
      const json = updatedEditor.getJSON();
      lastEmitted.current = JSON.stringify(json);
      const anchors = {};
      for (const comment of propsRef.current.comments || []) {
        let anchor = comment.anchor;
        if (!Number.isInteger(anchor))
          transaction.before.descendants((node, pos) => {
            if (
              anchor == null &&
              node.marks.some(
                (mark) =>
                  mark.type.name === "comment" && mark.attrs.id === comment.id,
              )
            )
              anchor = pos;
          });
        if (Number.isInteger(anchor))
          anchors[comment.id] = transaction.mapping.map(
            Math.min(anchor, transaction.before.content.size),
            -1,
          );
      }
      propsRef.current.onChange?.(
        json,
        anchors,
        propsRef.current.trackWritingActivity &&
          !isHistoryTransaction(transaction) &&
          !pageVersionChanges(transaction).some(
            (step) => step.kind !== "pagination",
          )
          ? {
              wordDelta:
                getWordCount(json) - getWordCount(transaction.before.toJSON()),
            }
          : undefined,
        transaction.mapping,
        pageVersionChanges(transaction),
        transaction,
      );
      if (propsRef.current.trackWritingActivity) {
        const characters = writtenCharacters(
          transaction,
          writingComposition.current,
        );
        if (characters)
          propsRef.current.onWritingActivity?.({ id: makeId(), characters });
      }
      propsRef.current.onSelection?.(selectionInfo(updatedEditor));
    },
    onSelectionUpdate({ editor: updatedEditor }) {
      rememberCaret(updatedEditor);
      propsRef.current.onSelection?.(selectionInfo(updatedEditor));
    },
    onFocus({ editor: focusedEditor }) {
      propsRef.current.onSelection?.(selectionInfo(focusedEditor));
    },
  });
  useEffect(() => {
    if (editor && !editor.isDestroyed)
      editor.view.dispatch(editor.state.tr.setMeta("pageVersionLayout", true));
  }, [editor, pageVersions]);
  useEffect(() => {
    if (!editor || !caretReady || !autoFocus || !focusPending.current) return;
    const frame = requestAnimationFrame(() => {
      if (editor.isDestroyed || !editor.view.dom.getClientRects().length)
        return;
      const active = document.activeElement;
      if (
        active !== editor.view.dom &&
        active?.matches("input, textarea, select, [contenteditable]")
      )
        return;
      focusPending.current = false;
      // Focus the current selection synchronously so a later frame cannot steal
      // focus from a dialog opened immediately after the document.
      editor.view.focus();
      editor.commands.scrollIntoView();
    });
    return () => cancelAnimationFrame(frame);
  }, [editor, caretReady, autoFocus]);
  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom;
    const start = () => {
      writingComposition.current.active = true;
    };
    const finish = (event) => {
      const active = writingComposition.current.active;
      writingComposition.current.active = false;
      const characters = committedCharacters(event.data || "");
      if (active && characters && propsRef.current.trackWritingActivity)
        propsRef.current.onWritingActivity?.({ id: makeId(), characters });
    };
    dom.addEventListener("compositionstart", start);
    dom.addEventListener("compositionend", finish);
    return () => {
      dom.removeEventListener("compositionstart", start);
      dom.removeEventListener("compositionend", finish);
      writingComposition.current.active = false;
    };
  }, [editor]);
  useScreenplayPagination(
    editor,
    minimal && !continuous,
    onPageCount,
    fontSize,
    fontFamily,
    documentZoom,
    (pages) => propsRef.current.onRevisionPages?.(pages),
    () => propsRef.current.pageVersions,
  );
  useMobileRevisionPages(
    editor,
    minimal && continuous && (!!revision || !!pageVersions),
    (pages) => propsRef.current.onRevisionPages?.(pages),
    fontSize,
    fontFamily,
    documentZoom,
    () => propsRef.current.pageVersions,
  );
  useEffect(() => {
    if (!editor) return;
    editor.registerPlugin(
      componentLinksPlugin(() => propsRef.current.components || []),
    );
    return () => {
      if (!editor.isDestroyed) editor.unregisterPlugin(componentLinksKey);
    };
  }, [editor]);
  useEffect(() => {
    if (!editor || plainOnly) return;
    editor.registerPlugin(dictationPreviewPlugin());
    return () => {
      if (!editor.isDestroyed) editor.unregisterPlugin(dictationPreviewKey);
    };
  }, [editor, plainOnly]);
  useEffect(() => {
    if (editor && !editor.isDestroyed)
      editor.view.dispatch(
        editor.state.tr
          .setMeta(componentLinksKey, true)
          .setMeta("addToHistory", false),
      );
  }, [editor, components, componentScenes]);
  useEffect(() => {
    if (!editor || !content) return;
    const serialized = JSON.stringify(content);
    if (serialized === lastReceived.current) return;
    lastReceived.current = serialized;
    if (
      serialized === lastEmitted.current ||
      serialized === JSON.stringify(editor.getJSON())
    )
      return;
    const caret = captureCaret(editor.state);
    const storedMarks = editor.state.storedMarks;
    editor
      .chain()
      .setContent(normalizeContent(content), {
        emitUpdate: false,
      })
      .command(({ tr }) => {
        tr.setSelection(selectionAtCaret(tr.doc, caret));
        tr.setStoredMarks(storedMarks);
        return true;
      })
      .run();
    rememberCaret(editor);
    propsRef.current.onSelection?.(selectionInfo(editor));
  }, [content, editor]);
  useEffect(() => {
    if (editor && !editor.isDestroyed)
      editor.view.dispatch(editor.state.tr.setMeta("screenplay-display", true));
  }, [
    editor,
    showLineHighlight,
    showComponents,
    activeEntity,
    searchQuery,
    searchFormat,
    searchIndex,
    searchCardIndex,
    comments,
    activeComment,
    props,
    activeProp,
    outlineCards,
    sceneShots,
    activeShot,
    language,
    continuous,
  ]);
  useEffect(() => {
    if (!searchQuery && searchScrollFrame.current !== null) {
      cancelAnimationFrame(searchScrollFrame.current);
      searchScrollFrame.current = null;
    }
  }, [searchQuery]);
  useEffect(
    () => () => {
      if (searchScrollFrame.current !== null)
        cancelAnimationFrame(searchScrollFrame.current);
      clearTimeout(navigationFlashTimer.current);
    },
    [],
  );
  useImperativeHandle(
    ref,
    () => ({
      focus(position) {
        editor?.commands.focus(position);
      },
      measurePages(content, { locked = false, forcedStarts } = {}) {
        if (!editor || editor.isDestroyed) return [0];
        const pages = canonicalScreenplayPages(editor, fontSize, documentZoom, {
          content,
          forcedStarts:
            forcedStarts ??
            (locked ? pageVersionBreaks(propsRef.current.pageVersions) : []),
        });
        try {
          return pages.starts;
        } finally {
          pages.dispose();
        }
      },
      recordPageLayout(before, after, transaction) {
        if (
          !editor ||
          editor.isDestroyed ||
          !editor.state.doc.eq(editor.schema.nodeFromJSON(after.content))
        )
          return false;
        editor.view.dispatch(
          editor.state.tr
            .step(pageVersionLayoutStep(before, after))
            .setMeta("appendedTransaction", transaction)
            .setMeta("skipWritingReward", true),
        );
        return true;
      },
      focusPosition(position) {
        if (!editor || editor.isDestroyed) return;
        editor.commands.setTextSelection(
          Math.max(1, Math.min(editor.state.doc.content.size - 1, position)),
        );
        editor.view.focus();
        editor.commands.scrollIntoView();
      },
      focusEnd() {
        editor?.commands.focus("end");
      },
      insertTelegraphText(text) {
        if (
          !editor ||
          editor.isDestroyed ||
          !editor.isEditable ||
          editor.view.composing ||
          !text
        )
          return false;
        const { from } = editor.state.selection;
        const transaction = editor.state.tr.insertText(text);
        transaction.addMark(
          from,
          from + text.length,
          editor.schema.marks.telegraph.create(),
        );
        transaction.removeStoredMark(editor.schema.marks.telegraph);
        editor.view.dispatch(transaction.setMeta("telegraph", true));
        scrollToText(
          editor.view,
          editor.state.selection.from,
          searchScrollFrame,
          true,
          {
            ensureRoom: true,
            avoidSelector: ".focus-telegraph",
          },
        );
        return true;
      },
      focusBlankSpace(x, y) {
        if (!editor || editor.isDestroyed) return false;
        const blocks = editor.view.dom.querySelectorAll(".screenplay-block");
        const first = blocks[0]?.getBoundingClientRect();
        const last = blocks[blocks.length - 1]?.getBoundingClientRect();
        if (!first || !last) return false;
        // Only the unused paper below the text should place the caret at the end.
        // Between paragraphs (including page gaps), let the editor choose the
        // closest text position instead of jumping to the final page.
        let position;
        if (y > last.bottom) position = editor.state.doc.content.size - 1;
        else {
          const bounds = editor.view.dom.getBoundingClientRect();
          position = editor.view.posAtCoords({
            left: Math.max(bounds.left + 1, Math.min(bounds.right - 1, x)),
            top: Math.max(first.top + 1, y),
          })?.pos;
        }
        if (position == null) return false;
        editor.view.dispatch(
          editor.state.tr.setSelection(
            TextSelection.near(editor.state.doc.resolve(position)),
          ),
        );
        editor.view.focus();
        return true;
      },
      findText(
        query,
        index = 0,
        { format = "all", fromCard = false, scroll = true } = {},
      ) {
        if (!editor || !query.trim()) return 0;
        const matches = [];
        editor.state.doc.descendants((node, pos) => {
          if (
            node.type.name !== "paragraph" ||
            !matchesSearchFormat(node.attrs.format, format)
          )
            return;
          const text = node.textBetween(0, node.content.size, "", "\n");
          for (const { at, length } of textSearchRanges(text, query)) {
            matches.push({
              from: pos + 1 + at,
              to: pos + 1 + at + length,
            });
          }
        });
        if (!matches.length) return 0;
        const currentIndex =
          ((index % matches.length) + matches.length) % matches.length;
        const match = matches[currentIndex];
        if (!fromCard) editor.commands.setTextSelection(match);
        if (scroll)
          scrollToText(editor.view, match.from, searchScrollFrame, fromCard);
        return matches.length;
      },
      focusSearchMatch(
        match,
        { fromCard = false, scroll = true, onComplete } = {},
      ) {
        if (!editor || !match || !caretReadyRef.current) return false;
        let range = null;
        editor.state.doc.descendants((node, pos) => {
          if (
            node.type.name === "paragraph" &&
            node.attrs.blockId === match.blockId
          )
            range = {
              from: pos + 1 + match.at,
              to: pos + 1 + match.at + match.length,
            };
        });
        if (!range || range.to > editor.state.doc.content.size) return false;
        editor.commands.setTextSelection(fromCard ? range.from : range);
        if (fromCard) editor.view.dom.focus({ preventScroll: true });
        if (scroll)
          scrollToText(editor.view, range.from, searchScrollFrame, fromCard, {
            onComplete,
          });
        else onComplete?.();
        return true;
      },
      focusComment(id, blockId, sceneId) {
        if (!editor) return false;
        let range = null;
        editor.state.doc.descendants((node, pos) => {
          if (
            node.isText &&
            node.marks.some(
              (mark) => mark.type.name === "comment" && mark.attrs.id === id,
            )
          )
            range = range
              ? {
                  from: range.from,
                  to: pos + node.nodeSize,
                }
              : {
                  from: pos,
                  to: pos + node.nodeSize,
                };
        });
        const comment = propsRef.current.comments?.find((c) => c.id === id);
        let position = range?.from ?? null;
        if (position === null && sceneId) {
          editor.state.doc.descendants((node, at) => {
            if (node.attrs.blockId === blockId) position = at + 1;
          });
          if (position === null)
            editor.state.doc.descendants((node, at) => {
              if (node.attrs.blockId === sceneId) position = at + 1;
            });
        }
        if (position === null && Number.isInteger(comment?.anchor))
          position = Math.max(
            1,
            Math.min(comment.anchor, editor.state.doc.content.size - 1),
          );
        if (position === null && blockId)
          editor.state.doc.descendants((node, at) => {
            if (node.attrs.blockId === blockId) position = at + 1;
          });
        if (position === null) return false;
        editor.commands.setTextSelection(position);
        editor.view.focus();
        scrollToText(editor.view, position, searchScrollFrame, true, {
          ensureRoom: true,
        });
        return !!range;
      },
      setFormat(format) {
        if (!editor) return false;
        const result = editor.chain().focus().setScreenplayFormat(format).run();
        propsRef.current.onSelection?.(selectionInfo(editor));
        return result;
      },
      addScene() {
        if (!editor) return null;
        const blockId = makeId();
        const end = editor.state.doc.content.size;
        const title = "INT. NEW LOCATION — DAY";
        editor
          .chain()
          .focus()
          .command(({ tr }) => {
            tr.setMeta("skipWritingReward", true);
            return true;
          })
          .insertContentAt(end, [
            {
              type: "paragraph",
              attrs: {
                format: "scene",
                blockId,
              },
              content: [
                {
                  type: "text",
                  text: title,
                },
              ],
            },
            {
              type: "paragraph",
              attrs: {
                format: "action",
                blockId: makeId(),
              },
            },
          ])
          .setTextSelection({
            from: end + 1,
            to: end + 1 + title.length,
          })
          .run();
        return blockId;
      },
      insertOutlineScene(blocks) {
        if (!editor || editor.isDestroyed || !caretReadyRef.current)
          return null;
        // Insert at the last writing position without replacing selected text.
        const inserted = editor
          .chain()
          .setTextSelection(editor.state.selection.head)
          .command(({ tr }) => {
            tr.setMeta("skipWritingReward", true);
            return true;
          })
          .insertContent(blocks)
          .run();
        return inserted ? editor.getJSON() : null;
      },
      focusBlock(blockId, { highlight = true } = {}) {
        if (
          !editor ||
          editor.isDestroyed ||
          !caretReadyRef.current ||
          !editor.view.dom.getClientRects().length
        )
          return false;
        let found = null;
        editor.state.doc.descendants((node, pos) => {
          if (node.type.name === "paragraph" && node.attrs.blockId === blockId)
            found = pos;
        });
        if (found === null) return false;
        editor.commands.setTextSelection(found + 1);
        editor.view.focus();
        if (!highlight) {
          clearTimeout(navigationFlashTimer.current);
          if (navigationFlash.current) {
            navigationFlash.current = null;
            editor.view.dispatch(
              editor.state.tr.setMeta("addToHistory", false),
            );
          }
        }
        scrollToText(editor.view, found + 1, searchScrollFrame, true, {
          ensureRoom: true,
          onComplete: highlight
            ? () => {
                clearTimeout(navigationFlashTimer.current);
                // Remove a previous pulse before adding a fresh one, including
                // repeated navigation to the same scene within a second.
                if (navigationFlash.current) {
                  navigationFlash.current = null;
                  editor.view.dispatch(
                    editor.state.tr.setMeta("addToHistory", false),
                  );
                  editor.view.dom.getBoundingClientRect();
                }
                navigationFlash.current = blockId;
                editor.view.dispatch(
                  editor.state.tr.setMeta("addToHistory", false),
                );
                navigationFlashTimer.current = setTimeout(() => {
                  navigationFlash.current = null;
                  if (!editor.isDestroyed)
                    editor.view.dispatch(
                      editor.state.tr.setMeta("addToHistory", false),
                    );
                }, 1000);
              }
            : undefined,
        });
        return true;
      },
      addComment(id, source) {
        if (!editor) return null;
        const info = annotationTarget(editor, source);
        if (!info || info.from === info.to) return info;
        const transaction = editor.state.tr.addMark(
          info.from,
          info.to,
          editor.schema.marks.comment.create({
            id,
          }),
        );
        transaction.removeStoredMark(editor.schema.marks.comment);
        editor.view.dispatch(transaction);
        return info;
      },
      removeComment(id) {
        return removeAnnotation(editor, "comment", id);
      },
      addTextLink(source, rawUrl) {
        const href = componentUrl(rawUrl);
        if (!editor || (!href && rawUrl !== null)) return false;
        const info = annotationTarget(editor, source);
        if (!info || info.from === info.to) return false;
        const type = editor.schema.marks.link;
        const transaction = closeHistory(editor.state.tr).removeMark(
          info.from,
          info.to,
          type,
        );
        if (href)
          transaction.addMark(info.from, info.to, type.create({ href }));
        transaction.removeStoredMark(type);
        editor.view.dispatch(transaction);
        editor.view.dispatch(closeHistory(editor.state.tr));
        return true;
      },
      addEntity({ id, color }, source, resources) {
        if (!editor) return null;
        const info = annotationTarget(editor, source);
        if (!info || info.from === info.to) return info;
        const transaction = resources
          ? closeHistory(editor.state.tr)
          : editor.state.tr;
        if (resources)
          transaction.removeMark(
            info.from,
            info.to,
            editor.schema.marks.entity,
          );
        transaction.addMark(
          info.from,
          info.to,
          editor.schema.marks.entity.create({
            id,
            color,
          }),
        );
        transaction.removeStoredMark(editor.schema.marks.entity);
        if (resources) {
          transaction.step(
            pageVersionStateStep(resources.before, resources.after),
          );
          transaction.setMeta("skipWritingReward", true);
        }
        editor.view.dispatch(transaction);
        if (resources) editor.view.dispatch(closeHistory(editor.state.tr));
        return info;
      },
      removeEntity(id) {
        return removeAnnotation(editor, "entity", id, true);
      },
      removeEntities(ids) {
        if (!editor || !ids.length) return false;
        const selected = new Set(ids);
        const transaction = editor.state.tr;
        editor.state.doc.descendants((node, pos) => {
          if (!node.isText) return;
          node.marks
            .filter(
              (mark) =>
                mark.type.name === "entity" && selected.has(mark.attrs.id),
            )
            .forEach((mark) =>
              transaction.removeMark(pos, pos + node.nodeSize, mark),
            );
        });
        transaction.removeStoredMark(editor.schema.marks.entity);
        transaction.setMeta("addToHistory", false);
        transaction.setMeta(SKIP_COMPONENT_LINKS, true);
        if (transaction.docChanged || transaction.storedMarksSet)
          editor.view.dispatch(transaction);
        return transaction.docChanged;
      },
      getJSON() {
        return editor?.getJSON();
      },
      preparePageBurn(versionDocument) {
        return preparePageBurn(editor, {
          fontSize,
          documentZoom,
          versionDocument,
          forcedStarts: pageVersionBreaks(propsRef.current.pageVersions),
        });
      },
      createDictationTarget() {
        return createDictationTarget(editor, {
          follow: (view, position, element) =>
            scrollToText(view, position, searchScrollFrame, true, {
              ensureRoom: true,
              targetElement: element,
              avoidSelector: "#writing-coins",
            }),
        });
      },
      setEditable(value) {
        editor?.setEditable(value, false);
      },
      applyStoryboardChange(beforeDocument, afterDocument, group) {
        if (!editor || editor.isDestroyed || editor.view.composing)
          return false;
        const before = editor.state.doc;
        const after = editor.schema.nodeFromJSON(
          normalizeContent(afterDocument.content),
        );
        const previous = editor.storyboardGroup;
        const tr =
          group && previous?.key === group && Date.now() - previous.time < 750
            ? editor.state.tr
            : closeHistory(editor.state.tr);
        editor.storyboardGroup = { key: group, time: Date.now() };
        const start = before.content.findDiffStart(after.content);
        if (start !== null) {
          const end = before.content.findDiffEnd(after.content);
          const overlap = Math.max(0, start - Math.min(end.a, end.b));
          tr.replace(
            start,
            end.a + overlap,
            after.slice(start, end.b + overlap),
          );
        }
        tr.step(pageVersionStateStep(beforeDocument, afterDocument));
        tr.setMeta("skipWritingReward", true);
        editor.view.dispatch(tr);
        if (!group) editor.view.dispatch(closeHistory(editor.state.tr));
        return true;
      },
      restoreContent(content) {
        if (!editor) return;
        const caret = captureCaret(editor.state);
        editor
          .chain()
          .command(({ tr }) => {
            tr.setMeta("addToHistory", false);
            tr.setMeta(SKIP_COMPONENT_LINKS, true);
            return true;
          })
          .setContent(normalizeContent(content), {
            emitUpdate: false,
          })
          .command(({ tr }) => {
            tr.setSelection(selectionAtCaret(tr.doc, caret));
            return true;
          })
          .run();
        rememberCaret(editor);
        lastReceived.current = JSON.stringify(editor.getJSON());
        lastEmitted.current = lastReceived.current;
        propsRef.current.onSelection?.(selectionInfo(editor));
      },
      renameEntity(id, name) {
        if (!editor || !name) return 0;
        const component = propsRef.current.components.find(
          (item) => item.id === id,
        );
        const aliases = new Set(
          cleanComponentAliases(component?.aliases, component?.name).map(
            (alias) => alias.toLocaleLowerCase(),
          ),
        );
        const ranges = [];
        editor.state.doc.descendants((node, pos) => {
          if (
            !node.isText ||
            !node.marks.some(
              (mark) => mark.type.name === "entity" && mark.attrs.id === id,
            )
          )
            return;
          const previous = ranges.at(-1);
          if (previous && previous.to === pos)
            previous.to = pos + node.nodeSize;
          else
            ranges.push({
              from: pos,
              to: pos + node.nodeSize,
              marks: node.marks,
            });
        });
        const replacements = ranges.filter(
          (range) =>
            !aliases.has(
              editor.state.doc
                .textBetween(range.from, range.to)
                .trim()
                .toLocaleLowerCase(),
            ),
        );
        if (!replacements.length) return 0;
        const transaction = editor.state.tr;
        transaction.setMeta(SKIP_COMPONENT_LINKS, true);
        transaction.setMeta("skipWritingReward", true);
        for (const range of replacements.reverse())
          transaction.replaceWith(
            range.from,
            range.to,
            editor.schema.text(name, range.marks),
          );
        editor.view.dispatch(transaction);
        return replacements.length;
      },
      renameProp(prop, name) {
        if (!editor || !name) return 0;
        const ranges = propRanges(editor.state.doc, [prop]);
        const tr = editor.state.tr;
        tr.setMeta("skipWritingReward", true);
        for (const range of ranges.reverse()) {
          const marks =
            editor.state.doc.resolve(range.from).nodeAfter?.marks || [];
          tr.replaceWith(range.from, range.to, editor.schema.text(name, marks));
        }
        if (tr.docChanged) editor.view.dispatch(tr);
        return ranges.length;
      },
      getSelection() {
        return selectionInfo(editor);
      },
      getCaret() {
        return editor && captureCaret(editor.state);
      },
      restoreCaret(caret) {
        if (!editor || !caret) return;
        if (searchScrollFrame.current !== null) {
          cancelAnimationFrame(searchScrollFrame.current);
          searchScrollFrame.current = null;
        }
        editor.commands.command(({ tr }) => {
          tr.setSelection(selectionAtCaret(tr.doc, caret));
          return true;
        });
        rememberCaret(editor);
      },
      getHTML() {
        return editor?.getHTML() || "";
      },
      getText() {
        return (
          editor?.getText({
            blockSeparator: "\n\n",
          }) || ""
        );
      },
      undo() {
        return editor?.chain().focus().undo().run();
      },
      redo() {
        return editor?.chain().focus().redo().run();
      },
    }),
    [editor, fontSize, documentZoom],
  );
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    editor.setOptions({
      editorProps: {
        ...editor.options.editorProps,
        attributes: {
          ...editor.options.editorProps.attributes,
          spellcheck: String(spellcheck),
          lang: language,
        },
      },
    });
  }, [editor, spellcheck, language]);
  useEffect(() => {
    if (!sceneVariantMenu) return;
    sceneVariantMenu.anchor.setAttribute("aria-expanded", "true");
    return () => sceneVariantMenu.anchor.setAttribute("aria-expanded", "false");
  }, [sceneVariantMenu]);
  useEffect(
    () => setSceneVariantMenu(null),
    [documentId, selectionToolbarDisabled],
  );
  return (
    <>
      <EditorContent
        editor={editor}
        className={`screenplay-editor-shell${showComponents ? " show-components" : ""}${componentHints ? "" : " component-hints-hidden"}`}
      />
      <SelectionToolbar
        editor={editor}
        minimal={minimal}
        plainOnly={plainOnly}
        disabled={
          selectionToolbarDisabled || contextMenuOpen || !!sceneVariantMenu
        }
        onCreateComponent={onCreateComponent}
        onCreateProp={onCreateProp}
        onPasteComponentUrl={onPasteComponentUrl}
        onComment={onCommentFromSelection || onComments}
      />
      {minimal && (
        <ComponentLinkHover
          editor={editor}
          components={components}
          enabled={componentHints}
          onEdit={onEditComponent}
        />
      )}
      <EditorContextMenu
        editor={editor}
        plainOnly={plainOnly}
        onCreateComponent={onCreateComponent}
        onPasteImages={onPasteImages}
        onPasteComponentUrl={onPasteComponentUrl}
        onCreateProp={onCreateProp}
        onOpenChange={setContextMenuOpen}
      />
      {minimal && (
        <ComponentPicker
          editor={editor}
          components={enabledSuggestions}
          enabled={
            componentHints &&
            !suggestionsDisabled &&
            !contextMenuOpen &&
            !sceneVariantMenu
          }
          onOpenChange={setComponentPickerOpen}
        />
      )}
      {minimal && (
        <Suggestions
          editor={editor}
          components={componentHints ? enabledSuggestions : []}
          disabled={
            suggestionsDisabled ||
            contextMenuOpen ||
            !!sceneVariantMenu ||
            componentPickerOpen
          }
        />
      )}
      {sceneVariantMenu && (
        <SelectMenu
          anchor={sceneVariantMenu.anchor}
          value={sceneVariantMenu.value}
          label={t("Вариант сцены {0}", sceneVariantMenu.number)}
          compact
          options={SCENE_VARIANTS.map((letter) => ({
            value: letter,
            label: letter,
          }))}
          onClose={(restoreFocus) => {
            setSceneVariantMenu(null);
            if (restoreFocus)
              sceneVariantMenu.anchor.focus({ preventScroll: true });
          }}
          onSelect={(letter) =>
            propsRef.current.onSceneVariant?.(sceneVariantMenu.blockId, letter)
          }
        />
      )}
    </>
  );
});
export default ScreenplayEditor;
