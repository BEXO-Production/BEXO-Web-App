import React from 'react';
import { useOnboarding } from '../context/OnboardingContext';
import { Card, Button } from '../design-system/primitives';
import { User, FileText, Settings, ArrowRight, ExternalLink, CheckCircle2 } from 'lucide-react';
import logo from '../assets/ace-digitals-logo.png';

export default function Dashboard() {
  const { data } = useOnboarding();
  const handleString = data.name ? data.name.toLowerCase().replace(/[^a-z0-9]/g, '') : 'portfolio';
  const url = `${handleString}.mybexo.com`;

  return (
    <div className="min-h-[100dvh] bg-slate-50">
      {/* Top Navbar */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <img src={logo} alt="BEXO" className="w-7 h-7 object-contain" />
          <span className="font-serif font-bold text-xl text-slate-900 tracking-tight">BEXO</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-sm font-medium text-slate-600 hidden md:block">
            {data.name || 'User'}
          </div>
          <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm border-2 border-white shadow-sm overflow-hidden">
            {data.photoUrl ? (
              <img src={data.photoUrl} alt="Profile" className="w-full h-full object-cover" />
            ) : (
              (data.name ? data.name.charAt(0) : 'U')
            )}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 md:py-12">
        <div className="mb-8">
          <h1 className="font-serif text-3xl font-bold text-slate-900 mb-2">Welcome back, {data.name?.split(' ')[0] || 'there'}</h1>
          <p className="text-slate-500">Manage your portfolio, track views, and update your profile.</p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 mb-10">
          <Card className="md:col-span-2 p-6 flex flex-col justify-center bg-white border border-slate-200">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Your Public URL</p>
            <div className="flex items-center justify-between bg-slate-50 p-4 rounded-xl border border-slate-100">
              <p className="text-xl font-medium text-slate-900 truncate">
                https://<span className="text-blue-600">{url}</span>
              </p>
              <Button variant="secondary" size="sm" className="hidden sm:flex shrink-0">
                Visit Site <ExternalLink className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </Card>
          
          <Card className="p-6 bg-gradient-to-br from-blue-600 to-blue-800 text-white border-0 shadow-md">
            <p className="text-blue-100 text-sm font-medium mb-1">Plan Status</p>
            <h3 className="text-2xl font-bold mb-4 capitalize">
              {data.plan === 'activation_code' ? 'Activated' : data.plan || 'Free'}
            </h3>
            <div className="flex items-center text-sm font-medium text-blue-50 bg-white/20 w-fit px-3 py-1 rounded-full backdrop-blur-sm">
              <CheckCircle2 className="w-4 h-4 mr-2" /> All features unlocked
            </div>
          </Card>
        </div>

        <h2 className="text-xl font-bold text-slate-900 mb-6">Quick Actions</h2>
        <div className="grid md:grid-cols-3 gap-6">
          <Card className="p-6 hover:shadow-md transition-shadow group cursor-pointer border-slate-200 bg-white">
            <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
              <User className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-slate-900 mb-2">Edit Profile</h3>
            <p className="text-sm text-slate-500 mb-6 leading-relaxed">Update your projects, skills, certificates, and contact information.</p>
            <div className="flex items-center text-sm font-semibold text-blue-600 mt-auto">
              Open Editor <ArrowRight className="w-4 h-4 ml-1 transition-transform group-hover:translate-x-1" />
            </div>
          </Card>

          <Card className="p-6 hover:shadow-md transition-shadow group cursor-pointer border-slate-200 bg-white">
            <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
              <FileText className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-slate-900 mb-2">Manage Resume</h3>
            <p className="text-sm text-slate-500 mb-6 leading-relaxed">Upload a new resume to automatically parse and update your experience.</p>
            <div className="flex items-center text-sm font-semibold text-purple-600 mt-auto">
              Upload New PDF <ArrowRight className="w-4 h-4 ml-1 transition-transform group-hover:translate-x-1" />
            </div>
          </Card>

          <Card className="p-6 hover:shadow-md transition-shadow group cursor-pointer border-slate-200 bg-white">
            <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
              <Settings className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-slate-900 mb-2">Settings</h3>
            <p className="text-sm text-slate-500 mb-6 leading-relaxed">Change your portfolio theme, domain settings, and account details.</p>
            <div className="flex items-center text-sm font-semibold text-slate-600 mt-auto">
              Preferences <ArrowRight className="w-4 h-4 ml-1 transition-transform group-hover:translate-x-1" />
            </div>
          </Card>
        </div>
      </main>
    </div>
  );
}
