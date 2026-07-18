import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  injectPortfolioBootstrap,
  resolveTemplateFile,
} from "./templateRuntime";

test("injects profile and base path without allowing script breakout", () => {
  const html = "<html><head><title>Portfolio</title></head><body></body></html>";
  const profile = { profile: { handle: "</script><script>alert(1)</script>" } };

  const result = injectPortfolioBootstrap(html, profile, "/api/render/kavin");

  assert.match(result, /window\.__BEXO_PROFILE__/);
  assert.match(result, /window\.__BEXO_BASE_PATH__ = "\/api\/render\/kavin"/);
  assert.doesNotMatch(result, /<\/script><script>alert/);
  assert.match(result, /\\u003c\/script>/);
});

test("resolves assets and falls back to index.html for SPA routes", () => {
  const root = mkdtempSync(path.join(tmpdir(), "bexo-template-"));
  mkdirSync(path.join(root, "assets"));
  writeFileSync(path.join(root, "index.html"), "INDEX");
  writeFileSync(path.join(root, "assets", "app.js"), "APP");

  assert.equal(resolveTemplateFile(root, "/assets/app.js"), path.join(root, "assets", "app.js"));
  assert.equal(resolveTemplateFile(root, "/portfolio"), path.join(root, "index.html"));
});

test("rejects traversal outside the template bundle", () => {
  const root = mkdtempSync(path.join(tmpdir(), "bexo-template-"));
  writeFileSync(path.join(root, "index.html"), "INDEX");

  assert.equal(resolveTemplateFile(root, "/../../secret.txt"), null);
});
