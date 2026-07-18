import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useOnboarding } from '../context/OnboardingContext';
import { Button, Card } from '../design-system/primitives';
import { ArrowRight, CheckCircle2, Eye, X } from 'lucide-react';
import { cn } from '../design-system/primitives';

const TEMPLATES = [
  {
    id: 'minimal',
    name: 'Minimal',
    description: 'Clean, typography-driven layout perfect for developers.',
    layoutClass: 'flex-col'
  },
  {
    id: 'cura-futuri',
    name: 'Cura Futuri',
    description: 'Modern, high-contrast design for interactive experiences.',
    layoutClass: 'flex-col'
  },
  {
    id: 'sierra-montana',
    name: 'Sierra Montana',
    description: 'Elegant storytelling with smooth locomotive scrolling.',
    layoutClass: 'flex-col'
  },
  {
    id: 'nico-palmer',
    name: 'Nico Palmer',
    description: 'Bold, cinematic typography for motion designers.',
    layoutClass: 'flex-col'
  }
];

const TEMPLATE_PREVIEW_URLS: Record<string, string> = {
  minimal: 'https://resilient-hummingbird-87fc89.netlify.app/',
  'cura-futuri': '',
  'sierra-montana': 'http://localhost:5500', // TODO: Replace with deployed URL
  'nico-palmer': 'http://localhost:5175' // TODO: Replace with deployed URL
};

const getTemplatePreviewUrl = (templateId: string, handle: string) =>
  templateId === 'cura-futuri'
    ? `/api/render/${encodeURIComponent(handle || 'portfolio')}/cura-futuri/`
    : TEMPLATE_PREVIEW_URLS[templateId];

const THEMES = [
  { id: 'blue', label: 'Navy', hex: 'bg-blue-600', textHex: 'text-blue-600' },
  { id: 'emerald', label: 'Emerald', hex: 'bg-emerald-600', textHex: 'text-emerald-600' },
  { id: 'rose', label: 'Rose', hex: 'bg-rose-600', textHex: 'text-rose-600' },
  { id: 'violet', label: 'Violet', hex: 'bg-violet-600', textHex: 'text-violet-600' },
];

const THEME_BGS = [
  { id: 'grid', label: 'Clean Grid', desc: 'Subtle blueprint canvas' },
  { id: 'dots', label: 'Minimalist Dots', desc: 'Clean dot matrix overlay' },
  { id: 'waves', label: 'Abstract Waves', desc: 'Soft vector wave curves' },
  { id: 'solid', label: 'Accent Gradient', desc: 'Vibrant color blend' },
];

/** Templates that honor themeColor + themeBg from the portal */
const THEMEABLE_TEMPLATES = new Set(['minimal', 'cura-futuri']);

