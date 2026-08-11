import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { auditLogs, customers } from "../../../db/schema";
import { authorize } from "../../../lib/auth";

export async function POST(request: Request) {
  try {
    const auth = await authorize(request, "customers.manage");
    if (auth.response) return auth.response;
    const payload = await request.json() as { name?: string; email?: string; phone?: string };
    if (!payload.name?.trim()) return Response.json({ error: "Customer name is required" }, { status: 400 });
    const db = await getDb();
    const [customer] = await db.insert(customers).values({ name: payload.name.trim(), email: payload.email?.trim() || null, phone: payload.phone?.trim() || null }).returning();
    await db.insert(auditLogs).values({ actor: auth.user.name, action: "customer.created", entityType: "customer", entityId: String(customer.id), details: customer.name });
    return Response.json({ customer }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to create customer" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await authorize(request, "customers.manage");
    if (auth.response) return auth.response;
    const payload = await request.json() as { id?: number; name?: string; email?: string; phone?: string };
    if (!payload.id) return Response.json({ error: "Customer ID is required" }, { status: 400 });
    const db = await getDb();
    const [customer] = await db.update(customers).set({ ...(payload.name !== undefined ? { name: payload.name.trim() } : {}), ...(payload.email !== undefined ? { email: payload.email.trim() || null } : {}), ...(payload.phone !== undefined ? { phone: payload.phone.trim() || null } : {}) }).where(eq(customers.id, payload.id)).returning();
    return customer ? Response.json({ customer }) : Response.json({ error: "Customer not found" }, { status: 404 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to update customer" }, { status: 500 });
  }
}
