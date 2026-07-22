import { BEXO_FOOTER_COPYRIGHT } from "./brand";
import { appOrigin } from "./platform";

const BRAND_BLUE = "#2F6BFF";
const BRAND_BLUE_DARK = "#1E4FD4";
const INK = "#0B1220";
const MUTED = "#64748B";
const CREAM = "#F4F1EB";
const CARD = "#FFFFFF";

function getEmailAssetOrigin(): string {
  return appOrigin();
}

const LOGO_URL = `${getEmailAssetOrigin()}/api/email-assets/bexo-logo.png`;
const APP_URL = getEmailAssetOrigin();

function escapeHtml(value: string): string {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

type EmailLayoutOptions = {
  title: string;
  preheader: string;
  eyebrow: string;
  headline: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaUrl?: string;
  footnote?: string;
  accent?: "blue" | "violet" | "emerald" | "amber";
};

const ACCENT: Record<
  NonNullable<EmailLayoutOptions["accent"]>,
  { bar: string; glow: string }
> = {
  blue: { bar: BRAND_BLUE, glow: "rgba(47,107,255,0.45)" },
  violet: { bar: "#7C3AED", glow: "rgba(124,58,237,0.4)" },
  emerald: { bar: "#10B981", glow: "rgba(16,185,129,0.35)" },
  amber: { bar: "#F59E0B", glow: "rgba(245,158,11,0.35)" },
};

function ctaButton(label: string, href: string, accent: string): string {
  const safeLabel = escapeHtml(label);
  const safeHref = escapeHtml(href);
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:32px auto 8px;">
      <tr>
        <td align="center" class="cta-cell" style="border-radius:999px;background:linear-gradient(135deg, ${BRAND_BLUE} 0%, ${BRAND_BLUE_DARK} 100%);box-shadow:0 14px 32px -8px ${accent};">
          <!--[if mso]>
          <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${safeHref}" style="height:52px;v-text-anchor:middle;width:260px;" arcsize="50%" strokecolor="${BRAND_BLUE}" fillcolor="${BRAND_BLUE}">
            <w:anchorlock/>
            <center style="color:#ffffff;font-family:Segoe UI, Arial, sans-serif;font-size:16px;font-weight:700;">${safeLabel}</center>
          </v:roundrect>
          <![endif]-->
          <!--[if !mso]><!-->
          <a href="${safeHref}" class="cta-link" style="display:inline-block;padding:16px 36px;font-family:'Segoe UI', Inter, Arial, sans-serif;font-size:16px;font-weight:700;color:#ffffff !important;text-decoration:none;border-radius:999px;letter-spacing:0.02em;">
            ${safeLabel} →
          </a>
          <!--<![endif]-->
        </td>
      </tr>
    </table>`;
}

function featurePills(items: string[]): string {
  const cells = items
    .map(
      (item) => `
      <td class="stack" style="padding:6px;width:33.33%;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
          <tr>
            <td style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:14px;padding:14px 12px;text-align:center;font-family:'Segoe UI', Inter, Arial, sans-serif;font-size:13px;line-height:1.45;color:#334155;font-weight:600;">
              ${escapeHtml(item)}
            </td>
          </tr>
        </table>
      </td>`,
    )
    .join("");
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:28px 0 8px;">
      <tr class="stack">${cells}</tr>
    </table>`;
}

function wrapHtml(options: EmailLayoutOptions): string {
  const accent = ACCENT[options.accent || "blue"];
  const preheader = escapeHtml(options.preheader);
  const eyebrow = escapeHtml(options.eyebrow);
  const headline = escapeHtml(options.headline);
  const footnote = options.footnote
    ? `<p style="margin:24px 0 0;font-family:'Segoe UI', Inter, Arial, sans-serif;font-size:13px;line-height:1.6;color:#94A3B8;text-align:center;">${options.footnote}</p>`
    : "";
  const cta =
    options.ctaLabel && options.ctaUrl
      ? ctaButton(options.ctaLabel, options.ctaUrl, accent.glow)
      : "";

  return `<!DOCTYPE html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>${escapeHtml(options.title)}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    @keyframes bexo-shimmer {
      0% { background-position: 200% center; }
      100% { background-position: -200% center; }
    }
    @keyframes bexo-pulse {
      0%, 100% { box-shadow: 0 14px 32px -8px ${accent.glow}; transform: translateY(0); }
      50% { box-shadow: 0 18px 40px -6px ${accent.glow}; transform: translateY(-1px); }
    }
    @keyframes bexo-float {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-4px); }
    }
    .preheader { display:none !important; visibility:hidden; opacity:0; color:transparent; height:0; width:0; max-height:0; max-width:0; overflow:hidden; mso-hide:all; }
    .cta-cell { animation: bexo-pulse 2.8s ease-in-out infinite; }
    .logo-medallion { animation: bexo-float 4s ease-in-out infinite; }
    .shine-bar {
      height: 3px;
      border-radius: 999px;
      background: linear-gradient(90deg, transparent, ${accent.bar}, #ffffff, ${accent.bar}, transparent);
      background-size: 200% auto;
      animation: bexo-shimmer 3.5s linear infinite;
    }
    a { color: ${BRAND_BLUE}; }
    @media only screen and (max-width: 620px) {
      .shell { width: 100% !important; }
      .pad { padding-left: 22px !important; padding-right: 22px !important; }
      .stack td { display: block !important; width: 100% !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:${CREAM};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <div class="preheader">${preheader}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:linear-gradient(180deg, #0B1220 0%, #121a2e 38%, ${CREAM} 38%, ${CREAM} 100%);">
    <tr>
      <td align="center" style="padding:36px 16px 48px;">
        <table role="presentation" class="shell" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;width:100%;">
          <tr>
            <td style="padding:0 24px;text-align:center;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" class="logo-medallion" style="margin:0 auto -28px;position:relative;z-index:2;">
                <tr>
                  <td style="background:${CARD};border-radius:20px;padding:14px;box-shadow:0 20px 50px -20px rgba(11,18,32,0.55);border:1px solid rgba(255,255,255,0.85);">
                    <img src="${LOGO_URL}" width="52" height="52" alt="BEXO" style="display:block;border:0;outline:none;text-decoration:none;width:52px;height:52px;object-fit:contain;" />
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${CARD};border-radius:28px;overflow:hidden;box-shadow:0 28px 70px -32px rgba(11,18,32,0.35);border:1px solid rgba(15,23,42,0.06);">
                <tr>
                  <td style="background:linear-gradient(135deg, ${INK} 0%, #151f38 100%);padding:40px 32px 28px;text-align:center;">
                    <div class="shine-bar" style="max-width:220px;margin:0 auto 20px;"></div>
                    <p style="margin:0 0 10px;font-family:'Segoe UI', Inter, Arial, sans-serif;font-size:11px;font-weight:700;letter-spacing:0.22em;text-transform:uppercase;color:rgba(255,255,255,0.55);">${eyebrow}</p>
                    <h1 style="margin:0;font-family:Georgia, 'Times New Roman', serif;font-size:28px;line-height:1.25;font-weight:700;color:#ffffff;letter-spacing:-0.02em;">${headline}</h1>
                  </td>
                </tr>
                <tr>
                  <td class="pad" style="padding:36px 40px 32px;">
                    ${options.bodyHtml}
                    ${cta}
                    ${footnote}
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 40px 32px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                      <tr>
                        <td style="height:1px;background:linear-gradient(90deg, transparent, #E2E8F0, transparent);font-size:0;line-height:0;">&nbsp;</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td class="pad" style="padding:0 40px 36px;text-align:center;">
                    <p style="margin:0 0 8px;font-family:'Segoe UI', Inter, Arial, sans-serif;font-size:12px;line-height:1.6;color:#94A3B8;">
                      BEXO is a product of Ace Digital · Coimbatore, India
                    </p>
                    <p style="margin:0;font-family:'Segoe UI', Inter, Arial, sans-serif;font-size:12px;line-height:1.6;color:#CBD5E1;">
                      <a href="${APP_URL}/terms" style="color:#64748B;text-decoration:none;">Terms</a>
                      &nbsp;·&nbsp;
                      <a href="${APP_URL}/privacy" style="color:#64748B;text-decoration:none;">Privacy</a>
                      &nbsp;·&nbsp;
                      <a href="${APP_URL}/refund" style="color:#64748B;text-decoration:none;">Refunds</a>
                    </p>
                    <p style="margin:14px 0 0;font-family:'Segoe UI', Inter, Arial, sans-serif;font-size:11px;color:#CBD5E1;">
                      ${BEXO_FOOTER_COPYRIGHT}
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function bodyParagraph(text: string): string {
  return `<p style="margin:0 0 18px;font-family:'Segoe UI', Inter, Arial, sans-serif;font-size:16px;line-height:1.75;color:#475569;">${text}</p>`;
}

function greeting(name: string): string {
  return bodyParagraph(`Hi <strong style="color:${INK};">${escapeHtml(name)}</strong>,`);
}

function highlightCard(label: string, valueHtml: string, chipBg = "#EEF2FF"): string {
  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:26px 0;">
      <tr>
        <td style="background:linear-gradient(145deg, #FAFBFC, ${chipBg});border:1px solid #E2E8F0;border-radius:18px;padding:22px 24px;text-align:center;">
          <p style="margin:0 0 8px;font-family:'Segoe UI', Inter, Arial, sans-serif;font-size:11px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:${MUTED};">${escapeHtml(label)}</p>
          <p style="margin:0;font-family:Georgia, 'Times New Roman', serif;font-size:22px;line-height:1.35;font-weight:700;color:${BRAND_BLUE};word-break:break-word;">
            ${valueHtml}
          </p>
        </td>
      </tr>
    </table>`;
}

export const getWelcomeEmail = (userName: string) => {
  const name = userName || "there";
  return wrapHtml({
    title: "Welcome to BEXO",
    preheader: "Your portfolio journey starts here — templates, subdomain, and Hire Me in minutes.",
    eyebrow: "Welcome aboard",
    headline: "You're in. Let's build something recruiters remember.",
    accent: "blue",
    ctaLabel: "Open your dashboard",
    ctaUrl: `${APP_URL}/dashboard`,
    footnote: "Need help? Reply to this email or write to support@acedigital.cc",
    bodyHtml: `
      ${greeting(name)}
      ${bodyParagraph("BEXO turns your resume into a live portfolio — polished sections, premium templates, and a personal subdomain you can share in placements and DMs.")}
      ${featurePills(["Resume → live site", "Premium templates", "Hire Me page"])}
      ${highlightCard("Your next step", "Complete onboarding and pick the look that fits your story.")}
      ${bodyParagraph("We can't wait to see what you publish.")}
    `,
  });
};

export const getSiteLiveEmail = (userName: string, siteUrl: string) => {
  const safeUrl = escapeHtml(siteUrl);
  return wrapHtml({
    title: "Your Bexo site is live",
    preheader: `Your portfolio is live at ${siteUrl}`,
    eyebrow: "You're live",
    headline: "Your portfolio is officially on the internet.",
    accent: "emerald",
    ctaLabel: "View live site",
    ctaUrl: siteUrl,
    bodyHtml: `
      ${greeting(userName)}
      ${bodyParagraph("Incredible work — your site is published and ready to share with recruiters, mentors, and your network.")}
      ${highlightCard("Your link", `<a href="${safeUrl}" style="color:${BRAND_BLUE};text-decoration:none;">${safeUrl}</a>`, "#D1FAE5")}
      ${bodyParagraph("Add it to your resume header, LinkedIn featured section, and placement forms while momentum is high.")}
    `,
  });
};

export const getBillingReceiptEmail = (
  userName: string,
  plan: string,
  amount: number,
  transactionId: string,
) => {
  const planName =
    plan === "annual" ? "Yearly" : plan === "lifetime" ? "Lifetime" : "Premium Access";
  const planDesc =
    plan === "lifetime"
      ? "Lifetime access to BEXO Pro — templates, subdomain, and storage."
      : plan === "annual"
        ? "12 months of BEXO Pro — templates, subdomain, and expanded storage."
        : "Premium access to BEXO Pro portfolio features.";
  const amountLabel =
    amount > 0 ? `₹${amount.toLocaleString("en-IN")}` : "Activation code (₹0)";
  const dateLabel = new Date().toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return wrapHtml({
    title: "BEXO payment receipt",
    preheader: `Receipt for ${planName} — ${amountLabel}`,
    eyebrow: "Payment confirmed",
    headline: "Thanks — your Pro features are active.",
    accent: "violet",
    ctaLabel: "Go to dashboard",
    ctaUrl: `${APP_URL}/dashboard`,
    footnote: `Billing questions? <a href="mailto:billing@atbexo.com">billing@atbexo.com</a>`,
    bodyHtml: `
      ${greeting(userName)}
      ${bodyParagraph("Your payment was processed successfully. A GST tax invoice is attached to this email for your records.")}
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0;border:1px solid #E2E8F0;border-radius:16px;overflow:hidden;">
        <tr><td style="padding:14px 20px;background:#F8FAFC;font-family:'Segoe UI', Inter, Arial, sans-serif;font-size:13px;color:${MUTED};">Plan</td><td align="right" style="padding:14px 20px;background:#F8FAFC;font-family:'Segoe UI', Inter, Arial, sans-serif;font-size:14px;font-weight:700;color:${INK};">${escapeHtml(planName)}</td></tr>
        <tr><td style="padding:14px 20px;border-top:1px solid #F1F5F9;font-family:'Segoe UI', Inter, Arial, sans-serif;font-size:13px;color:${MUTED};">Details</td><td align="right" style="padding:14px 20px;border-top:1px solid #F1F5F9;font-family:'Segoe UI', Inter, Arial, sans-serif;font-size:13px;color:#475569;">${escapeHtml(planDesc)}</td></tr>
        <tr><td style="padding:14px 20px;border-top:1px solid #F1F5F9;font-family:'Segoe UI', Inter, Arial, sans-serif;font-size:13px;color:${MUTED};">Transaction</td><td align="right" style="padding:14px 20px;border-top:1px solid #F1F5F9;font-family:ui-monospace, SFMono-Regular, Menlo, monospace;font-size:12px;color:#475569;">${escapeHtml(transactionId)}</td></tr>
        <tr><td style="padding:14px 20px;border-top:1px solid #F1F5F9;font-family:'Segoe UI', Inter, Arial, sans-serif;font-size:13px;color:${MUTED};">Date</td><td align="right" style="padding:14px 20px;border-top:1px solid #F1F5F9;font-family:'Segoe UI', Inter, Arial, sans-serif;font-size:14px;font-weight:600;color:${INK};">${escapeHtml(dateLabel)}</td></tr>
        <tr><td style="padding:16px 20px;border-top:1px solid #E2E8F0;background:#F8FAFC;font-family:'Segoe UI', Inter, Arial, sans-serif;font-size:14px;font-weight:700;color:${INK};">Total paid</td><td align="right" style="padding:16px 20px;border-top:1px solid #E2E8F0;background:#F8FAFC;font-family:Georgia, serif;font-size:22px;font-weight:700;color:${BRAND_BLUE};">${escapeHtml(amountLabel)}</td></tr>
      </table>
    `,
  });
};

export const getActivationEmail = (userName: string, code: string) => {
  return wrapHtml({
    title: "BEXO Pro activated",
    preheader: "Your activation code was applied — premium features unlocked.",
    eyebrow: "Pro unlocked",
    headline: "You're on BEXO Pro.",
    accent: "violet",
    ctaLabel: "Explore templates",
    ctaUrl: `${APP_URL}/dashboard`,
    bodyHtml: `
      ${greeting(userName)}
      ${bodyParagraph("Your activation code was verified. Premium templates, subdomain hosting, and expanded storage are ready.")}
      ${highlightCard("Redeemed code", `<span style="font-family:ui-monospace, monospace;letter-spacing:0.12em;">${escapeHtml(code)}</span>`, "#F3E8FF")}
      ${bodyParagraph("Head to the dashboard to choose a template and publish.")}
    `,
  });
};

export const getRecoveryEmail = (userName: string, resumeUrl: string) => {
  return wrapHtml({
    title: "Continue your BEXO portfolio",
    preheader: "Your progress is saved — finish onboarding in one click.",
    eyebrow: "Pick up where you left off",
    headline: "Your portfolio draft is still here.",
    accent: "blue",
    ctaLabel: "Continue onboarding",
    ctaUrl: resumeUrl,
    footnote: "If you already finished, you can ignore this email.",
    bodyHtml: `
      ${greeting(userName)}
      ${bodyParagraph("You started building on BEXO but didn't cross the finish line. Your sections and uploads are saved — it only takes a few minutes to publish.")}
      ${featurePills(["Saved progress", "AI resume parse", "Live subdomain"])}
    `,
  });
};

export const getCartRecoveryEmail = (userName: string, checkoutUrl: string) => {
  return wrapHtml({
    title: "Complete your BEXO Pro checkout",
    preheader: "Finish checkout to unlock premium templates, subdomain, and storage.",
    eyebrow: "Checkout waiting",
    headline: "You're one step from BEXO Pro.",
    accent: "amber",
    ctaLabel: "Complete checkout",
    ctaUrl: checkoutUrl,
    footnote: "If you already paid, you can ignore this email.",
    bodyHtml: `
      ${greeting(userName)}
      ${bodyParagraph("You started upgrading to BEXO Pro but left before payment. Your portfolio draft is safe — complete checkout to publish with premium templates and extra storage.")}
      ${featurePills(["Premium templates", "you.atbexo.com", "More storage"])}
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:8px 0 4px;">
        <tr>
          <td style="background:linear-gradient(135deg, #FFF7ED 0%, #FFFBEB 100%);border:1px dashed #FCD34D;border-radius:16px;padding:18px 20px;">
            <p style="margin:0;font-family:'Segoe UI', Inter, Arial, sans-serif;font-size:14px;line-height:1.6;color:#92400E;">
              <strong style="color:#78350F;">Pro tip:</strong> Yearly and Lifetime plans include the showcase templates you previewed on the landing page.
            </p>
          </td>
        </tr>
      </table>
    `,
  });
};

export const getRenewalReminderEmail = (
  userName: string,
  renewUrl: string,
  expiresLabel: string,
) => {
  const expiryLine = expiresLabel
    ? `Your Yearly plan expires on <strong style="color:${INK};">${escapeHtml(expiresLabel)}</strong>.`
    : "Your Yearly plan is ending soon.";
  return wrapHtml({
    title: "Renew your BEXO Yearly plan",
    preheader: `Renew before ${expiresLabel || "expiry"} to keep your subdomain and Pro features.`,
    eyebrow: "Renewal reminder",
    headline: "Keep your portfolio live without interruption.",
    accent: "blue",
    ctaLabel: "Renew Yearly",
    ctaUrl: renewUrl,
    bodyHtml: `
      ${greeting(userName)}
      ${bodyParagraph(expiryLine)}
      ${bodyParagraph("Renewing extends your plan by one year — same subdomain, templates, and storage. No surprises.")}
      ${featurePills(["Subdomain stays live", "Premium templates", "Storage retained"])}
    `,
  });
};

export const getPaymentFailedEmail = (
  userName: string,
  billingUrl: string,
  pauseDate: string,
  dayBucket = 0,
) => {
  const urgency =
    dayBucket >= 14
      ? "Final notice: your public portfolio will pause soon if billing is not updated."
      : dayBucket >= 7
        ? "Reminder: update your payment method to keep your portfolio online."
        : "Your BEXO auto-renew payment failed. You have a 15-day grace period before the public site pauses.";
  return wrapHtml({
    title: "Update billing to keep your portfolio live",
    preheader: urgency,
    eyebrow: "Billing alert",
    headline: "Auto-renew payment failed.",
    accent: "amber",
    ctaLabel: "Fix billing",
    ctaUrl: billingUrl,
    bodyHtml: `
      ${greeting(userName)}
      ${bodyParagraph(urgency)}
      ${bodyParagraph(
        pauseDate
          ? `Your portfolio stays live until <strong style="color:${INK};">${escapeHtml(pauseDate)}</strong>. After that it will show a paused page to visitors until payment succeeds.`
          : "Your portfolio stays live during the grace window. After that visitors will see a paused page until payment succeeds.",
      )}
      ${featurePills(["15-day grace", "Dashboard still works", "One click to fix"])}
    `,
  });
};

export const getContactNotificationEmail = (
  ownerName: string,
  senderName: string,
  senderEmail: string,
  senderPhone: string,
  message: string,
  handle: string,
) => {
  const safeMessage = escapeHtml(message).replace(/\n/g, "<br/>");
  const portfolioNote = handle
    ? ` through <strong style="color:${INK};">${escapeHtml(handle)}.atbexo.com</strong>`
    : "";
  return wrapHtml({
    title: "New portfolio enquiry",
    preheader: `${senderName} sent you a message via BEXO.`,
    eyebrow: "New message",
    headline: "Someone reached out from your portfolio.",
    accent: "emerald",
    bodyHtml: `
      ${greeting(ownerName)}
      ${bodyParagraph(`You received a new enquiry${portfolioNote}.`)}
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:20px 0;border:1px solid #E2E8F0;border-radius:16px;overflow:hidden;">
        <tr><td style="padding:14px 18px;background:#F8FAFC;font-size:13px;color:${MUTED};font-family:'Segoe UI', Inter, Arial, sans-serif;">From</td><td align="right" style="padding:14px 18px;background:#F8FAFC;font-size:14px;font-weight:600;color:${INK};font-family:'Segoe UI', Inter, Arial, sans-serif;">${escapeHtml(senderName)}</td></tr>
        <tr><td style="padding:14px 18px;border-top:1px solid #F1F5F9;font-size:13px;color:${MUTED};font-family:'Segoe UI', Inter, Arial, sans-serif;">Email</td><td align="right" style="padding:14px 18px;border-top:1px solid #F1F5F9;font-size:14px;color:${INK};font-family:'Segoe UI', Inter, Arial, sans-serif;">${escapeHtml(senderEmail)}</td></tr>
        ${
          senderPhone
            ? `<tr><td style="padding:14px 18px;border-top:1px solid #F1F5F9;font-size:13px;color:${MUTED};font-family:'Segoe UI', Inter, Arial, sans-serif;">Phone</td><td align="right" style="padding:14px 18px;border-top:1px solid #F1F5F9;font-size:14px;color:${INK};font-family:'Segoe UI', Inter, Arial, sans-serif;">${escapeHtml(senderPhone)}</td></tr>`
            : ""
        }
      </table>
      ${highlightCard("Message", safeMessage, "#ECFDF5")}
      ${bodyParagraph(`Reply directly to this email to continue the conversation with ${escapeHtml(senderName)}.`)}
    `,
  });
};

export const getLeadReplyEmail = (
  recipientName: string,
  ownerName: string,
  handle: string,
  body: string,
  originalSnippet?: string,
) => {
  const safeBody = escapeHtml(body).replace(/\n/g, "<br/>");
  const portfolio = handle ? `${escapeHtml(handle)}.atbexo.com` : "their BEXO portfolio";
  const quote = originalSnippet
    ? highlightCard(
        "Original enquiry",
        escapeHtml(originalSnippet.slice(0, 600)).replace(/\n/g, "<br/>"),
        "#F8FAFC",
      )
    : "";
  return wrapHtml({
    title: `Reply from ${ownerName}`,
    preheader: `${ownerName} replied to your message on BEXO.`,
    eyebrow: "Portfolio reply",
    headline: `${ownerName} sent you a reply.`,
    accent: "violet",
    bodyHtml: `
      ${greeting(recipientName)}
      ${bodyParagraph(`You received a reply from <strong style="color:${INK};">${escapeHtml(ownerName)}</strong> via ${portfolio}.`)}
      ${highlightCard("Their message", safeBody, "#F5F3FF")}
      ${quote}
      ${bodyParagraph("You can reply to this email to continue the conversation.")}
    `,
    footnote: "Sent securely through BEXO. Replies go directly to the portfolio owner.",
  });
};
