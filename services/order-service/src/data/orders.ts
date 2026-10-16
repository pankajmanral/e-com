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
        unitPrice: 19798.9,
        quantity: 1,
        lineTotal: 19798.9,
      },
    ],
    subtotal: 19798.9,
    shippingCost: 0,
    tax: 1583.91,
    total: 21382.81,
    currency: 'INR',
    status: 'delivered',
    customer: { fullName: 'Amelia Hartley', email: 'amelia.hartley@example.com' },
    shippingAddress: {
      line1: '18 Marine Parade',
      city: 'Mumbai',
      postalCode: '400001',
      country: 'India',
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
        unitPrice: 98890,
        quantity: 1,
        lineTotal: 98890,
      },
    ],
    subtotal: 98890,
    shippingCost: 0,
    tax: 7911.2,
    total: 106801.2,
    currency: 'INR',
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
        unitPrice: 5498.9,
        quantity: 1,
        lineTotal: 5498.9,
      },
      {
        productId: 'prd-2012',
        name: 'Titan USB-C Braided Cable',
        unitPrice: 2198.9,
        quantity: 2,
        lineTotal: 4397.8,
      },
    ],
    subtotal: 9896.7,
    shippingCost: 764.5,
    tax: 791.74,
    total: 11452.94,
    currency: 'INR',
    status: 'confirmed',
    customer: { fullName: 'Daniel Okafor', email: 'daniel.okafor@example.com' },
    shippingAddress: {
      line1: '4 Kingsway Court',
      city: 'Bengaluru',
      postalCode: '560025',
      country: 'India',
    },
    createdAt: '2025-12-19T09:41:00.000Z',
  },
];
