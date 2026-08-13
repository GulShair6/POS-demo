import { SESSION_COOKIE } from "../../../../lib/auth";

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  try {
    if (!origin || !host || new URL(origin).host !== host) throw new Error("origin");
  } catch {
    return Response.json({ error: "Invalid request origin" }, { status: 403 });
  }
  const response = Response.json({ ok: true });
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const secure = forwardedProto === "https" || (!forwardedProto && new URL(request.url).protocol === "https:");
  response.headers.append(
    "set-cookie",
    `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure ? "; Secure" : ""}`
  );
  return response;
}
