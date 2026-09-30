import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, KeyRound, LoaderCircle } from "lucide-react";
import App from "./MinimalApp.jsx";
import { EditionContext } from "./edition.js";
import {
  PRO_SESSION_STORAGE,
  ProAccessUnavailable,
  validProSession,
  verifyProAccess,
} from "./pro-access.js";
import "./web-pro.css";

const STORAGE = PRO_SESSION_STORAGE;
const readToken = () => {
  try {
    const saved = localStorage.getItem(STORAGE);
    return validProSession(saved) ? saved : "";
  } catch {
    return "";
  }
};

export default function WebProApp() {
  const [gate, setGate] = useState({
    status: "checking",
    message: "",
    revision: 0,
  });
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const token = useRef(readToken());
  const requestId = useRef(0);
  const request = useRef(null);
  const gateElement = useRef(null);
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
    };
  }, []);
  useEffect(() => {
    if (gate.status !== "allowed") document.title = "Tyter Pro — вход";
  }, [gate.status]);
  const lock = useCallback((message = "", forget = true) => {
    window.dispatchEvent(new Event("tyter:save-now"));
    if (forget) token.current = "";
    try {
      if (forget) localStorage.removeItem(STORAGE);
    } catch {
      /* Storage may be blocked. */
    }
    // Recreate externally altered gate markup. React cannot reconcile a removed root.
    if (gateElement.current && !gateElement.current.isConnected) {
      window.location.reload();
      return;
    }
    setGate((previous) => ({
      status: "locked",
      message,
      revision: previous.revision + 1,
    }));
  }, []);
  const call = useCallback(
    async (method, body) => {
      request.current?.abort();
      const controller = new AbortController();
      request.current = controller;
      const id = ++requestId.current;
      const timeout = setTimeout(() => controller.abort(), 8000);
      try {
        const response = await verifyProAccess({
          method,
          body,
          token: token.current,
          signal: controller.signal,
        });
        const result = response.result;
        if (id !== requestId.current) return;
        if (!response.ok || result.authenticated !== true) {
          lock(
            result.error ||
              "Доступ к Pro не подтверждён. Введите email и ключ.",
            response.status === 401,
          );
          return;
        }
        if (method === "POST") {
          if (!validProSession(result.token)) {
            lock("Не удалось подтвердить доступ к Pro.");
            return;
          }
          token.current = result.token;
          try {
            localStorage.setItem(STORAGE, result.token);
          } catch {
            /* Keep this tab's session in memory. */
          }
          setCode("");
        }
        setGate((previous) => ({
          ...previous,
          status: "allowed",
          message: "",
        }));
      } catch (error) {
        if (id === requestId.current)
          lock(
            error instanceof ProAccessUnavailable
              ? error.message
              : "Проверка доступа недоступна. Проверьте интернет и повторите попытку.",
            false,
          );
      } finally {
        clearTimeout(timeout);
      }
    },
    [lock],
  );
  useEffect(() => {
    const verify = () => {
      if (busyRef.current) return;
      if (!token.current) {
        lock();
        return;
      }
      return call("GET");
    };
    verify();
    const interval = setInterval(verify, 60000);
    const visible = () => {
      if (!document.hidden) verify();
    };
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("focus", verify);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("focus", verify);
      ++requestId.current;
      request.current?.abort();
    };
  }, [call, lock]);

  if (gate.status === "allowed")
    return (
      <EditionContext.Provider value={true}>
        <App />
      </EditionContext.Provider>
    );

  return (
    <main
      ref={gateElement}
      className="web-pro-gate"
      key={gate.revision}
      aria-label="Вход в Tyter Pro"
    >
      <a className="web-pro-logo" href="/" aria-label="Tyter — главная">
        <img src="/brand/tyter-logo.svg" alt="Tyter" />
      </a>
      <section className="web-pro-card" aria-label="Доступ к Pro">
        <span className="web-pro-symbol">
          <KeyRound size={23} />
        </span>
        <span className="web-pro-label">TYTER PRO · ВЕБ-ВЕРСИЯ</span>
        <h1>Вход в Pro</h1>
        <p>
          Введите email и ключ, полученные после доната, чтобы открыть редактор
          без ограничений.
        </p>
        {gate.status === "checking" ? (
          <p className="web-pro-checking" role="status">
            <LoaderCircle size={18} /> Проверяем доступ…
          </p>
        ) : (
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              if (busyRef.current || code.length !== 6) return;
              busyRef.current = true;
              setBusy(true);
              try {
                await call("POST", { code, email });
              } finally {
                busyRef.current = false;
                setBusy(false);
              }
            }}
          >
            <label htmlFor="web-pro-email">Email</label>
            <input
              id="web-pro-email"
              type="email"
              autoComplete="email"
              required
              autoFocus
              placeholder="you@example.com"
              value={email}
              disabled={busy}
              onChange={(event) => setEmail(event.target.value)}
            />
            <label htmlFor="web-pro-code">Ключ доступа</label>
            <input
              id="web-pro-code"
              autoComplete="off"
              maxLength={6}
              minLength={6}
              pattern="[A-Za-z0-9]{6}"
              required
              placeholder="ABC123"
              value={code}
              disabled={busy}
              onChange={(event) =>
                setCode(
                  event.target.value
                    .replace(/[^a-zA-Z0-9]/g, "")
                    .toUpperCase()
                    .slice(0, 6),
                )
              }
            />
            {gate.message && (
              <p className="web-pro-error" role="alert">
                {gate.message}
              </p>
            )}
            <button
              className="primary-button web-pro-submit"
              disabled={busy || code.length !== 6 || !email.trim()}
            >
              {busy ? "Проверяем ключ…" : "Открыть Pro"}
              <ArrowRight size={17} />
            </button>
          </form>
        )}
        <div className="web-pro-free">
          {token.current && (
            <button className="quiet-button" onClick={() => call("GET")}>
              Повторить проверку
            </button>
          )}
          <a
            href="https://boosty.to/sergeybuharev"
            target="_blank"
            rel="noreferrer"
          >
            Получить ключ после доната <ArrowRight size={15} />
          </a>
          <a href="/free">
            Бесплатная веб-версия <ArrowRight size={15} />
          </a>
          <span>2 документа · 10 компонентов · 14 дней истории</span>
        </div>
      </section>
      <p className="web-pro-note">
        Документы сохраняются на вашем устройстве. Для проверки доступа нужен
        интернет.
        <br />
        Помощь: <a href="mailto:mrbuha@ya.ru">mrbuha@ya.ru</a> ·{" "}
        <a href="https://t.me/SergeyBuharev" target="_blank" rel="noreferrer">
          Telegram
        </a>
      </p>
    </main>
  );
}
