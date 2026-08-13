import test from "node:test";
import assert from "node:assert/strict";
import {
  allocateRefundTender,
  calculateRefundLine,
  calculateSaleTotals,
  expandRefundTenders,
  loyaltyAdjustmentForRefund,
  resolveReportDateBounds,
  resolveSplitTender,
  roundMoney
} from "../lib/finance.ts";
import { hashPassword, verifyPassword } from "../lib/password.ts";
import { hasPermission } from "../lib/permissions.ts";

test("sale totals round once per financial stage", () => {
  assert.deepEqual(
    calculateSaleTotals(
      [
        { unitPrice: 4.5, quantity: 2 },
        { unitPrice: 3.25, quantity: 1 }
      ],
      0.0825
    ),
    { subtotal: 12.25, tax: 1.01, total: 13.26 }
  );
});

test("split tender reconciles exactly and rejects mismatches", () => {
  assert.deepEqual(resolveSplitTender(13.26), { cash: 6.63, card: 6.63 });
  assert.deepEqual(resolveSplitTender(10.01), { cash: 5.01, card: 5 });
  assert.throws(() => resolveSplitTender(10, 2, 7), /equal the sale total/);
});

test("refund tax is allocated from the original sale tax", () => {
  assert.deepEqual(calculateRefundLine(4.5, 1, 12.25, 1.01), { base: 4.5, tax: 0.37, amount: 4.87 });
});

test("refund tender follows original legs and can be forced", () => {
  const payments = [
    { method: "Cash", amount: 6.63 },
    { method: "Card", amount: 6.63 }
  ];
  assert.deepEqual(allocateRefundTender(13.26, payments), [
    { method: "Cash", amount: 6.63 },
    { method: "Card", amount: 6.63 }
  ]);
  assert.deepEqual(allocateRefundTender(4, payments, [], "Cash"), [{ method: "Cash", amount: 4 }]);
  assert.throws(() => allocateRefundTender(7, payments, [{ method: "Cash", amount: 6.63 }], "Cash"), /TENDER/);
});

test("roundMoney removes binary float noise", () => {
  assert.equal(roundMoney(6.390000000000001), 6.39);
});

test("cashiers cannot create refunds", () => {
  assert.equal(hasPermission({ role: "Cashier" }, "refund.create"), false);
  assert.equal(hasPermission({ role: "Manager" }, "refund.create"), true);
});

test("loyalty reverses spend on every refund and visit only when fully refunded", () => {
  assert.deepEqual(
    loyaltyAdjustmentForRefund({
      refundAmount: 4.87,
      saleTotal: 13.26,
      saleAlreadyRefunded: 0,
      saleFullyRefundedAfter: false
    }),
    { totalSpentDelta: 4.87, loyaltyPointsDelta: 4, visitsDelta: 0 }
  );
  assert.deepEqual(
    loyaltyAdjustmentForRefund({
      refundAmount: 8.39,
      saleTotal: 13.26,
      saleAlreadyRefunded: 4.87,
      saleFullyRefundedAfter: true
    }),
    { totalSpentDelta: 8.39, loyaltyPointsDelta: 8, visitsDelta: 1 }
  );
});

test("expandRefundTenders spreads Split refunds across original legs", () => {
  assert.deepEqual(
    expandRefundTenders(
      [{ method: "Split", amount: 13.26 }],
      [
        { method: "Cash", amount: 6.63 },
        { method: "Card", amount: 6.63 }
      ]
    ),
    [
      { method: "Cash", amount: 6.63 },
      { method: "Card", amount: 6.63 }
    ]
  );
});

test("report date bounds default to 31 days and clamp to 366", () => {
  const bounded = resolveReportDateBounds("2020-01-01", "2024-12-31");
  assert.equal(bounded.to, "2024-12-31");
  assert.equal(bounded.from, "2024-01-01");
  const defaults = resolveReportDateBounds(null, "2024-06-15");
  assert.equal(defaults.to, "2024-06-15");
  assert.equal(defaults.from, "2024-05-16");
});

test("password hashes are salted and verifiable", () => {
  const first = hashPassword("correct horse battery staple");
  const second = hashPassword("correct horse battery staple");
  assert.notEqual(first, second);
  assert.equal(verifyPassword("correct horse battery staple", first), true);
  assert.equal(verifyPassword("wrong password", first), false);
});
