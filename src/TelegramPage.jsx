import { useCallback, useEffect, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import { readTelegram, telegramDescriptor } from "./telegram.js";
import { encodeMorse, MORSE_UNIT } from "./morse.js";
import { createTelegraphAudio } from "./telegraph-audio.js";
import "./telegram.css";

// A single timer advances the transmission; closing or restarting cancels it.
function* transmission(text) {
  let visible = 0;
  for (const character of text) {
    visible += character.length;
    if (/\s/u.test(character)) {
      yield { duration: (MORSE_UNIT / 5) * 4, visible };
      continue;
    }
    const code = encodeMorse(character);
    if (!code) {
      yield { duration: MORSE_UNIT / 5, visible };
      continue;
    }
    for (let index = 0; index < code.length; index++) {
      yield {
        tone: true,
        duration: (MORSE_UNIT / 5) * (code[index] === "-" ? 3 : 1),
      };
      yield index === code.length - 1
        ? { duration: (MORSE_UNIT / 5) * 3, visible }
        : { duration: MORSE_UNIT / 5 };
    }
  }
}

export default function TelegramPage() {
  const [telegram, setTelegram] = useState(() => {
    try {
      return (
        telegramDescriptor(
          JSON.parse(
            document.getElementById("tyter-telegram")?.textContent || "null",
          ),
        ) || readTelegram(location.hash)
      );
    } catch {
      return readTelegram(location.hash);
    }
  });
  const [visible, setVisible] = useState(0);
  const [status, setStatus] = useState("ready");
  const sound = useRef(null),
    timer = useRef(null),
    generation = useRef(0);
  const en = telegram?.language === "en";
  const label = (ru, english) => (en ? english : ru);
  const stop = useCallback(() => {
    generation.current++;
    clearTimeout(timer.current);
    sound.current?.stop();
  }, []);
  const play = useCallback(
    async (userInitiated = false) => {
      if (!telegram) return;
      stop();
      const request = generation.current;
      setVisible(0);
      setStatus("starting");
      const audio = sound.current;
      const ready = await audio.unlock(userInitiated);
      if (request !== generation.current) return;
      const silent = !ready && audio.supported;
      setStatus(silent ? "silent" : "playing");
      const sequence = transmission(telegram.text);
      const next = () => {
        if (request !== generation.current) return;
        audio.stop();
        const { value, done } = sequence.next();
        if (done) {
          setStatus(silent ? "silentFinished" : "finished");
          return;
        }
        if (value.visible !== undefined) setVisible(value.visible);
        if (value.tone && ready) audio.start();
        timer.current = setTimeout(next, value.duration);
      };
      next();
    },
    [telegram, stop],
  );
  useEffect(() => {
    const audio = createTelegraphAudio();
    sound.current = audio;
    document.title = `${telegram?.title || (telegram?.language === "en" ? "Telegram" : "Телеграмма")} — Tyter`;
    const description = document.querySelector('meta[name="description"]');
    if (description && telegram)
      description.content = telegram.title || "Tyter";
    play();
    const visibility = () => {
      if (document.hidden) {
        stop();
        setStatus((previous) =>
          ["playing", "silent"].includes(previous) ? "paused" : previous,
        );
      }
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      stop();
      audio.dispose();
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [play, stop, telegram]);
  useEffect(() => {
    const update = () => {
      stop();
      setVisible(0);
      setTelegram(readTelegram(location.hash));
    };
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, [stop]);
  const messages = {
    ready: label("Готово к воспроизведению", "Ready to play"),
    starting: label("Подготовка звука…", "Preparing audio…"),
    silent: label(
      "Нажмите кнопку ниже, чтобы включить звук и начать воспроизведение.",
      "Press the button below to enable sound and start playback.",
    ),
    silentFinished: label(
      "Телеграмма доставлена. Нажмите кнопку ниже, чтобы прослушать её со звуком.",
      "Telegram delivered. Press the button below to hear it with sound.",
    ),
    playing: label("Телеграмма передаётся…", "Transmitting…"),
    finished: label("Телеграмма доставлена", "Telegram delivered"),
    paused: label(
      "Воспроизведение остановлено. Можно прослушать с начала.",
      "Playback stopped. You can listen again from the beginning.",
    ),
  };
  return (
    <main className="telegram-page" lang={telegram?.language || "ru"}>
      {telegram ? (
        <>
          <article
            className="telegram-paper"
            aria-label={label("Текст телеграммы", "Telegram text")}
          >
            <p className="telegram-transmission" aria-label={telegram.text}>
              <span aria-hidden="true" className="telegraph-text">
                {telegram.text.slice(0, visible)}
              </span>
              <span aria-hidden="true" className="telegram-pending">
                {telegram.text.slice(visible)}
              </span>
            </p>
          </article>
          <footer className="telegram-playback">
            <p role="status" className="visually-hidden">
              {messages[status]}
            </p>
            <div className="telegram-playback-actions">
              <button
                type="button"
                className="telegram-replay"
                onClick={() => play(true)}
              >
                <RotateCcw size={24} />
                {label("Прослушать заново", "Listen again")}
              </button>
              <a
                className="telegram-oiia"
                href="/pro"
                aria-label={label(
                  "Котик OiiA — Tyter PRO",
                  "OiiA cat — Tyter PRO",
                )}
                data-playing={["playing", "silent"].includes(status)}
              >
                {[1, 2, 3, 4].map((number) => (
                  <img
                    key={number}
                    src={`/oiia/skins/oiia/frame-0${number}.png`}
                    alt=""
                    draggable="false"
                  />
                ))}
              </a>
            </div>
          </footer>
        </>
      ) : (
        <section className="telegram-paper telegram-invalid">
          <h1>Телеграмма не найдена</h1>
          <p>
            Ссылка неполная или повреждена. Попросите отправителя скопировать её
            заново.
          </p>
          <a href="/">На главную Tyter</a>
        </section>
      )}
    </main>
  );
}
