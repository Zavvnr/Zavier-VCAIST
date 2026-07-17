export type PricingKnobs = {
  basePrice: number;
  discountRate: number;
  discountThreshold: number;
  shippingFee: number;
};

export const defaultKnobs: PricingKnobs = {
  basePrice: 49,
  discountRate: 20,
  discountThreshold: 5,
  shippingFee: 6.99,
};

/** Mirrors the connected demo app, including its discovered shipping defect. */
export function runSamplePricing(quantity: number, knobs: PricingKnobs) {
  const subtotal = knobs.basePrice * quantity;
  const discount =
    quantity >= knobs.discountThreshold
      ? subtotal * (knobs.discountRate / 100)
      : 0;
  const total = subtotal - discount - knobs.shippingFee;

  return { subtotal, discount, total };
}

export function calculateBusinessSnapshot(knobs: PricingKnobs) {
  const typicalQuantity = 3;
  const typicalOrder = runSamplePricing(typicalQuantity, knobs).total;
  const monthlyOrders = 184;
  const revenue = typicalOrder * monthlyOrders;
  const cost = knobs.basePrice * 0.58 * typicalQuantity;
  const margin = typicalOrder > 0 ? ((typicalOrder - cost) / typicalOrder) * 100 : 0;

  return { averageOrder: typicalOrder, revenue, margin, monthlyOrders };
}

export function stressTest(knobs: PricingKnobs) {
  const cases = [0, 1, knobs.discountThreshold - 1, knobs.discountThreshold, 100];
  return cases.map((quantity) => {
    const result = runSamplePricing(quantity, knobs);
    return { quantity, total: result.total, passed: result.total >= 0 };
  });
}
