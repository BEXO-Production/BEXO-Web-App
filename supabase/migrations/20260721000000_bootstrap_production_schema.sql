CREATE TABLE "activation_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"status" text DEFAULT 'unused',
	"redeemed_by" uuid,
	"redeemed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "activation_keys_code_unique" UNIQUE("code")
);

CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"section_type" text,
	"entry_id" text,
	"created_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE "billing_settings" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"gst_rate" real DEFAULT 0.18 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE "contact_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"handle" text NOT NULL,
	"sender_name" text NOT NULL,
	"sender_email" text NOT NULL,
	"sender_phone" text,
	"message" text NOT NULL,
	"delivery_status" text DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"ip_hash" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE "email_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_type" text NOT NULL,
	"recipient" text NOT NULL,
	"subject" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_retry_at" timestamp with time zone,
	"provider_message_id" text,
	"last_error" text,
	"user_id" uuid,
	"related_id" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"sent_at" timestamp with time zone,
	CONSTRAINT "email_deliveries_dedupe_key_unique" UNIQUE("dedupe_key")
);

CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"razorpay_order_id" text NOT NULL,
	"razorpay_payment_id" text,
	"amount" integer NOT NULL,
	"status" text NOT NULL,
	"invoice_url" text,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "payments_razorpay_order_id_unique" UNIQUE("razorpay_order_id"),
	CONSTRAINT "payments_razorpay_payment_id_unique" UNIQUE("razorpay_payment_id")
);

CREATE TABLE "portfolios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"handle" text NOT NULL,
	"selected_template_id" text,
	"selected_theme_id" text,
	"is_published" boolean DEFAULT false,
	"published_at" timestamp with time zone,
	"draft_preview_token" text,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "portfolios_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "portfolios_handle_unique" UNIQUE("handle"),
	CONSTRAINT "portfolios_draft_preview_token_unique" UNIQUE("draft_preview_token")
);

CREATE TABLE "pricing_coupons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"description" text,
	"discount_type" text NOT NULL,
	"percent_off" real,
	"inr_off" integer,
	"plan_prices" jsonb,
	"valid_from" timestamp with time zone,
	"valid_until" timestamp with time zone,
	"max_uses" integer,
	"used_count" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "pricing_coupons_code_unique" UNIQUE("code")
);

CREATE TABLE "pricing_plans" (
	"id" text PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"subtitle" text,
	"price_inr_ex_gst" integer DEFAULT 0 NOT NULL,
	"storage_bytes" bigint NOT NULL,
	"is_purchasable" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_highlighted" boolean DEFAULT false NOT NULL,
	"features" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE "profile_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"type" text NOT NULL,
	"entries" jsonb DEFAULT '[]'::jsonb,
	"reviewed_at" timestamp with time zone,
	CONSTRAINT "profile_type_unique" UNIQUE("profile_id","type")
);

CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"handle" text,
	"headline" text,
	"career_goal" text,
	"bio" text,
	"completion_pct" integer DEFAULT 0,
	"subdomain" text,
	"template_id" text DEFAULT 'minimal',
	"is_premium" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "profiles_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "profiles_handle_unique" UNIQUE("handle"),
	CONSTRAINT "profiles_subdomain_unique" UNIQUE("subdomain")
);

CREATE TABLE "resume_parse_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"status" text DEFAULT 'started' NOT NULL,
	"file_hash" text,
	"file_name" text,
	"file_size_bytes" integer,
	"model" text,
	"error_message" text,
	"consumed_quota" boolean DEFAULT false NOT NULL,
	"during_onboarding" boolean DEFAULT true NOT NULL,
	"ip_hash" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"completed_at" timestamp with time zone
);

CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"plan" text NOT NULL,
	"status" text NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "subscriptions_user_id_unique" UNIQUE("user_id")
);

CREATE TABLE "templates" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text
);

CREATE TABLE "theme_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" text NOT NULL,
	"name" text NOT NULL,
	"tokens" jsonb NOT NULL
);

CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" text NOT NULL,
	"phone_verified_at" timestamp with time zone,
	"email" text,
	"oauth_provider" text,
	"oauth_id" text,
	"name" text,
	"dob" date,
	"photo_url" text,
	"resume_url" text,
	"profile_photo_asset_id" uuid,
	"storage_used_bytes" bigint DEFAULT 0,
	"storage_quota_bytes" bigint DEFAULT 10485760,
	"storage_bonus_bytes" bigint DEFAULT 0,
	"open_to_hire" boolean DEFAULT false,
	"template_id" text DEFAULT 'minimal',
	"theme_color" text DEFAULT 'blue',
	"theme_bg" text DEFAULT 'grid',
	"resume_parses_this_month" integer DEFAULT 0,
	"last_resume_parse_reset" timestamp with time zone DEFAULT now(),
	"onboarding_successful_parses" integer DEFAULT 0,
	"onboarding_completed_at" timestamp with time zone,
	"last_onboarding_activity_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "users_phone_unique" UNIQUE("phone"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);

ALTER TABLE "activation_keys" ADD CONSTRAINT "activation_keys_redeemed_by_users_id_fk" FOREIGN KEY ("redeemed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "assets" ADD CONSTRAINT "assets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "contact_submissions" ADD CONSTRAINT "contact_submissions_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "contact_submissions" ADD CONSTRAINT "contact_submissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "email_deliveries" ADD CONSTRAINT "email_deliveries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "portfolios" ADD CONSTRAINT "portfolios_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "portfolios" ADD CONSTRAINT "portfolios_selected_template_id_templates_id_fk" FOREIGN KEY ("selected_template_id") REFERENCES "public"."templates"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "profile_sections" ADD CONSTRAINT "profile_sections_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "resume_parse_attempts" ADD CONSTRAINT "resume_parse_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "theme_variants" ADD CONSTRAINT "theme_variants_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."templates"("id") ON DELETE no action ON UPDATE no action;
