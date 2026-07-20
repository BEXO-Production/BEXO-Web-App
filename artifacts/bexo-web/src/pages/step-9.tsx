import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'wouter';
import { useOnboarding } from '../context/OnboardingContext';
import { Button, Input, Card } from '../design-system/primitives';
import { Check, ShieldCheck, Loader2, ArrowRight, Tag, ArrowLeft, X, Eye, Globe } from 'lucide-react';
import { cn } from '../design-system/primitives';
import { useToast } from '../hooks/use-toast';
import { buildMinimalPortfolioHTML } from '../lib/buildMinimalHTML';
import { PENDING_TEMPLATE_KEY } from './step-7';
import { JUST_ACTIVATED_KEY } from './welcome';
import { PORTFOLIO_TEMPLATES, FREE_FALLBACK_TEMPLATE_ID } from '../lib/templates';
import {
  ANNUAL_STORAGE_BYTES,
  LIFETIME_STORAGE_BYTES,
} from '../lib/pricing';
import { usePricing, validateCouponApi } from '../hooks/use-pricing';

declare global {
  interface Window {
    Razorpay: any;
  }
}

const THEMES = [
  { id: 'blue',    label: 'Navy',    bg: 'bg-blue-600',    ring: 'ring-blue-600',    hex: '#2563eb' },
  { id: 'emerald', label: 'Emerald', bg: 'bg-emerald-600', ring: 'ring-emerald-600', hex: '#059669' },
  { id: 'rose',    label: 'Rose',    bg: 'bg-rose-600',    ring: 'ring-rose-600',    hex: '#e11d48' },
  { id: 'violet',  label: 'Violet',  bg: 'bg-violet-600',  ring: 'ring-violet-600',  hex: '#7c3aed' },
];

const formatMb = (bytes: number) => `${Math.round((Number(bytes) || 0) / (1024 * 1024))}MB`;

