import React, { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { motion, useInView, type Variants } from "framer-motion";
import {
  ArrowRight,
  Check,
  FileText,
  Globe,
  Sparkles,
  Upload,
  Zap,
  Shield,
  HardDrive,
  Briefcase,
} from "lucide-react";
import { MarketingNav, MarketingFooter } from "@/components/marketing/MarketingChrome";
import { TemplateShowcaseCard } from "@/components/marketing/TemplateShowcaseCard";
import { TemplatePreviewModal } from "@/components/marketing/TemplatePreviewModal";
import { LandingCursor, LandingScrollProgress, HeroPublishStage } from "@/components/marketing/LandingMotion";
import { PORTFOLIO_TEMPLATES, type PortfolioTemplate } from "@/lib/templates";
import { usePricing } from "@/hooks/use-pricing";
import {
  BEXO_APP_PURPOSE,
  BEXO_APP_TAGLINE,
  BEXO_FOOTER_COPYRIGHT,
  BEXO_OAUTH_APP_NAME,
} from "@/lib/brand";
import { buildMarketingJsonLd } from "@/lib/seo";
import { usePageSeo } from "@/hooks/use-page-seo";
import logo from "@/assets/bexo-logo.png";

const fadeUp: Variants = {
  hidden: { opacity: 0 },
  visible: (i = 0) => ({
    opacity: 1,
    // Avoid translateY near iframes — Safari blanks iframe paint under transformed ancestors
    transition: { duration: 0.55, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] },
  }),
};

const fadeLift: Variants = {
  hidden: { opacity: 0, y: 28 },
  visible: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, delay: i * 0.07, ease: [0.22, 1, 0.36, 1] },
  }),
};

