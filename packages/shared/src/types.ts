/** Cross-service DTOs. Services own their persistence; these are wire types. */

export interface Address {
  line1: string;
  line2?: string;
  city: string;
  postalCode: string;
  country: string;
}

export interface User {
  id: string;
  fullName: string;
  email: string;
  phone?: string;
  address: Address;
  createdAt: string;
}

export type ProductCategory = 'audio' | 'wearables' | 'accessories' | 'home-tech' | 'mobile';

export interface Product {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: ProductCategory;
  price: number;
  currency: string;
  stock: number;
  rating: number;
  reviewCount: number;
  featured: boolean;
  tags: string[];
  image: string;
}

export interface OrderItem {
  productId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

export type OrderStatus = 'confirmed' | 'shipped' | 'delivered' | 'cancelled';

export interface Order {
  id: string;
  userId: string;
  items: OrderItem[];
  subtotal: number;
  shippingCost: number;
  tax: number;
  total: number;
  currency: string;
  status: OrderStatus;
  customer: { fullName: string; email: string };
  shippingAddress: Address;
  createdAt: string;
  traceId?: string;
}

export interface ProductListResponse {
  items: Product[];
  total: number;
  page: number;
  pages: number;
  perPage: number;
}

export interface HealthResponse {
  status: 'ok' | 'degraded';
  service: string;
  version: string;
  uptimeSec: number;
  timestamp: string;
}
