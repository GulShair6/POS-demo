import { authorize } from "../../../../lib/auth";

export async function GET(request: Request) {
  const auth = await authorize(request, "pos.use");
  if (auth.response) return auth.response;
  return Response.json({ user: auth.user });
}
