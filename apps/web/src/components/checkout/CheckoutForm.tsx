'use client';

/**
 * Checkout form: contact, shipping and payment details with client-side
 * validation, a live order summary, and submission to POST /api/orders
 * (proxied to the order service).
 */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useCart } from '@/lib/cart';
import { formatPrice } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { Spinner } from '@/components/ui/Spinner';
import ProductImage from '@/components/product/ProductImage';
import type { ApiErrorBody, Order, PaymentMethod } from '@/lib/types';

const FREE_SHIPPING_THRESHOLD = 100;
const SHIPPING_FLAT = 6.95;
const TAX_RATE = 0.08;

interface FormState {
  fullName: string;
  email: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  postalCode: string;
  country: string;
  method: PaymentMethod;
  cardholderName: string;
  cardNumber: string;
  expiryMMYY: string;
  cvc: string;
}

const initialForm: FormState = {
  fullName: '',
  email: '',
  phone: '',
  line1: '',
  line2: '',
  city: '',
  postalCode: '',
  country: 'United Kingdom',
  method: 'card',
  cardholderName: '',
  cardNumber: '',
  expiryMMYY: '',
  cvc: '',
};

type FieldErrors = Partial<Record<keyof FormState, string>>;

function digits(value: string): string {
  return value.replace(/\D/g, '');
}

function validate(form: FormState): FieldErrors {
  const errors: FieldErrors = {};

  if (!form.fullName.trim()) errors.fullName = 'Enter the recipient’s full name.';
  if (!form.email.trim()) {
    errors.email = 'Enter your email address.';
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim())) {
    errors.email = 'Enter a valid email address, e.g. you@example.com.';
  }
  if (form.phone && !/^[+()\d\s-]{7,20}$/.test(form.phone.trim())) {
    errors.phone = 'Enter a valid phone number.';
  }

  if (!form.line1.trim()) errors.line1 = 'Enter your street address.';
  if (!form.city.trim()) errors.city = 'Enter your town or city.';
  if (!form.postalCode.trim()) {
    errors.postalCode = 'Enter your postal code.';
  } else if (!/^[A-Za-z0-9 ]{5,9}$/.test(form.postalCode.trim().replace(/\s+/g, ''))) {
    errors.postalCode = 'Enter a valid UK postal code.';
  }
  if (!form.country.trim()) errors.country = 'Enter your country.';

  if (form.method === 'card') {
    if (!form.cardholderName.trim()) {
      errors.cardholderName = 'Enter the name on the card.';
    }
    const number = digits(form.cardNumber);
    if (!number) {
      errors.cardNumber = 'Enter your card number.';
    } else if (number.length < 13 || number.length > 19) {
      errors.cardNumber = 'A card number has 13–19 digits.';
    }

    const expiry = form.expiryMMYY.trim();
    const match = expiry.match(/^(0[1-9]|1[0-2])\s*[\/-]?\s*(\d{2})$/);
    if (!expiry) {
      errors.expiryMMYY = 'Enter the expiry date as MM/YY.';
    } else if (!match) {
      errors.expiryMMYY = 'Use the format MM/YY, e.g. 04/28.';
    } else {
      const month = Number(match[1]);
      const year = 2000 + Number(match[2]);
      const now = new Date();
      const endOfMonth = new Date(year, month, 0, 23, 59, 59);
      if (endOfMonth < now) errors.expiryMMYY = 'This card has expired.';
    }

    const cvc = digits(form.cvc);
    if (!cvc) {
      errors.cvc = 'Enter the security code.';
    } else if (cvc.length < 3 || cvc.length > 4) {
      errors.cvc = 'The security code is 3–4 digits.';
    }
  }

  return errors;
}

