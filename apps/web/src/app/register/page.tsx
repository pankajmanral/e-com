import type { Metadata } from 'next';
import { AuthForm } from '@/components/auth/AuthForm';

export const metadata: Metadata = { title: 'Create an account' };
export const dynamic = 'force-dynamic';

export default function RegisterPage() {
  return <AuthForm action="register" />;
}
