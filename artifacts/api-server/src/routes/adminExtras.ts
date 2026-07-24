/**
 * Extended Admin ops: staff profile/password, employee invites + bulk paste,
 * autopay collection (₹2000 cap), infra health, scalable list helpers.
 */
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { type IRouter, type Response } from "express";
import Razorpay from "razorpay";
import { and, count, desc, eq, ilike, or, sql } from "drizzle-orm";
import {
  adminAuditLog,
  db,
  payments,
  profiles,
  staffInvites,
  staffUsers,
  subscriptions,
  users,
} from "@workspace/db";
import { staffGuard, type StaffRequest, type StaffRole } from "../middlewares/staffAuth";
import { logger } from "../lib/logger";
import { appOrigin } from "../lib/platform";
import { loadGcpCloudRunAnalytics } from "../lib/gcpMonitoring";
import { loadRazorpayAnalytics } from "../lib/razorpayAnalytics";
import {
  issueStaffInvite,
  inviteStatus,
  reissueStaffInviteById,
} from "../lib/staffInvite";

const AUTOPAY_MANUAL_CAP_INR = 2000;
const ADMIN_ORIGIN = process.env.ADMIN_URL || "https://bexo.acedigital.cc";

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const next = scryptSync(password, salt, 64);
  const prev = Buffer.from(hash, "hex");
  if (prev.length !== next.length) return false;
  return timingSafeEqual(prev, next);
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function audit(
  req: StaffRequest,
  action: string,
  targetType: string | null,
  targetId: string | null,
  meta: Record<string, unknown> = {},
) {
  try {
    await db.insert(adminAuditLog).values({
      actorStaffId: req.staff?.id,
      action,
      targetType,
      targetId,
      meta,
      ip: String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || ""),
    });
  } catch (err) {
    logger.warn({ err, action }, "admin audit insert failed");
  }
}

function getRazorpay(): Razorpay | null {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) return null;
  return new Razorpay({ key_id: keyId, key_secret: keySecret });
}

