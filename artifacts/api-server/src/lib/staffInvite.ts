/**
 * Staff employee invites: auto-password, 7-day expiry, email delivery, reinvite.
 */
import { createHash, randomBytes, scryptSync } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db, staffInvites, staffUsers, users } from "@workspace/db";
import { logger } from "./logger";
import { sendEmail, isSmtpConfigured } from "./mailer";
import { enqueueEmail } from "./emailOutbox";
import { getStaffInviteEmail, getStaffPasswordResetEmail } from "./templates";
import type { StaffRole } from "../middlewares/staffAuth";

export const STAFF_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const ADMIN_ORIGIN = () =>
  (process.env.ADMIN_URL || "https://bexo.acedigital.cc").replace(/\/$/, "");

export function hashStaffPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Readable temporary password (12 chars, no ambiguous 0/O/1/l). */
export function generateTemporaryPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$";
  const bytes = randomBytes(12);
  let out = "";
  for (let i = 0; i < 12; i++) out += alphabet[bytes[i]! % alphabet.length];
  return out;
}

export function generateInviteToken(): string {
  return randomBytes(24).toString("hex");
}

export type IssueStaffInviteInput = {
  email: string;
  name?: string | null;
  phone?: string | null;
  role?: StaffRole | string;
  invitedBy?: string | null;
  /** When true, allow resetting an already-active staff account. */
  forceResetActive?: boolean;
};

export type IssueStaffInviteResult = {
  invite: typeof staffInvites.$inferSelect;
  inviteUrl: string;
  loginUrl: string;
  temporaryPassword: string;
  expiresAt: Date;
  emailSent: boolean;
  emailError?: string;
  staffId: string;
  reissued: boolean;
};

async function expirePendingInvitesForEmail(email: string) {
  await db
    .update(staffInvites)
    .set({ expiresAt: new Date() })
    .where(and(eq(staffInvites.email, email), isNull(staffInvites.acceptedAt), sql`${staffInvites.expiresAt} > now()`));
}

async function deliverStaffInviteEmail(opts: {
  email: string;
  name: string | null;
  role: string;
  temporaryPassword: string;
  inviteUrl: string;
  loginUrl: string;
  expiresAt: Date;
  inviteId: string;
  isReinvite: boolean;
}): Promise<{ emailSent: boolean; emailError?: string }> {
  const expiresLabel = opts.expiresAt.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
  const subject = opts.isReinvite
    ? "BEXO Admin — your invite was renewed"
    : "You're invited to BEXO Admin";
  const html = getStaffInviteEmail({
    userName: opts.name || opts.email.split("@")[0] || "there",
    email: opts.email,
    role: opts.role,
    temporaryPassword: opts.temporaryPassword,
    inviteUrl: opts.inviteUrl,
    loginUrl: opts.loginUrl,
    expiresLabel,
    isReinvite: opts.isReinvite,
  });

  // Immediate send so the admin UI gets truthful feedback.
  const direct = await sendEmail(opts.email, subject, html);
  if (!direct.ok) {
    logger.warn(
      { email: opts.email, error: direct.error, skipped: direct.skipped },
      "Staff invite email direct send failed",
    );
  }

  // Also enqueue for retry / audit trail (unique dedupe per issue).
  await enqueueEmail({
    eventType: "staff_invite",
    recipient: opts.email,
    subject,
    dedupeKey: `staff_invite:${opts.inviteId}:${Date.now()}`,
    relatedId: opts.inviteId,
    payload: {
      userName: opts.name || opts.email.split("@")[0] || "there",
      email: opts.email,
      role: opts.role,
      temporaryPassword: opts.temporaryPassword,
      inviteUrl: opts.inviteUrl,
      loginUrl: opts.loginUrl,
      expiresLabel,
      isReinvite: opts.isReinvite,
    },
  }).catch((err) => logger.warn({ err }, "staff invite enqueue failed"));

  if (direct.ok) return { emailSent: true };
  if (!isSmtpConfigured()) {
    return {
      emailSent: false,
      emailError: "SMTP is not configured on the API — invite was created but email was not sent.",
    };
  }
  return {
    emailSent: false,
    emailError: direct.error || "Failed to send invite email.",
  };
}

/**
 * Create (or re-issue) a staff invite: new token, auto password, 7-day expiry, email.
 */
