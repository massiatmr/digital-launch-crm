import { useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";

/**
 * Retourne une fonction de "retour intelligent" :
 * - Si on a navigué depuis une page de l'app (history.idx > 0), fait navigate(-1)
 *   → restaure scroll + filtres + contexte d'où on venait.
 * - Sinon (entrée directe via URL), fallback vers la route fournie.
 */
export function useSmartBack(fallback: string = "/") {
  const navigate = useNavigate();
  const location = useLocation();

  return useCallback(() => {
    // location.key === 'default' = première entrée dans l'app, pas d'historique interne
    const hasInternalHistory =
      location.key !== "default" && window.history.length > 1;

    if (hasInternalHistory) {
      navigate(-1);
    } else {
      navigate(fallback);
    }
  }, [navigate, location.key, fallback]);
}
