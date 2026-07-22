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
  resumeUrl: text("resume_url"), // user-uploaded resume only
  generatedResumeUrl: text("generated_resume_url"), // system-generated ATS resume
  defaultResume: text("default_resume").notNull().default("generated"), // 'generated' | 'uploaded'
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
  updatesThisMonth: integer("updates_this_month").notNull().default(0),
  lastUpdatesReset: timestamp("last_updates_reset", { withTimezone: true }).defaultNow(),
  onboardingSuccessfulParses: integer("onboarding_successful_parses").default(0),
  onboardingCompletedAt: timestamp("onboarding_completed_at", { withTimezone: true }),
  lastOnboardingActivityAt: timestamp("last_onboarding_activity_at", { withTimezone: true }),
  // Public site access: live | grace (still serving) | paused (banner)
  siteStatus: text("site_status").notNull().default("live"),
  pauseReason: text("pause_reason"), // payment_failed | storage_exceeded | subscription_ended | manual
  graceUntil: timestamp("grace_until", { withTimezone: true }),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  paymentFailedAt: timestamp("payment_failed_at", { withTimezone: true }),
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
  type: text("type").notNull(), // 'about' | 'education' | 'projects' | 'experience' | 'certificates' | 'achievements' | 'research' | 'skills' | 'contact'
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

