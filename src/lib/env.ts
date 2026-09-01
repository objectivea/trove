import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * Every Cloudflare binding the app uses. `wrangler types` regenerates
 * cloudflare-env.d.ts from wrangler.jsonc; this is the runtime accessor.
 */
export type Env = {
  DB: D1Database;
  MEDIA: R2Bucket;
  VECTORS: VectorizeIndex;
  AI: Ai;
  GEMINI_API_KEY?: string;
};

export async function env(): Promise<Env> {
  const { env } = await getCloudflareContext({ async: true });
  return env as unknown as Env;
}
