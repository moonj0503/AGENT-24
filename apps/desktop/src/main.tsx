import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { OverlayApp } from "./overlay/OverlayApp";
import { getWindowLabel } from "./lib/tauri";
import "./styles.css";

export const desktopBootstrap = { mode: "mock", apiBaseUrl: import.meta.env?.VITE_API_BASE_URL ?? "http://localhost:4000/api/v1" };

const root = document.getElementById("root");
if (root) void getWindowLabel().then((label) => createRoot(root).render(<StrictMode>{label === "quick-overlay" ? <OverlayApp /> : <App />}</StrictMode>));