// 9b. Add-on Subscriptions (storage blocks; concurrent with the base plan)
export const addonSubscriptions = pgTable("addon_subscriptions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  addon: text("addon").notNull().default("storage"),
  blocks: integer("blocks").notNull().default(1),
  razorpaySubscriptionId: text("razorpay_subscription_id").unique(),
  razorpayPlanId: text("razorpay_plan_id"),
  status: text("status").notNull().default("pending"), // 'pending' | 'active' | 'cancelled' | 'expired'
  currentEnd: timestamp("current_end", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// 10. Payments Table
export const payments = pgTable("payments", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  razorpayOrderId: text("razorpay_order_id").unique(), // null for subscription-kind payments until charged
  razorpayPaymentId: text("razorpay_payment_id").unique(),
  razorpaySubscriptionId: text("razorpay_subscription_id"),
  plan: text("plan"), // 'annual' | 'lifetime' | null (legacy rows)
  kind: text("kind").notNull().default("order"), // 'order' | 'subscription' | 'subscription_bootstrap' | 'addon_increase'
  amount: integer("amount").notNull(), // in paise
  // pending | awaiting_mandate | success | failed | abandoned | refunded
  status: text("status").notNull(),
  invoiceUrl: text("invoice_url"),
  couponCode: text("coupon_code"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

/** Append-only money / lifecycle audit for the billing engine. */
export const billingLedger = pgTable("billing_ledger", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  paymentId: uuid("payment_id").references(() => payments.id, { onDelete: "set null" }),
  eventType: text("event_type").notNull(),
  amountPaise: integer("amount_paise").notNull().default(0),
  currency: text("currency").notNull().default("INR"),
  plan: text("plan"),
  razorpayPaymentId: text("razorpay_payment_id"),
  razorpayOrderId: text("razorpay_order_id"),
  razorpaySubscriptionId: text("razorpay_subscription_id"),
  razorpayRefundId: text("razorpay_refund_id"),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

/** Razorpay webhook inbox — one row per provider event id (dedupe). */
export const razorpayWebhookEvents = pgTable("razorpay_webhook_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  eventId: text("event_id").notNull().unique(),
  eventType: text("event_type").notNull(),
  payload: jsonb("payload").notNull().default({}),
  processingStatus: text("processing_status").notNull().default("processed"), // received | processed | failed | ignored
  error: text("error"),
  receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
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
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// 12. Email Deliveries Outbox
export const emailDeliveries = pgTable("email_deliveries", {
  id: uuid("id").defaultRandom().primaryKey(),
  eventType: text("event_type").notNull(), // billing_receipt | activation | welcome | site_live | recovery | cart_recovery | renewal_reminder | contact | lead_reply
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

// 12b. Owner replies to portfolio contact leads (Essential / Growth)
export const leadReplies = pgTable("lead_replies", {
  id: uuid("id").defaultRandom().primaryKey(),
  contactSubmissionId: uuid("contact_submission_id")
    .references(() => contactSubmissions.id, { onDelete: "cascade" })
    .notNull(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  toEmail: text("to_email").notNull(),
  toName: text("to_name"),
  fromName: text("from_name"),
  replyToEmail: text("reply_to_email"),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  status: text("status").notNull().default("queued"), // queued | sent | failed | skipped
  emailDeliveryId: uuid("email_delivery_id").references(() => emailDeliveries.id, { onDelete: "set null" }),
  providerMessageId: text("provider_message_id"),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
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

/** Customer billing identity for checkout, GST invoices, and Autopay. */
export const billingProfiles = pgTable("billing_profiles", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  fullName: text("full_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  line1: text("line1").notNull(),
  line2: text("line2"),
  city: text("city").notNull(),
  state: text("state").notNull(),
  postalCode: text("postal_code").notNull(),
  country: text("country").notNull().default("IN"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
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
  billingPeriod: text("billing_period").notNull().default("yearly"), // 'free' | 'monthly' | 'yearly' | 'lifetime'
  razorpayPlanId: text("razorpay_plan_id"),
  parsesPerMonth: integer("parses_per_month").notNull().default(0),
  updatesPerMonth: integer("updates_per_month").notNull().default(1),
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
  appliesOnce: boolean("applies_once").notNull().default(true),
  razorpayOfferId: text("razorpay_offer_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// 16b. Per-user coupon redemptions (one redemption per account per coupon)
export const couponRedemptions = pgTable("coupon_redemptions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  couponId: uuid("coupon_id").references(() => pricingCoupons.id, { onDelete: "cascade" }).notNull(),
  paymentId: uuid("payment_id").references(() => payments.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  userCouponUniq: unique("coupon_redemptions_user_coupon_uniq").on(table.userId, table.couponId),
}));

// 17. Internal web-app product analytics (BEXO ops)
export const analyticsEvents = pgTable("analytics_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id),
  sessionId: text("session_id"),
  eventName: text("event_name").notNull(),
  props: jsonb("props").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// 18. Portfolio visit hourly buckets (high-write counters)
export const portfolioVisitBuckets = pgTable("portfolio_visit_buckets", {
  id: uuid("id").defaultRandom().primaryKey(),
  profileId: uuid("profile_id").references(() => profiles.id).notNull(),
  bucketStart: timestamp("bucket_start", { withTimezone: true }).notNull(),
  path: text("path").notNull().default("/"),
  device: text("device").notNull().default("unknown"),
  referrerHost: text("referrer_host").notNull().default(""),
  viewCount: integer("view_count").notNull().default(0),
  uniqueApprox: integer("unique_approx").notNull().default(0),
}, (table) => ({
  bucketUniq: unique("portfolio_visit_buckets_uniq").on(
    table.profileId,
    table.bucketStart,
    table.path,
    table.device,
    table.referrerHost,
  ),
}));

// 19. Portfolio daily stats rollups (owner dashboards)
export const portfolioStatsDaily = pgTable("portfolio_stats_daily", {
  id: uuid("id").defaultRandom().primaryKey(),
  profileId: uuid("profile_id").references(() => profiles.id).notNull(),
  day: date("day").notNull(),
  views: integer("views").notNull().default(0),
  uniquesApprox: integer("uniques_approx").notNull().default(0),
  leads: integer("leads").notNull().default(0),
  topReferrers: jsonb("top_referrers").notNull().default([]),
  devices: jsonb("devices").notNull().default({}),
}, (table) => ({
  dayUniq: unique("portfolio_stats_daily_uniq").on(table.profileId, table.day),
}));