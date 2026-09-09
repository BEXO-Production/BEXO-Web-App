import React, { useState, useEffect, useRef } from 'react';
import { useOnboarding } from '../context/OnboardingContext';
import { Input, Label } from '../design-system/primitives';
import { Loader2, ArrowRight, ShieldCheck, MessageSquare } from 'lucide-react';
import { useLocation } from 'wouter';
import { apiUrl } from '../lib/api';
import { OTP_LENGTH } from '../lib/otp';
import { sendWidgetOtp, verifyWidgetOtp } from '../lib/msg91Widget';

/**
 * Step 1 — phone verification inside the cinematic onboarding shell.
 * Light form chrome (panel already frosted over Unsplash atmosphere).
 */
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
  const [otp, setOtp] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [isSending, setIsSending] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [phoneError, setPhoneError] = useState('');
  const [otpError, setOtpError] = useState('');
  const [isSwooshingSend, setIsSwooshingSend] = useState(false);
  const [isSwooshingVerify, setIsSwooshingVerify] = useState(false);
  const isSubmittingOtp = useRef(false);
  const reqIdRef = useRef<string | undefined>(undefined);

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
    if (cleanPhone.length !== 10) {
      setPhoneError('Please enter a valid 10-digit mobile number.');
      return;
    }
    setPhoneError('');
    setIsSwooshingSend(true);

    try {
      const formattedPhone = getFormattedPhone(phone);
      const { reqId } = await sendWidgetOtp(formattedPhone);
      reqIdRef.current = reqId;

      setIsSwooshingSend(false);
      setStep('otp');
      setCooldown(30);
    } catch (err: any) {
      setIsSwooshingSend(false);
      const msg = String(err?.message || '');
      setPhoneError(
        /load failed|failed to fetch|networkerror/i.test(msg)
          ? 'Could not reach the server. Check your connection and try again.'
          : msg || 'Failed to send OTP. Please try again.',
      );
    } finally {
      setIsSending(false);
    }
  };

  const verifyOtpCode = async (otpCode: string) => {
    if (isSubmittingOtp.current || otpCode.length !== OTP_LENGTH || !/^\d+$/.test(otpCode)) return;
    isSubmittingOtp.current = true;
    setOtpError('');
    setIsVerifying(true);
    setIsSwooshingVerify(true);

    try {
      const formattedPhone = getFormattedPhone(phone);
      const widgetToken = await verifyWidgetOtp(otpCode, reqIdRef.current);

      const res = await fetch(apiUrl('/api/auth/phone/widget-verify'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ widgetToken }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Invalid OTP');
      }

      const responseData = await res.json();
      localStorage.setItem('token', responseData.accessToken);
      setToken(responseData.accessToken);
      updateData({ phone: formattedPhone });
      setIsSwooshingVerify(false);

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
    if (otpCode.length < OTP_LENGTH) {
      setOtpError(`Please enter the complete ${OTP_LENGTH}-digit verification code.`);
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
    digits.slice(0, OTP_LENGTH - index).split('').forEach((digit, offset) => {
      newOtp[index + offset] = digit;
    });
    if (!digits) newOtp[index] = '';
    setOtp(newOtp);
    setOtpError('');

    const nextIndex = Math.min(index + Math.max(digits.length, 1), OTP_LENGTH - 1);
    window.requestAnimationFrame(() => document.getElementById(`otp-${nextIndex}`)?.focus());

    const otpCode = newOtp.join('');
    if (otpCode.length === OTP_LENGTH && !isSubmittingOtp.current) {
      verifyOtpCode(otpCode);
    }
  };

  const handlePaste = (index: number, e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedDigits = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LENGTH - index);
    if (!pastedDigits) return;

    const newOtp = [...otp];
    pastedDigits.split('').forEach((digit, offset) => {
      newOtp[index + offset] = digit;
    });
    setOtp(newOtp);
    setOtpError('');

    const otpCode = newOtp.join('');
    const nextIndex = Math.min(index + pastedDigits.length, OTP_LENGTH - 1);
    window.requestAnimationFrame(() => document.getElementById(`otp-${nextIndex}`)?.focus());
    if (otpCode.length === OTP_LENGTH) verifyOtpCode(otpCode);
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      document.getElementById(`otp-${index - 1}`)?.focus();
    }
  };

  const fieldClass =
    'h-12 rounded-2xl border border-slate-200 bg-white text-slate-900 text-base font-medium placeholder:text-slate-400 shadow-sm focus:border-sky-400 focus:ring-2 focus:ring-sky-200/80';
  const otpClass =
    'h-12 min-w-0 w-full text-center text-lg font-bold rounded-xl border border-slate-200 bg-white text-slate-900 shadow-sm focus:border-sky-400 focus:ring-2 focus:ring-sky-200/80 focus:scale-[1.03] transition-transform';
  const primaryBtn =
    'w-full min-h-12 rounded-2xl font-bold text-sm text-white flex items-center justify-center gap-2 cursor-pointer disabled:opacity-45 disabled:pointer-events-none bg-gradient-to-r from-sky-500 via-blue-500 to-indigo-500 shadow-[0_12px_28px_-10px_rgba(56,189,248,0.55)] transition-[transform,filter] hover:brightness-110 active:scale-[0.985]';

  return (
    <div className="flex flex-col flex-1 justify-center w-full max-w-md mx-auto min-w-0 py-2">
      <div className="mb-5 space-y-1.5">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-sky-600">
          SMS secure entry
        </p>
        <h1 className="font-serif text-[1.55rem] font-bold text-slate-900 tracking-tight leading-tight">
          {step === 'phone' ? 'Verify your number' : 'Enter your code'}
        </h1>
        <p className="text-sm text-slate-500 leading-relaxed">
          {step === 'phone'
            ? 'We send a one-time code by SMS — no passwords to remember.'
            : `${OTP_LENGTH}-digit code sent to +91 ${phone}`}
        </p>
      </div>

      {step === 'phone' ? (
        <form onSubmit={handleSendOtp} className="space-y-5">
          <div className="space-y-2">
            <div className="flex items-end justify-between gap-2">
              <Label htmlFor="phone" className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.12em]">
                Mobile Number
              </Label>
              <span className="text-[10px] font-semibold text-slate-400">India · +91</span>
            </div>
            <div className="relative flex items-center">
              <span className="absolute left-4 text-slate-400 font-semibold text-sm select-none">+91</span>
              <Input
                id="phone"
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                maxLength={10}
                placeholder="10-digit number"
                className={`pl-13 ${fieldClass}${phoneError ? ' border-rose-400 focus:ring-rose-200' : ''}`}
                value={phone}
                onChange={handlePhoneChange}
                autoFocus
              />
            </div>
            {phoneError && <p className="text-rose-500 text-xs font-semibold">{phoneError}</p>}
          </div>

          <button
            type="submit"
            className={primaryBtn}
            disabled={phone.length !== 10 || isSending || isSwooshingSend}
          >
            {isSwooshingSend || isSending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Sending…
              </>
            ) : (
              <>
                <span>Send Verification Code</span>
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/15">
                  <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </>
            )}
          </button>

          <p className="text-center text-[11px] text-slate-400 leading-relaxed px-1">
            Already have an account?{' '}
            <a href="/login" className="font-semibold text-sky-600 hover:text-sky-700">
              Sign in
            </a>
          </p>
        </form>
      ) : (
        <form onSubmit={handleVerifyOtp} className="space-y-5 animate-in fade-in slide-in-from-right-2 duration-300">
          <div className="flex items-center gap-2.5 rounded-2xl border border-sky-200 bg-sky-50 px-3.5 py-3 text-xs font-medium text-sky-800">
            <MessageSquare className="h-4 w-4 text-sky-600 shrink-0" aria-hidden="true" />
            <span>Check your SMS inbox — your code is waiting.</span>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between items-center gap-3">
              <Label className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.12em]">
                Verification Code
              </Label>
              <button
                type="button"
                onClick={() => setStep('phone')}
                className="text-xs font-bold text-sky-600 hover:text-sky-700 min-h-10"
              >
                Edit Number
              </button>
            </div>

            {/* Static class so Tailwind picks it up — see OTP_LENGTH doc comment */}
            <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
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
                  className={`${otpClass}${otpError ? ' border-rose-400' : ''}`}
                  autoFocus={i === 0}
                />
              ))}
            </div>
            {otpError && <p className="text-rose-500 text-xs font-semibold">{otpError}</p>}
          </div>

          <button
            type="submit"
            className={primaryBtn}
            disabled={otp.join('').length < OTP_LENGTH || isVerifying || isSwooshingVerify}
          >
            {isVerifying || isSwooshingVerify ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Verifying…
              </>
            ) : (
              <>
                <span>Verify & Continue</span>
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/15">
                  <ShieldCheck className="w-3.5 h-3.5" />
                </span>
              </>
            )}
          </button>

          <div className="text-center">
            <button
              type="button"
              onClick={handleSendOtp}
              disabled={cooldown > 0}
              className="text-xs font-bold text-sky-600 hover:text-sky-700 disabled:text-slate-400 disabled:pointer-events-none tabular-nums min-h-10"
            >
              {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend Code'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
