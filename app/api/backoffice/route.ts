import { asc, desc } from "drizzle-orm";
import { getDb } from "../../../db";
import { authorize, hasPermission } from "../../../lib/auth";
import {
  auditLogs,
  cashDrawerMovements,
  customers,
  employees,
  inventoryMovements,
  payments,
  products,
  registerShifts,
  returnLines,
  returns,
  saleLines,
  sales,
} from "../../../db/schema";

const starterCustomers = [
  { name: "Maya Patel", email: "maya@example.com", phone: "+1 555 0104", visits: 18, totalSpent: 286.4, loyaltyPoints: 286 },
  { name: "Noah Williams", email: "noah@example.com", phone: "+1 555 0137", visits: 9, totalSpent: 124.85, loyaltyPoints: 124 },
  { name: "Olivia Chen", email: "olivia@example.com", phone: "+1 555 0192", visits: 24, totalSpent: 418.2, loyaltyPoints: 418 },
];

const starterProducts = [
  { name:"Cappuccino", sku:"COF-002", barcode:"100002", category:"Coffee", price:4.5, cost:1.15, stock:38, lowStockThreshold:8 },
  { name:"Butter Croissant", sku:"BAK-014", barcode:"200014", category:"Bakery", price:3.25, cost:0.92, stock:12, lowStockThreshold:8 },
  { name:"Iced Matcha", sku:"TEA-008", barcode:"300008", category:"Tea", price:5.25, cost:1.42, stock:24, lowStockThreshold:8 },
  { name:"Turkey Ciabatta", sku:"FOD-021", barcode:"400021", category:"Food", price:8.5, cost:3.18, stock:8, lowStockThreshold:8 },
  { name:"Blueberry Muffin", sku:"BAK-009", barcode:"200009", category:"Bakery", price:3.75, cost:1.05, stock:6, lowStockThreshold:8 },
  { name:"Cold Brew", sku:"COF-011", barcode:"100011", category:"Coffee", price:4.75, cost:1.08, stock:31, lowStockThreshold:8 },
  { name:"Sparkling Water", sku:"DRK-005", barcode:"500005", category:"Drinks", price:2.5, cost:0.62, stock:48, lowStockThreshold:10 },
  { name:"Chocolate Cookie", sku:"BAK-003", barcode:"200003", category:"Bakery", price:2.75, cost:0.68, stock:17, lowStockThreshold:8 },
  { name:"Avocado Toast", sku:"FOD-017", barcode:"400017", category:"Food", price:7.95, cost:2.55, stock:9, lowStockThreshold:8 },
];

export async function GET(request: Request) {
  try {
    const auth = await authorize(request, "pos.use");
    if (auth.response) return auth.response;
    const db = await getDb();
    if (process.env.SEED_DEMO_DATA === "true") {
      if (!(await db.select({ id: customers.id }).from(customers).limit(1)).length) await db.insert(customers).values(starterCustomers);
      if (!(await db.select({ id: products.id }).from(products).limit(1)).length) await db.insert(products).values(starterProducts).onConflictDoNothing();
    }

    const url = new URL(request.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const [catalogue, allSales, allLines, allPayments, shifts, cashMovements, stockMovements, customerRows, employeeRows, logs, returnRows, returnedLines] = await Promise.all([
      db.select().from(products).orderBy(asc(products.name)),
      db.select().from(sales).orderBy(desc(sales.id)).limit(250),
      db.select().from(saleLines).orderBy(desc(saleLines.id)).limit(1000),
      db.select().from(payments).orderBy(desc(payments.id)).limit(500),
      db.select().from(registerShifts).orderBy(desc(registerShifts.id)).limit(50),
      db.select().from(cashDrawerMovements).orderBy(desc(cashDrawerMovements.id)).limit(250),
      db.select().from(inventoryMovements).orderBy(desc(inventoryMovements.id)).limit(500),
      db.select().from(customers).orderBy(desc(customers.totalSpent)),
      db.select().from(employees).orderBy(asc(employees.name)),
      db.select().from(auditLogs).orderBy(desc(auditLogs.id)).limit(150),
      db.select().from(returns).orderBy(desc(returns.id)).limit(150),
      db.select().from(returnLines).orderBy(desc(returnLines.id)).limit(500),
    ]);

    const inRange = (createdAt: string) => (!from || createdAt >= from) && (!to || createdAt <= `${to}T23:59:59.999Z`);
    const rangeSales = allSales.filter(sale => inRange(sale.createdAt));
    const rangeIds = new Set(rangeSales.map(sale => sale.id));
    const rangePayments = allPayments.filter(payment => rangeIds.has(payment.saleId));
    const rangeReturns = returnRows.filter(item => inRange(item.createdAt));
    const netSales = rangeSales.reduce((sum, sale) => sum + sale.total - sale.refundedAmount, 0);
    const refunds = rangeReturns.reduce((sum, item) => sum + item.amount, 0);
    const tax = rangeSales.reduce((sum, sale) => sum + sale.tax, 0) - rangeReturns.reduce((sum, item) => sum + item.tax, 0);
    const tender = rangePayments.reduce<Record<string, number>>((result, payment) => {
      result[payment.method] = (result[payment.method] ?? 0) + payment.amount;
      return result;
    }, {});
    const productSales = allLines.filter(line => rangeIds.has(line.saleId)).reduce<Record<number, { quantity: number; revenue: number }>>((result, line) => {
      const current = result[line.productId] ?? { quantity: 0, revenue: 0 };
      current.quantity += line.quantity - line.returnedQuantity;
      current.revenue += line.lineTotal * ((line.quantity - line.returnedQuantity) / line.quantity);
      result[line.productId] = current;
      return result;
    }, {});
    const cogs = allLines.filter(line => rangeIds.has(line.saleId)).reduce((sum, line) => sum + line.unitCost * (line.quantity - line.returnedQuantity), 0);
    const canSeeCost = hasPermission(auth.user, "reports.read") || hasPermission(auth.user, "inventory.adjust");
    const canManageEmployees = hasPermission(auth.user, "employees.manage");
    const canReadAudit = hasPermission(auth.user, "audit.read");

    return Response.json({
      products: catalogue.map(product => canSeeCost ? product : { ...product, cost: 0 }),
      sales: allSales.map(sale => ({
        ...sale,
        lines: allLines.filter(line => line.saleId === sale.id),
        payments: allPayments.filter(payment => payment.saleId === sale.id),
      })),
      shifts,
      cashMovements,
      inventoryMovements: stockMovements,
      customers: customerRows,
      employees: employeeRows.filter(employee => canManageEmployees || employee.id === auth.user.id).map(employee => ({ id: employee.id, name: employee.name, email: employee.email, role: employee.role, active: employee.active, createdAt: employee.createdAt })),
      auditLogs: canReadAudit ? logs : [],
      returns: returnRows.map(item => ({ ...item, lines: returnedLines.filter(line => line.returnId === item.id) })),
      summary: {
        netSales: Number(netSales.toFixed(2)),
        grossSales: Number(rangeSales.reduce((sum, sale) => sum + sale.total, 0).toFixed(2)),
        refunds: Number(refunds.toFixed(2)),
        tax: Number(tax.toFixed(2)),
        transactions: rangeSales.length,
        averageOrder: rangeSales.length ? Number((netSales / rangeSales.length).toFixed(2)) : 0,
        cogs: canSeeCost ? Number(cogs.toFixed(2)) : 0,
        grossProfit: canSeeCost ? Number((netSales - tax - cogs).toFixed(2)) : 0,
        tender,
        productSales,
      },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to load operations" }, { status: 500 });
  }
}
