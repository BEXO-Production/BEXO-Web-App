import React, { useState } from 'react';
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
    id: 'academic',
    name: 'Academic',
    description: 'Traditional structure, emphasizes research and papers.',
    layoutClass: 'flex-row'
  },
  {
    id: 'creative',
    name: 'Creative',
    description: 'Bold colors and unique grid layouts for designers.',
    layoutClass: 'grid grid-cols-2'
  }
];

const THEMES = [
  { id: 'blue', label: 'Navy', hex: 'bg-blue-600', textHex: 'text-blue-600' },
  { id: 'emerald', label: 'Emerald', hex: 'bg-emerald-600', textHex: 'text-emerald-600' },
  { id: 'rose', label: 'Rose', hex: 'bg-rose-600', textHex: 'text-rose-600' },
  { id: 'amber', label: 'Amber', hex: 'bg-amber-600', textHex: 'text-amber-600' },
  { id: 'violet', label: 'Violet', hex: 'bg-violet-600', textHex: 'text-violet-600' },
];

export default function Step7Theme() {
  const { data, updateData, nextStep } = useOnboarding();
  const [selectedTemplate, setSelectedTemplate] = useState(data.templateId || 'minimal');
  const [selectedTheme, setSelectedTheme] = useState(data.themeColor || 'blue');
  const [previewTemplate, setPreviewTemplate] = useState<string | null>(null);

  const handleContinue = () => {
    updateData({ templateId: selectedTemplate, themeColor: selectedTheme });
    nextStep(7);
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
        
        {/* Theme Picker */}
        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-2 shrink-0">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-1">Accent Color</span>
          <div className="flex gap-2">
            {THEMES.map(theme => (
              <button
                key={theme.id}
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
            <div className="h-48 bg-slate-50 border-b border-slate-100 relative overflow-hidden flex flex-col">
              {/* Fake browser header */}
              <div className="h-6 bg-white border-b border-slate-200 flex items-center px-2 gap-1.5 shrink-0">
                <div className="w-2 h-2 rounded-full bg-slate-200" />
                <div className="w-2 h-2 rounded-full bg-slate-200" />
                <div className="w-2 h-2 rounded-full bg-slate-200" />
              </div>
              
              {/* Fake content */}
              <div className={cn("p-4 flex-1 flex gap-3", tpl.id === 'minimal' ? 'flex-col' : tpl.id === 'academic' ? 'flex-row' : 'grid grid-cols-2')}>
                {tpl.id === 'minimal' && (
                  <>
                    <div className="flex justify-between items-center">
                      <div className={cn("w-8 h-8 rounded-full opacity-20", getThemeClass())} />
                      <div className="flex gap-2">
                        <div className="w-6 h-1.5 rounded bg-slate-200" />
                        <div className="w-6 h-1.5 rounded bg-slate-200" />
                      </div>
                    </div>
                    <div className="mt-2">
                      <div className={cn("w-2/3 h-3 rounded mb-2", getThemeClass())} />
                      <div className="w-1/2 h-1.5 rounded bg-slate-200" />
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-auto">
                      <div className="h-8 rounded bg-white border border-slate-200" />
                      <div className="h-8 rounded bg-white border border-slate-200" />
                    </div>
                  </>
                )}
                
                {tpl.id === 'academic' && (
                  <>
                    <div className="w-1/3 border-r border-slate-200 pr-2 flex flex-col gap-2">
                      <div className={cn("w-8 h-8 rounded-full mb-2", getThemeClass())} />
                      <div className="w-full h-1.5 rounded bg-slate-200" />
                      <div className="w-2/3 h-1.5 rounded bg-slate-200" />
                    </div>
                    <div className="flex-1 flex flex-col gap-2">
                      <div className={cn("w-1/2 h-2 rounded", getThemeClass())} />
                      <div className="w-full h-10 rounded bg-white border border-slate-200" />
                      <div className="w-full h-10 rounded bg-white border border-slate-200" />
                    </div>
                  </>
                )}

                {tpl.id === 'creative' && (
                  <>
                    <div className={cn("col-span-2 h-12 rounded-lg opacity-20 mb-2", getThemeClass())} />
                    <div className="h-16 bg-white border border-slate-200 rounded" />
                    <div className="h-16 bg-white border border-slate-200 rounded" />
                  </>
                )}
              </div>

              {/* Actions Overlay */}
              <div className={cn(
                "absolute inset-0 bg-slate-900/5 flex flex-col items-center justify-center gap-3 transition-opacity backdrop-blur-[1px]",
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
        <Button 
          className="w-full md:w-auto md:min-w-[200px] h-14 text-base group shadow-lg"
          onClick={handleContinue}
        >
          Publish Portfolio
          <ArrowRight className="w-5 h-5 ml-2 transition-transform group-hover:translate-x-1" />
        </Button>
      </div>

      {/* Custom Fullscreen Preview Modal */}
      {previewTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-10 animate-in fade-in">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setPreviewTemplate(null)} />
          <div className="bg-slate-100 w-full h-full max-w-5xl rounded-2xl shadow-2xl relative flex flex-col overflow-hidden animate-in zoom-in-95">
            <div className="bg-white border-b border-slate-200 p-4 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-400" />
                <div className="w-3 h-3 rounded-full bg-amber-400" />
                <div className="w-3 h-3 rounded-full bg-green-400" />
                <span className="ml-4 text-sm font-mono text-slate-500">preview.mybexo.com</span>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setPreviewTemplate(null)}>
                <X className="w-5 h-5" />
              </Button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-8 md:p-12 flex justify-center">
              {/* Dummy Live Preview Content mimicking the template structure */}
              <div className="bg-white w-full max-w-3xl rounded-xl shadow-sm border border-slate-200 min-h-[600px] p-8 md:p-12 flex flex-col">
                <h2 className={cn("text-3xl font-bold mb-4", getThemeClass(false))}>
                  {data.name || 'Jane Doe'}
                </h2>
                <p className="text-slate-600 max-w-xl text-lg mb-8 leading-relaxed">
                  {data.aboutEntries[0]?.description || 'I build thoughtful digital experiences with modern tools and clean design.'}
                </p>
                <div className="flex gap-4 border-b border-slate-100 pb-4 mb-8">
                  <div className={cn("h-1 w-12 rounded", getThemeClass())} />
                </div>
                <div className="grid md:grid-cols-2 gap-8">
                  <div className="space-y-4">
                    <div className="h-4 w-1/3 bg-slate-200 rounded" />
                    <div className="h-24 bg-slate-50 border border-slate-100 rounded-lg p-4" />
                    <div className="h-24 bg-slate-50 border border-slate-100 rounded-lg p-4" />
                  </div>
                  <div className="space-y-4">
                    <div className="h-4 w-1/4 bg-slate-200 rounded" />
                    <div className="h-24 bg-slate-50 border border-slate-100 rounded-lg p-4" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
