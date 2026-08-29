import { useSyncExternalStore } from "react";

export type Theme = "light" | "dark";

const STORAGE_KEY = "gflabel-theme";

/** The theme currently applied to <html> (set pre-paint by the inline script in index.html). */
export function getCurrentTheme(): Theme {
  const attr = document.documentElement.getAttribute("data-theme");
  return attr === "dark" ? "dark" : "light";
}

/** Apply a theme to <html> and persist the choice. */
export function setTheme(theme: Theme): void {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // localStorage unavailable — theme still applies for this session
  }
}

function subscribe(callback: () => void): () => void {
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  return () => observer.disconnect();
}

/**
 * Reactive current theme — re-renders the component whenever the `data-theme`
 * attribute on <html> changes (e.g. via the theme toggle). Use this where the
 * value must be a real color, not a CSS `var()` (e.g. the WebGL grid).
 */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, getCurrentTheme, () => "light");
}
