import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'wouter';
import { useOnboarding, AssetMode, AssetData, FileAsset, LinkAsset } from '../context/OnboardingContext';
import { Card, Button, Input, Label } from '../design-system/primitives';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../components/ui/dialog';
import { Checkbox } from '../components/ui/checkbox';

import { useToast } from '../hooks/use-toast';
import { usePageSeo } from '../hooks/use-page-seo';
import {
  User,
  FileText,
  Settings,
  ArrowRight,
  ExternalLink,
  CheckCircle2,
  Copy,
  Check,
  UploadCloud,
  Loader2,
  Plus,
  Pencil,
  Trash2,
  GripVertical,
  X,
  ChevronLeft,
  Globe,
  Palette,
  Layout,
  Sparkles,
  Link as LinkIcon,
  Image as ImageIcon,
  Upload,
  AlertCircle,
  ArrowUp,
  ArrowDown,
  ChevronRight,
  CreditCard,
  CalendarClock,
  Crown,
  Database,
  Share2,
  Lock,
  Eye,
  BarChart3,
  TrendingUp,
  Inbox,
  MousePointerClick,
  Mail,
  BadgeCheck,
} from 'lucide-react';
import { createPortal } from 'react-dom';
import { AssetPreviewModal, PreviewTarget } from '../components/AssetPreviewModal';
import { cn } from '../design-system/primitives';
import { BrandLogo } from '../components/BrandLogo';
import { supabase } from '../lib/supabase';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { Calendar } from '../components/ui/calendar';
import { format } from 'date-fns';
import { Calendar as CalendarIcon } from 'lucide-react';
import {
  DEFAULT_TEMPLATE_ID,
  FREE_FALLBACK_TEMPLATE_ID,
  getDemoPreviewUrl,
  getTemplatePreviewUrl,
  getSelectableTemplates,
  isPremiumTemplate,
  MARKETING_DEMO_HANDLE,
  PORTFOLIO_TEMPLATES,
} from '../lib/templates';
import { PLATFORM_DOMAIN, portfolioHostname, portfolioPublicUrl, pathPortfolioUrl } from '../lib/platform';
import { TemplateThumbPreview } from '../components/TemplateThumbPreview';
import { apiUrl } from '../lib/api';
import { dashboardPath, legacyDashboardQueryToPath, parseDashboardPath } from '../lib/dashboard-routes';
import { track } from '../lib/track';
import { computeCanBuy, normalizeClientPlanId, PLAN_LABELS } from '../lib/pricing';

const TABS = [
  { id: 'about', label: 'About' },
  { id: 'education', label: 'Education' },
  { id: 'experience', label: 'Experience' },
  { id: 'projects', label: 'Projects' },
  { id: 'certificates', label: 'Certificates' },
  { id: 'achievements', label: 'Achievements' },
  { id: 'research', label: 'Research' },
  { id: 'skills', label: 'Skills' },
  { id: 'contact', label: 'Contact' }
];

const SKILL_CATEGORIES = [
  { id: 'technical', label: 'Technical' },
  { id: 'tools', label: 'Tools' },
  { id: 'soft', label: 'Soft' },
  { id: 'languages', label: 'Languages' },
] as const;

const MAX_SKILLS_UI = 40;

const THEMES = [
  { id: 'blue', label: 'Navy', hex: 'bg-blue-600', textHex: 'text-blue-600' },
  { id: 'emerald', label: 'Emerald', hex: 'bg-emerald-600', textHex: 'text-emerald-600' },
  { id: 'rose', label: 'Rose', hex: 'bg-rose-600', textHex: 'text-rose-600' },
  { id: 'violet', label: 'Violet', hex: 'bg-violet-600', textHex: 'text-violet-600' },
];

export const PLAN_DISPLAY_NAMES: Record<string, string> = {
  free: 'Free',
  identity: 'Identity',
  essential: 'Essential',
  growth: 'Growth',
  studentplus: 'Student+',
  annual: 'Growth',
  lifetime: 'Student+',
};

type BillingStatus = {
  plan: string | null;
  status: 'free' | 'active' | 'expired';
  isPremium: boolean;
  expiresAt: string | null;
  billingPeriod?: 'free' | 'monthly' | 'yearly' | 'lifetime';
  storageQuotaBytes: number;
  storageBonusBytes?: number;
  addonBlocks?: number;
  addonBytes?: number;
  addon?: { blocks: number; status: string; currentEnd: string | null; autopay: boolean } | null;
  limits?: {
    parsesPerMonth: number;
    updatesPerMonth: number;
    updatesUsed?: number;
    updatesRemaining?: number;
    updatesDaysToReset?: number;
    parsesUsed?: number;
    parsesRemaining?: number;
    parsesDaysToReset?: number;
  };
  canBuy?: Record<string, boolean>;
  renewalMode?: 'purchase' | 'renew' | 'addon';
  autopay?: boolean;
  cancelAtPeriodEnd?: boolean;
  subscription?: {
    plan: string;
    status: string;
    expiresAt: string | null;
    createdAt: string | null;
    autopay?: boolean;
    cancelAtPeriodEnd?: boolean;
  } | null;
  latestPayment?: {
    amount: number;
    status: string;
    createdAt: string;
  } | null;
  payments?: any[];
  pricing?: any;
};

/** Shown whenever parsing could not complete. Never surface provider errors. */
const RESUME_PARSE_BUSY_MESSAGE =
  'We could not finish reading your resume right now. Please try again in about 10 minutes — your file is safe and nothing was lost.';

/**
 * Resume parsing runs as a background job; poll the attempt until it resolves so
 * a busy queue never looks like a failure to the user.
 */
