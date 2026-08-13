import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { employees } from "../db/schema";
import { hasPermission, type Permission } from "./permissions";

export type { Permission } from "./permissions";
export { hasPermission } from "./permissions";
export type SessionUser = { id: number; name: string; email: string; role: string; exp: number };

export const SESSION_COOKIE = "atlas_session";

function secret() {
  const value = process.env.SESSION_SECRET || "";
  if (value.length < 32) throw new Error("SESSION_SECRET must contain at least 32 characters");
  return value;
}

function sign(value: string) {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

export function createSessionToken(user: Omit<SessionUser, "exp">) {
  const body = Buffer.from(JSON.stringify({ ...user, exp: Date.now() + 12 * 60 * 60 * 1000 })).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function readSessionToken(token?: string | null): SessionUser | null {
  if (!token) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  const expected = Buffer.from(sign(body));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const user = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionUser;
    return user.exp > Date.now() && user.id > 0 && !!user.email ? user : null;
  } catch {
    return null;
  }
}

export async function getCurrentUser() {
  const store = await cookies();
  const session = readSessionToken(store.get(SESSION_COOKIE)?.value);
  if (!session) return null;
  const db = await getDb();
  const employee = (await db.select().from(employees).where(eq(employees.id, session.id)).limit(1))[0];
  return employee?.active
    ? { id: employee.id, name: employee.name, email: employee.email, role: employee.role, exp: session.exp }
    : null;
}

function requestToken(request: Request) {
  const match = request.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function originIsValid(request: Request) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return true;
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const forwardedHost = request.headers.get("x-forwarded-host") || request.headers.get("host");
  try {
    return !!forwardedHost && new URL(origin).host === forwardedHost;
  } catch {
    return false;
  }
}

export async function authorize(
  request: Request,
  permission: Permission
): Promise<{ user: SessionUser; response?: never } | { user?: never; response: Response }> {
  if (!originIsValid(request)) return { response: Response.json({ error: "Invalid request origin" }, { status: 403 }) };
  const session = readSessionToken(requestToken(request));
  if (!session) return { response: Response.json({ error: "Authentication required" }, { status: 401 }) };
  const db = await getDb();
  const employee = (await db.select().from(employees).where(eq(employees.id, session.id)).limit(1))[0];
  if (!employee?.active) return { response: Response.json({ error: "Authentication required" }, { status: 401 }) };
  const user: SessionUser = {
    id: employee.id,
    name: employee.name,
    email: employee.email,
    role: employee.role,
    exp: session.exp
  };
  if (!hasPermission(user, permission))
    return { response: Response.json({ error: "You do not have permission for this action" }, { status: 403 }) };
  return { user };
}
