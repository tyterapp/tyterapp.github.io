import { useCallback, useEffect, useRef, useState } from "react";
import { CircleHelp } from "lucide-react";
import { useWebHaptics } from "web-haptics/react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TelegraphMark } from "./TelegraphMark.js";
import Telegraph from "./Telegraph.jsx";
import TelegraphAlphabet from "./TelegraphAlphabet.jsx";
import LanguageSwitch from "./LanguageSwitch.jsx";
import BrandContextMenu from "./BrandContextMenu.jsx";
import { useLanguage } from "./i18n.js";
import "./telegraph-page.css";

const DRAFT = "tyter.telegraph-draft.v1";
const mobileQuery = "(max-width: 831px), (pointer: coarse)";
const nodes = (text) =>
  text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => ({
      type: "paragraph",
      ...(line ? { content: [{ type: "text", text: line }] } : {}),
    }));
function readDraft() {
  try {
    return localStorage.getItem(DRAFT) || "";
  } catch {
    return "";
  }
}
function saveDraft(text) {
  try {
    localStorage.setItem(DRAFT, text);
  } catch {
    /* Writing remains available when storage is full. */
  }
}

export default function TelegraphPage() {
  const language = useLanguage();
  const en = language === "en";
  const [help, setHelp] = useState(false);
  const [brandMenu, setBrandMenu] = useState(null);
  const closeBrandMenu = useCallback(() => setBrandMenu(null), []);
  const { trigger } = useWebHaptics();
  const [nativeTouchHaptics] = useState(
    () =>
      typeof navigator.vibrate !== "function" &&
      (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) &&
      "switch" in document.createElement("input"),
  );
  const feedback = useCallback(
    ({ pointerType }) => {
      if (
        pointerType === "touch" ||
        (nativeTouchHaptics && pointerType !== "keyboard")
      )
        return;
      // Haptics must never interrupt a Morse press on unsupported devices.
      try {
        trigger(12, { intensity: 1 })?.catch(() => {});
      } catch {
        /* The browser or the device can decline haptic feedback. */
      }
    },
    [trigger, nativeTouchHaptics],
  );
  const releaseFeedback = useCallback(
    ({ pointerType }) => {
      if (pointerType !== "touch" || nativeTouchHaptics) return;
      // Touch-down does not grant browser user activation; touch-up does.
      try {
        trigger(25, { intensity: 1 })?.catch(() => {});
      } catch {
        /* Haptics are optional; writing must still work. */
      }
    },
    [trigger, nativeTouchHaptics],
  );
  const [mobile, setMobile] = useState(() => matchMedia(mobileQuery).matches);
  const mobileRef = useRef(mobile);
  mobileRef.current = mobile;
  const [text, setText] = useState(readDraft);
  const initial = useRef(text);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        blockquote: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        listKeymap: false,
        codeBlock: false,
        horizontalRule: false,
        bold: false,
        italic: false,
        underline: false,
        strike: false,
        code: false,
        link: false,
        trailingNode: false,
      }),
      TelegraphMark,
    ],
    enableInputRules: false,
    enablePasteRules: false,
    content: { type: "doc", content: nodes(initial.current) },
    editorProps: {
      attributes: {
        class: "telegraph-document",
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": en ? "Telegram text" : "Текст телеграммы",
        spellcheck: "false",
        inputmode: mobile ? "none" : "text",
        virtualkeyboardpolicy: mobile ? "manual" : "auto",
        autocapitalize: "off",
        autocomplete: "off",
        autocorrect: "off",
      },
      handleKeyDown(_view, event) {
        if (
          (event.ctrlKey || event.metaKey) &&
          ["b", "i", "u"].includes(event.key.toLowerCase())
        ) {
          event.preventDefault();
          return true;
        }
        return false;
      },
      handlePaste(view, event) {
        const value = event.clipboardData?.getData("text/plain");
        if (value === undefined) return false;
        event.preventDefault();
        if (!value) return true;
        const plain = view.state.schema.nodeFromJSON({
          type: "doc",
          content: nodes(value),
        });
        view.dispatch(
          view.state.tr
            .replaceSelection(plain.slice(1, plain.content.size - 1))
            .scrollIntoView(),
        );
        return true;
      },
      handleDrop(_view, event) {
        if (!event.dataTransfer?.files.length) return false;
        event.preventDefault();
        return true;
      },
      handleDOMEvents: {
        focus() {
          if (mobileRef.current) navigator.virtualKeyboard?.hide();
          return false;
        },
        beforeinput(_view, event) {
          if (
            mobileRef.current &&
            ["insertText", "insertCompositionText"].includes(event.inputType)
          ) {
            event.preventDefault();
            return true;
          }
          return false;
        },
      },
    },
    onUpdate({ editor }) {
      const value = editor.getText({ blockSeparator: "\n" });
      setText(value);
      saveDraft(value);
    },
  });
  useEffect(() => {
    const query = matchMedia(mobileQuery);
    const change = () => setMobile(query.matches);
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    if (!editor) return;
    const frame = requestAnimationFrame(() =>
      editor.commands.focus("end", { scrollIntoView: false }),
    );
    return () => cancelAnimationFrame(frame);
  }, [editor]);
  useEffect(() => {
    document.title = en
      ? "Tyter Telegraph — write a telegram"
      : "Телеграф Tyter — написать телеграмму";
  }, [en]);

  const insert = (value) => {
    if (!editor || editor.isDestroyed || editor.view.composing || !value)
      return false;
    const { from } = editor.state.selection;
    const transaction = editor.state.tr.insertText(value);
    transaction.addMark(
      from,
      from + value.length,
      editor.schema.marks.telegraph.create(),
    );
    transaction.removeStoredMark(editor.schema.marks.telegraph);
    editor.view.dispatch(transaction.scrollIntoView());
    return true;
  };
  return (
    <main
      className="telegraph-composer editor-column"
      lang={language}
      data-mobile={mobile || undefined}
    >
      <header className="telegraph-composer-header">
        <a
          className="telegraph-composer-logo"
          href="/"
          aria-label={en ? "Tyter home" : "Tyter — главная"}
          onContextMenu={(event) => {
            event.preventDefault();
            setBrandMenu({ left: event.clientX, top: event.clientY });
          }}
          onKeyDown={(event) => {
            if (
              event.key === "ContextMenu" ||
              (event.shiftKey && event.key === "F10")
            ) {
              event.preventDefault();
              const rect = event.currentTarget.getBoundingClientRect();
              setBrandMenu({ left: rect.left, top: rect.bottom });
            }
          }}
        >
          <img src="/brand/tyter-logo.svg" width="34" height="34" alt="" />
          <span>Tyter</span>
        </a>
        <button
          className="telegraph-help-button"
          type="button"
          aria-label={en ? "Morse alphabet" : "Азбука Морзе"}
          aria-haspopup="dialog"
          aria-expanded={help}
          onClick={() => setHelp(true)}
        >
          <CircleHelp size={21} aria-hidden="true" />
        </button>
        <LanguageSwitch />
        <h1 className="visually-hidden">{en ? "Telegraph" : "Телеграф"}</h1>
      </header>
      <div className="telegraph-compose-scroll">
        <div className="telegraph-compose-paper">
          <EditorContent editor={editor} />
        </div>
      </div>
      <div className="telegraph-compose-dock">
        <Telegraph
          language={language}
          editorSelector=".telegraph-document"
          onText={insert}
          onPress={feedback}
          onRelease={releaseFeedback}
          nativeTouchHaptics={nativeTouchHaptics}
          telegram={text.trim() ? text : ""}
          title={en ? "Telegram" : "Телеграмма"}
        />
      </div>
      {help && (
        <TelegraphAlphabet language={language} onClose={() => setHelp(false)} />
      )}
      {brandMenu && (
        <BrandContextMenu position={brandMenu} onClose={closeBrandMenu} />
      )}
    </main>
  );
}
