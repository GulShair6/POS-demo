import { eq, sql } from "drizzle-orm";
import { getDb } from "../../../../db";
import { employees, loginAttempts } from "../../../../db/schema";
import { createSessionToken, SESSION_COOKIE } from "../../../../lib/auth";
import { verifyPassword } from "../../../../lib/password";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  try {
    if (!origin || !host || new URL(origin).host !== host) throw new Error("origin");
  } catch {
    return Response.json({ error: "Invalid request origin" }, { status: 403 });
  }
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const db = await getDb();
  const now = Date.now();
  const existing = (await db.select().from(loginAttempts).where(eq(loginAttempts.ip, ip)).limit(1))[0];
  const resetAtMs = existing ? new Date(existing.resetAt).getTime() : 0;
  if (existing && resetAtMs > now && existing.count >= MAX_ATTEMPTS) {
    return Response.json({ error: "Too many sign-in attempts. Try again later." }, { status: 429 });
  }
  const payload = (await request.json().catch(() => ({}))) as { email?: string; password?: string };
  const employee = (
    await db
      .select()
      .from(employees)
      .where(eq(employees.email, payload.email?.trim().toLowerCase() || ""))
      .limit(1)
  )[0];
  if (!employee || !employee.active || !payload.password || !verifyPassword(payload.password, employee.passwordHash)) {
    const nextReset = new Date(now + WINDOW_MS).toISOString();
    if (!existing || resetAtMs <= now) {
      await db
        .insert(loginAttempts)
        .values({ ip, count: 1, resetAt: nextReset })
        .onConflictDoUpdate({ target: loginAttempts.ip, set: { count: 1, resetAt: nextReset } });
    } else {
      await db
        .update(loginAttempts)
        .set({ count: sql`${loginAttempts.count} + 1` })
        .where(eq(loginAttempts.ip, ip));
    }
    return Response.json({ error: "Invalid email or password" }, { status: 401 });
  }
  if (existing) await db.delete(loginAttempts).where(eq(loginAttempts.ip, ip));
  const token = createSessionToken({
    id: employee.id,
    name: employee.name,
    email: employee.email,
    role: employee.role
  });
  const response = Response.json({
    user: { id: employee.id, name: employee.name, email: employee.email, role: employee.role }
  });
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const secure = forwardedProto === "https" || (!forwardedProto && new URL(request.url).protocol === "https:");
  response.headers.append(
    "set-cookie",
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=43200${secure ? "; Secure" : ""}`
  );
  return response;
}
