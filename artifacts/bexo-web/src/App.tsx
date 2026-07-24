import React, { useState, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, Router as WouterRouter, Redirect } from 'wouter';
import { OnboardingProvider, useOnboarding } from './context/OnboardingContext';
import { OnboardingLayout } from './layouts/OnboardingLayout';
import { supabase } from './lib/supabase';

import Step1Phone from './pages/step-1';
import Step2Auth from './pages/step-2';
import Step3Info from './pages/step-3';
import Step4Photo from './pages/step-4';
import Step5Resume from './pages/step-5';
import Step6Review from './pages/step-6';
import Step7Theme from './pages/step-7';
import Step8Publish from './pages/step-8';
import Step9Plan from './pages/step-9';
import CheckoutPage from './pages/checkout';

import Login from './pages/login';
import Dashboard from './pages/dashboard';
import DashboardInbox from './pages/dashboard-inbox';
import DashboardAnalytics from './pages/dashboard-analytics';
import PublicPortfolio from './pages/public-portfolio';
import HireMePage from './pages/hire-me';
import WelcomeSuccess from './pages/welcome';
import LandingPage from './pages/landing/LandingPage';
import { TermsPage, PrivacyPage, RefundPage, CookiesPage } from './pages/legal';
import { useToast } from './hooks/use-toast';
import {
  getPortfolioSubdomain,
  isCombinedMarketingHost,
} from './lib/platform';

const queryClient = new QueryClient();

