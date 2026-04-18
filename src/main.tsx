import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

const isInIframe = (() => {
  try { return window.self !== window.top; } catch { return true; }
})();
const isPreviewHost =
  window.location.hostname.includes("id-preview--") ||
  window.location.hostname.includes("lovableproject.com");

// Cleanup old VAPID service worker to avoid conflicts with OneSignal
if ('serviceWorker' in navigator && !isInIframe && !isPreviewHost) {
  navigator.serviceWorker.getRegistration('/service-worker.js')
    .then((registration) => registration?.unregister())
    .catch(console.error);
}

createRoot(document.getElementById("root")!).render(<App />);
