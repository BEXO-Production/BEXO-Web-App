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
  ArrowUpRight,
  Link as LinkIcon,
  Image as ImageIcon,
  Upload,
  AlertCircle,
  ArrowUp,
  ArrowDown
} from 'lucide-react';
import { cn } from '../design-system/primitives';
import logo from '../assets/bexo-logo.png';

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
  { id: 'amber', label: 'Amber', hex: 'bg-amber-600', textHex: 'text-amber-600' },
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

export default function Dashboard() {
  const { data, updateData } = useOnboarding();
  const { toast } = useToast();
  const [currentView, setCurrentView] = useState<'overview' | 'edit-profile' | 'resume' | 'settings'>('overview');
  
  // Storage limit and simulation states
  const [storageLimit, setStorageLimit] = useState(50 * 1024 * 1024); // 50MB
  const [simulatedUsage, setSimulatedUsage] = useState<number | null>(null);

  // URL management
  const handleString = data.name ? data.name.toLowerCase().replace(/[^a-z0-9]/g, '') : 'portfolio';
  const url = `${handleString}.mybexo.com`;
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

  const handleBuyStorage = () => {
    const newLimit = storageLimit + 50 * 1024 * 1024;
    setStorageLimit(newLimit);
    toast({
      title: 'Upgrade Successful!',
      description: `Storage limit increased to ${(newLimit / 1024 / 1024).toFixed(0)}MB.`,
    });
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

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(`https://${url}`);
    setCopied(true);
    toast({
      title: 'Copied!',
      description: 'Public URL copied to clipboard.',
    });
    setTimeout(() => setCopied(false), 2000);
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
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const sizeBytes = file.size;
      if (usedStorage + sizeBytes > storageLimit) {
        toast({
          title: 'Quota Exceeded',
          description: 'Not enough storage. Please clear space or buy more storage first.',
          variant: 'destructive'
        });
        return;
      }

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

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || "Upload failed");
        }

        const result = await res.json();
        if (result.url) {
          const newAsset: FileAsset = {
            id: Date.now().toString(),
            name: file.name,
            url: result.url,
            sizeBytes
          };
          setEditForm({
            ...editForm,
            assets: {
              ...editForm.assets,
              [type]: [...current, newAsset]
            }
          });
        }
      } catch (err: any) {
        console.error("Failed to upload file to R2:", err);
        toast({
          title: 'Upload Failed',
          description: err.message || 'An error occurred during file upload.',
          variant: 'destructive'
        });
      }
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
  const [settingsPlan, setSettingsPlan] = useState(data.plan || 'Free');

  useEffect(() => {
    setSettingsName(data.name || '');
    setSettingsPronouns(data.pronouns || '');
    setSettingsNationality(data.nationality || '');
    setSettingsPhone(data.phone || '');
    setSettingsPlan(data.plan || 'Free');
  }, [data, currentView]);

  const handleSaveSettings = () => {
    updateData({
      name: settingsName,
      pronouns: settingsPronouns,
      nationality: settingsNationality,
      phone: settingsPhone,
      plan: settingsPlan as any
    });
    toast({
      title: 'Settings Saved',
      description: 'Personal details updated successfully.',
    });
  };

  const handleTemplateSelect = (id: string) => {
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

  return (
    <div className="min-h-[100dvh] bg-slate-50">
      {/* Top Navbar */}
      <header className="bg-white/80 backdrop-blur-md border-b border-slate-200 px-6 py-4 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => setCurrentView('overview')}>
          <img src={logo} alt="BEXO" className="w-7 h-7 object-contain animate-pulse" />
          <span className="font-serif font-bold text-xl text-slate-900 tracking-tight">BEXO</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-sm font-semibold text-slate-700 hidden md:block">
            {data.name || 'User'}
          </div>
          <div className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold text-sm border-2 border-indigo-200 shadow-sm overflow-hidden">
            {data.photoUrl ? (
              <img src={data.photoUrl} alt="Profile" className="w-full h-full object-cover" />
            ) : (
              (data.name ? data.name.charAt(0) : 'U')
            )}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 md:py-12">
        {/* Main Dashboard Overview */}
        {currentView === 'overview' && (
          <div className="space-y-8 animate-in fade-in duration-300">
            {/* Hero welcome row */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <h1 className="font-serif text-3.5xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                  Welcome back, {data.name?.split(' ')[0] || 'there'} <Sparkles className="w-6 h-6 text-indigo-500 animate-bounce" />
                </h1>
                <p className="text-slate-500">Manage your portfolio, track views, and update your profile.</p>
              </div>
              <a 
                href={`https://${url}`} 
                target="_blank" 
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-600 hover:text-indigo-800 transition-colors"
              >
                View live portfolio <ArrowUpRight className="w-4 h-4" />
              </a>
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
                  onClick={handleBuyStorage} 
                  className="bg-rose-600 text-white hover:bg-rose-700 border-none px-5 h-10 text-xs font-semibold shadow-md flex items-center gap-1.5 shrink-0"
                >
                  <Plus className="w-4 h-4" /> Buy More Storage
                </Button>
              </Card>
            )}

            {/* Metrics cards row */}
            <div className="grid md:grid-cols-3 gap-6">
              {/* Profile Completion Card */}
              <Card className="p-6 bg-white border border-slate-200 shadow-sm flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-center mb-4">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Completeness</p>
                    <span className="text-sm font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">{completionScore}%</span>
                  </div>
                  <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden mb-3">
                    <div 
                      className="h-full bg-gradient-to-r from-indigo-500 to-indigo-700 rounded-full transition-all duration-700" 
                      style={{ width: `${completionScore}%` }} 
                    />
                  </div>
                  <p className="text-xs text-slate-500">
                    {completionScore < 100 ? 'Complete all sections for maximum SEO visibility.' : 'Your profile is 100% complete! Good job!'}
                  </p>
                </div>
              </Card>

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
                <button onClick={() => setCurrentView('settings')} className="text-xs font-bold text-indigo-600 hover:text-indigo-800 text-left transition-colors">
                  Customize look &rarr;
                </button>
              </Card>

              {/* Plan Status Card */}
              <Card className="p-6 bg-gradient-to-br from-indigo-600 to-indigo-900 text-white border-0 shadow-md flex flex-col justify-between">
                <div>
                  <p className="text-indigo-100 text-xs font-bold uppercase tracking-wider mb-2">Workspace tier</p>
                  <h3 className="text-2xl font-bold capitalize flex items-center gap-2">
                    {data.plan === 'activation_code' ? 'Activated Pro' : data.plan || 'Free Plan'}
                  </h3>
                </div>
                <div className="flex items-center text-xs font-semibold text-indigo-50 bg-white/10 w-fit px-3 py-1 rounded-full backdrop-blur-sm mt-4">
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1.5 text-indigo-200" /> Pro Features Unlocked
                </div>
              </Card>
            </div>

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
              <div className="w-full lg:w-48 shrink-0 flex flex-col gap-4">
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

                {/* Buried storage meter in profile (only visible here when storage is under 90% full) */}
                {!isStorageExhausted90 && (
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
                      onClick={handleBuyStorage}
                      className="text-[10px] font-bold text-indigo-500 hover:text-indigo-700 mt-2.5 text-left flex items-center gap-0.5 hover:underline cursor-pointer"
                    >
                      Upgrade Storage &rarr;
                    </button>
                  </Card>
                )}
              </div>

              {/* Editor panel */}
              <div className="flex-1 bg-white p-5 md:p-6 rounded-2xl border border-slate-200 shadow-sm min-h-[400px] min-w-0">
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
                    </div>
                    <Button onClick={handleSaveContact} className="h-10 text-xs px-4">
                      Save Contact
                    </Button>
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
          </div>
        )}

        {/* View 4: Appearance & Settings */}
        {currentView === 'settings' && (
          <div className="space-y-6 animate-in slide-in-from-bottom duration-300">
            <button 
              onClick={() => setCurrentView('overview')}
              className="inline-flex items-center gap-1 text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" /> Back to Dashboard
            </button>

            <div>
              <h1 className="text-2.5xl font-serif font-bold text-slate-900 mb-1">Appearance & Settings</h1>
              <p className="text-slate-500 text-sm">Customize template designs, color theme accents, and custom domain names.</p>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
              {/* Left Column: Personal details */}
              <Card className="p-5 bg-white border border-slate-200 shadow-sm md:col-span-2 space-y-4">
                <h3 className="text-base font-bold text-slate-900 border-b pb-2 flex items-center gap-1.5">
                  <User className="w-4 h-4 text-indigo-500" /> Personal Settings
                </h3>
                <div className="grid grid-cols-2 gap-4">
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

                <div className="grid grid-cols-2 gap-4">
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
                  <select 
                    value={settingsPlan} 
                    onChange={e => setSettingsPlan(e.target.value)}
                    className="flex h-12 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                  >
                    <option value="Free">Free</option>
                    <option value="annual">Annual Pro</option>
                    <option value="lifetime">Lifetime Pro</option>
                    <option value="activation_code">Activation Code Pro</option>
                  </select>
                </div>

                <Button onClick={handleSaveSettings} className="h-10 text-xs px-4">
                  Save Settings
                </Button>
              </Card>

              {/* Right Column: Theme selection */}
              <div className="space-y-6">
                {/* Theme Selector */}
                <Card className="p-5 bg-white border border-slate-200 shadow-sm space-y-3">
                  <h3 className="text-base font-bold text-slate-900 border-b pb-2 flex items-center gap-1.5">
                    <Palette className="w-4 h-4 text-indigo-500" /> Accent Color
                  </h3>
                  <div className="flex gap-2.5 pt-1">
                    {THEMES.map(theme => (
                      <button
                        key={theme.id}
                        onClick={() => handleThemeSelect(theme.id)}
                        className={cn(
                          "w-8 h-8 rounded-full flex items-center justify-center transition-all hover:scale-105 shadow-sm ring-offset-2",
                          theme.hex,
                          data.themeColor === theme.id ? "ring-2 ring-slate-900" : ""
                        )}
                        title={theme.label}
                      >
                        {data.themeColor === theme.id && <Check className="w-4 h-4 text-white" />}
                      </button>
                    ))}
                  </div>
                </Card>

                {/* Template Selector */}
                <Card className="p-5 bg-white border border-slate-200 shadow-sm space-y-3">
                  <h3 className="text-base font-bold text-slate-900 border-b pb-2 flex items-center gap-1.5">
                    <Layout className="w-4 h-4 text-indigo-500" /> Page Template
                  </h3>
                  <div className="space-y-2 pt-1">
                    {TEMPLATES.map(tpl => (
                      <button
                        key={tpl.id}
                        onClick={() => handleTemplateSelect(tpl.id)}
                        className={cn(
                          "w-full text-left p-3 rounded-xl border border-slate-200 hover:bg-slate-50 transition-all flex items-center justify-between",
                          data.templateId === tpl.id ? "border-indigo-600 bg-indigo-50/20 shadow-sm" : ""
                        )}
                      >
                        <div>
                          <h4 className="text-xs font-bold text-slate-900 capitalize">{tpl.name}</h4>
                          <p className="text-[10px] text-slate-400 mt-0.5 line-clamp-1">{tpl.description}</p>
                        </div>
                        {data.templateId === tpl.id && <CheckCircle2 className="w-4 h-4 text-indigo-600" />}
                      </button>
                    ))}
                  </div>
                </Card>

                {/* Buried storage card in Settings */}
                <Card className="p-5 bg-white border border-slate-200 shadow-sm space-y-3">
                  <h3 className="text-base font-bold text-slate-900 border-b pb-2 flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-indigo-500" /> Cloud Storage
                  </h3>
                  <div className="pt-1">
                    <div className="flex justify-between items-center mb-1.5 text-xs font-semibold text-slate-700">
                      <span>Usage Details</span>
                      <span>{(usedStorage / 1024 / 1024).toFixed(1)}MB / {(storageLimit / 1024 / 1024).toFixed(0)}MB</span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div 
                        className={cn("h-full rounded-full transition-all duration-500", isStorageFull ? "bg-red-500" : "bg-indigo-500")}
                        style={{ width: `${storagePercentage}%` }}
                      />
                    </div>
                    <div className="mt-4 flex flex-col sm:flex-row gap-2">
                      <Button onClick={handleBuyStorage} size="sm" className="h-9 text-xs px-3 bg-indigo-50 text-indigo-750 hover:bg-indigo-100 flex-1">
                        Upgrade Storage
                      </Button>
                      <Button 
                        variant="outline"
                        size="sm" 
                        className="h-9 text-xs px-3 border-dashed flex-1"
                        onClick={() => {
                          if (simulatedUsage !== null) {
                            setSimulatedUsage(null);
                            toast({
                              title: 'Simulation Reset',
                              description: 'Showing actual storage usage.'
                            });
                          } else {
                            setSimulatedUsage(0.95 * storageLimit);
                            toast({
                              title: 'Simulating 95% Storage',
                              description: 'Warning banner is now active on Home Screen.'
                            });
                          }
                        }}
                      >
                        {simulatedUsage !== null ? 'Reset Simulation' : 'Simulate 95%'}
                      </Button>
                    </div>
                  </div>
                </Card>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