function Router() {
  const { data, isLoading } = useOnboarding();
  const subdomain = getPortfolioSubdomain();
  const { toast } = useToast();
  const [sessionLoading, setSessionLoading] = useState(true);
  const [hasGoogleSession, setHasGoogleSession] = useState(false);

  useEffect(() => {
    const checkSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        setHasGoogleSession(!!session?.user);
      } catch (err) {
        console.error("Error checking Supabase session:", err);
      } finally {
        setSessionLoading(false);
      }
    };
    checkSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setHasGoogleSession(!!session?.user);
      setSessionLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Shared ATS Hire Me page is public, template-neutral, and available to free
  // and paid users. It must not wait on onboarding session hydration, and it
  // takes priority over subdomain portfolio rendering so
  // {handle}.atbexo.com/hire-me also resolves here.
  if (typeof window !== 'undefined' && window.location.pathname.startsWith('/hire-me')) {
    const parts = window.location.pathname.split('/').filter(Boolean);
    const hireHandle = parts[1] || subdomain;
    if (hireHandle) {
      return <HireMePage handleOverride={hireHandle} />;
    }
  }

  if (subdomain) {
    return <PublicPortfolio handleOverride={subdomain} />;
  }

  if (isLoading || sessionLoading) {
    // Guests hitting marketing/legal pages shouldn't wait on profile hydrate
    const path = typeof window !== 'undefined' ? window.location.pathname : '';
    const isPublicMarketing =
      !localStorage.getItem('token') &&
      (path === '/' ||
        path === '/login' ||
        path === '/terms' ||
        path === '/privacy' ||
        path === '/refund' ||
        path === '/cookies');
    if (!isPublicMarketing) {
      return (
        <div className="flex min-h-[100dvh] w-full items-center justify-center bg-slate-50">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-sm font-medium text-slate-500">Loading your profile...</p>
          </div>
        </div>
      );
    }
  }

  const token = localStorage.getItem('token');
  const hasToken = !!token;

  // Function to calculate maximum allowed step
  const getMaxAllowedStep = () => {
    // Step 1: Verification (no requirements)
    if (!hasToken) return 1;

    // Step 2: Google Link
    if (!hasGoogleSession) return 2;

    // Step 3: Profile Info (Name + Handle required; DOB is optional)
    if (!data.name?.trim() || !data.handle?.trim()) {
      return 3;
    }

    const savedHighest = parseInt(localStorage.getItem('bexo_highest_step') || '1', 10);

    // Step 5: Resume Upload or Manual Profile Data
    // Step 4 (photo) is optional and never gates progress.
    const hasResumeOrData =
      !!data.resumeFileName ||
      !!data.resumeUrl ||
      !!data.uploadedResumeUrl ||
      !!data.generatedResumeUrl ||
      (data.aboutEntries && data.aboutEntries.length > 0) ||
      (data.experienceEntries && data.experienceEntries.length > 0) ||
      (data.educationEntries && data.educationEntries.length > 0) ||
      (data.projectEntries && data.projectEntries.length > 0) ||
      savedHighest >= 6;

    if (!hasResumeOrData) {
      // Allow arriving at step 5; block theme/publish until content exists.
      return 5;
    }

    // Step 6 review gate: must visit core tabs once before leaving review,
    // unless the user already progressed past it (refresh / revisit).
    const requiredTabs = [
      'about',
      'education',
      'experience',
      'projects',
      'certificates',
      'achievements',
      'research',
      'skills',
      'contact',
    ];
    const hasVisitedAllTabs = requiredTabs.every((t) => data.visitedTabs?.includes(t));
    if (!hasVisitedAllTabs && savedHighest < 7) {
      return 6;
    }

    // Resume/review complete — allow through theme → publish → plan based on
    // the highest step already unlocked (bumped in nextStep before navigate).
    return Math.min(9, Math.max(6, savedHighest));
  };

  const maxAllowedStep = getMaxAllowedStep();

  return (
    <Switch>
      <Route path="/">
        {() => {
          // Production: marketing is mybexo.com (static). This SPA on dash / local
          // Vite sends guests to /login and signed-in users to their workspace.
          // Dev combined host mybexo.cyou still serves the React landing page.
          const showMarketingLanding = isCombinedMarketingHost();
          if (!showMarketingLanding) {
            if (hasToken) {
              return (
                <Redirect
                  to={
                    data.hasCompletedOnboarding
                      ? "/dashboard"
                      : `/step/${maxAllowedStep}`
                  }
                />
              );
            }
            return <Redirect to="/login" />;
          }
          return (
            <LandingPage
              signedIn={hasToken}
              dashboardReady={!!data.hasCompletedOnboarding}
              continueHref={
                hasToken
                  ? data.hasCompletedOnboarding
                    ? "/dashboard"
                    : `/step/${maxAllowedStep}`
                  : undefined
              }
            />
          );
        }}
      </Route>
      <Route path="/login">
        {hasToken ? (
          data.hasCompletedOnboarding ? <Redirect to="/dashboard" /> : <Redirect to={`/step/${maxAllowedStep}`} />
        ) : (
          <Login />
        )}
      </Route>
      <Route path="/terms" component={TermsPage} />
      <Route path="/privacy" component={PrivacyPage} />
      <Route path="/refund" component={RefundPage} />
      <Route path="/cookies" component={CookiesPage} />
      <Route path="/dashboard/inbox">
        {hasToken ? (
          data.hasCompletedOnboarding ? <DashboardInbox /> : <Redirect to={`/step/${maxAllowedStep}`} />
        ) : (
          <Redirect to="/login" />
        )}
      </Route>
      <Route path="/dashboard/analytics">
        {hasToken ? (
          data.hasCompletedOnboarding ? <DashboardAnalytics /> : <Redirect to={`/step/${maxAllowedStep}`} />
        ) : (
          <Redirect to="/login" />
        )}
      </Route>
      <Route path="/dashboard">
        {hasToken ? (
          data.hasCompletedOnboarding ? <Dashboard /> : <Redirect to={`/step/${maxAllowedStep}`} />
        ) : (
          <Redirect to="/login" />
        )}
      </Route>
      <Route path="/welcome">
        {hasToken ? (
          data.hasCompletedOnboarding || data.isPremium ? (
            <WelcomeSuccess />
          ) : (
            <Redirect to={`/step/${maxAllowedStep}`} />
          )
        ) : (
          <Redirect to="/login" />
        )}
      </Route>
      <Route path="/billing">
        {hasToken ? (
          <div className="min-h-[100dvh] bg-slate-50 px-4 py-8">
            <div className="mx-auto mb-6 flex w-full max-w-lg items-center justify-between">
              <button
                type="button"
                onClick={() => window.location.href = '/dashboard'}
                className="text-xs font-bold uppercase tracking-wider text-slate-500 hover:text-slate-900"
              >
                Back to dashboard
              </button>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Billing</span>
            </div>
            <Step9Plan />
          </div>
        ) : <Redirect to="/login" />}
      </Route>
      <Route path="/checkout">
        {hasToken ? <CheckoutPage /> : <Redirect to="/login" />}
      </Route>
      <Route path="/step/:id">
        {params => {
          const stepId = parseInt(params.id, 10);
          
          if (stepId < 1 || stepId > 9) {
            return <Redirect to={hasToken ? `/step/${maxAllowedStep}` : "/login"} />;
          }

          // If the user has already completed onboarding, block access to onboarding steps
          if (hasToken && data.hasCompletedOnboarding) {
            return <Redirect to="/dashboard" />;
          }

          if (!hasToken) {
            return <Redirect to="/login" />;
          }

          // Phone OTP is already verified once a token exists, so do not send
          // incomplete users back to the verification screen.
          if (hasToken && stepId === 1) {
            return <Redirect to={`/step/${maxAllowedStep}`} />;
          }

          // Record progress after the step is allowed (effect-safe: only when
          // the destination passes the gate below). Prefer nextStep()'s bump
          // for forward navigation so the first Continue click succeeds.
          if (stepId >= 1 && stepId <= 9 && stepId <= maxAllowedStep) {
            const prevHighest = parseInt(localStorage.getItem('bexo_highest_step') || '1', 10);
            if (stepId > prevHighest) {
              localStorage.setItem('bexo_highest_step', String(stepId));
            }
          }

          // If trying to access a step beyond what is allowed, redirect to maxAllowedStep
          if (stepId > maxAllowedStep) {
            return <Redirect to={`/step/${maxAllowedStep}`} />;
          }

          return (
            <OnboardingLayout>
              <Switch>
                <Route path="/step/1" component={Step1Phone} />
                <Route path="/step/2" component={Step2Auth} />
                <Route path="/step/3" component={Step3Info} />
                <Route path="/step/4" component={Step4Photo} />
                <Route path="/step/5" component={Step5Resume} />
                <Route path="/step/6" component={Step6Review} />
                <Route path="/step/7" component={Step7Theme} />
                <Route path="/step/8" component={Step8Publish} />
                <Route path="/step/9" component={Step9Plan} />
              </Switch>
            </OnboardingLayout>
          );
        }}
      </Route>
      <Route path="/hire-me/:handle">
        {(params) => <HireMePage handleOverride={params.handle} />}
      </Route>
      <Route path="/:handle">
        <PublicPortfolio />
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <OnboardingProvider>
            <Router />
          </OnboardingProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
