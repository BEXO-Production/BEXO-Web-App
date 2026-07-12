import React, { useState } from 'react';
import { useLocation } from 'wouter';
import { useOnboarding } from '../context/OnboardingContext';
import { Button, Input, Card } from '../design-system/primitives';
import { Check, ShieldCheck, Loader2, ArrowRight } from 'lucide-react';
import { cn } from '../design-system/primitives';

export default function Step9Plan() {
  const { data, updateData } = useOnboarding();
  const [, setLocation] = useLocation();
  
  const [tab, setTab] = useState<'pay' | 'code'>('pay');
  const [plan, setPlan] = useState<'annual' | 'lifetime'>('annual');
  const [isProcessing, setIsProcessing] = useState(false);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState('');
  const [isSwooshing, setIsSwooshing] = useState(false);

  const validateCode = () => {
    // Mock activation key format: BEXO-XXXX-XXXX
    const pattern = /^BEXO-[A-Z0-9]{4}-[A-Z0-9]{4}$/i;
    if (!pattern.test(code)) {
      setCodeError('Invalid code format. Expected: BEXO-XXXX-XXXX');
      return false;
    }
    setCodeError('');
    return true;
  };

  const handleCheckout = () => {
    if (tab === 'code' && !validateCode()) {
      return;
    }
    
    setIsSwooshing(true);
    setTimeout(() => {
      setIsSwooshing(false);
      setIsProcessing(true);
      setTimeout(() => {
        setIsProcessing(false);
        updateData({ plan: tab === 'code' ? 'activation_code' : plan });
        setLocation('/dashboard');
      }, 2000);
    }, 600);
  };

  return (
    <div className="flex flex-col h-full max-w-lg w-full mx-auto justify-center pb-10">
      <div className="mb-8 text-center">
        <h1 className="font-serif text-3xl md:text-4xl font-bold text-slate-900 mb-3 tracking-tight">
          Activate Your Account
        </h1>
        <p className="text-slate-500 text-base md:text-lg">
          Complete your setup to unlock dashboard access and premium features.
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
          <Card 
            className={cn(
              "p-6 cursor-pointer border-2 transition-all relative overflow-hidden",
              plan === 'annual' ? "border-blue-600 bg-blue-50/30" : "border-slate-200 hover:border-blue-300"
            )}
            onClick={() => setPlan('annual')}
          >
            {plan === 'annual' && (
              <div className="absolute top-0 right-0 bg-blue-600 text-white text-xs font-bold px-3 py-1 rounded-bl-lg">
                POPULAR
              </div>
            )}
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-xl font-bold text-slate-900">Annual Plan</h3>
              <div className="text-right">
                <span className="text-2xl font-bold text-slate-900">₹499</span>
                <span className="text-sm text-slate-500">/year</span>
              </div>
            </div>
            <ul className="space-y-2 mt-4">
              {['Custom mybexo.com domain', 'Unlimited resume parses', 'All premium templates'].map((feat, i) => (
                <li key={i} className="flex items-center text-sm text-slate-600">
                  <Check className="w-4 h-4 text-indigo-500 mr-2 shrink-0" /> {feat}
                </li>
              ))}
            </ul>
          </Card>

          <Card 
            className={cn(
              "p-6 cursor-pointer border-2 transition-all",
              plan === 'lifetime' ? "border-blue-600 bg-blue-50/30" : "border-slate-200 hover:border-blue-300"
            )}
            onClick={() => setPlan('lifetime')}
          >
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-xl font-bold text-slate-900">Lifetime</h3>
              <div className="text-right">
                <span className="text-2xl font-bold text-slate-900">₹1,999</span>
              </div>
            </div>
            <p className="text-sm text-slate-500 mb-4">Pay once, keep your portfolio forever.</p>
            <ul className="space-y-2">
              <li className="flex items-center text-sm text-slate-600">
                <Check className="w-4 h-4 text-indigo-500 mr-2 shrink-0" /> Includes all Annual features
              </li>
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
          onClick={handleCheckout}
          disabled={isProcessing || isSwooshing || (tab === 'code' && code.length === 0)}
        >
          {isProcessing ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <>
              <div className="w-9 h-9 bg-indigo-500 rounded-xl flex items-center justify-center arrow-box shrink-0">
                <ArrowRight className="w-5 h-5 text-white" />
              </div>
              <span className="btn-label">{tab === 'pay' ? `Proceed to Pay ${plan === 'annual' ? '₹499' : '₹1,999'}` : 'Finish Setup'}</span>
            </>
          )}
        </button>
        
        {tab === 'pay' && (
          <p className="text-center text-xs text-slate-400 mt-4 flex items-center justify-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5" /> Secure encrypted checkout
          </p>
        )}
      </div>
    </div>
  );
}
