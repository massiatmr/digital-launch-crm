import { useEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

/**
 * Mémorise la position de scroll par clé d'historique (location.key).
 * - POP (back/forward) → restaure la position mémorisée
 * - PUSH/REPLACE → scroll en haut
 *
 * On capture aussi le scroll du <main> (AppLayout) car le contenu
 * scrolle dans ce conteneur, pas sur window.
 */
const STORAGE_KEY = "scroll-positions";

type Positions = Record<string, { window: number; main: number }>;

function loadPositions(): Positions {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}
function savePositions(p: Positions) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

const ScrollRestoration = () => {
  const location = useLocation();
  const navType = useNavigationType(); // 'POP' | 'PUSH' | 'REPLACE'
  const prevKeyRef = useRef<string | null>(null);

  // Sauvegarde la position de la route précédente AVANT que la nouvelle se monte
  useEffect(() => {
    const prevKey = prevKeyRef.current;
    if (prevKey) {
      const positions = loadPositions();
      const main = document.querySelector("main");
      positions[prevKey] = {
        window: window.scrollY || 0,
        main: main?.scrollTop || 0,
      };
      savePositions(positions);
    }

    const key = location.key;
    const positions = loadPositions();

    if (navType === "POP" && positions[key]) {
      // Restaure après le rendu
      requestAnimationFrame(() => {
        window.scrollTo({ top: positions[key].window, left: 0 });
        const main = document.querySelector("main");
        if (main) main.scrollTop = positions[key].main;
      });
    } else {
      // Nouvelle navigation : haut de page
      requestAnimationFrame(() => {
        window.scrollTo({ top: 0, left: 0 });
        const main = document.querySelector("main");
        if (main) main.scrollTop = 0;
      });
    }

    prevKeyRef.current = key;
  }, [location.key, navType]);

  return null;
};

export default ScrollRestoration;
