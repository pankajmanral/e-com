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
      { unitPrice: 49.99, quantity: 1 },
      { unitPrice: 29.99, quantity: 1 },
    ]);
    expect(totals.subtotal).toBe(79.98); // 49.99 + 29.99
    expect(totals.shippingCost).toBe(6.95); // under the £100 threshold
    expect(totals.tax).toBe(6.4); // 79.98 * 0.08 = 6.3984 → 6.40
    expect(totals.total).toBe(93.33); // 79.98 + 6.95 + 6.40
  });

  it('grants free shipping exactly at the £100 threshold', () => {
    const totals = computeTotals([{ unitPrice: 50, quantity: 2 }]);
    expect(totals.subtotal).toBe(100);
    expect(totals.shippingCost).toBe(0);
    expect(totals.tax).toBe(8); // 100 * 0.08
    expect(totals.total).toBe(108);
  });

  it('charges standard shipping one penny below the threshold', () => {
    const totals = computeTotals([{ unitPrice: 99.99, quantity: 1 }]);
    expect(totals.subtotal).toBe(99.99);
    expect(totals.shippingCost).toBe(STANDARD_SHIPPING_COST);
    expect(totals.tax).toBe(8); // 7.9992 → 8.00
    expect(totals.total).toBe(114.94); // 99.99 + 6.95 + 8.00
  });

  it('rounds every amount to 2 decimals (float artefacts included)', () => {
    expect(lineTotal(19.99, 3)).toBe(59.97); // 59.970000000000006 in floats
    expect(round2(49.95 * 3)).toBe(149.85); // 149.85000000000002 in floats
    expect(round2(0.1 + 0.2)).toBe(0.3);

    const totals = computeTotals([{ unitPrice: 19.99, quantity: 3 }]);
    expect(totals.subtotal).toBe(59.97);
    expect(totals.tax).toBe(4.8); // 4.7976 → 4.80
    expect(totals.total).toBe(71.72); // 59.97 + 6.95 + 4.80
    expect(totals.total.toFixed(2)).toBe('71.72');
  });

  it('multiplies quantity into each line before totalling', () => {
    const totals = computeTotals([{ unitPrice: 29.99, quantity: 3 }]);
    expect(totals.subtotal).toBe(89.97);
    expect(totals.shippingCost).toBe(6.95);
    expect(totals.tax).toBe(7.2); // 7.1976 → 7.20
    expect(totals.total).toBe(104.12); // 89.97 + 6.95 + 7.20
    expect(totals.tax).toBe(round2(89.97 * TAX_RATE));
  });

  it('applies the shipping rule literally for an empty cart', () => {
    // Empty carts never reach pricing (the API requires 1..30 items), so the
    // rule stays exactly `subtotal >= 100 ? 0 : 6.95`.
    expect(computeTotals([])).toEqual({ subtotal: 0, shippingCost: 6.95, tax: 0, total: 6.95 });
  });
});
