import { Router } from "express";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { cardScans, connections, db, profiles, users } from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";
import { portfolioPublicUrl } from "../lib/platform";
import { logger } from "../lib/logger";

const router = Router();

/**
 * Connections — the graph behind the Network screen, and what a card scan
 * actually does.
 *
 * A BEXO card's QR encodes a URL ending in the owner's `card_code`. Anyone's
 * camera opens that URL as a portfolio link; the BEXO scanner instead reads the
 * code, resolves who it belongs to, and offers to connect. The owner gets a
 * pending request and the scanner gets the portfolio URL to open — both halves
 * of "scan a card" in one round trip.
 */

/** Pull a card code out of whatever the scanner read: a URL, or the bare code. */
export function parseCardCode(raw: string): string | null {
  const value = String(raw || "").trim();
  if (!value) return null;

  // bexo://c/<code> or https://<anything>/c/<code> (with or without a query)
  const fromUrl = value.match(/\/c\/([a-z0-9]{6,32})/i);
  if (fromUrl) return fromUrl[1].toLowerCase();

  const fromQuery = value.match(/[?&]card=([a-z0-9]{6,32})/i);
  if (fromQuery) return fromQuery[1].toLowerCase();

  if (/^[a-z0-9]{6,32}$/i.test(value)) return value.toLowerCase();
  return null;
}

/** The public shape of a person, everywhere this router returns one. */
function publicPerson(row: {
  id: string;
  name: string | null;
  photoUrl: string | null;
  cardCode: string;
  handle: string | null;
  headline: string | null;
}) {
  return {
    id: row.id,
    name: row.name,
    photoUrl: row.photoUrl,
    cardCode: row.cardCode,
    handle: row.handle,
    headline: row.headline,
    siteUrl: row.handle ? portfolioPublicUrl(row.handle) : null,
  };
}

async function findByCardCode(code: string) {
  const [row] = await db
    .select({
      id: users.id,
      name: users.name,
      photoUrl: users.photoUrl,
      cardCode: users.cardCode,
      autoConnect: users.autoConnect,
      handle: profiles.handle,
      headline: profiles.headline,
    })
    .from(users)
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .where(eq(users.cardCode, code))
    .limit(1);
  return row ?? null;
}

/** GET /api/connections/card/:code — who does this QR belong to? */
router.get("/card/:code", requireAuth, async (req: AuthenticatedRequest, res) => {
  const code = parseCardCode(String(req.params.code ?? ""));
  if (!code) {
    res.status(400).json({ error: "Not a BEXO card code" });
    return;
  }

  const owner = await findByCardCode(code);
  if (!owner) {
    res.status(404).json({ error: "That card is not registered to anyone" });
    return;
  }

  const me = req.user!.id;
  const existing = owner.id === me ? null : await findRelationship(me, owner.id);

  res.json({
    person: publicPerson(owner),
    isSelf: owner.id === me,
    connection: existing ? { id: existing.id, status: existing.status, incoming: existing.addresseeId === me } : null,
  });
});

