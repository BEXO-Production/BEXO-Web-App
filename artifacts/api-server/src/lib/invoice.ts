import PDFDocument from 'pdfkit';

export const generateInvoicePDF = async (userName: string, plan: string, amount: number, transactionId: string): Promise<Buffer> => {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Fetch the logo to embed it
      let logoBuffer: Buffer | null = null;
      try {
        const logoRes = await fetch('https://bexo-development.web.app/assets/bexo-logo-swtm9dI0.png');
        if (logoRes.ok) {
          const arrayBuffer = await logoRes.arrayBuffer();
          logoBuffer = Buffer.from(arrayBuffer);
        }
      } catch (e) {
        console.error("Failed to fetch logo for PDF", e);
      }

      // Company Info & Logo Area
      if (logoBuffer) {
        doc.image(logoBuffer, 50, 45, { width: 120 });
      } else {
        doc.fontSize(24).font('Helvetica-Bold').fillColor('#4f46e5').text('BEXO', 50, 50);
      }
      
      doc.fontSize(10).font('Helvetica').fillColor('#64748b').text('Bexo Inc.', 50, 95);
      doc.text('support@mybexo.com', 50, 110);
      doc.text('https://mybexo.com', 50, 125);

      // Invoice Header
      doc.fontSize(28).font('Helvetica-Bold').fillColor('#0f172a').text('INVOICE', 0, 50, { align: 'right', width: 545 });
      
      doc.fontSize(10).font('Helvetica').fillColor('#64748b').text('Invoice Date:', 350, 95, { width: 90, align: 'right' });
      doc.font('Helvetica-Bold').fillColor('#0f172a').text(new Date().toLocaleDateString(), 450, 95, { width: 95, align: 'right' });
      
      doc.font('Helvetica').fillColor('#64748b').text('Transaction ID:', 350, 110, { width: 90, align: 'right' });
      doc.font('Helvetica-Bold').fillColor('#0f172a').text(transactionId, 450, 110, { width: 95, align: 'right' });

      doc.moveTo(50, 150).lineTo(545, 150).lineWidth(1).strokeColor('#e2e8f0').stroke();

      // Billed To
      doc.fontSize(12).font('Helvetica-Bold').fillColor('#0f172a').text('Billed To:', 50, 170);
      doc.fontSize(10).font('Helvetica').fillColor('#334155').text(userName, 50, 185);

      // Table Header
      doc.rect(50, 230, 495, 30).fill('#f8fafc');
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#475569');
      doc.text('Description', 60, 240);
      doc.text('Amount', 0, 240, { align: 'right', width: 535 });

      // Table Row
      const planName = plan === 'annual' ? 'Bexo Pro - Annual Subscription' : plan === 'lifetime' ? 'Bexo Pro - Lifetime Access' : plan === 'activation_code' ? 'Bexo Pro - Activation Code' : 'Bexo Premium Access';
      
      doc.font('Helvetica').fillColor('#0f172a');
      doc.text(planName, 60, 280);
      doc.text(`INR ${amount.toFixed(2)}`, 0, 280, { align: 'right', width: 535 });
      
      doc.moveTo(50, 310).lineTo(545, 310).strokeColor('#e2e8f0').stroke();

      // Total
      doc.fontSize(12).font('Helvetica-Bold').text('Total Paid:', 350, 330, { align: 'right', width: 90 });
      doc.fontSize(14).fillColor('#4f46e5').text(`INR ${amount.toFixed(2)}`, 450, 328, { align: 'right', width: 95 });

      // Footer
      doc.fontSize(10).font('Helvetica').fillColor('#94a3b8').text('Thank you for choosing Bexo!', 50, 700, { align: 'center', width: 495 });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};
