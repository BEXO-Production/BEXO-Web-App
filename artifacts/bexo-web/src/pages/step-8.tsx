import React, { useEffect, useState } from 'react';
import { useOnboarding } from '../context/OnboardingContext';
import { Button, Card } from '../design-system/primitives';
import { CheckCircle2, Copy, ExternalLink, Sparkles, ArrowRight } from 'lucide-react';
import logo from '../assets/bexo-logo.png';

export default function Step8Publish() {
  const { data, nextStep } = useOnboarding();
  const [copied, setCopied] = useState(false);
  const [isSwooshing, setIsSwooshing] = useState(false);
  
  const handleString = data.name ? data.name.toLowerCase().replace(/[^a-z0-9]/g, '') : 'portfolio';
  const url = `${handleString}.mybexo.com`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(`https://${url}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleContinue = () => {
    setIsSwooshing(true);
    setTimeout(() => {
      nextStep(8);
    }, 600);
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center py-12 px-4 relative max-w-3xl mx-auto w-full">
      <div className="absolute top-0 w-full h-[300px] bg-gradient-to-b from-blue-50 to-transparent -z-10" />
      
      <div className="w-20 h-20 bg-white rounded-2xl shadow-sm border border-slate-200 flex items-center justify-center mb-8 animate-in slide-in-from-top-4 fade-in duration-500">
        <img src={logo} alt="BEXO" className="w-10 h-10 object-contain" />
      </div>

      <div className="text-center max-w-2xl mb-12 animate-in slide-in-from-bottom-4 fade-in duration-700 delay-100 fill-mode-both">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-green-100 text-green-700 text-sm font-medium mb-6">
          <CheckCircle2 className="w-4 h-4" /> Portfolio Published
        </div>
        <h1 className="font-serif text-4xl md:text-5xl font-bold text-slate-900 mb-4 tracking-tight">
          Your site is ready!
        </h1>
        <p className="text-slate-500 text-lg">
          Your professional presence is live. Share this link on your resume and LinkedIn. You're just one step away from finishing.
        </p>
      </div>

      <Card className="w-full p-2 md:p-3 shadow-lg shadow-blue-900/5 mb-12 animate-in zoom-in-95 fade-in duration-700 delay-200 fill-mode-both">
        <div className="flex flex-col md:flex-row items-center gap-3 bg-slate-50 rounded-xl p-4 border border-slate-100">
          <div className="flex-1 flex items-center gap-3 overflow-hidden w-full">
            <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
              <Sparkles className="w-6 h-6 text-indigo-500" />
            </div>
            <div className="truncate">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Your Public URL</p>
              <p className="text-lg md:text-2xl font-medium text-slate-900 truncate">
                https://<span className="text-indigo-500">{url}</span>
              </p>
            </div>
          </div>
          <div className="flex gap-2 w-full md:w-auto mt-4 md:mt-0">
            <Button variant="outline" className="flex-1 md:flex-none h-12" onClick={copyToClipboard}>
              {copied ? <CheckCircle2 className="w-4 h-4 mr-2 text-green-600" /> : <Copy className="w-4 h-4 mr-2" />}
              {copied ? 'Copied' : 'Copy'}
            </Button>
            <Button variant="secondary" className="flex-1 md:flex-none h-12">
              <ExternalLink className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </Card>

      <div className="animate-in fade-in duration-700 delay-300 fill-mode-both w-full">
        <button
          type="button"
          className={`w-full h-14 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl font-semibold text-base transition-all duration-200 flex items-center justify-center gap-3 group cursor-pointer shadow-lg shadow-slate-900/20 btn-continue-wrap px-6${isSwooshing ? ' is-swooshing' : ''}`}
          onClick={handleContinue}
          disabled={isSwooshing}
        >
          <div className="w-9 h-9 bg-indigo-500 rounded-xl flex items-center justify-center arrow-box shrink-0">
            <ArrowRight className="w-5 h-5 text-white" />
          </div>
          <span className="btn-label">Continue to Activation</span>
        </button>
      </div>
    </div>
  );
}
