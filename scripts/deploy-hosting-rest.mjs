// Deploy artifacts/bexo-web/dist/public to Firebase Hosting via REST API,
// authenticated with a gcloud access token (fallback for expired firebase CLI login).
// Usage: GCLOUD_TOKEN=$(gcloud auth print-access-token) node scripts/deploy-hosting-rest.mjs
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { gzipSync } from "node:zlib";

const SITE = "bexo-from-ace-digital";
const PUBLIC_DIR = new URL("../artifacts/bexo-web/dist/public", import.meta.url).pathname;
const TOKEN = process.env.GCLOUD_TOKEN;
if (!TOKEN) throw new Error("Set GCLOUD_TOKEN");

const API = "https://firebasehosting.googleapis.com/v1beta1";
const headers = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };

async function api(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${await res.text()}`);
  return res.json();
}

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

// Mirror firebase.json hosting config (rewrites, headers, cleanUrls, trailingSlash)
const firebaseJson = JSON.parse(readFileSync(new URL("../firebase.json", import.meta.url), "utf8"));
const h = firebaseJson.hosting;
const config = {
  rewrites: (h.rewrites || []).map((r) =>
    r.run ? { glob: r.source, run: { serviceId: r.run.serviceId, region: r.run.region } } : { glob: r.source, path: r.destination },
  ),
  headers: (h.headers || []).map((entry) => ({
    glob: entry.source,
    headers: Object.fromEntries(entry.headers.map((x) => [x.key, x.value])),
  })),
  cleanUrls: h.cleanUrls ?? false,
  trailingSlashBehavior: h.trailingSlash === false ? "REMOVE" : h.trailingSlash === true ? "ADD" : undefined,
};

const files = walk(PUBLIC_DIR);
const manifest = {}; // urlPath -> hash
const byHash = {}; // hash -> gzipped buffer
for (const file of files) {
  const gz = gzipSync(readFileSync(file), { level: 9 });
  const hash = createHash("sha256").update(gz).digest("hex");
  const urlPath = "/" + relative(PUBLIC_DIR, file).split("/").map(encodeURIComponent).join("/");
  manifest[urlPath] = hash;
  byHash[hash] = gz;
}
console.log(`Prepared ${files.length} files`);

const version = await api("POST", `/sites/${SITE}/versions`, { config });
console.log(`Version: ${version.name}`);

const populate = await api("POST", `/${version.name}:populateFiles`, { files: manifest });
const required = populate.uploadRequiredHashes || [];
console.log(`Uploading ${required.length} new files...`);

for (const hash of required) {
  const res = await fetch(`${populate.uploadUrl}/${hash}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/octet-stream" },
    body: byHash[hash],
  });
  if (!res.ok) throw new Error(`upload ${hash} -> ${res.status}: ${await res.text()}`);
}

await api("PATCH", `/${version.name}?updateMask=status`, { status: "FINALIZED" });
const release = await api("POST", `/sites/${SITE}/releases?versionName=${version.name}`, {});
console.log(`Released: ${release.name}`);
console.log("Deploy complete: https://bexo-from-ace-digital.web.app");
