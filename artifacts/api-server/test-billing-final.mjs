import { sendBillingEmail } from './dist/lib/billing.js';
import dotenv from 'dotenv';
import path from 'path';

// Load variables from the root workspace
dotenv.config({ path: path.resolve('../../.env') });

async function main() {
  const to = 'kavinbalaji365@gmail.com';
  const name = 'Kavin';
  
  console.log("Dispatching final test emails...");
  
  // 1. Payment Email
  console.log("Sending Premium Payment Receipt...");
  await sendBillingEmail(to, name, 'lifetime', 2999, 'pay_Lifetime123ABC');
  
  // 2. Activation Code Email
  console.log("Sending Activation Code Receipt...");
  await sendBillingEmail(to, name, 'activation_code', 0, 'BEXO-PRO-2024');

  console.log("Done!");
}

main();
