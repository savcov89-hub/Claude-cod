import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// The iOS keyboard covers the page instead of resizing it, so the phone layout and overlays size
// themselves to the visible area (--vv-top / --vv-height) and stay above the keyboard.
const vv = window.visualViewport;
if (vv) {
  let frame = 0;
  const sync = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const html = document.documentElement;
      // Pinch zoom also shrinks the visual viewport; only follow it at normal scale.
      const zoomed = Math.abs(vv.scale - 1) > 0.01;
      html.style.setProperty("--vv-top", (zoomed ? 0 : vv.offsetTop) + "px");
      html.style.setProperty("--vv-height", (zoomed ? html.clientHeight : vv.height) + "px");
      html.classList.toggle("kb-open", !zoomed && vv.height < html.clientHeight - 120);
    });
  };
  vv.addEventListener("resize", sync);
  vv.addEventListener("scroll", sync);
  sync();

  // iOS scrolls the page for the keyboard, but the fixed layout shrinks instead, so the field being typed in
  // can end up under the keyboard. Scroll its own list so the field stays in the visible part.
  let settle = 0;
  const keepFocusVisible = () => {
    const el = document.activeElement;
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) || Math.abs(vv.scale - 1) > 0.01) return;
    let box = el.parentElement;
    while (box && !(/(auto|scroll)/.test(getComputedStyle(box).overflowY) && box.scrollHeight > box.clientHeight)) box = box.parentElement;
    if (!box) return;
    const r = el.getBoundingClientRect();
    const b = box.getBoundingClientRect();
    const top = Math.max(b.top, vv.offsetTop);
    const bottom = Math.min(b.bottom, vv.offsetTop + vv.height);
    if (r.top >= top + 8 && r.bottom <= bottom - 8) return;
    box.scrollTop += r.top + r.height / 2 - (top + bottom) / 2;
  };
  const later = () => {
    clearTimeout(settle);
    settle = window.setTimeout(keepFocusVisible, 350);
  };
  vv.addEventListener("resize", later);
  document.addEventListener("focusin", later);
}

// The app is kept on the phone and opens without a network (public/sw.js). Not in development or the one-file test build.
if (import.meta.env.PROD && import.meta.env.VITE_LOCAL_ONLY !== "1" && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => undefined);
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