export async function issueStaffInvite(
  input: IssueStaffInviteInput,
  opts?: { isReinvite?: boolean },
): Promise<IssueStaffInviteResult> {
  const email = String(input.email || "")
    .toLowerCase()
    .trim();
  const name = String(input.name || "").trim() || null;
  const phone = String(input.phone || "").trim() || null;
  const role = (["super_admin", "billing", "ops", "support"].includes(String(input.role || ""))
    ? String(input.role)
    : "support") as StaffRole;
  const isReinvite = !!opts?.isReinvite;

  if (!email.includes("@")) {
    throw Object.assign(new Error("Valid email is required"), { status: 400 });
  }

  const [existingStaff] = await db
    .select()
    .from(staffUsers)
    .where(eq(staffUsers.email, email))
    .limit(1);

  if (existingStaff?.isActive && !isReinvite && !input.forceResetActive) {
    // Allow create when they only have a pending (not-yet-accepted) onboarding —
    // treat as reissue. Block only if they already accepted (no open invite needed).
    const [openInvite] = await db
      .select({ id: staffInvites.id })
      .from(staffInvites)
      .where(
        and(
          eq(staffInvites.email, email),
          isNull(staffInvites.acceptedAt),
          sql`${staffInvites.expiresAt} > now()`,
        ),
      )
      .limit(1);
    if (!openInvite) {
      const [accepted] = await db
        .select({ id: staffInvites.id })
        .from(staffInvites)
        .where(and(eq(staffInvites.email, email), sql`${staffInvites.acceptedAt} is not null`))
        .limit(1);
      if (accepted) {
        throw Object.assign(
          new Error(
            "An active staff account already exists for this email. Use Reinvite on their row to reset password and resend, or deactivate first.",
          ),
          { status: 409, code: "STAFF_ACTIVE" },
        );
      }
    }
  }

  await expirePendingInvitesForEmail(email);

  const rawToken = generateInviteToken();
  const temporaryPassword = generateTemporaryPassword();
  const expiresAt = new Date(Date.now() + STAFF_INVITE_TTL_MS);
  const passwordHash = hashStaffPassword(temporaryPassword);

  const [invite] = await db
    .insert(staffInvites)
    .values({
      email,
      name,
      phone,
      role,
      tokenHash: hashInviteToken(rawToken),
      invitedBy: input.invitedBy || null,
      expiresAt,
    })
    .returning();

  const [linked] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  let staffId: string;
  if (existingStaff) {
    const [updated] = await db
      .update(staffUsers)
      .set({
        name: name || existingStaff.name,
        phone: phone || existingStaff.phone,
        role,
        passwordHash,
        mustChangePassword: true,
        passwordResetTokenHash: null,
        passwordResetExpiresAt: null,
        // Stay active so emailed password works immediately; invite marks onboarding done.
        isActive: true,
        invitedBy: input.invitedBy || existingStaff.invitedBy,
        linkedUserId: linked?.id || existingStaff.linkedUserId,
        updatedAt: new Date(),
      })
      .where(eq(staffUsers.id, existingStaff.id))
      .returning();
    staffId = updated.id;
  } else {
    const [created] = await db
      .insert(staffUsers)
      .values({
        email,
        name,
        phone,
        role,
        passwordHash,
        mustChangePassword: true,
        isActive: true,
        invitedBy: input.invitedBy || null,
        linkedUserId: linked?.id || null,
      })
      .returning();
    staffId = created.id;
  }

  const inviteUrl = `${ADMIN_ORIGIN()}/invite?token=${rawToken}`;
  const loginUrl = `${ADMIN_ORIGIN()}/login`;

  const delivery = await deliverStaffInviteEmail({
    email,
    name,
    role,
    temporaryPassword,
    inviteUrl,
    loginUrl,
    expiresAt,
    inviteId: invite.id,
    isReinvite,
  });

  logger.info(
    {
      email,
      inviteId: invite.id,
      staffId,
      expiresAt: expiresAt.toISOString(),
      emailSent: delivery.emailSent,
      isReinvite,
    },
    "Staff invite issued",
  );

  return {
    invite,
    inviteUrl,
    loginUrl,
    temporaryPassword,
    expiresAt,
    emailSent: delivery.emailSent,
    emailError: delivery.emailError,
    staffId,
    reissued: isReinvite,
  };
}

