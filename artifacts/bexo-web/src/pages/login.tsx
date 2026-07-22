import React, { useState, useEffect, useRef } from 'react';
import { useOnboarding } from '../context/OnboardingContext';
import { useLocation } from 'wouter';
import { Input, Label, Card } from '../design-system/primitives';
import { Loader2, ArrowRight, ShieldCheck, Sparkles } from 'lucide-react';
import { FaWhatsapp } from 'react-icons/fa';
import logo from '../assets/bexo-logo.png';
import { usePageSeo } from '../hooks/use-page-seo';
import { apiUrl } from '../lib/api';
import { PLATFORM_DOMAIN } from '../lib/platform';
import { track } from '../lib/track';
import { AuthBackgroundVideo } from '../components/AuthBackgroundVideo';

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
    description: `Sign in to BEXO to edit your portfolio, templates, and subdomain on ${PLATFORM_DOMAIN}.`,
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
      track('login_success', { hasCompletedOnboarding: !!responseData.hasCompletedOnboarding });
      
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
    window.requestAnimationFrame(() => document.getElementById(`login-otp-${nextIndex}`)?.focus());

    // Auto-submit OTP when fully entered (6 digits)
    const otpCode = newOtp.join('');
    if (otpCode.length === 6 && !isSubmittingOtp.current) {
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
    <div className="relative min-h-[100dvh] w-full overflow-x-hidden bg-slate-950 flex flex-col justify-center items-center px-3 py-6 sm:p-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      {/* Loop background video across web & mobile */}
      <AuthBackgroundVideo />

      <div className="relative z-10 w-full max-w-md space-y-6 sm:space-y-8 animate-in fade-in slide-in-from-bottom duration-500 min-w-0">
        <div className="text-center">
          <a href="/" className="text-xs font-semibold text-slate-300 hover:text-white transition-colors inline-flex min-h-11 items-center px-3 py-1.5 rounded-full bg-white/5 border border-white/10 backdrop-blur-md">
            ← Return to BEXO
          </a>
        </div>

        {/* Logo area */}
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="p-3 rounded-2xl bg-slate-900/60 border border-white/10 backdrop-blur-xl shadow-xl">
            <img src={logo} alt="BEXO" className="h-9 object-contain select-none filter drop-shadow" />
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold font-serif text-white tracking-tight drop-shadow-md">
            Sign in to BEXO
          </h2>
          <p className="text-xs text-slate-300 max-w-xs px-1 leading-relaxed">
            Manage your portfolio, templates, and custom subdomain on <span className="font-semibold text-indigo-300">{PLATFORM_DOMAIN}</span>.
          </p>
        </div>

        {/* Glassmorphic Login Card */}
        <Card className="p-5 sm:p-8 bg-slate-900/65 border border-white/15 shadow-2xl rounded-3xl backdrop-blur-2xl relative overflow-hidden min-w-0 text-white">
          {step === 'phone' ? (
            <form onSubmit={handleSendOtp} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="phone" className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  Mobile Number
                </Label>
                <div className="relative flex items-center">
                  <span className="absolute left-4 text-slate-400 font-semibold text-sm select-none">+91</span>
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="Enter 10-digit number"
                    value={phone}
                    onChange={handlePhoneChange}
                    className="pl-13 h-13 rounded-2xl bg-slate-950/80 border-slate-700/80 text-white text-base font-medium tracking-wide placeholder:text-slate-500 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/25 transition-all"
                    disabled={isSwooshingSend}
                    required
                  />
                </div>
                {phoneError && (
                  <p className="text-xs font-semibold text-rose-400">{phoneError}</p>
                )}
              </div>

              <button
                type="submit"
                disabled={isSwooshingSend || phone.length < 10}
                className="w-full h-13 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white transition-all rounded-2xl font-bold text-sm shadow-xl shadow-indigo-600/30 flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer active:scale-[0.99]"
              >
                {isSwooshingSend ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Sending OTP...
                  </>
                ) : (
                  <>
                    <span>Get Verification Code</span> <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="space-y-6">
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
                  <span>Check WhatsApp. Your OTP code is delivered to WhatsApp.</span>
                </div>

                <div className="grid grid-cols-6 gap-2 sm:gap-3 pt-2">
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
                      className="h-12 sm:h-14 min-w-0 w-full text-center text-lg sm:text-xl font-bold rounded-2xl bg-slate-950/80 border-slate-700/80 text-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/30 transition-all"
                      required
                    />
                  ))}
                </div>
                {otpError && (
                  <p className="text-xs font-semibold text-rose-400">{otpError}</p>
                )}
              </div>

              <button
                type="submit"
                disabled={isSwooshingVerify}
                className="w-full h-13 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white transition-all rounded-2xl font-bold text-sm shadow-xl shadow-indigo-600/30 flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer active:scale-[0.99]"
              >
                {isSwooshingVerify ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Verifying...
                  </>
                ) : (
                  <>
                    <span>Verify & Continue</span> <ShieldCheck className="w-4.5 h-4.5" />
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
                    className="text-xs font-bold text-indigo-400 hover:text-indigo-300 transition-colors"
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

