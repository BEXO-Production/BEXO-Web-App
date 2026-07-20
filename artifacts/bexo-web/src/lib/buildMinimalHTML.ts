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

function buildEntryAssetsHTML(assets: any, accent: string, accentLight: string, accentMid: string): string {
  if (!assets) return '';
  const images = Array.isArray(assets.images) ? assets.images.filter(Boolean) : [];
  const pdfs = Array.isArray(assets.pdfs) ? assets.pdfs.filter(Boolean) : [];

  if (images.length === 0 && pdfs.length === 0) return '';

  let html = `<div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #f1f5f9; display: flex; flex-direction: column; gap: 8px;">`;

  if (images.length > 0) {
    html += `<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(80px, 1fr)); gap: 8px;">`;
    images.forEach((img: any, idx: number) => {
      const url = typeof img === 'string' ? img : (img.url || '');
      if (url) {
        html += `
          <a href="${esc(url)}" target="_blank" style="display: block; aspect-ratio: 16/9; border-radius: 8px; overflow: hidden; border: 1px solid #e2e8f0;">
            <img src="${esc(url)}" style="width: 100%; height: 100%; object-fit: cover;" />
          </a>`;
      }
    });
    html += `</div>`;
  }

  if (pdfs.length > 0) {
    html += `<div style="display: flex; flex-wrap: wrap; gap: 8px;">`;
    pdfs.forEach((pdf: any, idx: number) => {
      const url = typeof pdf === 'string' ? pdf : (pdf.url || '');
      if (url) {
        html += `
          <a href="${esc(url)}" target="_blank" download style="display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 12px; font-size: 11px; font-weight: 700; color: #475569; text-decoration: none;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${accent}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
            Download PDF
          </a>`;
      }
    });
    html += `</div>`;
  }

  html += `</div>`;
  return html;
}

