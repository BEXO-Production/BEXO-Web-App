import React, { useState } from 'react';
import { useOnboarding } from '../context/OnboardingContext';
import { Button, Input, Label } from '../design-system/primitives';
import { ArrowRight } from 'lucide-react';

export default function Step3Info() {
  const { data, updateData, nextStep } = useOnboarding();
  const [name, setName] = useState(data.name || 'Rahul Sharma');
  const [dob, setDob] = useState(data.dob || '2001-08-15');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !dob) return;
    updateData({ name, dob });
    nextStep(3);
  };

  return (
    <div className="flex flex-col h-full justify-center max-w-md w-full mx-auto">
      <div className="mb-10 text-center md:text-left">
        <h1 className="font-serif text-3xl md:text-4xl font-bold text-slate-900 mb-3 tracking-tight">
          Personal Information
        </h1>
        <p className="text-slate-500 text-base md:text-lg">
          This is how you will appear on your public portfolio.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="name">Full Name</Label>
          <Input
            id="name"
            placeholder="e.g. Rahul Sharma"
            className="h-14 rounded-xl text-lg"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="dob">Date of Birth</Label>
          <Input
            id="dob"
            type="date"
            className="h-14 rounded-xl text-lg block w-full"
            value={dob}
            onChange={(e) => setDob(e.target.value)}
          />
        </div>
        
        <div className="pt-4">
          <Button 
            type="submit" 
            className="w-full h-14 text-base group"
            disabled={!name || !dob}
          >
            Continue
            <ArrowRight className="w-5 h-5 ml-2 transition-transform group-hover:translate-x-1" />
          </Button>
        </div>
      </form>
    </div>
  );
}
