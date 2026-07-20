import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Format number with commas and 2 decimal places */
function fmtINR(n: number): string {
  return n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** Safely load an image buffer from the assets directory */
function loadAsset(filename: string): Buffer | null {
  try {
    const p = path.resolve(__dirname, '../assets/' + filename);
    if (fs.existsSync(p)) return fs.readFileSync(p);
  } catch { /* skip */ }
  return null;
}

export const generateInvoicePDF = async (
  userName: string,
  plan: string,
  amount: number,
  transactionId: string
): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 0, size: 'A4' });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // ═══════════════════════════════════════════
      // DESIGN TOKENS
      // ═══════════════════════════════════════════
      const navy     = '#1B1464';
      const indigo   = '#4F46E5';
      const ltIndigo = '#EEF2FF';
      const darkTxt  = '#1A1A1A';
      const grayTxt  = '#6B7280';
      const green    = '#16A34A';
      const coral    = '#E74C3C';
      const cardBg   = '#F8FAFC';
      const border   = '#E2E8F0';
      const white    = '#FFFFFF';
      const navyLt   = '#2D2580';

      const pw = 595, ph = 842;
      const ml = 45, mr = 550, cw = mr - ml;

      // ═══════════════════════════════════════════
      // LOAD ASSETS
      // ═══════════════════════════════════════════
      const bgImg       = loadAsset('invoice-background.png');
      const shieldIcon  = loadAsset('invoice-shield-icon.png');
      const calcIcon    = loadAsset('invoice-calculator-icon.png');
      let logoBuffer: Buffer | null = null;
      try {
        const lp = path.resolve(__dirname, '../../../bexo-web/src/assets/bexo-logo.png');
        if (fs.existsSync(lp)) logoBuffer = fs.readFileSync(lp);
      } catch { /* skip */ }

      // ═══════════════════════════════════════════
      // BACKGROUND IMAGE (full page)
      // ═══════════════════════════════════════════
      if (bgImg) {
        doc.image(bgImg, 0, 0, { width: pw, height: ph });
      } else {
        doc.rect(0, 0, pw, ph).fill(white);
      }

      // Left accent bar
      doc.rect(0, 0, 5, ph).fill(navy);

      // ═══════════════════════════════════════════
      // SECTION 1: HEADER — Logo + TAX INVOICE Badge
      // ═══════════════════════════════════════════
      if (logoBuffer) {
        doc.image(logoBuffer, ml, 30, { height: 28 });
      }
      doc.fontSize(20).font('Helvetica-Bold').fillColor(darkTxt)
        .text('BEXO', ml + (logoBuffer ? 36 : 0), 33);

      // "TAX INVOICE" outlined badge
      doc.roundedRect(428, 28, 120, 28, 5).lineWidth(1.5).strokeColor(indigo).stroke();
      doc.fontSize(10).font('Helvetica-Bold').fillColor(indigo)
        .text('TAX INVOICE', 428, 36, { width: 120, align: 'center' });

      // ═══════════════════════════════════════════
      // SECTION 2: COMPANY INFO + METADATA CARD
      // ═══════════════════════════════════════════
      doc.fontSize(14).font('Helvetica-Bold').fillColor(darkTxt)
        .text('ACE DIGITAL', ml, 72);
      doc.fontSize(6.5).font('Helvetica-Bold').fillColor(grayTxt)
        .text('SOFTWARE  \u00B7  DIGITAL STRATEGY  \u00B7  TECHNOLOGY CONSULTING', ml, 90, { characterSpacing: 1.2 });

      // Contact with bullet dots
      const cItems: [number, string, boolean][] = [
        [108, 'Coimbatore, Tamil Nadu, India', false],
        [121, '+91 90871 72072', false],
        [134, 'info@acedigital.cc', false],
        [147, 'GSTIN: 33AAAAA0000A1Z5 (sample)', true],
      ];
      cItems.forEach(([y, txt, bold]) => {
        doc.circle(ml + 3, y + 4, 2.5).fill(indigo);
        doc.fontSize(8.5).font(bold ? 'Helvetica-Bold' : 'Helvetica').fillColor(grayTxt)
          .text(txt, ml + 14, y);
      });

      // Invoice metadata
      const date = new Date();
      const yr = date.getFullYear().toString().slice(-2);
      const mo = (date.getMonth() + 1).toString().padStart(2, '0');
      const hash = transactionId.split('').reduce((a, c) => ((a * 31) + c.charCodeAt(0)) % 100000, 0);
      const seq = hash.toString().padStart(4, '0');
      const invoiceNo = `${yr}ACE_BXI${mo}${seq}`;

      // Semi-transparent card background for metadata
      doc.save();
      doc.roundedRect(356, 72, mr - 356, 92, 8).fill(white);
      doc.roundedRect(356, 72, mr - 356, 92, 8).lineWidth(0.5).strokeColor(border).stroke();
      doc.restore();

      const mL = 370, mV = mr - 12;
      doc.fontSize(8).font('Helvetica').fillColor(grayTxt).text('INVOICE NO.', mL, 90);
      doc.font('Helvetica-Bold').fillColor(darkTxt).text(invoiceNo, mL, 90, { width: mV - mL, align: 'right' });

      doc.font('Helvetica').fillColor(grayTxt).text('DATE', mL, 110);
      doc.font('Helvetica-Bold').fillColor(darkTxt)
        .text(date.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }), mL, 110, { width: mV - mL, align: 'right' });

      doc.font('Helvetica').fillColor(grayTxt).text('PAYMENT STATUS', mL, 130);
      doc.circle(mV - 34, 133, 7).fill(green);
      doc.fontSize(8).font('Helvetica-Bold').fillColor(green).text('PAID', mV - 23, 130);

      // ═══════════════════════════════════════════
      // COMPUTE PLAN DATA
      // ═══════════════════════════════════════════
      let displayPlanName = '', displayDesc = '';
      let basePrice = 0, gstPrice = 0, totalPrice = amount;
      let discountPrice = 0, displaySubtotal = 0;

      if (plan === 'activation_code') {
        displayPlanName = 'Bexo Pro \u2013 Onboarding Activation';
        displayDesc = 'Pre-paid Bexo Pro account activation via institutional or partner code. Includes unrestricted access to portfolio templates, automated AI parsing, and cloud hosting.';
        const ov = 999;
        basePrice = ov / 1.18; gstPrice = ov - basePrice;
        displaySubtotal = ov; discountPrice = ov; totalPrice = 0;
      } else if (plan === 'lifetime') {
        displayPlanName = 'Bexo Pro \u2013 Lifetime Subscription';
        displayDesc = 'Lifetime Subscription Plan \u2013 Unrestricted access to Bexo Pro services, premium ATS portfolio templates, AI parsing tools, and unlimited cloud hosting bandwidth with no recurring fees.';
        basePrice = totalPrice / 1.18; gstPrice = totalPrice - basePrice; displaySubtotal = totalPrice;
      } else {
        displayPlanName = 'Bexo Pro \u2013 Annual Subscription';
        displayDesc = 'Annual Subscription Plan \u2013 12 months access to Bexo Pro services, premium ATS portfolio templates, AI parsing tools, and cloud hosting bandwidth.';
        basePrice = totalPrice / 1.18; gstPrice = totalPrice - basePrice; displaySubtotal = totalPrice;
      }
      const custRef = plan === 'activation_code' ? 'ACT_CODE' : plan === 'lifetime' ? 'PAY_LIFE' : 'PAY_ANNU';

      // ═══════════════════════════════════════════
      // SECTION 3: BILL TO / PROJECT CARDS
      // ═══════════════════════════════════════════
      const cardY = 182, cardH = 58, halfW = (cw - 15) / 2;

      // Bill To
      doc.roundedRect(ml, cardY, halfW, cardH, 8).fill(white);
      doc.roundedRect(ml, cardY, halfW, cardH, 8).lineWidth(0.5).strokeColor(border).stroke();
      doc.circle(ml + 24, cardY + cardH / 2, 14).fill(ltIndigo);
      doc.fontSize(12).font('Helvetica-Bold').fillColor(indigo)
        .text('B', ml + 24 - 6, cardY + cardH / 2 - 7, { width: 12, align: 'center' });
      doc.fontSize(7).font('Helvetica-Bold').fillColor(indigo)
        .text('BILL TO', ml + 47, cardY + 12, { characterSpacing: 0.8 });
      doc.fontSize(11).font('Helvetica-Bold').fillColor(darkTxt).text(userName, ml + 47, cardY + 24);
      doc.fontSize(8).font('Helvetica').fillColor(grayTxt).text('Customer Ref: ' + custRef, ml + 47, cardY + 40);

      // Project
      const c2X = ml + halfW + 15;
      doc.roundedRect(c2X, cardY, halfW, cardH, 8).fill(white);
      doc.roundedRect(c2X, cardY, halfW, cardH, 8).lineWidth(0.5).strokeColor(border).stroke();
      doc.circle(c2X + 24, cardY + cardH / 2, 14).fill(ltIndigo);
      doc.fontSize(12).font('Helvetica-Bold').fillColor(indigo)
        .text('P', c2X + 24 - 6, cardY + cardH / 2 - 7, { width: 12, align: 'center' });
      doc.fontSize(7).font('Helvetica-Bold').fillColor(indigo)
        .text('PROJECT', c2X + 47, cardY + 12, { characterSpacing: 0.8 });
      doc.fontSize(11).font('Helvetica-Bold').fillColor(darkTxt).text('Bexo Pro Service', c2X + 47, cardY + 24);
      doc.fontSize(8).font('Helvetica').fillColor(grayTxt).text(displayPlanName, c2X + 47, cardY + 40);

      // ═══════════════════════════════════════════
      // SECTION 4: DARK NAVY BANNER
      // ═══════════════════════════════════════════
      const bnY = 256, bnH = 58;
      doc.roundedRect(ml, bnY, cw, bnH, 10).fill(navy);
      // Shield icon from asset (right side of banner)
      if (shieldIcon) {
        doc.image(shieldIcon, mr - 68, bnY + 2, { height: bnH - 4 });
      }
      doc.fontSize(9).font('Helvetica').fillColor('#9999BB').text('Tax Invoice for', ml + 20, bnY + 14);
      doc.fontSize(14).font('Helvetica-Bold').fillColor(white).text(displayPlanName, ml + 20, bnY + 30);

      // ═══════════════════════════════════════════
      // SECTION 5: TABLE
      // ═══════════════════════════════════════════
      const tY = bnY + bnH + 15;

      doc.roundedRect(ml, tY, cw, 22, 4).fill(navy);
      doc.fontSize(7.5).font('Helvetica-Bold').fillColor(white);
      doc.text('#', ml + 18, tY + 7);
      doc.text('DESCRIPTION', ml + 50, tY + 7, { characterSpacing: 1 });
      doc.text('AMOUNT (INR)', mr - 90, tY + 7, { width: 85, align: 'right', characterSpacing: 1 });

      // Row
      const rY = tY + 22;
      doc.roundedRect(ml, rY, cw, 80, 0).fill(white);
      doc.moveTo(ml, rY).lineTo(ml, rY + 80).lineWidth(0.5).strokeColor(border).stroke();
      doc.moveTo(mr, rY).lineTo(mr, rY + 80).lineWidth(0.5).strokeColor(border).stroke();
      doc.moveTo(ml, rY + 80).lineTo(mr, rY + 80).lineWidth(0.5).strokeColor(border).stroke();

      doc.fontSize(10).font('Helvetica-Bold').fillColor(darkTxt).text('1', ml + 18, rY + 14);
      doc.fontSize(10).font('Helvetica-Bold').fillColor(darkTxt).text(displayPlanName, ml + 50, rY + 14);
      doc.fontSize(8).font('Helvetica').fillColor(grayTxt)
        .text(displayDesc, ml + 50, rY + 30, { width: cw - 155, lineGap: 3 });
      doc.fontSize(10).font('Helvetica-Bold').fillColor(darkTxt)
        .text('Rs. ' + fmtINR(displaySubtotal), mr - 90, rY + 14, { width: 85, align: 'right' });

      // ═══════════════════════════════════════════
      // SECTION 6: THANK YOU CARD + TOTALS
      // ═══════════════════════════════════════════
      const ttY = rY + 95;

      // Thank you card
      doc.roundedRect(ml, ttY, 210, 60, 8).fill(white);
      doc.roundedRect(ml, ttY, 210, 60, 8).lineWidth(0.5).strokeColor(border).stroke();
      // Calculator icon from asset
      if (calcIcon) {
        doc.image(calcIcon, ml + 5, ttY + 5, { height: 50 });
      }
      doc.fontSize(8.5).font('Helvetica-Bold').fillColor(coral)
        .text('Thank you ', ml + 60, ttY + 14, { continued: true });
      doc.font('Helvetica').fillColor(darkTxt).text('for choosing Bexo!');
      doc.fontSize(8).font('Helvetica').fillColor(grayTxt)
        .text('Your payment has been\nreceived successfully.', ml + 60, ttY + 30, { lineGap: 2 });

      // Totals (right)
      const tRX = 350, tRW = mr - tRX - 5;

      doc.fontSize(9).font('Helvetica').fillColor(grayTxt).text('Subtotal', tRX, ttY + 8);
      doc.fontSize(9).font('Helvetica').fillColor(darkTxt).text('Rs. ' + fmtINR(basePrice), tRX, ttY + 8, { width: tRW, align: 'right' });

      doc.fontSize(9).font('Helvetica').fillColor(grayTxt).text('GST @ 18%', tRX, ttY + 25);
      doc.fontSize(9).font('Helvetica').fillColor(darkTxt).text('Rs. ' + fmtINR(gstPrice), tRX, ttY + 25, { width: tRW, align: 'right' });

      let dOff = 0;
      if (discountPrice > 0) {
        doc.fontSize(9).font('Helvetica').fillColor(coral).text('Discount (100% Promo)', tRX, ttY + 42);
        doc.fontSize(9).font('Helvetica').fillColor(coral).text('-Rs. ' + fmtINR(discountPrice), tRX, ttY + 42, { width: tRW, align: 'right' });
        dOff = 17;
      }

      doc.moveTo(tRX, ttY + 42 + dOff).lineTo(mr, ttY + 42 + dOff).lineWidth(1).strokeColor(border).stroke();
      doc.fontSize(10).font('Helvetica-Bold').fillColor(darkTxt).text('Total Paid (INR)', tRX, ttY + 50 + dOff);
      doc.fontSize(12).font('Helvetica-Bold').fillColor(coral).text('Rs. ' + fmtINR(totalPrice), tRX, ttY + 49 + dOff, { width: tRW, align: 'right' });

      // ═══════════════════════════════════════════
      // SECTION 7: DIVIDER
      // ═══════════════════════════════════════════
      const dY = ttY + 78 + dOff;
      doc.moveTo(ml, dY).lineTo(mr, dY).lineWidth(0.5).strokeColor(border).stroke();

      // ═══════════════════════════════════════════
      // SECTION 8: NOTE CARD
      // ═══════════════════════════════════════════
      const nY = dY + 12;
      doc.roundedRect(ml, nY, cw, 44, 8).fill(white);
      doc.roundedRect(ml, nY, cw, 44, 8).lineWidth(0.5).strokeColor(border).stroke();
      // Info icon circle
      doc.circle(ml + 24, nY + 22, 11).fill(indigo);
      doc.fontSize(10).font('Helvetica-Bold').fillColor(white)
        .text('i', ml + 24 - 5, nY + 17, { width: 10, align: 'center' });

      doc.fontSize(8).font('Helvetica-Bold').fillColor(darkTxt)
        .text('Note: ', ml + 45, nY + 12, { continued: true });
      doc.font('Helvetica').fillColor(grayTxt)
        .text('First-year recurring platform costs are fully covered in this plan. Future renewals will follow the standard plan renewal pricing terms.', { width: cw - 65, lineGap: 2.5 });

      // Decorative dots
      for (let i = 0; i < 5; i++) doc.circle(mr - 18 - (i * 8), nY + 36, 2).fill('#C7D2FE');

      // ═══════════════════════════════════════════
      // SECTION 9: TERMS & CONDITIONS + CGI CARD
      // ═══════════════════════════════════════════
      const tmY = nY + 62;
      doc.fontSize(10).font('Helvetica-Bold').fillColor(darkTxt).text('Terms & Conditions', ml, tmY);

      const terms = [
        'This Tax Invoice is issued by Ace Digital.\nBexo is a product of Ace Digital.',
        'All purchases are subject to the standard Bexo\nRefund Policy and Terms of Service.',
        'For payment, billing, or invoices queries, please\nreach out directly to billing@mybexo.com or\ninfo@acedigital.cc.'
      ];
      terms.forEach((t, i) => {
        const ty = tmY + 22 + (i * 34);
        doc.roundedRect(ml, ty, 20, 15, 4).fill(indigo);
        doc.fontSize(7.5).font('Helvetica-Bold').fillColor(white)
          .text(`0${i + 1}`, ml, ty + 4, { width: 20, align: 'center' });
        doc.fontSize(8).font('Helvetica').fillColor(grayTxt)
          .text(t, ml + 28, ty + 2, { width: 230, lineGap: 2 });
      });

      // Computer Generated Invoice Card (right) with shield icon
      const cgX = 315, cgY = tmY + 15;
      doc.roundedRect(cgX, cgY, mr - cgX, 100, 8).fill(white);
      doc.roundedRect(cgX, cgY, mr - cgX, 100, 8).lineWidth(0.5).strokeColor(border).stroke();

      // Use the shield icon asset
      if (shieldIcon) {
        doc.image(shieldIcon, cgX + 10, cgY + 18, { height: 65 });
      }

      doc.fontSize(10).font('Helvetica-Bold').fillColor(darkTxt)
        .text('Computer Generated Invoice', cgX + 80, cgY + 30);
      doc.fontSize(8).font('Helvetica').fillColor(grayTxt)
        .text('This is a computer generated invoice\nand does not require a signature.', cgX + 80, cgY + 48, { lineGap: 3 });

      // ═══════════════════════════════════════════
      // SECTION 10: FOOTER BAR
      // ═══════════════════════════════════════════
      const fY = ph - 32;
      doc.roundedRect(ml, fY, cw, 24, 5).fill(navy);

      doc.fontSize(7.5).font('Helvetica').fillColor('#9999BB')
        .text('Need help?', ml + 15, fY + 7, { continued: true });
      doc.fillColor(white).text('   billing@mybexo.com', { continued: true });
      doc.fillColor('#9999BB').text('   |   ', { continued: true });
      doc.fillColor(white).text('mybexo.com');

      doc.fontSize(8.5).font('Helvetica-Bold').fillColor(white)
        .text('Thank you!', mr - 80, fY + 7);

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};
