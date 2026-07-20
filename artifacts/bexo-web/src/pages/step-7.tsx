import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useOnboarding } from '../context/OnboardingContext';
import { Button, Card } from '../design-system/primitives';
import { ArrowRight, CheckCircle2, Eye, X } from 'lucide-react';
import { cn } from '../design-system/primitives';
import {
  DEFAULT_TEMPLATE_ID,
  getDemoPreviewUrl,
  getSelectableTemplates,
  MARKETING_DEMO_HANDLE,
  THEMEABLE_TEMPLATE_IDS,
} from '../lib/templates';

const TEMPLATES = getSelectableTemplates();

/** Premium template chosen before payment — applied automatically after the plan step. */
export const PENDING_TEMPLATE_KEY = 'bexo_pending_template';

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

export default function Step7Theme() {
  const { data, updateData, nextStep } = useOnboarding();
  const initialTemplate =
    TEMPLATES.some((t) => t.id === data.templateId)
      ? (data.templateId as string)
      : DEFAULT_TEMPLATE_ID;
  const [selectedTemplate, setSelectedTemplate] = useState(initialTemplate);
  const [selectedTheme, setSelectedTheme] = useState(data.themeColor || 'blue');
  const [selectedThemeBg, setSelectedThemeBg] = useState(data.themeBg || 'grid');
  const [previewTemplate, setPreviewTemplate] = useState<string | null>(null);
  const [isSwooshing, setIsSwooshing] = useState(false);
  const showThemeOptions = THEMEABLE_TEMPLATE_IDS.has(selectedTemplate);
  const previewLabel = `${MARKETING_DEMO_HANDLE}.atbexo.com`;

  const handleContinue = () => {
    const chosen = TEMPLATES.find(t => t.id === selectedTemplate);
    if (chosen?.isPro && !data.isPremium) {
      // Server rejects premium templates before payment. Save the choice
      // locally and apply it automatically once the plan step succeeds.
      localStorage.setItem(PENDING_TEMPLATE_KEY, selectedTemplate);
      updateData({
        themeColor: selectedTheme,
        themeBg: selectedThemeBg,
      });
    } else {
      localStorage.removeItem(PENDING_TEMPLATE_KEY);
      updateData({
        templateId: selectedTemplate,
        themeColor: selectedTheme,
        themeBg: selectedThemeBg,
      });
    }
    setIsSwooshing(true);
    setTimeout(() => {
      nextStep(7);
    }, 600);
  };

  return (
    <div className="flex flex-col h-full max-w-4xl w-full mx-auto pb-10 min-w-0">
      <div className="mb-6 sm:mb-8 text-center md:text-left flex flex-col md:flex-row justify-between items-stretch md:items-end gap-4 md:gap-6 min-w-0">
        <div className="min-w-0">
          <h1 className="font-serif text-2xl sm:text-3xl md:text-4xl font-bold text-slate-900 mb-2 sm:mb-3 tracking-tight">
            Template & Theme
          </h1>
          <p className="text-slate-500 text-sm sm:text-base md:text-lg">
            Preview every Pro layout with the BEXO demo portfolio, then pick yours.
          </p>
        </div>
        
        {showThemeOptions ? (
          <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-3 w-full md:w-auto md:max-w-sm shrink-0 animate-in slide-in-from-right-3 duration-300 min-w-0">
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
              Theme customization applies to all layouts
            </span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-6 flex-1">
        {TEMPLATES.map((tpl) => (
          <Card 
            key={tpl.id}
            className={cn(
              "cursor-pointer transition-all duration-300 border-2 overflow-hidden flex flex-col group min-h-0",
              selectedTemplate === tpl.id 
                ? "border-slate-900 ring-4 ring-slate-100 shadow-md" 
                : "border-slate-200 hover:border-slate-300 hover:shadow-md"
            )}
            onClick={() => setSelectedTemplate(tpl.id)}
          >
            {/* Mock Thumbnail Preview */}
            <div className="h-40 sm:h-44 md:h-48 bg-slate-50 border-b border-slate-100 relative overflow-hidden flex flex-col pointer-events-none select-none">
              {/* Fake browser header */}
              <div className="h-6 bg-white border-b border-slate-200 flex items-center px-2 gap-1.5 shrink-0 z-10">
                <div className="w-2 h-2 rounded-full bg-red-400" />
                <div className="w-2 h-2 rounded-full bg-amber-400" />
                <div className="w-2 h-2 rounded-full bg-green-400" />
                <span className="text-[9px] text-slate-400 font-mono ml-2 truncate">
                  {previewLabel}
                </span>
              </div>
              
              {/* Miniature Website Iframe — always demo portfolio */}
              {tpl.previewable ? (
                <div className="w-[300%] h-[300%] origin-top-left scale-[0.333] pointer-events-none select-none shrink-0">
                  <iframe 
                    src={getDemoPreviewUrl(tpl.id)}
                    title={`${tpl.id} Thumbnail`}
                    className="w-full h-full border-0"
                    tabIndex={-1}
                    loading="lazy"
                  />
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center gap-1.5 bg-gradient-to-br from-slate-100 via-white to-indigo-50">
                  <span className="font-serif text-lg font-bold text-slate-300">{tpl.name}</span>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Preview coming soon</span>
                </div>
              )}

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
                {tpl.previewable && (
                  <Button 
                    size="sm" 
                    variant="outline" 
                    className="bg-white/90 backdrop-blur border-white/50 text-slate-900 shadow-sm hover:bg-white"
                    onClick={(e) => { e.stopPropagation(); setPreviewTemplate(tpl.id); }}
                  >
                    <Eye className="w-4 h-4 mr-2" /> Preview demo
                  </Button>
                )}
              </div>
            </div>

            <div className="p-5 bg-white flex-1">
              <h3 className="font-bold text-slate-900 mb-1 flex items-center justify-between gap-2">
                <span>{tpl.name}</span>
                {tpl.isPro && (
                  <span className="text-[9px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded uppercase tracking-wider shrink-0">
                    Pro
                  </span>
                )}
              </h3>
              <p className="text-sm text-slate-500 leading-relaxed">
                {tpl.description}
              </p>
            </div>
          </Card>
        ))}
      </div>

      {TEMPLATES.find(t => t.id === selectedTemplate)?.isPro && !data.isPremium && (
        <div className="mt-6 flex items-start gap-2.5 rounded-xl border border-indigo-100 bg-indigo-50/70 px-4 py-3">
          <CheckCircle2 className="w-4 h-4 text-indigo-500 mt-0.5 shrink-0" />
          <p className="text-xs text-indigo-900 leading-relaxed">
            <span className="font-bold">Pro template selected.</span> You are previewing the BEXO demo
            portfolio — your choice activates automatically once you pick a Pro plan.
          </p>
        </div>
      )}

      <div className="mt-10 flex justify-end pt-6 border-t border-slate-200 onboarding-cta">
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
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-0 md:p-6 animate-in fade-in">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setPreviewTemplate(null)} />
          <div className="bg-slate-100 w-full h-[100dvh] md:h-[90vh] max-w-5xl md:rounded-2xl shadow-2xl relative flex flex-col overflow-hidden animate-in zoom-in-95">
            <div className="bg-white border-b border-slate-200 p-4 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-400" />
                <div className="w-3 h-3 rounded-full bg-amber-400" />
                <div className="w-3 h-3 rounded-full bg-green-400" />
                <span className="ml-4 text-xs font-mono text-slate-500">
                  {previewLabel} · {previewTemplate}
                </span>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setPreviewTemplate(null)}>
                <X className="w-5 h-5" />
              </Button>
            </div>
            
            <div className="flex-1 w-full h-full relative bg-slate-50">
              <iframe 
                src={getDemoPreviewUrl(previewTemplate)}
                title={`${previewTemplate} Preview`}
                className="w-full h-full rounded-b-xl border-none bg-white"
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
