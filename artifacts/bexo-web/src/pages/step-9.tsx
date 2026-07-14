import React, { useState } from 'react';
import { useLocation } from 'wouter';
import { useOnboarding } from '../context/OnboardingContext';
import { Button, Input, Card } from '../design-system/primitives';
import { Check, ShieldCheck, Loader2, ArrowRight, Tag, ArrowLeft, X } from 'lucide-react';
import { cn } from '../design-system/primitives';
import { useToast } from '../hooks/use-toast';

declare global {
  interface Window {
    Razorpay: any;
  }
}

export default function Step9Plan() {
  const { data, updateData } = useOnboarding();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const [tab, setTab] = useState<'pay' | 'code'>('pay');
  const [plan, setPlan] = useState<'annual' | 'lifetime'>('lifetime');
  const [isProcessing, setIsProcessing] = useState(false);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState('');
  const [isSwooshing, setIsSwooshing] = useState(false);

  // Checkout specific states
  const [showCheckout, setShowCheckout] = useState(false);
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);
  const [isApplyingCoupon, setIsApplyingCoupon] = useState(false);

  // Free flow states
  const [freeFlowStep, setFreeFlowStep] = useState<'none' | 'warning' | 'handle'>('none');
  const [freeHandle, setFreeHandle] = useState(data.handle || '');
  const [isCheckingHandle, setIsCheckingHandle] = useState(false);
  const [handleAvailable, setHandleAvailable] = useState<boolean | null>(null);
  const [handleError, setHandleError] = useState('');

  const basePrice = plan === 'annual' ? 999 : 2999;
  
  const getDiscount = () => {
    if (appliedCoupon === 'BEXO50') return basePrice * 0.5;
    if (appliedCoupon === 'STUDENT') return 200;
    if (appliedCoupon === 'BEXO2026' || appliedCoupon === 'PROMO2026') {
      if (plan === 'annual') return basePrice - 799; // reduces price to 799
      if (plan === 'lifetime') return basePrice - 1999; // reduces price to 1999
    }
    return 0;
  };

  const discount = getDiscount();
  const subtotal = basePrice - discount;
  const gst = subtotal * 0.18;
  const total = Math.round(subtotal + gst);
  const isBillingManagement = data.hasCompletedOnboarding;

  const verifyPayment = async (token: string | null, payload: any) => {
    const verifyRes = await fetch("/api/payments/verify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({
        ...payload,
        plan
      })
    });

    const verifyData = await verifyRes.json();
    if (!verifyRes.ok) {
      throw new Error(verifyData.error || "Payment verification failed");
    }

    updateData({
      plan,
      isPremium: true,
      storageQuotaBytes: plan === 'annual' ? 100 * 1024 * 1024 : 500 * 1024 * 1024,
    });
    toast({ title: 'Payment Successful', description: 'Your BEXO Pro access is active.' });
    setLocation('/dashboard');
  };

  const validateCode = () => {
    // Flexible format for Bexo activation codes (e.g. BEXO-KAVIN-2026, BEXO-PRO-LIFETIME, BEXO-XXXX-XXXX)
    const pattern = /^BEXO-[A-Z0-9-]+$/i;
    if (!pattern.test(code)) {
      setCodeError('Invalid code format. Code should start with BEXO-');
      return false;
    }
    setCodeError('');
    return true;
  };

  const handleApplyCoupon = () => {
    setIsApplyingCoupon(true);
    setTimeout(() => {
      setIsApplyingCoupon(false);
      const codeUpper = couponCode.toUpperCase();
      if (codeUpper === 'BEXO50' || codeUpper === 'STUDENT' || codeUpper === 'BEXO2026' || codeUpper === 'PROMO2026') {
        setAppliedCoupon(codeUpper);
        toast({ title: 'Coupon Applied', description: 'Discount has been applied to your total.' });
      } else {
        toast({ title: 'Invalid Coupon', description: 'The coupon code you entered is invalid.', variant: 'destructive' });
        setAppliedCoupon(null);
      }
    }, 600);
  };

  const handleRazorpayCheckout = async () => {
    setIsProcessing(true);
    try {
      const token = localStorage.getItem('token');
      // Create Order
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

      // Initialize Razorpay
      const options = {
        key: orderData.key || 'rzp_test_YourKeyIdHere', // Fallback for testing UI without keys
        amount: orderData.amount,
        currency: orderData.currency,
        name: "Bexo",
        description: plan === 'annual' ? "Annual Support Plan" : "Lifetime Access",
        order_id: orderData.orderId,
        handler: async function (response: any) {
          try {
            toast({ title: 'Processing Payment', description: 'Please wait while we verify your payment...' });
            await verifyPayment(token, response);
          } catch (err: any) {
            console.error("Verification error:", err);
            toast({ title: 'Verification Failed', description: err.message, variant: 'destructive' });
          } finally {
            setIsProcessing(false);
          }
        },
        prefill: {
          name: data.name,
          email: data.contactData.email || "",
          contact: data.phone || ""
        },
        theme: {
          color: "#4f46e5"
        }
      };

      if (window.Razorpay) {
        const rzp = new window.Razorpay(options);
        rzp.on('payment.failed', function (response: any){
           toast({ title: 'Payment Failed', description: response.error.description, variant: 'destructive' });
        });
        rzp.open();
      } else {
        toast({ title: 'Error', description: 'Razorpay SDK failed to load.', variant: 'destructive' });
      }

    } catch (err: any) {
      console.error("Checkout error:", err);
      toast({ title: 'Checkout Error', description: err.message, variant: 'destructive' });
    } finally {
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
        updateData({
          plan: result.plan || 'annual',
          isPremium: true,
          storageQuotaBytes: (result.plan || 'annual') === 'annual' ? 100 * 1024 * 1024 : 500 * 1024 * 1024,
        });
        toast({ title: 'Account Activated', description: 'Your activation code was successfully redeemed.' });
        setLocation('/dashboard');
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
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
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
      const headers: HeadersInit = {
        'Content-Type': 'application/json'
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      // 1. Save handle & template in profile
      const patchRes = await fetch("/api/profile", {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          handle: freeHandle.trim().toLowerCase(),
          templateId: 'minimal'
        })
      });

      if (!patchRes.ok) {
        const errData = await patchRes.json();
        throw new Error(errData.error || "Failed to update profile handle");
      }

      // 2. Activate free plan subscription
      const activateRes = await fetch("/api/payments/free-activate", {
        method: "POST",
        headers
      });

      if (!activateRes.ok) {
        const errData = await activateRes.json();
        throw new Error(errData.error || "Failed to activate Free plan");
      }

      updateData({
        handle: freeHandle.trim().toLowerCase(),
        templateId: 'minimal',
        plan: 'free',
        isPremium: false,
        storageQuotaBytes: 10 * 1024 * 1024,
        hasCompletedOnboarding: true
      });

      toast({ title: 'Welcome to Bexo!', description: 'Your free account is activated.' });
      setLocation('/dashboard');
    } catch (err: any) {
      console.error(err);
      toast({ title: 'Setup Failed', description: err.message || "Failed to complete free plan setup", variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  };

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
            <>
              Pay ₹{total} Securely
            </>
          )}
        </button>
        <p className="text-center text-xs text-slate-400 mt-4 flex items-center justify-center gap-1">
          <ShieldCheck className="w-3.5 h-3.5" /> Payments are processed securely by Razorpay
        </p>
      </div>
    );
  }

  if (freeFlowStep === 'warning') {
    return (
      <div className="flex flex-col h-full max-w-md w-full mx-auto justify-center pb-10 animate-in fade-in slide-in-from-right-4">
        <button 
          onClick={() => setFreeFlowStep('none')}
          className="flex items-center text-slate-500 hover:text-slate-900 mb-6 transition-colors w-fit text-sm font-medium"
        >
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to Plans
        </button>

        <h2 className="font-serif text-2xl font-bold text-slate-900 mb-2">Are you sure you want to proceed with Free?</h2>
        <p className="text-slate-500 text-sm mb-6">Here is what you will lose by continuing on the Free tier:</p>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-6 space-y-4">
          <div className="flex items-start gap-3 pb-3 border-b border-slate-100">
            <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center shrink-0">
              <span className="text-red-600 font-bold text-sm">90%</span>
            </div>
            <div>
              <p className="text-xs font-bold text-slate-900">Less Storage Space</p>
              <p className="text-[11px] text-slate-500 mt-0.5">Your storage limit drops to 10MB (Pro offers 500MB for lifetime or 100MB for annual).</p>
            </div>
          </div>

          <div className="flex items-start gap-3 pb-3 border-b border-slate-100">
            <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center shrink-0">
              <X className="w-4.5 h-4.5 text-red-600 shrink-0" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-900">No AI Resume Parsing</p>
              <p className="text-[11px] text-slate-500 mt-0.5">You lose access to monthly AI resume data extraction (Pro includes up to 3 parses/month).</p>
            </div>
          </div>

          <div className="flex items-start gap-3 pb-3 border-b border-slate-100">
            <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center shrink-0">
              <X className="w-4.5 h-4.5 text-red-600 shrink-0" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-900">Locked Layout Templates</p>
              <p className="text-[11px] text-slate-500 mt-0.5">You can only use the Minimal template (Creative & Academic designs are locked).</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center shrink-0">
              <X className="w-4.5 h-4.5 text-red-600 shrink-0" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-900">No Custom Subdomains</p>
              <p className="text-[11px] text-slate-500 mt-0.5">Your portfolio will live at mybexo.com/handle instead of custom subdomains.</p>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <button
            type="button"
            className="w-full h-14 bg-indigo-650 hover:bg-indigo-700 text-white rounded-2xl font-semibold text-sm transition-all duration-200 shadow-md shadow-indigo-600/10 flex items-center justify-center gap-2 cursor-pointer border-none"
            onClick={() => setFreeFlowStep('none')}
          >
            Upgrade to Pro Now
          </button>
          
          <button
            type="button"
            className="w-full h-12 bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 rounded-2xl font-semibold text-xs transition-all duration-150 flex items-center justify-center gap-2 cursor-pointer"
            onClick={() => setFreeFlowStep('handle')}
          >
            I still want to continue with Free
          </button>
        </div>
      </div>
    );
  }

  if (freeFlowStep === 'handle') {
    return (
      <div className="flex flex-col h-full max-w-md w-full mx-auto justify-center pb-10 animate-in fade-in slide-in-from-right-4">
        <button 
          onClick={() => setFreeFlowStep('warning')}
          className="flex items-center text-slate-500 hover:text-slate-900 mb-6 transition-colors w-fit text-sm font-medium"
        >
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </button>

        <h2 className="font-serif text-2xl font-bold text-slate-900 mb-2">Claim Your Handle</h2>
        <p className="text-slate-500 text-sm mb-6">Choose your personal mybexo.com link to activate your free portfolio.</p>

        <div className="space-y-6 mb-8">
          <div className="space-y-2">
            <div className="relative flex">
              <span className="inline-flex items-center px-4 rounded-l-2xl border border-r-0 border-slate-200 bg-slate-50 text-slate-500 text-sm font-semibold select-none">
                mybexo.com/
              </span>
              <Input 
                placeholder="yourhandle" 
                className={cn(
                  "rounded-l-none rounded-r-2xl h-12 font-semibold text-slate-800",
                  handleAvailable === true ? "border-green-400 focus-visible:ring-green-400" : "",
                  handleAvailable === false ? "border-red-400 focus-visible:ring-red-400" : ""
                )}
                value={freeHandle}
                onChange={(e) => {
                  setFreeHandle(e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, ''));
                  setHandleAvailable(null);
                  setHandleError('');
                }}
              />
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
              <p className="text-red-500 text-xs px-1 font-semibold">
                {handleError}
              </p>
            )}
          </div>

          {/* Minimal Free Template Preview */}
          <div className="space-y-2.5">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider px-0.5">Free Layout Preview</span>
            <div className="rounded-2xl border border-slate-200/80 bg-slate-50 p-4 shadow-sm flex flex-col gap-3">
              <div className="w-full h-32 bg-white rounded-xl border border-slate-200 shadow-inner relative flex flex-col overflow-hidden">
                <div className="h-4 bg-slate-100 border-b border-slate-200 flex items-center px-2 gap-1 shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                  <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                  <span className="text-[9px] font-mono text-slate-400 ml-2">mybexo.com/{freeHandle || 'handle'}</span>
                </div>
                <div className="flex-1 p-2.5 flex flex-col justify-between">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="h-3 w-20 bg-slate-200 rounded animate-pulse" />
                      <div className="h-2 w-14 bg-slate-100 rounded mt-1.5" />
                    </div>
                    <div className="w-8 h-8 rounded-full bg-slate-200 shrink-0" />
                  </div>
                  <div className="flex gap-1.5">
                    <span className="h-4 px-2 bg-indigo-50 border border-indigo-100 rounded text-[8px] font-bold text-indigo-650 flex items-center">Minimal Theme</span>
                    <span className="h-4 px-2 bg-slate-100 rounded text-[8px] font-semibold text-slate-500 flex items-center">Responsive</span>
                  </div>
                </div>
              </div>
              <p className="text-[10px] text-slate-400 leading-normal px-1 text-center">
                Your portfolio will use the free <strong>Minimal</strong> theme layout with standard blue accents.
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
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full max-w-lg w-full mx-auto justify-center pb-10">
      <div className="mb-8 text-center">
        <h1 className="font-serif text-3xl md:text-4xl font-bold text-slate-900 mb-3 tracking-tight">
          {isBillingManagement ? 'Manage Your Plan' : 'Activate Your Account'}
        </h1>
        <p className="text-slate-500 text-base md:text-lg">
          {isBillingManagement
            ? 'Upgrade, renew, or redeem a campus activation code for your portfolio.'
            : 'Complete your setup to unlock dashboard access and premium features.'}
        </p>
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

      {tab === 'pay' ? (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
          {/* Lifetime Card (Popular / Promoted) */}
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
                <p className="text-xs text-indigo-600 font-bold mt-0.5">Expose your skills & profile forever</p>
              </div>
              <div className="text-right">
                <span className="text-2xl font-bold text-slate-900">₹2,999</span>
                <span className="text-[10px] text-slate-400 block">excl. GST</span>
              </div>
            </div>
            <p className="text-xs text-slate-500 mb-4">Pay once, hosting & live portfolio is yours for life.</p>
            <ul className="space-y-2">
              {[
                '500MB Premium Cloud Storage (photos & assets)',
                '1 AI Resume Parse per month (resets every 30 days)',
                'Personalized subdomain (yourname.mybexo.com)',
                'Full access to Academic & Creative layouts',
                'Expose exposure and portfolio to placement cells'
              ].map((feat, i) => (
                <li key={i} className="flex items-center text-xs text-slate-600">
                  <Check className="w-4 h-4 text-emerald-500 mr-2 shrink-0" /> {feat}
                </li>
              ))}
            </ul>
          </Card>

          {/* Annual Support Plan (Secondary) */}
          <Card 
            className={cn(
              "p-6 cursor-pointer border-2 transition-all relative overflow-hidden",
              plan === 'annual' ? "border-indigo-600 bg-indigo-50/10" : "border-slate-200 hover:border-indigo-300"
            )}
            onClick={() => setPlan('annual')}
          >
            <div className="flex justify-between items-start mb-2">
              <div>
                <h3 className="text-xl font-bold text-slate-900">Annual Support Plan</h3>
                <p className="text-xs text-slate-500 mt-0.5 font-medium">Billed annually. Help Bexo run & grow.</p>
              </div>
              <div className="text-right">
                <span className="text-2xl font-bold text-slate-900">₹999</span>
                <span className="text-xs text-slate-500">/year</span>
                <span className="text-[10px] text-slate-400 block">excl. GST</span>
              </div>
            </div>
            <ul className="space-y-2 mt-4">
              {[
                '100MB Cloud Storage space capacity',
                '3 AI Resume Parses per month (resets every 30 days)',
                'Personalized subdomain (yourname.mybexo.com)',
                'Full access to Academic & Creative layouts'
              ].map((feat, i) => (
                <li key={i} className="flex items-center text-xs text-slate-600">
                  <Check className="w-4 h-4 text-indigo-500 mr-2 shrink-0" /> {feat}
                </li>
              ))}
            </ul>
          </Card>
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

      <div className="mt-8">
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
              <span className="btn-label">{tab === 'pay' ? 'Continue to Checkout' : 'Finish Setup'}</span>
            </>
          )}
        </button>
        
        {tab === 'pay' ? (
          <>
            <p className="text-center text-xs text-slate-400 mt-4 flex items-center justify-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" /> Secure encrypted checkout
            </p>
            <p className="text-center text-xs text-slate-400 mt-3 select-none">
              or{" "}
              <button
                type="button"
                onClick={() => setFreeFlowStep('warning')}
                className="font-bold text-slate-600 hover:text-slate-900 underline transition-colors cursor-pointer border-none bg-transparent p-0"
              >
                Continue for free
              </button>
            </p>
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
