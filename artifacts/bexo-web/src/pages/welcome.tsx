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
  Share2,
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

import { pathPortfolioUrl, portfolioHostname, portfolioPublicUrl } from "../lib/platform";

/** Session flag set right after payment / activation / free signup. */
export const JUST_ACTIVATED_KEY = "bexo_just_activated";

function resolveLiveSiteUrl(
  handle: string,
  isPremium: boolean,
): { display: string; href: string } {
  const host = typeof window !== "undefined" ? window.location.hostname : "dash.mybexo.com";
  const isLocal =
    host === "localhost" ||
    host === "127.0.0.1" ||
    host.endsWith(".localhost");

  if (isLocal) {
    if (isPremium) {
      const apiPort = import.meta.env.VITE_API_PORT || "5001";
      const href = `http://${handle}.localhost:${apiPort}/`;
      return { display: `${handle}.localhost:${apiPort}`, href };
    }
    const href = `${window.location.origin}/${handle}`;
    return { display: `${window.location.host}/${handle}`, href };
  }

  if (isPremium) {
    return {
      display: portfolioHostname(handle),
      href: portfolioPublicUrl(handle),
    };
  }

  const href = pathPortfolioUrl(handle);
  return {
    display: href.replace(/^https?:\/\//, ""),
    href,
  };
}

const CONFETTI_COLORS = ["#c4a574", "#e8d5b5", "#8a7355", "#f5f0e8", "#5c6b5a", "#2a2622"];

function fireCelebration() {
  confetti({
    particleCount: 120,
    spread: 88,
    startVelocity: 48,
    origin: { x: 0.5, y: 0.62 },
    colors: CONFETTI_COLORS,
    scalar: 1,
    zIndex: 2000,
  });
  confetti({
    particleCount: 40,
    spread: 120,
    startVelocity: 28,
    decay: 0.92,
    origin: { x: 0.5, y: 0.6 },
    colors: CONFETTI_COLORS,
    shapes: ["circle"],
    scalar: 0.75,
    zIndex: 2000,
  });

  window.setTimeout(() => {
    confetti({
      particleCount: 50,
      angle: 60,
      spread: 52,
      startVelocity: 55,
      origin: { x: 0, y: 0.85 },
      colors: CONFETTI_COLORS,
      zIndex: 2000,
    });
    confetti({
      particleCount: 50,
      angle: 120,
      spread: 52,
      startVelocity: 55,
      origin: { x: 1, y: 0.85 },
      colors: CONFETTI_COLORS,
      zIndex: 2000,
    });
  }, 250);

  const rainEnd = Date.now() + 1800;
  (function rain() {
    confetti({
      particleCount: 3,
      spread: 100,
      startVelocity: 10,
      gravity: 0.55,
      ticks: 200,
      origin: { x: Math.random(), y: -0.05 },
      colors: CONFETTI_COLORS,
      scalar: 0.7,
      zIndex: 2000,
    });
    if (Date.now() < rainEnd) requestAnimationFrame(rain);
  })();
}

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "B";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[parts.length - 1][0] || ""}`.toUpperCase();
}

function WelcomeAvatar({
  name,
  photoUrl,
  size = "lg",
}: {
  name: string;
  photoUrl?: string;
  size?: "md" | "lg" | "xl";
}) {
  const [broken, setBroken] = useState(false);
  const initials = initialsFromName(name || "BEXO");
  const dims =
    size === "xl"
      ? "h-24 w-24 sm:h-28 sm:w-28 text-2xl sm:text-3xl"
      : size === "lg"
        ? "h-20 w-20 sm:h-24 sm:w-24 text-xl sm:text-2xl"
        : "h-14 w-14 text-lg";

  return (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden rounded-full",
        "bg-gradient-to-br from-[#3a342c] to-[#1a1714]",
        "ring-1 ring-[#c4a574]/45 shadow-[0_0_0_6px_rgba(196,165,116,0.08),0_18px_40px_-12px_rgba(0,0,0,0.55)]",
        dims,
      )}
    >
      {photoUrl && !broken ? (
        <img
          src={photoUrl}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setBroken(true)}
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center font-serif font-normal tracking-wide text-[#e8d5b5]">
          {initials}
        </span>
      )}
      <span
        className="pointer-events-none absolute inset-0 rounded-full"
        style={{
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -10px 24px rgba(0,0,0,0.35)",
        }}
        aria-hidden
      />
    </div>
  );
}

/** CSS gift box — navy & champagne, quiet wobble until opened. */
function GiftBox({ opening, onOpen }: { opening: boolean; onOpen: () => void }) {
  return (
    <motion.button
      type="button"
      onClick={onOpen}
      disabled={opening}
      aria-label="Open your portfolio"
      className="group relative mx-auto block cursor-pointer outline-none"
      initial={{ scale: 0.88, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 180, damping: 18, delay: 0.2 }}
    >
      <div className="absolute left-1/2 top-[88%] h-8 w-52 -translate-x-1/2 rounded-[100%] bg-[#c4a574]/20 blur-2xl transition group-hover:bg-[#c4a574]/30" />

      <AnimatePresence>
        {opening && (
          <motion.div
            key="beam"
            initial={{ opacity: 0, scaleY: 0.2 }}
            animate={{ opacity: [0, 0.9, 0.55], scaleY: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.75, ease: "easeOut" }}
            className="pointer-events-none absolute bottom-[45%] left-1/2 h-[42vh] w-36 origin-bottom -translate-x-1/2"
            style={{
              background:
                "linear-gradient(to top, rgba(196,165,116,0.45), rgba(196,165,116,0.1) 55%, transparent)",
              clipPath: "polygon(32% 100%, 68% 100%, 100% 0%, 0% 0%)",
              filter: "blur(2px)",
            }}
          />
        )}
      </AnimatePresence>

      <motion.div
        animate={
          opening
            ? { y: 10, scale: 0.97 }
            : { rotate: [0, -1.6, 1.6, -1.1, 1.1, 0], y: [0, -5, 0] }
        }
        transition={
          opening
            ? { duration: 0.4 }
            : { duration: 2.2, repeat: Infinity, repeatDelay: 1.4, ease: "easeInOut" }
        }
        className="relative"
      >
        <motion.div
          animate={
            opening
              ? { y: -170, x: 70, rotate: 28, opacity: 0 }
              : { y: 0, x: 0, rotate: 0, opacity: 1 }
          }
          transition={{ type: "spring", stiffness: 110, damping: 14 }}
          className="relative z-20 mx-auto h-11 w-52 sm:w-60"
        >
          <div className="absolute inset-0 rounded-md bg-gradient-to-b from-[#3d4a5c] to-[#1e2633] shadow-xl shadow-black/40" />
          <div className="absolute left-1/2 top-0 h-full w-7 -translate-x-1/2 bg-gradient-to-b from-[#e8d5b5] to-[#c4a574]" />
          <div className="absolute -top-5 left-1/2 flex -translate-x-1/2 items-end">
            <div className="h-5 w-7 -rotate-[24deg] rounded-tl-full rounded-tr-full border-[3px] border-[#c4a574] bg-transparent" />
            <div className="h-5 w-7 rotate-[24deg] rounded-tl-full rounded-tr-full border-[3px] border-[#c4a574] bg-transparent" />
          </div>
        </motion.div>

        <div className="relative z-10 mx-auto -mt-1 h-36 w-44 overflow-hidden rounded-b-lg bg-gradient-to-b from-[#2a3444] via-[#1a222e] to-[#0f141c] shadow-2xl shadow-black/50 sm:w-52">
          <div className="absolute left-1/2 top-0 h-full w-7 -translate-x-1/2 bg-gradient-to-b from-[#c4a574] to-[#8a7355]" />
          <div className="absolute inset-0 bg-gradient-to-r from-white/10 via-transparent to-black/30" />
          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-[#c4a574]/25 bg-black/30 px-2.5 py-1 backdrop-blur-sm">
            <BrandLogo size="xs" />
            <span className="text-[9px] font-semibold tracking-[0.22em] text-[#e8d5b5]/90">BEXO</span>
          </div>
        </div>

        {/* Soft gold motes */}
        {[
          { x: "-18%", y: "12%", d: 0 },
          { x: "104%", y: "28%", d: 0.7 },
          { x: "-10%", y: "68%", d: 1.3 },
        ].map((s, i) => (
          <motion.span
            key={i}
            className="absolute z-30 h-1.5 w-1.5 rounded-full bg-[#e8d5b5]"
            style={{ left: s.x, top: s.y }}
            animate={{ opacity: [0.15, 0.85, 0.15], scale: [0.6, 1.2, 0.6] }}
            transition={{ duration: 2.6, repeat: Infinity, delay: s.d }}
          />
        ))}
      </motion.div>
    </motion.button>
  );
}

function Atmosphere() {
  return (
    <>
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden
        style={{
          background:
            "radial-gradient(ellipse 65% 42% at 50% 108%, rgba(196,165,116,0.16), transparent 58%), radial-gradient(ellipse 40% 28% at 12% 8%, rgba(92,107,90,0.12), transparent 55%), radial-gradient(ellipse 36% 24% at 88% 6%, rgba(58,52,44,0.5), transparent 50%)",
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.22]"
        aria-hidden
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(232,213,181,0.35) 1px, transparent 0)",
          backgroundSize: "36px 36px",
          maskImage: "radial-gradient(ellipse 70% 58% at 50% 38%, black, transparent)",
        }}
      />
      <img
        src="/portal-illustration.png"
        alt=""
        aria-hidden
        className="pointer-events-none absolute -right-16 bottom-0 hidden max-h-[48vh] w-auto opacity-[0.07] grayscale contrast-125 md:block"
      />
    </>
  );
}

export default function WelcomeSuccess() {
  const { data } = useOnboarding();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const prefersReducedMotion = useReducedMotion();
  const [copied, setCopied] = useState(false);
  const [ready, setReady] = useState(false);
  const [stage, setStage] = useState<"box" | "opening" | "reveal">("box");
  const openTimer = useRef<number | null>(null);

  const handle = (data.handle || "").trim().toLowerCase();
  const templateId = isPremiumTemplate(data.templateId)
    ? (data.templateId as string)
    : data.isPremium
      ? DEFAULT_TEMPLATE_ID
      : FREE_FALLBACK_TEMPLATE_ID;
  const templateMeta = PORTFOLIO_TEMPLATES.find((t) => t.id === templateId);
  const live = useMemo(
    () => (handle ? resolveLiveSiteUrl(handle, !!data.isPremium) : null),
    [handle, data.isPremium],
  );
  const previewSrc = handle
    ? getTemplatePreviewUrl(
        templateId === FREE_FALLBACK_TEMPLATE_ID ? DEFAULT_TEMPLATE_ID : templateId,
        data.isPremium ? handle : undefined,
      )
    : null;

  const firstName = data.name ? data.name.split(" ")[0] : "";
  const displayName = data.name?.trim() || firstName || "Member";
  const planLabel = data.isPremium
    ? `${PLAN_LABELS[data.plan || ""] || "Pro"} Plan`
    : "Free";
  const photoUrl = (data.photoUrl || "").trim();

  useEffect(() => {
    const justActivated = sessionStorage.getItem(JUST_ACTIVATED_KEY) === "1";
    if (!justActivated && data.hasCompletedOnboarding) {
      setLocation("/dashboard");
      return;
    }
    setReady(true);
    if (prefersReducedMotion) setStage("reveal");
  }, [data.hasCompletedOnboarding, setLocation, prefersReducedMotion]);

  useEffect(
    () => () => {
      if (openTimer.current) window.clearTimeout(openTimer.current);
    },
    [],
  );

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
      particleCount: 60,
      spread: 80,
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
      <div className="flex min-h-[100dvh] items-center justify-center bg-[#0c0b09]">
        <div className="h-9 w-9 animate-spin rounded-full border-2 border-[#c4a574]/40 border-t-[#c4a574]" />
      </div>
    );
  }

  if (stage !== "reveal") {
    return (
      <div className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden bg-[#0c0b09] px-4 text-[#f5f0e8]">
        <Atmosphere />

        <motion.header
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
          className="absolute top-0 flex w-full max-w-5xl items-center justify-between px-5 pt-6"
        >
          <div className="flex items-center gap-2.5">
            <BrandLogo size="md" />
            <span className="font-serif text-lg tracking-tight text-[#f5f0e8]">BEXO</span>
          </div>
          <button
            type="button"
            onClick={skipToReveal}
            className="rounded-full border border-[#c4a574]/20 bg-white/[0.03] px-3.5 py-1.5 text-[11px] font-medium tracking-wide text-[#e8d5b5]/70 transition hover:border-[#c4a574]/40 hover:text-[#f5f0e8]"
          >
            Skip animation
          </button>
        </motion.header>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.28 }}
          className="mb-6 flex flex-col items-center"
        >
          <WelcomeAvatar name={displayName} photoUrl={photoUrl} size="lg" />
          {handle ? (
            <p className="mt-3 font-mono text-[11px] tracking-[0.14em] text-[#c4a574]/75">
              @{handle}
            </p>
          ) : null}
        </motion.div>

        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.38 }}
          className="mb-2 text-center text-[10px] font-semibold uppercase tracking-[0.32em] text-[#c4a574]"
        >
          {data.isPremium ? "Payment confirmed" : "Portfolio published"}
        </motion.p>
        <motion.h1
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.46 }}
          className="mb-9 max-w-md text-center font-serif text-[1.85rem] font-normal leading-[1.15] tracking-tight text-[#f5f0e8] sm:text-4xl"
        >
          {firstName ? `${firstName}, your portfolio is ready.` : "Your portfolio is ready."}
        </motion.h1>

        <GiftBox opening={stage === "opening"} onOpen={handleUnbox} />

        <motion.p
          animate={{ opacity: stage === "opening" ? 0 : [0.45, 0.9, 0.45] }}
          transition={
            stage === "opening" ? { duration: 0.2 } : { duration: 2.2, repeat: Infinity }
          }
          className="mt-10 text-center text-sm font-medium tracking-wide text-[#e8d5b5]/70"
        >
          Tap the box to unbox your live website
        </motion.p>
      </div>
    );
  }

  const spring = { type: "spring" as const, stiffness: 90, damping: 16 };

  return (
    <div className="relative min-h-[100dvh] overflow-x-hidden bg-[#0c0b09] text-[#f5f0e8]">
      <div className="pointer-events-none fixed inset-0" aria-hidden>
        <Atmosphere />
      </div>

      <div className="relative mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-6 sm:px-6 sm:pb-10 sm:pt-8 md:gap-8">
        <motion.header
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={spring}
          className="flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2.5">
            <BrandLogo size="md" />
            <span className="font-serif text-lg tracking-tight">BEXO</span>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#5c6b5a]/40 bg-[#5c6b5a]/15 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#b8c4b4]">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {data.isPremium ? "Pro active" : "Live"}
          </span>
        </motion.header>

        <section className="flex flex-col items-center text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ ...spring, delay: 0.05 }}
            className="mb-5"
          >
            <WelcomeAvatar name={displayName} photoUrl={photoUrl} size="xl" />
          </motion.div>
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...spring, delay: 0.1 }}
            className="mb-2 text-[10px] font-semibold uppercase tracking-[0.3em] text-[#c4a574]"
          >
            Welcome aboard
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...spring, delay: 0.14 }}
            className="font-serif text-3xl font-normal leading-tight tracking-tight text-[#f5f0e8] sm:text-4xl md:text-[2.75rem]"
          >
            {firstName ? `${firstName}, you're live.` : "You're live."}
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...spring, delay: 0.2 }}
            className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-[#e8d5b5]/55 sm:text-base"
          >
            {data.isPremium
              ? "Your portfolio is published with care — share the link, then refine anytime from the dashboard."
              : "Your free portfolio is published. Upgrade anytime for Pro templates and a custom subdomain."}
          </motion.p>
        </section>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-6">
          <motion.div
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...spring, delay: 0.26 }}
            className="flex flex-col gap-4 rounded-2xl border border-[#c4a574]/15 bg-[#161410]/80 p-4 shadow-[0_24px_60px_-28px_rgba(0,0,0,0.75)] backdrop-blur-md sm:p-6"
          >
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#c4a574]/70">
                Your live website
              </p>
              {live ? (
                <div className="mt-2.5 flex flex-col gap-2 sm:flex-row sm:items-stretch">
                  <div className="relative flex min-w-0 flex-1 items-center gap-2 overflow-hidden rounded-xl border border-[#c4a574]/25 bg-[#c4a574]/10 px-3 py-3">
                    <motion.div
                      aria-hidden
                      className="pointer-events-none absolute inset-y-0 w-14 bg-gradient-to-r from-transparent via-[#e8d5b5]/20 to-transparent"
                      initial={{ x: "-120%" }}
                      animate={{ x: "480%" }}
                      transition={{ duration: 1.8, delay: 0.9, repeat: Infinity, repeatDelay: 4 }}
                    />
                    <Globe className="h-4 w-4 shrink-0 text-[#c4a574]" />
                    <span className="truncate font-mono text-xs font-medium text-[#f5f0e8] sm:text-sm">
                      {live.display}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={copyUrl}
                      className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-[#c4a574]/20 bg-white/[0.04] px-3 text-xs font-semibold text-[#e8d5b5]/85 transition hover:bg-white/[0.08] sm:flex-none"
                    >
                      {copied ? <Check className="h-4 w-4 text-[#8fad8a]" /> : <Copy className="h-4 w-4" />}
                      {copied ? "Copied" : "Copy"}
                    </button>
                    <button
                      type="button"
                      onClick={shareUrl}
                      className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-[#c4a574]/20 bg-white/[0.04] px-3 text-xs font-semibold text-[#e8d5b5]/85 transition hover:bg-white/[0.08] sm:flex-none"
                    >
                      <Share2 className="h-4 w-4" />
                      Share
                    </button>
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-sm text-[#e8d5b5]/45">
                  Handle not set yet — finish setup from the dashboard.
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 rounded-xl border border-white/[0.06] bg-black/20 p-3.5">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#e8d5b5]/40">
                  Template
                </p>
                <p className="mt-1 text-sm font-medium text-[#f5f0e8]">
                  {templateMeta?.name || templateId}
                </p>
              </div>
              <div className="border-l border-white/[0.06] pl-3.5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#e8d5b5]/40">
                  Plan
                </p>
                <p className="mt-1 text-sm font-medium text-[#c4a574]">{planLabel}</p>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <motion.a
                href={live?.href || "#"}
                target="_blank"
                rel="noopener noreferrer"
                whileHover={{ scale: 1.012 }}
                whileTap={{ scale: 0.98 }}
                className={cn(
                  "inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-[#d4b896] to-[#a8885a] text-sm font-semibold text-[#1a1714] shadow-lg shadow-black/30 ring-1 ring-inset ring-white/25 transition hover:from-[#e0c6a4] hover:to-[#b89568]",
                  !live && "pointer-events-none opacity-40",
                )}
              >
                Open live site <ExternalLink className="h-4 w-4" />
              </motion.a>
              <motion.button
                type="button"
                onClick={goDashboard}
                whileHover={{ scale: 1.012 }}
                whileTap={{ scale: 0.98 }}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-[#c4a574]/25 bg-white/[0.05] text-sm font-semibold text-[#f5f0e8] transition hover:bg-white/[0.09]"
              >
                <LayoutDashboard className="h-4 w-4" />
                Go to Dashboard
              </motion.button>
            </div>

            <ul className="mt-auto space-y-2.5 border-t border-white/[0.06] pt-4 text-left text-xs text-[#e8d5b5]/50">
              {[
                "Add this link to your resume and LinkedIn",
                isPremiumTemplate(templateId)
                  ? "Pro template is served on your subdomain"
                  : "Upgrade later to unlock Cura, Sierra & Nico",
                "Edit content anytime from your dashboard",
              ].map((line, i) => (
                <motion.li
                  key={line}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ ...spring, delay: 0.48 + i * 0.1 }}
                  className="flex items-start gap-2.5"
                >
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[#c4a574]" />
                  <span>{line}</span>
                </motion.li>
              ))}
            </ul>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 70, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ ...spring, delay: 0.34 }}
            className="relative overflow-hidden rounded-2xl border border-[#c4a574]/15 bg-[#161410]/80 shadow-[0_24px_60px_-28px_rgba(0,0,0,0.75)] backdrop-blur-md"
          >
            <div
              className="pointer-events-none absolute -bottom-10 left-1/2 h-14 w-3/4 -translate-x-1/2 rounded-[100%] bg-[#c4a574]/15 blur-3xl"
              aria-hidden
            />
            <div className="flex items-center gap-2 border-b border-white/[0.06] bg-black/25 px-3 py-2.5">
              <span className="h-2 w-2 rounded-full bg-[#8a6a5a]/80" />
              <span className="h-2 w-2 rounded-full bg-[#c4a574]/70" />
              <span className="h-2 w-2 rounded-full bg-[#5c6b5a]/80" />
              <div className="ml-2 flex min-w-0 flex-1 items-center gap-1.5 rounded-lg border border-white/[0.06] bg-[#0c0b09]/70 px-2.5 py-1">
                <Globe className="h-3 w-3 shrink-0 text-[#c4a574]/70" />
                <span className="truncate font-mono text-[10px] text-[#e8d5b5]/55 sm:text-[11px]">
                  {live?.display || "preview"}
                </span>
              </div>
            </div>
            <div className="relative h-[min(52vh,420px)] bg-[#0c0b09] sm:h-[480px]">
              {previewSrc ? (
                <iframe
                  title="Portfolio preview"
                  src={previewSrc}
                  className="absolute inset-0 h-full w-full border-0 bg-white"
                  sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-[#e8d5b5]/40">
                  Preview unavailable
                </div>
              )}
            </div>
          </motion.div>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...spring, delay: 0.5 }}
        className="fixed inset-x-0 bottom-0 z-40 border-t border-[#c4a574]/15 bg-[#0c0b09]/90 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-md sm:static sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:pb-0 sm:backdrop-blur-none"
      >
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-2 sm:flex-row sm:justify-end sm:px-6 sm:pb-8">
          <button
            type="button"
            onClick={goDashboard}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-[#d4b896] to-[#a8885a] text-sm font-semibold text-[#1a1714] shadow-lg shadow-black/30 ring-1 ring-inset ring-white/25 transition hover:from-[#e0c6a4] hover:to-[#b89568] sm:w-auto sm:min-w-[220px] sm:px-6"
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
