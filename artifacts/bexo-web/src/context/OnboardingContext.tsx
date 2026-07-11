import React, { createContext, useContext, useState, ReactNode } from 'react';
import { useLocation } from 'wouter';

export type OnboardingData = {
  phone: string;
  name: string;
  dob: string;
  resumeFileName: string;
  photoUrl: string;
  aboutEntries: Array<{ id: string; title: string; description: string }>;
  plan: 'annual' | 'lifetime' | 'activation_code';
  templateId: string;
};

interface OnboardingContextType {
  data: OnboardingData;
  updateData: (updates: Partial<OnboardingData>) => void;
  nextStep: (currentStep: number) => void;
  prevStep: (currentStep: number) => void;
}

const defaultData: OnboardingData = {
  phone: '',
  name: '',
  dob: '',
  resumeFileName: '',
  photoUrl: '',
  aboutEntries: [
    { id: '1', title: 'Aspiring Software Engineer', description: 'Passionate about building scalable web applications and learning new technologies.' }
  ],
  plan: 'annual',
  templateId: 'minimal',
};

const OnboardingContext = createContext<OnboardingContextType | undefined>(undefined);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<OnboardingData>(defaultData);
  const [, setLocation] = useLocation();

  const updateData = (updates: Partial<OnboardingData>) => {
    setData((prev) => ({ ...prev, ...updates }));
  };

  const nextStep = (currentStep: number) => {
    if (currentStep < 9) {
      setLocation(`/step/${currentStep + 1}`);
    }
  };

  const prevStep = (currentStep: number) => {
    if (currentStep > 1) {
      setLocation(`/step/${currentStep - 1}`);
    }
  };

  return (
    <OnboardingContext.Provider value={{ data, updateData, nextStep, prevStep }}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  const context = useContext(OnboardingContext);
  if (context === undefined) {
    throw new Error('useOnboarding must be used within an OnboardingProvider');
  }
  return context;
}
