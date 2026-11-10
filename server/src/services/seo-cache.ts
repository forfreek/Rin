import { prerenderObjectKey, publicFeedPath } from "@rin/config";
import { path_join } from "../utils/path";
import { deleteStorageObjectAtKey } from "../utils/storage";

const PUBLIC_LIST_PATHS = ["/", "/timeline", "/moments", "/friends", "/hashtags"];
const GENERATED_FILES = ["sitemap.xml", "robots.txt", "rss.xml", "atom.xml", "rss.json", "feed.json"];

export async function refreshPublicSeo(env: Env, articles: Array<{ id: number | string; alias?: string | null }> = []) {
  const folder = env.S3_CACHE_FOLDER || "cache/";
  const keys = new Set<string>(GENERATED_FILES.map((name) => path_join(folder, name)));
  for (const page of PUBLIC_LIST_PATHS) {
    keys.add(prerenderObjectKey(folder, page));
  }
  for (const article of articles) {
    keys.add(prerenderObjectKey(folder, `/feed/${article.id}`));
    if (article.alias?.trim()) {
      keys.add(prerenderObjectKey(folder, publicFeedPath(article.id, article.alias)));
    }
  }

  await Promise.all(
    [...keys].map(async (key) => {
      try {
        await deleteStorageObjectAtKey(env, key);
      } catch (error) {
        console.log(`[SEO] cache delete failed for ${key}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }),
  );
}
