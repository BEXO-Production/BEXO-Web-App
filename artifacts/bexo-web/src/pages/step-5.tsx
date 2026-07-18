import React, { useState, useRef } from 'react';
import { useOnboarding } from '../context/OnboardingContext';
import { Button } from '../design-system/primitives';
import { UploadCloud, FileText, CheckCircle2, Loader2, ArrowRight, Lightbulb } from 'lucide-react';
import { cn } from '../design-system/primitives';

const PARSING_STEPS = [
  "Uploading your resume secure file...",
  "Initializing Gemma 2B Parser model...",
  "Analyzing text layouts and segments...",
  "Extracting contact info & links...",
  "Reading your school & university details...",
  "Structuring experience & durations...",
  "Identifying project skills & achievements...",
  "Creating profile summary & headlines...",
  "Compiling your portfolio database..."
];

const PORTFOLIO_TIPS = [
  {
    topic: "Showcase Proof of Work",
    tip: "Link live demos and GitHub repos so recruiters can verify your coding skills instantly with a single click."
  },
  {
    topic: "Tell the Story Behind Projects",
    tip: "Write brief 'how-to' summaries. Hiring managers value your problem-solving process over just finished code."
  },
  {
    topic: "Optimized for Mobile Viewports",
    tip: "Test your site on mobile devices. Over 40% of initial portfolio views by hiring managers happen on-the-go."
  },
  {
    topic: "Verifiable Supporting Media",
    tip: "Upload PDFs of certificates or hackathon wins. Verifiable proof boosts profile credibility and trust."
  },
  {
    topic: "Clear Call-to-Actions",
    tip: "Add a prominent 'Download Resume' button at the top. Make finding your PDF resume effortless for recruiters."
  }
];

