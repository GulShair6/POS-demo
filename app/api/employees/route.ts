import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { auditLogs, employees } from "../../../db/schema";
import { authorize } from "../../../lib/auth";
import { hashPassword } from "../../../lib/password";

const allowedRoles = ["Owner", "Manager", "Supervisor", "Cashier", "Inventory", "Accountant", "Auditor"];

export async function POST(request: Request) {
  try {
    const auth = await authorize(request, "employees.manage");
    if (auth.response) return auth.response;
    const payload = await request.json() as { name?: string; email?: string; role?: string; password?: string };
    if (!payload.name?.trim() || !payload.email?.trim() || !payload.password || !allowedRoles.includes(payload.role ?? "")) return Response.json({ error: "Valid name, email, role and temporary password are required" }, { status: 400 });
    const db = await getDb();
    const [employee] = await db.insert(employees).values({ name: payload.name.trim(), email: payload.email.trim().toLowerCase(), role: payload.role!, passwordHash: hashPassword(payload.password) }).returning();
    await db.insert(auditLogs).values({ actor: auth.user.name, action: "employee.created", entityType: "employee", entityId: String(employee.id), details: `${employee.name} · ${employee.role}` });
    const safeEmployee = { id: employee.id, name: employee.name, email: employee.email, role: employee.role, active: employee.active, createdAt: employee.createdAt };
    return Response.json({ employee: safeEmployee }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to create employee" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await authorize(request, "employees.manage");
    if (auth.response) return auth.response;
    const payload = await request.json() as { id?: number; role?: string; active?: boolean };
    if (!payload.id || (payload.role && !allowedRoles.includes(payload.role))) return Response.json({ error: "Valid employee and role are required" }, { status: 400 });
    if (payload.id === auth.user.id && (payload.active === false || (payload.role && payload.role !== auth.user.role))) return Response.json({ error: "You cannot disable or change the role of your active account" }, { status: 409 });
    const db = await getDb();
    const [employee] = await db.update(employees).set({ ...(payload.role ? { role: payload.role } : {}), ...(payload.active !== undefined ? { active: payload.active } : {}) }).where(eq(employees.id, payload.id)).returning();
    if (!employee) return Response.json({ error: "Employee not found" }, { status: 404 });
    await db.insert(auditLogs).values({ actor: auth.user.name, action: "employee.updated", entityType: "employee", entityId: String(employee.id), details: `${employee.name} · ${employee.role} · ${employee.active ? "active" : "inactive"}` });
    const safeEmployee = { id: employee.id, name: employee.name, email: employee.email, role: employee.role, active: employee.active, createdAt: employee.createdAt };
    return Response.json({ employee: safeEmployee });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to update employee" }, { status: 500 });
  }
}
