import React, { useState, useEffect } from 'react';
import { useRoute } from 'wouter';
import { Loader2, Mail, Phone, Globe, Linkedin, Github, GraduationCap, Briefcase, Award, BookOpen, ExternalLink, Calendar, MapPin, Sparkles, FileText, Download } from 'lucide-react';
import { Card } from '../design-system/primitives';
import { cn } from '@/lib/utils';
import { BEXO_FOOTER_COPYRIGHT } from '../lib/brand';
import { BrandLogo } from '../components/BrandLogo';
import { BUNDLED_PREMIUM_TEMPLATES } from '../lib/templates';
import {
  getPortfolioSubdomain,
  pathPortfolioUrl,
  portfolioHostname,
} from '../lib/platform';
import { UnclaimedHandleBanner } from '../components/UnclaimedHandleBanner';
import { applyPageSeo, buildPortfolioPageJsonLd } from '../lib/seo';
import { apiUrl } from '../lib/api';

interface PublicPortfolioProps {
  handleOverride?: string;
}

export default function PublicPortfolio({ handleOverride }: PublicPortfolioProps = {}) {
  const [, params] = useRoute('/:handle');
  const handle = handleOverride || params?.handle;
  const [profileData, setProfileData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pausedInfo, setPausedInfo] = useState<{ reason?: string | null; name?: string } | null>(null);


  const currentSubdomain = getPortfolioSubdomain();
  const isSubdomainAccess = !!currentSubdomain;

  useEffect(() => {
    if (!handle) return;
    const fetchPublicProfile = async () => {
      try {
        const res = await fetch(apiUrl(`/api/profile/public/${handle}`));
        if (!res.ok) {
          if (res.status === 404) {
            setError('Portfolio not found');
            return;
          }
          if (res.status === 503) {
            const body = await res.json().catch(() => ({}));
            if (body.paused) {
              setPausedInfo({ reason: body.pauseReason, name: body.name });
              return;
            }
          }
          setError(`Failed to load portfolio (${res.status})`);
          return;
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
    if (!profileData || !handle) return;
    // Fire-and-forget visitor hit for first-party analytics.
    const body = JSON.stringify({
      handle,
      profileId: profileData.profileId || profileData.profile?.id,
      path: window.location.pathname || '/',
      referrer: document.referrer || '',
      preview: false,
    });
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon(apiUrl('/api/analytics/portfolio-hit'), new Blob([body], { type: 'application/json' }));
      } else {
        fetch(apiUrl('/api/analytics/portfolio-hit'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
          keepalive: true,
        }).catch(() => undefined);
      }
    } catch {
      /* ignore */
    }
  }, [profileData, handle]);

  useEffect(() => {
    if (!profileData || !handle) return;
    const name = String(profileData.user?.name || handle).trim();
    const headline =
      String(profileData.profile?.headline || "").trim() ||
      String(profileData.profile?.careerGoal || "").trim() ||
      String(profileData.profile?.bio || "").trim();
    const origin = window.location.origin.replace(/\/$/, "");
    const canonical = profileData.isPremium
      ? `https://${portfolioHostname(handle)}`
      : pathPortfolioUrl(handle);
    const photo = String(profileData.user?.photoUrl || "").trim();
    const ogImage =
      photo.startsWith("http://") || photo.startsWith("https://")
        ? photo
        : `${origin}/og-portfolio.jpg`;
    const description = headline
      ? `${headline}. Projects, experience, and Hire Me — live portfolio on BEXO.`
      : `${name}'s professional portfolio. Projects, experience, and a Hire Me page recruiters can open in one tap.`;

    applyPageSeo({
      title: headline ? `${name} — ${headline} | Portfolio` : `${name} | Portfolio`,
      description,
      canonical,
      ogImage,
      ogType: "profile",
      jsonLd: buildPortfolioPageJsonLd({
        name,
        headline: headline || undefined,
        url: canonical,
        image: ogImage,
      }),
    });
  }, [profileData, handle]);

  useEffect(() => {
    if (profileData && profileData.isPremium && !isSubdomainAccess) {
      const target = portfolioHostname(profileData.profile?.handle || handle || '');
      if (target && window.location.host !== target) {
        window.location.href = `${window.location.protocol}//${target}${window.location.pathname}${window.location.search}`;
      }
    }
  }, [profileData, isSubdomainAccess, handle]);

  // IntersectionObserver for fade-in-on-scroll animations
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('portfolio-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
    );
    setTimeout(() => {
      document.querySelectorAll('.portfolio-animate').forEach((el) => observer.observe(el));
    }, 100);
    return () => observer.disconnect();
  }, [profileData]);


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

  if (pausedInfo) {
    const reasonLabel =
      pausedInfo.reason === 'payment_failed'
        ? 'Billing / autopay issue'
        : pausedInfo.reason === 'storage_exceeded'
          ? 'Storage limit exceeded'
          : pausedInfo.reason === 'subscription_ended'
            ? 'Subscription ended'
            : 'Temporarily paused';
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-slate-50 p-6 font-sans">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-lg space-y-4 text-left">
          <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-700">
            {reasonLabel}
          </span>
          <h1 className="text-2xl font-bold text-slate-900">This portfolio is paused</h1>
          <p className="text-sm text-slate-500 leading-relaxed">
            {pausedInfo.reason === 'storage_exceeded'
              ? 'This workspace has exceeded its storage limit. The owner needs to free space or add storage to remount the site.'
              : pausedInfo.reason === 'payment_failed'
                ? 'Auto-renew payment failed and the grace period has ended. The owner needs to update billing to bring this site back online.'
                : 'This portfolio is temporarily unavailable. The owner can restore it from the BEXO dashboard.'}
          </p>
          <p className="text-xs text-slate-400">
            Handle: {handle}{pausedInfo.name ? ` · ${pausedInfo.name}` : ''}
          </p>
          <a
            href="/billing"
            className="inline-flex h-10 items-center justify-center rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            Owner: fix in Dashboard → Billing
          </a>
        </div>
      </div>
    );
  }

  if (error || !profileData) {
    const isTrulyUnclaimed = error === 'Portfolio not found';
    if (isTrulyUnclaimed) {
      return <UnclaimedHandleBanner handle={handle || handleOverride || 'yourname'} />;
    }
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6 text-center">
        <div className="max-w-md space-y-3 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <h1 className="text-xl font-semibold text-slate-900">Portfolio temporarily unavailable</h1>
          <p className="text-sm text-slate-500">
            {error || 'We could not load this portfolio right now. Please try again in a moment.'}
          </p>
          <button
            type="button"
            className="inline-flex h-10 items-center justify-center rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white"
            onClick={() => window.location.reload()}
          >
            Retry
          </button>
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
              Custom subdomains (<strong>{portfolioHostname(handle || '')}</strong>) are a premium feature of Bexo.
            </p>
          </div>
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 text-xs text-slate-600 text-left space-y-1">
            <span className="font-bold text-slate-700 block">Where is this portfolio?</span>
            You can view this portfolio at Bexo's free directory path:
            <a 
              href={pathPortfolioUrl(handle || '')}
              className="text-indigo-600 hover:underline block font-mono mt-1 text-[11px] truncate"
            >
              {pathPortfolioUrl(handle || '').replace(/^https?:\/\//, '')}
            </a>
          </div>
          <a 
            href={pathPortfolioUrl(handle || '')} 
            className="inline-flex w-full justify-center items-center h-11 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-colors"
          >
            Go to Portfolio
          </a>
        </div>
      </div>
    );
  }

  // Premium templates are rendered by the API's bundled template engine.
  // The public URL remains the user's handle URL; no separate template host
  // is exposed or required.
  if (isPremium && BUNDLED_PREMIUM_TEMPLATES.has(user.templateId || '')) {
    // Local: *.localhost:5173 → hand off to the API subdomain router on :5001
    // so assets + routing match production (kavin.localhost → template bundle).
    const host = window.location.hostname;
    const port = window.location.port;
    if (host.endsWith('.localhost') && (port === '5173' || port === '')) {
      const apiPort = import.meta.env.VITE_API_PORT || '5001';
      const target = `${window.location.protocol}//${host}:${apiPort}/`;
      if (window.location.href !== target) {
        window.location.replace(target);
        return (
          <div className="flex h-screen w-screen items-center justify-center bg-slate-50">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
          </div>
        );
      }
    }

    return (
      <iframe
        title={`${user.name || handle} portfolio`}
        src={`/api/render/${encodeURIComponent(handle || profile.handle)}/${encodeURIComponent(user.templateId)}/`}
        className="fixed inset-0 h-[100dvh] w-full border-0 bg-[#0d0d11]"
        allow="clipboard-write"
      />
    );
  }

  // Theme accent color — resolved to HEX for inline styles (CSS variable approach)
  const THEME_HEX_MAP: Record<string, string> = {
    blue: '#2563eb', emerald: '#059669', rose: '#e11d48', violet: '#7c3aed', indigo: '#4f46e5',
  };
  const accentHex = THEME_HEX_MAP[user.themeColor] || THEME_HEX_MAP['blue'];
  const accentLight = accentHex + '12';
  const accentMid = accentHex + '30';

  // Resolve theme accent color class
  const getThemeAccentClass = () => {
    switch (user.themeColor) {
      case 'rose': return 'bg-rose-500 text-rose-500 border-rose-250';
      case 'emerald': return 'bg-emerald-500 text-emerald-500 border-emerald-250';
      case 'violet': return 'bg-violet-600 text-violet-600 border-violet-250';
      case 'indigo': return 'bg-indigo-600 text-indigo-600 border-indigo-250';
      default: return 'bg-blue-500 text-blue-500 border-blue-250';
    }
  };

  const getThemeTextClass = () => {
    switch (user.themeColor) {
      case 'rose': return 'text-rose-650';
      case 'emerald': return 'text-emerald-650';
      case 'amber': return 'text-amber-650';
      case 'indigo': return 'text-indigo-600';
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
                  className="group relative aspect-video rounded-lg overflow-hidden border border-slate-200 bg-slate-50 block transition-all duration-300 hover:border-slate-300 hover:shadow-sm"
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
                  download
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 transition-colors shadow-sm cursor-pointer select-none"
                >
                  <Download className="w-4 h-4 shrink-0" style={{ color: accentHex }} />
                  <span className="truncate max-w-[130px]">Download PDF</span>
                </a>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const renderFeaturedCard = (title: string, sub?: string, date?: string, description?: string, assets?: any, linkButton?: React.ReactNode) => {
    const images = Array.isArray(assets?.images) ? assets.images.filter(Boolean) : [];
    const pdfs = Array.isArray(assets?.pdfs) ? assets.pdfs.filter(Boolean) : [];
    const imageUrl = typeof images[0] === 'string' ? images[0] : (images[0]?.url || '');

    if (imageUrl) {
      return (
        <div key={title} className="relative aspect-[16/10] sm:aspect-[16/9] rounded-2xl overflow-hidden border border-slate-200/60 shadow-md group transition-all duration-300 hover:shadow-lg w-full">
          {/* Background Image */}
          <img 
            src={imageUrl} 
            alt={title} 
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" 
          />
          {/* Dark gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/40 to-transparent" />
          
          {/* Content positioned on top of the image */}
          <div className="absolute inset-x-0 bottom-0 p-4 space-y-2 z-10">
            <div className="space-y-1">
              {date && (
                <span className="text-[9px] font-extrabold uppercase tracking-wider text-white/95 bg-white/20 px-2 py-0.5 rounded backdrop-blur-sm">
                  {date}
                </span>
              )}
              <h4 className="text-sm font-bold text-white tracking-tight leading-tight mt-1">{title}</h4>
              {sub && <p className="text-[11px] font-semibold text-slate-200">{sub}</p>}
            </div>
            {description && <p className="text-xs text-slate-300 line-clamp-2 leading-relaxed">{description}</p>}
            
            {/* Buttons (PDFs and links) */}
            <div className="flex flex-wrap gap-2 pt-1">
              {pdfs.map((pdfItem: any, idx: number) => {
                const url = typeof pdfItem === 'string' ? pdfItem : (pdfItem.url || '');
                if (!url) return null;
                return (
                  <a 
                    key={idx} 
                    href={url} 
                    target="_blank" 
                    rel="noreferrer"
                    download
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white/15 hover:bg-white/25 border border-white/10 rounded-xl text-[10px] font-bold text-white transition-colors backdrop-blur-sm shadow-sm"
                  >
                    <Download className="w-3.5 h-3.5 mr-1" />
                    Download PDF
                  </a>
                );
              })}
              {linkButton}
            </div>
          </div>
        </div>
      );
    }

    return null;
  };

  const accentClass = getThemeAccentClass();
  const textAccent = getThemeTextClass();
  const badgeAccent = getThemeBadgeBg();

  const templateId = user.templateId || 'minimal';



  const renderMinimalLayout = () => {
    return (
      <>
        {/* Inject animation + font styles */}
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Outfit:wght@600;700;800&display=swap');
          .portfolio-animate {
            opacity: 0;
            transform: translateY(18px);
            transition: opacity 0.55s cubic-bezier(0.22,1,0.36,1), transform 0.55s cubic-bezier(0.22,1,0.36,1);
          }
          .portfolio-visible {
            opacity: 1 !important;
            transform: translateY(0) !important;
          }
          .section-card {
            background: rgba(255,255,255,0.75);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            border: 1px solid rgba(226,232,240,0.7);
            border-radius: 20px;
            padding: 28px 28px 24px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.02);
            transition: box-shadow 0.3s ease;
          }
          .section-card:hover {
            box-shadow: 0 2px 8px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.04);
          }
          .project-card-m {
            background: rgba(248,250,252,0.8);
            border: 1px solid rgba(226,232,240,0.8);
            border-radius: 16px;
            padding: 20px;
            transition: all 0.3s ease;
          }
          .project-card-m:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 14px rgba(0,0,0,0.06);
            border-color: ${accentMid};
          }
          .tl-dot {
            width: 10px; height: 10px; border-radius: 50%;
            background: ${accentHex};
            box-shadow: 0 0 0 4px ${accentLight};
            position: absolute; left: -6px; top: 6px; z-index: 2;
          }
          .avatar-square-glow {
            position: relative;
            display: inline-block;
            shrink-0: 0;
          }
          .avatar-square-glow::after {
            content: '';
            position: absolute;
            inset: -3px;
            border-radius: 19px;
            background: linear-gradient(135deg, ${accentHex}, ${accentHex}40, ${accentHex});
            z-index: -1;
            opacity: 0.8;
          }
          .hero-card-bg {
            background: linear-gradient(135deg, ${accentLight} 0%, rgba(248,250,252,0.5) 50%, ${accentLight} 100%);
            border: 1px solid ${accentMid};
          }
        `}</style>

        <div className="max-w-3xl mx-auto px-5 pt-14 md:pt-20 pb-4 space-y-8 relative z-10" style={{ fontFamily: "'Inter', -apple-system, sans-serif" }}>
          {/* ─── HERO CARD ─── */}
          <div className="portfolio-animate hero-card-bg rounded-3xl p-8 md:p-10 flex flex-col md:flex-row items-center md:items-start text-center md:text-left gap-8 md:gap-10">
            {/* Square avatar with gradient glow border */}
            <div className="avatar-square-glow shrink-0">
              <div className="w-32 h-32 md:w-36 md:h-36 rounded-2xl bg-slate-100 overflow-hidden flex items-center justify-center border-[3px] border-white shadow-sm relative group">
                {user.photoUrl ? (
                  <img src={user.photoUrl} alt={user.name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                ) : (
                  <span className="text-5xl font-bold text-slate-300 capitalize" style={{ fontFamily: "'Outfit', sans-serif" }}>{user.name?.charAt(0)}</span>
                )}
              </div>
            </div>

            {/* Name, Headline, Bio, and CTAs */}
            <div className="flex-1 space-y-3.5">
              <div>
                <div className="flex flex-col md:flex-row md:items-center gap-3">
                  <h1 className="text-3xl md:text-4xl font-extrabold text-slate-900 tracking-tight leading-tight" style={{ fontFamily: "'Outfit', sans-serif" }}>{user.name}</h1>
                  {user.openToHire && (
                    <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200/60 max-w-fit self-center md:self-auto">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Available for Hire
                    </span>
                  )}
                </div>
                {profile.headline && <p className="text-base font-semibold text-slate-600 mt-1">{profile.headline}</p>}
              </div>

              {profile.bio && <p className="text-sm text-slate-500 leading-relaxed">{profile.bio}</p>}
              
              <div className="flex flex-wrap justify-center md:justify-start gap-3 pt-2">
                {user.resumeUrl && (
                  <a 
                    href={user.resumeUrl} target="_blank" rel="noreferrer" 
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold transition-all duration-200 border hover:shadow-md"
                    style={{ color: accentHex, borderColor: accentMid, background: accentLight }}
                  >
                    <FileText className="w-3.5 h-3.5" /> View Resume
                  </a>
                )}
                {user.openToHire && (
                  <a 
                    href={`mailto:${contactData.email || user.email}?subject=Hiring inquiry for ${user.name}`}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white transition-all duration-200 hover:shadow-lg hover:brightness-110"
                    style={{ background: accentHex, boxShadow: `0 4px 14px ${accentHex}33` }}
                  >
                    <Mail className="w-3.5 h-3.5" /> Hire Me
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* ─── CONTACT BAR ─── */}
          <div className="portfolio-animate flex flex-wrap justify-center gap-x-5 gap-y-2.5 text-xs text-slate-500 py-4 px-6 rounded-2xl" style={{ background: 'rgba(248,250,252,0.7)', border: '1px solid rgba(226,232,240,0.5)' }}>
            {contactData.email && (
              <a href={`mailto:${contactData.email}`} className="flex items-center gap-1.5 hover:text-slate-900 transition-colors font-medium">
                <Mail className="w-3.5 h-3.5" style={{ color: accentHex }} /> {contactData.email}
              </a>
            )}
            {contactData.phone && (
              <span className="flex items-center gap-1.5 font-medium">
                <Phone className="w-3.5 h-3.5" style={{ color: accentHex }} /> {contactData.phone}
              </span>
            )}
            {contactData.linkedin && (
              <a href={getHref(contactData.linkedin, 'linkedin')} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 hover:text-slate-900 transition-colors font-medium">
                <Linkedin className="w-3.5 h-3.5" style={{ color: accentHex }} /> {formatUrlText(contactData.linkedin, 'linkedin')}
              </a>
            )}
            {contactData.github && (
              <a href={getHref(contactData.github, 'github')} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 hover:text-slate-900 transition-colors font-medium">
                <Github className="w-3.5 h-3.5" style={{ color: accentHex }} /> {formatUrlText(contactData.github, 'github')}
              </a>
            )}
          </div>

          {/* ─── CONTENT SECTIONS ─── */}
          <div className="space-y-6">
            {/* About */}
            {aboutEntries.length > 0 && (
              <div className="portfolio-animate section-card">
                <h3 className="text-[11px] font-bold uppercase tracking-[0.15em] mb-4 flex items-center gap-2" style={{ color: accentHex }}>
                  <span className="w-1 h-4 rounded-full" style={{ background: accentHex }} /> About Me
                </h3>
                {aboutEntries.map((ab: any) => (
                  <p key={ab.id} className="text-sm text-slate-600 leading-[1.75]">{ab.description}</p>
                ))}
              </div>
            )}

            {/* Experience — Timeline */}
            {experienceEntries.length > 0 && (
              <div className="portfolio-animate section-card">
                <h3 className="text-[11px] font-bold uppercase tracking-[0.15em] mb-5 flex items-center gap-2" style={{ color: accentHex }}>
                  <span className="w-1 h-4 rounded-full" style={{ background: accentHex }} /> Experience
                </h3>
                <div className="relative pl-5" style={{ borderLeft: `2px solid ${accentLight}` }}>
                  {experienceEntries.map((exp: any, idx: number) => (
                    <div key={exp.id} className={cn("relative pb-6", idx === experienceEntries.length - 1 && "pb-0")}>
                      <div className="tl-dot" />
                      <div className="ml-4">
                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-1">
                          <div>
                            <h4 className="text-sm font-bold text-slate-900">{exp.role}</h4>
                            <p className="text-xs font-semibold text-slate-500 mt-0.5">{exp.company}{exp.location ? `, ${exp.location}` : ''}</p>
                          </div>
                          {exp.duration && (
                            <span className="text-[10px] font-bold shrink-0 px-2.5 py-0.5 rounded-full" style={{ color: accentHex, background: accentLight }}>
                              {exp.duration}
                            </span>
                          )}
                        </div>
                        {exp.description && <p className="text-xs text-slate-500 leading-relaxed mt-2">{exp.description}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Education — Timeline */}
            {educationEntries.length > 0 && (
              <div className="portfolio-animate section-card">
                <h3 className="text-[11px] font-bold uppercase tracking-[0.15em] mb-5 flex items-center gap-2" style={{ color: accentHex }}>
                  <span className="w-1 h-4 rounded-full" style={{ background: accentHex }} /> Education
                </h3>
                <div className="relative pl-5" style={{ borderLeft: `2px solid ${accentLight}` }}>
                  {educationEntries.map((edu: any, idx: number) => (
                    <div key={edu.id} className={cn("relative pb-6", idx === educationEntries.length - 1 && "pb-0")}>
                      <div className="tl-dot" />
                      <div className="ml-4">
                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-1">
                          <div>
                            <h4 className="text-sm font-bold text-slate-900">{edu.degree}</h4>
                            <p className="text-xs font-semibold text-slate-500 mt-0.5">{edu.institution || edu.school}</p>
                            {edu.grade && <span className="text-[10px] font-bold mt-1 block" style={{ color: accentHex }}>Grade: {edu.grade}</span>}
                          </div>
                          {(edu.duration || edu.year || edu.startYear || edu.endYear) && (
                            <span className="text-[10px] font-bold shrink-0 px-2.5 py-0.5 rounded-full" style={{ color: accentHex, background: accentLight }}>
                              {edu.duration || edu.year || [edu.startYear, edu.endYear].filter(Boolean).join(' - ')}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Projects */}
            {projectEntries.length > 0 && (
              <div className="portfolio-animate section-card">
                <h3 className="text-[11px] font-bold uppercase tracking-[0.15em] mb-5 flex items-center gap-2" style={{ color: accentHex }}>
                  <span className="w-1 h-4 rounded-full" style={{ background: accentHex }} /> Projects
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {projectEntries.map((proj: any) => {
                    const featured = renderFeaturedCard(
                      proj.title,
                      undefined,
                      undefined,
                      proj.description,
                      proj.assets,
                      proj.link ? (
                        <a 
                          href={proj.link} 
                          target="_blank" 
                          rel="noreferrer" 
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-bold text-white bg-white/20 hover:bg-white/30 transition-all shadow-sm"
                        >
                          <ExternalLink className="w-3.5 h-3.5" /> Visit Link
                        </a>
                      ) : undefined
                    );

                    if (featured) return featured;

                    return (
                      <div key={proj.id} className="project-card-m flex flex-col justify-between">
                        <div className="space-y-1.5">
                          <h4 className="text-sm font-bold text-slate-900">{proj.title}</h4>
                          {proj.description && <p className="text-xs text-slate-505 leading-relaxed">{proj.description}</p>}
                          {renderEntryAssets(proj.assets)}
                        </div>
                        {proj.link && (
                          <div className="mt-3.5 pt-2.5 border-t border-slate-100">
                            <a 
                              href={proj.link} 
                              target="_blank" 
                              rel="noreferrer" 
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 border rounded-xl text-[11px] font-bold transition-all shadow-sm w-full justify-center sm:w-auto"
                              style={{ color: accentHex, borderColor: accentMid, background: accentLight }}
                            >
                              <ExternalLink className="w-3.5 h-3.5" /> Visit Link
                            </a>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Certifications & Achievements */}
            {(certificateEntries.length > 0 || achievementEntries.length > 0) && (
              <div className="grid md:grid-cols-2 gap-6">
                {certificateEntries.length > 0 && (
                  <div className="portfolio-animate section-card">
                    <h3 className="text-[11px] font-bold uppercase tracking-[0.15em] mb-4 flex items-center gap-2" style={{ color: accentHex }}>
                      <Award className="w-4 h-4" /> Certifications
                    </h3>
                    <div className="space-y-4">
                      {certificateEntries.map((cert: any) => {
                        const featured = renderFeaturedCard(
                          cert.name || cert.title,
                          cert.issuer,
                          cert.date,
                          undefined,
                          cert.assets
                        );
                        if (featured) return featured;

                        return (
                          <div key={cert.id} className="space-y-0.5 pb-3 border-b border-slate-100 last:border-0 last:pb-0">
                            <h4 className="text-xs font-bold text-slate-900 leading-snug">{cert.name || cert.title}</h4>
                            <p className="text-[11px] text-slate-500 leading-normal">{cert.issuer}</p>
                            {cert.date && <p className="text-[10px] font-semibold" style={{ color: accentHex }}>{cert.date}</p>}
                            {renderEntryAssets(cert.assets)}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                {achievementEntries.length > 0 && (
                  <div className="portfolio-animate section-card">
                    <h3 className="text-[11px] font-bold uppercase tracking-[0.15em] mb-4 flex items-center gap-2" style={{ color: accentHex }}>
                      <Sparkles className="w-4 h-4" /> Achievements
                    </h3>
                    <div className="space-y-4">
                      {achievementEntries.map((ach: any) => {
                        const featured = renderFeaturedCard(
                          ach.title,
                          ach.organization,
                          ach.date,
                          undefined,
                          ach.assets
                        );
                        if (featured) return featured;

                        return (
                          <div key={ach.id} className="space-y-0.5 pb-3 border-b border-slate-100 last:border-0 last:pb-0">
                            <h4 className="text-xs font-bold text-slate-900 leading-snug">{ach.title}</h4>
                            <p className="text-[11px] text-slate-500 leading-normal">{ach.organization}</p>
                            {ach.date && <p className="text-[10px] font-semibold" style={{ color: accentHex }}>{ach.date}</p>}
                            {renderEntryAssets(ach.assets)}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </>
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
                  <a href={user.resumeUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-colors">
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
                      <h4 className="text-xs font-bold text-slate-900 leading-snug">{cert.name || cert.title}</h4>
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
                          <p className="text-xs font-semibold text-slate-600 font-sans mt-0.5">{edu.institution || edu.school}</p>
                        </div>
                        {(edu.duration || edu.year || edu.startYear || edu.endYear) && (
                          <span className="text-[10px] font-bold text-slate-400 whitespace-nowrap bg-slate-50 px-2 py-0.5 rounded border border-slate-100 font-sans">{edu.duration || edu.year || [edu.startYear, edu.endYear].filter(Boolean).join(' - ')}</span>
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
                      <p className="text-[11px] font-semibold text-slate-500 font-sans">{res.journal || res.publication || res.organization || 'Publication'}</p>
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
                  <Briefcase className="w-4 h-4 text-indigo-600" /> Professional Journeys
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {experienceEntries.map((exp: any) => (
                    <div key={exp.id} className="border border-slate-100 p-4 rounded-xl space-y-1 bg-slate-50/50 hover:border-slate-250 transition-colors">
                      <span className="text-[10px] font-bold text-indigo-600">{exp.duration}</span>
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
                  <BookOpen className="w-4.5 h-4.5 text-indigo-600" /> Showcase Projects
                </h3>
                <div className="grid grid-cols-1 gap-4">
                  {projectEntries.map((proj: any) => (
                    <div key={proj.id} className="p-4 rounded-xl border border-slate-100 space-y-1 bg-slate-50/20">
                      <div className="flex justify-between items-start gap-4">
                        <h4 className="text-sm font-bold text-slate-900">{proj.title}</h4>
                        {proj.link && (
                          <a href={proj.link} target="_blank" rel="noreferrer" className="text-indigo-600 hover:text-indigo-800 shrink-0">
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
                  <GraduationCap className="w-4.5 h-4.5 text-indigo-600" /> Education
                </h3>
                <div className="space-y-4">
                  {educationEntries.map((edu: any) => (
                    <div key={edu.id} className="space-y-0.5">
                      <h4 className="text-xs font-bold text-slate-900 leading-snug">{edu.degree}</h4>
                      <p className="text-[11px] text-slate-500 leading-normal">{edu.institution || edu.school}</p>
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
                      <h4 className="text-xs font-bold text-slate-900 leading-snug">{cert.name || cert.title}</h4>
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

  const bgStyle = (user as any).themeBg || 'grid';

  return (
    <div 
      className="min-h-screen pb-20 font-sans relative overflow-x-hidden transition-colors duration-300 text-slate-800" 
      style={{ 
        background: bgStyle === 'dots' || bgStyle === 'waves'
          ? '#f8fafc'
          : bgStyle === 'solid'
            ? `linear-gradient(135deg, ${accentHex}08 0%, ${accentHex}18 50%, ${accentHex}12 100%)`
            : `linear-gradient(135deg, #f8fafc 0%, ${accentLight} 30%, #f1f5f9 60%, ${accentLight} 100%)`
      }}
    >
      {/* Dynamic Background Overlays */}
      {bgStyle === 'grid' && (
        <>
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:14px_24px] pointer-events-none opacity-100" />
          <div className="absolute top-[-10%] left-[-5%] w-[500px] h-[500px] rounded-full blur-[120px] pointer-events-none" style={{ background: `${accentHex}08` }} />
          <div className="absolute bottom-[20%] right-[-5%] w-[450px] h-[450px] rounded-full blur-[100px] pointer-events-none" style={{ background: `${accentHex}06` }} />
        </>
      )}

      {bgStyle === 'dots' && (
        <>
          <div className="absolute inset-0 bg-[radial-gradient(#e2e8f0_1.5px,transparent_1.5px)] bg-[size:24px_24px] pointer-events-none" />
          <div className="absolute top-[10%] right-[10%] w-[320px] h-[320px] rounded-full blur-[80px] pointer-events-none" style={{ background: `${accentHex}12` }} />
          <div className="absolute bottom-[10%] left-[-10%] w-[420px] h-[420px] rounded-full blur-[100px] pointer-events-none" style={{ background: `${accentHex}08` }} />
        </>
      )}

      {bgStyle === 'waves' && (
        <>
          <div 
            className="absolute inset-0 pointer-events-none saturate-[1.2]" 
            style={{ 
              backgroundImage: `
                radial-gradient(at 0% 0%, ${accentLight} 0px, transparent 50%),
                radial-gradient(at 50% 0%, ${accentLight} 0px, transparent 50%),
                radial-gradient(at 100% 100%, ${accentLight} 0px, transparent 50%)
              `,
              backgroundSize: '100% 100%'
            }} 
          />
          <div 
            className="absolute bottom-0 left-0 right-0 h-[40vh] pointer-events-none -z-10" 
            style={{ 
              background: `linear-gradient(180deg, transparent, ${accentHex}08)`, 
              clipPath: 'ellipse(80% 50% at 50% 100%)' 
            }} 
          />
        </>
      )}

      {bgStyle === 'solid' && (
        <div 
          className="absolute inset-0 pointer-events-none" 
          style={{
            backgroundImage: `
              radial-gradient(circle at 20% 30%, ${accentHex}0c 0%, transparent 40%),
              radial-gradient(circle at 80% 70%, ${accentHex}12 0%, transparent 40%)
            `
          }}
        />
      )}

      {/* Portfolio Header Accent Bar */}
      {templateId === 'minimal' && (
        <div className="h-1.5 w-full sticky top-0 z-50" style={{ background: `linear-gradient(90deg, ${accentHex}, ${accentHex}88, ${accentHex})` }} />
      )}

      {/* Render selected template layout */}
      {templateId === 'minimal' && renderMinimalLayout()}
      {templateId === 'academic' && renderAcademicLayout()}
      {templateId === 'creative' && renderCreativeLayout()}

      {/* Footer */}
      <div className="max-w-4xl mx-auto px-4 pt-16 border-t border-slate-200/80 text-center space-y-2 relative z-10">
        <p className="text-xs font-bold uppercase tracking-wider" style={{ color: accentHex }}>Student Portfolio Network</p>
        <p className="text-xs text-slate-450">
          {BEXO_FOOTER_COPYRIGHT}
        </p>
        <div className="flex justify-center gap-4 pt-2 text-[11px] font-bold text-slate-400">
          <a href="/" className="hover:opacity-80 transition-colors" style={{ color: 'inherit' }}>About Bexo</a>
          <span>•</span>
          <a href="/privacy" className="hover:opacity-80 transition-colors" style={{ color: 'inherit' }}>Privacy Policy</a>
          <span>•</span>
          <a href="/terms" className="hover:opacity-80 transition-colors" style={{ color: 'inherit' }}>Terms of Service</a>
        </div>
      </div>

      {/* Floating Watermark */}
      <a 
        href="/" 
        target="_blank" 
        rel="noreferrer"
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 text-white px-3.5 py-2 rounded-full shadow-lg backdrop-blur-sm transition-all duration-300 hover:scale-105 active:scale-95 group font-sans bg-slate-900/90 border border-slate-800 hover:bg-slate-900"
      >
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: accentHex }}></span>
          <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: accentHex }}></span>
        </span>
        <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400 group-hover:text-white transition-colors">
          Built with
        </span>
        <span className="text-xs font-serif font-extrabold tracking-tight text-white flex items-center gap-1.5">
          <BrandLogo size="xs" /> BEXO
        </span>
      </a>
    </div>
  );
}
