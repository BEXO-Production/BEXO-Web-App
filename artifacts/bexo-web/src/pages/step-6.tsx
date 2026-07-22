import React, { useState, useEffect } from 'react';
import { useOnboarding, AssetMode, AssetData, FileAsset, LinkAsset } from '../context/OnboardingContext';
import { Button, Input, Label, Card } from '../design-system/primitives';
import { ArrowRight, Plus, Pencil, Trash2, GripVertical, CheckCircle2, Upload, FileText, Image as ImageIcon, Link as LinkIcon, AlertCircle, X, ArrowUp, ArrowDown, ChevronLeft, ChevronRight, Eye } from 'lucide-react';
import { cn } from '../design-system/primitives';
import { AssetPreviewModal, PreviewTarget } from '../components/AssetPreviewModal';

import { FREE_STORAGE_BYTES } from '../lib/pricing';

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

const SUMMARY_MAX_LENGTH = 150;

const limitSummary = (value = '') => {
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (normalized.length <= SUMMARY_MAX_LENGTH) return normalized;

  const shortened = normalized.slice(0, SUMMARY_MAX_LENGTH + 1);
  const lastSpace = shortened.lastIndexOf(' ');
  return `${shortened.slice(0, lastSpace > 100 ? lastSpace : SUMMARY_MAX_LENGTH - 1).trimEnd()}…`;
};

