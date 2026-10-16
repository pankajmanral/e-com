import type { User } from '@ecommerce/shared';

/** Realistic seed data so demos and chaos experiments always have customers. */
export const SEED_USERS: User[] = [
  {
    id: 'usr-1001',
    fullName: 'Amelia Hartley',
    email: 'amelia.hartley@example.com',
    phone: '+91 98765 43210',
    address: { line1: '18 Marine Parade', city: 'Mumbai', postalCode: '400001', country: 'India' },
    createdAt: '2024-03-11T09:15:00.000Z',
  },
  {
    id: 'usr-1002',
    fullName: 'Daniel Okafor',
    email: 'daniel.okafor@example.com',
    phone: '+91 98765 43211',
    address: { line1: '4 Kingsway Court', city: 'Bengaluru', postalCode: '560025', country: 'India' },
    createdAt: '2024-05-02T17:40:00.000Z',
  },
  {
    id: 'usr-1003',
    fullName: 'Sofia Marchetti',
    email: 'sofia.marchetti@example.com',
    phone: '+39 340 1122334',
    address: { line1: 'Via Roma 22', city: 'Milano', postalCode: '20121', country: 'Italy' },
    createdAt: '2024-06-19T12:05:00.000Z',
  },
  {
    id: 'usr-1004',
    fullName: 'Liam OConnor',
    email: 'liam.oconnor@example.com',
    phone: '+353 85 123 4567',
    address: { line1: '7 Harcourt Terrace', city: 'Dublin', postalCode: 'D02 XY45', country: 'Ireland' },
    createdAt: '2024-08-07T08:55:00.000Z',
  },
  {
    id: 'usr-1005',
    fullName: 'Priya Raghunathan',
    email: 'priya.raghunathan@example.com',
    phone: '+91 98100 12345',
    address: { line1: '221B Residency Road', city: 'Bengaluru', postalCode: '560025', country: 'India' },
    createdAt: '2024-09-23T15:30:00.000Z',
  },
  {
    id: 'usr-1006',
    fullName: 'Marcus Bennett',
    email: 'marcus.bennett@example.com',
    phone: '+1 415 555 0132',
    address: { line1: '902 Howard Street', city: 'San Francisco', postalCode: '94103', country: 'United States' },
    createdAt: '2024-11-01T20:10:00.000Z',
  },
  {
    id: 'usr-1007',
    fullName: 'Hannah Bergstrom',
    email: 'hannah.bergstrom@example.com',
    phone: '+46 70 123 45 67',
    address: { line1: 'Sveavägen 45', city: 'Stockholm', postalCode: '113 59', country: 'Sweden' },
    createdAt: '2025-01-14T10:20:00.000Z',
  },
  {
    id: 'usr-1008',
    fullName: 'Kenji Watanabe',
    email: 'kenji.watanabe@example.com',
    phone: '+81 90 1234 5678',
    address: { line1: '2-11-3 Meguro', city: 'Tokyo', postalCode: '153-0063', country: 'Japan' },
    createdAt: '2025-02-28T06:45:00.000Z',
  },
];
