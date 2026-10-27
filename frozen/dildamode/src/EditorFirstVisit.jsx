import { useLanguage } from "./i18n.js";
import { MoneyIcon } from "./WritingTimerIcons.jsx";
import { CatIcon } from "./WritingHouseIcons.jsx";
import ScriptDoctorIcon from "./ScriptDoctorIcon.jsx";
import IntroFlame from "./IntroFlame.jsx";
import EmotionalReveal from "./EmotionalReveal.jsx";

export default function EditorFirstVisit() {
  const english = useLanguage() === "en";
  return (
    <section
      className="editor-first-visit"
      aria-labelledby="editor-first-visit-title"
    >
      <EmotionalReveal as="header" language={english ? "en" : "ru"}>
        <h2 id="editor-first-visit-title">
          {english
            ? "How to work with text faster?"
            : "Как быстрее работать с текстом?"}
        </h2>
      </EmotionalReveal>
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
        <strong>
          CTRL + <span className="script-arrow">→</span>
        </strong>{" "}
        {english ? "and" : "и"}{" "}
        <strong>
          CTRL + <span className="script-arrow">←</span>
        </strong>
        .
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
        <strong>
          CTRL + SHIFT + <span className="script-arrow">←</span>
        </strong>{" "}
        {english ? "and" : "и"}{" "}
        <strong>
          CTRL + SHIFT + <span className="script-arrow">→</span>
        </strong>
        .
      </p>
      <p>
        {english
          ? "To delete all text, use "
          : "Чтобы стереть весь текст, используй "}
        <strong>CTRL + A</strong> {english ? "and press" : "и нажми"}{" "}
        <strong>Delete</strong>.
      </p>
      <p className="editor-first-visit-coins">
        {english ? "Earn coins " : "Получай монетки "}
        <span className="intro-inline-icon">
          <MoneyIcon />
        </span>
        {english
          ? " for every 100 characters, daily visits or using the timer. Exchange them for extra features: an OiiA house "
          : " за каждые 100 символов, ежедневный вход или работу с таймером. Обменивай их на дополнительные возможности: домик ОииА "}
        <span className="intro-inline-icon">
          <CatIcon size={18} />
        </span>
        {english ? ", a lighter " : ", зажигалку "}
        <IntroFlame />
        {english ? ", Script Doctor " : ", доктора сценария "}
        <span className="intro-inline-icon">
          <ScriptDoctorIcon count={0} />
        </span>
        {english ? " and much more." : " и многое другое."}
      </p>
    </section>
  );
}
