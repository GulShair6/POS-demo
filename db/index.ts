import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as {
  atlasSql?: ReturnType<typeof postgres>;
  atlasDb?: ReturnType<typeof drizzle<typeof schema>>;
};

export function getSql() {
  if (!globalForDb.atlasSql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is required");
    globalForDb.atlasSql = postgres(url, {
      max: Number(process.env.DB_POOL_SIZE || 10),
      idle_timeout: 20,
      connect_timeout: 10
    });
  }
  return globalForDb.atlasSql;
}

export async function getDb() {
  if (!globalForDb.atlasDb) globalForDb.atlasDb = drizzle(getSql(), { schema });
  return globalForDb.atlasDb;
}