/**
 * Reinvite by invite row id — only for pending/expired invites.
 * Accepted invites must use POST /staff/:id/reset-password instead.
 */
export async function reissueStaffInviteById(
  inviteId: string,
  invitedBy?: string | null,
): Promise<IssueStaffInviteResult> {
  const [row] = await db.select().from(staffInvites).where(eq(staffInvites.id, inviteId)).limit(1);
  if (!row) {
    throw Object.assign(new Error("Invite not found"), { status: 404 });
  }
  if (row.acceptedAt) {
    throw Object.assign(
      new Error(
        "This invite was already accepted. Use Reset password on Active staff instead of Reinvite.",
      ),
      { status: 409, code: "INVITE_ACCEPTED" },
    );
  }
  return issueStaffInvite(
    {
      email: row.email,
      name: row.name,
      phone: row.phone,
      role: row.role,
      invitedBy: invitedBy || row.invitedBy,
      forceResetActive: true,
    },
    { isReinvite: true },
  );
}

export function inviteStatus(invite: {
  acceptedAt: Date | null;
  expiresAt: Date;
}): "accepted" | "expired" | "pending" {
  if (invite.acceptedAt) return "accepted";
  if (invite.expiresAt.getTime() <= Date.now()) return "expired";
  return "pending";
}

const PASSWORD_RESET_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Admin-triggered password reset: new temp password + reset link, force change on next login.
 */
export async function issueStaffPasswordReset(opts: {
  staffId: string;
  invitedBy?: string | null;
}): Promise<{
  staffId: string;
  email: string;
  temporaryPassword: string;
  resetUrl: string;
  loginUrl: string;
  expiresAt: Date;
  emailSent: boolean;
  emailError?: string;
}> {
  const [staff] = await db.select().from(staffUsers).where(eq(staffUsers.id, opts.staffId)).limit(1);
  if (!staff) {
    throw Object.assign(new Error("Staff member not found"), { status: 404 });
  }
  if (!staff.isActive) {
    throw Object.assign(new Error("Reactivate the staff account before resetting their password."), {
      status: 400,
      code: "STAFF_INACTIVE",
    });
  }

  const temporaryPassword = generateTemporaryPassword();
  const rawToken = generateInviteToken();
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS);
  const passwordHash = hashStaffPassword(temporaryPassword);

  await db
    .update(staffUsers)
    .set({
      passwordHash,
      mustChangePassword: true,
      passwordResetTokenHash: hashInviteToken(rawToken),
      passwordResetExpiresAt: expiresAt,
      updatedAt: new Date(),
    })
    .where(eq(staffUsers.id, staff.id));

  const loginUrl = `${ADMIN_ORIGIN()}/login`;
  const resetUrl = `${ADMIN_ORIGIN()}/reset-password?token=${rawToken}`;

  const expiresLabel = expiresAt.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
  const subject = "BEXO Admin — reset your password";
  const html = getStaffPasswordResetEmail({
    userName: staff.name || staff.email.split("@")[0] || "there",
    email: staff.email,
    temporaryPassword,
    resetUrl,
    loginUrl,
    expiresLabel,
  });

  const direct = await sendEmail(staff.email, subject, html);
  await enqueueEmail({
    eventType: "staff_password_reset",
    recipient: staff.email,
    subject,
    dedupeKey: `staff_password_reset:${staff.id}:${Date.now()}`,
    relatedId: staff.id,
    payload: {
      userName: staff.name || staff.email.split("@")[0] || "there",
      email: staff.email,
      temporaryPassword,
      resetUrl,
      loginUrl,
      expiresLabel,
    },
  }).catch((err) => logger.warn({ err }, "staff password reset enqueue failed"));

  logger.info(
    { staffId: staff.id, email: staff.email, emailSent: direct.ok, invitedBy: opts.invitedBy },
    "Staff password reset issued",
  );

  if (direct.ok) {
    return {
      staffId: staff.id,
      email: staff.email,
      temporaryPassword,
      resetUrl,
      loginUrl,
      expiresAt,
      emailSent: true,
    };
  }
  return {
    staffId: staff.id,
    email: staff.email,
    temporaryPassword,
    resetUrl,
    loginUrl,
    expiresAt,
    emailSent: false,
    emailError: !isSmtpConfigured()
      ? "SMTP is not configured — share the temporary password and reset link manually."
      : direct.error || "Failed to send reset email.",
  };
}

