export type PublicConfig = {
  businessName: string;
  storeName: string;
  registerCode: string;
  currency: string;
  locale: string;
  taxRate: number;
};

function numberEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

export function getPublicConfig(): PublicConfig {
  const currency = (process.env.POS_CURRENCY || "USD").toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("POS_CURRENCY must be a three-letter ISO currency code");
  const taxRate = numberEnv("POS_TAX_RATE", 0.0825);
  if (taxRate < 0 || taxRate > 1) throw new Error("POS_TAX_RATE must be between 0 and 1");
  return {
    businessName: process.env.POS_BUSINESS_NAME || "Atlas Coffee",
    storeName: process.env.POS_STORE_NAME || "Downtown store",
    registerCode: process.env.POS_REGISTER_CODE || "REG-01",
    currency,
    locale: process.env.POS_LOCALE || "en-US",
    taxRate
  };
}

export function calculateTax(subtotal: number) {
  return Number((subtotal * getPublicConfig().taxRate).toFixed(2));
}
