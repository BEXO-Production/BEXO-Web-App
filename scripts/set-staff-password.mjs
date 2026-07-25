#!/usr/bin/env node
// Generates a staff password hash in the same format the admin API expects
// (scrypt, "<saltHex>:<hashHex>") and prints the UPDATE statement to run.
//
//   node scripts/set-staff-password.mjs admin@acedigital.cc
//
// The password is read from stdin so it never lands in shell history.

import { randomBytes, scryptSync } from "node:crypto";
import { createInterface } from "node:readline";

const email = process.argv[2];
if (!email) {
  console.error("Usage: node scripts/set-staff-password.mjs <staff-email>");
  process.exit(1);
}

const rl = createInterface({ input: process.stdin, output: process.stderr, terminal: true });
rl.question(`New password for ${email}: `, (password) => {
  rl.close();
  if (password.length < 12) {
    console.error("Refusing: use at least 12 characters for a production admin account.");
    process.exit(1);
  }

  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");

  console.log(`
UPDATE public.staff_users
SET password_hash = '${salt}:${hash}',
    must_change_password = false,
    is_active = true,
    updated_at = now()
WHERE lower(email) = lower('${email}');
`);
});
