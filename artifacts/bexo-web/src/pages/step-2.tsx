import React, { useState } from 'react';
import { useOnboarding } from '../context/OnboardingContext';
import { Button } from '../design-system/primitives';
import { Loader2 } from 'lucide-react';
import { FcGoogle } from 'react-icons/fc';

export default function Step2Auth() {
  const { nextStep } = useOnboarding();
  const [isLoading, setIsLoading] = useState(false);

  const handleGoogleSignIn = () => {
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      nextStep(2);
    }, 2000);
  };

  return (
    <div className="flex flex-col h-full justify-center max-w-md w-full mx-auto">
      <div className="mb-10 text-center md:text-left">
        <h1 className="font-serif text-3xl md:text-4xl font-bold text-slate-900 mb-3 tracking-tight">
          Secure Your Account
        </h1>
        <p className="text-slate-500 text-base md:text-lg">
          Link your Google account to access your portfolio and dashboard in the future.
        </p>
      </div>

      <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm space-y-6">
        <div className="text-center">
          <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-blue-100">
            <svg viewBox="0 0 24 24" className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h3 className="font-medium text-slate-900 mb-1">One-click authentication</h3>
          <p className="text-sm text-slate-500">We will never post on your behalf.</p>
        </div>

        <Button 
          type="button" 
          variant="outline"
          className="w-full h-14 text-base font-medium relative bg-white hover:bg-slate-50 hover:border-slate-300"
          onClick={handleGoogleSignIn}
          disabled={isLoading}
        >
          {isLoading ? (
            <Loader2 className="w-5 h-5 animate-spin text-slate-500" />
          ) : (
            <>
              <FcGoogle className="w-6 h-6 absolute left-4" />
              Continue with Google
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
