import React from "react";
import { PLATFORM_DOMAIN, portfolioHostname } from "@/lib/platform";

type UnclaimedHandleBannerProps = {
  handle: string;
};

/**
 * Path-based / SPA fallback when a handle has no portfolio.
 * Matches the Cloud Run unclaimed-subdomain claim page.
 */
export function UnclaimedHandleBanner({ handle }: UnclaimedHandleBannerProps) {
  const safe = String(handle || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 48) || "yourname";

  const host = portfolioHostname(safe);
  const loginUrl = `/login?claim=${encodeURIComponent(safe)}`;
  const crystalUrl = "/claim-crystal-b.jpg";

  return (
    <div className="claim-stage">
      <style>{CLAIM_CSS}</style>
      <div className="claim-aurora" aria-hidden />
      <div className="claim-grain" aria-hidden />
      <div className="claim-orbit claim-orbit-slow" aria-hidden />
      <div className="claim-orbit" aria-hidden />

      <section className="claim-card" role="region" aria-label="Unclaimed portfolio handle">
        <div className="claim-top">
          <a className="claim-brand" href="/">
            <span className="claim-brand-mark" aria-hidden>
              B
            </span>
            BEXO
          </a>
          <span className="claim-pill">
            <span className="claim-pill-dot" aria-hidden /> Name available
          </span>
        </div>

        <div className="claim-hero">
          <div>
            <p className="claim-kicker">Unclaimed subdomain</p>
            <h1 className="claim-title">
              This name is waiting.
              <br />
              <em>Make it yours.</em>
            </h1>
            <p className="claim-lede">
              Nobody has claimed <strong>{safe}</strong> yet. Log in to BEXO and
              publish your placement-ready portfolio here.
            </p>
            <div className="claim-handle" title={host}>
              <strong>{safe}</strong>
              <span>.{PLATFORM_DOMAIN}</span>
            </div>
            <div className="claim-cta-row">
              <a className="claim-btn claim-btn-primary" href={loginUrl}>
                Log in to claim this name
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path
                    d="M5 12h14M13 5l7 7-7 7"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </a>
              <a className="claim-btn claim-btn-ghost" href="/">
                Explore BEXO
              </a>
            </div>
            <div className="claim-meta">
              <span>
                <i /> Live in minutes
              </span>
              <span>
                <i /> Premium templates
              </span>
              <span>
                <i /> Hire Me page
              </span>
            </div>
          </div>

          <div className="claim-visual" aria-hidden>
            <div className="claim-ring claim-ring-2" />
            <div className="claim-ring" />
            <div className="claim-facet claim-f1" />
            <div className="claim-facet claim-f2" />
            <div className="claim-facet claim-f3" />
            <div className="claim-crystal">
              <img src={crystalUrl} alt="" width={220} height={220} />
            </div>
          </div>
        </div>

        <div className="claim-foot">
          <span>A product of Ace Digital</span>
          <a href={loginUrl}>Already have an account? Sign in →</a>
        </div>
      </section>
    </div>
  );
}

