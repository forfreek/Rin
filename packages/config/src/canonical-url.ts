function isPaginatedPath(pathname: string) {
  return pathname === "/" || pathname.startsWith("/search/");
}

function canonicalPage(search: string) {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const page = params.get("page");
  if (!page || !/^[1-9]\d*$/.test(page)) {
    return null;
  }
  const pageNumber = Number(page);
  return pageNumber >= 2 ? String(pageNumber) : null;
}

export function normalizeFrontendUrl(frontendUrl: string) {
  return frontendUrl.trim().replace(/\/+$/, "");
}

export function publicFeedPath(id: number | string, alias?: string | null) {
  const trimmed = alias?.trim();
  if (!trimmed) {
    return `/feed/${id}`;
  }
  return `/${encodeURIComponent(trimmed)}`;
}

export function prerenderObjectKey(cacheFolder: string, pathname: string, search = "") {
  const folder = cacheFolder.trim().replace(/^\/+|\/+$/g, "");
  const canonical = new URL(buildCanonicalUrl("https://canonical.invalid", pathname, search));
  let name = canonical.pathname === "/" ? "index" : decodePath(canonical.pathname).replace(/^\/+/, "");
  const page = canonical.searchParams.get("page");
  if (page) {
    name += `.page-${page}`;
  }
  name += ".html";
  return folder ? `${folder}/${name}` : name;
}

function decodePath(pathname: string) {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return pathname;
  }
}

/**
 * Build the public canonical URL for a page.
 * Homepage keeps a trailing slash. List pages keep `page` when it selects
 * another result set. Tracking parameters and hashes are omitted.
 */
export function buildCanonicalUrl(frontendUrl: string, pathname: string, search = "") {
  const base = normalizeFrontendUrl(frontendUrl);
  let path = pathname || "/";
  if (!path.startsWith("/")) {
    path = `/${path}`;
  }
  if (path.length > 1) {
    path = path.replace(/\/+$/, "");
  }

  const page = isPaginatedPath(path) ? canonicalPage(search) : null;
  if (path === "/") {
    return page ? `${base}/?page=${page}` : `${base}/`;
  }
  return page ? `${base}${path}?page=${page}` : `${base}${path}`;
}
