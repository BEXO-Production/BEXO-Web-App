import React, { useState, useEffect } from 'react';
import { useOnboarding } from '../context/OnboardingContext';
import { Button, Input, Label } from '../design-system/primitives';
import { Loader2, ArrowRight } from 'lucide-react';

export default function Step1Phone() {
  const { data, updateData, nextStep } = useOnboarding();
  const [phone, setPhone] = useState(data.phone);
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [isSending, setIsSending] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    let timer: number;
    if (cooldown > 0) {
      timer = window.setInterval(() => setCooldown(c => c - 1), 1000);
    }
    return () => clearInterval(timer);
  }, [cooldown]);

  const handleSendOtp = (e: React.FormEvent) => {
    e.preventDefault();
    if (phone.length < 10) return;
    setIsSending(true);
    setTimeout(() => {
      setIsSending(false);
      setStep('otp');
      setCooldown(30);
    }, 1500);
  };

  const handleVerifyOtp = (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.join('').length < 6) return;
    setIsVerifying(true);
    setTimeout(() => {
      setIsVerifying(false);
      updateData({ phone });
      nextStep(1);
    }, 1500);
  };

  const handleOtpChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);
    if (value && index < 5) {
      const nextInput = document.getElementById(`otp-${index + 1}`);
      nextInput?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      const prevInput = document.getElementById(`otp-${index - 1}`);
      prevInput?.focus();
    }
  };

  return (
    <div className="flex flex-col h-full justify-center max-w-md w-full mx-auto">
      <div className="mb-10 text-center md:text-left">
        <h1 className="font-serif text-3xl md:text-4xl font-bold text-slate-900 mb-3 tracking-tight">
          Welcome to BEXO
        </h1>
        <p className="text-slate-500 text-base md:text-lg">
          Let's start by verifying your phone number. We'll send you a secure code.
        </p>
      </div>

      {step === 'phone' ? (
        <form onSubmit={handleSendOtp} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="phone">Mobile Number</Label>
            <div className="flex relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-medium">+91</span>
              <Input
                id="phone"
                type="tel"
                placeholder="98765 43210"
                className="pl-12 text-lg font-medium tracking-wide h-14 rounded-xl"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                autoFocus
              />
            </div>
          </div>
          
          <Button 
            type="submit" 
            className="w-full h-14 text-base" 
            disabled={phone.length < 10 || isSending}
          >
            {isSending ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Send Verification Code'}
          </Button>
        </form>
      ) : (
        <form onSubmit={handleVerifyOtp} className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
          <div className="space-y-4">
            <Label>Enter 6-digit code sent to +91 {phone}</Label>
            <div className="flex justify-between gap-2">
              {otp.map((digit, i) => (
                <Input
                  key={i}
                  id={`otp-${i}`}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleOtpChange(i, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(i, e)}
                  className="w-12 h-14 md:w-14 md:h-16 text-center text-xl font-bold rounded-xl"
                  autoFocus={i === 0}
                />
              ))}
            </div>
          </div>
          
          <div className="space-y-4">
            <Button 
              type="submit" 
              className="w-full h-14 text-base group"
              disabled={otp.join('').length < 6 || isVerifying}
            >
              {isVerifying ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  Verify & Continue
                  <ArrowRight className="w-5 h-5 ml-2 transition-transform group-hover:translate-x-1" />
                </>
              )}
            </Button>
            
            <div className="text-center">
              <button
                type="button"
                onClick={handleSendOtp}
                disabled={cooldown > 0}
                className="text-sm font-medium text-blue-600 hover:text-blue-800 disabled:text-slate-400 transition-colors"
              >
                {cooldown > 0 ? `Resend code in 00:${cooldown.toString().padStart(2, '0')}` : 'Resend Code'}
              </button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