const CLAIM_CSS = `
.claim-stage {
  --ink: #0b1220;
  --cream: #f4f1eb;
  --blue: #2f6bff;
  --blue-deep: #1a3fb8;
  --ease: cubic-bezier(0.22, 1, 0.36, 1);
  position: relative;
  min-height: 100dvh;
  display: grid;
  place-items: center;
  padding: clamp(1.25rem, 4vw, 3rem);
  isolation: isolate;
  font-family: Syne, system-ui, sans-serif;
  color: var(--ink);
  background: var(--cream);
  overflow: hidden;
  -webkit-font-smoothing: antialiased;
}
.claim-aurora {
  position: absolute; inset: -20%; z-index: -3;
  background:
    radial-gradient(ellipse 50% 40% at 15% 20%, rgba(47,107,255,0.28), transparent 55%),
    radial-gradient(ellipse 45% 35% at 85% 15%, rgba(15,23,42,0.18), transparent 50%),
    radial-gradient(ellipse 60% 45% at 50% 100%, rgba(47,107,255,0.16), transparent 55%),
    linear-gradient(165deg, #eef2ff 0%, var(--cream) 42%, #e8e4dc 100%);
  animation: claimAurora 14s ease-in-out infinite alternate;
}
.claim-grain {
  position: absolute; inset: 0; z-index: -1; opacity: 0.35; pointer-events: none;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.55'/%3E%3C/svg%3E");
  mix-blend-mode: soft-light;
}
.claim-orbit {
  position: absolute; width: min(78vw, 560px); aspect-ratio: 1; border-radius: 50%;
  border: 1px solid rgba(11,18,32,0.08); z-index: -2; animation: claimSpin 48s linear infinite;
}
.claim-orbit::before, .claim-orbit::after {
  content: ""; position: absolute; border-radius: 50%;
  background: linear-gradient(135deg, #2f6bff, #7eb6ff);
  box-shadow: 0 8px 30px rgba(47,107,255,0.35);
}
.claim-orbit::before { width: 14px; height: 14px; top: 8%; left: 48%; }
.claim-orbit::after {
  width: 9px; height: 9px; bottom: 18%; right: 12%;
  background: linear-gradient(135deg, #0b1220, #445);
}
.claim-orbit-slow { width: min(92vw, 720px); animation-duration: 72s; animation-direction: reverse; opacity: 0.7; }
.claim-card {
  width: min(100%, 720px); position: relative; border-radius: 2rem;
  padding: clamp(1.75rem, 4vw, 3rem);
  background: linear-gradient(160deg, rgba(255,255,255,0.82), rgba(255,255,255,0.55));
  border: 1px solid rgba(255,255,255,0.7);
  box-shadow: 0 1px 0 rgba(255,255,255,0.9) inset, 0 40px 80px -30px rgba(11,18,32,0.35), 0 12px 30px -12px rgba(47,107,255,0.25);
  backdrop-filter: blur(22px) saturate(1.2);
  -webkit-backdrop-filter: blur(22px) saturate(1.2);
  overflow: hidden; animation: claimRise 900ms var(--ease) both;
}
.claim-card::before {
  content: ""; position: absolute; inset: auto -20% -40% 20%; height: 55%;
  background: radial-gradient(circle, rgba(47,107,255,0.22), transparent 65%);
  filter: blur(20px); pointer-events: none;
}
.claim-top {
  display: flex; align-items: center; justify-content: space-between; gap: 1rem;
  margin-bottom: clamp(1.5rem, 3vw, 2.25rem); animation: claimFadeUp 800ms var(--ease) 80ms both;
}
.claim-brand {
  display: inline-flex; align-items: center; gap: 0.65rem; text-decoration: none;
  color: var(--ink); font-weight: 800; letter-spacing: -0.03em; font-size: 0.95rem;
}
.claim-brand-mark {
  width: 2rem; height: 2rem; border-radius: 0.65rem;
  background: linear-gradient(145deg, #2f6bff, #1639a8); color: white;
  display: grid; place-items: center; font-weight: 800;
  box-shadow: 0 8px 18px rgba(47,107,255,0.35);
}
.claim-pill {
  display: inline-flex; align-items: center; gap: 0.45rem;
  padding: 0.4rem 0.85rem; border-radius: 999px;
  background: rgba(16,185,129,0.12); color: #047857;
  font-size: 0.68rem; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase;
  border: 1px solid rgba(16,185,129,0.22);
}
.claim-pill-dot {
  width: 0.45rem; height: 0.45rem; border-radius: 50%; background: #10b981;
  box-shadow: 0 0 0 0 rgba(16,185,129,0.55); animation: claimPulse 1.8s ease-out infinite;
}
.claim-hero {
  display: grid; grid-template-columns: 1.15fr 0.85fr; gap: clamp(1.25rem, 3vw, 2rem); align-items: center;
}
.claim-kicker {
  font-size: 0.72rem; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase;
  color: rgba(11,18,32,0.5); margin-bottom: 0.85rem; animation: claimFadeUp 800ms var(--ease) 140ms both;
}
.claim-title {
  font-family: "Instrument Serif", Georgia, serif; font-weight: 400;
  font-size: clamp(2.4rem, 6vw, 3.6rem); line-height: 0.95; letter-spacing: -0.03em;
  margin-bottom: 1rem; animation: claimFadeUp 900ms var(--ease) 180ms both;
}
.claim-title em {
  font-style: italic;
  background: linear-gradient(120deg, #2f6bff, #6ea0ff);
  -webkit-background-clip: text; background-clip: text; color: transparent;
}
.claim-lede {
  color: rgba(11,18,32,0.68); font-size: clamp(0.95rem, 2vw, 1.05rem); line-height: 1.55;
  max-width: 34ch; margin-bottom: 1.5rem; animation: claimFadeUp 900ms var(--ease) 240ms both;
}
.claim-handle {
  display: inline-flex; align-items: center; gap: 0.55rem; padding: 0.7rem 1rem;
  border-radius: 1rem; background: rgba(11,18,32,0.04); border: 1px solid rgba(11,18,32,0.08);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: clamp(0.78rem, 2vw, 0.9rem); color: var(--ink); margin-bottom: 1.6rem;
  animation: claimFadeUp 900ms var(--ease) 280ms both; max-width: 100%;
}
.claim-handle strong { color: var(--blue); font-weight: 700; }
.claim-handle span { opacity: 0.55; overflow: hidden; text-overflow: ellipsis; }
.claim-cta-row {
  display: flex; flex-wrap: wrap; gap: 0.75rem; animation: claimFadeUp 900ms var(--ease) 340ms both;
}
.claim-btn {
  appearance: none; border: 0; cursor: pointer; text-decoration: none;
  display: inline-flex; align-items: center; justify-content: center; gap: 0.55rem;
  border-radius: 999px; padding: 0.95rem 1.35rem; font-weight: 800; font-size: 0.92rem;
  letter-spacing: -0.01em;
  transition: transform 180ms var(--ease), box-shadow 180ms var(--ease), background 180ms ease;
}
.claim-btn:active { transform: scale(0.97); }
.claim-btn-primary {
  color: white; background: linear-gradient(135deg, var(--blue), var(--blue-deep));
  box-shadow: 0 14px 30px -10px rgba(47,107,255,0.65), 0 0 0 1px rgba(255,255,255,0.18) inset;
  position: relative; overflow: hidden;
}
.claim-btn-primary::after {
  content: ""; position: absolute; inset: 0;
  background: linear-gradient(105deg, transparent 35%, rgba(255,255,255,0.35) 50%, transparent 65%);
  transform: translateX(-120%); animation: claimShimmer 3.2s ease-in-out infinite;
}
.claim-btn-primary:hover { transform: translateY(-2px); box-shadow: 0 18px 36px -10px rgba(47,107,255,0.75); }
.claim-btn-ghost {
  color: var(--ink); background: rgba(255,255,255,0.55); border: 1px solid rgba(11,18,32,0.1);
}
.claim-btn-ghost:hover { background: white; }
.claim-meta {
  display: flex; flex-wrap: wrap; gap: 0.75rem 1.25rem; margin-top: 1.5rem;
  color: rgba(11,18,32,0.48); font-size: 0.75rem; font-weight: 600;
  animation: claimFadeUp 900ms var(--ease) 400ms both;
}
.claim-meta span { display: inline-flex; align-items: center; gap: 0.4rem; }
.claim-meta i {
  width: 0.35rem; height: 0.35rem; border-radius: 50%; background: var(--blue); display: inline-block;
}
.claim-visual {
  position: relative; height: min(42vw, 280px); min-height: 220px; perspective: 900px;
  animation: claimFadeUp 1000ms var(--ease) 220ms both;
}
.claim-crystal {
  position: absolute; inset: 10% 12%; display: grid; place-items: center;
  transform-style: preserve-3d; animation: claimFloat 5.5s ease-in-out infinite;
}
.claim-crystal img {
  width: min(100%, 220px); height: auto; border-radius: 1.25rem;
  filter: drop-shadow(0 28px 40px rgba(47,107,255,0.35));
}
.claim-facet {
  position: absolute; border-radius: 1rem;
  background: linear-gradient(145deg, rgba(255,255,255,0.75), rgba(47,107,255,0.18));
  border: 1px solid rgba(255,255,255,0.65); box-shadow: 0 18px 40px rgba(11,18,32,0.12);
  backdrop-filter: blur(8px); animation: claimBob 4.2s ease-in-out infinite;
}
.claim-f1 { width: 72px; height: 72px; top: 8%; left: 4%; --r: -12deg; }
.claim-f2 {
  width: 48px; height: 48px; right: 6%; top: 22%; --r: 18deg;
  background: linear-gradient(145deg, rgba(11,18,32,0.85), #2f6bff); animation-duration: 5s; animation-delay: 0.4s;
}
.claim-f3 { width: 36px; height: 36px; left: 18%; bottom: 10%; --r: 8deg; animation-duration: 3.8s; animation-delay: 0.2s; }
.claim-ring {
  position: absolute; inset: 18%; border-radius: 50%;
  border: 1px dashed rgba(47,107,255,0.28); animation: claimSpin 28s linear infinite;
}
.claim-ring-2 {
  inset: 6%; border-style: solid; border-color: rgba(11,18,32,0.06);
  animation-duration: 40s; animation-direction: reverse;
}
.claim-foot {
  margin-top: clamp(1.5rem, 3vw, 2rem); padding-top: 1.15rem;
  border-top: 1px solid rgba(11,18,32,0.06);
  display: flex; flex-wrap: wrap; justify-content: space-between; gap: 0.75rem;
  color: rgba(11,18,32,0.45); font-size: 0.72rem; font-weight: 600;
  animation: claimFadeUp 900ms var(--ease) 460ms both;
}
.claim-foot a { color: var(--blue); text-decoration: none; }
.claim-foot a:hover { text-decoration: underline; }
@media (max-width: 720px) {
  .claim-hero { grid-template-columns: 1fr; text-align: center; }
  .claim-cta-row, .claim-meta, .claim-top { justify-content: center; }
  .claim-lede { margin-inline: auto; }
  .claim-top { flex-direction: column; }
}
@keyframes claimAurora { to { transform: scale(1.06) translate3d(1.5%, -1%, 0); } }
@keyframes claimSpin { to { transform: rotate(360deg); } }
@keyframes claimRise {
  from { opacity: 0; transform: translateY(28px) scale(0.98); }
  to { opacity: 1; transform: none; }
}
@keyframes claimFadeUp {
  from { opacity: 0; transform: translateY(14px); }
  to { opacity: 1; transform: none; }
}
@keyframes claimPulse {
  0% { box-shadow: 0 0 0 0 rgba(16,185,129,0.55); }
  70% { box-shadow: 0 0 0 10px rgba(16,185,129,0); }
  100% { box-shadow: 0 0 0 0 rgba(16,185,129,0); }
}
@keyframes claimShimmer {
  0%, 55% { transform: translateX(-120%); }
  75%, 100% { transform: translateX(120%); }
}
@keyframes claimFloat {
  0%, 100% { transform: translateY(0) rotateX(8deg) rotateY(-12deg); }
  50% { transform: translateY(-14px) rotateX(12deg) rotateY(10deg); }
}
@keyframes claimBob {
  0%, 100% { transform: translateY(0) rotate(var(--r, -12deg)); }
  50% { transform: translateY(-10px) rotate(calc(var(--r, -12deg) + 6deg)); }
}
@media (prefers-reduced-motion: reduce) {
  .claim-stage *, .claim-stage *::before, .claim-stage *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
  }
}
`;
