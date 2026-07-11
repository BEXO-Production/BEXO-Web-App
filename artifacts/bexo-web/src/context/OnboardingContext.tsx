import React, { createContext, useContext, useState, ReactNode } from 'react';
import { useLocation } from 'wouter';

export type AboutEntry = { id: string; title: string; description: string };
export type EducationEntry = { id: string; institution: string; degree: string; year: string; grade: string };
export type ProjectEntry = { id: string; title: string; description: string; tech: string; link: string; attachmentUrl?: string };
export type ExperienceEntry = { id: string; company: string; role: string; duration: string; description: string };
export type CertificateEntry = { id: string; title: string; issuer: string; date: string; attachmentUrl?: string };
export type AchievementEntry = { id: string; title: string; organization: string; date: string; attachmentUrl?: string };
export type ResearchEntry = { id: string; title: string; organization: string; date: string; attachmentUrl?: string };
export type ContactData = { email: string; linkedin: string; github: string; portfolio: string };

export type OnboardingData = {
  phone: string;
  name: string;
  dob: string;
  resumeFileName: string;
  photoUrl: string;
  aboutEntries: AboutEntry[];
  educationEntries: EducationEntry[];
  projectEntries: ProjectEntry[];
  experienceEntries: ExperienceEntry[];
  certificateEntries: CertificateEntry[];
  achievementEntries: AchievementEntry[];
  researchEntries: ResearchEntry[];
  contactData: ContactData;
  plan: 'annual' | 'lifetime' | 'activation_code';
  templateId: string;
  visitedTabs: string[];
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
  educationEntries: [
    { id: '1', institution: 'Indian Institute of Technology', degree: 'B.Tech in Computer Science', year: '2020 - 2024', grade: '9.2 CGPA' }
  ],
  projectEntries: [
    { id: '1', title: 'E-commerce Platform', description: 'Built a full-stack e-commerce site with React, Node, and MongoDB.', tech: 'React, Node.js, MongoDB', link: 'github.com/rahul/ecommerce', attachmentUrl: '' }
  ],
  experienceEntries: [
    { id: '1', company: 'Tech Solutions Inc.', role: 'Frontend Developer Intern', duration: 'May 2023 - Jul 2023', description: 'Developed responsive UIs and integrated REST APIs.' }
  ],
  certificateEntries: [
    { id: '1', title: 'AWS Certified Cloud Practitioner', issuer: 'Amazon Web Services', date: 'Aug 2023', attachmentUrl: '' }
  ],
  achievementEntries: [
    { id: '1', title: 'Hackathon Winner', organization: 'National Coding Fest', date: '2022', attachmentUrl: '' }
  ],
  researchEntries: [
    { id: '1', title: 'AI in Healthcare', organization: 'IEEE Conference', date: '2023', attachmentUrl: '' }
  ],
  contactData: {
    email: 'rahul.sharma@example.com',
    linkedin: 'linkedin.com/in/rahulsharma',
    github: 'github.com/rahulsharma',
    portfolio: ''
  },
  plan: 'annual',
  templateId: 'minimal',
  visitedTabs: [],
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