async function findRelationship(a: string, b: string) {
  const [row] = await db
    .select()
    .from(connections)
    .where(
      or(
        and(eq(connections.requesterId, a), eq(connections.addresseeId, b)),
        and(eq(connections.requesterId, b), eq(connections.addresseeId, a)),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * POST /api/connections/scan — the whole scan interaction.
 * Body: { code, source? }. Records the scan, creates or upgrades the
 * relationship, and returns the portfolio URL for the scanner to open.
 */
router.post("/scan", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const me = req.user!.id;
    const code = parseCardCode(req.body?.code);
    const source = ["qr", "nfc", "link", "manual"].includes(req.body?.source) ? req.body.source : "qr";

    if (!code) {
      res.status(400).json({ error: "Not a BEXO card code" });
      return;
    }

    const owner = await findByCardCode(code);
    if (!owner) {
      res.status(404).json({ error: "That card is not registered to anyone" });
      return;
    }

    if (owner.id === me) {
      res.json({ person: publicPerson(owner), isSelf: true, connection: null });
      return;
    }

    await db.insert(cardScans).values({ cardOwnerId: owner.id, scannerId: me, source });

    const existing = await findRelationship(me, owner.id);

    // Both people scanned each other — that is a handshake, not two requests.
    if (existing && existing.status === "pending" && existing.addresseeId === me) {
      const [accepted] = await db
        .update(connections)
        .set({ status: "accepted", respondedAt: new Date() })
        .where(eq(connections.id, existing.id))
        .returning();
      res.json({
        person: publicPerson(owner),
        isSelf: false,
        connection: { id: accepted.id, status: accepted.status, incoming: false },
        mutual: true,
      });
      return;
    }

    if (existing) {
      res.json({
        person: publicPerson(owner),
        isSelf: false,
        connection: { id: existing.id, status: existing.status, incoming: existing.addresseeId === me },
      });
      return;
    }

    // If owner has Auto-Connect enabled (or both have auto-connect), establish connection immediately!
    const targetAutoConnect = owner.autoConnect ?? true;
    const initialStatus = targetAutoConnect ? "accepted" : "pending";
    const respondedAt = targetAutoConnect ? new Date() : null;

    const [created] = await db
      .insert(connections)
      .values({
        requesterId: me,
        addresseeId: owner.id,
        source,
        status: initialStatus,
        respondedAt,
      })
      .returning();

    res.json({
      person: publicPerson(owner),
      isSelf: false,
      connection: { id: created.id, status: created.status, incoming: false },
      autoConnected: targetAutoConnect,
    });
  } catch (err) {
    logger.error({ err }, "connection scan failed");
    res.status(500).json({ error: "Could not record that scan" });
  }
});

/**
 * GET /api/connections — the network graph for the signed-in user:
 * accepted connections, plus incoming requests waiting on them.
 */
router.get("/", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const me = req.user!.id;

    const rows = await db
      .select({
        id: connections.id,
        status: connections.status,
        source: connections.source,
        createdAt: connections.createdAt,
        respondedAt: connections.respondedAt,
        requesterId: connections.requesterId,
        addresseeId: connections.addresseeId,
      })
      .from(connections)
      .where(or(eq(connections.requesterId, me), eq(connections.addresseeId, me)))
      .orderBy(desc(connections.createdAt));

    const otherIds = rows.map((row) => (row.requesterId === me ? row.addresseeId : row.requesterId));
    const people = otherIds.length
      ? await db
          .select({
            id: users.id,
            name: users.name,
            photoUrl: users.photoUrl,
            cardCode: users.cardCode,
            handle: profiles.handle,
            headline: profiles.headline,
          })
          .from(users)
          .leftJoin(profiles, eq(profiles.userId, users.id))
          .where(inArray(users.id, otherIds))
      : [];

    const byId = new Map(people.map((person) => [person.id, person]));

    // How many people we and they both know — the "mutual connections" line.
    const mutualCounts = await mutualCountsFor(me, otherIds);

    res.json({
      connections: rows
        .map((row) => {
          const otherId = row.requesterId === me ? row.addresseeId : row.requesterId;
          const person = byId.get(otherId);
          if (!person) return null;
          return {
            id: row.id,
            status: row.status,
            source: row.source,
            incoming: row.addresseeId === me,
            connectedSince: row.respondedAt ?? row.createdAt,
            mutuals: mutualCounts.get(otherId) ?? 0,
            person: publicPerson(person),
          };
        })
        .filter(Boolean),
    });
  } catch (err) {
    logger.error({ err }, "connection list failed");
    res.status(500).json({ error: "Could not load your network" });
  }
});

/** Mutual-connection counts, computed in one query rather than N. */
async function mutualCountsFor(me: string, others: string[]): Promise<Map<string, number>> {
  if (!others.length) return new Map();

  const rows = await db.execute<{ other_id: string; mutuals: number }>(sql`
    with mine as (
      select case when requester_id = ${me} then addressee_id else requester_id end as id
      from connections
      where status = 'accepted' and (requester_id = ${me} or addressee_id = ${me})
    ),
    theirs as (
      select
        case when requester_id = any(${others}::uuid[]) then requester_id else addressee_id end as other_id,
        case when requester_id = any(${others}::uuid[]) then addressee_id else requester_id end as id
      from connections
      where status = 'accepted'
        and (requester_id = any(${others}::uuid[]) or addressee_id = any(${others}::uuid[]))
    )
    select theirs.other_id, count(*)::int as mutuals
    from theirs
    join mine on mine.id = theirs.id
    where theirs.id <> ${me}
    group by theirs.other_id
  `);

  const out = new Map<string, number>();
  for (const row of rows as unknown as { other_id: string; mutuals: number }[]) {
    out.set(row.other_id, Number(row.mutuals) || 0);
  }
  return out;
}

/** POST /api/connections/:id/respond — accept or decline an incoming request. */
router.post("/:id/respond", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const me = req.user!.id;
    const action = req.body?.action;
    if (action !== "accept" && action !== "decline") {
      res.status(400).json({ error: "action must be accept or decline" });
      return;
    }

    const [row] = await db.select().from(connections).where(eq(connections.id, String(req.params.id ?? ""))).limit(1);
    if (!row || row.addresseeId !== me) {
      res.status(404).json({ error: "Request not found" });
      return;
    }
    if (row.status !== "pending") {
      res.json({ id: row.id, status: row.status });
      return;
    }

    const [updated] = await db
      .update(connections)
      .set({ status: action === "accept" ? "accepted" : "declined", respondedAt: new Date() })
      .where(eq(connections.id, row.id))
      .returning();

    res.json({ id: updated.id, status: updated.status });
  } catch (err) {
    logger.error({ err }, "connection respond failed");
    res.status(500).json({ error: "Could not update that request" });
  }
});

/** DELETE /api/connections/:id — remove a connection from both sides. */
router.delete("/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  const me = req.user!.id;
  const [row] = await db.select().from(connections).where(eq(connections.id, String(req.params.id ?? ""))).limit(1);
  if (!row || (row.requesterId !== me && row.addresseeId !== me)) {
    res.status(404).json({ error: "Connection not found" });
    return;
  }
  await db.delete(connections).where(eq(connections.id, row.id));
  res.json({ ok: true });
});

export default router;