function Field({
  id,
  label,
  error,
  children,
  hint,
  required,
  autoComplete,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  autoComplete?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-navy-800">
        {label}
        {required && (
          <span aria-hidden="true" className="ml-0.5 text-teal-600">
            *
          </span>
        )}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-navy-500">{hint}</p>}
      {error && (
        <p id={`${id}-error`} className="mt-1 text-xs font-medium text-navy-900">
          <svg viewBox="0 0 20 20" fill="none" className="mr-1 inline size-3.5 -translate-y-px" aria-hidden="true">
            <path
              d="M10 6.5v4m0 3h.01M8.6 3.4 1.9 15a1.6 1.6 0 0 0 1.4 2.4h13.4a1.6 1.6 0 0 0 1.4-2.4L11.4 3.4a1.6 1.6 0 0 0-2.8 0Z"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {error}
        </p>
      )}
    </div>
  );
}

const inputClass = (invalid: boolean) =>
  [
    'h-10 w-full rounded-lg border bg-white px-3 text-sm text-navy-800 placeholder:text-navy-400',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-500',
    'transition-colors hover:border-navy-300',
    invalid ? 'border-navy-900' : 'border-navy-200',
  ].join(' ');

const paymentMethods: Array<{ value: PaymentMethod; label: string; note: string }> = [
  { value: 'card', label: 'Card', note: 'Visa, Mastercard — processed securely' },
  { value: 'paypal', label: 'PayPal', note: 'You will confirm payment after ordering' },
  { value: 'cod', label: 'Cash on delivery', note: 'Pay the courier when your order arrives' },
];

