import terms from "@/content/legal/terms.json";
import privacy from "@/content/legal/privacy.json";
import refund from "@/content/legal/refund.json";
import cookies from "@/content/legal/cookies.json";
import { LegalDocument } from "@/components/marketing/MarketingChrome";
import type { LegalDoc } from "@/content/legal/types";

export function TermsPage() {
  return <LegalDocument doc={terms as LegalDoc} slug="terms" />;
}

export function PrivacyPage() {
  return <LegalDocument doc={privacy as LegalDoc} slug="privacy" />;
}

export function RefundPage() {
  return <LegalDocument doc={refund as LegalDoc} slug="refund" />;
}

export function CookiesPage() {
  return <LegalDocument doc={cookies as LegalDoc} slug="cookies" />;
}
