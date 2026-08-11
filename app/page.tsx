import { redirect } from "next/navigation";
import { getCurrentUser } from "../lib/auth";
import { getPublicConfig } from "../lib/config";
import PosApp from "./pos-app";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return (
    <PosApp
      currentUser={{ id: user.id, name: user.name, email: user.email, role: user.role }}
      config={getPublicConfig()}
    />
  );
}
