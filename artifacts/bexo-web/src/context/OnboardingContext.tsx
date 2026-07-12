import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { useLocation } from 'wouter';

export type AssetMode = 'images' | 'pdfs' | 'links';

export type FileAsset = {
  id: string;
  name: string;
  url: string;
  sizeBytes: number;
};

export type LinkAsset = {
  id: string;
  url: string;
  name: string;
};

export type AssetData = {
  mode: AssetMode;
  images: FileAsset[];
  pdfs: FileAsset[];
  links: LinkAsset[];
};

const defaultAssets: AssetData = { mode: 'images', images: [], pdfs: [], links: [] };

export type AboutEntry = { id: string; title: string; description: string };
export type EducationEntry = { id: string; institution: string; degree: string; year: string; grade: string };
export type ProjectEntry = { id: string; title: string; description: string; tech: string; link: string; assets: AssetData };
export type ExperienceEntry = { id: string; company: string; role: string; duration: string; description: string };
export type CertificateEntry = { id: string; title: string; issuer: string; date: string; assets: AssetData };
export type AchievementEntry = { id: string; title: string; organization: string; date: string; assets: AssetData };
export type ResearchEntry = { id: string; title: string; organization: string; date: string; assets: AssetData };
export type ContactData = { email: string; linkedin: string; github: string; portfolio: string; customLinks?: { name: string; url: string }[] };

export type OnboardingData = {
  phone: string;
  name: string;
  dob: string;
  handle?: string;
  firstName?: string;
  lastName?: string;
  nationality?: string;
  pronouns?: string;
  resumeFileName: string;
  resumeFileSize: number; // in bytes
  photoUrl: string;
  aboutEntries: AboutEntry[];
  educationEntries: EducationEntry[];
  projectEntries: ProjectEntry[];
  experienceEntries: ExperienceEntry[];
  certificateEntries: CertificateEntry[];
  achievementEntries: AchievementEntry[];
  researchEntries: ResearchEntry[];
  contactData: ContactData;
  plan: 'annual' | 'lifetime' | 'activation_code' | null;
  templateId: string;
  themeColor: string;
  visitedTabs: string[];
};

interface OnboardingContextType {
  data: OnboardingData;
  isLoading: boolean;
  updateData: (updates: Partial<OnboardingData>) => void;
  nextStep: (currentStep: number) => void;
  prevStep: (currentStep: number) => void;
}

const defaultData: OnboardingData = {
  phone: '',
  name: '',
  dob: '',
  handle: '',
  firstName: '',
  lastName: '',
  nationality: 'India',
  pronouns: 'She/Her',
  resumeFileName: '',
  resumeFileSize: 0,
  photoUrl: '',
  aboutEntries: [
    { id: '1', title: 'Aspiring Software Engineer', description: 'Passionate about building scalable web applications and learning new technologies.' }
  ],
  educationEntries: [
    { id: '1', institution: 'Indian Institute of Technology', degree: 'B.Tech in Computer Science', year: '2020 - 2024', grade: '9.2 CGPA' }
  ],
  projectEntries: [
    { id: '1', title: 'E-commerce Platform', description: 'Built a full-stack e-commerce site with React, Node, and MongoDB.', tech: 'React, Node.js, MongoDB', link: 'github.com/rahul/ecommerce', assets: defaultAssets }
  ],
  experienceEntries: [
    { id: '1', company: 'Tech Solutions Inc.', role: 'Frontend Developer Intern', duration: 'May 2023 - Jul 2023', description: 'Developed responsive UIs and integrated REST APIs.' }
  ],
  certificateEntries: [
    { id: '1', title: 'AWS Certified Cloud Practitioner', issuer: 'Amazon Web Services', date: 'Aug 2023', assets: defaultAssets }
  ],
  achievementEntries: [
    { id: '1', title: 'Hackathon Winner', organization: 'National Coding Fest', date: '2022', assets: defaultAssets }
  ],
  researchEntries: [
    { id: '1', title: 'AI in Healthcare', organization: 'IEEE Conference', date: '2023', assets: defaultAssets }
  ],
  contactData: {
    email: 'rahul.sharma@example.com',
    linkedin: 'linkedin.com/in/rahulsharma',
    github: 'github.com/rahulsharma',
    portfolio: '',
    customLinks: []
  },
  plan: null,
  templateId: 'minimal',
  themeColor: 'blue',
  visitedTabs: [],
};

const OnboardingContext = createContext<OnboardingContextType | undefined>(undefined);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<OnboardingData>(defaultData);
  const [isLoading, setIsLoading] = useState(true);
  const [, setLocation] = useLocation();

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      setIsLoading(false);
      return;
    }

    fetch('/api/profile', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })
      .then(res => res.json())
      .then(result => {
        if (result.profile && result.user) {
          setData(prev => ({
            ...prev,
            handle: result.profile.handle || prev.handle,
            firstName: result.user.name?.split(' ')[0] || prev.firstName,
            lastName: result.user.name?.split(' ').slice(1).join(' ') || prev.lastName,
            name: result.user.name || prev.name,
            dob: result.user.dob || prev.dob,
            phone: result.user.phone || prev.phone,
            aboutEntries: result.aboutEntries?.length ? result.aboutEntries : prev.aboutEntries,
            educationEntries: result.educationEntries?.length ? result.educationEntries : prev.educationEntries,
            experienceEntries: result.experienceEntries?.length ? result.experienceEntries : prev.experienceEntries,
            projectEntries: result.projectEntries?.length ? result.projectEntries : prev.projectEntries,
            certificateEntries: result.certificateEntries?.length ? result.certificateEntries : prev.certificateEntries,
            achievementEntries: result.achievementEntries?.length ? result.achievementEntries : prev.achievementEntries,
            researchEntries: result.researchEntries?.length ? result.researchEntries : prev.researchEntries,
            contactData: result.contactData || prev.contactData
          }));
        }
      })
      .catch(console.error)
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  const updateData = (updates: Partial<OnboardingData>) => {
    setData((prev) => ({ ...prev, ...updates }));
    const token = localStorage.getItem('token');
    if (!token) return;

    fetch('/api/profile', {
      method: 'PATCH',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(updates),
    }).catch(console.error);
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
    <OnboardingContext.Provider value={{ data, isLoading, updateData, nextStep, prevStep }}>
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
