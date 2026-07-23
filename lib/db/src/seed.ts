import { db } from "./index";
import {
  activationKeys,
  billingSettings,
  pricingCoupons,
  pricingPlans,
  staffUsers,
  templates,
  themeVariants,
} from "./schema";
import { sql } from "drizzle-orm";

/**
 * Idempotent catalog seed for local / recovery. Production prefers SQL migrations.
 */
async function main(): Promise<void> {
  console.log("Seeding billing_settings…");
  await db
    .insert(billingSettings)
    .values({ id: "default", currency: "INR", gstRate: 0.18 })
    .onConflictDoUpdate({
      target: billingSettings.id,
      set: { currency: "INR", gstRate: 0.18, updatedAt: new Date() },
    });

  console.log("Seeding pricing plans…");
  const plans = [
    {
      id: "free",
      displayName: "Free",
      subtitle: "Basic portfolio to prove the flow",
      priceInrExGst: 0,
      storageBytes: 10485760,
      isPurchasable: true,
      sortOrder: 0,
      isHighlighted: false,
      features: ["Basic template", "10MB storage", "1 update per month", "Path-based link (no subdomain)"],
      isActive: true,
      billingPeriod: "free",
      parsesPerMonth: 0,
      updatesPerMonth: 1,
      razorpayPlanId: null as string | null,
    },
    {
      id: "identity",
      displayName: "Identity Plan",
      subtitle: "Your professional identity, live",
      priceInrExGst: 59,
      storageBytes: 52428800,
      isPurchasable: true,
      sortOrder: 1,
      isHighlighted: false,
      features: [
        "yourname subdomain",
        "Premium templates",
        "50MB cloud storage",
        "1 AI resume parse / month",
        "3 updates / month",
        "Monthly invoice in dashboard",
      ],
      isActive: true,
      billingPeriod: "monthly",
      parsesPerMonth: 1,
      updatesPerMonth: 3,
      razorpayPlanId: "plan_TGaZShgGee2USr",
    },
    {
      id: "essential",
      displayName: "Essential Plan",
      subtitle: "Everything in Identity, more room to grow",
      priceInrExGst: 199,
      storageBytes: 104857600,
      isPurchasable: true,
      sortOrder: 2,
      isHighlighted: true,
      features: [
        "Everything in Identity",
        "100MB cloud storage",
        "3 AI resume parses / month",
        "10 updates / month",
        "Access to exclusive templates",
      ],
      isActive: true,
      billingPeriod: "monthly",
      parsesPerMonth: 3,
      updatesPerMonth: 10,
      razorpayPlanId: "plan_TGaZT3LRfjGLgC",
    },
    {
      id: "growth",
      displayName: "Growth Plan",
      subtitle: "Essential, billed yearly",
      priceInrExGst: 999,
      storageBytes: 104857600,
      isPurchasable: true,
      sortOrder: 3,
      isHighlighted: false,
      features: [
        "Everything in Essential",
        "Billed once a year",
        "100MB cloud storage",
        "3 AI resume parses / month",
        "10 updates / month",
      ],
      isActive: true,
      billingPeriod: "yearly",
      parsesPerMonth: 3,
      updatesPerMonth: 10,
      razorpayPlanId: "plan_TGaZTJfF2XLTfh",
    },
    {
      id: "studentplus",
      displayName: "Student+ Plan",
      subtitle: "Identity, forever - one payment",
      priceInrExGst: 1999,
      storageBytes: 52428800,
      isPurchasable: true,
      sortOrder: 4,
      isHighlighted: false,
      features: [
        "Everything in Identity",
        "One-time payment",
        "No renewals ever",
        "50MB cloud storage",
        "1 AI resume parse / month",
        "3 updates / month",
      ],
      isActive: true,
      billingPeriod: "lifetime",
      parsesPerMonth: 1,
      updatesPerMonth: 3,
      razorpayPlanId: null,
    },
    {
      id: "storage_addon",
      displayName: "Storage Increase",
      subtitle: "+50MB per block, billed monthly",
      priceInrExGst: 25,
      storageBytes: 52428800,
      isPurchasable: true,
      sortOrder: 99,
      isHighlighted: false,
      features: [
        "+50MB per block on top of your base plan",
        "Billed monthly via Razorpay Autopay",
        "Cancel anytime",
      ],
      isActive: true,
      billingPeriod: "monthly",
      parsesPerMonth: 0,
      updatesPerMonth: 0,
      razorpayPlanId: "plan_TGaZTXHFk6pYCx",
    },
  ] as const;

  for (const p of plans) {
    await db
      .insert(pricingPlans)
      .values(p)
      .onConflictDoUpdate({
        target: pricingPlans.id,
        set: {
          displayName: p.displayName,
          subtitle: p.subtitle,
          priceInrExGst: p.priceInrExGst,
          storageBytes: p.storageBytes,
          isPurchasable: p.isPurchasable,
          sortOrder: p.sortOrder,
          isHighlighted: p.isHighlighted,
          features: p.features as unknown as string[],
          isActive: p.isActive,
          billingPeriod: p.billingPeriod,
          parsesPerMonth: p.parsesPerMonth,
          updatesPerMonth: p.updatesPerMonth,
          razorpayPlanId: p.razorpayPlanId,
          updatedAt: new Date(),
        },
      });
  }

  console.log("Seeding coupons…");
  await db
    .insert(pricingCoupons)
    .values([
      {
        code: "BEXODEV",
        description: "Developer test coupon — ₹1 for first invoice",
        discountType: "plan_prices",
        planPrices: { identity: 1, essential: 1, growth: 1, studentplus: 1, storage_addon: 1 },
        appliesOnce: true,
        isActive: true,
      },
      {
        code: "BEXO50",
        description: "50% off first invoice",
        discountType: "percent",
        percentOff: 50,
        appliesOnce: true,
        isActive: true,
      },
      {
        code: "STUDENT",
        description: "Student discount ₹200 off",
        discountType: "inr_fixed",
        inrOff: 200,
        firstCustomerOnly: true,
        appliesOnce: true,
        isActive: true,
      },
    ])
    .onConflictDoNothing();

  console.log("Seeding templates…");
  await db
    .insert(templates)
    .values([
      {
        id: "minimal",
        name: "Minimal",
        description: "Clean path-based starter portfolio",
        category: "free",
        premium: false,
        isActive: true,
        sortOrder: 0,
        engine: "spa-minimal",
      },
      {
        id: "academic",
        name: "Academic",
        description: "Structured academic-focused layout",
        category: "legacy",
        premium: false,
        isActive: false,
        sortOrder: 0,
        engine: "bundle",
      },
      {
        id: "creative",
        name: "Creative",
        description: "Bold creative portfolio layout",
        category: "legacy",
        premium: false,
        isActive: false,
        sortOrder: 0,
        engine: "bundle",
      },
      {
        id: "cura-futuri",
        name: "Cura Futuri",
        description: "Modern, high-contrast editorial portfolio with motion and media galleries",
        category: "premium",
        premium: true,
        isActive: true,
        sortOrder: 10,
        engine: "bundle",
      },
      {
        id: "sierra-montana",
        name: "Sierra Montana",
        description: "Elegant storytelling portfolio with smooth scrolling",
        category: "premium",
        premium: true,
        isActive: true,
        sortOrder: 20,
        engine: "bundle",
      },
      {
        id: "nico-palmer",
        name: "Nico Palmer",
        description: "Bold cinematic portfolio for creative professionals",
        category: "premium",
        premium: true,
        isActive: true,
        sortOrder: 30,
        engine: "bundle",
      },
    ])
    .onConflictDoNothing();

  console.log("Seeding theme variants…");
  const existingThemes = await db.select({ id: themeVariants.id }).from(themeVariants).limit(1);
  if (!existingThemes.length) {
    await db.insert(themeVariants).values([
      { templateId: "minimal", name: "Default", tokens: { accent: "blue", bg: "grid" } },
      { templateId: "cura-futuri", name: "Default", tokens: { accent: "editorial", bg: "dark" } },
      { templateId: "sierra-montana", name: "Default", tokens: { accent: "warm", bg: "cream" } },
      { templateId: "nico-palmer", name: "Default", tokens: { accent: "cinematic", bg: "black" } },
    ]);
  }

  console.log("Seeding activation keys…");
  await db
    .insert(activationKeys)
    .values([
      { code: "BEXO-KAVIN-2026", status: "unused" },
      { code: "BEXO-PRO-LIFETIME", status: "unused" },
      { code: "BEXO-TEST-1234", status: "unused" },
    ])
    .onConflictDoNothing();

  console.log("Seeding staff…");
  await db
    .insert(staffUsers)
    .values([
      { email: "admin@acedigital.cc", name: "Ace Digital Admin", role: "super_admin", isActive: true },
      { email: "kavinbalaji365@gmail.com", name: "Kavin Balaji", role: "super_admin", isActive: true },
    ])
    .onConflictDoNothing();

  await db.execute(sql`UPDATE pricing_plans SET is_active = false, is_purchasable = false WHERE id IN ('annual', 'lifetime')`);

  console.log("Seed complete.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
