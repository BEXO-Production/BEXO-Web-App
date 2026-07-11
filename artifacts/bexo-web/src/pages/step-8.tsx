import React, { useState } from 'react';
import { useOnboarding } from '../context/OnboardingContext';
import { Button, Card } from '../design-system/primitives';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { cn } from '../design-system/primitives';

const TEMPLATES = [
  {
    id: 'minimal',
    name: 'Minimal',
    description: 'Clean, typography-driven layout perfect for developers.',
    color: 'bg-slate-900'
  },
  {
    id: 'academic',
    name: 'Academic',
    description: 'Traditional structure, emphasizes research and papers.',
    color: 'bg-blue-900'
  },
  {
    id: 'creative',
    name: 'Creative',
    description: 'Bold colors and unique grid layouts for designers.',
    color: 'bg-rose-600'
  }
];

export default function Step8Theme() {
  const { data, updateData, nextStep } = useOnboarding();
  const [selected, setSelected] = useState(data.templateId || 'minimal');

  const handleContinue = () => {
    updateData({ templateId: selected });
    nextStep(8);
  };

  return (
    <div className="flex flex-col h-full max-w-4xl w-full mx-auto pb-10">
      <div className="mb-10 text-center md:text-left">
        <h1 className="font-serif text-3xl md:text-4xl font-bold text-slate-900 mb-3 tracking-tight">
          Choose a Template
        </h1>
        <p className="text-slate-500 text-base md:text-lg">
          Select a starting point. You can customize colors and fonts later.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-6 flex-1">
        {TEMPLATES.map((tpl) => (
          <Card 
            key={tpl.id}
            className={cn(
              "cursor-pointer transition-all duration-300 border-2 overflow-hidden flex flex-col group",
              selected === tpl.id 
                ? "border-blue-600 ring-4 ring-blue-50" 
                : "border-slate-200 hover:border-slate-300 hover:shadow-md"
            )}
            onClick={() => setSelected(tpl.id)}
          >
            {/* Mock Thumbnail Preview */}
            <div className="h-48 bg-slate-100 border-b border-slate-100 relative overflow-hidden flex flex-col">
              {/* Fake browser header */}
              <div className="h-6 bg-slate-200/50 border-b border-slate-200 flex items-center px-2 gap-1.5 shrink-0">
                <div className="w-2 h-2 rounded-full bg-slate-300" />
                <div className="w-2 h-2 rounded-full bg-slate-300" />
                <div className="w-2 h-2 rounded-full bg-slate-300" />
              </div>
              
              {/* Fake content */}
              <div className="p-4 flex-1 flex flex-col gap-3">
                <div className="flex justify-between items-center">
                  <div className={cn("w-8 h-8 rounded-full", tpl.color, "opacity-20")} />
                  <div className="flex gap-2">
                    <div className="w-8 h-2 rounded bg-slate-200" />
                    <div className="w-8 h-2 rounded bg-slate-200" />
                  </div>
                </div>
                <div className="mt-2">
                  <div className={cn("w-2/3 h-4 rounded mb-2", tpl.color, "opacity-80")} />
                  <div className="w-1/2 h-2 rounded bg-slate-200" />
                </div>
                <div className="grid grid-cols-2 gap-2 mt-auto">
                  <div className="h-10 rounded bg-slate-200/50" />
                  <div className="h-10 rounded bg-slate-200/50" />
                </div>
              </div>

              {/* Selection overlay */}
              <div className={cn(
                "absolute inset-0 bg-blue-600/10 flex items-center justify-center transition-opacity backdrop-blur-[1px]",
                selected === tpl.id ? "opacity-100" : "opacity-0"
              )}>
                <div className="bg-blue-600 text-white rounded-full p-2 shadow-lg scale-110">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
              </div>
            </div>

            <div className="p-5 bg-white">
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

      <div className="mt-10 flex justify-end">
        <Button 
          className="w-full md:w-auto md:min-w-[200px] h-14 text-base group shadow-lg shadow-blue-600/20"
          onClick={handleContinue}
        >
          Publish Portfolio
          <ArrowRight className="w-5 h-5 ml-2 transition-transform group-hover:translate-x-1" />
        </Button>
      </div>
    </div>
  );
}
