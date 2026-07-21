import React from 'react';
import { useLocation } from 'wouter';
import { Check, ChevronLeft, Cloud, Loader2, LogOut, Sparkles } from 'lucide-react';
import { cn } from '../design-system/primitives';
import logo from '../assets/bexo-logo.png';
import step1Img from '../assets/illustrations/step-1.jpeg';
import step2Img from '../assets/illustrations/step-2.jpeg';
import step3Img from '../assets/illustrations/step-3.jpeg';
import step4Img from '../assets/illustrations/step-4.jpeg';
import step5Img from '../assets/illustrations/step-5.jpeg';
import step6Img from '../assets/illustrations/step-6.jpeg';
import step7Img from '../assets/illustrations/step-7.jpeg';
import step8Img from '../assets/illustrations/step-8.jpeg';
import carousel1Img from '../assets/illustrations/carousel-1.jpeg';
import carousel2Img from '../assets/illustrations/carousel-2.jpeg';
import carousel3Img from '../assets/illustrations/carousel-3.jpeg';
import { useOnboarding } from '../context/OnboardingContext';
import { supabase } from '../lib/supabase';

const CAROUSEL_IMAGES = [carousel1Img, carousel2Img, carousel3Img];

const STEPS = [
  { id: 1, label: 'Verification' },
  { id: 2, label: 'Account' },
  { id: 3, label: 'Personal Info' },
  { id: 4, label: 'Photo' },
  { id: 5, label: 'Resume' },
  { id: 6, label: 'Profile' },
  { id: 7, label: 'Theme' },
  { id: 8, label: 'Publish' },
  { id: 9, label: 'Plan' },
];

const STEP_CONTENT: Record<number, { title: string; subtitle: string; image: string }> = {
  1: { title: "Let's get started", subtitle: "Secure your account with verification.", image: step1Img },
  2: { title: "Connect account", subtitle: "Link Google for a seamless experience.", image: step2Img },
  3: { title: "Tell us about you", subtitle: "Personalize your portfolio identity.", image: step7Img },
  4: { title: "Put a face to it", subtitle: "Upload a professional profile photo.", image: step4Img },
  5: { title: "Upload resume", subtitle: "Our AI will parse your experience.", image: step5Img },
  6: { title: "Review profile", subtitle: "Make sure everything looks perfect.", image: step6Img },
  7: { title: "Choose a style", subtitle: "Select a theme that fits you.", image: step3Img },
  8: { title: "Publish & Share", subtitle: "Your portfolio is ready for the world.", image: step8Img },
  9: { title: "Choose a Plan", subtitle: "Unlock premium portfolio features.", image: step8Img },
};

