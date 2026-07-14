import { pgTable, uuid, text, timestamp, date, integer, boolean, bigint, unique, jsonb } from "drizzle-orm/pg-core";

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
  openToHire: boolean("open_to_hire").default(false),
  templateId: text("template_id").default("minimal"),
  themeColor: text("theme_color").default("blue"),
  resumeParsesThisMonth: integer("resume_parses_this_month").default(0),
  lastResumeParseReset: timestamp("last_resume_parse_reset", { withTimezone: true }).defaultNow(),
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
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// 10. Payments Table
export const payments = pgTable("payments", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  razorpayOrderId: text("razorpay_order_id").unique().notNull(),
  razorpayPaymentId: text("razorpay_payment_id").unique(),
  amount: integer("amount").notNull(), // in paise
  status: text("status").notNull(), // 'pending' | 'success' | 'failed'
  invoiceUrl: text("invoice_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});