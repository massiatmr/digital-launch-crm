import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Register Service Worker (skip in iframes / preview)
const isInIframe = (() => {
  try { return window.self !== window.top; } catch { return true; }
})();
const isPreviewHost =
  window.location.hostname.includes("id-preview--") ||
  window.location.hostname.includes("lovableproject.com");

if ('serviceWorker' in navigator && !isInIframe && !isPreviewHost) {
  navigator.serviceWorker.register('/service-worker.js').catch(console.error);
}

createRoot(document.getElementById("root")!).render(<App />);
