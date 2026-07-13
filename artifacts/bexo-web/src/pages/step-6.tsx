import React, { useState, useEffect } from 'react';
import { useOnboarding, AssetMode, AssetData, FileAsset, LinkAsset } from '../context/OnboardingContext';
import { Button, Input, Label, Card } from '../design-system/primitives';
import { ArrowRight, Plus, Pencil, Trash2, GripVertical, CheckCircle2, Upload, FileText, Image as ImageIcon, Link as LinkIcon, AlertCircle, X, ArrowUp, ArrowDown } from 'lucide-react';
import { cn } from '../design-system/primitives';

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

const MAX_STORAGE_BYTES = 50 * 1024 * 1024; // 50MB

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
  });
  
  const [contactData, setContactData] = useState(data.contactData);
  const [editingId, setEditingId] = useState<string | null>(null);
  const isNewEntry = editingId !== null && editingId !== 'about-form' && !sections[activeTab as keyof typeof sections]?.some((e: any) => e.id === editingId);
  const [isSwooshing, setIsSwooshing] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  const [contactErrors, setContactErrors] = useState<any>({});

  // Sync state when context data finishes fetching asynchronously
  useEffect(() => {
    const aboutList = data.aboutEntries && data.aboutEntries.length > 0
      ? data.aboutEntries
      : [{ id: '1', title: '', description: '', currentStatus: '' }];
    setSections({
      about: aboutList,
      education: data.educationEntries || [],
      experience: data.experienceEntries || [],
      projects: data.projectEntries || [],
      certificates: data.certificateEntries || [],
      achievements: data.achievementEntries || [],
      research: data.researchEntries || [],
    });
    setContactData(data.contactData);
  }, [data.aboutEntries, data.educationEntries, data.experienceEntries, data.projectEntries, data.certificateEntries, data.achievementEntries, data.researchEntries, data.contactData]);

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

  const storagePercentage = Math.min((usedStorage / MAX_STORAGE_BYTES) * 100, 100);
  const isStorageFull = usedStorage >= MAX_STORAGE_BYTES;

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
    });
  };

  const validateContact = () => {
    const errors: any = {};
    if (!contactData.email || !/^\S+@\S+\.\S+$/.test(contactData.email)) {
      errors.email = 'Valid email is required';
    }
    setContactErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleContinue = () => {
    if (!validateContact()) {
      setActiveTab('contact');
      return;
    }
    updateData({ 
      aboutEntries: sections.about,
      educationEntries: sections.education,
      experienceEntries: sections.experience,
      projectEntries: sections.projects,
      certificateEntries: sections.certificates,
      achievementEntries: sections.achievements,
      researchEntries: sections.research,
      phone: contactData.phone || data.phone || '',
      contactData
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
      if (usedStorage + sizeBytes > MAX_STORAGE_BYTES) {
        alert("Uploading this file exceeds the 50MB storage quota.");
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
        alert(`Failed to upload file: ${err.message || err}`);
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
    if (editForm.assets.links.length >= 3) return;
    const newLink: LinkAsset = { id: Date.now().toString(), name: 'New Link', url: '' };
    setEditForm({
      ...editForm,
      assets: { ...editForm.assets, links: [...editForm.assets.links, newLink] }
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
        <p className="text-xs text-slate-400 mb-3">Add images, documents, or links to showcase your work.</p>
        
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
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-500">{assets.images.length} of 5 images used</span>
                <Button type="button" variant="outline" size="sm" onClick={() => handleFileUpload('images')} disabled={assets.images.length >= 5 || isStorageFull}>
                  <Upload className="w-4 h-4 mr-2" /> Attach Image
                </Button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {assets.images.map(img => (
                  <div key={img.id} className="relative group bg-white border border-slate-200 rounded-lg p-2 flex items-center justify-center h-20 overflow-hidden">
                    {img.url && (img.url.startsWith('data:image/') || img.url.startsWith('http') || img.url.startsWith('/')) ? (
                      <a href={img.url} target="_blank" rel="noopener noreferrer" className="w-full h-full flex items-center justify-center">
                        <img src={img.url} alt={img.name} className="w-full h-full object-cover rounded" />
                      </a>
                    ) : (
                      <ImageIcon className="w-8 h-8 text-slate-300" />
                    )}
                    <button type="button" onClick={() => handleRemoveAsset('images', img.id)} className="absolute -top-2 -right-2 w-6 h-6 bg-white border border-slate-200 rounded-full flex items-center justify-center text-red-500 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm hover:bg-red-50 z-10">
                      <X className="w-3 h-3" />
                    </button>
                    <span className="absolute bottom-1 left-1 right-1 text-[10px] text-center truncate text-slate-500 bg-white/70 px-1 py-0.5 rounded">{(img.sizeBytes / 1024 / 1024).toFixed(1)}MB</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {assets.mode === 'pdfs' && (
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-500">{assets.pdfs.length} of 2 PDFs used</span>
                <Button type="button" variant="outline" size="sm" onClick={() => handleFileUpload('pdfs')} disabled={assets.pdfs.length >= 2 || isStorageFull}>
                  <Upload className="w-4 h-4 mr-2" /> Attach PDF
                </Button>
              </div>
              <div className="flex flex-col gap-2">
                {assets.pdfs.map(pdf => (
                  <div key={pdf.id} className="flex items-center justify-between bg-white border border-slate-200 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2 overflow-hidden">
                      <a href={pdf.url} download={pdf.name} className="flex items-center gap-2 overflow-hidden hover:underline">
                        <FileText className="w-5 h-5 text-red-400 shrink-0" />
                        <span className="text-sm text-slate-700 truncate">{pdf.name}</span>
                      </a>
                      <span className="text-xs text-slate-400 shrink-0">{(pdf.sizeBytes / 1024 / 1024).toFixed(1)}MB</span>
                    </div>
                    <button type="button" onClick={() => handleRemoveAsset('pdfs', pdf.id)} className="text-slate-400 hover:text-red-500 p-1">
                      <Trash2 className="w-4 h-4" />
                    </button>
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
                    <button type="button" onClick={() => handleRemoveAsset('links', link.id)} className="text-slate-400 hover:text-red-500 p-2 mt-1">
                      <Trash2 className="w-4 h-4" />
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
                      className="rounded border-slate-350 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
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
                      className="rounded border-slate-350 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
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
    <div className="flex flex-col h-full w-full max-w-4xl mx-auto pb-20 md:pb-0">
      <div className="mb-6 text-center md:text-left flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl md:text-4xl font-bold text-slate-900 mb-2 tracking-tight">
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
                <div className="space-y-2">
                  <Label className={contactErrors.email ? "text-red-500" : ""}>Email (Required)</Label>
                  <Input 
                    value={contactData.email} 
                    onChange={e => { setContactData({...contactData, email: e.target.value}); setContactErrors({...contactErrors, email: ''}); }} 
                    className={contactErrors.email ? "border-red-500 focus-visible:ring-red-500" : ""}
                  />
                  {contactErrors.email && <p className="text-sm text-red-500">{contactErrors.email}</p>}
                </div>
                <div className="space-y-2">
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
                      className="pl-12 text-sm font-medium tracking-wide h-12 rounded-xl"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>LinkedIn URL</Label>
                  <Input value={contactData.linkedin} onChange={e => setContactData({...contactData, linkedin: e.target.value})} placeholder="linkedin.com/in/username" />
                </div>
                <div className="space-y-2">
                  <Label>GitHub URL</Label>
                  <Input value={contactData.github} onChange={e => setContactData({...contactData, github: e.target.value})} placeholder="github.com/username" />
                </div>

                {/* Custom Extracted Links */}
                {contactData.customLinks && contactData.customLinks.length > 0 && (
                  <div className="pt-4 border-t border-slate-100">
                    <Label className="text-slate-700 font-semibold mb-2 block text-xs">Extracted Links</Label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {contactData.customLinks.map((link: any, idx: number) => (
                        <a 
                          key={idx}
                          href={link.url.startsWith('http') ? link.url : `https://${link.url}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-indigo-50/50 hover:border-indigo-200 transition-all group"
                        >
                          <div className="w-8 h-8 rounded-lg bg-white border border-slate-150 flex items-center justify-center shrink-0 shadow-sm group-hover:border-indigo-100">
                            <LinkIcon className="w-4.5 h-4.5 text-slate-400 group-hover:text-indigo-500" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-slate-700 truncate group-hover:text-indigo-600">{link.name || 'Link'}</p>
                            <p className="text-[10px] text-slate-400 truncate">{link.url}</p>
                          </div>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
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
                      className="flex min-h-[100px] w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 resize-none animate-in fade-in" 
                      placeholder="Write a professional summary..."
                    />
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
                      <p className="text-sm text-slate-650 leading-relaxed font-normal whitespace-pre-wrap">
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

      <div className="mt-8 pt-6 border-t border-slate-200 flex flex-col md:flex-row items-center justify-between gap-4">
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
    </div>
  );
}
