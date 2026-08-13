import { and, eq, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import {
  auditLogs,
  cashDrawerMovements,
  customers,
  inventoryMovements,
  payments,
  products,
  registerShifts,
  returnLines,
  returns,
  saleLines,
  sales
} from "../../../db/schema";
import { authorize } from "../../../lib/auth";
import {
  allocateRefundTender,
  calculateRefundLine,
  loyaltyAdjustmentForRefund,
  roundMoney
} from "../../../lib/finance";

export async function POST(request: Request) {
  try {
    const auth = await authorize(request, "refund.create");
    if (auth.response) return auth.response;
    const payload = (await request.json()) as {
      saleId?: number;
      lines?: Array<{ saleLineId: number; quantity: number; restock: boolean }>;
      reason?: string;
      method?: string;
    };
    if (!payload.saleId || !payload.lines?.length || !payload.reason?.trim())
      return Response.json({ error: "Sale, items and reason are required" }, { status: 400 });
    const db = await getDb();
    const result = await db.transaction(async (tx) => {
      const sale = (await tx.select().from(sales).where(eq(sales.id, payload.saleId!)).limit(1).for("update"))[0];
      if (!sale || sale.status === "refunded") throw new Error("NOT_ELIGIBLE");
      const originalPayments = await tx.select().from(payments).where(eq(payments.saleId, sale.id));
      const priorReturns = await tx.select().from(returns).where(eq(returns.saleId, sale.id));
      const selected: Array<{
        line: typeof saleLines.$inferSelect;
        quantity: number;
        restock: boolean;
        base: number;
        tax: number;
        amount: number;
      }> = [];
      const seen = new Set<number>();
      for (const requested of payload.lines!) {
        if (seen.has(requested.saleLineId)) throw new Error("DUPLICATE_LINE");
        seen.add(requested.saleLineId);
        const line = (
          await tx
            .select()
            .from(saleLines)
            .where(and(eq(saleLines.id, requested.saleLineId), eq(saleLines.saleId, sale.id)))
            .limit(1)
            .for("update")
        )[0];
        const quantity = Math.max(1, Math.floor(Number(requested.quantity) || 1));
        if (!line || quantity > line.quantity - line.returnedQuantity) throw new Error("QUANTITY");
        const amounts = calculateRefundLine(line.unitPrice, quantity, sale.subtotal, sale.tax);
        selected.push({ line, quantity, restock: requested.restock !== false, ...amounts });
      }
      const tax = roundMoney(selected.reduce((sum, item) => sum + item.tax, 0));
      const amount = roundMoney(selected.reduce((sum, item) => sum + item.amount, 0));
      if (sale.refundedAmount + amount > sale.total + 0.01) throw new Error("EXCEEDS_PAYMENT");
      const requestedMethod = ["Cash", "Card"].includes(payload.method || "") ? payload.method : undefined;
      const allocations = allocateRefundTender(
        amount,
        originalPayments.map((payment) => ({ method: payment.method, amount: payment.amount })),
        priorReturns.map((item) => ({ method: item.method, amount: item.amount })),
        requestedMethod
      );
      const method = allocations.length === 1 ? allocations[0].method : "Split";
      const cashRefund = roundMoney(
        allocations.filter((item) => item.method === "Cash").reduce((sum, item) => sum + item.amount, 0)
      );
      const receiptNumber = `RT-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
      const [returnRecord] = await tx
        .insert(returns)
        .values({
          saleId: sale.id,
          receiptNumber,
          amount,
          tax,
          method,
          reason: payload.reason!.trim(),
          employeeName: auth.user.name
        })
        .returning();
      await tx.insert(returnLines).values(
        selected.map((item) => ({
          returnId: returnRecord.id,
          saleLineId: item.line.id,
          productId: item.line.productId,
          quantity: item.quantity,
          amount: item.amount,
          restock: item.restock
        }))
      );
      for (const item of selected) {
        await tx
          .update(saleLines)
          .set({ returnedQuantity: sql`${saleLines.returnedQuantity} + ${item.quantity}` })
          .where(eq(saleLines.id, item.line.id));
        if (item.restock) {
          await tx
            .update(products)
            .set({ stock: sql`${products.stock} + ${item.quantity}`, updatedAt: new Date().toISOString() })
            .where(eq(products.id, item.line.productId));
          await tx.insert(inventoryMovements).values({
            productId: item.line.productId,
            saleId: sale.id,
            type: "return",
            quantity: item.quantity,
            reason: receiptNumber
          });
        }
      }
      const refundedAmount = roundMoney(sale.refundedAmount + amount);
      const status = refundedAmount >= sale.total - 0.01 ? "refunded" : "partially_refunded";
      await tx.update(sales).set({ refundedAmount, status }).where(eq(sales.id, sale.id));
      if (sale.customerId) {
        const customer = (
          await tx.select().from(customers).where(eq(customers.id, sale.customerId)).limit(1).for("update")
        )[0];
        if (customer) {
          const adjustment = loyaltyAdjustmentForRefund({
            refundAmount: amount,
            saleTotal: sale.total,
            saleAlreadyRefunded: sale.refundedAmount,
            saleFullyRefundedAfter: status === "refunded"
          });
          await tx
            .update(customers)
            .set({
              visits: sql`GREATEST(0, ${customers.visits} - ${adjustment.visitsDelta})`,
              totalSpent: sql`GREATEST(0, ${customers.totalSpent} - ${adjustment.totalSpentDelta})`,
              loyaltyPoints: sql`GREATEST(0, ${customers.loyaltyPoints} - ${adjustment.loyaltyPointsDelta})`
            })
            .where(eq(customers.id, customer.id));
        }
      }
      if (cashRefund > 0 && sale.shiftId) {
        const active = (
          await tx
            .select()
            .from(registerShifts)
            .where(and(eq(registerShifts.id, sale.shiftId), eq(registerShifts.status, "open")))
            .limit(1)
            .for("update")
        )[0];
        if (!active || active.expectedCash < cashRefund) throw new Error("DRAWER_CLOSED");
        await tx
          .update(registerShifts)
          .set({ expectedCash: sql`${registerShifts.expectedCash} - ${cashRefund}` })
          .where(eq(registerShifts.id, active.id));
        await tx.insert(cashDrawerMovements).values({
          shiftId: active.id,
          saleId: sale.id,
          type: "cash_refund",
          amount: -cashRefund,
          reason: receiptNumber,
          employeeName: auth.user.name
        });
      }
      await tx.insert(auditLogs).values({
        actor: auth.user.name,
        action: "sale.refunded",
        entityType: "sale",
        entityId: String(sale.id),
        details: `${receiptNumber} · ${amount.toFixed(2)} · ${method} · ${payload.reason!.trim()}`
      });
      return { return: returnRecord, sale: { ...sale, refundedAmount, status } };
    });
    return Response.json(result, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    const known: Record<string, [string, number]> = {
      NOT_ELIGIBLE: ["Sale is not eligible for another refund", 409],
      QUANTITY: ["A refund quantity exceeds the available purchased quantity", 409],
      DUPLICATE_LINE: ["A sale line was submitted more than once", 400],
      EXCEEDS_PAYMENT: ["Refund exceeds the amount paid", 409],
      DRAWER_CLOSED: ["Cash refunds require the original shift to be open with sufficient expected cash", 409],
      TENDER: ["Refund tender exceeds the remaining amount for that payment method", 409],
      "No original tender": ["Sale has no recorded tender to refund against", 409]
    };
    const mapped = known[code];
    return Response.json({ error: mapped?.[0] || code || "Refund failed" }, { status: mapped?.[1] || 500 });
  }
}
