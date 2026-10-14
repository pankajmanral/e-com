import type { Order } from '@ecommerce/shared';

/**
 * Historical orders seeded on first boot so dashboards and the shop history
 * are never empty. Totals follow the same rules as src/pricing.ts.
 */
export const SEED_ORDERS: Order[] = [
  {
    id: 'ord-j7k2m9',
    userId: 'usr-1001',
    items: [
      {
        productId: 'prd-2001',
        name: 'Aurora Wireless Headphones',
        unitPrice: 179.99,
        quantity: 1,
        lineTotal: 179.99,
      },
    ],
    subtotal: 179.99,
    shippingCost: 0,
    tax: 14.4,
    total: 194.39,
    currency: 'GBP',
    status: 'delivered',
    customer: { fullName: 'Amelia Hartley', email: 'amelia.hartley@example.com' },
    shippingAddress: {
      line1: '18 Marine Parade',
      city: 'Brighton',
      postalCode: 'BN2 1TL',
      country: 'United Kingdom',
    },
    createdAt: '2025-09-14T10:24:00.000Z',
  },
  {
    id: 'ord-q4n8x1',
    userId: 'usr-1006',
    items: [
      {
        productId: 'prd-2023',
        name: 'Aria 5G Smartphone',
        unitPrice: 899.0,
        quantity: 1,
        lineTotal: 899.0,
      },
    ],
    subtotal: 899.0,
    shippingCost: 0,
    tax: 71.92,
    total: 970.92,
    currency: 'GBP',
    status: 'shipped',
    customer: { fullName: 'Marcus Bennett', email: 'marcus.bennett@example.com' },
    shippingAddress: {
      line1: '902 Howard Street',
      city: 'San Francisco',
      postalCode: '94103',
      country: 'United States',
    },
    createdAt: '2025-11-02T16:05:00.000Z',
  },
  {
    id: 'ord-b6p3v5',
    userId: 'usr-1002',
    items: [
      {
        productId: 'prd-2007',
        name: 'Stride Fitness Band',
        unitPrice: 49.99,
        quantity: 1,
        lineTotal: 49.99,
      },
      {
        productId: 'prd-2012',
        name: 'Titan USB-C Braided Cable',
        unitPrice: 19.99,
        quantity: 2,
        lineTotal: 39.98,
      },
    ],
    subtotal: 89.97,
    shippingCost: 6.95,
    tax: 7.2,
    total: 104.12,
    currency: 'GBP',
    status: 'confirmed',
    customer: { fullName: 'Daniel Okafor', email: 'daniel.okafor@example.com' },
    shippingAddress: {
      line1: '4 Kingsway Court',
      city: 'Manchester',
      postalCode: 'M20 2RN',
      country: 'United Kingdom',
    },
    createdAt: '2025-12-19T09:41:00.000Z',
  },
];
