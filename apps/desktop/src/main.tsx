import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { OverlayApp } from "./overlay/OverlayApp";
import { getWindowLabel } from "./lib/tauri";
import { isOverlayPreviewRoute } from "./overlay-preview-route";
import "./styles.css";
import { createDesktopObservationSession } from "./features/observation/desktop-session";

export const desktopBootstrap = { mode: "mock", apiBaseUrl: import.meta.env?.VITE_API_BASE_URL ?? "http://localhost:4000/api/v1" };

const root = document.getElementById("root");
if (root) void getWindowLabel().then(async (label) => {
  if (label === "quick-overlay") {
    createRoot(root).render(<StrictMode><OverlayApp /></StrictMode>);
    return;
  }
  if (isOverlayPreviewRoute(window.location.pathname, import.meta.env?.DEV === true)) {
    const { OverlayPreview } = await import("./OverlayPreview");
    createRoot(root).render(<StrictMode><OverlayPreview /></StrictMode>);
    return;
  }
  const observationSession = createDesktopObservationSession();
  observationSession.start();
  window.addEventListener("beforeunload", () => observationSession.stop(), { once: true });
  createRoot(root).render(<StrictMode><App /></StrictMode>);
});
