import React, { useState, useEffect, useRef } from 'react';
import { useOnboarding } from '../context/OnboardingContext';
import { useLocation } from 'wouter';
import { Input, Label, Card } from '../design-system/primitives';
import { Loader2, ArrowRight, ShieldCheck } from 'lucide-react';
import { FaWhatsapp } from 'react-icons/fa';
import logo from '../assets/bexo-logo.png';
import { usePageSeo } from '../hooks/use-page-seo';
import { apiUrl } from '../lib/api';

export default function Login() {
  const { updateData, setToken } = useOnboarding();
  const [, setLocation] = useLocation();
  
  const [phone, setPhone] = useState('');
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

  usePageSeo({
    title: "Sign in to BEXO",
    description: "Sign in to BEXO to edit your portfolio, templates, and subdomain on mybexo.cyou.",
    noindex: true,
  });

  useEffect(() => {
    let timer: number;
    if (cooldown > 0) {
      timer = window.setInterval(() => setCooldown(c => c - 1), 1000);
    }
    return () => clearInterval(timer);
  }, [cooldown]);

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const claim = (params.get('claim') || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 48);
      if (claim) localStorage.setItem('bexo_claim_handle', claim);
    } catch {
      /* ignore */
    }
  }, []);

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
      
      // Sync phone info to context
      updateData({ phone: formattedPhone });

      // Routing gate: OTP is verified here, so incomplete users resume after verification.
      sessionStorage.setItem('showLoginToast', 'true');
      if (responseData.hasCompletedOnboarding) {
        setLocation('/dashboard');
      } else {
        setLocation('/step/2');
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
    window.requestAnimationFrame(() => document.getElementById(`login-otp-${nextIndex}`)?.focus());

    // Auto-submit OTP when fully entered (6 digits)
    const otpCode = newOtp.join('');
    if (otpCode.length === 6) {
      verifyOtpCode(otpCode);
    }
  };

  const handlePaste = (index: number, e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedDigits = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6 - index);
    if (!pastedDigits) return;

    const newOtp = [...otp];
    pastedDigits.split('').forEach((digit, offset) => {
      newOtp[index + offset] = digit;
    });
    setOtp(newOtp);
    setOtpError('');

    const otpCode = newOtp.join('');
    const nextIndex = Math.min(index + pastedDigits.length, 5);
    window.requestAnimationFrame(() => document.getElementById(`login-otp-${nextIndex}`)?.focus());
    if (otpCode.length === 6) verifyOtpCode(otpCode);
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      const prevInput = document.getElementById(`login-otp-${index - 1}`);
      prevInput?.focus();
    }
  };

  return (
    <div className="min-h-[100dvh] w-full overflow-x-hidden bg-slate-50 flex flex-col justify-center items-center px-3 py-6 sm:p-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <div className="w-full max-w-md space-y-6 sm:space-y-8 animate-in fade-in slide-in-from-bottom duration-300 min-w-0">
        <div className="text-center">
          <a href="/" className="text-xs font-semibold text-slate-400 hover:text-slate-700 transition-colors inline-flex min-h-11 items-center">
            ← Back to BEXO
          </a>
        </div>
        {/* Logo area */}
        <div className="flex flex-col items-center gap-3">
          <img src={logo} alt="BEXO" className="h-10 object-contain select-none" />
          <h2 className="text-xl font-bold font-serif text-slate-900 tracking-tight text-center">
            Sign in to BEXO
          </h2>
          <p className="text-xs text-slate-500 text-center max-w-xs px-1">
            BEXO by Ace Digital — sign in to edit your portfolio, templates, and subdomain.{" "}
            <a href="/" className="text-indigo-600 hover:underline">Return to public home</a>.
          </p>
        </div>

        {/* Login Card */}
        <Card className="p-4 sm:p-6 bg-white border border-slate-200/80 shadow-lg rounded-2xl relative overflow-hidden min-w-0">
          {step === 'phone' ? (
            <form onSubmit={handleSendOtp} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="phone" className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Mobile Number
                </Label>
                <div className="relative flex items-center">
                  <span className="absolute left-4 text-slate-500 font-medium text-sm select-none">+91</span>
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="Enter 10-digit number"
                    value={phone}
                    onChange={handlePhoneChange}
                    className="pl-12 h-12 rounded-xl text-sm font-medium tracking-wide"
                    disabled={isSwooshingSend}
                    required
                  />
                </div>
                {phoneError && (
                  <p className="text-xs font-semibold text-rose-500">{phoneError}</p>
                )}
              </div>

              <button
                type="submit"
                disabled={isSwooshingSend || phone.length < 10}
                className="w-full h-12 bg-indigo-600 text-white hover:bg-indigo-700 transition-all rounded-xl font-bold text-sm shadow-md flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isSwooshingSend ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Sending OTP...
                  </>
                ) : (
                  <>
                    Get Verification Code <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="space-y-6">
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <Label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                    Enter Verification Code
                  </Label>
                  <button
                    type="button"
                    onClick={() => setStep('phone')}
                    className="text-xs font-bold text-indigo-600 hover:text-indigo-800"
                  >
                    Edit Number
                  </button>
                </div>
                
                <p className="text-xs text-slate-500 leading-normal">
                  Sent a 6-digit OTP to <span className="font-semibold text-slate-800">+91 {phone}</span>
                </p>
                <div className="flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
                  <FaWhatsapp className="h-4 w-4 text-emerald-500" aria-hidden="true" />
                  <span>Check WhatsApp. Your OTP is sent through WhatsApp.</span>
                </div>

                <div className="grid grid-cols-6 gap-2 pt-2 sm:gap-3">
                  {otp.map((digit, idx) => (
                    <Input
                      key={idx}
                      id={`login-otp-${idx}`}
                      type="text"
                      inputMode="numeric"
                      pattern="\d*"
                      maxLength={1}
                      autoComplete={idx === 0 ? 'one-time-code' : 'off'}
                      value={digit}
                      onChange={e => handleOtpChange(idx, e.target.value)}
                      onKeyDown={e => handleKeyDown(idx, e)}
                      onPaste={e => handlePaste(idx, e)}
                      aria-label={`Verification code digit ${idx + 1}`}
                      className="h-12 min-w-0 w-full text-center text-lg font-bold rounded-xl bg-slate-50 border-slate-200 sm:h-14"
                      required
                    />
                  ))}
                </div>
                {otpError && (
                  <p className="text-xs font-semibold text-rose-500">{otpError}</p>
                )}
              </div>

              <button
                type="submit"
                disabled={isSwooshingVerify}
                className="w-full h-12 bg-indigo-600 text-white hover:bg-indigo-700 transition-all rounded-xl font-bold text-sm shadow-md flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isSwooshingVerify ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Verifying...
                  </>
                ) : (
                  <>
                    Verify & Continue <ShieldCheck className="w-4.5 h-4.5" />
                  </>
                )}
              </button>

              <div className="text-center pt-2">
                {cooldown > 0 ? (
                  <p className="text-xs text-slate-400 font-semibold select-none">
                    Resend code in {cooldown}s
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={handleSendOtp}
                    className="text-xs font-bold text-indigo-600 hover:text-indigo-800"
                  >
                    Resend Verification Code
                  </button>
                )}
              </div>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}
