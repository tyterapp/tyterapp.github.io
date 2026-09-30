import { useEffect, useRef } from "react";
import { Check, ExternalLink, X } from "lucide-react";
export default function SubscriptionDialog({ onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    ref.current.showModal();
    return () => ref.current?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="minimal-dialog subscription-dialog"
      aria-label="Полная версия Tyter"
      onCancel={onClose}
    >
      <div className="dialog-heading">
        <h2>Tyter Pro</h2>
        <button
          className="icon-button"
          aria-label="Закрыть подписку"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </div>
      {[
        "Документы и компоненты без ограничений",
        "Вся история изменений без ограничения срока",
        "Реквизит с количеством и отчётами PDF",
        "Аутлайн с карточками истории и переходами к сценам",
        "Файлы TYT со сценарием, комментариями и деталями",
      ].map((text) => (
        <p className="subscription-benefit" key={text}>
          <Check size={16} />
          {text}
        </p>
      ))}
      <p>
        Pro работает в браузере и сохраняет документы на вашем устройстве. Для
        входа нужны email и уникальный ключ, который можно получить у автора
        после доната на Boosty.
      </p>
      <a className="primary-button subscription-web-pro" href="/pro">
        Открыть Tyter Pro <ExternalLink size={15} />
      </a>
      <a
        className="subscription-web-pro"
        href="https://boosty.to/sergeybuharev"
        target="_blank"
        rel="noreferrer"
      >
        Перейти на Boosty ↗
      </a>
    </dialog>
  );
}
