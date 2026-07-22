import { Router } from "express";
import { requireAuth } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router = Router();

type CacheEntry<T> = { expiresAt: number; value: T };
const suggestCache = new Map<string, CacheEntry<AddressSuggestion[]>>();
const pinCache = new Map<string, CacheEntry<PincodeLookup>>();

const SUGGEST_TTL_MS = 10 * 60 * 1000;
const PIN_TTL_MS = 24 * 60 * 60 * 1000;
const NOMINATIM_MIN_INTERVAL_MS = 1100;
let lastNominatimAt = 0;

export type AddressSuggestion = {
  id: string;
  label: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};

export type PincodeLookup = {
  postalCode: string;
  city: string;
  state: string;
  district: string;
  areas: string[];
};

function getCached<T>(map: Map<string, CacheEntry<T>>, key: string): T | null {
  const hit = map.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    map.delete(key);
    return null;
  }
  return hit.value;
}

function setCached<T>(map: Map<string, CacheEntry<T>>, key: string, value: T, ttl: number) {
  map.set(key, { value, expiresAt: Date.now() + ttl });
}

function clean(value: unknown, max = 120): string {
  return String(value ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

async function waitForNominatimSlot() {
  const wait = lastNominatimAt + NOMINATIM_MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastNominatimAt = Date.now();
}

function pickCity(addr: Record<string, string> | undefined): string {
  if (!addr) return "";
  return clean(
    addr.city ||
      addr.town ||
      addr.village ||
      addr.municipality ||
      addr.county ||
      addr.suburb ||
      "",
    80,
  );
}

function buildLine1(addr: Record<string, string> | undefined, fallback: string): string {
  if (!addr) return clean(fallback.split(",")[0] || fallback, 120);
  const parts = [addr.house_number, addr.road || addr.pedestrian || addr.residential || addr.hamlet]
    .map((p) => clean(p, 60))
    .filter(Boolean);
  if (parts.length) return parts.join(" ").slice(0, 120);
  return clean(fallback.split(",")[0] || fallback, 120);
}

function buildLine2(addr: Record<string, string> | undefined): string {
  if (!addr) return "";
  const parts = [addr.suburb, addr.neighbourhood, addr.quarter, addr.city_district]
    .map((p) => clean(p, 60))
    .filter(Boolean);
  // Dedupe against city
  const city = pickCity(addr).toLowerCase();
  return parts.filter((p) => p.toLowerCase() !== city).slice(0, 2).join(", ").slice(0, 120);
}

async function searchNominatim(query: string): Promise<AddressSuggestion[]> {
  await waitForNominatimSlot();
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("countrycodes", "in");
  url.searchParams.set("limit", "6");
  url.searchParams.set("dedupe", "1");

  const res = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "User-Agent": "BexoBilling/1.0 (billing@acedigital.cc)",
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    throw new Error(`Nominatim ${res.status}`);
  }
  const rows = (await res.json()) as Array<{
    place_id?: number;
    display_name?: string;
    address?: Record<string, string>;
  }>;

  return (rows || [])
    .map((row, idx) => {
      const addr = row.address || {};
      const label = clean(row.display_name, 180);
      const postalCode = clean(addr.postcode, 16).replace(/\s+/g, "");
      return {
        id: String(row.place_id || idx),
        label,
        line1: buildLine1(addr, label),
        line2: buildLine2(addr),
        city: pickCity(addr),
        state: clean(addr.state, 80),
        postalCode: /^[1-9][0-9]{5}$/.test(postalCode) ? postalCode : "",
        country: "IN",
      } satisfies AddressSuggestion;
    })
    .filter((s) => s.line1.length >= 2 || s.city.length >= 2);
}

async function lookupIndiaPincode(pin: string): Promise<PincodeLookup | null> {
  const res = await fetch(`https://api.postalpincode.in/pincode/${pin}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Pincode API ${res.status}`);
  const payload = (await res.json()) as Array<{
    Status?: string;
    PostOffice?: Array<{
      Name?: string;
      District?: string;
      State?: string;
      Block?: string;
      Division?: string;
    }> | null;
  }>;
  const first = payload?.[0];
  if (!first || first.Status !== "Success" || !first.PostOffice?.length) return null;

  const offices = first.PostOffice;
  const primary = offices[0];
  // Prefer locality (Block/Division) over broad District for billing city.
  const city = clean(
    primary.Block || primary.Division || primary.District || "",
    80,
  );
  const state = clean(primary.State || "", 80);
  const district = clean(primary.District || city, 80);
  const areas = Array.from(
    new Set(
      offices
        .map((o) => clean(o.Name, 80))
        .filter(Boolean)
        .slice(0, 8),
    ),
  );

  return {
    postalCode: pin,
    city,
    state,
    district,
    areas,
  };
}

/** Open address search (India) — Nominatim, proxied + cached. */
router.get("/address-suggest", requireAuth, async (req: any, res: any) => {
  const q = clean(req.query?.q, 100);
  if (q.length < 3) {
    return res.json({ suggestions: [] as AddressSuggestion[] });
  }

  const cacheKey = q.toLowerCase();
  const cached = getCached(suggestCache, cacheKey);
  if (cached) return res.json({ suggestions: cached, cached: true });

  try {
    const suggestions = await searchNominatim(q);
    setCached(suggestCache, cacheKey, suggestions, SUGGEST_TTL_MS);
    res.json({ suggestions });
  } catch (error) {
    logger.warn({ error, q }, "Address suggest failed");
    res.status(502).json({ error: "Address search is temporarily unavailable.", suggestions: [] });
  }
});

/** PIN → city / state / area list (India Post). */
router.get("/pincode/:pin", requireAuth, async (req: any, res: any) => {
  const pin = clean(req.params?.pin, 16).replace(/\D/g, "");
  if (!/^[1-9][0-9]{5}$/.test(pin)) {
    return res.status(400).json({ error: "Enter a valid 6-digit PIN code." });
  }

  const cached = getCached(pinCache, pin);
  if (cached) return res.json({ ...cached, cached: true });

  try {
    const lookup = await lookupIndiaPincode(pin);
    if (!lookup) {
      return res.status(404).json({ error: "PIN code not found. Check and try again." });
    }
    setCached(pinCache, pin, lookup, PIN_TTL_MS);
    res.json(lookup);
  } catch (error) {
    logger.warn({ error, pin }, "Pincode lookup failed");
    res.status(502).json({ error: "PIN lookup is temporarily unavailable." });
  }
});

export default router;
