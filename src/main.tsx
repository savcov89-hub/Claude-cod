import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// The iOS keyboard covers the page instead of resizing it, so overlays size themselves
// to the visible area (--vv-top / --vv-height) and open right above the keyboard.
const vv = window.visualViewport;
if (vv) {
  let frame = 0;
  const sync = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const root = document.documentElement.style;
      root.setProperty("--vv-top", vv.offsetTop + "px");
      root.setProperty("--vv-height", vv.height + "px");
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
