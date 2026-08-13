export const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function calculateSaleTotals(lines: Array<{ unitPrice: number; quantity: number }>, taxRate: number) {
  if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 1) throw new Error("Invalid tax rate");
  const subtotal = roundMoney(
    lines.reduce((sum, line) => {
      if (
        !Number.isFinite(line.unitPrice) ||
        line.unitPrice < 0 ||
        !Number.isInteger(line.quantity) ||
        line.quantity < 1
      )
        throw new Error("Invalid sale line");
      return sum + line.unitPrice * line.quantity;
    }, 0)
  );
  const tax = roundMoney(subtotal * taxRate);
  return { subtotal, tax, total: roundMoney(subtotal + tax) };
}

export function resolveSplitTender(total: number, requestedCash?: number, requestedCard?: number) {
  const cash = Number.isFinite(requestedCash) ? roundMoney(requestedCash!) : roundMoney(total / 2);
  const card = Number.isFinite(requestedCard) ? roundMoney(requestedCard!) : roundMoney(total - cash);
  if (cash < 0 || card < 0 || Math.abs(cash + card - total) > 0.01)
    throw new Error("Split payments must equal the sale total");
  return { cash, card };
}

export function calculateRefundLine(
  unitPrice: number,
  quantity: number,
  originalSubtotal: number,
  originalTax: number
) {
  const base = roundMoney(unitPrice * quantity);
  const tax = roundMoney(originalSubtotal ? originalTax * (base / originalSubtotal) : 0);
  return { base, tax, amount: roundMoney(base + tax) };
}

/** Expand Split refunds across original tenders so remaining capacity stays accurate. */
export function expandRefundTenders(
  refunds: Array<{ method: string; amount: number }>,
  originalPayments: Array<{ method: string; amount: number }>
) {
  const paidTotal = roundMoney(originalPayments.reduce((sum, payment) => sum + payment.amount, 0));
  const result: Array<{ method: string; amount: number }> = [];
  for (const refund of refunds) {
    if (refund.method !== "Split") {
      result.push({ method: refund.method, amount: roundMoney(refund.amount) });
      continue;
    }
    let allocated = 0;
    originalPayments.forEach((payment, index) => {
      const isLast = index === originalPayments.length - 1;
      const share = isLast
        ? roundMoney(refund.amount - allocated)
        : roundMoney(paidTotal ? refund.amount * (payment.amount / paidTotal) : 0);
      if (share > 0) result.push({ method: payment.method, amount: share });
      allocated = roundMoney(allocated + share);
    });
  }
  return result;
}

/**
 * Choose refund tender legs. Explicit Cash/Card uses that method when capacity remains.
 * Otherwise refunds follow remaining original tenders (cash→cash, card→card), splitting
 * proportionally when multiple legs still have balance.
 */
export function allocateRefundTender(
  refundAmount: number,
  originalPayments: Array<{ method: string; amount: number }>,
  priorRefunds: Array<{ method: string; amount: number }> = [],
  requestedMethod?: string
) {
  const amount = roundMoney(refundAmount);
  if (!(amount > 0)) throw new Error("Invalid refund amount");
  if (!originalPayments.length) throw new Error("No original tender");

  const paid = new Map<string, number>();
  for (const payment of originalPayments) {
    paid.set(payment.method, roundMoney((paid.get(payment.method) ?? 0) + payment.amount));
  }
  const refunded = new Map<string, number>();
  for (const refund of expandRefundTenders(priorRefunds, originalPayments)) {
    refunded.set(refund.method, roundMoney((refunded.get(refund.method) ?? 0) + refund.amount));
  }
  const remaining = (method: string) => roundMoney((paid.get(method) ?? 0) - (refunded.get(method) ?? 0));

  if (requestedMethod === "Cash" || requestedMethod === "Card") {
    if (remaining(requestedMethod) + 0.01 < amount) throw new Error("TENDER");
    return [{ method: requestedMethod, amount }];
  }

  const methods = [...paid.keys()].filter((method) => remaining(method) > 0.001);
  if (!methods.length) throw new Error("TENDER");
  const totalRemaining = roundMoney(methods.reduce((sum, method) => sum + remaining(method), 0));
  if (totalRemaining + 0.01 < amount) throw new Error("TENDER");
  if (methods.length === 1) return [{ method: methods[0], amount }];

  const allocations: Array<{ method: string; amount: number }> = [];
  let allocated = 0;
  methods.forEach((method, index) => {
    const isLast = index === methods.length - 1;
    const share = isLast ? roundMoney(amount - allocated) : roundMoney(amount * (remaining(method) / totalRemaining));
    if (share > 0) allocations.push({ method, amount: share });
    allocated = roundMoney(allocated + share);
  });
  return allocations;
}

/** Customer loyalty/spend reversal for a refund against an existing sale. */
export function loyaltyAdjustmentForRefund(input: {
  refundAmount: number;
  saleTotal: number;
  saleAlreadyRefunded: number;
  saleFullyRefundedAfter: boolean;
}) {
  const amount = roundMoney(input.refundAmount);
  return {
    totalSpentDelta: amount,
    loyaltyPointsDelta: Math.floor(amount),
    visitsDelta: input.saleFullyRefundedAfter ? 1 : 0
  };
}

/** Bound report windows: default last 31 days; clamp to at most 366 days. */
export function resolveReportDateBounds(from: string | null | undefined, to: string | null | undefined) {
  const isoDay = (value: string | null | undefined) =>
    value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
  const today = new Date();
  const toDay = isoDay(to) ?? today.toISOString().slice(0, 10);
  const defaultFrom = new Date(`${toDay}T00:00:00.000Z`);
  defaultFrom.setUTCDate(defaultFrom.getUTCDate() - 30);
  let fromDay = isoDay(from) ?? defaultFrom.toISOString().slice(0, 10);
  if (fromDay > toDay) fromDay = toDay;
  const fromDate = new Date(`${fromDay}T00:00:00.000Z`);
  const toDate = new Date(`${toDay}T00:00:00.000Z`);
  const maxFrom = new Date(toDate);
  maxFrom.setUTCDate(maxFrom.getUTCDate() - 365);
  if (fromDate < maxFrom) fromDay = maxFrom.toISOString().slice(0, 10);
  return { from: fromDay, to: toDay };
}
