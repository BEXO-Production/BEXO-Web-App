import React, { useState, useEffect } from 'react';
import { useOnboarding, AssetMode, AssetData, FileAsset, LinkAsset } from '../context/OnboardingContext';
import { Button, Input, Label, Card } from '../design-system/primitives';
import { ArrowRight, Plus, Pencil, Trash2, GripVertical, CheckCircle2, Upload, FileText, Image as ImageIcon, Link as LinkIcon, AlertCircle, X } from 'lucide-react';
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
  const [editForm, setEditForm] = useState<any>({});
  const [contactErrors, setContactErrors] = useState<any>({});

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

  const handleAdd = () => {
    const newId = Date.now().toString();
    const newEntry = { 
      id: newId, 
      title: 'New Entry',
      assets: { mode: 'images', images: [], pdfs: [], links: [] } 
    };
    setSections({ ...sections, [activeTab]: [...sections[activeTab as keyof typeof sections], newEntry] });
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
    const updated = {
      ...sections,
      [activeTab]: sections[activeTab as keyof typeof sections].map((e: any) => e.id === editingId ? { ...e, ...editForm } : e)
    };
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
      contactData
    });
    nextStep(6);
  };

  // Asset Handlers for the form
  const handleAssetModeChange = (mode: AssetMode) => {
    setEditForm({ ...editForm, assets: { ...editForm.assets, mode } });
  };

  const handleMockUpload = (type: 'images' | 'pdfs') => {
    if (isStorageFull) return;
    const current = editForm.assets[type];
    if (type === 'images' && current.length >= 5) return;
    if (type === 'pdfs' && current.length >= 2) return;

    // generate fake size
    let sizeBytes = 0;
    if (type === 'images') {
      sizeBytes = Math.floor((Math.random() * 3.5 + 0.5) * 1024 * 1024); // 0.5 to 4MB
    } else {
      sizeBytes = Math.floor((Math.random() * 5 + 1) * 1024 * 1024); // 1 to 6MB
    }

    if (usedStorage + sizeBytes > MAX_STORAGE_BYTES) return; // Prevent exceeding quota here

    const newAsset: FileAsset = {
      id: Date.now().toString(),
      name: `upload-${Date.now()}.${type === 'images' ? 'jpg' : 'pdf'}`,
      url: `fake-url-${Date.now()}`,
      sizeBytes
    };

    setEditForm({
      ...editForm,
      assets: {
        ...editForm.assets,
        [type]: [...current, newAsset]
      }
    });
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
        <Label className="text-base mb-3 block">Attach Evidence</Label>
        
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
                <Button type="button" variant="outline" size="sm" onClick={() => handleMockUpload('images')} disabled={assets.images.length >= 5 || isStorageFull}>
                  <Upload className="w-4 h-4 mr-2" /> Attach Image
                </Button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {assets.images.map(img => (
                  <div key={img.id} className="relative group bg-white border border-slate-200 rounded-lg p-2 flex items-center justify-center h-20">
                    <ImageIcon className="w-8 h-8 text-slate-300" />
                    <button type="button" onClick={() => handleRemoveAsset('images', img.id)} className="absolute -top-2 -right-2 w-6 h-6 bg-white border border-slate-200 rounded-full flex items-center justify-center text-red-500 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm hover:bg-red-50">
                      <X className="w-3 h-3" />
                    </button>
                    <span className="absolute bottom-1 left-1 right-1 text-[10px] text-center truncate text-slate-500">{(img.sizeBytes / 1024 / 1024).toFixed(1)}MB</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {assets.mode === 'pdfs' && (
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-500">{assets.pdfs.length} of 2 PDFs used</span>
                <Button type="button" variant="outline" size="sm" onClick={() => handleMockUpload('pdfs')} disabled={assets.pdfs.length >= 2 || isStorageFull}>
                  <Upload className="w-4 h-4 mr-2" /> Attach PDF
                </Button>
              </div>
              <div className="flex flex-col gap-2">
                {assets.pdfs.map(pdf => (
                  <div key={pdf.id} className="flex items-center justify-between bg-white border border-slate-200 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2 overflow-hidden">
                      <FileText className="w-5 h-5 text-red-400 shrink-0" />
                      <span className="text-sm text-slate-700 truncate">{pdf.name}</span>
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
              <textarea value={editForm.description || ''} onChange={e => setEditForm({...editForm, description: e.target.value})} className="flex min-h-[100px] w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 resize-none" placeholder="Write a brief description..." />
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
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Degree</Label>
                <Input value={editForm.degree || ''} onChange={e => setEditForm({...editForm, degree: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label>Year</Label>
                <Input value={editForm.year || ''} onChange={e => setEditForm({...editForm, year: e.target.value})} />
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
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Role</Label>
                <Input value={editForm.role || ''} onChange={e => setEditForm({...editForm, role: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label>Duration</Label>
                <Input value={editForm.duration || ''} onChange={e => setEditForm({...editForm, duration: e.target.value})} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <textarea value={editForm.description || ''} onChange={e => setEditForm({...editForm, description: e.target.value})} className="flex min-h-[100px] w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 resize-none" />
            </div>
          </>
        );
      case 'projects':
        return (
          <>
            <div className="space-y-2">
              <Label>Project Title</Label>
              <Input value={editForm.title || ''} onChange={e => setEditForm({...editForm, title: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <textarea value={editForm.description || ''} onChange={e => setEditForm({...editForm, description: e.target.value})} className="flex min-h-[80px] w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 resize-none" />
            </div>
            <div className="space-y-2">
              <Label>Technologies</Label>
              <Input value={editForm.tech || ''} onChange={e => setEditForm({...editForm, tech: e.target.value})} />
            </div>
            {renderAssetEditor()}
          </>
        );
      case 'certificates':
      case 'achievements':
      case 'research':
        return (
          <>
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
                <Input value={editForm.date || ''} onChange={e => setEditForm({...editForm, date: e.target.value})} />
              </div>
            </div>
            {renderAssetEditor()}
          </>
        );
      default: return null;
    }
  };

  const renderPreview = (entry: any) => {
    switch (activeTab) {
      case 'education': return `${entry.degree} • ${entry.year} • ${entry.grade}`;
      case 'experience': return `${entry.role} • ${entry.duration}`;
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
    if (a.images.length > 0) return <div className="flex items-center gap-1 text-xs text-blue-600 mt-2"><ImageIcon className="w-3 h-3"/> {a.images.length} Images</div>;
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
        
        {/* Storage Meter */}
        <div className="bg-white border border-slate-200 rounded-xl p-3 w-full md:w-64 shrink-0 shadow-sm relative overflow-hidden">
          <div className="flex justify-between items-center mb-1.5 relative z-10">
            <span className="text-xs font-semibold text-slate-700">Cloud Storage</span>
            <span className={cn("text-xs font-medium", isStorageFull ? "text-red-500" : "text-slate-500")}>
              {(usedStorage / 1024 / 1024).toFixed(1)} / 50 MB
            </span>
          </div>
          <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden relative z-10">
            <div 
              className={cn("h-full rounded-full transition-all duration-500", isStorageFull ? "bg-red-500" : "bg-blue-600")}
              style={{ width: `${storagePercentage}%` }}
            />
          </div>
          {isStorageFull && (
            <div className="text-[10px] text-red-500 mt-1.5 flex items-center gap-1 relative z-10">
              <AlertCircle className="w-3 h-3" /> Storage full. Upgrade or remove assets.
            </div>
          )}
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

        {/* Tab Content */}
        <div className="flex-1 bg-white p-5 md:p-6 rounded-2xl border border-slate-200 shadow-sm min-h-[400px]">
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
                  <Label>LinkedIn URL</Label>
                  <Input value={contactData.linkedin} onChange={e => setContactData({...contactData, linkedin: e.target.value})} placeholder="linkedin.com/in/username" />
                </div>
                <div className="space-y-2">
                  <Label>GitHub URL</Label>
                  <Input value={contactData.github} onChange={e => setContactData({...contactData, github: e.target.value})} placeholder="github.com/username" />
                </div>
                <div className="space-y-2">
                  <Label>Personal Portfolio (Optional)</Label>
                  <Input value={contactData.portfolio} onChange={e => setContactData({...contactData, portfolio: e.target.value})} placeholder="yourwebsite.com" />
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4 animate-in fade-in">
              <h3 className="text-xl font-bold text-slate-900 mb-4 capitalize">{activeTab} Details</h3>
              {sections[activeTab as keyof typeof sections].map((entry: any) => (
                <div key={entry.id}>
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
                    <Card className="p-4 flex items-start gap-4 group hover:border-blue-200 transition-colors">
                      <div className="mt-1 cursor-grab text-slate-300 group-hover:text-slate-400 hidden sm:block">
                        <GripVertical className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold text-slate-900 truncate">{entry.title || entry.institution || entry.company}</h4>
                        <p className="text-sm text-slate-600 mt-1 leading-relaxed line-clamp-2">
                          {renderPreview(entry) || <span className="text-slate-400 italic">No details provided</span>}
                        </p>
                        {renderAssetPreviewIcon(entry)}
                      </div>
                      <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
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

              {editingId === null && (
                <Button 
                  variant="outline" 
                  className="w-full border-dashed border-2 h-14 text-slate-500 hover:text-blue-600 hover:border-blue-200 hover:bg-blue-50/50"
                  onClick={handleAdd}
                >
                  <Plus className="w-5 h-5 mr-2" />
                  Add New {activeTab.slice(0, -1)}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="mt-8 pt-6 border-t border-slate-200 flex flex-col md:flex-row items-center justify-between gap-4">
        <p className="text-sm text-slate-500 text-center md:text-left">
          {!allTabsVisited ? `Please visit all ${TABS.length} sections to continue.` : 'All sections reviewed!'}
        </p>
        <Button 
          className="w-full md:w-auto h-14 text-base group"
          onClick={handleContinue}
          disabled={!allTabsVisited || editingId !== null}
        >
          Verify & Continue
          <ArrowRight className="w-5 h-5 ml-2 transition-transform group-hover:translate-x-1" />
        </Button>
      </div>
    </div>
  );
}