export default function Step6Review() {
  const { data, updateData, nextStep } = useOnboarding();
  const [activeTab, setActiveTab] = useState('about');
  
  const [visitedTabs, setVisitedTabs] = useState<Set<string>>(new Set(data.visitedTabs || ['about']));
  
  const [sections, setSections] = useState({
    about: data.aboutEntries,
    education: data.educationEntries,
    experience: data.experienceEntries,
    projects: data.projectEntries,
    certificates: data.certificateEntries,
    achievements: data.achievementEntries,
    research: data.researchEntries,
    skills: data.skillEntries || [],
  });
  const [skillDraft, setSkillDraft] = useState('');
  const [skillCategory, setSkillCategory] = useState<'technical' | 'tools' | 'soft' | 'languages'>('technical');
  
  const [contactData, setContactData] = useState(data.contactData);
  const [editingId, setEditingId] = useState<string | null>(null);
  const isNewEntry = editingId !== null && editingId !== 'about-form' && !sections[activeTab as keyof typeof sections]?.some((e: any) => e.id === editingId);
  const [isSwooshing, setIsSwooshing] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  const [contactErrors, setContactErrors] = useState<any>({});
  const [previewTarget, setPreviewTarget] = useState<PreviewTarget>(null);

  // State for managing custom / extracted links
  const [isAddingLink, setIsAddingLink] = useState(false);
  const [newLinkName, setNewLinkName] = useState('');
  const [newLinkUrl, setNewLinkUrl] = useState('');

  // Sync state when context data finishes fetching asynchronously
  useEffect(() => {
    const aboutList = data.aboutEntries && data.aboutEntries.length > 0
      ? data.aboutEntries.map((entry, index) => (
          index === 0
            ? { ...entry, description: limitSummary(entry.description) }
            : entry
        ))
      : [{ id: '1', title: '', description: '', currentStatus: '' }];
    setSections({
      about: aboutList,
      education: data.educationEntries || [],
      experience: data.experienceEntries || [],
      projects: data.projectEntries || [],
      certificates: data.certificateEntries || [],
      achievements: data.achievementEntries || [],
      research: data.researchEntries || [],
      skills: data.skillEntries || [],
    });
    setContactData(data.contactData);
  }, [data.aboutEntries, data.educationEntries, data.experienceEntries, data.projectEntries, data.certificateEntries, data.achievementEntries, data.researchEntries, data.skillEntries, data.contactData]);

  // Compute total used storage
  const [usedStorage, setUsedStorage] = useState(0);

  useEffect(() => {
    // calculate storage
    let sum = data.resumeFileSize || 0;
    const countAssets = (arr: any[]) => {
      arr.forEach(entry => {
        if (entry.assets) {
          entry.assets.images.forEach((i: FileAsset) => sum += i.sizeBytes);
          entry.assets.pdfs.forEach((p: FileAsset) => sum += p.sizeBytes);
        }
      });
    };
    countAssets(sections.projects);
    countAssets(sections.certificates);
    countAssets(sections.achievements);
    countAssets(sections.research);
    setUsedStorage(sum);
  }, [sections, data.resumeFileSize]);

  useEffect(() => {
    const newVisited = new Set(visitedTabs);
    newVisited.add(activeTab);
    setVisitedTabs(newVisited);
    updateData({ visitedTabs: Array.from(newVisited) });
  }, [activeTab]);

  const storageLimit = data.storageQuotaBytes || FREE_STORAGE_BYTES;
  const storagePercentage = Math.min((usedStorage / storageLimit) * 100, 100);
  const isStorageFull = usedStorage >= storageLimit;

  const handleMove = (index: number, direction: 'up' | 'down') => {
    const list = [...(sections[activeTab as keyof typeof sections] || [])];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= list.length) return;
    
    const temp = list[index];
    list[index] = list[targetIndex];
    list[targetIndex] = temp;

    const updated = { ...sections, [activeTab]: list };
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

    const list = [...(sections[activeTab as keyof typeof sections] || [])];
    const draggedItem = list[dragIndex];
    list.splice(dragIndex, 1);
    list.splice(hoverIndex, 0, draggedItem);

    const updated = { ...sections, [activeTab]: list };
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
    const entry = sections[activeTab as keyof typeof sections].find((e: any) => e.id === id);
    if (entry) {
      setEditingId(id);
      // deep copy assets so we can cancel without mutation
      setEditForm(JSON.parse(JSON.stringify(entry)));
    }
  };

  const handleDelete = (id: string) => {
    const updated = {
      ...sections,
      [activeTab]: sections[activeTab as keyof typeof sections].filter((e: any) => e.id !== id)
    };
    setSections(updated);
    updateContextSections(updated);
  };

  const handleSave = () => {
    // Check if any supporting assets are still uploading in the background
    const isUploadingImages = editForm.assets?.images?.some((img: any) => img.isUploading);
    const isUploadingPdfs = editForm.assets?.pdfs?.some((pdf: any) => pdf.isUploading);
    if (isUploadingImages || isUploadingPdfs) {
      alert("Please wait for your files to finish uploading before saving.");
      return;
    }

    let updated;
    const isNew = !sections[activeTab as keyof typeof sections].some((e: any) => e.id === editingId);
    if (isNew) {
      updated = {
        ...sections,
        [activeTab]: [...sections[activeTab as keyof typeof sections], { ...editForm, id: editingId }]
      };
    } else {
      updated = {
        ...sections,
        [activeTab]: sections[activeTab as keyof typeof sections].map((e: any) => e.id === editingId ? { ...e, ...editForm } : e)
      };
    }
    setSections(updated);
    updateContextSections(updated);
    setEditingId(null);
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
      skillEntries: newSections.skills,
    });
  };

  const validateContact = () => {
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

    setContactErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSaveNewLink = () => {
    if (!newLinkName.trim() || !newLinkUrl.trim()) return;
    
    let formattedUrl = newLinkUrl.trim();
    if (!/^https?:\/\//i.test(formattedUrl)) {
      formattedUrl = `https://${formattedUrl}`;
    }

    const currentLinks = contactData?.customLinks || [];
    const updatedLinks = [...currentLinks, { name: newLinkName.trim(), url: formattedUrl }];
    const updatedContact = { ...contactData, customLinks: updatedLinks };
    setContactData(updatedContact);
    updateData({ contactData: updatedContact });
    
    setNewLinkName('');
    setNewLinkUrl('');
    setIsAddingLink(false);
  };

  const handleRemoveCustomLink = (index: number) => {
    const currentLinks = contactData?.customLinks || [];
    const updatedLinks = currentLinks.filter((_, i) => i !== index);
    const updatedContact = { ...contactData, customLinks: updatedLinks };
    setContactData(updatedContact);
    updateData({ contactData: updatedContact });
  };

  const handleContinue = () => {
    if (!validateContact()) {
      setActiveTab('contact');
      return;
    }
    const formattedPhone = contactData?.phone || data?.phone || '';
    const finalContact = {
      ...contactData,
      phone: formattedPhone
    };
    updateData({ 
      aboutEntries: sections.about,
      educationEntries: sections.education,
      experienceEntries: sections.experience,
      projectEntries: sections.projects,
      certificateEntries: sections.certificates,
      achievementEntries: sections.achievements,
      researchEntries: sections.research,
      skillEntries: sections.skills,
      phone: formattedPhone,
      contactData: finalContact
    });
    // Trigger swoosh animation, then navigate
    setIsSwooshing(true);
    setTimeout(() => {
      nextStep(6);
    }, 600);
  };


  // Asset Handlers for the form
  const handleAssetModeChange = (mode: AssetMode) => {
    setEditForm({ ...editForm, assets: { ...editForm.assets, mode } });
  };

  const handleFileUpload = (type: 'images' | 'pdfs') => {
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
        alert(`Only ${slotsLeft} more ${type === 'images' ? 'image' : 'PDF'} slot(s) available — uploading the first ${slotsLeft}.`);
      }
      const files = picked.slice(0, slotsLeft);
      if (files.length === 0) return;

      const token = localStorage.getItem('token');

      files.forEach((file, idx) => {
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
            alert(`Upload failed for "${file.name}": ${err.message || err}`);
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

  const handleMoveAsset = (type: 'images' | 'pdfs' | 'links', fromIndex: number, direction: -1 | 1) => {
    const items = [...(editForm.assets[type] || [])];
    const toIndex = fromIndex + direction;
    if (toIndex < 0 || toIndex >= items.length) return;
    const [moved] = items.splice(fromIndex, 1);
    items.splice(toIndex, 0, moved);
    setEditForm({
      ...editForm,
      assets: {
        ...editForm.assets,
        [type]: items
      }
    });
  };

  const handleReorderAsset = (type: 'images' | 'pdfs' | 'links', fromIndex: number, toIndex: number) => {
    const items = [...(editForm.assets[type] || [])];
    if (fromIndex === toIndex || fromIndex < 0 || fromIndex >= items.length || toIndex < 0 || toIndex >= items.length) return;
    const [moved] = items.splice(fromIndex, 1);
    items.splice(toIndex, 0, moved);
    setEditForm({
      ...editForm,
      assets: {
        ...editForm.assets,
        [type]: items
      }
    });
  };

  const handleAddLink = () => {
    const current = editForm.assets?.links || [];
    if (current.length >= 3) return;
    const newLink = { id: Date.now().toString(), name: '', url: '' };
    setEditForm({
      ...editForm,
      assets: { ...editForm.assets, links: [...current, newLink] }
    });
  };

  const renderAssetEditor = () => {
    if (!['projects', 'certificates', 'achievements', 'research'].includes(activeTab)) return null;
    const assets = editForm.assets as AssetData;
    if (!assets) return null; // safety

    return (
      <div className="mt-6 pt-6 border-t border-slate-100">
        <div className="flex items-center gap-2 mb-1">
          <Label className="text-base block">Supporting Materials</Label>
        </div>
        <p className="text-xs text-slate-400 mb-3">Add images, documents, or links to showcase your work. Drag items or use arrows to reorder.</p>
        
        {/* Mode Toggle */}
        <div className="flex p-1 bg-slate-100 rounded-lg mb-4 w-fit">
          <button type="button" onClick={() => handleAssetModeChange('images')} className={cn("flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors", assets.mode === 'images' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700")}>
            <ImageIcon className="w-4 h-4" /> Images
          </button>
          <button type="button" onClick={() => handleAssetModeChange('pdfs')} className={cn("flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors", assets.mode === 'pdfs' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700")}>
            <FileText className="w-4 h-4" /> PDFs
          </button>
          <button type="button" onClick={() => handleAssetModeChange('links')} className={cn("flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors", assets.mode === 'links' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700")}>
            <LinkIcon className="w-4 h-4" /> Links
          </button>
        </div>

        {/* Content based on mode */}
        <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 min-h-[140px]">
          {assets.mode === 'images' && (
            <div className="space-y-3">
              <div className="flex justify-between items-center flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-600">{(assets.images || []).length} of 5 images used</span>
                  {(assets.images || []).length > 1 && (
                    <span className="text-[11px] text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full flex items-center gap-1 font-medium">
                      <GripVertical className="w-3 h-3" /> Reorder enabled
                    </span>
                  )}
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => handleFileUpload('images')} disabled={(assets.images || []).length >= 5}>
                  <Upload className="w-4 h-4 mr-2" /> Attach Image
                </Button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
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
                      "relative group bg-white border rounded-xl p-2 flex flex-col items-center justify-center h-28 overflow-hidden transition-all duration-200 shadow-sm hover:shadow-md",
                      idx === 0 ? "border-indigo-400 ring-2 ring-indigo-400/20" : "border-slate-200 hover:border-slate-300",
                      (assets.images || []).length > 1 ? "cursor-grab active:cursor-grabbing" : ""
                    )}
                  >
                    {/* Order Tag / Cover Label */}
                    <div className="absolute top-1.5 left-1.5 z-10 flex items-center gap-1">
                      <span className={cn(
                        "text-[10px] font-bold px-1.5 py-0.5 rounded-md shadow-sm",
                        idx === 0 ? "bg-indigo-600 text-white" : "bg-slate-900/70 text-white"
                      )}>
                        {idx === 0 ? "1st (Cover)" : `#${idx + 1}`}
                      </span>
                    </div>

                    {/* Delete button top-right */}
                    <button 
                      type="button" 
                      onClick={(e) => handleRemoveAsset('images', img.id, e)} 
                      className="absolute top-1.5 right-1.5 w-6 h-6 bg-white/95 border border-slate-200 rounded-full flex items-center justify-center text-red-500 opacity-90 group-hover:opacity-100 transition-opacity shadow-sm hover:bg-red-50 z-30 cursor-pointer"
                      title="Remove image"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>

                    {/* Image Preview */}
                    {img.url && (img.url.startsWith('data:image/') || img.url.startsWith('http') || img.url.startsWith('/')) ? (
                      <div
                        onClick={() => setPreviewTarget({ type: 'images', index: idx, items: assets.images })}
                        className="w-full h-full flex items-center justify-center pt-2 cursor-pointer group/img relative"
                        title="Click to preview image"
                      >
                        <img src={img.url} alt={img.name} className="w-full h-full object-cover rounded-lg group-hover/img:brightness-90 transition-all" />
                        <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover/img:opacity-100 flex items-center justify-center transition-opacity rounded-lg">
                          <Eye className="w-5 h-5 text-white drop-shadow-md" />
                        </div>
                      </div>
                    ) : (
                      <div 
                        onClick={() => setPreviewTarget({ type: 'images', index: idx, items: assets.images })}
                        className="w-full h-full flex items-center justify-center cursor-pointer"
                      >
                        <ImageIcon className="w-8 h-8 text-slate-300" />
                      </div>
                    )}

                    {/* Bottom controls overlay */}
                    <div className="absolute bottom-0 inset-x-0 bg-slate-900/85 backdrop-blur-sm py-1 px-1.5 flex items-center justify-between z-10 text-white">
                      <span className="text-[9px] font-medium text-slate-200 truncate max-w-[50%]">
                        {(img.sizeBytes / 1024 / 1024).toFixed(1)}MB
                      </span>
                      
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setPreviewTarget({ type: 'images', index: idx, items: assets.images })}
                          className="w-5 h-5 rounded bg-indigo-600/80 hover:bg-indigo-600 flex items-center justify-center transition-colors cursor-pointer"
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
                              className="w-5 h-5 rounded bg-white/20 hover:bg-white/40 disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center transition-colors cursor-pointer"
                              title="Move left"
                            >
                              <ChevronLeft className="w-3.5 h-3.5 text-white" />
                            </button>
                            <button
                              type="button"
                              disabled={idx === (assets.images || []).length - 1}
                              onClick={() => handleMoveAsset('images', idx, 1)}
                              className="w-5 h-5 rounded bg-white/20 hover:bg-white/40 disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center transition-colors cursor-pointer"
                              title="Move right"
                            >
                              <ChevronRight className="w-3.5 h-3.5 text-white" />
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
            <div className="space-y-3">
              <div className="flex justify-between items-center flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-600">{(assets.pdfs || []).length} of 2 PDFs used</span>
                  {(assets.pdfs || []).length > 1 && (
                    <span className="text-[11px] text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full flex items-center gap-1 font-medium">
                      <GripVertical className="w-3 h-3" /> Reorder enabled
                    </span>
                  )}
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => handleFileUpload('pdfs')} disabled={(assets.pdfs || []).length >= 2}>
                  <Upload className="w-4 h-4 mr-2" /> Attach PDF
                </Button>
              </div>
              <div className="flex flex-col gap-2">
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
                      "flex items-center justify-between bg-white border rounded-xl px-3 py-2.5 shadow-sm transition-all duration-200 hover:border-slate-300",
                      idx === 0 ? "border-indigo-300 bg-indigo-50/20" : "border-slate-200"
                    )}
                  >
                    <div className="flex items-center gap-3 overflow-hidden flex-1">
                      <div className="flex items-center gap-1.5 shrink-0 text-slate-400">
                        {(assets.pdfs || []).length > 1 && (
                          <GripVertical className="w-4 h-4 cursor-grab text-slate-400 hover:text-slate-600" />
                        )}
                        <span className={cn(
                          "text-[10px] font-bold px-1.5 py-0.5 rounded-md",
                          idx === 0 ? "bg-indigo-600 text-white" : "bg-slate-200 text-slate-700"
                        )}>
                          {idx === 0 ? "1st" : `#${idx + 1}`}
                        </span>
                      </div>

                      <div
                        onClick={() => setPreviewTarget({ type: 'pdfs', index: idx, items: assets.pdfs })}
                        className="flex items-center gap-2 overflow-hidden hover:underline min-w-0 cursor-pointer group/pdf"
                        title="Click to preview PDF"
                      >
                        <FileText className="w-5 h-5 text-red-500 shrink-0 group-hover/pdf:scale-110 transition-transform" />
                        <span className="text-sm font-medium text-slate-800 truncate">{pdf.name}</span>
                      </div>
                      <span className="text-xs text-slate-400 shrink-0 tabular-nums">{(pdf.sizeBytes / 1024 / 1024).toFixed(1)}MB</span>
                    </div>

                    <div className="flex items-center gap-1 shrink-0 ml-2">
                      <button
                        type="button"
                        onClick={() => setPreviewTarget({ type: 'pdfs', index: idx, items: assets.pdfs })}
                        className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                        title="Preview PDF"
                      >
                        <Eye className="w-4 h-4" />
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
                            <ArrowUp className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === (assets.pdfs || []).length - 1}
                            onClick={() => handleMoveAsset('pdfs', idx, 1)}
                            className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-20 disabled:pointer-events-none transition-colors cursor-pointer"
                            title="Move down"
                          >
                            <ArrowDown className="w-4 h-4" />
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={(e) => handleRemoveAsset('pdfs', pdf.id, e)}
                        className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                        title="Remove PDF"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {assets.mode === 'links' && (
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-500">{assets.links.length} of 3 links used</span>
                <Button type="button" variant="outline" size="sm" onClick={handleAddLink} disabled={assets.links.length >= 3}>
                  <Plus className="w-4 h-4 mr-2" /> Add Link
                </Button>
              </div>
              <div className="flex flex-col gap-3">
                {assets.links.map((link, idx) => (
                  <div key={link.id} className="flex items-start gap-2">
                    <div className="flex-1 space-y-2">
                      <Input 
                        placeholder="Link title (e.g. Live Demo)" 
                        value={link.name} 
                        onChange={e => {
                          const newLinks = [...assets.links];
                          newLinks[idx].name = e.target.value;
                          setEditForm({...editForm, assets: {...assets, links: newLinks}});
                        }} 
                        className="h-9 text-sm"
                      />
                      <Input 
                        placeholder="https://..." 
                        value={link.url} 
                        onChange={e => {
                          const newLinks = [...assets.links];
                          newLinks[idx].url = e.target.value;
                          setEditForm({...editForm, assets: {...assets, links: newLinks}});
                        }} 
                        className="h-9 text-sm"
                      />
                    </div>
                    <div className="flex items-center gap-1 mt-1">
                      <button
                        type="button"
                        onClick={() => setPreviewTarget({ type: 'links', index: idx, items: assets.links })}
                        className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                        title="Preview link"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button type="button" onClick={(e) => handleRemoveAsset('links', link.id, e)} className="text-slate-400 hover:text-red-500 p-2 cursor-pointer" title="Remove link">
                        <Trash2 className="w-4 h-4" />
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
    switch (activeTab) {
      case 'about':
        return (
          <>
            <div className="space-y-2">
              <Label>Title / Role</Label>
              <Input value={editForm.title || ''} onChange={e => setEditForm({...editForm, title: e.target.value})} placeholder="e.g. Frontend Developer Intern" />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <textarea value={editForm.description || ''} onChange={e => setEditForm({...editForm, description: e.target.value})} className="flex min-h-[100px] w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 resize-none" placeholder="Write a brief description..." />
            </div>
          </>
        );
      case 'education':
        return (
          <>
            <div className="space-y-2">
              <Label>Institution</Label>
              <Input value={editForm.institution || ''} onChange={e => setEditForm({...editForm, institution: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label>Degree</Label>
              <Input value={editForm.degree || ''} onChange={e => setEditForm({...editForm, degree: e.target.value})} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start Year</Label>
                <Input value={editForm.startYear || ''} onChange={e => setEditForm({...editForm, startYear: e.target.value})} placeholder="e.g. 2020" />
              </div>
              <div className="space-y-2">
                <Label>End Year</Label>
                <div className="flex gap-2 items-center">
                  <Input 
                    value={editForm.endYear === 'Present' ? '' : (editForm.endYear || '')} 
                    onChange={e => setEditForm({...editForm, endYear: e.target.value})} 
                    disabled={editForm.endYear === 'Present'} 
                    placeholder="e.g. 2024" 
                    className="flex-1"
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
            <div className="space-y-2">
              <Label>Grade / CGPA</Label>
              <Input value={editForm.grade || ''} onChange={e => setEditForm({...editForm, grade: e.target.value})} />
            </div>
          </>
        );
      case 'experience':
        return (
          <>
            <div className="space-y-2">
              <Label>Company</Label>
              <Input value={editForm.company || ''} onChange={e => setEditForm({...editForm, company: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Input value={editForm.role || ''} onChange={e => setEditForm({...editForm, role: e.target.value})} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start Date / Year</Label>
                <Input value={editForm.startYear || ''} onChange={e => setEditForm({...editForm, startYear: e.target.value})} placeholder="e.g. 01/2024" />
              </div>
              <div className="space-y-2">
                <Label>End Date / Year</Label>
                <div className="flex gap-2 items-center">
                  <Input 
                    value={editForm.endYear === 'Present' ? '' : (editForm.endYear || '')} 
                    onChange={e => setEditForm({...editForm, endYear: e.target.value})} 
                    disabled={editForm.endYear === 'Present'} 
                    placeholder="e.g. 11/2025" 
                    className="flex-1"
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
            <div className="space-y-2">
              <Label>Description</Label>
              <textarea value={editForm.description || ''} onChange={e => setEditForm({...editForm, description: e.target.value})} className="flex min-h-[100px] w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 resize-none" />
            </div>
          </>
        );
      case 'projects':
        return (
          <>
            {renderAssetEditor()}
            <div className="space-y-2">
              <Label>Project Title</Label>
              <Input value={editForm.title || ''} onChange={e => setEditForm({...editForm, title: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <textarea value={editForm.description || ''} onChange={e => setEditForm({...editForm, description: e.target.value})} className="flex min-h-[80px] w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 resize-none" />
            </div>
            <div className="space-y-2">
              <Label>Technologies</Label>
              <Input value={editForm.tech || ''} onChange={e => setEditForm({...editForm, tech: e.target.value})} />
            </div>
          </>
        );
      case 'certificates':
      case 'achievements':
      case 'research':
        return (
          <>
            {renderAssetEditor()}
            <div className="space-y-2">
              <Label>Title</Label>
              <Input value={editForm.title || ''} onChange={e => setEditForm({...editForm, title: e.target.value})} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{activeTab === 'certificates' ? 'Issuer' : 'Organization'}</Label>
                <Input value={editForm.organization || editForm.issuer || ''} onChange={e => setEditForm({...editForm, [activeTab === 'certificates' ? 'issuer' : 'organization']: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label>Date</Label>
                <Input type="date" value={editForm.date || ''} onChange={e => setEditForm({...editForm, date: e.target.value})} />
              </div>
            </div>
          </>
        );
      default: return null;
    }
  };

  const renderPreview = (entry: any) => {
    switch (activeTab) {
      case 'education': {
        const start = entry.startYear || '';
        const end = entry.endYear || '';
        const yearStr = (start && end) ? `${start} - ${end}` : (entry.year || '');
        return `${entry.degree}${yearStr ? ` • ${yearStr}` : ''}${entry.grade ? ` • ${entry.grade}` : ''}`;
      }
      case 'experience': {
        const start = entry.startYear || '';
        const end = entry.endYear || '';
        const durationStr = (start && end) ? `${start} - ${end}` : (entry.duration || '');
        return `${entry.role}${durationStr ? ` • ${durationStr}` : ''}`;
      }
      case 'projects': return `${entry.tech}`;
      case 'certificates': return `${entry.issuer} • ${entry.date}`;
      case 'achievements': 
      case 'research': return `${entry.organization} • ${entry.date}`;
      default: return entry.description;
    }
  };

  const renderAssetPreviewIcon = (entry: any) => {
    if (!entry.assets) return null;
    const a = entry.assets as AssetData;
    if (a.images.length > 0) return <div className="flex items-center gap-1 text-xs text-indigo-500 mt-2"><ImageIcon className="w-3 h-3"/> {a.images.length} Images</div>;
    if (a.pdfs.length > 0) return <div className="flex items-center gap-1 text-xs text-red-600 mt-2"><FileText className="w-3 h-3"/> {a.pdfs.length} PDFs</div>;
    if (a.links.length > 0) return <div className="flex items-center gap-1 text-xs text-emerald-600 mt-2"><LinkIcon className="w-3 h-3"/> {a.links.length} Links</div>;
    return null;
  };

  const allTabsVisited = visitedTabs.size === TABS.length;

  return (
    <div className="flex flex-col h-full w-full max-w-4xl mx-auto pb-20 md:pb-0 min-w-0">
      <div className="mb-6 text-center md:text-left flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl sm:text-3xl md:text-4xl font-bold text-slate-900 mb-2 tracking-tight">
            Review & Verify
          </h1>
          <p className="text-slate-500 text-base">
            Please verify the information extracted from your resume. Visit all tabs to continue.
          </p>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 flex-1">
        {/* Tabs Sidebar */}
        <div className="w-full lg:w-48 shrink-0 flex gap-1.5 lg:flex-col overflow-x-auto pb-2 lg:pb-0 hide-scrollbar">
          {TABS.map((tab) => {
            const isVisited = visitedTabs.has(tab.id);
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all whitespace-nowrap lg:whitespace-normal border",
                  activeTab === tab.id 
                    ? "bg-slate-900 text-white border-slate-900 shadow-md" 
                    : "bg-white text-slate-600 hover:bg-slate-50 border-slate-200"
                )}
              >
                <span>{tab.label}</span>
                {isVisited && <CheckCircle2 className={cn("w-3.5 h-3.5 ml-2 shrink-0", activeTab === tab.id ? "text-slate-400" : "text-emerald-500")} />}
              </button>
            );
          })}
        </div>

        <div className="flex-1 bg-white p-5 md:p-6 rounded-2xl border border-slate-200 shadow-sm min-h-[400px] min-w-0">
          {activeTab === 'contact' ? (
            <div className="space-y-6 max-w-xl animate-in fade-in">
              <h3 className="text-xl font-bold text-slate-900 mb-4">Contact Information</h3>
              <div className="space-y-4">
                {/* Email Field */}
                <div className="space-y-2">
                  <Label className={contactErrors.email ? "text-red-500 font-semibold" : ""}>Email (Required)</Label>
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
                <div className="space-y-2">
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
                      className={cn("pl-12 text-sm font-medium tracking-wide h-12 rounded-xl", contactErrors.phone ? "border-red-500 focus-visible:ring-red-500" : "")}
                    />
                  </div>
                  {contactErrors.phone && (
                    <p className="text-xs font-medium text-red-500 flex items-center gap-1 mt-1">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      {contactErrors.phone}
                    </p>
                  )}
                </div>

                {/* LinkedIn Field */}
                <div className="space-y-2">
                  <Label>LinkedIn URL</Label>
                  <Input 
                    value={contactData?.linkedin || ''} 
                    onChange={e => setContactData({...contactData, linkedin: e.target.value})} 
                    placeholder="linkedin.com/in/username" 
                  />
                </div>

                {/* GitHub Field */}
                <div className="space-y-2">
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
                    {!isAddingLink && (
                      <Button 
                        type="button" 
                        variant="outline" 
                        size="sm"
                        onClick={() => setIsAddingLink(true)}
                        className="text-indigo-600 border-indigo-200 hover:bg-indigo-50 text-xs font-semibold"
                      >
                        <Plus className="w-3.5 h-3.5 mr-1" /> Add Link
                      </Button>
                    )}
                  </div>

                  {/* Add Custom Link Form */}
                  {isAddingLink && (
                    <Card className="p-3.5 border-indigo-200 bg-indigo-50/40 space-y-3 animate-in fade-in">
                      <p className="text-xs font-semibold text-indigo-900">Add Custom Link</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <Input 
                          placeholder="Link Title (e.g. Personal Portfolio)" 
                          value={newLinkName} 
                          onChange={e => setNewLinkName(e.target.value)} 
                          className="h-9 text-xs"
                        />
                        <Input 
                          placeholder="URL (e.g. kavin.cyou or https://...)" 
                          value={newLinkUrl} 
                          onChange={e => setNewLinkUrl(e.target.value)} 
                          className="h-9 text-xs"
                        />
                      </div>
                      <div className="flex justify-end gap-2 pt-1">
                        <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setIsAddingLink(false); setNewLinkName(''); setNewLinkUrl(''); }}>
                          Cancel
                        </Button>
                        <Button type="button" size="sm" className="h-8 text-xs bg-indigo-600 hover:bg-indigo-700 text-white" onClick={handleSaveNewLink}>
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
                            onClick={() => handleRemoveCustomLink(idx)}
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
              </div>
            </div>
          ) : activeTab === 'skills' ? (
            <div className="space-y-6 animate-in fade-in">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 border-b pb-3">
                <div>
                  <h3 className="text-xl font-bold text-slate-900">Skills</h3>
                  <p className="text-sm text-slate-500 mt-1">
                    Extracted from your resume — add, remove, or regroup. Max {MAX_SKILLS_UI}.
                  </p>
                </div>
                <p className="text-xs font-semibold text-slate-400">{(sections.skills || []).length}/{MAX_SKILLS_UI}</p>
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <Input
                  value={skillDraft}
                  onChange={(e) => setSkillDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const name = skillDraft.trim();
                      if (!name || (sections.skills || []).length >= MAX_SKILLS_UI) return;
                      if ((sections.skills || []).some((s: any) => s.name.toLowerCase() === name.toLowerCase())) {
                        setSkillDraft('');
                        return;
                      }
                      const next = {
                        ...sections,
                        skills: [
                          ...(sections.skills || []),
                          { id: String(Date.now()), name, category: skillCategory },
                        ],
                      };
                      setSections(next);
                      updateContextSections(next);
                      setSkillDraft('');
                    }
                  }}
                  placeholder="Type a skill and press Enter"
                  className="flex-1"
                />
                <select
                  value={skillCategory}
                  onChange={(e) => setSkillCategory(e.target.value as typeof skillCategory)}
                  className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700"
                >
                  {SKILL_CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
                <Button
                  type="button"
                  onClick={() => {
                    const name = skillDraft.trim();
                    if (!name || (sections.skills || []).length >= MAX_SKILLS_UI) return;
                    if ((sections.skills || []).some((s: any) => s.name.toLowerCase() === name.toLowerCase())) {
                      setSkillDraft('');
                      return;
                    }
                    const next = {
                      ...sections,
                      skills: [
                        ...(sections.skills || []),
                        { id: String(Date.now()), name, category: skillCategory },
                      ],
                  };
                    setSections(next);
                    updateContextSections(next);
                    setSkillDraft('');
                  }}
                >
                  <Plus className="w-4 h-4 mr-1" /> Add
                </Button>
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
                            className="text-slate-400 hover:text-red-500"
                            onClick={() => {
                              const next = {
                                ...sections,
                                skills: (sections.skills || []).filter((s: any) => s.id !== skill.id),
                              };
                              setSections(next);
                              updateContextSections(next);
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
                <p className="text-sm text-slate-400 italic">No skills yet — add a few so your portfolio feels hire-ready.</p>
              )}
            </div>
          ) : activeTab === 'about' ? (
            <div className="space-y-6 animate-in fade-in">
              <div className="flex justify-between items-center border-b pb-3 mb-4">
                <h3 className="text-xl font-bold text-slate-900">About Details</h3>
                {editingId !== 'about-form' && (
                  <Button variant="outline" size="sm" onClick={() => {
                    setEditingId('about-form');
                    setEditForm({
                      name: data.name || '',
                      title: sections.about[0]?.title || '',
                      description: sections.about[0]?.description || '',
                      currentStatus: sections.about[0]?.currentStatus || '',
                      nationality: data.nationality || 'India',
                      pronouns: data.pronouns || 'She/Her'
                    });
                  }}>
                    <Pencil className="w-4 h-4 mr-1.5" /> Edit About Info
                  </Button>
                )}
              </div>

              {editingId === 'about-form' ? (
                <Card className="p-5 border-blue-200 ring-4 ring-blue-50 space-y-4 animate-in fade-in">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Full Name</Label>
                      <Input value={editForm.name || ''} onChange={e => setEditForm({...editForm, name: e.target.value})} />
                    </div>
                    <div className="space-y-2">
                      <Label>Title / Role</Label>
                      <Input value={editForm.title || ''} onChange={e => setEditForm({...editForm, title: e.target.value})} placeholder="e.g. Frontend Developer Intern" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Summary of the Fetched Data</Label>
                    <textarea 
                      value={editForm.description || ''} 
                      onChange={e => setEditForm({...editForm, description: e.target.value})} 
                      maxLength={SUMMARY_MAX_LENGTH}
                      className="flex min-h-[100px] w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 resize-none animate-in fade-in" 
                      placeholder="Write a professional summary..."
                    />
                    <p className="text-right text-[11px] text-slate-400">
                      {(editForm.description || '').length}/{SUMMARY_MAX_LENGTH} characters
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>Current Education or Work</Label>
                    <Input value={editForm.currentStatus || ''} onChange={e => setEditForm({...editForm, currentStatus: e.target.value})} placeholder="e.g. Studying BS Statistics at PSG College" />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Nationality</Label>
                      <Input value={editForm.nationality || ''} onChange={e => setEditForm({...editForm, nationality: e.target.value})} />
                    </div>
                    <div className="space-y-2">
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
                        className="flex h-12 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
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

                  <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                    <Button variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
                    <Button onClick={() => {
                      const summary = limitSummary(editForm.description);
                      updateData({
                        name: editForm.name,
                        firstName: editForm.name ? editForm.name.split(' ')[0] : '',
                        lastName: editForm.name ? editForm.name.split(' ').slice(1).join(' ') : '',
                        nationality: editForm.nationality,
                        pronouns: editForm.pronouns,
                        aboutEntries: [{ id: '1', title: editForm.title, description: summary, currentStatus: editForm.currentStatus }]
                      });
                      setSections(prev => ({
                        ...prev,
                        about: [{ id: '1', title: editForm.title, description: summary, currentStatus: editForm.currentStatus }]
                      }));
                      setEditingId(null);
                    }}>Save Changes</Button>
                  </div>
                </Card>
              ) : (
                <div className="space-y-6 animate-in fade-in">
                  {/* Rich details layout */}
                  <div className="bg-slate-50 border border-slate-150 rounded-2xl p-6 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-50 rounded-full blur-xl translate-x-4 -translate-y-4 opacity-50"></div>
                    <div className="relative z-10 space-y-4">
                      <div>
                        <span className="text-[10px] uppercase tracking-wider text-indigo-500 font-bold bg-indigo-50 px-2.5 py-1 rounded-full">Name</span>
                        <h4 className="text-2xl font-serif font-bold text-slate-900 mt-1">{data.name || <span className="text-slate-400 italic">No name provided</span>}</h4>
                      </div>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                        <div>
                          <span className="text-[10px] uppercase tracking-wider text-indigo-500 font-bold bg-indigo-50 px-2.5 py-1 rounded-full">Title / Role</span>
                          <p className="text-base font-semibold text-slate-800 mt-1.5">{sections.about[0]?.title || <span className="text-slate-400 italic">No title provided</span>}</p>
                        </div>
                        <div>
                          <span className="text-[10px] uppercase tracking-wider text-indigo-500 font-bold bg-indigo-50 px-2.5 py-1 rounded-full">Current Education / Work</span>
                          <p className="text-base font-semibold text-slate-800 mt-1.5">{sections.about[0]?.currentStatus || <span className="text-slate-400 italic">No current education or work details</span>}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <span className="text-[10px] uppercase tracking-wider text-indigo-500 font-bold bg-indigo-50 px-2.5 py-1 rounded-full">Summary of the Fetched Data</span>
                    <Card className="p-4 bg-white border border-slate-200 mt-2">
                      <p className="text-sm text-slate-600 leading-relaxed font-normal whitespace-pre-wrap">
                        {sections.about[0]?.description || <span className="text-slate-400 italic">No summary provided. Upload your resume or click Edit to add one.</span>}
                      </p>
                    </Card>
                  </div>

                  <div className="border-t border-slate-150 pt-4">
                    <span className="text-[10px] uppercase tracking-wider text-indigo-500 font-bold bg-indigo-50 px-2.5 py-1 rounded-full">Other Basic Details</span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
                      <div className="bg-slate-50/50 border border-slate-150 p-3.5 rounded-xl flex items-center justify-between">
                        <span className="text-xs text-slate-500">Nationality</span>
                        <span className="text-sm font-semibold text-slate-800">{data.nationality || '—'}</span>
                      </div>
                      <div className="bg-slate-50/50 border border-slate-150 p-3.5 rounded-xl flex items-center justify-between">
                        <span className="text-xs text-slate-500">Pronouns</span>
                        <span className="text-sm font-semibold text-slate-800">{data.pronouns || '—'}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4 animate-in fade-in">
              <h3 className="text-xl font-bold text-slate-900 mb-4 capitalize">{activeTab} Details</h3>
               {sections[activeTab as keyof typeof sections].map((entry: any, idx: number) => (
                <div 
                  key={entry.id}
                  draggable={editingId === null}
                  onDragStart={(e) => handleDragStart(e, idx)}
                  onDragOver={(e) => handleDragOver(e)}
                  onDrop={(e) => handleDrop(e, idx)}
                  className="transition-all duration-200"
                >
                  {editingId === entry.id ? (
                    <Card className="p-5 border-blue-200 ring-4 ring-blue-50">
                      <div className="space-y-4">
                        {renderFields()}
                        <div className="flex justify-end gap-2 pt-4">
                          <Button variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
                          <Button onClick={handleSave}>Save Changes</Button>
                        </div>
                      </div>
                    </Card>
                  ) : (
                    <Card className="p-4 flex items-start gap-4 group hover:border-indigo-200 transition-colors w-full min-w-0 overflow-hidden">
                      <div className="mt-1 cursor-grab text-slate-355 hover:text-indigo-500 hidden sm:block active:cursor-grabbing">
                        <GripVertical className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold text-slate-900 truncate w-full">{entry.title || entry.institution || entry.company}</h4>
                        <p className="text-sm text-slate-600 mt-1 leading-relaxed line-clamp-2">
                          {renderPreview(entry) || <span className="text-slate-400 italic">No details provided</span>}
                        </p>
                        {renderAssetPreviewIcon(entry)}
                      </div>
                      <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                        {idx > 0 && (
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-slate-400 hover:text-slate-605" onClick={() => handleMove(idx, 'up')}>
                            <ArrowUp className="w-4 h-4" />
                          </Button>
                        )}
                        {idx < sections[activeTab as keyof typeof sections].length - 1 && (
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-slate-400 hover:text-slate-605" onClick={() => handleMove(idx, 'down')}>
                            <ArrowDown className="w-4 h-4" />
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => handleEdit(entry.id)}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => handleDelete(entry.id)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </Card>
                  )}
                </div>
              ))}

              {isNewEntry ? (
                <Card className="p-5 border-blue-200 ring-4 ring-blue-50 animate-in fade-in">
                  <div className="space-y-4">
                    {renderFields()}
                    <div className="flex justify-end gap-2 pt-4 border-t mt-2">
                      <Button variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
                      <Button onClick={handleSave}>Save Changes</Button>
                    </div>
                  </div>
                </Card>
              ) : (
                editingId === null && (
                  <Button 
                    variant="outline" 
                    className="w-full border-dashed border-2 h-14 text-slate-500 hover:text-indigo-500 hover:border-indigo-200 hover:bg-indigo-50/50"
                    onClick={handleAdd}
                  >
                    <Plus className="w-5 h-5 mr-2" />
                    Add New {activeTab.slice(0, -1)}
                  </Button>
                )
              )}
            </div>
          )}
        </div>
      </div>

      <div className="mt-8 pt-6 border-t border-slate-200 flex flex-col md:flex-row items-center justify-between gap-4 onboarding-cta">
        <p className="text-sm text-slate-500 text-center md:text-left">
          {!allTabsVisited ? `Please visit all ${TABS.length} sections to continue.` : 'All sections reviewed!'}
        </p>
        <button
          type="button"
          className={`w-full md:w-auto h-14 px-8 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl font-semibold text-base transition-all duration-200 flex items-center justify-center gap-3 group disabled:opacity-50 disabled:pointer-events-none cursor-pointer shadow-lg shadow-slate-900/20 btn-continue-wrap${isSwooshing ? ' is-swooshing' : ''}`}
          onClick={handleContinue}
          disabled={!allTabsVisited || editingId !== null || isSwooshing}
        >
          <div className="w-9 h-9 bg-indigo-500 rounded-xl flex items-center justify-center arrow-box shrink-0">
            <ArrowRight className="w-5 h-5 text-white" />
          </div>
          <span className="btn-label">Verify & Continue</span>
        </button>
      </div>

      {/* Instant In-Browser Asset Preview Modal */}
      <AssetPreviewModal target={previewTarget} onClose={() => setPreviewTarget(null)} />
    </div>
  );
}
