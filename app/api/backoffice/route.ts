import { and, asc, desc, gte, inArray, lte } from "drizzle-orm";
import { getDb } from "../../../db";
import { authorize, hasPermission } from "../../../lib/auth";
import { expandRefundTenders, resolveReportDateBounds, roundMoney } from "../../../lib/finance";
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
  sales
} from "../../../db/schema";

const starterCustomers = [
  {
    name: "Maya Patel",
    email: "maya@example.com",
    phone: "+1 555 0104",
    visits: 18,
    totalSpent: 286.4,
    loyaltyPoints: 286
  },
  {
    name: "Noah Williams",
    email: "noah@example.com",
    phone: "+1 555 0137",
    visits: 9,
    totalSpent: 124.85,
    loyaltyPoints: 124
  },
  {
    name: "Olivia Chen",
    email: "olivia@example.com",
    phone: "+1 555 0192",
    visits: 24,
    totalSpent: 418.2,
    loyaltyPoints: 418
  }
];

const starterProducts = [
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
  },
  {
    name: "Cold Brew",
    sku: "COF-011",
    barcode: "100011",
    category: "Coffee",
    price: 4.75,
    cost: 1.08,
    stock: 31,
    lowStockThreshold: 8
  },
  {
    name: "Sparkling Water",
    sku: "DRK-005",
    barcode: "500005",
    category: "Drinks",
    price: 2.5,
    cost: 0.62,
    stock: 48,
    lowStockThreshold: 10
  },
  {
    name: "Chocolate Cookie",
    sku: "BAK-003",
    barcode: "200003",
    category: "Bakery",
    price: 2.75,
    cost: 0.68,
    stock: 17,
    lowStockThreshold: 8
  },
  {
    name: "Avocado Toast",
    sku: "FOD-017",
    barcode: "400017",
    category: "Food",
    price: 7.95,
    cost: 2.55,
    stock: 9,
    lowStockThreshold: 8
  }
];

function saleDateRange(from: string | null, to: string | null) {
  const conditions = [];
  if (from) conditions.push(gte(sales.createdAt, from));
  if (to) conditions.push(lte(sales.createdAt, `${to}T23:59:59.999Z`));
  return conditions.length ? and(...conditions) : undefined;
}

function returnDateRange(from: string | null, to: string | null) {
  const conditions = [];
  if (from) conditions.push(gte(returns.createdAt, from));
  if (to) conditions.push(lte(returns.createdAt, `${to}T23:59:59.999Z`));
  return conditions.length ? and(...conditions) : undefined;
}