export default function CheckoutForm() {
  const router = useRouter();
  const { items, mounted, subtotal, clear } = useCart();

  const [form, setForm] = useState<FormState>(initialForm);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [banner, setBanner] = useState<{ title: string; body: string } | null>(null);

  const set = (key: keyof FormState) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const value = event.target.value;
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const shipping = subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_FLAT;
  const tax = useMemo(() => Math.round(subtotal * TAX_RATE * 100) / 100, [subtotal]);
  const total = useMemo(
    () => Math.round((subtotal + shipping + tax) * 100) / 100,
    [subtotal, shipping, tax],
  );

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const found = validate(form);
    setErrors(found);
    setBanner(null);
    if (Object.keys(found).length > 0) {
      // Focus the first invalid field for keyboard users.
      const firstKey = Object.keys(found)[0];
      document.getElementById(firstKey)?.focus();
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          customer: {
            fullName: form.fullName.trim(),
            email: form.email.trim(),
            ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
          },
          shippingAddress: {
            line1: form.line1.trim(),
            ...(form.line2.trim() ? { line2: form.line2.trim() } : {}),
            city: form.city.trim(),
            postalCode: form.postalCode.trim(),
            country: form.country.trim(),
          },
          items: items.map((item) => ({ productId: item.productId, quantity: item.quantity })),
          payment: {
            method: form.method,
            ...(form.method === 'card'
              ? {
                  cardholderName: form.cardholderName.trim(),
                  cardNumber: digits(form.cardNumber),
                  expiryMMYY: digits(form.expiryMMYY),
                  cvc: digits(form.cvc),
                }
              : {}),
          },
        }),
      });

      if (response.ok) {
        const order = (await response.json()) as Order;
        clear();
        router.push(`/orders/${order.id}`);
        return;
      }

      let body: ApiErrorBody | null = null;
      try {
        body = (await response.json()) as ApiErrorBody;
      } catch {
        body = null;
      }
      const code = body?.error?.code;
      const message = body?.error?.message;

      if (response.status === 402 || code === 'PAYMENT_DECLINED') {
        setBanner({
          title: 'Payment declined',
          body: 'Your payment method was declined. Try a different card — the test card 4242 4242 4242 4242 always approves, while 4000 0000 0000 0002 always declines.',
        });
      } else if (response.status === 409 || code === 'CONFLICT') {
        setBanner({
          title: 'Not enough stock',
          body: message ?? 'Some items no longer have enough stock for your quantities. Adjust the quantities in your cart and try again.',
        });
      } else if (response.status === 400 && body?.error?.details?.length) {
        const fieldErrors: FieldErrors = {};
        for (const detail of body.error.details) {
          fieldErrors[detail.field as keyof FormState] = detail.message;
        }
        setErrors(fieldErrors);
        setBanner({
          title: 'Please check your details',
          body: message ?? 'Some fields need attention before we can place the order.',
        });
      } else if (response.status === 503 || code === 'SERVICE_UNAVAILABLE') {
        setBanner({
          title: 'Order service is offline',
          body: message ?? 'We could not reach the order service. Start the backend with npm run dev and try again.',
        });
      } else {
        setBanner({
          title: 'We could not place your order',
          body: message ?? `The order service returned status ${response.status}. Please try again.`,
        });
      }
    } catch {
      setBanner({
        title: 'We could not place your order',
        body: 'The order service is unreachable. Check that the backend is running (npm run dev) and try again.',
      });
    } finally {
      setSubmitting(false);
    }
  }

  if (mounted && items.length === 0) {
    return (
      <div className="rounded-xl border border-navy-100 bg-white p-8 text-center shadow-soft">
        <h2 className="text-lg font-semibold text-navy-900">Your cart is empty</h2>
        <p className="mt-2 text-sm text-navy-600">Add some products before checking out.</p>
        <Link href="/products" className="mt-5 inline-block">
          <Button type="button" variant="teal">
            Browse the collection
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1fr_22rem] lg:gap-12">
      <form id="checkout-form" onSubmit={handleSubmit} noValidate className="min-w-0 space-y-10">
        {banner && (
          <ErrorBanner title={banner.title}>
            <p>{banner.body}</p>
          </ErrorBanner>
        )}

        {/* Contact */}
        <fieldset className="space-y-4">
          <legend className="mb-4 text-lg font-semibold text-navy-900">Contact</legend>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field id="fullName" label="Full name" error={errors.fullName} required autoComplete="name">
              <input
                id="fullName"
                name="fullName"
                type="text"
                autoComplete="name"
                value={form.fullName}
                onChange={set('fullName')}
                aria-invalid={Boolean(errors.fullName)}
                aria-describedby={errors.fullName ? 'fullName-error' : undefined}
                className={inputClass(Boolean(errors.fullName))}
                placeholder="Alex Morgan"
              />
            </Field>
            <Field id="email" label="Email" error={errors.email} required autoComplete="email" hint="Your receipt and tracking details go here.">
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                value={form.email}
                onChange={set('email')}
                aria-invalid={Boolean(errors.email)}
                aria-describedby={errors.email ? 'email-error' : undefined}
                className={inputClass(Boolean(errors.email))}
                placeholder="you@example.com"
              />
            </Field>
          </div>
          <Field id="phone" label="Phone (optional)" error={errors.phone} autoComplete="tel">
            <input
              id="phone"
              name="phone"
              type="tel"
              autoComplete="tel"
              value={form.phone}
              onChange={set('phone')}
              aria-invalid={Boolean(errors.phone)}
              aria-describedby={errors.phone ? 'phone-error' : undefined}
              className={inputClass(Boolean(errors.phone))}
              placeholder="+44 7700 900000"
            />
          </Field>
        </fieldset>

        {/* Shipping */}
        <fieldset className="space-y-4 border-t border-navy-100 pt-8">
          <legend className="mb-4 text-lg font-semibold text-navy-900">Shipping address</legend>
          <Field id="line1" label="Address line 1" error={errors.line1} required autoComplete="address-line1">
            <input
              id="line1"
              name="line1"
              type="text"
              autoComplete="address-line1"
              value={form.line1}
              onChange={set('line1')}
              aria-invalid={Boolean(errors.line1)}
              aria-describedby={errors.line1 ? 'line1-error' : undefined}
              className={inputClass(Boolean(errors.line1))}
              placeholder="12 Harbour Row"
            />
          </Field>
          <Field id="line2" label="Address line 2 (optional)" autoComplete="address-line2">
            <input
              id="line2"
              name="line2"
              type="text"
              autoComplete="address-line2"
              value={form.line2}
              onChange={set('line2')}
              className={inputClass(false)}
              placeholder="Flat, suite, unit"
            />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field id="city" label="Town / city" error={errors.city} required autoComplete="address-level2">
              <input
                id="city"
                name="city"
                type="text"
                autoComplete="address-level2"
                value={form.city}
                onChange={set('city')}
                aria-invalid={Boolean(errors.city)}
                aria-describedby={errors.city ? 'city-error' : undefined}
                className={inputClass(Boolean(errors.city))}
                placeholder="Bristol"
              />
            </Field>
            <Field id="postalCode" label="Postal code" error={errors.postalCode} required autoComplete="postal-code">
              <input
                id="postalCode"
                name="postalCode"
                type="text"
                autoComplete="postal-code"
                value={form.postalCode}
                onChange={set('postalCode')}
                aria-invalid={Boolean(errors.postalCode)}
                aria-describedby={errors.postalCode ? 'postalCode-error' : undefined}
                className={inputClass(Boolean(errors.postalCode))}
                placeholder="BS1 4ST"
              />
            </Field>
            <Field id="country" label="Country" error={errors.country} required autoComplete="country-name">
              <input
                id="country"
                name="country"
                type="text"
                autoComplete="country-name"
                value={form.country}
                onChange={set('country')}
                aria-invalid={Boolean(errors.country)}
                aria-describedby={errors.country ? 'country-error' : undefined}
                className={inputClass(Boolean(errors.country))}
              />
            </Field>
          </div>
        </fieldset>

        {/* Payment */}
        <fieldset className="space-y-4 border-t border-navy-100 pt-8">
          <legend className="mb-4 text-lg font-semibold text-navy-900">Payment</legend>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Payment method">
            {paymentMethods.map((method) => {
              const selected = form.method === method.value;
              return (
                <label
                  key={method.value}
                  className={[
                    'flex cursor-pointer flex-col gap-1 rounded-xl border p-4 transition-colors',
                    selected
                      ? 'border-teal-500 bg-teal-50/60 ring-1 ring-teal-500'
                      : 'border-navy-200 bg-white hover:border-navy-300',
                  ].join(' ')}
                >
                  <span className="flex items-center gap-2 text-sm font-semibold text-navy-900">
                    <input
                      type="radio"
                      name="method"
                      value={method.value}
                      checked={selected}
                      onChange={set('method')}
                      className="size-4 accent-teal-600"
                    />
                    {method.label}
                  </span>
                  <span className="text-xs leading-relaxed text-navy-500">{method.note}</span>
                </label>
              );
            })}
          </div>

          {form.method === 'card' && (
            <div className="animate-fade-up space-y-4 rounded-xl border border-navy-100 bg-navy-50/50 p-5">
              <div className="rounded-lg bg-navy-900 px-3 py-2 text-xs leading-relaxed text-navy-100">
                <span className="font-semibold text-teal-300">Test cards:</span> 4242 4242 4242 4242
                approves · 4000 0000 0000 0002 declines (402 PAYMENT_DECLINED).
              </div>
              <Field id="cardholderName" label="Cardholder name" error={errors.cardholderName} required autoComplete="cc-name">
                <input
                  id="cardholderName"
                  name="cardholderName"
                  type="text"
                  autoComplete="cc-name"
                  value={form.cardholderName}
                  onChange={set('cardholderName')}
                  aria-invalid={Boolean(errors.cardholderName)}
                  aria-describedby={errors.cardholderName ? 'cardholderName-error' : undefined}
                  className={inputClass(Boolean(errors.cardholderName))}
                  placeholder="A Morgan"
                />
              </Field>
              <Field id="cardNumber" label="Card number" error={errors.cardNumber} required autoComplete="cc-number">
                <input
                  id="cardNumber"
                  name="cardNumber"
                  type="text"
                  inputMode="numeric"
                  autoComplete="cc-number"
                  value={form.cardNumber}
                  onChange={set('cardNumber')}
                  aria-invalid={Boolean(errors.cardNumber)}
                  aria-describedby={errors.cardNumber ? 'cardNumber-error' : undefined}
                  className={`${inputClass(Boolean(errors.cardNumber))} font-mono tracking-wider`}
                  placeholder="4242 4242 4242 4242"
                />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field id="expiryMMYY" label="Expiry (MM/YY)" error={errors.expiryMMYY} required autoComplete="cc-exp">
                  <input
                    id="expiryMMYY"
                    name="expiryMMYY"
                    type="text"
                    inputMode="numeric"
                    autoComplete="cc-exp"
                    value={form.expiryMMYY}
                    onChange={set('expiryMMYY')}
                    aria-invalid={Boolean(errors.expiryMMYY)}
                    aria-describedby={errors.expiryMMYY ? 'expiryMMYY-error' : undefined}
                    className={`${inputClass(Boolean(errors.expiryMMYY))} font-mono`}
                    placeholder="04/28"
                  />
                </Field>
                <Field id="cvc" label="Security code" error={errors.cvc} required autoComplete="cc-csc" hint="3 digits on the back of the card.">
                  <input
                    id="cvc"
                    name="cvc"
                    type="text"
                    inputMode="numeric"
                    autoComplete="cc-csc"
                    value={form.cvc}
                    onChange={set('cvc')}
                    aria-invalid={Boolean(errors.cvc)}
                    aria-describedby={errors.cvc ? 'cvc-error' : undefined}
                    className={`${inputClass(Boolean(errors.cvc))} font-mono`}
                    placeholder="123"
                  />
                </Field>
              </div>
            </div>
          )}
        </fieldset>

        <div className="lg:hidden">
          <Button type="submit" variant="teal" size="lg" fullWidth loading={submitting}>
            {submitting ? 'Placing order…' : `Place order · ${formatPrice(total)}`}
          </Button>
        </div>
      </form>

      {/* Live summary */}
      <aside aria-label="Order summary" className="lg:sticky lg:top-24 lg:self-start">
        <div className="rounded-xl border border-navy-100 bg-white p-5 shadow-soft">
          <h2 className="text-base font-semibold text-navy-900">Order summary</h2>

          <ul className="mt-4 max-h-64 space-y-3 overflow-y-auto scrollbar-thin pr-1">
            {items.map((item) => (
              <li key={item.productId} className="flex items-center gap-3">
                <span className="relative shrink-0 overflow-hidden rounded-lg border border-navy-100">
                  <ProductImage src={item.image} alt="" className="h-12 w-16" />
                  <span className="absolute top-0.5 right-0.5 flex size-4.5 items-center justify-center rounded-full bg-navy-900 text-[10px] font-semibold text-white tabular-nums">
                    {item.quantity}
                  </span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-navy-900">{item.name}</span>
                  <span className="block text-xs text-navy-500 tabular-nums">
                    {formatPrice(item.price)} × {item.quantity}
                  </span>
                </span>
                <span className="text-sm font-medium text-navy-900 tabular-nums">
                  {formatPrice(item.price * item.quantity)}
                </span>
              </li>
            ))}
          </ul>

          <dl className="mt-4 space-y-2.5 border-t border-navy-100 pt-4 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-navy-600">Subtotal</dt>
              <dd className="font-medium text-navy-900 tabular-nums">{formatPrice(subtotal)}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-navy-600">Shipping</dt>
              <dd className="font-medium text-navy-900 tabular-nums">
                {shipping === 0 ? 'Free' : formatPrice(shipping)}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-navy-600">Tax (8%)</dt>
              <dd className="font-medium text-navy-900 tabular-nums">{formatPrice(tax)}</dd>
            </div>
            <div className="flex items-center justify-between border-t border-navy-100 pt-3 text-base">
              <dt className="font-semibold text-navy-900">Total</dt>
              <dd className="font-semibold text-navy-900 tabular-nums">{formatPrice(total)}</dd>
            </div>
          </dl>

          <p className="mt-3 text-xs text-navy-500">
            Shipping is free on orders over £100; otherwise a flat £6.95 applies.
          </p>

          <div className="mt-5 hidden lg:block">
            <Button
              type="submit"
              form="checkout-form"
              variant="teal"
              size="lg"
              fullWidth
              loading={submitting}
            >
              {submitting ? 'Placing order…' : `Place order · ${formatPrice(total)}`}
            </Button>
            <p className="mt-2 text-center text-xs text-navy-400">
              By placing your order you agree to our terms of sale.
            </p>
          </div>
        </div>
      </aside>
    </div>
  );
}