function parseEmployeePaste(raw: string): {
  name: string;
  phone: string;
  email: string;
  role: StaffRole;
}[] {
  const lines = String(raw || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const out: { name: string; phone: string; email: string; role: StaffRole }[] = [];
  for (const line of lines) {
    // Skip header-ish rows
    if (/^name\b/i.test(line) && /email/i.test(line)) continue;
    const parts = line.includes("\t")
      ? line.split("\t")
      : line.includes(",")
        ? line.split(",")
        : line.split(/\s{2,}/);
    const cells = parts.map((p) => p.trim().replace(/^["']|["']$/g, ""));
    if (cells.length < 3) continue;
    const [name, phone, email, roleRaw] = cells;
    const emailClean = String(email || "")
      .toLowerCase()
      .trim();
    if (!emailClean.includes("@")) continue;
    const role = (["super_admin", "billing", "ops", "support"].includes(String(roleRaw || "").trim())
      ? String(roleRaw).trim()
      : "support") as StaffRole;
    out.push({
      name: String(name || "").trim(),
      phone: String(phone || "").trim(),
      email: emailClean,
      role,
    });
  }
  return out;
}

export function registerAdminExtras(router: IRouter) {
  // ——— Profile & password ———

  router.patch("/me", staffGuard(), async (req: StaffRequest, res: Response) => {
    try {
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      if (req.body?.name !== undefined) patch.name = String(req.body.name).trim() || null;
      if (req.body?.phone !== undefined) patch.phone = String(req.body.phone).trim() || null;
      await db.update(staffUsers).set(patch).where(eq(staffUsers.id, req.staff!.id));
      const [staff] = await db.select().from(staffUsers).where(eq(staffUsers.id, req.staff!.id)).limit(1);
      res.json({
        staff: {
          id: staff.id,
          email: staff.email,
          name: staff.name,
          phone: staff.phone,
          role: staff.role,
        },
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  router.post("/me/password", staffGuard(), async (req: StaffRequest, res: Response) => {
    try {
      const currentPassword = String(req.body?.currentPassword || "");
      const newPassword = String(req.body?.newPassword || "");
      if (newPassword.length < 8) {
        res.status(400).json({ error: "New password must be at least 8 characters" });
        return;
      }
      const [staff] = await db.select().from(staffUsers).where(eq(staffUsers.id, req.staff!.id)).limit(1);
      if (!staff) {
        res.status(404).json({ error: "Staff not found" });
        return;
      }
      // Forced change after temp password / bootstrap: current password optional when mustChangePassword.
      if (staff.passwordHash && !staff.mustChangePassword) {
        if (!verifyPassword(currentPassword, staff.passwordHash)) {
          res.status(401).json({ error: "Current password is incorrect" });
          return;
        }
      } else if (staff.passwordHash && staff.mustChangePassword && currentPassword) {
        if (!verifyPassword(currentPassword, staff.passwordHash)) {
          res.status(401).json({ error: "Current (temporary) password is incorrect" });
          return;
        }
      }
      await db
        .update(staffUsers)
        .set({
          passwordHash: hashPassword(newPassword),
          mustChangePassword: false,
          passwordResetTokenHash: null,
          passwordResetExpiresAt: null,
          updatedAt: new Date(),
        })
        .where(eq(staffUsers.id, staff.id));
      await audit(req, "staff.password_change", "staff_user", staff.id, {
        forced: !!staff.mustChangePassword,
      });
      res.json({ ok: true, mustChangePassword: false });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // ——— Public password reset (email link) ———

  router.get("/auth/reset-preview", async (req, res: Response) => {
    try {
      const token = String(req.query.token || "").trim();
      if (!token) {
        res.status(400).json({ error: "token required", code: "TOKEN_REQUIRED" });
        return;
      }
      const [staff] = await db
        .select({
          id: staffUsers.id,
          email: staffUsers.email,
          name: staffUsers.name,
          passwordResetExpiresAt: staffUsers.passwordResetExpiresAt,
          isActive: staffUsers.isActive,
        })
        .from(staffUsers)
        .where(eq(staffUsers.passwordResetTokenHash, hashToken(token)))
        .limit(1);
      if (!staff || !staff.passwordResetExpiresAt) {
        res.status(404).json({ error: "Reset link is invalid.", code: "RESET_NOT_FOUND" });
        return;
      }
      if (staff.passwordResetExpiresAt.getTime() <= Date.now()) {
        res.status(410).json({
          error: "Reset link has expired. Ask a super admin to send a new one.",
          code: "RESET_EXPIRED",
          email: staff.email,
        });
        return;
      }
      if (!staff.isActive) {
        res.status(403).json({ error: "This staff account is deactivated.", code: "STAFF_INACTIVE" });
        return;
      }
      res.json({
        email: staff.email,
        name: staff.name,
        expiresAt: staff.passwordResetExpiresAt,
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  router.post("/auth/reset-password", async (req, res: Response) => {
    try {
      const token = String(req.body?.token || "").trim();
      const newPassword = String(req.body?.newPassword || "");
      if (!token || newPassword.length < 8) {
        res.status(400).json({ error: "Token and new password (8+ chars) are required." });
        return;
      }
      const [staff] = await db
        .select()
        .from(staffUsers)
        .where(eq(staffUsers.passwordResetTokenHash, hashToken(token)))
        .limit(1);
      if (!staff || !staff.passwordResetExpiresAt) {
        res.status(404).json({ error: "Reset link is invalid." });
        return;
      }
      if (staff.passwordResetExpiresAt.getTime() <= Date.now()) {
        res.status(410).json({ error: "Reset link has expired. Ask a super admin to send a new one." });
        return;
      }
      if (!staff.isActive) {
        res.status(403).json({ error: "This staff account is deactivated." });
        return;
      }
      await db
        .update(staffUsers)
        .set({
          passwordHash: hashPassword(newPassword),
          mustChangePassword: false,
          passwordResetTokenHash: null,
          passwordResetExpiresAt: null,
          updatedAt: new Date(),
        })
        .where(eq(staffUsers.id, staff.id));
      res.json({ ok: true, email: staff.email, message: "Password updated. Sign in with your new password." });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // ——— Employee invite bulk paste (single invite stays in admin.ts) ———

  router.post(
    "/staff/invite-bulk",
    staffGuard(["super_admin"]),
    async (req: StaffRequest, res: Response) => {
      try {
        const pasted = String(req.body?.paste || "");
        const rows = Array.isArray(req.body?.rows)
          ? (req.body.rows as any[]).map((r) => ({
              name: String(r.name || "").trim(),
              phone: String(r.phone || "").trim(),
              email: String(r.email || "")
                .toLowerCase()
                .trim(),
              role: (["super_admin", "billing", "ops", "support"].includes(String(r.role || ""))
                ? String(r.role)
                : "support") as StaffRole,
            }))
          : parseEmployeePaste(pasted);

        if (!rows.length) {
          res.status(400).json({
            error: "Paste rows as Name, Phone, Email[, Role] (tab/comma separated)",
          });
          return;
        }
        if (rows.length > 200) {
          res.status(400).json({ error: "Max 200 employees per paste batch" });
          return;
        }

        const created: {
          email: string;
          inviteUrl: string;
          role: string;
          temporaryPassword: string;
          emailSent: boolean;
          expiresAt: string;
        }[] = [];
        const errors: { email: string; error: string }[] = [];

        for (const row of rows) {
          if (!row.email.includes("@")) {
            errors.push({ email: row.email || "(blank)", error: "invalid email" });
            continue;
          }
          try {
            const issued = await issueStaffInvite({
              email: row.email,
              name: row.name || null,
              phone: row.phone || null,
              role: row.role,
              invitedBy: req.staff?.id,
            });
            created.push({
              email: row.email,
              role: row.role,
              inviteUrl: issued.inviteUrl,
              temporaryPassword: issued.temporaryPassword,
              emailSent: issued.emailSent,
              expiresAt: issued.expiresAt.toISOString(),
            });
          } catch (e) {
            errors.push({ email: row.email, error: (e as Error).message });
          }
        }

        await audit(req, "staff.invite_bulk", "staff_invite", null, {
          created: created.length,
          errors: errors.length,
          emailed: created.filter((c) => c.emailSent).length,
        });
        res.json({ created, errors, count: created.length });
      } catch (err) {
        res.status(500).json({ error: (err as Error).message });
      }
    },
  );

  router.get("/staff/invites", staffGuard(["super_admin"]), async (_req: StaffRequest, res: Response) => {
    const rows = await db
      .select({
        id: staffInvites.id,
        email: staffInvites.email,
        name: staffInvites.name,
        phone: staffInvites.phone,
        role: staffInvites.role,
        expiresAt: staffInvites.expiresAt,
        acceptedAt: staffInvites.acceptedAt,
        createdAt: staffInvites.createdAt,
      })
      .from(staffInvites)
      .orderBy(desc(staffInvites.createdAt))
      .limit(200);
    res.json({
      invites: rows.map((r) => {
        const status = inviteStatus(r);
        return {
          ...r,
          status,
          canReinvite: status === "pending" || status === "expired",
        };
      }),
    });
  });

  /** Reinvite pending/expired invites — new token, password, 7-day expiry, resend email. */
  router.post(
    "/staff/invites/:inviteId/reinvite",
    staffGuard(["super_admin"]),
    async (req: StaffRequest, res: Response) => {
      try {
        const inviteId = String(req.params.inviteId || "");
        if (!inviteId) {
          res.status(400).json({ error: "inviteId required" });
          return;
        }
        const issued = await reissueStaffInviteById(inviteId, req.staff?.id);
        await audit(req, "staff.reinvite", "staff_invite", issued.invite.id, {
          email: issued.invite.email,
          previousInviteId: inviteId,
          emailSent: issued.emailSent,
          expiresAt: issued.expiresAt.toISOString(),
        });
        res.json({
          invite: {
            id: issued.invite.id,
            email: issued.invite.email,
            name: issued.invite.name,
            phone: issued.invite.phone,
            role: issued.invite.role,
            expiresAt: issued.expiresAt,
          },
          inviteUrl: issued.inviteUrl,
          loginUrl: issued.loginUrl,
          temporaryPassword: issued.temporaryPassword,
          emailSent: issued.emailSent,
          emailError: issued.emailError || null,
          message: issued.emailSent
            ? "Reinvite sent — new temporary password emailed (valid 7 days)."
            : `Reinvite created but email failed: ${issued.emailError || "unknown"}. Share link and password manually.`,
        });
      } catch (err: any) {
        const status = Number(err?.status) || 500;
        res.status(status).json({ error: err?.message || "Failed to reinvite" });
      }
    },
  );

  // Peek invite (public) for accept page — always return email when token matches
  // so the Work email field can auto-fill even if the invite is expired/used.
  router.get("/auth/invite-preview", async (req, res: Response) => {
    try {
      const token = String(req.query.token || "").trim();
      if (!token) {
        res.status(400).json({ error: "token required", code: "TOKEN_REQUIRED" });
        return;
      }
      const [invite] = await db
        .select({
          id: staffInvites.id,
          email: staffInvites.email,
          name: staffInvites.name,
          phone: staffInvites.phone,
          role: staffInvites.role,
          expiresAt: staffInvites.expiresAt,
          acceptedAt: staffInvites.acceptedAt,
        })
        .from(staffInvites)
        .where(eq(staffInvites.tokenHash, hashToken(token)))
        .limit(1);

      if (!invite) {
        res.status(404).json({
          error: "Invite link is invalid. Ask a super admin to send a new invite.",
          code: "INVITE_NOT_FOUND",
        });
        return;
      }

      const status = inviteStatus(invite);
      const payload = {
        invite: {
          id: invite.id,
          email: invite.email,
          name: invite.name,
          phone: invite.phone,
          role: invite.role,
          expiresAt: invite.expiresAt,
          acceptedAt: invite.acceptedAt,
          status,
        },
      };

      if (status === "accepted") {
        res.status(409).json({
          ...payload,
          error: "This invite was already accepted. Sign in with your email and password.",
          code: "INVITE_ACCEPTED",
        });
        return;
      }
      if (status === "expired") {
        res.status(410).json({
          ...payload,
          error: "This invite has expired. Ask a super admin to tap Reinvite for a fresh link.",
          code: "INVITE_EXPIRED",
        });
        return;
      }

      res.json(payload);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // ——— Autopay ops ———

  router.get(
    "/autopay",
    staffGuard(["super_admin", "billing"]),
    async (req: StaffRequest, res: Response) => {
      try {
        const q = String(req.query.q || "").trim();
        const plan = String(req.query.plan || "").trim();
        const limit = Math.min(Number(req.query.limit) || 80, 200);
        const offset = Math.max(0, Number(req.query.offset) || 0);

        const conditions = [
          eq(subscriptions.status, "active"),
          sql`${subscriptions.razorpaySubscriptionId} is not null`,
        ];
        if (plan) conditions.push(eq(subscriptions.plan, plan));
        if (q) {
          conditions.push(
            or(
              ilike(users.email, `%${q}%`),
              ilike(users.name, `%${q}%`),
              ilike(profiles.handle, `%${q}%`),
              ilike(users.phone, `%${q}%`),
            )!,
          );
        }

        const whereClause = and(...conditions);
        const [{ total }] = await db
          .select({ total: count() })
          .from(subscriptions)
          .leftJoin(users, eq(users.id, subscriptions.userId))
          .leftJoin(profiles, eq(profiles.userId, subscriptions.userId))
          .where(whereClause);

        const rows = await db
          .select({
            id: subscriptions.id,
            userId: subscriptions.userId,
            plan: subscriptions.plan,
            status: subscriptions.status,
            expiresAt: subscriptions.expiresAt,
            razorpaySubscriptionId: subscriptions.razorpaySubscriptionId,
            razorpayPlanId: subscriptions.razorpayPlanId,
            userName: users.name,
            userEmail: users.email,
            userPhone: users.phone,
            handle: profiles.handle,
          })
          .from(subscriptions)
          .leftJoin(users, eq(users.id, subscriptions.userId))
          .leftJoin(profiles, eq(profiles.userId, subscriptions.userId))
          .where(whereClause)
          .orderBy(desc(subscriptions.expiresAt))
          .limit(limit)
          .offset(offset);

        res.json({
          total: Number(total),
          limit,
          offset,
          manualCapInr: AUTOPAY_MANUAL_CAP_INR,
          subscriptions: rows.map((r) => ({
            ...r,
            nextChargeAt: r.expiresAt,
            nextChargeLabel: r.expiresAt
              ? new Date(r.expiresAt).toLocaleString("en-IN")
              : "unknown / lifetime",
          })),
        });
      } catch (err) {
        res.status(500).json({ error: (err as Error).message });
      }
    },
  );

  /**
   * Collect a one-off amount (max ₹2000) via live Razorpay.
   * - immediate: notify customer with a Payment Link (email/SMS); webhook marks paid
   * - next_cycle: Razorpay subscription addon — billed on the next Autopay cycle
   */
  router.post(
    "/users/:userId/collect-payment",
    staffGuard(["super_admin", "billing"]),
    async (req: StaffRequest, res: Response) => {
      try {
        const userId = String(req.params.userId);
        const amountInr = Number(req.body?.amountInr);
        const reason = String(req.body?.reason || "").trim() || "admin_manual_collect";
        const description = String(req.body?.description || "BEXO payment").trim();
        const mode = String(req.body?.mode || "immediate") === "next_cycle" ? "next_cycle" : "immediate";

        if (!Number.isFinite(amountInr) || amountInr <= 0) {
          res.status(400).json({ error: "amountInr must be > 0" });
          return;
        }
        if (amountInr > AUTOPAY_MANUAL_CAP_INR) {
          res.status(400).json({
            error: `Manual collect capped at ₹${AUTOPAY_MANUAL_CAP_INR} (Autopay / UPI mandate limit). Split larger amounts.`,
          });
          return;
        }

        const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
        if (!user) {
          res.status(404).json({ error: "User not found" });
          return;
        }

        const razorpay = getRazorpay();
        if (!razorpay) {
          res.status(503).json({ error: "Razorpay not configured" });
          return;
        }

        const [activeSub] = await db
          .select()
          .from(subscriptions)
          .where(and(eq(subscriptions.userId, userId), eq(subscriptions.status, "active")))
          .limit(1);

        const allowedPlans = new Set([
          "annual",
          "lifetime",
          "identity",
          "essential",
          "growth",
          "studentplus",
          "storage_addon",
        ]);
        const requestedPlan = String(req.body?.plan || "").trim();
        const planForRow =
          (allowedPlans.has(requestedPlan) ? requestedPlan : null) ||
          (activeSub?.plan && allowedPlans.has(activeSub.plan) ? activeSub.plan : null);

        const amountPaise = Math.round(amountInr * 100);

        if (mode === "next_cycle") {
          if (!activeSub?.razorpaySubscriptionId) {
            res.status(400).json({
              error:
                "No active Razorpay Autopay mandate on this user. Use Collect now (immediate) instead.",
            });
            return;
          }

          const addon: any = await (razorpay as any).subscriptions.createAddon(
            activeSub.razorpaySubscriptionId,
            {
              item: {
                name: description.slice(0, 255) || `BEXO collect · ${reason}`.slice(0, 255),
                amount: amountPaise,
                currency: "INR",
              },
            },
          );

          const [payment] = await db
            .insert(payments)
            .values({
              userId,
              amount: amountPaise,
              status: "pending",
              plan: planForRow,
              kind: "admin_collect_next",
              razorpaySubscriptionId: activeSub.razorpaySubscriptionId,
              couponCode: null,
            })
            .returning();

          await audit(req, "payment.collect_next_cycle", "payment", payment.id, {
            amountInr,
            reason,
            mode,
            razorpayAddonId: addon?.id,
            razorpaySubscriptionId: activeSub.razorpaySubscriptionId,
          });

          res.json({
            ok: true,
            mode,
            paymentId: payment.id,
            amountInr,
            amountPaise,
            razorpayAddonId: addon?.id || null,
            razorpaySubscriptionId: activeSub.razorpaySubscriptionId,
            message: `₹${amountInr.toFixed(2)} queued on next Autopay cycle`,
          });
          return;
        }

        // immediate — Payment Link with email/SMS notify (live Razorpay)
        const [payment] = await db
          .insert(payments)
          .values({
            userId,
            amount: amountPaise,
            status: "pending",
            plan: planForRow,
            kind: "admin_collect",
            razorpaySubscriptionId: activeSub?.razorpaySubscriptionId || null,
            couponCode: null,
          })
          .returning();

        const link: any = await (razorpay as any).paymentLink.create({
          amount: amountPaise,
          currency: "INR",
          accept_partial: false,
          description: description.slice(0, 200),
          customer: {
            name: user.name || "BEXO customer",
            email: user.email || undefined,
            contact: user.phone || undefined,
          },
          notify: {
            sms: !!user.phone,
            email: !!user.email,
          },
          reminder_enable: true,
          notes: {
            bexo_payment_id: payment.id,
            bexo_user_id: userId,
            reason,
            staff_id: req.staff?.id || "",
            kind: "admin_collect",
          },
          callback_url: `${appOrigin()}/billing`,
          callback_method: "get",
        });

        await audit(req, "payment.collect_immediate", "payment", payment.id, {
          amountInr,
          reason,
          mode,
          paymentLinkId: link?.id,
          shortUrl: link?.short_url,
        });

        res.json({
          ok: true,
          mode,
          paymentId: payment.id,
          amountInr,
          amountPaise,
          paymentLinkId: link?.id,
          shortUrl: link?.short_url,
          status: link?.status,
          notified: {
            email: !!user.email,
            sms: !!user.phone,
          },
          message: user.email || user.phone
            ? `Collect sent to customer · ₹${amountInr.toFixed(2)}`
            : `Collect link ready · ₹${amountInr.toFixed(2)}`,
        });
      } catch (err) {
        res.status(500).json({ error: (err as Error).message });
      }
    },
  );

  router.post(
    "/autopay/:subscriptionRowId/cancel",
    staffGuard(["super_admin", "billing"]),
    async (req: StaffRequest, res: Response) => {
      try {
        const id = String(req.params.subscriptionRowId);
        const [row] = await db.select().from(subscriptions).where(eq(subscriptions.id, id)).limit(1);
        if (!row?.razorpaySubscriptionId) {
          res.status(404).json({ error: "Autopay subscription not found" });
          return;
        }
        const razorpay = getRazorpay();
        if (!razorpay) {
          res.status(503).json({ error: "Razorpay not configured" });
          return;
        }
        await razorpay.subscriptions.cancel(row.razorpaySubscriptionId, false);
        await db
          .update(subscriptions)
          .set({ status: "cancelled", razorpaySubscriptionId: null })
          .where(eq(subscriptions.id, id));
        try {
          const [u] = await db.select().from(users).where(eq(users.id, row.userId)).limit(1);
          if (u?.email) {
            const { sendCancellationEmail } = await import("../lib/billing");
            await sendCancellationEmail({
              email: u.email,
              userName: u.name || "there",
              plan: row.plan || "plan",
              expiresAt: row.expiresAt,
              userId: row.userId,
              kind: "subscription",
            });
          }
        } catch (mailErr) {
          logger.warn({ mailErr, userId: row.userId }, "Admin autopay cancel email failed");
        }
        await audit(req, "autopay.cancel", "subscription", id, {
          razorpaySubscriptionId: row.razorpaySubscriptionId,
        });
        res.json({ ok: true });
      } catch (err) {
        res.status(500).json({ error: (err as Error).message });
      }
    },
  );

  // ——— Infra / platform health (no secrets) ———

  router.get("/infra", staffGuard(["super_admin", "ops"]), async (_req: StaffRequest, res: Response) => {
    const mem = process.memoryUsage();
    const uptimeSec = Math.round(process.uptime());

    let dbOk = false;
    let usersApprox = 0;
    try {
      const [{ n }] = await db.select({ n: count() }).from(users);
      usersApprox = Number(n);
      dbOk = true;
    } catch {
      dbOk = false;
    }

    // Rough Cloud Run cost projection (asia-south1 ballpark) — informational only
    const vCpuHoursMonth = Math.max(1, uptimeSec / 3600) * 1; // min instance ≈ 1 vCPU assumed
    const gibHoursMonth = vCpuHoursMonth * 1; // 1 Gi assumed
    const projectedCloudRunUsd =
      Math.round((vCpuHoursMonth * 0.000018 + gibHoursMonth * 0.000002) * 730 * 100) / 100;

    res.json({
      generatedAt: new Date().toISOString(),
      api: {
        ok: true,
        revision: process.env.K_REVISION || process.env.CLOUD_RUN_REVISION || "local",
        service: process.env.K_SERVICE || "bexo-api",
        region: process.env.GOOGLE_CLOUD_REGION || "asia-south1",
        node: process.version,
        uptimeSec,
        memory: {
          rssMb: Math.round(mem.rss / (1024 * 1024)),
          heapUsedMb: Math.round(mem.heapUsed / (1024 * 1024)),
        },
      },
      database: {
        ok: dbOk,
        usersApprox,
        scaleNote: "Indexed for 500k+ students — use paginated /users & /autopay lists",
      },
      surfaces: {
        admin: ADMIN_ORIGIN,
        dash: process.env.FRONTEND_URL || "https://dash.mybexo.cyou",
        marketing: process.env.MARKETING_URL || "https://mybexo.cyou",
        firebaseProjects: ["bexo-development (dash+admin)", "mybexo (marketing)"],
        cloudRunService: "bexo-api",
      },
      costProjection: {
        currency: "USD",
        cloudRunIdleApproxMonthly: projectedCloudRunUsd,
        note: "Order-of-magnitude idle/min-instance estimate only. Use GCP Billing + Firebase Usage for accurate spend.",
        links: {
          cloudRun:
            "https://console.cloud.google.com/run/detail/asia-south1/bexo-api/metrics?project=bexo-development",
          billing: "https://console.cloud.google.com/billing",
          firebaseUsage: "https://console.firebase.google.com/project/bexo-development/usage",
        },
      },
      razorpay: {
        configured: !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET),
        manualCollectCapInr: AUTOPAY_MANUAL_CAP_INR,
      },
    });
  });

  router.get(
    "/infra/gcp",
    staffGuard(["super_admin", "ops", "billing"]),
    async (req: StaffRequest, res: Response) => {
      try {
        const hours = Math.min(Math.max(Number(req.query.hours) || 48, 6), 168);
        const data = await loadGcpCloudRunAnalytics(hours);
        await audit(req, "infra.gcp.view", "infra", "gcp", { hours, configured: data.configured });
        res.json(data);
      } catch (err) {
        res.status(500).json({ error: (err as Error).message });
      }
    },
  );

  router.get(
    "/infra/razorpay",
    staffGuard(["super_admin", "ops", "billing"]),
    async (req: StaffRequest, res: Response) => {
      try {
        const days = Math.min(Math.max(Number(req.query.days) || 30, 7), 90);
        const data = await loadRazorpayAnalytics(days);
        await audit(req, "infra.razorpay.view", "infra", "razorpay", {
          days,
          configured: data.configured,
        });
        res.json(data);
      } catch (err) {
        res.status(500).json({ error: (err as Error).message });
      }
    },
  );

  /** Client-side admin activity (page views, exports) — always records IP + actor. */
  router.post(
    "/audit/client",
    staffGuard(["super_admin", "ops", "billing", "support"]),
    async (req: StaffRequest, res: Response) => {
      try {
        const action = String(req.body?.action || "client.event").slice(0, 120);
        const targetType = req.body?.targetType ? String(req.body.targetType).slice(0, 64) : "ui";
        const targetId = req.body?.targetId ? String(req.body.targetId).slice(0, 120) : null;
        const meta =
          req.body?.meta && typeof req.body.meta === "object"
            ? (req.body.meta as Record<string, unknown>)
            : {};
        await audit(req, action, targetType, targetId, {
          ...meta,
          path: req.body?.path ? String(req.body.path).slice(0, 200) : undefined,
          userAgent: String(req.headers["user-agent"] || "").slice(0, 240),
        });
        res.json({ ok: true });
      } catch (err) {
        res.status(500).json({ error: (err as Error).message });
      }
    },
  );
}
