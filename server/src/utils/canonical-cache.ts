import { normalizeFrontendUrl } from "@rin/config";

function configuredOrigin(frontendUrl: string) {
  try {
    return new URL(normalizeFrontendUrl(frontendUrl)).origin;
  } catch {
    return "";
  }
}

function sameOrigin(value: string, origin: string) {
  try {
    return new URL(value.trim()).origin === origin;
  } catch {
    return false;
  }
}

function structuralUrls(body: string) {
  const matches = body.match(/https?:\/\/[^\s"'<>]+/g) ?? [];
  const urls: URL[] = [];
  for (const match of matches) {
    const cleaned = match.replace(/&amp;/g, "&").replace(/[),.;]+$/g, "");
    try {
      const url = new URL(cleaned);
      const path = url.pathname;
      if (
        path === "/" ||
        path.startsWith("/feed/") ||
        path === "/rss.xml" ||
        path === "/atom.xml" ||
        path === "/rss.json" ||
        path === "/feed.json" ||
        path === "/sitemap.xml"
      ) {
        urls.push(url);
      }
    } catch {
      // Ignore values that are not absolute URLs.
    }
  }
  return urls;
}

export function sitemapCacheMatchesOrigin(body: string, frontendUrl: string) {
  const origin = configuredOrigin(frontendUrl);
  if (!origin) return false;
  const locs = [...body.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map((match) =>
    match[1].replace(/&amp;/g, "&"),
  );
  return locs.length > 0 && locs.every((loc) => sameOrigin(loc, origin));
}

export function robotsCacheMatchesOrigin(body: string, frontendUrl: string) {
  const origin = configuredOrigin(frontendUrl);
  if (!origin) return false;
  const match = body.match(/^Sitemap:\s*(\S+)/im);
  return Boolean(match && sameOrigin(match[1], origin));
}

export function feedCacheMatchesOrigin(body: string, frontendUrl: string) {
  const origin = configuredOrigin(frontendUrl);
  if (!origin) return false;
  const urls = structuralUrls(body);
  return urls.length > 0 && urls.every((url) => url.origin === origin);
}
