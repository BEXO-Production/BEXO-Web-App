import { appOrigin, PLATFORM_DOMAIN, portfolioHostname } from "./platform";

function escapeHtml(value: string): string {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Premium "this handle is available" page for unclaimed subdomains.
 * Served by subdomainRouter when no profile exists for the Host handle.
 */
export function buildUnclaimedHandleHtml(handle: string): string {
  const safe = String(handle || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 48) || "yourname";

  const host = portfolioHostname(safe);
  const origin = appOrigin();
  const loginUrl = `${origin}/login?claim=${encodeURIComponent(safe)}`;
  const homeUrl = `${origin}/`;
  const crystalUrl = `${origin}/api/claim-assets/crystal-b.jpg`;
  const title = `${safe} is available on BEXO`;
  const description = `${host} hasn’t been claimed yet. Log in to BEXO and make this portfolio yours.`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <meta name="robots" content="noindex" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:image" content="${escapeHtml(crystalUrl)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Syne:wght@500;600;700;800&display=swap" rel="stylesheet" />
  <style>
    :root {
      --ink: #0b1220;
      --cream: #f4f1eb;
      --blue: #2f6bff;
      --blue-deep: #1a3fb8;
      --mist: rgba(255,255,255,0.72);
      --ease: cubic-bezier(0.22, 1, 0.36, 1);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { min-height: 100%; }
    body {
      font-family: Syne, system-ui, sans-serif;
      color: var(--ink);
      background: var(--cream);
      overflow-x: hidden;
      -webkit-font-smoothing: antialiased;
    }
    .stage {
      position: relative;
      min-height: 100dvh;
      display: grid;
      place-items: center;
      padding: clamp(1.25rem, 4vw, 3rem);
      isolation: isolate;
    }
    .aurora {
      position: absolute;
      inset: -20%;
      background:
        radial-gradient(ellipse 50% 40% at 15% 20%, rgba(47,107,255,0.28), transparent 55%),
        radial-gradient(ellipse 45% 35% at 85% 15%, rgba(15,23,42,0.18), transparent 50%),
        radial-gradient(ellipse 60% 45% at 50% 100%, rgba(47,107,255,0.16), transparent 55%),
        linear-gradient(165deg, #eef2ff 0%, var(--cream) 42%, #e8e4dc 100%);
      z-index: -3;
      animation: auroraShift 14s ease-in-out infinite alternate;
    }
    @keyframes auroraShift {
      from { transform: scale(1) translate3d(0,0,0); }
      to { transform: scale(1.06) translate3d(1.5%, -1%, 0); }
    }
    .grain {
      position: absolute;
      inset: 0;
      z-index: -1;
      opacity: 0.35;
      pointer-events: none;
      background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.55'/%3E%3C/svg%3E");
      mix-blend-mode: soft-light;
    }
    .orbit {
      position: absolute;
      width: min(78vw, 560px);
      aspect-ratio: 1;
      border-radius: 50%;
      border: 1px solid rgba(11,18,32,0.08);
      z-index: -2;
      animation: spin 48s linear infinite;
    }
    .orbit::before, .orbit::after {
      content: "";
      position: absolute;
      border-radius: 50%;
      background: linear-gradient(135deg, #2f6bff, #7eb6ff);
      box-shadow: 0 8px 30px rgba(47,107,255,0.35);
    }
    .orbit::before { width: 14px; height: 14px; top: 8%; left: 48%; }
    .orbit::after {
      width: 9px; height: 9px; bottom: 18%; right: 12%;
      background: linear-gradient(135deg, #0b1220, #445);
    }
    .orbit.slow { width: min(92vw, 720px); animation-duration: 72s; animation-direction: reverse; opacity: 0.7; }
    @keyframes spin { to { transform: rotate(360deg); } }

    .card {
      width: min(100%, 720px);
      position: relative;
      border-radius: 2rem;
      padding: clamp(1.75rem, 4vw, 3rem);
      background: linear-gradient(160deg, rgba(255,255,255,0.82), rgba(255,255,255,0.55));
      border: 1px solid rgba(255,255,255,0.7);
      box-shadow:
        0 1px 0 rgba(255,255,255,0.9) inset,
        0 40px 80px -30px rgba(11,18,32,0.35),
        0 12px 30px -12px rgba(47,107,255,0.25);
      backdrop-filter: blur(22px) saturate(1.2);
      -webkit-backdrop-filter: blur(22px) saturate(1.2);
      overflow: hidden;
      animation: rise 900ms var(--ease) both;
    }
    @keyframes rise {
      from { opacity: 0; transform: translateY(28px) scale(0.98); }
      to { opacity: 1; transform: none; }
    }
    .card::before {
      content: "";
      position: absolute;
      inset: auto -20% -40% 20%;
      height: 55%;
      background: radial-gradient(circle, rgba(47,107,255,0.22), transparent 65%);
      filter: blur(20px);
      pointer-events: none;
    }

    .top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      margin-bottom: clamp(1.5rem, 3vw, 2.25rem);
      animation: fadeUp 800ms var(--ease) 80ms both;
    }
    .brand {
      display: inline-flex;
      align-items: center;
      gap: 0.65rem;
      text-decoration: none;
      color: var(--ink);
      font-weight: 800;
      letter-spacing: -0.03em;
      font-size: 0.95rem;
    }
    .brand-mark {
      width: 2rem; height: 2rem;
      border-radius: 0.65rem;
      background: linear-gradient(145deg, #2f6bff, #1639a8);
      color: white;
      display: grid; place-items: center;
      font-weight: 800;
      box-shadow: 0 8px 18px rgba(47,107,255,0.35);
    }
    .pill {
      display: inline-flex;
      align-items: center;
      gap: 0.45rem;
      padding: 0.4rem 0.85rem;
      border-radius: 999px;
      background: rgba(16,185,129,0.12);
      color: #047857;
      font-size: 0.68rem;
      font-weight: 800;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      border: 1px solid rgba(16,185,129,0.22);
    }
    .pill-dot {
      width: 0.45rem; height: 0.45rem; border-radius: 50%;
      background: #10b981;
      box-shadow: 0 0 0 0 rgba(16,185,129,0.55);
      animation: pulse 1.8s ease-out infinite;
    }
    @keyframes pulse {
      0% { box-shadow: 0 0 0 0 rgba(16,185,129,0.55); }
      70% { box-shadow: 0 0 0 10px rgba(16,185,129,0); }
      100% { box-shadow: 0 0 0 0 rgba(16,185,129,0); }
    }

    .hero {
      display: grid;
      grid-template-columns: 1.15fr 0.85fr;
      gap: clamp(1.25rem, 3vw, 2rem);
      align-items: center;
    }
    @media (max-width: 720px) {
      .hero { grid-template-columns: 1fr; text-align: center; }
      .cta-row { justify-content: center; }
      .meta { justify-content: center; }
      .top { flex-direction: column; }
    }

    .kicker {
      font-size: 0.72rem;
      font-weight: 700;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: rgba(11,18,32,0.5);
      margin-bottom: 0.85rem;
      animation: fadeUp 800ms var(--ease) 140ms both;
    }
    h1 {
      font-family: "Instrument Serif", Georgia, serif;
      font-weight: 400;
      font-size: clamp(2.4rem, 6vw, 3.6rem);
      line-height: 0.95;
      letter-spacing: -0.03em;
      margin-bottom: 1rem;
      animation: fadeUp 900ms var(--ease) 180ms both;
    }
    h1 em {
      font-style: italic;
      color: var(--blue);
      background: linear-gradient(120deg, #2f6bff, #6ea0ff);
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
    }
    .lede {
      color: rgba(11,18,32,0.68);
      font-size: clamp(0.95rem, 2vw, 1.05rem);
      line-height: 1.55;
      max-width: 34ch;
      margin-bottom: 1.5rem;
      animation: fadeUp 900ms var(--ease) 240ms both;
    }
    @media (max-width: 720px) { .lede { margin-inline: auto; } }

    .handle-chip {
      display: inline-flex;
      align-items: center;
      gap: 0.55rem;
      padding: 0.7rem 1rem;
      border-radius: 1rem;
      background: rgba(11,18,32,0.04);
      border: 1px solid rgba(11,18,32,0.08);
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: clamp(0.78rem, 2vw, 0.9rem);
      color: var(--ink);
      margin-bottom: 1.6rem;
      animation: fadeUp 900ms var(--ease) 280ms both;
      max-width: 100%;
    }
    .handle-chip strong { color: var(--blue); font-weight: 700; }
    .handle-chip span { opacity: 0.55; overflow: hidden; text-overflow: ellipsis; }

    .cta-row {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
      animation: fadeUp 900ms var(--ease) 340ms both;
    }
    .btn {
      appearance: none;
      border: 0;
      cursor: pointer;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.55rem;
      border-radius: 999px;
      padding: 0.95rem 1.35rem;
      font-weight: 800;
      font-size: 0.92rem;
      letter-spacing: -0.01em;
      transition: transform 180ms var(--ease), box-shadow 180ms var(--ease), background 180ms ease;
    }
    .btn:active { transform: scale(0.97); }
    .btn-primary {
      color: white;
      background: linear-gradient(135deg, var(--blue), var(--blue-deep));
      box-shadow: 0 14px 30px -10px rgba(47,107,255,0.65), 0 0 0 1px rgba(255,255,255,0.18) inset;
      position: relative;
      overflow: hidden;
    }
    .btn-primary::after {
      content: "";
      position: absolute;
      inset: 0;
      background: linear-gradient(105deg, transparent 35%, rgba(255,255,255,0.35) 50%, transparent 65%);
      transform: translateX(-120%);
      animation: shimmer 3.2s ease-in-out infinite;
    }
    @keyframes shimmer {
      0%, 55% { transform: translateX(-120%); }
      75%, 100% { transform: translateX(120%); }
    }
    .btn-primary:hover { transform: translateY(-2px); box-shadow: 0 18px 36px -10px rgba(47,107,255,0.75); }
    .btn-ghost {
      color: var(--ink);
      background: rgba(255,255,255,0.55);
      border: 1px solid rgba(11,18,32,0.1);
    }
    .btn-ghost:hover { background: white; }

    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem 1.25rem;
      margin-top: 1.5rem;
      color: rgba(11,18,32,0.48);
      font-size: 0.75rem;
      font-weight: 600;
      animation: fadeUp 900ms var(--ease) 400ms both;
    }
    .meta span { display: inline-flex; align-items: center; gap: 0.4rem; }
    .meta i {
      width: 0.35rem; height: 0.35rem; border-radius: 50%;
      background: var(--blue); display: inline-block;
    }

    .visual {
      position: relative;
      height: min(42vw, 280px);
      min-height: 220px;
      perspective: 900px;
      animation: fadeUp 1000ms var(--ease) 220ms both;
    }
    .crystal {
      position: absolute;
      inset: 10% 12%;
      display: grid;
      place-items: center;
      transform-style: preserve-3d;
      animation: floatY 5.5s ease-in-out infinite;
    }
    @keyframes floatY {
      0%, 100% { transform: translateY(0) rotateX(8deg) rotateY(-12deg); }
      50% { transform: translateY(-14px) rotateX(12deg) rotateY(10deg); }
    }
    .crystal img {
      width: min(100%, 220px);
      height: auto;
      filter: drop-shadow(0 28px 40px rgba(47,107,255,0.35));
      border-radius: 1.25rem;
    }
    .facet {
      position: absolute;
      border-radius: 1rem;
      background: linear-gradient(145deg, rgba(255,255,255,0.75), rgba(47,107,255,0.18));
      border: 1px solid rgba(255,255,255,0.65);
      box-shadow: 0 18px 40px rgba(11,18,32,0.12);
      backdrop-filter: blur(8px);
      transform-style: preserve-3d;
    }
    .f1 { width: 72px; height: 72px; top: 8%; left: 4%; animation: bob 4.2s ease-in-out infinite; transform: rotate(-12deg); }
    .f2 { width: 48px; height: 48px; right: 6%; top: 22%; animation: bob 5s ease-in-out 0.4s infinite reverse; transform: rotate(18deg); background: linear-gradient(145deg, rgba(11,18,32,0.85), #2f6bff); }
    .f3 { width: 36px; height: 36px; left: 18%; bottom: 10%; animation: bob 3.8s ease-in-out 0.2s infinite; }
    @keyframes bob {
      0%, 100% { transform: translateY(0) rotate(var(--r, -12deg)); }
      50% { transform: translateY(-10px) rotate(calc(var(--r, -12deg) + 6deg)); }
    }
    .f1 { --r: -12deg; }
    .f2 { --r: 18deg; }
    .f3 { --r: 8deg; }

    .ring {
      position: absolute;
      inset: 18%;
      border-radius: 50%;
      border: 1px dashed rgba(47,107,255,0.28);
      animation: spin 28s linear infinite;
    }
    .ring-2 {
      inset: 6%;
      border-style: solid;
      border-color: rgba(11,18,32,0.06);
      animation-duration: 40s;
      animation-direction: reverse;
    }

    .foot {
      margin-top: clamp(1.5rem, 3vw, 2rem);
      padding-top: 1.15rem;
      border-top: 1px solid rgba(11,18,32,0.06);
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      gap: 0.75rem;
      color: rgba(11,18,32,0.45);
      font-size: 0.72rem;
      font-weight: 600;
      animation: fadeUp 900ms var(--ease) 460ms both;
    }
    .foot a { color: var(--blue); text-decoration: none; }
    .foot a:hover { text-decoration: underline; }

    @keyframes fadeUp {
      from { opacity: 0; transform: translateY(14px); }
      to { opacity: 1; transform: none; }
    }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
      }
    }
  </style>
</head>
<body>
  <main class="stage">
    <div class="aurora" aria-hidden="true"></div>
    <div class="grain" aria-hidden="true"></div>
    <div class="orbit slow" aria-hidden="true"></div>
    <div class="orbit" aria-hidden="true"></div>

    <section class="card" role="region" aria-label="Unclaimed portfolio handle">
      <div class="top">
        <a class="brand" href="${escapeHtml(homeUrl)}">
          <span class="brand-mark" aria-hidden="true">B</span>
          BEXO
        </a>
        <span class="pill"><span class="pill-dot" aria-hidden="true"></span> Name available</span>
      </div>

      <div class="hero">
        <div>
          <p class="kicker">Unclaimed subdomain</p>
          <h1>This name is waiting.<br /><em>Make it yours.</em></h1>
          <p class="lede">
            Nobody has claimed <strong>${escapeHtml(safe)}</strong> yet. Log in to BEXO and publish your placement-ready portfolio here.
          </p>
          <div class="handle-chip" title="${escapeHtml(host)}">
            <strong>${escapeHtml(safe)}</strong>
            <span>.${escapeHtml(PLATFORM_DOMAIN)}</span>
          </div>
          <div class="cta-row">
            <a class="btn btn-primary" href="${escapeHtml(loginUrl)}">
              Log in to claim this name
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14M13 5l7 7-7 7" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </a>
            <a class="btn btn-ghost" href="${escapeHtml(homeUrl)}">Explore BEXO</a>
          </div>
          <div class="meta">
            <span><i></i> Live in minutes</span>
            <span><i></i> Premium templates</span>
            <span><i></i> Hire Me page</span>
          </div>
        </div>

        <div class="visual" aria-hidden="true">
          <div class="ring ring-2"></div>
          <div class="ring"></div>
          <div class="facet f1"></div>
          <div class="facet f2"></div>
          <div class="facet f3"></div>
          <div class="crystal">
            <img src="${escapeHtml(crystalUrl)}" alt="" width="220" height="220" />
          </div>
        </div>
      </div>

      <div class="foot">
        <span>A product of Ace Digital</span>
        <a href="${escapeHtml(loginUrl)}">Already have an account? Sign in →</a>
      </div>
    </section>
  </main>
</body>
</html>`;
}
