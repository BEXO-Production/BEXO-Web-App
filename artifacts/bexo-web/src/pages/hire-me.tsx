import React, { useEffect, useMemo, useState } from "react";
import { useRoute } from "wouter";
import { applyPageSeo, buildPortfolioPageJsonLd } from "@/lib/seo";
import { apiUrl } from "@/lib/api";

type PublicProfile = {
  profile: {
    handle?: string;
    headline?: string;
    careerGoal?: string;
    bio?: string;
  };
  user: {
    name?: string;
    email?: string;
    photoUrl?: string;
    resumeUrl?: string;
    openToHire?: boolean;
  };
  aboutEntries?: any[];
  educationEntries?: any[];
  experienceEntries?: any[];
  projectEntries?: any[];
  certificateEntries?: any[];
  achievementEntries?: any[];
  researchEntries?: any[];
  contactData?: {
    email?: string;
    linkedin?: string;
    github?: string;
    portfolio?: string;
    socials?: { label: string; url: string }[];
  };
};

function Section({
  title,
  children,
  show,
}: {
  title: string;
  children: React.ReactNode;
  show: boolean;
}) {
  if (!show) return null;
  return (
    <section className="hire-section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

const THEME_HEX_MAP: Record<string, string> = {
  blue: "#2563eb",
  emerald: "#059669",
  rose: "#e11d48",
  violet: "#7c3aed",
  indigo: "#4f46e5",
  amber: "#d97706",
  gold: "#c4a574",
  cyan: "#0891b2",
  dark: "#38bdf8",
};

export default function HireMePage({ handleOverride }: { handleOverride?: string }) {
  const [, params] = useRoute("/hire-me/:handle");
  const handle = handleOverride || params?.handle || "";
  const [data, setData] = useState<PublicProfile | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!handle) {
      setLoading(false);
      setError("Portfolio handle is required.");
      return;
    }

    let cancelled = false;
    setLoading(true);
    fetch(apiUrl(`/api/profile/public/${encodeURIComponent(handle)}`))
      .then(async (res) => {
        if (!res.ok) throw new Error("Portfolio not found.");
        return res.json();
      })
      .then((payload) => {
        if (!cancelled) setData(payload);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || "Unable to load profile.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [handle]);

  useEffect(() => {
    if (!data?.user || !handle) return;
    const name = String(data.user.name || handle).trim();
    const headline =
      String(data.profile?.headline || "").trim() ||
      String(data.profile?.careerGoal || "").trim();
    const origin = window.location.origin.replace(/\/$/, "");
    const canonical = `${origin}/hire-me/${encodeURIComponent(handle)}`;
    const photo = String(data.user.photoUrl || "").trim();
    const ogImage =
      photo.startsWith("http://") || photo.startsWith("https://")
        ? photo
        : `${origin}/og-portfolio.jpg`;

    applyPageSeo({
      title: `Hire ${name} — BEXO`,
      description:
        headline ||
        `${name} is open to opportunities. View skills, experience, and contact on BEXO Hire Me.`,
      canonical,
      ogImage,
      ogType: "profile",
      jsonLd: buildPortfolioPageJsonLd({
        name,
        headline: headline || "Open to hire",
        url: canonical,
        image: ogImage,
      }),
    });
  }, [data, handle]);

  const skills = useMemo(() => {
    if (!data) return [] as string[];
    const bag = new Set<string>();
    for (const project of data.projectEntries || []) {
      String(project.techStack || project.tech || "")
        .split(/[,|/]/)
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((skill) => bag.add(skill));
    }
    for (const exp of data.experienceEntries || []) {
      String(exp.role || "")
        .split(/[,|/]/)
        .map((s) => s.trim())
        .filter((s) => s.length > 2 && s.length < 40)
        .forEach((skill) => bag.add(skill));
    }
    return Array.from(bag).slice(0, 18);
  }, [data]);

  // Resolve user-selected theme color and background style
  const themeColor = data?.user?.themeColor || (data as any)?.themeColor || data?.profile?.themeColor || "blue";
  const themeBg = data?.user?.themeBg || (data as any)?.themeBg || data?.profile?.themeBg || "grid";
  const accentHex = THEME_HEX_MAP[themeColor] || THEME_HEX_MAP.blue;
  const isDarkMode = themeBg === "dark" || themeColor === "dark" || themeBg === "atmosphere";

  if (loading) {
    return (
      <div className="hire-shell" style={{ minHeight: "100dvh", background: "#0b101b", padding: "2rem 1rem 4rem" }}>
        <style>{`
          @keyframes hireShimmer {
            0% { background-position: -400px 0; }
            100% { background-position: 400px 0; }
          }
          .hire-skel-page {
            max-width: 860px;
            margin: 0 auto;
            background: #111827;
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 12px;
            padding: 3rem 3.25rem;
            box-shadow: 0 18px 40px -28px rgba(0, 0, 0, 0.5);
          }
          .hire-skel {
            border-radius: 6px;
            background: linear-gradient(90deg, #1f2937 25%, #374151 50%, #1f2937 75%);
            background-size: 800px 100%;
            animation: hireShimmer 1.4s linear infinite;
          }
          .hire-skel-head { display: flex; gap: 1.5rem; align-items: center; margin-bottom: 2.25rem; }
          .hire-skel-avatar { width: 84px; height: 84px; border-radius: 50%; flex-shrink: 0; }
          @media (prefers-reduced-motion: reduce) { .hire-skel { animation: none; } }
        `}</style>
        <div className="hire-skel-page" aria-busy="true" aria-label="Loading profile">
          <div className="hire-skel-head">
            <div className="hire-skel hire-skel-avatar" />
            <div style={{ flex: 1 }}>
              <div className="hire-skel" style={{ height: 28, width: "55%", marginBottom: 12 }} />
              <div className="hire-skel" style={{ height: 16, width: "40%" }} />
            </div>
          </div>
          {[92, 100, 84, 96, 70].map((w, i) => (
            <div key={i} className="hire-skel" style={{ height: 14, width: `${w}%`, marginBottom: 12 }} />
          ))}
          <div className="hire-skel" style={{ height: 22, width: "30%", margin: "2rem 0 1rem" }} />
          {[100, 88, 94].map((w, i) => (
            <div key={`b-${i}`} className="hire-skel" style={{ height: 14, width: `${w}%`, marginBottom: 12 }} />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="hire-shell" style={{ minHeight: "100dvh", background: "#0b101b", display: "grid", placeItems: "center" }}>
        <p className="hire-status" style={{ color: "#94a3b8" }}>{error || "Profile unavailable."}</p>
      </div>
    );
  }

  const email = data.contactData?.email || data.user.email || "";
  const links = data.contactData?.socials || [];

  return (
    <div className={`hire-shell ${isDarkMode ? "is-dark" : "is-light"}`}>
      <style>{`
        .hire-shell {
          min-height: 100dvh;
          position: relative;
          overflow-x: hidden;
          font-family: "Plus Jakarta Sans", "Source Sans 3", system-ui, sans-serif;
          padding: 2.5rem 1rem 4rem;
          transition: background 0.3s ease;
        }

        .hire-shell.is-dark {
          background: #090c15;
          color: #f1f5f9;
        }

        .hire-shell.is-light {
          background: ${
            themeBg === "dots"
              ? "#f8fafc"
              : themeBg === "solid"
              ? `linear-gradient(135deg, ${accentHex}08 0%, ${accentHex}18 50%, ${accentHex}12 100%)`
              : `linear-gradient(135deg, #f8fafc 0%, ${accentHex}12 35%, #f1f5f9 70%, ${accentHex}10 100%)`
          };
          color: #0f172a;
        }

        .hire-bg-overlay {
          position: absolute;
          inset: 0;
          pointer-events: none;
        }

        .hire-toolbar {
          max-width: 860px;
          margin: 0 auto 1.25rem;
          display: flex;
          justify-content: flex-end;
          gap: 0.75rem;
          position: relative;
          z-index: 10;
        }

        .hire-toolbar button,
        .hire-toolbar a {
          min-height: 42px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0.55rem 1.1rem;
          border-radius: 9999px;
          font-size: 0.82rem;
          font-weight: 600;
          text-decoration: none;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .hire-shell.is-dark .hire-toolbar button,
        .hire-shell.is-dark .hire-toolbar a {
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(17, 24, 39, 0.75);
          color: #f8fafc;
          backdrop-filter: blur(12px);
        }

        .hire-shell.is-dark .hire-toolbar button:hover,
        .hire-shell.is-dark .hire-toolbar a:hover {
          border-color: ${accentHex};
          color: ${accentHex};
          background: rgba(17, 24, 39, 0.9);
        }

        .hire-shell.is-light .hire-toolbar button,
        .hire-shell.is-light .hire-toolbar a {
          border: 1px solid #cbd5e1;
          background: #ffffff;
          color: #0f172a;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
        }

        .hire-shell.is-light .hire-toolbar button:hover,
        .hire-shell.is-light .hire-toolbar a:hover {
          border-color: ${accentHex};
          color: ${accentHex};
        }

        .hire-page {
          max-width: 860px;
          margin: 0 auto;
          position: relative;
          z-index: 10;
          border-radius: 16px;
          padding: 3rem;
          transition: all 0.3s ease;
        }

        .hire-shell.is-dark .hire-page {
          background: rgba(15, 23, 42, 0.75);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          box-shadow: 0 24px 60px -15px rgba(0, 0, 0, 0.5), 0 1px 0 rgba(255, 255, 255, 0.08) inset;
        }

        .hire-shell.is-light .hire-page {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          box-shadow: 0 20px 48px -18px rgba(15, 23, 42, 0.12);
        }

        .hire-header {
          display: grid;
          grid-template-columns: 112px 1fr;
          gap: 1.5rem;
          align-items: center;
          padding-bottom: 2rem;
          border-bottom: 2px solid ${accentHex};
          margin-bottom: 2rem;
        }

        .hire-photo {
          width: 112px;
          height: 112px;
          border-radius: 50%;
          overflow: hidden;
          background: rgba(255, 255, 255, 0.08);
          border: 2px solid ${accentHex};
          box-shadow: 0 0 20px ${accentHex}30;
        }

        .hire-photo img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .hire-header h1 {
          margin: 0;
          font-size: clamp(1.85rem, 3vw, 2.35rem);
          line-height: 1.15;
          font-weight: 800;
          letter-spacing: -0.02em;
        }

        .hire-header .headline {
          margin: 0.4rem 0 0.85rem;
          font-size: 1.08rem;
          font-weight: 500;
        }

        .hire-shell.is-dark .hire-header .headline { color: #cbd5e1; }
        .hire-shell.is-light .hire-header .headline { color: #475569; }

        .hire-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 0.75rem 1.25rem;
          font-size: 0.92rem;
          align-items: center;
        }

        .hire-meta a {
          color: ${accentHex};
          text-decoration: none;
          font-weight: 600;
        }

        .hire-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          padding: 0.28rem 0.7rem;
          border-radius: 9999px;
          background: rgba(52, 211, 153, 0.12);
          color: #34d399;
          border: 1px solid rgba(52, 211, 153, 0.3);
          font-size: 0.72rem;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }

        .hire-badge::before {
          content: "";
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #34d399;
          box-shadow: 0 0 8px #34d399;
        }

        .hire-section { margin-top: 2rem; }

        .hire-section h2 {
          margin: 0 0 0.85rem;
          font-size: 0.78rem;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: ${accentHex};
          border-bottom: 1px solid ${accentHex}30;
          padding-bottom: 0.45rem;
        }

        .hire-section p, .hire-section li {
          font-size: 0.96rem;
          line-height: 1.6;
        }

        .hire-shell.is-dark .hire-section p,
        .hire-shell.is-dark .hire-section li { color: #cbd5e1; }
        .hire-shell.is-light .hire-section p,
        .hire-shell.is-light .hire-section li { color: #334155; }

        .hire-item { margin-bottom: 1.25rem; }

        .hire-item-head {
          display: flex;
          justify-content: space-between;
          gap: 1rem;
          align-items: baseline;
        }

        .hire-item h3 {
          margin: 0;
          font-size: 1.05rem;
          font-weight: 700;
        }

        .hire-item .sub {
          margin: 0.15rem 0 0.35rem;
          font-size: 0.9rem;
          font-weight: 500;
        }

        .hire-shell.is-dark .hire-item .sub { color: #94a3b8; }
        .hire-shell.is-light .hire-item .sub { color: #64748b; }

        .hire-item .when {
          white-space: nowrap;
          font-size: 0.85rem;
          font-weight: 500;
          color: ${accentHex};
        }

        .hire-skills {
          display: flex;
          flex-wrap: wrap;
          gap: 0.55rem;
        }

        .hire-skills span {
          border-radius: 9999px;
          padding: 0.3rem 0.75rem;
          font-size: 0.82rem;
          font-weight: 600;
          transition: all 0.2s ease;
        }

        .hire-shell.is-dark .hire-skills span {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid ${accentHex}40;
          color: #e2e8f0;
        }

        .hire-shell.is-light .hire-skills span {
          background: ${accentHex}0f;
          border: 1px solid ${accentHex}25;
          color: ${accentHex};
        }

        @media (max-width: 720px) {
          .hire-page { padding: 1.5rem; }
          .hire-header { grid-template-columns: 84px 1fr; }
          .hire-photo { width: 84px; height: 84px; }
          .hire-item-head { flex-direction: column; gap: 0.25rem; }
          .hire-toolbar { justify-content: stretch; }
          .hire-toolbar button, .hire-toolbar a { flex: 1; }
        }

        @media print {
          .hire-shell { background: #fff !important; color: #000 !important; padding: 0 !important; }
          .hire-toolbar { display: none !important; }
          .hire-page {
            box-shadow: none !important;
            border: none !important;
            max-width: none !important;
            padding: 0 !important;
            background: #fff !important;
          }
        }
      `}</style>

      {/* Dynamic Background Mesh Overlays */}
      <div className="hire-bg-overlay">
        {themeBg === "grid" && (
          <>
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:14px_24px]" />
            <div className="absolute top-[-10%] left-[-5%] w-[500px] h-[500px] rounded-full blur-[120px]" style={{ background: `${accentHex}14` }} />
            <div className="absolute bottom-[20%] right-[-5%] w-[450px] h-[450px] rounded-full blur-[100px]" style={{ background: `${accentHex}10` }} />
          </>
        )}
        {themeBg === "dots" && (
          <>
            <div className="absolute inset-0 bg-[radial-gradient(#e2e8f0_1.5px,transparent_1.5px)] bg-[size:24px_24px]" />
            <div className="absolute top-[10%] right-[10%] w-[350px] h-[350px] rounded-full blur-[90px]" style={{ background: `${accentHex}15` }} />
          </>
        )}
        {(themeBg === "dark" || isDarkMode) && (
          <>
            <div className="absolute top-[0%] left-[20%] w-[600px] h-[400px] rounded-full blur-[140px]" style={{ background: `${accentHex}18` }} />
          </>
        )}
      </div>

      <div className="hire-toolbar">
        {data.user.resumeUrl && (
          <a href={data.user.resumeUrl} target="_blank" rel="noopener noreferrer">
            Download Resume
          </a>
        )}
        <button type="button" onClick={() => window.print()}>
          Print / Save PDF
        </button>
      </div>

      <article className="hire-page">
        <header className="hire-header">
          <div className="hire-photo">
            {data.user.photoUrl ? (
              <img src={data.user.photoUrl} alt={data.user.name || "Candidate"} />
            ) : (
              <div style={{ width: "100%", height: "100%", display: "grid", placeItems: "center", fontWeight: 700 }}>
                {(data.user.name || "C").charAt(0)}
              </div>
            )}
          </div>
          <div>
            <h1>{data.user.name || "Candidate"}</h1>
            {(data.profile.headline || data.profile.careerGoal) && (
              <p className="headline">{data.profile.headline || data.profile.careerGoal}</p>
            )}
            <div className="hire-meta">
              {email && <a href={`mailto:${email}`}>{email}</a>}
              {links.map((link) => (
                <a key={`${link.label}-${link.url}`} href={link.url} target="_blank" rel="noopener noreferrer">
                  {link.label}
                </a>
              ))}
              {data.user.openToHire && <span className="hire-badge">Open to opportunities</span>}
            </div>
          </div>
        </header>

        <Section title="Professional Summary" show={!!(data.profile.bio || data.aboutEntries?.[0]?.description || data.aboutEntries?.[0]?.bio)}>
          <p>{data.profile.bio || data.aboutEntries?.[0]?.description || data.aboutEntries?.[0]?.bio}</p>
        </Section>

        <Section title="Core Skills" show={skills.length > 0}>
          <div className="hire-skills">
            {skills.map((skill) => (
              <span key={skill}>{skill}</span>
            ))}
          </div>
        </Section>

        <Section title="Experience" show={(data.experienceEntries || []).length > 0}>
          {(data.experienceEntries || []).map((exp, idx) => (
            <div className="hire-item" key={exp.id || idx}>
              <div className="hire-item-head">
                <div>
                  <h3>{exp.role}</h3>
                  <p className="sub">{exp.company}</p>
                </div>
                <div className="when">
                  {exp.duration || [exp.startYear || exp.startDate, exp.endYear || exp.endDate].filter(Boolean).join(" - ")}
                </div>
              </div>
              <ul>
                {(exp.responsibilities?.length
                  ? exp.responsibilities
                  : String(exp.description || "")
                      .split("\n")
                      .filter(Boolean)
                ).map((line: string, i: number) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </div>
          ))}
        </Section>

        <Section title="Education" show={(data.educationEntries || []).length > 0}>
          {(data.educationEntries || []).map((edu, idx) => (
            <div className="hire-item" key={edu.id || idx}>
              <div className="hire-item-head">
                <div>
                  <h3>{edu.degree}</h3>
                  <p className="sub">{edu.institution || edu.school}</p>
                </div>
                <div className="when">
                  {edu.duration || edu.year || [edu.startYear, edu.endYear].filter(Boolean).join(" - ")}
                </div>
              </div>
              {edu.grade && <p>{edu.grade}</p>}
            </div>
          ))}
        </Section>

        <Section title="Projects" show={(data.projectEntries || []).length > 0}>
          {(data.projectEntries || []).map((project, idx) => (
            <div className="hire-item" key={project.id || idx}>
              <div className="hire-item-head">
                <div>
                  <h3>{project.title}</h3>
                  <p className="sub">{[project.role, project.techStack || project.tech].filter(Boolean).join(" · ")}</p>
                </div>
                <div className="when">{project.year || project.duration}</div>
              </div>
              {project.description && <p>{project.description}</p>}
              {project.link && (
                <p>
                  <a href={project.link} target="_blank" rel="noopener noreferrer">
                    Project link
                  </a>
                </p>
              )}
            </div>
          ))}
        </Section>

        <Section title="Certificates" show={(data.certificateEntries || []).length > 0}>
          {(data.certificateEntries || []).map((cert, idx) => (
            <div className="hire-item" key={cert.id || idx}>
              <div className="hire-item-head">
                <div>
                  <h3>{cert.title || cert.name}</h3>
                  <p className="sub">{cert.issuer}</p>
                </div>
                <div className="when">{cert.date}</div>
              </div>
            </div>
          ))}
        </Section>

        <Section title="Achievements" show={(data.achievementEntries || []).length > 0}>
          {(data.achievementEntries || []).map((item, idx) => (
            <div className="hire-item" key={item.id || idx}>
              <div className="hire-item-head">
                <div>
                  <h3>{item.title}</h3>
                  <p className="sub">{item.awarder || item.organization}</p>
                </div>
                <div className="when">{item.year || item.date}</div>
              </div>
            </div>
          ))}
        </Section>

        <Section title="Research" show={(data.researchEntries || []).length > 0}>
          {(data.researchEntries || []).map((item, idx) => (
            <div className="hire-item" key={item.id || idx}>
              <div className="hire-item-head">
                <div>
                  <h3>{item.title}</h3>
                  <p className="sub">{item.publication || item.journal || item.organization}</p>
                </div>
                <div className="when">{item.year || item.date}</div>
              </div>
              {item.link && (
                <p>
                  <a href={item.link} target="_blank" rel="noopener noreferrer">
                    Publication link
                  </a>
                </p>
              )}
            </div>
          ))}
        </Section>
      </article>
    </div>
  );
}
