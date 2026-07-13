import PDFDocument from 'pdfkit';

export interface ResumeData {
  name: string;
  email?: string;
  phone?: string;
  linkedin?: string;
  github?: string;
  headline?: string;
  bio?: string;
  aboutEntries?: any[];
  educationEntries?: any[];
  experienceEntries?: any[];
  projectEntries?: any[];
  certificateEntries?: any[];
  achievementEntries?: any[];
  researchEntries?: any[];
}

export function generateATSResume(data: ResumeData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 40, bottom: 40, left: 40, right: 40 }
      });

      const buffers: Buffer[] = [];
      doc.on('data', (chunk) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', (err) => reject(err));

      // Colors
      const primaryColor = '#1e293b'; // Slate 800
      const secondaryColor = '#475569'; // Slate 600
      const accentColor = '#2563eb'; // Blue 600

      // Header section
      doc.fillColor(primaryColor)
         .font('Helvetica-Bold')
         .fontSize(22)
         .text(data.name, { align: 'center' });

      doc.moveDown(0.2);

      // Contact info line
      const contacts: string[] = [];
      if (data.email) contacts.push(data.email);
      if (data.phone) contacts.push(data.phone);
      if (data.linkedin) contacts.push(`linkedin.com/in/${data.linkedin}`);
      if (data.github) contacts.push(`github.com/${data.github}`);

      doc.font('Helvetica')
         .fontSize(9.5)
         .fillColor(secondaryColor)
         .text(contacts.join('   |   '), { align: 'center' });

      doc.moveDown(0.5);

      // Headline or summary
      const summary = data.headline || data.bio || (data.aboutEntries && data.aboutEntries[0]?.description);
      if (summary) {
        drawSectionHeader(doc, 'PROFESSIONAL SUMMARY', primaryColor);
        doc.font('Helvetica')
           .fontSize(9.5)
           .fillColor(primaryColor)
           .text(summary, { align: 'justify', lineGap: 3 });
        doc.moveDown(0.8);
      }

      // Work Experience
      if (data.experienceEntries && data.experienceEntries.length > 0) {
        drawSectionHeader(doc, 'WORK EXPERIENCE', primaryColor);
        data.experienceEntries.forEach((exp: any) => {
          const y = doc.y;
          doc.font('Helvetica-Bold')
             .fontSize(11)
             .fillColor(primaryColor);
          
          const roleAndCompany = `${exp.role}  -  ${exp.company}`;
          const duration = exp.duration || '';
          
          doc.text(roleAndCompany, 40, y);
          doc.font('Helvetica')
             .fontSize(10)
             .fillColor(secondaryColor)
             .text(duration, 40, y, { align: 'right' });

          if (exp.description) {
            doc.moveDown(0.2);
            doc.font('Helvetica')
               .fontSize(9.5)
               .fillColor(primaryColor)
               .text(exp.description, 45, doc.y, { align: 'justify', lineGap: 2 });
          }
          doc.moveDown(0.6);
        });
        doc.moveDown(0.2);
      }

      // Projects
      if (data.projectEntries && data.projectEntries.length > 0) {
        drawSectionHeader(doc, 'PROJECTS', primaryColor);
        data.projectEntries.forEach((proj: any) => {
          const y = doc.y;
          doc.font('Helvetica-Bold')
             .fontSize(11)
             .fillColor(primaryColor);
          
          doc.text(proj.title, 40, y);
          if (proj.link) {
            doc.font('Helvetica')
               .fontSize(9.5)
               .fillColor(accentColor)
               .text(proj.link, 40, y, { align: 'right' });
          }

          if (proj.description) {
            doc.moveDown(0.2);
            doc.font('Helvetica')
               .fontSize(9.5)
               .fillColor(primaryColor)
               .text(proj.description, 45, doc.y, { align: 'justify', lineGap: 2 });
          }
          doc.moveDown(0.6);
        });
        doc.moveDown(0.2);
      }

      // Education
      if (data.educationEntries && data.educationEntries.length > 0) {
        drawSectionHeader(doc, 'EDUCATION', primaryColor);
        data.educationEntries.forEach((edu: any) => {
          const y = doc.y;
          doc.font('Helvetica-Bold')
             .fontSize(11)
             .fillColor(primaryColor);
          
          const degreeSchool = `${edu.degree}  -  ${edu.school}`;
          const duration = edu.duration || '';
          
          doc.text(degreeSchool, 40, y);
          doc.font('Helvetica')
             .fontSize(10)
             .fillColor(secondaryColor)
             .text(duration, 40, y, { align: 'right' });

          if (edu.grade) {
            doc.moveDown(0.15);
            doc.font('Helvetica')
               .fontSize(9.5)
               .fillColor(secondaryColor)
               .text(`Grade / GPA: ${edu.grade}`, 45, doc.y);
          }
          doc.moveDown(0.6);
        });
        doc.moveDown(0.2);
      }

      // Certifications & Achievements
      const hasCerts = data.certificateEntries && data.certificateEntries.length > 0;
      const hasAchs = data.achievementEntries && data.achievementEntries.length > 0;
      if (hasCerts || hasAchs) {
        drawSectionHeader(doc, 'CERTIFICATIONS & ACHIEVEMENTS', primaryColor);
        
        if (hasCerts) {
          data.certificateEntries?.forEach((cert: any) => {
            doc.font('Helvetica-Bold')
               .fontSize(9.5)
               .fillColor(primaryColor)
               .text(`[Certification] ${cert.name}`, { continued: true })
               .font('Helvetica')
               .fillColor(secondaryColor)
               .text(`  |  Issued by: ${cert.issuer} ${cert.date ? `(${cert.date})` : ''}`);
            doc.moveDown(0.25);
          });
        }

        if (hasAchs) {
          data.achievementEntries?.forEach((ach: any) => {
            doc.font('Helvetica-Bold')
               .fontSize(9.5)
               .fillColor(primaryColor)
               .text(`[Achievement] ${ach.title}`, { continued: true })
               .font('Helvetica')
               .fillColor(secondaryColor)
               .text(`  |  ${ach.organization} ${ach.date ? `(${ach.date})` : ''}`);
            doc.moveDown(0.25);
          });
        }
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

function drawSectionHeader(doc: any, title: string, color: string) {
  doc.moveDown(0.4);
  const y = doc.y;
  doc.fillColor(color)
     .font('Helvetica-Bold')
     .fontSize(12)
     .text(title, 40, y);
  
  // Section underline rule
  doc.moveTo(40, y + 15)
     .lineTo(555, y + 15)
     .strokeColor('#cbd5e1') // Slate 200
     .lineWidth(1)
     .stroke();
  
  doc.moveDown(0.85);
}
