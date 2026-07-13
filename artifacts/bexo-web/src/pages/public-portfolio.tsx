import React, { useState, useEffect } from 'react';
import { useRoute } from 'wouter';
import { Loader2, Mail, Phone, Globe, Linkedin, Github, GraduationCap, Briefcase, Award, BookOpen, ExternalLink, Calendar, MapPin, Sparkles, FileText } from 'lucide-react';
import { Card } from '../design-system/primitives';
import { cn } from '@/lib/utils';
import logo from '../assets/bexo-logo.png';

interface PublicPortfolioProps {
  handleOverride?: string;
}

const getSubdomain = () => {
  const hostname = window.location.hostname;
  const parts = hostname.split('.');
  
  if (hostname.endsWith('localhost')) {
    if (parts.length > 1 && parts[0] !== 'localhost' && parts[0] !== 'www') {
      return parts[0];
    }
    return null;
  }
  
  if (hostname.endsWith('mybexo.com')) {
    if (parts.length > 2 && parts[0] !== 'www') {
      return parts[0];
    }
    return null;
  }
  
  return null;
};

export default function PublicPortfolio({ handleOverride }: PublicPortfolioProps = {}) {
  const [, params] = useRoute('/:handle');
  const handle = handleOverride || params?.handle;
  const [profileData, setProfileData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);


  const currentSubdomain = getSubdomain();
  const isSubdomainAccess = !!currentSubdomain;

  useEffect(() => {
    if (!handle) return;
    const fetchPublicProfile = async () => {
      try {
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5001';
        const res = await fetch(`${apiUrl}/api/profile/public/${handle}`);
        if (!res.ok) {
          if (res.status === 404) {
            throw new Error('Portfolio not found');
          }
          throw new Error('Failed to load portfolio');
        }
        const result = await res.json();
        setProfileData(result);
      } catch (err: any) {
        setError(err.message || 'An error occurred');
      } finally {
        setLoading(false);
      }
    };
    fetchPublicProfile();
  }, [handle]);

  useEffect(() => {
    if (profileData && profileData.isPremium && !isSubdomainAccess) {
      const cleanHost = window.location.host.replace(/^www\./, '');
      window.location.href = `${window.location.protocol}//${profileData.profile?.handle}.${cleanHost}`;
    }
  }, [profileData, isSubdomainAccess]);

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-9 h-9 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin text-indigo-500" />
          <p className="text-sm font-medium text-slate-500">Loading portfolio...</p>
        </div>
      </div>
    );
  }

  if (error || !profileData) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center bg-slate-50 p-4">
        <div className="text-center max-w-sm space-y-4">
          <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto text-slate-400">
            <Globe className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-serif font-bold text-slate-900">404 - Portfolio Not Found</h1>
          <p className="text-sm text-slate-500">
            The student digital portfolio you are trying to reach does not exist or has been deactivated.
          </p>
          <a href="/" className="inline-block text-xs font-bold text-indigo-650 hover:underline">
            Go back to BEXO Home
          </a>
        </div>
      </div>
    );
  }

  const { user, profile, aboutEntries, educationEntries, experienceEntries, projectEntries, certificateEntries, achievementEntries, researchEntries, contactData, isPremium } = profileData;

  if (isSubdomainAccess && !isPremium) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center bg-slate-50 p-4 font-sans text-center">
        <div className="max-w-md bg-white p-8 rounded-2xl border border-slate-200 shadow-lg space-y-6">
          <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center mx-auto text-rose-500">
            <Globe className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-slate-900">Custom Subdomain Locked</h1>
            <p className="text-sm text-slate-550 leading-relaxed">
              Custom subdomains (<strong>{handle}.mybexo.com</strong>) are a premium feature of Bexo.
            </p>
          </div>
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 text-xs text-slate-650 text-left space-y-1">
            <span className="font-bold text-slate-700 block">Where is this portfolio?</span>
            You can view this portfolio at Bexo's free directory path:
            <a 
              href={`${window.location.protocol}//${window.location.host.replace(new RegExp(`^${handle}\\.`), '')}/${handle}`}
              className="text-indigo-650 hover:underline block font-mono mt-1 text-[11px] truncate"
            >
              {window.location.host.replace(new RegExp(`^${handle}\\.`), '')}/{handle}
            </a>
          </div>
          <a 
            href={`${window.location.protocol}//${window.location.host.replace(new RegExp(`^${handle}\\.`), '')}/${handle}`} 
            className="inline-flex w-full justify-center items-center h-11 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-colors"
          >
            Go to Portfolio
          </a>
        </div>
      </div>
    );
  }

  // Resolve theme accent color class
  const getThemeAccentClass = () => {
    switch (user.themeColor) {
      case 'rose': return 'bg-rose-500 text-rose-500 border-rose-250';
      case 'emerald': return 'bg-emerald-500 text-emerald-500 border-emerald-250';
      case 'amber': return 'bg-amber-500 text-amber-500 border-amber-250';
      case 'indigo': return 'bg-indigo-600 text-indigo-650 border-indigo-250';
      default: return 'bg-blue-500 text-blue-500 border-blue-250';
    }
  };

  const getThemeTextClass = () => {
    switch (user.themeColor) {
      case 'rose': return 'text-rose-650';
      case 'emerald': return 'text-emerald-650';
      case 'amber': return 'text-amber-650';
      case 'indigo': return 'text-indigo-650';
      default: return 'text-blue-650';
    }
  };

  const getThemeBadgeBg = () => {
    switch (user.themeColor) {
      case 'rose': return 'bg-rose-50 text-rose-700';
      case 'emerald': return 'bg-emerald-50 text-emerald-700';
      case 'amber': return 'bg-amber-50 text-amber-700';
      case 'indigo': return 'bg-indigo-50 text-indigo-700';
      default: return 'bg-blue-50 text-blue-700';
    }
  };

  const formatUrlText = (url: string, type: 'linkedin' | 'github') => {
    if (!url) return '';
    const clean = url.trim();
    if (clean.startsWith('http://') || clean.startsWith('https://')) {
      return clean.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
    }
    return type === 'linkedin' ? `linkedin.com/in/${clean}` : `github.com/${clean}`;
  };

  const getHref = (url: string, type: 'linkedin' | 'github') => {
    if (!url) return '';
    const clean = url.trim();
    if (clean.startsWith('http://') || clean.startsWith('https://')) {
      return clean;
    }
    return type === 'linkedin' ? `https://linkedin.com/in/${clean}` : `https://github.com/${clean}`;
  };

  const renderEntryAssets = (assets: any) => {
    if (!assets) return null;
    const images = Array.isArray(assets.images) ? assets.images.filter(Boolean) : [];
    const pdfs = Array.isArray(assets.pdfs) ? assets.pdfs.filter(Boolean) : [];

    if (images.length === 0 && pdfs.length === 0) return null;

    return (
      <div className="space-y-3 mt-3 pt-3 border-t border-slate-100">
        {/* Images Grid */}
        {images.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {images.map((imgItem: any, idx: number) => {
              const url = typeof imgItem === 'string' ? imgItem : (imgItem.url || '');
              const name = typeof imgItem === 'string' ? `Image_${idx + 1}` : (imgItem.name || 'image');
              if (!url) return null;
              return (
                <a 
                  key={idx} 
                  href={url} 
                  target="_blank" 
                  rel="noreferrer"
                  className="group relative aspect-video rounded-lg overflow-hidden border border-slate-200 bg-slate-50 block transition-all duration-300 hover:border-slate-350 hover:shadow-sm"
                >
                  <img 
                    src={url} 
                    alt={name} 
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" 
                  />
                </a>
              );
            })}
          </div>
        )}

        {/* PDFs Download Buttons */}
        {pdfs.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {pdfs.map((pdfItem: any, idx: number) => {
              const url = typeof pdfItem === 'string' ? pdfItem : (pdfItem.url || '');
              const name = typeof pdfItem === 'string' ? `Document_${idx + 1}.pdf` : (pdfItem.name || 'document.pdf');
              if (!url) return null;
              return (
                <a 
                  key={idx} 
                  href={url} 
                  target="_blank" 
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg text-[10px] font-bold text-slate-700 transition-colors shadow-sm cursor-pointer select-none"
                >
                  <FileText className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                  <span className="truncate max-w-[130px]">{name}</span>
                </a>
              );
            })}
          </div>
        )}
      </div>
    );
  };
  const accentClass = getThemeAccentClass();
  const textAccent = getThemeTextClass();
  const badgeAccent = getThemeBadgeBg();

  const templateId = user.templateId || 'minimal';

  const renderMinimalLayout = () => {
    return (
      <div className="max-w-3xl mx-auto px-4 pt-12 md:pt-16 space-y-10 relative z-10 font-sans">
        {/* Profile Header */}
        <div className="text-center space-y-4">
          <div className="w-24 h-24 rounded-full bg-slate-100 overflow-hidden border border-slate-200 shadow-inner flex items-center justify-center mx-auto">
            {user.photoUrl ? (
              <img src={user.photoUrl} alt={user.name} className="w-full h-full object-cover" />
            ) : (
              <span className="text-4xl font-bold text-slate-400 capitalize">{user.name?.charAt(0)}</span>
            )}
          </div>
          <div className="space-y-1">
            <h1 className="text-3xl font-extrabold text-slate-905 tracking-tight">{user.name}</h1>
            {profile.headline && <p className="text-md font-medium text-slate-600">{profile.headline}</p>}
            {user.openToHire && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-100 mt-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Available for Hire
              </span>
            )}
          </div>
          {profile.bio && <p className="text-sm text-slate-500 leading-relaxed max-w-lg mx-auto">{profile.bio}</p>}
          
          <div className="flex justify-center gap-3 pt-2">
            {user.resumeUrl && (
              <a href={user.resumeUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-650 hover:text-indigo-800 transition-colors">
                View Resume <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
            {user.openToHire && (
              <a 
                href={`mailto:${contactData.email || user.email}?subject=Hiring inquiry for ${user.name}`}
                className={cn("inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold text-white transition-all shadow-sm border-none hover:shadow-md", accentClass.split(' ')[0])}
              >
                <Mail className="w-3.5 h-3.5" /> Hire Me
              </a>
            )}
          </div>
        </div>

        {/* Contact Info Header Bar */}
        <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-xs text-slate-500 py-3.5 border-y border-slate-200/60">
          {contactData.email && (
            <div className="flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-slate-450" />
              <a href={`mailto:${contactData.email}`} className="hover:text-slate-900">{contactData.email}</a>
            </div>
          )}
          {contactData.phone && (
            <div className="flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-slate-450" />
              <span>{contactData.phone}</span>
            </div>
          )}
          {contactData.linkedin && (
            <div className="flex items-center gap-1.5">
              <Linkedin className="w-3.5 h-3.5 text-slate-455" />
              <a href={getHref(contactData.linkedin, 'linkedin')} target="_blank" rel="noreferrer" className="hover:text-slate-900">
                {formatUrlText(contactData.linkedin, 'linkedin')}
              </a>
            </div>
          )}
          {contactData.github && (
            <div className="flex items-center gap-1.5">
              <Github className="w-3.5 h-3.5 text-slate-455" />
              <a href={getHref(contactData.github, 'github')} target="_blank" rel="noreferrer" className="hover:text-slate-900">
                {formatUrlText(contactData.github, 'github')}
              </a>
            </div>
          )}
        </div>

        {/* Stacked content */}
        <div className="space-y-8">
          {/* About */}
          {aboutEntries.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">About Me</h3>
              {aboutEntries.map((ab: any) => (
                <p key={ab.id} className="text-sm text-slate-650 leading-relaxed">{ab.description}</p>
              ))}
            </div>
          )}

          {/* Experience */}
          {experienceEntries.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Experience</h3>
              <div className="space-y-5">
                {experienceEntries.map((exp: any) => (
                  <div key={exp.id} className="space-y-1">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="text-sm font-bold text-slate-900">{exp.role}</h4>
                        <p className="text-xs font-semibold text-slate-500">{exp.company}</p>
                      </div>
                      {exp.duration && <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded">{exp.duration}</span>}
                    </div>
                    {exp.description && <p className="text-xs text-slate-505 leading-relaxed pt-0.5">{exp.description}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Education */}
          {educationEntries.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Education</h3>
              <div className="space-y-4">
                {educationEntries.map((edu: any) => (
                  <div key={edu.id} className="flex justify-between items-start">
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">{edu.degree}</h4>
                      <p className="text-xs font-semibold text-slate-500">{edu.school}</p>
                      {edu.grade && <span className="text-[10px] font-bold text-indigo-650 mt-1 block">Grade: {edu.grade}</span>}
                    </div>
                    {edu.duration && <span className="text-[10px] font-bold text-slate-400">{edu.duration}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Projects */}
          {projectEntries.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Projects</h3>
              <div className="grid grid-cols-1 gap-4">
                {projectEntries.map((proj: any) => (
                  <div key={proj.id} className="border border-slate-200 rounded-xl p-4 bg-white/50 space-y-1.5">
                    <div className="flex justify-between items-start">
                      <h4 className="text-sm font-bold text-slate-905">{proj.title}</h4>
                      {proj.link && (
                        <a href={proj.link} target="_blank" rel="noreferrer" className="text-indigo-650 hover:text-indigo-850">
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                    {proj.description && <p className="text-xs text-slate-500 leading-relaxed">{proj.description}</p>}
                    {renderEntryAssets(proj.assets)}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Certifications & Achievements */}
          {(certificateEntries.length > 0 || achievementEntries.length > 0) && (
            <div className="grid md:grid-cols-2 gap-8 pt-2">
              {certificateEntries.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Certifications</h3>
                  <div className="space-y-3.5">
                    {certificateEntries.map((cert: any) => (
                      <div key={cert.id} className="space-y-0.5">
                        <h4 className="text-xs font-bold text-slate-900 leading-snug">{cert.name}</h4>
                        <p className="text-[11px] text-slate-550 leading-normal">{cert.issuer}</p>
                        {cert.date && <p className="text-[10px] text-slate-400">{cert.date}</p>}
                        {renderEntryAssets(cert.assets)}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {achievementEntries.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Achievements</h3>
                  <div className="space-y-3.5">
                    {achievementEntries.map((ach: any) => (
                      <div key={ach.id} className="space-y-0.5">
                        <h4 className="text-xs font-bold text-slate-900 leading-snug">{ach.title}</h4>
                        <p className="text-[11px] text-slate-550 leading-normal">{ach.organization}</p>
                        {ach.date && <p className="text-[10px] text-slate-400">{ach.date}</p>}
                        {renderEntryAssets(ach.assets)}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderAcademicLayout = () => {
    return (
      <div className="max-w-5xl mx-auto px-4 pt-12 md:pt-16 space-y-8 relative z-10 font-serif">
        {/* Profile Card */}
        <div className="bg-white border border-slate-200/80 shadow-sm p-8 rounded-2xl flex flex-col md:flex-row items-center md:items-start justify-between gap-6">
          <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
            <div className="w-24 h-24 rounded-2xl bg-slate-100 overflow-hidden border border-slate-200 shadow-inner flex items-center justify-center shrink-0">
              {user.photoUrl ? (
                <img src={user.photoUrl} alt={user.name} className="w-full h-full object-cover" />
              ) : (
                <span className="text-4xl font-bold text-slate-400 capitalize font-sans">{user.name?.charAt(0)}</span>
              )}
            </div>

            <div className="text-center md:text-left space-y-2 font-sans">
              <div className="flex flex-col md:flex-row items-center gap-3">
                <h1 className="text-3xl font-serif font-extrabold tracking-tight text-slate-900">{user.name}</h1>
                {user.openToHire && (
                  <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full select-none flex items-center gap-1 text-emerald-700 bg-emerald-50 border border-emerald-100">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Available for Hire
                  </span>
                )}
              </div>
              {profile.headline && <p className="text-md font-medium text-slate-700 leading-normal">{profile.headline}</p>}
              {profile.bio && <p className="text-xs text-slate-500 leading-relaxed max-w-xl">{profile.bio}</p>}
              
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 pt-2">
                {user.resumeUrl && (
                  <a href={user.resumeUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-650 hover:text-indigo-800 transition-colors">
                    View CV / Resume <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
                {user.openToHire && (
                  <a 
                    href={`mailto:${contactData.email || user.email}?subject=Hiring inquiry for ${user.name}`}
                    className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 transition-all shadow-sm border-none"
                  >
                    <Mail className="w-3.5 h-3.5" /> Contact Candidate
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Two Columns Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Sidebar */}
          <div className="md:col-span-1 space-y-6 font-sans">
            {/* Contact Details Card */}
            <Card className="p-5 border border-slate-200/60 shadow-sm space-y-4 bg-white">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Contact Information</h3>
              <div className="space-y-3.5 text-xs text-slate-600">
                {contactData.email && (
                  <div className="flex items-center gap-2.5">
                    <Mail className="w-4 h-4 text-slate-400 shrink-0" />
                    <a href={`mailto:${contactData.email}`} className="hover:text-slate-900 hover:underline truncate">{contactData.email}</a>
                  </div>
                )}
                {contactData.phone && (
                  <div className="flex items-center gap-2.5">
                    <Phone className="w-4 h-4 text-slate-400 shrink-0" />
                    <span className="truncate">{contactData.phone}</span>
                  </div>
                )}
                {contactData.linkedin && (
                  <div className="flex items-center gap-2.5">
                    <Linkedin className="w-4 h-4 text-slate-400 shrink-0" />
                    <a href={getHref(contactData.linkedin, 'linkedin')} target="_blank" rel="noreferrer" className="hover:text-slate-900 hover:underline truncate">
                      {formatUrlText(contactData.linkedin, 'linkedin')}
                    </a>
                  </div>
                )}
                {contactData.github && (
                  <div className="flex items-center gap-2.5">
                    <Github className="w-4 h-4 text-slate-400 shrink-0" />
                    <a href={getHref(contactData.github, 'github')} target="_blank" rel="noreferrer" className="hover:text-slate-900 hover:underline truncate">
                      {formatUrlText(contactData.github, 'github')}
                    </a>
                  </div>
                )}
              </div>
            </Card>

            {/* Certifications Card */}
            {certificateEntries.length > 0 && (
              <Card className="p-5 border border-slate-200/60 shadow-sm space-y-4 bg-white">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Award className="w-4 h-4 text-slate-500" /> Certifications
                </h3>
                <div className="space-y-4">
                  {certificateEntries.map((cert: any) => (
                    <div key={cert.id} className="space-y-0.5">
                      <h4 className="text-xs font-bold text-slate-900 leading-snug">{cert.name}</h4>
                      <p className="text-[11px] text-slate-550 leading-normal">{cert.issuer}</p>
                      {cert.date && <p className="text-[10px] text-slate-400">{cert.date}</p>}
                      {renderEntryAssets(cert.assets)}
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Achievements Card */}
            {achievementEntries.length > 0 && (
              <Card className="p-5 border border-slate-200/60 shadow-sm space-y-4 bg-white">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-slate-500" /> Achievements
                </h3>
                <div className="space-y-4">
                  {achievementEntries.map((ach: any) => (
                    <div key={ach.id} className="space-y-0.5">
                      <h4 className="text-xs font-bold text-slate-900 leading-snug">{ach.title}</h4>
                      <p className="text-[11px] text-slate-550 leading-normal">{ach.organization}</p>
                      {ach.date && <p className="text-[10px] text-slate-400">{ach.date}</p>}
                      {renderEntryAssets(ach.assets)}
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>

          {/* Main Body */}
          <div className="md:col-span-2 space-y-6">
            {/* About */}
            {aboutEntries.length > 0 && (
              <Card className="p-6 border border-slate-200/60 shadow-sm space-y-3 bg-white">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider font-sans">Biography</h3>
                <div className="space-y-3 text-sm text-slate-700 leading-relaxed">
                  {aboutEntries.map((ab: any) => (
                    <p key={ab.id}>{ab.description}</p>
                  ))}
                </div>
              </Card>
            )}

            {/* Education Section */}
            {educationEntries.length > 0 && (
              <Card className="p-6 border border-slate-200/60 shadow-sm space-y-6 bg-white">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2 font-sans">
                  <GraduationCap className="w-5 h-5 text-slate-550" /> Academic Background
                </h3>
                <div className="space-y-6 border-l pl-4 ml-2 border-slate-200">
                  {educationEntries.map((edu: any) => (
                    <div key={edu.id} className="relative space-y-1">
                      <span className="absolute -left-[21px] top-1.5 w-2 h-2 rounded-full border border-white bg-slate-900" />
                      <div className="flex justify-between items-start gap-4 font-serif">
                        <div>
                          <h4 className="text-sm font-bold text-slate-905 leading-tight">{edu.degree}</h4>
                          <p className="text-xs font-semibold text-slate-600 font-sans mt-0.5">{edu.school}</p>
                        </div>
                        {edu.duration && (
                          <span className="text-[10px] font-bold text-slate-400 whitespace-nowrap bg-slate-50 px-2 py-0.5 rounded border border-slate-100 font-sans">{edu.duration}</span>
                        )}
                      </div>
                      {edu.grade && <p className="text-xs font-bold text-slate-750 font-sans mt-1">Grade: {edu.grade}</p>}
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Experience Section */}
            {experienceEntries.length > 0 && (
              <Card className="p-6 border border-slate-200/60 shadow-sm space-y-6 bg-white">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2 font-sans">
                  <Briefcase className="w-4.5 h-4.5 text-slate-550" /> Professional Experience
                </h3>
                <div className="space-y-6 border-l pl-4 ml-2 border-slate-200">
                  {experienceEntries.map((exp: any) => (
                    <div key={exp.id} className="relative space-y-1">
                      <span className="absolute -left-[21px] top-1.5 w-2 h-2 rounded-full border border-white bg-slate-900" />
                      <div className="flex justify-between items-start gap-4">
                        <div>
                          <h4 className="text-sm font-bold text-slate-905 leading-tight">{exp.role}</h4>
                          <p className="text-xs font-semibold text-slate-600 font-sans mt-0.5">{exp.company}</p>
                        </div>
                        {exp.duration && (
                          <span className="text-[10px] font-bold text-slate-400 whitespace-nowrap bg-slate-50 px-2 py-0.5 rounded border border-slate-100 font-sans">{exp.duration}</span>
                        )}
                      </div>
                      {exp.description && <p className="text-xs text-slate-600 leading-relaxed pt-1 font-sans">{exp.description}</p>}
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Projects & Research Section */}
            {(projectEntries.length > 0 || researchEntries.length > 0) && (
              <Card className="p-6 border border-slate-200/60 shadow-sm space-y-6 bg-white">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2 font-sans">
                  <BookOpen className="w-4.5 h-4.5 text-slate-550" /> Projects & Research Papers
                </h3>
                <div className="space-y-5">
                  {/* Research list */}
                  {researchEntries?.map((res: any) => (
                    <div key={res.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50/10 space-y-1">
                      <h4 className="text-sm font-bold text-slate-950">{res.title || 'Research Paper'}</h4>
                      <p className="text-[11px] font-semibold text-slate-500 font-sans">{res.journal || 'Publication Journal'}</p>
                      {res.date && <p className="text-[10px] text-slate-400 font-sans">{res.date}</p>}
                      {res.description && <p className="text-xs text-slate-600 pt-1 font-sans leading-relaxed">{res.description}</p>}
                      {renderEntryAssets(res.assets)}
                    </div>
                  ))}

                  {/* Project list */}
                  {projectEntries.map((proj: any) => (
                    <div key={proj.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50/10 space-y-1">
                      <div className="flex justify-between items-start gap-4">
                        <h4 className="text-sm font-bold text-slate-950">{proj.title}</h4>
                        {proj.link && (
                          <a href={proj.link} target="_blank" rel="noreferrer" className="text-slate-500 hover:text-slate-905 shrink-0 font-sans">
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>
                      {proj.description && <p className="text-xs text-slate-600 pt-1 font-sans leading-relaxed">{proj.description}</p>}
                      {renderEntryAssets(proj.assets)}
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderCreativeLayout = () => {
    return (
      <div className="max-w-5xl mx-auto px-4 pt-12 md:pt-16 space-y-6 relative z-10 font-sans">
        {/* Bento Hero Card */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-slate-800 text-white p-8 rounded-3xl shadow-xl flex flex-col md:flex-row items-center md:items-start justify-between gap-6 relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,#4f46e520,transparent_50%)]" />
          
          <div className="flex flex-col md:flex-row items-center md:items-start gap-6 relative z-10">
            {/* Profile Photo */}
            <div className="w-28 h-28 rounded-2xl bg-white/10 overflow-hidden border border-white/20 shadow-lg flex items-center justify-center shrink-0">
              {user.photoUrl ? (
                <img src={user.photoUrl} alt={user.name} className="w-full h-full object-cover" />
              ) : (
                <span className="text-5xl font-extrabold text-white/40 capitalize">{user.name?.charAt(0)}</span>
              )}
            </div>

            {/* Profile Details */}
            <div className="text-center md:text-left space-y-2.5">
              <div className="flex flex-col md:flex-row items-center gap-3">
                <h1 className="text-3.5xl font-black tracking-tight text-white">{user.name}</h1>
                {user.openToHire && (
                  <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full select-none flex items-center gap-1.5 text-indigo-200 bg-indigo-500/20 border border-indigo-500/30">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" /> Available for Hire
                  </span>
                )}
              </div>
              {profile.headline && <p className="text-lg font-bold text-indigo-200">{profile.headline}</p>}
              {profile.bio && <p className="text-xs text-slate-300 leading-relaxed max-w-xl">{profile.bio}</p>}
              
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 pt-1.5">
                {user.resumeUrl && (
                  <a href={user.resumeUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-400 hover:text-indigo-300 transition-colors">
                    View Portfolio CV <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
                {user.openToHire && (
                  <a 
                    href={`mailto:${contactData.email || user.email}?subject=Hiring inquiry for ${user.name}`}
                    className="inline-flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold text-slate-900 bg-white hover:bg-slate-100 transition-all shadow-md hover:scale-102 select-none border-none"
                  >
                    <Mail className="w-3.5 h-3.5" /> Work With Me
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Bento Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main content grid - span 2 */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Experience Section */}
            {experienceEntries.length > 0 && (
              <Card className="p-6 border border-slate-200 shadow-sm space-y-4 bg-white rounded-2xl">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-450 flex items-center gap-1.5">
                  <Briefcase className="w-4 h-4 text-indigo-650" /> Professional Journeys
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {experienceEntries.map((exp: any) => (
                    <div key={exp.id} className="border border-slate-100 p-4 rounded-xl space-y-1 bg-slate-50/50 hover:border-slate-250 transition-colors">
                      <span className="text-[10px] font-bold text-indigo-650">{exp.duration}</span>
                      <h4 className="text-sm font-bold text-slate-900">{exp.role}</h4>
                      <p className="text-xs font-semibold text-slate-500">{exp.company}</p>
                      {exp.description && <p className="text-xs text-slate-505 leading-relaxed pt-1.5">{exp.description}</p>}
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Projects Bento Card */}
            {projectEntries.length > 0 && (
              <Card className="p-6 border border-slate-200 shadow-sm space-y-4 bg-white rounded-2xl">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-450 flex items-center gap-1.5">
                  <BookOpen className="w-4.5 h-4.5 text-indigo-650" /> Showcase Projects
                </h3>
                <div className="grid grid-cols-1 gap-4">
                  {projectEntries.map((proj: any) => (
                    <div key={proj.id} className="p-4 rounded-xl border border-slate-100 space-y-1 bg-slate-50/20">
                      <div className="flex justify-between items-start gap-4">
                        <h4 className="text-sm font-bold text-slate-900">{proj.title}</h4>
                        {proj.link && (
                          <a href={proj.link} target="_blank" rel="noreferrer" className="text-indigo-650 hover:text-indigo-850 shrink-0">
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>
                      {proj.description && <p className="text-xs text-slate-500 leading-relaxed">{proj.description}</p>}
                      {renderEntryAssets(proj.assets)}
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>

          {/* Right sidebar - span 1 */}
          <div className="lg:col-span-1 space-y-6">
            
            {/* Contact Details Card */}
            <Card className="p-6 border border-slate-200 shadow-sm space-y-4 bg-white rounded-2xl">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-450">Get In Touch</h3>
              <div className="space-y-3.5 text-xs text-slate-600">
                {contactData.email && (
                  <div className="flex items-center gap-2.5">
                    <Mail className="w-4 h-4 text-slate-400 shrink-0" />
                    <a href={`mailto:${contactData.email}`} className="hover:text-slate-900 hover:underline truncate">{contactData.email}</a>
                  </div>
                )}
                {contactData.phone && (
                  <div className="flex items-center gap-2.5">
                    <Phone className="w-4 h-4 text-slate-400 shrink-0" />
                    <span className="truncate">{contactData.phone}</span>
                  </div>
                )}
                {contactData.linkedin && (
                  <div className="flex items-center gap-2.5">
                    <Linkedin className="w-4 h-4 text-slate-400 shrink-0" />
                    <a href={getHref(contactData.linkedin, 'linkedin')} target="_blank" rel="noreferrer" className="hover:text-slate-900 hover:underline truncate">
                      {formatUrlText(contactData.linkedin, 'linkedin')}
                    </a>
                  </div>
                )}
                {contactData.github && (
                  <div className="flex items-center gap-2.5">
                    <Github className="w-4 h-4 text-slate-400 shrink-0" />
                    <a href={getHref(contactData.github, 'github')} target="_blank" rel="noreferrer" className="hover:text-slate-900 hover:underline truncate">
                      {formatUrlText(contactData.github, 'github')}
                    </a>
                  </div>
                )}
              </div>
            </Card>

            {/* Education Card */}
            {educationEntries.length > 0 && (
              <Card className="p-6 border border-slate-200 shadow-sm space-y-4 bg-white rounded-2xl">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-450 flex items-center gap-1.5">
                  <GraduationCap className="w-4.5 h-4.5 text-indigo-650" /> Education
                </h3>
                <div className="space-y-4">
                  {educationEntries.map((edu: any) => (
                    <div key={edu.id} className="space-y-0.5">
                      <h4 className="text-xs font-bold text-slate-900 leading-snug">{edu.degree}</h4>
                      <p className="text-[11px] text-slate-500 leading-normal">{edu.school}</p>
                      {edu.grade && <p className="text-[10px] text-slate-400 mt-0.5">Grade: {edu.grade}</p>}
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Achievements & Certifications */}
            {(certificateEntries.length > 0 || achievementEntries.length > 0) && (
              <Card className="p-6 border border-slate-200 shadow-sm space-y-4 bg-white rounded-2xl">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-450">Accomplishments</h3>
                <div className="space-y-4">
                  {certificateEntries.map((cert: any) => (
                    <div key={cert.id} className="space-y-0.5">
                      <h4 className="text-xs font-bold text-slate-900 leading-snug">{cert.name}</h4>
                      <p className="text-[11px] text-slate-550">{cert.issuer}</p>
                    </div>
                  ))}
                  {achievementEntries.map((ach: any) => (
                    <div key={ach.id} className="space-y-0.5">
                      <h4 className="text-xs font-bold text-slate-900 leading-snug">{ach.title}</h4>
                      <p className="text-[11px] text-slate-550">{ach.organization}</p>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen pb-20 font-sans relative overflow-x-hidden transition-colors duration-300 bg-gradient-to-tr from-slate-50 via-slate-100/50 to-indigo-50/30 text-slate-800">
      {/* Grid overlay background */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:14px_24px] pointer-events-none opacity-100" />

      {/* Decorative background glows */}
      <div className="absolute top-[-10%] left-[-5%] w-[500px] h-[500px] rounded-full blur-[120px] pointer-events-none bg-indigo-200/10" />
      <div className="absolute bottom-[20%] right-[-5%] w-[450px] h-[450px] rounded-full blur-[100px] pointer-events-none bg-blue-200/10" />

      {/* Portfolio Header Accent Bar (only for free minimal template) */}
      {templateId === 'minimal' && (
        <div className={cn("h-2.5 w-full sticky top-0 z-50", accentClass.split(' ')[0])} />
      )}

      {/* Render selected template layout */}
      {templateId === 'minimal' && renderMinimalLayout()}
      {templateId === 'academic' && renderAcademicLayout()}
      {templateId === 'creative' && renderCreativeLayout()}

      {/* Footer */}
      <div className="max-w-4xl mx-auto px-4 pt-16 border-t border-slate-200/80 text-center space-y-2 relative z-10">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Student Portfolio Network</p>
        <p className="text-xs text-slate-450">
          &copy; {new Date().getFullYear()} Bexo. All rights reserved. Bexo is owned and operated by Ace Digital Private Limited.
        </p>
        <div className="flex justify-center gap-4 pt-2 text-[11px] font-bold text-slate-400">
          <a href="https://mybexo.com" className="hover:text-indigo-600 transition-colors">About Bexo</a>
          <span>•</span>
          <a href="https://mybexo.com" className="hover:text-indigo-600 transition-colors">Privacy Policy</a>
          <span>•</span>
          <a href="https://mybexo.com" className="hover:text-indigo-600 transition-colors">Terms of Service</a>
        </div>
      </div>

      {/* Floating Replit-style Watermark */}
      <a 
        href="https://mybexo.com" 
        target="_blank" 
        rel="noreferrer"
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 text-white px-3.5 py-2 rounded-full shadow-lg backdrop-blur-sm transition-all duration-300 hover:scale-105 active:scale-95 group font-sans bg-slate-900/90 border border-slate-800 hover:bg-slate-900"
      >
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-450 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-505"></span>
        </span>
        <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400 group-hover:text-white transition-colors">
          Built with
        </span>
        <span className="text-xs font-serif font-extrabold tracking-tight text-white flex items-center gap-1.5">
          <img src={logo} alt="" className="w-3.5 h-3.5 object-contain" /> BEXO
        </span>
      </a>
    </div>
  );
}
