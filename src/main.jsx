import React, { lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import App from "./MinimalApp.jsx";
import LandingPage from "./LandingPage.jsx";
import NotFoundPage from "./NotFoundPage.jsx";
import WebProApp from "./WebProApp.jsx";
import HouseSnapshotPage from "./HouseSnapshotPage.jsx";
import TelegramPage from "./TelegramPage.jsx";
import TelegraphPage from "./TelegraphPage.jsx";
import { houseSnapshotScene } from "./house-snapshot.js";
import { BlogPage, HelpPage } from "./SitePages.jsx";
import DesignPage from "./DesignPage.jsx";
import LegalPage from "./LegalPage.jsx";
import { loadCasePage } from "./case-loader.js";
import CaseLoading from "./CaseLoading.jsx";
import { BLOG_ARTICLES, SITE_ROUTES } from "./site-content.js";
import { EditionContext } from "./edition.js";
import { readEditorPreferences } from "./editor-preferences.js";
import "./minimal.css";
import "./landing.css";
import "./scrollbars.css";
import "./editor-tools.css";
import "./themes.css";
import "./editor-ui.css";
import "./writing-timer.css";
import "./script-versions.css";
import "./script-doctor.css";
import "./pro/quests/quests.css";
import "./mobile-workspace.css";
import "./workspace-polish.css";
import "./shot-info.css";
import "./house-snapshot.css";

const desktop =
  location.protocol === "tyter:" && window.tyterDesktop?.edition === "pro";
const CasePage = lazy(loadCasePage);
const pathname = location.pathname.replace(/\/+$/, "") || "/";
if (!desktop && pathname === "/pay") location.replace("/beta");
if (!desktop && pathname === "/telegraph")
  location.replace(`/tytergraph/${location.search}${location.hash}`);
const webPro = ["/pro", "/beta"].includes(pathname);
const editor = desktop || ["/free", "/app"].includes(pathname) || webPro;
const housePage = pathname === "/house" || !!houseSnapshotScene(pathname);
document.documentElement.dataset.theme = readEditorPreferences().theme;
const article = BLOG_ARTICLES.find(({ slug }) => pathname === `/blog/${slug}`);
const notFound =
  !editor &&
  !housePage &&
  !["/", "/pay", ...SITE_ROUTES.map((path) => `/${path}`)].includes(pathname);
if (!editor) {
  document.documentElement.classList.add("site-mode");
  document.title = notFound ? "404 — Tyter" : "Tyter — редактор киносценариев";
  if (notFound) {
    const robots =
      document.querySelector('meta[name="robots"]') ||
      document.createElement("meta");
    robots.name = "robots";
    robots.content = "noindex";
    document.head.append(robots);
  }
}

createRoot(document.getElementById("root")).render(
  <EditionContext.Provider value={desktop}>
    {!desktop && webPro ? (
      <WebProApp />
    ) : editor ? (
      <App />
    ) : notFound ? (
      <NotFoundPage />
    ) : housePage ? (
      <HouseSnapshotPage />
    ) : pathname === "/telegram" ? (
      <TelegramPage />
    ) : ["/telegraph", "/tytergraph"].includes(pathname) ? (
      <TelegraphPage />
    ) : pathname === "/design" ? (
      <DesignPage />
    ) : pathname === "/license" ? (
      <LegalPage />
    ) : pathname === "/case" ? (
      <Suspense fallback={<CaseLoading />}>
        <CasePage />
      </Suspense>
    ) : pathname === "/help" ? (
      <HelpPage />
    ) : pathname === "/blog" || article ? (
      <BlogPage article={article} />
    ) : (
      <LandingPage alternate={pathname === "/b"} />
    )}
  </EditionContext.Provider>,
);

if (
  import.meta.env.PROD &&
  editor &&
  !desktop &&
  "serviceWorker" in navigator
) {
  navigator.serviceWorker
    .register("/editor-sw.js", { scope: "/", updateViaCache: "none" })
    .catch(() => {
      /* A cache failure must never prevent editing or local saves. */
    });
}
