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
