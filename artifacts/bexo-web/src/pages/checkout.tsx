import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useSearch } from 'wouter';
import { ArrowLeft, Check, Database, Loader2, ShieldCheck, Tag } from 'lucide-react';
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

declare global {
  interface Window {
    Razorpay: any;
  }
}

type PaidPlanId = 'identity' | 'essential' | 'growth' | 'studentplus';
const SUBSCRIPTION_PLANS: PaidPlanId[] = ['identity', 'essential', 'growth'];
const PAID_PLANS: PaidPlanId[] = ['identity', 'essential', 'growth', 'studentplus'];

const formatMb = (bytes: number) => `${Math.round((Number(bytes) || 0) / (1024 * 1024))}MB`;
const fmtINR = (n: number) =>
  n % 1 === 0
    ? n.toLocaleString('en-IN')
    : n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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

  const selectedPlan = isStorage ? planById('storage_addon') : planById(plan);
  const backHref = data.hasCompletedOnboarding ? '/billing' : '/step/9';
  const isSubscriptionPlan = !isStorage && SUBSCRIPTION_PLANS.includes(plan);

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

  const due = firstPricing;
  const list = listPricing;

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
      name: data.name,
      email: data.contactData?.email || '',
      contact: data.phone || '',
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
      addonHasAutopay: data.addonHasAutopay,
    });
    track('checkout_success', { plan: verifyData.plan || plan, kind: 'subscription' });
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
    await finishPremiumActivation(verifyData.plan || plan, {
      storageQuotaBytes: verifyData.storageQuotaBytes,
      storageBonusBytes: verifyData.storageBonusBytes,
      stacked: verifyData.stacked,
      expiresAt: verifyData.expiresAt,
    });
    track('checkout_success', { plan: verifyData.plan || plan, kind: 'order' });
  };

  const startOrderCheckout = async (token: string | null) => {
    const orderRes = await fetch('/api/payments/create-order', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ plan, couponCode: appliedCoupon }),
    });
    const orderData = await orderRes.json();
    if (!orderRes.ok) throw new Error(orderData.error || 'Failed to start checkout');

    if (orderData.mock) {
      await verifyOrder(token, {
        razorpay_payment_id: `mock_payment_${Date.now()}`,
        razorpay_order_id: orderData.orderId,
        razorpay_signature: 'mock_signature',
      });
      return;
    }

    openRazorpayModal({
      ...baseRazorpayOptions(),
      key: orderData.key,
      amount: orderData.amount,
      currency: orderData.currency || 'INR',
      order_id: orderData.orderId,
      description: `${selectedPlan?.displayName || 'Plan'} — one-time`,
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
      body: JSON.stringify({ plan, couponCode: appliedCoupon }),
    });
    const subData = await subRes.json();
    if (!subRes.ok) {
      if (subData.code === 'USE_ORDER' || subRes.status === 503) {
        await startOrderCheckout(token);
        return;
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
      body: JSON.stringify({ blocks }),
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
    setIsProcessing(true);
    try {
      const token = localStorage.getItem('token');
      if (!token) throw new Error('Please sign in again.');
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
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="flex flex-col max-w-md w-full mx-auto pb-10 animate-in fade-in slide-in-from-right-4">
        <button
          type="button"
          onClick={() => setLocation(backHref)}
          className="flex items-center text-slate-500 hover:text-slate-900 mb-6 transition-colors w-fit text-sm font-medium"
        >
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </button>

        <h2 className="font-serif text-2xl font-bold text-slate-900 mb-6">Checkout</h2>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-6">
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
          <div className="p-4 bg-emerald-50 border border-emerald-200/80 rounded-2xl mb-6 flex items-start gap-3">
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

        <button
          type="button"
          disabled={isProcessing || quoteLoading || !due}
          onClick={handlePay}
          className="w-full h-14 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-semibold text-base transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20 disabled:opacity-70 disabled:cursor-not-allowed"
        >
          {isProcessing ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <>Pay ₹{due ? fmtINR(due.total) : '—'}</>
          )}
        </button>
        <p className="text-center text-[11px] text-slate-400 mt-3 flex items-center justify-center gap-1">
          <ShieldCheck className="w-3.5 h-3.5" /> Secure encrypted checkout
        </p>
      </div>
    </div>
  );
}
