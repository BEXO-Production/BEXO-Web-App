import { db } from "./index";
import { templates } from "./schema";

async function main(): Promise<void> {
  console.log("Seeding templates...");
  try {
    await db.insert(templates).values([
      { id: "minimal", name: "Minimal", description: "Minimalist professional layout" },
      { id: "academic", name: "Academic", description: "Structured layout for academic and research credentials" },
      { id: "creative", name: "Creative", description: "Bold layout for designers, developers, and creatives" },
    ]).onConflictDoNothing();
    console.log("Templates seeded successfully!");
  } catch (err) {
    console.error("Error seeding templates:", err);
  }
}

main().then(() => process.exit(0));
