import { and, eq, gte, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { auditLogs, inventoryMovements, products } from "../../../db/schema";
import { authorize } from "../../../lib/auth";

export async function POST(request: Request) {
  try {
    const auth = await authorize(request, "inventory.adjust");
    if (auth.response) return auth.response;
    const payload = (await request.json()) as { productId?: number; quantity?: number; reason?: string };
    const quantity = Math.trunc(Number(payload.quantity));
    if (!payload.productId || !quantity || !payload.reason?.trim())
      return Response.json({ error: "Product, non-zero quantity and reason are required" }, { status: 400 });
    const db = await getDb();
    const result = await db.transaction(async (tx) => {
      const condition =
        quantity < 0
          ? and(eq(products.id, payload.productId!), gte(products.stock, Math.abs(quantity)))
          : eq(products.id, payload.productId!);
      const [product] = await tx
        .update(products)
        .set({ stock: sql`${products.stock} + ${quantity}`, updatedAt: new Date().toISOString() })
        .where(condition)
        .returning();
      if (!product) return null;
      const [movement] = await tx
        .insert(inventoryMovements)
        .values({
          productId: product.id,
          type: quantity > 0 ? "adjustment_in" : "adjustment_out",
          quantity,
          reason: payload.reason!.trim()
        })
        .returning();
      await tx.insert(auditLogs).values({
        actor: auth.user.name,
        action: "inventory.adjusted",
        entityType: "product",
        entityId: String(product.id),
        details: `${quantity > 0 ? "+" : ""}${quantity} · ${payload.reason!.trim()}`
      });
      return { product, movement };
    });
    return result
      ? Response.json(result, { status: 201 })
      : Response.json({ error: "Product not found or adjustment would create negative stock" }, { status: 409 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Inventory adjustment failed" },
      { status: 500 }
    );
  }
}
