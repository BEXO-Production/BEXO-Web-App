import { sql } from "drizzle-orm";
import { pgTable, uuid, text, timestamp, date, integer, boolean, bigint, unique, jsonb, real } from "drizzle-orm/pg-core";

// 1. Users Table
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  phone: text("phone").unique().notNull(),
  // Public, unguessable id printed on the card's QR. Minted by the database
  // (`gen_card_code()`), never derived from the handle — a handle can change,
  // and a printed card cannot.
  cardCode: text("card_code").notNull().default(sql`gen_card_code()`),
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
  autoConnect: boolean("auto_connect").notNull().default(true),
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
  pronouns: text("pronouns"),
  nationality: text("nationality"),
  completionPct: integer("completion_pct").default(0),
  subdomain: text("subdomain").unique(),
  templateId: text("template_id").default("minimal"),
  // Private preference shared by the mobile and web share-card studios.
  // Keep it separate from the public portfolio theme fields on `users`.
  cardDesign: jsonb("card_design")
    .notNull()
    .default({ background: "forest", font: "jakarta" }),
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
  id: text("id").primaryKey(), // 'minimal' | 'cura-futuri' | ...
  name: text("name").notNull(),
  description: text("description"),
  category: text("category").notNull().default("general"),
  premium: boolean("premium").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  engine: text("engine").notNull().default("bundle"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
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

// 8. Organizations (colleges / distribution partners)
export const organizations = pgTable("organizations", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").unique().notNull(), // code prefix: PSG, NGP
  emailDomains: jsonb("email_domains").notNull().default([]), // ["psgtech.ac.in"]
  notes: text("notes"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// 8b. Activation batches (Excel upload / generate N)
export const activationBatches = pgTable("activation_batches", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id, {
    onDelete: "set null",
  }),
  label: text("label").notNull(),
  defaultPlan: text("default_plan").notNull().default("essential"),
  bindingMode: text("binding_mode").notNull().default("email_linked"), // general | email_linked
  status: text("status").notNull().default("pending"), // pending | processing | completed | failed
  totalRows: integer("total_rows").notNull().default(0),
  createdCount: integer("created_count").notNull().default(0),
  emailedCount: integer("emailed_count").notNull().default(0),
  failedCount: integer("failed_count").notNull().default(0),
  redeemedCount: integer("redeemed_count").notNull().default(0),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdByStaffId: uuid("created_by_staff_id"), // staff_users.id (no FK — defined later)
  errorSummary: text("error_summary"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

// 8c. Activation Keys Table
export const activationKeys = pgTable("activation_keys", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: text("code").unique().notNull(),
  status: text("status").default("unused"), // unused | redeemed | expired | revoked
  plan: text("plan").notNull().default("essential"), // identity | essential | growth | studentplus
  organizationId: uuid("organization_id").references(() => organizations.id, {
    onDelete: "set null",
  }),
  batchId: uuid("batch_id").references(() => activationBatches.id, {
    onDelete: "set null",
  }),
  boundEmail: text("bound_email"), // null = general; set = email-linked
  recipientName: text("recipient_name"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  redeemedBy: uuid("redeemed_by").references(() => users.id),
  redeemedAt: timestamp("redeemed_at", { withTimezone: true }),
  emailDeliveryId: uuid("email_delivery_id"),
  emailedAt: timestamp("emailed_at", { withTimezone: true }),
  createdByStaffId: uuid("created_by_staff_id"), // staff_users.id
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// 9. Subscriptions Table
export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id).unique().notNull(),
  plan: text("plan").notNull(), // identity | essential | growth | studentplus | free (+ legacy)
  status: text("status").notNull(), // active | expired | free
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  razorpaySubscriptionId: text("razorpay_subscription_id").unique(),
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
  kind: text("kind").notNull().default("order"), // 'order' | 'subscription' | 'subscription_bootstrap' | 'subscription_enable' | 'addon_increase' | 'activation' | 'admin_collect' | 'admin_collect_next'
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

// 10c. UPI Autopay Mandates (Orders + recurring-token model).
// One high-ceiling mandate per user (max_amount up to ₹2000) that funds the base
// plan AND usage-based storage overage in a single monthly debit — no re-auth.
// Kept separate from `subscriptions` so the legacy Razorpay Subscriptions flow
// remains untouched when UPI_AUTOPAY_ENABLED is off.
export const autopayMandates = pgTable("autopay_mandates", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).unique().notNull(),
  plan: text("plan").notNull(), // base plan this mandate funds: identity | essential | growth
  method: text("method").notNull().default("upi"),
  razorpayCustomerId: text("razorpay_customer_id"),
  razorpayTokenId: text("razorpay_token_id").unique(), // recurring token used for subsequent debits
  authOrderId: text("auth_order_id"), // authorization order shown at Checkout
  authPaymentId: text("auth_payment_id"), // first payment that created the token
  maxAmountPaise: integer("max_amount_paise").notNull().default(200000), // ₹2000 ceiling
  // pending_authorization | active | paused | revoked | expired | halted
  status: text("status").notNull().default("pending_authorization"),
  currentPeriodStart: timestamp("current_period_start", { withTimezone: true }),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  nextChargeAt: timestamp("next_charge_at", { withTimezone: true }),
  tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
  lastChargeAt: timestamp("last_charge_at", { withTimezone: true }),
  lastChargeStatus: text("last_charge_status"),
  failureCount: integer("failure_count").notNull().default(0),
  couponCode: text("coupon_code"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// 10d. Scheduled Charges — the merchant-run billing loop for UPI Autopay.
// Each row is one upcoming auto-debit (base plan + storage overage). Rows are
// created ahead of the debit date so we can send the 24h pre-debit reminder,
// then charged via payments.createRecurringPayment against the mandate token.
export const scheduledCharges = pgTable("scheduled_charges", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  mandateId: uuid("mandate_id").references(() => autopayMandates.id, { onDelete: "cascade" }).notNull(),
  razorpayTokenId: text("razorpay_token_id"),
  plan: text("plan").notNull(),
  kind: text("kind").notNull().default("renewal"), // renewal | storage_overage | combined
  basePaise: integer("base_paise").notNull().default(0),
  storagePaise: integer("storage_paise").notNull().default(0),
  storageBlocks: integer("storage_blocks").notNull().default(0),
  totalPaise: integer("total_paise").notNull(),
  scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
  reminderSentAt: timestamp("reminder_sent_at", { withTimezone: true }),
  // scheduled | reminded | charging | success | failed | skipped | cancelled
  status: text("status").notNull().default("scheduled"),
  attemptCount: integer("attempt_count").notNull().default(0),
  razorpayOrderId: text("razorpay_order_id"),
  razorpayPaymentId: text("razorpay_payment_id"),
  claimedAt: timestamp("claimed_at", { withTimezone: true }),
  lastError: text("last_error"),
  idempotencyKey: text("idempotency_key").unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
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

// 13. Resume Parse Attempts (async parse queue + entitlement/abuse audit)
export const resumeParseAttempts = pgTable("resume_parse_attempts", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  status: text("status").default("started").notNull(), // queued | processing | succeeded | failed | timed_out
  fileHash: text("file_hash"),
  fileName: text("file_name"),
  fileSizeBytes: integer("file_size_bytes"),
  model: text("model"),
  errorMessage: text("error_message"),
  errorCode: text("error_code"),
  resumeText: text("resume_text"),
  resumeUrl: text("resume_url"),
  result: jsonb("result"),
  claimedAt: timestamp("claimed_at", { withTimezone: true }),
  retryCount: integer("retry_count").default(0).notNull(),
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
  /** Null = all plans; otherwise string[] of plan ids */
  allowedPlans: jsonb("allowed_plans"),
  /** Only redeemable if user has never had a successful payment */
  firstCustomerOnly: boolean("first_customer_only").notNull().default(false),
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

/** Staff console accounts (BEXO Admin at bexo.acedigital.cc). */
export const staffUsers = pgTable("staff_users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").unique().notNull(),
  name: text("name"),
  phone: text("phone"),
  passwordHash: text("password_hash"),
  role: text("role").notNull().default("support"), // super_admin | support | billing | ops
  isActive: boolean("is_active").notNull().default(true),
  /** True after invite / admin reset until the employee sets their own password. */
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  passwordResetTokenHash: text("password_reset_token_hash"),
  passwordResetExpiresAt: timestamp("password_reset_expires_at", { withTimezone: true }),
  linkedUserId: uuid("linked_user_id").references(() => users.id, { onDelete: "set null" }),
  invitedBy: uuid("invited_by"),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const staffInvites = pgTable("staff_invites", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull(),
  name: text("name"),
  phone: text("phone"),
  role: text("role").notNull().default("support"),
  tokenHash: text("token_hash").unique().notNull(),
  invitedBy: uuid("invited_by").references(() => staffUsers.id, { onDelete: "set null" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const adminAuditLog = pgTable("admin_audit_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  actorStaffId: uuid("actor_staff_id").references(() => staffUsers.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  targetType: text("target_type"),
  targetId: text("target_id"),
  meta: jsonb("meta").notNull().default({}),
  ip: text("ip"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const supportNotes = pgTable("support_notes", {
  id: uuid("id").defaultRandom().primaryKey(),
  targetType: text("target_type").notNull(), // user | portfolio | contact_submission
  targetId: text("target_id").notNull(),
  authorStaffId: uuid("author_staff_id").references(() => staffUsers.id, { onDelete: "set null" }),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});
/** Staff-created support tickets (phone/email complaints). Not portfolio contact leads. */
export const supportTickets = pgTable("support_tickets", {
  id: uuid("id").defaultRandom().primaryKey(),
  ticketNumber: text("ticket_number").unique().notNull(),
  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  createdByStaffId: uuid("created_by_staff_id").references(() => staffUsers.id, {
    onDelete: "set null",
  }),
  assigneeStaffId: uuid("assignee_staff_id").references(() => staffUsers.id, {
    onDelete: "set null",
  }),
  channel: text("channel").notNull().default("phone"), // phone | email | other
  subject: text("subject").notNull(),
  description: text("description").notNull(),
  status: text("status").notNull().default("open"), // open | in_progress | resolved | closed
  priority: text("priority").notNull().default("normal"), // low | normal | high
  requesterEmail: text("requester_email"),
  requesterPhone: text("requester_phone"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  closedAt: timestamp("closed_at", { withTimezone: true }),
});

export const supportTicketEvents = pgTable("support_ticket_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  ticketId: uuid("ticket_id")
    .references(() => supportTickets.id, { onDelete: "cascade" })
    .notNull(),
  actorStaffId: uuid("actor_staff_id").references(() => staffUsers.id, {
    onDelete: "set null",
  }),
  eventType: text("event_type").notNull(), // created | status_change | note | reply | assignment
  visibility: text("visibility").notNull().default("internal"), // internal | customer
  body: text("body"),
  fromStatus: text("from_status"),
  toStatus: text("to_status"),
  meta: jsonb("meta").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

/** Marketing site Contact Us → BEXO Admin CRM Leads. */
export const marketingLeads = pgTable("marketing_leads", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  subject: text("subject"),
  message: text("message").notNull(),
  source: text("source").notNull().default("marketing_contact"),
  pageUrl: text("page_url"),
  // new | contacted | qualified | closed | spam
  status: text("status").notNull().default("new"),
  ipHash: text("ip_hash"),
  notes: text("notes"),
  assignedStaffId: uuid("assigned_staff_id").references(() => staffUsers.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// 37. Connections — one row per ordered pair; `requester` scanned `addressee`.
export const connections = pgTable("connections", {
  id: uuid("id").defaultRandom().primaryKey(),
  requesterId: uuid("requester_id").references(() => users.id).notNull(),
  addresseeId: uuid("addressee_id").references(() => users.id).notNull(),
  status: text("status").notNull().default("pending"), // pending | accepted | declined
  source: text("source").notNull().default("qr"), // qr | nfc | link | manual
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  respondedAt: timestamp("responded_at", { withTimezone: true }),
}, (table) => {
  return {
    pairUnique: unique("connections_pair_key").on(table.requesterId, table.addresseeId),
  };
});

// 38. Card scans — every tap/scan of a card, connection or not.
export const cardScans = pgTable("card_scans", {
  id: uuid("id").defaultRandom().primaryKey(),
  cardOwnerId: uuid("card_owner_id").references(() => users.id).notNull(),
  scannerId: uuid("scanner_id").references(() => users.id),
  source: text("source").notNull().default("qr"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
