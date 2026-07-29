import React, { createContext, useContext, useState, ReactNode, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'wouter';
import { computeCanBuy } from '../lib/pricing';
import { toast } from '../hooks/use-toast';

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
export type SkillEntry = { id: string; name: string; category: 'technical' | 'tools' | 'soft' | 'languages' };
export type ContactData = { email: string; phone?: string; linkedin: string; github: string; portfolio: string; customLinks?: { name: string; url: string }[] };

export type PlanLimitsData = {
  parsesPerMonth: number;
  updatesPerMonth: number;
  updatesUsed: number;
  updatesRemaining: number;
  updatesDaysToReset: number;
  parsesUsed: number;
  parsesRemaining: number;
  parsesDaysToReset: number;
};

export type CanBuyData = {
  identity?: boolean;
  essential?: boolean;
  growth?: boolean;
  studentplus?: boolean;
  storage?: boolean;
  annual: boolean;
  lifetime: boolean;
};

export type CardDesign = {
  background: 'electric' | 'ink' | 'paper' | 'midnight' | 'forest' | 'clay';
  font: 'jakarta' | 'editorial' | 'mono';
};

export type OnboardingData = {
  phone: string;
  phoneVerifiedAt?: string | Date | null;
  name: string;
  dob: string;
  handle?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  oauthProvider?: string | null;
  nationality?: string;
  pronouns?: string;
  resumeFileName: string;
  resumeFileSize: number; // in bytes
  resumeUrl?: string;
  uploadedResumeUrl?: string | null;
  generatedResumeUrl?: string | null;
  defaultResume?: 'generated' | 'uploaded';
  photoUrl: string;
  bio?: string;
  aboutEntries: AboutEntry[];
  educationEntries: EducationEntry[];
  projectEntries: ProjectEntry[];
  experienceEntries: ExperienceEntry[];
  certificateEntries: CertificateEntry[];
  achievementEntries: AchievementEntry[];
  researchEntries: ResearchEntry[];
  skillEntries: SkillEntry[];
  contactData: ContactData;
  plan: string | null; // 'identity' | 'essential' | 'growth' | 'studentplus' | 'free' | legacy ids | null
  templateId: string;
  themeColor: string;
  themeBg: string;
  cardDesign: CardDesign;
  visitedTabs: string[];
  openToHire: boolean;
  storageQuotaBytes: number;
  storageBonusBytes: number;
  isPremium: boolean;
  hasCompletedOnboarding: boolean;
  payments?: any[];
  resumeParsesThisMonth: number;
  lastResumeParseReset?: string | Date;
  canBuy: CanBuyData;
  renewalMode: 'purchase' | 'renew' | 'addon';
  expiresAt?: string | Date | null;
  autopay?: boolean;
  billingPeriod?: 'free' | 'monthly' | 'yearly' | 'lifetime';
  addonBlocks?: number;
  addonHasAutopay?: boolean;
  limits?: PlanLimitsData;
  siteStatus?: 'live' | 'paused' | 'grace';
  pauseReason?: string | null;
  graceUntil?: string | Date | null;
  cancelAtPeriodEnd?: boolean;
  paymentFailedAt?: string | Date | null;
  isInPaymentGrace?: boolean;
  isPausedForVisitors?: boolean;
  overStorage?: boolean;
};

const defaultData: OnboardingData = {
  phone: '',
  phoneVerifiedAt: null,
  name: '',
  dob: '',
  handle: '',
  email: '',
  oauthProvider: null,
  firstName: '',
  lastName: '',
  nationality: 'India',
  pronouns: 'She/Her',
  resumeFileName: '',
  resumeFileSize: 0,
  resumeUrl: '',
  photoUrl: '',
  bio: '',
  aboutEntries: [],
  educationEntries: [],
  projectEntries: [],
  experienceEntries: [],
  certificateEntries: [],
  achievementEntries: [],
  researchEntries: [],
  skillEntries: [],
  contactData: {
    email: '',
    phone: '',
    linkedin: '',
    github: '',
    portfolio: '',
    customLinks: []
  },
  plan: null,
  templateId: 'cura-futuri',
  themeColor: 'blue',
  themeBg: 'grid',
  cardDesign: { background: 'forest', font: 'jakarta' },
  visitedTabs: [],
  openToHire: false,
  storageQuotaBytes: 10485760, // 10MB default
  storageBonusBytes: 0,
  isPremium: false,
  hasCompletedOnboarding: false,
  payments: [],
  resumeParsesThisMonth: 0,
  lastResumeParseReset: new Date().toISOString(),
  canBuy: { annual: true, lifetime: true },
  renewalMode: 'purchase',
  expiresAt: null,
};

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
      case 'skills': {
        const cat = String(entry.category || 'technical').toLowerCase();
        const category =
          cat === 'tools' || cat === 'soft' || cat === 'languages' ? cat : 'technical';
        return {
          id,
          name: entry.name || entry.title || entry.skill || '',
          category,
        };
      }
      default:
        return entry;
    }
  });
};

