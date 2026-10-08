import React from "react";
import { createRoot } from "react-dom/client";
import App from "./MinimalApp.jsx";
import LandingPage from "./LandingPage.jsx";
import NotFoundPage from "./NotFoundPage.jsx";
import WebProApp from "./WebProApp.jsx";
import { EditionContext } from "./edition.js";
import { readEditorPreferences } from "./editor-preferences.js";
import "./minimal.css";
import "./landing.css";
import "./scrollbars.css";
import "./editor-tools.css";
import "./themes.css";

const desktop =
  location.protocol === "tyter:" && window.tyterDesktop?.edition === "pro";
const pathname = location.pathname.replace(/\/+$/, "") || "/";
if (!desktop && pathname === "/pay") location.replace("/pro");
const editor = desktop || ["/free", "/app", "/pro"].includes(pathname);
document.documentElement.dataset.theme = editor
  ? readEditorPreferences().theme
  : "light";
const notFound = !editor && !["/", "/pay"].includes(pathname);
if (!editor) {
  document.documentElement.classList.add("site-mode");
  document.title = notFound ? "404 — Tyter" : "Tyter — редактор киносценариев";
  if (notFound) {
    const robots = document.createElement("meta");
    robots.name = "robots";
    robots.content = "noindex";
    document.head.append(robots);
  }
}

createRoot(document.getElementById("root")).render(
  <EditionContext.Provider value={desktop}>
    {!desktop && pathname === "/pro" ? (
      <WebProApp />
    ) : editor ? (
      <App />
    ) : notFound ? (
      <NotFoundPage />
    ) : (
      <LandingPage />
    )}
  </EditionContext.Provider>,
);
