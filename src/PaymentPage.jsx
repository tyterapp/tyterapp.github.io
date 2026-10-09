import { useEffect, useState } from "react";
import { ArrowRight, Check, Copy, ShieldCheck } from "lucide-react";

const STORAGE = "tyter.payment.order.v1";
const api = import.meta.env.VITE_TYTER_PAYMENT_API || "";
const savedOrder = () => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE) || "null");
  } catch {
    return null;
  }
};

export default function PaymentPage() {
  const [available, setAvailable] = useState(null);
  const [order, setOrder] = useState(savedOrder);
  const [status, setStatus] = useState("pending");
  const [licenseKey, setLicenseKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  useEffect(() => {
    fetch(`${api}/api/payment/config`)
      .then((response) => response.json())
      .then((data) => setAvailable(!!data.available))
      .catch(() => setAvailable(false));
  }, []);
  useEffect(() => {
    if (!order?.orderId || !order?.token || (status === "paid" && emailSent))
      return;
    let active = true;
    const check = async () => {
      try {
        const query = new URLSearchParams({
          orderId: order.orderId,
          token: order.token,
        });
        const response = await fetch(`${api}/api/payment/status?${query}`, {
          cache: "no-store",
        });
        if (!response.ok) return;
        const data = await response.json();
        if (active && data.status === "paid" && data.licenseKey) {
          setLicenseKey(data.licenseKey);
          setStatus("paid");
          setEmailSent(!!data.emailSent);
        }
      } catch {
        /* A temporary network error must not erase an order. */
      }
    };
    check();
    const timer = setInterval(check, 4000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [order, status, emailSent]);

  const create = async (event) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(`${api}/api/payment/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"),
          email: form.get("email"),
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Не удалось перейти к оплате.");
      const next = { orderId: result.orderId, token: result.token };
      localStorage.setItem(STORAGE, JSON.stringify(next));
      setOrder(next);
      window.location.assign(result.checkoutUrl);
    } catch (reason) {
      setError(reason.message || "Не удалось перейти к оплате.");
      setBusy(false);
    }
  };

  const reset = () => {
    localStorage.removeItem(STORAGE);
    setOrder(null);
    setStatus("pending");
    setLicenseKey("");
    setEmailSent(false);
    setError("");
  };

  return (
    <section
      className="site-payment-main site-shell"
      id="pro"
      aria-label="Tyter Pro"
    >
      <div className="site-payment-intro">
        <span className="site-eyebrow">
          <span className="site-eyebrow-dot" /> TYTER PRO
        </span>
        <h2>
          Больше места
          <br />
          для <em>историй.</em>
        </h2>
        <p>
          Неограниченные сценарии и компоненты, реквизит с количеством и всеми
          упоминаниями, история изменений за год. После покупки на email придёт
          ссылка на Tyter Pro для Windows и ваш ключ активации.
        </p>
        <div className="site-payment-benefits">
          <span>
            <Check size={17} /> Без лимита документов
          </span>
          <span>
            <Check size={17} /> Компоненты без ограничения в 10
          </span>
          <span>
            <Check size={17} /> Реквизит с количеством и подсветкой повторений
          </span>
          <span>
            <Check size={17} /> История изменений за 365 дней
          </span>
          <span>
            <Check size={17} /> Активация ключом в Tyter Pro для Windows
          </span>
        </div>
        <a
          className="site-button site-button-outline site-web-pro-link"
          href="/beta"
        >
          Открыть Pro в браузере <ArrowRight size={17} />
        </a>
      </div>
      <div className="site-payment-card">
        <div className="site-payment-card-top">
          <span>Годовой доступ</span>
          <ShieldCheck size={21} />
        </div>
        <div className="site-payment-price">
          1 200 ₽ <span>/ год</span>
        </div>
        {licenseKey ? (
          <div className="site-license-result" role="status">
            <h2>Оплата подтверждена</h2>
            <p>
              {emailSent
                ? "Ключ и ссылка на установщик отправлены на email."
                : "Ключ готов. Ожидаем отправку письма; сохраните копию ключа здесь."}{" "}
              Установите Tyter Pro и вставьте ключ в окно активации.
            </p>
            <textarea
              aria-label="Ключ лицензии"
              value={licenseKey}
              readOnly
              rows={5}
            />
            <button
              className="site-button site-button-dark"
              onClick={async () => {
                await navigator.clipboard.writeText(licenseKey);
                setCopied(true);
              }}
            >
              <Copy size={17} /> {copied ? "Скопировано" : "Скопировать ключ"}
            </button>
            <a
              className="site-button site-button-outline site-pro-download"
              href={
                import.meta.env.VITE_TYTER_PRO_DOWNLOAD_URL ||
                "/downloads/Tyter-Pro-Setup-1.0.0.exe"
              }
              download
            >
              Скачать Tyter Pro для Windows <ArrowRight size={17} />
            </a>
          </div>
        ) : order ? (
          <div className="site-payment-pending" role="status">
            <h2>Ожидаем подтверждение оплаты</h2>
            <p>
              После подтверждения Robokassa ключ появится здесь автоматически.
              Вы можете вернуться на эту страницу позже в том же браузере.
            </p>
            <small>Заказ № {order.orderId}</small>
            <button className="site-payment-reset" onClick={reset}>
              Оформить новый заказ
            </button>
          </div>
        ) : (
          <form onSubmit={create}>
            <label>
              Имя
              <input
                name="name"
                autoComplete="name"
                maxLength={100}
                required
                placeholder="Как к вам обращаться"
              />
            </label>
            <label>
              Email для ключа и чека
              <input
                name="email"
                type="email"
                autoComplete="email"
                maxLength={254}
                required
                placeholder="you@example.com"
              />
            </label>
            {available === false && (
              <p className="site-payment-unavailable">
                Приём платежей пока не подключён. После настройки магазина и
                публикации сайта здесь откроется оплата через Robokassa.
              </p>
            )}
            {error && (
              <p className="site-payment-error" role="alert">
                {error}
              </p>
            )}
            <button
              type="submit"
              className="site-button site-button-dark"
              disabled={available !== true || busy}
            >
              {busy ? "Открываем оплату…" : "Перейти к оплате"}{" "}
              <ArrowRight size={17} />
            </button>
            <p className="site-payment-note">
              Платёж проходит на защищённой странице Robokassa. Данные карты не
              вводятся в Tyter.
            </p>
          </form>
        )}
      </div>
    </section>
  );
}
