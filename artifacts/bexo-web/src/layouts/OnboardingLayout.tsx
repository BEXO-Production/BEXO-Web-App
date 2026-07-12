import React from 'react';
import { useLocation } from 'wouter';
import { Check, ChevronLeft, Cloud, Sparkles } from 'lucide-react';
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
  const [location] = useLocation();
  const match = location.match(/\/step\/(\d+)/);
  const currentStep = match ? parseInt(match[1], 10) : 1;
  const { prevStep } = useOnboarding();
  const progressPercentage = currentStep >= 3 ? (10 + currentStep * 10) : Math.round((currentStep / 9) * 100);

  const [carouselIndex, setCarouselIndex] = React.useState(0);

  React.useEffect(() => {
    const timer = setInterval(() => {
      setCarouselIndex((prev) => (prev + 1) % CAROUSEL_IMAGES.length);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex min-h-[100dvh] bg-slate-50 flex-col md:flex-row">
      {/* Mobile Top Progress */}
      <div className="md:hidden flex flex-col bg-slate-900 text-white px-4 py-3 sticky top-0 z-10">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <img src={logo} alt="BEXO" className="w-6 h-6 object-contain" />
            <span className="font-serif font-semibold text-lg tracking-tight">BEXO</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-400 bg-emerald-950/40 px-2 py-1 rounded-full">
            <Cloud className="w-3.5 h-3.5" /> Saved
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-xs font-medium text-indigo-300 w-16">
            {currentStep >= 3 ? `${progressPercentage}%` : `Step ${currentStep}/9`}
          </div>
          <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
            <div 
              className="h-full bg-indigo-500 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
        </div>
      </div>

      {/* Desktop Dark Sidebar */}
      <div className="hidden md:flex w-56 lg:w-64 flex-col bg-slate-900 px-6 py-8 sticky top-0 h-[100dvh] dark-sidebar overflow-y-auto">
        {/* Logo */}
        <div className="flex items-center gap-2.5 mb-10">
          <img src={logo} alt="BEXO" className="w-8 h-8 object-contain" />
          <span className="font-serif font-bold text-xl text-white tracking-tight">BEXO</span>
        </div>
        
        {/* Step Navigation */}
        <div className="flex flex-col gap-1">
          {STEPS.map((step) => {
            const isCompleted = currentStep > step.id;
            const isCurrent = currentStep === step.id;
            
            return (
              <div 
                key={step.id} 
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200",
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
        <div className="mt-auto pt-6 flex flex-col gap-3">
          {/* Saved Indicator */}
          <div className="flex items-center gap-2 text-xs font-medium text-emerald-400 bg-emerald-950/30 px-3 py-2 rounded-lg border border-emerald-800/30">
            <Cloud className="w-3.5 h-3.5" /> Your progress is saved
          </div>
          
          {/* Motivational Card with Illustration */}
          <div className="relative rounded-2xl overflow-hidden shadow-lg h-44 bg-slate-900 shrink-0">
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

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col relative overflow-hidden bg-slate-50">
        {/* Dynamic Background Image */}
        <div className="absolute inset-0 z-0">
          <img 
            key={`bg-${currentStep}`}
            src={STEP_CONTENT[currentStep]?.image || STEP_CONTENT[1].image}
            alt="Onboarding Background"
            className="w-full h-full object-cover animate-in fade-in duration-1000"
          />
          {/* Glassmorphic Overlay to ensure readability */}
          <div className="absolute inset-0 bg-white/85 backdrop-blur-xl" />
        </div>
        
        <div className="w-full flex-1 overflow-y-auto px-4 py-4 md:px-8 md:py-6 lg:px-12 lg:py-8 z-10 flex flex-col">
          <div className="w-full max-w-5xl mx-auto flex flex-col flex-1 relative">
            
            {/* Top Bar: Back Button + Step Label */}
            <div className="flex items-center justify-between mb-4">
              {currentStep > 1 && currentStep < 9 ? (
                <button 
                  onClick={() => prevStep(currentStep)}
                  className="flex items-center text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4 mr-1" />
                  Back
                </button>
              ) : <div />}
              
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest">
                Onboarding Step {currentStep} of 9
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
                
                {/* Circular Progress Badge */}
                <div className="progress-badge ml-6">
                  <span className="progress-badge__value">{progressPercentage}%</span>
                  <span className="progress-badge__label">Completed</span>
                </div>
              </div>
            )}

            {/* Mobile Illustration (Hidden on Desktop) */}
            <div className="md:hidden w-full h-48 sm:h-56 rounded-2xl overflow-hidden mb-6 relative shrink-0 shadow-sm bg-slate-900">
              {CAROUSEL_IMAGES.map((img, idx) => (
                <img 
                  key={`mob-car-${idx}`}
                  src={img} 
                  alt="Illustration" 
                  className={cn(
                    "absolute inset-0 w-full h-full object-cover object-center transition-opacity duration-1000 ease-in-out",
                    idx === carouselIndex ? "opacity-100 z-10" : "opacity-0 z-0"
                  )}
                />
              ))}
              <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 via-slate-900/20 to-transparent z-20" />
              <div className="absolute bottom-4 left-4 right-4 z-20">
                <h4 className="font-serif font-bold text-white text-lg">{STEP_CONTENT[currentStep]?.title}</h4>
                <p className="text-xs text-slate-200">{STEP_CONTENT[currentStep]?.subtitle}</p>
              </div>
            </div>

            {/* Page Content */}
            <div className="flex-1 flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-500">
              {children}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
