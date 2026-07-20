import React, { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  ArrowRight,
  CheckCircle2,
  Copy,
  Check,
  ExternalLink,
  Globe,
  LayoutDashboard,
  PartyPopper,
  Share2,
  Sparkles,
} from "lucide-react";
import { useOnboarding } from "../context/OnboardingContext";
import { useToast } from "../hooks/use-toast";
import { cn } from "../design-system/primitives";
import {
  DEFAULT_TEMPLATE_ID,
  FREE_FALLBACK_TEMPLATE_ID,
  getTemplatePreviewUrl,
  isPremiumTemplate,
  PORTFOLIO_TEMPLATES,
} from "../lib/templates";
import logo from "../assets/bexo-logo.png";

/** Session flag set right after payment / activation / free signup. */
export const JUST_ACTIVATED_KEY = "bexo_just_activated";

function resolveLiveSiteUrl(handle: string): { display: string; href: string } {
  const host = typeof window !== "undefined" ? window.location.hostname : "atbexo.com";
  const isLocal =
    host === "localhost" ||
    host === "127.0.0.1" ||
    host.endsWith(".localhost");

  if (isLocal) {
    const apiPort = import.meta.env.VITE_API_PORT || "5001";
    const href = `http://${handle}.localhost:${apiPort}/`;
    return { display: `${handle}.localhost:${apiPort}`, href };
  }

  return {
    display: `${handle}.atbexo.com`,
    href: `https://${handle}.atbexo.com`,
  };
}

