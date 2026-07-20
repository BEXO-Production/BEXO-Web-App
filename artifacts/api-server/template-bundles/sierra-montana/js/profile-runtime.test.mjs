/**
 * Deterministic checks for Sierra profile normalization helpers.
 * Run: node --test js/profile-runtime.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(__dirname, "profile-runtime.js"), "utf8");

function loadRuntime(overrides = {}) {
  const sandbox = {
    window: {},
    location: { pathname: "/" },
    document: { readyState: "complete", addEventListener() {} },
    console,
    globalThis: null,
    ...overrides,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox);
  return sandbox.BexoProfile;
}

test("normalizes aliases and omits phone from public contact", () => {
  const BexoProfile = loadRuntime();
  const profile = BexoProfile.normalizeProfile({
    user: { name: "Kavin Test", email: "a@b.com" },
    profile: { handle: "kavin", headline: "Builder", bio: "About text" },
    contactData: {
      email: "a@b.com",
      phone: "+1-555-0100",
      github: "https://github.com/x",
      linkedin: "https://linkedin.com/in/x",
    },
  });

  assert.equal(profile.profile.handle, "kavin");
  assert.equal(profile.user.name, "Kavin Test");
  assert.equal(profile.contactData.email, "a@b.com");
  assert.equal(profile.contactData.phone, undefined);
  assert.ok(!JSON.stringify(profile).includes("+1-555-0100"));
});

test("clamps headline and about to safe limits", () => {
  const BexoProfile = loadRuntime();
  const long = "word ".repeat(80);
  const profile = BexoProfile.normalizeProfile({
    user: { name: "X" },
    profile: { handle: "x", headline: long, bio: long, careerGoal: long },
    aboutEntries: [{ bio: long, description: long, title: long }],
  });
  assert.ok(profile.profile.headline.length <= BexoProfile.TEXT_LIMITS.headline);
  assert.ok(profile.profile.bio.length <= BexoProfile.TEXT_LIMITS.summary);
  assert.ok(profile.aboutEntries[0].bio.length <= BexoProfile.TEXT_LIMITS.about);
});

test("resolves base paths for nested pages and assets", () => {
  const BexoProfile = loadRuntime({
    __BEXO_BASE_PATH__: "/api/render/kavin/sierra-montana",
  });
  assert.equal(
    BexoProfile.resolvePath("pages/portfolio.html"),
    "/api/render/kavin/sierra-montana/pages/portfolio.html",
  );
  assert.equal(
    BexoProfile.resolvePath("/css/styles.css"),
    "/api/render/kavin/sierra-montana/css/styles.css",
  );
});

test("deduplicates social links by URL", () => {
  const BexoProfile = loadRuntime();
  const profile = BexoProfile.normalizeProfile({
    user: { name: "X" },
    profile: { handle: "x" },
    contactData: {
      github: "https://github.com/a",
      linkedin: "https://linkedin.com/in/a",
      customLinks: [
        { url: "https://github.com/a", label: "GitHub again" },
        { url: "https://x.com/a", label: "X" },
      ],
    },
  });
  const urls = (profile.contactData.socials || []).map((l) => l.url);
  assert.equal(new Set(urls).size, urls.length);
  assert.ok(urls.includes("https://github.com/a"));
  assert.ok(urls.includes("https://x.com/a"));
});

test("splits single-token display names", () => {
  const BexoProfile = loadRuntime();
  const parts = BexoProfile.splitDisplayName("Madonna");
  assert.equal(parts.isSingle, true);
  assert.equal(parts.firstName, "Madonna");
});
