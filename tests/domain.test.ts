import test from "node:test";
import assert from "node:assert/strict";
import { calculateRefundLine, calculateSaleTotals, resolveSplitTender } from "../lib/finance.ts";
import { hashPassword, verifyPassword } from "../lib/password.ts";

test("sale totals round once per financial stage", () => {
  assert.deepEqual(calculateSaleTotals([{ unitPrice: 4.5, quantity: 2 },{ unitPrice: 3.25, quantity: 1 }], 0.0825), { subtotal: 12.25, tax: 1.01, total: 13.26 });
});

test("split tender reconciles exactly and rejects mismatches", () => {
  assert.deepEqual(resolveSplitTender(13.26), { cash: 6.63, card: 6.63 });
  assert.deepEqual(resolveSplitTender(10.01), { cash: 5.01, card: 5 });
  assert.throws(() => resolveSplitTender(10, 2, 7), /equal the sale total/);
});

test("refund tax is allocated from the original sale tax", () => {
  assert.deepEqual(calculateRefundLine(4.5, 1, 12.25, 1.01), { base: 4.5, tax: 0.37, amount: 4.87 });
});

test("password hashes are salted and verifiable", () => {
  const first = hashPassword("correct horse battery staple");
  const second = hashPassword("correct horse battery staple");
  assert.notEqual(first, second);
  assert.equal(verifyPassword("correct horse battery staple", first), true);
  assert.equal(verifyPassword("wrong password", first), false);
});
