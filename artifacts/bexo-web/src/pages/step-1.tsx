import React, { useState, useEffect, useRef } from 'react';
import { useOnboarding } from '../context/OnboardingContext';
import { Input, Label } from '../design-system/primitives';
import { Loader2, ArrowRight } from 'lucide-react';
import { useLocation } from 'wouter';
import { FaWhatsapp } from 'react-icons/fa';
import { apiUrl } from '../lib/api';
import { AuthBackgroundVideo } from '../components/AuthBackgroundVideo';

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

  const getFormattedPhone = (raw: string) => {
    const digits = raw.replace(/\D/g, '');
    if (digits.length === 10) return `91${digits}`;
    if (digits.length === 12 && digits.startsWith('91')) return digits;
    return digits;
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      setPhoneError('Please enter a valid 10-digit mobile number.');
      return;
    }
    setPhoneError('');
    setIsSwooshingSend(true);
    
    try {
      const formattedPhone = getFormattedPhone(phone);
      
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
      const formattedPhone = getFormattedPhone(phone);
      
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
    if (isSubmittingOtp.current) return;
    const otpCode = otp.join('');
    if (otpCode.length < 6) {
      setOtpError('Please enter the complete 6-digit verification code.');
      return;
    }
    await verifyOtpCode(otpCode);
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 12);
    setPhone(val);
    if (val.length >= 10) setPhoneError('');
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
    if (otpCode.length === 6 && !isSubmittingOtp.current) {
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
    <div className="relative min-h-full w-full flex flex-col justify-center items-center py-6 sm:py-10 min-w-0">
      {/* Background Video layer */}
      <AuthBackgroundVideo />

      <div className="relative z-10 flex flex-col h-full justify-center max-w-md w-full mx-auto min-w-0">
        <div className="mb-6 text-center">
          <h1 className="font-serif text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-2 tracking-tight drop-shadow-md">
            Welcome to BEXO
          </h1>
          <p className="text-slate-300 text-sm sm:text-base leading-relaxed max-w-xs mx-auto">
            Let's start by verifying your mobile number. We'll send a secure code via WhatsApp.
          </p>
        </div>

        <div className="p-5 sm:p-8 bg-slate-900/65 border border-white/15 shadow-2xl rounded-3xl backdrop-blur-2xl text-white">
          {step === 'phone' ? (
            <form onSubmit={handleSendOtp} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="phone" className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  Mobile Number
                </Label>
                <div className="flex relative items-center">
                  <span className="absolute left-4 text-slate-400 font-semibold text-sm select-none">+91</span>
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="98765 43210"
                    className={`pl-13 h-13 rounded-2xl bg-slate-950/80 border-slate-700/80 text-white text-base font-medium tracking-wide placeholder:text-slate-500 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/25 transition-all ${phoneError ? "border-rose-500 focus:ring-rose-500/30" : ""}`}
                    value={phone}
                    onChange={handlePhoneChange}
                    autoFocus
                  />
                </div>
                {phoneError && <p className="text-rose-400 text-xs font-semibold mt-1">{phoneError}</p>}
              </div>
              
              <button 
                type="submit" 
                className={`w-full h-13 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white rounded-2xl font-bold text-sm transition-all duration-200 flex items-center justify-center gap-3 disabled:opacity-50 disabled:pointer-events-none cursor-pointer shadow-xl shadow-indigo-600/30 px-6 active:scale-[0.99]${isSwooshingSend ? ' is-swooshing' : ''}`}
                disabled={phone.length < 10 || isSending || isSwooshingSend}
              >
                {isSending ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <div className="w-8 h-8 bg-white/10 rounded-xl flex items-center justify-center shrink-0">
                      <ArrowRight className="w-4 h-4 text-white" />
                    </div>
                    <span className="btn-label font-bold">Send Verification Code</span>
                  </>
                )}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <Label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                    Enter Verification Code
                  </Label>
                  <button
                    type="button"
                    onClick={() => setStep('phone')}
                    className="text-xs font-bold text-indigo-400 hover:text-indigo-300 transition-colors"
                  >
                    Edit Number
                  </button>
                </div>

                <p className="text-xs text-slate-300 leading-relaxed">
                  Sent a 6-digit OTP to <span className="font-bold text-white">+91 {phone}</span>
                </p>

                <div className="flex items-center gap-2.5 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 backdrop-blur-md px-3.5 py-2.5 text-xs font-medium text-emerald-300">
                  <FaWhatsapp className="h-4 w-4 text-emerald-400 shrink-0" aria-hidden="true" />
                  <span>Check WhatsApp. Your OTP is sent through WhatsApp.</span>
                </div>
                <div className="grid grid-cols-6 gap-2 sm:gap-3 pt-1">
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
                      className={`h-12 sm:h-14 min-w-0 w-full text-center text-lg sm:text-xl font-bold rounded-2xl bg-slate-950/80 border-slate-700/80 text-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/30 transition-all ${otpError ? "border-rose-500 focus:ring-rose-500/30" : ""}`}
                      autoFocus={i === 0}
                    />
                  ))}
                </div>
                {otpError && <p className="text-rose-400 text-xs font-semibold mt-1">{otpError}</p>}
              </div>
              
              <div className="space-y-4">
                <button 
                  type="submit" 
                  className={`w-full h-13 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white rounded-2xl font-bold text-sm transition-all duration-200 flex items-center justify-center gap-3 disabled:opacity-50 disabled:pointer-events-none cursor-pointer shadow-xl shadow-indigo-600/30 px-6 active:scale-[0.99]${isSwooshingVerify ? ' is-swooshing' : ''}`}
                  disabled={otp.join('').length < 6 || isVerifying || isSwooshingVerify}
                >
                  {isVerifying ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <div className="w-8 h-8 bg-white/10 rounded-xl flex items-center justify-center shrink-0">
                        <ArrowRight className="w-4 h-4 text-white" />
                      </div>
                      <span className="btn-label font-bold">Verify & Continue</span>
                    </>
                  )}
                </button>
                
                <div className="text-center">
                  <button
                    type="button"
                    onClick={handleSendOtp}
                    disabled={cooldown > 0}
                    className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 disabled:text-slate-400 transition-colors"
                  >
                    {cooldown > 0 ? `Resend code in 00:${cooldown.toString().padStart(2, '0')}` : 'Resend Code'}
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
