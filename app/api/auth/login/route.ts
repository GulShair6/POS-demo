import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { employees } from "../../../../db/schema";
import { createSessionToken, SESSION_COOKIE } from "../../../../lib/auth";
import { verifyPassword } from "../../../../lib/password";

const attempts = new Map<string, { count: number; resetAt: number }>();

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  try {
    if (!origin || !host || new URL(origin).host !== host) throw new Error("origin");
  } catch {
    return Response.json({ error: "Invalid request origin" }, { status: 403 });
  }
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const now = Date.now();
  const state = attempts.get(ip);
  if (state && state.resetAt > now && state.count >= 8)
    return Response.json({ error: "Too many sign-in attempts. Try again later." }, { status: 429 });
  const payload = (await request.json().catch(() => ({}))) as { email?: string; password?: string };
  const db = await getDb();
  const employee = (
    await db
      .select()
      .from(employees)
      .where(eq(employees.email, payload.email?.trim().toLowerCase() || ""))
      .limit(1)
  )[0];
  if (!employee || !employee.active || !payload.password || !verifyPassword(payload.password, employee.passwordHash)) {
    attempts.set(ip, { count: state && state.resetAt > now ? state.count + 1 : 1, resetAt: now + 15 * 60 * 1000 });
    return Response.json({ error: "Invalid email or password" }, { status: 401 });
  }
  attempts.delete(ip);
  const token = createSessionToken({
    id: employee.id,
    name: employee.name,
    email: employee.email,
    role: employee.role
  });
  const response = Response.json({
    user: { id: employee.id, name: employee.name, email: employee.email, role: employee.role }
  });
  response.headers.append(
    "set-cookie",
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=43200${process.env.NODE_ENV === "production" ? "; Secure" : ""}`
  );
  return response;
}
