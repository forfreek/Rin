import { describe, expect, it } from "bun:test";
import { buildCanonicalUrl, prerenderObjectKey, publicFeedPath } from "./canonical-url";

const origin = "https://xnotpro.site";

describe("buildCanonicalUrl", () => {
  it("uses a trailing slash for the homepage", () => {
    expect(buildCanonicalUrl(`${origin}/`, "/", "")).toBe(`${origin}/`);
    expect(buildCanonicalUrl(`  ${origin}  `, "/", "?utm_source=newsletter")).toBe(`${origin}/`);
  });

  it("keeps article paths and drops tracking parameters", () => {
    expect(buildCanonicalUrl(origin, "/hello-world", "?utm_source=x&fbclid=1")).toBe(`${origin}/hello-world`);
    expect(buildCanonicalUrl(origin, "/feed/12/", "?page=2")).toBe(`${origin}/feed/12`);
  });

  it("keeps homepage and search pages that select another result set", () => {
    expect(buildCanonicalUrl(origin, "/", "?page=2&limit=10&type=draft")).toBe(`${origin}/?page=2`);
    expect(buildCanonicalUrl(origin, "/search/rin", "?page=3&utm_medium=social")).toBe(`${origin}/search/rin?page=3`);
  });

  it("builds one storage key for equivalent public URLs", () => {
    expect(prerenderObjectKey("cache/", "/", "?utm_source=ads")).toBe("cache/index.html");
    expect(prerenderObjectKey("cache/", "/", "?page=2&limit=10")).toBe("cache/index.page-2.html");
    expect(prerenderObjectKey("/cache/", "/timeline/", "")).toBe("cache/timeline.html");
    expect(prerenderObjectKey("cache", "/feed/12", "?fbclid=1")).toBe("cache/feed/12.html");
    expect(publicFeedPath(12, "")).toBe("/feed/12");
    expect(publicFeedPath(12, " hello ")).toBe("/hello");
    expect(publicFeedPath(10, "免费域名")).toBe("/%E5%85%8D%E8%B4%B9%E5%9F%9F%E5%90%8D");
  });

  it("treats the first page as the collection root", () => {
    expect(buildCanonicalUrl(origin, "/", "?page=1")).toBe(`${origin}/`);
    expect(buildCanonicalUrl(origin, "/", "?page=0")).toBe(`${origin}/`);
    expect(buildCanonicalUrl(origin, "/", "?page=abc")).toBe(`${origin}/`);
    expect(buildCanonicalUrl(origin, "/search/rin", "?page=1")).toBe(`${origin}/search/rin`);
  });
});
