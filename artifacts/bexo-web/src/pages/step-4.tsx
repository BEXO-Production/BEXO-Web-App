import React, { useState, useRef } from 'react';
import { useOnboarding } from '../context/OnboardingContext';
import { Button } from '../design-system/primitives';
import { Camera, Image as ImageIcon, Crop, ArrowRight } from 'lucide-react';
import { cn } from '../design-system/primitives';

export default function Step4Photo() {
  const { data, updateData, nextStep } = useOnboarding();
  const [photo, setPhoto] = useState<string | null>(data.photoUrl || null);
  const [isCropping, setIsCropping] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const url = URL.createObjectURL(e.target.files[0]);
      setPhoto(url);
      setIsCropping(true);
    }
  };

  const handleConfirmCrop = () => {
    setIsCropping(false);
  };

  const handleContinue = () => {
    if (photo) {
      updateData({ photoUrl: photo });
    }
    nextStep(4);
  };

  return (
    <div className="flex flex-col h-full justify-center max-w-md w-full mx-auto">
      <div className="mb-10 text-center md:text-left">
        <h1 className="font-serif text-3xl md:text-4xl font-bold text-slate-900 mb-3 tracking-tight">
          Profile Photo
        </h1>
        <p className="text-slate-500 text-base md:text-lg">
          Add a professional headshot. This is the first thing recruiters will see.
        </p>
      </div>

      <div className="flex flex-col items-center mb-8">
        <div className="relative group">
          <div className={cn(
            "w-48 h-48 rounded-full overflow-hidden border-4 flex items-center justify-center bg-slate-100 transition-all duration-300",
            photo ? "border-blue-600" : "border-slate-200 border-dashed group-hover:border-blue-400 group-hover:bg-blue-50"
          )}>
            {photo ? (
              <img src={photo} alt="Profile preview" className="w-full h-full object-cover" />
            ) : (
              <ImageIcon className="w-12 h-12 text-slate-300 group-hover:text-blue-400 transition-colors" />
            )}
          </div>
          
          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            accept="image/*" 
            onChange={handlePhotoSelect} 
          />
          
          {!isCropping && (
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="absolute bottom-0 right-0 w-12 h-12 bg-white rounded-full border border-slate-200 shadow-md flex items-center justify-center text-slate-700 hover:text-blue-600 hover:border-blue-200 transition-all"
            >
              <Camera className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {isCropping ? (
        <div className="space-y-6 animate-in fade-in">
          <div className="bg-slate-100 p-4 rounded-xl text-center text-sm text-slate-600 flex items-center justify-center gap-2">
            <Crop className="w-4 h-4" /> Drag to reposition and scale
          </div>
          <Button onClick={handleConfirmCrop} className="w-full h-14">
            Looks Good
          </Button>
        </div>
      ) : (
        <div className="space-y-4 pt-4">
          <Button 
            className="w-full h-14 text-base group"
            onClick={handleContinue}
          >
            {photo ? 'Continue' : 'Skip for now'}
            <ArrowRight className="w-5 h-5 ml-2 transition-transform group-hover:translate-x-1" />
          </Button>
        </div>
      )}
    </div>
  );
}
