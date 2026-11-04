import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { applyTheme } from "./theme";
import { CrashScreen } from "./ui/Crash";
import { keepInView, scrollBoxOf } from "./ui/keepInView";

applyTheme();

// The iOS keyboard covers the page instead of resizing it, so the phone layout and overlays size
// themselves to the visible area (--vv-top / --vv-height) and stay above the keyboard.
const vv = window.visualViewport;
if (vv) {
  let frame = 0;
  let pinned = 0;
  const sync = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const html = document.documentElement;
      // Pinch zoom also shrinks the visual viewport; only follow it at normal scale.
      const zoomed = Math.abs(vv.scale - 1) > 0.01;
      // Only a field being typed in brings the keyboard. iOS can report a short viewport without one
      // (after locking the screen or coming back to the app); the layout must not stay squeezed then.
      const kb = !zoomed && typing() && vv.height < html.clientHeight - 120;
      const top = kb ? vv.offsetTop : 0;
      // iOS has just moved the page up to show the field above the keyboard. Pinning the layout to the visible
      // area would move the field back under the keyboard, so its own list scrolls by as much: the field stays
      // where it is on screen instead of jumping down and up again.
      const field = kb && top !== pinned ? (document.activeElement as HTMLElement | null) : null;
      const box = field ? scrollBoxOf(field) : null;
      const before = box ? field!.getBoundingClientRect().top : 0;
      html.style.setProperty("--vv-top", top + "px");
      html.style.setProperty("--vv-height", (kb ? vv.height : html.clientHeight) + "px");
      html.classList.toggle("kb-open", kb);
      pinned = top;
      if (box) {
        const dy = field!.getBoundingClientRect().top - before;
        if (Math.abs(dy) > 1) box.scrollTop += dy;
      }
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

  // Once the keyboard has settled, the field being typed in (with the rest of its row and the next one) is brought
  // into the part above the keyboard and under the client tabs — with as small a smooth scroll as it takes.
  let settle = 0;
  const keepFocusVisible = () => {
    const el = document.activeElement;
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) keepInView(el);
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

// A phone keeps the app open for days. Coming back to it after a while, a newer published version is loaded at once
// (entries not saved yet stay on the phone and are sent after), so fixes reach every phone without reinstalling.
if (import.meta.env.PROD && import.meta.env.VITE_LOCAL_ONLY !== "1") {
  const running = document.querySelector('script[type="module"][src*="assets/"]')?.getAttribute("src");
  let hiddenAt = 0;
  document.addEventListener("visibilitychange", async () => {
    if (document.visibilityState === "hidden") {
      hiddenAt = Date.now();
      return;
    }
    if (!running || !hiddenAt || Date.now() - hiddenAt < 30000) return;
    hiddenAt = 0;
    try {
      const html = await (await fetch("./", { cache: "no-store" })).text();
      const published = html.match(/<script[^>]*type="module"[^>]*src="([^"]+)"/)?.[1];
      if (published && published !== running) location.reload();
    } catch {
      /* offline: the version on the phone */
    }
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <CrashScreen>
      <App />
    </CrashScreen>
  </StrictMode>,
);
