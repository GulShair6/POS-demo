import { eq } from "drizzle-orm";
import { getDb, getSql } from "../db";
import { customers, employees, products } from "../db/schema";
import { hashPassword } from "../lib/password";

const email = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD || "";
const name = (process.env.ADMIN_NAME || "Atlas Owner").trim();
if (!email || !password) throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD are required for the initial administrator");

const db = await getDb();
const existing = (await db.select({ id: employees.id }).from(employees).where(eq(employees.email, email)).limit(1))[0];
if (!existing) await db.insert(employees).values({ name, email, role: "Owner", passwordHash: hashPassword(password) });

if (process.env.SEED_DEMO_DATA === "true") {
  const hasProducts = (await db.select({ id: products.id }).from(products).limit(1)).length > 0;
  if (!hasProducts)
    await db.insert(products).values([
      {
        name: "Cappuccino",
        sku: "COF-002",
        barcode: "100002",
        category: "Coffee",
        price: 4.5,
        cost: 1.15,
        stock: 38,
        lowStockThreshold: 8
      },
      {
        name: "Butter Croissant",
        sku: "BAK-014",
        barcode: "200014",
        category: "Bakery",
        price: 3.25,
        cost: 0.92,
        stock: 12,
        lowStockThreshold: 8
      },
      {
        name: "Iced Matcha",
        sku: "TEA-008",
        barcode: "300008",
        category: "Tea",
        price: 5.25,
        cost: 1.42,
        stock: 24,
        lowStockThreshold: 8
      },
      {
        name: "Turkey Ciabatta",
        sku: "FOD-021",
        barcode: "400021",
        category: "Food",
        price: 8.5,
        cost: 3.18,
        stock: 8,
        lowStockThreshold: 8
      },
      {
        name: "Blueberry Muffin",
        sku: "BAK-009",
        barcode: "200009",
        category: "Bakery",
        price: 3.75,
        cost: 1.05,
        stock: 6,
        lowStockThreshold: 8
      }
    ]);
  const hasCustomers = (await db.select({ id: customers.id }).from(customers).limit(1)).length > 0;
  if (!hasCustomers)
    await db.insert(customers).values([
      { name: "Maya Patel", email: "maya@example.com" },
      { name: "Noah Williams", email: "noah@example.com" }
    ]);
}

console.log(existing ? "Administrator already exists" : "Administrator created");
await getSql().end();
