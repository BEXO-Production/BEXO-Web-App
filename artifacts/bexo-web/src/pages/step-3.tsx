import React, { useState } from 'react';
import { useOnboarding } from '../context/OnboardingContext';
import { Button, Input, Label } from '../design-system/primitives';
import { ArrowRight } from 'lucide-react';

export default function Step3Info() {
  const { data, updateData, nextStep } = useOnboarding();
  const [name, setName] = useState(data.name || '');
  const [dob, setDob] = useState(data.dob || '');
  const [nameError, setNameError] = useState('');
  const [dobError, setDobError] = useState('');

  const validateDob = (dateStr: string) => {
    const selectedDate = new Date(dateStr);
    const today = new Date();
    let age = today.getFullYear() - selectedDate.getFullYear();
    const m = today.getMonth() - selectedDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < selectedDate.getDate())) {
      age--;
    }
    return age >= 16 && age <= 100;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    let valid = true;
    
    if (!name.trim()) {
      setNameError('Name is required');
      valid = false;
    } else {
      setNameError('');
    }

    if (!dob) {
      setDobError('Date of birth is required');
      valid = false;
    } else if (!validateDob(dob)) {
      setDobError('Please enter a valid date of birth (must be at least 16 years old)');
      valid = false;
    } else {
      setDobError('');
    }

    if (!valid) return;
    
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
          <Label htmlFor="name" className={nameError ? "text-red-500" : ""}>Full Name</Label>
          <Input
            id="name"
            placeholder="e.g. Rahul Sharma"
            className={`h-14 rounded-xl text-lg ${nameError ? "border-red-500 focus-visible:ring-red-500" : ""}`}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (e.target.value.trim()) setNameError('');
            }}
            autoFocus
          />
          {nameError && <p className="text-red-500 text-sm mt-1">{nameError}</p>}
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="dob" className={dobError ? "text-red-500" : ""}>Date of Birth</Label>
          <Input
            id="dob"
            type="date"
            className={`h-14 rounded-xl text-lg block w-full ${dobError ? "border-red-500 focus-visible:ring-red-500" : ""}`}
            value={dob}
            max={new Date().toISOString().split('T')[0]}
            onChange={(e) => {
              setDob(e.target.value);
              if (e.target.value) setDobError('');
            }}
          />
          {dobError && <p className="text-red-500 text-sm mt-1">{dobError}</p>}
        </div>
        
        <div className="pt-4">
          <Button 
            type="submit" 
            className="w-full h-14 text-base group"
            disabled={!name.trim() || !dob}
          >
            Continue
            <ArrowRight className="w-5 h-5 ml-2 transition-transform group-hover:translate-x-1" />
          </Button>
        </div>
      </form>
    </div>
  );
}
