import type { Metadata } from 'next';
import AdminDashboard from '@/components/admin/AdminDashboard';

export const metadata: Metadata = {
  title: 'Resilience Lab',
  description:
    'Service-mesh resilience dashboard: live health, metrics, snapshots and chaos experiments.',
};

export const dynamic = 'force-dynamic';

/** Admin shell — all live data is fetched client-side by the dashboard. */
export default function AdminPage() {
  return <AdminDashboard />;
}
