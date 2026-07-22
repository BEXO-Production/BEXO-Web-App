import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import confetti from "canvas-confetti";
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
import { PLAN_LABELS } from "../lib/pricing";
import { BrandLogo } from "../components/BrandLogo";

import { portfolioHostname, portfolioPublicUrl } from "../lib/platform";

/** Session flag set right after payment / activation / free signup. */
export const JUST_ACTIVATED_KEY = "bexo_just_activated";

function resolveLiveSiteUrl(handle: string): { display: string; href: string } {
  const host = typeof window !== "undefined" ? window.location.hostname : "mybexo.cyou";
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
    display: portfolioHostname(handle),
    href: portfolioPublicUrl(handle),
  };
}

const CONFETTI_COLORS = ["#6366f1", "#818cf8", "#34d399", "#fbbf24", "#fb7185", "#38bdf8", "#ffffff"];

/** Big celebratory confetti choreography: center burst, side cannons, then a gentle rain. */
function fireCelebration() {
  // 1. Center explosion out of the box
  confetti({
    particleCount: 160,
    spread: 100,
    startVelocity: 55,
    origin: { x: 0.5, y: 0.62 },
    colors: CONFETTI_COLORS,
    scalar: 1.1,
    zIndex: 2000,
  });
  confetti({
    particleCount: 60,
    spread: 140,
    startVelocity: 35,
    decay: 0.92,
    origin: { x: 0.5, y: 0.6 },
    colors: CONFETTI_COLORS,
    shapes: ["circle"],
    scalar: 0.8,
    zIndex: 2000,
  });

  // 2. Side cannons (streamers)
  window.setTimeout(() => {
    confetti({
      particleCount: 70,
      angle: 60,
      spread: 60,
      startVelocity: 65,
      origin: { x: 0, y: 0.85 },
      colors: CONFETTI_COLORS,
      zIndex: 2000,
    });
    confetti({
      particleCount: 70,
      angle: 120,
      spread: 60,
      startVelocity: 65,
      origin: { x: 1, y: 0.85 },
      colors: CONFETTI_COLORS,
      zIndex: 2000,
    });
  }, 250);

  // 3. Soft golden rain for ~2s
  const rainEnd = Date.now() + 2000;
  (function rain() {
    confetti({
      particleCount: 4,
      spread: 120,
      startVelocity: 12,
      gravity: 0.55,
      ticks: 220,
      origin: { x: Math.random(), y: -0.05 },
      colors: CONFETTI_COLORS,
      scalar: 0.75,
      zIndex: 2000,
    });
    if (Date.now() < rainEnd) requestAnimationFrame(rain);
  })();
}