export default function Step7Theme() {
  const { data, updateData, nextStep } = useOnboarding();
  const [selectedTemplate, setSelectedTemplate] = useState(data.templateId || 'minimal');
  const [selectedTheme, setSelectedTheme] = useState(data.themeColor || 'blue');
  const [selectedThemeBg, setSelectedThemeBg] = useState(data.themeBg || 'grid');
  const [previewTemplate, setPreviewTemplate] = useState<string | null>(null);
  const [isSwooshing, setIsSwooshing] = useState(false);
  const showThemeOptions = THEMEABLE_TEMPLATES.has(selectedTemplate);
  const previewHandle = data.handle || 'portfolio';

  const handleContinue = () => {
    updateData({
      templateId: selectedTemplate,
      themeColor: selectedTheme,
      themeBg: selectedThemeBg,
    });
    setIsSwooshing(true);
    setTimeout(() => {
      nextStep(7);
    }, 600);
  };

  const getThemeClass = (isBg = true) => {
    const t = THEMES.find(t => t.id === selectedTheme);
    return t ? (isBg ? t.hex : t.textHex) : 'bg-slate-900';
  };

  return (
    <div className="flex flex-col h-full max-w-4xl w-full mx-auto pb-10">
      <div className="mb-8 text-center md:text-left flex flex-col md:flex-row justify-between items-end gap-6">
        <div>
          <h1 className="font-serif text-3xl md:text-4xl font-bold text-slate-900 mb-3 tracking-tight">
            Template & Theme
          </h1>
          <p className="text-slate-500 text-base md:text-lg">
            Pick a layout and color palette for your public portfolio.
          </p>
        </div>
        
        {showThemeOptions ? (
          <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-3 shrink-0 animate-in slide-in-from-right-3 duration-300 max-w-sm">
            <div>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-1">Accent Color</span>
              <div className="flex gap-2 mt-2">
                {THEMES.map(theme => (
                  <button
                    key={theme.id}
                    type="button"
                    onClick={() => setSelectedTheme(theme.id)}
                    className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center transition-all shadow-sm ring-offset-2 hover:scale-110",
                      theme.hex,
                      selectedTheme === theme.id ? "ring-2 ring-slate-900" : ""
                    )}
                    title={theme.label}
                  >
                    {selectedTheme === theme.id && <CheckCircle2 className="w-4 h-4 text-white" />}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-1">Background Style</span>
              <div className="grid grid-cols-2 gap-1.5 mt-2">
                {THEME_BGS.map(bg => (
                  <button
                    key={bg.id}
                    type="button"
                    onClick={() => setSelectedThemeBg(bg.id)}
                    className={cn(
                      "px-2 py-1.5 rounded-lg border text-left transition-all",
                      selectedThemeBg === bg.id
                        ? "border-slate-900 bg-slate-900/5 ring-1 ring-slate-900"
                        : "border-slate-200 hover:border-slate-300"
                    )}
                    title={bg.desc}
                  >
                    <span className="block text-[11px] font-bold text-slate-900 leading-tight">{bg.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/60 flex items-center justify-center min-h-[74px] shrink-0 px-4">
            <span className="text-xs font-medium text-slate-400 text-center">
              Theme customization unlocks for Minimal &amp; Cura Futuri
            </span>
          </div>
        )}
      </div>

      <div className="grid md:grid-cols-3 gap-6 flex-1">
        {TEMPLATES.map((tpl) => (
          <Card 
            key={tpl.id}
            className={cn(
              "cursor-pointer transition-all duration-300 border-2 overflow-hidden flex flex-col group",
              selectedTemplate === tpl.id 
                ? "border-slate-900 ring-4 ring-slate-100 shadow-md" 
                : "border-slate-200 hover:border-slate-300 hover:shadow-md"
            )}
            onClick={() => setSelectedTemplate(tpl.id)}
          >
            {/* Mock Thumbnail Preview */}
            <div className="h-48 bg-slate-50 border-b border-slate-100 relative overflow-hidden flex flex-col pointer-events-none select-none">
              {/* Fake browser header */}
              <div className="h-6 bg-white border-b border-slate-200 flex items-center px-2 gap-1.5 shrink-0 z-10">
                <div className="w-2 h-2 rounded-full bg-red-400" />
                <div className="w-2 h-2 rounded-full bg-amber-400" />
                <div className="w-2 h-2 rounded-full bg-green-400" />
                <span className="text-[9px] text-slate-400 font-mono ml-2 truncate">
                  {getTemplatePreviewUrl(tpl.id, previewHandle).replace('https://', '')}
                </span>
              </div>
              
              {/* Miniature Website Iframe */}
              <div className="w-[300%] h-[300%] origin-top-left scale-[0.333] pointer-events-none select-none shrink-0">
                <iframe 
                  src={getTemplatePreviewUrl(tpl.id, previewHandle)}
                  title={`${tpl.id} Thumbnail`}
                  className="w-full h-full border-0"
                  tabIndex={-1}
                />
              </div>

              {/* Actions Overlay */}
              <div className={cn(
                "absolute inset-0 bg-slate-900/5 flex flex-col items-center justify-center gap-3 transition-opacity backdrop-blur-[1px] z-20 pointer-events-auto",
                selectedTemplate === tpl.id ? "opacity-100" : "opacity-0 group-hover:opacity-100"
              )}>
                {selectedTemplate === tpl.id && (
                  <div className="bg-slate-900 text-white rounded-full p-1.5 shadow-lg">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                )}
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="bg-white/90 backdrop-blur border-white/50 text-slate-900 shadow-sm hover:bg-white"
                  onClick={(e) => { e.stopPropagation(); setPreviewTemplate(tpl.id); }}
                >
                  <Eye className="w-4 h-4 mr-2" /> Live Preview
                </Button>
              </div>
            </div>

            <div className="p-5 bg-white flex-1">
              <h3 className="font-bold text-slate-900 mb-1 flex items-center justify-between">
                {tpl.name}
              </h3>
              <p className="text-sm text-slate-500 leading-relaxed">
                {tpl.description}
              </p>
            </div>
          </Card>
        ))}
      </div>

      <div className="mt-10 flex justify-end pt-6 border-t border-slate-200">
        <button
          type="button"
          className={`w-full md:w-auto md:min-w-[240px] h-14 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl font-semibold text-base transition-all duration-200 flex items-center justify-center gap-3 group cursor-pointer shadow-lg shadow-slate-900/20 btn-continue-wrap px-6${isSwooshing ? ' is-swooshing' : ''}`}
          onClick={handleContinue}
          disabled={isSwooshing}
        >
          <div className="w-9 h-9 bg-indigo-500 rounded-xl flex items-center justify-center arrow-box shrink-0">
            <ArrowRight className="w-5 h-5 text-white" />
          </div>
          <span className="btn-label">Publish Portfolio</span>
        </button>
      </div>

      {/* Custom Fullscreen Preview Modal */}
      {previewTemplate && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 md:p-6 animate-in fade-in">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setPreviewTemplate(null)} />
          <div className="bg-slate-100 w-full h-[90vh] max-w-5xl rounded-2xl shadow-2xl relative flex flex-col overflow-hidden animate-in zoom-in-95">
            <div className="bg-white border-b border-slate-200 p-4 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-400" />
                <div className="w-3 h-3 rounded-full bg-amber-400" />
                <div className="w-3 h-3 rounded-full bg-green-400" />
                <span className="ml-4 text-xs font-mono text-slate-500">
                  {getTemplatePreviewUrl(previewTemplate, previewHandle).replace('https://', '')}
                </span>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setPreviewTemplate(null)}>
                <X className="w-5 h-5" />
              </Button>
            </div>
            
            <div className="flex-1 w-full h-full relative bg-slate-50">
              <iframe 
                src={getTemplatePreviewUrl(previewTemplate, previewHandle)}
                title={`${previewTemplate} Preview`}
                className="w-full h-full rounded-b-xl border-none bg-white"
                onLoad={(e) => {
                  if (data) {
                    const iframeWindow = (e.target as HTMLIFrameElement).contentWindow;
                    iframeWindow?.postMessage({ type: 'BEXO_PROFILE_UPDATE', profile: data }, '*');
                  }
                }}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                allowFullScreen
              />
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