export default function WelcomeSuccess() {
  const { data } = useOnboarding();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [ready, setReady] = useState(false);

  const handle = (data.handle || "").trim().toLowerCase();
  const templateId = isPremiumTemplate(data.templateId)
    ? (data.templateId as string)
    : data.isPremium
      ? DEFAULT_TEMPLATE_ID
      : FREE_FALLBACK_TEMPLATE_ID;
  const templateMeta = PORTFOLIO_TEMPLATES.find((t) => t.id === templateId);
  const live = useMemo(() => (handle ? resolveLiveSiteUrl(handle) : null), [handle]);
  const previewSrc = handle
    ? getTemplatePreviewUrl(
        templateId === FREE_FALLBACK_TEMPLATE_ID ? DEFAULT_TEMPLATE_ID : templateId,
        data.isPremium ? handle : undefined,
      )
    : null;

  useEffect(() => {
    const justActivated = sessionStorage.getItem(JUST_ACTIVATED_KEY) === "1";
    if (!justActivated && data.hasCompletedOnboarding) {
      // Deep-link without a fresh activation → dashboard
      setLocation("/dashboard");
      return;
    }
    setReady(true);
  }, [data.hasCompletedOnboarding, setLocation]);

  const copyUrl = async () => {
    if (!live) return;
    try {
      await navigator.clipboard.writeText(live.href);
      setCopied(true);
      toast({ title: "Copied", description: "Your live portfolio link is on the clipboard." });
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Copy failed", description: "Select the URL and copy it manually.", variant: "destructive" });
    }
  };

  const shareUrl = async () => {
    if (!live) return;
    const title = `${data.name || "My"} portfolio on BEXO`;
    const text = `Check out my professional portfolio: ${live.href}`;
    if (navigator.share) {
      try {
        await navigator.share({ title, text, url: live.href });
        return;
      } catch {
        /* fall through */
      }
    }
    await copyUrl();
  };

  const goDashboard = () => {
    sessionStorage.removeItem(JUST_ACTIVATED_KEY);
    setLocation("/dashboard");
  };

  if (!ready) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-slate-50">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="relative min-h-[100dvh] overflow-x-hidden bg-slate-50 text-slate-900">
      {/* Soft celebration backdrop */}
      <div
        className="pointer-events-none absolute inset-0 opacity-90"
        aria-hidden
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% -10%, rgba(99,102,241,0.18), transparent 55%), radial-gradient(ellipse 60% 40% at 100% 0%, rgba(16,185,129,0.12), transparent 50%), radial-gradient(ellipse 50% 30% at 0% 100%, rgba(244,63,94,0.08), transparent 45%)",
        }}
      />

      <div className="relative mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-6 sm:px-6 sm:pb-10 sm:pt-10 md:gap-8">
        <header className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <img src={logo} alt="BEXO" className="h-8 w-8 object-contain" />
            <span className="font-serif text-lg font-bold tracking-tight">BEXO</span>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {data.isPremium ? "Pro active" : "Live"}
          </span>
        </header>

        <section className="animate-in fade-in slide-in-from-bottom-3 duration-500 text-center sm:text-left">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-indigo-700">
            <PartyPopper className="h-3.5 w-3.5" />
            Congratulations
          </div>
          <h1 className="font-serif text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl md:text-5xl">
            {data.name ? `${data.name.split(" ")[0]}, you're live!` : "You're live!"}
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-slate-500 sm:mx-0 sm:text-base">
            {data.isPremium
              ? "Payment confirmed. Your Pro portfolio is published with your chosen template — share the link and start applying."
              : "Your free portfolio is published. Upgrade anytime to unlock Pro templates and a custom subdomain."}
          </p>
        </section>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-6">
          {/* URL + meta card */}
          <div className="flex flex-col gap-4 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-6">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Your live website</p>
              {live ? (
                <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-stretch">
                  <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                    <Globe className="h-4 w-4 shrink-0 text-indigo-500" />
                    <span className="truncate font-mono text-xs font-semibold text-slate-800 sm:text-sm">
                      {live.display}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={copyUrl}
                      className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 transition hover:bg-slate-50 sm:flex-none"
                    >
                      {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                      {copied ? "Copied" : "Copy"}
                    </button>
                    <button
                      type="button"
                      onClick={shareUrl}
                      className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 transition hover:bg-slate-50 sm:flex-none"
                    >
                      <Share2 className="h-4 w-4" />
                      Share
                    </button>
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-sm text-slate-500">Handle not set yet — finish setup from the dashboard.</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Template</p>
                <p className="mt-0.5 text-sm font-semibold text-slate-900">
                  {templateMeta?.name || templateId}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Plan</p>
                <p className="mt-0.5 text-sm font-semibold text-slate-900">
                  {data.isPremium
                    ? data.plan === "lifetime"
                      ? "Lifetime Pro"
                      : "Annual Pro"
                    : "Free"}
                </p>
              </div>
            </div>

            <a
              href={live?.href || "#"}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-indigo-600 text-sm font-bold text-white shadow-lg shadow-indigo-600/20 transition hover:bg-indigo-700",
                !live && "pointer-events-none opacity-40",
              )}
            >
              Open live site <ExternalLink className="h-4 w-4" />
            </a>

            <ul className="space-y-2 text-left text-xs text-slate-500">
              {[
                "Add this link to your resume and LinkedIn",
                isPremiumTemplate(templateId)
                  ? "Pro template is served on your subdomain"
                  : "Upgrade later to unlock Cura, Sierra & Nico",
                "Edit content anytime from your dashboard",
              ].map((line) => (
                <li key={line} className="flex items-start gap-2">
                  <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-400" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Live preview */}
          <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
            <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-100 px-3 py-2.5">
              <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
              <div className="ml-2 flex min-w-0 flex-1 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1">
                <Globe className="h-3 w-3 shrink-0 text-slate-400" />
                <span className="truncate font-mono text-[10px] text-slate-500 sm:text-[11px]">
                  {live?.display || "preview"}
                </span>
              </div>
            </div>
            <div className="relative h-[min(52vh,420px)] bg-slate-900/5 sm:h-[480px]">
              {previewSrc ? (
                <iframe
                  title="Portfolio preview"
                  src={previewSrc}
                  className="absolute inset-0 h-full w-full border-0 bg-white"
                  sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-slate-400">
                  Preview unavailable
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Sticky mobile / desktop CTA */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200/80 bg-white/95 px-4 py-3 backdrop-blur-md sm:static sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:backdrop-blur-none">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-2 sm:flex-row sm:justify-end sm:px-6 sm:pb-8">
          <button
            type="button"
            onClick={goDashboard}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 text-sm font-bold text-white shadow-lg shadow-slate-900/15 transition hover:bg-slate-800 sm:w-auto sm:min-w-[220px] sm:px-6"
          >
            <LayoutDashboard className="h-4 w-4" />
            Go to Dashboard
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
