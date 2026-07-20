import React from "react";
import { Link } from "wouter";
import { BEXO_FOOTER_COPYRIGHT, BEXO_OAUTH_APP_NAME } from "@/lib/brand";
import logo from "@/assets/bexo-logo.png";
import type { LegalDoc } from "@/content/legal/types";
import { usePageSeo } from "@/hooks/use-page-seo";

const LEGAL_LINKS = [
  { href: "/terms", label: "Terms", slug: "terms" },
  { href: "/privacy", label: "Privacy", slug: "privacy" },
  { href: "/refund", label: "Refund", slug: "refund" },
  { href: "/cookies", label: "Cookies", slug: "cookies" },
];

function LegalPageSwitcher({ current }: { current: string }) {
  return (
    <nav
      aria-label="Legal documents"
      className="flex flex-wrap gap-2"
    >
      {LEGAL_LINKS.map((l) => {
        const active = l.slug === current;
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={`inline-flex h-9 items-center rounded-full px-4 text-sm font-semibold transition ${
              active
                ? "bg-[#2F6BFF] text-white shadow-sm shadow-blue-500/20"
                : "border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900"
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function MarketingNav({
  solid = false,
  signedIn = false,
  dashboardReady = false,
}: {
  solid?: boolean;
  signedIn?: boolean;
  dashboardReady?: boolean;
}) {
  const links = [
    { href: "/#about", label: "About" },
    { href: "/#how", label: "How it works" },
    { href: "/#features", label: "Features" },
    { href: "/#pricing", label: "Pricing" },
  ];

  return (
    <header
      className={`sticky top-0 z-50 border-b transition-colors ${
        solid
          ? "border-slate-200/80 bg-[#F7F4EF]/95 backdrop-blur-xl"
          : "border-white/10 backdrop-blur-xl"
      }`}
      style={solid ? undefined : { backgroundColor: "rgba(11, 18, 32, 0.92)" }}
    >
      <div className="mx-auto flex h-[4.25rem] max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="group flex items-center gap-2.5">
          <img
            src={logo}
            alt={BEXO_OAUTH_APP_NAME}
            className="h-8 w-8 object-contain transition group-hover:scale-105"
          />
          <span
            className={`font-serif text-xl font-bold tracking-tight ${
              solid ? "text-slate-900" : "text-white"
            }`}
          >
            BEXO
          </span>
          <span
            className={`hidden text-[10px] font-semibold uppercase tracking-[0.12em] sm:inline ${
              solid ? "text-slate-500" : "text-white/45"
            }`}
          >
            From Ace Digital
          </span>
        </Link>

        <nav
          className={`hidden items-center gap-1 rounded-full border p-1 md:flex ${
            solid
              ? "border-slate-200/80 bg-white/70"
              : "border-white/10 bg-white/[0.04]"
          }`}
        >
          {links.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className={`rounded-full px-4 py-2 text-[13px] font-semibold tracking-wide transition ${
                solid
                  ? "text-slate-600 hover:bg-slate-900/5 hover:text-slate-900"
                  : "text-white/65 hover:bg-white/10 hover:text-white"
              }`}
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          {signedIn && dashboardReady && (
            <Link
              href="/dashboard"
              className={`hidden text-sm font-semibold sm:inline ${
                solid ? "text-slate-700 hover:text-slate-900" : "text-white/80 hover:text-white"
              }`}
            >
              Dashboard
            </Link>
          )}
          <Link
            href="/login"
            className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
              solid
                ? "text-slate-700 hover:bg-slate-900/5"
                : "text-white/90 hover:bg-white/10"
            }`}
          >
            Login
          </Link>
          <Link
            href="/login"
            className="inline-flex h-10 items-center rounded-full bg-[#2F6BFF] px-5 text-sm font-bold text-white shadow-lg shadow-blue-500/25 transition hover:bg-[#2558e0] active:scale-[0.98]"
          >
            Get Started
          </Link>
        </div>
      </div>
    </header>
  );
}

export function MarketingFooter({ light = false }: { light?: boolean }) {
  return (
    <footer
      className={`border-t ${
        light
          ? "border-slate-200 bg-[#F7F4EF] text-slate-600"
          : "border-white/10 bg-[#070B14] text-white/60"
      }`}
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-12 sm:px-6 md:flex-row md:items-start md:justify-between">
        <div className="max-w-sm">
          <div className="mb-3 flex items-center gap-2">
            <img src={logo} alt="" className="h-7 w-7 object-contain" />
            <span className={`font-serif text-lg font-bold ${light ? "text-slate-900" : "text-white"}`}>
              BEXO
            </span>
          </div>
          <p className="text-sm leading-relaxed">
            {BEXO_OAUTH_APP_NAME} — professional portfolios for students and professionals.
            Resume to live site in minutes. A product of Ace Digital.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
          <div>
            <p className={`mb-3 text-xs font-bold uppercase tracking-wider ${light ? "text-slate-900" : "text-white"}`}>
              Product
            </p>
            <ul className="space-y-2 text-sm">
              <li><a href="/#how" className="hover:underline">How it works</a></li>
              <li><a href="/#features" className="hover:underline">Features</a></li>
              <li><a href="/#pricing" className="hover:underline">Pricing</a></li>
              <li><Link href="/login" className="hover:underline">Login</Link></li>
            </ul>
          </div>
          <div>
            <p className={`mb-3 text-xs font-bold uppercase tracking-wider ${light ? "text-slate-900" : "text-white"}`}>
              Legal
            </p>
            <ul className="space-y-2 text-sm">
              {LEGAL_LINKS.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="hover:underline">{l.label}</Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className={`mb-3 text-xs font-bold uppercase tracking-wider ${light ? "text-slate-900" : "text-white"}`}>
              Contact
            </p>
            <ul className="space-y-2 text-sm">
              <li><a href="mailto:support@acedigital.cc" className="hover:underline">support@acedigital.cc</a></li>
              <li><a href="mailto:legal@acedigital.cc" className="hover:underline">legal@acedigital.cc</a></li>
            </ul>
          </div>
        </div>
      </div>
      <div className={`border-t px-4 py-4 text-center text-xs ${light ? "border-slate-200" : "border-white/10"}`}>
        {BEXO_FOOTER_COPYRIGHT}
      </div>
    </footer>
  );
}

export function LegalDocument({ doc, slug }: { doc: LegalDoc; slug: string }) {
  const origin =
    typeof window !== "undefined" ? window.location.origin.replace(/\/$/, "") : "https://mybexo.cyou";
  usePageSeo({
    title: `${doc.title} — BEXO`,
    description: doc.lead || `${doc.title} for BEXO (Ace Digital).`,
    canonical: `${origin}/${slug}`,
    ogImage: `${origin}/og-default.jpg`,
  });

  return (
    <div className="min-h-screen bg-[#F7F4EF] text-slate-800">
      <MarketingNav solid />
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
        <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-[#2F6BFF]">
          Legal · {slug}
        </p>
        <h1 className="font-serif text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
          {doc.title}
        </h1>
        {doc.lead && (
          <p className="mt-4 text-lg leading-relaxed text-slate-600">{doc.lead}</p>
        )}
        <div className="mt-6 flex flex-wrap gap-2 text-xs font-medium text-slate-500">
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1">Ace Digital</span>
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1">India</span>
        </div>

        <div className="mt-8">
          <p className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">
            Legal documents
          </p>
          <LegalPageSwitcher current={slug} />
        </div>

        <nav className="mt-10 rounded-2xl border border-slate-200 bg-white/70 p-5">
          <p className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">On this page</p>
          <ol className="columns-1 gap-x-8 space-y-1.5 text-sm sm:columns-2">
            {doc.sections.map((s, i) => (
              <li key={s.title} className="break-inside-avoid">
                <a href={`#s-${i}`} className="text-slate-600 hover:text-[#2F6BFF]">
                  {i + 1}. {s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="mt-12 space-y-12">
          {doc.sections.map((section, i) => (
            <section key={section.title} id={`s-${i}`} className="scroll-mt-24">
              <h2 className="font-serif text-2xl font-bold text-slate-900">
                <span className="mr-2 font-sans text-sm font-bold text-[#2F6BFF]">
                  {String(i + 1).padStart(2, "0")}
                </span>
                {section.title}
              </h2>
              <div className="mt-4 space-y-4 text-[15px] leading-7 text-slate-700">
                {section.blocks.map((block, bi) => {
                  if (block.type === "p") {
                    return <p key={bi}>{block.text}</p>;
                  }
                  if (block.type === "h3") {
                    return (
                      <h3 key={bi} className="pt-2 font-sans text-base font-bold text-slate-900">
                        {block.text}
                      </h3>
                    );
                  }
                  if (block.type === "ul") {
                    return (
                      <ul key={bi} className="list-disc space-y-2 pl-5">
                        {block.items.map((item, ii) => (
                          <li key={ii}>{item}</li>
                        ))}
                      </ul>
                    );
                  }
                  if (block.type === "note") {
                    return (
                      <aside
                        key={bi}
                        className="rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-950"
                      >
                        {block.text}
                      </aside>
                    );
                  }
                  return null;
                })}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-16 border-t border-slate-200 pt-8">
          <p className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">
            More legal documents
          </p>
          <LegalPageSwitcher current={slug} />
        </div>
      </main>
      <MarketingFooter light />
    </div>
  );
}