export async function GET(request: Request) {
  try {
    const auth = await authorize(request, "pos.use");
    if (auth.response) return auth.response;
    const db = await getDb();
    if (process.env.SEED_DEMO_DATA === "true") {
      if (!(await db.select({ id: customers.id }).from(customers).limit(1)).length)
        await db.insert(customers).values(starterCustomers);
      if (!(await db.select({ id: products.id }).from(products).limit(1)).length)
        await db.insert(products).values(starterProducts).onConflictDoNothing();
    }

    const url = new URL(request.url);
    const bounds = resolveReportDateBounds(url.searchParams.get("from"), url.searchParams.get("to"));
    const from = bounds.from;
    const to = bounds.to;
    const saleRange = saleDateRange(from, to);
    const returnRange = returnDateRange(from, to);
    const [
      catalogue,
      rangeSales,
      shifts,
      cashMovements,
      stockMovements,
      customerRows,
      employeeRows,
      logs,
      rangeReturns
    ] = await Promise.all([
      db.select().from(products).orderBy(asc(products.name)),
      db.select().from(sales).where(saleRange).orderBy(desc(sales.id)),
      db.select().from(registerShifts).orderBy(desc(registerShifts.id)).limit(50),
      db.select().from(cashDrawerMovements).orderBy(desc(cashDrawerMovements.id)).limit(250),
      db.select().from(inventoryMovements).orderBy(desc(inventoryMovements.id)).limit(500),
      db.select().from(customers).orderBy(desc(customers.totalSpent)),
      db.select().from(employees).orderBy(asc(employees.name)),
      db.select().from(auditLogs).orderBy(desc(auditLogs.id)).limit(150),
      db.select().from(returns).where(returnRange).orderBy(desc(returns.id))
    ]);

    const rangeIds = rangeSales.map((sale) => sale.id);
    const returnIds = rangeReturns.map((item) => item.id);
    const [rangeLines, rangePayments, returnedLines] = await Promise.all([
      rangeIds.length
        ? db.select().from(saleLines).where(inArray(saleLines.saleId, rangeIds)).orderBy(desc(saleLines.id))
        : Promise.resolve([]),
      rangeIds.length
        ? db.select().from(payments).where(inArray(payments.saleId, rangeIds)).orderBy(desc(payments.id))
        : Promise.resolve([]),
      returnIds.length
        ? db.select().from(returnLines).where(inArray(returnLines.returnId, returnIds)).orderBy(desc(returnLines.id))
        : Promise.resolve([])
    ]);

    const paymentsBySale = new Map<number, typeof rangePayments>();
    for (const payment of rangePayments) {
      const list = paymentsBySale.get(payment.saleId) ?? [];
      list.push(payment);
      paymentsBySale.set(payment.saleId, list);
    }

    const netSales = roundMoney(rangeSales.reduce((sum, sale) => sum + sale.total - sale.refundedAmount, 0));
    const refunds = roundMoney(rangeReturns.reduce((sum, item) => sum + item.amount, 0));
    const tax = roundMoney(
      rangeSales.reduce((sum, sale) => sum + sale.tax, 0) - rangeReturns.reduce((sum, item) => sum + item.tax, 0)
    );
    const tender = rangePayments.reduce<Record<string, number>>((result, payment) => {
      result[payment.method] = roundMoney((result[payment.method] ?? 0) + payment.amount);
      return result;
    }, {});
    for (const item of rangeReturns) {
      const salePayments = paymentsBySale.get(item.saleId) ?? [];
      const legs = expandRefundTenders([{ method: item.method, amount: item.amount }], salePayments);
      for (const leg of legs) {
        tender[leg.method] = roundMoney((tender[leg.method] ?? 0) - leg.amount);
      }
    }
    for (const [method, value] of Object.entries(tender)) {
      if (Math.abs(value) < 0.005) delete tender[method];
      else tender[method] = roundMoney(value);
    }
    const productSales = rangeLines.reduce<Record<number, { quantity: number; revenue: number }>>((result, line) => {
      const current = result[line.productId] ?? { quantity: 0, revenue: 0 };
      current.quantity += line.quantity - line.returnedQuantity;
      current.revenue = roundMoney(
        current.revenue + line.lineTotal * ((line.quantity - line.returnedQuantity) / line.quantity)
      );
      result[line.productId] = current;
      return result;
    }, {});
    const cogs = roundMoney(
      rangeLines.reduce((sum, line) => sum + line.unitCost * (line.quantity - line.returnedQuantity), 0)
    );
    const canSeeCost = hasPermission(auth.user, "reports.read") || hasPermission(auth.user, "inventory.adjust");
    const canManageEmployees = hasPermission(auth.user, "employees.manage");
    const canReadAudit = hasPermission(auth.user, "audit.read");

    return Response.json({
      products: catalogue.map((product) => (canSeeCost ? product : { ...product, cost: 0 })),
      sales: rangeSales.map((sale) => ({
        ...sale,
        lines: rangeLines.filter((line) => line.saleId === sale.id),
        payments: rangePayments.filter((payment) => payment.saleId === sale.id)
      })),
      shifts,
      cashMovements,
      inventoryMovements: stockMovements,
      customers: customerRows,
      employees: employeeRows
        .filter((employee) => canManageEmployees || employee.id === auth.user.id)
        .map((employee) => ({
          id: employee.id,
          name: employee.name,
          email: employee.email,
          role: employee.role,
          active: employee.active,
          createdAt: employee.createdAt
        })),
      auditLogs: canReadAudit ? logs : [],
      returns: rangeReturns.map((item) => ({
        ...item,
        lines: returnedLines.filter((line) => line.returnId === item.id)
      })),
      summary: {
        netSales,
        grossSales: roundMoney(rangeSales.reduce((sum, sale) => sum + sale.total, 0)),
        refunds,
        tax,
        transactions: rangeSales.length,
        averageOrder: rangeSales.length ? roundMoney(netSales / rangeSales.length) : 0,
        cogs: canSeeCost ? cogs : 0,
        grossProfit: canSeeCost ? roundMoney(netSales - tax - cogs) : 0,
        tender,
        productSales
      },
      dateBounds: bounds
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to load operations" },
      { status: 500 }
    );
  }
}
