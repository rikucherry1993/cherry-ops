#!/usr/bin/env node
/* cherry-ops daemon — Phase 1 skeleton.
 * Zero-dependency Node server: localhost-only JSON API + static frontend.
 * The panel ships with no project data; everything user-specific lives in
 * CHERRY_OPS_HOME (default ~/.cherry-ops), created on first run and
 * configured through the GUI. Nothing project-specific ever enters the repo. */
"use strict";
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const VERSION = "0.1.0";
const HOST = "127.0.0.1";
const PORT = Number(process.env.CHERRY_OPS_PORT || 8123);
const HOME = process.env.CHERRY_OPS_HOME || path.join(os.homedir(), ".cherry-ops");
const PRODUCTS_DIR = path.join(HOME, "products");
const SECRETS_DIR = path.join(HOME, "secrets");
const FRONTEND_DIR = path.join(__dirname, "..", "frontend");

/* Secret VALUES only ever exist as files under SECRETS_DIR/<product-id>/
 * (chmod 600) — one full set per product, no global fallback.
 * The API reports configured/not per name and never reads the contents. */
const KNOWN_SECRETS = [
  { name: "github_token",         use: "Dispatch workflows, read run status" },
  { name: "growthbook_token",     use: "Local GrowthBook API — read features for the publish diff" },
  { name: "revenuecat_secret",    use: "KPI proxy via charts API (cached)" },
  { name: "asc_key_p8",           use: "App Store Connect API — versions, phased release, reviews" },
  { name: "play_service_account", use: "Play Console API — versions, reviews" },
  { name: "discord_webhook",      use: "Alert contact point (Grafana) + test ping" },
];

const ID_RE = /^[a-z0-9][a-z0-9-]{0,31}$/;

fs.mkdirSync(PRODUCTS_DIR, { recursive: true });
fs.mkdirSync(SECRETS_DIR, { recursive: true, mode: 0o700 });

/* ------------------------------------------------------------ product store */

function productPath(id) { return path.join(PRODUCTS_DIR, id + ".json"); }

function listProducts() {
  return fs.readdirSync(PRODUCTS_DIR)
    .filter(f => f.endsWith(".json")).sort()
    .map(f => {
      try { return JSON.parse(fs.readFileSync(path.join(PRODUCTS_DIR, f), "utf8")); }
      catch { return null; }
    })
    .filter(Boolean);
}

function validateProduct(p) {
  const errors = [];
  if (!p || typeof p !== "object" || Array.isArray(p)) return ["product must be a JSON object"];
  if (!ID_RE.test(p.id || "")) errors.push("id: required lowercase slug (a-z, 0-9, '-'), max 32 chars");
  if (typeof p.name !== "string" || !p.name.trim()) errors.push("name: required, non-empty string");
  if (p.repo != null && typeof p.repo !== "string") errors.push('repo: must be a string like "user/repo"');
  const procs = p.local && p.local.processes;
  if (procs != null) {
    if (!Array.isArray(procs)) errors.push("local.processes: must be an array");
    else procs.forEach((x, i) => {
      if (!x || typeof x.name !== "string" || !x.name) errors.push(`local.processes[${i}].name: required`);
      if (x && x.port != null && (!Number.isInteger(x.port) || x.port < 1 || x.port > 65535))
        errors.push(`local.processes[${i}].port: must be an integer 1-65535`);
    });
  }
  const dashes = p.grafana && p.grafana.dashboards;
  if (dashes != null) {
    if (!Array.isArray(dashes)) errors.push("grafana.dashboards: must be an array");
    else dashes.forEach((d, i) => {
      if (!d || typeof d.uid !== "string" || !d.uid) errors.push(`grafana.dashboards[${i}].uid: required`);
    });
  }
  const wfs = p.release && p.release.workflows;
  if (wfs != null) {
    if (!Array.isArray(wfs)) errors.push("release.workflows: must be an array");
    else wfs.forEach((w, i) => {
      if (!w || typeof w.id !== "string" || !w.id) errors.push(`release.workflows[${i}].id: required`);
    });
  }
  return errors;
}

/* ------------------------------------------------------------------ helpers */

