import React, { useState, useEffect } from 'react';
import { useOnboarding } from '../context/OnboardingContext';
import { Button } from '../design-system/primitives';
import { Loader2 } from 'lucide-react';
import { FcGoogle } from 'react-icons/fc';
import { supabase } from '../lib/supabase';
import { apiUrl } from '../lib/api';

export default function Step2Auth() {
  const { nextStep, updateData, refreshProfile } = useOnboarding();
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
          redirectTo: `${window.location.origin}/step/2`,
          // Basic details only — name, email, avatar. We intentionally do NOT
          // request birthday/gender scopes (Google OAuth verification + privacy).
          scopes: 'openid email profile'
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

  const linkGoogleAndContinue = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Google session expired. Please sign in again.');
      }

      const bexoToken = localStorage.getItem('token');
      if (!bexoToken) {
        throw new Error('Please verify your phone first, then link Google.');
      }

      const res = await fetch(apiUrl('/api/profile/link-google'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${bexoToken}`,
        },
        body: JSON.stringify({ accessToken: session.access_token }),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.error || 'Could not link Google account.');
      }

      if (body?.user?.email) {
        updateData({
          email: body.user.email,
          oauthProvider: body.user.oauthProvider || 'google',
          ...(body.user.name ? { name: body.user.name } : {}),
          ...(body.user.photoUrl ? { photoUrl: body.user.photoUrl } : {}),
        });
      }
      await refreshProfile?.().catch(() => undefined);

      nextStep(2);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to link Google account.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full justify-center max-w-md w-full mx-auto py-1">
      <div className="mb-7 md:mb-10 text-left">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-sky-600 mb-2">
          Identity
        </p>
        <h1 className="font-serif text-[1.55rem] sm:text-3xl md:text-4xl font-bold text-slate-900 mb-2 tracking-tight leading-tight">
          Secure your account
        </h1>
        <p className="text-slate-500 text-sm md:text-lg leading-relaxed">
          Link Google once — edit your portfolio and dash from any device.
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
              className="w-full min-h-12 h-13 bg-gradient-to-r from-sky-500 via-blue-500 to-indigo-500 hover:brightness-110 text-white font-bold text-sm transition-all duration-200 flex items-center justify-center gap-3 cursor-pointer shadow-[0_12px_28px_-10px_rgba(56,189,248,0.55)] px-6 rounded-2xl"
              onClick={linkGoogleAndContinue}
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>Continue as {sessionUser.user_metadata?.full_name?.split(' ')[0] || 'User'}</>
              )}
            </Button>
            <button 
              type="button" 
              className="w-full h-12 hover:bg-slate-50 text-slate-500 font-medium text-sm transition-all duration-200 flex items-center justify-center cursor-pointer rounded-2xl border border-slate-200 bg-white"
              onClick={handleSignOut}
              disabled={isLoading}
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Disconnect Google Account"}
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-white/90 p-6 sm:p-8 rounded-[1.35rem] border border-slate-200/90 shadow-[0_12px_40px_-20px_rgba(15,23,42,0.25)] space-y-6">
          <div className="text-center">
            <div className="w-14 h-14 bg-sky-50 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-sky-100">
              <svg viewBox="0 0 24 24" className="w-7 h-7 text-sky-500" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h3 className="font-semibold text-slate-900 mb-1">One-click authentication</h3>
            <p className="text-sm text-slate-500">We will never post on your behalf.</p>
          </div>

          {errorMsg && <p className="text-red-500 text-sm text-center">{errorMsg}</p>}

          <Button 
            type="button" 
            variant="outline"
            className="w-full min-h-12 h-13 text-sm font-bold relative bg-white hover:bg-slate-50 hover:border-slate-300 rounded-2xl border-slate-200"
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