/** CSS 3D-ish gift box that shakes, then pops open. */
function GiftBox({ opening, onOpen }: { opening: boolean; onOpen: () => void }) {
  return (
    <motion.button
      type="button"
      onClick={onOpen}
      disabled={opening}
      aria-label="Open your portfolio"
      className="group relative mx-auto block cursor-pointer outline-none"
      initial={{ scale: 0, rotate: -8 }}
      animate={{ scale: 1, rotate: 0 }}
      transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.25 }}
    >
      {/* Glow pedestal */}
      <div className="absolute left-1/2 top-[86%] h-10 w-56 -translate-x-1/2 rounded-[100%] bg-indigo-500/30 blur-2xl transition group-hover:bg-indigo-400/40" />

      {/* Light beam that erupts on open */}
      <AnimatePresence>
        {opening && (
          <motion.div
            key="beam"
            initial={{ opacity: 0, scaleY: 0.2 }}
            animate={{ opacity: [0, 1, 0.7], scaleY: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="pointer-events-none absolute bottom-[45%] left-1/2 h-[46vh] w-40 origin-bottom -translate-x-1/2"
            style={{
              background:
                "linear-gradient(to top, rgba(129,140,248,0.55), rgba(129,140,248,0.12) 55%, transparent)",
              clipPath: "polygon(32% 100%, 68% 100%, 100% 0%, 0% 0%)",
              filter: "blur(2px)",
            }}
          />
        )}
      </AnimatePresence>

      {/* The box (lid + base), wobbling until opened */}
      <motion.div
        animate={
          opening
            ? { y: 12, scale: 0.96 }
            : { rotate: [0, -2.2, 2.2, -1.6, 1.6, 0], y: [0, -6, 0] }
        }
        transition={
          opening
            ? { duration: 0.4 }
            : { duration: 1.8, repeat: Infinity, repeatDelay: 1.1, ease: "easeInOut" }
        }
        className="relative"
      >
        {/* Lid */}
        <motion.div
          animate={
            opening
              ? { y: -190, x: 90, rotate: 38, opacity: 0 }
              : { y: 0, x: 0, rotate: 0, opacity: 1 }
          }
          transition={{ type: "spring", stiffness: 120, damping: 12 }}
          className="relative z-20 mx-auto h-12 w-56 sm:w-64"
        >
          <div className="absolute inset-0 rounded-lg bg-gradient-to-b from-indigo-400 to-indigo-600 shadow-xl shadow-indigo-900/40" />
          {/* Ribbon over lid */}
          <div className="absolute left-1/2 top-0 h-full w-8 -translate-x-1/2 bg-gradient-to-b from-amber-300 to-amber-400" />
          {/* Bow */}
          <div className="absolute -top-6 left-1/2 flex -translate-x-1/2 items-end">
            <div className="h-6 w-8 -rotate-[24deg] rounded-tl-full rounded-tr-full border-4 border-amber-400 bg-transparent" />
            <div className="h-6 w-8 rotate-[24deg] rounded-tl-full rounded-tr-full border-4 border-amber-400 bg-transparent" />
          </div>
        </motion.div>

        {/* Base */}
        <div className="relative z-10 mx-auto -mt-1 h-40 w-48 overflow-hidden rounded-b-xl bg-gradient-to-b from-indigo-500 via-indigo-600 to-indigo-800 shadow-2xl shadow-indigo-950/50 sm:w-56">
          {/* Vertical ribbon */}
          <div className="absolute left-1/2 top-0 h-full w-8 -translate-x-1/2 bg-gradient-to-b from-amber-400 to-amber-500" />
          {/* Face shine */}
          <div className="absolute inset-0 bg-gradient-to-r from-white/15 via-transparent to-black/25" />
          {/* BEXO mark on the box */}
          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 backdrop-blur-sm">
            <BrandLogo size="xs" />
            <span className="text-[10px] font-bold tracking-widest text-white/90">BEXO</span>
          </div>
        </div>

        {/* Sparkles hovering around the box */}
        {[
          { x: "-22%", y: "8%", d: 0 },
          { x: "108%", y: "20%", d: 0.6 },
          { x: "-14%", y: "70%", d: 1.2 },
          { x: "104%", y: "72%", d: 0.3 },
        ].map((s, i) => (
          <motion.span
            key={i}
            className="absolute z-30 text-indigo-300"
            style={{ left: s.x, top: s.y }}
            animate={{ opacity: [0.2, 1, 0.2], scale: [0.7, 1.15, 0.7], rotate: [0, 20, 0] }}
            transition={{ duration: 2.2, repeat: Infinity, delay: s.d }}
          >
            <Sparkles className="h-4 w-4 sm:h-5 sm:w-5" />
          </motion.span>
        ))}
      </motion.div>
    </motion.button>
  );
}