export default function Step9Plan() {
  const { data, updateData } = useOnboarding();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { prices, gstRate } = usePricing();

  const canBuyLifetime = data.canBuy?.lifetime !== false && !data.isPremium;
  const canBuyAnnual = data.canBuy?.annual !== false;
  const renewalMode =
    data.renewalMode ||
    (data.isPremium && data.plan === 'lifetime'
      ? 'addon'
      : data.isPremium && data.plan === 'annual'
        ? 'renew'
        : 'purchase');
  const yearlyOnly = data.isPremium || !canBuyLifetime;

  const [tab, setTab] = useState<'pay' | 'code'>('pay');
  const [plan, setPlan] = useState<'annual' | 'lifetime'>('annual');
  const [isProcessing, setIsProcessing] = useState(false);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState('');
  const [isSwooshing, setIsSwooshing] = useState(false);

  // Checkout specific states
  const [showCheckout, setShowCheckout] = useState(false);
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);
  const [couponPricing, setCouponPricing] = useState<{
    base: number;
    discount: number;
    subtotal: number;
    gst: number;
    total: number;
  } | null>(null);
  const [isApplyingCoupon, setIsApplyingCoupon] = useState(false);
  const [showUpgradeOptions, setShowUpgradeOptions] = useState(false);

  // Free flow states
  const [freeFlowStep, setFreeFlowStep] = useState<'none' | 'warning' | 'handle'>('none');
  const [freeHandle, setFreeHandle] = useState(data.handle || '');
  const [freeTheme, setFreeTheme] = useState(data.themeColor || 'blue');
  const [freeThemeBg, setFreeThemeBg] = useState(data.themeBg || 'grid');
  const [isCheckingHandle, setIsCheckingHandle] = useState(false);
  const [handleAvailable, setHandleAvailable] = useState<boolean | null>(null);
  const [handleError, setHandleError] = useState('');
  const [showFreePreview, setShowFreePreview] = useState(false);

  useEffect(() => {
    if (yearlyOnly && plan === 'lifetime') setPlan('annual');
  }, [yearlyOnly, plan]);

  useEffect(() => {
    setAppliedCoupon(null);
    setCouponPricing(null);
  }, [plan]);

  const portfolioHTML = useMemo(
    () => buildMinimalPortfolioHTML(data, freeTheme, freeHandle || 'yourhandle', freeThemeBg),
    [data, freeTheme, freeHandle, freeThemeBg]
  );

  const basePrice = plan === 'annual' ? prices.annual : prices.lifetime;

  const discount = couponPricing?.discount ?? 0;
  const subtotal = couponPricing?.subtotal ?? basePrice;
  const gst = couponPricing?.gst ?? subtotal * gstRate;
  const total = couponPricing?.total ?? Math.round(subtotal + gst);
  const isBillingManagement = data.hasCompletedOnboarding;

  const handleStr = data.handle || (data.name ? data.name.toLowerCase().replace(/[^a-z0-9]/g, '') : '');
  const portfolioUrl = handleStr ? `${handleStr}.mybexo.cyou` : null;

  const expiryLabel = data.expiresAt
    ? new Date(data.expiresAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
    : null;

  const planWarning =
    renewalMode === 'renew' && data.plan === 'annual'
      ? expiryLabel
        ? `You're on Annual until ${expiryLabel}. Renewing extends that date by 1 year — storage stays the same.`
        : `You're on an active Annual plan. Renewing extends your access by 1 year.`
      : renewalMode === 'addon' && data.plan === 'lifetime'
        ? `Lifetime stays forever. Buying Yearly adds +100MB on top of your current ${formatMb(data.storageQuotaBytes || 0)} quota.`
        : null;

  const finishPremiumActivation = async (
    activatedPlan: 'annual' | 'lifetime',
    extras?: {
      storageQuotaBytes?: number;
      storageBonusBytes?: number;
      stacked?: boolean;
      expiresAt?: string | Date | null;
    },
  ) => {
    const pending = localStorage.getItem(PENDING_TEMPLATE_KEY);
    localStorage.removeItem(PENDING_TEMPLATE_KEY);
    const token = localStorage.getItem('token');

    const quota =
      extras?.storageQuotaBytes ??
      (activatedPlan === 'annual' ? ANNUAL_STORAGE_BYTES : LIFETIME_STORAGE_BYTES);

    const patchBody: Record<string, unknown> = {
      plan: activatedPlan,
      isPremium: true,
      hasCompletedOnboarding: true,
      storageQuotaBytes: quota,
      storageBonusBytes: extras?.storageBonusBytes ?? data.storageBonusBytes ?? 0,
      canBuy: { annual: true, lifetime: false },
      renewalMode: activatedPlan === 'lifetime' ? 'addon' : 'renew',
      expiresAt: extras?.expiresAt ?? data.expiresAt,
    };
    if (pending) patchBody.templateId = pending;

    updateData(patchBody);

    if (token && pending) {
      try {
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

    if (extras?.stacked) {
      toast({
        title: 'Storage stacked',
        description: `Your total quota is now ${formatMb(quota)} (+100MB Yearly add-on).`,
      });
    }

    sessionStorage.setItem(JUST_ACTIVATED_KEY, '1');
    setLocation('/welcome');
  };

  const verifyPayment = async (token: string | null, payload: any) => {
    const verifyRes = await fetch("/api/payments/verify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({
        ...payload,
        plan,
        couponCode: appliedCoupon,
      })
    });

    const verifyData = await verifyRes.json();
    if (!verifyRes.ok) {
      throw new Error(verifyData.error || "Payment verification failed");
    }

    await finishPremiumActivation(
      (verifyData.plan === 'lifetime' ? 'lifetime' : 'annual') as 'annual' | 'lifetime',
      {
        storageQuotaBytes: verifyData.storageQuotaBytes,
        storageBonusBytes: verifyData.storageBonusBytes,
        stacked: verifyData.stacked,
        expiresAt: verifyData.expiresAt,
      },
    );
  };

  const validateCode = () => {
    const pattern = /^BEXO-[A-Z0-9-]+$/i;
    if (!pattern.test(code)) {
      setCodeError('Invalid code format. Code should start with BEXO-');
      return false;
    }
    setCodeError('');
    return true;
  };

  const handleApplyCoupon = async () => {
    setIsApplyingCoupon(true);
    try {
      const result = await validateCouponApi(plan, couponCode);
      if (!result.valid || !result.pricing) {
        setAppliedCoupon(null);
        setCouponPricing(null);
        toast({
          title: 'Invalid Coupon',
          description: result.message || 'The coupon code you entered is invalid.',
          variant: 'destructive',
        });
        return;
      }
      setAppliedCoupon(result.coupon || couponCode.toUpperCase());
      setCouponPricing(result.pricing);
      toast({ title: 'Coupon Applied', description: 'Discount has been applied to your total.' });
    } catch {
      toast({ title: 'Error', description: 'Could not validate coupon. Try again.', variant: 'destructive' });
    } finally {
      setIsApplyingCoupon(false);
    }
  };

  const handleRazorpayCheckout = async () => {
    setIsProcessing(true);
    try {
      const token = localStorage.getItem('token');
      const orderRes = await fetch("/api/payments/create-order", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ plan, couponCode: appliedCoupon })
      });
      
      const orderData = await orderRes.json();
      
      if (!orderRes.ok) {
        throw new Error(orderData.error || "Failed to create order");
      }

      if (orderData.mock) {
        await verifyPayment(token, {
          razorpay_payment_id: `mock_payment_${Date.now()}`,
          razorpay_order_id: orderData.orderId,
          razorpay_signature: 'mock_signature'
        });
        return;
      }

      const options = {
        key: orderData.key || 'rzp_test_YourKeyIdHere',
        amount: orderData.amount,
        currency: orderData.currency,
        name: "Bexo",
        description: plan === 'annual' ? "Annual Support Plan" : "Lifetime Access",
        order_id: orderData.orderId,
        handler: async function (response: any) {
          setIsProcessing(true);
          try {
            toast({ title: 'Processing Payment', description: 'Please wait while we verify your payment...' });
            await verifyPayment(token, response);
          } catch (err: any) {
            console.error("Verification error:", err);
            toast({ title: 'Verification Failed', description: err.message, variant: 'destructive' });
            setIsProcessing(false);
          }
        },
        modal: {
          ondismiss: function () {
            setIsProcessing(false);
          },
        },
        prefill: {
          name: data.name,
          email: data.contactData?.email || "",
          contact: data.phone || ""
        },
        theme: { color: "#4f46e5" }
      };

      if (window.Razorpay) {
        const rzp = new window.Razorpay(options);
        rzp.on('payment.failed', function (response: any){
           toast({ title: 'Payment Failed', description: response.error?.description || 'Payment failed', variant: 'destructive' });
           setIsProcessing(false);
        });
        rzp.open();
        // Keep processing=true while the checkout modal is open (cleared on dismiss / fail / success)
      } else {
        toast({ title: 'Error', description: 'Razorpay SDK failed to load. Refresh and try again.', variant: 'destructive' });
        setIsProcessing(false);
      }

    } catch (err: any) {
      console.error("Checkout error:", err);
      toast({ title: 'Checkout Error', description: err.message, variant: 'destructive' });
      setIsProcessing(false);
    }
  };

  const handleActivationCode = async () => {
    if (!validateCode()) return;
    
    setIsProcessing(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch("/api/payments/activation", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ code })
      });

      const result = await res.json();
      
      if (res.ok) {
        const activatedPlan = (result.plan === 'lifetime' ? 'lifetime' : 'annual') as 'annual' | 'lifetime';
        await finishPremiumActivation(activatedPlan, {
          storageQuotaBytes: result.storageQuotaBytes,
          storageBonusBytes: result.storageBonusBytes,
          stacked: result.stacked,
          expiresAt: result.expiresAt,
        });
      } else {
        throw new Error(result.error || "Failed to activate code");
      }
    } catch (err: any) {
      toast({ title: 'Activation Failed', description: err.message, variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  };

  const checkHandle = async (handleVal: string) => {
    const cleanHandle = handleVal.trim().toLowerCase();
    if (!cleanHandle) {
      setHandleAvailable(null);
      setHandleError('Handle cannot be empty');
      return;
    }

    if (!/^[a-z0-9-_]{3,20}$/.test(cleanHandle)) {
      setHandleAvailable(false);
      setHandleError('3-20 characters, lowercase letters, numbers, hyphens & underscores only');
      return;
    }

    setIsCheckingHandle(true);
    setHandleError('');
    setHandleAvailable(null);

    try {
      const token = localStorage.getItem('token');
      const headers: HeadersInit = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`/api/profile/check-handle?handle=${cleanHandle}`, { headers });
      if (!res.ok) {
        setHandleAvailable(false);
        setHandleError('Verification failed');
        return;
      }
      const result = await res.json();
      if (result.available) {
        setHandleAvailable(true);
        setHandleError('');
      } else {
        setHandleAvailable(false);
        setHandleError('Handle is already taken');
      }
    } catch (err) {
      setHandleAvailable(false);
      setHandleError('Connection failed');
    } finally {
      setIsCheckingHandle(false);
    }
  };

  React.useEffect(() => {
    if (freeFlowStep !== 'handle') return;
    if (!freeHandle) {
      setHandleAvailable(null);
      setHandleError('');
      return;
    }
    const timer = setTimeout(() => {
      checkHandle(freeHandle);
    }, 500);
    return () => clearTimeout(timer);
  }, [freeHandle, freeFlowStep]);

  const handleFreePlanActivation = async () => {
    if (!freeHandle) {
      toast({ title: 'Handle Required', description: 'Please choose a handle before proceeding.', variant: 'destructive' });
      return;
    }
    if (handleAvailable !== true) {
      toast({ title: 'Handle Unavailable', description: 'Please choose an available handle.', variant: 'destructive' });
      return;
    }

    setIsProcessing(true);
    try {
      const token = localStorage.getItem('token');
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const patchRes = await fetch("/api/profile", {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          handle: freeHandle.trim().toLowerCase(),
          templateId: FREE_FALLBACK_TEMPLATE_ID,
          themeColor: freeTheme,
          themeBg: freeThemeBg
        })
      });

      if (!patchRes.ok) {
        const errData = await patchRes.json();
        throw new Error(errData.error || "Failed to update profile handle");
      }

      const activateRes = await fetch("/api/payments/free-activate", {
        method: "POST",
        headers
      });

      if (!activateRes.ok) {
        const errData = await activateRes.json();
        throw new Error(errData.error || "Failed to activate Free plan");
      }

      localStorage.removeItem(PENDING_TEMPLATE_KEY);
      updateData({
        handle: freeHandle.trim().toLowerCase(),
        templateId: FREE_FALLBACK_TEMPLATE_ID,
        themeColor: freeTheme,
        themeBg: freeThemeBg,
        plan: 'free',
        isPremium: false,
        storageQuotaBytes: 10 * 1024 * 1024,
        hasCompletedOnboarding: true
      });

      sessionStorage.setItem(JUST_ACTIVATED_KEY, '1');
      setLocation('/welcome');
    } catch (err: any) {
      console.error(err);
      toast({ title: 'Setup Failed', description: err.message || "Failed to complete free plan setup", variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  };

  // ──────────────────────────────────────────────────────────────────────
  // CHECKOUT VIEW
  // ──────────────────────────────────────────────────────────────────────
  if (showCheckout) {
    return (
      <div className="flex flex-col h-full max-w-md w-full mx-auto justify-center pb-10 animate-in fade-in slide-in-from-right-4">
        <button 
          onClick={() => setShowCheckout(false)}
          className="flex items-center text-slate-500 hover:text-slate-900 mb-6 transition-colors w-fit text-sm font-medium"
        >
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to Plans
        </button>

        <h2 className="font-serif text-2xl font-bold text-slate-900 mb-6">Checkout</h2>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-6">
          <div className="flex justify-between items-center mb-6 pb-6 border-b border-slate-100">
            <div>
              <h3 className="font-bold text-slate-900 text-lg">{plan === 'annual' ? 'Annual Support Plan' : 'Lifetime Access'}</h3>
              <p className="text-slate-500 text-sm">Bexo Premium Plan</p>
            </div>
            <div className="text-xl font-bold text-slate-900">₹{basePrice}</div>
          </div>

          <div className="space-y-4 mb-6 pb-6 border-b border-slate-100">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Tag className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input 
                  placeholder="Coupon Code" 
                  className="pl-9"
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value)}
                  disabled={!!appliedCoupon}
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
                  onClick={() => { setAppliedCoupon(null); setCouponCode(''); }}
                  variant="outline"
                  className="text-red-500 hover:text-red-600 hover:bg-red-50 border-red-200"
                >
                  Remove
                </Button>
              )}
            </div>
            {appliedCoupon && (
              <p className="text-green-600 text-xs font-medium flex items-center">
                <Check className="w-3.5 h-3.5 mr-1" /> Coupon {appliedCoupon} applied successfully!
              </p>
            )}
          </div>

          <div className="space-y-3 mb-6">
            <div className="flex justify-between text-slate-600 text-sm">
              <span>Subtotal</span>
              <span>₹{basePrice}</span>
            </div>
            {discount > 0 && (
              <div className="flex justify-between text-green-600 text-sm font-medium">
                <span>Discount ({appliedCoupon})</span>
                <span>-₹{discount}</span>
              </div>
            )}
            <div className="flex justify-between text-slate-600 text-sm">
              <span>GST (18%)</span>
              <span>₹{gst.toFixed(2)}</span>
            </div>
          </div>

          <div className="flex justify-between items-center pt-6 border-t border-slate-200">
            <span className="font-bold text-slate-900 text-lg">Total</span>
            <span className="font-bold text-indigo-600 text-2xl">₹{total}</span>
          </div>
        </div>

        <button
          type="button"
          className="w-full h-14 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-semibold text-base transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20 disabled:opacity-70 disabled:cursor-not-allowed"
          onClick={handleRazorpayCheckout}
          disabled={isProcessing}
        >
          {isProcessing ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <>Pay ₹{total} Securely</>
          )}
        </button>
        <p className="text-center text-xs text-slate-400 mt-4 flex items-center justify-center gap-1">
          <ShieldCheck className="w-3.5 h-3.5" /> Payments are processed securely by Razorpay
        </p>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────────────
  // FREE PLAN WARNING VIEW
  // ──────────────────────────────────────────────────────────────────────
  if (freeFlowStep === 'warning') {
    return (
      <div className="flex flex-col h-full max-w-md w-full mx-auto justify-center pb-10 animate-in fade-in slide-in-from-right-4">
        <button 
          onClick={() => setFreeFlowStep('none')}
          className="flex items-center text-slate-500 hover:text-slate-900 mb-6 transition-colors w-fit text-sm font-medium"
        >
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to Plans
        </button>

        <h2 className="font-serif text-2xl font-bold text-slate-900 mb-2">Are you sure?</h2>
        <p className="text-slate-500 text-sm mb-6">Here is what you will lose by continuing on the Free tier:</p>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-6 space-y-4">
          {[
            {
              pct: '90%',
              title: 'Less Storage Space',
              desc: 'Your storage limit drops to 10MB (Pro offers 50MB Lifetime / 100MB Yearly).',
            },
            {
              icon: <X className="w-4 h-4 text-red-600" />,
              title: 'No AI Resume Parsing',
              desc: 'Monthly AI resume data extraction is locked (Pro includes up to 3 parses/month).',
            },
            {
              icon: <X className="w-4 h-4 text-red-600" />,
              title: 'Locked Premium Templates',
              desc: `Free publishes a basic path URL. Pro unlocks ${PORTFOLIO_TEMPLATES.map((t) => t.name).join(', ')} on yourname.mybexo.cyou.`,
            },
            {
              icon: <X className="w-4 h-4 text-red-600" />,
              title: 'No Custom Subdomains',
              desc: 'Portfolio at mybexo.cyou/handle only — no yourname.mybexo.cyou custom domain.',
            },
          ].map((item, idx) => (
            <div key={idx} className={cn("flex items-start gap-3", idx < 3 && "pb-3 border-b border-slate-100")}>
              <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center shrink-0">
                {'pct' in item ? (
                  <span className="text-red-600 font-bold text-xs">{item.pct}</span>
                ) : (
                  item.icon
                )}
              </div>
              <div>
                <p className="text-xs font-bold text-slate-900">{item.title}</p>
                <p className="text-[11px] text-slate-500 mt-0.5">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-4">
          {/* VISIBLE Upgrade to Pro button */}
          <button
            type="button"
            className="w-full h-14 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-bold text-sm transition-all duration-200 shadow-lg shadow-indigo-600/25 flex items-center justify-center gap-2 cursor-pointer border-none"
            onClick={() => setFreeFlowStep('none')}
          >
            🚀 Upgrade to Pro Now
          </button>
          
          {/* Plain clickable text — NOT a button */}
          <p className="text-center text-xs text-slate-400 select-none">
            or{' '}
            <span
              onClick={() => setFreeFlowStep('handle')}
              className="text-slate-600 hover:text-slate-900 underline cursor-pointer transition-colors"
            >
              I still want to continue with free
            </span>
          </p>
        </div>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────────────
  // FREE PLAN HANDLE + COLOR PICKER VIEW
  // ──────────────────────────────────────────────────────────────────────
  if (freeFlowStep === 'handle') {
    const selectedThemeObj = THEMES.find(t => t.id === freeTheme) || THEMES[0];
    const previewUrl = `${freeHandle || 'yourhandle'}.mybexo.cyou`;

    return (
      <div className="flex flex-col h-full max-w-md w-full mx-auto justify-center pb-10 animate-in fade-in slide-in-from-right-4">
        <button 
          onClick={() => setFreeFlowStep('warning')}
          className="flex items-center text-slate-500 hover:text-slate-900 mb-6 transition-colors w-fit text-sm font-medium"
        >
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </button>

        <h2 className="font-serif text-2xl font-bold text-slate-900 mb-2">Claim Your Handle</h2>
        <p className="text-slate-500 text-sm mb-6">Choose your portfolio URL and accent colour.</p>

        <div className="space-y-6 mb-8">
          {/* Handle input */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Your Portfolio URL</label>
            <div className="relative flex">
              <Input 
                placeholder="yourhandle" 
                className={cn(
                  "rounded-r-none rounded-l-2xl h-12 font-semibold text-slate-800 border-r-0",
                  handleAvailable === true ? "border-green-400 focus-visible:ring-green-400 z-10" : "",
                  handleAvailable === false ? "border-red-400 focus-visible:ring-red-400 z-10" : ""
                )}
                value={freeHandle}
                onChange={(e) => {
                  setFreeHandle(e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, ''));
                  setHandleAvailable(null);
                  setHandleError('');
                }}
              />
              <span className="inline-flex items-center px-4 rounded-r-2xl border border-l-0 border-slate-200 bg-slate-50 text-slate-500 text-sm font-semibold select-none">
                .mybexo.cyou
              </span>
            </div>
            
            {isCheckingHandle && (
              <p className="text-slate-400 text-xs flex items-center gap-1.5 px-1 font-medium">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Verifying availability...
              </p>
            )}
            {handleAvailable === true && (
              <p className="text-green-600 text-xs flex items-center gap-1 px-1 font-semibold">
                <Check className="w-4 h-4" /> This handle is available!
              </p>
            )}
            {handleError && (
              <p className="text-red-500 text-xs px-1 font-semibold">{handleError}</p>
            )}
          </div>

          {/* Accent Colour Picker */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Accent Colour</label>
            <div className="flex gap-3">
              {THEMES.map(theme => (
                <button
                  key={theme.id}
                  type="button"
                  onClick={() => setFreeTheme(theme.id)}
                  className={cn(
                    "w-9 h-9 rounded-full transition-all duration-150 border-2",
                    theme.bg,
                    freeTheme === theme.id
                      ? "ring-2 ring-offset-2 " + theme.ring + " border-white scale-110 shadow-md"
                      : "border-transparent hover:scale-105"
                  )}
                  aria-label={`Select ${theme.label} theme`}
                  title={theme.label}
                />
              ))}
            </div>
            <p className="text-[11px] text-slate-400 px-0.5">
              Selected: <span className="font-semibold text-slate-600">{selectedThemeObj.label}</span> — this colour will be applied to your live portfolio.
            </p>
          </div>

          {/* Background Style Picker */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Background Style</label>
            <div className="grid grid-cols-2 gap-2.5">
              {[
                { id: 'grid', label: 'Clean Grid', desc: 'Subtle blueprint' },
                { id: 'dots', label: 'Minimalist Dots', desc: 'Clean dot matrix' },
                { id: 'waves', label: 'Abstract Waves', desc: 'Soft vector waves' },
                { id: 'solid', label: 'Accent Gradient', desc: 'Slate-accent blend' },
              ].map(bg => {
                const isSelected = freeThemeBg === bg.id;
                return (
                  <button
                    key={bg.id}
                    type="button"
                    onClick={() => setFreeThemeBg(bg.id)}
                    className={cn(
                      "relative p-3 rounded-xl border text-left transition-all hover:scale-[1.01] flex flex-col justify-center min-h-[58px]",
                      isSelected 
                        ? "border-slate-950 bg-slate-950/5 ring-1 ring-slate-950" 
                        : "border-slate-200 bg-white hover:border-slate-300"
                    )}
                  >
                    <p className="text-xs font-bold text-slate-950">{bg.label}</p>
                    <p className="text-[9px] text-slate-500 leading-tight mt-0.5">{bg.desc}</p>
                    {isSelected && (
                      <span className="absolute top-2 right-2 w-3.5 h-3.5 rounded-full bg-slate-950 text-white flex items-center justify-center">
                        <Check className="w-2 h-2" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* REAL Portfolio Preview — scaled iframe using srcdoc */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Your Portfolio Preview</span>
              <button
                type="button"
                onClick={() => setShowFreePreview(true)}
                className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors"
              >
                <Eye className="w-3.5 h-3.5" /> See Full Preview
              </button>
            </div>

            {/* Mini browser mockup with real user data rendered via srcdoc iframe */}
            <div className="rounded-2xl border border-slate-200/80 bg-slate-50 p-3 shadow-sm">
              <div className="w-full rounded-xl border border-slate-200 shadow-inner relative flex flex-col overflow-hidden" style={{ height: 220 }}>
                {/* browser chrome */}
                <div className="h-6 bg-slate-100 border-b border-slate-200 flex items-center px-2 gap-1 shrink-0">
                  <span className="w-2 h-2 rounded-full bg-red-400" />
                  <span className="w-2 h-2 rounded-full bg-yellow-400" />
                  <span className="w-2 h-2 rounded-full bg-green-400" />
                  <div className="ml-2 flex-1 bg-white rounded px-2 py-0.5 border border-slate-200 flex items-center gap-1">
                    <Globe className="w-2.5 h-2.5 text-slate-400" />
                    <span className="text-[9px] font-mono text-slate-500 truncate">{previewUrl}</span>
                  </div>
                </div>
                {/* Real portfolio HTML rendered inside iframe via srcdoc — scaled down to fit */}
                <div className="flex-1 relative overflow-hidden bg-white">
                  <iframe
                    key={freeTheme + freeThemeBg + freeHandle}
                    srcDoc={portfolioHTML}
                    title="Your Portfolio Preview"
                    sandbox="allow-same-origin"
                    className="absolute top-0 left-0 border-0"
                    style={{
                      width: '200%',
                      height: '200%',
                      transformOrigin: 'top left',
                      transform: 'scale(0.5)',
                      pointerEvents: 'none',
                    }}
                  />
                </div>
              </div>
              <p className="text-[10px] text-slate-400 leading-normal px-1 text-center mt-2">
                This is <strong>your actual portfolio</strong> with <span style={{ color: selectedThemeObj.hex }} className="font-semibold">{selectedThemeObj.label}</span> accent — exactly how visitors will see it.
              </p>
            </div>
          </div>
        </div>

        <button
          type="button"
          className="w-full h-14 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl font-semibold text-base transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-slate-900/20 disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
          onClick={handleFreePlanActivation}
          disabled={isProcessing || !freeHandle || handleAvailable !== true}
        >
          {isProcessing ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <>
              Activate Free Portfolio <ArrowRight className="w-4 h-4 ml-1" />
            </>
          )}
        </button>

        {/* Full Preview Portal — opens in the same tab as a centered popup modal dialog */}
        {showFreePreview && createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" onClick={() => setShowFreePreview(false)} />
            <div className="bg-white w-full max-w-2xl h-[70vh] rounded-2xl shadow-2xl relative flex flex-col overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-200">
              {/* Browser chrome */}
              <div className="bg-slate-100 border-b border-slate-200 px-4 py-2.5 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-400" />
                  <div className="w-3 h-3 rounded-full bg-yellow-400" />
                  <div className="w-3 h-3 rounded-full bg-green-400" />
                  <div className="ml-3 bg-white border border-slate-200 rounded-lg px-3 py-1 flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-xs font-mono text-slate-600">{previewUrl}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-400 font-bold tracking-wider uppercase bg-slate-200/50 px-2 py-0.5 rounded">Preview Mode</span>
                  <button
                    onClick={() => setShowFreePreview(false)}
                    className="p-1.5 rounded-lg hover:bg-slate-200 transition-colors"
                  >
                    <X className="w-4 h-4 text-slate-600" />
                  </button>
                </div>
              </div>
              {/* Full-size iframe with your actual portfolio data */}
              <div className="flex-1 relative overflow-hidden bg-white">
                <iframe
                  key={'fullpreview-' + freeTheme + freeThemeBg + freeHandle}
                  srcDoc={portfolioHTML}
                  title="Your Full Portfolio Preview"
                  sandbox="allow-same-origin allow-popups"
                  className="w-full h-full border-0 absolute inset-0"
                />
              </div>
            </div>
          </div>,
          document.body
        )}
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────────────
  // ACTIVE PLAN VIEW (For Premium Users)
  // ──────────────────────────────────────────────────────────────────────
  if (data.isPremium && isBillingManagement && !showUpgradeOptions) {
    return (
      <div className="flex flex-col h-full max-w-lg w-full mx-auto justify-center pb-10 animate-in fade-in slide-in-from-right-4">
        <button 
          onClick={() => setLocation('/dashboard')}
          className="flex items-center text-slate-500 hover:text-slate-900 mb-6 transition-colors w-fit text-sm font-medium"
        >
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to Dashboard
        </button>

        <h2 className="font-serif text-3xl md:text-4xl font-bold text-slate-900 mb-2">Billing & Plan</h2>
        <p className="text-slate-500 text-sm mb-6">Manage your subscription and view your current limits.</p>

        {portfolioUrl && (
          <div className="inline-flex items-center gap-2 mb-6 px-4 py-2 bg-indigo-50 border border-indigo-100 rounded-full w-fit">
            <Globe className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
            <span className="text-sm font-semibold text-indigo-700"><span className="text-indigo-500">{data.handle || ''}</span>.mybexo.cyou</span>
          </div>
        )}

        <div className="space-y-6">
          <Card className="p-6 bg-white border border-slate-200 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 bg-indigo-50 text-indigo-600 font-bold px-3 py-1 text-xs rounded-bl-lg">
              ACTIVE
            </div>
            <div className="flex items-start gap-4 mb-4">
              <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-500 flex items-center justify-center shrink-0">
                <Check className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-lg">
                  {data.plan === 'lifetime' ? 'Lifetime Pro' : data.plan === 'annual' ? 'Annual Support Plan' : 'Pro Plan'}
                </h3>
                <p className="text-sm text-slate-500 mt-0.5">
                  {data.plan === 'lifetime'
                    ? 'Lifetime premium access — forever.'
                    : expiryLabel
                      ? `Active until ${expiryLabel}.`
                      : 'You are currently on the annual premium tier.'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mt-6 pt-6 border-t border-slate-100">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase mb-1">Storage Quota</p>
                <p className="text-sm font-semibold text-slate-800">
                  {formatMb(data.storageQuotaBytes || 0)} Limit
                  {(data.storageBonusBytes || 0) > 0 && (
                    <span className="block text-xs font-medium text-indigo-600 mt-0.5">
                      includes +{formatMb(data.storageBonusBytes)} stacked
                    </span>
                  )}
                </p>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase mb-1">AI Resume Parses</p>
                <p className="text-sm font-semibold text-slate-800">
                  {data.plan === 'lifetime' ? '3 per month' : '10 per month'}
                </p>
              </div>
            </div>
          </Card>

          {data.plan === 'annual' && canBuyAnnual && (
            <Card className="p-6 bg-indigo-600 border border-indigo-700 shadow-md text-white text-center">
              <h3 className="font-bold text-xl mb-2">Renew Yearly</h3>
              <p className="text-indigo-100 text-sm mb-6">
                {expiryLabel
                  ? `Extend your Annual plan past ${expiryLabel} by another year.`
                  : 'Extend your Annual plan by another year.'}
              </p>
              <Button
                onClick={() => {
                  setPlan('annual');
                  setShowUpgradeOptions(true);
                }}
                variant="secondary"
                className="w-full bg-white text-indigo-600 hover:bg-indigo-50 border-none"
              >
                Renew Yearly Plan
              </Button>
            </Card>
          )}

          {data.plan === 'lifetime' && canBuyAnnual && (
            <Card className="p-6 bg-indigo-600 border border-indigo-700 shadow-md text-white text-center">
              <h3 className="font-bold text-xl mb-2">Add Yearly Storage</h3>
              <p className="text-indigo-100 text-sm mb-6">
                Keep Lifetime forever and stack +100MB cloud storage on top.
              </p>
              <Button
                onClick={() => {
                  setPlan('annual');
                  setShowUpgradeOptions(true);
                }}
                variant="secondary"
                className="w-full bg-white text-indigo-600 hover:bg-indigo-50 border-none"
              >
                Add +100MB Yearly
              </Button>
            </Card>
          )}
        </div>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────────────
  // MAIN PLAN SELECTION VIEW
  // ──────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full max-w-lg w-full mx-auto justify-center pb-10">
      <div className="mb-8 text-center">
        <h1 className="font-serif text-3xl md:text-4xl font-bold text-slate-900 mb-3 tracking-tight">
          {isBillingManagement
            ? renewalMode === 'renew'
              ? 'Renew Your Plan'
              : renewalMode === 'addon'
                ? 'Add Yearly Storage'
                : 'Manage Your Plan'
            : 'Activate Your Account'}
        </h1>
        <p className="text-slate-500 text-base md:text-lg">
          {isBillingManagement
            ? renewalMode === 'renew'
              ? 'Extend your Yearly plan — Lifetime is hidden while Annual is active.'
              : renewalMode === 'addon'
                ? 'Stack +100MB storage on top of Lifetime with a Yearly add-on.'
                : 'Upgrade, renew, or redeem a campus activation code for your portfolio.'
            : 'Complete your setup to unlock dashboard access and premium features.'}
        </p>
        {portfolioUrl && (
          <div className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-indigo-50 border border-indigo-100 rounded-full">
            <Globe className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
            <span className="text-sm font-semibold text-indigo-700"><span className="text-indigo-500">{data.handle || ''}</span>.mybexo.cyou</span>
          </div>
        )}
      </div>

      {planWarning && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-left">
          <p className="text-sm font-semibold text-amber-900">Current plan notice</p>
          <p className="text-sm text-amber-800 mt-1">{planWarning}</p>
        </div>
      )}

      <div className="bg-slate-200/50 p-1.5 rounded-xl flex mb-8">
        <button
          className={cn(
            "flex-1 py-2.5 text-sm font-medium rounded-lg transition-all",
            tab === 'pay' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
          )}
          onClick={() => { setTab('pay'); setCodeError(''); }}
        >
          {yearlyOnly ? (renewalMode === 'addon' ? 'Add Storage' : 'Renew Plan') : 'Choose Plan'}
        </button>
        <button
          className={cn(
            "flex-1 py-2.5 text-sm font-medium rounded-lg transition-all",
            tab === 'code' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
          )}
          onClick={() => setTab('code')}
        >
          Activation Code
        </button>
      </div>

      {tab === 'pay' ? (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
          {/* Annual — promoted / only option for existing subscribers */}
          {canBuyAnnual && (
            <Card 
              className={cn(
                "p-6 cursor-pointer border-2 transition-all relative overflow-hidden",
                plan === 'annual' ? "border-indigo-600 bg-indigo-50/10" : "border-slate-200 hover:border-indigo-300"
              )}
              onClick={() => setPlan('annual')}
            >
              <div className="absolute top-0 right-0 bg-indigo-600 text-white text-[9px] font-extrabold px-3 py-1 rounded-bl-lg tracking-wider uppercase">
                {renewalMode === 'renew' ? 'RENEW' : renewalMode === 'addon' ? 'ADD-ON' : 'RECOMMENDED'}
              </div>
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h3 className="text-xl font-bold text-slate-900">
                    {renewalMode === 'addon' ? 'Yearly Storage Add-on' : 'Annual Support Plan'}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5 font-medium">
                    {renewalMode === 'renew'
                      ? 'Extends your current Yearly access by 1 year.'
                      : renewalMode === 'addon'
                        ? 'Adds +100MB on top of Lifetime storage.'
                        : 'Billed annually. Help Bexo run & grow.'}
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-2xl font-bold text-slate-900">₹{prices.annual.toLocaleString('en-IN')}</span>
                  <span className="text-xs text-slate-500">/year</span>
                  <span className="text-[10px] text-slate-400 block">excl. GST</span>
                </div>
              </div>
              <ul className="space-y-2 mt-4">
                {(renewalMode === 'addon'
                  ? [
                      '+100MB stacked cloud storage',
                      'Lifetime access unchanged',
                      'Premium templates',
                    ]
                  : renewalMode === 'renew'
                    ? [
                        'Extend access by 1 year from current expiry',
                        'Keep your current storage quota',
                        'yourname.mybexo.cyou',
                        'Premium templates',
                      ]
                    : [
                        'Premium templates',
                        '100MB cloud storage base',
                        'yourname.mybexo.cyou',
                        'AI resume parses',
                        'Renew extends access 1 year',
                      ]
                ).map((feat, i) => (
                  <li key={i} className="flex items-center text-xs text-slate-600">
                    <Check className="w-4 h-4 text-indigo-500 mr-2 shrink-0" /> {feat}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/* Lifetime — only for free / expired users */}
          {canBuyLifetime && (
            <Card 
              className={cn(
                "p-6 cursor-pointer border-2 transition-all relative overflow-hidden",
                plan === 'lifetime' ? "border-indigo-600 bg-indigo-50/10" : "border-slate-200 hover:border-indigo-300"
              )}
              onClick={() => setPlan('lifetime')}
            >
              <div className="absolute top-0 right-0 bg-gradient-to-l from-emerald-600 to-indigo-600 text-white text-[9px] font-extrabold px-3 py-1 rounded-bl-lg tracking-wider uppercase">
                STUDENT PROMO
              </div>
              
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h3 className="text-xl font-bold text-slate-900 flex items-center gap-1.5">
                    Lifetime Pro
                  </h3>
                  <p className="text-xs text-indigo-600 font-bold mt-0.5">Best for students & professionals</p>
                </div>
                <div className="text-right">
                  <span className="text-2xl font-bold text-slate-900">₹{prices.lifetime.toLocaleString('en-IN')}</span>
                  <span className="text-[10px] text-slate-400 block">excl. GST</span>
                </div>
              </div>
              <p className="text-xs text-slate-500 mb-4">Pay once, hosting & live portfolio is yours for life.</p>
              <ul className="space-y-2">
                {[
                  'Everything in Yearly (templates & subdomain)',
                  '50MB storage base',
                  'No renewals for Pro access',
                  'Forever hosting',
                  'Optional Yearly add-on = +100MB storage',
                ].map((feat, i) => (
                  <li key={i} className="flex items-center text-xs text-slate-600">
                    <Check className="w-4 h-4 text-emerald-500 mr-2 shrink-0" /> {feat}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      ) : (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
          <div className="text-center mb-6">
            <ShieldCheck className="w-12 h-12 text-indigo-500 mx-auto mb-3" />
            <h3 className="font-semibold text-lg text-slate-900">Redeem Code</h3>
            <p className="text-sm text-slate-500 mt-1">Enter the activation key provided by your college or placement cell.</p>
          </div>
          <div className="space-y-2">
            <Input 
              placeholder="BEXO-XXXX-XXXX" 
              className={`h-14 text-center font-mono text-lg tracking-widest uppercase ${codeError ? "border-red-500 focus-visible:ring-red-500" : ""}`}
              value={code}
              onChange={(e) => {
                setCode(e.target.value.toUpperCase());
                if (e.target.value.length > 0) setCodeError('');
              }}
            />
            {codeError && <p className="text-red-500 text-sm text-center font-medium mt-1">{codeError}</p>}
          </div>
        </div>
      )}

      <div className="mt-8 onboarding-cta">
        <button
          type="button"
          className={`w-full h-14 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl font-semibold text-base transition-all duration-200 flex items-center justify-center gap-3 group disabled:opacity-50 disabled:pointer-events-none cursor-pointer shadow-lg shadow-slate-900/20 btn-continue-wrap px-6${isSwooshing ? ' is-swooshing' : ''}`}
          onClick={() => {
            if (tab === 'pay') {
              setShowCheckout(true);
            } else {
              handleActivationCode();
            }
          }}
          disabled={isProcessing || isSwooshing || (tab === 'code' && code.length === 0)}
        >
          {isProcessing ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <>
              <div className="w-9 h-9 bg-indigo-500 rounded-xl flex items-center justify-center arrow-box shrink-0">
                <ArrowRight className="w-5 h-5 text-white" />
              </div>
              <span className="btn-label">
                {tab === 'pay'
                  ? renewalMode === 'renew'
                    ? 'Continue to Renew'
                    : renewalMode === 'addon'
                      ? 'Continue to Add Storage'
                      : 'Continue to Checkout'
                  : 'Finish Setup'}
              </span>
            </>
          )}
        </button>
        
        {tab === 'pay' ? (
          <>
            <p className="text-center text-xs text-slate-400 mt-4 flex items-center justify-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" /> Secure encrypted checkout
            </p>
            {!data.isPremium && (
              <p className="text-center text-xs text-slate-400 mt-3 select-none">
                or{" "}
                <span
                  onClick={() => setFreeFlowStep('warning')}
                  className="text-slate-600 hover:text-slate-900 underline cursor-pointer transition-colors"
                >
                  Continue for free
                </span>
              </p>
            )}
          </>
        ) : (
          <p className="text-center text-xs text-slate-400 mt-4 flex items-center justify-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5" /> Secure encrypted activation
          </p>
        )}
      </div>
    </div>
  );
}
