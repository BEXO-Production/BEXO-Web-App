import type { OnboardingData } from '../context/OnboardingContext';

/** Map theme ID → CSS hex color */
const THEME_HEX: Record<string, string> = {
  blue:    '#2563eb',
  emerald: '#059669',
  rose:    '#e11d48',
  violet:  '#7c3aed',
  indigo:  '#4f46e5',
  amber:   '#d97706',
};

function esc(str: string | undefined | null): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatYearRange(start?: string, end?: string): string {
  if (start && end) return `${start} – ${end}`;
  if (end) return end;
  if (start) return `${start} – Present`;
  return '';
}

export function buildMinimalPortfolioHTML(data: OnboardingData, themeColor: string, handle: string): string {
  const accent = THEME_HEX[themeColor] || THEME_HEX['blue'];
  const accentLight = accent + '18';
  const accentMid = accent + '33';

  const name = esc(data.name || `${data.firstName || ''} ${data.lastName || ''}`.trim() || 'Your Name');
  const photoUrl = data.photoUrl || '';
  const headline = esc((data as any).headline || '');
  const bio = esc((data as any).bio || '');
  const openToHire = data.openToHire;
  const resumeUrl = esc(data.resumeUrl || '');
  const handleStr = esc(handle || data.handle || 'yourhandle');
  const email = esc(data.contactData?.email || data.email || '');
  const phone = esc(data.contactData?.phone || '');
  const linkedin = esc(data.contactData?.linkedin || '');
  const github = esc(data.contactData?.github || '');

  const aboutEntries = data.aboutEntries || [];
  const educationEntries = data.educationEntries || [];
  const experienceEntries = data.experienceEntries || [];
  const projectEntries = data.projectEntries || [];
  const certEntries = data.certificateEntries || [];
  const achieveEntries = data.achievementEntries || [];

  // Photo section
  const photoSection = photoUrl
    ? `<img src="${esc(photoUrl)}" alt="${name}" style="width:100%;height:100%;object-fit:cover;" />`
    : `<span style="font-size:40px;font-weight:800;color:#94a3b8;text-transform:uppercase;">${name.charAt(0)}</span>`;

  // About
  const aboutHTML = aboutEntries.length > 0
    ? `<div class="section">
        <h3 class="section-label">About Me</h3>
        ${aboutEntries.map((a: any) => `<p class="text-sm">${esc(a.description)}</p>`).join('')}
      </div>`
    : '';

  // Experience
  const expHTML = experienceEntries.length > 0
    ? `<div class="section">
        <h3 class="section-label">Experience</h3>
        ${experienceEntries.map((e: any) => {
          const dur = e.duration || formatYearRange(e.startYear, e.endYear);
          return `
          <div class="entry">
            <div class="entry-header">
              <div>
                <h4 class="entry-title">${esc(e.role)}</h4>
                <p class="entry-sub">${esc(e.company)}</p>
              </div>
              ${dur ? `<span class="entry-badge">${esc(dur)}</span>` : ''}
            </div>
            ${e.description ? `<p class="text-xs" style="color:#64748b;margin-top:4px;line-height:1.5;">${esc(e.description)}</p>` : ''}
          </div>`;
        }).join('')}
      </div>`
    : '';

  // Education
  const eduHTML = educationEntries.length > 0
    ? `<div class="section">
        <h3 class="section-label">Education</h3>
        ${educationEntries.map((e: any) => {
          const dur = e.year || formatYearRange(e.startYear, e.endYear);
          return `
          <div class="entry">
            <div class="entry-header">
              <div>
                <h4 class="entry-title">${esc(e.degree)}</h4>
                <p class="entry-sub">${esc(e.institution || (e as any).school || '')}</p>
                ${e.grade ? `<span style="font-size:10px;font-weight:700;color:${accent};display:block;margin-top:2px;">Grade: ${esc(e.grade)}</span>` : ''}
              </div>
              ${dur ? `<span class="entry-badge">${esc(dur)}</span>` : ''}
            </div>
          </div>`;
        }).join('')}
      </div>`
    : '';

  // Projects
  const projHTML = projectEntries.length > 0
    ? `<div class="section">
        <h3 class="section-label">Projects</h3>
        <div class="projects-grid">
          ${projectEntries.map((p: any) => `
            <div class="project-card">
              <div class="entry-header">
                <h4 class="entry-title">${esc(p.title)}</h4>
                ${p.link ? `<a href="${esc(p.link)}" target="_blank" style="color:${accent};font-size:11px;text-decoration:none;">↗ View</a>` : ''}
              </div>
              ${p.description ? `<p class="text-xs" style="color:#64748b;margin-top:4px;line-height:1.5;">${esc(p.description)}</p>` : ''}
              ${p.tech ? `<p style="font-size:10px;color:#94a3b8;margin-top:6px;font-weight:600;">${esc(p.tech)}</p>` : ''}
            </div>`).join('')}
        </div>
      </div>`
    : '';

  // Certificates
  const certHTML = certEntries.length > 0
    ? `<div class="section">
        <h3 class="section-label">Certifications</h3>
        ${certEntries.map((c: any) => `
          <div class="entry" style="display:flex;justify-content:space-between;align-items:start;">
            <div>
              <h4 class="entry-title">${esc(c.title)}</h4>
              <p class="entry-sub">${esc(c.issuer || c.organization || '')}</p>
            </div>
            ${c.date ? `<span class="entry-badge">${esc(c.date)}</span>` : ''}
          </div>`).join('')}
      </div>`
    : '';

  // Achievements
  const achieveHTML = achieveEntries.length > 0
    ? `<div class="section">
        <h3 class="section-label">Achievements</h3>
        ${achieveEntries.map((a: any) => `
          <div class="entry" style="display:flex;justify-content:space-between;align-items:start;">
            <div>
              <h4 class="entry-title">${esc(a.title)}</h4>
              <p class="entry-sub">${esc(a.organization || '')}</p>
            </div>
            ${a.date ? `<span class="entry-badge">${esc(a.date)}</span>` : ''}
          </div>`).join('')}
      </div>`
    : '';

  // Contact bar
  const contactParts: string[] = [];
  if (email) contactParts.push(`<a href="mailto:${email}" class="contact-item">✉ ${email}</a>`);
  if (phone) contactParts.push(`<span class="contact-item">📞 ${phone}</span>`);
  if (linkedin) {
    const clean = linkedin.replace(/^https?:\/\/(www\.)?linkedin\.com\/in\//i, '').replace(/\/$/, '');
    contactParts.push(`<a href="https://linkedin.com/in/${esc(clean)}" target="_blank" class="contact-item">🔗 ${esc(clean)}</a>`);
  }
  if (github) {
    const clean = github.replace(/^https?:\/\/(www\.)?github\.com\//i, '').replace(/\/$/, '');
    contactParts.push(`<a href="https://github.com/${esc(clean)}" target="_blank" class="contact-item">⌥ ${esc(clean)}</a>`);
  }
  const contactBar = contactParts.length > 0
    ? `<div class="contact-bar">${contactParts.join('')}</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${name} | mybexo.com/${handleStr}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Outfit:wght@600;700;800&display=swap" rel="stylesheet" />
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', -apple-system, sans-serif;
      background: #f1f5f9;
      color: #334155;
      -webkit-font-smoothing: antialiased;
    }
    .wrapper { max-width: 720px; margin: 0 auto; padding: 40px 16px 80px; }

    /* Hero */
    .hero { text-align: center; margin-bottom: 32px; }
    .avatar {
      width: 96px; height: 96px; border-radius: 50%;
      overflow: hidden; border: 3px solid #e2e8f0;
      box-shadow: 0 4px 12px rgba(0,0,0,0.08);
      display: flex; align-items: center; justify-content: center;
      margin: 0 auto 16px; background: #f8fafc;
    }
    .name { font-family:'Outfit',sans-serif; font-size: 2rem; font-weight: 800; color: #0f172a; letter-spacing:-0.5px; }
    .headline { font-size: 0.95rem; font-weight: 500; color: #64748b; margin-top: 4px; }
    .open-badge {
      display: inline-flex; align-items: center; gap: 6px;
      font-size: 10px; font-weight: 700; color: #15803d;
      background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 99px;
      padding: 3px 10px; margin-top: 8px;
    }
    .open-dot { width: 6px; height: 6px; border-radius:50%; background:#22c55e; animation: pulse 2s infinite; }
    @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
    .bio { font-size: 0.85rem; color: #64748b; line-height: 1.65; max-width: 480px; margin: 12px auto 0; }
    .hero-actions { display:flex; gap:12px; justify-content:center; margin-top:14px; flex-wrap:wrap; }
    .btn-resume {
      display: inline-flex; align-items: center; gap: 6px;
      font-size: 12px; font-weight: 700; color: ${accent};
      text-decoration: none;
    }
    .btn-hire {
      display: inline-flex; align-items: center; gap: 6px;
      font-size: 12px; font-weight: 700; color: #fff;
      background: ${accent}; border-radius: 99px; padding: 6px 16px;
      text-decoration: none; box-shadow: 0 2px 8px ${accent}44;
    }

    /* Contact bar */
    .contact-bar {
      display: flex; flex-wrap: wrap; justify-content: center; gap: 16px;
      font-size: 11px; color: #94a3b8;
      padding: 14px 0; border-top: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0;
      margin-bottom: 32px;
    }
    .contact-item { color: #64748b; text-decoration: none; display:flex; align-items:center; gap:4px; }
    .contact-item:hover { color: ${accent}; }

    /* Sections */
    .section { margin-bottom: 28px; background: #fff; border-radius: 16px; padding: 20px 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
    .section-label {
      font-size: 10px; font-weight: 700; color: #94a3b8;
      text-transform: uppercase; letter-spacing: 1.2px;
      margin-bottom: 14px; padding-bottom: 10px;
      border-bottom: 1px solid #f1f5f9;
    }

    /* Entries */
    .entry { padding: 8px 0; border-bottom: 1px solid #f1f5f9; }
    .entry:last-child { border-bottom: none; padding-bottom: 0; }
    .entry-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
    .entry-title { font-size: 13px; font-weight: 700; color: #0f172a; }
    .entry-sub { font-size: 11px; font-weight: 600; color: #64748b; margin-top: 2px; }
    .entry-badge {
      font-size: 10px; font-weight: 700; color: #94a3b8;
      background: #f8fafc; border: 1px solid #e2e8f0;
      padding: 2px 8px; border-radius: 6px; white-space: nowrap; flex-shrink: 0;
    }
    .text-sm { font-size: 13px; color: #475569; line-height: 1.65; }
    .text-xs { font-size: 12px; }

    /* Projects grid */
    .projects-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px,1fr)); gap: 12px; }
    .project-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px; }

    /* Bexo watermark */
    .watermark {
      text-align: center; margin-top: 40px; padding-top: 24px;
      border-top: 1px solid #e2e8f0; font-size: 11px; color: #cbd5e1;
    }
    .watermark a { color: ${accent}; font-weight: 700; text-decoration: none; }

    /* Accent-coloured section labels */
    .section-label { border-left: 3px solid ${accent}; padding-left: 8px; }
  </style>
</head>
<body>
  <div class="wrapper">
    <!-- Hero -->
    <div class="hero">
      <div class="avatar">${photoSection}</div>
      <h1 class="name">${name}</h1>
      ${headline ? `<p class="headline">${headline}</p>` : ''}
      ${openToHire ? `<span class="open-badge"><span class="open-dot"></span>Available for Hire</span>` : ''}
      ${bio ? `<p class="bio">${bio}</p>` : ''}
      <div class="hero-actions">
        ${resumeUrl ? `<a href="${resumeUrl}" target="_blank" class="btn-resume">↗ View Resume</a>` : ''}
        ${openToHire && email ? `<a href="mailto:${email}?subject=Hiring inquiry for ${name}" class="btn-hire">✉ Hire Me</a>` : ''}
      </div>
    </div>

    ${contactBar}

    ${aboutHTML}
    ${expHTML}
    ${eduHTML}
    ${projHTML}
    ${certHTML}
    ${achieveHTML}

    <div class="watermark">
      Powered by <a href="https://mybexo.com" target="_blank">mybexo.com</a>
      &nbsp;·&nbsp; mybexo.com/${handleStr}
    </div>
  </div>
</body>
</html>`;
}