export default function WelcomeSuccess() {
  const { data } = useOnboarding();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const prefersReducedMotion = useReducedMotion();
  const [copied, setCopied] = useState(false);
  const [ready, setReady] = useState(false);
  // unbox stages: "box" (waiting for tap) -> "opening" (lid flies, confetti) -> "reveal" (content)
  const [stage, setStage] = useState<"box" | "opening" | "reveal">("box");
  const openTimer = useRef<number | null>(null);

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

  const firstName = data.name ? data.name.split(" ")[0] : "";
  const planLabel = data.isPremium
    ? `${PLAN_LABELS[data.plan || ""] || "Pro"} Plan`
    : "Free";

  useEffect(() => {
    const justActivated = sessionStorage.getItem(JUST_ACTIVATED_KEY) === "1";
    if (!justActivated && data.hasCompletedOnboarding) {
      // Deep-link without a fresh activation → dashboard
      setLocation("/dashboard");
      return;
    }
    setReady(true);
    if (prefersReducedMotion) setStage("reveal");
  }, [data.hasCompletedOnboarding, setLocation, prefersReducedMotion]);

  useEffect(() => () => {
    if (openTimer.current) window.clearTimeout(openTimer.current);
  }, []);

  const handleUnbox = () => {
    if (stage !== "box") return;
    setStage("opening");
    fireCelebration();
    if (navigator.vibrate) navigator.vibrate([30, 40, 80]);
    openTimer.current = window.setTimeout(() => setStage("reveal"), 900);
  };

  const skipToReveal = () => {
    if (stage === "reveal") return;
    setStage("reveal");
    confetti({
      particleCount: 80,
      spread: 90,
      origin: { x: 0.5, y: 0.4 },
      colors: CONFETTI_COLORS,
      zIndex: 2000,
    });
  };

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
      <div className="flex min-h-[100dvh] items-center justify-center bg-slate-950">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
      </div>
    );
  }

  // ────────────────────────────────────────────────────────────────────
  // STAGE 1 + 2 — the unboxing moment (dark, cinematic)
  // ────────────────────────────────────────────────────────────────────
  if (stage !== "reveal") {
    return (
      <div className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden bg-slate-950 px-4 text-white">
        {/* Star-field / aurora backdrop */}
        <div
          className="pointer-events-none absolute inset-0"
          aria-hidden
          style={{
            background:
              "radial-gradient(ellipse 70% 45% at 50% 115%, rgba(99,102,241,0.35), transparent 60%), radial-gradient(ellipse 45% 30% at 15% 0%, rgba(56,189,248,0.14), transparent 55%), radial-gradient(ellipse 45% 30% at 90% 10%, rgba(244,63,94,0.10), transparent 55%)",
          }}
        />
        <div
          className="pointer-events-none absolute inset-0 opacity-30"
          aria-hidden
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.35) 1px, transparent 0)",
            backgroundSize: "34px 34px",
            maskImage: "radial-gradient(ellipse 70% 60% at 50% 40%, black, transparent)",
          }}
        />

        <motion.header
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="absolute top-0 flex w-full max-w-5xl items-center justify-between px-5 pt-6"
        >
          <div className="flex items-center gap-2.5">
            <BrandLogo size="md" />
            <span className="font-serif text-lg font-bold tracking-tight">BEXO</span>
          </div>
          <button
            type="button"
            onClick={skipToReveal}
            className="rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-[11px] font-semibold text-white/60 transition hover:bg-white/10 hover:text-white"
          >
            Skip animation
          </button>
        </motion.header>

        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="mb-3 text-center text-[11px] font-bold uppercase tracking-[0.3em] text-indigo-300"
        >
          {data.isPremium ? "Payment confirmed" : "Portfolio published"}
        </motion.p>
        <motion.h1
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45 }}
          className="mb-10 max-w-md text-center font-serif text-3xl font-bold leading-tight tracking-tight sm:text-4xl"
        >
          {firstName ? `${firstName}, your portfolio is ready.` : "Your portfolio is ready."}
        </motion.h1>

        <GiftBox opening={stage === "opening"} onOpen={handleUnbox} />

        <motion.p
          animate={{ opacity: stage === "opening" ? 0 : [0.5, 1, 0.5] }}
          transition={
            stage === "opening" ? { duration: 0.2 } : { duration: 1.8, repeat: Infinity }
          }
          className="mt-10 text-center text-sm font-semibold text-white/70"
        >
          Tap the box to unbox your live website
        </motion.p>
      </div>
    );
  }

  // ────────────────────────────────────────────────────────────────────
  // STAGE 3 — the reveal (content rises out of the box)
  // ────────────────────────────────────────────────────────────────────
  const spring = { type: "spring" as const, stiffness: 90, damping: 16 };

  return (
    <div className="relative min-h-[100dvh] overflow-x-hidden bg-slate-950 text-white">
      {/* Same aurora backdrop as the unboxing stage */}
      <div
        className="pointer-events-none fixed inset-0"
        aria-hidden
        style={{
          background:
            "radial-gradient(ellipse 70% 45% at 50% 115%, rgba(99,102,241,0.35), transparent 60%), radial-gradient(ellipse 45% 30% at 15% 0%, rgba(56,189,248,0.14), transparent 55%), radial-gradient(ellipse 45% 30% at 90% 10%, rgba(244,63,94,0.10), transparent 55%)",
        }}
      />
      <div
        className="pointer-events-none fixed inset-0 opacity-30"
        aria-hidden
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.35) 1px, transparent 0)",
          backgroundSize: "34px 34px",
          maskImage: "radial-gradient(ellipse 70% 60% at 50% 40%, black, transparent)",
        }}
      />

      <div className="relative mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-6 sm:px-6 sm:pb-10 sm:pt-8 md:gap-8">
        <motion.header
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={spring}
          className="flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2.5">
            <BrandLogo size="md" />
            <span className="font-serif text-lg font-bold tracking-tight">BEXO</span>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-emerald-300">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {data.isPremium ? "Pro active" : "Live"}
          </span>
        </motion.header>

        <section className="text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ ...spring, delay: 0.05 }}
            className="mb-4 inline-flex items-center gap-2 rounded-full border border-indigo-400/25 bg-indigo-400/10 px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.25em] text-indigo-300"
          >
            <PartyPopper className="h-3.5 w-3.5" />
            Congratulations
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...spring, delay: 0.12 }}
            className="font-serif text-3xl font-bold leading-tight tracking-tight text-white sm:text-4xl md:text-5xl"
          >
            {firstName ? `${firstName}, you're live!` : "You're live!"}
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...spring, delay: 0.2 }}
            className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-white/60 sm:text-base"
          >
            {data.isPremium
              ? "Payment confirmed. Your Pro portfolio is published with your chosen template — share the link and start applying."
              : "Your free portfolio is published. Upgrade anytime to unlock Pro templates and a custom subdomain."}
          </motion.p>
        </section>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-6">
          {/* URL + meta card — dark glass */}
          <motion.div
            initial={{ opacity: 0, y: 32 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...spring, delay: 0.28 }}
            className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4 shadow-2xl shadow-indigo-950/40 backdrop-blur-md sm:p-6"
          >
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/40">Your live website</p>
              {live ? (
                <div className="mt-2.5 flex flex-col gap-2 sm:flex-row sm:items-stretch">
                  <div className="relative flex min-w-0 flex-1 items-center gap-2 overflow-hidden rounded-xl border border-indigo-400/30 bg-indigo-500/15 px-3 py-3">
                    {/* shine sweep */}
                    <motion.div
                      aria-hidden
                      className="pointer-events-none absolute inset-y-0 w-16 bg-gradient-to-r from-transparent via-white/25 to-transparent"
                      initial={{ x: "-120%" }}
                      animate={{ x: "480%" }}
                      transition={{ duration: 1.6, delay: 0.9, repeat: Infinity, repeatDelay: 3.4 }}
                    />
                    <Globe className="h-4 w-4 shrink-0 text-indigo-300" />
                    <span className="truncate font-mono text-xs font-semibold text-indigo-100 sm:text-sm">
                      {live.display}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={copyUrl}
                      className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3 text-xs font-bold text-white/80 transition hover:bg-white/10 hover:text-white sm:flex-none"
                    >
                      {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                      {copied ? "Copied" : "Copy"}
                    </button>
                    <button
                      type="button"
                      onClick={shareUrl}
                      className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3 text-xs font-bold text-white/80 transition hover:bg-white/10 hover:text-white sm:flex-none"
                    >
                      <Share2 className="h-4 w-4" />
                      Share
                    </button>
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-sm text-white/50">Handle not set yet — finish setup from the dashboard.</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">Template</p>
                <p className="mt-1 text-sm font-semibold text-white">
                  {templateMeta?.name || templateId}
                </p>
              </div>
              <div className="border-l border-white/10 pl-3.5">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">Plan</p>
                <p className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold text-amber-300">
                  <Sparkles className="h-3.5 w-3.5" />
                  {planLabel}
                </p>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <motion.a
                href={live?.href || "#"}
                target="_blank"
                rel="noopener noreferrer"
                whileHover={{ scale: 1.015 }}
                whileTap={{ scale: 0.98 }}
                className={cn(
                  "inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-indigo-500 to-indigo-600 text-sm font-bold text-white shadow-lg shadow-indigo-900/50 ring-1 ring-inset ring-white/20 transition hover:from-indigo-400 hover:to-indigo-600",
                  !live && "pointer-events-none opacity-40",
                )}
              >
                Open live site <ExternalLink className="h-4 w-4" />
              </motion.a>
              <motion.button
                type="button"
                onClick={goDashboard}
                whileHover={{ scale: 1.015 }}
                whileTap={{ scale: 0.98 }}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/10 text-sm font-bold text-white shadow-lg shadow-slate-950/40 backdrop-blur-sm transition hover:bg-white/15"
              >
                <LayoutDashboard className="h-4 w-4" />
                Go to Dashboard
              </motion.button>
            </div>

            <ul className="mt-auto space-y-2.5 border-t border-white/10 pt-4 text-left text-xs text-white/55">
              {[
                "Add this link to your resume and LinkedIn",
                isPremiumTemplate(templateId)
                  ? "Pro template is served on your subdomain"
                  : "Upgrade later to unlock Cura, Sierra & Nico",
                "Edit content anytime from your dashboard",
              ].map((line, i) => (
                <motion.li
                  key={line}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ ...spring, delay: 0.5 + i * 0.12 }}
                  className="flex items-start gap-2"
                >
                  <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300/80" />
                  <span>{line}</span>
                </motion.li>
              ))}
            </ul>
          </motion.div>

          {/* Live preview — rises out of the box, dark browser chrome */}
          <motion.div
            initial={{ opacity: 0, y: 90, scale: 0.9, rotateX: 8 }}
            animate={{ opacity: 1, y: 0, scale: 1, rotateX: 0 }}
            transition={{ ...spring, delay: 0.36 }}
            style={{ transformPerspective: 1000 }}
            className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] shadow-2xl shadow-indigo-950/50 backdrop-blur-md"
          >
            {/* Glow under the preview, like the box pedestal */}
            <div className="pointer-events-none absolute -bottom-10 left-1/2 h-16 w-3/4 -translate-x-1/2 rounded-[100%] bg-indigo-500/25 blur-3xl" aria-hidden />
            <div className="flex items-center gap-2 border-b border-white/10 bg-white/[0.04] px-3 py-2.5">
              <span className="h-2.5 w-2.5 rounded-full bg-red-400/90" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400/90" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/90" />
              <div className="ml-2 flex min-w-0 flex-1 items-center gap-1.5 rounded-lg border border-white/10 bg-slate-950/60 px-2.5 py-1">
                <Globe className="h-3 w-3 shrink-0 text-indigo-300/70" />
                <span className="truncate font-mono text-[10px] text-white/60 sm:text-[11px]">
                  {live?.display || "preview"}
                </span>
              </div>
            </div>
            <div className="relative h-[min(52vh,420px)] bg-slate-900 sm:h-[480px]">
              {previewSrc ? (
                <iframe
                  title="Portfolio preview"
                  src={previewSrc}
                  className="absolute inset-0 h-full w-full border-0 bg-white"
                  sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-white/40">
                  Preview unavailable
                </div>
              )}
            </div>
          </motion.div>
        </div>
      </div>

      {/* Sticky mobile / desktop CTA */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...spring, delay: 0.55 }}
        className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-slate-950/85 px-4 py-3 backdrop-blur-md sm:static sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:backdrop-blur-none"
      >
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-2 sm:flex-row sm:justify-end sm:px-6 sm:pb-8">
          <button
            type="button"
            onClick={goDashboard}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-indigo-500 to-indigo-600 text-sm font-bold text-white shadow-lg shadow-indigo-900/50 ring-1 ring-inset ring-white/20 transition hover:from-indigo-400 hover:to-indigo-600 sm:w-auto sm:min-w-[220px] sm:px-6"
          >
            <LayoutDashboard className="h-4 w-4" />
            Go to Dashboard
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </motion.div>
    </div>
  );
}
