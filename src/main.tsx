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
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
