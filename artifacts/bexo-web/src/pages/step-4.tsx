import React, { useState, useRef } from 'react';
import { useOnboarding } from '../context/OnboardingContext';
import { Button } from '../design-system/primitives';
import { UploadCloud, FileText, CheckCircle2, Loader2, ArrowRight } from 'lucide-react';
import { cn } from '../design-system/primitives';

export default function Step4Resume() {
  const { data, updateData, nextStep } = useOnboarding();
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'parsing' | 'success'>(data.resumeFileName ? 'success' : 'idle');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile && selectedFile.type === 'application/pdf') {
      setFile(selectedFile);
      processFile(selectedFile);
    }
  };

  const processFile = (selectedFile: File) => {
    setStatus('uploading');
    
    // Mock upload
    setTimeout(() => {
      setStatus('parsing');
      
      // Mock parsing
      setTimeout(() => {
        setStatus('success');
        updateData({ resumeFileName: selectedFile.name });
      }, 2500);
    }, 1500);
  };

  const handleContinue = () => {
    nextStep(4);
  };

  return (
    <div className="flex flex-col h-full justify-center max-w-lg w-full mx-auto">
      <div className="mb-10 text-center md:text-left">
        <h1 className="font-serif text-3xl md:text-4xl font-bold text-slate-900 mb-3 tracking-tight">
          Upload Your Resume
        </h1>
        <p className="text-slate-500 text-base md:text-lg">
          We'll automatically extract your experience, education, and skills to build your portfolio.
        </p>
      </div>

      <div 
        className={cn(
          "relative border-2 border-dashed rounded-3xl p-10 text-center transition-all duration-300",
          status === 'idle' ? "border-slate-300 hover:border-blue-500 bg-white hover:bg-blue-50/50 cursor-pointer" :
          status === 'success' ? "border-green-500 bg-green-50/30" :
          "border-blue-500 bg-blue-50/30"
        )}
        onClick={() => status === 'idle' && fileInputRef.current?.click()}
      >
        <input 
          type="file" 
          ref={fileInputRef}
          className="hidden" 
          accept="application/pdf"
          onChange={handleFileChange}
        />

        {status === 'idle' && (
          <div className="flex flex-col items-center animate-in fade-in zoom-in-95">
            <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mb-4">
              <UploadCloud className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mb-1">Click to upload PDF</h3>
            <p className="text-slate-500 text-sm">PDF formats only, up to 5MB.</p>
          </div>
        )}

        {(status === 'uploading' || status === 'parsing') && (
          <div className="flex flex-col items-center animate-in fade-in zoom-in-95">
            <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mb-4 relative">
              <Loader2 className="w-8 h-8 animate-spin" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mb-1">
              {status === 'uploading' ? 'Uploading resume...' : 'Parsing your details...'}
            </h3>
            <p className="text-slate-500 text-sm">This takes just a moment.</p>
            
            <div className="w-full max-w-xs mt-6 h-1.5 bg-blue-100 rounded-full overflow-hidden">
              <div 
                className={cn(
                  "h-full bg-blue-600 rounded-full transition-all duration-1000 ease-out",
                  status === 'uploading' ? "w-1/3" : "w-3/4"
                )}
              />
            </div>
          </div>
        )}

        {status === 'success' && (
          <div className="flex flex-col items-center animate-in fade-in zoom-in-95">
            <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-4">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mb-1">Parsing Complete</h3>
            <div className="flex items-center gap-2 text-slate-600 bg-white border border-slate-200 px-4 py-2 rounded-lg mt-2 shadow-sm">
              <FileText className="w-4 h-4 text-blue-600" />
              <span className="text-sm font-medium truncate max-w-[200px]">
                {file?.name || data.resumeFileName}
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="pt-8">
        <Button 
          className="w-full h-14 text-base group"
          disabled={status !== 'success'}
          onClick={handleContinue}
        >
          Review Extracted Data
          <ArrowRight className="w-5 h-5 ml-2 transition-transform group-hover:translate-x-1" />
        </Button>
        {status === 'idle' && (
          <p className="text-center text-sm text-slate-500 mt-4">
            Don't have a resume? <button onClick={() => { updateData({ resumeFileName: 'manual_entry' }); nextStep(4); }} className="text-blue-600 font-medium hover:underline">Enter manually</button>
          </p>
        )}
      </div>
    </div>
  );
}
