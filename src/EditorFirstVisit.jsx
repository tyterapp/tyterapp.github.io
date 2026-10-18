import { useLanguage } from "./i18n.js";

export default function EditorFirstVisit() {
  const english = useLanguage() === "en";
  return (
    <section
      className="editor-first-visit"
      aria-labelledby="editor-first-visit-title"
    >
      <h2 id="editor-first-visit-title">
        {english
          ? "How to work with text faster?"
          : "Как быстрее работать с текстом?"}
      </h2>
      <p>
        {english
          ? "To delete the whole word before the cursor, use "
          : "Чтобы стереть всё слово перед курсором, используй сочетание клавиш "}
        <strong>CTRL + Backspace</strong>.
      </p>
      <p>
        {english
          ? "To delete the whole word after the cursor, use "
          : "Чтобы стереть всё слово после курсора, используй сочетание клавиш "}
        <strong>CTRL + Delete</strong>.
      </p>
      <p>
        {english
          ? "To move through text quickly, use "
          : "Для быстрого перемещения по тексту используй сочетания "}
        <strong>CTRL + →</strong> {english ? "and" : "и"}{" "}
        <strong>CTRL + ←</strong>.
      </p>
      <p>
        {english
          ? "To undo the last action, use "
          : "Для отмены последнего действия используй "}
        <strong>CTRL + Z</strong>
        {english ? ", and " : ", а "}
        <strong>CTRL + SHIFT + Z</strong>
        {english ? " to redo it." : " — чтобы вернуться вперёд."}
      </p>
      <p>
        {english
          ? "To select text word by word, use "
          : "Для выделения текста по словам используй "}
        <strong>CTRL + SHIFT + ←</strong> {english ? "and" : "и"}{" "}
        <strong>CTRL + SHIFT + →</strong>.
      </p>
      <p>
        {english
          ? "To delete all text, use "
          : "Чтобы стереть весь текст, используй "}
        <strong>CTRL + A</strong> {english ? "and press" : "и нажми"}{" "}
        <strong>Delete</strong>.
      </p>
    </section>
  );
}
