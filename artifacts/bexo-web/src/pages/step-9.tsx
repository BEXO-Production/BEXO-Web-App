import React, { useState } from 'react';
import { useOnboarding } from '../context/OnboardingContext';
import { Button, Card } from '../design-system/primitives';
import { CheckCircle2, Copy, ExternalLink, Settings, Sparkles, User, FileText, ArrowRight } from 'lucide-react';
import logo from '../assets/ace-digitals-logo.png';

export default function Step9Publish() {
  const { data } = useOnboarding();
  const [copied, setCopied] = useState(false);
  
  const handleString = data.name ? data.name.toLowerCase().replace(/[^a-z0-9]/g, '') : 'portfolio';
  const url = `${handleString}.mybexo.com`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(`https://${url}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-[100dvh] flex flex-col items-center py-12 px-4 md:py-20 relative">
      <div className="absolute top-0 w-full h-[400px] bg-gradient-to-b from-blue-50 to-transparent -z-10" />
      
      <div className="w-16 h-16 bg-white rounded-2xl shadow-sm border border-slate-200 flex items-center justify-center mb-8 animate-in slide-in-from-top-4 fade-in duration-500">
        <img src={logo} alt="BEXO" className="w-8 h-8 object-contain" />
      </div>

      <div className="text-center max-w-2xl mb-12 animate-in slide-in-from-bottom-4 fade-in duration-700 delay-100 fill-mode-both">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-green-100 text-green-700 text-sm font-medium mb-6">
          <CheckCircle2 className="w-4 h-4" /> Successfully Published
        </div>
        <h1 className="font-serif text-4xl md:text-5xl font-bold text-slate-900 mb-4 tracking-tight">
          Your portfolio is live!
        </h1>
        <p className="text-slate-500 text-lg">
          Your professional presence is ready to be shared with the world. Add this link to your resume, LinkedIn, and social profiles.
        </p>
      </div>

      <Card className="w-full max-w-2xl p-2 md:p-3 shadow-lg shadow-blue-900/5 mb-12 animate-in zoom-in-95 fade-in duration-700 delay-200 fill-mode-both">
        <div className="flex flex-col md:flex-row items-center gap-3 bg-slate-50 rounded-xl p-4 border border-slate-100">
          <div className="flex-1 flex items-center gap-3 overflow-hidden w-full">
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5 text-blue-600" />
            </div>
            <div className="truncate">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Your Public URL</p>
              <p className="text-lg md:text-xl font-medium text-slate-900 truncate">
                https://<span className="text-blue-600">{url}</span>
              </p>
            </div>
          </div>
          <div className="flex gap-2 w-full md:w-auto mt-4 md:mt-0">
            <Button variant="secondary" className="flex-1 md:flex-none" onClick={copyToClipboard}>
              {copied ? <CheckCircle2 className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
              {copied ? 'Copied' : 'Copy'}
            </Button>
            <Button className="flex-1 md:flex-none">
              Visit Site <ExternalLink className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>
      </Card>

      <div className="w-full max-w-4xl grid md:grid-cols-3 gap-6 animate-in slide-in-from-bottom-8 fade-in duration-700 delay-300 fill-mode-both">
        <div className="col-span-full mb-2">
          <h2 className="text-lg font-bold text-slate-900">Next Steps Dashboard</h2>
        </div>
        
        <Card className="p-6 hover:shadow-md transition-shadow group cursor-pointer border-slate-200">
          <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <User className="w-5 h-5" />
          </div>
          <h3 className="font-semibold text-slate-900 mb-1">Complete Profile</h3>
          <p className="text-sm text-slate-500 mb-4">Add your projects, skills, and social links.</p>
          <div className="flex items-center text-sm font-medium text-blue-600">
            Edit Profile <ArrowRight className="w-4 h-4 ml-1" />
          </div>
        </Card>

        <Card className="p-6 hover:shadow-md transition-shadow group cursor-pointer border-slate-200">
          <div className="w-10 h-10 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <FileText className="w-5 h-5" />
          </div>
          <h3 className="font-semibold text-slate-900 mb-1">Update Resume</h3>
          <p className="text-sm text-slate-500 mb-4">Keep your parsed experience up to date.</p>
          <div className="flex items-center text-sm font-medium text-purple-600">
            Manage Resume <ArrowRight className="w-4 h-4 ml-1" />
          </div>
        </Card>

        <Card className="p-6 hover:shadow-md transition-shadow group cursor-pointer border-slate-200">
          <div className="w-10 h-10 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <Settings className="w-5 h-5" />
          </div>
          <h3 className="font-semibold text-slate-900 mb-1">Settings</h3>
          <p className="text-sm text-slate-500 mb-4">Change theme, domain, and account details.</p>
          <div className="flex items-center text-sm font-medium text-slate-600">
            Open Settings <ArrowRight className="w-4 h-4 ml-1" />
          </div>
        </Card>
      </div>
    </div>
  );
}
