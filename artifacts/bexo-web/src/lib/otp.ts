/**
 * Matches the MSG91 OTP Widget's configured OTP length (Widget Settings in
 * the MSG91 dashboard) and artifacts/api-server's OTP_LENGTH (routes/auth.ts).
 * Shared here so login.tsx and step-1.tsx — which duplicate the same OTP
 * entry form — can't drift out of sync with each other or the server again.
 */
export const OTP_LENGTH = 4;
