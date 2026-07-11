import React, { useState } from 'react';
import { useOnboarding } from '../context/OnboardingContext';
import { Button, Input, Label, Card } from '../design-system/primitives';
import { ArrowRight, Plus, Pencil, Trash2, GripVertical } from 'lucide-react';

export default function Step6About() {
  const { data, updateData, nextStep } = useOnboarding();
  const [entries, setEntries] = useState(data.aboutEntries);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const [editForm, setEditForm] = useState({ title: '', description: '' });

  const handleAdd = () => {
    const newId = Date.now().toString();
    setEntries([...entries, { id: newId, title: 'New Highlight', description: '' }]);
    setEditingId(newId);
    setEditForm({ title: 'New Highlight', description: '' });
  };

  const handleEdit = (id: string) => {
    const entry = entries.find(e => e.id === id);
    if (entry) {
      setEditingId(id);
      setEditForm({ title: entry.title, description: entry.description });
    }
  };

  const handleDelete = (id: string) => {
    setEntries(entries.filter(e => e.id !== id));
  };

  const handleSave = () => {
    setEntries(entries.map(e => e.id === editingId ? { ...e, ...editForm } : e));
    setEditingId(null);
  };

  const handleContinue = () => {
    updateData({ aboutEntries: entries });
    nextStep(6);
  };

  return (
    <div className="flex flex-col h-full max-w-2xl w-full mx-auto pb-20 md:pb-0">
      <div className="mb-10 text-center md:text-left">
        <h1 className="font-serif text-3xl md:text-4xl font-bold text-slate-900 mb-3 tracking-tight">
          About You
        </h1>
        <p className="text-slate-500 text-base md:text-lg">
          These sections were parsed from your resume. Review, edit, or add new highlights.
        </p>
      </div>

      <div className="flex-1 space-y-4">
        {entries.map((entry) => (
          <div key={entry.id}>
            {editingId === entry.id ? (
              <Card className="p-5 border-blue-200 ring-4 ring-blue-50 animate-in fade-in slide-in-from-top-2">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Title / Role</Label>
                    <Input 
                      value={editForm.title}
                      onChange={e => setEditForm({...editForm, title: e.target.value})}
                      placeholder="e.g. Frontend Developer Intern"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Description</Label>
                    <textarea 
                      value={editForm.description}
                      onChange={e => setEditForm({...editForm, description: e.target.value})}
                      className="flex min-h-[100px] w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 resize-none"
                      placeholder="Write a brief description..."
                    />
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
                    <Button onClick={handleSave}>Save Changes</Button>
                  </div>
                </div>
              </Card>
            ) : (
              <Card className="p-4 flex items-start gap-4 group hover:border-blue-200 transition-colors">
                <div className="mt-1 cursor-grab text-slate-300 group-hover:text-slate-400">
                  <GripVertical className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <h4 className="font-semibold text-slate-900">{entry.title}</h4>
                  <p className="text-sm text-slate-600 mt-1 leading-relaxed line-clamp-2">
                    {entry.description || <span className="text-slate-400 italic">No description provided</span>}
                  </p>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
            Add New Section
          </Button>
        )}
      </div>

      <div className="mt-10 pt-6 border-t border-slate-200 sticky bottom-0 bg-slate-50/80 backdrop-blur-md pb-6 md:pb-0 md:bg-transparent md:border-t-0">
        <Button 
          className="w-full md:w-auto md:min-w-[200px] h-14 text-base float-right group"
          onClick={handleContinue}
          disabled={editingId !== null || entries.length === 0}
        >
          Looks Good, Continue
          <ArrowRight className="w-5 h-5 ml-2 transition-transform group-hover:translate-x-1" />
        </Button>
      </div>
    </div>
  );
}
