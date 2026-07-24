import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'wouter';
import { useOnboarding } from '../context/OnboardingContext';
import { Button, Input, Card } from '../design-system/primitives';
import { Check, ShieldCheck, Loader2, ArrowRight, ArrowLeft, X, Eye, Globe, Database, Minus, Plus, Pencil } from 'lucide-react';
import { cn } from '../design-system/primitives';
import { useToast } from '../hooks/use-toast';
import { buildMinimalPortfolioHTML } from '../lib/buildMinimalHTML';
import { PENDING_TEMPLATE_KEY } from './step-7';
import { JUST_ACTIVATED_KEY } from './welcome';
import { PORTFOLIO_TEMPLATES, FREE_FALLBACK_TEMPLATE_ID } from '../lib/templates';
import { BILLING_PERIOD_LABELS, PLAN_LABELS, STORAGE_BLOCK_BYTES, planBaseQuotaBytes, computeStorageBundle, FREE_STORAGE_BYTES, computeCanBuy, normalizeClientPlanId } from '../lib/pricing';
import { usePricing, type PublicPricingPlan } from '../hooks/use-pricing';
import { apiUrl } from '../lib/api';
import { portfolioHostname } from '../lib/platform';
import { BillingAddressFields } from '../components/BillingAddressFields';

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

type PaidPlanId = 'identity' | 'essential' | 'growth' | 'studentplus';

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

