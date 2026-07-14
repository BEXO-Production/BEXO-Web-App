import React, { useState, useEffect, useRef } from 'react';
import { useOnboarding, AssetMode, AssetData, FileAsset, LinkAsset } from '../context/OnboardingContext';
import { Card, Button, Input, Label } from '../design-system/primitives';
import { useToast } from '../hooks/use-toast';
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
  CreditCard,
  CalendarClock,
  Crown,
  Share2
} from 'lucide-react';
import { cn } from '../design-system/primitives';
import logo from '../assets/bexo-logo.png';
import { supabase } from '../lib/supabase';

const TABS = [
  { id: 'about', label: 'About' },
  { id: 'education', label: 'Education' },
  { id: 'experience', label: 'Experience' },
  { id: 'projects', label: 'Projects' },
  { id: 'certificates', label: 'Certificates' },
  { id: 'achievements', label: 'Achievements' },
  { id: 'research', label: 'Research' },
  { id: 'contact', label: 'Contact' }
];

const THEMES = [
  { id: 'blue', label: 'Navy', hex: 'bg-blue-600', textHex: 'text-blue-600' },
  { id: 'emerald', label: 'Emerald', hex: 'bg-emerald-600', textHex: 'text-emerald-600' },
  { id: 'rose', label: 'Rose', hex: 'bg-rose-600', textHex: 'text-rose-600' },
  { id: 'violet', label: 'Violet', hex: 'bg-violet-600', textHex: 'text-violet-600' },
];

const TEMPLATES = [
  {
    id: 'minimal',
    name: 'Minimal',
    description: 'Clean, typography-driven layout perfect for developers.',
  },
  {
    id: 'academic',
    name: 'Academic',
    description: 'Traditional structure, emphasizes research and papers.',
  },
  {
    id: 'creative',
    name: 'Creative',
    description: 'Bold colors and unique grid layouts for designers.',
  }
];

type BillingStatus = {
  plan: 'annual' | 'lifetime' | null;
  status: 'free' | 'active' | 'expired';
  isPremium: boolean;
  expiresAt: string | null;
  storageQuotaBytes: number;
  latestPayment?: {
    amount: number;
    status: string;
    createdAt: string;
  } | null;
};

