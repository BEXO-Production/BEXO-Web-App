import React, { useState, useEffect } from 'react';
import { useOnboarding } from '../context/OnboardingContext';
import { Button, Input, Label, Card } from '../design-system/primitives';
import { ArrowRight, Plus, Pencil, Trash2, GripVertical, CheckCircle2, Upload } from 'lucide-react';
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

export default function Step6Review() {
  const { data, updateData, nextStep } = useOnboarding();
  const [activeTab, setActiveTab] = useState('about');
  
  // Track which tabs have been visited
  const [visitedTabs, setVisitedTabs] = useState<Set<string>>(new Set(data.visitedTabs || ['about']));
  
  // Local state for all sections
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

  // Error state for contact form
  const [contactErrors, setContactErrors] = useState<any>({});

  useEffect(() => {
    const newVisited = new Set(visitedTabs);
    newVisited.add(activeTab);
    setVisitedTabs(newVisited);
    updateData({ visitedTabs: Array.from(newVisited) });
  }, [activeTab]);

  const handleAdd = () => {
    const newId = Date.now().toString();
    const newEntry = { id: newId, title: 'New Entry' };
    setSections({ ...sections, [activeTab]: [...sections[activeTab as keyof typeof sections], newEntry] });
    setEditingId(newId);
    setEditForm(newEntry);
  };

  const handleEdit = (id: string) => {
    const entry = sections[activeTab as keyof typeof sections].find((e: any) => e.id === id);
    if (entry) {
      setEditingId(id);
      setEditForm({ ...entry });
    }
  };

  const handleDelete = (id: string) => {
    setSections({
      ...sections,
      [activeTab]: sections[activeTab as keyof typeof sections].filter((e: any) => e.id !== id)
    });
  };

  const handleSave = () => {
    setSections({
      ...sections,
      [activeTab]: sections[activeTab as keyof typeof sections].map((e: any) => e.id === editingId ? { ...e, ...editForm } : e)
    });
    setEditingId(null);
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
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Technologies</Label>
                <Input value={editForm.tech || ''} onChange={e => setEditForm({...editForm, tech: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label>Link</Label>
                <Input value={editForm.link || ''} onChange={e => setEditForm({...editForm, link: e.target.value})} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Attachment (Optional)</Label>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm"><Upload className="w-4 h-4 mr-2" /> Upload File</Button>
                <span className="text-xs text-slate-500">{editForm.attachmentUrl ? 'File attached' : 'No file chosen'}</span>
              </div>
            </div>
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
            <div className="space-y-2">
              <Label>Attachment (Optional)</Label>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm"><Upload className="w-4 h-4 mr-2" /> Upload File</Button>
                <span className="text-xs text-slate-500">{editForm.attachmentUrl ? 'File attached' : 'No file chosen'}</span>
              </div>
            </div>
          </>
        );
      default: return null;
    }
  };

  const renderPreview = (entry: any) => {
    switch (activeTab) {
      case 'education': return `${entry.degree} • ${entry.year} • ${entry.grade}`;
      case 'experience': return `${entry.role} • ${entry.duration}`;
      case 'projects': return `${entry.tech} • ${entry.link}`;
      case 'certificates': return `${entry.issuer} • ${entry.date}`;
      case 'achievements': 
      case 'research': return `${entry.organization} • ${entry.date}`;
      default: return entry.description;
    }
  };

  const allTabsVisited = visitedTabs.size === TABS.length;

  return (
    <div className="flex flex-col h-full w-full max-w-4xl mx-auto pb-20 md:pb-0">
      <div className="mb-8 text-center md:text-left">
        <h1 className="font-serif text-3xl md:text-4xl font-bold text-slate-900 mb-3 tracking-tight">
          Review & Verify
        </h1>
        <p className="text-slate-500 text-base md:text-lg">
          Please verify the information extracted from your resume. Visit all tabs to continue.
        </p>
      </div>

      <div className="flex flex-col lg:flex-row gap-8 flex-1">
        {/* Tabs Sidebar */}
        <div className="w-full lg:w-64 shrink-0 flex gap-2 lg:flex-col overflow-x-auto pb-2 lg:pb-0 hide-scrollbar">
          {TABS.map((tab) => {
            const isVisited = visitedTabs.has(tab.id);
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center justify-between px-4 py-3 rounded-xl font-medium transition-all whitespace-nowrap lg:whitespace-normal",
                  activeTab === tab.id 
                    ? "bg-blue-600 text-white shadow-md" 
                    : "bg-white text-slate-600 hover:bg-slate-50 border border-slate-200"
                )}
              >
                <span>{tab.label}</span>
                {isVisited && <CheckCircle2 className={cn("w-4 h-4 ml-3 shrink-0", activeTab === tab.id ? "text-blue-200" : "text-emerald-500")} />}
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        <div className="flex-1 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm min-h-[400px]">
          {activeTab === 'contact' ? (
            <div className="space-y-6 max-w-xl animate-in fade-in">
              <h3 className="text-xl font-bold text-slate-900 mb-4">Contact Information</h3>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className={contactErrors.email ? "text-red-500" : ""}>Email (Required)</Label>
                  <Input 
                    value={contactData.email} 
                    onChange={e => { setContactData({...contactData, email: e.target.value}); setContactErrors({...contactErrors, email: ''}); }} 
                    className={contactErrors.email ? "border-red-500" : ""}
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
                        <div className="flex justify-end gap-2 pt-2">
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

      <div className="mt-8 pt-6 border-t border-slate-200 flex items-center justify-between">
        <p className="text-sm text-slate-500">
          {!allTabsVisited ? `Please visit all ${TABS.length} sections to continue.` : 'All sections reviewed!'}
        </p>
        <Button 
          className="h-14 text-base group"
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
