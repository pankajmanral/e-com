'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ErrorBanner } from '@/components/ui/ErrorBanner';

export interface AuthFormProps {
  action: 'login' | 'register';
}

export function AuthForm({ action }: AuthFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState<Record<string, string>>({
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
    addressLine1: '',
    addressCity: '',
    addressPostalCode: '',
    addressCountry: 'India',
  });

  const isLogin = action === 'login';

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const body: Record<string, unknown> = {};
      if (isLogin) {
        body.email = formData.email;
        body.password = formData.password;
      } else {
        body.fullName = formData.fullName;
        body.email = formData.email;
        body.password = formData.password;
        body.role = 'customer';
        body.address = {
          line1: formData.addressLine1,
          city: formData.addressCity,
          postalCode: formData.addressPostalCode,
          country: formData.addressCountry,
        };
      }

      const response = await fetch('/api/auth/' + action, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error?.message ?? 'Request failed');
        return;
      }

      if (isLogin) {
        const role = (data.user as { role?: string })?.role;
        window.location.href = role === 'admin' ? '/admin' : '/';
      } else {
        router.push('/login?registered=1');
      }
    } catch {
      setError('Unable to reach the server. Is the user service running?');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="mx-auto mt-10 mb-10 max-w-md w-full">
      <div className="px-5 py-4 border-b border-navy-100">
        <h2 className="text-xl font-semibold text-navy-900">
          {isLogin ? 'Sign in' : 'Create an account'}
        </h2>
        <p className="mt-0.5 text-sm text-navy-600">
          {isLogin
            ? 'Welcome back. Enter your email and password to continue.'
            : 'Join Vantage Supply Co. — already have an account? Sign in instead.'}
        </p>
      </div>

      <div className="px-5 py-4">
        {error && <ErrorBanner title={error} className="mb-4" />}

        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-1 gap-4">
                <div>
                  <label htmlFor="fullName" className="block text-sm font-medium text-navy-700">
                    Full name
                  </label>
                  <input
                    id="fullName"
                    name="fullName"
                    autoComplete="name"
                    required
                    className="mt-1 block w-full rounded-lg border border-navy-200 bg-white px-3 py-2 text-navy-900 placeholder-navy-400 focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                    value={formData.fullName}
                    onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  />
                </div>
              </div>
            </>
          )}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-navy-700">
              Email address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="mt-1 block w-full rounded-lg border border-navy-200 bg-white px-3 py-2 text-navy-900 placeholder-navy-400 focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-navy-700">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete={isLogin ? 'current-password' : 'new-password'}
              required
              minLength={8}
              className="mt-1 block w-full rounded-lg border border-navy-200 bg-white px-3 py-2 text-navy-900 placeholder-navy-400 focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            />
          </div>
          {!isLogin && (
            <>
              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-navy-700">
                  Confirm password
                </label>
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  className="mt-1 block w-full rounded-lg border border-navy-200 bg-white px-3 py-2 text-navy-900 placeholder-navy-400 focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="addressLine1" className="block text-sm font-medium text-navy-700">
                    Street address
                  </label>
                  <input
                    id="addressLine1"
                    name="addressLine1"
                    autoComplete="address-line1"
                    required
                    className="mt-1 block w-full rounded-lg border border-navy-200 bg-white px-3 py-2 text-navy-900 focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                    value={formData.addressLine1}
                    onChange={(e) => setFormData({ ...formData, addressLine1: e.target.value })}
                  />
                </div>
                <div>
                  <label htmlFor="addressCity" className="block text-sm font-medium text-navy-700">
                    City
                  </label>
                  <input
                    id="addressCity"
                    name="addressCity"
                    autoComplete="address-level2"
                    required
                    className="mt-1 block w-full rounded-lg border border-navy-200 bg-white px-3 py-2 text-navy-900 focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                    value={formData.addressCity}
                    onChange={(e) => setFormData({ ...formData, addressCity: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="addressPostalCode" className="block text-sm font-medium text-navy-700">
                    Postal code
                  </label>
                  <input
                    id="addressPostalCode"
                    name="addressPostalCode"
                    autoComplete="postal-code"
                    required
                    className="mt-1 block w-full rounded-lg border border-navy-200 bg-white px-3 py-2 text-navy-900 focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                    value={formData.addressPostalCode}
                    onChange={(e) => setFormData({ ...formData, addressPostalCode: e.target.value })}
                  />
                </div>
                <div>
                  <label htmlFor="addressCountry" className="block text-sm font-medium text-navy-700">
                    Country
                  </label>
                  <input
                    id="addressCountry"
                    name="addressCountry"
                    autoComplete="country"
                    required
                    className="mt-1 block w-full rounded-lg border border-navy-200 bg-white px-3 py-2 text-navy-900 focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                    value={formData.addressCountry}
                    onChange={(e) => setFormData({ ...formData, addressCountry: e.target.value })}
                  />
                </div>
              </div>
            </>
          )}
          <Button type="submit" variant="teal" size="lg" fullWidth loading={loading}>
            {isLogin ? 'Sign in' : 'Create account'}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-navy-600">
          {isLogin
            ? "Don't have an account? "
            : 'Already have an account? '}
          <Link
            href={isLogin ? '/register' : '/login'}
            className="font-medium text-teal-600 hover:text-teal-700"
          >
            {isLogin ? 'Create one' : 'Sign in'}
          </Link>
        </p>
      </div>
    </Card>
  );
}
