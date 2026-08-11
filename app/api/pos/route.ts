import { asc, desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { authorize } from "../../../lib/auth";
import { products, registerShifts, sales } from "../../../db/schema";

const seedProducts = [
  ["Cappuccino", "COF-002", "Coffee", 4.5, 38],
  ["Butter Croissant", "BAK-014", "Bakery", 3.25, 12],
  ["Iced Matcha", "TEA-008", "Tea", 5.25, 24],
  ["Turkey Ciabatta", "FOD-021", "Food", 8.5, 8],
  ["Blueberry Muffin", "BAK-009", "Bakery", 3.75, 6],
  ["Cold Brew", "COF-011", "Coffee", 4.75, 31],
  ["Sparkling Water", "DRK-005", "Drinks", 2.5, 48],
  ["Chocolate Cookie", "BAK-003", "Bakery", 2.75, 17],
  ["Avocado Toast", "FOD-017", "Food", 7.95, 9]
] as const;

export async function GET(request: Request) {
  try {
    const auth = await authorize(request, "pos.use");
    if (auth.response) return auth.response;
    const db = await getDb();
    let catalogue = await db.select().from(products).where(eq(products.active, true)).orderBy(asc(products.name));
    if (!catalogue.length && process.env.SEED_DEMO_DATA === "true") {
      await db
        .insert(products)
        .values(seedProducts.map(([name, sku, category, price, stock]) => ({ name, sku, category, price, stock })))
        .onConflictDoNothing();
      catalogue = await db.select().from(products).where(eq(products.active, true)).orderBy(asc(products.name));
    }
    const shift =
      (
        await db
          .select()
          .from(registerShifts)
          .where(eq(registerShifts.status, "open"))
          .orderBy(desc(registerShifts.id))
          .limit(1)
      )[0] ?? null;
    const recentSales = await db.select().from(sales).orderBy(desc(sales.id)).limit(20);
    return Response.json({ products: catalogue, shift, recentSales });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to load POS data" },
      { status: 500 }
    );
  }
}