export default function Step5Resume() {
  const { data, updateData, nextStep } = useOnboarding();
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'parsing' | 'success' | 'transitioning'>(
    data.resumeFileName ? 'success' : 'idle'
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isSwooshing, setIsSwooshing] = useState(false);
  const [parsingStep, setParsingStep] = useState(0);
  const [tipIndex, setTipIndex] = useState(0);

  React.useEffect(() => {
    let interval: number;
    if (status === 'parsing') {
      interval = window.setInterval(() => {
        setParsingStep(idx => (idx + 1) % PARSING_STEPS.length);
      }, 1800);
    } else {
      setParsingStep(0);
    }
    return () => clearInterval(interval);
  }, [status]);

  React.useEffect(() => {
    let interval: number;
    if (status === 'uploading' || status === 'parsing') {
      interval = window.setInterval(() => {
        setTipIndex(idx => (idx + 1) % PORTFOLIO_TIPS.length);
      }, 5000);
    } else {
      setTipIndex(0);
    }
    return () => clearInterval(interval);
  }, [status]);

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
        let errMsg = 'Failed to process resume';
        try {
          const errData = await res.json();
          errMsg = errData.error || errMsg;
        } catch (e) {
          errMsg = `Server error (${res.status}): ${res.statusText || 'Gateway Timeout or API Error'}`;
        }
        throw new Error(errMsg);
      }

      setStatus('parsing');
      const result = await res.json();
      const parsed = result.data;

      const defaultAssets = { mode: 'images' as const, images: [], pdfs: [], links: [] };

      const contactLinks = parsed.links || [];
      const linkedin = contactLinks.find((l: any) => l.name?.toLowerCase().includes("linkedin"))?.url || "";
      const github = contactLinks.find((l: any) => l.name?.toLowerCase().includes("github"))?.url || "";
      const portfolio = contactLinks.find((l: any) => !l.name?.toLowerCase().includes("linkedin") && !l.name?.toLowerCase().includes("github"))?.url || "";

      // Map parsed data into Context fields
      updateData({
        name: parsed.name || data.name,
        firstName: parsed.name ? parsed.name.split(' ')[0] : data.firstName,
        lastName: parsed.name ? parsed.name.split(' ').slice(1).join(' ') : data.lastName,
        phone: parsed.phone || data.phone || '',
        pronouns: parsed.pronouns || data.pronouns || 'He/Him',
        contactData: {
          email: parsed.email || data.contactData.email || '',
          linkedin,
          github,
          portfolio,
          customLinks: contactLinks
        },
        resumeFileName: selectedFile.name,
        resumeFileSize: selectedFile.size,
        resumeUrl: result.resumeUrl || '',
        aboutEntries: (() => {
          const latestEdu = parsed.education && parsed.education.length > 0 ? `${parsed.education[0].degree} at ${parsed.education[0].institution}` : '';
          const latestExp = parsed.experience && parsed.experience.length > 0 ? `${parsed.experience[0].role} at ${parsed.experience[0].company}` : '';
          const currentStatus = latestExp || latestEdu || '';
          const candidateName = parsed.name || data.name || '';
          let generatedSummary = parsed.bio || '';
          if (!generatedSummary) {
            generatedSummary = `${candidateName} is an aspiring professional`;
            if (latestEdu) {
              generatedSummary += ` studying ${parsed.education[0].degree} at ${parsed.education[0].institution}`;
            }
            if (latestExp) {
              generatedSummary += ` with experience as a ${parsed.experience[0].role} at ${parsed.experience[0].company}`;
            }
            generatedSummary += '.';
          }
          return [
            { id: '1', title: parsed.headline || 'Software Engineer Intern', description: generatedSummary, currentStatus }
          ];
        })(),
        educationEntries: (parsed.education || []).map((edu: any, idx: number) => {
          let startYear = '';
          let endYear = '';
          const yr = edu.year || '';
          if (yr.includes('-')) {
            const parts = yr.split('-');
            startYear = parts[0]?.trim() || '';
            endYear = parts[1]?.trim() || '';
          } else {
            endYear = yr;
          }
          return {
            id: String(idx + 1),
            institution: edu.institution || '',
            degree: edu.degree || '',
            startYear,
            endYear,
            year: yr,
            grade: edu.grade || ''
          };
        }),
        experienceEntries: (parsed.experience || []).map((exp: any, idx: number) => {
          let startYear = '';
          let endYear = '';
          const dur = exp.duration || '';
          if (dur.includes('-')) {
            const parts = dur.split('-');
            startYear = parts[0]?.trim() || '';
            endYear = parts[1]?.trim() || '';
          } else {
            endYear = dur;
          }
          return {
            id: String(idx + 1),
            company: exp.company || '',
            role: exp.role || '',
            startYear,
            endYear,
            duration: dur,
            description: exp.description || ''
          };
        }),
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
            <p className="text-slate-500 text-sm mb-3">PDF formats only, up to 15MB.</p>
            {errorMsg && <p className="text-red-500 text-sm font-medium">{errorMsg}</p>}
          </div>
        )}

        {(status === 'uploading' || status === 'parsing') && (
          <div className="flex flex-col items-center animate-in fade-in zoom-in-95">
            {/* Custom Scanning Animation */}
            <div className="relative w-28 h-36 bg-slate-50 border border-slate-200 rounded-2xl shadow-sm flex flex-col justify-between p-3.5 overflow-hidden mb-6 group bg-[linear-gradient(to_bottom,rgba(248,250,252,0.8),rgba(241,245,249,0.8))]">
              {/* Laser line overlay */}
              <div className="absolute left-0 right-0 h-0.5 bg-indigo-500 animate-scan-laser shadow-[0_0_8px_rgba(99,102,241,0.6)]" />
              
              {/* Simulated text lines */}
              <div className="space-y-2 relative z-10">
                <div className="h-2 w-3/4 bg-slate-200 rounded-full" />
                <div className="h-1.5 w-full bg-slate-100 rounded-full" />
                <div className="h-1.5 w-5/6 bg-slate-100 rounded-full" />
                <div className="h-1.5 w-2/3 bg-slate-100 rounded-full" />
              </div>
              <div className="space-y-2 mt-4 relative z-10">
                <div className="h-2 w-1/2 bg-slate-200 rounded-full" />
                <div className="h-1.5 w-full bg-slate-100 rounded-full" />
                <div className="h-1.5 w-4/5 bg-slate-100 rounded-full" />
              </div>
            </div>

            <h3 className="text-lg font-semibold text-slate-800 mb-1 max-w-xs text-center transition-all duration-300 min-h-[56px] flex items-center justify-center">
              {status === 'uploading' ? 'Uploading resume secure file...' : PARSING_STEPS[parsingStep]}
            </h3>
            
            <div className="w-full max-w-xs mt-4 h-1.5 bg-indigo-50 rounded-full overflow-hidden">
              <div 
                className={cn(
                  "h-full bg-indigo-600 rounded-full transition-all duration-1000 ease-out",
                  status === 'uploading' ? "w-1/3" : "w-4/5"
                )}
              />
            </div>
            <p className="text-slate-400 text-xs mt-3 flex items-center gap-1.5 mb-6">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-500" />
              This takes just a moment...
            </p>

            {/* Creative Portfolio Tip Box */}
            <div className="w-full max-w-sm bg-gradient-to-br from-indigo-50/60 to-purple-50/40 border border-indigo-100/80 rounded-2xl p-4 text-left shadow-sm animate-in fade-in duration-500">
              <div className="flex gap-3 items-start">
                <div className="w-9 h-9 rounded-xl bg-indigo-500/10 text-indigo-600 flex items-center justify-center shrink-0 shadow-inner">
                  <Lightbulb className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-indigo-500 block">
                    💡 Portfolio Tip • {PORTFOLIO_TIPS[tipIndex].topic}
                  </span>
                  <p className="text-slate-600 text-xs leading-relaxed transition-all duration-300">
                    {PORTFOLIO_TIPS[tipIndex].tip}
                  </p>
                </div>
              </div>
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
