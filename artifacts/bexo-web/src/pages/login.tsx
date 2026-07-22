import React, { useState, useEffect, useRef } from 'react';
import { useOnboarding } from '../context/OnboardingContext';
import { useLocation } from 'wouter';
import { Input, Label } from '../design-system/primitives';
import { Loader2, ArrowRight, ShieldCheck } from 'lucide-react';
import { FaWhatsapp } from 'react-icons/fa';
import { usePageSeo } from '../hooks/use-page-seo';
import { apiUrl } from '../lib/api';
import { PLATFORM_DOMAIN, resolveMarketingOrigin } from '../lib/platform';
import { track } from '../lib/track';
import { AuthBackgroundVideo } from '../components/AuthBackgroundVideo';
import { BrandLogo } from '../components/BrandLogo';
import {
  AuthGlassCard,
  authFieldClass,
  authGhostLinkClass,
  authOtpClass,
  authPrimaryBtnClass,
} from '../components/AuthGlassCard';

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
    if (cleanPhone.length !== 10) {
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
    <div className="relative min-h-[100dvh] w-full overflow-x-hidden bg-[#05070f] flex flex-col justify-end sm:justify-center items-center px-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-4 sm:py-8">
      <AuthBackgroundVideo />

      {/* Soft ambient depth — kept light so the film stays the hero */}
      <div aria-hidden className="pointer-events-none absolute inset-0 z-[1] overflow-hidden">
        <div className="absolute -top-20 right-[-12%] h-52 w-52 rounded-full bg-sky-400/12 blur-3xl" />
        <div className="absolute bottom-[12%] -left-12 h-44 w-44 rounded-full bg-indigo-500/10 blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-md space-y-4 sm:space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-700 min-w-0 mb-1 sm:mb-0">
        <div className="flex items-center justify-between gap-2 px-0.5">
          <a
            href={resolveMarketingOrigin()}
            className="text-[11px] font-semibold text-white/85 hover:text-white transition-colors duration-150 inline-flex min-h-10 items-center px-3 py-1.5 rounded-full bg-white/10 border border-white/20 backdrop-blur-xl shadow-[inset_0_1px_0_0_rgba(255,255,255,0.22)]"
          >
            ← Home
          </a>
          <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-sky-100/95 rounded-full border border-white/20 bg-white/10 px-2.5 py-1 backdrop-blur-md shadow-[inset_0_1px_0_0_rgba(255,255,255,0.18)]">
            Your stage awaits
          </span>
        </div>

        <div className="flex flex-col items-center gap-3 text-center">
          <BrandLogo size="xl" glow />
          <div className="space-y-2 px-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-sky-200/90">
              Ace Digital · BEXO
            </p>
            <h1 className="text-[1.85rem] sm:text-[2.1rem] font-bold font-serif text-white tracking-tight leading-[1.05] drop-shadow-[0_4px_24px_rgba(0,0,0,0.45)]">
              Sign in to your<br className="sm:hidden" /> next opportunity
            </h1>
            <p className="text-[12px] sm:text-[13px] text-white/72 max-w-[18rem] sm:max-w-xs mx-auto leading-relaxed">
              Verify with WhatsApp, then publish on{" "}
              <span className="font-semibold text-sky-200">
                yourname.
                {PLATFORM_DOMAIN === "localhost" ? "atbexo.com" : PLATFORM_DOMAIN}
              </span>
            </p>
          </div>
        </div>

        <AuthGlassCard>
          {step === 'phone' ? (
            <form onSubmit={handleSendOtp} className="space-y-5">
              <div className="space-y-2.5">
                <div className="flex items-end justify-between gap-2">
                  <Label htmlFor="phone" className="text-[11px] font-bold text-white/70 uppercase tracking-[0.14em]">
                    Mobile Number
                  </Label>
                  <span className="text-[10px] font-semibold text-white/45">India · +91</span>
                </div>
                <div className="relative flex items-center">
                  <span className="absolute left-4 text-white/55 font-semibold text-sm select-none">+91</span>
                  <Input
                    id="phone"
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel-national"
                    maxLength={10}
                    placeholder="10-digit number"
                    value={phone}
                    onChange={handlePhoneChange}
                    className={`pl-13 min-h-12 text-[16px] ${authFieldClass}`}
                    disabled={isSwooshingSend}
                    required
                  />
                </div>
                {phoneError && (
                  <p className="text-xs font-semibold text-rose-300">{phoneError}</p>
                )}
              </div>

              <button
                type="submit"
                disabled={isSwooshingSend || phone.length !== 10}
                className={authPrimaryBtnClass}
              >
                {isSwooshingSend ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Sending…
                  </>
                ) : (
                  <>
                    <span>Get Verification Code</span>
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/15">
                      <ArrowRight className="w-4 h-4" />
                    </span>
                  </>
                )}
              </button>

              <p className="text-center text-[10px] leading-relaxed text-white/45 px-2">
                By continuing you agree to receive a one-time WhatsApp code. No spam — just access.
              </p>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="space-y-5 animate-in fade-in slide-in-from-right-2 duration-300">
              <div className="space-y-3.5">
                <div className="flex justify-between items-center gap-3">
                  <Label className="text-[11px] font-bold text-white/70 uppercase tracking-[0.14em]">
                    Verification Code
                  </Label>
                  <button
                    type="button"
                    onClick={() => setStep('phone')}
                    className={authGhostLinkClass}
                  >
                    Edit Number
                  </button>
                </div>

                <p className="text-xs text-white/70 leading-relaxed">
                  6-digit OTP sent to{" "}
                  <span className="font-semibold text-white">+91 {phone}</span>
                </p>

                <div className="flex items-center gap-2.5 rounded-2xl border border-emerald-300/25 bg-emerald-400/10 px-3.5 py-3 text-xs font-medium text-emerald-100 backdrop-blur-md shadow-[inset_0_1px_0_0_rgba(255,255,255,0.12)]">
                  <FaWhatsapp className="h-4 w-4 text-emerald-300 shrink-0" aria-hidden="true" />
                  <span>Open WhatsApp — your code is waiting.</span>
                </div>

                <div className="grid grid-cols-6 gap-1.5 sm:gap-2.5 pt-0.5">
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
                      className={`min-h-12 text-[16px] ${authOtpClass}`}
                      required
                    />
                  ))}
                </div>
                {otpError && (
                  <p className="text-xs font-semibold text-rose-300">{otpError}</p>
                )}
              </div>

              <button
                type="submit"
                disabled={isSwooshingVerify}
                className={authPrimaryBtnClass}
              >
                {isSwooshingVerify ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Verifying…
                  </>
                ) : (
                  <>
                    <span>Verify & Continue</span>
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/15">
                      <ShieldCheck className="w-4 h-4" />
                    </span>
                  </>
                )}
              </button>

              <div className="text-center">
                {cooldown > 0 ? (
                  <p className="text-xs text-white/50 font-semibold select-none tabular-nums">
                    Resend in {cooldown}s
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={handleSendOtp}
                    className={authGhostLinkClass}
                  >
                    Resend code
                  </button>
                )}
              </div>
            </form>
          )}
        </AuthGlassCard>
      </div>
    </div>
  );
}

