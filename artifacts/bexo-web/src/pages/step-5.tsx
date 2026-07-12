import React, { useState, useRef } from 'react';
import { useOnboarding } from '../context/OnboardingContext';
import { Button } from '../design-system/primitives';
import { UploadCloud, FileText, CheckCircle2, Loader2, ArrowRight } from 'lucide-react';
import { cn } from '../design-system/primitives';

export default function Step5Resume() {
  const { data, updateData, nextStep } = useOnboarding();
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'parsing' | 'success' | 'transitioning'>(
    data.resumeFileName ? 'success' : 'idle'
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isSwooshing, setIsSwooshing] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile && selectedFile.type === 'application/pdf') {
      setFile(selectedFile);
      processFile(selectedFile);
    } else if (selectedFile) {
      setErrorMsg('Please select a valid PDF file.');
    }
  };

  const processFile = async (selectedFile: File) => {
    setStatus('uploading');
    setErrorMsg(null);

    const formData = new FormData();
    formData.append('resume', selectedFile);

    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5001';
      const token = localStorage.getItem('token');

      const res = await fetch(`${apiUrl}/api/profile/resume`, {
        method: 'POST',
        headers: {
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: formData
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to process resume');
      }

      setStatus('parsing');
      const result = await res.json();
      const parsed = result.data;

      const defaultAssets = { mode: 'images' as const, images: [], pdfs: [], links: [] };

      // Map parsed data into Context fields
      updateData({
        resumeFileName: selectedFile.name,
        resumeFileSize: selectedFile.size,
        aboutEntries: [
          { id: '1', title: parsed.headline || 'Software Engineer Intern', description: parsed.bio || '' }
        ],
        educationEntries: (parsed.education || []).map((edu: any, idx: number) => ({
          id: String(idx + 1),
          institution: edu.institution || '',
          degree: edu.degree || '',
          year: edu.year || '',
          grade: edu.grade || ''
        })),
        experienceEntries: (parsed.experience || []).map((exp: any, idx: number) => ({
          id: String(idx + 1),
          company: exp.company || '',
          role: exp.role || '',
          duration: exp.duration || '',
          description: exp.description || ''
        })),
        projectEntries: (parsed.projects || []).map((proj: any, idx: number) => ({
          id: String(idx + 1),
          title: proj.title || '',
          description: proj.description || '',
          tech: proj.tech || '',
          link: '',
          assets: defaultAssets
        })),
        certificateEntries: (parsed.certificates || []).map((cert: any, idx: number) => ({
          id: String(idx + 1),
          title: cert.title || '',
          issuer: cert.issuer || '',
          date: cert.date || '',
          assets: defaultAssets
        })),
        achievementEntries: (parsed.achievements || []).map((ach: any, idx: number) => ({
          id: String(idx + 1),
          title: ach.title || '',
          organization: ach.organization || '',
          date: ach.date || '',
          assets: defaultAssets
        }))
      });

      setStatus('success');
      setTimeout(() => {
        setStatus('transitioning');
        setTimeout(() => {
          nextStep(5);
        }, 1000);
      }, 1500);

    } catch (err: any) {
      setStatus('idle');
      setFile(null);
      setErrorMsg(err.message || 'Failed to process resume. Please try again.');
    }
  };

  const handleContinue = () => {
    setIsSwooshing(true);
    setTimeout(() => {
      nextStep(5);
    }, 600);
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
          (status === 'success' || status === 'transitioning') ? "border-green-500 bg-green-50/30" :
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
            <div className="w-16 h-16 bg-indigo-100 text-indigo-500 rounded-full flex items-center justify-center mb-4">
              <UploadCloud className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mb-1">Click to upload PDF</h3>
            <p className="text-slate-500 text-sm mb-3">PDF formats only, up to 5MB.</p>
            {errorMsg && <p className="text-red-500 text-sm font-medium">{errorMsg}</p>}
          </div>
        )}

        {(status === 'uploading' || status === 'parsing') && (
          <div className="flex flex-col items-center animate-in fade-in zoom-in-95">
            <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mb-4 relative">
              <Loader2 className="w-8 h-8 animate-spin" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mb-1">
              {status === 'uploading' ? 'Uploading resume...' : 'Parsing your details with Gemma AI...'}
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

        {(status === 'success' || status === 'transitioning') && (
          <div className="flex flex-col items-center animate-in fade-in zoom-in-95">
            <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-4">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mb-1">
              {status === 'transitioning' ? 'Preparing your review...' : 'Parsing Complete'}
            </h3>
            <div className="flex items-center gap-2 text-slate-600 bg-white border border-slate-200 px-4 py-2 rounded-lg mt-2 shadow-sm">
              <FileText className="w-4 h-4 text-indigo-500" />
              <span className="text-sm font-medium truncate max-w-[200px]">
                {file?.name || data.resumeFileName}
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="pt-8">
        <button
          type="button"
          className={`w-full h-14 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl font-semibold text-base transition-all duration-200 flex items-center justify-center gap-3 group disabled:opacity-50 disabled:pointer-events-none cursor-pointer shadow-lg shadow-slate-900/20 btn-continue-wrap px-6${isSwooshing ? ' is-swooshing' : ''}`}
          disabled={status !== 'success' || isSwooshing}
          onClick={handleContinue}
        >
          <div className="w-9 h-9 bg-indigo-500 rounded-xl flex items-center justify-center arrow-box shrink-0">
            <ArrowRight className="w-5 h-5 text-white" />
          </div>
          <span className="btn-label">Review Extracted Data</span>
        </button>
        {status === 'idle' && (
          <p className="text-center text-sm text-slate-500 mt-4">
            Don't have a resume? <button onClick={() => { updateData({ resumeFileName: 'manual_entry', resumeFileSize: 0 }); nextStep(5); }} className="text-indigo-500 font-medium hover:underline cursor-pointer">Enter manually</button>
          </p>
        )}
      </div>
    </div>
  );
}
