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

    expect(await browser.text()).toContain(canonical);
    expect(await bot.text()).toContain(canonical);
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
    const articleHtml = await article.text();
    const pageHtml = await page.text();

    expect(articleHtml).toContain("https://xnotpro.site/feed/12");
    expect(articleHtml).not.toContain("fbclid");
    expect(pageHtml).toContain("https://xnotpro.site/?page=2");
    expect(pageHtml).not.toContain("limit=10");
    expect(pageHtml).not.toContain("type=draft");
  });
});
