import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const generateInvoicePDF = async (
  userName: string, 
  plan: string, 
  amount: number, 
  transactionId: string
): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 40, size: 'A4' });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // 1. Load Bexo Logo from workspace
      let logoBuffer: Buffer | null = null;
      try {
        const logoPath = path.resolve(__dirname, "../../../bexo-web/src/assets/bexo-logo.png");
        if (fs.existsSync(logoPath)) {
          logoBuffer = fs.readFileSync(logoPath);
        }
      } catch (e) {
        console.error("Failed to load local logo for PDF:", e);
      }

      // Colors
      const primaryColor = '#4f46e5'; // Indigo
      const darkSlate = '#0f172a';    // Slate-900
      const textSlate = '#475569';    // Slate-600
      const lightSlate = '#64748b';   // Slate-500
      const borderColor = '#e2e8f0';  // Slate-200
      const tableHeaderBg = '#1e293b';// Slate-800

      // Financial calculations (18% GST inclusive)
      let displayPlanName = "";
      let basePrice = 0;
      let gstPrice = 0;
      let totalPrice = amount;
      let discountPrice = 0;
      let displaySubtotal = 0;

      if (plan === 'activation_code') {
        displayPlanName = 'Bexo Pro - Onboarding Activation';
        // Mock a standard annual plan value of 999 with 100% discount
        const originalValue = 999;
        basePrice = originalValue / 1.18;
        gstPrice = originalValue - basePrice;
        displaySubtotal = originalValue;
        discountPrice = originalValue;
        totalPrice = 0;
      } else {
        displayPlanName = plan === 'annual' 
          ? 'Bexo Pro - Annual Subscription' 
          : 'Bexo Pro - Lifetime Access';
        basePrice = totalPrice / 1.18;
        gstPrice = totalPrice - basePrice;
        displaySubtotal = totalPrice;
      }

      // --- HEADER SECTION ---
      
      // Top colored accent bar
      doc.rect(0, 0, 595, 12).fill(primaryColor);

      // Logo Left
      if (logoBuffer) {
        doc.image(logoBuffer, 40, 35, { width: 55 });
      }

      // BEXO Branding (under logo)
      doc.fontSize(16).font('Helvetica-Bold').fillColor(primaryColor).text('BEXO', 40, 95);

      // Company Info (Ace Digital) Left
      doc.fontSize(12).font('Helvetica-Bold').fillColor(darkSlate).text('ACE DIGITAL PRIVATE LIMITED', 40, 125);
      doc.fontSize(7.5).font('Helvetica-Bold').fillColor(lightSlate).text('SOFTWARE  .  DIGITAL STRATEGY  .  TECHNOLOGY CONSULTING', 40, 140);
      doc.fontSize(8.5).font('Helvetica').fillColor(textSlate);
      doc.text('Coimbatore, Tamil Nadu, India', 40, 155);
      doc.text('+91 90871 72072  |  info@acedigital.cc', 40, 168);
      doc.font('Helvetica-Bold').text('GSTIN: 33AAAAA0000A1Z5 (sample)', 40, 181);

      // Document Title & Metadata Right
      doc.fontSize(20).font('Helvetica-Bold').fillColor(primaryColor).text('TAX INVOICE', 350, 35, { align: 'right', width: 205 });
      
      doc.fontSize(9.5).font('Helvetica').fillColor(lightSlate).text('Invoice No:', 350, 65, { width: 90, align: 'right' });
      doc.font('Helvetica-Bold').fillColor(darkSlate).text(`AD/BEXO/2026/INV-${transactionId.slice(-8).toUpperCase()}`, 445, 65, { width: 110, align: 'right' });
      
      doc.font('Helvetica').fillColor(lightSlate).text('Date:', 350, 80, { width: 90, align: 'right' });
      doc.font('Helvetica-Bold').fillColor(darkSlate).text(new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }), 445, 80, { width: 110, align: 'right' });

      doc.font('Helvetica').fillColor(lightSlate).text('Payment Status:', 350, 95, { width: 90, align: 'right' });
      doc.font('Helvetica-Bold').fillColor('#16a34a').text('PAID', 445, 95, { width: 110, align: 'right' });

      // Horizontal Divider
      doc.moveTo(40, 205).lineTo(555, 205).lineWidth(1).strokeColor(borderColor).stroke();

      // --- BILLING / CUSTOMER INFO SECTION ---
      
      doc.fontSize(8.5).font('Helvetica-Bold').fillColor(lightSlate).text('PREPARED FOR', 40, 220);
      doc.fontSize(11).font('Helvetica-Bold').fillColor(darkSlate).text(userName, 40, 235);
      doc.fontSize(9).font('Helvetica').fillColor(textSlate).text(`Customer Ref: ${transactionId.slice(0, 8).toUpperCase()}`, 40, 250);

      doc.fontSize(8.5).font('Helvetica-Bold').fillColor(lightSlate).text('PRODUCT / PLAN', 350, 220, { align: 'right', width: 205 });
      doc.fontSize(11).font('Helvetica-Bold').fillColor(darkSlate).text('Bexo Pro Access', 350, 235, { align: 'right', width: 205 });
      doc.fontSize(9).font('Helvetica').fillColor(textSlate).text(plan === 'lifetime' ? 'Lifetime Membership' : 'Annual Plan', 350, 250, { align: 'right', width: 205 });

      // --- TABLE ITEMS ---
      
      const tableTop = 285;
      
      // Table Header Background
      doc.rect(40, tableTop, 515, 24).fill(tableHeaderBg);
      
      doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#ffffff');
      doc.text('#', 50, tableTop + 8);
      doc.text('DESCRIPTION', 80, tableTop + 8);
      doc.text('AMOUNT (INR)', 480, tableTop + 8, { width: 70, align: 'right' });

      // Table Row
      const rowTop = tableTop + 24;
      doc.rect(40, rowTop, 515, 50).fill('#f8fafc');
      
      doc.fontSize(9.5).font('Helvetica-Bold').fillColor(darkSlate).text('1', 50, rowTop + 12);
      doc.text(displayPlanName, 80, rowTop + 12);
      doc.fontSize(8.5).font('Helvetica').fillColor(textSlate).text(
        'Full access to all premium ATS portfolio templates, automated AI resume parsing engine, custom portfolio handles, supporting material uploads, and unlimited cloud hosting bandwidth.',
        80, rowTop + 26, { width: 380, lineGap: 2 }
      );
      
      doc.fontSize(9.5).font('Helvetica-Bold').fillColor(darkSlate).text(
        `Rs. ${displaySubtotal.toFixed(2)}`, 480, rowTop + 12, { width: 70, align: 'right' }
      );

      // Table Bottom Border
      doc.moveTo(40, rowTop + 50).lineTo(555, rowTop + 50).lineWidth(1).strokeColor(borderColor).stroke();

      // --- TOTALS AREA ---
      
      const totalsTop = rowTop + 65;
      
      doc.fontSize(9).font('Helvetica').fillColor(lightSlate).text('Subtotal', 350, totalsTop, { width: 110, align: 'right' });
      doc.font('Helvetica-Bold').fillColor(darkSlate).text(`Rs. ${basePrice.toFixed(2)}`, 470, totalsTop, { width: 85, align: 'right' });

      doc.font('Helvetica').fillColor(lightSlate).text('GST @ 18%', 350, totalsTop + 15, { width: 110, align: 'right' });
      doc.font('Helvetica-Bold').fillColor(darkSlate).text(`Rs. ${gstPrice.toFixed(2)}`, 470, totalsTop + 15, { width: 85, align: 'right' });

      if (discountPrice > 0) {
        doc.font('Helvetica').fillColor('#ef4444').text('Discount (100% Promo)', 350, totalsTop + 30, { width: 110, align: 'right' });
        doc.font('Helvetica-Bold').fillColor('#ef4444').text(`-Rs. ${discountPrice.toFixed(2)}`, 470, totalsTop + 30, { width: 85, align: 'right' });
      }

      const finalTotalY = totalsTop + (discountPrice > 0 ? 48 : 33);
      
      // Divider for total
      doc.moveTo(350, finalTotalY - 5).lineTo(555, finalTotalY - 5).lineWidth(0.8).strokeColor(borderColor).stroke();
      
      doc.fontSize(11).font('Helvetica-Bold').fillColor(primaryColor).text('Total Paid (INR)', 320, finalTotalY + 3, { width: 140, align: 'right' });
      doc.fontSize(12).font('Helvetica-Bold').fillColor(primaryColor).text(`Rs. ${totalPrice.toFixed(2)}`, 470, finalTotalY + 2, { width: 85, align: 'right' });

      // Note Box
      doc.rect(40, totalsTop + 10, 240, 50).fill('#eef2ff').strokeColor('#c7d2fe').lineWidth(0.5).stroke();
      doc.fontSize(7.5).font('Helvetica-Oblique').fillColor(primaryColor).text(
        'Note: First-year recurring platform costs are fully covered in this plan. Future renewals will follow the standard plan renewal pricing terms.',
        48, totalsTop + 16, { width: 224, lineGap: 1.5 }
      );

      // --- TERMS & CONDITIONS SECTION ---
      
      const termsTop = finalTotalY + 45;
      
      doc.fontSize(9.5).font('Helvetica-Bold').fillColor(darkSlate).text('Terms & Conditions', 40, termsTop);
      
      const terms = [
        'This Tax Invoice is issued by Ace Digital Private Limited, the parent company and operator of Bexo portfolio builder application services.',
        'This is a computer-generated invoice and does not require a physical signature or stamp to be legally valid.',
        'All purchases are subject to the standard Bexo Refund Policy and Terms of Service. Future renewals will automatically recur unless cancelled.',
        'For payment, billing, or invoices queries, please reach out directly to billing@mybexo.com or info@acedigital.cc.'
      ];

      doc.fontSize(7.5).font('Helvetica').fillColor(textSlate);
      terms.forEach((term, index) => {
        const yPos = termsTop + 16 + (index * 14);
        doc.text(`${index + 1}. ${term}`, 40, yPos, { width: 515 });
      });

      // --- SIGNATURES ---
      
      const signatureTop = termsTop + 85;
      
      doc.moveTo(40, signatureTop).lineTo(220, signatureTop).lineWidth(0.8).strokeColor(borderColor).stroke();
      doc.fontSize(8).font('Helvetica-Bold').fillColor(lightSlate).text('FOR ACE DIGITAL PRIVATE LIMITED', 40, signatureTop + 6);
      doc.font('Helvetica').fillColor(textSlate).text('Authorized Signatory', 40, signatureTop + 17);

      doc.moveTo(375, signatureTop).lineTo(555, signatureTop).stroke();
      doc.font('Helvetica-Bold').fillColor(lightSlate).text('ACCEPTED BY CUSTOMER', 375, signatureTop + 6);
      doc.font('Helvetica').fillColor(textSlate).text('E-Signed and Verified', 375, signatureTop + 17);

      // Footer
      doc.rect(0, 830, 595, 12).fill(primaryColor);

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};
