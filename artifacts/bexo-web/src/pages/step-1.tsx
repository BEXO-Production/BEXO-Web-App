import React, { useState, useEffect, useRef } from 'react';
import { useOnboarding } from '../context/OnboardingContext';
import { Input, Label } from '../design-system/primitives';
import { Loader2, ArrowRight } from 'lucide-react';
import { useLocation } from 'wouter';
import { FaWhatsapp } from 'react-icons/fa';
import { apiUrl } from '../lib/api';

export default function Step1Phone() {
  const { data, updateData, nextStep, setToken } = useOnboarding();
  const [, setLocation] = useLocation();

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      setLocation('/step/2');
    }
  }, [setLocation]);

  const [phone, setPhone] = useState(data.phone);
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [isSending, setIsSending] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [phoneError, setPhoneError] = useState('');
  const [otpError, setOtpError] = useState('');
  const [isSwooshingSend, setIsSwooshingSend] = useState(false);
  const [isSwooshingVerify, setIsSwooshingVerify] = useState(false);
  const isSubmittingOtp = useRef(false);

  useEffect(() => {
    let timer: number;
    if (cooldown > 0) {
      timer = window.setInterval(() => setCooldown(c => c - 1), 1000);
    }
    return () => clearInterval(timer);
  }, [cooldown]);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (phone.length < 10) {
      setPhoneError('Please enter a valid 10-digit mobile number.');
      return;
    }
    setPhoneError('');
    setIsSwooshingSend(true);
    
    try {
      const formattedPhone = phone.startsWith('91') && phone.length > 10 ? phone : `91${phone}`;
      
      const res = await fetch(apiUrl('/api/auth/phone/otp'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: formattedPhone })
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to send OTP');
      }
      
      setIsSwooshingSend(false);
      setStep('otp');
      setCooldown(30);
    } catch (err: any) {
      setIsSwooshingSend(false);
      const msg = String(err?.message || '');
      setPhoneError(
        /load failed|failed to fetch|networkerror/i.test(msg)
          ? 'Could not reach the server. Check your connection and try again.'
          : msg || 'Failed to send OTP. Please check your connection or try again later.',
      );
    }
  };

  const verifyOtpCode = async (otpCode: string) => {
    if (isSubmittingOtp.current || !/^\d{6}$/.test(otpCode)) return;
    isSubmittingOtp.current = true;
    setOtpError('');
    setIsVerifying(true);
    setIsSwooshingVerify(true);
    
    try {
      const formattedPhone = phone.startsWith('91') && phone.length > 10 ? phone : `91${phone}`;
      
      const res = await fetch(apiUrl('/api/auth/phone/otp/verify'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: formattedPhone, otp: otpCode })
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Invalid OTP');
      }
      
      const responseData = await res.json();
      localStorage.setItem('token', responseData.accessToken);
      setToken(responseData.accessToken);
      
      setIsSwooshingVerify(false);
      updateData({ phone: formattedPhone });
      if (responseData.hasCompletedOnboarding) {
        setLocation('/dashboard');
      } else {
        nextStep(1);
      }
    } catch (err: any) {
      const msg = String(err?.message || '');
      setOtpError(
        /load failed|failed to fetch|networkerror/i.test(msg)
          ? 'Could not reach the server. Check your connection and try again.'
          : msg || 'Verification failed. Please check your OTP.',
      );
    } finally {
      isSubmittingOtp.current = false;
      setIsVerifying(false);
      setIsSwooshingVerify(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const otpCode = otp.join('');
    if (otpCode.length < 6) {
      setOtpError('Please enter the complete 6-digit verification code.');
      return;
    }
    await verifyOtpCode(otpCode);
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 10);
    setPhone(val);
    if (val.length === 10) setPhoneError('');
  };

  const handleOtpChange = (index: number, value: string) => {
    const digits = value.replace(/\D/g, '');
    if (value && !digits) return;
    const newOtp = [...otp];
    digits.slice(0, 6 - index).split('').forEach((digit, offset) => {
      newOtp[index + offset] = digit;
    });
    if (!digits) newOtp[index] = '';
    setOtp(newOtp);
    setOtpError('');

    const nextIndex = Math.min(index + Math.max(digits.length, 1), 5);
    window.requestAnimationFrame(() => document.getElementById(`otp-${nextIndex}`)?.focus());

    // Auto-submit OTP when fully entered (6 digits)
    const otpCode = newOtp.join('');
    if (otpCode.length === 6) {
      verifyOtpCode(otpCode);
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      const prevInput = document.getElementById(`otp-${index - 1}`);
      prevInput?.focus();
    }
  };

  const handlePaste = (index: number, e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6 - index);
    if (!pastedData) return;

    const newOtp = [...otp];
    for (let i = 0; i < pastedData.length; i++) {
      newOtp[index + i] = pastedData[i];
    }
    setOtp(newOtp);
    setOtpError('');

    const focusIndex = Math.min(index + pastedData.length, 5);
    window.requestAnimationFrame(() => document.getElementById(`otp-${focusIndex}`)?.focus());
    const otpCode = newOtp.join('');
    if (otpCode.length === 6) verifyOtpCode(otpCode);
  };

  return (
    <div className="flex flex-col h-full justify-center max-w-md w-full mx-auto">
      <div className="mb-10 text-center md:text-left">
        <h1 className="font-serif text-2xl sm:text-3xl md:text-4xl font-bold text-slate-900 mb-3 tracking-tight">
          Welcome to BEXO
        </h1>
        <p className="text-slate-500 text-base md:text-lg">
          Let's start by verifying your phone number. We'll send you a secure code.
        </p>
      </div>

      {step === 'phone' ? (
        <form onSubmit={handleSendOtp} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="phone" className={phoneError ? "text-red-500" : ""}>Mobile Number</Label>
            <div className="flex relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-medium">+91</span>
              <Input
                id="phone"
                type="tel"
                placeholder="98765 43210"
                className={`pl-12 text-lg font-medium tracking-wide h-14 rounded-xl ${phoneError ? "border-red-500 focus-visible:ring-red-500" : ""}`}
                value={phone}
                onChange={handlePhoneChange}
                autoFocus
              />
            </div>
            {phoneError && <p className="text-red-500 text-sm mt-1">{phoneError}</p>}
          </div>
          
          <button 
            type="submit" 
            className={`w-full h-14 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl font-semibold text-base transition-all duration-200 flex items-center justify-center gap-3 group disabled:opacity-50 disabled:pointer-events-none cursor-pointer shadow-lg shadow-slate-900/20 btn-continue-wrap px-6${isSwooshingSend ? ' is-swooshing' : ''}`}
            disabled={phone.length < 10 || isSending || isSwooshingSend}
          >
            {isSending ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <div className="w-9 h-9 bg-indigo-500 rounded-xl flex items-center justify-center arrow-box shrink-0">
                  <ArrowRight className="w-5 h-5 text-white" />
                </div>
                <span className="btn-label">Send Verification Code</span>
              </>
            )}
          </button>
        </form>
      ) : (
        <form onSubmit={handleVerifyOtp} className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
          <div className="space-y-4">
            <Label className={otpError ? "text-red-500" : ""}>Enter 6-digit code sent to +91 {phone}</Label>
            <div className="flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
              <FaWhatsapp className="h-5 w-5 text-emerald-500" aria-hidden="true" />
              <span>Check WhatsApp. Your OTP is sent through WhatsApp.</span>
            </div>
            <div className="grid grid-cols-6 gap-2 sm:gap-3">
              {otp.map((digit, i) => (
                <Input
                  key={i}
                  id={`otp-${i}`}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  autoComplete={i === 0 ? 'one-time-code' : 'off'}
                  value={digit}
                  onChange={(e) => handleOtpChange(i, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(i, e)}
                  onPaste={(e) => handlePaste(i, e)}
                  aria-label={`Verification code digit ${i + 1}`}
                  className={`h-14 min-w-0 w-full text-center text-xl font-bold rounded-xl md:h-16 ${otpError ? "border-red-500 focus-visible:ring-red-500" : ""}`}
                  autoFocus={i === 0}
                />
              ))}
            </div>
            {otpError && <p className="text-red-500 text-sm mt-1">{otpError}</p>}
          </div>
          
          <div className="space-y-4">
            <button 
              type="submit" 
              className={`w-full h-14 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl font-semibold text-base transition-all duration-200 flex items-center justify-center gap-3 group disabled:opacity-50 disabled:pointer-events-none cursor-pointer shadow-lg shadow-slate-900/20 btn-continue-wrap px-6${isSwooshingVerify ? ' is-swooshing' : ''}`}
              disabled={otp.join('').length < 6 || isVerifying || isSwooshingVerify}
            >
              {isVerifying ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <div className="w-9 h-9 bg-indigo-500 rounded-xl flex items-center justify-center arrow-box shrink-0">
                    <ArrowRight className="w-5 h-5 text-white" />
                  </div>
                  <span className="btn-label">Verify & Continue</span>
                </>
              )}
            </button>
            
            <div className="text-center">
              <button
                type="button"
                onClick={handleSendOtp}
                disabled={cooldown > 0}
                className="text-sm font-medium text-indigo-500 hover:text-blue-800 disabled:text-slate-400 transition-colors"
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
