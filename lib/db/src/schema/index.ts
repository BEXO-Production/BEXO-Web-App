import { pgTable, uuid, text, timestamp, date, integer, boolean, bigint, unique, jsonb, real } from "drizzle-orm/pg-core";

// 1. Users Table
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  phone: text("phone").unique().notNull(),
  phoneVerifiedAt: timestamp("phone_verified_at", { withTimezone: true }),
  email: text("email").unique(),
  oauthProvider: text("oauth_provider"),
  oauthId: text("oauth_id"),
  name: text("name"),
  dob: date("dob"),
  photoUrl: text("photo_url"),
  resumeUrl: text("resume_url"),
  profilePhotoAssetId: uuid("profile_photo_asset_id"),
  storageUsedBytes: bigint("storage_used_bytes", { mode: "number" }).default(0),
  storageQuotaBytes: bigint("storage_quota_bytes", { mode: "number" }).default(10485760), // 10MB free tier default
  storageBonusBytes: bigint("storage_bonus_bytes", { mode: "number" }).default(0), // stacked add-on storage (e.g. yearly on lifetime)
  openToHire: boolean("open_to_hire").default(false),
  templateId: text("template_id").default("minimal"),
  themeColor: text("theme_color").default("blue"),
  themeBg: text("theme_bg").default("grid"),
  resumeParsesThisMonth: integer("resume_parses_this_month").default(0),
  lastResumeParseReset: timestamp("last_resume_parse_reset", { withTimezone: true }).defaultNow(),
  onboardingSuccessfulParses: integer("onboarding_successful_parses").default(0),
  onboardingCompletedAt: timestamp("onboarding_completed_at", { withTimezone: true }),
  lastOnboardingActivityAt: timestamp("last_onboarding_activity_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// 2. Profiles Table
export const profiles = pgTable("profiles", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id).unique().notNull(),
  handle: text("handle").unique(),
  headline: text("headline"),
  careerGoal: text("career_goal"),
  bio: text("bio"),
  completionPct: integer("completion_pct").default(0),
  subdomain: text("subdomain").unique(),
  templateId: text("template_id").default("minimal"),
  isPremium: boolean("is_premium").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// 3. Profile Sections Table
export const profileSections = pgTable("profile_sections", {
  id: uuid("id").defaultRandom().primaryKey(),
  profileId: uuid("profile_id").references(() => profiles.id).notNull(),
  type: text("type").notNull(), // 'about' | 'education' | 'projects' | 'experience' | 'certificates' | 'achievements' | 'research' | 'contact'
  entries: jsonb("entries").default([]),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
}, (table) => {
  return {
    profileTypeUnique: unique("profile_type_unique").on(table.profileId, table.type),
  };
});

// 4. Assets Table
export const assets = pgTable("assets", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  name: text("name").notNull(),
  url: text("url").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  sectionType: text("section_type"),
  entryId: text("entry_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// 5. Templates Table
export const templates = pgTable("templates", {
  id: text("id").primaryKey(), // 'minimal' | 'academic' | 'creative'
  name: text("name").notNull(),
  description: text("description"),
});

// 6. Theme Variants Table
export const themeVariants = pgTable("theme_variants", {
  id: uuid("id").defaultRandom().primaryKey(),
  templateId: text("template_id").references(() => templates.id).notNull(),
  name: text("name").notNull(),
  tokens: jsonb("tokens").notNull(),
});

// 7. Portfolios Table
export const portfolios = pgTable("portfolios", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id).unique().notNull(),
  handle: text("handle").unique().notNull(),
  selectedTemplateId: text("selected_template_id").references(() => templates.id),
  selectedThemeId: text("selected_theme_id"),
  isPublished: boolean("is_published").default(false),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  draftPreviewToken: text("draft_preview_token").unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// 8. Activation Keys Table
export const activationKeys = pgTable("activation_keys", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: text("code").unique().notNull(),
  status: text("status").default("unused"), // 'unused' | 'redeemed' | 'expired' | 'revoked'
  redeemedBy: uuid("redeemed_by").references(() => users.id),
  redeemedAt: timestamp("redeemed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// 9. Subscriptions Table
export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id).unique().notNull(),
  plan: text("plan").notNull(), // 'annual' | 'lifetime'
  status: text("status").notNull(), // 'active' | 'expired'
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  razorpaySubscriptionId: text("razorpay_subscription_id").unique(), // set for autopay (annual) subscriptions
  razorpayPlanId: text("razorpay_plan_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// 10. Payments Table
export const payments = pgTable("payments", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  razorpayOrderId: text("razorpay_order_id").unique(), // null for subscription-kind payments until charged
  razorpayPaymentId: text("razorpay_payment_id").unique(),
  razorpaySubscriptionId: text("razorpay_subscription_id"),
  plan: text("plan"), // 'annual' | 'lifetime' | null (legacy rows)
  kind: text("kind").notNull().default("order"), // 'order' | 'subscription'
  amount: integer("amount").notNull(), // in paise
  status: text("status").notNull(), // 'pending' | 'success' | 'failed'
  invoiceUrl: text("invoice_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// 11. Contact Submissions (portfolio enquiry form)
export const contactSubmissions = pgTable("contact_submissions", {
  id: uuid("id").defaultRandom().primaryKey(),
  profileId: uuid("profile_id").references(() => profiles.id).notNull(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  handle: text("handle").notNull(),
  senderName: text("sender_name").notNull(),
  senderEmail: text("sender_email").notNull(),
  senderPhone: text("sender_phone"),
  message: text("message").notNull(),
  deliveryStatus: text("delivery_status").default("pending").notNull(), // pending | sent | failed
  attemptCount: integer("attempt_count").default(0).notNull(),
  lastError: text("last_error"),
  ipHash: text("ip_hash"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// 12. Email Deliveries Outbox
export const emailDeliveries = pgTable("email_deliveries", {
  id: uuid("id").defaultRandom().primaryKey(),
  eventType: text("event_type").notNull(), // billing_receipt | activation | welcome | site_live | recovery | cart_recovery | renewal_reminder | contact
  recipient: text("recipient").notNull(),
  subject: text("subject").notNull(),
  dedupeKey: text("dedupe_key").unique().notNull(),
  payload: jsonb("payload").default({}).notNull(),
  status: text("status").default("pending").notNull(), // pending | processing | sent | failed | skipped
  attempts: integer("attempts").default(0).notNull(),
  nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
  providerMessageId: text("provider_message_id"),
  lastError: text("last_error"),
  userId: uuid("user_id").references(() => users.id),
  relatedId: text("related_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
});

// 13. Resume Parse Attempts (entitlement + abuse audit)
export const resumeParseAttempts = pgTable("resume_parse_attempts", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  status: text("status").default("started").notNull(), // started | succeeded | failed | timed_out
  fileHash: text("file_hash"),
  fileName: text("file_name"),
  fileSizeBytes: integer("file_size_bytes"),
  model: text("model"),
  errorMessage: text("error_message"),
  consumedQuota: boolean("consumed_quota").default(false).notNull(),
  duringOnboarding: boolean("during_onboarding").default(true).notNull(),
  ipHash: text("ip_hash"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

// 14. Billing settings (GST, currency)
export const billingSettings = pgTable("billing_settings", {
  id: text("id").primaryKey().default("default"),
  currency: text("currency").notNull().default("INR"),
  gstRate: real("gst_rate").notNull().default(0.18),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// 15. Pricing plans (source of truth for web + payments)
export const pricingPlans = pgTable("pricing_plans", {
  id: text("id").primaryKey(),
  displayName: text("display_name").notNull(),
  subtitle: text("subtitle"),
  priceInrExGst: integer("price_inr_ex_gst").notNull().default(0),
  storageBytes: bigint("storage_bytes", { mode: "number" }).notNull(),
  isPurchasable: boolean("is_purchasable").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  isHighlighted: boolean("is_highlighted").notNull().default(false),
  features: jsonb("features").notNull().default([]),
  isActive: boolean("is_active").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// 16. Pricing coupons
export const pricingCoupons = pgTable("pricing_coupons", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: text("code").notNull().unique(),
  description: text("description"),
  discountType: text("discount_type").notNull(),
  percentOff: real("percent_off"),
  inrOff: integer("inr_off"),
  planPrices: jsonb("plan_prices"),
  validFrom: timestamp("valid_from", { withTimezone: true }),
  validUntil: timestamp("valid_until", { withTimezone: true }),
  maxUses: integer("max_uses"),
  usedCount: integer("used_count").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});