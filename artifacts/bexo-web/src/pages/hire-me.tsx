import React, { useEffect, useMemo, useState } from "react";
import { useRoute } from "wouter";

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

const apiBase = () => (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

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
    fetch(`${apiBase()}/api/profile/public/${encodeURIComponent(handle)}`)
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

  if (loading) {
    return (
      <div className="hire-shell" style={{ minHeight: "100dvh", background: "#f7f6f3", padding: "2rem 1rem 4rem" }}>
        <style>{`
          @keyframes hireShimmer {
            0% { background-position: -400px 0; }
            100% { background-position: 400px 0; }
          }
          .hire-skel-page {
            max-width: 860px;
            margin: 0 auto;
            background: #fff;
            border: 1px solid #e7e5e4;
            border-radius: 6px;
            padding: 3rem 3.25rem;
            box-shadow: 0 18px 40px -28px rgba(28, 25, 23, 0.35);
          }
          .hire-skel {
            border-radius: 6px;
            background: linear-gradient(90deg, #eeece8 25%, #f7f5f1 50%, #eeece8 75%);
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
      <div className="hire-shell">
        <p className="hire-status">{error || "Profile unavailable."}</p>
      </div>
    );
  }

  const email = data.contactData?.email || data.user.email || "";
  const links = data.contactData?.socials || [];

  return (
    <div className="hire-shell">
      <style>{`
        .hire-shell {
          min-height: 100dvh;
          background: #f7f6f3;
          color: #1c1917;
          font-family: "Source Sans 3", "Segoe UI", Helvetica, Arial, sans-serif;
          padding: 2rem 1rem 4rem;
        }
        .hire-page {
          max-width: 860px;
          margin: 0 auto;
          background: #fff;
          border: 1px solid #e7e5e4;
          box-shadow: 0 18px 40px -28px rgba(28, 25, 23, 0.35);
          padding: 2.5rem;
        }
        .hire-toolbar {
          max-width: 860px;
          margin: 0 auto 1rem;
          display: flex;
          justify-content: flex-end;
          gap: 0.75rem;
        }
        .hire-toolbar button,
        .hire-toolbar a {
          min-height: 40px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0.55rem 1rem;
          border: 1px solid #d6d3d1;
          background: #fff;
          color: #1c1917;
          border-radius: 999px;
          font-size: 0.8rem;
          font-weight: 600;
          text-decoration: none;
          cursor: pointer;
        }
        .hire-header {
          display: grid;
          grid-template-columns: 112px 1fr;
          gap: 1.25rem;
          align-items: center;
          padding-bottom: 1.5rem;
          border-bottom: 2px solid #1c1917;
          margin-bottom: 1.5rem;
        }
        .hire-photo {
          width: 112px;
          height: 112px;
          border-radius: 999px;
          overflow: hidden;
          background: #e7e5e4;
        }
        .hire-photo img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .hire-header h1 {
          margin: 0;
          font-size: clamp(1.75rem, 3vw, 2.25rem);
          line-height: 1.15;
          font-weight: 700;
          letter-spacing: -0.02em;
        }
        .hire-header .headline {
          margin: 0.35rem 0 0.75rem;
          color: #44403c;
          font-size: 1.05rem;
        }
        .hire-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 0.75rem 1.25rem;
          font-size: 0.92rem;
          color: #292524;
        }
        .hire-meta a { color: #1d4ed8; text-decoration: none; }
        .hire-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          padding: 0.2rem 0.55rem;
          border-radius: 999px;
          background: #ecfdf5;
          color: #047857;
          font-size: 0.72rem;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }
        .hire-section { margin-top: 1.75rem; }
        .hire-section h2 {
          margin: 0 0 0.75rem;
          font-size: 0.78rem;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: #57534e;
          border-bottom: 1px solid #e7e5e4;
          padding-bottom: 0.4rem;
        }
        .hire-section p, .hire-section li {
          font-size: 0.95rem;
          line-height: 1.55;
          color: #292524;
        }
        .hire-item { margin-bottom: 1rem; }
        .hire-item-head {
          display: flex;
          justify-content: space-between;
          gap: 1rem;
          align-items: baseline;
        }
        .hire-item h3 {
          margin: 0;
          font-size: 1rem;
          font-weight: 700;
        }
        .hire-item .sub {
          margin: 0.15rem 0 0.35rem;
          color: #57534e;
          font-size: 0.9rem;
        }
        .hire-item .when {
          white-space: nowrap;
          color: #78716c;
          font-size: 0.85rem;
        }
        .hire-skills {
          display: flex;
          flex-wrap: wrap;
          gap: 0.45rem;
        }
        .hire-skills span {
          border: 1px solid #d6d3d1;
          border-radius: 999px;
          padding: 0.25rem 0.65rem;
          font-size: 0.8rem;
          background: #fafaf9;
        }
        .hire-status {
          max-width: 420px;
          margin: 20vh auto;
          text-align: center;
          color: #57534e;
        }
        @media (max-width: 720px) {
          .hire-page { padding: 1.25rem; }
          .hire-header { grid-template-columns: 84px 1fr; }
          .hire-photo { width: 84px; height: 84px; }
          .hire-item-head { flex-direction: column; gap: 0.25rem; }
          .hire-toolbar { justify-content: stretch; }
          .hire-toolbar button, .hire-toolbar a { flex: 1; }
        }
        @media print {
          .hire-shell { background: #fff; padding: 0; }
          .hire-toolbar { display: none !important; }
          .hire-page {
            box-shadow: none;
            border: none;
            max-width: none;
            padding: 0;
          }
        }
      `}</style>

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
