import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { db, staffUsers } from "@workspace/db";
import { eq } from "drizzle-orm";

export type StaffRole = "super_admin" | "support" | "billing" | "ops";

export interface StaffRequest extends Request {
  staff?: {
    id: string;
    email: string;
    role: StaffRole;
    name: string | null;
  };
}

const ROLE_RANK: Record<StaffRole, number> = {
  support: 1,
  ops: 2,
  billing: 2,
  super_admin: 99,
};

export function staffHasRole(role: StaffRole, allowed: StaffRole[]): boolean {
  if (role === "super_admin") return true;
  return allowed.includes(role);
}

export async function requireStaff(
  allowedRoles?: StaffRole[],
): Promise<(req: StaffRequest, res: Response, next: NextFunction) => Promise<void>> {
  return async (req: StaffRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).json({ error: "Unauthorized: Missing staff token" });
      return;
    }

    const token = authHeader.slice(7);
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      res.status(500).json({ error: "Server auth is misconfigured" });
      return;
    }

    try {
      const decoded = jwt.verify(token, secret) as {
        id: string;
        staff?: boolean;
        role?: string;
      };
      if (!decoded.staff || !decoded.id) {
        res.status(401).json({ error: "Unauthorized: Not a staff token" });
        return;
      }

      const [row] = await db
        .select()
        .from(staffUsers)
        .where(eq(staffUsers.id, decoded.id))
        .limit(1);

      if (!row || !row.isActive) {
        res.status(403).json({ error: "Forbidden: Staff inactive or missing" });
        return;
      }

      const role = row.role as StaffRole;
      if (allowedRoles?.length && !staffHasRole(role, allowedRoles)) {
        res.status(403).json({ error: "Forbidden: Insufficient staff role" });
        return;
      }

      req.staff = {
        id: row.id,
        email: row.email,
        role,
        name: row.name,
      };
      next();
    } catch {
      res.status(401).json({ error: "Unauthorized: Invalid staff token" });
    }
  };
}

/** Express-friendly wrapper that resolves the async middleware factory once. */
export function staffGuard(allowedRoles?: StaffRole[]) {
  let middleware:
    | ((req: StaffRequest, res: Response, next: NextFunction) => Promise<void>)
    | null = null;

  return async (req: StaffRequest, res: Response, next: NextFunction) => {
    if (!middleware) middleware = await requireStaff(allowedRoles);
    return middleware(req, res, next);
  };
}

export { ROLE_RANK };