async function pollResumeParse(attemptId: string, token: string | null): Promise<any> {
  const deadline = Date.now() + 4 * 60 * 1000;

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const res = await fetch(apiUrl(`/api/profile/resume/status/${attemptId}`), {
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
    if (!res.ok) continue;

    const body = await res.json().catch(() => null);
    if (!body) continue;

    if (body.status === 'succeeded') return body;
    if (body.status === 'failed') throw new Error(RESUME_PARSE_BUSY_MESSAGE);
  }

  throw new Error(RESUME_PARSE_BUSY_MESSAGE);
}

export default function Dashboard() {
  const { data, updateData, setToken, refreshProfile, saveStatus } = useOnboarding();
  const { toast } = useToast();
  const [location, setLocation] = useLocation();

  usePageSeo({
    title: "Dashboard — BEXO",
    description: "Manage your BEXO portfolio, templates, and settings.",
    noindex: true,
  });

  const route = parseDashboardPath(location);
  const currentView = route.view;
  const updatesTab = route.updatesTab;
  const settingsSubTab = route.settingsTab;

  const goView = useCallback((
    view: 'overview' | 'edit-profile' | 'updates' | 'settings',
    opts?: { updatesTab?: 'parse' | 'post'; settingsTab?: 'profile' | 'design' | 'storage' | 'assets' | 'billing' },
  ) => {
    setLocation(dashboardPath(view, opts));
  }, [setLocation]);
  // Fullscreen "try this template with your data" preview (free users included)
  const [previewTemplateId, setPreviewTemplateId] = useState<string | null>(null);
  const [showLoginToast, setShowLoginToast] = useState(false);
  
  // FAB & Update State
  const [showFabMenu, setShowFabMenu] = useState(false);
  const fabRef = useRef<HTMLDivElement>(null);

  // Dynamic Post Update States
  const [updateCategory, setUpdateCategory] = useState<'achievement' | 'experience' | 'education' | 'project' | 'certificate' | 'research' | 'skill'>('achievement');
  const [updateForm, setUpdateForm] = useState<any>({
    assets: { mode: 'images' as AssetMode, images: [], pdfs: [], links: [] }
  });
  const [isUpdateUploading, setIsUpdateUploading] = useState(false);
  const [isPostingUpdate, setIsPostingUpdate] = useState(false);

  // Resume manager states
  const [isResumeFileUploading, setIsResumeFileUploading] = useState(false);
  const [isResumePrefSaving, setIsResumePrefSaving] = useState(false);
  const resumeFileInputRef = useRef<HTMLInputElement>(null);

  // Assets & storage manager states
  const [assetsList, setAssetsList] = useState<any[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [assetsUsage, setAssetsUsage] = useState<{ used: number; quota: number; addonBlocks: number } | null>(null);
  const [deletingAssetId, setDeletingAssetId] = useState<string | null>(null);
  const [analyticsSummary, setAnalyticsSummary] = useState<any>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [leadsList, setLeadsList] = useState<any[]>([]);

  // Migrate legacy ?view=&tab= bookmarks to dedicated paths
  useEffect(() => {
    const next = legacyDashboardQueryToPath(window.location.search);
    if (!next) return;
    setLocation(next);
  }, [setLocation]);

  const loadAnalytics = useCallback(async (silent = false) => {
    if (!silent) setAnalyticsLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(apiUrl('/api/analytics/portfolio/summary?days=30'), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await res.json().catch(() => ({}));
      if (res.ok) setAnalyticsSummary(result);
    } catch (err) {
      console.error('Analytics load error:', err);
    } finally {
      if (!silent) setAnalyticsLoading(false);
    }
  }, []);

  const loadLeads = useCallback(async (silent = false) => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(apiUrl('/api/analytics/leads'), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await res.json().catch(() => ({}));
      if (res.ok) setLeadsList(result.leads || []);
      else if (res.status === 403) setLeadsList([]);
    } catch (err) {
      console.error('Leads load error:', err);
    }
  }, []);

  const loadAssets = useCallback(async (silent = false) => {
    if (!silent) setAssetsLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(apiUrl('/api/profile/assets'), {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result.error || 'Failed to load assets');
      setAssetsList(result.assets || []);
      setAssetsUsage({
        used: result.storageUsedBytes || 0,
        quota: result.storageQuotaBytes || (10 * 1024 * 1024),
        addonBlocks: result.addonBlocks || 0,
      });
    } catch (err) {
      console.error('Assets load error:', err);
    } finally {
      if (!silent) setAssetsLoading(false);
    }
  }, []);

  // Load assets when landing on storage/assets via URL (refresh-safe)
  useEffect(() => {
    if (currentView === 'settings' && (settingsSubTab === 'storage' || settingsSubTab === 'assets')) {
      loadAssets(true);
    }
  }, [currentView, settingsSubTab, loadAssets]);

  const performSoftRefresh = useCallback(() => {
    if (typeof refreshProfile === 'function') {
      refreshProfile(true);
    }
    loadAnalytics(true);
    loadLeads(true);
    loadAssets(true);
  }, [refreshProfile, loadAnalytics, loadLeads, loadAssets]);

  // Automated background soft data refresh (runs every 15s + on window focus)
  useEffect(() => {
    loadAnalytics(false);
    loadLeads(false);
    loadAssets(true);

    const intervalId = setInterval(() => {
      if (document.visibilityState === 'visible') {
        performSoftRefresh();
      }
    }, 15000);

    const handleFocusSync = () => {
      if (document.visibilityState === 'visible') {
        performSoftRefresh();
      }
    };

    window.addEventListener('visibilitychange', handleFocusSync);
    window.addEventListener('focus', handleFocusSync);

    return () => {
      clearInterval(intervalId);
      window.removeEventListener('visibilitychange', handleFocusSync);
      window.removeEventListener('focus', handleFocusSync);
    };
  }, [performSoftRefresh, loadAnalytics, loadLeads, loadAssets]);

  useEffect(() => {
    track('dashboard_tab', { view: currentView });
  }, [currentView]);


  // Click outside listener for FAB
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (fabRef.current && !fabRef.current.contains(event.target as Node)) {
        setShowFabMenu(false);
      }
    }
    if (showFabMenu) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showFabMenu]);

  useEffect(() => {
    let timer: number | undefined;
    if (sessionStorage.getItem('showLoginToast') === 'true') {
      setShowLoginToast(true);
      sessionStorage.removeItem('showLoginToast');
      timer = window.setTimeout(() => {
        setShowLoginToast(false);
      }, 4000);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, []);
  
  // Dropdown & modal states
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [isModalGeneratingResume, setIsModalGeneratingResume] = useState(false);
  const [isCompileDialogOpen, setIsCompileDialogOpen] = useState(false);
  const [hasAcceptedDeclaration, setHasAcceptedDeclaration] = useState(false);
  const [isCompiling, setIsCompiling] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.removeItem('bexo_dashboard_dark');
    document.documentElement.classList.remove('dark');
  }, []);

  // Click outside listener for profile menu
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setShowProfileMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.error("Supabase logout error:", e);
    }
    localStorage.removeItem('token');
    setToken(null);
    window.location.href = '/';
  };

  // ----- Resume manager (default toggle + store-only upload) -----
  const handleResumePreference = async (pref: 'generated' | 'uploaded') => {
    if (isResumePrefSaving || data.defaultResume === pref) return;
    setIsResumePrefSaving(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(apiUrl('/api/profile/resume-preference'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ defaultResume: pref }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result.error || 'Failed to update preference');
      updateData({ defaultResume: pref } as any);
      toast({
        title: 'Default resume updated',
        description: pref === 'generated'
          ? 'Your website download button now serves the system-generated ATS resume.'
          : 'Your website download button now serves your uploaded resume.',
      });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Could not update preference.', variant: 'destructive' });
    } finally {
      setIsResumePrefSaving(false);
    }
  };

  const handleResumeFileUpload = async (file: File) => {
    if (file.type !== 'application/pdf') {
      toast({ title: 'Invalid file', description: 'Only PDF resumes are supported.', variant: 'destructive' });
      return;
    }
    setIsResumeFileUploading(true);
    try {
      const token = localStorage.getItem('token');
      const formData = new FormData();
      formData.append('resume', file);
      const res = await fetch(apiUrl('/api/profile/resume-file'), {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData,
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result.error || 'Upload failed');
      updateData({
        uploadedResumeUrl: result.url,
        defaultResume: 'uploaded',
        resumeFileName: file.name,
        resumeFileSize: file.size,
      } as any);
      toast({ title: 'Resume uploaded', description: 'Your uploaded resume is now the default for your website.' });
    } catch (err: any) {
      toast({ title: 'Upload failed', description: err.message || 'Could not upload resume.', variant: 'destructive' });
    } finally {
      setIsResumeFileUploading(false);
    }
  };

  const handleResumeFileRemove = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(apiUrl('/api/profile/resume-file'), {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result.error || 'Failed to remove resume');
      updateData({
        uploadedResumeUrl: null,
        defaultResume: 'generated',
        resumeFileName: '',
        resumeFileSize: 0,
        generatedResumeUrl: result.generatedResumeUrl ?? data.generatedResumeUrl,
      } as any);
      toast({ title: 'Resume removed', description: 'Falling back to the system-generated ATS resume.' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Could not remove resume.', variant: 'destructive' });
    }
  };

  // ----- Assets & storage manager -----

  const handleDeleteAssetRow = async (asset: any) => {
    if (deletingAssetId) return;
    setDeletingAssetId(asset.id);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(apiUrl(`/api/profile/assets/${asset.id}`), {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result.error || 'Failed to delete asset');
      setAssetsList(prev => prev.filter(a => a.id !== asset.id));
      setAssetsUsage(prev => prev ? { ...prev, used: result.storageUsedBytes ?? prev.used } : prev);
      toast({ title: 'Asset deleted', description: `${asset.name} removed and storage reclaimed.` });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Could not delete asset.', variant: 'destructive' });
    } finally {
      setDeletingAssetId(null);
    }
  };

  const handleUploadPhoto = async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    const token = localStorage.getItem('token');
    try {
      const res = await fetch("/api/profile/upload", {
        method: "POST",
        headers: {
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: formData
      });
      if (!res.ok) throw new Error("Upload failed");
      const result = await res.json();
      if (result.url) {
        updateData({ photoUrl: result.url });
        toast({ title: "Photo Updated", description: "Profile photo uploaded successfully." });
      }
    } catch (err) {
      console.error(err);
      toast({ title: "Upload Failed", description: "Failed to upload profile photo.", variant: "destructive" });
    }
  };

  const handleUploadResume = async (file: File) => {
    // Dedicated endpoint: replaces any old upload, tracks storage, and sets
    // users.resumeUrl + defaultResume so completion survives reloads.
    const formData = new FormData();
    formData.append("resume", file);
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(apiUrl("/api/profile/resume-file"), {
        method: "POST",
        headers: {
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: formData
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result.error || "Upload failed");
      if (result.url) {
        updateData({ 
          resumeUrl: result.url,
          uploadedResumeUrl: result.url,
          defaultResume: 'uploaded',
          resumeFileName: file.name,
          resumeFileSize: file.size
        });
        toast({ title: "Resume Updated", description: "Resume uploaded successfully." });
      }
    } catch (err: any) {
      console.error(err);
      toast({ title: "Upload Failed", description: err.message || "Failed to upload resume.", variant: "destructive" });
    }
  };

  // Generates the ATS resume from portfolio data and marks the checklist item done.
  const handleModalGenerateResume = async () => {
    if (isModalGeneratingResume) return;
    setIsModalGeneratingResume(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(apiUrl('/api/profile/generate-resume'), {
        method: 'POST',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result.error || 'Generation failed');
      updateData({
        generatedResumeUrl: result.url,
        defaultResume: 'generated',
      });
      toast({
        title: 'Resume Generated',
        description: 'An ATS resume was compiled from your portfolio and set as your default download.',
      });
    } catch (err: any) {
      toast({
        title: 'Generation Failed',
        description: err.message || 'Could not generate the resume. Add more portfolio details and try again.',
        variant: 'destructive',
      });
    } finally {
      setIsModalGeneratingResume(false);
    }
  };
  // Storage limit and simulation states
  const [storageLimit, setStorageLimit] = useState(data.storageQuotaBytes || 10 * 1024 * 1024); // 10MB free tier default
  const [simulatedUsage, setSimulatedUsage] = useState<number | null>(null);
  const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(null);
  const [billingLoading, setBillingLoading] = useState(true);

  useEffect(() => {
    if (data.storageQuotaBytes) {
      setStorageLimit(data.storageQuotaBytes);
    }
  }, [data.storageQuotaBytes]);

  // URL management — local: *.localhost:5001; development: *.mybexo.cyou; production portfolios: *.atbexo.com
  const handleString = data.handle || (data.name ? data.name.toLowerCase().replace(/[^a-z0-9]/g, '') : 'portfolio');
  const TEMPLATES = getSelectableTemplates(!!data.isPremium);
  const activeTemplateId = isPremiumTemplate(data.templateId)
    ? (data.templateId as string)
    : data.isPremium
      ? DEFAULT_TEMPLATE_ID
      : FREE_FALLBACK_TEMPLATE_ID;
  const activeTemplateMeta =
    PORTFOLIO_TEMPLATES.find((t) => t.id === activeTemplateId) ||
    PORTFOLIO_TEMPLATES.find((t) => t.id === DEFAULT_TEMPLATE_ID);

  const demoPreviewHost = `${MARKETING_DEMO_HANDLE}.${PLATFORM_DOMAIN}`;
  const livePortfolioHref = portfolioPublicUrl(handleString);
  const isLocalHost =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      window.location.hostname.endsWith('.localhost'));
  const localApiPort = import.meta.env.VITE_API_PORT || '5001';
  const url = data.isPremium
    ? isLocalHost
      ? `${handleString}.localhost:${localApiPort}`
      : portfolioHostname(handleString)
    : isLocalHost
      ? `${window.location.host}/${handleString}`
      : `${PLATFORM_DOMAIN}/${handleString}`;
  const correctVisitUrl = data.isPremium
    ? isLocalHost
      ? `http://${handleString}.localhost:${localApiPort}/`
      : livePortfolioHref
    : isLocalHost
      ? `${window.location.protocol}//${window.location.host}/${handleString}`
      : pathPortfolioUrl(handleString);
  const [copied, setCopied] = useState(false);

  // Premium accounts never keep Minimal — migrate picker selection to a Pro layout.
  useEffect(() => {
    if (!data.isPremium) return;
    if (isPremiumTemplate(data.templateId)) return;
    updateData({ templateId: DEFAULT_TEMPLATE_ID });
  }, [data.isPremium, data.templateId, updateData]);

  useEffect(() => {
    if (data.openToHire) {
      localStorage.setItem('bexo_hiring_availability_ever_enabled', 'true');
    }
  }, [data.openToHire]);

  // Compute storage dynamically
  const [calculatedUsedStorage, setCalculatedUsedStorage] = useState(0);
  useEffect(() => {
    let sum = data.resumeFileSize || 0;
    const countAssets = (arr: any[]) => {
      arr?.forEach(entry => {
        if (entry.assets) {
          entry.assets.images?.forEach((i: FileAsset) => sum += i.sizeBytes);
          entry.assets.pdfs?.forEach((p: FileAsset) => sum += p.sizeBytes);
        }
      });
    };
    countAssets(data.projectEntries);
    countAssets(data.certificateEntries);
    countAssets(data.achievementEntries);
    countAssets(data.researchEntries);
    setCalculatedUsedStorage(sum);
  }, [data]);

  const usedStorage = simulatedUsage !== null ? simulatedUsage : calculatedUsedStorage;
  const storagePercentage = Math.min((usedStorage / storageLimit) * 100, 100);
  const isStorageFull = usedStorage >= storageLimit;
  const isStorageExhausted90 = usedStorage >= 0.9 * storageLimit;

  const refreshBillingStatus = async () => {
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
      setBillingLoading(true);
      const res = await fetch('/api/payments/status', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Unable to load billing status');

      setBillingStatus(result);
      setStorageLimit(result.storageQuotaBytes || storageLimit);
      const planId = normalizeClientPlanId(result.plan) || result.plan;
      updateData({
        plan: planId,
        isPremium: result.isPremium,
        storageQuotaBytes: result.storageQuotaBytes,
        storageBonusBytes: result.storageBonusBytes ?? 0,
        canBuy: result.canBuy || computeCanBuy(!!result.isPremium, planId),
        renewalMode: result.renewalMode || 'purchase',
        expiresAt: result.expiresAt,
        autopay: result.autopay ?? result.subscription?.autopay ?? false,
        billingPeriod: result.billingPeriod,
        addonBlocks: result.addonBlocks ?? 0,
        addonHasAutopay: result.addonHasAutopay ?? result.addon?.hasAutopay ?? false,
        limits: result.limits,
        siteStatus: result.siteStatus,
        pauseReason: result.pauseReason,
        graceUntil: result.graceUntil,
        cancelAtPeriodEnd: !!result.cancelAtPeriodEnd,
        paymentFailedAt: result.paymentFailedAt,
        isInPaymentGrace: !!result.isInPaymentGrace,
        isPausedForVisitors: !!result.isPausedForVisitors,
        overStorage: !!result.overStorage,
        ...(Array.isArray(result.payments) ? { payments: result.payments } : {}),
      });
    } catch (err) {
      console.error('Billing status error:', err);
    } finally {
      setBillingLoading(false);
    }
  };

  useEffect(() => {
    refreshBillingStatus();
  }, []);

  const openBilling = () => {
    setLocation('/billing');
  };

  // A resume counts whether it was uploaded during onboarding (uploadedResumeUrl /
  // resumeUrl), generated by the system, or attached in this session (resumeFileName).
  const hasResume = Boolean(
    data.resumeFileName || data.uploadedResumeUrl || data.generatedResumeUrl || data.resumeUrl
  );
  const resumeDoneLabel = data.resumeFileName
    || (data.uploadedResumeUrl || (data.resumeUrl && data.resumeUrl !== data.generatedResumeUrl)
      ? 'Uploaded resume'
      : 'Generated resume');

  // Compute profile completion percentage
  const calculateCompletion = () => {
    let score = 0;
    if (data.name) score += 10;
    if (data.phone) score += 10;
    if (data.photoUrl) score += 10;
    if (hasResume) score += 20;
    if (data.aboutEntries && data.aboutEntries.length > 0) score += 10;
    if (data.educationEntries && data.educationEntries.length > 0) score += 10;
    if (data.experienceEntries && data.experienceEntries.length > 0) score += 10;
    if (data.projectEntries && data.projectEntries.length > 0) score += 10;
    if (data.skillEntries && data.skillEntries.length >= 3) score += 5;
    if (data.contactData?.email) score += 5;
    return Math.min(100, score);
  };

  const completionScore = calculateCompletion();

  type ReadinessItem = {
    id: string;
    label: string;
    points: number;
    done: boolean;
    hint: string;
    actionLabel: string;
    onFix: () => void;
  };

  const readinessItems: ReadinessItem[] = [
    {
      id: 'photo',
      label: 'Profile picture',
      points: 10,
      done: !!data.photoUrl,
      hint: 'Add a clear headshot so recruiters recognize you.',
      actionLabel: 'Add photo',
      onFix: () => setShowCompletionModal(true),
    },
    {
      id: 'resume',
      label: 'Resume (PDF)',
      points: 20,
      done: hasResume,
      hint: 'Upload or generate an ATS resume.',
      actionLabel: 'Add resume',
      onFix: () => setShowCompletionModal(true),
    },
    {
      id: 'about',
      label: 'About / bio',
      points: 10,
      done: !!(data.aboutEntries && data.aboutEntries.length > 0),
      hint: 'A short professional bio on your portfolio.',
      actionLabel: 'Add bio',
      onFix: () => setShowCompletionModal(true),
    },
    {
      id: 'education',
      label: 'Education',
      points: 10,
      done: !!(data.educationEntries && data.educationEntries.length > 0),
      hint: 'Add at least one education entry.',
      actionLabel: 'Add education',
      onFix: () => {
        goView('edit-profile');
        setActiveEditorTab('education');
        setShowCompletionModal(false);
      },
    },
    {
      id: 'experience',
      label: 'Experience',
      points: 10,
      done: !!(data.experienceEntries && data.experienceEntries.length > 0),
      hint: 'Add work, internship, or volunteer experience.',
      actionLabel: 'Add experience',
      onFix: () => {
        goView('edit-profile');
        setActiveEditorTab('experience');
        setShowCompletionModal(false);
      },
    },
    {
      id: 'projects',
      label: 'Projects',
      points: 10,
      done: !!(data.projectEntries && data.projectEntries.length > 0),
      hint: 'Showcase at least one project.',
      actionLabel: 'Add project',
      onFix: () => {
        goView('edit-profile');
        setActiveEditorTab('projects');
        setShowCompletionModal(false);
      },
    },
    {
      id: 'skills',
      label: 'Skills (3+)',
      points: 5,
      done: !!(data.skillEntries && data.skillEntries.length >= 3),
      hint: `Add at least 3 skills (${data.skillEntries?.length || 0}/3 so far).`,
      actionLabel: 'Post skill update',
      onFix: () => {
        goView('updates', { updatesTab: 'post' });
        setUpdateCategory('skill');
        setShowCompletionModal(false);
      },
    },
    {
      id: 'email',
      label: 'Contact email',
      points: 5,
      done: !!data.contactData?.email,
      hint: 'Public contact email for hire / enquiries.',
      actionLabel: 'Add email',
      onFix: () => setShowCompletionModal(true),
    },
  ];

  const missingReadiness = readinessItems.filter((item) => !item.done);
  const openReadiness = () => setShowCompletionModal(true);
  const hasAnalyticsAccess = data.plan === 'essential' || data.plan === 'growth';
  const analyticsSeries: Array<{ day: string; displayViews?: number; views?: number }> = Array.isArray(analyticsSummary?.series)
    ? analyticsSummary.series
    : [];
  const sparkValues = analyticsSeries.map((d) => Number(d.displayViews ?? d.views ?? 0));
  const sparkMax = Math.max(1, ...sparkValues);
  const activePlanId = normalizeClientPlanId(billingStatus?.plan || data.plan) || 'free';
  const planShortLabel = PLAN_LABELS[activePlanId] || (data.isPremium ? 'Pro' : 'Free');
  const planName = billingStatus?.isPremium || data.isPremium
    ? `${planShortLabel} Plan`
    : 'Free';
  const planBadgeLabel = data.isPremium ? planShortLabel : 'Free';
  const isLifetimePlan = activePlanId === 'studentplus' || activePlanId === 'lifetime';
  const planRenewal = billingStatus?.expiresAt
    ? `${(billingStatus?.autopay ?? billingStatus?.subscription?.autopay) && !billingStatus?.cancelAtPeriodEnd ? 'Renews' : 'Expires'} ${new Date(billingStatus.expiresAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`
    : isLifetimePlan
      ? 'Never expires'
      : 'Upgrade available';
  const totalEntries = [
    data.aboutEntries,
    data.educationEntries,
    data.experienceEntries,
    data.projectEntries,
    data.certificateEntries,
    data.achievementEntries,
    data.researchEntries,
    data.skillEntries
  ].reduce((sum, entries) => sum + (entries?.length || 0), 0);
  const nextAction = completionScore < 90
    ? { label: 'Complete portfolio', detail: 'Add the missing profile sections before sharing widely.', action: () => setShowCompletionModal(true), icon: CheckCircle2 }
      : !hasResume
      ? { label: 'Attach resume', detail: 'A resume improves the downloadable version and future parsing.', action: () => { goView('updates', { updatesTab: 'parse' }); }, icon: FileText }
      : !data.isPremium
        ? { label: 'Unlock Pro publishing', detail: 'Move to custom subdomain, premium templates, and 100MB Yearly storage.', action: openBilling, icon: Crown }
        : { label: 'Review live portfolio', detail: 'Your public page is ready for recruiters and applications.', action: () => window.open(correctVisitUrl, '_blank', 'noopener,noreferrer'), icon: ExternalLink };
  const NextActionIcon = nextAction.icon;

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(`https://${url}`);
    setCopied(true);
    toast({
      title: 'Copied!',
      description: 'Public URL copied to clipboard.',
    });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShareUrl = async () => {
    const shareUrl = `https://${url}`;
    const shareTitle = `${data.name || 'My'} Professional Portfolio`;
    const shareText = `Hi! Check out my newly published professional portfolio on BEXO: ${shareUrl}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: shareTitle,
          text: shareText,
          url: shareUrl,
        });
      } catch (err) {
        console.error('Web Share failed:', err);
      }
    } else {
      navigator.clipboard.writeText(shareText);
      toast({
        title: 'Ready to share!',
        description: 'Customized portfolio link and description copied to clipboard.',
      });
    }
  };

  // Edit Profile tab and form states
  const [activeEditorTab, setActiveEditorTab] = useState('about');
  const [previewTarget, setPreviewTarget] = useState<PreviewTarget>(null);
  const [sections, setSections] = useState({
    about: data.aboutEntries || [],
    education: data.educationEntries || [],
    experience: data.experienceEntries || [],
    projects: data.projectEntries || [],
    certificates: data.certificateEntries || [],
    achievements: data.achievementEntries || [],
    research: data.researchEntries || [],
    skills: data.skillEntries || [],
  });
  const [contactData, setContactData] = useState(data.contactData || { email: '', phone: '', linkedin: '', github: '', portfolio: '' });
  const [editingId, setEditingId] = useState<string | null>(null);
  const isNewEntry = editingId !== null && !sections[activeEditorTab as keyof typeof sections]?.some((e: any) => e.id === editingId);
  const [editForm, setEditForm] = useState<any>({});
  const [contactErrors, setContactErrors] = useState<any>({});

  const [isAddingDashboardLink, setIsAddingDashboardLink] = useState(false);
  const [newDashboardLinkName, setNewDashboardLinkName] = useState('');
  const [newDashboardLinkUrl, setNewDashboardLinkUrl] = useState('');


  // Sync edit profile sections when context loads/updates
  useEffect(() => {
    setSections({
      about: data.aboutEntries || [],
      education: data.educationEntries || [],
      experience: data.experienceEntries || [],
      projects: data.projectEntries || [],
      certificates: data.certificateEntries || [],
      achievements: data.achievementEntries || [],
      research: data.researchEntries || [],
      skills: data.skillEntries || [],
    });
    setContactData(data.contactData || { email: '', phone: '', linkedin: '', github: '', portfolio: '' });
  }, [data, currentView]);

  const handleMove = (index: number, direction: 'up' | 'down') => {
    const list = [...(sections[activeEditorTab as keyof typeof sections] || [])];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= list.length) return;
    
    const temp = list[index];
    list[index] = list[targetIndex];
    list[targetIndex] = temp;

    const updated = { ...sections, [activeEditorTab]: list };
    setSections(updated);
    updateContextSections(updated);
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    e.dataTransfer.setData('text/plain', index.toString());
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, hoverIndex: number) => {
    e.preventDefault();
    const dragIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
    if (isNaN(dragIndex) || dragIndex === hoverIndex) return;

    const list = [...(sections[activeEditorTab as keyof typeof sections] || [])];
    const draggedItem = list[dragIndex];
    list.splice(dragIndex, 1);
    list.splice(hoverIndex, 0, draggedItem);

    const updated = { ...sections, [activeEditorTab]: list };
    setSections(updated);
    updateContextSections(updated);
  };

  const handleAdd = () => {
    const newId = Date.now().toString();
    const newEntry = {
      id: newId,
      assets: { mode: 'images' as const, images: [], pdfs: [], links: [] }
    };
    setEditingId(newId);
    setEditForm(newEntry);
  };

  const handleEdit = (id: string) => {
    const entry = sections[activeEditorTab as keyof typeof sections].find((e: any) => e.id === id);
    if (entry) {
      setEditingId(id);
      setEditForm(JSON.parse(JSON.stringify(entry)));
    }
  };

  const handleDelete = async (id: string) => {
    const updated = {
      ...sections,
      [activeEditorTab]: sections[activeEditorTab as keyof typeof sections].filter((e: any) => e.id !== id)
    };
    setSections(updated);
    const ok = await updateContextSections(updated);
    if (!ok) return;
    toast({
      title: 'Removed',
      description: 'Entry removed successfully.',
    });
  };

  const handleSave = async () => {
    // Check if any supporting assets are still uploading in the background
    const isUploadingImages = editForm.assets?.images?.some((img: any) => img.isUploading);
    const isUploadingPdfs = editForm.assets?.pdfs?.some((pdf: any) => pdf.isUploading);
    if (isUploadingImages || isUploadingPdfs) {
      toast({
        title: 'Upload in Progress',
        description: 'Please wait for your files to finish uploading before saving.',
        variant: 'destructive'
      });
      return;
    }

    let updated;
    const isNew = !sections[activeEditorTab as keyof typeof sections].some((e: any) => e.id === editingId);
    if (isNew) {
      updated = {
        ...sections,
        [activeEditorTab]: [...sections[activeEditorTab as keyof typeof sections], { ...editForm, id: editingId }]
      };
    } else {
      updated = {
        ...sections,
        [activeEditorTab]: sections[activeEditorTab as keyof typeof sections].map((e: any) => e.id === editingId ? { ...e, ...editForm } : e)
      };
    }
    setSections(updated);
    const ok = await updateContextSections(updated);
    if (!ok) {
      // Roll back local section state to context data on failed credit/save
      setSections({
        about: data.aboutEntries || [],
        education: data.educationEntries || [],
        experience: data.experienceEntries || [],
        projects: data.projectEntries || [],
        certificates: data.certificateEntries || [],
        achievements: data.achievementEntries || [],
        research: data.researchEntries || [],
        skills: data.skillEntries || [],
      });
      return;
    }
    setEditingId(null);
    toast({
      title: isNew ? 'Entry added' : 'Saved',
      description: isNew
        ? 'New entry published to your portfolio (uses 1 update credit).'
        : 'Profile information updated.',
    });
  };

  const updateContextSections = async (newSections: any): Promise<boolean> => {
    return updateData({
      aboutEntries: newSections.about,
      educationEntries: newSections.education,
      experienceEntries: newSections.experience,
      projectEntries: newSections.projects,
      certificateEntries: newSections.certificates,
      achievementEntries: newSections.achievements,
      researchEntries: newSections.research,
      skillEntries: newSections.skills,
    });
  };

  const handleSaveContact = () => {
    const errors: any = {};
    const emailVal = (contactData?.email || '').trim();
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailVal) {
      errors.email = 'Email address is required';
    } else if (!emailRegex.test(emailVal)) {
      errors.email = 'Please enter a valid email address (e.g. name@example.com)';
    }

    const rawPhone = (contactData?.phone || data?.phone || '').replace(/^\+?91/, '').replace(/\D/g, '');
    if (!rawPhone) {
      errors.phone = 'Phone number is required';
    } else if (rawPhone.length !== 10) {
      errors.phone = 'Please enter a valid 10-digit phone number';
    }

    if (Object.keys(errors).length > 0) {
      setContactErrors(errors);
      return;
    }

    setContactErrors({});
    const formattedPhone = contactData?.phone || data?.phone || '';
    const finalContact = {
      ...contactData,
      phone: formattedPhone
    };
    updateData({ phone: formattedPhone, contactData: finalContact });
    toast({
      title: 'Saved',
      description: 'Contact information updated.',
    });
  };

  const handleSaveDashboardLink = () => {
    if (!newDashboardLinkName.trim() || !newDashboardLinkUrl.trim()) return;
    
    let formattedUrl = newDashboardLinkUrl.trim();
    if (!/^https?:\/\//i.test(formattedUrl)) {
      formattedUrl = `https://${formattedUrl}`;
    }

    const currentLinks = contactData?.customLinks || [];
    const updatedLinks = [...currentLinks, { name: newDashboardLinkName.trim(), url: formattedUrl }];
    const updatedContact = { ...contactData, customLinks: updatedLinks };
    setContactData(updatedContact);
    updateData({ contactData: updatedContact });
    
    setNewDashboardLinkName('');
    setNewDashboardLinkUrl('');
    setIsAddingDashboardLink(false);
  };

  const handleRemoveDashboardLink = (index: number) => {
    const currentLinks = contactData?.customLinks || [];
    const updatedLinks = currentLinks.filter((_, i) => i !== index);
    const updatedContact = { ...contactData, customLinks: updatedLinks };
    setContactData(updatedContact);
    updateData({ contactData: updatedContact });
  };


  // Asset handlers
  const handleAssetModeChange = (mode: AssetMode) => {
    setEditForm({ ...editForm, assets: { ...editForm.assets, mode } });
  };
  
  const handleUpdateAssetModeChange = (mode: AssetMode) => {
    setUpdateForm({ ...updateForm, assets: { ...updateForm.assets, mode } });
  };

  const handleUpdateFileUpload = (type: 'images' | 'pdfs') => {
    if (isStorageFull) return;
    const maxSlots = type === 'images' ? 5 : 2;
    const current = updateForm.assets?.[type] || [];
    if (current.length >= maxSlots) return;

    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = type === 'images' ? 'image/*' : 'application/pdf';
    input.onchange = (e: any) => {
      const picked: File[] = Array.from(e.target.files || []);
      if (picked.length === 0) return;

      const slotsLeft = maxSlots - (updateForm.assets?.[type]?.length || 0);
      if (picked.length > slotsLeft) {
        toast({
          title: 'Too many files',
          description: `Only ${slotsLeft} more ${type === 'images' ? 'image' : 'PDF'} slot(s) available — uploading the first ${slotsLeft}.`,
        });
      }
      const files = picked.slice(0, slotsLeft);

      // Enforce the quota across the whole batch, not per file
      let projectedUsage = usedStorage;
      const accepted: File[] = [];
      for (const file of files) {
        if (projectedUsage + file.size > storageLimit) {
          toast({ title: 'Quota Exceeded', description: `"${file.name}" skipped — not enough storage.`, variant: 'destructive' });
          continue;
        }
        projectedUsage += file.size;
        accepted.push(file);
      }
      if (accepted.length === 0) return;

      setIsUpdateUploading(true);
      const token = localStorage.getItem('token');
      let pending = accepted.length;
      const finishOne = () => {
        pending -= 1;
        if (pending <= 0) setIsUpdateUploading(false);
      };

      accepted.forEach((file, idx) => {
        const localUrl = URL.createObjectURL(file);
        const tempId = `temp-${Date.now()}-${idx}`;
        const newAsset: FileAsset = { id: tempId, name: file.name, url: localUrl, sizeBytes: file.size, isUploading: true };

        setUpdateForm((prev: any) => ({
          ...prev,
          assets: {
            ...prev.assets,
            [type]: [...(prev.assets?.[type] || []), newAsset]
          }
        }));

        const formData = new FormData();
        formData.append("file", file);

        fetch("/api/profile/upload", {
          method: "POST",
          headers: { "Authorization": `Bearer ${token}` },
          body: formData
        })
        .then(r => r.json())
        .then(res => {
          if (res.error) throw new Error(res.error);
          if (!res.url) throw new Error("Upload failed");
          setUpdateForm((prev: any) => ({
            ...prev,
            assets: {
              ...prev.assets,
              [type]: prev.assets[type].map((a: any) => a.id === tempId ? { ...a, url: res.url, isUploading: false } : a)
            }
          }));
        })
        .catch(err => {
          toast({ title: 'Upload Failed', description: `"${file.name}": ${err.message}`, variant: 'destructive' });
          setUpdateForm((prev: any) => ({
            ...prev,
            assets: { ...prev.assets, [type]: prev.assets[type].filter((a: any) => a.id !== tempId) }
          }));
        })
        .finally(finishOne);
      });
    };
    input.click();
  };
  
  const handleUpdateDeleteAsset = (type: 'images' | 'pdfs', id: string) => {
    setUpdateForm((prev: any) => ({
      ...prev,
      assets: { ...prev.assets, [type]: prev.assets[type].filter((a: any) => a.id !== id) }
    }));
  };

  const handleUpdateAddLink = () => {
    setUpdateForm((prev: any) => ({
      ...prev,
      assets: { ...prev.assets, links: [...(prev.assets?.links || []), { url: '', label: '' }] }
    }));
  };

  const handleUpdateDeleteLink = (index: number) => {
    setUpdateForm((prev: any) => ({
      ...prev,
      assets: { ...prev.assets, links: prev.assets.links.filter((_: any, i: number) => i !== index) }
    }));
  };

  const handleUpdateLinkChange = (index: number, field: 'url' | 'label', value: string) => {
    setUpdateForm((prev: any) => ({
      ...prev,
      assets: {
        ...prev.assets,
        links: prev.assets.links.map((link: any, i: number) => i === index ? { ...link, [field]: value } : link)
      }
    }));
  };

  const handleFileUpload = (type: 'images' | 'pdfs') => {
    if (isStorageFull) return;
    const maxSlots = type === 'images' ? 5 : 2;
    const current = editForm.assets[type] || [];
    if (current.length >= maxSlots) return;

    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = type === 'images' ? 'image/*' : 'application/pdf';
    input.onchange = (e: any) => {
      const picked: File[] = Array.from(e.target.files || []);
      if (picked.length === 0) return;

      const slotsLeft = maxSlots - (editForm.assets[type]?.length || 0);
      if (picked.length > slotsLeft) {
        toast({
          title: 'Too many files',
          description: `Only ${slotsLeft} more ${type === 'images' ? 'image' : 'PDF'} slot(s) available — uploading the first ${slotsLeft}.`,
        });
      }
      const files = picked.slice(0, slotsLeft);

      // Enforce the quota across the whole batch, not per file
      let projectedUsage = usedStorage;
      const accepted: File[] = [];
      for (const file of files) {
        if (projectedUsage + file.size > storageLimit) {
          toast({
            title: 'Quota Exceeded',
            description: `"${file.name}" skipped — not enough storage. Clear space or review your plan in billing.`,
            variant: 'destructive'
          });
          continue;
        }
        projectedUsage += file.size;
        accepted.push(file);
      }
      if (accepted.length === 0) return;

      const token = localStorage.getItem('token');

      accepted.forEach((file, idx) => {
        // Temporary local preview shown immediately while uploading
        const localUrl = URL.createObjectURL(file);
        const tempId = `temp-${Date.now()}-${idx}`;

        const newAsset: FileAsset = {
          id: tempId,
          name: file.name,
          url: localUrl,
          sizeBytes: file.size,
          isUploading: true
        };

        setEditForm((prev: any) => ({
          ...prev,
          assets: {
            ...prev.assets,
            [type]: [...(prev.assets[type] || []), newAsset]
          }
        }));

        const formData = new FormData();
        formData.append("file", file);

        fetch("/api/profile/upload", {
          method: "POST",
          headers: {
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          body: formData
        })
          .then(async (res) => {
            if (!res.ok) {
              const errData = await res.json().catch(() => ({}));
              throw new Error(errData.error || "Upload failed");
            }
            return res.json();
          })
          .then((result) => {
            if (result.url) {
              // Replace temporary asset with the live R2 URL
              setEditForm((prev: any) => ({
                ...prev,
                assets: {
                  ...prev.assets,
                  [type]: (prev.assets[type] || []).map((item: any) =>
                    item.id === tempId ? { ...item, url: result.url, isUploading: false } : item
                  )
                }
              }));
            }
          })
          .catch((err) => {
            console.error("Failed to upload file to R2 in background:", err);
            toast({
              title: 'Upload Failed',
              description: `"${file.name}": ${err.message || 'An error occurred during file upload.'}`,
              variant: 'destructive'
            });
            // Remove the temporary asset on failure
            setEditForm((prev: any) => ({
              ...prev,
              assets: {
                ...prev.assets,
                [type]: (prev.assets[type] || []).filter((item: any) => item.id !== tempId)
              }
            }));
          });
      });
    };
    input.click();
  };

  const handleRemoveAsset = (type: 'images' | 'pdfs' | 'links', id: string, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    const currentList = editForm.assets?.[type] || [];
    setEditForm({
      ...editForm,
      assets: {
        ...editForm.assets,
        [type]: currentList.filter((a: any) => a.id !== id)
      }
    });
  };

  const handleAddLink = () => {
    const current = editForm.assets.links || [];
    if (current.length >= 3) return;
    const newLink: LinkAsset = { id: Date.now().toString(), name: 'New Link', url: '' };
    setEditForm({
      ...editForm,
      assets: { ...editForm.assets, links: [...current, newLink] }
    });
  };

  const handleMoveAsset = (type: 'images' | 'pdfs' | 'links', fromIndex: number, direction: -1 | 1) => {
    const items = [...(editForm.assets?.[type] || [])];
    const toIndex = fromIndex + direction;
    if (toIndex < 0 || toIndex >= items.length) return;
    const [moved] = items.splice(fromIndex, 1);
    items.splice(toIndex, 0, moved);
    setEditForm({
      ...editForm,
      assets: { ...editForm.assets, [type]: items }
    });
  };

  const handleReorderAsset = (type: 'images' | 'pdfs' | 'links', fromIndex: number, toIndex: number) => {
    const items = [...(editForm.assets?.[type] || [])];
    if (fromIndex === toIndex || fromIndex < 0 || fromIndex >= items.length || toIndex < 0 || toIndex >= items.length) return;
    const [moved] = items.splice(fromIndex, 1);
    items.splice(toIndex, 0, moved);
    setEditForm({
      ...editForm,
      assets: { ...editForm.assets, [type]: items }
    });
  };

  // Resume state
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [resumeStatus, setResumeStatus] = useState<'idle' | 'uploading' | 'parsing' | 'success'>(
    data.resumeFileName ? 'success' : 'idle'
  );
  const resumeInputRef = useRef<HTMLInputElement>(null);

  const handleResumeChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || file.type !== 'application/pdf') return;

    const token = localStorage.getItem('token');
    if (!token) {
      toast({ title: 'Session expired', description: 'Please log in again to parse a resume.', variant: 'destructive' });
      return;
    }

    setResumeFile(file);
    setResumeStatus('uploading');
    try {
      const formData = new FormData();
      formData.append('resume', file);
      setResumeStatus('parsing');
      const res = await fetch(apiUrl('/api/profile/resume'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        const actionable = ['UPGRADE_REQUIRED', 'LIMIT_REACHED', 'PDF_UNREADABLE', 'PARSE_IN_PROGRESS', 'PARSE_COOLDOWN'];
        throw new Error(
          actionable.includes(payload?.code) && payload?.error ? payload.error : RESUME_PARSE_BUSY_MESSAGE,
        );
      }

      // Parsing runs in the background — poll until the job resolves.
      const finished = payload?.status === 'succeeded'
        ? payload
        : await pollResumeParse(String(payload?.attemptId || ''), token);

      setResumeStatus('success');
      updateData({
        resumeFileName: file.name,
        resumeFileSize: file.size,
        resumeUrl: finished?.resumeUrl || payload?.resumeUrl || data.resumeUrl,
        name: finished?.data?.name || data.name,
      });
      if (typeof refreshProfile === 'function') {
        await refreshProfile(true);
      }
      toast({
        title: 'Resume Parsed',
        description: 'Your profile has been updated with information from your resume.',
      });
    } catch (err: any) {
      setResumeStatus(data.resumeFileName ? 'success' : 'idle');
      toast({
        title: 'Resume parse failed',
        description: err?.message || RESUME_PARSE_BUSY_MESSAGE,
        variant: 'destructive',
      });
    }
  };

  const handleRemoveResume = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(apiUrl('/api/profile/resume-file'), {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result.error || 'Could not remove resume');
      setResumeFile(null);
      setResumeStatus('idle');
      await updateData({
        resumeFileName: '',
        resumeFileSize: 0,
        uploadedResumeUrl: null,
        resumeUrl: data.generatedResumeUrl || '',
        defaultResume: 'generated',
      } as any);
      toast({
        title: 'Resume Removed',
        description: 'Uploaded resume deleted from storage.',
      });
    } catch (err: any) {
      toast({
        title: 'Remove failed',
        description: err?.message || 'Could not delete resume.',
        variant: 'destructive',
      });
    }
  };

  // General Settings inputs (Personal Details)
  const splitFullName = (full: string) => {
    const parts = (full || '').trim().split(/\s+/).filter(Boolean);
    return { first: parts[0] || '', last: parts.slice(1).join(' ') };
  };
  const initialNameParts = splitFullName(data.name || '');
  const [settingsFirstName, setSettingsFirstName] = useState(data.firstName || initialNameParts.first);
  const [settingsLastName, setSettingsLastName] = useState(data.lastName || initialNameParts.last);
  const [settingsPronouns, setSettingsPronouns] = useState(data.pronouns || '');
  const [settingsNationality, setSettingsNationality] = useState(data.nationality || '');
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [isSettingsSaving, setIsSettingsSaving] = useState(false);

  const hydratePersonalSettings = useCallback(() => {
    const parts = splitFullName(data.name || '');
    setSettingsFirstName((data.firstName || parts.first || '').trim());
    setSettingsLastName((data.lastName || parts.last || '').trim());
    setSettingsPronouns(data.pronouns || '');
    setSettingsNationality(data.nationality || '');
    setSettingsDirty(false);
  }, [data.name, data.firstName, data.lastName, data.pronouns, data.nationality]);

  // Hydrate when opening Personal Details — but never clobber in-progress edits
  // (soft refresh every 15s was resetting pronouns mid-edit).
  useEffect(() => {
    if (currentView === 'settings' && settingsSubTab === 'profile' && !settingsDirty) {
      hydratePersonalSettings();
    }
  }, [currentView, settingsSubTab, hydratePersonalSettings, settingsDirty]);

  const verifiedPhone = data.phone || '';
  const phoneIsVerified = !!(data.phoneVerifiedAt || verifiedPhone);
  const googleAuthEmail = data.email || '';
  const hasGoogleAuth = (data.oauthProvider || '').toLowerCase() === 'google' && !!googleAuthEmail;
  const formatDisplayPhone = (phone: string) => {
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 12 && digits.startsWith('91')) {
      return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
    }
    if (digits.length === 10) return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
    return phone || '—';
  };

  const handleSaveSettings = async () => {
    const first = settingsFirstName.trim();
    const last = settingsLastName.trim();
    const pronouns = settingsPronouns.trim();
    if (!first || !last) {
      toast({
        title: 'Name required',
        description: 'Enter both first and last name.',
        variant: 'destructive',
      });
      return;
    }
    if (!pronouns) {
      toast({
        title: 'Pronouns required',
        description: 'Select your pronouns before saving.',
        variant: 'destructive',
      });
      return;
    }

    setIsSettingsSaving(true);
    try {
      const fullName = `${first} ${last}`.trim();
      const ok = await updateData({
        firstName: first,
        lastName: last,
        name: fullName,
        pronouns,
        nationality: settingsNationality.trim(),
      });
      if (!ok) return;
      setSettingsDirty(false);
      if (typeof refreshProfile === 'function') {
        await refreshProfile(true);
      }
      toast({
        title: 'Settings Saved',
        description: 'Personal details updated successfully.',
      });
    } finally {
      setIsSettingsSaving(false);
    }
  };

  const [handleDraft, setHandleDraft] = useState(data.handle || '');
  const [handleCheck, setHandleCheck] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle');
  const [isHandleSaving, setIsHandleSaving] = useState(false);

  useEffect(() => {
    setHandleDraft(data.handle || '');
    setHandleCheck('idle');
  }, [data.handle]);

  const checkHandleAvailability = async (value: string) => {
    const normalized = value.toLowerCase().trim();
    if (!normalized || normalized === (data.handle || '').toLowerCase()) {
      setHandleCheck('idle');
      return;
    }
    if (!/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/.test(normalized) || normalized.length > 40) {
      setHandleCheck('invalid');
      return;
    }
    setHandleCheck('checking');
    try {
      const res = await fetch(`/api/profile/check-handle?handle=${encodeURIComponent(normalized)}`);
      const result = await res.json().catch(() => ({}));
      setHandleCheck(result.available ? 'available' : 'taken');
    } catch {
      setHandleCheck('idle');
    }
  };

  const handleSaveHandle = async () => {
    const normalized = handleDraft.toLowerCase().trim();
    if (!normalized || normalized === (data.handle || '').toLowerCase()) return;
    if (handleCheck === 'taken' || handleCheck === 'invalid') return;
    if (!window.confirm(`Change your portfolio URL to ${normalized}.${PLATFORM_DOMAIN}? The old link will stop working.`)) {
      return;
    }
    setIsHandleSaving(true);
    const ok = await updateData({ handle: normalized });
    setIsHandleSaving(false);
    if (ok) {
      toast({
        title: 'Handle updated',
        description: `Your site is now https://${normalized}.${PLATFORM_DOMAIN}`,
      });
      setHandleCheck('idle');
    }
  };

  const handleTemplateSelect = (id: string) => {
    const tpl = TEMPLATES.find(t => t.id === id);
    if (tpl?.isPro && !data.isPremium) {
      // Free users get a real preview with their own data instead of a dead end.
      if (tpl.previewable) {
        setPreviewTemplateId(id);
      } else {
        toast({
          title: 'Premium Template',
          description: `${tpl.name} is a Pro layout. Preview it with the demo, then upgrade to publish it on your portfolio.`,
        });
      }
      return;
    }
    updateData({ templateId: id });
    toast({
      title: 'Template Selected',
      description: `Layout changed to ${id.toUpperCase()}`,
    });
  };

  const handleThemeSelect = (id: string) => {
    updateData({ themeColor: id });
    toast({
      title: 'Accent Changed',
      description: `Color scheme set to ${id.toUpperCase()}`,
    });
  };

  const handleBgSelect = (id: string) => {
    updateData({ themeBg: id });
    toast({
      title: 'Background Updated',
      description: `Background style set to ${id.toUpperCase()}`,
    });
  };

  const getThemeClass = (isBg = true) => {
    const t = THEMES.find(t => t.id === data.themeColor);
    return t ? (isBg ? t.hex : t.textHex) : 'bg-indigo-600';
  };

  // Render helpers
  const renderAssetEditor = () => {
    if (!['projects', 'certificates', 'achievements', 'research'].includes(activeEditorTab)) return null;
    const assets = editForm.assets as AssetData;
    if (!assets) return null;

    return (
      <div className="mt-4 pt-4 border-t border-slate-100">
        <Label className="text-sm font-semibold text-slate-700 block mb-1">Supporting Materials</Label>
        <p className="text-xs text-slate-400 mb-3">Attach images, documents, or external links. Drag or use arrows to reorder.</p>
        
        <div className="flex p-1 bg-slate-100 rounded-lg mb-3 w-fit">
          <button type="button" onClick={() => handleAssetModeChange('images')} className={cn("flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-colors", assets.mode === 'images' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700")}>
            <ImageIcon className="w-3.5 h-3.5" /> Images
          </button>
          <button type="button" onClick={() => handleAssetModeChange('pdfs')} className={cn("flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-colors", assets.mode === 'pdfs' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700")}>
            <FileText className="w-3.5 h-3.5" /> PDFs
          </button>
          <button type="button" onClick={() => handleAssetModeChange('links')} className={cn("flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-colors", assets.mode === 'links' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700")}>
            <LinkIcon className="w-3.5 h-3.5" /> Links
          </button>
        </div>

        <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 min-h-[100px]">
          {assets.mode === 'images' && (
            <div className="space-y-2">
              <div className="flex justify-between items-center flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">{(assets.images || []).length} / 5 images used</span>
                  {(assets.images || []).length > 1 && (
                    <span className="text-[10px] text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full flex items-center gap-1 font-medium">
                      <GripVertical className="w-3 h-3" /> Reorder enabled
                    </span>
                  )}
                </div>
                <Button type="button" variant="outline" size="sm" className="h-8 text-xs px-3" onClick={() => handleFileUpload('images')} disabled={(assets.images || []).length >= 5 || isStorageFull}>
                  <Upload className="w-3.5 h-3.5 mr-1.5" /> Attach Image
                </Button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {(assets.images || []).map((img, idx) => (
                  <div
                    key={img.id}
                    draggable={(assets.images || []).length > 1}
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', String(idx));
                    }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const fromIdx = parseInt(e.dataTransfer.getData('text/plain'), 10);
                      if (!isNaN(fromIdx)) handleReorderAsset('images', fromIdx, idx);
                    }}
                    className={cn(
                      "relative group bg-white border rounded-xl p-1.5 flex flex-col items-center justify-center h-24 overflow-hidden transition-all duration-200 shadow-sm hover:shadow-md",
                      idx === 0 ? "border-indigo-400 ring-2 ring-indigo-400/20" : "border-slate-200 hover:border-slate-300",
                      (assets.images || []).length > 1 ? "cursor-grab active:cursor-grabbing" : ""
                    )}
                  >
                    {/* Order Tag / Cover Label */}
                    <div className="absolute top-1 left-1 z-10 flex items-center gap-1">
                      <span className={cn(
                        "text-[9px] font-bold px-1.5 py-0.2 rounded shadow-sm",
                        idx === 0 ? "bg-indigo-600 text-white" : "bg-slate-900/70 text-white"
                      )}>
                        {idx === 0 ? "1st (Cover)" : `#${idx + 1}`}
                      </span>
                    </div>

                    <button 
                      type="button" 
                      onClick={(e) => handleRemoveAsset('images', img.id, e)} 
                      className="absolute top-1 right-1 w-5 h-5 bg-white/95 border border-slate-200 rounded-full flex items-center justify-center text-red-500 opacity-90 group-hover:opacity-100 transition-opacity shadow-sm hover:bg-red-50 z-30 cursor-pointer"
                      title="Remove image"
                    >
                      <X className="w-3 h-3" />
                    </button>

                    {img.url && (img.url.startsWith('data:image/') || img.url.startsWith('http') || img.url.startsWith('/')) ? (
                      <div
                        onClick={() => setPreviewTarget({ type: 'images', index: idx, items: assets.images })}
                        className="w-full h-full flex items-center justify-center pt-2 cursor-pointer group/img relative"
                        title="Click to preview image"
                      >
                        <img src={img.url} alt={img.name} className="w-full h-full object-cover rounded-lg group-hover/img:brightness-90 transition-all" />
                        <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover/img:opacity-100 flex items-center justify-center transition-opacity rounded-lg">
                          <Eye className="w-4 h-4 text-white drop-shadow-md" />
                        </div>
                      </div>
                    ) : (
                      <div
                        onClick={() => setPreviewTarget({ type: 'images', index: idx, items: assets.images })}
                        className="w-full h-full flex items-center justify-center cursor-pointer"
                      >
                        <ImageIcon className="w-6 h-6 text-slate-300" />
                      </div>
                    )}

                    <div className="absolute bottom-0 inset-x-0 bg-slate-900/85 backdrop-blur-sm py-0.5 px-1 flex items-center justify-between z-10 text-white">
                      <span className="text-[9px] font-medium text-slate-200 truncate max-w-[50%]">
                        {(img.sizeBytes / 1024 / 1024).toFixed(1)}MB
                      </span>
                      
                      <div className="flex items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => setPreviewTarget({ type: 'images', index: idx, items: assets.images })}
                          className="w-4 h-4 rounded bg-indigo-600/80 hover:bg-indigo-600 flex items-center justify-center transition-colors cursor-pointer"
                          title="Preview full image"
                        >
                          <Eye className="w-3 h-3 text-white" />
                        </button>
                        {(assets.images || []).length > 1 && (
                          <>
                            <button
                              type="button"
                              disabled={idx === 0}
                              onClick={() => handleMoveAsset('images', idx, -1)}
                              className="w-4 h-4 rounded bg-white/20 hover:bg-white/40 disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center transition-colors cursor-pointer"
                              title="Move left"
                            >
                              <ChevronLeft className="w-3 h-3 text-white" />
                            </button>
                            <button
                              type="button"
                              disabled={idx === (assets.images || []).length - 1}
                              onClick={() => handleMoveAsset('images', idx, 1)}
                              className="w-4 h-4 rounded bg-white/20 hover:bg-white/40 disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center transition-colors cursor-pointer"
                              title="Move right"
                            >
                              <ChevronRight className="w-3 h-3 text-white" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {assets.mode === 'pdfs' && (
            <div className="space-y-2">
              <div className="flex justify-between items-center flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">{(assets.pdfs || []).length} / 2 PDFs used</span>
                  {(assets.pdfs || []).length > 1 && (
                    <span className="text-[10px] text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full flex items-center gap-1 font-medium">
                      <GripVertical className="w-3 h-3" /> Reorder enabled
                    </span>
                  )}
                </div>
                <Button type="button" variant="outline" size="sm" className="h-8 text-xs px-3" onClick={() => handleFileUpload('pdfs')} disabled={(assets.pdfs || []).length >= 2 || isStorageFull}>
                  <Upload className="w-3.5 h-3.5 mr-1.5" /> Attach PDF
                </Button>
              </div>
              <div className="flex flex-col gap-1.5">
                {(assets.pdfs || []).map((pdf, idx) => (
                  <div
                    key={pdf.id}
                    draggable={(assets.pdfs || []).length > 1}
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', String(idx));
                    }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const fromIdx = parseInt(e.dataTransfer.getData('text/plain'), 10);
                      if (!isNaN(fromIdx)) handleReorderAsset('pdfs', fromIdx, idx);
                    }}
                    className={cn(
                      "flex items-center justify-between bg-white border rounded-xl px-2.5 py-1.5 shadow-sm transition-all duration-200 hover:border-slate-300",
                      idx === 0 ? "border-indigo-300 bg-indigo-50/20" : "border-slate-200"
                    )}
                  >
                    <div className="flex items-center gap-2 overflow-hidden flex-1">
                      <div className="flex items-center gap-1 shrink-0 text-slate-400">
                        {(assets.pdfs || []).length > 1 && (
                          <GripVertical className="w-3.5 h-3.5 cursor-grab text-slate-400 hover:text-slate-600" />
                        )}
                        <span className={cn(
                          "text-[9px] font-bold px-1.5 py-0.2 rounded",
                          idx === 0 ? "bg-indigo-600 text-white" : "bg-slate-200 text-slate-700"
                        )}>
                          {idx === 0 ? "1st" : `#${idx + 1}`}
                        </span>
                      </div>

                      <div
                        onClick={() => setPreviewTarget({ type: 'pdfs', index: idx, items: assets.pdfs })}
                        className="flex items-center gap-1.5 overflow-hidden hover:underline min-w-0 cursor-pointer group/pdf"
                        title="Click to preview PDF"
                      >
                        <FileText className="w-4 h-4 text-red-500 shrink-0 group-hover/pdf:scale-110 transition-transform" />
                        <span className="text-xs font-medium text-slate-700 truncate max-w-[150px]">{pdf.name}</span>
                      </div>
                      <span className="text-[10px] text-slate-400 tabular-nums">{(pdf.sizeBytes / 1024 / 1024).toFixed(1)}MB</span>
                    </div>

                    <div className="flex items-center gap-1 shrink-0 ml-2">
                      <button
                        type="button"
                        onClick={() => setPreviewTarget({ type: 'pdfs', index: idx, items: assets.pdfs })}
                        className="p-1 text-indigo-600 hover:bg-indigo-50 rounded transition-colors cursor-pointer"
                        title="Preview PDF"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      {(assets.pdfs || []).length > 1 && (
                        <>
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => handleMoveAsset('pdfs', idx, -1)}
                            className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-20 disabled:pointer-events-none transition-colors cursor-pointer"
                            title="Move up"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === (assets.pdfs || []).length - 1}
                            onClick={() => handleMoveAsset('pdfs', idx, 1)}
                            className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-20 disabled:pointer-events-none transition-colors cursor-pointer"
                            title="Move down"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={(e) => handleRemoveAsset('pdfs', pdf.id, e)}
                        className="text-slate-400 hover:text-red-500 p-1 cursor-pointer"
                        title="Remove PDF"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {assets.mode === 'links' && (
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-400">{(assets.links || []).length} / 3 links used</span>
                <Button type="button" variant="outline" size="sm" className="h-8 text-xs px-3" onClick={handleAddLink} disabled={(assets.links || []).length >= 3}>
                  <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Link
                </Button>
              </div>
              <div className="flex flex-col gap-2">
                {(assets.links || []).map((link, idx) => (
                  <div key={link.id} className="flex items-start gap-1.5">
                    <div className="flex-1 space-y-1">
                      <Input 
                        placeholder="Title (e.g. Project Demo)" 
                        value={link.name} 
                        onChange={e => {
                          const newLinks = [...assets.links];
                          newLinks[idx].name = e.target.value;
                          setEditForm({...editForm, assets: {...assets, links: newLinks}});
                        }} 
                        className="h-8 text-xs px-2.5"
                      />
                      <Input 
                        placeholder="https://..." 
                        value={link.url} 
                        onChange={e => {
                          const newLinks = [...assets.links];
                          newLinks[idx].url = e.target.value;
                          setEditForm({...editForm, assets: {...assets, links: newLinks}});
                        }} 
                        className="h-8 text-xs px-2.5"
                      />
                    </div>
                    <div className="flex items-center gap-1 mt-0.5">
                      <button
                        type="button"
                        onClick={() => setPreviewTarget({ type: 'links', index: idx, items: assets.links })}
                        className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded transition-colors cursor-pointer"
                        title="Preview link"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      <button type="button" onClick={(e) => handleRemoveAsset('links', link.id, e)} className="text-slate-400 hover:text-red-500 p-1.5 cursor-pointer" title="Remove link">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderFields = () => {
    switch (activeEditorTab) {
      case 'about':
        return (
          <>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Title / Headline</Label>
              <Input value={editForm.title || ''} onChange={e => setEditForm({...editForm, title: e.target.value})} placeholder="e.g. Aspiring Software Developer" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Current Education or Work</Label>
              <Input value={editForm.currentStatus || ''} onChange={e => setEditForm({...editForm, currentStatus: e.target.value})} placeholder="e.g. Studying BS Statistics at PSG College" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Bio / Description</Label>
              <textarea value={editForm.description || ''} onChange={e => setEditForm({...editForm, description: e.target.value})} className="flex min-h-[80px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 resize-none" placeholder="Write a summary..." />
            </div>
          </>
        );
      case 'education':
        return (
          <>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">School / University</Label>
              <Input value={editForm.institution || ''} onChange={e => setEditForm({...editForm, institution: e.target.value})} placeholder="e.g. Stanford University" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Degree / Field</Label>
              <Input value={editForm.degree || ''} onChange={e => setEditForm({...editForm, degree: e.target.value})} placeholder="e.g. Bachelor of Science" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Start Year</Label>
                <Input value={editForm.startYear || ''} onChange={e => setEditForm({...editForm, startYear: e.target.value})} placeholder="e.g. 2020" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">End Year</Label>
                <div className="flex gap-2 items-center">
                  <Input 
                    value={editForm.endYear === 'Present' ? '' : (editForm.endYear || '')} 
                    onChange={e => setEditForm({...editForm, endYear: e.target.value})} 
                    disabled={editForm.endYear === 'Present'} 
                    placeholder="e.g. 2024" 
                    className="flex-1 text-sm h-10 px-3 rounded-xl border border-slate-200"
                  />
                  <label className="flex items-center gap-1.5 text-xs text-slate-600 font-medium cursor-pointer shrink-0">
                    <input 
                      type="checkbox" 
                      checked={editForm.endYear === 'Present'} 
                      onChange={e => setEditForm({...editForm, endYear: e.target.checked ? 'Present' : ''})} 
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                    />
                    Still there
                  </label>
                </div>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Grade / Details</Label>
              <Input value={editForm.grade || ''} onChange={e => setEditForm({...editForm, grade: e.target.value})} placeholder="e.g. 3.8 GPA" />
            </div>
          </>
        );
      case 'experience':
        return (
          <>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Company / Org</Label>
              <Input value={editForm.company || ''} onChange={e => setEditForm({...editForm, company: e.target.value})} placeholder="e.g. Google" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Role</Label>
              <Input value={editForm.role || ''} onChange={e => setEditForm({...editForm, role: e.target.value})} placeholder="e.g. Software Intern" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Start Date / Year</Label>
                <Input value={editForm.startYear || ''} onChange={e => setEditForm({...editForm, startYear: e.target.value})} placeholder="e.g. 01/2024" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">End Date / Year</Label>
                <div className="flex gap-2 items-center">
                  <Input 
                    value={editForm.endYear === 'Present' ? '' : (editForm.endYear || '')} 
                    onChange={e => setEditForm({...editForm, endYear: e.target.value})} 
                    disabled={editForm.endYear === 'Present'} 
                    placeholder="e.g. 11/2025" 
                    className="flex-1 text-sm h-10 px-3 rounded-xl border border-slate-200"
                  />
                  <label className="flex items-center gap-1.5 text-xs text-slate-655 font-medium cursor-pointer shrink-0">
                    <input 
                      type="checkbox" 
                      checked={editForm.endYear === 'Present'} 
                      onChange={e => setEditForm({...editForm, endYear: e.target.checked ? 'Present' : ''})} 
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                    />
                    Still there
                  </label>
                </div>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Responsibility description</Label>
              <textarea value={editForm.description || ''} onChange={e => setEditForm({...editForm, description: e.target.value})} className="flex min-h-[80px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 resize-none" />
            </div>
          </>
        );
      case 'projects':
        return (
          <>
            {renderAssetEditor()}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Project Name</Label>
              <Input value={editForm.title || ''} onChange={e => setEditForm({...editForm, title: e.target.value})} placeholder="e.g. E-Commerce API" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Description</Label>
              <textarea value={editForm.description || ''} onChange={e => setEditForm({...editForm, description: e.target.value})} className="flex min-h-[70px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 resize-none" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Tech Stack</Label>
              <Input value={editForm.tech || ''} onChange={e => setEditForm({...editForm, tech: e.target.value})} placeholder="e.g. React, PostgreSQL" />
            </div>
          </>
        );
      case 'certificates':
      case 'achievements':
      case 'research':
        return (
          <>
            {renderAssetEditor()}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Title</Label>
              <Input value={editForm.title || ''} onChange={e => setEditForm({...editForm, title: e.target.value})} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{activeEditorTab === 'certificates' ? 'Issuer' : 'Organization'}</Label>
                <Input value={editForm.organization || editForm.issuer || ''} onChange={e => setEditForm({...editForm, [activeEditorTab === 'certificates' ? 'issuer' : 'organization']: e.target.value})} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal h-10 border border-slate-200 rounded-xl px-3 hover:bg-slate-50",
                        !editForm.date && "text-slate-400"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4 text-slate-400 shrink-0" />
                      {editForm.date ? (
                        format(new Date(editForm.date + 'T00:00:00'), "PPP")
                      ) : (
                        <span>Pick a date</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 rounded-2xl border border-slate-200 bg-white shadow-xl z-[9999]" align="start">
                    <Calendar
                      mode="single"
                      selected={editForm.date ? new Date(editForm.date + 'T00:00:00') : undefined}
                      onSelect={(date) => {
                        if (date) {
                          const yyyy = date.getFullYear();
                          const mm = String(date.getMonth() + 1).padStart(2, '0');
                          const dd = String(date.getDate()).padStart(2, '0');
                          setEditForm({ ...editForm, date: `${yyyy}-${mm}-${dd}` });
                        } else {
                          setEditForm({ ...editForm, date: '' });
                        }
                      }}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </>
        );
      default: return null;
    }
  };

  const renderPreview = (entry: any) => {
    switch (activeEditorTab) {
      case 'education': {
        const start = entry.startYear || '';
        const end = entry.endYear || '';
        const yearStr = (start && end) ? `${start} - ${end}` : (entry.year || '');
        return `${entry.degree || ''}${yearStr ? ` • ${yearStr}` : ''}${entry.grade ? ` • ${entry.grade}` : ''}`;
      }
      case 'experience': {
        const start = entry.startYear || '';
        const end = entry.endYear || '';
        const durationStr = (start && end) ? `${start} - ${end}` : (entry.duration || '');
        return `${entry.role || ''}${durationStr ? ` • ${durationStr}` : ''}`;
      }
      case 'projects': return `${entry.tech || ''}`;
      case 'certificates': return `${entry.issuer || ''} • ${entry.date || ''}`;
      case 'achievements': 
      case 'research': return `${entry.organization || ''} • ${entry.date || ''}`;
      default: return entry.currentStatus ? `${entry.currentStatus} • ${entry.description}` : entry.description;
    }
  };

  const renderAssetPreviewIcon = (entry: any) => {
    if (!entry.assets) return null;
    const a = entry.assets as AssetData;
    if (a.images?.length > 0) return <div className="flex items-center gap-1 text-xs text-indigo-500 mt-1"><ImageIcon className="w-3.5 h-3.5"/> {a.images.length} Images</div>;
    if (a.pdfs?.length > 0) return <div className="flex items-center gap-1 text-xs text-red-600 mt-1"><FileText className="w-3.5 h-3.5"/> {a.pdfs.length} PDFs</div>;
    if (a.links?.length > 0) return <div className="flex items-center gap-1 text-xs text-emerald-600 mt-1"><LinkIcon className="w-3.5 h-3.5"/> {a.links.length} Links</div>;
    return null;
  };

  const renderAcademicMockup = (accentBg: string) => (
    <div className="w-full h-full bg-slate-50 border border-slate-200/60 rounded-lg p-2 flex gap-2 relative overflow-hidden select-none">
      {/* Left side info column */}
      <div className="w-1/3 border-r border-slate-200/80 pr-1.5 flex flex-col items-center pt-1">
        <div className={`w-5 h-5 rounded-full ${accentBg} opacity-25 mb-1 flex items-center justify-center`}>
          <User className="w-2.5 h-2.5 text-slate-600" />
        </div>
        <div className="h-1.5 w-8 bg-slate-400/85 rounded mb-1" />
        <div className="space-y-0.5 w-full mt-1.5">
          <div className="h-1 w-full bg-slate-300/40 rounded" />
          <div className="h-1 w-full bg-slate-300/40 rounded" />
          <div className="h-1 w-4/5 bg-slate-300/40 rounded" />
        </div>
      </div>
      {/* Right list column */}
      <div className="w-2/3 flex flex-col justify-between py-1">
        <div className={`h-2.5 w-12 ${accentBg} rounded mb-1.5`} />
        <div className="space-y-1">
          <div className="p-1 bg-white border border-slate-200/60 rounded-sm flex items-center justify-between">
            <div className="h-1 w-10 bg-slate-400 rounded-sm" />
            <div className="h-1 w-6 bg-slate-300 rounded-sm" />
          </div>
          <div className="p-1 bg-white border border-slate-200/60 rounded-sm flex items-center justify-between">
            <div className="h-1 w-12 bg-slate-400 rounded-sm" />
            <div className="h-1 w-5 bg-slate-300 rounded-sm" />
          </div>
          <div className="p-1 bg-white border border-slate-200/60 rounded-sm flex items-center justify-between">
            <div className="h-1 w-8 bg-slate-400 rounded-sm" />
            <div className="h-1 w-7 bg-slate-300 rounded-sm" />
          </div>
        </div>
      </div>
    </div>
  );

  const renderCreativeMockup = (accentBg: string) => (
    <div className="w-full h-full bg-slate-50 border border-slate-200/60 rounded-lg p-2 flex flex-col gap-2 relative overflow-hidden select-none">
      {/* Top half: featured block */}
      <div className={`w-full h-1/2 rounded-md ${accentBg} p-1.5 flex flex-col justify-between relative overflow-hidden text-[9px] font-bold text-white`}>
        {/* Glow overlay */}
        <div className="absolute inset-0 bg-gradient-to-tr from-black/40 via-transparent to-transparent z-0" />
        <div className="relative z-10 flex justify-between items-start">
          <div className="w-4 h-4 rounded-full bg-white/20" />
          <div className="h-1 w-6 bg-white/40 rounded-sm" />
        </div>
        <div className="relative z-10 h-1.5 w-16 bg-white/90 rounded-sm" />
      </div>
      {/* Bottom half: cards row */}
      <div className="w-full h-1/2 flex gap-1.5">
        <div className="w-1/2 bg-white border border-slate-200/60 rounded-sm p-1 flex flex-col justify-between">
          <div className="h-1.5 w-6 bg-slate-400 rounded-sm" />
          <div className="h-1 w-8 bg-slate-300 rounded-sm" />
        </div>
        <div className="w-1/2 bg-white border border-slate-200/60 rounded-sm p-1 flex flex-col justify-between">
          <div className="h-1.5 w-5 bg-slate-400 rounded-sm" />
          <div className="h-1 w-8 bg-slate-300 rounded-sm" />
        </div>
      </div>
    </div>
  );

  const renderNicoMockup = (accentBg: string) => (
    <div className="w-full h-full bg-[#e8e8e0] border border-slate-300/50 rounded-lg p-1.5 flex gap-1.5 relative overflow-hidden select-none">
      <div className="flex-1 flex flex-col justify-between py-0.5">
        <div className="h-1 w-8 bg-slate-400/70 rounded-sm" />
        <div className="space-y-0.5">
          <div className="h-2 w-14 bg-slate-800 rounded-sm" />
          <div className="h-1 w-10 bg-slate-400/60 rounded-sm" />
        </div>
        <div className={`h-2 w-10 rounded-sm ${accentBg} opacity-80`} />
      </div>
      <div className="w-[42%] rounded-md bg-slate-300/80 border border-dashed border-slate-400/60 overflow-hidden relative">
        <div className="absolute inset-1 rounded-sm bg-gradient-to-b from-slate-200 to-slate-400/50" />
      </div>
    </div>
  );

  return (
    <div className="min-h-[100dvh] w-full overflow-x-hidden flex flex-col transition-colors duration-300 bg-slate-50 text-slate-800 bexo-mobile-shell">
      {/* Premium custom top-right "Successfully Logged In" toast */}
      {showLoginToast && (
        <div className="fixed left-3 right-3 top-[max(0.75rem,env(safe-area-inset-top))] z-[100] sm:left-auto sm:right-6 sm:top-6 animate-in slide-in-from-top-4 md:slide-in-from-right-4 duration-500">
          <div className="bg-slate-900 text-white rounded-2xl shadow-2xl p-3.5 pr-11 sm:p-4 sm:pr-12 flex items-center gap-3 border border-slate-800 w-full sm:max-w-sm relative">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold tracking-tight">Successfully logged in</p>
              <p className="text-[11px] text-slate-400 leading-normal mt-0.5">Welcome back! Manage your digital portfolio credentials here.</p>
            </div>
            <button 
              onClick={() => setShowLoginToast(false)}
              className="absolute right-3 top-3 text-slate-500 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Navigation bar */}
      <header className="bg-white/80 backdrop-blur-md border-b border-slate-200 px-3 py-2.5 sm:px-6 sm:py-4 flex items-center justify-between sticky top-0 z-20 transition-colors duration-300 w-full pt-[max(0.625rem,env(safe-area-inset-top))]">
        <div className="flex items-center gap-2 cursor-pointer min-w-0 min-h-11" onClick={() => goView('overview')}>
          <BrandLogo size="sm" className="sm:hidden" />
          <BrandLogo size="md" className="hidden sm:inline-flex" />
          <span className="font-serif font-bold text-lg sm:text-xl text-slate-900 tracking-tight">BEXO</span>
        </div>
        <div className="flex items-center gap-3 sm:gap-4 relative shrink-0" ref={profileMenuRef}>
          <div className="text-sm font-semibold text-slate-700 hidden md:block select-none transition-colors">
            {data.name || 'User'}
          </div>
          <button 
            onClick={() => setShowProfileMenu(!showProfileMenu)}
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold text-sm border-2 border-indigo-200 hover:border-indigo-400 hover:shadow-sm focus:outline-none overflow-hidden transition-all shrink-0"
            aria-label="Toggle profile menu"
          >
            {data.photoUrl ? (
              <img src={data.photoUrl} alt="Profile" className="w-full h-full object-cover" />
            ) : (
              (data.name ? data.name.charAt(0) : 'U')
            )}
          </button>
          
          {showProfileMenu && (
            <div className="absolute right-0 top-full mt-2 w-[min(18rem,calc(100vw-1.5rem))] bg-white rounded-2xl border border-slate-200 shadow-xl py-3 z-30 animate-in fade-in slide-in-from-top-2 duration-200">
              {/* Header with user info */}
              <div className="px-4 py-2.5 border-b border-slate-100 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold border border-indigo-100 overflow-hidden shrink-0">
                  {data.photoUrl ? <img src={data.photoUrl} alt="Profile" className="w-full h-full object-cover" /> : (data.name ? data.name.charAt(0) : 'U')}
                </div>
                <div className="truncate">
                  <h4 className="font-semibold text-slate-800 text-sm truncate">{data.name || 'Bexo User'}</h4>
                  <p className="text-xs text-slate-400 truncate">{data.contactData?.email || 'No email set'}</p>
                </div>
              </div>
              
              {/* Plan details */}
              <div className="mx-3 my-2 px-3 py-2 bg-slate-50 rounded-xl border border-slate-100">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500 font-medium">Workspace Plan</span>
                  <span className="font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full capitalize">
                    {planName}
                  </span>
                </div>
              </div>

              {/* Quick Toggle for Hiring Availability */}
              <div className={cn(
                "mx-3 my-1.5 px-3 py-2 rounded-xl border transition-colors flex items-center justify-between",
                data.openToHire 
                  ? "bg-emerald-50/60 border-emerald-100 text-emerald-900" 
                  : "bg-slate-50/50 border-slate-100/85 text-slate-700"
              )}>
                <div className="flex flex-col">
                  <span className="text-[11px] font-bold">Willing to Work</span>
                  <span className={cn(
                    "text-[9px]",
                    data.openToHire ? "text-emerald-600 font-semibold" : "text-slate-450"
                  )}>{data.openToHire ? 'Actively looking' : 'Not looking'}</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const newStatus = !data.openToHire;
                    updateData({ openToHire: newStatus });
                  }}
                  className={cn(
                    "w-9 h-5 rounded-full transition-colors relative focus:outline-none focus:ring-1 focus:ring-indigo-500 shrink-0",
                    data.openToHire ? "bg-emerald-500" : "bg-slate-200"
                  )}
                >
                  <span 
                    className={cn(
                      "absolute left-0.5 top-0.5 bg-white w-4 h-4 rounded-full shadow-sm transition-transform duration-200",
                      data.openToHire ? "translate-x-4" : "translate-x-0"
                    )}
                  />
                </button>
              </div>
              
              {/* Menu items */}
              <div className="px-1.5 py-1">
                <button 
                  onClick={() => { goView('overview'); setShowProfileMenu(false); }} 
                  className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-indigo-50 hover:text-indigo-900 transition-colors flex items-center gap-2.5"
                >
                  <Layout className="w-4 h-4 text-slate-400" /> Dashboard Overview
                </button>
                <button 
                  onClick={() => { goView('edit-profile'); setShowProfileMenu(false); }} 
                  className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-indigo-50 hover:text-indigo-900 transition-colors flex items-center gap-2.5"
                >
                  <User className="w-4 h-4 text-slate-400" /> Edit Profile Info
                </button>
                <button 
                  onClick={() => { goView('settings'); setShowProfileMenu(false); }} 
                  className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-indigo-50 hover:text-indigo-900 transition-colors flex items-center gap-2.5"
                >
                  <Settings className="w-4 h-4 text-slate-400" /> Appearance & Settings
                </button>
              </div>
              
              {/* Sign out */}
              <div className="border-t border-slate-100 px-3 pt-2 mt-2">
                <button 
                  onClick={handleLogout}
                  className="w-full text-center px-4 py-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-xl text-xs font-bold transition-all duration-200 select-none"
                >
                  Sign Out
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      <main
        className={cn(
          "mx-auto w-full min-w-0 px-3 pt-5 pb-[calc(6.75rem+env(safe-area-inset-bottom))] sm:px-4 sm:pt-8 md:px-6 md:py-12",
          currentView === "settings" ? "max-w-[min(100%,96rem)]" : "max-w-5xl xl:max-w-7xl",
        )}
      >
        {/* Main Dashboard Overview */}
        {currentView === 'overview' && (
          <div className="space-y-5 sm:space-y-8 dash-stagger">
            {(data.isInPaymentGrace || data.siteStatus === 'grace') && (
              <Card className="p-4 border-amber-200 bg-amber-50 text-amber-950">
                <p className="text-sm font-bold">Autopay payment failed</p>
                <p className="text-xs mt-1 text-amber-800/90">
                  Your portfolio stays live during a 15-day grace period
                  {data.graceUntil
                    ? ` (pauses on ${new Date(data.graceUntil).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })})`
                    : ''}
                  . Update billing to avoid a public pause page.
                </p>
                <Button size="sm" className="mt-3 h-9 text-xs" onClick={openBilling}>Fix billing</Button>
              </Card>
            )}
            {(data.isPausedForVisitors || data.overStorage || data.siteStatus === 'paused') && (
              <Card className="p-4 border-rose-200 bg-rose-50 text-rose-950">
                <p className="text-sm font-bold">Public portfolio paused</p>
                <p className="text-xs mt-1 text-rose-800/90">
                  {data.pauseReason === 'storage_exceeded' || data.overStorage
                    ? 'Visitors see a pause page because storage is over your plan limit. Delete assets or add storage to remount.'
                    : data.pauseReason === 'payment_failed'
                      ? 'Visitors see a pause page because auto-renew failed and the grace window ended. Update billing to remount.'
                      : 'Visitors currently see a pause page instead of your portfolio.'}
                </p>
                <div className="flex flex-wrap gap-2 mt-3">
                  <Button size="sm" className="h-9 text-xs" onClick={openBilling}>Open billing</Button>
                  <Button size="sm" variant="outline" className="h-9 text-xs" onClick={() => { goView('settings', { settingsTab: 'assets' }); loadAssets(); }}>
                    Manage assets
                  </Button>
                </div>
              </Card>
            )}
            <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-3.5 sm:gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1.5 sm:mb-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-100 bg-indigo-50/70 px-2.5 py-1 text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.12em] text-indigo-600">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                    Command center
                  </span>
                </div>
                <h1 className="font-serif text-[1.65rem] leading-tight sm:text-3xl md:text-4xl font-bold text-slate-900 tracking-tight break-words">
                  Welcome back, {data.name?.split(' ')[0] || 'there'}
                </h1>
                <p className="text-[13px] sm:text-base text-slate-500 max-w-2xl mt-1.5 leading-relaxed">Keep your public portfolio ready for applications, recruiters, and campus opportunities.</p>
              </div>
              <div className="grid grid-cols-2 gap-2 w-full md:w-auto md:flex md:flex-wrap md:items-center">
                <Button onClick={() => goView('edit-profile')} className="tap-scale h-11 md:h-10 px-3 sm:px-4 text-xs gap-1.5 sm:gap-2 w-full md:w-auto">
                  <Pencil className="w-4 h-4 shrink-0" /> Edit profile
                </Button>
                <a href={correctVisitUrl} target="_blank" rel="noreferrer" className="w-full md:w-auto">
                  <Button variant="outline" className="tap-scale h-11 md:h-10 px-3 sm:px-4 text-xs gap-1.5 sm:gap-2 w-full">
                    <ExternalLink className="w-4 h-4 shrink-0" /> View live
                  </Button>
                </a>
              </div>
            </div>

            {(() => {
              const checks = [
                { ok: !!data.photoUrl, label: 'Photo', fix: () => { setShowCompletionModal(true); } },
                { ok: !!(data.aboutEntries && data.aboutEntries.length), label: 'Bio', fix: () => { goView('edit-profile'); setActiveEditorTab('about'); } },
                { ok: !!(data.projectEntries && data.projectEntries.length), label: 'Project', fix: () => { goView('edit-profile'); setActiveEditorTab('projects'); setTimeout(() => handleAdd(), 0); } },
                { ok: !!data.contactData?.email, label: 'Email', fix: () => { goView('edit-profile'); setActiveEditorTab('contact'); } },
                { ok: !!data.openToHire, label: 'Open to hire', fix: () => { void updateData({ openToHire: true }); } },
              ];
              const done = checks.filter((c) => c.ok).length;
              const pct = Math.round((done / checks.length) * 100);
              if (pct >= 100) return null;
              return (
                <Card className="p-4 sm:p-5 border-indigo-100 bg-gradient-to-br from-indigo-50/80 to-white shadow-sm">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                    <div>
                      <p className="text-sm font-bold text-slate-900">Portfolio readiness · {pct}%</p>
                      <p className="text-xs text-slate-500 mt-0.5">Recruiters trust complete profiles. Fix the gaps below.</p>
                    </div>
                    <div className="h-2 w-full sm:w-40 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {checks.filter((c) => !c.ok).map((c) => (
                      <button
                        key={c.label}
                        type="button"
                        onClick={c.fix}
                        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full border border-slate-200 bg-white text-[11px] font-semibold text-slate-700 hover:border-indigo-200 hover:text-indigo-700"
                      >
                        <Plus className="w-3 h-3" /> {c.label}
                      </button>
                    ))}
                  </div>
                </Card>
              );
            })()}

            {/* Storage Alert (only shows if usedStorage >= 90% of limit) */}
            {isStorageExhausted90 && (
              <Card className="p-5 bg-rose-50 border border-rose-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-6 animate-in slide-in-from-top duration-300">
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2 text-rose-800 font-bold text-lg">
                    <AlertCircle className="w-5 h-5 text-rose-500 animate-pulse shrink-0" />
                    Cloud Storage is {Math.round(storagePercentage)}% Full
                  </div>
                  <p className="text-xs text-rose-600 leading-relaxed">
                    Your portfolio storage is almost exhausted ({(usedStorage / 1024 / 1024).toFixed(1)}MB of {(storageLimit / 1024 / 1024).toFixed(0)}MB used). Upgrade to ensure all your photos, PDFs, and assets remain online and accessible.
                  </p>
                  <div className="h-1.5 w-full bg-rose-100 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-rose-600 rounded-full transition-all duration-500"
                      style={{ width: `${storagePercentage}%` }}
                    />
                  </div>
                </div>
                <Button
                  onClick={openBilling}
                  className="bg-rose-600 text-white hover:bg-rose-700 border-none px-5 h-10 text-xs font-semibold shadow-md flex items-center gap-1.5 shrink-0"
                >
                  <CreditCard className="w-4 h-4" /> Review plans
                </Button>
              </Card>
            )}

            <div className="grid lg:grid-cols-[1.35fr_0.85fr] gap-4 sm:gap-6 items-stretch">
              <Card className="relative p-4 sm:p-6 bg-slate-950 text-slate-100 border border-slate-900 shadow-lg shadow-slate-950/10 overflow-hidden min-w-0">
                <div className="pointer-events-none absolute -top-24 -right-16 h-56 w-56 rounded-full bg-indigo-600/25 blur-3xl" />
                <div className="pointer-events-none absolute -bottom-28 -left-10 h-48 w-48 rounded-full bg-emerald-500/10 blur-3xl" />
                <div className="relative flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 sm:gap-5">
                  <div className="space-y-4 sm:space-y-5 min-w-0">
                    <div>
                      <p className="text-[10px] sm:text-xs font-bold uppercase tracking-[0.14em] text-indigo-300/80">Next best action</p>
                      <h2 className="text-xl sm:text-2xl font-bold mt-1.5 sm:mt-2 leading-snug">{nextAction.label}</h2>
                      <p className="text-[13px] sm:text-sm text-slate-300 mt-1 max-w-xl leading-relaxed">{nextAction.detail}</p>
                    </div>
                    <Button
                      onClick={nextAction.action}
                      className="tap-scale h-11 px-4 bg-slate-100 text-slate-950 hover:bg-white border-none shadow-none gap-2 w-full sm:w-auto"
                    >
                      <NextActionIcon className="w-4 h-4" /> Continue
                    </Button>
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-1 gap-2 sm:gap-3 sm:w-36 min-w-0">
                    <button
                      type="button"
                      onClick={openReadiness}
                      className="rounded-xl bg-white/[0.06] border border-white/10 backdrop-blur-sm p-2.5 sm:p-3 min-w-0 text-left hover:bg-white/[0.1] hover:border-white/20 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
                      title="See what’s missing for 100% readiness"
                    >
                      <p className="text-[10px] sm:text-[11px] text-slate-400 font-semibold">Readiness</p>
                      <p className="text-lg sm:text-xl font-bold mt-0.5 sm:mt-1 tabular-nums">{completionScore}%</p>
                      <div className="mt-1.5 h-1 w-full rounded-full bg-white/10 overflow-hidden">
                        <div className="h-full rounded-full bg-indigo-400 transition-all duration-700" style={{ width: `${completionScore}%` }} />
                      </div>
                      <p className="mt-1.5 text-[9px] sm:text-[10px] font-semibold text-indigo-200/90">
                        {completionScore >= 100 ? 'Complete' : `Tap · ${missingReadiness.length} left`}
                      </p>
                    </button>
                    <div className="rounded-xl bg-white/[0.06] border border-white/10 backdrop-blur-sm p-2.5 sm:p-3 min-w-0">
                      <p className="text-[10px] sm:text-[11px] text-slate-400 font-semibold">Entries</p>
                      <p className="text-lg sm:text-xl font-bold mt-0.5 sm:mt-1 tabular-nums">{totalEntries}</p>
                    </div>
                    <div className="rounded-xl bg-white/[0.06] border border-white/10 backdrop-blur-sm p-2.5 sm:p-3 min-w-0">
                      <p className="text-[10px] sm:text-[11px] text-slate-400 font-semibold">Plan</p>
                      <p className="text-xs sm:text-sm font-bold mt-0.5 sm:mt-1 truncate">{planName}</p>
                    </div>
                  </div>
                </div>
              </Card>

              <Card className="p-4 sm:p-6 bg-white border border-slate-200 shadow-sm min-w-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] sm:text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Subscription</p>
                    <h3 className="text-lg sm:text-xl font-bold text-slate-900 mt-1.5 sm:mt-2 truncate">{billingLoading ? 'Checking plan' : planName}</h3>
                    <p className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
                      <CalendarClock className="w-3.5 h-3.5 shrink-0" /> <span className="truncate">{planRenewal}</span>
                    </p>
                  </div>
                  <span className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] sm:text-xs font-bold shrink-0 whitespace-nowrap",
                    data.isPremium ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"
                  )}>
                    {data.isPremium ? <Crown className="w-3.5 h-3.5" /> : <CreditCard className="w-3.5 h-3.5" />}
                    {planBadgeLabel}
                  </span>
                </div>
                <div className="mt-5 sm:mt-6 space-y-3">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-600 gap-2">
                    <span>Storage</span>
                    <span className="tabular-nums shrink-0">{(usedStorage / 1024 / 1024).toFixed(1)} / {(storageLimit / 1024 / 1024).toFixed(0)} MB</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className={cn("h-full rounded-full transition-all duration-500", isStorageExhausted90 ? "bg-rose-500" : "bg-emerald-500")}
                      style={{ width: `${storagePercentage}%` }}
                    />
                  </div>
                  <Button variant="outline" onClick={openBilling} className="w-full h-10 text-xs gap-2">
                    <CreditCard className="w-4 h-4" /> Billing · upgrade or cancel
                  </Button>
                </div>
              </Card>
            </div>

            {/* Review live portfolio — primary surface */}
            <Card className="relative overflow-hidden border-slate-200/80 bg-white shadow-sm min-w-0">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(99,102,241,0.08),_transparent_55%)]" />
              <div className="relative p-4 sm:p-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch lg:justify-between">
                  <div className="min-w-0 flex-1 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                          <Eye className="w-4 h-4" />
                        </span>
                        <div>
                          <p className="text-[10px] sm:text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Review portfolio</p>
                          <h2 className="text-base sm:text-lg font-bold text-slate-900 leading-tight">Your live public site</h2>
                        </div>
                      </div>
                      <span className={cn(
                        "inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0",
                        data.isPausedForVisitors || data.siteStatus === 'paused'
                          ? "text-rose-700 bg-rose-50"
                          : "text-emerald-700 bg-emerald-50"
                      )}>
                        <span className={cn(
                          "w-1.5 h-1.5 rounded-full",
                          data.isPausedForVisitors || data.siteStatus === 'paused' ? "bg-rose-500" : "bg-emerald-500 animate-pulse"
                        )} />
                        {data.isPausedForVisitors || data.siteStatus === 'paused' ? 'Paused' : 'Online'}
                      </span>
                    </div>

                    <div className="rounded-2xl border border-slate-100 bg-slate-50/80 px-3.5 py-3 sm:px-4 sm:py-3.5">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <Globe className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Public URL</p>
                          <p className="font-mono text-sm sm:text-base text-slate-900 break-all leading-snug">
                            https://<span className="text-indigo-600 font-semibold">{url}</span>
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
                      <Button variant="outline" size="sm" onClick={handleCopyUrl} className="tap-scale h-10 sm:h-9 px-2 sm:px-3 text-xs gap-1.5 justify-center">
                        {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                        {copied ? 'Copied' : 'Copy'}
                      </Button>
                      <Button variant="outline" size="sm" onClick={handleShareUrl} className="tap-scale h-10 sm:h-9 px-2 sm:px-3 text-xs gap-1.5 justify-center">
                        <Share2 className="w-3.5 h-3.5 text-indigo-500" />
                        Share
                      </Button>
                      <a href={correctVisitUrl} target="_blank" rel="noreferrer" className="contents">
                        <Button size="sm" className="tap-scale h-10 sm:h-9 px-3 text-xs gap-1.5 justify-center w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white border-none">
                          Visit live <ExternalLink className="w-3.5 h-3.5" />
                        </Button>
                      </a>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={openReadiness}
                    className="hidden sm:flex lg:w-44 shrink-0 flex-col justify-between rounded-2xl border border-indigo-100/80 bg-gradient-to-b from-indigo-50 to-white p-4 text-left hover:border-indigo-200 hover:shadow-sm transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                    title="See what’s missing for 100% readiness"
                  >
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-indigo-400">Readiness</p>
                      <p className="mt-1 text-3xl font-bold tabular-nums text-slate-900 tracking-tight">{completionScore}%</p>
                      <div className="mt-2.5 h-1.5 w-full rounded-full bg-indigo-100 overflow-hidden">
                        <div className="h-full rounded-full bg-indigo-500 transition-all duration-700" style={{ width: `${completionScore}%` }} />
                      </div>
                    </div>
                    <p className="text-[11px] text-indigo-600 font-semibold leading-snug mt-4">
                      {completionScore >= 100
                        ? 'You’re at 100%.'
                        : `Tap to fix ${missingReadiness.length} missing item${missingReadiness.length === 1 ? '' : 's'}`}
                    </p>
                  </button>
                </div>
              </div>
            </Card>

            {/* Analytics — sits directly under review portfolio */}
            <Card className="relative overflow-hidden border-slate-200/80 bg-white shadow-sm min-w-0">
              <div className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full bg-emerald-400/10 blur-3xl" />
              <div className="relative p-4 sm:p-6">
                <div className="flex items-start justify-between gap-3 mb-4">
                  <button
                    type="button"
                    onClick={() => hasAnalyticsAccess && setLocation('/dashboard/analytics')}
                    className={`flex items-start gap-2.5 min-w-0 text-left ${hasAnalyticsAccess ? 'hover:opacity-90' : ''}`}
                  >
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 shrink-0">
                      <BarChart3 className="w-4 h-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[10px] sm:text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Portfolio analytics</p>
                      <h3 className="text-base sm:text-lg font-bold text-slate-900 leading-tight">Visits, leads & readiness</h3>
                      <p className="text-xs text-slate-500 mt-0.5 hidden sm:block">
                        {hasAnalyticsAccess ? 'Last 30 days · tap for full report' : 'See who finds you — unlock on Essential or Growth'}
                      </p>
                    </div>
                  </button>
                  {hasAnalyticsAccess && (
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={() => setLocation('/dashboard/analytics')}
                      >
                        Open
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs shrink-0"
                        onClick={() => { loadAnalytics(); loadLeads(); }}
                        disabled={analyticsLoading}
                      >
                        {analyticsLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Refresh'}
                      </Button>
                    </div>
                  )}
                </div>

                {hasAnalyticsAccess ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-[1.1fr_0.9fr] gap-3 sm:gap-4">
                      <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3.5 sm:p-4">
                        <div className="flex items-center justify-between gap-2 mb-3">
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Traffic pulse</p>
                            <p className="text-2xl font-bold tabular-nums text-slate-900 tracking-tight">
                              {analyticsSummary?.totals?.displayViews ?? (analyticsLoading ? '—' : 0)}
                              <span className="ml-1.5 text-xs font-semibold text-slate-400">visits</span>
                            </p>
                          </div>
                          <span className="inline-flex items-center gap-1 rounded-full bg-white border border-slate-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                            <TrendingUp className="w-3 h-3" /> 30d
                          </span>
                        </div>
                        <div className="flex items-end gap-[3px] h-14" aria-hidden>
                          {(sparkValues.length > 0 ? sparkValues : Array.from({ length: 14 }, () => 0)).slice(-21).map((v, i, arr) => (
                            <div
                              key={i}
                              className="flex-1 rounded-t-sm bg-indigo-400/80 origin-bottom transition-[height] duration-500"
                              style={{
                                height: `${Math.max(8, (v / sparkMax) * 100)}%`,
                                opacity: 0.35 + (i / Math.max(1, arr.length - 1)) * 0.65,
                              }}
                            />
                          ))}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2.5">
                        <div className="rounded-2xl border border-slate-100 bg-white p-3.5">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Uniques</p>
                          <p className="mt-1 text-xl font-bold tabular-nums text-slate-900">
                            {analyticsSummary?.totals?.uniquesApprox ?? (analyticsLoading ? '—' : 0)}
                          </p>
                          <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
                            <MousePointerClick className="w-3 h-3" /> Approx.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setLocation('/dashboard/inbox')}
                          className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-3.5 text-left hover:border-indigo-200 hover:bg-indigo-50 transition-colors group"
                        >
                          <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-400">Leads</p>
                          <p className="mt-1 text-xl font-bold tabular-nums text-slate-900">
                            {Math.max(
                              leadsList.length,
                              Number(analyticsSummary?.totals?.leads) || 0,
                            )}
                          </p>
                          <p className="text-[11px] font-semibold text-indigo-600 mt-1 flex items-center gap-1 group-hover:gap-1.5 transition-all">
                            <Inbox className="w-3 h-3" /> Open inbox
                          </p>
                        </button>
                        <button
                          type="button"
                          onClick={openReadiness}
                          className="col-span-2 rounded-2xl border border-slate-100 bg-slate-50/80 px-3.5 py-3 flex items-center justify-between gap-3 text-left hover:border-indigo-200 hover:bg-indigo-50/40 transition-colors"
                        >
                          <div className="min-w-0">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Portfolio readiness</p>
                            <p className="text-sm font-bold text-slate-800 tabular-nums">{completionScore}% complete</p>
                            <p className="text-[11px] text-indigo-600 font-semibold mt-0.5">
                              {completionScore >= 100 ? 'All set' : `View ${missingReadiness.length} missing`}
                            </p>
                          </div>
                          <div className="h-1.5 w-20 rounded-full bg-slate-200 overflow-hidden shrink-0">
                            <div className="h-full rounded-full bg-indigo-500" style={{ width: `${completionScore}%` }} />
                          </div>
                        </button>
                      </div>
                    </div>

                    {Array.isArray(analyticsSummary?.totals?.topReferrers) && analyticsSummary.totals.topReferrers.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] font-semibold text-slate-400 mr-1">Top sources</span>
                        {analyticsSummary.totals.topReferrers.slice(0, 3).map((r: any) => (
                          <span key={r.host} className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600">
                            {r.host}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="relative overflow-hidden rounded-2xl border border-dashed border-indigo-200/90 bg-gradient-to-br from-indigo-50/80 via-white to-emerald-50/40 p-4 sm:p-5">
                    <div className="pointer-events-none absolute right-3 top-3 opacity-[0.12]">
                      <BarChart3 className="w-24 h-24 text-indigo-700" />
                    </div>
                    <div className="relative grid sm:grid-cols-[1fr_auto] gap-4 items-center">
                      <div>
                        <div className="inline-flex items-center gap-1.5 rounded-full bg-white/80 border border-indigo-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-indigo-600 mb-2">
                          <Lock className="w-3 h-3" /> Essential · Growth
                        </div>
                        <p className="text-sm sm:text-base font-bold text-slate-900">Know who visits your portfolio</p>
                        <p className="text-xs sm:text-[13px] text-slate-500 mt-1.5 max-w-md leading-relaxed">
                          Unlock visits, approximate uniques, top referrers, and a contact leads inbox — built for recruiters and campus outreach.
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {['Visits sparkline', 'Leads inbox', 'Referrer top 3'].map((label) => (
                            <span key={label} className="rounded-full bg-white/90 border border-slate-200 px-2.5 py-1 text-[10px] font-semibold text-slate-500">
                              {label}
                            </span>
                          ))}
                        </div>
                      </div>
                      <Button size="sm" className="h-10 text-xs shrink-0 w-full sm:w-auto" onClick={openBilling}>
                        Upgrade to Essential
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </Card>

            <div className="dash-carousel md:grid md:grid-cols-3 md:gap-6">
              {/* Profile Completion / Status Card */}
              {completionScore >= 90 ? (
                data.isPremium ? (
                  <Card className="p-4 sm:p-6 bg-white border border-slate-200 shadow-sm flex flex-col justify-between hover:border-emerald-200 hover:shadow-md transition-all duration-300 min-w-0">
                    <div>
                      <div className="flex justify-between items-center mb-4 gap-2">
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Portfolio Status</p>
                        <span className="text-[10px] sm:text-xs font-bold text-emerald-600 bg-emerald-50 px-2 sm:px-2.5 py-0.5 rounded-full flex items-center gap-1 select-none shrink-0 whitespace-nowrap">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> LIVE & ACTIVE
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
                          <Sparkles className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-slate-900">Portfolio ready</h4>
                          <p className="text-xs text-slate-500">All core details are configured.</p>
                        </div>
                      </div>
                      <p className="text-xs text-slate-400 leading-normal">
                        Your portfolio structure is complete. Pro plans can enable search indexing for public discovery.
                      </p>
                    </div>
                  </Card>
                ) : (
                  <Card className="p-4 sm:p-6 bg-white border border-slate-200 shadow-sm flex flex-col justify-between hover:border-indigo-100 hover:shadow-md transition-all duration-300 min-w-0">
                    <div>
                      <div className="flex justify-between items-center mb-4 gap-2">
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Portfolio Status</p>
                        <span className="text-[10px] sm:text-xs font-bold text-slate-500 bg-slate-100 px-2 sm:px-2.5 py-0.5 rounded-full flex items-center gap-1 select-none shrink-0 whitespace-nowrap">
                          Basic Portfolio
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500">
                          <AlertCircle className="w-5 h-5 text-slate-600" />
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-slate-900">Indexing locked (Free)</h4>
                          <p className="text-xs text-slate-500">Upgrade to enable search indexing.</p>
                        </div>
                      </div>
                      <p className="text-xs text-slate-400 leading-normal">
                        Your details are complete. Upgrade to Pro to enable search engine indexing and go live on discovery.
                      </p>
                    </div>
                  </Card>
                )
              ) : (
                <Card 
                  onClick={() => setShowCompletionModal(true)}
                  className="p-4 sm:p-6 bg-white border border-slate-200 shadow-sm flex flex-col justify-between cursor-pointer hover:border-indigo-300 hover:shadow-md transition-all duration-300 group min-w-0"
                >
                  <div>
                    <div className="flex justify-between items-center mb-4">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider group-hover:text-indigo-600 transition-colors">Completeness</p>
                      <span className="text-sm font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">{completionScore}%</span>
                    </div>
                    <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden mb-3">
                      <div 
                        className="h-full bg-gradient-to-r from-indigo-500 to-indigo-700 rounded-full transition-all duration-700" 
                        style={{ width: `${completionScore}%` }} 
                      />
                    </div>
                    <p className="text-xs text-slate-500 flex items-center gap-1 font-semibold group-hover:text-indigo-600 transition-colors">
                      Click to complete missing details
                    </p>
                  </div>
                </Card>
              )}

              {/* Accent & Style Card */}
              <Card className="p-4 sm:p-6 bg-white border border-slate-200 shadow-sm flex flex-col justify-between min-w-0">
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Appearance & Theme</p>
                  <div className="flex items-center gap-3 mb-4">
                    <div className={cn("w-6 h-6 rounded-full border border-slate-200", getThemeClass())} />
                    <div>
                      <h4 className="font-semibold text-slate-900 capitalize text-sm">{activeTemplateMeta?.name || 'Pro'} Layout</h4>
                      <p className="text-xs text-slate-500 capitalize">Theme accent: {data.themeColor || 'Navy'}</p>
                    </div>
                  </div>
                </div>
                <button 
                  onClick={() => {
                    goView('settings', { settingsTab: 'design' });
                  }} 
                  className="text-xs font-bold text-indigo-600 hover:text-indigo-800 text-left transition-colors"
                >
                  {data.isPremium ? "Customize look" : "Customize look (Free)"}
                </button>
              </Card>

              {/* Monthly Usage Card */}
              <Card className="p-4 sm:p-6 bg-white border border-slate-200 shadow-sm flex flex-col justify-between transition-all duration-300 min-w-0">
                <div>
                  <div className="flex justify-between items-center mb-3 gap-2">
                    <p className="text-slate-400 text-xs font-bold uppercase tracking-wider">Monthly usage</p>
                    <span className="text-[10px] sm:text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full capitalize shrink-0 whitespace-nowrap">{planName}</span>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <div className="flex items-center justify-between text-xs font-semibold text-slate-600 mb-1">
                        <span>Content updates</span>
                        <span className="tabular-nums text-slate-900">
                          {typeof data.limits?.updatesRemaining === 'number' ? `${data.limits.updatesRemaining} left` : '—'}
                        </span>
                      </div>
                      <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-indigo-500 transition-all duration-700"
                          style={{ width: typeof data.limits?.updatesUsed === 'number' && data.limits.updatesPerMonth > 0 ? `${Math.min(100, (data.limits.updatesUsed / data.limits.updatesPerMonth) * 100)}%` : '0%' }}
                        />
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between text-xs font-semibold text-slate-600 mb-1">
                        <span>AI resume parses</span>
                        <span className="tabular-nums text-slate-900">
                          {typeof data.limits?.parsesRemaining === 'number' ? `${data.limits.parsesRemaining} left` : '—'}
                        </span>
                      </div>
                      <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-purple-500 transition-all duration-700"
                          style={{ width: typeof data.limits?.parsesUsed === 'number' && data.limits.parsesPerMonth > 0 ? `${Math.min(100, (data.limits.parsesUsed / data.limits.parsesPerMonth) * 100)}%` : '0%' }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
                {data.isPremium ? (
                  <p className="text-[11px] text-slate-400 mt-3.5">
                    Resets in {data.limits?.updatesDaysToReset ?? 30} day{(data.limits?.updatesDaysToReset ?? 30) === 1 ? '' : 's'}
                  </p>
                ) : (
                  <button onClick={openBilling} className="flex items-center text-xs font-semibold text-indigo-700 bg-indigo-50 w-fit px-3 py-1 rounded-full mt-3.5 hover:bg-indigo-100 transition-colors">
                    <CreditCard className="w-3.5 h-3.5 mr-1.5" /> Get more with Pro
                  </button>
                )}
              </Card>
            </div>

            {/* Hiring Availability Card */}
            {!(data.openToHire || localStorage.getItem('bexo_hiring_availability_ever_enabled') === 'true') && (
              <Card className="p-4 sm:p-6 bg-white border border-slate-200 shadow-sm animate-in slide-in-from-bottom duration-300 min-w-0">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg shrink-0">
                        <Sparkles className="w-4 h-4" />
                      </span>
                      <h3 className="font-bold text-slate-900 text-sm">Hiring Availability</h3>
                    </div>
                    <p className="text-xs text-slate-500 max-w-xl leading-relaxed">
                      Enable this option to display an "Available for Hire" badge on your public portfolio and receive professional inquiry leads.
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 w-full sm:w-auto justify-between sm:justify-end">
                    <span className={cn(
                      "text-[11px] sm:text-xs font-bold px-2.5 py-0.5 rounded-full select-none transition-colors whitespace-nowrap",
                      data.openToHire 
                        ? "text-emerald-700 bg-emerald-50" 
                        : "text-slate-500 bg-slate-100"
                    )}>
                      {data.openToHire ? 'Actively looking' : 'Not looking'}
                    </span>
                    {/* Custom Toggle Switch */}
                    <button
                      onClick={() => {
                        const newStatus = !data.openToHire;
                        updateData({ openToHire: newStatus });
                        if (newStatus) {
                          localStorage.setItem('bexo_hiring_availability_ever_enabled', 'true');
                        }
                        toast({
                          title: newStatus ? "Open for Opportunities" : "Status Changed",
                          description: newStatus 
                            ? "Recruiters can now reach out with job leads." 
                            : "Hiring inquiries will be deactivated."
                        });
                      }}
                      className={cn(
                        "w-11 h-6 rounded-full transition-colors relative focus:outline-none focus:ring-2 focus:ring-indigo-500 shrink-0",
                        data.openToHire ? "bg-indigo-600" : "bg-slate-200"
                      )}
                    >
                      <span 
                        className={cn(
                          "absolute left-0.5 top-0.5 bg-white w-5 h-5 rounded-full shadow-sm transition-transform duration-200",
                          data.openToHire ? "translate-x-5" : "translate-x-0"
                        )}
                      />
                    </button>
                  </div>
                </div>
              </Card>
            )}

            {/* Actions Grid — compact tappable rows on mobile, cards on desktop */}
            <div>
              <div className="flex items-end justify-between gap-3 mb-3 sm:mb-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400 mb-1">Shortcuts</p>
                  <h2 className="text-base sm:text-lg font-bold text-slate-900">Quick portfolio actions</h2>
                </div>
              </div>
              <div className="flex flex-col gap-2.5 md:grid md:grid-cols-3 md:gap-6">
                <Card 
                  onClick={() => goView('edit-profile')} 
                  className="tap-scale p-3.5 md:p-6 hover:shadow-md transition-shadow group cursor-pointer border-slate-200 bg-white flex flex-row items-center gap-3.5 md:flex-col md:items-stretch md:justify-between min-w-0"
                >
                  <div className="w-11 h-11 md:w-10 md:h-10 rounded-xl bg-blue-50 text-indigo-600 flex items-center justify-center shrink-0 md:mb-4 group-hover:scale-105 transition-transform">
                    <User className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-bold text-slate-900 text-sm md:text-base md:mb-1">Edit Profile Details</h3>
                    <p className="text-[11px] md:text-xs text-slate-500 leading-relaxed truncate md:whitespace-normal md:mb-4">Add projects, skills, certificates, and work experience manually.</p>
                    <div className="hidden md:flex items-center text-xs font-bold text-indigo-600 group-hover:translate-x-1 transition-transform">
                      Open Editor <ArrowRight className="w-3.5 h-3.5 ml-1" />
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-300 shrink-0 md:hidden" />
                </Card>

                <Card 
                  onClick={() => {
                    goView('updates', { updatesTab: 'post' });
                  }} 
                  className="tap-scale p-3.5 md:p-6 hover:shadow-md transition-shadow group cursor-pointer border-slate-200 bg-white flex flex-row items-center gap-3.5 md:flex-col md:items-stretch md:justify-between min-w-0"
                >
                  <div className="w-11 h-11 md:w-10 md:h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 md:mb-4 group-hover:scale-105 transition-transform">
                    <Plus className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-bold text-slate-900 text-sm md:text-base md:mb-1">Post Achievement</h3>
                    <p className="text-[11px] md:text-xs text-slate-500 leading-relaxed truncate md:whitespace-normal md:mb-4">Add education, experience, projects, skills, and highlights to your portfolio.</p>
                    <div className="hidden md:flex items-center text-xs font-bold text-emerald-600 group-hover:translate-x-1 transition-transform">
                      Post update <ArrowRight className="w-3.5 h-3.5 ml-1" />
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-300 shrink-0 md:hidden" />
                </Card>

                <Card 
                  onClick={() => goView('settings')} 
                  className="tap-scale p-3.5 md:p-6 hover:shadow-md transition-shadow group cursor-pointer border-slate-200 bg-white flex flex-row items-center gap-3.5 md:flex-col md:items-stretch md:justify-between min-w-0"
                >
                  <div className="w-11 h-11 md:w-10 md:h-10 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center shrink-0 md:mb-4 group-hover:scale-105 transition-transform">
                    <Settings className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-bold text-slate-900 text-sm md:text-base md:mb-1">Appearance & Settings</h3>
                    <p className="text-[11px] md:text-xs text-slate-500 leading-relaxed truncate md:whitespace-normal md:mb-4">Change color theme accent, website template layouts, and usernames.</p>
                    <div className="hidden md:flex items-center text-xs font-bold text-slate-600 group-hover:translate-x-1 transition-transform">
                      Customize <ArrowRight className="w-3.5 h-3.5 ml-1" />
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-300 shrink-0 md:hidden" />
                </Card>
              </div>
            </div>
          </div>
        )}

        {/* View 2: Edit Profile */}
        {currentView === 'edit-profile' && (
          <div className="space-y-6 animate-in slide-in-from-bottom duration-300">
            <button 
              onClick={() => goView('overview')}
              className="inline-flex items-center gap-1 text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" /> Back to Dashboard
            </button>

            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 border-b border-slate-200 pb-4">
              <div>
                <h1 className="text-2xl sm:text-3xl font-serif font-bold text-slate-900">Edit Profile</h1>
                <p className="text-slate-500 text-sm">Add, remove, and modify the details in your public portfolio.</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={cn(
                  "text-[11px] font-semibold px-2.5 py-1 rounded-full border",
                  saveStatus === 'saving' && "bg-amber-50 text-amber-700 border-amber-100",
                  saveStatus === 'saved' && "bg-emerald-50 text-emerald-700 border-emerald-100",
                  saveStatus === 'error' && "bg-red-50 text-red-700 border-red-100",
                  saveStatus === 'idle' && "bg-slate-50 text-slate-500 border-slate-100",
                )}>
                  {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? 'Saved' : saveStatus === 'error' ? 'Save failed' : 'Ready'}
                </span>
                {handleString && (
                  <a
                    href={livePortfolioHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> View live site
                  </a>
                )}
              </div>
            </div>

            <div className="flex flex-col lg:flex-row gap-6">
              {/* Sidebar */}
              <div className="w-full lg:w-48 shrink-0 lg:sticky lg:top-24 flex flex-col gap-4 self-start">
                <div className="flex gap-1.5 lg:flex-col overflow-x-auto pb-2 lg:pb-0 hide-scrollbar">
                  {TABS.map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => { setActiveEditorTab(tab.id); setEditingId(null); }}
                      className={cn(
                        "flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all border",
                        activeEditorTab === tab.id 
                          ? "bg-slate-900 text-white border-slate-900 shadow-md" 
                          : "bg-white text-slate-600 hover:bg-slate-50 border-slate-200"
                      )}
                    >
                      <span>{tab.label}</span>
                    </button>
                  ))}
                </div>

                {/* Cloud Storage (always visible) */}
                <Card className="p-4 bg-white border border-slate-200 shadow-sm hidden lg:block">
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Cloud Storage</span>
                    <span className="text-[10px] font-bold text-slate-700">
                      {(usedStorage / 1024 / 1024).toFixed(1)} / {(storageLimit / 1024 / 1024).toFixed(0)} MB
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div 
                      className={cn("h-full rounded-full transition-all duration-500", isStorageFull ? "bg-red-500" : "bg-indigo-500")}
                      style={{ width: `${storagePercentage}%` }}
                    />
                  </div>
                  <button
                    onClick={openBilling}
                    className="text-[10px] font-bold text-indigo-500 hover:text-indigo-700 mt-2.5 text-left flex items-center gap-1 hover:underline cursor-pointer"
                  >
                    <CreditCard className="w-3 h-3" /> Review billing
                  </button>
                </Card>
              </div>

              {/* Editor panel */}
              <div className="flex-1 max-w-3xl bg-white p-5 md:p-6 rounded-2xl border border-slate-200 shadow-sm min-h-[450px] min-w-0 transition-colors duration-300">
                {activeEditorTab === 'contact' ? (
                  <div className="space-y-6 max-w-xl">
                    <h3 className="text-lg font-bold text-slate-900 border-b pb-2">Contact Details</h3>
                    <div className="space-y-4">
                      {/* Email Field */}
                      <div className="space-y-1.5">
                        <Label className={contactErrors.email ? "text-red-500 font-semibold" : ""}>Email address (Required)</Label>
                        <Input 
                          value={contactData?.email || ''} 
                          onChange={e => { 
                            setContactData({...contactData, email: e.target.value}); 
                            if (contactErrors.email) setContactErrors({...contactErrors, email: ''}); 
                          }} 
                          placeholder="e.g. name@example.com"
                          className={contactErrors.email ? "border-red-500 focus-visible:ring-red-500" : ""}
                        />
                        {contactErrors.email && (
                          <p className="text-xs font-medium text-red-500 flex items-center gap-1 mt-1">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                            {contactErrors.email}
                          </p>
                        )}
                      </div>

                      {/* Phone Field */}
                      <div className="space-y-1.5">
                        <Label className={contactErrors.phone ? "text-red-500 font-semibold" : ""}>Phone Number (Required)</Label>
                        <div className="flex relative">
                          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-medium text-sm">+91</span>
                          <Input 
                            value={(contactData?.phone || data?.phone || '').replace(/^\+?91/, '').trim()} 
                            onChange={e => {
                              const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                              const formatted = val ? `+91${val}` : '';
                              setContactData({...contactData, phone: formatted});
                              if (contactErrors.phone && val.length === 10) {
                                setContactErrors({...contactErrors, phone: ''});
                              }
                            }} 
                            placeholder="98765 43210" 
                            className={cn("pl-12 text-sm font-medium tracking-wide h-10 rounded-xl", contactErrors.phone ? "border-red-500 focus-visible:ring-red-500" : "")}
                          />
                        </div>
                        {contactErrors.phone && (
                          <p className="text-xs font-medium text-red-500 flex items-center gap-1 mt-1">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                            {contactErrors.phone}
                          </p>
                        )}
                      </div>

                      {/* LinkedIn URL */}
                      <div className="space-y-1.5">
                        <Label>LinkedIn URL</Label>
                        <Input 
                          value={contactData?.linkedin || ''} 
                          onChange={e => setContactData({...contactData, linkedin: e.target.value})} 
                          placeholder="linkedin.com/in/username" 
                        />
                      </div>

                      {/* GitHub URL */}
                      <div className="space-y-1.5">
                        <Label>GitHub URL</Label>
                        <Input 
                          value={contactData?.github || ''} 
                          onChange={e => setContactData({...contactData, github: e.target.value})} 
                          placeholder="github.com/username" 
                        />
                      </div>

                      {/* Extracted & Custom Links Section */}
                      <div className="pt-4 border-t border-slate-100 space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <Label className="text-slate-800 font-bold text-sm block">Extracted & Custom Links</Label>
                            <p className="text-xs text-slate-400">Manage links extracted from your resume or add custom links.</p>
                          </div>
                          {!isAddingDashboardLink && (
                            <Button 
                              type="button" 
                              variant="outline" 
                              size="sm"
                              onClick={() => setIsAddingDashboardLink(true)}
                              className="text-indigo-600 border-indigo-200 hover:bg-indigo-50 text-xs font-semibold"
                            >
                              <Plus className="w-3.5 h-3.5 mr-1" /> Add Link
                            </Button>
                          )}
                        </div>

                        {/* Add Custom Link Form */}
                        {isAddingDashboardLink && (
                          <Card className="p-3.5 border-indigo-200 bg-indigo-50/40 space-y-3 animate-in fade-in">
                            <p className="text-xs font-semibold text-indigo-900">Add Custom Link</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <Input 
                                placeholder="Link Title (e.g. Personal Portfolio)" 
                                value={newDashboardLinkName} 
                                onChange={e => setNewDashboardLinkName(e.target.value)} 
                                className="h-9 text-xs"
                              />
                              <Input 
                                placeholder="URL (e.g. kavin.cyou or https://...)" 
                                value={newDashboardLinkUrl} 
                                onChange={e => setNewDashboardLinkUrl(e.target.value)} 
                                className="h-9 text-xs"
                              />
                            </div>
                            <div className="flex justify-end gap-2 pt-1">
                              <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setIsAddingDashboardLink(false); setNewDashboardLinkName(''); setNewDashboardLinkUrl(''); }}>
                                Cancel
                              </Button>
                              <Button type="button" size="sm" className="h-8 text-xs bg-indigo-600 hover:bg-indigo-700 text-white" onClick={handleSaveDashboardLink}>
                                Save Link
                              </Button>
                            </div>
                          </Card>
                        )}

                        {/* Links Display List */}
                        {(!contactData?.customLinks || contactData.customLinks.length === 0) ? (
                          <div className="p-4 border border-dashed border-slate-200 rounded-xl text-center text-xs text-slate-400">
                            No extracted or custom links added yet. Click "+ Add Link" to add your links.
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {contactData.customLinks.map((link: any, idx: number) => (
                              <div 
                                key={idx}
                                className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-white hover:border-indigo-200 transition-all group shadow-sm"
                              >
                                <a 
                                  href={link.url.startsWith('http') ? link.url : `https://${link.url}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-2.5 min-w-0 flex-1 mr-2"
                                >
                                  <div className="w-8 h-8 rounded-lg bg-white border border-slate-150 flex items-center justify-center shrink-0 shadow-sm group-hover:border-indigo-200">
                                    <LinkIcon className="w-4 h-4 text-slate-400 group-hover:text-indigo-500" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="text-xs font-semibold text-slate-700 truncate group-hover:text-indigo-600">
                                      {link.name || 'Link'}
                                    </p>
                                    <p className="text-[10px] text-slate-400 truncate">{link.url}</p>
                                  </div>
                                </a>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveDashboardLink(idx)}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0 cursor-pointer"
                                  title="Remove link"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Hiring Availability Toggle */}
                      <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label className="font-bold text-slate-800 text-sm">Hiring Availability</Label>
                          <p className="text-[11px] text-slate-500 max-w-sm">
                            Show an "Available for Hire" badge on your public portfolio so recruiters can contact you.
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            "text-[10px] font-bold px-2 py-0.5 rounded-full select-none",
                            data.openToHire 
                              ? "text-emerald-700 bg-emerald-50" 
                              : "text-slate-500 bg-slate-100"
                          )}>
                            {data.openToHire ? 'Active' : 'Off'}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              const newStatus = !data.openToHire;
                              updateData({ openToHire: newStatus });
                              toast({
                                title: newStatus ? "Open for Opportunities" : "Status Changed",
                                description: newStatus 
                                  ? "Recruiters can now reach out with job leads." 
                                  : "Hiring inquiries will be deactivated."
                              });
                            }}
                            className={cn(
                              "w-11 h-6 rounded-full transition-colors relative focus:outline-none focus:ring-2 focus:ring-indigo-500 shrink-0",
                              data.openToHire ? "bg-indigo-600" : "bg-slate-200"
                            )}
                          >
                            <span 
                              className={cn(
                                "absolute left-0.5 top-0.5 bg-white w-5 h-5 rounded-full shadow-sm transition-transform duration-200",
                                data.openToHire ? "translate-x-5" : "translate-x-0"
                              )}
                            />
                          </button>
                        </div>
                      </div>
                    </div>
                    <Button onClick={handleSaveContact} className="h-10 text-xs px-4">
                      Save Contact
                    </Button>
                  </div>
                ) : activeEditorTab === 'skills' ? (
                  <div className="space-y-6 animate-in fade-in">
                    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 border-b pb-3">
                      <div>
                        <h3 className="text-lg font-bold text-slate-900">Skills</h3>
                        <p className="text-sm text-slate-500 mt-1">
                          Add or remove skills here. Each new skill uses 1 monthly update credit. Max {MAX_SKILLS_UI}.
                        </p>
                      </div>
                      <p className="text-xs font-semibold text-slate-400">{(sections.skills || []).length}/{MAX_SKILLS_UI}</p>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Add a skill</p>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <Input
                          id="skill-add-name"
                          placeholder="e.g. React, Figma, Communication"
                          className="h-10"
                          onKeyDown={async (e) => {
                            if (e.key !== 'Enter') return;
                            e.preventDefault();
                            const input = e.currentTarget;
                            const name = input.value.trim();
                            if (!name) return;
                            if ((sections.skills || []).length >= MAX_SKILLS_UI) {
                              toast({ title: 'Limit reached', description: `Max ${MAX_SKILLS_UI} skills.`, variant: 'destructive' });
                              return;
                            }
                            const catEl = document.getElementById('skill-add-category') as HTMLSelectElement | null;
                            const category = (catEl?.value || 'technical') as 'technical' | 'tools' | 'soft' | 'languages';
                            const next = {
                              ...sections,
                              skills: [
                                ...(sections.skills || []),
                                { id: `skill-${Date.now()}`, name, category },
                              ],
                            };
                            setSections(next);
                            const ok = await updateContextSections(next);
                            if (ok) {
                              input.value = '';
                              toast({ title: 'Skill added', description: 'Uses 1 update credit.' });
                            } else {
                              setSections({ ...sections, skills: data.skillEntries || [] });
                            }
                          }}
                        />
                        <select
                          id="skill-add-category"
                          className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm"
                          defaultValue="technical"
                        >
                          {SKILL_CATEGORIES.map((c) => (
                            <option key={c.id} value={c.id}>{c.label}</option>
                          ))}
                        </select>
                        <Button
                          type="button"
                          size="sm"
                          className="h-10 shrink-0"
                          onClick={async () => {
                            const input = document.getElementById('skill-add-name') as HTMLInputElement | null;
                            const name = input?.value.trim() || '';
                            if (!name) {
                              toast({ title: 'Enter a skill name', variant: 'destructive' });
                              return;
                            }
                            if ((sections.skills || []).length >= MAX_SKILLS_UI) {
                              toast({ title: 'Limit reached', description: `Max ${MAX_SKILLS_UI} skills.`, variant: 'destructive' });
                              return;
                            }
                            const catEl = document.getElementById('skill-add-category') as HTMLSelectElement | null;
                            const category = (catEl?.value || 'technical') as 'technical' | 'tools' | 'soft' | 'languages';
                            const next = {
                              ...sections,
                              skills: [
                                ...(sections.skills || []),
                                { id: `skill-${Date.now()}`, name, category },
                              ],
                            };
                            setSections(next);
                            const ok = await updateContextSections(next);
                            if (ok) {
                              if (input) input.value = '';
                              toast({ title: 'Skill added', description: 'Uses 1 update credit.' });
                            } else {
                              setSections({ ...sections, skills: data.skillEntries || [] });
                            }
                          }}
                        >
                          <Plus className="w-4 h-4 mr-1" /> Add skill
                        </Button>
                      </div>
                      <p className="text-[10px] text-slate-400">
                        Credits left this month: {data.limits?.updatesRemaining ?? '—'}
                      </p>
                    </div>

                    {SKILL_CATEGORIES.map((cat) => {
                      const group = (sections.skills || []).filter((s: any) => (s.category || 'technical') === cat.id);
                      if (!group.length) return null;
                      return (
                        <div key={cat.id} className="space-y-2">
                          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{cat.label}</p>
                          <div className="flex flex-wrap gap-2">
                            {group.map((skill: any) => (
                              <span
                                key={skill.id}
                                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-medium text-slate-800"
                              >
                                {skill.name}
                                <button
                                  type="button"
                                  className="text-slate-400 hover:text-red-500 min-h-[28px] min-w-[28px] inline-flex items-center justify-center touch-manipulation"
                                  onClick={async () => {
                                    const next = {
                                      ...sections,
                                      skills: (sections.skills || []).filter((s: any) => s.id !== skill.id),
                                    };
                                    setSections(next);
                                    await updateContextSections(next);
                                  }}
                                  aria-label={`Remove ${skill.name}`}
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    })}

                    {(sections.skills || []).length === 0 && (
                      <p className="text-sm text-slate-400 italic">
                        No skills yet — add your first skill above.
                      </p>
                    )}
                  </div>
                ) : activeEditorTab === 'about' ? (
                  <div className="space-y-6 animate-in fade-in">
                    <div className="flex justify-between items-center border-b pb-3 mb-4">
                      <h3 className="text-lg font-bold text-slate-900">About Details</h3>
                      {editingId !== 'about-form' && (
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="h-9 px-3 text-xs flex gap-1 border-slate-200 text-slate-700 hover:bg-slate-50"
                          onClick={() => {
                            setEditingId('about-form');
                            setEditForm({
                              name: data.name || '',
                              title: sections.about[0]?.title || '',
                              description: sections.about[0]?.description || '',
                              currentStatus: sections.about[0]?.currentStatus || '',
                              nationality: data.nationality || 'India',
                              pronouns: data.pronouns || 'She/Her'
                            });
                          }}
                        >
                          <Pencil className="w-3.5 h-3.5 mr-1" /> Edit About Info
                        </Button>
                      )}
                    </div>

                    {editingId === 'about-form' ? (
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <Label>Full Name</Label>
                            <Input 
                              value={editForm.name || ''} 
                              onChange={e => setEditForm({...editForm, name: e.target.value})} 

                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label>Title / Role</Label>
                            <Input 
                              value={editForm.title || ''} 
                              onChange={e => setEditForm({...editForm, title: e.target.value})} 
                              placeholder="e.g. Frontend Developer Intern" 

                            />
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <Label>Summary / Bio</Label>
                          <textarea 
                            value={editForm.description || ''} 
                            onChange={e => setEditForm({...editForm, description: e.target.value})} 
                            className="flex min-h-[120px] w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 resize-none" 
                            placeholder="Write a professional summary..."
                          />
                        </div>

                        <div className="space-y-1.5">
                          <Label>Current Education or Work</Label>
                          <Input 
                            value={editForm.currentStatus || ''} 
                            onChange={e => setEditForm({...editForm, currentStatus: e.target.value})} 
                            placeholder="e.g. Studying BS Statistics at PSG College" 

                          />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <Label>Nationality</Label>
                            <Input 
                              value={editForm.nationality || ''} 
                              onChange={e => setEditForm({...editForm, nationality: e.target.value})} 

                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label>Pronouns</Label>
                            <select
                              value={['She/Her', 'He/Him', 'They/Them', 'Prefer not to say'].includes(editForm.pronouns || '') ? (editForm.pronouns || '') : (editForm.pronouns ? 'Custom' : '')}
                              onChange={e => {
                                const val = e.target.value;
                                if (val === 'Custom') {
                                  setEditForm({...editForm, pronouns: ''});
                                } else {
                                  setEditForm({...editForm, pronouns: val});
                                }
                              }}
                              className="flex h-10 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                            >
                              <option value="" disabled>Select Pronouns</option>
                              <option value="She/Her">She/Her</option>
                              <option value="He/Him">He/Him</option>
                              <option value="They/Them">They/Them</option>
                              <option value="Prefer not to say">Prefer not to say</option>
                              <option value="Custom">Custom (Type manually)</option>
                            </select>
                            {(!['She/Her', 'He/Him', 'They/Them', 'Prefer not to say'].includes(editForm.pronouns || '') || editForm.pronouns === '') && (
                              <Input
                                placeholder="Enter custom pronouns"
                                value={editForm.pronouns || ''}
                                onChange={e => setEditForm({...editForm, pronouns: e.target.value})}
                                className="mt-2"
                              />
                            )}
                          </div>
                        </div>

                        <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 mt-4">
                          <Button variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
                          <Button onClick={() => {
                            updateData({
                              name: editForm.name,
                              firstName: editForm.name ? editForm.name.split(' ')[0] : '',
                              lastName: editForm.name ? editForm.name.split(' ').slice(1).join(' ') : '',
                              nationality: editForm.nationality,
                              pronouns: editForm.pronouns,
                              aboutEntries: [{ id: '1', title: editForm.title, description: editForm.description, currentStatus: editForm.currentStatus }]
                            });
                            setSections(prev => ({
                              ...prev,
                              about: [{ id: '1', title: editForm.title, description: editForm.description, currentStatus: editForm.currentStatus }]
                            }));
                            setEditingId(null);
                            toast({
                              title: "Profile Updated",
                              description: "Your about details have been saved."
                            });
                          }}>Save Changes</Button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        <div className="bg-slate-50 border border-slate-150 rounded-2xl p-5 relative overflow-hidden">
                          <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-50 rounded-full blur-xl translate-x-4 -translate-y-4 opacity-50"></div>
                          <div className="relative z-10 space-y-4">
                            <div>
                              <span className="text-[10px] uppercase tracking-wider text-indigo-550 font-bold bg-indigo-50 px-2.5 py-1 rounded-full">Name</span>
                              <h4 className="text-xl font-bold mt-2">{data.name || <span className="text-slate-400 italic">No name provided</span>}</h4>
                            </div>
                            
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                              <div>
                                <span className="text-[10px] uppercase tracking-wider text-indigo-550 font-bold bg-indigo-50 px-2.5 py-1 rounded-full">Title / Role</span>
                                <p className="text-sm font-semibold text-slate-800 mt-2">{sections.about[0]?.title || <span className="text-slate-400 italic">No title provided</span>}</p>
                              </div>
                              <div>
                                <span className="text-[10px] uppercase tracking-wider text-indigo-550 font-bold bg-indigo-50 px-2.5 py-1 rounded-full">Current Education / Work</span>
                                <p className="text-sm font-semibold text-slate-800 mt-2">{sections.about[0]?.currentStatus || <span className="text-slate-400 italic">No current education or work details</span>}</p>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                              <div>
                                <span className="text-[10px] uppercase tracking-wider text-indigo-550 font-bold bg-indigo-50 px-2.5 py-1 rounded-full">Nationality</span>
                                <p className="text-sm font-semibold text-slate-800 mt-2">{data.nationality || 'India'}</p>
                              </div>
                              <div>
                                <span className="text-[10px] uppercase tracking-wider text-indigo-550 font-bold bg-indigo-50 px-2.5 py-1 rounded-full">Pronouns</span>
                                <p className="text-sm font-semibold text-slate-800 mt-2">{data.pronouns || 'She/Her'}</p>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <span className="text-[10px] uppercase tracking-wider text-indigo-550 font-bold bg-indigo-50 px-2.5 py-1 rounded-full">Summary of Fetched Data</span>
                          <div className="p-4 bg-white border border-slate-200 rounded-xl mt-2">
                            <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">
                              {sections.about[0]?.description || <span className="text-slate-400 italic">No summary provided. Upload your resume or click Edit to add one.</span>}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center border-b pb-2 gap-3">
                      <h3 className="text-lg font-bold text-slate-900 capitalize">{activeEditorTab} List</h3>
                      {editingId === null && (
                        <Button
                          type="button"
                          size="sm"
                          className="h-9 text-xs px-3 shrink-0"
                          onClick={handleAdd}
                        >
                          <Plus className="w-3.5 h-3.5 mr-1" />
                          Add {activeEditorTab === 'education' ? 'Education' : activeEditorTab === 'experience' ? 'Experience' : activeEditorTab === 'projects' ? 'Project' : 'Entry'}
                        </Button>
                      )}
                    </div>

                    <div className="space-y-3">
                      {(sections[activeEditorTab as keyof typeof sections] || []).length === 0 && editingId === null && (
                        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 p-6 text-center space-y-3">
                          <p className="text-sm text-slate-500">
                            No {activeEditorTab} yet. Add your first entry to show on your live portfolio.
                          </p>
                          <Button type="button" size="sm" className="h-9 text-xs" onClick={handleAdd}>
                            <Plus className="w-3.5 h-3.5 mr-1" /> Add first entry
                          </Button>
                          <p className="text-[10px] text-slate-400">
                            New entries use 1 monthly update credit each. Edits and deletes are free.
                          </p>
                        </div>
                      )}
                      {(sections[activeEditorTab as keyof typeof sections] || []).map((entry: any, idx: number) => (
                        <div 
                          key={entry.id}
                          draggable={editingId === null}
                          onDragStart={(e) => handleDragStart(e, idx)}
                          onDragOver={(e) => handleDragOver(e)}
                          onDrop={(e) => handleDrop(e, idx)}
                          className="transition-all duration-200"
                        >
                          {editingId === entry.id ? (
                            <Card className="p-4 border-indigo-200 ring-2 ring-indigo-50">
                              <div className="space-y-4">
                                {renderFields()}
                                <div className="flex justify-end gap-2 pt-2 border-t mt-2">
                                  <Button variant="ghost" size="sm" className="h-9 px-4 text-xs" onClick={() => setEditingId(null)}>Cancel</Button>
                                  <Button onClick={handleSave} size="sm" className="h-9 px-4 text-xs">Save</Button>
                                </div>
                              </div>
                            </Card>
                          ) : (
                            <Card className="p-3.5 flex items-start justify-between gap-4 hover:border-slate-300 transition-colors w-full min-w-0 overflow-hidden">
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <div className="cursor-grab text-slate-300 hover:text-indigo-500 hidden sm:block active:cursor-grabbing">
                                  <GripVertical className="w-4 h-4" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <h4 className="font-semibold text-slate-900 text-sm truncate w-full">
                                    {entry.title || entry.institution || entry.company || 'Untitled'}
                                  </h4>
                                  <p className="text-xs text-slate-500 mt-0.5 leading-relaxed line-clamp-1">
                                    {renderPreview(entry) || <span className="text-slate-300 italic">No details</span>}
                                  </p>
                                  {renderAssetPreviewIcon(entry)}
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                {idx > 0 && (
                                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-slate-400 hover:text-slate-605" onClick={() => handleMove(idx, 'up')}>
                                    <ArrowUp className="w-3.5 h-3.5" />
                                  </Button>
                                )}
                                {idx < (sections[activeEditorTab as keyof typeof sections] || []).length - 1 && (
                                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-slate-400 hover:text-slate-605" onClick={() => handleMove(idx, 'down')}>
                                    <ArrowDown className="w-3.5 h-3.5" />
                                  </Button>
                                )}
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleEdit(entry.id)}>
                                  <Pencil className="w-3.5 h-3.5" />
                                </Button>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => handleDelete(entry.id)}>
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            </Card>
                          )}
                        </div>
                      ))}
                      
                      {isNewEntry && (
                        <Card className="p-4 border-indigo-200 ring-2 ring-indigo-50 animate-in fade-in">
                          <div className="space-y-4">
                            {renderFields()}
                            <div className="flex justify-end gap-2 pt-2 border-t mt-2">
                              <Button variant="ghost" size="sm" className="h-9 px-4 text-xs" onClick={() => setEditingId(null)}>Cancel</Button>
                              <Button onClick={handleSave} size="sm" className="h-9 px-4 text-xs">Save</Button>
                            </div>
                          </div>
                        </Card>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* View 3: Updates Hub */}
        {currentView === 'updates' && (
          <div className="space-y-6 animate-in slide-in-from-bottom duration-300 max-w-2xl mx-auto">
            <button 
              onClick={() => goView('overview')}
              className="inline-flex items-center gap-1 text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" /> Back to Dashboard
            </button>

            <div>
              <h1 className="text-2.5xl font-serif font-bold text-slate-900 mb-1">Updates Hub</h1>
              <p className="text-slate-500 text-sm">
                Parse a resume or post a quick highlight. New entries from Edit Profile use the same monthly update credits.
              </p>
            </div>

            <div className="flex bg-slate-100 p-1 rounded-xl w-fit">
              <button 
                onClick={() => goView('updates', { updatesTab: 'post' })}
                className={cn(
                  "px-4 py-2 text-sm font-semibold rounded-lg transition-all",
                  updatesTab === 'post' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                )}
              >
                Post Achievement
              </button>
              <button 
                onClick={() => goView('updates', { updatesTab: 'parse' })}
                className={cn(
                  "px-4 py-2 text-sm font-semibold rounded-lg transition-all",
                  updatesTab === 'parse' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                )}
              >
                Parse Resume
              </button>
            </div>

            {updatesTab === 'parse' && (
              <div className="space-y-6">
                {/* Pre-flight limit check */}
                {(() => {
                  // Server-provided plan limits (Identity 1, Essential/Growth 3, Student+ 1, Free 0)
                  const planDisplay = PLAN_DISPLAY_NAMES[data.plan || 'free'] || 'Free';
                  const limitParses = data.limits?.parsesPerMonth ?? 0;
                  const remaining = data.limits?.parsesRemaining ?? 0;
                  const daysToReset = data.limits?.parsesDaysToReset ?? 30;
                  const isLocked = remaining <= 0;

                  return (
                    <>
                      <Card className="p-5 bg-white border border-slate-200 shadow-sm flex items-center justify-between">
                        <div>
                          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">AI Parse Limit ({planDisplay})</p>
                          <div className="flex items-center gap-2">
                            <span className="text-xl font-bold text-slate-900">{remaining}</span>
                            <span className="text-slate-500 text-sm">of {limitParses} remaining</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-slate-500 mb-1">Resets in</p>
                          <p className="text-sm font-semibold text-indigo-600">{daysToReset} Days</p>
                        </div>
                      </Card>

                      <Card className="p-6 bg-white border border-slate-200 shadow-sm relative overflow-hidden">
                        {isLocked && (
                          <div className="absolute inset-0 z-10 bg-white/70 backdrop-blur-sm flex flex-col items-center justify-center">
                            <div className="w-12 h-12 bg-red-50 text-red-500 rounded-full flex items-center justify-center mb-3 shadow-sm">
                              <Lock className="w-6 h-6" />
                            </div>
                            <h3 className="font-bold text-slate-900 mb-1">{limitParses <= 0 ? 'Paid Feature' : 'Quota Exhausted'}</h3>
                            <p className="text-sm text-slate-600 max-w-xs text-center mb-4">
                              {limitParses <= 0
                                ? 'AI resume parsing is included in Identity, Essential, Growth and Student+ plans. Upgrade to parse resumes.'
                                : `You've used all your AI parses for this period. Please wait ${daysToReset} days for the quota to reset.`}
                            </p>
                            {(!data.isPremium || data.plan === 'free') && (
                              <Button onClick={openBilling} size="sm">Upgrade Plan</Button>
                            )}
                          </div>
                        )}
                        
                        <div 
                          className={cn(
                            "relative border-2 border-dashed rounded-2xl p-8 text-center transition-all duration-300",
                            isLocked ? "opacity-40 pointer-events-none border-slate-200 bg-slate-50" :
                            resumeStatus === 'idle' ? "border-slate-300 hover:border-indigo-500 bg-slate-50 hover:bg-indigo-50/20 cursor-pointer" :
                            resumeStatus === 'success' ? "border-emerald-500 bg-emerald-50/10" :
                            "border-indigo-500 bg-indigo-50/20"
                          )}
                          onClick={() => !isLocked && resumeStatus === 'idle' && resumeInputRef.current?.click()}
                        >
                          <input 
                            type="file" 
                            ref={resumeInputRef}
                            className="hidden" 
                            accept="application/pdf"
                            onChange={handleResumeChange}
                          />

                          {resumeStatus === 'idle' && (
                            <div className="flex flex-col items-center">
                              <div className="w-12 h-12 bg-indigo-50 text-indigo-500 rounded-full flex items-center justify-center mb-3">
                                <UploadCloud className="w-6 h-6" />
                              </div>
                              <h3 className="text-sm font-bold text-slate-900 mb-0.5">Click to upload PDF resume</h3>
                              <p className="text-slate-400 text-xs">PDF format only, up to 5MB.</p>
                            </div>
                          )}

                          {(resumeStatus === 'uploading' || resumeStatus === 'parsing') && (
                            <div className="flex flex-col items-center">
                              <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mb-3" />
                              <h3 className="text-sm font-bold text-slate-900 mb-0.5">
                                {resumeStatus === 'uploading' ? 'Uploading resume...' : 'Parsing resume details...'}
                              </h3>
                              <p className="text-slate-400 text-xs">Structuring your sections.</p>
                              
                              <div className="w-full max-w-xs mt-4 h-1 bg-slate-200 rounded-full overflow-hidden">
                                <div 
                                  className={cn(
                                    "h-full bg-indigo-600 rounded-full transition-all duration-700",
                                    resumeStatus === 'uploading' ? "w-1/3" : "w-4/5"
                                  )}
                                />
                              </div>
                            </div>
                          )}

                          {resumeStatus === 'success' && (
                            <div className="flex flex-col items-center">
                              <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-3">
                                <CheckCircle2 className="w-6 h-6" />
                              </div>
                              <h3 className="text-sm font-bold text-slate-950 mb-2">Resume uploaded successfully</h3>
                              <div className="flex items-center gap-1.5 text-slate-700 bg-white border border-slate-200 px-3 py-1.5 rounded-lg text-xs shadow-sm max-w-[250px] truncate">
                                <FileText className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                                <span className="truncate">{resumeFile?.name || data.resumeFileName || 'resume.pdf'}</span>
                              </div>
                              <button 
                                onClick={(e) => { e.stopPropagation(); handleRemoveResume(); }} 
                                className="text-xs text-red-500 hover:text-red-700 font-semibold mt-4 hover:underline"
                              >
                                Delete Resume
                              </button>
                            </div>
                          )}
                        </div>
                      </Card>

                      {/* Re-compile ATS resume — always below the parse/upload compiler */}
                      <Card className="p-6 bg-white border border-slate-200 shadow-sm flex flex-col gap-4 animate-in slide-in-from-bottom duration-300">
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 border-b border-slate-100 pb-3">
                          <div className="space-y-0.5">
                            <h3 className="text-sm font-bold text-slate-900">Re-Compile ATS Resume</h3>
                            <p className="text-xs text-slate-500">
                              Builds a fresh PDF from your portfolio. The previous compiled version is replaced.
                              Your uploaded resume stays intact until you upload a new one.
                            </p>
                          </div>
                          {data.generatedResumeUrl && (
                            <a
                              href={data.generatedResumeUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-800 hover:underline shrink-0"
                            >
                              View / Download <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </div>

                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
                          <div className="flex items-center gap-2 min-w-0">
                            <FileText className="w-5 h-5 text-indigo-500 shrink-0" />
                            <div className="min-w-0">
                              <span className="text-xs font-medium text-slate-800 block">
                                ATS Professional Resume PDF
                              </span>
                              <span className="text-[11px] text-slate-500">
                                {data.generatedResumeUrl ? 'Compiled version ready' : 'Not compiled yet — generate from your profile'}
                              </span>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              onClick={() => { setIsCompileDialogOpen(true); setHasAcceptedDeclaration(false); }}
                              variant="secondary"
                              size="sm"
                              className="text-xs h-9 px-3 flex gap-1 bg-white hover:bg-slate-100 border-slate-200"
                            >
                              {data.generatedResumeUrl ? 'Re-Compile PDF' : 'Compile PDF'}
                            </Button>

                            <Dialog open={isCompileDialogOpen} onOpenChange={setIsCompileDialogOpen}>
                              <DialogContent className="sm:max-w-[425px]">
                                <DialogHeader>
                                  <DialogTitle>Compile Professional ATS Resume</DialogTitle>
                                  <DialogDescription>
                                    Your resume will be generated from portfolio details. The previous compiled file is replaced; your uploaded PDF is not touched.
                                  </DialogDescription>
                                </DialogHeader>
                                <div className="py-4 space-y-4">
                                  <div className="flex items-start space-x-3 p-3 bg-amber-50 text-amber-800 rounded-lg text-sm border border-amber-200/50">
                                    <Checkbox
                                      id="declaration"
                                      checked={hasAcceptedDeclaration}
                                      onCheckedChange={(c) => setHasAcceptedDeclaration(!!c)}
                                      className="mt-0.5 border-amber-300 data-[state=checked]:bg-amber-600 data-[state=checked]:border-amber-600"
                                    />
                                    <div className="grid gap-1.5 leading-none">
                                      <label htmlFor="declaration" className="font-semibold text-sm cursor-pointer">
                                        Declaration of Authenticity
                                      </label>
                                      <p className="text-xs text-amber-700/80 leading-snug">
                                        I hereby declare that all the details, achievements, and assets provided by me are original, verified, and strictly correct to the best of my knowledge.
                                      </p>
                                    </div>
                                  </div>
                                  <p className="text-xs text-slate-500 bg-slate-50 p-3 rounded-lg border border-slate-100">
                                    <strong className="text-slate-700">Need to make changes?</strong> Close this window and post an update or edit your portfolio details first before generating.
                                  </p>
                                </div>
                                <DialogFooter className="flex-col sm:flex-row gap-2">
                                  <Button variant="outline" onClick={() => setIsCompileDialogOpen(false)}>
                                    Cancel & Edit Content
                                  </Button>
                                  <Button
                                    disabled={!hasAcceptedDeclaration || isCompiling}
                                    onClick={async () => {
                                      setIsCompiling(true);
                                      try {
                                        const token = localStorage.getItem('token');
                                        const res = await fetch(apiUrl('/api/profile/generate-resume'), {
                                          method: 'POST',
                                          headers: {
                                            'Authorization': `Bearer ${token}`
                                          }
                                        });
                                        if (!res.ok) {
                                          const errorData = await res.json().catch(() => ({}));
                                          throw new Error(errorData.error || 'Generation failed');
                                        }
                                        const result = await res.json();
                                        updateData({
                                          generatedResumeUrl: result.url,
                                          // Prefer generated for site download unless user chose uploaded
                                          ...(data.defaultResume === 'uploaded' ? {} : { resumeUrl: result.url }),
                                        } as any);
                                        setIsCompileDialogOpen(false);
                                        toast({
                                          title: "Resume Compiled",
                                          description: "Previous compiled version replaced. Uploaded resume unchanged."
                                        });
                                      } catch (err: any) {
                                        toast({
                                          title: "Error",
                                          description: err.message || "Failed to compile resume",
                                          variant: "destructive"
                                        });
                                      } finally {
                                        setIsCompiling(false);
                                      }
                                    }}
                                  >
                                    {isCompiling ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                                    Compile PDF
                                  </Button>
                                </DialogFooter>
                              </DialogContent>
                            </Dialog>
                            {data.generatedResumeUrl && (
                              <a href={data.generatedResumeUrl} target="_blank" rel="noreferrer">
                                <Button size="sm" className="text-xs h-9 px-3 flex gap-1">
                                  Download PDF
                                </Button>
                              </a>
                            )}
                          </div>
                        </div>
                      </Card>
                    </>
                  );
                })()}
              </div>
            )}

            {updatesTab === 'post' && (() => {
              const updatesLimit = data.limits?.updatesPerMonth ?? 1;
              const updatesRemaining = data.limits?.updatesRemaining ?? updatesLimit;
              const updatesDaysToReset = data.limits?.updatesDaysToReset ?? 30;
              const updatesLocked = updatesRemaining <= 0;
              const postPlanDisplay = PLAN_DISPLAY_NAMES[data.plan || 'free'] || 'Free';
              return (
              <div className="space-y-6">
              <Card className="p-5 bg-white border border-slate-200 shadow-sm flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Monthly Updates ({postPlanDisplay})</p>
                  <div className="flex items-center gap-2">
                    <span className="text-xl font-bold text-slate-900">{updatesRemaining}</span>
                    <span className="text-slate-500 text-sm">of {updatesLimit} remaining</span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-500 mb-1">Resets in</p>
                  <p className="text-sm font-semibold text-indigo-600">{updatesDaysToReset} Days</p>
                </div>
              </Card>
              <Card className="p-6 bg-white border border-slate-200 shadow-sm animate-in slide-in-from-bottom duration-300 relative overflow-hidden">
                {updatesLocked && (
                  <div className="absolute inset-0 z-10 bg-white/75 backdrop-blur-sm flex flex-col items-center justify-center p-6">
                    <div className="w-12 h-12 bg-red-50 text-red-500 rounded-full flex items-center justify-center mb-3 shadow-sm">
                      <Lock className="w-6 h-6" />
                    </div>
                    <h3 className="font-bold text-slate-900 mb-1">Update Limit Reached</h3>
                    <p className="text-sm text-slate-600 max-w-xs text-center mb-4">
                      You've used all {updatesLimit} update{updatesLimit === 1 ? '' : 's'} included in the {postPlanDisplay} plan this month. Resets in {updatesDaysToReset} day{updatesDaysToReset === 1 ? '' : 's'}.
                    </p>
                    <Button onClick={openBilling} size="sm">Upgrade for more updates</Button>
                  </div>
                )}
                <div className="space-y-6">
                  <div>
                    <Label className="text-sm font-semibold text-slate-800">What type of update is this?</Label>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {[
                        { id: 'education', label: 'Education' },
                        { id: 'experience', label: 'Experience' },
                        { id: 'project', label: 'Projects' },
                        { id: 'certificate', label: 'Certificates' },
                        { id: 'achievement', label: 'Achievements' },
                        { id: 'research', label: 'Research' },
                        { id: 'skill', label: 'Skills' }
                      ].map(cat => (
                        <button
                          key={cat.id}
                          onClick={() => {
                            setUpdateCategory(cat.id as any);
                            setUpdateForm({ assets: { mode: 'images' as AssetMode, images: [], pdfs: [], links: [] } });
                          }}
                          className={cn(
                            "px-4 py-2 rounded-lg text-sm font-medium transition-all border",
                            updateCategory === cat.id 
                              ? "bg-indigo-50 border-indigo-200 text-indigo-700" 
                              : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                          )}
                        >
                          {cat.label}
                        </button>
                      ))}
                    </div>
                  </div>

                    {/* Shared Assets UI for supported categories */}
                    {['project', 'certificate', 'achievement', 'research'].includes(updateCategory) && (
                      <div className="pt-4 mt-4 border-t border-slate-100">
                        <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-3 block">Attachments</Label>
                        <div className="bg-slate-50 border border-slate-200 rounded-xl overflow-hidden">
                          <div className="flex border-b border-slate-200">
                            {[
                              { id: 'images', icon: ImageIcon, label: 'Images' },
                              { id: 'pdfs', icon: FileText, label: 'PDFs' },
                              { id: 'links', icon: LinkIcon, label: 'Links' }
                            ].map(tab => (
                              <button
                                key={tab.id}
                                type="button"
                                onClick={() => handleUpdateAssetModeChange(tab.id as AssetMode)}
                                className={cn(
                                  "flex-1 py-2 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors",
                                  updateForm.assets?.mode === tab.id
                                    ? "bg-white text-indigo-600 border-b-2 border-indigo-600"
                                    : "text-slate-500 hover:bg-slate-100"
                                )}
                              >
                                <tab.icon className="w-3.5 h-3.5" />
                                {tab.label}
                              </button>
                            ))}
                          </div>
                          
                          <div className="p-4 bg-white min-h-[120px]">
                            {updateForm.assets?.mode === 'images' && (
                              <div className="space-y-3">
                                <div className="flex justify-between items-center">
                                  <p className="text-xs text-slate-500">Upload screenshots or proof (Max 5)</p>
                                  <Button type="button" variant="outline" size="sm" className="h-8 text-xs px-3" onClick={() => handleUpdateFileUpload('images')} disabled={(updateForm.assets?.images || []).length >= 5 || isStorageFull || isUpdateUploading}>
                                    {isUpdateUploading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Upload className="w-3.5 h-3.5 mr-1.5" />}
                                    Upload Image
                                  </Button>
                                </div>
                                {(updateForm.assets?.images || []).length > 0 && (
                                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                    {(updateForm.assets.images || []).map((img: any) => (
                                      <div key={img.id} className="relative aspect-video rounded-lg border border-slate-200 overflow-hidden group bg-slate-100">
                                        {img.isUploading ? (
                                          <div className="absolute inset-0 flex items-center justify-center bg-slate-100/80">
                                            <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
                                          </div>
                                        ) : (
                                          <>
                                            <img src={img.url} alt={img.name} className="w-full h-full object-cover" />
                                            <button type="button" onClick={() => handleUpdateDeleteAsset('images', img.id)} className="absolute top-1 right-1 w-6 h-6 bg-red-500 hover:bg-red-600 text-white rounded-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm">
                                              <X className="w-3.5 h-3.5" />
                                            </button>
                                          </>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}

                            {updateForm.assets?.mode === 'pdfs' && (
                              <div className="space-y-3">
                                <div className="flex justify-between items-center">
                                  <p className="text-xs text-slate-500">Upload PDF documents (Max 2)</p>
                                  <Button type="button" variant="outline" size="sm" className="h-8 text-xs px-3" onClick={() => handleUpdateFileUpload('pdfs')} disabled={(updateForm.assets?.pdfs || []).length >= 2 || isStorageFull || isUpdateUploading}>
                                    {isUpdateUploading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Upload className="w-3.5 h-3.5 mr-1.5" />}
                                    Upload PDF
                                  </Button>
                                </div>
                                {(updateForm.assets?.pdfs || []).length > 0 && (
                                  <div className="space-y-2">
                                    {(updateForm.assets.pdfs || []).map((pdf: any) => (
                                      <div key={pdf.id} className="flex items-center justify-between p-2.5 rounded-lg border border-slate-200 bg-slate-50">
                                        <div className="flex items-center gap-2 overflow-hidden">
                                          {pdf.isUploading ? <Loader2 className="w-4 h-4 text-slate-400 animate-spin shrink-0" /> : <FileText className="w-4 h-4 text-red-500 shrink-0" />}
                                          <span className="text-xs font-medium text-slate-700 truncate">{pdf.name}</span>
                                        </div>
                                        {!pdf.isUploading && (
                                          <button type="button" onClick={() => handleUpdateDeleteAsset('pdfs', pdf.id)} className="p-1 hover:bg-slate-200 rounded text-slate-500 hover:text-red-500 transition-colors">
                                            <X className="w-4 h-4" />
                                          </button>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}

                            {updateForm.assets?.mode === 'links' && (
                              <div className="space-y-3">
                                <div className="flex justify-between items-center">
                                  <p className="text-xs text-slate-500">Add external URLs</p>
                                  <Button type="button" variant="outline" size="sm" className="h-8 text-xs px-3" onClick={handleUpdateAddLink}>
                                    <Plus className="w-3.5 h-3.5 mr-1.5" />
                                    Add Link
                                  </Button>
                                </div>
                                {(updateForm.assets?.links || []).length > 0 && (
                                  <div className="space-y-2">
                                    {(updateForm.assets.links || []).map((link: any, i: number) => (
                                      <div key={i} className="flex items-start gap-2">
                                        <div className="flex-1 space-y-2">
                                          <Input placeholder="Label (e.g. Live Demo)" value={link.label} onChange={e => handleUpdateLinkChange(i, 'label', e.target.value)} className="h-8 text-xs" />
                                          <Input placeholder="URL (https://...)" value={link.url} onChange={e => handleUpdateLinkChange(i, 'url', e.target.value)} className="h-8 text-xs" />
                                        </div>
                                        <button type="button" onClick={() => handleUpdateDeleteLink(i)} className="mt-1 p-1.5 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-500 transition-colors">
                                          <Trash2 className="w-4 h-4" />
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                  <div className="space-y-4 pt-4 border-t border-slate-100">
                    {['achievement', 'research'].includes(updateCategory) && (
                      <>
                        <div className="space-y-1">
                          <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Title</Label>
                          <Input value={updateForm.title || ''} onChange={e => setUpdateForm({...updateForm, title: e.target.value})} placeholder="E.g., Promoted to Senior Developer" />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Organization/Context</Label>
                            <Input value={updateForm.organization || ''} onChange={e => setUpdateForm({...updateForm, organization: e.target.value})} placeholder="E.g., Google" />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Date</Label>
                            <Input value={updateForm.date || ''} onChange={e => setUpdateForm({...updateForm, date: e.target.value})} placeholder="E.g., Oct 2026" />
                          </div>
                        </div>
                      </>
                    )}

                    {updateCategory === 'experience' && (
                      <>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Role/Title</Label>
                            <Input value={updateForm.role || ''} onChange={e => setUpdateForm({...updateForm, role: e.target.value})} placeholder="E.g., Software Engineer" />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Company</Label>
                            <Input value={updateForm.company || ''} onChange={e => setUpdateForm({...updateForm, company: e.target.value})} placeholder="E.g., Bexo Inc." />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Start Date</Label>
                            <Input value={updateForm.startYear || ''} onChange={e => setUpdateForm({...updateForm, startYear: e.target.value})} placeholder="E.g., Jan 2023" />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">End Date</Label>
                            <Input value={updateForm.endYear || ''} onChange={e => setUpdateForm({...updateForm, endYear: e.target.value})} placeholder="E.g., Present" />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Description</Label>
                          <textarea 
                            value={updateForm.description || ''} 
                            onChange={e => setUpdateForm({...updateForm, description: e.target.value})} 
                            className="w-full h-24 px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 resize-none"
                            placeholder="What did you achieve?"
                          />
                        </div>
                      </>
                    )}

                    {updateCategory === 'education' && (
                      <>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Institution</Label>
                            <Input value={updateForm.institution || ''} onChange={e => setUpdateForm({...updateForm, institution: e.target.value})} placeholder="E.g., Stanford University" />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Degree/Major</Label>
                            <Input value={updateForm.degree || ''} onChange={e => setUpdateForm({...updateForm, degree: e.target.value})} placeholder="E.g., BS Computer Science" />
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                          <div className="space-y-1">
                            <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Start Year</Label>
                            <Input value={updateForm.startYear || ''} onChange={e => setUpdateForm({...updateForm, startYear: e.target.value})} placeholder="2020" />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">End Year</Label>
                            <Input value={updateForm.endYear || ''} onChange={e => setUpdateForm({...updateForm, endYear: e.target.value})} placeholder="2024" />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Grade/GPA</Label>
                            <Input value={updateForm.grade || ''} onChange={e => setUpdateForm({...updateForm, grade: e.target.value})} placeholder="E.g., 3.8/4.0" />
                          </div>
                        </div>
                      </>
                    )}

                    {updateCategory === 'project' && (
                      <>
                        <div className="space-y-1">
                          <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Project Title</Label>
                          <Input value={updateForm.title || ''} onChange={e => setUpdateForm({...updateForm, title: e.target.value})} placeholder="E.g., E-commerce Platform" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Tech Stack</Label>
                          <Input value={updateForm.tech || ''} onChange={e => setUpdateForm({...updateForm, tech: e.target.value})} placeholder="E.g., React, Node.js, MongoDB" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Live Link / Repo</Label>
                          <Input value={updateForm.link || ''} onChange={e => setUpdateForm({...updateForm, link: e.target.value})} placeholder="https://github.com/..." />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Description</Label>
                          <textarea 
                            value={updateForm.description || ''} 
                            onChange={e => setUpdateForm({...updateForm, description: e.target.value})} 
                            className="w-full h-24 px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 resize-none"
                            placeholder="Describe what you built..."
                          />
                        </div>
                      </>
                    )}

                    {updateCategory === 'certificate' && (
                      <>
                        <div className="space-y-1">
                          <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Certificate Title</Label>
                          <Input value={updateForm.title || ''} onChange={e => setUpdateForm({...updateForm, title: e.target.value})} placeholder="E.g., AWS Solutions Architect" />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Issuer</Label>
                            <Input value={updateForm.issuer || ''} onChange={e => setUpdateForm({...updateForm, issuer: e.target.value})} placeholder="E.g., Amazon Web Services" />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Date Earned</Label>
                            <Input value={updateForm.date || ''} onChange={e => setUpdateForm({...updateForm, date: e.target.value})} placeholder="E.g., Oct 2026" />
                          </div>
                        </div>
                      </>
                    )}

                    {updateCategory === 'skill' && (
                      <>
                        <div className="space-y-1">
                          <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Skills</Label>
                          <Input
                            value={updateForm.name || ''}
                            onChange={e => setUpdateForm({ ...updateForm, name: e.target.value })}
                            onKeyDown={async (e) => {
                              if (e.key !== 'Enter') return;
                              e.preventDefault();
                              if (isPostingUpdate || updatesLocked || isUpdateUploading) return;
                              const raw = String(updateForm.name || '').trim();
                              if (!raw) return;
                              // Trigger the same post flow via clicking the button programmatically
                              (document.getElementById('post-update-submit') as HTMLButtonElement | null)?.click();
                            }}
                            placeholder="React, Python, Figma — comma-separated, Enter to post"
                          />
                          <p className="text-[11px] text-slate-400">
                            Separate multiple skills with commas. Press Enter or Post to add them in one update.
                          </p>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Category</Label>
                          <select
                            value={updateForm.category || 'technical'}
                            onChange={e => setUpdateForm({ ...updateForm, category: e.target.value })}
                            className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
                          >
                            {SKILL_CATEGORIES.map((c) => (
                              <option key={c.id} value={c.id}>{c.label}</option>
                            ))}
                          </select>
                        </div>
                      </>
                    )}

                  </div>

                  <div className="flex justify-end pt-4 border-t border-slate-100">
                    <Button 
                      id="post-update-submit"
                      className="h-10 px-6"
                      disabled={isPostingUpdate || updatesLocked}
                      onClick={async () => {
                        // Check uploading state
                        if (isUpdateUploading) {
                          toast({ title: 'Wait', description: 'Please wait for files to finish uploading.', variant: 'destructive' });
                          return;
                        }

                        // Validate minimum requirements for the specific category
                        let isValid = false;
                        if (['achievement', 'research'].includes(updateCategory) && updateForm.title?.trim()) isValid = true;
                        if (updateCategory === 'experience' && updateForm.role?.trim() && updateForm.company?.trim()) isValid = true;
                        if (updateCategory === 'education' && updateForm.institution?.trim() && updateForm.degree?.trim()) isValid = true;
                        if (updateCategory === 'project' && updateForm.title?.trim()) isValid = true;
                        if (updateCategory === 'certificate' && updateForm.title?.trim() && updateForm.issuer?.trim()) isValid = true;
                        if (updateCategory === 'skill' && updateForm.name?.trim()) isValid = true;

                        if (!isValid) {
                          toast({ title: 'Incomplete', description: 'Please fill out the required primary fields.', variant: 'destructive' });
                          return;
                        }

                        setIsPostingUpdate(true);
                        try {
                          const token = localStorage.getItem('token');
                          const res = await fetch(apiUrl('/api/profile/updates'), {
                            method: 'POST',
                            headers: {
                              'Content-Type': 'application/json',
                              'Authorization': `Bearer ${token}`,
                            },
                            body: JSON.stringify({ category: updateCategory, entry: updateForm }),
                          });
                          const result = await res.json().catch(() => ({}));

                          if (res.status === 429) {
                            updateData({
                              limits: {
                                ...(data.limits || ({} as any)),
                                updatesRemaining: 0,
                                updatesUsed: result.used ?? data.limits?.updatesUsed ?? 0,
                                updatesDaysToReset: result.daysToReset ?? data.limits?.updatesDaysToReset ?? 30,
                              } as any,
                            });
                            toast({ title: 'Limit reached', description: result.error || 'Monthly update limit reached.', variant: 'destructive' });
                            return;
                          }
                          if (!res.ok) throw new Error(result.error || 'Failed to post update');

                          // Reflect the server-side append locally
                          const stateKeyMap: Record<string, string> = {
                            'achievement': 'achievementEntries',
                            'experience': 'experienceEntries',
                            'education': 'educationEntries',
                            'project': 'projectEntries',
                            'certificate': 'certificateEntries',
                            'research': 'researchEntries',
                            'skill': 'skillEntries',
                          };
                          const targetKey = stateKeyMap[updateCategory];
                          const currentList = Array.isArray((data as any)[targetKey]) ? (data as any)[targetKey] : [];
                          const appended = Array.isArray(result.entries)
                            ? result.entries
                            : result.entry
                              ? [result.entry]
                              : [];
                          updateData({
                            [targetKey]: [...currentList, ...appended],
                            limits: {
                              ...(data.limits || ({} as any)),
                              updatesUsed: result.usage?.used ?? ((data.limits?.updatesUsed ?? 0) + 1),
                              updatesRemaining: result.usage?.remaining ?? Math.max(0, (data.limits?.updatesRemaining ?? 1) - 1),
                              updatesDaysToReset: result.usage?.daysToReset ?? data.limits?.updatesDaysToReset ?? 30,
                            } as any,
                          } as any);

                          const skillCount = updateCategory === 'skill' ? appended.length : 0;
                          toast({
                            title: "Update posted!",
                            description: skillCount > 1
                              ? `Added ${skillCount} skills. ${result.usage?.remaining ?? 0} update(s) left this month.`
                              : `Your new entry has been added. ${result.usage?.remaining ?? 0} update(s) left this month.`
                          });

                          // Reset form
                          setUpdateForm({ assets: { mode: 'images' as AssetMode, images: [], pdfs: [], links: [] } });
                          goView('overview');
                        } catch (err: any) {
                          toast({ title: 'Error', description: err.message || 'Failed to post update.', variant: 'destructive' });
                        } finally {
                          setIsPostingUpdate(false);
                        }
                      }}
                    >
                      {isPostingUpdate ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                      Post Update to Profile
                    </Button>
                  </div>
                </div>
              </Card>
              </div>
              );
            })()}
          </div>
        )}

        {/* View 4: Appearance & Settings */}
        {currentView === 'settings' && (
          <div className="space-y-6 animate-in slide-in-from-bottom duration-300">
            <button 
              onClick={() => goView('overview')}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors uppercase tracking-wider select-none"
            >
              <ChevronLeft className="w-4 h-4" /> Back to Dashboard
            </button>

            <div>
              <h1 className="text-xl sm:text-2xl md:text-3xl font-serif font-bold text-slate-900 tracking-tight">Appearance & Settings</h1>
              <p className="text-slate-500 text-sm mt-0.5 leading-relaxed">Customize template designs, color theme accents, and personal settings.</p>
            </div>

            {/* Premium Tabbed Layout */}
            <div className="grid gap-4 md:gap-6 items-start md:grid-cols-[minmax(11rem,13.5rem)_minmax(0,1fr)] min-w-0">
              {/* Tab Navigation — horizontal scroll pills on mobile, stacked card on desktop */}
              <Card className="p-1.5 md:p-2.5 bg-white border border-slate-200 shadow-sm flex flex-row md:flex-col gap-1 overflow-x-auto md:overflow-visible hide-scrollbar sticky top-[calc(3.5rem+env(safe-area-inset-top))] md:static z-10 w-full min-w-0">
                <button
                  onClick={() => goView('settings', { settingsTab: 'profile' })}
                  className={cn(
                    "flex items-center gap-2 md:gap-3 px-3.5 md:px-4 py-2.5 md:py-3 rounded-xl text-sm font-semibold transition-all text-left md:w-full whitespace-nowrap shrink-0",
                    settingsSubTab === 'profile' 
                      ? "bg-indigo-50 text-indigo-900 shadow-sm ring-1 ring-indigo-100" 
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  )}
                >
                  <User className="w-4 h-4 shrink-0" /> Personal Details
                </button>
                
                <button
                  onClick={() => goView('settings', { settingsTab: 'design' })}
                  className={cn(
                    "flex items-center gap-2 md:gap-3 px-3.5 md:px-4 py-2.5 md:py-3 rounded-xl text-sm font-semibold transition-all text-left md:w-full whitespace-nowrap shrink-0",
                    settingsSubTab === 'design' 
                      ? "bg-indigo-50 text-indigo-900 shadow-sm ring-1 ring-indigo-100" 
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  )}
                >
                  <Palette className="w-4 h-4 shrink-0" /> Design & Theme
                </button>
                
                <button
                  onClick={() => { goView('settings', { settingsTab: 'storage' }); loadAssets(); }}
                  className={cn(
                    "flex items-center gap-2 md:gap-3 px-3.5 md:px-4 py-2.5 md:py-3 rounded-xl text-sm font-semibold transition-all text-left md:w-full whitespace-nowrap shrink-0",
                    settingsSubTab === 'storage' 
                      ? "bg-indigo-50 text-indigo-900 shadow-sm ring-1 ring-indigo-100" 
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  )}
                >
                  <FileText className="w-4 h-4 shrink-0" /> Cloud Storage
                </button>

                <button
                  onClick={() => { goView('settings', { settingsTab: 'assets' }); loadAssets(); }}
                  className={cn(
                    "flex items-center gap-2 md:gap-3 px-3.5 md:px-4 py-2.5 md:py-3 rounded-xl text-sm font-semibold transition-all text-left md:w-full whitespace-nowrap shrink-0",
                    settingsSubTab === 'assets' 
                      ? "bg-indigo-50 text-indigo-900 shadow-sm ring-1 ring-indigo-100" 
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  )}
                >
                  <ImageIcon className="w-4 h-4 shrink-0" /> Assets & Storage
                </button>

                <button
                  onClick={() => goView('settings', { settingsTab: 'billing' })}
                  className={cn(
                    "flex items-center gap-2 md:gap-3 px-3.5 md:px-4 py-2.5 md:py-3 rounded-xl text-sm font-semibold transition-all text-left md:w-full whitespace-nowrap shrink-0",
                    settingsSubTab === 'billing' 
                      ? "bg-indigo-50 text-indigo-900 shadow-sm ring-1 ring-indigo-100" 
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  )}
                >
                  <CreditCard className="w-4 h-4 shrink-0" /> Billing & Invoices
                </button>
              </Card>

              {/* Tab Content Cards */}
              <div className="min-w-0">
                {settingsSubTab === 'profile' && (
                  <div className="space-y-6 animate-in fade-in duration-200">
                  <Card className="p-6 bg-white border border-slate-200 shadow-sm space-y-4">
                    <div>
                      <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                        <Globe className="w-4 h-4 text-indigo-500" /> Portfolio URL
                      </h3>
                      <p className="text-slate-500 text-xs mt-0.5">
                        Change your public handle. Recruiters will use the new address; the old one stops working.
                      </p>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                      <div className="flex h-12 flex-1 items-center rounded-xl border border-slate-200 bg-slate-50 overflow-hidden">
                        <Input
                          value={handleDraft}
                          onChange={(e) => {
                            const v = e.target.value.toLowerCase().replace(/[^a-z0-9.-]/g, '');
                            setHandleDraft(v);
                            setHandleCheck('idle');
                          }}
                          onBlur={() => void checkHandleAvailability(handleDraft)}
                          className="border-0 bg-transparent shadow-none focus-visible:ring-0 h-12"
                          placeholder="yourname"
                        />
                        <span className="pr-3 text-xs font-medium text-slate-400 shrink-0">.{PLATFORM_DOMAIN}</span>
                      </div>
                      <Button
                        type="button"
                        className="h-12 shrink-0"
                        disabled={
                          isHandleSaving ||
                          !handleDraft ||
                          handleDraft.toLowerCase() === (data.handle || '').toLowerCase() ||
                          handleCheck === 'taken' ||
                          handleCheck === 'invalid' ||
                          handleCheck === 'checking'
                        }
                        onClick={() => void handleSaveHandle()}
                      >
                        {isHandleSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save handle'}
                      </Button>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      {handleCheck === 'checking' && 'Checking availability…'}
                      {handleCheck === 'available' && <span className="text-emerald-600 font-semibold">Available</span>}
                      {handleCheck === 'taken' && <span className="text-red-600 font-semibold">Already taken</span>}
                      {handleCheck === 'invalid' && <span className="text-red-600 font-semibold">Invalid handle format</span>}
                      {handleCheck === 'idle' && data.handle && (
                        <>Current: <a className="text-indigo-600 font-semibold hover:underline" href={livePortfolioHref} target="_blank" rel="noreferrer">{livePortfolioHref.replace(/^https?:\/\//, '')}</a></>
                      )}
                    </p>
                  </Card>

                  <Card className="p-6 bg-white border border-slate-200 shadow-sm space-y-6">
                    <div>
                      <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                        <User className="w-4 h-4 text-indigo-500" /> Personal Settings
                      </h3>
                      <p className="text-slate-500 text-xs mt-0.5">Update your basic onboarding and contact information.</p>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 rounded-xl border border-slate-100 bg-slate-50/80">
                      <div className="w-20 h-20 rounded-full overflow-hidden bg-slate-200 border border-slate-200 shrink-0 flex items-center justify-center text-2xl font-bold text-slate-500">
                        {data.photoUrl ? (
                          <img src={data.photoUrl} alt="Profile" className="w-full h-full object-cover" />
                        ) : (
                          (data.name ? data.name.charAt(0).toUpperCase() : 'U')
                        )}
                      </div>
                      <div className="min-w-0 flex-1 space-y-2">
                        <div>
                          <p className="text-sm font-bold text-slate-900">Profile picture</p>
                          <p className="text-[11px] text-slate-500">Shown on your portfolio and dashboard. JPG or PNG.</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            type="file"
                            id="settings-photo-upload"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleUploadPhoto(file);
                              e.target.value = '';
                            }}
                          />
                          <label
                            htmlFor="settings-photo-upload"
                            className="cursor-pointer inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold border border-indigo-200 transition-colors"
                          >
                            <Upload className="w-3.5 h-3.5" />
                            {data.photoUrl ? 'Change photo' : 'Upload photo'}
                          </label>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold text-slate-500">First name</Label>
                        <Input
                          value={settingsFirstName}
                          onChange={(e) => {
                            setSettingsFirstName(e.target.value);
                            setSettingsDirty(true);
                          }}
                          placeholder="First name"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold text-slate-500">Last name</Label>
                        <Input
                          value={settingsLastName}
                          onChange={(e) => {
                            setSettingsLastName(e.target.value);
                            setSettingsDirty(true);
                          }}
                          placeholder="Last name"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs font-semibold text-slate-500">Pronouns</Label>
                      <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
                        {['She/Her', 'He/Him', 'They/Them', 'Prefer not to say'].map((option) => (
                          <button
                            key={option}
                            type="button"
                            onClick={() => {
                              setSettingsPronouns(option);
                              setSettingsDirty(true);
                            }}
                            className={cn(
                              'flex items-center justify-center sm:justify-start gap-1.5 px-3 sm:px-4 py-2 rounded-full border text-xs transition-all font-medium',
                              settingsPronouns === option
                                ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300',
                            )}
                          >
                            <CheckCircle2
                              className={cn(
                                'w-3.5 h-3.5 shrink-0',
                                settingsPronouns === option ? 'text-white' : 'text-slate-300',
                              )}
                            />
                            {option}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold text-slate-500">Nationality</Label>
                        <Input
                          value={settingsNationality}
                          onChange={(e) => {
                            setSettingsNationality(e.target.value);
                            setSettingsDirty(true);
                          }}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <Label className="text-xs font-semibold text-slate-500">Verified phone</Label>
                          {phoneIsVerified && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                              <BadgeCheck className="w-3 h-3" /> Verified
                            </span>
                          )}
                        </div>
                        <div className="flex h-12 w-full items-center rounded-xl border border-slate-100 bg-slate-50 px-4 text-sm font-medium tracking-wide text-slate-900">
                          {formatDisplayPhone(verifiedPhone)}
                        </div>
                        <p className="text-[11px] text-slate-400 leading-normal">
                          This is your login phone. Change it from account recovery / support if needed.
                        </p>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <Label className="text-xs font-semibold text-slate-500">Google account email</Label>
                        {hasGoogleAuth ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                            <BadgeCheck className="w-3 h-3" /> Linked
                          </span>
                        ) : googleAuthEmail ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 border border-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                            On file
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                            Not linked
                          </span>
                        )}
                      </div>
                      <div className="flex h-12 w-full items-center gap-2.5 rounded-xl border border-slate-100 bg-slate-50 px-4 text-sm text-slate-900">
                        <Mail className="w-4 h-4 text-slate-400 shrink-0" />
                        <span className={cn('truncate font-medium', !googleAuthEmail && 'text-slate-400 font-normal')}>
                          {googleAuthEmail || 'No Google email on this account yet'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 leading-normal">
                        {hasGoogleAuth
                          ? 'Signed in with Google. This email is used for receipts and account recovery.'
                          : googleAuthEmail
                            ? 'Email is saved on your account. Link Google from login if you want Google sign-in.'
                            : 'Connect Google on login to show your Google email here.'}
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-slate-500">Workspace Tier Plan</Label>
                      <div className="flex items-center justify-between h-12 w-full rounded-xl border border-slate-100 bg-slate-50 px-4 py-2 text-sm text-slate-700">
                        <span className="font-semibold capitalize text-slate-900">
                          {planName}
                        </span>
                        <span className="text-xs text-indigo-600 bg-indigo-50 px-2.5 py-0.5 rounded-full font-bold">
                          {data.isPremium ? 'Premium active' : 'Standard'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 leading-normal">
                        Workspace tier plans are securely managed via billing. You cannot change your subscription tier here.
                      </p>
                    </div>

                    <Button
                      onClick={handleSaveSettings}
                      disabled={isSettingsSaving || !settingsDirty}
                      className="h-10 text-xs px-4"
                    >
                      {isSettingsSaving ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
                          Saving…
                        </>
                      ) : (
                        'Save Settings'
                      )}
                    </Button>
                  </Card>

                  {/* Resume Manager — default resume toggle + store-only upload */}
                  <Card className="p-6 bg-white border border-slate-200 shadow-sm space-y-5">
                    <div>
                      <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                        <FileText className="w-4 h-4 text-indigo-500" /> Resume Manager
                      </h3>
                      <p className="text-slate-500 text-xs mt-0.5">
                        Choose which resume powers the Download Resume button on your live website.
                      </p>
                    </div>

                    {/* Default resume toggle */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <button
                        type="button"
                        disabled={isResumePrefSaving}
                        onClick={() => handleResumePreference('generated')}
                        className={cn(
                          "text-left p-4 rounded-xl border-2 transition-all",
                          (data.defaultResume || 'generated') === 'generated'
                            ? "border-indigo-500 bg-indigo-50/50 shadow-sm"
                            : "border-slate-200 bg-white hover:border-slate-300"
                        )}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-bold text-slate-900">System-generated</span>
                          {(data.defaultResume || 'generated') === 'generated' && (
                            <CheckCircle2 className="w-4 h-4 text-indigo-600" />
                          )}
                        </div>
                        <p className="text-xs text-slate-500 leading-snug">
                          ATS resume compiled from your live portfolio details. Always up to date with your latest updates.
                        </p>
                        {data.generatedResumeUrl && (
                          <a
                            href={data.generatedResumeUrl}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:underline mt-2"
                          >
                            Preview PDF <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </button>

                      <button
                        type="button"
                        disabled={isResumePrefSaving || !data.uploadedResumeUrl}
                        onClick={() => handleResumePreference('uploaded')}
                        className={cn(
                          "text-left p-4 rounded-xl border-2 transition-all",
                          data.defaultResume === 'uploaded'
                            ? "border-indigo-500 bg-indigo-50/50 shadow-sm"
                            : "border-slate-200 bg-white hover:border-slate-300",
                          !data.uploadedResumeUrl && "opacity-60"
                        )}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-bold text-slate-900">My uploaded resume</span>
                          {data.defaultResume === 'uploaded' && (
                            <CheckCircle2 className="w-4 h-4 text-indigo-600" />
                          )}
                        </div>
                        <p className="text-xs text-slate-500 leading-snug">
                          {data.uploadedResumeUrl
                            ? 'Your own PDF is served exactly as you uploaded it.'
                            : 'Upload a PDF below to enable this option.'}
                        </p>
                        {data.uploadedResumeUrl && (
                          <a
                            href={data.uploadedResumeUrl}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:underline mt-2"
                          >
                            Preview PDF <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </button>
                    </div>

                    {/* Upload / replace / remove */}
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-1 border-t border-slate-100 pt-4">
                      <input
                        type="file"
                        ref={resumeFileInputRef}
                        className="hidden"
                        accept="application/pdf"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleResumeFileUpload(file);
                          e.target.value = '';
                        }}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-9 text-xs"
                        disabled={isResumeFileUploading}
                        onClick={() => resumeFileInputRef.current?.click()}
                      >
                        {isResumeFileUploading ? (
                          <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                        ) : (
                          <Upload className="w-3.5 h-3.5 mr-1.5" />
                        )}
                        {data.uploadedResumeUrl ? 'Replace uploaded resume' : 'Upload resume (no AI parse)'}
                      </Button>
                      {data.uploadedResumeUrl && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-9 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={handleResumeFileRemove}
                        >
                          <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Remove uploaded resume
                        </Button>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 leading-normal">
                      Uploading here stores your file without using an AI parse credit. Uploaded resumes count towards your
                      storage; system-generated resumes are free.
                    </p>
                  </Card>
                  </div>
                )}

                {settingsSubTab === 'design' && (
                  <div className="space-y-6 animate-in fade-in duration-200">
                    {/* Theme + background — Pro layouts honor these */}
                    {PORTFOLIO_TEMPLATES.some((t) => t.id === activeTemplateId) && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Card className="p-6 bg-white border border-slate-200 shadow-sm space-y-4">
                          <div>
                            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                              <Palette className="w-4 h-4 text-indigo-500" /> Accent Color
                            </h3>
                            <p className="text-slate-500 text-xs mt-0.5">
                              Brand accent applied to buttons, labels, and glows on your live portfolio.
                            </p>
                          </div>
                          <div className="flex gap-2.5 pt-1">
                            {THEMES.map(theme => (
                              <button
                                key={theme.id}
                                type="button"
                                onClick={() => handleThemeSelect(theme.id)}
                                className={cn(
                                  "w-9 h-9 rounded-full flex items-center justify-center transition-all hover:scale-105 shadow-sm ring-offset-2",
                                  theme.hex,
                                  data.themeColor === theme.id ? "ring-2 ring-slate-900 scale-105" : ""
                                )}
                                title={theme.label}
                              >
                                {data.themeColor === theme.id && <Check className="w-4 h-4 text-white" />}
                              </button>
                            ))}
                          </div>
                        </Card>

                        <Card className="p-6 bg-white border border-slate-200 shadow-sm space-y-4">
                          <div>
                            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                              <Palette className="w-4 h-4 text-indigo-500" /> Background Style
                            </h3>
                            <p className="text-slate-500 text-xs mt-0.5">
                              Texture or gradient wash behind your portfolio hero and surfaces.
                            </p>
                          </div>
                          <div className="grid grid-cols-2 gap-2.5 pt-1">
                            {[
                              { id: 'grid', label: 'Clean Grid', desc: 'Subtle blueprint canvas' },
                              { id: 'dots', label: 'Minimalist Dots', desc: 'Clean dot matrix overlay' },
                              { id: 'waves', label: 'Abstract Waves', desc: 'Soft vector wave curves' },
                              { id: 'solid', label: 'Accent Gradient', desc: 'Vibrant color blend' },
                            ].map(bg => {
                              const isSelected = (data.themeBg || 'grid') === bg.id;
                              return (
                                <button
                                  key={bg.id}
                                  type="button"
                                  onClick={() => handleBgSelect(bg.id)}
                                  className={cn(
                                    "relative p-3 rounded-xl border text-left transition-all hover:scale-[1.01] flex flex-col justify-center min-h-[58px]",
                                    isSelected 
                                      ? "border-slate-950 bg-slate-950/5 ring-1 ring-slate-950" 
                                      : "border-slate-200 bg-white hover:border-slate-300"
                                  )}
                                >
                                  <p className="text-xs font-bold text-slate-950">{bg.label}</p>
                                  <p className="text-[9px] text-slate-500 leading-tight mt-0.5">{bg.desc}</p>
                                  {isSelected && (
                                    <span className="absolute top-2 right-2 w-3.5 h-3.5 rounded-full bg-slate-950 text-white flex items-center justify-center">
                                      <Check className="w-2 h-2" />
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </Card>
                      </div>
                    )}

                    {/* Visual Page Template + Live Preview — split layout */}
                    <div className="grid grid-cols-1 gap-5 items-stretch lg:grid-cols-12">
                      
                      {/* Template Selector */}
                      <Card className="p-5 bg-white border border-slate-200 shadow-sm space-y-4 lg:col-span-4 xl:col-span-3">
                        <div>
                          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                            <Layout className="w-4 h-4 text-indigo-500" /> Page Template
                          </h3>
                          <p className="text-slate-500 text-xs mt-0.5">
                            {data.isPremium 
                              ? "Choose a design layout. Live preview updates instantly."
                              : "Choose a layout. Upgrade to Pro to unlock premium templates."}
                          </p>
                        </div>

                        <div className="flex flex-col gap-3">
                          {TEMPLATES.map(tpl => {
                            const isSelected = activeTemplateId === tpl.id;
                            const accentBg = getThemeClass(true);
                            const isLocked = !data.isPremium && tpl.isPro;
                            return (
                              <div
                                key={tpl.id}
                                role="button"
                                tabIndex={0}
                                onClick={() => handleTemplateSelect(tpl.id)}
                                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleTemplateSelect(tpl.id); }}
                                className={cn(
                                  "group cursor-pointer text-left rounded-xl border-2 transition-all hover:shadow-md flex items-center gap-3 p-2.5 relative overflow-hidden",
                                  isSelected ? "border-indigo-600 bg-indigo-50/30 shadow-sm" : "border-slate-200 bg-white hover:border-slate-300"
                                )}
                              >
                                {/* Live mini preview of the real template */}
                                <div className="w-[124px] h-[84px] bg-slate-100 rounded-lg overflow-hidden border border-slate-200/60 shrink-0 relative flex flex-col shadow-inner">
                                  <div className="h-3.5 bg-slate-200 border-b border-slate-300 flex items-center px-1 gap-0.5 shrink-0">
                                    <span className="w-1 h-1 rounded-full bg-red-400" />
                                    <span className="w-1 h-1 rounded-full bg-yellow-400" />
                                    <span className="w-1 h-1 rounded-full bg-green-400" />
                                  </div>
                                  <div className="flex-1 relative">
                                    <TemplateThumbPreview
                                      templateId={tpl.id}
                                      width={124}
                                      height={70}
                                      fallback={
                                        <div className="w-full h-full p-1">
                                          {tpl.id === 'cura-futuri' && renderCreativeMockup(accentBg)}
                                          {tpl.id === 'sierra-montana' && renderAcademicMockup(accentBg)}
                                          {tpl.id === 'nico-palmer' && renderNicoMockup(accentBg)}
                                        </div>
                                      }
                                    />
                                  </div>
                                  {isLocked && (
                                    <div className="absolute inset-0 bg-slate-900/25 flex items-center justify-center">
                                      <Lock className="w-3.5 h-3.5 text-white" strokeWidth={2.5} />
                                    </div>
                                  )}
                                </div>

                                {/* Text */}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <h4 className="text-sm font-bold text-slate-900 capitalize">{tpl.name}</h4>
                                    {tpl.isPro && <span className="text-[9px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded uppercase tracking-wider">Pro</span>}
                                  </div>
                                  <p className="text-[11px] text-slate-400 leading-normal mt-0.5 line-clamp-2">{tpl.description}</p>
                                  {tpl.previewable ? (
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); setPreviewTemplateId(tpl.id); }}
                                      className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-bold text-indigo-600 hover:text-indigo-800 uppercase tracking-wider transition-colors"
                                    >
                                      <Eye className="w-3 h-3" /> Preview demo
                                    </button>
                                  ) : (
                                    <span className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-bold text-slate-300 uppercase tracking-wider">
                                      <Eye className="w-3 h-3" /> Preview coming soon
                                    </span>
                                  )}
                                </div>

                                {/* Selected indicator */}
                                {isSelected && !isLocked && (
                                  <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0" />
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {!data.isPremium && (
                          <div className="flex items-start gap-2.5 rounded-xl border border-indigo-100 bg-indigo-50/60 px-3.5 py-2.5">
                            <Crown className="w-4 h-4 text-indigo-500 mt-0.5 shrink-0" />
                            <p className="text-[11px] text-indigo-900 leading-relaxed">
                              Preview every Pro layout with the BEXO demo portfolio.
                              Publishing on a Pro template needs an active Pro plan.
                            </p>
                          </div>
                        )}

                        {/* Open portfolio link */}
                        <a
                          href={data.isPremium ? correctVisitUrl : pathPortfolioUrl(handleString)}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center justify-center gap-1.5 w-full py-2.5 rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-755 text-xs font-bold hover:bg-indigo-100 transition-colors mt-1"
                        >
                          <ExternalLink className="w-3.5 h-3.5" /> Open Live Portfolio
                        </a>
                      </Card>

                      {/* Right: Live iframe Preview */}
                      <div className="lg:col-span-8 xl:col-span-9 flex flex-col gap-2 min-w-0">
                        <div className="flex items-center justify-between px-1">
                          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Live Preview</span>
                          <span className="text-[11px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full font-medium truncate max-w-[55%]">
                            {demoPreviewHost}
                          </span>
                        </div>

                        {/* Browser chrome frame */}
                        <div className="rounded-2xl overflow-hidden border border-slate-200 shadow-lg bg-white">
                          {/* Browser top bar */}
                          <div className="h-9 bg-slate-100 border-b border-slate-200 flex items-center px-3 gap-2 shrink-0">
                            <div className="flex items-center gap-1.5">
                              <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
                              <span className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
                              <span className="w-2.5 h-2.5 rounded-full bg-green-400" />
                            </div>
                            <div className="flex-1 mx-2">
                              <div className="h-5 bg-white rounded-md border border-slate-200 flex items-center px-2.5 gap-1.5">
                                <Globe className="w-3 h-3 text-slate-400 shrink-0" />
                                <span className="text-[11px] text-slate-500 font-medium truncate">
                                  {demoPreviewHost}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Responsive scaled iframe */}
                          <div className="relative w-full overflow-hidden h-[400px] sm:h-[480px] md:h-[540px] lg:h-[min(68vh,720px)] xl:h-[min(72vh,820px)]">
                            <iframe
                              key={`${activeTemplateId}-${data.themeColor || 'indigo'}-${data.themeBg || 'grid'}-demo`}
                              src={getTemplatePreviewUrl(activeTemplateId, data.handle)}
                              title="Live Portfolio Preview"
                              className="absolute top-0 left-0 border-0 bg-white"
                              style={{
                                width: '200%',
                                height: '200%',
                                transform: 'scale(0.5)',
                                transformOrigin: 'top left',
                                pointerEvents: 'none'
                              }}
                              sandbox="allow-scripts allow-same-origin"
                            />
                          </div>
                        </div>

                        <p className="text-[11px] text-slate-400 text-center">
                          Template demos use the BEXO showcase portfolio at {demoPreviewHost}. Use Open Live Portfolio for your public URL.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {settingsSubTab === 'storage' && (() => {
                  // Server-side truth when loaded; falls back to local estimate
                  const srvUsed = assetsUsage?.used ?? usedStorage;
                  const srvQuota = assetsUsage?.quota ?? storageLimit;
                  const srvPct = srvQuota > 0 ? Math.min((srvUsed / srvQuota) * 100, 100) : 0;
                  const srvFull = srvUsed >= srvQuota;
                  const addonBlocks = assetsUsage?.addonBlocks ?? data.addonBlocks ?? 0;
                  const imageCount = assetsList.filter(a => /\.(png|jpe?g|gif|webp|svg|avif)(\?|$)/i.test(a.url || '')).length;
                  const pdfCount = assetsList.filter(a => /\.pdf(\?|$)/i.test(a.url || '')).length;
                  const otherCount = Math.max(0, assetsList.length - imageCount - pdfCount);
                  const fmtMb = (b: number) => `${(b / 1024 / 1024).toFixed(1)}MB`;
                  return (
                  <Card className="p-6 bg-white border border-slate-200 shadow-sm space-y-6 animate-in fade-in duration-200">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                          <FileText className="w-4 h-4 text-indigo-500" /> Cloud Storage
                        </h3>
                        <p className="text-slate-500 text-xs mt-0.5">Live server usage across every file in your workspace.</p>
                      </div>
                      <Button variant="outline" size="sm" className="h-8 text-xs shrink-0" onClick={() => loadAssets()} disabled={assetsLoading}>
                        {assetsLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Refresh'}
                      </Button>
                    </div>

                    <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 space-y-4">
                      <div>
                        <div className="flex justify-between items-center mb-1.5 text-xs font-bold text-slate-700">
                          <span>Usage Details</span>
                          <span className="tabular-nums">{fmtMb(srvUsed)} / {(srvQuota / 1024 / 1024).toFixed(0)}MB</span>
                        </div>
                        <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden">
                          <div 
                            className={cn(
                              "h-full rounded-full transition-all duration-500",
                              srvFull ? "bg-red-500" : srvPct >= 85 ? "bg-amber-500" : "bg-indigo-600",
                            )}
                            style={{ width: `${srvPct}%` }}
                          />
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1.5">
                          {srvFull
                            ? 'Storage full — uploads are blocked until you free space or add storage.'
                            : `${fmtMb(Math.max(0, srvQuota - srvUsed))} free of your ${(srvQuota / 1024 / 1024).toFixed(0)}MB plan capacity.`}
                          {addonBlocks > 0 && ` Includes ${addonBlocks} add-on block${addonBlocks === 1 ? '' : 's'} (+${addonBlocks * 50}MB).`}
                        </p>
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        <div className="rounded-xl bg-white border border-slate-100 p-3 text-center">
                          <p className="text-lg font-bold text-slate-900 tabular-nums">{assetsLoading ? '—' : imageCount}</p>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Images</p>
                        </div>
                        <div className="rounded-xl bg-white border border-slate-100 p-3 text-center">
                          <p className="text-lg font-bold text-slate-900 tabular-nums">{assetsLoading ? '—' : pdfCount}</p>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">PDFs</p>
                        </div>
                        <div className="rounded-xl bg-white border border-slate-100 p-3 text-center">
                          <p className="text-lg font-bold text-slate-900 tabular-nums">{assetsLoading ? '—' : otherCount}</p>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Other</p>
                        </div>
                      </div>

                      <p className="text-[11px] text-slate-400">
                        System-generated resumes are free and never count against your storage.
                      </p>
                      
                      <div className="flex flex-col sm:flex-row gap-3 pt-1">
                        <Button
                          onClick={() => { goView('settings', { settingsTab: 'assets' }); loadAssets(); }}
                          size="sm"
                          variant="outline"
                          className="h-10 text-xs px-4 flex-1"
                        >
                          <ImageIcon className="w-3.5 h-3.5 mr-1.5" /> View & manage files
                        </Button>
                        {data.isPremium ? (
                          <Button 
                            onClick={openBilling}
                            size="sm" 
                            className="h-10 text-xs px-4 bg-indigo-50 text-indigo-900 hover:bg-indigo-100 flex-1 border border-indigo-200 shadow-none"
                          >
                            {srvPct >= 85 ? 'Add +50MB storage' : 'Manage Billing'}
                          </Button>
                        ) : (
                          <Button 
                            onClick={openBilling}
                            size="sm" 
                            className="h-10 text-xs px-4 bg-indigo-600 text-white hover:bg-indigo-700 flex-1 border-none shadow-md font-semibold"
                          >
                            Upgrade for more storage
                          </Button>
                        )}
                      </div>
                    </div>
                  </Card>
                  );
                })()}

                {settingsSubTab === 'assets' && (() => {
                  const fmtSize = (bytes: number) => {
                    if (!bytes || bytes <= 0) return '—';
                    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
                    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
                  };
                  const used = assetsUsage?.used ?? usedStorage;
                  const quota = assetsUsage?.quota ?? storageLimit;
                  const pct = Math.min((used / Math.max(quota, 1)) * 100, 100);
                  const isImage = (a: any) => /\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(a.url || '') || (a.name || '').match(/\.(png|jpe?g|gif|webp|svg)$/i);
                  return (
                  <Card className="p-6 bg-white border border-slate-200 shadow-sm space-y-6 animate-in fade-in duration-200">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div>
                        <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                          <ImageIcon className="w-4 h-4 text-indigo-500" /> Assets & Storage
                        </h3>
                        <p className="text-slate-500 text-xs mt-0.5">
                          Every file in your account — deleting here frees storage instantly.
                        </p>
                      </div>
                      <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => loadAssets()} disabled={assetsLoading}>
                        {assetsLoading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : null}
                        Refresh
                      </Button>
                    </div>

                    {/* Server-side usage meter */}
                    <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 space-y-2">
                      <div className="flex justify-between items-center text-xs font-semibold text-slate-700">
                        <span>Cloud storage used</span>
                        <span className="tabular-nums">{(used / 1024 / 1024).toFixed(1)} / {(quota / 1024 / 1024).toFixed(0)} MB</span>
                      </div>
                      <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className={cn("h-full rounded-full transition-all duration-500", pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-indigo-600")}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between flex-wrap gap-2 pt-1">
                        <p className="text-[11px] text-slate-400">
                          {assetsUsage?.addonBlocks
                            ? `Includes ${assetsUsage.addonBlocks} storage add-on block(s) (+${assetsUsage.addonBlocks * 50}MB).`
                            : 'System-generated resumes never count against storage.'}
                        </p>
                        {data.isPremium && (
                          <button onClick={openBilling} className="text-[11px] font-bold text-indigo-600 hover:underline">
                            Need more space? Add 50MB for ₹25/mo →
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Asset list */}
                    {assetsLoading && assetsList.length === 0 ? (
                      <div className="py-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-slate-300" /></div>
                    ) : assetsList.length === 0 ? (
                      <div className="text-center py-10 rounded-2xl bg-slate-50/50 border border-dashed border-slate-200">
                        <p className="text-sm text-slate-400 font-medium">No assets uploaded yet.</p>
                        <p className="text-xs text-slate-400 mt-1">Files you attach to projects, certificates, and updates will appear here.</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-100">
                        {assetsList.map((asset: any) => (
                          <div key={asset.id} className="py-3 flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg border border-slate-200 bg-slate-50 overflow-hidden flex items-center justify-center shrink-0">
                              {isImage(asset) ? (
                                <img src={asset.url} alt={asset.name} className="w-full h-full object-cover" loading="lazy" />
                              ) : (
                                <FileText className="w-4 h-4 text-slate-400" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <a href={asset.url} target="_blank" rel="noreferrer" className="text-xs font-semibold text-slate-800 hover:text-indigo-600 hover:underline truncate block">
                                {asset.name || 'file'}
                              </a>
                              <p className="text-[11px] text-slate-400 truncate">
                                {fmtSize(Number(asset.sizeBytes))}{asset.sectionType ? ` · ${asset.sectionType}` : ''}{asset.createdAt ? ` · ${new Date(asset.createdAt).toLocaleDateString()}` : ''}
                              </p>
                            </div>
                            <button
                              type="button"
                              disabled={deletingAssetId === asset.id}
                              onClick={() => handleDeleteAssetRow(asset)}
                              className="p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0"
                              title="Delete asset"
                            >
                              {deletingAssetId === asset.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>
                  );
                })()}

                {settingsSubTab === 'billing' && (
                  <div className="space-y-5 animate-in fade-in duration-200">
                    {/* Current plan + validity */}
                    <Card className="p-6 bg-white border border-slate-200 shadow-sm">
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                        <div>
                          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                            <Crown className="w-4 h-4 text-indigo-500" /> {planName}
                          </h3>
                          <p className="text-slate-500 text-xs mt-1">
                            {isLifetimePlan
                              ? 'Lifetime access — one-time payment, never expires.'
                              : billingStatus?.expiresAt
                                ? `${(billingStatus?.autopay ?? billingStatus?.subscription?.autopay) && !billingStatus?.cancelAtPeriodEnd ? 'Renews automatically on' : 'Valid until'} ${new Date(billingStatus.expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}${billingStatus?.billingPeriod === 'monthly' ? ' (monthly billing)' : billingStatus?.billingPeriod === 'yearly' ? ' (yearly billing)' : ''}.`
                                : 'Free plan — upgrade anytime for a subdomain, premium templates, and more storage.'}
                          </p>
                          <div className="flex flex-wrap items-center gap-2 mt-3">
                            {!isLifetimePlan && (billingStatus?.autopay ?? billingStatus?.subscription?.autopay) && !billingStatus?.cancelAtPeriodEnd && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-bold">
                                <CheckCircle2 className="w-3 h-3" /> Auto-renew on
                              </span>
                            )}
                            {!isLifetimePlan && billingStatus?.cancelAtPeriodEnd && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-[11px] font-bold">
                                Auto-renew off
                              </span>
                            )}
                            {(billingStatus?.addonBlocks || 0) > 0 && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 text-[11px] font-bold">
                                <Database className="w-3 h-3" /> +{(billingStatus?.addonBlocks || 0) * 50}MB storage add-on
                              </span>
                            )}
                            {billingStatus?.limits && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-50 border border-slate-200 text-slate-600 text-[11px] font-bold">
                                {billingStatus.limits.parsesPerMonth} parses · {billingStatus.limits.updatesPerMonth} updates /mo
                              </span>
                            )}
                          </div>
                        </div>
                        <Button variant="outline" size="sm" onClick={openBilling} className="shrink-0 gap-1.5">
                          <CreditCard className="w-3.5 h-3.5" /> {data.isPremium ? 'Manage plan & storage' : 'Upgrade plan'}
                        </Button>
                      </div>
                    </Card>

                    <Card className="p-6 bg-white border border-slate-200 shadow-sm space-y-6">
                    <div>
                      <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                        <CreditCard className="w-4 h-4 text-indigo-500" /> Billing History & Invoices
                      </h3>
                      <p className="text-slate-500 text-xs mt-0.5">Access and download tax invoices for your Bexo payments.</p>
                    </div>

                    <div className="space-y-4">
                      {data.payments && data.payments.length > 0 ? (
                        <div className="divide-y divide-slate-100">
                          {data.payments.map((payment: any) => {
                            const dateStr = new Date(payment.createdAt).toLocaleDateString('en-IN', {
                              day: 'numeric',
                              month: 'long',
                              year: 'numeric'
                            });
                            const planLabel = payment.plan === 'storage_addon'
                              ? 'Storage Increase (monthly add-on)'
                              : `${PLAN_DISPLAY_NAMES[payment.plan] || 'Pro'} Plan${payment.kind === 'subscription' ? ' (Auto-renew)' : payment.plan === 'studentplus' || payment.plan === 'lifetime' ? ' (Lifetime)' : ''}`;
                            return (
                              <div key={payment.id} className="py-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                                <div>
                                  <p className="text-sm font-semibold text-slate-900">
                                    Bexo {planLabel}
                                  </p>
                                  <p className="text-xs text-slate-500 mt-0.5">
                                    Paid on {dateStr}  |  Ref: <span className="font-mono text-slate-400">{payment.razorpayOrderId || payment.razorpaySubscriptionId || payment.razorpayPaymentId}</span>
                                  </p>
                                </div>
                                <div className="flex items-center justify-between sm:justify-end gap-4 w-full sm:w-auto">
                                  <span className="text-sm font-bold text-slate-900">
                                    ₹{(payment.amount / 100).toLocaleString('en-IN')}
                                  </span>
                                  {payment.invoiceUrl ? (
                                    <a 
                                      href={payment.invoiceUrl} 
                                      target="_blank" 
                                      rel="noreferrer" 
                                      className="text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100/70 px-3 py-1.5 rounded-lg border border-indigo-100 transition-colors flex items-center gap-1.5 shrink-0 select-none"
                                    >
                                      <FileText className="w-3.5 h-3.5" /> Download Invoice
                                    </a>
                                  ) : (
                                    <span className="text-xs text-slate-400 font-medium italic">Invoice generating...</span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="text-center py-10 rounded-2xl bg-slate-50/50 border border-dashed border-slate-200">
                          <p className="text-sm text-slate-400 font-medium">No payment history found.</p>
                        </div>
                      )}
                    </div>
                    </Card>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        {showCompletionModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-lg rounded-2xl border border-slate-200 shadow-2xl p-6 relative flex flex-col max-h-[min(90dvh,100%)]">
              <button 
                onClick={() => setShowCompletionModal(false)}
                className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 transition-colors p-1"
              >
                <X className="w-5 h-5" />
              </button>
              
              <div className="mb-5">
                <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-indigo-500" /> Portfolio readiness
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  {completionScore >= 100
                    ? 'You’re at 100%. Keep your portfolio updated.'
                    : `You’re at ${completionScore}%. Fix the items below to reach 100%.`}
                </p>
              </div>

              {/* Progress */}
              <div className="mb-5 bg-slate-50 border border-slate-100 p-4 rounded-xl">
                <div className="flex justify-between items-center text-xs font-semibold text-slate-700 mb-2">
                  <span>Completion Status</span>
                  <span>{completionScore}%</span>
                </div>
                <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-indigo-500 to-indigo-700 rounded-full transition-all duration-500" 
                    style={{ width: `${completionScore}%` }} 
                  />
                </div>
              </div>

              {missingReadiness.length > 0 && (
                <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50/80 p-3.5 space-y-2.5">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-amber-700">
                    Missing for 100% · {missingReadiness.reduce((s, i) => s + i.points, 0)} pts
                  </p>
                  {missingReadiness.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-start justify-between gap-3 rounded-lg bg-white/90 border border-amber-100 px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-900">
                          {item.label}{' '}
                          <span className="font-semibold text-amber-700">+{item.points}%</span>
                        </p>
                        <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">{item.hint}</p>
                      </div>
                      <Button
                        size="sm"
                        className="h-8 text-[11px] px-2.5 shrink-0"
                        onClick={item.onFix}
                      >
                        {item.actionLabel}
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {/* List of sections */}
              <div className="space-y-4 overflow-y-auto pr-1 flex-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">All checklist items</p>
                  <div className="border border-slate-100 rounded-xl p-4 bg-white shadow-sm flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {data.photoUrl ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
                      )}
                      <span className="text-xs font-bold text-slate-800">Profile Picture</span>
                    </div>
                    {data.photoUrl && (
                      <span className="text-[10px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full font-semibold">Done</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {data.photoUrl && (
                      <div className="w-12 h-12 rounded-full overflow-hidden border border-slate-200 shrink-0">
                        <img src={data.photoUrl} alt="Profile" className="w-full h-full object-cover" />
                      </div>
                    )}
                    <input
                      type="file"
                      id="modal-photo-upload"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleUploadPhoto(file);
                        e.target.value = '';
                      }}
                    />
                    <label
                      htmlFor="modal-photo-upload"
                      className="cursor-pointer inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold border border-indigo-200 transition-colors"
                    >
                      <Upload className="w-3.5 h-3.5" /> {data.photoUrl ? 'Change Photo' : 'Select Photo'}
                    </label>
                    <span className="text-[10px] text-slate-400">Supported formats: JPG, PNG</span>
                  </div>
                </div>

                {/* 2. Resume PDF */}
                <div className="border border-slate-100 rounded-xl p-4 bg-white shadow-sm flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {hasResume ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
                      )}
                      <span className="text-xs font-bold text-slate-800">PDF Resume</span>
                    </div>
                    {hasResume && (
                      <span className="text-[10px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full font-semibold truncate max-w-[150px]">
                        {resumeDoneLabel}
                      </span>
                    )}
                  </div>
                  {!hasResume && (
                    <div className="flex flex-col gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <input 
                          type="file" 
                          id="modal-resume-upload" 
                          accept="application/pdf"
                          className="hidden" 
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleUploadResume(file);
                          }}
                        />
                        <label 
                          htmlFor="modal-resume-upload"
                          className="cursor-pointer inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold border border-indigo-200 transition-colors"
                        >
                          <Upload className="w-3.5 h-3.5" /> Upload PDF
                        </label>
                        <button
                          type="button"
                          disabled={isModalGeneratingResume}
                          onClick={handleModalGenerateResume}
                          className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors disabled:opacity-60"
                        >
                          {isModalGeneratingResume ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Sparkles className="w-3.5 h-3.5" />
                          )}
                          {isModalGeneratingResume ? 'Generating…' : 'Generate from profile'}
                        </button>
                      </div>
                      <span className="text-[10px] text-slate-400">Upload your own PDF, or let BEXO compile an ATS resume from your portfolio details.</span>
                    </div>
                  )}
                </div>

                {/* 3. About / Bio */}
                <div className="border border-slate-100 rounded-xl p-4 bg-white shadow-sm flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {data.aboutEntries && data.aboutEntries.length > 0 ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
                      )}
                      <span className="text-xs font-bold text-slate-855">Biography / About Me</span>
                    </div>
                    {data.aboutEntries && data.aboutEntries.length > 0 && (
                      <span className="text-[10px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full font-semibold">Done</span>
                    )}
                  </div>
                  {(!data.aboutEntries || data.aboutEntries.length === 0) && (
                    <div className="space-y-2">
                      <textarea
                        id="modal-bio-text"
                        placeholder="Introduce yourself, write a short bio..."
                        className="w-full h-20 rounded-lg border border-slate-200 p-2 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                      <Button 
                        size="sm" 
                        className="h-8 text-[11px] px-3 font-semibold"
                        onClick={() => {
                          const text = (document.getElementById('modal-bio-text') as HTMLTextAreaElement)?.value?.trim();
                          if (text) {
                            const newAbout = {
                              id: `about-${Date.now()}`,
                              title: 'Professional Bio',
                              description: text,
                              currentStatus: 'Active'
                            };
                            updateData({ aboutEntries: [newAbout] });
                            toast({ title: "Bio Saved", description: "About me section updated." });
                          }
                        }}
                      >
                        Save Bio
                      </Button>
                    </div>
                  )}
                </div>

                {/* 4. Contact Email */}
                <div className="border border-slate-100 rounded-xl p-4 bg-white shadow-sm flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {data.contactData?.email ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
                      )}
                      <span className="text-xs font-bold text-slate-855">Contact Email</span>
                    </div>
                    {data.contactData?.email && (
                      <span className="text-[10px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full font-semibold">
                        {data.contactData.email}
                      </span>
                    )}
                  </div>
                  {!data.contactData?.email && (
                    <div className="flex gap-2">
                      <Input
                        id="modal-email-input"
                        type="email"
                        placeholder="email@example.com"
                        className="h-9 text-xs rounded-lg flex-1"
                      />
                      <Button 
                        size="sm" 
                        className="h-9 text-xs px-3 font-semibold"
                        onClick={() => {
                          const email = (document.getElementById('modal-email-input') as HTMLInputElement)?.value?.trim();
                          if (email) {
                            updateData({ contactData: { ...data.contactData, email } });
                            toast({ title: "Email Saved", description: "Contact email updated." });
                          }
                        }}
                      >
                        Save
                      </Button>
                    </div>
                  )}
                </div>

                {/* 5. Education & Projects redirects */}
                {(!data.educationEntries || data.educationEntries.length === 0
                  || !data.projectEntries || data.projectEntries.length === 0
                  || !data.experienceEntries || data.experienceEntries.length === 0
                  || !data.skillEntries || data.skillEntries.length < 3) && (
                  <div className="border border-slate-100 rounded-xl p-4 bg-slate-50 flex flex-col gap-2.5">
                    <p className="text-[11px] text-slate-500 font-medium">Jump to the profile editor for sections that need more detail.</p>
                    <div className="flex flex-wrap gap-2">
                      {(!data.educationEntries || data.educationEntries.length === 0) && (
                        <Button 
                          size="sm" 
                          className="h-8 text-[11px] px-3 bg-white border border-slate-200 text-slate-800 hover:bg-slate-50 shadow-none"
                          onClick={() => {
                            goView('edit-profile');
                            setActiveEditorTab('education');
                            setShowCompletionModal(false);
                            setTimeout(() => handleAdd(), 0);
                          }}
                        >
                          Add Education
                        </Button>
                      )}
                      {(!data.projectEntries || data.projectEntries.length === 0) && (
                        <Button 
                          size="sm" 
                          className="h-8 text-[11px] px-3 bg-white border border-slate-200 text-slate-800 hover:bg-slate-50 shadow-none"
                          onClick={() => {
                            goView('edit-profile');
                            setActiveEditorTab('projects');
                            setShowCompletionModal(false);
                            setTimeout(() => handleAdd(), 0);
                          }}
                        >
                          Add Project
                        </Button>
                      )}
                      {(!data.experienceEntries || data.experienceEntries.length === 0) && (
                        <Button 
                          size="sm" 
                          className="h-8 text-[11px] px-3 bg-white border border-slate-200 text-slate-800 hover:bg-slate-50 shadow-none"
                          onClick={() => {
                            goView('edit-profile');
                            setActiveEditorTab('experience');
                            setShowCompletionModal(false);
                            setTimeout(() => handleAdd(), 0);
                          }}
                        >
                          Add Experience
                        </Button>
                      )}
                      {(!data.skillEntries || data.skillEntries.length < 3) && (
                        <Button 
                          size="sm" 
                          className="h-8 text-[11px] px-3 bg-white border border-slate-200 text-slate-800 hover:bg-slate-50 shadow-none"
                          onClick={() => {
                            goView('updates', { updatesTab: 'post' });
                            setUpdateCategory('skill');
                            setShowCompletionModal(false);
                          }}
                        >
                          Post Skills ({data.skillEntries?.length || 0}/3)
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-5 border-t border-slate-150 pt-4 flex justify-end">
                <Button 
                  size="sm" 
                  className="h-9 text-xs px-4"
                  onClick={() => setShowCompletionModal(false)}
                >
                  Close Window
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Floating Action Button */}
        <div
          ref={fabRef}
          className="fixed z-50 flex flex-col items-end gap-3 animate-in slide-in-from-bottom-8 fade-in duration-300 right-3 sm:right-6 bottom-[max(1rem,env(safe-area-inset-bottom))] sm:bottom-6"
        >
          {showFabMenu && (
            <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden flex flex-col w-[min(14rem,calc(100vw-1.5rem))] animate-in slide-in-from-bottom-4 fade-in duration-200 origin-bottom-right">
              {currentView === 'edit-profile' &&
                !['about', 'contact', 'skills'].includes(activeEditorTab) && (
                <button
                  onClick={() => {
                    setShowFabMenu(false);
                    handleAdd();
                  }}
                  className="flex items-center gap-3 p-3 w-full hover:bg-slate-50 transition-colors group border-b border-slate-100"
                >
                  <div className="w-10 h-10 rounded-full bg-slate-900 text-white flex items-center justify-center group-hover:scale-105 transition-all shrink-0">
                    <Plus className="w-5 h-5" />
                  </div>
                  <div className="text-left min-w-0">
                    <div className="font-semibold text-sm text-slate-900">Add to {activeEditorTab}</div>
                    <div className="text-[10px] text-slate-500 font-normal leading-tight">Uses 1 update credit</div>
                  </div>
                </button>
              )}

                <button 
                  onClick={() => {
                    setShowFabMenu(false);
                    goView('updates', { updatesTab: 'post' });
                  }}
                  className="flex items-center gap-3 p-3 w-full hover:bg-slate-50 transition-colors group border-b border-slate-100"
                >
                  <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center group-hover:bg-emerald-100 group-hover:scale-105 transition-all shrink-0">
                    <Plus className="w-5 h-5" />
                  </div>
                  <div className="text-left min-w-0">
                    <div className="font-semibold text-sm text-slate-900 group-hover:text-emerald-600 transition-colors">Post an Update</div>
                    <div className="text-[10px] text-slate-500 font-normal leading-tight">Primary — achievements, skills & more</div>
                  </div>
                </button>
              <button 
                  onClick={() => {
                    setShowFabMenu(false);
                    goView('updates', { updatesTab: 'parse' });
                  }}
                  className="flex items-center gap-3 p-3 w-full hover:bg-slate-50 transition-colors group"
                >
                  <div className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center group-hover:bg-indigo-100 group-hover:scale-105 transition-all shrink-0">
                    <UploadCloud className="w-5 h-5" />
                  </div>
                  <div className="text-left min-w-0">
                    <div className="font-semibold text-sm text-slate-900 group-hover:text-indigo-600 transition-colors">Parse My Resume</div>
                    <div className="text-[10px] text-slate-500 font-normal leading-tight">Secondary — AI auto-fill</div>
                  </div>
                </button>
            </div>
          )}

          <button
            onClick={() => setShowFabMenu(!showFabMenu)}
            className="w-12 h-12 sm:w-14 sm:h-14 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full flex items-center justify-center shadow-[0_8px_30px_rgb(0,0,0,0.12)] hover:shadow-[0_8px_30px_rgb(79,70,229,0.3)] transition-all duration-300 active:scale-95 hover:scale-105"
            aria-label={showFabMenu ? "Close quick actions" : "Open quick actions"}
          >
            {showFabMenu ? <X className="w-5 h-5 sm:w-6 sm:h-6" /> : <Plus className="w-5 h-5 sm:w-6 sm:h-6" />}
          </button>
        </div>


      </main>

      {/* Instant In-Browser Asset Preview Modal */}
      <AssetPreviewModal target={previewTarget} onClose={() => setPreviewTarget(null)} />

      {/* Fullscreen template preview — free users see Pro templates with their own live data */}
      {previewTemplateId && (() => {
        const tpl = TEMPLATES.find(t => t.id === previewTemplateId);
        if (!tpl) return null;
        const isLockedPreview = tpl.isPro && !data.isPremium;
        return createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-0 md:p-6 animate-in fade-in duration-200">
            <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setPreviewTemplateId(null)} />
            <div className="bg-slate-100 w-full h-[100dvh] md:h-[90vh] max-w-6xl md:rounded-2xl shadow-2xl relative flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
              {/* Chrome bar */}
              <div className="bg-white border-b border-slate-200 px-4 py-3 flex justify-between items-center shrink-0 gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="hidden md:flex items-center gap-1.5 shrink-0">
                    <span className="w-3 h-3 rounded-full bg-red-400" />
                    <span className="w-3 h-3 rounded-full bg-amber-400" />
                    <span className="w-3 h-3 rounded-full bg-green-400" />
                  </div>
                  <span className="md:ml-3 text-sm font-bold text-slate-900 truncate">{tpl.name}</span>
                  {tpl.isPro && (
                    <span className="text-[9px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded uppercase tracking-wider shrink-0">Pro</span>
                  )}
                  <span className="hidden sm:inline text-[11px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full font-medium truncate">
                    {demoPreviewHost}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setPreviewTemplateId(null)}
                  className="w-9 h-9 rounded-full flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors shrink-0"
                  aria-label="Close preview"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Iframe */}
              <div className="flex-1 w-full relative bg-white">
                <iframe
                  src={getTemplatePreviewUrl(tpl.id, data.handle)}
                  title={`${tpl.name} preview`}
                  className="w-full h-full border-0 bg-white"
                  allow="clipboard-write"
                />
              </div>

              {/* Bottom action bar */}
              <div className="bg-white border-t border-slate-200 px-4 py-3 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 shrink-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                {isLockedPreview ? (
                  <>
                    <p className="text-xs text-slate-500 leading-snug flex items-center gap-2">
                      <Crown className="w-4 h-4 text-indigo-500 shrink-0" />
                      Previewing the BEXO demo portfolio. Upgrade to Pro to publish this layout as yours.
                    </p>
                    <Button
                      onClick={() => { setPreviewTemplateId(null); openBilling(); }}
                      className="h-10 px-5 text-sm font-bold bg-indigo-600 hover:bg-indigo-700 shrink-0"
                    >
                      <Crown className="w-4 h-4 mr-2" /> Upgrade to use this template
                    </Button>
                  </>
                ) : (
                  <>
                    <p className="text-xs text-slate-500 leading-snug">
                      Demo layout at {demoPreviewHost}. Select a template to apply it to your portfolio.
                    </p>
                    {activeTemplateId !== tpl.id && (
                      <Button
                        onClick={() => { handleTemplateSelect(tpl.id); setPreviewTemplateId(null); }}
                        className="h-10 px-5 text-sm font-bold shrink-0"
                      >
                        <CheckCircle2 className="w-4 h-4 mr-2" /> Use this template
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>,
          document.body
        );
      })()}
    </div>
  );
}
