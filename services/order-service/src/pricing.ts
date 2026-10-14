/**
 * Pure pricing rules for checkout — no I/O, no express, so the maths can be
 * unit-tested exhaustively (see test/pricing.test.ts).
 *
 *   lineTotal = unitPrice * quantity          (rounded to 2dp)
 *   subtotal  = Σ lineTotals
 *   shipping  = 0 when subtotal >= £100, otherwise £6.95
 *   tax       = 8% of subtotal (rounded to 2dp)
 *   total     = subtotal + shipping + tax     (rounded to 2dp)
 */

export const CURRENCY = 'GBP';
export const FREE_SHIPPING_THRESHOLD = 100;
export const STANDARD_SHIPPING_COST = 6.95;
export const TAX_RATE = 0.08;

/** Round to 2 decimal places (half-up), the way money should be rounded. */
export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export interface PriceableItem {
  unitPrice: number;
  quantity: number;
}

export interface OrderTotals {
  subtotal: number;
  shippingCost: number;
  tax: number;
  total: number;
}

/** Line total for one product line: unit price × quantity, rounded to 2dp. */
export function lineTotal(unitPrice: number, quantity: number): number {
  return round2(unitPrice * quantity);
}

/** Compute the cart totals from priced item lines. */
export function computeTotals(items: PriceableItem[]): OrderTotals {
  const subtotal = round2(items.reduce((sum, item) => sum + lineTotal(item.unitPrice, item.quantity), 0));
  const shippingCost = subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : STANDARD_SHIPPING_COST;
  const tax = round2(subtotal * TAX_RATE);
  const total = round2(subtotal + shippingCost + tax);
  return { subtotal, shippingCost, tax, total };
}
