import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { applyTheme } from "./theme";

applyTheme();

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
      // Only a field being typed in brings the keyboard. iOS can report a short viewport without one
      // (after locking the screen or coming back to the app); the layout must not stay squeezed then.
      const kb = !zoomed && typing() && vv.height < html.clientHeight - 120;
      html.style.setProperty("--vv-top", (kb ? vv.offsetTop : 0) + "px");
      html.style.setProperty("--vv-height", (kb ? vv.height : html.clientHeight) + "px");
      html.classList.toggle("kb-open", kb);
    });
  };
  const typing = () => {
    const el = document.activeElement;
    if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true;
    if (el instanceof HTMLInputElement) return !["checkbox", "radio", "button", "submit", "range", "color", "file"].includes(el.type);
    return el instanceof HTMLElement && el.isContentEditable;
  };
  vv.addEventListener("resize", sync);
  vv.addEventListener("scroll", sync);
  window.addEventListener("resize", sync);
  window.addEventListener("pageshow", sync);
  document.addEventListener("visibilitychange", sync);
  document.addEventListener("focusin", sync);
  // Leaving a field: once the keyboard has gone, the full height comes back.
  document.addEventListener("focusout", () => {
    sync();
    window.setTimeout(sync, 400);
  });
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
