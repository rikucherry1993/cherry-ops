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
const { execFile, exec } = require("node:child_process");

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

function readProduct(id) {
  try { return JSON.parse(fs.readFileSync(productPath(id), "utf8")); }
  catch { return null; }
}

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
  const pcPort = p.local && p.local.process_compose_port;
  if (pcPort != null && (!Number.isInteger(pcPort) || pcPort < 1 || pcPort > 65535))
    errors.push("local.process_compose_port: must be an integer 1-65535");
  const gbe = p.growthbook && p.growthbook.environments;
  if (gbe != null) {
    if (!Array.isArray(gbe)) errors.push("growthbook.environments: must be an array");
    else gbe.forEach((e, i) => {
      if (!e || typeof e.name !== "string" || !e.name)
        errors.push(`growthbook.environments[${i}].name: required (e.g. "prod", "dev")`);
    });
  }
  const rc = p.remote_config;
  if (rc != null) {
    if (typeof rc.url !== "string" || !rc.url) errors.push("remote_config.url: required when remote_config is declared");
    if (rc.fields != null) {
      if (!Array.isArray(rc.fields)) errors.push("remote_config.fields: must be an array");
      else rc.fields.forEach((f, i) => {
        if (!f || typeof f.key !== "string" || !f.key) errors.push(`remote_config.fields[${i}].key: required`);
      });
    }
    if (rc.publish_command != null && typeof rc.publish_command !== "string")
      errors.push("remote_config.publish_command: must be a string");
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

/* -------------------------------------------- process-compose (per product) */

function expandHome(p) {
  return p && p.startsWith("~") ? path.join(os.homedir(), p.slice(1)) : p;
}

async function pcFetch(port, pth, opts) {
  const res = await fetch("http://127.0.0.1:" + port + pth,
    Object.assign({ signal: AbortSignal.timeout(2500) }, opts));
  if (!res.ok) throw new Error("process-compose replied " + res.status);
  return res.json().catch(() => ({}));
}

/* Map process-compose state to the UI vocabulary. A running process whose
 * readiness probe reports "Not Ready" is surfaced as unhealthy. */
function mapProc(x) {
  let status;
  if (x.is_running && x.has_ready_probe && x.is_ready === "Not Ready") status = "unhealthy";
  else if (x.is_running) status = "running";
  else if (/^(Launching|Restarting|Pending)$/i.test(x.status || "")) status = "pending";
  else status = "stopped";
  return { name: x.name, status, ready: x.is_ready, restarts: x.restarts,
           exit_code: x.exit_code, uptime: x.system_time, raw: x.status };
}

function pcUp(file, port) {
  return new Promise((resolve, reject) => {
    execFile("process-compose", ["up", "-f", file, "-p", String(port), "-D"],
      { cwd: path.dirname(file), timeout: 20000 }, (err, stdout, stderr) => {
        if (err) reject(new Error((stderr || err.message).trim().slice(0, 400)));
        else resolve();
      });
  });
}

/* --------------------------------------- remote config + flags (generic) */

/* Vendor-agnostic by design: reads are public URLs, writes run the
 * user-supplied publish command in the user's own shell environment. */

function runCommand(cmd, timeoutMs) {
  return new Promise(resolve => {
    exec(cmd, { timeout: timeoutMs || 120000, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({ ok: !err, output: ((stdout || "") + (stderr ? "\n" + stderr : "")).trim().slice(-1500) });
    });
  });
}

async function fetchJson(u) {
  const res = await fetch(u, { signal: AbortSignal.timeout(8000), headers: { "Cache-Control": "no-cache" } });
  if (!res.ok) throw new Error(u + " replied " + res.status);
  return res.json();
}

/* A product can publish flags to several environments (prod/dev), each with
 * its own payload pair and publish command. Flat keys = one unnamed env. */
function gbEnvs(gb) {
  if (!gb) return [];
  if (Array.isArray(gb.environments))
    return gb.environments.filter(e => e && e.local_payload_url && e.published_payload_url);
  if (gb.local_payload_url && gb.published_payload_url)
    return [{ name: "default", local_payload_url: gb.local_payload_url,
              published_payload_url: gb.published_payload_url, publish_command: gb.publish_command }];
  return [];
}

function diffFeatures(loc, pub) {
  const lf = loc.features || {}, pf = pub.features || {};
  const summarize = v => {
    const s = JSON.stringify(v && v.defaultValue !== undefined ? v.defaultValue : v);
    return s && s.length > 60 ? s.slice(0, 57) + "…" : s;
  };
  const added = [], modified = [], removed = [];
  for (const k of Object.keys(lf)) {
    if (!(k in pf)) added.push({ key: k, chg: "∅ → " + summarize(lf[k]) });
    else if (JSON.stringify(lf[k]) !== JSON.stringify(pf[k])) {
      const a = summarize(pf[k]), b = summarize(lf[k]);
      modified.push({ key: k, chg: a === b ? b + " (rules changed)" : a + " → " + b });
    }
  }
  for (const k of Object.keys(pf)) if (!(k in lf)) removed.push({ key: k, chg: summarize(pf[k]) + " → ∅" });
  return { added, modified, removed, dateUpdated: pub.dateUpdated || null };
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

    /* process-compose proxy: one instance per product, addressed by the
     * port declared in the product config. The daemon never manages
     * processes itself — it only launches/stops the PC instance and
     * forwards its REST API. */
    const pm = p.match(/^\/api\/products\/([a-z0-9-]+)\/processes(\/.*)?$/);
    if (pm) {
      const id = pm[1], rest = pm[2] || "";
      const prodCfg = readProduct(id);
      if (!prodCfg) return send(res, 404, { error: "unknown product" });
      const local = prodCfg.local || {};
      const port = local.process_compose_port;
      const file = expandHome(local.process_compose_file);
      if (!port || !file)
        return send(res, 200, { available: false, reason: "not_configured" });

      if (rest === "" && req.method === "GET") {
        try {
          const data = await pcFetch(port, "/processes");
          return send(res, 200, { available: true, processes: (data.data || []).map(mapProc) });
        } catch {
          return send(res, 200, { available: false, reason: "down" });
        }
      }
      if (rest === "/up" && req.method === "POST") {
        if (!fs.existsSync(file))
          return send(res, 400, { error: "process-compose file not found: " + file });
        try { await pcUp(file, port); } catch (e) {
          return send(res, 502, { error: "failed to launch process-compose: " + e.message });
        }
        return send(res, 200, { ok: true });
      }
      if (rest === "/down" && req.method === "POST") {
        try { await pcFetch(port, "/project/stop", { method: "POST" }); } catch {}
        return send(res, 200, { ok: true });
      }
      const am = rest.match(/^\/([^/]+)\/(start|stop|restart)$/);
      if (am && req.method === "POST") {
        const name = decodeURIComponent(am[1]), action = am[2];
        const method = action === "stop" ? "PATCH" : "POST";
        try {
          await pcFetch(port, "/process/" + action + "/" + encodeURIComponent(name), { method });
          return send(res, 200, { ok: true });
        } catch (e) { return send(res, 502, { error: String(e.message || e) }); }
      }
      const lm = rest.match(/^\/([^/]+)\/logs$/);
      if (lm && req.method === "GET") {
        const tail = Math.min(Number(url.searchParams.get("tail") || 100), 1000);
        try {
          const data = await pcFetch(port,
            "/process/logs/" + encodeURIComponent(decodeURIComponent(lm[1])) + "/0/" + tail);
          return send(res, 200, { logs: data.logs || [] });
        } catch (e) { return send(res, 502, { error: String(e.message || e) }); }
      }
      return send(res, 404, { error: "unknown endpoint" });
    }

    /* Remote config: read the declared public URL; publish = merge the
     * declared fields into the current doc (everything else passes through
     * untouched), write a temp file, run the user's publish command. */
    const rcm = p.match(/^\/api\/products\/([a-z0-9-]+)\/remote-config$/);
    if (rcm) {
      const prodCfg = readProduct(rcm[1]);
      if (!prodCfg) return send(res, 404, { error: "unknown product" });
      const rc = prodCfg.remote_config;
      if (!rc || !rc.url) return send(res, 200, { available: false, reason: "not_configured" });

      if (req.method === "GET") {
        try {
          const doc = await fetchJson(rc.url);
          return send(res, 200, { available: true, doc, fields: rc.fields || [], url: rc.url,
                                  canPublish: !!rc.publish_command });
        } catch (e) {
          return send(res, 200, { available: false, reason: "fetch_failed", error: String(e.message || e) });
        }
      }
      if (req.method === "POST") {
        if (!rc.publish_command) return send(res, 400, { error: "remote_config.publish_command not set" });
        const body = JSON.parse(await readBody(req) || "{}");
        const values = body.values || {};
        const declared = new Set((rc.fields || []).map(f => f.key));
        for (const k of Object.keys(values))
          if (!declared.has(k)) return send(res, 400, { error: "field not declared: " + k });
        for (const f of rc.fields || []) {
          if (f.key in values && f.pattern != null) {
            const v = values[f.key];
            if (typeof v !== "string" || !(new RegExp("^(?:" + f.pattern + ")$")).test(v))
              return send(res, 400, { error: "field " + f.key + " does not match pattern " + f.pattern });
          }
        }
        let doc;
        try { doc = await fetchJson(rc.url); }
        catch (e) { return send(res, 502, { error: "could not read current doc: " + (e.message || e) }); }
        Object.assign(doc, values);
        const tmp = path.join(os.tmpdir(), "cherry-ops-rc-" + Date.now() + ".json");
        fs.writeFileSync(tmp, JSON.stringify(doc, null, 2) + "\n");
        const r = await runCommand(rc.publish_command.split("{file}").join(tmp));
        fs.rmSync(tmp, { force: true });
        if (!r.ok) return send(res, 502, { error: "publish command failed", output: r.output });
        let synced = false;
        try {
          const now = await fetchJson(rc.url);
          synced = Object.keys(values).every(k => JSON.stringify(now[k]) === JSON.stringify(doc[k]));
        } catch {}
        return send(res, 200, { ok: true, synced, output: r.output });
      }
    }

    /* Feature flags: deep-diff the local payload vs the published payload
     * (two public JSON documents); publish runs the user's command. */
    const fdm = p.match(/^\/api\/products\/([a-z0-9-]+)\/flags\/(diff|publish)$/);
    if (fdm) {
      const prodCfg = readProduct(fdm[1]);
      if (!prodCfg) return send(res, 404, { error: "unknown product" });
      const envs = gbEnvs(prodCfg.growthbook);
      if (!envs.length) return send(res, 200, { available: false, reason: "not_configured" });

      if (fdm[2] === "diff" && req.method === "GET") {
        const environments = await Promise.all(envs.map(async e => {
          try {
            const [loc, pub] = await Promise.all([fetchJson(e.local_payload_url), fetchJson(e.published_payload_url)]);
            return Object.assign({ name: e.name || "default", available: true,
                                   canPublish: !!e.publish_command }, diffFeatures(loc, pub));
          } catch (err) {
            return { name: e.name || "default", available: false, error: String(err.message || err) };
          }
        }));
        return send(res, 200, { available: true, environments });
      }
      if (fdm[2] === "publish" && req.method === "POST") {
        const body = JSON.parse(await readBody(req) || "{}");
        const env = envs.find(e => (e.name || "default") === (body.env || "default"));
        if (!env) return send(res, 400, { error: "unknown environment: " + (body.env || "default") });
        if (!env.publish_command)
          return send(res, 400, { error: "publish_command not set for environment " + (env.name || "default") });
        const r = await runCommand(env.publish_command);
        if (!r.ok) return send(res, 502, { error: "publish command failed", output: r.output });
        let diff = null, synced = false;
        try {
          const [loc, pub] = await Promise.all([fetchJson(env.local_payload_url), fetchJson(env.published_payload_url)]);
          diff = diffFeatures(loc, pub);
          synced = !diff.added.length && !diff.modified.length && !diff.removed.length;
        } catch {}
        return send(res, 200, { ok: true, env: env.name || "default", synced, diff, output: r.output });
      }
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
