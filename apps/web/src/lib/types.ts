/**
 * Shared DTO types mirroring the backend service contracts.
 * Nothing here is fabricated — every type maps to a real service response.
 */

/* ------------------------------------------------------------------ */
/* Product service (http://localhost:4002)                             */
/* ------------------------------------------------------------------ */

export type ProductCategory =
  | 'audio'
  | 'wearables'
  | 'accessories'
  | 'home-tech'
  | 'mobile';

export type ProductSort = 'featured' | 'price-asc' | 'price-desc' | 'rating' | 'newest';

export interface Product {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: ProductCategory;
  /** INR amount. */
  price: number;
  currency: string;
  stock: number;
  rating: number;
  reviewCount: number;
  featured: boolean;
  tags: string[];
  /** Image path served by the web app, e.g. '/img/<slug>'. */
  image: string;
}

export interface ProductListResponse {
  items: Product[];
  total: number;
  page: number;
  pages: number;
  perPage: number;
}

export interface CategoryPriceRange {
  min: number;
  max: number;
}

export interface Category {
  slug: string;
  name: string;
  count: number;
  priceRange: CategoryPriceRange;
}

/* ------------------------------------------------------------------ */
/* Order service (http://localhost:4003)                               */
/* ------------------------------------------------------------------ */

export type PaymentMethod = 'card' | 'paypal' | 'cod';

export interface OrderCustomer {
  fullName: string;
  email: string;
  phone?: string;
}

export interface ShippingAddress {
  line1: string;
  line2?: string;
  city: string;
  postalCode: string;
  country: string;
}

export interface PaymentInput {
  method: PaymentMethod;
  cardholderName?: string;
  cardNumber?: string;
  expiryMMYY?: string;
  cvc?: string;
}

export interface OrderRequest {
  customer: OrderCustomer;
  shippingAddress: ShippingAddress;
  items: Array<{ productId: string; quantity: number }>;
  payment: PaymentInput;
}

export interface OrderItem {
  productId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

export interface Order {
  id: string;
  userId: string;
  items: OrderItem[];
  subtotal: number;
  shippingCost: number;
  tax: number;
  total: number;
  currency: string;
  status: string;
  customer: { fullName: string; email: string };
  shippingAddress: ShippingAddress;
  createdAt: string;
  /** W3C trace id propagated from the order service, when present. */
  traceId?: string;
}

/* ------------------------------------------------------------------ */
/* Ops service (http://localhost:4004)                                 */
/* ------------------------------------------------------------------ */

export type ServiceName = 'user-service' | 'product-service' | 'order-service';

export type HealthStatus = 'up' | 'down' | 'degraded';
export type OverallHealth = 'healthy' | 'degraded' | 'critical';

export interface ServiceHealth {
  name: ServiceName;
  baseUrl: string;
  status: HealthStatus;
  latencyMs: number;
  version?: string;
}

export interface Health {
  overall: OverallHealth;
  checkedAt: string;
  services: ServiceHealth[];
}

export interface OpsStatus {
  mode: 'local' | 'k8s';
  chaosEnabled: boolean;
  chaosGuard: { allowed: boolean; reason: string };
  clusterContext: string | null;
  kubectlAvailable: boolean;
  prometheus: { url: string; available: boolean };
  jaegerUrl: string | null;
  services: string[];
}

export interface ServiceMetrics {
  service: string;
  requestsPerSec: number;
  errorRate: number;
  p95LatencyMs: number;
  totalRequests: number;
  totalErrors: number;
}

export interface MetricsResponse {
  source: 'prometheus' | 'scrape';
  window: string;
  services: ServiceMetrics[];
}

export interface MetricPoint {
  t: string;
  requestsPerSec: number;
  errorRate: number;
  p95LatencyMs: number;
}

export interface MetricSeries {
  service: string;
  points: MetricPoint[];
}

export interface MetricsHistoryResponse {
  source: 'prometheus' | 'scrape';
  window: string;
  series: MetricSeries[];
}

export interface SnapshotServiceMetrics extends ServiceMetrics {}

export interface Snapshot {
  id: string;
  label?: string;
  createdAt: string;
  source: string;
  services: ServiceMetrics[];
  health: {
    overall: OverallHealth;
    perService: Record<string, HealthStatus>;
  };
}

export interface ComparisonRow {
  service: string;
  metric: string;
  before: number;
  after: number;
  delta: number;
  deltaPct: number | null;
}

export interface ComparisonResponse {
  before: Snapshot;
  after: Snapshot;
  delta: ComparisonRow[];
}

/* Chaos experiments */

export type ChaosType = 'pod-failure' | 'network-latency' | 'service-outage';
export type ChaosTarget = ServiceName;
export type ChaosStatus = 'running' | 'completed' | 'stopped' | 'failed';

export interface Experiment {
  id: string;
  type: ChaosType;
  target: ChaosTarget;
  provider: string;
  durationSec: number;
  delayMs?: number;
  status: ChaosStatus;
  startedAt: string;
  endsAt: string;
  stoppedAt?: string;
  beforeSnapshotId?: string;
  afterSnapshotId?: string;
  delta?: ComparisonRow[];
  log: string[];
  error?: string;
}

export interface ChaosListResponse {
  active: Experiment[];
  recent: Experiment[];
}

export interface ChaosRequest {
  type: ChaosType;
  target: ChaosTarget;
  durationSec: number;
  delayMs?: number;
}

/* ------------------------------------------------------------------ */
/* Errors                                                              */
/* ------------------------------------------------------------------ */

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: Array<{ field: string; message: string }>;
    requestId?: string;
  };
}
