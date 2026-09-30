export default function NotFoundPage() {
  return (
    <div className="landing">
      <header className="landing-nav">
        <a className="landing-brand" href="/" aria-label="Tyter — главная">
          <img src="/brand/tyter-logo.svg" alt="" />
          Tyter
        </a>
        <a className="landing-button black" href="/free">
          Бесплатная версия
        </a>
      </header>
      <main className="landing-hero">
        <h1>404</h1>
        <h2>Страница не найдена</h2>
        <p>Проверьте адрес или вернитесь к своей истории.</p>
        <div className="landing-download-buttons">
          <a className="landing-button black" href="/">
            На главную
          </a>
          <a className="landing-button purple" href="/pro">
            Открыть PRO
          </a>
        </div>
      </main>
    </div>
  );
}
