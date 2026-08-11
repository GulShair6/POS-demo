import { and, eq, gte, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import {
  auditLogs,
  cashDrawerMovements,
  customers,
  inventoryMovements,
  payments,
  products,
  registerShifts,
  saleLines,
  sales
} from "../../../db/schema";
import { authorize } from "../../../lib/auth";
import { getPublicConfig } from "../../../lib/config";
import { calculateSaleTotals, resolveSplitTender } from "../../../lib/finance";

type SalePayload = {
  items?: Array<{ id: number; quantity: number }>;
  method?: string;
  tendered?: number;
  customerId?: number;
  idempotencyKey?: string;
  splitCash?: number;
  splitCard?: number;
};

export async function POST(request: Request) {
  try {
    const auth = await authorize(request, "pos.use");
    if (auth.response) return auth.response;
    const payload = (await request.json()) as SalePayload;
    if (!payload.items?.length || !payload.idempotencyKey)
      return Response.json({ error: "Sale items and an idempotency key are required" }, { status: 400 });
    const db = await getDb();
    const result = await db.transaction(async (tx) => {
      const existing = (
        await tx.select().from(sales).where(eq(sales.idempotencyKey, payload.idempotencyKey!)).limit(1)
      )[0];
      if (existing) return { sale: existing, duplicate: true };
      const shift = (
        await tx
          .select()
          .from(registerShifts)
          .where(
            and(eq(registerShifts.status, "open"), eq(registerShifts.registerCode, getPublicConfig().registerCode))
          )
          .limit(1)
          .for("update")
      )[0];
      if (!shift) throw new Error("SHIFT_REQUIRED");

      const requested = new Map<number, number>();
      for (const item of payload.items!)
        requested.set(item.id, (requested.get(item.id) || 0) + Math.max(1, Math.floor(Number(item.quantity) || 1)));
      const lines: Array<{ product: typeof products.$inferSelect; quantity: number }> = [];
      for (const [id, quantity] of requested) {
        const product = (
          await tx
            .select()
            .from(products)
            .where(and(eq(products.id, id), eq(products.active, true)))
            .limit(1)
            .for("update")
        )[0];
        if (!product || product.stock < quantity) throw new Error(`STOCK:${product?.name || id}`);
        lines.push({ product, quantity });
      }
      const { subtotal, tax, total } = calculateSaleTotals(
        lines.map((line) => ({ unitPrice: line.product.price, quantity: line.quantity })),
        getPublicConfig().taxRate
      );
      const receiptNumber = `AT-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
      const [sale] = await tx
        .insert(sales)
        .values({
          receiptNumber,
          idempotencyKey: payload.idempotencyKey!,
          shiftId: shift.id,
          employeeId: auth.user.id,
          employeeName: auth.user.name,
          subtotal,
          tax,
          total,
          customerId: payload.customerId || null
        })
        .returning();
      await tx.insert(saleLines).values(
        lines.map(({ product, quantity }) => ({
          saleId: sale.id,
          productId: product.id,
          productName: product.name,
          sku: product.sku,
          unitPrice: product.price,
          unitCost: product.cost,
          quantity,
          lineTotal: Number((product.price * quantity).toFixed(2))
        }))
      );
      await tx.insert(inventoryMovements).values(
        lines.map(({ product, quantity }) => ({
          productId: product.id,
          saleId: sale.id,
          type: "sale",
          quantity: -quantity,
          reason: receiptNumber
        }))
      );
      for (const { product, quantity } of lines) {
        const changed = await tx
          .update(products)
          .set({ stock: sql`${products.stock} - ${quantity}`, updatedAt: new Date().toISOString() })
          .where(and(eq(products.id, product.id), gte(products.stock, quantity)))
          .returning({ id: products.id });
        if (!changed.length) throw new Error(`STOCK:${product.name}`);
      }
      const method = ["Cash", "Card", "Split"].includes(payload.method || "") ? payload.method! : "Cash";
      const tendered = method === "Cash" ? Math.max(total, Number(payload.tendered) || total) : total;
      let cashAmount = 0;
      if (method === "Split") {
        const split = resolveSplitTender(total, payload.splitCash, payload.splitCard);
        cashAmount = split.cash;
        const cardAmount = split.card;
        await tx.insert(payments).values([
          { saleId: sale.id, method: "Cash", amount: cashAmount, tendered: cashAmount, changeDue: 0 },
          { saleId: sale.id, method: "Card", amount: cardAmount, tendered: null, changeDue: 0 }
        ]);
      } else {
        cashAmount = method === "Cash" ? total : 0;
        await tx.insert(payments).values({
          saleId: sale.id,
          method,
          amount: total,
          tendered,
          changeDue: Number(Math.max(0, tendered - total).toFixed(2))
        });
      }
      if (cashAmount) {
        await tx
          .update(registerShifts)
          .set({ expectedCash: sql`${registerShifts.expectedCash} + ${cashAmount}` })
          .where(eq(registerShifts.id, shift.id));
        await tx.insert(cashDrawerMovements).values({
          shiftId: shift.id,
          saleId: sale.id,
          type: "cash_sale",
          amount: cashAmount,
          reason: receiptNumber,
          employeeName: auth.user.name
        });
      }
      if (payload.customerId)
        await tx
          .update(customers)
          .set({
            visits: sql`${customers.visits} + 1`,
            totalSpent: sql`${customers.totalSpent} + ${total}`,
            loyaltyPoints: sql`${customers.loyaltyPoints} + ${Math.floor(total)}`
          })
          .where(eq(customers.id, payload.customerId));
      await tx.insert(auditLogs).values({
        actor: auth.user.name,
        action: "sale.completed",
        entityType: "sale",
        entityId: String(sale.id),
        details: `${receiptNumber} · ${method} · ${total.toFixed(2)}`
      });
      return {
        sale: {
          ...sale,
          receiptNumber,
          subtotal,
          tax,
          total,
          method,
          tendered,
          changeDue: Math.max(0, tendered - total)
        },
        duplicate: false
      };
    });
    return Response.json(result, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sale failed";
    if (message === "SHIFT_REQUIRED")
      return Response.json({ error: "Open a register shift before taking payment" }, { status: 409 });
    if (message.startsWith("STOCK:"))
      return Response.json({ error: `Insufficient stock for ${message.slice(6)}` }, { status: 409 });
    if (message === "Split payments must equal the sale total")
      return Response.json({ error: message }, { status: 400 });
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const auth = await authorize(request, "sales.read");
    if (auth.response) return auth.response;
    const id = Number(new URL(request.url).searchParams.get("id"));
    if (!id) return Response.json({ error: "Sale ID is required" }, { status: 400 });
    const db = await getDb();
    const sale = (await db.select().from(sales).where(eq(sales.id, id)).limit(1))[0];
    if (!sale) return Response.json({ error: "Sale not found" }, { status: 404 });
    const [lines, tender] = await Promise.all([
      db.select().from(saleLines).where(eq(saleLines.saleId, id)),
      db.select().from(payments).where(eq(payments.saleId, id))
    ]);
    return Response.json({ sale: { ...sale, lines, payments: tender } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to load sale" }, { status: 500 });
  }
}