const emptyBillingForm = (): BillingForm => ({
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

const isBillingFormComplete = (b: BillingForm) =>
  b.fullName.trim().length >= 2 &&
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email.trim()) &&
  b.phone.replace(/\D/g, '').length >= 10 &&
  b.line1.trim().length >= 3 &&
  b.city.trim().length >= 2 &&
  b.state.trim().length >= 2 &&
  /^[1-9][0-9]{5}$/.test(b.postalCode.trim());

const formatMb = (bytes: number) => `${Math.round((Number(bytes) || 0) / (1024 * 1024))}MB`;
const fmtINR = (n: number) =>
  n % 1 === 0
    ? n.toLocaleString('en-IN')
    : n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function Step9Plan() {
  const { data, updateData } = useOnboarding();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { paidPlans, planById } = usePricing();

  const [tab, setTab] = useState<'pay' | 'code'>('pay');
  const [plan, setPlan] = useState<PaidPlanId>('essential');
  const [isProcessing, setIsProcessing] = useState(false);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState('');
  const [isSwooshing] = useState(false);

  // Storage add-on states (for premium users on /billing)
  const [addonBlocks, setAddonBlocks] = useState(1);
  const [isAddonProcessing, setIsAddonProcessing] = useState(false);
  const [cancelStep, setCancelStep] = useState<'closed' | 'reason' | 'confirm'>('closed');
  const [cancelReason, setCancelReason] = useState('');
  const [cancelConfirmText, setCancelConfirmText] = useState('');
  const [needsMandateSetup, setNeedsMandateSetup] = useState(false);
  const [pendingMandateSubId, setPendingMandateSubId] = useState<string | null>(null);
  const [pendingMandateKey, setPendingMandateKey] = useState<string | null>(null);
  const [isConfirmingMandate, setIsConfirmingMandate] = useState(false);
  const [isCancellingSub, setIsCancellingSub] = useState(false);
  const [isEnablingAutopay, setIsEnablingAutopay] = useState(false);
  const [canEnableAutopay, setCanEnableAutopay] = useState(false);
  const [activatedViaKey, setActivatedViaKey] = useState(false);
  const [billingProfile, setBillingProfile] = useState<{
    fullName: string;
    email: string;
    phone: string;
    line1: string;
    line2?: string | null;
    city: string;
    state: string;
    postalCode: string;
    country: string;
    addressLines?: string[];
  } | null>(null);
  const [billingEditing, setBillingEditing] = useState(false);
  const [billingForm, setBillingForm] = useState<BillingForm>(emptyBillingForm);
  const [billingSaving, setBillingSaving] = useState(false);
  const [authToken] = useState(() =>
    typeof window !== 'undefined' ? localStorage.getItem('token') : null,
  );

  // Free flow states
  const [freeFlowStep, setFreeFlowStep] = useState<'none' | 'warning' | 'handle'>('none');
  const [freeHandle, setFreeHandle] = useState(data.handle || '');
  const [freeTheme, setFreeTheme] = useState(data.themeColor || 'blue');
  const [freeThemeBg, setFreeThemeBg] = useState(data.themeBg || 'grid');
  const [isCheckingHandle, setIsCheckingHandle] = useState(false);
  const [handleAvailable, setHandleAvailable] = useState<boolean | null>(null);
  const [handleError, setHandleError] = useState('');
  const [showFreePreview, setShowFreePreview] = useState(false);

  // Keep the add-more stepper within remaining capacity.
  useEffect(() => {
    const remaining = Math.max(0, 20 - Number(data.addonBlocks || 0));
    if (remaining > 0 && addonBlocks > remaining) setAddonBlocks(remaining);
  }, [data.addonBlocks, addonBlocks]);

  // Always refresh billing entitlements on this page so canBuy / cancel flags stay truthful.
  useEffect(() => {
    if (!data.hasCompletedOnboarding) return;
    const token = localStorage.getItem('token');
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(apiUrl('/api/payments/status'), {
          headers: { Authorization: `Bearer ${token}` },
        });
        const result = await res.json().catch(() => ({}));
        if (cancelled || !res.ok) return;
        const planId = normalizeClientPlanId(result.plan) || result.plan;
        updateData({
          plan: planId,
          isPremium: !!result.isPremium,
          storageQuotaBytes: result.storageQuotaBytes,
          storageBonusBytes: result.storageBonusBytes ?? 0,
          canBuy: result.canBuy || computeCanBuy(!!result.isPremium, planId),
          renewalMode: result.renewalMode || 'purchase',
          expiresAt: result.expiresAt,
          autopay: result.autopay ?? result.subscription?.autopay ?? false,
          billingPeriod: result.billingPeriod,
          addonBlocks: result.addonBlocks ?? 0,
          addonHasAutopay: result.addonHasAutopay ?? result.addon?.hasAutopay ?? false,
          limits: result.limits,
          cancelAtPeriodEnd: !!result.cancelAtPeriodEnd,
          siteStatus: result.siteStatus,
          pauseReason: result.pauseReason,
          graceUntil: result.graceUntil,
          paymentFailedAt: result.paymentFailedAt,
          isInPaymentGrace: !!result.isInPaymentGrace,
          isPausedForVisitors: !!result.isPausedForVisitors,
          overStorage: !!result.overStorage,
        } as any);
        const mandatePending = !!(result.needsMandateSetup || result.subscription?.needsMandateSetup);
        setNeedsMandateSetup(mandatePending);
        setPendingMandateSubId(result.subscription?.razorpaySubscriptionId || null);
        setPendingMandateKey(result.razorpayKey || null);
        setBillingProfile(result.billingProfile || null);
        setCanEnableAutopay(!!result.canEnableAutopay);
        setActivatedViaKey(!!result.activatedViaKey);
      } catch (err) {
        console.error('Billing status refresh failed:', err);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.hasCompletedOnboarding]);

  const completeAutopaySetup = async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      toast({ title: 'Autopay unavailable', description: 'Sign in again and try from Billing.', variant: 'destructive' });
      return;
    }
    if (!window.Razorpay) {
      toast({ title: 'Error', description: 'Razorpay SDK failed to load. Refresh and try again.', variant: 'destructive' });
      return;
    }
    setIsConfirmingMandate(true);
    try {
      let subscriptionId = pendingMandateSubId;
      let key = pendingMandateKey;
      if (!subscriptionId) {
        const resumeRes = await fetch(apiUrl('/api/payments/resume-autopay-setup'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: '{}',
        });
        const resumeData = await resumeRes.json().catch(() => ({}));
        if (!resumeRes.ok) throw new Error(resumeData.error || 'Could not start Autopay setup');
        if (resumeData.autopay && !resumeData.needsMandateSetup) {
          updateData({ autopay: true } as any);
          setNeedsMandateSetup(false);
          toast({ title: 'Autopay enabled', description: 'Renewals are already authorized.' });
          setIsConfirmingMandate(false);
          return;
        }
        subscriptionId = resumeData.subscriptionId;
        key = resumeData.key || key;
        setPendingMandateSubId(subscriptionId);
        setPendingMandateKey(key);
        setNeedsMandateSetup(true);
      }
      if (!subscriptionId) throw new Error('Missing Autopay subscription');

      const rzp = new window.Razorpay({
        key,
        name: 'Bexo',
        description: 'Authorize Razorpay Autopay for renewals',
        subscription_id: subscriptionId,
        prefill: {
          name: data.name,
          email: data.contactData?.email || '',
          contact: data.phone || '',
        },
        theme: { color: '#4f46e5' },
        handler: async (response: any) => {
          try {
            const res = await fetch(apiUrl('/api/payments/confirm-autopay'), {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify(response),
            });
            const result = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(result.error || 'Autopay confirmation failed');
            updateData({ autopay: true } as any);
            setNeedsMandateSetup(false);
            setPendingMandateSubId(null);
            toast({ title: 'Autopay enabled', description: 'Renewals will charge automatically at full plan price.' });
          } catch (err: any) {
            toast({ title: 'Autopay failed', description: err.message || 'Try again.', variant: 'destructive' });
          } finally {
            setIsConfirmingMandate(false);
          }
        },
        modal: {
          ondismiss: () => setIsConfirmingMandate(false),
        },
      });
      rzp.on('payment.failed', (response: any) => {
        toast({
          title: 'Autopay failed',
          description: response.error?.description || 'Authorization failed',
          variant: 'destructive',
        });
        setIsConfirmingMandate(false);
      });
      rzp.open();
    } catch (err: any) {
      toast({ title: 'Autopay failed', description: err.message || 'Try again.', variant: 'destructive' });
      setIsConfirmingMandate(false);
    }
  };

  const portfolioHTML = useMemo(
    () => buildMinimalPortfolioHTML(data, freeTheme, freeHandle || 'yourhandle', freeThemeBg),
    [data, freeTheme, freeHandle, freeThemeBg]
  );

  const totalUsedStorageBytes = useMemo(() => {
    let total = 0;
    if ((data as any).photoSizeBytes) total += Number((data as any).photoSizeBytes) || 0;
    if (data.resumeFileSize) total += Number(data.resumeFileSize) || 0;
    const sectionKeys = ['projectEntries', 'certificateEntries', 'achievementEntries', 'researchEntries'];
    for (const key of sectionKeys) {
      const list = (data as any)[key] || [];
      for (const item of list) {
        if (item?.assets) {
          if (Array.isArray(item.assets.images)) {
            for (const img of item.assets.images) total += Number(img.sizeBytes) || 0;
          }
          if (Array.isArray(item.assets.pdfs)) {
            for (const pdf of item.assets.pdfs) total += Number(pdf.sizeBytes) || 0;
          }
        }
      }
    }
    return total;
  }, [data]);

  const usedStorageMbNumber = totalUsedStorageBytes / (1024 * 1024);
  const usedStorageMb = usedStorageMbNumber > 0 ? usedStorageMbNumber.toFixed(1) : '0';
  const bundleInfo = useMemo(() => computeStorageBundle(totalUsedStorageBytes, plan), [totalUsedStorageBytes, plan]);

  const selectedPlan: PublicPricingPlan | undefined = planById(plan);
  const isBillingManagement = data.hasCompletedOnboarding;

  const handleStr = data.handle || (data.name ? data.name.toLowerCase().replace(/[^a-z0-9]/g, '') : '');
  const portfolioUrl = handleStr ? portfolioHostname(handleStr) : null;

  const currentPlanId = normalizeClientPlanId(data.plan) || data.plan;
  const currentPlanLabel = PLAN_LABELS[currentPlanId || 'free'] || 'Free';
  const isLifetimePlan = currentPlanId === 'studentplus';
  const canBuy = computeCanBuy(!!data.isPremium, currentPlanId);
  const upgradeTargets = (['essential', 'growth'] as PaidPlanId[]).filter(
    (id) => canBuy[id] && id !== currentPlanId,
  );

  const expiryLabel = data.expiresAt
    ? new Date(data.expiresAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
    : null;

  const addonPricePerBlock = planById('storage_addon')?.priceInrExGst ?? 25;
  const addonSubtotalInr = Math.round(addonPricePerBlock * addonBlocks * 100) / 100;

  const finishPremiumActivation = async (
    activatedPlan: string,
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

    const extraBlocks = bundleInfo.extraBlocksNeeded;
    const baseQuota = extras?.storageQuotaBytes ?? planBaseQuotaBytes(activatedPlan);
    const quota = baseQuota + (extraBlocks * STORAGE_BLOCK_BYTES);

    const patchBody: Record<string, unknown> = {
      plan: activatedPlan,
      isPremium: true,
      hasCompletedOnboarding: true,
      storageQuotaBytes: quota,
      storageBonusBytes: (extras?.storageBonusBytes ?? data.storageBonusBytes ?? 0) + (extraBlocks * STORAGE_BLOCK_BYTES),
      canBuy: computeCanBuy(true, activatedPlan),
      renewalMode: 'renew',
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

    sessionStorage.setItem(JUST_ACTIVATED_KEY, '1');
    setLocation('/welcome');
  };

  const handleAddonCancel = async () => {
    setIsAddonProcessing(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch("/api/payments/addon/cancel", {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` }
      });
      const result = await res.json();
      if (!res.ok) {
        if (res.status === 409 && result.code === 'ADDON_ALREADY_CANCELLED') {
          toast({ title: 'Auto-renew already off', description: result.error });
          updateData({
            addonBlocks: result.addonBlocks ?? data.addonBlocks,
            addonHasAutopay: false,
          } as any);
          return;
        }
        throw new Error(result.error || "Failed to cancel the add-on");
      }
      toast({ title: 'Storage updated', description: result.message });
      updateData({
        storageQuotaBytes: result.storageQuotaBytes,
        ...(typeof result.addonBlocks === 'number' ? { addonBlocks: result.addonBlocks } : {}),
        ...(typeof result.addonHasAutopay === 'boolean' ? { addonHasAutopay: result.addonHasAutopay } : { addonHasAutopay: false }),
      } as any);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setIsAddonProcessing(false);
    }
  };

  const handleSubscriptionCancel = async () => {
    if (cancelConfirmText.trim().toUpperCase() !== 'CANCEL') {
      toast({ title: 'Type CANCEL to confirm', variant: 'destructive' });
      return;
    }
    setIsCancellingSub(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/payments/subscription/cancel', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reason: cancelReason }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Failed to cancel subscription');
      updateData({
        cancelAtPeriodEnd: true,
        autopay: false,
      } as any);
      setCanEnableAutopay(true);
      toast({ title: 'Auto-renew cancelled', description: result.message });
      setCancelStep('closed');
      setCancelConfirmText('');
      setCancelReason('');
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setIsCancellingSub(false);
    }
  };

  const handleEnableAutopay = async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      toast({ title: 'Sign in required', description: 'Sign in again to enable Autopay.', variant: 'destructive' });
      return;
    }
    if (!billingProfile) {
      toast({
        title: 'Billing details needed',
        description: 'Add your billing address above, then tap Enable Autopay. You will not be charged today.',
        variant: 'destructive',
      });
      startBillingEdit();
      return;
    }
    if (!window.Razorpay) {
      toast({ title: 'Error', description: 'Razorpay SDK failed to load. Refresh and try again.', variant: 'destructive' });
      return;
    }

    setIsEnablingAutopay(true);
    try {
      const res = await fetch(apiUrl('/api/payments/subscription/enable-autopay'), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result.error || 'Could not enable Autopay');

      if (result.mock || (result.autopay && !result.needsMandateSetup)) {
        updateData({ autopay: true, cancelAtPeriodEnd: false } as any);
        setCanEnableAutopay(false);
        setActivatedViaKey(false);
        setNeedsMandateSetup(false);
        toast({
          title: 'Autopay enabled',
          description: result.message || 'Renewals will charge automatically at period end.',
        });
        return;
      }

      const subscriptionId = result.subscriptionId as string | undefined;
      const key = result.key as string | undefined;
      if (!subscriptionId || !key) throw new Error('Missing Autopay subscription details');

      setPendingMandateSubId(subscriptionId);
      setPendingMandateKey(key);
      setNeedsMandateSetup(true);

      const rzp = new window.Razorpay({
        key,
        name: 'Bexo',
        description: 'Authorize Razorpay Autopay for renewals',
        subscription_id: subscriptionId,
        prefill: {
          name: billingProfile.fullName || data.name,
          email: billingProfile.email || data.contactData?.email || '',
          contact: billingProfile.phone || data.phone || '',
        },
        theme: { color: '#4f46e5' },
        handler: async (response: any) => {
          try {
            const confirmRes = await fetch(apiUrl('/api/payments/confirm-autopay'), {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                razorpay_subscription_id: response.razorpay_subscription_id || subscriptionId,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              }),
            });
            const confirmData = await confirmRes.json().catch(() => ({}));
            if (!confirmRes.ok) throw new Error(confirmData.error || 'Could not confirm Autopay');
            updateData({
              autopay: true,
              cancelAtPeriodEnd: false,
              expiresAt: confirmData.expiresAt || data.expiresAt,
            } as any);
            setCanEnableAutopay(false);
            setActivatedViaKey(false);
            setNeedsMandateSetup(false);
            setPendingMandateSubId(null);
            toast({
              title: 'Autopay enabled',
              description:
                confirmData.message ||
                `Your ${currentPlanLabel} plan renews automatically after ${expiryLabel || 'this period'}.`,
            });
          } catch (err: any) {
            toast({ title: 'Autopay not confirmed', description: err.message, variant: 'destructive' });
          }
        },
        modal: {
          ondismiss: () => {
            toast({
              title: 'Authorization incomplete',
              description: 'Autopay was not enabled. You can try again anytime from Billing.',
            });
          },
        },
      });
      rzp.open();
      toast({
        title: 'Authorize Autopay',
        description: result.message || 'Complete Razorpay authorization. No charge today.',
      });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setIsEnablingAutopay(false);
    }
  };

  const startBillingEdit = () => {
    const fallback = emptyBillingForm();
    setBillingForm({
      fullName: billingProfile?.fullName || data.name || fallback.fullName,
      email: billingProfile?.email || data.contactData?.email || data.email || fallback.email,
      phone: billingProfile?.phone || data.phone || data.contactData?.phone || fallback.phone,
      line1: billingProfile?.line1 || '',
      line2: billingProfile?.line2 || '',
      city: billingProfile?.city || '',
      state: billingProfile?.state || '',
      postalCode: billingProfile?.postalCode || '',
      country: billingProfile?.country || 'IN',
    });
    setBillingEditing(true);
  };

  const saveBillingProfile = async () => {
    if (!isBillingFormComplete(billingForm)) {
      toast({
        title: 'Incomplete details',
        description: 'Fill in name, email, phone, and a complete Indian address before saving.',
        variant: 'destructive',
      });
      return;
    }
    const token = localStorage.getItem('token');
    if (!token) {
      toast({ title: 'Sign in required', description: 'Sign in again to update billing details.', variant: 'destructive' });
      return;
    }
    setBillingSaving(true);
    try {
      const res = await fetch(apiUrl('/api/payments/billing-profile'), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(billingForm),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Could not save billing information');
      const saved = json.billingProfile;
      if (saved) {
        setBillingProfile(saved);
        setBillingForm({
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
      toast({ title: 'Billing details saved', description: 'These will be used for invoices and Autopay.' });
    } catch (err: any) {
      toast({ title: 'Could not save', description: err.message, variant: 'destructive' });
    } finally {
      setBillingSaving(false);
    }
  };

  const startUpgradeCheckout = (target: PaidPlanId) => {
    setLocation(`/checkout?plan=${target}`);
  };

  const validateCode = () => {
    const pattern = /^[A-Z0-9]{2,12}-[A-Z0-9-]{6,}$/i;
    if (!pattern.test(code.trim())) {
      setCodeError('Invalid code format. Example: PSG-7F2K-91XQ-AB3D');
      return false;
    }
    setCodeError('');
    return true;
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
        await finishPremiumActivation(result.plan || 'growth', {
          storageQuotaBytes: result.storageQuotaBytes,
          storageBonusBytes: result.storageBonusBytes,
          stacked: result.stacked,
          expiresAt: result.expiresAt,
        });
      } else {
        const msg =
          result.code === 'EMAIL_BOUND_MISMATCH'
            ? result.error ||
              'This code is linked to another email. Sign in with that email to activate.'
            : result.error || 'Failed to activate code';
        throw new Error(msg);
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
  // ACTIVE PLAN VIEW (For Premium Users) — plan status + storage add-on
  // ──────────────────────────────────────────────────────────────────────
  if (data.isPremium && isBillingManagement) {
    const currentAddonBlocks = data.addonBlocks || 0;
    const addonHasAutopay = data.addonHasAutopay ?? (data as any).addon?.hasAutopay ?? false;
    const MAX_ADDON_UI = 20;
    const addonRemainingSlots = Math.max(0, MAX_ADDON_UI - currentAddonBlocks);
    return (
      <div className="flex flex-col h-full max-w-lg w-full mx-auto justify-center pb-10 animate-in fade-in slide-in-from-right-4">
        <button 
          onClick={() => setLocation('/dashboard')}
          className="flex items-center text-slate-500 hover:text-slate-900 mb-6 transition-colors w-fit text-sm font-medium"
        >
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to Dashboard
        </button>

        <h2 className="font-serif text-2xl sm:text-3xl md:text-4xl font-bold text-slate-900 mb-2">Billing & Plan</h2>
        <p className="text-slate-500 text-sm mb-6">Manage your subscription, storage, and view your current limits.</p>

        {portfolioUrl && (
          <div className="inline-flex items-center gap-2 mb-6 px-4 py-2 bg-indigo-50 border border-indigo-100 rounded-full w-fit">
            <Globe className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
            <span className="text-sm font-semibold text-indigo-700">{portfolioUrl || portfolioHostname(data.handle || '')}</span>
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
                <h3 className="font-bold text-slate-900 text-lg">{currentPlanLabel} Plan</h3>
                <p className="text-sm text-slate-500 mt-0.5">
                  {isLifetimePlan
                    ? 'Lifetime premium access — one-time payment, forever.'
                    : expiryLabel
                      ? `Valid until ${expiryLabel}.`
                      : 'Your premium plan is active.'}
                </p>
                {!isLifetimePlan && data.autopay && !data.cancelAtPeriodEnd && (
                  <span className="inline-flex items-center gap-1 mt-2 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-bold">
                    <Check className="w-3 h-3" /> Auto-renew on ({data.billingPeriod === 'monthly' ? 'monthly' : 'yearly'})
                  </span>
                )}
                {!isLifetimePlan && data.cancelAtPeriodEnd && (
                  <span className="inline-flex items-center gap-1 mt-2 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-[11px] font-bold">
                    Auto-renew off — access until {expiryLabel || 'period end'}
                  </span>
                )}
                {!isLifetimePlan && !data.autopay && !data.cancelAtPeriodEnd && canEnableAutopay && (
                  <span className="inline-flex items-center gap-1 mt-2 px-2.5 py-1 rounded-full bg-slate-50 border border-slate-200 text-slate-600 text-[11px] font-bold">
                    Autopay not enabled
                  </span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mt-6 pt-6 border-t border-slate-100">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase mb-1">Storage Quota</p>
                <p className="text-sm font-semibold text-slate-800">
                  {formatMb(data.storageQuotaBytes || 0)} Limit
                  {currentAddonBlocks > 0 && (
                    <span className="block text-xs font-medium text-indigo-600 mt-0.5">
                      includes +{formatMb(currentAddonBlocks * STORAGE_BLOCK_BYTES)} add-on
                    </span>
                  )}
                </p>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase mb-1">Monthly Limits</p>
                <p className="text-sm font-semibold text-slate-800">
                  {data.limits?.parsesPerMonth ?? '—'} AI parses · {data.limits?.updatesPerMonth ?? '—'} updates
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-6 bg-white border border-slate-200 shadow-sm">
            <div className="flex items-start justify-between gap-3 mb-4">
              <h3 className="text-xs font-bold tracking-[0.12em] text-slate-900 uppercase">
                Billing information
              </h3>
              {!billingEditing && (
                <button
                  type="button"
                  onClick={startBillingEdit}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  {billingProfile ? 'Edit' : 'Add'}
                </button>
              )}
            </div>

            {billingEditing ? (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-500 mb-1">Full name</label>
                    <Input
                      value={billingForm.fullName}
                      onChange={(e) => setBillingForm((p) => ({ ...p, fullName: e.target.value }))}
                      className="h-10 text-sm"
                      disabled={billingSaving}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Email</label>
                    <Input
                      type="email"
                      value={billingForm.email}
                      onChange={(e) => setBillingForm((p) => ({ ...p, email: e.target.value }))}
                      className="h-10 text-sm"
                      disabled={billingSaving}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Phone</label>
                    <Input
                      value={billingForm.phone}
                      onChange={(e) => setBillingForm((p) => ({ ...p, phone: e.target.value }))}
                      className="h-10 text-sm"
                      disabled={billingSaving}
                      placeholder="+91…"
                    />
                  </div>
                </div>
                <BillingAddressFields
                  value={{
                    line1: billingForm.line1,
                    line2: billingForm.line2,
                    city: billingForm.city,
                    state: billingForm.state,
                    postalCode: billingForm.postalCode,
                    country: billingForm.country,
                  }}
                  onChange={(patch) => setBillingForm((p) => ({ ...p, ...patch }))}
                  disabled={billingSaving}
                  authToken={authToken}
                />
                <div className="flex gap-2 pt-1">
                  <Button
                    type="button"
                    size="sm"
                    className="h-9 text-xs"
                    disabled={billingSaving || !isBillingFormComplete(billingForm)}
                    onClick={saveBillingProfile}
                  >
                    {billingSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Save'}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-9 text-xs"
                    disabled={billingSaving}
                    onClick={() => setBillingEditing(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : billingProfile ? (
              <>
                <dl className="space-y-2.5 text-sm">
                  <div className="grid grid-cols-[7rem_1fr] gap-2">
                    <dt className="text-slate-400">Name</dt>
                    <dd className="text-slate-900 font-medium">{billingProfile.fullName}</dd>
                  </div>
                  <div className="grid grid-cols-[7rem_1fr] gap-2">
                    <dt className="text-slate-400">Email</dt>
                    <dd className="text-slate-900 break-all">{billingProfile.email}</dd>
                  </div>
                  <div className="grid grid-cols-[7rem_1fr] gap-2">
                    <dt className="text-slate-400">Billing address</dt>
                    <dd className="text-slate-900 leading-snug">
                      {(billingProfile.addressLines || [
                        billingProfile.line1,
                        billingProfile.line2,
                        `${billingProfile.city} ${billingProfile.postalCode}`,
                        billingProfile.state,
                        billingProfile.country,
                      ])
                        .filter(Boolean)
                        .map((line) => (
                          <div key={String(line)}>{line}</div>
                        ))}
                    </dd>
                  </div>
                  <div className="grid grid-cols-[7rem_1fr] gap-2">
                    <dt className="text-slate-400">Phone number</dt>
                    <dd className="text-slate-900">{billingProfile.phone}</dd>
                  </div>
                </dl>
                <p className="text-xs text-slate-400 mt-4">
                  Used for tax invoices and Autopay. Edit anytime — changes apply to future invoices.
                </p>
              </>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-slate-500">
                  No billing details saved yet. Add them once for invoices and Autopay renewals.
                </p>
                <Button type="button" size="sm" className="h-9 text-xs" onClick={startBillingEdit}>
                  Add billing information
                </Button>
              </div>
            )}
          </Card>

          {!isLifetimePlan && needsMandateSetup && (
            <Card className="p-6 bg-amber-50 border border-amber-200 shadow-sm space-y-3">
              <h3 className="font-bold text-slate-900 text-base mb-1.5">Finish Autopay to activate</h3>
              <p className="text-sm text-slate-600">
                Your first invoice is on hold. Authorize Razorpay Autopay to activate the plan. Closing without authorizing triggers a refund.
              </p>
              <Button
                type="button"
                size="sm"
                className="h-9 text-xs"
                disabled={isConfirmingMandate || !pendingMandateSubId}
                onClick={completeAutopaySetup}
              >
                {isConfirmingMandate ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Authorize Autopay'}
              </Button>
            </Card>
          )}

          {!isLifetimePlan && (data.autopay || data.cancelAtPeriodEnd || canEnableAutopay) && (
            <Card className="p-6 bg-white border border-slate-200 shadow-sm space-y-3">
              {data.cancelAtPeriodEnd || (!data.autopay && canEnableAutopay) ? (
                <>
                  <h3 className="font-bold text-slate-900 text-base mb-1.5">
                    {data.cancelAtPeriodEnd ? 'Auto-renew is off' : 'Autopay not enabled'}
                  </h3>
                  <p className="text-sm text-slate-500">
                    {data.cancelAtPeriodEnd
                      ? expiryLabel
                        ? `You'll keep ${currentPlanLabel} access until ${expiryLabel}, then move to Free — unless you enable Autopay.`
                        : 'Auto-renew is cancelled. Access continues until the end of the paid period.'
                      : activatedViaKey
                        ? expiryLabel
                          ? `You unlocked ${currentPlanLabel} with an activation key through ${expiryLabel}. Enable Autopay to keep the same plan after that — Razorpay charges automatically at expiry.`
                          : `You unlocked ${currentPlanLabel} with an activation key. Enable Autopay to renew automatically when it ends.`
                        : expiryLabel
                          ? `Enable Autopay to renew ${currentPlanLabel} automatically on ${expiryLabel}.`
                          : `Enable Autopay so ${currentPlanLabel} renews automatically.`}
                  </p>
                  <div className="pt-1">
                    <Button
                      type="button"
                      size="sm"
                      className="h-9 text-xs"
                      disabled={isEnablingAutopay || needsMandateSetup}
                      onClick={handleEnableAutopay}
                    >
                      {isEnablingAutopay ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        'Enable Autopay'
                      )}
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <h3 className="font-bold text-slate-900 text-base mb-1.5">Auto-renew is on</h3>
                  <p className="text-sm text-slate-500">
                    {expiryLabel
                      ? `Your ${currentPlanLabel} plan renews automatically on ${expiryLabel} via Razorpay Autopay.`
                      : `Your ${currentPlanLabel} plan renews automatically via Razorpay Autopay.`}
                  </p>
                  <div className="pt-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9 text-xs text-red-600 border-red-200 hover:bg-red-50"
                      onClick={() => setCancelStep('reason')}
                    >
                      Cancel auto-renew
                    </Button>
                  </div>
                </>
              )}

              {cancelStep !== 'closed' && !data.cancelAtPeriodEnd && data.autopay && (
                <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                  {cancelStep === 'reason' && (
                    <>
                      <p className="text-xs text-slate-500">
                        Auto-renew stops today. You keep {currentPlanLabel} until {expiryLabel || 'period end'}, then move to Free.
                      </p>
                      <p className="text-xs font-semibold text-slate-700">Quick reason (optional)</p>
                      {['Too expensive', 'Not using enough', 'Switching plans later', 'Other'].map((r) => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => { setCancelReason(r); setCancelStep('confirm'); }}
                          className="block w-full text-left text-xs px-3 py-2 rounded-lg bg-white border border-slate-200 hover:border-indigo-300"
                        >
                          {r}
                        </button>
                      ))}
                      <button
                        type="button"
                        className="text-[11px] text-slate-400 hover:text-slate-600"
                        onClick={() => { setCancelReason(''); setCancelStep('confirm'); }}
                      >
                        Skip →
                      </button>
                    </>
                  )}
                  {cancelStep === 'confirm' && (
                    <>
                      <p className="text-xs text-slate-600">
                        Type <span className="font-bold">CANCEL</span> to stop auto-renew.
                        {expiryLabel ? ` Access continues until ${expiryLabel}.` : ''}
                      </p>
                      <Input
                        value={cancelConfirmText}
                        onChange={(e) => setCancelConfirmText(e.target.value)}
                        placeholder="CANCEL"
                        className="h-9 text-sm"
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-9 text-xs flex-1"
                          onClick={() => setCancelStep('closed')}
                          disabled={isCancellingSub}
                        >
                          Keep plan
                        </Button>
                        <Button
                          size="sm"
                          className="h-9 text-xs flex-1 bg-red-600 hover:bg-red-700"
                          onClick={handleSubscriptionCancel}
                          disabled={isCancellingSub}
                        >
                          {isCancellingSub ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Confirm cancel'}
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </Card>
          )}

          {/* Upgrade path — Identity → Essential / Growth */}
          {!isLifetimePlan && (
            <Card className="p-6 bg-white border border-slate-200 shadow-sm space-y-3">
              <h3 className="font-bold text-slate-900 text-base">Upgrade plan</h3>
              <p className="text-sm text-slate-500">
                You are on <span className="font-semibold text-slate-700">{currentPlanLabel}</span>.
                Higher tiers unlock more updates, storage, and visitor analytics.
              </p>
              <div className="grid gap-2">
                {upgradeTargets.map((id) => {
                    const meta = planById(id);
                    const price = meta?.priceInrExGst ?? (id === 'growth' ? 999 : 199);
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => startUpgradeCheckout(id)}
                        className="flex items-center justify-between gap-3 rounded-xl border border-indigo-100 bg-indigo-50/50 px-4 py-3 text-left hover:border-indigo-300 transition-colors"
                      >
                        <div>
                          <p className="text-sm font-bold text-slate-900">Upgrade to {PLAN_LABELS[id] || id}</p>
                          <p className="text-[11px] text-slate-500">
                            {id === 'growth' ? 'Yearly · analytics + leads inbox' : 'Monthly · analytics + leads inbox'}
                          </p>
                        </div>
                        <span className="text-xs font-bold text-indigo-700">
                          ₹{fmtINR(price)}{id === 'growth' ? '/yr' : '/mo'} →
                        </span>
                      </button>
                    );
                  })}
                {upgradeTargets.length === 0 && (
                  <p className="text-xs text-slate-400">You're on the highest available upgrade path.</p>
                )}
              </div>
            </Card>
          )}

          {/* Storage add-on */}
          <Card className="p-6 bg-white border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                <Database className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h3 className="font-bold text-slate-900 text-base">Storage Increase</h3>
                <p className="text-sm text-slate-500 mt-0.5">
                  ₹{addonPricePerBlock}/month per 50MB block, on top of your plan.
                </p>
              </div>
            </div>

            {currentAddonBlocks > 0 && (
              <div className="flex items-center justify-between gap-3 bg-indigo-50/50 border border-indigo-100 rounded-xl p-4">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900">
                    {currentAddonBlocks} block{currentAddonBlocks > 1 ? 's' : ''} active (+{formatMb(currentAddonBlocks * STORAGE_BLOCK_BYTES)})
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {addonHasAutopay
                      ? 'Billed monthly via Razorpay Autopay. Cancel removes the latest block at cycle end.'
                      : 'Auto-renew is off — extra space stays until the end of your paid period.'}
                  </p>
                </div>
                {addonHasAutopay ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-red-500 hover:text-red-600 hover:bg-red-50 border-red-200 shrink-0"
                    disabled={isAddonProcessing}
                    onClick={handleAddonCancel}
                  >
                    {isAddonProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Cancel latest'}
                  </Button>
                ) : null}
              </div>
            )}

            {addonRemainingSlots > 0 ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900">
                    {currentAddonBlocks > 0 ? 'Add more storage' : 'Add storage'}
                  </p>
                  <span className="text-[11px] font-medium text-slate-400">
                    {addonRemainingSlots} block{addonRemainingSlots === 1 ? '' : 's'} left
                  </span>
                </div>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                  <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-2 py-1.5">
                    <button
                      type="button"
                      className="w-8 h-8 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-100 disabled:opacity-40"
                      onClick={() => setAddonBlocks((b) => Math.max(1, b - 1))}
                      disabled={addonBlocks <= 1}
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-sm font-bold text-slate-900 w-24 text-center">
                      {addonBlocks} × 50MB
                    </span>
                    <button
                      type="button"
                      className="w-8 h-8 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-100 disabled:opacity-40"
                      onClick={() => setAddonBlocks((b) => Math.min(addonRemainingSlots, b + 1))}
                      disabled={addonBlocks >= addonRemainingSlots}
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <Button
                    className="flex-1 h-11"
                    disabled={isAddonProcessing}
                    onClick={() => setLocation(`/checkout?kind=storage&blocks=${addonBlocks}`)}
                  >
                    <>
                      {currentAddonBlocks > 0 ? 'Add' : 'Get'} +{formatMb(addonBlocks * STORAGE_BLOCK_BYTES)} — ₹{fmtINR(addonSubtotalInr)}/mo
                    </>
                  </Button>
                </div>
                {currentAddonBlocks > 0 && (
                  <p className="text-[11px] text-slate-400">
                    After this, you’ll have {currentAddonBlocks + addonBlocks} blocks (+{formatMb((currentAddonBlocks + addonBlocks) * STORAGE_BLOCK_BYTES)} total add-on).
                  </p>
                )}
              </div>
            ) : (
              <p className="text-xs text-slate-400">
                You’ve reached the {MAX_ADDON_UI} block cap ({formatMb(MAX_ADDON_UI * STORAGE_BLOCK_BYTES)}). Cancel a block to free a slot.
              </p>
            )}
          </Card>
        </div>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────────────
  // MAIN PLAN SELECTION VIEW — new 4-plan catalog + free flow
  // ──────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full max-w-2xl w-full mx-auto justify-center pb-10">
      <div className="mb-8 text-center">
        <h1 className="font-serif text-2xl sm:text-3xl md:text-4xl font-bold text-slate-900 mb-3 tracking-tight">
          {isBillingManagement ? 'Choose Your Plan' : 'Activate Your Account'}
        </h1>
        <p className="text-slate-500 text-base md:text-lg">
          {isBillingManagement
            ? 'Upgrade or redeem a campus activation code for your portfolio.'
            : 'Complete your setup to unlock dashboard access and premium features.'}
        </p>
        {portfolioUrl && (
          <div className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-indigo-50 border border-indigo-100 rounded-full">
            <Globe className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
            <span className="text-sm font-semibold text-indigo-700">{portfolioUrl || portfolioHostname(data.handle || '')}</span>
          </div>
        )}
      </div>

      <div className="bg-slate-200/50 p-1.5 rounded-xl flex mb-8">
        <button
          className={cn(
            "flex-1 py-2.5 text-sm font-medium rounded-lg transition-all",
            tab === 'pay' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
          )}
          onClick={() => { setTab('pay'); setCodeError(''); }}
        >
          Choose Plan
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

      {totalUsedStorageBytes > FREE_STORAGE_BYTES && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200/90 rounded-2xl flex items-start gap-3.5 shadow-sm">
          <div className="p-2 bg-amber-100/80 text-amber-800 rounded-xl font-bold shrink-0">
            <Database className="w-5 h-5 text-amber-700" />
          </div>
          <div className="flex-1">
            <h4 className="text-sm font-bold text-amber-950 flex items-center gap-2">
              Portfolio Assets Uploaded: <span className="px-2 py-0.5 bg-amber-200/60 rounded-full text-amber-900 font-mono text-xs">{usedStorageMb} MB</span>
            </h4>
            <p className="text-xs text-amber-800 mt-1 leading-relaxed">
              The free plan includes 10 MB. Choose your plan below so all your uploaded project images, certificates, and PDFs publish instantly without deletion.
            </p>
          </div>
        </div>
      )}

      {tab === 'pay' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-in fade-in slide-in-from-bottom-2">
          {paidPlans.map((p) => {
            const isSelected = plan === p.id;
            const period = BILLING_PERIOD_LABELS[p.billingPeriod] || '';
            const pBundle = computeStorageBundle(totalUsedStorageBytes, p.id);
            const pHasAddon = pBundle.extraBlocksNeeded > 0;
            const pTotalExGst = p.priceInrExGst + pBundle.extraStorageCostInr;

            return (
              <Card
                key={p.id}
                className={cn(
                  "p-5 cursor-pointer border-2 transition-all relative overflow-hidden flex flex-col",
                  isSelected ? "border-indigo-600 bg-indigo-50/10 shadow-md" : "border-slate-200 hover:border-indigo-300"
                )}
                onClick={() => setPlan(p.id as PaidPlanId)}
              >
                {p.isHighlighted && (
                  <div className="absolute top-0 right-0 bg-indigo-600 text-white text-[9px] font-extrabold px-3 py-1 rounded-bl-lg tracking-wider uppercase">
                    MOST POPULAR
                  </div>
                )}
                {p.id === 'studentplus' && (
                  <div className="absolute top-0 right-0 bg-gradient-to-l from-emerald-600 to-indigo-600 text-white text-[9px] font-extrabold px-3 py-1 rounded-bl-lg tracking-wider uppercase">
                    LIFETIME
                  </div>
                )}
                <div className="mb-2 pr-16">
                  <h3 className="text-lg font-bold text-slate-900 leading-tight">{p.displayName}</h3>
                  {p.subtitle && <p className="text-[11px] text-slate-500 mt-0.5 font-medium">{p.subtitle}</p>}
                </div>
                <div className="mb-3">
                  <span className="text-2xl font-bold text-slate-900">₹{fmtINR(pTotalExGst)}</span>
                  <span className="text-xs text-slate-500">{period}</span>
                  {pHasAddon && (
                    <span className="block text-[11px] font-semibold text-indigo-600 mt-0.5">
                      (₹{fmtINR(p.priceInrExGst)} plan + ₹{fmtINR(pBundle.extraStorageCostInr)} storage add-on)
                    </span>
                  )}
                </div>

                {/* Storage Bundle Indicator */}
                {pHasAddon ? (
                  <div className="mb-3 p-2 bg-indigo-50 border border-indigo-100 rounded-lg text-[11px] font-semibold text-indigo-900 flex items-center gap-1.5">
                    <Database className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                    <span>+{pBundle.extraBlocksNeeded} × 50MB Storage Block (+₹{pBundle.extraStorageCostInr}/mo)</span>
                  </div>
                ) : (
                  totalUsedStorageBytes > FREE_STORAGE_BYTES && (
                    <div className="mb-3 p-2 bg-emerald-50 border border-emerald-100 rounded-lg text-[11px] font-semibold text-emerald-800 flex items-center gap-1.5">
                      <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>Covers your {usedStorageMb} MB assets seamlessly</span>
                    </div>
                  )
                )}
                <ul className="space-y-1.5 mt-auto">
                  {p.features.slice(0, 6).map((feat, i) => (
                    <li key={i} className="flex items-start text-[11px] text-slate-600 leading-snug">
                      <Check className={cn("w-3.5 h-3.5 mr-1.5 shrink-0 mt-px", p.id === 'studentplus' ? "text-emerald-500" : "text-indigo-500")} /> {feat}
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })}
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
              placeholder="PSG-XXXX-XXXX-XXXX" 
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

      <div className="mt-8 onboarding-cta max-w-md w-full mx-auto">
        <button
          type="button"
          className={`w-full h-14 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl font-semibold text-base transition-all duration-200 flex items-center justify-center gap-3 group disabled:opacity-50 disabled:pointer-events-none cursor-pointer shadow-lg shadow-slate-900/20 btn-continue-wrap px-6${isSwooshing ? ' is-swooshing' : ''}`}
          onClick={() => {
            if (tab === 'pay') {
              setLocation(`/checkout?plan=${plan}`);
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
                  ? `Continue with ${selectedPlan?.displayName || 'Plan'}`
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
