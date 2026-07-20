const LOGO_URL = "https://bexo-development.web.app/assets/bexo-logo-swtm9dI0.png"; // Live logo from build output
const BRAND_GRADIENT = "linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)";
const BRAND_COLOR = "#4f46e5";

const wrapHtml = (title: string, content: string) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <!-- Import Outfit and Inter fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Outfit:wght@500;700;800&display=swap" rel="stylesheet">
  <style>
    /* Reset and base styles */
    body {
      margin: 0;
      padding: 0;
      background-color: #f1f5f9;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }
    .wrapper {
      width: 100%;
      table-layout: fixed;
      background-color: #f1f5f9;
      padding: 40px 0;
    }
    .main-table {
      width: 100%;
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 24px;
      overflow: hidden;
      box-shadow: 0 20px 40px -10px rgba(0, 0, 0, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.5);
    }
    /* Typography */
    h1, h2, h3 {
      font-family: 'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #0f172a;
      margin-top: 0;
    }
    p, td, span, div {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #334155;
    }
    /* Header */
    .header {
      background: ${BRAND_GRADIENT};
      padding: 40px 30px;
      text-align: center;
      position: relative;
      background-image: url('https://www.transparenttextures.com/patterns/cubes.png'), ${BRAND_GRADIENT};
    }
    .header img {
      width: 140px;
      height: auto;
      margin-bottom: 10px;
      filter: drop-shadow(0 4px 6px rgba(0,0,0,0.2));
    }
    .header h1 {
      color: #ffffff;
      font-size: 28px;
      letter-spacing: 2px;
      margin: 0;
      text-transform: uppercase;
      font-weight: 800;
      text-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    /* Content */
    .content-area {
      padding: 45px 40px;
    }
    .content-title {
      font-size: 26px;
      margin-bottom: 25px;
      font-weight: 700;
      color: #1e293b;
    }
    .content-text {
      font-size: 16px;
      line-height: 1.7;
      margin-bottom: 25px;
      color: #475569;
    }
    /* Button */
    .btn-container {
      text-align: center;
      margin: 35px 0;
    }
    .btn {
      display: inline-block;
      background: ${BRAND_GRADIENT};
      color: #ffffff !important;
      text-decoration: none;
      padding: 16px 36px;
      border-radius: 50px;
      font-family: 'Outfit', sans-serif;
      font-weight: 700;
      font-size: 16px;
      letter-spacing: 0.5px;
      box-shadow: 0 10px 15px -3px rgba(79, 70, 229, 0.4);
      transition: all 0.3s ease;
    }
    .btn:hover {
      box-shadow: 0 15px 20px -3px rgba(79, 70, 229, 0.5);
      transform: translateY(-2px);
    }
    /* Footer */
    .footer {
      background-color: #f8fafc;
      padding: 30px 40px;
      text-align: center;
      border-top: 1px solid #f1f5f9;
    }
    .footer-text {
      margin: 0;
      color: #94a3b8;
      font-size: 13px;
      line-height: 1.5;
    }
    /* Highlight Box */
    .highlight-box {
      background: linear-gradient(145deg, #f8fafc, #f1f5f9);
      border: 1px solid #e2e8f0;
      border-radius: 16px;
      padding: 25px;
      text-align: center;
      margin: 30px 0;
      box-shadow: inset 0 2px 4px rgba(0,0,0,0.02);
    }
    .highlight-label {
      font-family: 'Outfit', sans-serif;
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #64748b;
      font-weight: 700;
      margin-bottom: 10px;
      margin-top: 0;
    }
    .highlight-value {
      color: ${BRAND_COLOR};
      font-size: 22px;
      font-weight: 800;
      font-family: 'Outfit', sans-serif;
      margin: 0;
      word-break: break-all;
    }
    
    /* Tables */
    .receipt-table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
      margin: 30px 0;
      border-radius: 16px;
      overflow: hidden;
      border: 1px solid #e2e8f0;
    }
    .receipt-table td {
      padding: 18px 24px;
      border-bottom: 1px solid #f1f5f9;
      font-size: 15px;
    }
    .receipt-table tr:last-child td {
      border-bottom: none;
      background-color: #f8fafc;
    }
    .receipt-label {
      color: #64748b;
      font-weight: 500;
    }
    .receipt-val {
      text-align: right;
      color: #0f172a;
      font-weight: 600;
      font-family: 'Outfit', sans-serif;
    }
    .receipt-amount {
      color: ${BRAND_COLOR};
      font-size: 20px;
      font-weight: 800;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <table class="main-table" cellspacing="0" cellpadding="0">
      <tr>
        <td class="header">
          <!-- Bexo Logo -->
          <img src="${LOGO_URL}" alt="Bexo Logo">
        </td>
      </tr>
      <tr>
        <td class="content-area">
          ${content}
        </td>
      </tr>
      <tr>
        <td class="footer">
          <p class="footer-text">&copy; ${new Date().getFullYear()} BEXO FROM Ace Digital. All rights reserved.</p>
          <p class="footer-text" style="margin-top: 8px;">BEXO is a product of Ace Digital, Coimbatore, Tamil Nadu, India.</p>
        </td>
      </tr>
    </table>
  </div>
</body>
</html>
`;

export const getWelcomeEmail = (userName: string) => {
  const content = `
    <h2 class="content-title">Welcome to Bexo, ${userName}! 🚀</h2>
    <p class="content-text">We are absolutely thrilled to have you join our community of professionals.</p>
    <p class="content-text">Bexo is designed to help you craft the perfect, high-converting professional portfolio in just a few clicks. Whether you're a developer, designer, or creator, your next big opportunity starts here.</p>
    
    <div class="highlight-box">
      <p class="highlight-label">Your Next Step</p>
      <p class="content-text" style="margin-bottom: 0; font-weight: 500; color: #1e293b;">Complete your onboarding profile to unlock personalized templates.</p>
    </div>

    <div class="btn-container">
      <a href="https://mybexo.com/dashboard" class="btn">Launch Dashboard</a>
    </div>
    
    <p class="content-text">We can't wait to see what you build!</p>
  `;
  return wrapHtml("Welcome to Bexo", content);
};

export const getSiteLiveEmail = (userName: string, siteUrl: string) => {
  const content = `
    <h2 class="content-title">Your site is officially live! 🎉</h2>
    <p class="content-text">Hi ${userName},</p>
    <p class="content-text">Incredible work! Your new professional portfolio has been successfully published and is now streaming live across the web.</p>
    
    <div class="highlight-box">
      <p class="highlight-label">Your Custom URL</p>
      <a href="${siteUrl}" style="text-decoration: none;">
        <p class="highlight-value">${siteUrl}</p>
      </a>
    </div>
    
    <p class="content-text">It's time to show it off. Share your new link with recruiters, add it to your resume, or post it on LinkedIn to supercharge your career.</p>
    
    <div class="btn-container">
      <a href="${siteUrl}" class="btn">View Live Site</a>
    </div>
  `;
  return wrapHtml("Your Bexo Site is Live!", content);
};

export const getBillingReceiptEmail = (userName: string, plan: string, amount: number, transactionId: string) => {
  const planName = plan === 'annual' ? 'Pro Annual' : plan === 'lifetime' ? 'Pro Lifetime' : 'Premium Access';
  const planDesc = plan === 'lifetime' 
    ? 'Lifetime access to all Bexo Pro features with no recurring charges.' 
    : plan === 'annual'
    ? '12-month access to Bexo Pro features, templates, and AI tools.'
    : 'Premium access to Bexo Pro portfolio features.';
  
  const content = `
    <h2 class="content-title">Payment Received Successfully</h2>
    <p class="content-text">Hi ${userName},</p>
    <p class="content-text">Thank you for your purchase! Your payment has been securely processed and your Bexo Pro features are now active. Please find your detailed tax invoice attached to this email as a PDF.</p>
    
    <table class="receipt-table">
      <tr>
        <td class="receipt-label">Plan</td>
        <td class="receipt-val">${planName}</td>
      </tr>
      <tr>
        <td class="receipt-label">Description</td>
        <td class="receipt-val" style="font-size: 13px; color: #64748b;">${planDesc}</td>
      </tr>
      <tr>
        <td class="receipt-label">Transaction ID</td>
        <td class="receipt-val" style="font-family: monospace; font-size: 13px;">${transactionId}</td>
      </tr>
      <tr>
        <td class="receipt-label">Date</td>
        <td class="receipt-val">${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</td>
      </tr>
      <tr>
        <td class="receipt-label" style="font-weight: 700; color: #0f172a;">Total Paid</td>
        <td class="receipt-val receipt-amount">${amount > 0 ? `₹${amount.toLocaleString('en-IN')}` : 'Activation Code (Free)'}</td>
      </tr>
    </table>

    <div class="highlight-box" style="border-left: 4px solid #4f46e5; text-align: left;">
      <p style="margin: 0 0 8px 0; font-weight: 600; color: #1e293b; font-size: 14px;">📎 Tax Invoice Attached</p>
      <p style="margin: 0; font-size: 13px; color: #64748b; line-height: 1.5;">A detailed tax invoice (PDF) from Ace Digital has been attached to this email for your records. You can also download it anytime from your Bexo dashboard.</p>
    </div>
    
    <div class="btn-container">
      <a href="https://mybexo.com/dashboard" class="btn">Go to Dashboard</a>
    </div>

    <p class="content-text" style="font-size: 13px; color: #94a3b8; text-align: center;">For billing queries, reach out to <a href="mailto:billing@mybexo.com" style="color: #4f46e5;">billing@mybexo.com</a></p>
  `;
  return wrapHtml("Bexo Payment Receipt", content);
};

export const getActivationEmail = (userName: string, code: string) => {
  const content = `
    <h2 class="content-title">Pro Account Activated! 🎊</h2>
    <p class="content-text">Hi ${userName},</p>
    <p class="content-text">Your activation code has been successfully verified. You now have full, unrestricted access to all of Bexo's premium features.</p>
    
    <div class="highlight-box" style="border: 2px dashed #c7d2fe; background: #eef2ff;">
      <p class="highlight-label" style="color: #4f46e5;">Redeemed Code</p>
      <p class="highlight-value" style="letter-spacing: 3px; font-family: monospace;">${code}</p>
    </div>
    
    <p class="content-text">Dive into the dashboard to explore exclusive templates, advanced analytics, and custom domains.</p>
    
    <div class="btn-container">
      <a href="https://mybexo.com/dashboard" class="btn">Go to Dashboard</a>
    </div>
  `;
  return wrapHtml("Bexo Account Activated", content);
};

export const getRecoveryEmail = (userName: string, resumeUrl: string) => {
  const content = `
    <h2 class="content-title">Your Bexo portfolio is waiting</h2>
    <p class="content-text">Hi ${userName},</p>
    <p class="content-text">You started building your professional portfolio but did not finish onboarding. Your progress is saved — pick up where you left off in one click.</p>
    <div class="btn-container">
      <a href="${resumeUrl}" class="btn">Continue Onboarding</a>
    </div>
    <p class="content-text">If you already finished, you can ignore this email.</p>
  `;
  return wrapHtml("Continue your Bexo portfolio", content);
};

export const getCartRecoveryEmail = (userName: string, checkoutUrl: string) => {
  const content = `
    <h2 class="content-title">Complete your Bexo Pro checkout</h2>
    <p class="content-text">Hi ${userName},</p>
    <p class="content-text">You started upgrading to Bexo Pro but left before finishing payment. Your portfolio draft is still saved — complete checkout to publish with premium templates and storage.</p>
    <div class="btn-container">
      <a href="${checkoutUrl}" class="btn">Complete Checkout</a>
    </div>
    <p class="content-text">If you already paid, you can ignore this email.</p>
  `;
  return wrapHtml("Complete your Bexo Pro checkout", content);
};

export const getRenewalReminderEmail = (
  userName: string,
  renewUrl: string,
  expiresLabel: string,
) => {
  const content = `
    <h2 class="content-title">Your Yearly plan renews soon</h2>
    <p class="content-text">Hi ${userName},</p>
    <p class="content-text">Your Bexo Annual Support Plan ${expiresLabel ? `expires on <strong>${expiresLabel}</strong>` : "is ending soon"}. Renew Yearly to keep your premium subdomain, templates, and storage without interruption.</p>
    <div class="btn-container">
      <a href="${renewUrl}" class="btn">Renew Yearly</a>
    </div>
    <p class="content-text">Renewing extends your current expiry by one year. Storage stays the same.</p>
  `;
  return wrapHtml("Renew your Bexo Yearly plan", content);
};

export const getContactNotificationEmail = (
  ownerName: string,
  senderName: string,
  senderEmail: string,
  senderPhone: string,
  message: string,
  handle: string,
) => {
  const safeMessage = String(message || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br/>");
  const content = `
    <h2 class="content-title">New portfolio enquiry</h2>
    <p class="content-text">Hi ${ownerName},</p>
    <p class="content-text">Someone sent a message through your Bexo portfolio${handle ? ` (${handle}.mybexo.com)` : ""}.</p>
    <table class="receipt-table">
      <tr>
        <td class="receipt-label">From</td>
        <td class="receipt-val">${senderName}</td>
      </tr>
      <tr>
        <td class="receipt-label">Email</td>
        <td class="receipt-val">${senderEmail}</td>
      </tr>
      ${senderPhone ? `<tr><td class="receipt-label">Phone</td><td class="receipt-val">${senderPhone}</td></tr>` : ""}
    </table>
    <div class="highlight-box" style="text-align:left;">
      <p class="highlight-label">Message</p>
      <p class="content-text" style="margin:0;">${safeMessage}</p>
    </div>
    <p class="content-text">Reply directly to this email to continue the conversation with ${senderName}.</p>
  `;
  return wrapHtml("New portfolio enquiry", content);
};
