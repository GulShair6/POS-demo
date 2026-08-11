import { sql } from "drizzle-orm";
import { getDb } from "../../../db";

export async function GET() {
  try { const db = await getDb(); await db.execute(sql`select 1`); return Response.json({ status: "ok", database: "connected", time: new Date().toISOString() }); }
  catch { return Response.json({ status: "error", database: "unavailable" }, { status: 503 }); }
}