function Reveal({
  children,
  className = "",
  delay = 0,
  lift = false,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  /** Safe for text/cards without iframes */
  lift?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-12% 0px" });
  return (
    <motion.div
      ref={ref}
      className={className}
      initial="hidden"
      animate={inView ? "visible" : "hidden"}
      custom={delay}
      variants={lift ? fadeLift : fadeUp}
    >
      {children}
    </motion.div>
  );
}

function Marquee() {
  const items = [
    "AI resume parse",
    "Live subdomain",
    "Agency-grade design",
    "Placement-ready",
    "WhatsApp OTP",
    "Hire Me page",
    "Cloud storage",
    "One-click publish",
  ];
  const row = [...items, ...items];
  return (
    <div className="overflow-hidden border-y border-white/10 landing-surface-dark py-3.5">
      <div className="landing-marquee flex w-max gap-10 whitespace-nowrap">
        {row.map((item, i) => (
          <span key={`${item}-${i}`} className="flex items-center gap-3 text-[13px] font-medium tracking-wide text-white/45">
            <span className="h-1.5 w-1.5 rounded-full bg-[#2F6BFF]" />
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

const FEATURES = [
  {
    icon: Upload,
    title: "Resume in. Portfolio out.",
    body: "Upload your CV once. BEXO structures education, projects, experience, and contact into a reviewable profile.",
  },
  {
    icon: Sparkles,
    title: "AI that respects your story",
    body: "Smart parsing fills the blanks — you approve every section before anything goes live.",
  },
  {
    icon: Globe,
    title: "you.mybexo.cyou",
    body: "A personal subdomain that looks like you — not a generic link-in-bio page.",
  },
  {
    icon: FileText,
    title: "Templates that feel designed",
    body: "Cura Futuri, Sierra Montana, and Nico Palmer — motion-led layouts built for placements and clients.",
  },
  {
    icon: HardDrive,
    title: "Storage that scales with you",
    body: "10MB free · 100MB Yearly · 50MB Lifetime — stack Yearly on Lifetime for +100MB anytime.",
  },
  {
    icon: Briefcase,
    title: "Hire Me, built in",
    body: "A dedicated hire page for recruiters — shareable, template-neutral, ready when you are.",
  },
];

function buildPlans(prices: { annual: number; lifetime: number }) {
  return [
    {
      id: "free",
      name: "Free",
      price: "₹0",
      period: "forever",
      blurb: "Publish a path-based portfolio and prove the flow.",
      features: ["Path-based portfolio", "10MB storage", "Hire Me page", "Upgrade to Pro anytime"],
      cta: "Start free",
      promoted: false,
    },
    {
      id: "annual",
      name: "Yearly",
      price: `₹${prices.annual.toLocaleString("en-IN")}`,
      period: "/year",
      note: "+ 18% GST",
      blurb: "Best for students & professionals — full Pro templates and 100MB cloud storage.",
      features: [
        "Premium templates",
        "100MB cloud storage base",
        "yourname.mybexo.cyou",
        "AI resume parses",
        "Renew extends access 1 year",
      ],
      cta: "Get Yearly",
      promoted: true,
    },
    {
      id: "lifetime",
      name: "Lifetime",
      price: `₹${prices.lifetime.toLocaleString("en-IN")}`,
      period: "once",
      note: "+ 18% GST",
      blurb: "Best for students & professionals — pay once, keep Pro access forever.",
      features: [
        "Everything in Yearly (templates & subdomain)",
        "50MB storage base",
        "No renewals for Pro access",
        "Forever hosting",
      ],
      cta: "Go Lifetime",
      promoted: false,
    },
  ];
}

export default function LandingPage({
  signedIn = false,
  dashboardReady = false,
  continueHref,
}: {
  signedIn?: boolean;
  dashboardReady?: boolean;
  continueHref?: string;
}) {
  const { prices } = usePricing();
  const PLANS = React.useMemo(() => buildPlans(prices), [prices.annual, prices.lifetime]);
  const [previewTemplate, setPreviewTemplate] = useState<PortfolioTemplate | null>(null);

  usePageSeo({
    title: `${BEXO_OAUTH_APP_NAME} — Professional portfolios for students`,
    description:
      "BEXO From Ace Digital helps students and professionals publish placement-ready portfolios on mybexo.cyou. This home page is public — sign-in is only required to edit your portfolio.",
    canonical: "https://mybexo.cyou/",
    ogImage: "https://mybexo.cyou/og-default.jpg",
    jsonLd: buildMarketingJsonLd(),
  });

  return (
    <div className="landing-root landing-cursor-root">
      <LandingScrollProgress />
      <LandingCursor />
      <MarketingNav signedIn={signedIn} dashboardReady={dashboardReady} />

      {signedIn && (
        <div className="landing-surface-dark border-b border-white/10 px-4 py-2.5 text-center text-xs text-white/80">
          You&apos;re signed in to <strong className="text-white">BEXO</strong>.
          {dashboardReady ? (
            <>
              {" "}
              <a href="/dashboard" className="font-bold text-[#7BA0FF] hover:underline">
                Open dashboard
              </a>
            </>
          ) : continueHref ? (
            <>
              {" "}
              <a href={continueHref} className="font-bold text-[#7BA0FF] hover:underline">
                Continue onboarding
              </a>
            </>
          ) : null}
        </div>
      )}

      {/* HERO */}
      <section className="landing-surface-dark relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0">
          <div className="landing-orb landing-orb-a absolute -left-24 top-0 h-96 w-96 rounded-full bg-[#2F6BFF]/25 blur-[120px]" />
          <div className="landing-orb landing-orb-b absolute -right-20 top-40 h-80 w-80 rounded-full bg-sky-400/15 blur-[100px]" />
          <div
            className="absolute inset-0 opacity-[0.12]"
            style={{
              backgroundImage:
                "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.35) 1px, transparent 0)",
              backgroundSize: "28px 28px",
            }}
          />
        </div>

        <div className="relative mx-auto max-w-6xl px-4 pb-10 pt-14 text-center sm:px-6 sm:pb-12 sm:pt-20">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-7 inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.06] px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/75"
          >
            <img src={logo} alt="" className="h-3.5 w-3.5" />
            Public homepage · No login required to explore
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.05 }}
            className="font-serif text-4xl font-bold leading-[1.05] tracking-tight text-white sm:text-6xl md:text-[4.25rem]"
          >
            {BEXO_OAUTH_APP_NAME}
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.12 }}
            className="landing-muted-strong mx-auto mt-6 max-w-2xl font-serif text-[1.65rem] font-medium leading-snug sm:text-3xl"
          >
            Your career portfolio, live in minutes.
          </motion.p>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="landing-muted mx-auto mt-4 max-w-2xl text-[15px] leading-relaxed sm:text-base"
          >
            {BEXO_APP_TAGLINE} Explore this page freely — you only need to sign in when you create or edit your own portfolio.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.28 }}
            className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row"
          >
            <Link
              href="/login"
              data-cursor="Start"
              className="group inline-flex h-12 items-center gap-2 rounded-full bg-[#2F6BFF] px-8 text-sm font-bold text-white shadow-[0_12px_40px_-8px_rgba(47,107,255,0.55)] transition hover:bg-[#2558e0] active:scale-[0.98]"
            >
              Get Started
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
            </Link>
            <a
              href="#showcase"
              data-cursor="View"
              className="inline-flex h-12 items-center rounded-full border border-white/18 bg-white/[0.03] px-7 text-sm font-semibold text-white/90 transition hover:bg-white/[0.08]"
            >
              See showcase
            </a>
          </motion.div>

          <HeroPublishStage />
        </div>
      </section>

      <Marquee />

      {/* ABOUT — public app purpose (Google OAuth / trust) */}
      <section
        id="about"
        className="landing-surface-darker border-b border-white/10 py-16 sm:py-20"
        aria-labelledby="about-bexo-heading"
      >
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#7BA0FF]">About the app</p>
          <h2
            id="about-bexo-heading"
            className="mt-3 font-serif text-3xl font-bold text-white sm:text-4xl"
          >
            What {BEXO_OAUTH_APP_NAME} does
          </h2>
          <p className="landing-muted mx-auto mt-5 text-[15px] leading-relaxed sm:text-base">
            {BEXO_APP_TAGLINE}
          </p>
          <p className="landing-muted mx-auto mt-4 text-[15px] leading-relaxed sm:text-base">
            {BEXO_APP_PURPOSE} Public pages:{" "}
            <a href="https://mybexo.cyou/" className="text-[#7BA0FF] hover:underline">
              home
            </a>
            ,{" "}
            <a href="https://mybexo.cyou/#pricing" className="text-[#7BA0FF] hover:underline">
              pricing
            </a>
            ,{" "}
            <a href="https://mybexo.cyou/privacy" className="text-[#7BA0FF] hover:underline">
              privacy
            </a>
            , and{" "}
            <a href="https://mybexo.cyou/terms" className="text-[#7BA0FF] hover:underline">
              terms
            </a>
            .
          </p>
          <p className="mt-4 text-xs text-white/40">{BEXO_FOOTER_COPYRIGHT}</p>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how" className="landing-surface-dark mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <Reveal lift>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#7BA0FF]">How it works</p>
          <h2 className="mt-3 max-w-xl font-serif text-3xl font-bold text-white sm:text-5xl">
            Three beats from resume to live site.
          </h2>
        </Reveal>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {[
            { n: "01", icon: Upload, t: "Sign in & upload", d: "WhatsApp OTP, link Google if you want, drop your resume." },
            { n: "02", icon: Zap, t: "Review & design", d: "Edit every section. Preview Pro layouts on the BEXO demo — unlock to publish yours." },
            { n: "03", icon: Globe, t: "Publish & share", d: "Go live on your subdomain. Send Hire Me to recruiters." },
          ].map((step, i) => (
            <Reveal key={step.n} delay={i} lift>
              <div
                data-cursor="Explore"
                className="group relative h-full overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] p-7 transition hover:border-[#2F6BFF]/40 hover:bg-white/[0.05]"
              >
                <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-[#2F6BFF]/10 blur-2xl transition group-hover:bg-[#2F6BFF]/25" />
                <p className="font-mono text-xs text-white/30">{step.n}</p>
                <step.icon className="mt-5 h-7 w-7 text-[#7BA0FF] transition group-hover:scale-110" />
                <h3 className="mt-4 font-serif text-2xl font-bold text-white">{step.t}</h3>
                <p className="landing-muted mt-2 text-sm leading-relaxed">{step.d}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="landing-surface-darker border-y border-white/10 py-20 sm:py-28">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <Reveal>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#7BA0FF]">Features</p>
            <h2 className="mt-3 max-w-2xl font-serif text-3xl font-bold text-white sm:text-5xl">
              Everything you need to look hire-ready.
            </h2>
          </Reveal>
          <div className="mt-14 grid gap-px overflow-hidden rounded-3xl border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => (
              <Reveal key={f.title} delay={i % 3} className="landing-surface-darker p-7 sm:p-8">
                <f.icon className="h-6 w-6 text-[#2F6BFF]" />
                <h3 className="mt-4 font-serif text-xl font-bold text-white">{f.title}</h3>
                <p className="landing-muted mt-2 text-sm leading-relaxed">{f.body}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* SHOWCASE — live /api/render iframes */}
      <section id="showcase" className="landing-surface-dark mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <Reveal>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#7BA0FF]">Showcase</p>
          <h2 className="mt-3 font-serif text-3xl font-bold text-white sm:text-5xl">Three looks. One publish flow.</h2>
          <p className="landing-muted mt-3 max-w-xl">
            Explore live demos — hover for the cursor, then open a full interactive preview.
          </p>
        </Reveal>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {PORTFOLIO_TEMPLATES.filter((t) => t.isPro).map((tpl, i) => (
            <Reveal key={tpl.id} delay={i}>
              <TemplateShowcaseCard
                template={tpl}
                previewClassName="h-56 sm:h-64"
                onPreview={setPreviewTemplate}
              />
            </Reveal>
          ))}
        </div>
        <Reveal className="mt-5">
          <article className="overflow-hidden rounded-2xl border border-dashed border-white/15 bg-gradient-to-br from-white/[0.04] to-transparent p-6 sm:flex sm:items-center sm:gap-8 sm:p-8">
            <div className="flex-1">
              <span className="w-fit rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-300">
                Free · Path URL
              </span>
              <h3 className="mt-3 font-serif text-2xl font-bold text-white">Start free, upgrade when ready</h3>
              <p className="landing-muted mt-2 text-sm leading-relaxed">
                Preview Cura Futuri, Sierra Montana, and Nico Palmer on the demo portfolio. Publish them on your subdomain with Yearly or Lifetime.
              </p>
            </div>
            <div className="mt-5 flex shrink-0 flex-col gap-2 sm:mt-0 sm:items-end">
              <Link
                href="/login"
                className="inline-flex w-fit items-center gap-2 rounded-full bg-[#2F6BFF] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#2558e0] active:scale-[0.98]"
              >
                Try it free <ArrowRight className="h-4 w-4" />
              </Link>
              <a href="#pricing" className="text-center text-xs font-semibold text-white/50 transition hover:text-white">
                See pricing →
              </a>
            </div>
          </article>
        </Reveal>
      </section>

      {/* PRICING */}
      <section id="pricing" className="landing-surface-paper border-t border-slate-200 py-20 sm:py-28">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <Reveal lift>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#2F6BFF]">Pricing</p>
            <h2 className="mt-3 font-serif text-3xl font-bold text-slate-900 sm:text-5xl">Simple plans. Serious presence.</h2>
            <p className="mt-3 max-w-xl text-slate-600">
              Yearly is recommended for most students — ₹{prices.annual.toLocaleString("en-IN")}/year with 100MB.
              Lifetime is ₹{prices.lifetime.toLocaleString("en-IN")} once with 50MB base; stack Yearly anytime for +100MB.
            </p>
          </Reveal>

          <Reveal lift className="mt-8 grid gap-3 sm:grid-cols-3">
            {[
              { k: "Free", v: "10MB", d: "Path URL forever" },
              { k: "Yearly", v: "100MB", d: `₹${prices.annual.toLocaleString("en-IN")}/yr` },
              { k: "Lifetime", v: "50MB+", d: `₹${prices.lifetime.toLocaleString("en-IN")} · stackable` },
            ].map((item) => (
              <div
                key={item.k}
                className="rounded-2xl border border-slate-200 bg-white/80 px-5 py-4 shadow-sm"
              >
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{item.k}</p>
                <p className="mt-1 font-serif text-2xl font-bold text-slate-900">{item.v}</p>
                <p className="text-xs text-slate-500">{item.d}</p>
              </div>
            ))}
          </Reveal>

          <div className="mt-12 grid gap-5 lg:grid-cols-3">
            {PLANS.map((plan, i) => (
              <Reveal key={plan.id} delay={i} lift>
                <div
                  data-cursor={plan.cta}
                  className={`relative flex h-full flex-col rounded-3xl border p-7 transition hover:-translate-y-1 hover:shadow-xl ${
                    plan.promoted
                      ? "border-[#2F6BFF] bg-white shadow-2xl shadow-blue-500/15 ring-1 ring-[#2F6BFF]/30"
                      : "border-slate-200 bg-white/70"
                  }`}
                >
                  {plan.promoted && (
                    <span className="absolute -top-3 left-7 rounded-full bg-[#2F6BFF] px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider text-white">
                      Recommended
                    </span>
                  )}
                  <h3 className="font-serif text-2xl font-bold text-slate-900">{plan.name}</h3>
                  <p className="mt-1 text-sm text-slate-500">{plan.blurb}</p>
                  <div className="mt-6 flex items-end gap-1">
                    <span className="font-serif text-4xl font-bold tracking-tight text-slate-900">{plan.price}</span>
                    <span className="mb-1 text-sm text-slate-500">{plan.period}</span>
                  </div>
                  {plan.note && <p className="mt-1 text-xs text-slate-400">{plan.note}</p>}
                  <ul className="mt-6 flex-1 space-y-3">
                    {plan.features.map((feat) => (
                      <li key={feat} className="flex items-start gap-2 text-sm text-slate-700">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#2F6BFF]" />
                        {feat}
                      </li>
                    ))}
                  </ul>
                  <Link
                    href="/login"
                    className={`mt-8 inline-flex h-12 items-center justify-center rounded-full text-sm font-bold transition ${
                      plan.promoted
                        ? "bg-[#2F6BFF] text-white hover:bg-[#2558e0]"
                        : "bg-slate-900 text-white hover:bg-slate-800"
                    }`}
                  >
                    {plan.cta}
                  </Link>
                </div>
              </Reveal>
            ))}
          </div>

          <Reveal lift className="mt-10 flex items-start gap-3 rounded-2xl border border-slate-200 bg-white/80 p-5 text-sm text-slate-600">
            <Shield className="mt-0.5 h-5 w-5 shrink-0 text-[#2F6BFF]" />
            <p>
              Payments via Razorpay. Prices shown exclude 18% GST. Already on Yearly? Renew extends your date (storage stays 100MB).
              On Lifetime? Buying Yearly adds +100MB on top of your 50MB base. See our{" "}
              <Link href="/refund" className="font-semibold text-[#2F6BFF] underline-offset-2 hover:underline">
                Refund Policy
              </Link>
              .
            </p>
          </Reveal>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="landing-surface-dark relative overflow-hidden py-24">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(47,107,255,0.25),_transparent_60%)]" />
        <div className="relative mx-auto max-w-3xl px-4 text-center sm:px-6">
          <Reveal>
            <h2 className="font-serif text-4xl font-bold text-white sm:text-5xl">Ready when your next opportunity is.</h2>
            <p className="landing-muted mx-auto mt-4 max-w-lg">
              Login with your phone, finish onboarding, and ship a portfolio you are proud to send.
            </p>
            <Link
              href="/login"
              className="mt-8 inline-flex h-12 items-center gap-2 rounded-full bg-white px-8 text-sm font-bold text-slate-900 transition hover:bg-slate-100"
            >
              Login to start
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Reveal>
        </div>
      </section>

      <MarketingFooter />

      {previewTemplate && (
        <TemplatePreviewModal
          template={previewTemplate}
          onClose={() => setPreviewTemplate(null)}
        />
      )}
    </div>
  );
}