export default function Dashboard() {
  const { data, updateData, setToken } = useOnboarding();
  const { toast } = useToast();
  const [currentView, setCurrentView] = useState<'overview' | 'edit-profile' | 'resume' | 'settings'>('overview');
  const [settingsSubTab, setSettingsSubTab] = useState<'profile' | 'design' | 'storage' | 'billing'>('profile');
  const [showLoginToast, setShowLoginToast] = useState(false);

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
        updateData({ 
          resumeUrl: result.url,
          resumeFileName: file.name,
          resumeFileSize: file.size
        });
        toast({ title: "Resume Updated", description: "Resume uploaded successfully." });
      }
    } catch (err) {
      console.error(err);
      toast({ title: "Upload Failed", description: "Failed to upload resume.", variant: "destructive" });
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

  // URL management
  const handleString = data.handle || (data.name ? data.name.toLowerCase().replace(/[^a-z0-9]/g, '') : 'portfolio');
  const url = data.isPremium 
    ? `${handleString}.mybexo.com` 
    : `mybexo.com/${handleString}`;
  const [copied, setCopied] = useState(false);

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
      updateData({
        plan: result.plan,
        isPremium: result.isPremium,
        storageQuotaBytes: result.storageQuotaBytes,
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
    window.location.href = '/billing';
  };

  // Compute profile completion percentage
  const calculateCompletion = () => {
    let score = 0;
    if (data.name) score += 10;
    if (data.phone) score += 10;
    if (data.photoUrl) score += 10;
    if (data.resumeFileName) score += 20;
    if (data.aboutEntries && data.aboutEntries.length > 0) score += 10;
    if (data.educationEntries && data.educationEntries.length > 0) score += 10;
    if (data.experienceEntries && data.experienceEntries.length > 0) score += 10;
    if (data.projectEntries && data.projectEntries.length > 0) score += 10;
    if (data.contactData?.email) score += 10;
    return score;
  };

  const completionScore = calculateCompletion();
  const planName = billingStatus?.plan === 'lifetime'
    ? 'Lifetime Pro'
    : billingStatus?.plan === 'annual'
      ? 'Annual Pro'
      : data.isPremium
        ? 'Pro'
        : 'Free';
  const planRenewal = billingStatus?.expiresAt
    ? new Date(billingStatus.expiresAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
    : billingStatus?.plan === 'lifetime'
      ? 'Never expires'
      : 'Upgrade available';
  const totalEntries = [
    data.aboutEntries,
    data.educationEntries,
    data.experienceEntries,
    data.projectEntries,
    data.certificateEntries,
    data.achievementEntries,
    data.researchEntries
  ].reduce((sum, entries) => sum + (entries?.length || 0), 0);
  const nextAction = completionScore < 90
    ? { label: 'Complete portfolio', detail: 'Add the missing profile sections before sharing widely.', action: () => setShowCompletionModal(true), icon: CheckCircle2 }
    : !data.resumeFileName
      ? { label: 'Attach resume', detail: 'A resume improves the downloadable version and future parsing.', action: () => setCurrentView('resume'), icon: FileText }
      : !data.isPremium
        ? { label: 'Unlock Pro publishing', detail: 'Move to custom subdomain, premium templates, and 50MB storage.', action: openBilling, icon: Crown }
        : { label: 'Review live portfolio', detail: 'Your public page is ready for recruiters and applications.', action: () => window.open(`https://${url}`, '_blank', 'noopener,noreferrer'), icon: ExternalLink };
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
  const [sections, setSections] = useState({
    about: data.aboutEntries || [],
    education: data.educationEntries || [],
    experience: data.experienceEntries || [],
    projects: data.projectEntries || [],
    certificates: data.certificateEntries || [],
    achievements: data.achievementEntries || [],
    research: data.researchEntries || [],
  });
  const [contactData, setContactData] = useState(data.contactData || { email: '', phone: '', linkedin: '', github: '', portfolio: '' });
  const [editingId, setEditingId] = useState<string | null>(null);
  const isNewEntry = editingId !== null && !sections[activeEditorTab as keyof typeof sections]?.some((e: any) => e.id === editingId);
  const [editForm, setEditForm] = useState<any>({});
  const [contactErrors, setContactErrors] = useState<any>({});

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

  const handleDelete = (id: string) => {
    const updated = {
      ...sections,
      [activeEditorTab]: sections[activeEditorTab as keyof typeof sections].filter((e: any) => e.id !== id)
    };
    setSections(updated);
    updateContextSections(updated);
    toast({
      title: 'Removed',
      description: 'Entry removed successfully.',
    });
  };

  const handleSave = () => {
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
    updateContextSections(updated);
    setEditingId(null);
    toast({
      title: 'Saved',
      description: 'Profile information updated.',
    });
  };

  const updateContextSections = (newSections: any) => {
    updateData({
      aboutEntries: newSections.about,
      educationEntries: newSections.education,
      experienceEntries: newSections.experience,
      projectEntries: newSections.projects,
      certificateEntries: newSections.certificates,
      achievementEntries: newSections.achievements,
      researchEntries: newSections.research,
    });
  };

  const handleSaveContact = () => {
    if (!contactData.email || !/^\S+@\S+\.\S+$/.test(contactData.email)) {
      setContactErrors({ email: 'Valid email is required' });
      return;
    }
    setContactErrors({});
    updateData({ contactData });
    toast({
      title: 'Saved',
      description: 'Contact information updated.',
    });
  };

  // Asset handlers
  const handleAssetModeChange = (mode: AssetMode) => {
    setEditForm({ ...editForm, assets: { ...editForm.assets, mode } });
  };

  const handleFileUpload = (type: 'images' | 'pdfs') => {
    if (isStorageFull) return;
    const current = editForm.assets[type] || [];
    if (type === 'images' && current.length >= 5) return;
    if (type === 'pdfs' && current.length >= 2) return;

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = type === 'images' ? 'image/*' : 'application/pdf';
    input.onchange = (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const sizeBytes = file.size;
      if (usedStorage + sizeBytes > storageLimit) {
        toast({
          title: 'Quota Exceeded',
          description: 'Not enough storage. Clear space or review your plan in billing.',
          variant: 'destructive'
        });
        return;
      }

      // Generate a temporary local preview URL immediately
      const localUrl = URL.createObjectURL(file);
      const tempId = `temp-${Date.now()}`;

      const newAsset: FileAsset = {
        id: tempId,
        name: file.name,
        url: localUrl,
        sizeBytes,
        isUploading: true
      };

      // Add to state immediately
      setEditForm((prev: any) => ({
        ...prev,
        assets: {
          ...prev.assets,
          [type]: [...(prev.assets[type] || []), newAsset]
        }
      }));

      // Background upload
      const formData = new FormData();
      formData.append("file", file);
      const token = localStorage.getItem('token');

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
            setEditForm((prev: any) => {
              const list = prev.assets[type] || [];
              const updatedList = list.map((item: any) =>
                item.id === tempId ? { ...item, url: result.url, isUploading: false } : item
              );
              return {
                ...prev,
                assets: {
                  ...prev.assets,
                  [type]: updatedList
                }
              };
            });
          }
        })
        .catch((err) => {
          console.error("Failed to upload file to R2 in background:", err);
          toast({
            title: 'Upload Failed',
            description: err.message || 'An error occurred during file upload.',
            variant: 'destructive'
          });
          // Remove the temporary asset on failure
          setEditForm((prev: any) => {
            const list = prev.assets[type] || [];
            const updatedList = list.filter((item: any) => item.id !== tempId);
            return {
              ...prev,
              assets: {
                ...prev.assets,
                [type]: updatedList
              }
            };
          });
        });
    };
    input.click();
  };

  const handleRemoveAsset = (type: 'images' | 'pdfs' | 'links', id: string) => {
    setEditForm({
      ...editForm,
      assets: {
        ...editForm.assets,
        [type]: editForm.assets[type].filter((a: any) => a.id !== id)
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

  // Resume state
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [resumeStatus, setResumeStatus] = useState<'idle' | 'uploading' | 'parsing' | 'success'>(
    data.resumeFileName ? 'success' : 'idle'
  );
  const resumeInputRef = useRef<HTMLInputElement>(null);

  const handleResumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type === 'application/pdf') {
      setResumeFile(file);
      setResumeStatus('uploading');
      setTimeout(() => {
        setResumeStatus('parsing');
        setTimeout(() => {
          setResumeStatus('success');
          const randomSize = Math.floor((Math.random() * 3 + 1) * 1024 * 1024);
          updateData({
            resumeFileName: file.name,
            resumeFileSize: randomSize
          });
          toast({
            title: 'Resume Parsed',
            description: 'Your profile has been updated with information from your resume.',
          });
        }, 2000);
      }, 1500);
    }
  };

  const handleRemoveResume = () => {
    setResumeFile(null);
    setResumeStatus('idle');
    updateData({
      resumeFileName: '',
      resumeFileSize: 0
    });
    toast({
      title: 'Resume Removed',
      description: 'Resume has been deleted.',
    });
  };

  // General Settings inputs
  const [settingsName, setSettingsName] = useState(data.name || '');
  const [settingsPronouns, setSettingsPronouns] = useState(data.pronouns || '');
  const [settingsNationality, setSettingsNationality] = useState(data.nationality || '');
  const [settingsPhone, setSettingsPhone] = useState(data.phone || '');

  useEffect(() => {
    setSettingsName(data.name || '');
    setSettingsPronouns(data.pronouns || '');
    setSettingsNationality(data.nationality || '');
    setSettingsPhone(data.phone || '');
  }, [data, currentView]);

  const handleSaveSettings = () => {
    updateData({
      name: settingsName,
      pronouns: settingsPronouns,
      nationality: settingsNationality,
      phone: settingsPhone
    });
    toast({
      title: 'Settings Saved',
      description: 'Personal details updated successfully.',
    });
  };

  const handleTemplateSelect = (id: string) => {
    if (id !== 'minimal' && !data.isPremium) {
      toast({
        title: 'Feature Locked',
        description: 'Academic and Creative layouts are premium templates. Upgrade to Pro to unlock them.',
        variant: 'destructive',
      });
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
        <p className="text-xs text-slate-400 mb-3">Attach images, documents, or external links.</p>
        
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
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-400">{(assets.images || []).length} / 5 images used</span>
                <Button type="button" variant="outline" size="sm" className="h-8 text-xs px-3" onClick={() => handleFileUpload('images')} disabled={(assets.images || []).length >= 5 || isStorageFull}>
                  <Upload className="w-3.5 h-3.5 mr-1.5" /> Attach Image
                </Button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {(assets.images || []).map(img => (
                  <div key={img.id} className="relative group bg-white border border-slate-200 rounded-lg p-1.5 flex items-center justify-center h-16 overflow-hidden">
                    {img.url && (img.url.startsWith('data:image/') || img.url.startsWith('http') || img.url.startsWith('/')) ? (
                      <a href={img.url} target="_blank" rel="noopener noreferrer" className="w-full h-full flex items-center justify-center">
                        <img src={img.url} alt={img.name} className="w-full h-full object-cover rounded" />
                      </a>
                    ) : (
                      <ImageIcon className="w-6 h-6 text-slate-300" />
                    )}
                    <button type="button" onClick={() => handleRemoveAsset('images', img.id)} className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-white border border-slate-200 rounded-full flex items-center justify-center text-red-500 shadow-sm hover:bg-red-50 z-10">
                      <X className="w-2.5 h-2.5" />
                    </button>
                    <span className="absolute bottom-0.5 left-0.5 right-0.5 text-[9px] text-center truncate text-slate-500 bg-white/70 px-1 py-0.2 rounded">{(img.sizeBytes / 1024 / 1024).toFixed(1)}MB</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {assets.mode === 'pdfs' && (
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-400">{(assets.pdfs || []).length} / 2 PDFs used</span>
                <Button type="button" variant="outline" size="sm" className="h-8 text-xs px-3" onClick={() => handleFileUpload('pdfs')} disabled={(assets.pdfs || []).length >= 2 || isStorageFull}>
                  <Upload className="w-3.5 h-3.5 mr-1.5" /> Attach PDF
                </Button>
              </div>
              <div className="flex flex-col gap-1.5">
                {(assets.pdfs || []).map(pdf => (
                  <div key={pdf.id} className="flex items-center justify-between bg-white border border-slate-200 rounded-lg px-2.5 py-1.5">
                    <div className="flex items-center gap-1.5 overflow-hidden">
                      <a href={pdf.url} download={pdf.name} className="flex items-center gap-1.5 overflow-hidden hover:underline">
                        <FileText className="w-4 h-4 text-red-400 shrink-0" />
                        <span className="text-xs text-slate-700 truncate max-w-[150px]">{pdf.name}</span>
                      </a>
                      <span className="text-[10px] text-slate-400">{(pdf.sizeBytes / 1024 / 1024).toFixed(1)}MB</span>
                    </div>
                    <button type="button" onClick={() => handleRemoveAsset('pdfs', pdf.id)} className="text-slate-400 hover:text-red-500">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
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
                    <button type="button" onClick={() => handleRemoveAsset('links', link.id)} className="text-slate-400 hover:text-red-500 p-1.5 mt-0.5">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
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
                  <label className="flex items-center gap-1.5 text-xs text-slate-650 font-medium cursor-pointer shrink-0">
                    <input 
                      type="checkbox" 
                      checked={editForm.endYear === 'Present'} 
                      onChange={e => setEditForm({...editForm, endYear: e.target.checked ? 'Present' : ''})} 
                      className="rounded border-slate-350 text-indigo-650 focus:ring-indigo-500 h-4 w-4"
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
                      className="rounded border-slate-350 text-indigo-650 focus:ring-indigo-500 h-4 w-4"
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
                <Input type="date" value={editForm.date || ''} onChange={e => setEditForm({...editForm, date: e.target.value})} />
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

  const renderMinimalMockup = (accentBg: string) => (
    <div className="w-full h-full bg-slate-50 border border-slate-200/60 rounded-lg p-2.5 flex flex-col items-center justify-center relative overflow-hidden select-none">
      {/* Circle avatar */}
      <div className={`w-8 h-8 rounded-full ${accentBg} opacity-20 flex items-center justify-center mb-1.5 border border-slate-350`}>
        <User className="w-4 h-4 text-slate-700" />
      </div>
      {/* Title */}
      <div className={`h-2.5 w-16 ${accentBg} rounded mb-1`} />
      {/* Description lines */}
      <div className="h-1.5 w-24 bg-slate-300/60 rounded mb-1" />
      <div className="h-1.5 w-20 bg-slate-300/40 rounded mb-2.5" />
      {/* Single full column list items */}
      <div className="w-full space-y-1">
        <div className="h-2 w-full bg-white border border-slate-200 rounded-sm" />
        <div className="h-2 w-full bg-white border border-slate-200 rounded-sm" />
      </div>
    </div>
  );

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

  return (
    <div className="min-h-screen flex flex-col transition-colors duration-300 bg-slate-50 text-slate-800">
      {/* Premium custom top-right "Successfully Logged In" toast */}
      {showLoginToast && (
        <div className="fixed top-6 right-6 z-[100] animate-in slide-in-from-top-4 md:slide-in-from-right-4 duration-500">
          <div className="bg-slate-900 text-white rounded-2xl shadow-2xl p-4 pr-12 flex items-center gap-3.5 border border-slate-800 max-w-sm relative">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
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
      <header className="bg-white/80 backdrop-blur-md border-b border-slate-200 px-6 py-4 flex items-center justify-between sticky top-0 z-20 transition-colors duration-300">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => setCurrentView('overview')}>
          <img src={logo} alt="BEXO" className="w-7 h-7 object-contain animate-pulse" />
          <span className="font-serif font-bold text-xl text-slate-900 tracking-tight">BEXO</span>
        </div>
        <div className="flex items-center gap-4 relative" ref={profileMenuRef}>
          <div className="text-sm font-semibold text-slate-700 hidden md:block select-none transition-colors">
            {data.name || 'User'}
          </div>
          <button 
            onClick={() => setShowProfileMenu(!showProfileMenu)}
            className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold text-sm border-2 border-indigo-200 hover:border-indigo-400 hover:shadow-sm focus:outline-none overflow-hidden transition-all shrink-0"
            aria-label="Toggle profile menu"
          >
            {data.photoUrl ? (
              <img src={data.photoUrl} alt="Profile" className="w-full h-full object-cover" />
            ) : (
              (data.name ? data.name.charAt(0) : 'U')
            )}
          </button>
          
          {showProfileMenu && (
            <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-2xl border border-slate-200 shadow-xl py-3 z-30 animate-in fade-in slide-in-from-top-2 duration-200">
              {/* Header with user info */}
              <div className="px-4 py-2.5 border-b border-slate-100 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold border border-indigo-105 overflow-hidden shrink-0">
                  {data.photoUrl ? <img src={data.photoUrl} alt="Profile" className="w-full h-full object-cover" /> : (data.name ? data.name.charAt(0) : 'U')}
                </div>
                <div className="truncate">
                  <h4 className="font-semibold text-slate-850 text-sm truncate">{data.name || 'Bexo User'}</h4>
                  <p className="text-xs text-slate-400 truncate">{data.contactData?.email || 'No email set'}</p>
                </div>
              </div>
              
              {/* Plan details */}
              <div className="mx-3 my-2 px-3 py-2 bg-slate-50 rounded-xl border border-slate-100">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500 font-medium">Workspace Plan</span>
                  <span className="font-bold text-indigo-650 bg-indigo-50 px-2 py-0.5 rounded-full capitalize">
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
                  onClick={() => { setCurrentView('overview'); setShowProfileMenu(false); }} 
                  className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-indigo-50 hover:text-indigo-900 transition-colors flex items-center gap-2.5"
                >
                  <Layout className="w-4 h-4 text-slate-400" /> Dashboard Overview
                </button>
                <button 
                  onClick={() => { setCurrentView('edit-profile'); setShowProfileMenu(false); }} 
                  className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-indigo-50 hover:text-indigo-900 transition-colors flex items-center gap-2.5"
                >
                  <User className="w-4 h-4 text-slate-400" /> Edit Profile Info
                </button>
                <button 
                  onClick={() => { setCurrentView('settings'); setShowProfileMenu(false); }} 
                  className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-indigo-50 hover:text-indigo-900 transition-colors flex items-center gap-2.5"
                >
                  <Settings className="w-4 h-4 text-slate-400" /> Appearance & Settings
                </button>
              </div>
              
              {/* Sign out */}
              <div className="border-t border-slate-105 px-3 pt-2 mt-2">
                <button 
                  onClick={handleLogout}
                  className="w-full text-center px-4 py-2 bg-red-50 text-red-650 hover:bg-red-100 rounded-xl text-xs font-bold transition-all duration-200 select-none"
                >
                  Sign Out
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 md:py-12">
        {/* Main Dashboard Overview */}
        {currentView === 'overview' && (
          <div className="space-y-8 animate-in fade-in duration-300">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400 mb-2">Portfolio command center</p>
                <h1 className="font-serif text-3.5xl font-bold text-slate-900 tracking-tight">
                  Welcome back, {data.name?.split(' ')[0] || 'there'}
                </h1>
                <p className="text-slate-500 max-w-2xl">Keep your public portfolio ready for applications, recruiters, and campus opportunities.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={() => setCurrentView('edit-profile')} className="h-10 px-4 text-xs gap-2">
                  <Pencil className="w-4 h-4" /> Edit profile
                </Button>
                <a href={`https://${url}`} target="_blank" rel="noreferrer">
                  <Button variant="outline" className="h-10 px-4 text-xs gap-2">
                    <ExternalLink className="w-4 h-4" /> View live
                  </Button>
                </a>
              </div>
            </div>

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

            <div className="grid lg:grid-cols-[1.35fr_0.85fr] gap-6 items-stretch">
              <Card className="p-6 bg-slate-950 text-slate-100 border border-slate-900 shadow-sm overflow-hidden">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-5">
                  <div className="space-y-5">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Next best action</p>
                      <h2 className="text-2xl font-bold mt-2">{nextAction.label}</h2>
                      <p className="text-sm text-slate-300 mt-1 max-w-xl">{nextAction.detail}</p>
                    </div>
                    <Button
                      onClick={nextAction.action}
                      className="h-11 px-4 bg-slate-100 text-slate-950 hover:bg-white border-none shadow-none gap-2"
                    >
                      <NextActionIcon className="w-4 h-4" /> Continue
                    </Button>
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-1 gap-3 sm:w-36">
                    <div className="rounded-xl bg-slate-900 border border-slate-800 p-3">
                      <p className="text-[11px] text-slate-400 font-semibold">Readiness</p>
                      <p className="text-xl font-bold mt-1">{completionScore}%</p>
                    </div>
                    <div className="rounded-xl bg-slate-900 border border-slate-800 p-3">
                      <p className="text-[11px] text-slate-400 font-semibold">Entries</p>
                      <p className="text-xl font-bold mt-1">{totalEntries}</p>
                    </div>
                    <div className="rounded-xl bg-slate-900 border border-slate-800 p-3">
                      <p className="text-[11px] text-slate-400 font-semibold">Plan</p>
                      <p className="text-sm font-bold mt-1 truncate">{planName}</p>
                    </div>
                  </div>
                </div>
              </Card>

              <Card className="p-6 bg-white border border-slate-200 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Subscription</p>
                    <h3 className="text-xl font-bold text-slate-900 mt-2">{billingLoading ? 'Checking plan' : planName}</h3>
                    <p className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
                      <CalendarClock className="w-3.5 h-3.5" /> {planRenewal}
                    </p>
                  </div>
                  <span className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold",
                    data.isPremium ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"
                  )}>
                    {data.isPremium ? <Crown className="w-3.5 h-3.5" /> : <CreditCard className="w-3.5 h-3.5" />}
                    {data.isPremium ? 'Pro active' : 'Free'}
                  </span>
                </div>
                <div className="mt-6 space-y-3">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-600">
                    <span>Storage</span>
                    <span>{(usedStorage / 1024 / 1024).toFixed(1)} / {(storageLimit / 1024 / 1024).toFixed(0)} MB</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className={cn("h-full rounded-full transition-all duration-500", isStorageExhausted90 ? "bg-rose-500" : "bg-emerald-500")}
                      style={{ width: `${storagePercentage}%` }}
                    />
                  </div>
                  <Button variant="outline" onClick={openBilling} className="w-full h-10 text-xs gap-2">
                    <CreditCard className="w-4 h-4" /> Manage billing
                  </Button>
                </div>
              </Card>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
              {/* Profile Completion / Status Card */}
              {completionScore >= 90 ? (
                data.isPremium ? (
                  <Card className="p-6 bg-white border border-slate-200 shadow-sm flex flex-col justify-between hover:border-emerald-200 hover:shadow-md transition-all duration-300">
                    <div>
                      <div className="flex justify-between items-center mb-4">
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Portfolio Status</p>
                        <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2.5 py-0.5 rounded-full flex items-center gap-1 select-none">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> LIVE & ACTIVE
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
                          <Sparkles className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-slate-900">SEO Optimized</h4>
                          <p className="text-xs text-slate-500">All core details are configured.</p>
                        </div>
                      </div>
                      <p className="text-xs text-slate-400 leading-normal">
                        Your portfolio structure is fully optimized and search engines can index it properly.
                      </p>
                    </div>
                  </Card>
                ) : (
                  <Card className="p-6 bg-white border border-slate-200 shadow-sm flex flex-col justify-between hover:border-indigo-105 hover:shadow-md transition-all duration-300">
                    <div>
                      <div className="flex justify-between items-center mb-4">
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Portfolio Status</p>
                        <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full flex items-center gap-1 select-none">
                          Basic Portfolio
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500">
                          <AlertCircle className="w-5 h-5 text-slate-600" />
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-slate-900">SEO Disabled (Free)</h4>
                          <p className="text-xs text-slate-500">Upgrade to index on search engines.</p>
                        </div>
                      </div>
                      <p className="text-xs text-slate-400 leading-normal">
                        Your details are complete! Upgrade to Pro to enable search engine optimization and go live.
                      </p>
                    </div>
                  </Card>
                )
              ) : (
                <Card 
                  onClick={() => setShowCompletionModal(true)}
                  className="p-6 bg-white border border-slate-200 shadow-sm flex flex-col justify-between cursor-pointer hover:border-indigo-300 hover:shadow-md transition-all duration-300 group"
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
              <Card className="p-6 bg-white border border-slate-200 shadow-sm flex flex-col justify-between">
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Appearance & Theme</p>
                  <div className="flex items-center gap-3 mb-4">
                    <div className={cn("w-6 h-6 rounded-full border border-slate-200", getThemeClass())} />
                    <div>
                      <h4 className="font-semibold text-slate-900 capitalize text-sm">{data.templateId || 'Minimal'} Layout</h4>
                      <p className="text-xs text-slate-500 capitalize">Theme accent: {data.themeColor || 'Navy'}</p>
                    </div>
                  </div>
                </div>
                <button 
                  onClick={() => {
                    setCurrentView('settings');
                    setSettingsSubTab('design');
                  }} 
                  className="text-xs font-bold text-indigo-600 hover:text-indigo-800 text-left transition-colors"
                >
                  {data.isPremium ? "Customize look" : "Customize look (Free)"}
                </button>
              </Card>

              {/* Plan Status Card */}
              <Card className="p-6 bg-white border border-slate-200 shadow-sm flex flex-col justify-between transition-all duration-300">
                <div>
                  <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">Workspace tier</p>
                  <h3 className="text-2xl font-bold text-slate-900 capitalize flex items-center gap-2">
                    {planName}
                  </h3>
                </div>
                {data.isPremium ? (
                  <div className="flex items-center text-xs font-semibold text-emerald-700 bg-emerald-50 w-fit px-3 py-1 rounded-full mt-4">
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" /> Pro features unlocked
                  </div>
                ) : (
                  <button onClick={openBilling} className="flex items-center text-xs font-semibold text-indigo-700 bg-indigo-50 w-fit px-3 py-1 rounded-full mt-4 hover:bg-indigo-100 transition-colors">
                    <CreditCard className="w-3.5 h-3.5 mr-1.5" /> Upgrade path ready
                  </button>
                )}
              </Card>
            </div>

            {/* Hiring Availability Card */}
            {!data.openToHire && (
              <Card className="p-6 bg-white border border-slate-200 shadow-sm animate-in slide-in-from-bottom duration-300">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg shrink-0">
                        <Sparkles className="w-4 h-4" />
                      </span>
                      <h3 className="font-bold text-slate-900 text-sm">Hiring Availability</h3>
                    </div>
                    <p className="text-xs text-slate-500 max-w-xl">
                      Enable this option to display an "Available for Hire" badge on your public portfolio and receive professional inquiry leads.
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className={cn(
                      "text-xs font-bold px-2.5 py-0.5 rounded-full select-none transition-colors",
                      data.openToHire 
                        ? "text-emerald-700 bg-emerald-50" 
                        : "text-slate-500 bg-slate-100"
                    )}>
                      {data.openToHire ? 'Actively looking' : 'Not looking for opportunities'}
                    </span>
                    {/* Custom Toggle Switch */}
                    <button
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
              </Card>
            )}

            {/* Public URL Box */}
            <Card className="p-6 bg-white border border-slate-200 shadow-sm">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Public Domain</p>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
                <div className="flex items-center gap-2 text-slate-900 font-medium truncate">
                  <Globe className="w-5 h-5 text-indigo-500 shrink-0" />
                  <span className="text-lg font-mono">
                    https://<span className="text-indigo-600 font-semibold">{url}</span>
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button variant="outline" size="sm" onClick={handleCopyUrl} className="h-9 px-3 text-xs flex gap-1">
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? 'Copied' : 'Copy'}
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleShareUrl} className="h-9 px-3 text-xs flex gap-1">
                    <Share2 className="w-3.5 h-3.5 text-indigo-500" />
                    Share
                  </Button>
                  <a href={`https://${url}`} target="_blank" rel="noreferrer">
                    <Button variant="secondary" size="sm" className="h-9 px-3 text-xs flex gap-1">
                      Visit <ExternalLink className="w-3.5 h-3.5" />
                    </Button>
                  </a>
                </div>
              </div>
            </Card>

            {/* Actions Grid */}
            <div>
              <h2 className="text-lg font-bold text-slate-900 mb-4">Quick Portfolio Actions</h2>
              <div className="grid md:grid-cols-3 gap-6">
                <Card 
                  onClick={() => setCurrentView('edit-profile')} 
                  className="p-6 hover:shadow-md transition-shadow group cursor-pointer border-slate-200 bg-white flex flex-col justify-between"
                >
                  <div>
                    <div className="w-10 h-10 rounded-xl bg-blue-50 text-indigo-600 flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
                      <User className="w-5 h-5" />
                    </div>
                    <h3 className="font-bold text-slate-900 mb-1">Edit Profile Details</h3>
                    <p className="text-xs text-slate-500 leading-relaxed mb-4">Add projects, skills, certificates, and work experience manually.</p>
                  </div>
                  <div className="flex items-center text-xs font-bold text-indigo-600 group-hover:translate-x-1 transition-transform">
                    Open Editor <ArrowRight className="w-3.5 h-3.5 ml-1" />
                  </div>
                </Card>

                <Card 
                  onClick={() => setCurrentView('resume')} 
                  className="p-6 hover:shadow-md transition-shadow group cursor-pointer border-slate-200 bg-white flex flex-col justify-between"
                >
                  <div>
                    <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
                      <FileText className="w-5 h-5" />
                    </div>
                    <h3 className="font-bold text-slate-900 mb-1">Manage Resume</h3>
                    <p className="text-xs text-slate-500 leading-relaxed mb-4">Upload a PDF resume to automatically parse and refresh your experience details.</p>
                  </div>
                  <div className="flex items-center text-xs font-bold text-purple-600 group-hover:translate-x-1 transition-transform">
                    Upload PDF <ArrowRight className="w-3.5 h-3.5 ml-1" />
                  </div>
                </Card>

                <Card 
                  onClick={() => setCurrentView('settings')} 
                  className="p-6 hover:shadow-md transition-shadow group cursor-pointer border-slate-200 bg-white flex flex-col justify-between"
                >
                  <div>
                    <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
                      <Settings className="w-5 h-5" />
                    </div>
                    <h3 className="font-bold text-slate-900 mb-1">Appearance & Settings</h3>
                    <p className="text-xs text-slate-500 leading-relaxed mb-4">Change color theme accent, website template layouts, and usernames.</p>
                  </div>
                  <div className="flex items-center text-xs font-bold text-slate-600 group-hover:translate-x-1 transition-transform">
                    Customize <ArrowRight className="w-3.5 h-3.5 ml-1" />
                  </div>
                </Card>
              </div>
            </div>
          </div>
        )}

        {/* View 2: Edit Profile */}
        {currentView === 'edit-profile' && (
          <div className="space-y-6 animate-in slide-in-from-bottom duration-300">
            <button 
              onClick={() => setCurrentView('overview')}
              className="inline-flex items-center gap-1 text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" /> Back to Dashboard
            </button>

            <div className="flex justify-between items-center border-b border-slate-200 pb-4">
              <div>
                <h1 className="text-2xl md:text-3.5xl font-serif font-bold text-slate-900">Edit Profile</h1>
                <p className="text-slate-500 text-sm">Add, remove, and modify the details in your public portfolio.</p>
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
                      <div className="space-y-1.5">
                        <Label className={contactErrors.email ? "text-red-500" : ""}>Email address (Required)</Label>
                        <Input 
                          value={contactData.email} 
                          onChange={e => { setContactData({...contactData, email: e.target.value}); setContactErrors({...contactErrors, email: ''}); }} 
                          className={contactErrors.email ? "border-red-500 focus-visible:ring-red-500" : ""}
                        />
                        {contactErrors.email && <p className="text-xs text-red-500">{contactErrors.email}</p>}
                      </div>
                      <div className="space-y-1.5">
                        <Label>LinkedIn URL</Label>
                        <Input value={contactData.linkedin} onChange={e => setContactData({...contactData, linkedin: e.target.value})} placeholder="linkedin.com/in/username" />
                      </div>
                      <div className="space-y-1.5">
                        <Label>GitHub URL</Label>
                        <Input value={contactData.github} onChange={e => setContactData({...contactData, github: e.target.value})} placeholder="github.com/username" />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Phone Number</Label>
                        <div className="flex relative">
                          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-medium">+91</span>
                          <Input 
                            value={(contactData.phone || data.phone || '').replace(/^\+?91/, '').trim()} 
                            onChange={e => {
                              const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                              setContactData({...contactData, phone: val ? `+91${val}` : ''});
                            }} 
                            placeholder="98765 43210" 
                            className="pl-12 text-sm font-medium tracking-wide h-10 rounded-xl"
                          />
                        </div>
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

                        <div className="flex justify-end gap-2 pt-4 border-t border-slate-105 mt-4">
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
                            <p className="text-sm text-slate-650 leading-relaxed whitespace-pre-wrap">
                              {sections.about[0]?.description || <span className="text-slate-400 italic">No summary provided. Upload your resume or click Edit to add one.</span>}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center border-b pb-2">
                      <h3 className="text-lg font-bold text-slate-900 capitalize">{activeEditorTab} List</h3>
                      {editingId === null && (
                        <Button onClick={handleAdd} size="sm" className="h-9 px-3 text-xs flex gap-1 bg-indigo-50 text-indigo-700 hover:bg-indigo-100">
                          <Plus className="w-3.5 h-3.5" /> Add New
                        </Button>
                      )}
                    </div>

                    <div className="space-y-3">
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

        {/* View 3: Manage Resume */}
        {currentView === 'resume' && (
          <div className="space-y-6 animate-in slide-in-from-bottom duration-300 max-w-xl mx-auto">
            <button 
              onClick={() => setCurrentView('overview')}
              className="inline-flex items-center gap-1 text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" /> Back to Dashboard
            </button>

            <div>
              <h1 className="text-2.5xl font-serif font-bold text-slate-900 mb-1">Manage Resume</h1>
              <p className="text-slate-500 text-sm">Upload or replace your PDF resume. Our parser will extract updated information.</p>
            </div>

            <Card className="p-6 bg-white border border-slate-200 shadow-sm">
              <div 
                className={cn(
                  "relative border-2 border-dashed rounded-2xl p-8 text-center transition-all duration-300",
                  resumeStatus === 'idle' ? "border-slate-300 hover:border-indigo-500 bg-slate-50 hover:bg-indigo-50/20 cursor-pointer" :
                  resumeStatus === 'success' ? "border-emerald-500 bg-emerald-50/10" :
                  "border-indigo-500 bg-indigo-50/20"
                )}
                onClick={() => resumeStatus === 'idle' && resumeInputRef.current?.click()}
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

            {/* Generated PDF Resume Panel */}
            {data.resumeUrl && (
              <Card className="p-6 bg-white border border-slate-200 shadow-sm flex flex-col gap-4 animate-in slide-in-from-bottom duration-300">
                <div className="flex items-center justify-between border-b border-slate-150 pb-3">
                  <div className="space-y-0.5">
                    <h3 className="text-sm font-bold text-slate-900">Your Current Resume PDF</h3>
                    <p className="text-xs text-slate-500">Your resume is parsed and synchronized with your digital portfolio details.</p>
                  </div>
                  <a 
                    href={data.resumeUrl} 
                    target="_blank" 
                    rel="noreferrer" 
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-650 hover:text-indigo-850 hover:underline"
                  >
                    View / Download <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-slate-50 p-4 rounded-xl border border-slate-150">
                  <div className="flex items-center gap-2">
                    <FileText className="w-5 h-5 text-indigo-500 shrink-0" />
                    <span className="text-xs font-medium text-slate-800">
                      ATS Professional Resume PDF
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      onClick={async () => {
                        try {
                          const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5001';
                          const token = localStorage.getItem('token');
                          const res = await fetch(`${apiUrl}/api/profile/generate-resume`, {
                            method: 'POST',
                            headers: {
                              'Authorization': `Bearer ${token}`
                            }
                          });
                          if (!res.ok) throw new Error('Generation failed');
                          const result = await res.json();
                          updateData({ resumeUrl: result.url });
                          toast({
                            title: "Resume Compiled",
                            description: "ATS Professional Resume compiled successfully from current details."
                          });
                        } catch (err: any) {
                          toast({
                            title: "Error",
                            description: err.message || "Failed to compile resume",
                            variant: "destructive"
                          });
                        }
                      }}
                      variant="secondary" 
                      size="sm" 
                      className="text-xs h-9 px-3 flex gap-1 bg-white hover:bg-slate-100 border-slate-200"
                    >
                      Re-Compile PDF
                    </Button>
                    <a href={data.resumeUrl} target="_blank" rel="noreferrer">
                      <Button size="sm" className="text-xs h-9 px-3 flex gap-1">
                        Download PDF
                      </Button>
                    </a>
                  </div>
                </div>
              </Card>
            )}
          </div>
        )}

        {/* View 4: Appearance & Settings */}
        {currentView === 'settings' && (
          <div className="space-y-6 animate-in slide-in-from-bottom duration-300">
            <button 
              onClick={() => setCurrentView('overview')}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors uppercase tracking-wider select-none"
            >
              <ChevronLeft className="w-4 h-4" /> Back to Dashboard
            </button>

            <div>
              <h1 className="text-3xl font-serif font-bold text-slate-900 tracking-tight">Appearance & Settings</h1>
              <p className="text-slate-500 text-sm mt-0.5">Customize template designs, color theme accents, and personal settings.</p>
            </div>

            {/* Premium Tabbed Layout */}
            <div className="grid md:grid-cols-4 gap-6 items-start">
              {/* Tab Navigation Card */}
              <Card className="p-2.5 bg-white border border-slate-200 shadow-sm flex flex-col gap-1 md:col-span-1">
                <button
                  onClick={() => setSettingsSubTab('profile')}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all text-left w-full",
                    settingsSubTab === 'profile' 
                      ? "bg-indigo-50 text-indigo-900 shadow-sm ring-1 ring-indigo-100" 
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  )}
                >
                  <User className="w-4 h-4 shrink-0" /> Personal Details
                </button>
                
                <button
                  onClick={() => setSettingsSubTab('design')}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all text-left w-full",
                    settingsSubTab === 'design' 
                      ? "bg-indigo-50 text-indigo-900 shadow-sm ring-1 ring-indigo-100" 
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  )}
                >
                  <Palette className="w-4 h-4 shrink-0" /> Design & Theme
                </button>
                
                <button
                  onClick={() => setSettingsSubTab('storage')}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all text-left w-full",
                    settingsSubTab === 'storage' 
                      ? "bg-indigo-50 text-indigo-900 shadow-sm ring-1 ring-indigo-100" 
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  )}
                >
                  <FileText className="w-4 h-4 shrink-0" /> Cloud Storage
                </button>

                <button
                  onClick={() => setSettingsSubTab('billing')}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all text-left w-full",
                    settingsSubTab === 'billing' 
                      ? "bg-indigo-50 text-indigo-900 shadow-sm ring-1 ring-indigo-100" 
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  )}
                >
                  <CreditCard className="w-4 h-4 shrink-0" /> Billing & Invoices
                </button>
              </Card>

              {/* Tab Content Cards */}
              <div className="md:col-span-3">
                {settingsSubTab === 'profile' && (
                  <Card className="p-6 bg-white border border-slate-200 shadow-sm space-y-6 animate-in fade-in duration-200">
                    <div>
                      <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                        <User className="w-4 h-4 text-indigo-500" /> Personal Settings
                      </h3>
                      <p className="text-slate-500 text-xs mt-0.5">Update your basic onboarding and contact information.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold text-slate-500">Full Name</Label>
                        <Input value={settingsName} onChange={e => setSettingsName(e.target.value)} />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold text-slate-500">Pronouns</Label>
                        <select
                          value={['She/Her', 'He/Him', 'They/Them', 'Prefer not to say'].includes(settingsPronouns) ? settingsPronouns : (settingsPronouns ? 'Custom' : '')}
                          onChange={e => {
                            const val = e.target.value;
                            if (val === 'Custom') {
                              setSettingsPronouns('');
                            } else {
                              setSettingsPronouns(val);
                            }
                          }}
                          className="flex h-12 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                        >
                          <option value="" disabled>Select Pronouns</option>
                          <option value="She/Her">She/Her</option>
                          <option value="He/Him">He/Him</option>
                          <option value="They/Them">They/Them</option>
                          <option value="Prefer not to say">Prefer not to say</option>
                          <option value="Custom">Custom (Type manually)</option>
                        </select>
                        {(!['She/Her', 'He/Him', 'They/Them', 'Prefer not to say'].includes(settingsPronouns) || settingsPronouns === '') && (
                          <Input
                            placeholder="Enter custom pronouns"
                            value={settingsPronouns}
                            onChange={e => setSettingsPronouns(e.target.value)}
                            className="mt-2"
                          />
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold text-slate-500">Nationality</Label>
                        <Input value={settingsNationality} onChange={e => setSettingsNationality(e.target.value)} />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold text-slate-500">Phone</Label>
                        <div className="flex relative">
                          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-medium">+91</span>
                          <Input 
                            value={settingsPhone.replace(/^\+?91/, '').trim()} 
                            onChange={e => {
                              const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                              setSettingsPhone(val ? `+91${val}` : '');
                            }} 
                            className="pl-12 text-sm font-medium tracking-wide h-10 rounded-xl"
                          />
                        </div>
                      </div>
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

                    <Button onClick={handleSaveSettings} className="h-10 text-xs px-4">
                      Save Settings
                    </Button>
                  </Card>
                )}

                {settingsSubTab === 'design' && (
                  <div className="space-y-6 animate-in fade-in duration-200">
                    {/* Theme selector - ONLY for Free template */}
                    {data.templateId === 'minimal' && (
                      <Card className="p-6 bg-white border border-slate-200 shadow-sm space-y-4">
                        <div>
                          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                            <Palette className="w-4 h-4 text-indigo-500" /> Accent Color
                          </h3>
                          <p className="text-slate-500 text-xs mt-0.5">Select a brand color accent for your portfolio template layouts.</p>
                        </div>
                        <div className="flex gap-2.5 pt-1">
                          {THEMES.map(theme => (
                            <button
                              key={theme.id}
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
                    )}

                    {/* Visual Page Template + Live Preview — split layout */}
                    <div className={cn("grid grid-cols-1 gap-5 items-start", data.isPremium ? "lg:grid-cols-5" : "lg:grid-cols-1")}>
                      
                      {/* Template Selector */}
                      <Card className={cn("p-5 bg-white border border-slate-200 shadow-sm space-y-4", data.isPremium ? "lg:col-span-2" : "w-full")}>
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

                        <div className={cn("flex flex-col gap-3", !data.isPremium && "md:grid md:grid-cols-3")}>
                          {TEMPLATES.map(tpl => {
                            const isSelected = data.templateId === tpl.id;
                            const accentBg = getThemeClass(true);
                            const isLocked = !data.isPremium && tpl.id !== 'minimal';
                            return (
                              <button
                                key={tpl.id}
                                onClick={() => {
                                  if (isLocked) {
                                    toast({
                                      title: "Premium Template Locked",
                                      description: "Academic and Creative layouts are premium Pro templates. Upgrade to unlock.",
                                      variant: "destructive"
                                    });
                                    return;
                                  }
                                  handleTemplateSelect(tpl.id);
                                }}
                                className={cn(
                                  "group text-left rounded-xl border-2 transition-all hover:shadow-md flex items-center gap-3 p-2.5 relative overflow-hidden",
                                  isSelected ? "border-indigo-600 bg-indigo-50/30 shadow-sm" : "border-slate-200 bg-white hover:border-slate-300",
                                  isLocked ? "opacity-80" : ""
                                )}
                              >
                                {/* Mini thumbnail mockup */}
                                <div className="w-20 h-14 bg-slate-100 rounded-lg overflow-hidden border border-slate-200/60 shrink-0 relative flex flex-col shadow-inner">
                                  <div className="h-3 bg-slate-200 border-b border-slate-300 flex items-center px-1 gap-0.5 shrink-0">
                                    <span className="w-1 h-1 rounded-full bg-red-400" />
                                    <span className="w-1 h-1 rounded-full bg-yellow-400" />
                                    <span className="w-1 h-1 rounded-full bg-green-400" />
                                  </div>
                                  <div className={cn("flex-1 p-1", isLocked ? "blur-[1.5px] grayscale-[40%] opacity-60" : "")}>
                                    {tpl.id === 'minimal' && renderMinimalMockup(accentBg)}
                                    {tpl.id === 'academic' && renderAcademicMockup(accentBg)}
                                    {tpl.id === 'creative' && renderCreativeMockup(accentBg)}
                                  </div>
                                  {isLocked && (
                                    <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-[1px] flex items-center justify-center">
                                      <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                      </svg>
                                    </div>
                                  )}
                                </div>

                                {/* Text */}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <h4 className="text-sm font-bold text-slate-900 capitalize">{tpl.name}</h4>
                                    {isLocked && <span className="text-[9px] font-bold text-indigo-650 bg-indigo-50 px-1.5 py-0.5 rounded uppercase tracking-wider">Pro</span>}
                                  </div>
                                  <p className="text-[11px] text-slate-400 leading-normal mt-0.5 line-clamp-2">{tpl.description}</p>
                                </div>

                                {/* Selected indicator */}
                                {isSelected && !isLocked && (
                                  <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0" />
                                )}
                              </button>
                            );
                          })}
                        </div>

                        {/* Open portfolio link */}
                        <a
                          href={`/${handleString}`}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center justify-center gap-1.5 w-full py-2.5 rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-755 text-xs font-bold hover:bg-indigo-100 transition-colors mt-1"
                        >
                          <ExternalLink className="w-3.5 h-3.5" /> Open Live Portfolio
                        </a>
                      </Card>

                      {/* Right: Live iframe Preview - ONLY for Pro/Premium users */}
                      {data.isPremium && (
                        <div className="lg:col-span-3 flex flex-col gap-2">
                          <div className="flex items-center justify-between px-1">
                            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Live Preview</span>
                            <span className="text-[11px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full font-medium">
                              mybexo.com/{handleString}
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
                                  <span className="text-[11px] text-slate-500 font-medium truncate">mybexo.com/{handleString}</span>
                                </div>
                              </div>
                            </div>

                            {/* iframe */}
                            <div className="relative w-full overflow-hidden" style={{ height: '520px' }}>
                              <iframe
                                key={`${data.templateId || 'minimal'}-${data.themeColor || 'indigo'}`}
                                src={`/${handleString}`}
                                title="Live Portfolio Preview"
                                className="absolute top-0 left-0 border-0 bg-white"
                                style={{
                                  width: '1280px',
                                  height: '900px',
                                  transform: 'scale(0.65)',
                                  transformOrigin: 'top left',
                                  pointerEvents: 'none'
                                }}
                                sandbox="allow-scripts allow-same-origin"
                              />
                            </div>
                          </div>

                          <p className="text-[11px] text-slate-400 text-center">
                            This preview reflects your live portfolio. Changes to template or color take effect after saving.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {settingsSubTab === 'storage' && (
                  <Card className="p-6 bg-white border border-slate-200 shadow-sm space-y-6 animate-in fade-in duration-200">
                    <div>
                      <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                        <FileText className="w-4 h-4 text-indigo-500" /> Cloud Storage
                      </h3>
                      <p className="text-slate-500 text-xs mt-0.5">Manage files, resume storage limits, and active server capacity.</p>
                    </div>

                    <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 space-y-4">
                      <div>
                        <div className="flex justify-between items-center mb-1.5 text-xs font-bold text-slate-700">
                          <span>Usage Details</span>
                          <span>{(usedStorage / 1024 / 1024).toFixed(1)}MB / {(storageLimit / 1024 / 1024).toFixed(0)}MB</span>
                        </div>
                        <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden">
                          <div 
                            className={cn("h-full rounded-full transition-all duration-500", isStorageFull ? "bg-red-500" : "bg-indigo-650")}
                            style={{ width: `${storagePercentage}%` }}
                          />
                        </div>
                      </div>
                      
                      <div className="flex flex-col sm:flex-row gap-3 pt-2">
                        {data.isPremium ? (
                          <Button 
                            onClick={openBilling}
                            size="sm" 
                            className="h-10 text-xs px-4 bg-indigo-50 text-indigo-900 hover:bg-indigo-100 flex-1 border border-indigo-200 shadow-none"
                          >
                            Manage Billing
                          </Button>
                        ) : (
                          <Button 
                            onClick={openBilling}
                            size="sm" 
                            className="h-10 text-xs px-4 bg-indigo-600 text-white hover:bg-indigo-700 flex-1 border-none shadow-md font-semibold"
                          >
                            Upgrade to Pro (50MB Limit)
                          </Button>
                        )}
                      </div>
                    </div>
                  </Card>
                )}

                {settingsSubTab === 'billing' && (
                  <Card className="p-6 bg-white border border-slate-200 shadow-sm space-y-6 animate-in fade-in duration-200">
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
                            return (
                              <div key={payment.id} className="py-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                                <div>
                                  <p className="text-sm font-semibold text-slate-900 capitalize">
                                    Bexo Pro {payment.amount === 299900 ? 'Lifetime Membership' : payment.amount === 99900 ? 'Annual Support Plan' : 'Subscription'}
                                  </p>
                                  <p className="text-xs text-slate-555 mt-0.5">
                                    Paid on {dateStr}  |  Order ID: <span className="font-mono text-slate-400">{payment.razorpayOrderId}</span>
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
                                      className="text-xs font-bold text-indigo-650 bg-indigo-50 hover:bg-indigo-100/70 px-3 py-1.5 rounded-lg border border-indigo-100 transition-colors flex items-center gap-1.5 shrink-0 select-none"
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
                )}
              </div>
            </div>
          </div>
        )}
        {showCompletionModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-lg rounded-2xl border border-slate-200 shadow-2xl p-6 relative flex flex-col max-h-[90vh]">
              <button 
                onClick={() => setShowCompletionModal(false)}
                className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 transition-colors p-1"
              >
                <X className="w-5 h-5" />
              </button>
              
              <div className="mb-5">
                <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-indigo-500" /> Complete Your Profile
                </h2>
                <p className="text-xs text-slate-500 mt-1">Fill in the missing details to fully optimize your portfolio and increase SEO visibility.</p>
              </div>

              {/* Progress */}
              <div className="mb-6 bg-slate-50 border border-slate-100 p-4 rounded-xl">
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

              {/* List of sections */}
              <div className="space-y-4 overflow-y-auto pr-1 flex-1">
                {/* 1. Profile Picture */}
                <div className="border border-slate-100 rounded-xl p-4 bg-white shadow-sm flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {data.photoUrl ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
                      )}
                      <span className="text-xs font-bold text-slate-850">Profile Picture</span>
                    </div>
                    {data.photoUrl && (
                      <span className="text-[10px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full font-semibold">Done</span>
                    )}
                  </div>
                  {!data.photoUrl && (
                    <div className="flex items-center gap-3">
                      <input 
                        type="file" 
                        id="modal-photo-upload" 
                        accept="image/*"
                        className="hidden" 
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleUploadPhoto(file);
                        }}
                      />
                      <label 
                        htmlFor="modal-photo-upload"
                        className="cursor-pointer inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold border border-indigo-200 transition-colors"
                      >
                        <Upload className="w-3.5 h-3.5" /> Select Photo
                      </label>
                      <span className="text-[10px] text-slate-400">Supported formats: JPG, PNG</span>
                    </div>
                  )}
                </div>

                {/* 2. Resume PDF */}
                <div className="border border-slate-100 rounded-xl p-4 bg-white shadow-sm flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {data.resumeFileName ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
                      )}
                      <span className="text-xs font-bold text-slate-850">PDF Resume</span>
                    </div>
                    {data.resumeFileName && (
                      <span className="text-[10px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full font-semibold truncate max-w-[150px]">
                        {data.resumeFileName}
                      </span>
                    )}
                  </div>
                  {!data.resumeFileName && (
                    <div className="flex items-center gap-3">
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
                      <span className="text-[10px] text-slate-400">Required for auto-parsing</span>
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
                {(!data.educationEntries || data.educationEntries.length === 0 || !data.projectEntries || data.projectEntries.length === 0) && (
                  <div className="border border-slate-100 rounded-xl p-4 bg-slate-50 flex flex-col gap-2.5">
                    <p className="text-[11px] text-slate-500 font-medium">To complete other sections like education, projects, or work history, use the main profile editor.</p>
                    <div className="flex gap-2">
                      <Button 
                        size="sm" 
                        className="h-8 text-[11px] px-3 bg-white border border-slate-200 text-slate-850 hover:bg-slate-50 flex-1 shadow-none"
                        onClick={() => {
                          setCurrentView('edit-profile');
                          setActiveEditorTab('education');
                          setShowCompletionModal(false);
                        }}
                      >
                        Add Education
                      </Button>
                      <Button 
                        size="sm" 
                        className="h-8 text-[11px] px-3 bg-white border border-slate-200 text-slate-850 hover:bg-slate-50 flex-1 shadow-none"
                        onClick={() => {
                          setCurrentView('edit-profile');
                          setActiveEditorTab('projects');
                          setShowCompletionModal(false);
                        }}
                      >
                        Add Project
                      </Button>
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
      </main>
    </div>
  );
}