export function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const match = location.match(/\/step\/(\d+)/);
  const currentStep = match ? parseInt(match[1], 10) : 1;
  const { prevStep, setToken } = useOnboarding();
  const progressPercentage = currentStep >= 3 ? (10 + currentStep * 10) : Math.round((currentStep / 9) * 100);

  const [carouselIndex, setCarouselIndex] = React.useState(0);
  const [isLoggingOut, setIsLoggingOut] = React.useState(false);

  React.useEffect(() => {
    const timer = setInterval(() => {
      setCarouselIndex((prev) => (prev + 1) % CAROUSEL_IMAGES.length);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  const handleLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
      await supabase.auth.signOut().catch(() => undefined);
    } finally {
      localStorage.removeItem('token');
      setToken(null);
      setLocation('/');
      setIsLoggingOut(false);
    }
  };

  const logoutButton = (
    <button
      type="button"
      onClick={handleLogout}
      disabled={isLoggingOut}
      className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 shadow-sm transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:opacity-60"
    >
      {isLoggingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
      <span>Logout</span>
    </button>
  );

  return (
    <div className="flex min-h-[100dvh] md:h-[100dvh] w-full max-w-full overflow-x-hidden md:overflow-hidden bg-slate-50 flex-col md:flex-row bexo-mobile-shell">
      {/* Mobile Top Progress — z-40 so scrolled content never paints above it */}
      <div className="md:hidden flex flex-col bg-slate-900 text-white px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 sticky top-0 z-40 shadow-lg shadow-slate-900/20 w-full">
        <div className="flex items-center justify-between mb-2 gap-2 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <img src={logo} alt="BEXO" className="w-6 h-6 object-contain shrink-0" />
            <span className="font-serif font-semibold text-lg tracking-tight truncate">BEXO</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-400 bg-emerald-950/40 px-2 py-1 rounded-full">
              <Cloud className="w-3.5 h-3.5" /> Saved
            </div>
            <button
              type="button"
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/10 text-white transition-colors hover:bg-white/20 disabled:opacity-60"
              aria-label="Logout"
            >
              {isLoggingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2 min-w-0">
          <div className="text-[11px] font-medium text-indigo-300 w-[4.25rem] shrink-0 tabular-nums">
            {currentStep >= 3 ? `${progressPercentage}%` : `Step ${currentStep}/9`}
          </div>
          <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden min-w-0">
            <div 
              className="h-full bg-indigo-500 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
        </div>
      </div>

      {/* Desktop Dark Sidebar — fixed column, never scrolls the page */}
      <div className="hidden md:flex w-56 lg:w-64 shrink-0 flex-col bg-slate-900 px-5 lg:px-6 py-6 h-full dark-sidebar overflow-y-auto">
        {/* Logo */}
        <div className="flex items-center gap-2.5 mb-6 shrink-0">
          <img src={logo} alt="BEXO" className="w-8 h-8 object-contain" />
          <span className="font-serif font-bold text-xl text-white tracking-tight">BEXO</span>
        </div>
        
        {/* Step Navigation */}
        <div className="flex flex-col gap-0.5">
          {STEPS.map((step) => {
            const isCompleted = currentStep > step.id;
            const isCurrent = currentStep === step.id;
            
            return (
              <div 
                key={step.id} 
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-xl transition-all duration-200",
                  isCurrent ? "bg-indigo-600/20 border border-indigo-500/30" : "hover:bg-white/5"
                )}
              >
                <div className={cn(
                  "w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-semibold transition-all duration-300",
                  isCompleted ? "bg-emerald-500 text-white" :
                  isCurrent ? "bg-indigo-500 text-white ring-2 ring-indigo-400/40" :
                  "bg-slate-700 text-slate-400"
                )}>
                  {isCompleted ? <Check className="w-3.5 h-3.5" /> : step.id}
                </div>
                <span className={cn(
                  "text-sm font-medium transition-colors duration-300",
                  isCurrent ? "text-white" :
                  isCompleted ? "text-slate-300" :
                  "text-slate-500"
                )}>
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>
        
        {/* Bottom Section */}
        <div className="mt-auto pt-4 flex flex-col gap-2.5 shrink-0">
          {/* Saved Indicator */}
          <div className="flex items-center gap-2 text-xs font-medium text-emerald-400 bg-emerald-950/30 px-3 py-2 rounded-lg border border-emerald-800/30">
            <Cloud className="w-3.5 h-3.5" /> Your progress is saved
          </div>
          <button
            type="button"
            onClick={handleLogout}
            disabled={isLoggingOut}
            className="flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-300 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-60"
          >
            {isLoggingOut ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />}
            Logout
          </button>
          
          {/* Motivational Card with Illustration — hidden on short viewports so the stepper always fits */}
          <div className="relative rounded-2xl overflow-hidden shadow-lg h-40 bg-slate-900 shrink-0 [@media(max-height:800px)]:hidden">
            {CAROUSEL_IMAGES.map((img, idx) => (
              <img 
                key={`desk-car-${idx}`}
                src={img} 
                alt="Illustration" 
                className={cn(
                  "absolute inset-0 w-full h-full object-cover object-center transition-opacity duration-1000 ease-in-out",
                  idx === carouselIndex ? "opacity-100 z-10" : "opacity-0 z-0"
                )}
              />
            ))}
            <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/60 to-transparent z-20" />
            <div className="absolute bottom-0 left-0 right-0 p-4 z-20">
              <div className="flex items-center gap-1 mb-1">
                <h4 className="font-serif font-semibold text-white text-sm">{STEP_CONTENT[currentStep]?.title || "Your future starts here."}</h4>
                <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              </div>
              <p className="text-[10px] text-slate-300 leading-relaxed">
                {STEP_CONTENT[currentStep]?.subtitle || "We're crafting a standout portfolio."}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area — document scroll on mobile to avoid nested rubber-banding */}
      <main className="flex-1 flex flex-col relative bg-slate-50 md:h-full md:overflow-hidden min-w-0 w-full max-w-full">
        {/* Dynamic Background Image (desktop only to reduce mobile scroll weight) */}
        <div className="absolute inset-0 z-0 hidden md:block">
          <img 
            key={`bg-${currentStep}`}
            src={STEP_CONTENT[currentStep]?.image || STEP_CONTENT[1].image}
            alt="Onboarding Background"
            className="w-full h-full object-cover animate-in fade-in duration-1000"
          />
          <div className="absolute inset-0 bg-white/85 backdrop-blur-xl" />
        </div>
        
        <div className="w-full flex-1 md:min-h-0 md:overflow-y-auto px-3 py-3 sm:px-4 md:px-8 md:py-6 lg:px-12 lg:py-8 z-10 flex flex-col min-w-0">
          <div className="w-full max-w-5xl mx-auto flex flex-col flex-1 relative min-w-0 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
            
            {/* Top Bar: Back Button + Step Label */}
            <div className="flex items-center justify-between mb-3 md:mb-4 gap-2 min-w-0">
              {currentStep > 1 && currentStep < 9 ? (
                <button 
                  onClick={() => prevStep(currentStep)}
                  className="flex items-center text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors cursor-pointer min-h-11"
                >
                  <ChevronLeft className="w-4 h-4 mr-1" />
                  Back
                </button>
              ) : <div />}
              
              <div className="hidden md:flex items-center gap-4">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest">
                  Onboarding Step {currentStep} of 9
                </span>
                {logoutButton}
              </div>
              <span className="md:hidden text-[11px] font-semibold text-slate-500 uppercase tracking-widest shrink-0">
                Step {currentStep}/9
              </span>
            </div>

            {/* Horizontal Stepper (desktop only, from step 3 onwards) */}
            {currentStep >= 3 && (
              <div className="hidden md:flex items-center gap-0 mb-8">
                <div className="flex-1 flex items-center">
                  {STEPS.map((step, index) => {
                    const isCompleted = currentStep > step.id;
                    const isCurrent = currentStep === step.id;
                    
                    return (
                      <React.Fragment key={step.id}>
                        <div className={cn(
                          "stepper-node",
                          isCompleted ? "stepper-node--completed" :
                          isCurrent ? "stepper-node--current" :
                          "stepper-node--future"
                        )}>
                          {isCompleted ? <Check className="w-3.5 h-3.5" /> : ''}
                        </div>
                        {index < STEPS.length - 1 && (
                          <div className={cn(
                            "stepper-line",
                            isCompleted ? "stepper-line--completed" : "stepper-line--incomplete"
                          )} />
                        )}
                      </React.Fragment>
                    );
                  })}
                </div>
                
                <div className="progress-badge ml-6">
                  <span className="progress-badge__value">{progressPercentage}%</span>
                  <span className="progress-badge__label">Completed</span>
                </div>
              </div>
            )}

            {/* Compact mobile step cue — no large carousel image */}
            <div className="md:hidden mb-3 rounded-2xl border border-slate-200 bg-white/95 px-3.5 py-2.5 shadow-sm backdrop-blur-sm">
              <div className="flex items-center justify-between gap-2">
                <h4 className="font-serif font-bold text-slate-900 text-[15px] leading-tight">{STEP_CONTENT[currentStep]?.title}</h4>
                <span className="shrink-0 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-indigo-600">
                  {progressPercentage}%
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">{STEP_CONTENT[currentStep]?.subtitle}</p>
            </div>

            {/* Page Content */}
            <div className="flex-1 flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-500 pb-2">
              {children}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
