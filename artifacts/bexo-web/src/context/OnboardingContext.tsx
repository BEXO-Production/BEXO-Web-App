import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { useLocation } from 'wouter';

export type AssetMode = 'images' | 'pdfs' | 'links';

export type FileAsset = {
  id: string;
  name: string;
  url: string;
  sizeBytes: number;
  isUploading?: boolean;
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

export type AboutEntry = { id: string; title: string; description: string; currentStatus?: string };
export type EducationEntry = { id: string; institution: string; degree: string; startYear: string; endYear: string; year?: string; grade: string };
export type ProjectEntry = { id: string; title: string; description: string; tech: string; link: string; assets: AssetData };
export type ExperienceEntry = { id: string; company: string; role: string; startYear: string; endYear: string; duration?: string; description: string };
export type CertificateEntry = { id: string; title: string; issuer: string; date: string; assets: AssetData };
export type AchievementEntry = { id: string; title: string; organization: string; date: string; assets: AssetData };
export type ResearchEntry = { id: string; title: string; organization: string; date: string; assets: AssetData };
export type ContactData = { email: string; phone?: string; linkedin: string; github: string; portfolio: string; customLinks?: { name: string; url: string }[] };

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
  resumeUrl?: string;
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
  openToHire: boolean;
  storageQuotaBytes: number;
  isPremium: boolean;
  hasCompletedOnboarding: boolean;
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
  resumeUrl: '',
  photoUrl: '',
  aboutEntries: [],
  educationEntries: [],
  projectEntries: [],
  experienceEntries: [],
  certificateEntries: [],
  achievementEntries: [],
  researchEntries: [],
  contactData: {
    email: '',
    phone: '',
    linkedin: '',
    github: '',
    portfolio: '',
    customLinks: []
  },
  plan: null,
  templateId: 'minimal',
  themeColor: 'blue',
  visitedTabs: [],
  openToHire: false,
  storageQuotaBytes: 10485760, // 10MB default
  isPremium: false,
  hasCompletedOnboarding: false,
};

const OnboardingContext = createContext<OnboardingContextType | undefined>(undefined);

const ensureIdsAndDefaults = (entries: any[], type: string) => {
  if (!Array.isArray(entries)) return [];
  return entries.map((entry, idx) => {
    const id = entry.id || String(idx + 1);
    const defaultAssets = { mode: 'images' as const, images: [], pdfs: [], links: [] };
    switch (type) {
      case 'about':
        return {
          id,
          title: entry.title || '',
          description: entry.description || '',
          currentStatus: entry.currentStatus || ''
        };
      case 'education': {
        let startYear = entry.startYear || '';
        let endYear = entry.endYear || '';
        const yr = entry.year || '';
        if (!startYear && !endYear && yr) {
          if (yr.includes('-')) {
            const parts = yr.split('-');
            startYear = parts[0]?.trim() || '';
            endYear = parts[1]?.trim() || '';
          } else {
            endYear = yr;
          }
        }
        return {
          id,
          institution: entry.institution || '',
          degree: entry.degree || '',
          startYear,
          endYear,
          year: yr,
          grade: entry.grade || ''
        };
      }
      case 'experience': {
        let startYear = entry.startYear || '';
        let endYear = entry.endYear || '';
        const dur = entry.duration || '';
        if (!startYear && !endYear && dur) {
          if (dur.includes('-')) {
            const parts = dur.split('-');
            startYear = parts[0]?.trim() || '';
            endYear = parts[1]?.trim() || '';
          } else {
            endYear = dur;
          }
        }
        return {
          id,
          company: entry.company || '',
          role: entry.role || '',
          startYear,
          endYear,
          duration: dur,
          description: entry.description || ''
        };
      }
      case 'projects':
        return {
          id,
          title: entry.title || '',
          description: entry.description || '',
          tech: entry.tech || '',
          link: entry.link || '',
          assets: entry.assets || defaultAssets
        };
      case 'certificates':
        return {
          id,
          title: entry.title || '',
          issuer: entry.issuer || entry.organization || '',
          date: entry.date || '',
          assets: entry.assets || defaultAssets
        };
      case 'achievements':
        return {
          id,
          title: entry.title || '',
          organization: entry.organization || entry.issuer || '',
          date: entry.date || '',
          assets: entry.assets || defaultAssets
        };
      case 'research':
        return {
          id,
          title: entry.title || '',
          organization: entry.organization || '',
          date: entry.date || '',
          assets: entry.assets || defaultAssets
        };
      default:
        return entry;
    }
  });
};

interface OnboardingContextType {
  data: OnboardingData;
  isLoading: boolean;
  updateData: (updates: Partial<OnboardingData>) => void;
  nextStep: (currentStep: number) => void;
  prevStep: (currentStep: number) => void;
  setToken: (token: string | null) => void;
}

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<OnboardingData>(defaultData);
  const [isLoading, setIsLoading] = useState(true);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!token) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    fetch('/api/profile', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })
      .then(res => {
        if (res.status === 401) {
          localStorage.removeItem('token');
          setToken(null);
          throw new Error("Session expired");
        }
        return res.json();
      })
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
            photoUrl: result.user.photoUrl || prev.photoUrl,
            resumeUrl: result.user.resumeUrl || prev.resumeUrl,
            aboutEntries: result.aboutEntries !== undefined ? ensureIdsAndDefaults(result.aboutEntries, 'about') : prev.aboutEntries,
            educationEntries: result.educationEntries !== undefined ? ensureIdsAndDefaults(result.educationEntries, 'education') : prev.educationEntries,
            experienceEntries: result.experienceEntries !== undefined ? ensureIdsAndDefaults(result.experienceEntries, 'experience') : prev.experienceEntries,
            projectEntries: result.projectEntries !== undefined ? ensureIdsAndDefaults(result.projectEntries, 'projects') : prev.projectEntries,
            certificateEntries: result.certificateEntries !== undefined ? ensureIdsAndDefaults(result.certificateEntries, 'certificates') : prev.certificateEntries,
            achievementEntries: result.achievementEntries !== undefined ? ensureIdsAndDefaults(result.achievementEntries, 'achievements') : prev.achievementEntries,
            researchEntries: result.researchEntries !== undefined ? ensureIdsAndDefaults(result.researchEntries, 'research') : prev.researchEntries,
            contactData: result.contactData || prev.contactData,
            plan: result.plan !== undefined ? result.plan : prev.plan,
            openToHire: result.user?.openToHire !== undefined ? result.user.openToHire : prev.openToHire,
            storageQuotaBytes: result.user?.storageQuotaBytes !== undefined ? result.user.storageQuotaBytes : prev.storageQuotaBytes,
            isPremium: result.isPremium !== undefined ? result.isPremium : prev.isPremium,
            templateId: result.user?.templateId || prev.templateId,
            themeColor: result.user?.themeColor || prev.themeColor,
            hasCompletedOnboarding: !!result.profile?.handle
          }));
        }
      })
      .catch(console.error)
      .finally(() => {
        setIsLoading(false);
      });
  }, [token]);

  const updateData = (updates: Partial<OnboardingData>) => {
    setData((prev) => ({ ...prev, ...updates }));
    const activeToken = token || localStorage.getItem('token');
    if (!activeToken) return;

    fetch('/api/profile', {
      method: 'PATCH',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${activeToken}`
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
    <OnboardingContext.Provider value={{ data, isLoading, updateData, nextStep, prevStep, setToken }}>
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
