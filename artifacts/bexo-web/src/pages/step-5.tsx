import React, { useState, useRef } from 'react';
import { useOnboarding } from '../context/OnboardingContext';
import { Button } from '../design-system/primitives';
import { UploadCloud, FileText, CheckCircle2, Loader2, ArrowRight, Lightbulb } from 'lucide-react';
import { cn } from '../design-system/primitives';
import { apiUrl } from '../lib/api';

const PARSING_STEPS = [
  { time: "0.0s", text: "⚡ Initializing AI Resilience Engine (Gemini 1.5 / Grok)" },
  { time: "1.8s", text: "📄 Reading PDF text layout, contact details & links" },
  { time: "3.6s", text: "🎓 Extracting education history, degrees & institutions" },
  { time: "5.4s", text: "💼 Mapping work experience, roles & key achievements" },
  { time: "7.2s", text: "✍️ Synthesizing executive bio (<200 words / max 200 chars)" },
  { time: "9.0s", text: "🚀 Compiling portfolio database & skills catalog" }
];

/** Shown whenever parsing could not complete. Never surface provider errors. */
const PARSE_BUSY_MESSAGE =
  "We could not finish reading your resume right now. Please try again in about 10 minutes — your file is safe and nothing was lost.";

const POLL_INTERVAL_MS = 2000;
/** Generous ceiling: queued jobs still finish well inside this during spikes. */
const POLL_TIMEOUT_MS = 4 * 60 * 1000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
  const [elapsedTime, setElapsedTime] = useState(0);
  const [extractedSummary, setExtractedSummary] = useState<{
    skillsCount: number;
    skillsSample: string[];
    expCount: number;
    eduCount: number;
    bioLength: number;
    bioWordCount: number;
  } | null>(null);

  React.useEffect(() => {
    let interval: number;
    if (status === 'uploading' || status === 'parsing') {
      const startTime = Date.now();
      interval = window.setInterval(() => {
        const secs = ((Date.now() - startTime) / 1000).toFixed(1);
        setElapsedTime(Number(secs));
        setParsingStep(idx => {
          if (idx < PARSING_STEPS.length - 1) return idx + 1;
          return idx;
        });
      }, 1600);
    } else {
      setParsingStep(0);
      setElapsedTime(0);
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

  /**
   * Parsing runs as a background job. Poll until it finishes so a busy queue or
   * a slow AI provider never turns into a request timeout for the user.
   */
  const waitForParseResult = async (attemptId: string, token: string | null) => {
    const deadline = Date.now() + POLL_TIMEOUT_MS;

    while (Date.now() < deadline) {
      await sleep(POLL_INTERVAL_MS);

      const res = await fetch(apiUrl(`/api/profile/resume/status/${attemptId}`), {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });

      if (!res.ok) continue;

      const body = await res.json().catch(() => null);
      if (!body) continue;

      if (body.status === 'succeeded') return body;
      if (body.status === 'failed') throw new Error(PARSE_BUSY_MESSAGE);
    }

    throw new Error(PARSE_BUSY_MESSAGE);
  };

  const processFile = async (selectedFile: File) => {
    setStatus('uploading');
    setErrorMsg(null);

    const formData = new FormData();
    formData.append('resume', selectedFile);

    try {
      const token = localStorage.getItem('token');

      const res = await fetch(apiUrl('/api/profile/resume'), {
        method: 'POST',
        headers: {
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: formData
      });

      const uploadBody = await res.json().catch(() => null);

      if (!res.ok) {
        const actionableCodes = [
          'UPGRADE_REQUIRED',
          'LIMIT_REACHED',
          'PDF_UNREADABLE',
          'PARSE_IN_PROGRESS',
          'PARSE_COOLDOWN',
        ];
        const code = uploadBody?.code;
        const message =
          code && actionableCodes.includes(code) && uploadBody?.error
            ? uploadBody.error
            : res.status === 429 && uploadBody?.error
              ? uploadBody.error
              : PARSE_BUSY_MESSAGE;
        throw new Error(message);
      }

      setStatus('parsing');

      const result = uploadBody?.status === 'succeeded'
        ? uploadBody
        : await waitForParseResult(String(uploadBody?.attemptId || ''), token);

      const parsed = result?.data;
      if (!parsed) throw new Error(PARSE_BUSY_MESSAGE);

      const defaultAssets = { mode: 'images' as const, images: [], pdfs: [], links: [] };

      const contactLinks = parsed.links || [];
      const linkedin = contactLinks.find((l: any) => l.name?.toLowerCase().includes("linkedin"))?.url || "";
      const github = contactLinks.find((l: any) => l.name?.toLowerCase().includes("github"))?.url || "";
      const portfolio = contactLinks.find((l: any) => !l.name?.toLowerCase().includes("linkedin") && !l.name?.toLowerCase().includes("github"))?.url || "";

      let bioText = parsed.bio || '';
      if (!bioText) {
        const latestEdu = parsed.education && parsed.education.length > 0 ? `${parsed.education[0].degree} at ${parsed.education[0].institution}` : '';
        const latestExp = parsed.experience && parsed.experience.length > 0 ? `${parsed.experience[0].role} at ${parsed.experience[0].company}` : '';
        const candidateName = parsed.name || data.name || '';
        bioText = `${candidateName} is an ambitious professional`;
        if (latestEdu) bioText += ` studying ${latestEdu}`;
        if (latestExp) bioText += ` with experience as a ${latestExp}`;
        bioText += '.';
      }

      // Enforce strict bio word/letter summary ceiling (< 200 words / ~200 chars)
      const words = bioText.trim().split(/\s+/);
      if (words.length > 180) {
        bioText = words.slice(0, 180).join(' ') + '...';
      }

      const allSkills = (parsed.skills || []).map((sk: any) => typeof sk === 'string' ? sk : (sk.name || sk.title || '')).filter(Boolean);

      setExtractedSummary({
        skillsCount: allSkills.length,
        skillsSample: allSkills.slice(0, 5),
        expCount: (parsed.experience || []).length,
        eduCount: (parsed.education || []).length,
        bioLength: bioText.length,
        bioWordCount: bioText.trim().split(/\s+/).length,
      });

      // Map parsed data into Context fields including bio
      updateData({
        name: parsed.name || data.name,
        firstName: parsed.name ? parsed.name.split(' ')[0] : data.firstName,
        lastName: parsed.name ? parsed.name.split(' ').slice(1).join(' ') : data.lastName,
        phone: parsed.phone || data.phone || '',
        pronouns: parsed.pronouns || data.pronouns || 'He/Him',
        bio: bioText,
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
        aboutEntries: [
          { 
            id: '1', 
            title: parsed.headline || 'Software Engineer Intern', 
            description: bioText, 
            currentStatus: (parsed.experience?.[0] ? `${parsed.experience[0].role} at ${parsed.experience[0].company}` : (parsed.education?.[0] ? `${parsed.education[0].degree} at ${parsed.education[0].institution}` : ''))
          }
        ],
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
        })),
        skillEntries: (parsed.skills || []).map((sk: any, idx: number) => {
          const cat = String(sk?.category || 'technical').toLowerCase();
          return {
            id: String(idx + 1),
            name: typeof sk === 'string' ? sk : (sk.name || sk.title || ''),
            category: (cat === 'tools' || cat === 'soft' || cat === 'languages' ? cat : 'technical') as 'technical' | 'tools' | 'soft' | 'languages',
          };
        }).filter((s: any) => s.name),
      });

      setStatus('success');
      setTimeout(() => {
        setStatus('transitioning');
        setTimeout(() => {
          nextStep(5);
        }, 1200);
      }, 2000);

    } catch (err: any) {
      setStatus('idle');
      setFile(null);
      setErrorMsg(err?.message || PARSE_BUSY_MESSAGE);
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
        <h1 className="font-serif text-2xl sm:text-3xl md:text-4xl font-bold text-slate-900 mb-3 tracking-tight">
          Upload Your Resume
        </h1>
        <p className="text-slate-500 text-base md:text-lg">
          We'll automatically extract your experience, education, and skills to build your portfolio.
        </p>
      </div>

      <div 
        className={cn(
          "relative border-2 border-dashed rounded-3xl p-8 text-center transition-all duration-300",
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
            {errorMsg && (
              <p className="max-w-sm rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-left text-xs leading-relaxed font-medium text-amber-800">
                {errorMsg}
              </p>
            )}
          </div>
        )}

        {(status === 'uploading' || status === 'parsing') && (
          <div className="flex flex-col items-center animate-in fade-in zoom-in-95 w-full">
            {/* Custom Scanning Animation */}
            <div className="relative w-28 h-36 bg-slate-50 border border-slate-200 rounded-2xl shadow-sm flex flex-col justify-between p-3.5 overflow-hidden mb-6 group bg-[linear-gradient(to_bottom,rgba(248,250,252,0.8),rgba(241,245,249,0.8))]">
              <div className="absolute left-0 right-0 h-0.5 bg-indigo-500 animate-scan-laser shadow-[0_0_8px_rgba(99,102,241,0.6)]" />
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

            <div className="w-full max-w-sm bg-slate-900 text-slate-100 rounded-2xl p-4 text-left shadow-lg border border-slate-800 space-y-3 font-mono text-xs">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <span className="text-[11px] text-indigo-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-indigo-400 animate-ping" />
                  AI Work / Thought Log
                </span>
                <span className="text-[10px] text-slate-500 font-medium">[{elapsedTime}s]</span>
              </div>
              <div className="space-y-1.5 max-h-36 overflow-y-auto">
                {PARSING_STEPS.slice(0, parsingStep + 1).map((step, i) => (
                  <div key={i} className="flex items-center gap-2 text-slate-300 animate-in fade-in slide-in-from-bottom-1">
                    <span className="text-slate-500 text-[10px] min-w-[36px]">[{step.time}]</span>
                    <span className={i === parsingStep ? "text-indigo-300 font-semibold" : "text-slate-400"}>
                      {step.text}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="w-full max-w-xs mt-4 h-1.5 bg-indigo-50 rounded-full overflow-hidden">
              <div 
                className={cn(
                  "h-full bg-indigo-600 rounded-full transition-all duration-1000 ease-out",
                  status === 'uploading' ? "w-1/3" : "w-4/5"
                )}
              />
            </div>
            <p className="text-slate-400 text-xs mt-3 flex items-center gap-1.5 mb-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-500" />
              Analyzing resume layout & synthesizing profile data...
            </p>
          </div>
        )}

        {(status === 'success' || status === 'transitioning') && (
          <div className="flex flex-col items-center animate-in fade-in zoom-in-95 w-full">
            <div className="w-14 h-14 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-3">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mb-1">
              {status === 'transitioning' ? 'Preparing your review screen...' : 'Resume Parsed Successfully!'}
            </h3>
            
            {extractedSummary && (
              <div className="w-full max-w-sm bg-gradient-to-br from-slate-900 to-indigo-950 text-white rounded-2xl p-4 mt-3 text-left shadow-xl border border-indigo-900/50 space-y-3">
                <div className="flex items-center justify-between border-b border-indigo-900/60 pb-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
                    <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
                    Personalized Extracted Insights
                  </span>
                  <span className="text-[10px] text-emerald-400 font-bold bg-emerald-950/60 border border-emerald-800/60 px-2 py-0.5 rounded-full">
                    ✓ Ready
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-slate-800/80 p-2.5 rounded-xl border border-slate-700/60">
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Skills Found</span>
                    <strong className="text-sm text-indigo-300 font-bold">{extractedSummary.skillsCount} Skills</strong>
                    <p className="text-[10px] text-slate-400 truncate mt-0.5">{extractedSummary.skillsSample.join(', ')}</p>
                  </div>
                  <div className="bg-slate-800/80 p-2.5 rounded-xl border border-slate-700/60">
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Experience & Edu</span>
                    <strong className="text-sm text-indigo-300 font-bold">{extractedSummary.expCount} Roles · {extractedSummary.eduCount} Edu</strong>
                    <p className="text-[10px] text-slate-400 truncate mt-0.5">Timeline structured</p>
                  </div>
                </div>
                <div className="bg-indigo-900/40 p-2.5 rounded-xl border border-indigo-800/50 text-xs">
                  <span className="text-indigo-300 block text-[10px] uppercase font-bold">Executive Bio (&lt; 200 words)</span>
                  <p className="text-slate-200 text-[11px] leading-relaxed mt-1">
                    Created {extractedSummary.bioWordCount} words ({extractedSummary.bioLength} characters) high-impact summary.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="pt-8 onboarding-cta">
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
