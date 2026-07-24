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
  // Non-SPA shell: no <base> tag
  assert.doesNotMatch(result, /<base href=/);
  assert.doesNotMatch(result, /<\/script><script>alert/);
  assert.match(result, /\\u003c\/script>/);
});

test("rewrites logo paths to absolute template URLs and bases SPA shells", () => {
  const html =
    '<html><head><link rel="icon" href="./bexo-logo.png" /></head><body><div id="root"><img src="/bexo-logo.png" alt="BEXO" /></div></body></html>';
  const result = injectPortfolioBootstrap(
    html,
    { profile: { handle: "kavin" } },
    "/api/render/kavin/nico-palmer",
  );

  assert.match(result, /<base href="\/api\/render\/kavin\/nico-palmer\/" \/>/);
  assert.match(result, /href="\/api\/render\/kavin\/nico-palmer\/bexo-logo\.png"/);
  assert.match(result, /src="\/api\/render\/kavin\/nico-palmer\/bexo-logo\.png"/);
  assert.doesNotMatch(result, /src="\/bexo-logo\.png"/);
});

test("does not inject base href into multi-page shells", () => {
  const html =
    '<html><head></head><body><img src="../assets/bexo-logo.png" alt="BEXO" /></body></html>';
  const result = injectPortfolioBootstrap(
    html,
    { profile: { handle: "kavin" } },
    "/api/render/kavin/sierra-montana",
  );

  assert.doesNotMatch(result, /<base href=/);
  assert.match(
    result,
    /src="\/api\/render\/kavin\/sierra-montana\/bexo-logo\.png"/,
  );
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

test("resolves nested multi-page HTML documents", () => {
  const root = mkdtempSync(path.join(tmpdir(), "bexo-template-"));
  mkdirSync(path.join(root, "pages", "projects"), { recursive: true });
  writeFileSync(path.join(root, "index.html"), "INDEX");
  writeFileSync(path.join(root, "pages", "portfolio.html"), "PORTFOLIO");
  writeFileSync(path.join(root, "pages", "projects", "project.html"), "PROJECT");

  assert.equal(
    resolveTemplateFile(root, "/pages/portfolio.html"),
    path.join(root, "pages", "portfolio.html"),
  );
  assert.equal(
    resolveTemplateFile(root, "/pages/projects/project.html"),
    path.join(root, "pages", "projects", "project.html"),
  );
});

test("injects bootstrap into nested HTML shells", () => {
  const html = "<html><head></head><body>Nested</body></html>";
  const result = injectPortfolioBootstrap(
    html,
    { profile: { handle: "kavin" } },
    "/api/render/kavin/sierra-montana",
  );
  assert.match(result, /window\.__BEXO_PROFILE__/);
  assert.match(result, /window\.__BEXO_BASE_PATH__ = "\/api\/render\/kavin\/sierra-montana"/);
});

test("injects Open Graph tags for portfolio sharing", () => {
  const html = "<html><head><title>Old</title></head><body></body></html>";
  const result = injectPortfolioBootstrap(
    html,
    {
      isPremium: true,
      profile: { handle: "kavin", headline: "CS student · Full-stack" },
      user: { name: "Kavin Balaji", photoUrl: "https://cdn.example/photo.jpg" },
    },
    "/",
  );

  assert.match(result, /<title>Kavin Balaji — CS student · Full-stack \| Portfolio<\/title>/);
  assert.match(result, /property="og:title" content="Kavin Balaji — CS student · Full-stack \| Portfolio"/);
  assert.match(result, /property="og:description" content="CS student · Full-stack\. Projects, experience, and Hire Me — live portfolio on BEXO\."/);
  assert.match(result, /property="og:image" content="https:\/\/cdn\.example\/photo\.jpg"/);
  assert.match(result, /property="og:url" content="https:\/\/kavin\.mybexo\.cyou"/);
  assert.match(result, /name="twitter:card" content="summary_large_image"/);
  assert.match(result, /name="robots" content="index, follow, max-image-preview:large"/);
  assert.match(result, /application\/ld\+json/);
  assert.match(result, /"@type":"Person"/);
  assert.match(result, /rel="icon" type="image\/png" href="\/bexo-logo\.png"/);
  assert.match(result, /rel="apple-touch-icon" href="\/bexo-logo\.png"/);
  assert.match(result, /name="application-name" content="BEXO"/);
  assert.match(result, /name="theme-color" content="#0b1220"/);
});

test("replaces template favicon links with injected BEXO icon", () => {
  const html =
    '<html><head><title>Old</title><link rel="icon" href="./wrong-icon.png" /></head><body></body></html>';
  const result = injectPortfolioBootstrap(
    html,
    {
      isPremium: true,
      profile: { handle: "kavin" },
      user: { name: "Kavin" },
    },
    "/",
  );

  assert.doesNotMatch(result, /wrong-icon\.png/);
  assert.match(result, /rel="icon" type="image\/png" href="\/bexo-logo\.png"/);
});
