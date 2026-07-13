import React, { useState, useEffect } from 'react';
import { useOnboarding } from '../context/OnboardingContext';
import { useLocation } from 'wouter';
import { Input, Label, Card } from '../design-system/primitives';
import { Loader2, ArrowRight, ShieldCheck } from 'lucide-react';
import logo from '../assets/bexo-logo.png';

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
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5001';
      const formattedPhone = phone.startsWith('91') && phone.length > 10 ? phone : `91${phone}`;
      
      const res = await fetch(`${apiUrl}/api/auth/phone/otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: formattedPhone })
      });
      
      if (!res.ok) {
        throw new Error('Failed to send OTP');
      }
      
      setIsSwooshingSend(false);
      setStep('otp');
      setCooldown(30);
    } catch (err) {
      setIsSwooshingSend(false);
      setPhoneError('Failed to send OTP. Please check your connection or try again later.');
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const otpCode = otp.join('');
    if (otpCode.length < 6) {
      setOtpError('Please enter the complete 6-digit verification code.');
      return;
    }
    setOtpError('');
    setIsSwooshingVerify(true);
    
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5001';
      const formattedPhone = phone.startsWith('91') && phone.length > 10 ? phone : `91${phone}`;
      
      const res = await fetch(`${apiUrl}/api/auth/phone/otp/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: formattedPhone, otp: otpCode })
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Invalid OTP');
      }
      
      const responseData = await res.json();
      localStorage.setItem('token', responseData.accessToken);
      setToken(responseData.accessToken);
      
      setIsSwooshingVerify(false);
      
      // Sync phone info to context
      updateData({ phone: formattedPhone });

      // Routing Gate Logic: 
      // If user has completed onboarding, send to dashboard. Otherwise start onboarding step 1.
      sessionStorage.setItem('showLoginToast', 'true');
      if (responseData.hasCompletedOnboarding) {
        setLocation('/dashboard');
      } else {
        setLocation('/step/2');
      }
    } catch (err: any) {
      setIsSwooshingVerify(false);
      setOtpError(err.message || 'Verification failed. Please check your OTP.');
    }
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 10);
    setPhone(val);
    if (val.length === 10) setPhoneError('');
  };

  const handleOtpChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);
    setOtpError('');
    if (value && index < 5) {
      const nextInput = document.getElementById(`login-otp-${index + 1}`);
      nextInput?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      const prevInput = document.getElementById(`login-otp-${index - 1}`);
      prevInput?.focus();
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md space-y-8 animate-in fade-in slide-in-from-bottom duration-300">
        {/* Logo area */}
        <div className="flex flex-col items-center gap-3">
          <img src={logo} alt="BEXO" className="h-10 object-contain select-none" />
          <h2 className="text-xl font-bold font-serif text-slate-900 tracking-tight text-center">
            Digital Portfolios for Students
          </h2>
          <p className="text-xs text-slate-500 text-center max-w-xs">
            Authenticate to manage your custom design subdomains, edit projects, and update layouts.
          </p>
        </div>

        {/* Login Card */}
        <Card className="p-6 bg-white border border-slate-200/80 shadow-lg rounded-2xl relative overflow-hidden">
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

                <div className="flex justify-between gap-2 pt-2">
                  {otp.map((digit, idx) => (
                    <Input
                      key={idx}
                      id={`login-otp-${idx}`}
                      type="text"
                      pattern="\d*"
                      maxLength={1}
                      value={digit}
                      onChange={e => handleOtpChange(idx, e.target.value)}
                      onKeyDown={e => handleKeyDown(idx, e)}
                      className="w-12 h-12 text-center text-lg font-bold rounded-xl bg-slate-50 border-slate-200"
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
                className="w-full h-12 bg-indigo-650 text-white hover:bg-indigo-750 transition-all rounded-xl font-bold text-sm shadow-md flex items-center justify-center gap-2 disabled:opacity-50"
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
