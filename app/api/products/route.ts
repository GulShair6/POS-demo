import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { auditLogs, products } from "../../../db/schema";
import { authorize } from "../../../lib/auth";

export async function POST(request: Request) {
  try {
    const auth = await authorize(request, "catalogue.manage");
    if (auth.response) return auth.response;
    const payload = await request.json() as { name?: string; sku?: string; category?: string; price?: number; cost?: number; stock?: number; barcode?: string; lowStockThreshold?: number };
    if (!payload.name?.trim() || !payload.sku?.trim()) return Response.json({ error: "Name and SKU are required" }, { status: 400 });
    const db = await getDb();
    const [product] = await db.insert(products).values({
      name: payload.name.trim(), sku: payload.sku.trim().toUpperCase(), category: payload.category?.trim() || "Other",
      price: Math.max(0, Number(payload.price) || 0), cost: Math.max(0, Number(payload.cost) || 0), stock: Math.max(0, Math.floor(Number(payload.stock) || 0)),
      barcode: payload.barcode?.trim() || null, lowStockThreshold: Math.max(0, Math.floor(Number(payload.lowStockThreshold) || 8)),
    }).returning();
    await db.insert(auditLogs).values({ actor: auth.user.name, action: "product.created", entityType: "product", entityId: String(product.id), details: `${product.name} (${product.sku}) created` });
    return Response.json({ product }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to create product" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await authorize(request, "catalogue.manage");
    if (auth.response) return auth.response;
    const payload = await request.json() as { id?: number; name?: string; category?: string; price?: number; cost?: number; barcode?: string; lowStockThreshold?: number; active?: boolean };
    if (!payload.id) return Response.json({ error: "Product ID is required" }, { status: 400 });
    const db = await getDb();
    const [product] = await db.update(products).set({
      ...(payload.name !== undefined ? { name: payload.name.trim() } : {}),
      ...(payload.category !== undefined ? { category: payload.category.trim() } : {}),
      ...(payload.price !== undefined ? { price: Math.max(0, Number(payload.price)) } : {}),
      ...(payload.cost !== undefined ? { cost: Math.max(0, Number(payload.cost)) } : {}),
      ...(payload.barcode !== undefined ? { barcode: payload.barcode.trim() || null } : {}),
      ...(payload.lowStockThreshold !== undefined ? { lowStockThreshold: Math.max(0, Math.floor(Number(payload.lowStockThreshold))) } : {}),
      ...(payload.active !== undefined ? { active: payload.active } : {}),
      updatedAt: new Date().toISOString(),
    }).where(eq(products.id, payload.id)).returning();
    if (!product) return Response.json({ error: "Product not found" }, { status: 404 });
    await db.insert(auditLogs).values({ actor: auth.user.name, action: "product.updated", entityType: "product", entityId: String(product.id), details: `${product.name} updated` });
    return Response.json({ product });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to update product" }, { status: 500 });
  }
}
