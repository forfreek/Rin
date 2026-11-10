import { afterEach, describe, expect, it, mock } from "bun:test";

const getAppFetch = mock();

mock.module("../app-instance", () => ({
  getApp: () => ({
    fetch: getAppFetch,
  }),
}));

describe("handleFetch", () => {
  afterEach(() => {
    getAppFetch.mockReset();
  });

  it("serves static assets directly when the asset exists", async () => {
    getAppFetch.mockResolvedValue(new Response("app-body", { status: 200 }));

    const { handleFetch } = await import("../fetch-handler");
    const assetFetch = mock(async () => new Response("asset-body", { status: 200 }));

    const response = await handleFetch(
      new Request("http://localhost/assets/app.js"),
      {
        ASSETS: {
          fetch: assetFetch,
        },
      } as unknown as Env,
    );

    expect(await response.text()).toBe("asset-body");
    expect(assetFetch).toHaveBeenCalledTimes(1);
    expect(getAppFetch).toHaveBeenCalledTimes(0);
  });

  it("routes /api/blob requests to the app before static assets", async () => {
    getAppFetch.mockResolvedValue(new Response("blob-body", { status: 200 }));

    const { handleFetch } = await import("../fetch-handler");
    const assetFetch = mock(async () => new Response("asset-body", { status: 404 }));

    const executionContext = {} as ExecutionContext;
    const response = await handleFetch(
      new Request("http://localhost/api/blob/images/test.txt"),
      {
        ASSETS: {
          fetch: assetFetch,
        },
      } as unknown as Env,
      executionContext,
    );

    expect(await response.text()).toBe("blob-body");
    expect(getAppFetch).toHaveBeenCalledTimes(1);
    expect(assetFetch).toHaveBeenCalledTimes(0);
    expect(new URL(getAppFetch.mock.calls[0][0].url).pathname).toBe("/blob/images/test.txt");
    expect(getAppFetch.mock.calls[0][2]).toBe(executionContext);
  });

  it("injects the same canonical link for browsers and Googlebot", async () => {
    const { handleFetch } = await import("../fetch-handler");
    const html = "<!DOCTYPE html><html><head></head><body><div id=\"root\"></div></body></html>";
    const env = {
      FRONTEND_URL: "https://xnotpro.site",
      ASSETS: {
        fetch: async () => new Response(html, {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
      },
    } as unknown as Env;

    const browser = await handleFetch(new Request("http://www.xnotpro.site/?utm_source=ads"), env);
    const bot = await handleFetch(
      new Request("http://xnotpro.site/", {
        headers: { "user-agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" },
      }),
      env,
    );
    const canonical = '<link rel="canonical" href="https://xnotpro.site/" data-react-helmet="true" />';
    const direct = await handleFetch(new Request("https://xnotpro.site/"), env);

    expect(browser.status).toBe(301);
    expect(browser.headers.get("location")).toBe("https://xnotpro.site/");
    expect(bot.status).toBe(301);
    expect(bot.headers.get("location")).toBe("https://xnotpro.site/");
    expect(await direct.text()).toContain(canonical);
  });

  it("injects article and paginated canonical URLs from FRONTEND_URL", async () => {
    const { handleFetch } = await import("../fetch-handler");
    const html = "<!DOCTYPE html><html><head></head><body></body></html>";
    const env = {
      FRONTEND_URL: "https://xnotpro.site/",
      ASSETS: {
        fetch: async () => new Response(html, {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
      },
    } as unknown as Env;

    const article = await handleFetch(new Request("https://www.xnotpro.site/feed/12?fbclid=1"), env);
    const page = await handleFetch(new Request("https://xnotpro.site/?page=2&limit=10&type=draft"), env);
    const trackedDrafts = await handleFetch(new Request("https://www.xnotpro.site/?type=draft&utm_source=ads"), env);
    const articlePage = await handleFetch(new Request("https://xnotpro.site/feed/12"), env);
    const pageHtml = await page.text();

    expect(article.status).toBe(301);
    expect(article.headers.get("location")).toBe("https://xnotpro.site/feed/12");
    expect(page.status).toBe(200);
    expect(pageHtml).toContain("https://xnotpro.site/?page=2");
    expect(pageHtml).not.toContain("type=draft");
    expect(trackedDrafts.status).toBe(301);
    expect(trackedDrafts.headers.get("location")).toBe("https://xnotpro.site/?type=draft");
    expect(await articlePage.text()).toContain("https://xnotpro.site/feed/12");
  });

  it("redirects a numbered article URL to its alias and rejects unknown paths", async () => {
    const { handleFetch } = await import("../fetch-handler");
    const html = "<!DOCTYPE html><html><head></head><body>rendered</body></html>";
    const env = {
      FRONTEND_URL: "https://xnotpro.site",
      S3_CACHE_FOLDER: "cache/",
      DB: {
        prepare: (sql: string) => ({
          bind: (...args: unknown[]) => ({
            first: async () => {
              if (sql.includes("alias = ?") && args[0] === "hello") return { id: 12, alias: "hello" };
              if (sql.includes("id = ?") && args[0] === 12) return { id: 12, alias: "hello" };
              return null;
            },
          }),
        }),
      },
      R2_BUCKET: {
        get: async (key: string) => {
          if (key !== "cache/hello.html") return null;
          return {
            body: html,
            size: html.length,
            uploaded: new Date(),
            httpEtag: "etag",
            writeHttpMetadata(headers: Headers) {
              headers.set("content-type", "text/html; charset=utf-8");
            },
          };
        },
      },
    } as unknown as Env;

    const numbered = await handleFetch(new Request("https://xnotpro.site/feed/12"), env);
    const alias = await handleFetch(new Request("https://xnotpro.site/hello"), env);
    const missing = await handleFetch(new Request("https://xnotpro.site/missing-page"), env);

    expect(numbered.status).toBe(301);
    expect(numbered.headers.get("location")).toBe("https://xnotpro.site/hello");
    expect(await alias.text()).toBe(html);
    expect(missing.status).toBe(404);
  });
});
