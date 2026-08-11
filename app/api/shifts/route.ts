import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { auditLogs, cashDrawerMovements, registerShifts } from "../../../db/schema";
import { authorize } from "../../../lib/auth";
import { getPublicConfig } from "../../../lib/config";

export async function GET(request: Request) {
  try {
    const auth = await authorize(request, "pos.use");
    if (auth.response) return auth.response;
    const db = await getDb();
    const registerCode = getPublicConfig().registerCode;
    const shift =
      (
        await db
          .select()
          .from(registerShifts)
          .where(and(eq(registerShifts.status, "open"), eq(registerShifts.registerCode, registerCode)))
          .orderBy(desc(registerShifts.id))
          .limit(1)
      )[0] ?? null;
    const movements = shift
      ? await db
          .select()
          .from(cashDrawerMovements)
          .where(eq(cashDrawerMovements.shiftId, shift.id))
          .orderBy(desc(cashDrawerMovements.id))
      : [];
    return Response.json({ shift, movements });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to load shift" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await authorize(request, "pos.use");
    if (auth.response) return auth.response;
    const payload = (await request.json()) as {
      action?: string;
      openingFloat?: number;
      countedCash?: number;
      amount?: number;
      reason?: string;
    };
    const db = await getDb();
    const registerCode = getPublicConfig().registerCode;
    const result = await db.transaction(async (tx) => {
      const active = (
        await tx
          .select()
          .from(registerShifts)
          .where(and(eq(registerShifts.status, "open"), eq(registerShifts.registerCode, registerCode)))
          .orderBy(desc(registerShifts.id))
          .limit(1)
          .for("update")
      )[0];
      if (payload.action === "open") {
        if (active) return { shift: active, status: 200 };
        const openingFloat = Math.max(0, Number(payload.openingFloat) || 0);
        const [shift] = await tx
          .insert(registerShifts)
          .values({
            registerCode,
            employeeId: auth.user.id,
            employeeName: auth.user.name,
            openingFloat,
            expectedCash: openingFloat
          })
          .returning();
        await tx.insert(cashDrawerMovements).values({
          shiftId: shift.id,
          type: "opening_float",
          amount: openingFloat,
          reason: "Opening float",
          employeeName: auth.user.name
        });
        await tx.insert(auditLogs).values({
          actor: auth.user.name,
          action: "shift.opened",
          entityType: "shift",
          entityId: String(shift.id),
          details: `Opening float ${openingFloat.toFixed(2)}`
        });
        return { shift, status: 201 };
      }
      if (!active) throw new Error("NO_ACTIVE_SHIFT");
      if (["cash_in", "cash_out", "safe_drop", "petty_cash", "no_sale"].includes(payload.action || "")) {
        const rawAmount = Math.max(0, Number(payload.amount) || 0);
        if (payload.action !== "no_sale" && !rawAmount) throw new Error("AMOUNT_REQUIRED");
        if (!payload.reason?.trim()) throw new Error("REASON_REQUIRED");
        const signedAmount = payload.action === "no_sale" ? 0 : payload.action === "cash_in" ? rawAmount : -rawAmount;
        if (active.expectedCash + signedAmount < 0) throw new Error("INSUFFICIENT_DRAWER");
        const [movement] = await tx
          .insert(cashDrawerMovements)
          .values({
            shiftId: active.id,
            type: payload.action!,
            amount: signedAmount,
            reason: payload.reason.trim(),
            employeeName: auth.user.name
          })
          .returning();
        if (signedAmount)
          await tx
            .update(registerShifts)
            .set({ expectedCash: sql`${registerShifts.expectedCash} + ${signedAmount}` })
            .where(eq(registerShifts.id, active.id));
        await tx.insert(auditLogs).values({
          actor: auth.user.name,
          action: `drawer.${payload.action}`,
          entityType: "shift",
          entityId: String(active.id),
          details: `${signedAmount.toFixed(2)} · ${payload.reason.trim()}`
        });
        const [shift] = await tx.select().from(registerShifts).where(eq(registerShifts.id, active.id)).limit(1);
        return { shift, movement, status: 201 };
      }
      if (payload.action === "close") {
        if (!Number.isFinite(Number(payload.countedCash)) || Number(payload.countedCash) < 0)
          throw new Error("COUNT_REQUIRED");
        const countedCash = Number(Number(payload.countedCash).toFixed(2));
        const variance = Number((countedCash - active.expectedCash).toFixed(2));
        const [shift] = await tx
          .update(registerShifts)
          .set({ status: "closed", countedCash, closedAt: new Date().toISOString() })
          .where(eq(registerShifts.id, active.id))
          .returning();
        await tx.insert(auditLogs).values({
          actor: auth.user.name,
          action: "shift.closed",
          entityType: "shift",
          entityId: String(active.id),
          details: `Expected ${active.expectedCash.toFixed(2)} · counted ${countedCash.toFixed(2)} · variance ${variance.toFixed(2)}`
        });
        return { shift, variance, status: 200 };
      }
      throw new Error("UNKNOWN_ACTION");
    });
    const { status, ...body } = result;
    return Response.json(body, { status });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    const known: Record<string, [string, number]> = {
      NO_ACTIVE_SHIFT: ["Open a shift first", 409],
      AMOUNT_REQUIRED: ["A positive amount is required", 400],
      REASON_REQUIRED: ["A reason is required", 400],
      INSUFFICIENT_DRAWER: ["Movement exceeds expected drawer cash", 409],
      COUNT_REQUIRED: ["A valid counted cash amount is required", 400],
      UNKNOWN_ACTION: ["No matching shift action", 400]
    };
    return Response.json(
      { error: known[code]?.[0] || code || "Shift operation failed" },
      { status: known[code]?.[1] || 500 }
    );
  }
}
