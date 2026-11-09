import { buildCanonicalUrl } from "@rin/config";

export function useCanonicalUrl() {
  if (typeof window === "undefined") {
    return "";
  }

  const current = new URL(window.location.href);
  const existing = document.querySelector('link[rel="canonical"]')?.getAttribute("href");
  let origin = current.origin;
  if (existing) {
    try {
      origin = new URL(existing, current.origin).origin;
    } catch {
      origin = current.origin;
    }
  }

  return buildCanonicalUrl(origin, current.pathname, current.search);
}
