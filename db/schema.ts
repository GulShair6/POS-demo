import { sql } from "drizzle-orm";
import { boolean, index, integer, numeric, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

const money = (name: string) => numeric(name, { precision: 14, scale: 2, mode: "number" });
const time = (name: string) => timestamp(name, { withTimezone: true, mode: "string" });

export const products = pgTable("products", {
  id: serial("id").primaryKey(), name: text("name").notNull(), sku: text("sku").notNull(), category: text("category").notNull(),
  price: money("price").notNull(), cost: money("cost").notNull().default(0), barcode: text("barcode"), stock: integer("stock").notNull().default(0),
  lowStockThreshold: integer("low_stock_threshold").notNull().default(8), active: boolean("active").notNull().default(true),
  createdAt: time("created_at").notNull().defaultNow(), updatedAt: time("updated_at").notNull().defaultNow()
}, table => [uniqueIndex("products_sku_uidx").on(table.sku), uniqueIndex("products_barcode_uidx").on(table.barcode)]);

export const employees = pgTable("employees", {
  id: serial("id").primaryKey(), name: text("name").notNull(), email: text("email").notNull(), role: text("role").notNull(),
  passwordHash: text("password_hash").notNull(), active: boolean("active").notNull().default(true),
  createdAt: time("created_at").notNull().defaultNow(), updatedAt: time("updated_at").notNull().defaultNow()
}, table => [uniqueIndex("employees_email_uidx").on(table.email)]);

export const registerShifts = pgTable("register_shifts", {
  id: serial("id").primaryKey(), registerCode: text("register_code").notNull(), employeeId: integer("employee_id").references(() => employees.id),
  employeeName: text("employee_name").notNull(), openingFloat: money("opening_float").notNull(), expectedCash: money("expected_cash").notNull(),
  countedCash: money("counted_cash"), status: text("status").notNull().default("open"), openedAt: time("opened_at").notNull().defaultNow(), closedAt: time("closed_at")
}, table => [index("shifts_status_idx").on(table.status)]);

export const customers = pgTable("customers", {
  id: serial("id").primaryKey(), name: text("name").notNull(), email: text("email"), phone: text("phone"), visits: integer("visits").notNull().default(0),
  totalSpent: money("total_spent").notNull().default(0), loyaltyPoints: integer("loyalty_points").notNull().default(0), createdAt: time("created_at").notNull().defaultNow()
});

export const sales = pgTable("sales", {
  id: serial("id").primaryKey(), receiptNumber: text("receipt_number").notNull(), idempotencyKey: text("idempotency_key").notNull(),
  shiftId: integer("shift_id").references(() => registerShifts.id), employeeId: integer("employee_id").references(() => employees.id), employeeName: text("employee_name").notNull(),
  subtotal: money("subtotal").notNull(), tax: money("tax").notNull(), total: money("total").notNull(), refundedAmount: money("refunded_amount").notNull().default(0),
  customerId: integer("customer_id").references(() => customers.id), status: text("status").notNull().default("completed"), createdAt: time("created_at").notNull().defaultNow()
}, table => [uniqueIndex("sales_receipt_uidx").on(table.receiptNumber), uniqueIndex("sales_idempotency_uidx").on(table.idempotencyKey), index("sales_created_idx").on(table.createdAt)]);

export const saleLines = pgTable("sale_lines", {
  id: serial("id").primaryKey(), saleId: integer("sale_id").notNull().references(() => sales.id), productId: integer("product_id").notNull().references(() => products.id),
  productName: text("product_name").notNull(), sku: text("sku").notNull(), unitPrice: money("unit_price").notNull(), unitCost: money("unit_cost").notNull().default(0),
  quantity: integer("quantity").notNull(), returnedQuantity: integer("returned_quantity").notNull().default(0), lineTotal: money("line_total").notNull()
}, table => [index("sale_lines_sale_idx").on(table.saleId)]);

export const payments = pgTable("payments", {
  id: serial("id").primaryKey(), saleId: integer("sale_id").notNull().references(() => sales.id), method: text("method").notNull(),
  amount: money("amount").notNull(), tendered: money("tendered"), changeDue: money("change_due").notNull().default(0), createdAt: time("created_at").notNull().defaultNow()
});

export const inventoryMovements = pgTable("inventory_movements", {
  id: serial("id").primaryKey(), productId: integer("product_id").notNull().references(() => products.id), saleId: integer("sale_id").references(() => sales.id),
  type: text("type").notNull(), quantity: integer("quantity").notNull(), reason: text("reason"), createdAt: time("created_at").notNull().defaultNow()
}, table => [index("inventory_product_idx").on(table.productId)]);

export const cashDrawerMovements = pgTable("cash_drawer_movements", {
  id: serial("id").primaryKey(), shiftId: integer("shift_id").notNull().references(() => registerShifts.id), saleId: integer("sale_id").references(() => sales.id),
  type: text("type").notNull(), amount: money("amount").notNull(), reason: text("reason").notNull(), employeeName: text("employee_name").notNull(), createdAt: time("created_at").notNull().defaultNow()
});

export const returns = pgTable("returns", {
  id: serial("id").primaryKey(), saleId: integer("sale_id").notNull().references(() => sales.id), receiptNumber: text("receipt_number").notNull(),
  amount: money("amount").notNull(), tax: money("tax").notNull(), method: text("method").notNull(), reason: text("reason").notNull(), employeeName: text("employee_name").notNull(), createdAt: time("created_at").notNull().defaultNow()
}, table => [uniqueIndex("returns_receipt_uidx").on(table.receiptNumber)]);

export const returnLines = pgTable("return_lines", {
  id: serial("id").primaryKey(), returnId: integer("return_id").notNull().references(() => returns.id), saleLineId: integer("sale_line_id").notNull().references(() => saleLines.id),
  productId: integer("product_id").notNull().references(() => products.id), quantity: integer("quantity").notNull(), amount: money("amount").notNull(), restock: boolean("restock").notNull().default(true)
});

export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(), actor: text("actor").notNull(), action: text("action").notNull(), entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(), details: text("details").notNull(), createdAt: time("created_at").notNull().defaultNow()
}, table => [index("audit_created_idx").on(table.createdAt)]);

export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(), value: text("value").notNull(), updatedAt: time("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`)
});
