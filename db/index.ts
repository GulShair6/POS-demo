import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as {
  atlasSql?: ReturnType<typeof postgres>;
  atlasDb?: ReturnType<typeof drizzle<typeof schema>>;
};

function parseDbUrl(url: string) {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

/** Supabase/PgBouncer transaction mode (port 6543) — no prepared statements. */
function isTransactionPooler(url: string) {
  const parsed = parseDbUrl(url);
  return parsed?.port === "6543";
}

function needsSsl(url: string) {
  const parsed = parseDbUrl(url);
  return Boolean(
    process.env.DATABASE_SSL === "true" ||
      parsed?.hostname.includes("supabase.co") ||
      parsed?.hostname.includes("pooler.supabase.com")
  );
}

export function getSql() {
  if (!globalForDb.atlasSql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is required");
    const transactionPooler = isTransactionPooler(url);
    const prepareEnv = process.env.DATABASE_PREPARE?.toLowerCase();
    // Transaction poolers reject named prepared statements. Session/direct can use them.
    const prepare = prepareEnv === "true" ? true : prepareEnv === "false" ? false : !transactionPooler;
    // On Vercel / transaction poolers keep a single connection per isolate.
    // Do NOT set max_pipeline: 0 — that breaks sql.begin / Drizzle transactions
    // (postgres.js never reserves the connection for BEGIN).
    const max = Number(process.env.DB_POOL_SIZE || (transactionPooler || process.env.VERCEL ? 1 : 10));
    globalForDb.atlasSql = postgres(url, {
      max: Number.isFinite(max) && max > 0 ? max : 1,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare,
      ssl: needsSsl(url) ? "require" : undefined
    });
  }
  return globalForDb.atlasSql;
}

export async function getDb() {
  if (!globalForDb.atlasDb) globalForDb.atlasDb = drizzle(getSql(), { schema });
  return globalForDb.atlasDb;
}
