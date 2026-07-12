import React, { useState, useEffect } from 'react';
import { useOnboarding } from '../context/OnboardingContext';
import { Button } from '../design-system/primitives';
import { Loader2 } from 'lucide-react';
import { FcGoogle } from 'react-icons/fc';
import { supabase } from '../lib/supabase';

export default function Step2Auth() {
  const { nextStep } = useOnboarding();
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [sessionUser, setSessionUser] = useState<any | null>(null);

  useEffect(() => {
    // Check if user is already logged in with Google (e.g. redirected back)
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setSessionUser(session.user);
      }
    };
    checkSession();

    // Listen to changes in auth status
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setSessionUser(session.user);
      } else {
        setSessionUser(null);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/step/2`
        }
      });
      if (error) throw error;
    } catch (err: any) {
      setIsLoading(false);
      setErrorMsg(err.message || 'Failed to initiate Google sign in.');
    }
  };

  const handleSignOut = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setSessionUser(null);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to disconnect account.');
    } finally {
      setIsLoading(false);
    }
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

      {sessionUser ? (
        <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm space-y-6 animate-in fade-in zoom-in-95 duration-200">
          <div className="text-center">
            {sessionUser.user_metadata?.avatar_url ? (
              <img 
                src={sessionUser.user_metadata.avatar_url} 
                alt="Profile" 
                className="w-16 h-16 rounded-full mx-auto mb-4 border-2 border-indigo-100 object-cover" 
              />
            ) : (
              <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4 border border-indigo-100 font-bold text-xl">
                {sessionUser.email?.slice(0, 1).toUpperCase()}
              </div>
            )}
            <h3 className="font-semibold text-slate-900 text-lg mb-1">
              {sessionUser.user_metadata?.full_name || 'Linked with Google'}
            </h3>
            <p className="text-sm text-slate-500">{sessionUser.email}</p>
          </div>

          {errorMsg && <p className="text-red-500 text-sm text-center">{errorMsg}</p>}

          <div className="space-y-3">
            <Button 
              type="button" 
              className="w-full h-14 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-base transition-all duration-200 flex items-center justify-center gap-3 cursor-pointer shadow-lg shadow-slate-900/20 px-6 rounded-2xl"
              onClick={() => nextStep(2)}
            >
              Continue as {sessionUser.user_metadata?.full_name?.split(' ')[0] || 'User'}
            </Button>
            <button 
              type="button" 
              className="w-full h-12 hover:bg-slate-50 text-slate-500 font-medium text-sm transition-all duration-200 flex items-center justify-center cursor-pointer rounded-xl border border-slate-200 bg-white"
              onClick={handleSignOut}
              disabled={isLoading}
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Disconnect Google Account"}
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm space-y-6">
          <div className="text-center">
            <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-blue-100">
              <svg viewBox="0 0 24 24" className="w-8 h-8 text-indigo-500" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h3 className="font-medium text-slate-900 mb-1">One-click authentication</h3>
            <p className="text-sm text-slate-500">We will never post on your behalf.</p>
          </div>

          {errorMsg && <p className="text-red-500 text-sm text-center">{errorMsg}</p>}

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
      )}
    </div>
  );
}
