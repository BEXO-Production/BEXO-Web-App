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

import Login from './pages/login';
import Dashboard from './pages/dashboard';
import PublicPortfolio from './pages/public-portfolio';
import { useToast } from './hooks/use-toast';

const queryClient = new QueryClient();

const getSubdomain = () => {
  const hostname = window.location.hostname;
  const parts = hostname.split('.');
  
  if (hostname.endsWith('localhost')) {
    if (parts.length > 1 && parts[0] !== 'localhost' && parts[0] !== 'www') {
      return parts[0];
    }
    return null;
  }
  
  if (parts.length > 2 && parts[0] !== 'www') {
    return parts[0];
  }
  
  return null;
};

function Router() {
  const { data, isLoading } = useOnboarding();
  const subdomain = getSubdomain();
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

  if (subdomain) {
    return <PublicPortfolio handleOverride={subdomain} />;
  }

  if (isLoading || sessionLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-sm font-medium text-slate-500">Loading your profile...</p>
        </div>
      </div>
    );
  }

  const token = localStorage.getItem('token');
  const hasToken = !!token;

  // Function to calculate maximum allowed step
  const getMaxAllowedStep = () => {
    // Step 1: Verification (no requirements)
    if (!hasToken) return 1;

    // Step 2: Google Link
    if (!hasGoogleSession) return 2;

    // Step 3: Profile Info (Name, DOB, Handle required)
    if (!data.name?.trim() || !data.dob || !data.handle?.trim()) {
      return 3;
    }

    // Step 4: Photo / Layout Selection (Optional, defaults to minimal)
    // Step 5: Resume Upload
    if (!data.resumeFileName) {
      return 5;
    }

    // Step 6: Review & Verify (must visit all tabs to continue)
    const requiredTabs = ['about', 'education', 'experience', 'projects', 'certificates', 'achievements', 'research', 'contact'];
    const hasVisitedAllTabs = requiredTabs.every(t => data.visitedTabs?.includes(t));
    if (!hasVisitedAllTabs) {
      return 6;
    }

    // Step 7: Theme
    // Step 8: Publish
    // Step 9: Plan
    return 9;
  };

  const maxAllowedStep = getMaxAllowedStep();

  return (
    <Switch>
      <Route path="/">
        {hasToken ? (
          data.hasCompletedOnboarding ? <Redirect to="/dashboard" /> : <Redirect to={`/step/${maxAllowedStep}`} />
        ) : (
          <Login />
        )}
      </Route>
      <Route path="/dashboard">
        {hasToken ? <Dashboard /> : <Redirect to="/" />}
      </Route>
      <Route path="/step/:id">
        {params => {
          const stepId = parseInt(params.id, 10);
          
          if (stepId < 1 || stepId > 9) {
            return <Redirect to="/" />;
          }

          // If the user has already completed onboarding, block access to onboarding steps
          if (hasToken && data.hasCompletedOnboarding) {
            return <Redirect to="/dashboard" />;
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
