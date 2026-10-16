import { describe, expect, it } from 'vitest';
import {
  computeTotals,
  lineTotal,
  round2,
  STANDARD_SHIPPING_COST,
  TAX_RATE,
} from '../src/pricing';

describe('pricing', () => {
  it('computes line totals, subtotal, shipping, tax and total', () => {
    const totals = computeTotals([
      { unitPrice: 5498.9, quantity: 1 },
      { unitPrice: 3298.9, quantity: 1 },
    ]);
    expect(totals.subtotal).toBe(8797.8); // 5498.90 + 3298.90
    expect(totals.shippingCost).toBe(764.5);
    expect(totals.tax).toBe(703.82); // 8797.80 * 0.08 = 703.824 → 703.82
    expect(totals.total).toBe(10266.12); // 8797.80 + 764.50 + 703.82
  });

  it('grants free shipping exactly at the ₹11,000 threshold', () => {
    const totals = computeTotals([{ unitPrice: 5500, quantity: 2 }]);
    expect(totals.subtotal).toBe(11000);
    expect(totals.shippingCost).toBe(0);
    expect(totals.tax).toBe(880); // 11000 * 0.08
    expect(totals.total).toBe(11880);
  });

  it('charges standard shipping one penny below the threshold', () => {
    const totals = computeTotals([{ unitPrice: 10999.99, quantity: 1 }]);
    expect(totals.subtotal).toBe(10999.99);
    expect(totals.shippingCost).toBe(STANDARD_SHIPPING_COST);
    expect(totals.tax).toBe(880); // 10999.99 * 0.08 rounds to 880.00
    expect(totals.total).toBe(12644.49);
  });

  it('rounds every amount to 2 decimals (float artefacts included)', () => {
    expect(lineTotal(2198.9, 3)).toBe(6596.7);
    expect(round2(5494.5 * 3)).toBe(16483.5);
    expect(round2(0.1 + 0.2)).toBe(0.3);

    const totals = computeTotals([{ unitPrice: 2198.9, quantity: 3 }]);
    expect(totals.subtotal).toBe(6596.7);
    expect(totals.tax).toBe(527.74);
    expect(totals.total).toBe(7888.94);
    expect(totals.total.toFixed(2)).toBe('7888.94');
  });

  it('multiplies quantity into each line before totalling', () => {
    const totals = computeTotals([{ unitPrice: 3298.9, quantity: 3 }]);
    expect(totals.subtotal).toBe(9896.7);
    expect(totals.shippingCost).toBe(764.5);
    expect(totals.tax).toBe(791.74);
    expect(totals.total).toBe(11452.94);
    expect(totals.tax).toBe(round2(9896.7 * TAX_RATE));
  });

  it('applies the shipping rule literally for an empty cart', () => {
    // Empty carts never reach pricing (the API requires 1..30 items), so the
    // Empty carts never reach pricing; the rule stays `subtotal >= 11000 ? 0 : 764.5`.
    expect(computeTotals([])).toEqual({ subtotal: 0, shippingCost: 764.5, tax: 0, total: 764.5 });
  });
});