function buildFeaturedCardHTML(title: string, sub: string, date: string, description: string, assets: any, linkButtonHTML: string, accentColor: string): string {
  const images = Array.isArray(assets?.images) ? assets.images.filter(Boolean) : [];
  const pdfs = Array.isArray(assets?.pdfs) ? assets.pdfs.filter(Boolean) : [];
  const imageUrl = typeof images[0] === 'string' ? images[0] : (images[0]?.url || '');

  if (!imageUrl) return '';

  let pdfButtonsHTML = '';
  pdfs.forEach((pdf: any, idx: number) => {
    const url = typeof pdf === 'string' ? pdf : (pdf.url || '');
    if (url) {
      pdfButtonsHTML += `
        <a href="${esc(url)}" target="_blank" download style="display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; font-size: 10px; font-weight: 700; color: #ffffff; text-decoration: none; backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px);">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
          Download PDF
        </a>`;
    }
  });

  return `
    <div style="position: relative; aspect-ratio: 16/10; border-radius: 16px; overflow: hidden; border: 1px solid rgba(226,232,240,0.6); box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); margin-bottom: 12px; width: 100%;">
      <!-- Background Image -->
      <img src="${esc(imageUrl)}" style="width: 100%; height: 100%; object-fit: cover;" />
      <!-- Dark overlay gradient -->
      <div style="position: absolute; inset: 0; background: linear-gradient(to top, rgba(15,23,42,0.95) 0%, rgba(15,23,42,0.3) 60%, transparent 100%);"></div>
      
      <!-- Content on top of image -->
      <div style="position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: flex-end; padding: 20px; z-index: 10; font-family: 'Inter', sans-serif;">
        <div style="display: flex; flex-direction: column; gap: 4px;">
          ${date ? `<span style="font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; color: rgba(255,255,255,0.95); background: rgba(255,255,255,0.2); padding: 2px 6px; border-radius: 4px; align-self: flex-start; backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px);">${esc(date)}</span>` : ''}
          <h4 style="font-size: 14px; font-weight: 700; color: #ffffff; margin: 2px 0 0 0; line-height: 1.3;">${esc(title)}</h4>
          ${sub ? `<p style="font-size: 11px; font-weight: 600; color: #cbd5e1; margin: 0;">${esc(sub)}</p>` : ''}
        </div>
        ${description ? `<p style="font-size: 11px; color: #94a3b8; margin-top: 8px; line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${esc(description)}</p>` : ''}
        
        <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px;">
          ${pdfButtonsHTML}
          ${linkButtonHTML}
        </div>
      </div>
    </div>`;
}

export function buildMinimalPortfolioHTML(data: OnboardingData, themeColor: string, handle: string, themeBg?: string): string {
  const accent = THEME_HEX[themeColor] || THEME_HEX['blue'];
  const accentLight = accent + '12';
  const accentMid = accent + '30';
  const bgStyle = themeBg || data.themeBg || 'grid';

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
    : `<span style="font-size:54px;font-weight:800;color:#cbd5e1;text-transform:uppercase;font-family:'Outfit',sans-serif;">${name.charAt(0)}</span>`;

  // About
  const aboutHTML = aboutEntries.length > 0
    ? `<div class="section-card anim">
        <h3 class="section-label"><span class="label-bar"></span> About Me</h3>
        ${aboutEntries.map((a: any) => `<p class="text-body">${esc(a.description)}</p>`).join('')}
      </div>`
    : '';

  // Experience — Timeline
  const expHTML = experienceEntries.length > 0
    ? `<div class="section-card anim">
        <h3 class="section-label"><span class="label-bar"></span> Experience</h3>
        <div class="timeline">
          ${experienceEntries.map((e: any, idx: number) => {
            const dur = e.duration || formatYearRange(e.startYear, e.endYear);
            return `
            <div class="tl-item${idx === experienceEntries.length - 1 ? ' tl-last' : ''}">
              <div class="tl-dot"></div>
              <div class="tl-content">
                <div class="entry-header">
                  <div>
                    <h4 class="entry-title">${esc(e.role)}</h4>
                    <p class="entry-sub">${esc(e.company)}</p>
                  </div>
                  ${dur ? `<span class="entry-pill">${esc(dur)}</span>` : ''}
                </div>
                ${e.description ? `<p class="text-xs" style="color:#64748b;margin-top:6px;line-height:1.6;">${esc(e.description)}</p>` : ''}
                ${buildEntryAssetsHTML(e.assets, accent, accentLight, accentMid)}
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>`
    : '';

  // Education — Timeline
  const eduHTML = educationEntries.length > 0
    ? `<div class="section-card anim">
        <h3 class="section-label"><span class="label-bar"></span> Education</h3>
        <div class="timeline">
          ${educationEntries.map((e: any, idx: number) => {
            const dur = e.year || formatYearRange(e.startYear, e.endYear);
            return `
            <div class="tl-item${idx === educationEntries.length - 1 ? ' tl-last' : ''}">
              <div class="tl-dot"></div>
              <div class="tl-content">
                <div class="entry-header">
                  <div>
                    <h4 class="entry-title">${esc(e.degree)}</h4>
                    <p class="entry-sub">${esc(e.institution || (e as any).school || '')}</p>
                    ${e.grade ? `<span style="font-size:10px;font-weight:700;color:${accent};display:block;margin-top:3px;">Grade: ${esc(e.grade)}</span>` : ''}
                  </div>
                  ${dur ? `<span class="entry-pill">${esc(dur)}</span>` : ''}
                </div>
                ${buildEntryAssetsHTML(e.assets, accent, accentLight, accentMid)}
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>`
    : '';

  // Projects
  const projHTML = projectEntries.length > 0
    ? `<div class="section-card anim">
        <h3 class="section-label"><span class="label-bar"></span> Projects</h3>
        <div class="projects-grid">
          ${projectEntries.map((p: any) => {
            const linkButtonHTML = p.link ? `
              <a href="${esc(p.link)}" target="_blank" style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;background:rgba(255,255,255,0.25);border:1px solid rgba(255,255,255,0.1);border-radius:12px;font-size:10px;font-weight:700;color:#ffffff;text-decoration:none;backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>
                Visit Link
              </a>` : '';

            const featured = buildFeaturedCardHTML(p.title, '', '', p.description || '', p.assets, linkButtonHTML, accent);
            if (featured) return featured;

            return `
              <div class="project-card" style="display:flex;flex-direction:column;justify-content:between;">
                <div>
                  <h4 class="entry-title">${esc(p.title)}</h4>
                  ${p.description ? `<p class="text-xs" style="color:#64748b;margin-top:6px;line-height:1.6;">${esc(p.description)}</p>` : ''}
                  ${p.tech ? `<p style="font-size:10px;color:#94a3b8;margin-top:8px;font-weight:600;">${esc(p.tech)}</p>` : ''}
                  ${buildEntryAssetsHTML(p.assets, accent, accentLight, accentMid)}
                </div>
                ${p.link ? `
                  <div style="margin-top:14px;padding-top:10px;border-top:1px solid #f1f5f9;">
                    <a href="${esc(p.link)}" target="_blank" style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border:1px solid ${accentMid};border-radius:12px;font-size:11px;font-weight:700;color:${accent};background:${accentLight};text-decoration:none;width:100%;justify-content:center;">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${accent}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>
                      Visit Link
                    </a>
                  </div>` : ''}
              </div>`;
          }).join('')}
        </div>
      </div>`
    : '';

  // Certificates
  const certHTML = certEntries.length > 0
    ? `<div class="section-card anim">
        <h3 class="section-label">🏅 Certifications</h3>
        ${certEntries.map((c: any) => {
          const featured = buildFeaturedCardHTML(c.title || c.name, c.issuer, c.date, '', c.assets, '', accent);
          if (featured) return featured;

          return `
            <div class="cert-item" style="display:block;">
              <div style="display:flex;justify-content:between;align-items:start;">
                <div>
                  <h4 class="entry-title">${esc(c.title || c.name)}</h4>
                  <p class="entry-sub">${esc(c.issuer || c.organization || '')}</p>
                </div>
                ${c.date ? `<span style="font-size:10px;font-weight:600;color:${accent};">${esc(c.date)}</span>` : ''}
              </div>
              ${buildEntryAssetsHTML(c.assets, accent, accentLight, accentMid)}
            </div>`;
        }).join('')}
      </div>`
    : '';

  // Achievements
  const achieveHTML = achieveEntries.length > 0
    ? `<div class="section-card anim">
        <h3 class="section-label">✨ Achievements</h3>
        ${achieveEntries.map((a: any) => {
          const featured = buildFeaturedCardHTML(a.title, a.organization, a.date, '', a.assets, '', accent);
          if (featured) return featured;

          return `
            <div class="cert-item" style="display:block;">
              <div style="display:flex;justify-content:between;align-items:start;">
                <div>
                  <h4 class="entry-title">${esc(a.title)}</h4>
                  <p class="entry-sub">${esc(a.organization || '')}</p>
                </div>
                ${a.date ? `<span style="font-size:10px;font-weight:600;color:${accent};">${esc(a.date)}</span>` : ''}
              </div>
              ${buildEntryAssetsHTML(a.assets, accent, accentLight, accentMid)}
            </div>`;
        }).join('')}
      </div>`
    : '';

  // Contact bar
  const contactParts: string[] = [];
  if (email) contactParts.push(`<a href="mailto:${email}" class="contact-item"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${accent}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg> ${email}</a>`);
  if (phone) contactParts.push(`<span class="contact-item"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${accent}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg> ${phone}</span>`);
  if (linkedin) {
    const clean = linkedin.replace(/^https?:\/\/(www\.)?linkedin\.com\/in\//i, '').replace(/\/$/, '');
    contactParts.push(`<a href="https://linkedin.com/in/${esc(clean)}" target="_blank" class="contact-item"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${accent}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect width="4" height="12" x="2" y="9"/><circle cx="4" cy="4" r="2"/></svg> ${esc(clean)}</a>`);
  }
  if (github) {
    const clean = github.replace(/^https?:\/\/(www\.)?github\.com\//i, '').replace(/\/$/, '');
    contactParts.push(`<a href="https://github.com/${esc(clean)}" target="_blank" class="contact-item"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${accent}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/><path d="M9 18c-4.51 2-5-2-7-2"/></svg> ${esc(clean)}</a>`);
  }
  const contactBar = contactParts.length > 0
    ? `<div class="contact-bar anim">${contactParts.join('')}</div>`
    : '';

  const shareTitle = `${name || handleStr} — Portfolio on BEXO`;
  const aboutBlurb = aboutEntries
    .map((a: any) => a.description || '')
    .filter(Boolean)
    .join(' ')
    .slice(0, 160);
  const shareDesc = esc(headline || bio || aboutBlurb || `${name}'s professional portfolio on BEXO`);
  const shareImage = photoUrl?.startsWith('http')
    ? esc(photoUrl)
    : 'https://mybexo.cyou/og-portfolio.jpg';
  const shareUrl = `https://${handleStr}.mybexo.cyou`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(shareTitle)}</title>
  <meta name="description" content="${shareDesc}" />
  <meta property="og:site_name" content="BEXO" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${esc(shareTitle)}" />
  <meta property="og:description" content="${shareDesc}" />
  <meta property="og:url" content="${shareUrl}" />
  <meta property="og:image" content="${shareImage}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${esc(shareTitle)}" />
  <meta name="twitter:description" content="${shareDesc}" />
  <meta name="twitter:image" content="${shareImage}" />
  <link rel="canonical" href="${shareUrl}" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Outfit:wght@600;700;800&display=swap" rel="stylesheet" />
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    ${bgStyle === 'dots' ? `
    body {
      font-family: 'Inter', -apple-system, sans-serif;
      background: #f8fafc;
      color: #334155;
      -webkit-font-smoothing: antialiased;
      min-height: 100vh;
    }
    body::before {
      content: ''; position: fixed; inset: 0; pointer-events: none; z-index: 0;
      background-image: radial-gradient(#e2e8f0 1.5px, transparent 1.5px);
      background-size: 24px 24px;
    }
    body::after {
      content: ''; position: fixed; width: 320px; height: 320px; border-radius: 50%;
      background: ${accent}12; filter: blur(80px); top: 10%; right: 10%; z-index: -1;
      pointer-events: none;
    }
    .wrapper::before {
      content: ''; position: fixed; width: 420px; height: 420px; border-radius: 50%;
      background: ${accent}08; filter: blur(100px); bottom: 10%; left: -10%; z-index: -1;
      pointer-events: none;
    }
    ` : bgStyle === 'waves' ? `
    body {
      font-family: 'Inter', -apple-system, sans-serif;
      background: #f8fafc;
      color: #334155;
      -webkit-font-smoothing: antialiased;
      min-height: 100vh;
      overflow-x: hidden;
    }
    body::before {
      content: ''; position: fixed; inset: 0; pointer-events: none; z-index: 0;
      background-image: 
        radial-gradient(at 0% 0%, ${accentLight} 0px, transparent 50%),
        radial-gradient(at 50% 0%, ${accentLight} 0px, transparent 50%),
        radial-gradient(at 100% 100%, ${accentLight} 0px, transparent 50%);
      background-size: 100% 100%;
      filter: saturate(1.2);
    }
    body::after {
      content: ''; position: fixed; bottom: 0; left: 0; right: 0; height: 40vh;
      background: linear-gradient(180deg, transparent, ${accent}08);
      clip-path: ellipse(80% 50% at 50% 100%);
      z-index: -1;
      pointer-events: none;
    }
    ` : bgStyle === 'solid' ? `
    body {
      font-family: 'Inter', -apple-system, sans-serif;
      background: linear-gradient(135deg, ${accent}08 0%, ${accent}18 50%, ${accent}12 100%);
      color: #334155;
      -webkit-font-smoothing: antialiased;
      min-height: 100vh;
    }
    body::before {
      content: ''; position: fixed; inset: 0; pointer-events: none; z-index: 0;
      background-image: 
        radial-gradient(circle at 20% 30%, ${accent}0c 0%, transparent 40%),
        radial-gradient(circle at 80% 70%, ${accent}12 0%, transparent 40%);
    }
    ` : `
    body {
      font-family: 'Inter', -apple-system, sans-serif;
      background: linear-gradient(135deg, #f8fafc 0%, ${accentLight} 30%, #f1f5f9 60%, ${accentLight} 100%);
      color: #334155;
      -webkit-font-smoothing: antialiased;
      min-height: 100vh;
    }
    body::before {
      content: ''; position: fixed; inset: 0; pointer-events: none; z-index: 0;
      background: linear-gradient(to right, #8080800a 1px, transparent 1px), linear-gradient(to bottom, #8080800a 1px, transparent 1px);
      background-size: 14px 24px;
    }
    `}
    /* Accent top bar */
    .accent-bar {
      height: 6px; width: 100%; position: sticky; top: 0; z-index: 50;
      background: linear-gradient(90deg, ${accent}, ${accent}88, ${accent});
    }
    .wrapper { max-width: 720px; margin: 0 auto; padding: 48px 16px 60px; position: relative; z-index: 1; }

    /* ─── HERO CARD ─── */
    .hero-card {
      text-align: center; padding: 32px; border-radius: 24px;
      background: linear-gradient(135deg, ${accentLight} 0%, rgba(248,250,252,0.5) 50%, ${accentLight} 100%);
      border: 1px solid ${accentMid};
      margin-bottom: 24px;
      display: flex; flex-direction: column; align-items: center; gap: 24px;
    }
    @media (min-width: 576px) {
      .hero-card {
        flex-direction: row; text-align: left; align-items: flex-start; gap: 32px; padding: 40px;
      }
    }
    .avatar-square-glow {
      position: relative; display: inline-block; flex-shrink: 0;
    }
    .avatar-square-glow::after {
      content: ''; position: absolute; inset: -3px; border-radius: 19px;
      background: linear-gradient(135deg, ${accent}, ${accent}40, ${accent});
      z-index: -1; opacity: 0.8;
    }
    .avatar {
      width: 128px; height: 128px; border-radius: 16px;
      overflow: hidden; border: 3px solid #fff;
      display: flex; align-items: center; justify-content: center;
      background: #f1f5f9; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
    }
    @media (min-width: 576px) {
      .avatar { width: 144px; height: 144px; }
    }
    .hero-content { flex: 1; display: flex; flex-direction: column; gap: 14px; }
    .name-badge-row { display: flex; flex-direction: column; align-items: center; gap: 8px; }
    @media (min-width: 576px) {
      .name-badge-row { flex-direction: row; align-items: center; gap: 12px; }
    }
    .name { font-family:'Outfit',sans-serif; font-size: 2.2rem; font-weight: 800; color: #0f172a; letter-spacing:-0.5px; line-height: 1.2; text-align: center; }
    @media (min-width: 576px) {
      .name { text-align: left; }
    }
    .headline { font-size: 1rem; font-weight: 600; color: #475569; margin-top: 2px; }
    .open-badge {
      display: inline-flex; align-items: center; gap: 6px;
      font-size: 10px; font-weight: 700; color: #15803d;
      background: #f0fdf4; border: 1px solid rgba(187,247,208,0.6); border-radius: 99px;
      padding: 3px 10px; max-width: fit-content;
    }
    .open-dot { width: 8px; height: 8px; border-radius:50%; background:#22c55e; animation: pulse 2s infinite; }
    @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
    .bio { font-size: 0.875rem; color: #64748b; line-height: 1.7; }
    .hero-actions { display:flex; gap:12px; justify-content:center; flex-wrap:wrap; }
    @media (min-width: 576px) {
      .hero-actions { justify-content: flex-start; }
    }
    .btn-resume {
      display: inline-flex; align-items: center; gap: 6px;
      font-size: 12px; font-weight: 700; color: ${accent};
      text-decoration: none; padding: 10px 20px; border-radius: 12px;
      border: 1px solid ${accentMid}; background: ${accentLight};
      transition: all 0.2s ease;
    }
    .btn-resume:hover { box-shadow: 0 2px 8px ${accent}22; }
    .btn-hire {
      display: inline-flex; align-items: center; gap: 6px;
      font-size: 12px; font-weight: 700; color: #fff;
      background: ${accent}; border-radius: 12px; padding: 10px 20px;
      text-decoration: none; box-shadow: 0 4px 14px ${accent}44;
      transition: all 0.2s ease;
    }
    .btn-hire:hover { filter: brightness(1.1); box-shadow: 0 6px 20px ${accent}55; }

    /* ─── CONTACT BAR ─── */
    .contact-bar {
      display: flex; flex-wrap: wrap; justify-content: center; gap: 16px;
      font-size: 12px; color: #64748b;
      padding: 16px 24px; border-radius: 16px;
      background: rgba(248,250,252,0.7); border: 1px solid rgba(226,232,240,0.5);
      margin-bottom: 24px;
    }
    .contact-item { color: #64748b; text-decoration: none; display:flex; align-items:center; gap:6px; font-weight: 500; transition: color 0.2s; }
    .contact-item:hover { color: #0f172a; }

    /* ─── SECTION CARDS (Glassmorphism) ─── */
    .section-card {
      background: rgba(255,255,255,0.75);
      backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
      border: 1px solid rgba(226,232,240,0.7);
      border-radius: 20px; padding: 28px 28px 24px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.02);
      margin-bottom: 20px;
      transition: box-shadow 0.3s ease;
    }
    .section-card:hover {
      box-shadow: 0 2px 8px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.04);
    }
    .section-label {
      font-size: 11px; font-weight: 700; color: ${accent};
      text-transform: uppercase; letter-spacing: 1.5px;
      margin-bottom: 16px; display: flex; align-items: center; gap: 8px;
    }
    .label-bar { display: inline-block; width: 4px; height: 16px; border-radius: 99px; background: ${accent}; }

    /* ─── TIMELINE ─── */
    .timeline { position: relative; padding-left: 20px; border-left: 2px solid ${accentLight}; }
    .tl-item { position: relative; padding-bottom: 24px; }
    .tl-item.tl-last { padding-bottom: 0; }
    .tl-dot {
      width: 10px; height: 10px; border-radius: 50%;
      background: ${accent}; box-shadow: 0 0 0 4px ${accentLight};
      position: absolute; left: -26px; top: 6px; z-index: 2;
    }
    .tl-content { margin-left: 4px; }

    /* ─── ENTRIES ─── */
    .entry-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
    .entry-title { font-size: 13px; font-weight: 700; color: #0f172a; }
    .entry-sub { font-size: 11px; font-weight: 600; color: #64748b; margin-top: 2px; }
    .entry-pill {
      font-size: 10px; font-weight: 700; color: ${accent};
      background: ${accentLight}; padding: 3px 10px; border-radius: 99px;
      white-space: nowrap; flex-shrink: 0;
    }
    .text-body { font-size: 13.5px; color: #475569; line-height: 1.75; }
    .text-xs { font-size: 12px; }

    /* ─── PROJECTS GRID ─── */
    .projects-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px,1fr)); gap: 14px; }
    .project-card {
      background: rgba(248,250,252,0.8); border: 1px solid rgba(226,232,240,0.8);
      border-radius: 16px; padding: 20px;
      transition: all 0.3s ease;
    }
    .project-card:hover { transform: translateY(-2px); box-shadow: 0 4px 14px rgba(0,0,0,0.06); border-color: ${accentMid}; }

    /* ─── CERT / ACHIEVE ITEMS ─── */
    .cert-item {
      display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;
      padding: 10px 0; border-bottom: 1px solid #f1f5f9;
    }
    .cert-item:last-child { border-bottom: none; padding-bottom: 0; }

    /* ─── ANIMATION ─── */
    .anim { opacity: 0; transform: translateY(18px); transition: opacity 0.55s cubic-bezier(0.22,1,0.36,1), transform 0.55s cubic-bezier(0.22,1,0.36,1); }
    .anim.visible { opacity: 1 !important; transform: translateY(0) !important; }

    /* ─── WATERMARK ─── */
    .watermark {
      text-align: center; margin-top: 40px; padding-top: 24px;
      border-top: 1px solid rgba(226,232,240,0.6); font-size: 11px; color: #94a3b8;
    }
    .watermark a { color: ${accent}; font-weight: 700; text-decoration: none; }
    .watermark strong { font-weight: 700; color: ${accent}; text-transform: uppercase; letter-spacing: 0.5px; }
  </style>
</head>
<body>
  <div class="accent-bar"></div>
  <div class="wrapper">
    <!-- Hero Card -->
    <div class="hero-card anim">
      <div class="avatar-square-glow"><div class="avatar">${photoSection}</div></div>
      <div class="hero-content">
        <div style="display:flex;flex-direction:column;gap:4px;">
          <div class="name-badge-row">
            <h1 class="name">${name}</h1>
            ${openToHire ? `<span class="open-badge"><span class="open-dot"></span>Available for Hire</span>` : ''}
          </div>
          ${headline ? `<p class="headline">${headline}</p>` : ''}
        </div>
        ${bio ? `<p class="bio">${bio}</p>` : ''}
        <div class="hero-actions">
          ${resumeUrl ? `<a href="${resumeUrl}" target="_blank" class="btn-resume">📄 View Resume</a>` : ''}
          ${openToHire && email ? `<a href="mailto:${email}?subject=Hiring inquiry for ${name}" class="btn-hire">✉ Hire Me</a>` : ''}
        </div>
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
      Powered by <a href="https://mybexo.cyou" target="_blank">mybexo.cyou</a>
      &nbsp;·&nbsp; <strong>mybexo.cyou/${handleStr}</strong>
    </div>
  </div>

  <script>
    // Fade-in on scroll
    const obs = new IntersectionObserver((entries) => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target); } });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
    document.querySelectorAll('.anim').forEach(el => obs.observe(el));
  </script>
</body>
</html>`;
}
