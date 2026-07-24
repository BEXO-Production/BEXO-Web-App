import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { BEXO_FOOTER_COPYRIGHT } from "./brand";
import { injectShareMetaIntoHtml } from "./shareMeta";

const EXTENSION_PATTERN = /\.[a-z0-9]+$/i;

function serializeForInlineScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export function injectPortfolioBootstrap(
  html: string,
  profile: unknown,
  basePath = "/",
): string {
  const normalizedBase = basePath === "/" ? "/" : basePath.replace(/\/+$/, "");
  const assetRoot = normalizedBase === "/" ? "" : normalizedBase;
  const logoUrl = `${assetRoot}/bexo-logo.png`;
  const siteIconUrl = `${assetRoot}/bexo-logo.png`;

  // Absolute logo/favicon URLs work on every route (SPA nested paths + multi-page depth).
  // Also normalize assets/bexo-logo.png → root bexo-logo.png so Sierra matches Cura/Nico.
  let prepared = html
    .replace(/(href|src)=["'][^"']*bexo-logo\.png["']/gi, `$1="${logoUrl}"`)
    .replace(/(href|src)=["'][^"']*site-icon\.png["']/gi, `$1="${siteIconUrl}"`)
    .replace(/(href|src)=["'][^"']*favicon\.(?:ico|png)["']/gi, `$1="${logoUrl}"`);

  // SPA shells need <base> so ./assets/* still resolve when the URL is /portfolio or /project/:id.
  // Multi-page templates (Sierra) must NOT get <base> — they rely on ../ depth prefixes.
  const isSpaShell = /id=["']root["']/i.test(prepared) || /type=["']module["']/i.test(prepared);
  const baseHref = normalizedBase === "/" ? "/" : `${normalizedBase}/`;
  const baseTag = isSpaShell ? `<base href=${serializeForInlineScript(baseHref)} />` : "";

  const footerSync = `<script>
window.__BEXO_FOOTER_COPYRIGHT__ = ${serializeForInlineScript(BEXO_FOOTER_COPYRIGHT)};
(function () {
  var copy = window.__BEXO_FOOTER_COPYRIGHT__;
  if (!window.BexoProfile) window.BexoProfile = {};
  window.BexoProfile.getFooterCopyright = function () { return copy; };
  function apply() {
    document.querySelectorAll(
      ".footer-copy, .footer-copyright p, .footer-copyright-line p, .project-footer .copyright span, .copyright"
    ).forEach(function (el) {
      if (!el || el.tagName === "A") return;
      if (el.classList && el.classList.contains("copyright") && el.tagName !== "SPAN" && el.tagName !== "P" && el.tagName !== "DIV") return;
      var t = (el.textContent || "").trim();
      if (t && /BEXO|Ace Digital|rights reserved/i.test(t)) el.textContent = copy;
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", apply);
  else apply();
  setTimeout(apply, 2000);
})();
</script>`;

  const injection = `${baseTag}<script>
window.__BEXO_PROFILE__ = ${serializeForInlineScript(profile)};
window.__BEXO_BASE_PATH__ = ${serializeForInlineScript(normalizedBase)};
</script>${footerSync}<script>
(function(){
  try {
    if (window.__BEXO_HIT_SENT__) return;
    window.__BEXO_HIT_SENT__ = true;
    var p = window.__BEXO_PROFILE__ || {};
    var handle = (p.profile && p.profile.handle) || (p.handle) || "";
    var profileId = (p.profile && p.profile.id) || p.profileId || "";
    var preview = /(?:\\?|&)preview=1(?:&|$)/.test(location.search) || /preview_template=/.test(location.search);
    var body = JSON.stringify({
      handle: handle,
      profileId: profileId || undefined,
      path: location.pathname || "/",
      referrer: document.referrer || "",
      preview: preview
    });
    var url = "/api/analytics/portfolio-hit";
    if (navigator.sendBeacon) {
      navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
    } else {
      fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: body, keepalive: true }).catch(function(){});
    }
  } catch (e) {}
})();
</script>`;

  prepared = prepared.includes("</head>")
    ? prepared.replace("</head>", `${injection}</head>`)
    : `${injection}${prepared}`;

  // WhatsApp / LinkedIn / Twitter read these from the HTML response (no JS).
  return injectShareMetaIntoHtml(prepared, profile, { iconUrl: logoUrl });
}

export function resolveTemplateFile(bundleRoot: string, requestPath: string): string | null {
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(requestPath.split("?")[0] || "/");
  } catch {
    return null;
  }

  if (decodedPath.split("/").includes("..")) return null;

  const relativePath = decodedPath.replace(/^\/+/, "");
  const candidate = path.resolve(bundleRoot, relativePath || "index.html");
  const normalizedRoot = `${path.resolve(bundleRoot)}${path.sep}`;

  if (candidate !== path.resolve(bundleRoot) && !candidate.startsWith(normalizedRoot)) {
    return null;
  }

  if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;

  // Client-side routes use the SPA shell; missing files remain real 404s.
  if (!EXTENSION_PATTERN.test(relativePath)) {
    const indexPath = path.join(bundleRoot, "index.html");
    return existsSync(indexPath) ? indexPath : null;
  }

  return null;
}

export function getTemplateBundleRoot(templateId: string): string | null {
  const safeTemplateId = templateId.replace(/[^a-z0-9-]/gi, "");
  if (!safeTemplateId || safeTemplateId !== templateId) return null;

  // pnpm starts this package with cwd=artifacts/api-server; the production
  // Docker entrypoint starts from the monorepo root. Support both layouts.
  const candidates = [
    path.resolve(process.cwd(), "template-bundles", safeTemplateId),
    path.resolve(
      process.cwd(),
      "artifacts",
      "api-server",
      "template-bundles",
      safeTemplateId,
    ),
  ];

  return candidates.find((root) => existsSync(path.join(root, "index.html"))) || null;
}
