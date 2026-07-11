import React from 'react';
import { useLocation, useRoute } from 'wouter';
import { Check, CheckCircle2, ChevronRight, Droplet } from 'lucide-react';
import { cn } from '../design-system/primitives';
import logo from '../assets/ace-digitals-logo.png';

const STEPS = [
  { id: 1, label: 'Verification' },
  { id: 2, label: 'Account' },
  { id: 3, label: 'Personal Info' },
  { id: 4, label: 'Resume' },
  { id: 5, label: 'Photo' },
  { id: 6, label: 'Profile' },
  { id: 7, label: 'Plan' },
  { id: 8, label: 'Theme' },
  { id: 9, label: 'Publish' },
];

export function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const match = location.match(/\/step\/(\d+)/);
  const currentStep = match ? parseInt(match[1], 10) : 1;

  if (currentStep === 9) {
    // Step 9 has no sidebar, full screen layout
    return <div className="min-h-[100dvh] bg-slate-50">{children}</div>;
  }

  return (
    <div className="flex min-h-[100dvh] bg-slate-50/50 flex-col md:flex-row">
      {/* Mobile Top Progress */}
      <div className="md:hidden flex flex-col bg-white border-b border-slate-200 px-4 py-3 sticky top-0 z-10">
        <div className="flex items-center gap-2 mb-2">
          <img src={logo} alt="BEXO" className="w-6 h-6 object-contain" />
          <span className="font-serif font-semibold text-lg text-slate-900 tracking-tight">BEXO</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-xs font-medium text-slate-500 w-16">Step {currentStep} of 8</div>
          <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div 
              className="h-full bg-blue-600 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${(currentStep / 8) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* Desktop Sidebar */}
      <div className="hidden md:flex w-72 lg:w-80 flex-col bg-white border-r border-slate-200 px-8 py-10 sticky top-0 h-[100dvh]">
        <div className="flex items-center gap-3 mb-12">
          <img src={logo} alt="BEXO" className="w-8 h-8 object-contain" />
          <span className="font-serif font-bold text-2xl text-slate-900 tracking-tight">BEXO</span>
        </div>
        
        <div className="flex flex-col gap-6">
          {STEPS.slice(0, 8).map((step) => {
            const isCompleted = currentStep > step.id;
            const isCurrent = currentStep === step.id;
            
            return (
              <div key={step.id} className="flex items-start gap-4">
                <div className={cn(
                  "mt-0.5 w-6 h-6 rounded-full flex items-center justify-center shrink-0 border text-xs transition-colors duration-300",
                  isCompleted ? "bg-blue-600 border-blue-600 text-white" :
                  isCurrent ? "border-blue-600 text-blue-600 ring-4 ring-blue-50" :
                  "border-slate-300 text-slate-400"
                )}>
                  {isCompleted ? <Check className="w-3.5 h-3.5" /> : step.id}
                </div>
                <div className="flex flex-col">
                  <span className={cn(
                    "text-sm font-medium transition-colors duration-300",
                    isCurrent ? "text-slate-900" :
                    isCompleted ? "text-slate-700" :
                    "text-slate-400"
                  )}>
                    {step.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        
        <div className="mt-auto pt-8">
          <div className="rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 p-5 border border-blue-100/50">
            <h4 className="font-serif font-semibold text-blue-950 mb-1">Your Portfolio, Crafted.</h4>
            <p className="text-xs text-blue-800/80 leading-relaxed">
              We're building a polished public presence to help you stand out for campus placements.
            </p>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col relative overflow-hidden">
        {/* Background Decorative Blob */}
        <div className="absolute top-0 right-0 -translate-y-1/4 translate-x-1/4 w-[800px] h-[800px] bg-blue-50/50 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex-1 overflow-y-auto px-4 py-8 md:p-12 lg:p-16 z-10 w-full max-w-3xl mx-auto flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-500">
          {children}
        </div>
      </main>
    </div>
  );
}
