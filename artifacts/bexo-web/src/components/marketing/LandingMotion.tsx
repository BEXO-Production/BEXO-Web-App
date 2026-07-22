import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Check, Globe, Sparkles, Upload } from "lucide-react";
import { PLATFORM_DOMAIN } from "@/lib/platform";

/** Soft magnetic cursor for the marketing landing (desktop only). */
export function LandingCursor() {
  const [pos, setPos] = useState({ x: -100, y: -100 });
  const [active, setActive] = useState(false);
  const [label, setLabel] = useState("");

  useEffect(() => {
    const fine = window.matchMedia("(pointer: fine)").matches;
    if (!fine) return;

    const onMove = (e: Event) => {
      const ev = e as MouseEvent;
      setPos({ x: ev.clientX, y: ev.clientY });
      const target = (ev.target as HTMLElement | null)?.closest?.(
        "[data-cursor]",
      ) as HTMLElement | null;
      if (target) {
        setActive(true);
        setLabel(target.dataset.cursor || "");
      } else {
        setActive(false);
        setLabel("");
      }
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  return (
    <div
      className="landing-cursor pointer-events-none fixed z-[10000] hidden mix-blend-difference md:block"
      style={{
        left: pos.x,
        top: pos.y,
        transform: "translate(-50%, -50%)",
      }}
      aria-hidden
    >
      <div
        className={`flex items-center justify-center rounded-full border border-white/40 bg-white/10 text-[9px] font-bold uppercase tracking-[0.18em] text-white backdrop-blur-sm transition-all duration-200 ${
          active ? "h-16 w-16 scale-100 opacity-100" : "h-3 w-3 scale-100 opacity-70"
        }`}
      >
        {active && label ? label : null}
      </div>
    </div>
  );
}

/** Top-edge scroll progress for the landing page. */
export function LandingScrollProgress() {
  const [p, setP] = useState(0);

  useEffect(() => {
    const onScroll = () => {
      const el = document.documentElement;
      const max = el.scrollHeight - el.clientHeight;
      setP(max > 0 ? el.scrollTop / max : 0);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-[2px] bg-transparent">
      <div
        className="h-full origin-left bg-gradient-to-r from-[#2F6BFF] via-sky-400 to-emerald-300 transition-[width] duration-100 ease-out"
        style={{ width: `${Math.min(100, p * 100)}%` }}
      />
    </div>
  );
}

const HANDLES = ["aria", "devansh", "maya", "jordan", "noah"];

/**
 * Hero visual — animated publish journey (no template iframes).
 * Typewriter subdomain + pulsing live badge + floating step chips.
 */
export function HeroPublishStage() {
  const [handleIdx, setHandleIdx] = useState(0);
  const [typed, setTyped] = useState("");
  const [phase, setPhase] = useState<"typing" | "hold" | "erase">("typing");

  const full = HANDLES[handleIdx];

  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    if (phase === "typing") {
      if (typed.length < full.length) {
        t = setTimeout(() => setTyped(full.slice(0, typed.length + 1)), 90);
      } else {
        t = setTimeout(() => setPhase("hold"), 1600);
      }
    } else if (phase === "hold") {
      t = setTimeout(() => setPhase("erase"), 400);
    } else {
      if (typed.length > 0) {
        t = setTimeout(() => setTyped(typed.slice(0, -1)), 45);
      } else {
        setHandleIdx((i) => (i + 1) % HANDLES.length);
        setPhase("typing");
      }
    }
    return () => clearTimeout(t);
  }, [typed, phase, full]);

  return (
    <div className="relative mx-auto mt-12 w-full max-w-3xl px-2 sm:mt-16">
      {/* Soft pulse rings */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 -z-0 h-64 w-64 -translate-x-1/2 -translate-y-1/2 sm:h-80 sm:w-80">
        <span className="landing-ring landing-ring-1 absolute inset-0 rounded-full border border-[#2F6BFF]/25" />
        <span className="landing-ring landing-ring-2 absolute inset-6 rounded-full border border-sky-400/20" />
        <span className="landing-ring landing-ring-3 absolute inset-12 rounded-full border border-white/10" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10"
      >
        {/* Browser / URL chrome */}
        <div className="overflow-hidden rounded-2xl border border-white/12 bg-[#0d1424]/90 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.65)] backdrop-blur-md">
          <div className="flex items-center gap-2 border-b border-white/8 px-4 py-3">
            <span className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
            <div className="ml-3 flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5">
              <Globe className="h-3.5 w-3.5 shrink-0 text-[#7BA0FF]" />
              <p className="truncate font-mono text-[12px] text-white/80 sm:text-[13px]">
                <span className="text-[#9BB6FF]">{typed}</span>
                <span className="landing-caret inline-block w-[1px] bg-[#2F6BFF] align-middle" />
                <span className="text-white/45">.{PLATFORM_DOMAIN}</span>
              </p>
            </div>
            <span className="hidden shrink-0 items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-300 sm:inline-flex">
              <span className="landing-live-dot h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Live
            </span>
          </div>

          <div className="relative grid gap-4 px-5 py-8 sm:grid-cols-[1.1fr_0.9fr] sm:px-7 sm:py-10">
            <div className="text-left">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#7BA0FF]">
                Publish in three beats
              </p>
              <h3 className="mt-3 font-serif text-2xl font-bold leading-tight text-white sm:text-3xl">
                Resume in.
                <br />
                Portfolio out.
              </h3>
              <p className="mt-3 max-w-sm text-sm leading-relaxed text-white/50">
                WhatsApp OTP, AI parse, pick a look, go live on your subdomain — recruiters get a Hire Me page ready to share.
              </p>
              <a
                href="#showcase"
                data-cursor="View"
                className="mt-5 inline-flex text-sm font-semibold text-[#9BB6FF] transition hover:text-white"
              >
                See live showcase →
              </a>
            </div>

            <div className="flex flex-col justify-center gap-2.5">
              {[
                { icon: Upload, label: "Upload resume", delay: 0 },
                { icon: Sparkles, label: "Polish with AI", delay: 0.12 },
                { icon: Check, label: "Publish subdomain", delay: 0.24 },
              ].map((step) => (
                <motion.div
                  key={step.label}
                  initial={{ opacity: 0, x: 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.45 + step.delay, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                  className="landing-float-chip flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-3"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#2F6BFF]/15 text-[#9BB6FF]">
                    <step.icon className="h-4 w-4" />
                  </span>
                  <span className="text-sm font-semibold text-white/85">{step.label}</span>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
