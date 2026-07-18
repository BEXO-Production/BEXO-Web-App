import { db } from "./index";
import { templates, activationKeys } from "./schema";

async function main(): Promise<void> {
  console.log("Seeding templates...");
  try {
    await db.insert(templates).values([
      { id: "minimal", name: "Minimal", description: "Minimalist professional layout" },
      { id: "academic", name: "Academic", description: "Structured layout for academic and research credentials" },
      { id: "creative", name: "Creative", description: "Bold layout for designers, developers, and creatives" },
      { id: "cura-futuri", name: "Cura Futuri", description: "Modern, high-contrast editorial portfolio with motion and media galleries" },
      { id: "sierra-montana", name: "Sierra Montana", description: "Elegant storytelling portfolio with smooth scrolling" },
      { id: "nico-palmer", name: "Nico Palmer", description: "Bold cinematic portfolio for creative professionals" },
    ]).onConflictDoNothing();
    console.log("Templates seeded successfully!");

    console.log("Seeding activation keys...");
    await db.insert(activationKeys).values([
      { code: "BEXO-KAVIN-2026", status: "unused" },
      { code: "BEXO-PRO-LIFETIME", status: "unused" },
      { code: "BEXO-TEST-1234", status: "unused" },
    ]).onConflictDoNothing();
    console.log("Activation keys seeded successfully!");
  } catch (err) {
    console.error("Error seeding database:", err);
  }
}

main().then(() => process.exit(0));
