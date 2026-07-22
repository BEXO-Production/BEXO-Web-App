import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useSearch } from 'wouter';
import { ArrowLeft, Check, Database, Loader2, Pencil, ShieldCheck, Tag } from 'lucide-react';
import { useOnboarding } from '../context/OnboardingContext';
import { Button, Input } from '../design-system/primitives';
import { useToast } from '../hooks/use-toast';
import {
  fetchCheckoutQuote,
  usePricing,
  validateCouponApi,
  type PricingBreakdown,
} from '../hooks/use-pricing';
import { STORAGE_BLOCK_BYTES, normalizeClientPlanId } from '../lib/pricing';
import { track } from '../lib/track';
import { JUST_ACTIVATED_KEY } from './welcome';
import { PENDING_TEMPLATE_KEY } from './step-7';
import { BillingAddressFields } from '../components/BillingAddressFields';

declare global {
  interface Window {
    Razorpay: any;
  }
}

type PaidPlanId = 'identity' | 'essential' | 'growth' | 'studentplus';
const SUBSCRIPTION_PLANS: PaidPlanId[] = ['identity', 'essential', 'growth'];
const PAID_PLANS: PaidPlanId[] = ['identity', 'essential', 'growth', 'studentplus'];

type BillingForm = {
  fullName: string;
  email: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};

const emptyBilling = (): BillingForm => ({
  fullName: '',
  email: '',
  phone: '',
  line1: '',
  line2: '',
  city: '',
  state: '',
  postalCode: '',
  country: 'IN',
});

const formatMb = (bytes: number) => `${Math.round((Number(bytes) || 0) / (1024 * 1024))}MB`;
const fmtINR = (n: number) =>
  n % 1 === 0
    ? n.toLocaleString('en-IN')
    : n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function displayPhone(phone: string) {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) {
    return `${digits.slice(2, 7)} ${digits.slice(7)}`;
  }
  if (digits.length === 10) return `${digits.slice(0, 5)} ${digits.slice(5)}`;
  return phone;
}

function isBillingComplete(b: BillingForm) {
  return (
    b.fullName.trim().length >= 2 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email.trim()) &&
    b.phone.replace(/\D/g, '').length >= 10 &&
    b.line1.trim().length >= 3 &&
    b.city.trim().length >= 2 &&
    b.state.trim().length >= 2 &&
    /^[1-9][0-9]{5}$/.test(b.postalCode.trim())
  );
}

function parseQuery(search: string) {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const kind = params.get('kind') === 'storage' ? 'storage' : 'plan';
  const planRaw = normalizeClientPlanId(params.get('plan') || '') || params.get('plan') || '';
  const plan = PAID_PLANS.includes(planRaw as PaidPlanId) ? (planRaw as PaidPlanId) : null;
  const blocks = Math.max(1, Math.min(20, Math.floor(Number(params.get('blocks')) || 1)));
  return { kind, plan, blocks };
}