function send(res, code, body, type) {
  const data = type ? body : JSON.stringify(body);
  res.writeHead(code, { "Content-Type": type || "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on("data", c => {
      size += c.length;
      if (size > 262144) { reject(new Error("body too large")); req.destroy(); }
      else chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

const MIME = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml",
  ".png": "image/png", ".json": "application/json",
};

function serveStatic(res, urlPath) {
  const rel = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
  const file = path.normalize(path.join(FRONTEND_DIR, rel));
  if (file !== FRONTEND_DIR && !file.startsWith(FRONTEND_DIR + path.sep))
    return send(res, 403, { error: "forbidden" });
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, { error: "not found" });
    send(res, 200, data, MIME[path.extname(file)] || "application/octet-stream");
  });
}

/* ------------------------------------------------------------------- server */

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const p = url.pathname;
  try {
    if (p === "/api/health")
      return send(res, 200, { ok: true, version: VERSION, home: HOME, port: PORT, products: listProducts().length });

    if (p === "/api/products" && req.method === "GET")
      return send(res, 200, { products: listProducts() });

    if (p === "/api/products" && req.method === "POST") {
      const body = JSON.parse(await readBody(req) || "{}");
      const errors = validateProduct(body);
      if (errors.length) return send(res, 400, { error: "invalid product", errors });
      if (fs.existsSync(productPath(body.id)))
        return send(res, 409, { error: "a product with this id already exists" });
      fs.writeFileSync(productPath(body.id), JSON.stringify(body, null, 2) + "\n");
      return send(res, 201, { ok: true, product: body });
    }

    const m = p.match(/^\/api\/products\/([a-z0-9-]+)$/);
    if (m && req.method === "PUT") {
      const id = m[1];
      if (!fs.existsSync(productPath(id))) return send(res, 404, { error: "not found" });
      const body = JSON.parse(await readBody(req) || "{}");
      body.id = id;
      const errors = validateProduct(body);
      if (errors.length) return send(res, 400, { error: "invalid product", errors });
      fs.writeFileSync(productPath(id), JSON.stringify(body, null, 2) + "\n");
      return send(res, 200, { ok: true, product: body });
    }
    if (m && req.method === "DELETE") {
      const id = m[1];
      if (!fs.existsSync(productPath(id))) return send(res, 404, { error: "not found" });
      fs.unlinkSync(productPath(id));
      fs.rmSync(path.join(SECRETS_DIR, id), { recursive: true, force: true });
      return send(res, 200, { ok: true });
    }

    /* Write-only per-product secret entry: value goes to a chmod-600 file
     * under secrets/<product-id>/ and is never readable back. */
    const sm = p.match(/^\/api\/products\/([a-z0-9-]+)\/secrets\/([a-z0-9_]+)$/);
    if (sm && req.method === "POST") {
      const id = sm[1], name = sm[2];
      if (!fs.existsSync(productPath(id))) return send(res, 404, { error: "unknown product" });
      if (!KNOWN_SECRETS.some(s => s.name === name))
        return send(res, 404, { error: "unknown secret name" });
      const body = JSON.parse(await readBody(req) || "{}");
      if (typeof body.value !== "string" || !body.value.trim())
        return send(res, 400, { error: "value: required, non-empty string" });
      const dir = path.join(SECRETS_DIR, id);
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      const file = path.join(dir, name);
      fs.writeFileSync(file, body.value, { mode: 0o600 });
      fs.chmodSync(file, 0o600);
      return send(res, 200, { ok: true });
    }

    if (p === "/api/secrets/status") {
      const byProduct = {};
      for (const prod of listProducts())
        byProduct[prod.id] = KNOWN_SECRETS.map(s =>
          ({ ...s, configured: fs.existsSync(path.join(SECRETS_DIR, prod.id, s.name)) }));
      return send(res, 200, { byProduct, known: KNOWN_SECRETS, dir: SECRETS_DIR });
    }

    if (p.startsWith("/api/")) return send(res, 404, { error: "unknown endpoint" });
    if (req.method === "GET") return serveStatic(res, p);
    return send(res, 405, { error: "method not allowed" });
  } catch (e) {
    return send(res, 400, { error: String(e.message || e) });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`cherry-ops daemon v${VERSION} — http://${HOST}:${PORT} (home: ${HOME})`);
});