interface OnboardingContextType {
  data: OnboardingData;
  isLoading: boolean;
  updateData: (updates: Partial<OnboardingData>) => Promise<boolean>;
  nextStep: (currentStep: number) => void;
  prevStep: (currentStep: number) => void;
  setToken: (token: string | null) => void;
  refreshProfile: (silent?: boolean) => Promise<void>;
  saveStatus: 'idle' | 'saving' | 'saved' | 'error';
}

const OnboardingContext = createContext<OnboardingContextType | undefined>(undefined);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<OnboardingData>(defaultData);
  const [isLoading, setIsLoading] = useState(true);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const dataRef = useRef(data);
  const saveResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [, setLocation] = useLocation();

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const refreshProfile = useCallback(async (silent: boolean = true) => {
    const activeToken = token || localStorage.getItem('token');
    if (!activeToken) return;

    if (!silent) setIsLoading(true);

    try {
      const res = await fetch('/api/profile', {
        headers: {
          'Authorization': `Bearer ${activeToken}`
        }
      });

      if (res.status === 401) {
        localStorage.removeItem('token');
        setToken(null);
        return;
      }

      const result = await res.json().catch(() => ({}));
      if (res.ok && result.profile && result.user) {
        setData(prev => ({
          ...prev,
          handle: result.profile.handle || prev.handle,
          email: result.user.email || prev.email,
          phoneVerifiedAt: result.user.phoneVerifiedAt ?? prev.phoneVerifiedAt,
          oauthProvider: result.user.oauthProvider ?? prev.oauthProvider,
          firstName: result.user.name?.split(' ')[0] || prev.firstName,
          lastName: result.user.name?.split(' ').slice(1).join(' ') || prev.lastName,
          name: result.user.name || prev.name,
          dob: result.user.dob || prev.dob,
          phone: result.user.phone || prev.phone,
          // Never hydrate OAuth letter avatars (e.g. Google's auto-generated
          // initial) — users upload a real photo or the portfolio shows our
          // own letter fallback.
          photoUrl: /googleusercontent\.com|gravatar\.com/i.test(result.user.photoUrl || '')
            ? prev.photoUrl
            : result.user.photoUrl || prev.photoUrl,
          pronouns: result.profile.pronouns ?? prev.pronouns,
          nationality: result.profile.nationality ?? prev.nationality,
          bio: result.profile.bio ?? prev.bio,
          resumeUrl: result.user.resumeUrl || prev.resumeUrl,
          uploadedResumeUrl: result.user.uploadedResumeUrl !== undefined ? result.user.uploadedResumeUrl : prev.uploadedResumeUrl,
          generatedResumeUrl: result.user.generatedResumeUrl !== undefined ? result.user.generatedResumeUrl : prev.generatedResumeUrl,
          defaultResume: result.user.defaultResume || prev.defaultResume,
          aboutEntries: result.aboutEntries !== undefined ? ensureIdsAndDefaults(result.aboutEntries, 'about') : prev.aboutEntries,
          educationEntries: result.educationEntries !== undefined ? ensureIdsAndDefaults(result.educationEntries, 'education') : prev.educationEntries,
          experienceEntries: result.experienceEntries !== undefined ? ensureIdsAndDefaults(result.experienceEntries, 'experience') : prev.experienceEntries,
          projectEntries: result.projectEntries !== undefined ? ensureIdsAndDefaults(result.projectEntries, 'projects') : prev.projectEntries,
          certificateEntries: result.certificateEntries !== undefined ? ensureIdsAndDefaults(result.certificateEntries, 'certificates') : prev.certificateEntries,
          achievementEntries: result.achievementEntries !== undefined ? ensureIdsAndDefaults(result.achievementEntries, 'achievements') : prev.achievementEntries,
          researchEntries: result.researchEntries !== undefined ? ensureIdsAndDefaults(result.researchEntries, 'research') : prev.researchEntries,
          skillEntries: result.skillEntries !== undefined ? ensureIdsAndDefaults(result.skillEntries, 'skills') : prev.skillEntries,
          contactData: result.contactData || prev.contactData,
          plan: result.plan !== undefined ? result.plan : prev.plan,
          openToHire: result.user?.openToHire !== undefined ? result.user.openToHire : prev.openToHire,
          storageQuotaBytes: result.user?.storageQuotaBytes !== undefined ? result.user.storageQuotaBytes : prev.storageQuotaBytes,
          storageBonusBytes: result.user?.storageBonusBytes !== undefined ? result.user.storageBonusBytes : prev.storageBonusBytes,
          isPremium: result.isPremium !== undefined ? result.isPremium : prev.isPremium,
          templateId: result.user?.templateId || prev.templateId,
          themeColor: result.user?.themeColor || prev.themeColor,
          themeBg: result.user?.themeBg || prev.themeBg,
          cardDesign: result.profile?.cardDesign ?? prev.cardDesign,
          hasCompletedOnboarding: !!(result.user?.onboardingCompletedAt || (result.profile?.handle && result.plan)),
          payments: result.payments || prev.payments,
          resumeParsesThisMonth: result.user?.resumeParsesThisMonth !== undefined ? result.user.resumeParsesThisMonth : prev.resumeParsesThisMonth,
          lastResumeParseReset: result.user?.lastResumeParseReset || prev.lastResumeParseReset,
          canBuy: (() => {
            const plan = result.plan !== undefined ? result.plan : prev.plan;
            const isPremium = result.isPremium !== undefined ? result.isPremium : prev.isPremium;
            const fromApi = result.canBuy;
            if (fromApi && (fromApi.essential !== undefined || fromApi.growth !== undefined)) {
              return fromApi;
            }
            return computeCanBuy(!!isPremium, plan);
          })(),
          renewalMode: result.renewalMode || prev.renewalMode,
          expiresAt: result.expiresAt !== undefined ? result.expiresAt : prev.expiresAt,
          autopay: result.autopay !== undefined ? !!result.autopay : prev.autopay,
          billingPeriod: result.billingPeriod || prev.billingPeriod,
          addonBlocks: result.addonBlocks !== undefined ? result.addonBlocks : prev.addonBlocks,
          addonHasAutopay:
            result.addonHasAutopay !== undefined
              ? !!result.addonHasAutopay
              : result.addon?.hasAutopay !== undefined
                ? !!result.addon.hasAutopay
                : prev.addonHasAutopay,
          limits: result.limits || prev.limits,
          siteStatus: result.siteStatus || prev.siteStatus,
          pauseReason: result.pauseReason !== undefined ? result.pauseReason : prev.pauseReason,
          graceUntil: result.graceUntil !== undefined ? result.graceUntil : prev.graceUntil,
          cancelAtPeriodEnd: result.cancelAtPeriodEnd !== undefined ? !!result.cancelAtPeriodEnd : prev.cancelAtPeriodEnd,
          paymentFailedAt: result.paymentFailedAt !== undefined ? result.paymentFailedAt : prev.paymentFailedAt,
          isInPaymentGrace: result.isInPaymentGrace !== undefined ? !!result.isInPaymentGrace : prev.isInPaymentGrace,
          isPausedForVisitors: result.isPausedForVisitors !== undefined ? !!result.isPausedForVisitors : prev.isPausedForVisitors,
          overStorage: result.overStorage !== undefined ? !!result.overStorage : prev.overStorage,
        }));
      }
    } catch (err) {
      console.error('Profile refresh error:', err);
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token) {
      setIsLoading(false);
      return;
    }

    refreshProfile(false);
  }, [token, refreshProfile]);

  const updateData = async (updates: Partial<OnboardingData>): Promise<boolean> => {
    const previous = dataRef.current;
    setData((prev) => ({ ...prev, ...updates }));
    const activeToken = token || localStorage.getItem('token');
    if (!activeToken) return true;

    // Entitlement / site-access fields are server-derived — never PATCH them as profile content.
    const {
      canBuy: _canBuy,
      renewalMode: _renewalMode,
      limits: _limits,
      siteStatus: _siteStatus,
      pauseReason: _pauseReason,
      graceUntil: _graceUntil,
      cancelAtPeriodEnd: _cancelAtPeriodEnd,
      paymentFailedAt: _paymentFailedAt,
      isInPaymentGrace: _isInPaymentGrace,
      isPausedForVisitors: _isPausedForVisitors,
      overStorage: _overStorage,
      autopay: _autopay,
      billingPeriod: _billingPeriod,
      addonBlocks: _addonBlocks,
      addonHasAutopay: _addonHasAutopay,
      isPremium: _isPremium,
      payments: _payments,
      hasCompletedOnboarding: _hasCompletedOnboarding,
      resumeParsesThisMonth: _resumeParsesThisMonth,
      lastResumeParseReset: _lastResumeParseReset,
      ...persistable
    } = updates as any;

    if (Object.keys(persistable).length === 0) return true;

    setSaveStatus('saving');
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${activeToken}`,
        },
        body: JSON.stringify(persistable),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setData(previous);
        setSaveStatus('error');
        toast({
          title: 'Could not save',
          description: body?.error || `Save failed (${res.status}). Try again.`,
          variant: 'destructive',
        });
        if (body?.code === 'UPDATE_LIMIT') {
          // Refresh limits so the meter stays honest
          void refreshProfile(true);
        }
        return false;
      }
      setSaveStatus('saved');
      if (saveResetTimer.current) clearTimeout(saveResetTimer.current);
      saveResetTimer.current = setTimeout(() => setSaveStatus('idle'), 2000);
      // Keep update credit counters fresh after successful adds
      if (
        persistable.educationEntries ||
        persistable.experienceEntries ||
        persistable.projectEntries ||
        persistable.certificateEntries ||
        persistable.achievementEntries ||
        persistable.researchEntries ||
        persistable.skillEntries
      ) {
        void refreshProfile(true);
      }
      return true;
    } catch (err) {
      console.error(err);
      setData(previous);
      setSaveStatus('error');
      toast({
        title: 'Could not save',
        description: 'Network error while saving your profile. Check your connection and try again.',
        variant: 'destructive',
      });
      return false;
    }
  };

  const nextStep = (currentStep: number) => {
    if (currentStep >= 9) return;
    const destination = currentStep + 1;
    // Unlock the destination before navigating. The route guard reads
    // bexo_highest_step synchronously; bumping it only after mount caused a
    // first-click bounce back to the current step.
    try {
      const prevHighest = parseInt(localStorage.getItem('bexo_highest_step') || '1', 10);
      if (destination > prevHighest) {
        localStorage.setItem('bexo_highest_step', String(destination));
      }
    } catch {
      /* ignore quota / private mode */
    }
    setLocation(`/step/${destination}`);
  };

  const prevStep = (currentStep: number) => {
    if (currentStep > 1) {
      setLocation(`/step/${currentStep - 1}`);
    }
  };

  return (
    <OnboardingContext.Provider value={{ data, isLoading, updateData, nextStep, prevStep, setToken, refreshProfile, saveStatus }}>
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