export default function CheckoutPage() {
  const search = useSearch();
  const [, setLocation] = useLocation();
  const { data, updateData } = useOnboarding();
  const { toast } = useToast();
  const { planById } = usePricing();

  const { kind, plan: planFromQuery, blocks } = useMemo(() => parseQuery(search), [search]);
  const isStorage = kind === 'storage';
  const plan = planFromQuery || 'essential';

  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);
  const [listPricing, setListPricing] = useState<PricingBreakdown | null>(null);
  const [firstPricing, setFirstPricing] = useState<PricingBreakdown | null>(null);
  const [renewalLabel, setRenewalLabel] = useState<string | null>(null);
  const [couponMessage, setCouponMessage] = useState<string | null>(null);
  const [discountApplies, setDiscountApplies] = useState<'first_invoice' | 'none'>('none');
  const [isApplyingCoupon, setIsApplyingCoupon] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [quoteLoading, setQuoteLoading] = useState(true);
  const [billing, setBilling] = useState<BillingForm>(emptyBilling);
  const [billingEditing, setBillingEditing] = useState(true);
  const [billingLoaded, setBillingLoaded] = useState(false);
  const [billingSaving, setBillingSaving] = useState(false);
  const [authToken] = useState(() =>
    typeof window !== 'undefined' ? localStorage.getItem('token') : null,
  );

  const selectedPlan = isStorage ? planById('storage_addon') : planById(plan);
  const backHref = data.hasCompletedOnboarding ? '/billing' : '/step/9';
  const isSubscriptionPlan = !isStorage && SUBSCRIPTION_PLANS.includes(plan);
  const billingReady = isBillingComplete(billing);

  const setBillingField = (key: keyof BillingForm, value: string) => {
    setBilling((prev) => ({ ...prev, [key]: value }));
  };

  const patchBillingAddress = (patch: Partial<BillingForm>) => {
    setBilling((prev) => ({ ...prev, ...patch }));
  };

  const refreshQuote = async (coupon?: string | null) => {
    setQuoteLoading(true);
    try {
      const quotePlan = isStorage ? 'storage_addon' : plan;
      const result = await fetchCheckoutQuote(quotePlan, coupon || undefined, isStorage ? blocks : 1);
      setListPricing(result.list);
      setFirstPricing(result.first);
      setRenewalLabel(result.renewalLabel);
      setCouponMessage(result.message);
      setDiscountApplies(result.discountApplies);
    } catch {
      toast({ title: 'Error', description: 'Could not load checkout totals.', variant: 'destructive' });
    } finally {
      setQuoteLoading(false);
    }
  };

  useEffect(() => {
    if (!isStorage && !planFromQuery) {
      setLocation(backHref);
      return;
    }
    refreshQuote(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStorage, plan, blocks, planFromQuery]);

  useEffect(() => {
    let cancelled = false;
    const loadBilling = async () => {
      const token = localStorage.getItem('token');
      const fallback: BillingForm = {
        fullName: data.name || '',
        email: data.contactData?.email || data.email || '',
        phone: data.phone || data.contactData?.phone || '',
        line1: '',
        line2: '',
        city: '',
        state: '',
        postalCode: '',
        country: 'IN',
      };
      try {
        if (!token) {
          if (!cancelled) {
            setBilling(fallback);
            setBillingEditing(true);
            setBillingLoaded(true);
          }
          return;
        }
        const res = await fetch('/api/payments/billing-profile', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json().catch(() => ({}));
        const saved = json?.billingProfile;
        if (!cancelled && saved?.fullName) {
          setBilling({
            fullName: saved.fullName || '',
            email: saved.email || fallback.email,
            phone: saved.phone || fallback.phone,
            line1: saved.line1 || '',
            line2: saved.line2 || '',
            city: saved.city || '',
            state: saved.state || '',
            postalCode: saved.postalCode || '',
            country: saved.country || 'IN',
          });
          setBillingEditing(false);
        } else if (!cancelled) {
          setBilling(fallback);
          setBillingEditing(true);
        }
      } catch {
        if (!cancelled) {
          setBilling(fallback);
          setBillingEditing(true);
        }
      } finally {
        if (!cancelled) setBillingLoaded(true);
      }
    };
    loadBilling();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const due = firstPricing;
  const list = listPricing;

  const persistBilling = async (token: string | null) => {
    if (!billingReady) {
      throw new Error('Complete your billing information before paying.');
    }
    setBillingSaving(true);
    try {
      const res = await fetch('/api/payments/billing-profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(billing),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Could not save billing information');
      const saved = json.billingProfile;
      if (saved) {
        setBilling({
          fullName: saved.fullName,
          email: saved.email,
          phone: saved.phone,
          line1: saved.line1,
          line2: saved.line2 || '',
          city: saved.city,
          state: saved.state,
          postalCode: saved.postalCode,
          country: saved.country || 'IN',
        });
      }
      setBillingEditing(false);
      return billing;
    } finally {
      setBillingSaving(false);
    }
  };

  const handleApplyCoupon = async () => {
    if (isStorage) return;
    setIsApplyingCoupon(true);
    try {
      const result = await validateCouponApi(plan, couponCode);
      if (!result.valid || !result.pricing) {
        setAppliedCoupon(null);
        toast({
          title: 'Invalid Coupon',
          description: result.message || 'The coupon code you entered is invalid.',
          variant: 'destructive',
        });
        await refreshQuote(null);
        return;
      }
      const code = result.coupon || couponCode.toUpperCase();
      setAppliedCoupon(code);
      if (result.quote) {
        setListPricing(result.quote.list);
        setFirstPricing(result.quote.first);
        setRenewalLabel(result.quote.renewalLabel);
        setCouponMessage(result.quote.message);
        setDiscountApplies(result.quote.discountApplies);
      } else {
        await refreshQuote(code);
      }
      toast({
        title: 'Coupon applied',
        description: result.quote?.message || 'Discount applies to this charge.',
      });
    } catch {
      toast({ title: 'Error', description: 'Could not validate coupon. Try again.', variant: 'destructive' });
    } finally {
      setIsApplyingCoupon(false);
    }
  };

  const openRazorpayModal = (options: any) => {
    if (!window.Razorpay) {
      toast({ title: 'Error', description: 'Razorpay SDK failed to load. Refresh and try again.', variant: 'destructive' });
      setIsProcessing(false);
      return;
    }
    const rzp = new window.Razorpay(options);
    rzp.on('payment.failed', (response: any) => {
      toast({
        title: 'Payment Failed',
        description: response.error?.description || 'Payment failed',
        variant: 'destructive',
      });
      setIsProcessing(false);
    });
    rzp.open();
  };

  const baseRazorpayOptions = () => ({
    name: 'Bexo',
    modal: {
      ondismiss: () => setIsProcessing(false),
    },
    prefill: {
      name: billing.fullName || data.name,
      email: billing.email || data.contactData?.email || data.email || '',
      contact: billing.phone || data.phone || '',
    },
    theme: { color: '#4f46e5' },
  });

  const finishPremiumActivation = async (activatedPlan: string, extras: Record<string, unknown> = {}) => {
    updateData({
      isPremium: true,
      plan: normalizeClientPlanId(activatedPlan) || activatedPlan,
      hasCompletedOnboarding: true,
      ...extras,
    } as any);

    const pending = sessionStorage.getItem(PENDING_TEMPLATE_KEY);
    if (pending) {
      try {
        const token = localStorage.getItem('token');
        await fetch('/api/profile', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ templateId: pending }),
        });
      } catch (err) {
        console.error('Failed to persist premium template:', err);
      }
    }

    sessionStorage.setItem(JUST_ACTIVATED_KEY, '1');
    setLocation('/welcome');
  };

  const verifySubscription = async (token: string | null, payload: any) => {
    const verifyRes = await fetch('/api/payments/verify-subscription', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ ...payload, couponCode: appliedCoupon }),
    });
    const verifyData = await verifyRes.json();
    if (!verifyRes.ok) throw new Error(verifyData.error || 'Subscription verification failed');
    await finishPremiumActivation(verifyData.plan || plan, {
      storageQuotaBytes: verifyData.storageQuotaBytes,
      storageBonusBytes: verifyData.storageBonusBytes,
      stacked: verifyData.stacked,
      expiresAt: verifyData.expiresAt,
      autopay: verifyData.autopay !== false,
      addonHasAutopay: data.addonHasAutopay,
    });
    track('checkout_success', { plan: verifyData.plan || plan, kind: 'subscription' });
  };

  const confirmAutopayMandate = async (token: string | null, payload: any) => {
    const res = await fetch('/api/payments/confirm-autopay', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Autopay authorization failed');
    return result;
  };

  /** After discounted first invoice: open Razorpay to authorize Autopay — plan activates only after this. */
  const startMandateCheckout = async (
    token: string | null,
    opts: { subscriptionId: string; key?: string; planName?: string },
  ) => {
    toast({
      title: 'Authorize Autopay (required)',
      description: 'Your plan activates only after you authorize auto-renewal. Closing this window refunds the first invoice.',
    });

    openRazorpayModal({
      ...baseRazorpayOptions(),
      key: opts.key,
      subscription_id: opts.subscriptionId,
      description: `${opts.planName || 'Plan'} — authorize Razorpay Autopay to activate`,
      handler: async (response: any) => {
        setIsProcessing(true);
        try {
          toast({ title: 'Activating plan', description: 'Confirming Autopay and unlocking premium…' });
          const confirmed = await confirmAutopayMandate(token, response);
          if (!confirmed.activated && !confirmed.isPremium) {
            throw new Error(confirmed.error || 'Autopay confirmation did not activate the plan');
          }
          await finishPremiumActivation((confirmed.plan as string) || plan, {
            storageQuotaBytes: confirmed.storageQuotaBytes,
            storageBonusBytes: confirmed.storageBonusBytes,
            expiresAt: confirmed.expiresAt,
            autopay: true,
          });
          track('checkout_success', { plan: confirmed.plan || plan, kind: 'subscription_bootstrap_autopay' });
        } catch (err: any) {
          toast({
            title: 'Activation failed',
            description: err.message || 'Complete Autopay authorization to activate your plan.',
            variant: 'destructive',
          });
          setIsProcessing(false);
        }
      },
      modal: {
        ondismiss: async () => {
          setIsProcessing(true);
          try {
            const result = await abandonAutopaySetup(token, opts.subscriptionId);
            toast({
              title: 'Checkout cancelled',
              description:
                result?.message ||
                'Autopay is required. Your first invoice was not kept as an active plan — retry when ready.',
              variant: 'destructive',
            });
          } finally {
            setIsProcessing(false);
          }
        },
      },
    });
  };

  const abandonAutopaySetup = async (token: string | null, subscriptionId: string) => {
    try {
      const res = await fetch('/api/payments/abandon-autopay-setup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ razorpay_subscription_id: subscriptionId }),
      });
      return await res.json().catch(() => ({}));
    } catch {
      return {};
    }
  };

  const verifyOrder = async (token: string | null, payload: any) => {
    const verifyRes = await fetch('/api/payments/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ ...payload, plan, couponCode: appliedCoupon }),
    });
    const verifyData = await verifyRes.json();
    if (!verifyRes.ok) throw new Error(verifyData.error || 'Payment verification failed');

    if (verifyData.needsMandateSetup && verifyData.subscriptionId) {
      await startMandateCheckout(token, {
        subscriptionId: verifyData.subscriptionId,
        key: verifyData.key,
        planName: selectedPlan?.displayName,
      });
      return;
    }

    await finishPremiumActivation(verifyData.plan || plan, {
      storageQuotaBytes: verifyData.storageQuotaBytes,
      storageBonusBytes: verifyData.storageBonusBytes,
      stacked: verifyData.stacked,
      expiresAt: verifyData.expiresAt,
      autopay: !!verifyData.autopay,
    });
    track('checkout_success', {
      plan: verifyData.plan || plan,
      kind: verifyData.bootstrap ? 'subscription_bootstrap' : 'order',
    });
  };

  const startOrderCheckout = async (
    token: string | null,
    opts?: { orderId?: string; amount?: number; currency?: string; key?: string; mock?: boolean; bootstrap?: boolean },
  ) => {
    let orderData = opts?.orderId
      ? {
          orderId: opts.orderId,
          amount: opts.amount,
          currency: opts.currency || 'INR',
          key: opts.key,
          mock: !!opts.mock,
        }
      : null;

    if (!orderData) {
      const orderRes = await fetch('/api/payments/create-order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ plan, couponCode: appliedCoupon, billing }),
      });
      const parsed = await orderRes.json();
      if (!orderRes.ok) throw new Error(parsed.error || 'Failed to start checkout');
      orderData = parsed;
    }

    const order = orderData;
    if (!order?.orderId) throw new Error('Failed to start checkout');

    if (order.mock) {
      await verifyOrder(token, {
        razorpay_payment_id: `mock_payment_${Date.now()}`,
        razorpay_order_id: order.orderId,
        razorpay_signature: 'mock_signature',
      });
      return;
    }

    openRazorpayModal({
      ...baseRazorpayOptions(),
      key: order.key,
      amount: order.amount,
      currency: order.currency || 'INR',
      order_id: order.orderId,
      description: opts?.bootstrap
        ? `${selectedPlan?.displayName || 'Plan'} — first invoice (then auto-renews)`
        : `${selectedPlan?.displayName || 'Plan'} — one-time`,
      handler: async (response: any) => {
        setIsProcessing(true);
        try {
          toast({ title: 'Processing Payment', description: 'Activating your plan…' });
          await verifyOrder(token, response);
        } catch (err: any) {
          toast({ title: 'Verification Failed', description: err.message, variant: 'destructive' });
          setIsProcessing(false);
        }
      },
    });
  };

  const startSubscriptionCheckout = async (token: string | null) => {
    const subRes = await fetch('/api/payments/create-subscription', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ plan, couponCode: appliedCoupon, billing }),
    });
    const subData = await subRes.json().catch(() => ({}));

    // Coupon first-invoice when Razorpay Offers are unavailable: pay discounted
    // order now, Autopay starts at the next billing date.
    if (subRes.ok && subData.mode === 'subscription_bootstrap' && subData.orderId) {
      await startOrderCheckout(token, {
        orderId: subData.orderId,
        amount: subData.amount,
        currency: subData.currency,
        key: subData.key,
        mock: !!subData.mock,
        bootstrap: true,
      });
      return;
    }

    if (!subRes.ok) {
      // Do not fall back to create-order for autopay plans — that path is
      // rejected server-side and caused the double-error toast users saw.
      if (subData.code === 'USE_ORDER') {
        throw new Error(
          subData.message ||
            'This plan requires subscription checkout. Remove the coupon and try again, or contact support.',
        );
      }
      throw new Error(subData.error || 'Failed to start subscription');
    }

    if (subData.mock) {
      await verifySubscription(token, {
        razorpay_payment_id: `mock_payment_${Date.now()}`,
        razorpay_subscription_id: subData.subscriptionId,
        razorpay_signature: 'mock_signature',
      });
      return;
    }

    openRazorpayModal({
      ...baseRazorpayOptions(),
      key: subData.key,
      subscription_id: subData.subscriptionId,
      description: `${selectedPlan?.displayName || 'Plan'} — auto-renews via Razorpay Autopay`,
      handler: async (response: any) => {
        setIsProcessing(true);
        try {
          toast({ title: 'Processing Payment', description: 'Activating your subscription…' });
          await verifySubscription(token, response);
        } catch (err: any) {
          toast({ title: 'Verification Failed', description: err.message, variant: 'destructive' });
          setIsProcessing(false);
        }
      },
    });
  };

  const startStorageCheckout = async (token: string | null) => {
    const res = await fetch('/api/payments/create-addon-subscription', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ blocks, billing }),
    });
    const addonData = await res.json();
    if (!res.ok) throw new Error(addonData.error || 'Failed to start storage checkout');

    const finish = (verifyData: any) => {
      updateData({
        storageQuotaBytes: verifyData.storageQuotaBytes,
        addonBlocks:
          typeof verifyData.blocks === 'number'
            ? verifyData.blocks
            : Number(data.addonBlocks || 0) + blocks,
        addonHasAutopay: true,
      } as any);
      toast({
        title: 'Storage updated',
        description:
          addonData.mode === 'increase'
            ? `+${formatMb(blocks * STORAGE_BLOCK_BYTES)} merged into your storage pool.`
            : `+${formatMb(blocks * STORAGE_BLOCK_BYTES)} is now live on your account.`,
      });
      setIsProcessing(false);
      setLocation('/billing');
    };

    if (addonData.mode === 'increase') {
      const verifyIncrease = async (payload: any) => {
        const verifyRes = await fetch('/api/payments/verify-addon-increase', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            ...payload,
            addonId: addonData.addonId,
            addBlocks: addonData.addBlocks ?? blocks,
            targetBlocks: addonData.targetBlocks,
          }),
        });
        const verifyData = await verifyRes.json();
        if (!verifyRes.ok) throw new Error(verifyData.error || 'Storage increase verification failed');
        finish(verifyData);
      };

      if (addonData.mock) {
        await verifyIncrease({
          razorpay_order_id: addonData.orderId,
          razorpay_payment_id: `mock_payment_${Date.now()}`,
          razorpay_signature: 'mock_signature',
        });
        return;
      }

      openRazorpayModal({
        ...baseRazorpayOptions(),
        key: addonData.key,
        amount: addonData.amount,
        currency: addonData.currency || 'INR',
        order_id: addonData.orderId,
        description: `Add +${formatMb(blocks * STORAGE_BLOCK_BYTES)} storage`,
        handler: async (response: any) => {
          setIsProcessing(true);
          try {
            await verifyIncrease(response);
          } catch (err: any) {
            toast({ title: 'Verification Failed', description: err.message, variant: 'destructive' });
            setIsProcessing(false);
          }
        },
      });
      return;
    }

    const verifyCreate = async (payload: any) => {
      const verifyRes = await fetch('/api/payments/verify-addon-subscription', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const verifyData = await verifyRes.json();
      if (!verifyRes.ok) throw new Error(verifyData.error || 'Add-on verification failed');
      finish(verifyData);
    };

    if (addonData.mock) {
      await verifyCreate({
        razorpay_payment_id: `mock_payment_${Date.now()}`,
        razorpay_subscription_id: addonData.subscriptionId,
        razorpay_signature: 'mock_signature',
      });
      return;
    }

    openRazorpayModal({
      ...baseRazorpayOptions(),
      key: addonData.key,
      subscription_id: addonData.subscriptionId,
      description: `Storage Increase — ${blocks} × 50MB`,
      handler: async (response: any) => {
        setIsProcessing(true);
        try {
          await verifyCreate(response);
        } catch (err: any) {
          toast({ title: 'Verification Failed', description: err.message, variant: 'destructive' });
          setIsProcessing(false);
        }
      },
    });
  };

  const handlePay = async () => {
    if (billingEditing || !billingReady) {
      toast({
        title: 'Billing information required',
        description: 'Save your name, email, address, and phone before paying.',
        variant: 'destructive',
      });
      setBillingEditing(true);
      return;
    }
    setIsProcessing(true);
    try {
      const token = localStorage.getItem('token');
      if (!token) throw new Error('Please sign in again.');
      await persistBilling(token);
      track('checkout_start', {
        plan: isStorage ? 'storage_addon' : plan,
        kind: isStorage ? 'storage' : isSubscriptionPlan ? 'subscription' : 'order',
      });
      if (isStorage) {
        await startStorageCheckout(token);
      } else if (isSubscriptionPlan) {
        await startSubscriptionCheckout(token);
      } else {
        await startOrderCheckout(token);
      }
    } catch (err: any) {
      toast({ title: 'Checkout Error', description: err.message, variant: 'destructive' });
      setIsProcessing(false);
    }
  };

  const title = isStorage
    ? `Storage +${formatMb(blocks * STORAGE_BLOCK_BYTES)}`
    : selectedPlan?.displayName || 'Checkout';
  const periodHint = isStorage
    ? 'Billed monthly via Razorpay Autopay'
    : selectedPlan?.billingPeriod === 'monthly'
      ? 'Auto-renews monthly via Razorpay Autopay'
      : selectedPlan?.billingPeriod === 'yearly'
        ? 'Auto-renews yearly via Razorpay Autopay'
        : 'One-time payment — yours forever';

  return (
    <div className="min-h-screen bg-slate-50 px-3 sm:px-4 py-6 sm:py-8 pb-[max(2.5rem,env(safe-area-inset-bottom))]">
      <div className="flex flex-col max-w-md w-full mx-auto pb-8 sm:pb-10 animate-in fade-in slide-in-from-right-4">
        <button
          type="button"
          onClick={() => setLocation(backHref)}
          className="flex items-center text-slate-500 hover:text-slate-900 mb-5 sm:mb-6 transition-colors w-fit text-sm font-medium min-h-[44px] -ml-1 px-1 touch-manipulation"
        >
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </button>

        <h2 className="font-serif text-2xl sm:text-2xl font-bold text-slate-900 mb-5 sm:mb-6">Checkout</h2>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-6 mb-5 sm:mb-6">
          <div className="flex justify-between items-start gap-3 mb-6 pb-6 border-b border-slate-100">
            <div className="min-w-0">
              <h3 className="font-bold text-slate-900 text-lg flex items-center gap-2">
                {isStorage && <Database className="w-4 h-4 text-indigo-500" />}
                {title}
              </h3>
              <p className="text-slate-500 text-sm mt-0.5">{periodHint}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-xl font-bold text-slate-900">
                ₹{fmtINR(list?.base ?? selectedPlan?.priceInrExGst ?? 0)}
              </p>
              <p className="text-[11px] text-slate-400">ex-GST list</p>
            </div>
          </div>

          {!isStorage && (
            <div className="space-y-4 mb-6 pb-6 border-b border-slate-100">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Tag className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input
                    placeholder="Coupon Code"
                    className="pl-9"
                    value={couponCode}
                    onChange={(e) => setCouponCode(e.target.value)}
                    disabled={!!appliedCoupon || isProcessing}
                  />
                </div>
                {!appliedCoupon ? (
                  <Button
                    onClick={handleApplyCoupon}
                    disabled={!couponCode || isApplyingCoupon}
                    variant="secondary"
                  >
                    {isApplyingCoupon ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Apply'}
                  </Button>
                ) : (
                  <Button
                    onClick={async () => {
                      setAppliedCoupon(null);
                      setCouponCode('');
                      await refreshQuote(null);
                    }}
                    variant="outline"
                    className="text-red-500 hover:text-red-600 hover:bg-red-50 border-red-200"
                  >
                    Remove
                  </Button>
                )}
              </div>
              {appliedCoupon && (
                <p className="text-green-600 text-xs font-medium flex items-center">
                  <Check className="w-3.5 h-3.5 mr-1" /> {appliedCoupon} applied
                  {discountApplies === 'first_invoice' ? ' to this charge only' : ''}
                </p>
              )}
            </div>
          )}

          <div className="space-y-3 mb-6">
            {quoteLoading || !due || !list ? (
              <div className="flex justify-center py-4">
                <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
              </div>
            ) : (
              <>
                <div className="flex justify-between text-slate-600 text-sm">
                  <span>{isStorage ? `${blocks} × 50MB block` : 'Plan (ex-GST)'}</span>
                  <span>₹{fmtINR(list.base)}</span>
                </div>
                {due.discount > 0 && (
                  <div className="flex justify-between text-green-600 text-sm font-medium">
                    <span>Discount{appliedCoupon ? ` (${appliedCoupon})` : ''}</span>
                    <span>-₹{fmtINR(due.discount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-slate-600 text-sm">
                  <span>GST ({Math.round((due.gstRate || 0.18) * 100)}%)</span>
                  <span>₹{due.gst.toFixed(2)}</span>
                </div>
                {discountApplies === 'first_invoice' && list.total > due.total && (
                  <div className="rounded-xl bg-amber-50 border border-amber-100 p-3 text-xs text-amber-950 leading-snug">
                    {couponMessage ||
                      `Coupon applies to your first charge only. Then ${renewalLabel || 'full plan price'}.`}
                  </div>
                )}
                {isSubscriptionPlan && discountApplies !== 'first_invoice' && renewalLabel && (
                  <p className="text-xs text-slate-400">Then {renewalLabel}.</p>
                )}
              </>
            )}
          </div>

          <div className="flex justify-between items-center pt-6 border-t border-slate-200">
            <span className="font-bold text-slate-900 text-lg">Due today</span>
            <span className="font-bold text-indigo-600 text-2xl">
              ₹{due ? fmtINR(due.total) : '—'}
            </span>
          </div>
          {discountApplies === 'first_invoice' && list && (
            <p className="text-right text-xs text-slate-400 mt-1">
              Renews at ₹{fmtINR(list.total)}
              {selectedPlan?.billingPeriod === 'yearly' ? '/yr' : '/mo'}
            </p>
          )}
        </div>

        {(isSubscriptionPlan || isStorage) && (
          <div className="p-3.5 sm:p-4 bg-emerald-50 border border-emerald-200/80 rounded-2xl mb-5 sm:mb-6 flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div className="text-xs text-emerald-950">
              <p className="font-bold mb-0.5">Autopay Mandate</p>
              <p className="text-emerald-800 leading-snug">
                You authorize Razorpay Autopay. We debit the plan amount each cycle
                {discountApplies === 'first_invoice'
                  ? ' — your coupon only reduces today’s charge.'
                  : '.'}
              </p>
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-6 mb-5 sm:mb-6">
          <div className="flex items-start sm:items-center justify-between gap-2 mb-4">
            <h3 className="text-xs font-bold tracking-[0.12em] text-slate-900 uppercase">
              Billing information
            </h3>
            {!billingEditing && billingReady && (
              <button
                type="button"
                onClick={() => setBillingEditing(true)}
                className="inline-flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-700 font-medium min-h-[44px] px-1 -mr-1 touch-manipulation shrink-0"
              >
                <Pencil className="w-3.5 h-3.5" />
                Update
              </button>
            )}
          </div>

          {!billingLoaded ? (
            <div className="flex justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
            </div>
          ) : billingEditing ? (
            <div className="space-y-3.5">
              <div>
                <label className="block text-xs text-slate-500 mb-1.5">Name</label>
                <Input
                  value={billing.fullName}
                  onChange={(e) => setBillingField('fullName', e.target.value)}
                  placeholder="Full name"
                  disabled={isProcessing}
                  autoComplete="name"
                  className="h-12 text-base sm:text-sm touch-manipulation"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1.5">Email</label>
                <Input
                  type="email"
                  value={billing.email}
                  onChange={(e) => setBillingField('email', e.target.value)}
                  placeholder="you@email.com"
                  disabled={isProcessing}
                  autoComplete="email"
                  inputMode="email"
                  className="h-12 text-base sm:text-sm touch-manipulation"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1.5">Phone number</label>
                <Input
                  value={billing.phone}
                  onChange={(e) => setBillingField('phone', e.target.value)}
                  placeholder="10-digit mobile"
                  disabled={isProcessing}
                  autoComplete="tel"
                  inputMode="tel"
                  className="h-12 text-base sm:text-sm touch-manipulation"
                />
              </div>

              <BillingAddressFields
                value={{
                  line1: billing.line1,
                  line2: billing.line2,
                  city: billing.city,
                  state: billing.state,
                  postalCode: billing.postalCode,
                  country: billing.country,
                }}
                onChange={patchBillingAddress}
                disabled={isProcessing}
                authToken={authToken}
              />

              <Button
                type="button"
                className="w-full mt-1 min-h-[48px] touch-manipulation"
                disabled={!billingReady || billingSaving || isProcessing}
                onClick={async () => {
                  try {
                    const token = localStorage.getItem('token');
                    if (!token) throw new Error('Please sign in again.');
                    await persistBilling(token);
                    toast({ title: 'Saved', description: 'Billing information updated.' });
                  } catch (err: any) {
                    toast({
                      title: 'Could not save',
                      description: err.message || 'Try again.',
                      variant: 'destructive',
                    });
                  }
                }}
              >
                {billingSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save billing information'}
              </Button>
            </div>
          ) : (
            <dl className="space-y-3 text-sm">
              <div className="grid grid-cols-1 gap-0.5 sm:grid-cols-[7.5rem_1fr] sm:gap-2">
                <dt className="text-slate-400 text-xs sm:text-sm">Name</dt>
                <dd className="text-slate-900 font-medium">{billing.fullName}</dd>
              </div>
              <div className="grid grid-cols-1 gap-0.5 sm:grid-cols-[7.5rem_1fr] sm:gap-2">
                <dt className="text-slate-400 text-xs sm:text-sm">Email</dt>
                <dd className="text-slate-900 break-all">{billing.email}</dd>
              </div>
              <div className="grid grid-cols-1 gap-0.5 sm:grid-cols-[7.5rem_1fr] sm:gap-2">
                <dt className="text-slate-400 text-xs sm:text-sm">Billing address</dt>
                <dd className="text-slate-900 leading-snug">
                  <div>{billing.line1}</div>
                  {billing.line2 ? <div>{billing.line2}</div> : null}
                  <div>
                    {billing.city} {billing.postalCode}
                  </div>
                  <div>{billing.state}</div>
                  <div>{billing.country || 'IN'}</div>
                </dd>
              </div>
              <div className="grid grid-cols-1 gap-0.5 sm:grid-cols-[7.5rem_1fr] sm:gap-2">
                <dt className="text-slate-400 text-xs sm:text-sm">Phone number</dt>
                <dd className="text-slate-900">{displayPhone(billing.phone)}</dd>
              </div>
            </dl>
          )}
        </div>

        <button
          type="button"
          disabled={isProcessing || quoteLoading || !due || !billingReady || billingEditing}
          onClick={handlePay}
          className="w-full h-14 min-h-[56px] bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-2xl font-semibold text-base transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20 disabled:opacity-70 disabled:cursor-not-allowed touch-manipulation"
        >
          {isProcessing ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <>Pay ₹{due ? fmtINR(due.total) : '—'}</>
          )}
        </button>
        <p className="text-center text-[11px] text-slate-400 mt-3 px-2 flex items-center justify-center gap-1 leading-snug">
          <ShieldCheck className="w-3.5 h-3.5 shrink-0" /> Secure checkout · invoices &amp; monthly billing
        </p>
      </div>
    </div>
  );
}
