import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as {
  atlasSql?: ReturnType<typeof postgres>;
  atlasDb?: ReturnType<typeof drizzle<typeof schema>>;
};

function isTransactionPooler(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.port === "6543" || parsed.hostname.includes("pooler.supabase.com");
  } catch {
    return false;
  }
}

export function getSql() {
  if (!globalForDb.atlasSql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is required");
    const pooler = isTransactionPooler(url);
    const prepareEnv = process.env.DATABASE_PREPARE?.toLowerCase();
    const prepare = prepareEnv === "true" ? true : prepareEnv === "false" ? false : !pooler;
    const max = Number(process.env.DB_POOL_SIZE || (pooler || process.env.VERCEL ? 1 : 10));
    const options: Parameters<typeof postgres>[1] = {
      max: Number.isFinite(max) && max > 0 ? max : 1,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare,
      ssl: pooler || url.includes("supabase.co") || process.env.DATABASE_SSL === "true" ? "require" : undefined
    };
    // Supavisor transaction mode can drop pipelined responses; disable pipelining on poolers.
    if (!prepare) (options as { max_pipeline?: number }).max_pipeline = 0;
    globalForDb.atlasSql = postgres(url, options);
  }
  return globalForDb.atlasSql;
}

export async function getDb() {
  if (!globalForDb.atlasDb) globalForDb.atlasDb = drizzle(getSql(), { schema });
  return globalForDb.atlasDb;
}
