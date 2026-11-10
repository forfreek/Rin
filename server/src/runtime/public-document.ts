import { buildCanonicalUrl, normalizeFrontendUrl, prerenderObjectKey, publicFeedPath } from "@rin/config";

const STATIC_EXACT = new Set([
  "/",
  "/timeline",
  "/moments",
  "/friends",
  "/hashtags",
  "/login",
  "/callback",
  "/profile",
  "/user/github",
  "/user/github/callback",
]);

type FeedRow = { id: number; alias: string | null };

export type PublicDocument =
  | { action: "serve" }
  | { action: "redirect"; location: string }
  | { action: "missing" };

function normalizedPath(pathname: string) {
  if (!pathname || pathname === "/") return "/";
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return path.length > 1 ? path.replace(/\/+$/, "") : path;
}

function classify(pathname: string) {
  const path = normalizedPath(pathname);
  if (STATIC_EXACT.has(path) || path.startsWith("/admin")) return "static";
  if (/^\/hashtag\/[^/]+$/.test(path) || /^\/search\/[^/]+$/.test(path)) return "static";
  if (/^\/[^/]+\/user\/github$/.test(path)) return "static";
  const parts = path.split("/").filter(Boolean);
  if (parts.length === 1) return "alias";
  if (parts.length === 2 && parts[0] === "feed") return "feed";
  return "missing";
}

function appSearch(search: string) {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  if (!params.has("type") && !params.has("limit")) return null;
  const kept = new URLSearchParams();
  for (const [key, value] of params) {
    if (key === "type" || key === "limit" || key === "page") kept.append(key, value);
  }
  const query = kept.toString();
  return query ? `?${query}` : "";
}

function documentTarget(base: string, pathname: string, search: string) {
  const preserved = appSearch(search);
  if (preserved === null) return buildCanonicalUrl(base, pathname, search);
  const path = normalizedPath(pathname);
  return `${normalizeFrontendUrl(base)}${path === "/" ? "/" : path}${preserved}`;
}

function sameResource(current: URL, target: string) {
  const next = new URL(target);
  return current.origin === next.origin && current.pathname === next.pathname && current.search === next.search;
}

async function findFeed(env: Env, pathname: string): Promise<FeedRow | null | undefined> {
  const path = normalizedPath(pathname);
  const kind = classify(path);
  if (kind === "static") return undefined;
  if (kind === "missing") return null;
  if (!env.DB?.prepare) return undefined;

  const value = decodePath(path.split("/").filter(Boolean).at(-1) ?? "");
  if (kind === "feed" && /^[1-9]\d*$/.test(value)) {
    const byId = await env.DB.prepare("SELECT id, alias FROM feeds WHERE id = ?").bind(Number(value)).first<FeedRow>();
    if (byId) return byId;
  }
  return env.DB.prepare("SELECT id, alias FROM feeds WHERE alias = ?").bind(value).first<FeedRow>();
}

function decodePath(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export async function resolvePublicDocument(request: Request, env: Env): Promise<PublicDocument> {
  const current = new URL(request.url);
  const base = normalizeFrontendUrl(env.FRONTEND_URL ?? "") || current.origin;
  let targetPath = normalizedPath(current.pathname);
  const kind = classify(targetPath);

  if (kind === "alias" || kind === "feed") {
    const feed = await findFeed(env, targetPath);
    if (feed) {
      targetPath = publicFeedPath(feed.id, feed.alias);
    } else if (feed === null) {
      const missingTarget = documentTarget(base, targetPath, "");
      if (!sameResource(current, missingTarget)) return { action: "redirect", location: missingTarget };
      return { action: "missing" };
    }
  }

  if (kind === "missing") {
    const missingTarget = documentTarget(base, targetPath, "");
    if (!sameResource(current, missingTarget)) return { action: "redirect", location: missingTarget };
    return { action: "missing" };
  }

  const target = documentTarget(base, targetPath, current.search);
  if (sameResource(current, target)) return { action: "serve" };
  return { action: "redirect", location: target };
}

export function redirectPreservingTarget(request: Request, frontendUrl: string) {
  const base = normalizeFrontendUrl(frontendUrl);
  if (!base) return null;
  let origin: string;
  try {
    origin = new URL(base).origin;
  } catch {
    return null;
  }
  const current = new URL(request.url);
  if (current.origin === origin) return null;
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  return Response.redirect(`${origin}${current.pathname}${current.search}`, 301);
}

async function readStoredHtml(env: Env, key: string) {
  if (env.R2_BUCKET) {
    const object = await env.R2_BUCKET.get(key);
    if (!object) return null;
    return new Response(object.body).text();
  }

  const { getStorageObject } = await import("../utils/storage");
  const stored = await getStorageObject(env, key);
  return stored ? stored.text() : null;
}

function canReadStorage(env: Env) {
  return Boolean(env.R2_BUCKET || (env.S3_ENDPOINT && env.S3_BUCKET && env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY));
}

export async function readPrerenderedHtml(request: Request, env: Env) {
  if (!canReadStorage(env)) return null;
  const url = new URL(request.url);
  const key = prerenderObjectKey(env.S3_CACHE_FOLDER || "cache/", url.pathname, url.search);
  try {
    const html = await readStoredHtml(env, key);
    if (!html?.includes("<html")) return null;
    return new Response(html, {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "public, max-age=300",
      },
    });
  } catch (error) {
    console.log(`[SEO] prerender read failed: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}
