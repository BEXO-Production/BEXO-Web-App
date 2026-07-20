import { scheduleLifecycleEmails } from "../src/lib/lifecycleEmails";
import { getCartRecoveryEmail, getRenewalReminderEmail } from "../src/lib/templates";

async function main() {
  const cart = getCartRecoveryEmail("Test", "https://atbexo.com/billing");
  const renew = getRenewalReminderEmail("Test", "https://atbexo.com/billing", "1 Aug 2026");
  if (!cart.includes("Complete checkout") || !renew.includes("Renew Yearly")) {
    throw new Error("templates broken");
  }
  console.log("OK templates");
  await scheduleLifecycleEmails();
  console.log("OK scheduleLifecycleEmails ran");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
