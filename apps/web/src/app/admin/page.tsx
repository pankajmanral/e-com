import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import AdminDashboard from '@/components/admin/AdminDashboard';
import { getBaseUrls, fetchJson } from '@/lib/api';

export const metadata: Metadata = {
  title: 'Resilience Lab',
  description:
    'Service-mesh resilience dashboard: live health, metrics, snapshots and chaos experiments.',
};

export const dynamic = 'force-dynamic';

/**
 * Admin shell — protected by a server-side session check. Only users with
 * the 'admin' role may access the resilience dashboard.
 */
export default async function AdminPage() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get('vantage_session');

  if (!sessionCookie) {
    redirect('/login');
  }

  let user: { id: string; email: string; role: string } | null = null;
  try {
    const data = await fetchJson<{ user: { id: string; email: string; role: string } }>(
      `${getBaseUrls().user}/api/auth/me`,
      {
        headers: { cookie: `vantage_session=${sessionCookie.value}` },
      },
    );
    user = data.user ?? null;
  } catch {
    redirect('/login');
  }

  if (!user || user.role !== 'admin') {
    redirect('/login');
  }

  return <AdminDashboard />;
}
