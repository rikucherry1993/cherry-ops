# cherry-ops

A local, single-user DevOps portal for indie developers who run several app
products. One tab per product, aggregating: local dev servers (process-compose),
feature-flag publishing (GrowthBook, git-gated), Grafana dashboards, revenue /
store consoles, release pipelines (GitHub Actions), alerts and store reviews.

It is a **thin shell and remote control** — it never reimplements a tool's UI,
it shows status, triggers actions, and deep-links into the tool that owns them.

## Zero project data in this repo

The app ships completely empty. Everything user-specific — product
configuration, layout, secrets — is created through the GUI (or dropped as
files) under the daemon's data dir, outside the repo:

```
~/.cherry-ops/
  products/<id>.json     # one product config each; written by the GUI
  secrets/<id>/<name>    # secret values, one full set per product (chmod 600)
```

Secrets are **per-product and write-only**: enter them in the product's
Secrets section (or drop a file yourself) — after saving, no UI and no API can
ever display or return a value again. The storage path is shown in the GUI;
clearing a secret = deleting its file, rotating = setting it again. API
responses are `Cache-Control: no-store` and the entry field is cleared
immediately on save. Deleting a product also deletes its secrets.

Override the location with `CHERRY_OPS_HOME`, the port with `CHERRY_OPS_PORT`.

## Run

Requires Node.js >= 18. No dependencies, no build step.

```
node daemon/server.js
```

Then open http://127.0.0.1:8123 — you'll get the empty state; add your first
product from there. The daemon binds to localhost only.

## Product config (v1)

Declare only what the product has; every section renders from this config and
hides gracefully when a key is absent. The GUI editor is pre-filled with this
template:

```json
{
  "id": "my-app",
  "name": "My App",
  "repo": "user/my-app",
  "local": {
    "process_compose_file": "~/dev/my-app/process-compose.yaml",
    "processes": [ { "name": "grafana", "label": "Grafana", "port": 3000 } ]
  },
  "growthbook": { "local_url": "http://localhost:3100" },
  "grafana": { "base_url": "http://localhost:3000",
               "dashboards": [ { "uid": "events", "label": "Events" } ] },
  "release": { "workflows": [ { "id": "release.yml", "label": "Release" } ] },
  "integrations": { "revenuecat": {}, "app_store": {}, "play_store": {} },
  "alerts": { "channel": "discord" }
}
```

## Status

| Phase | Scope | State |
|---|---|---|
| 0 | Clickable design mockup (`design/mockup.html`) + decisions | done |
| 1 | Daemon skeleton, GUI-configured products, generic rendering, stubs | done |
| 2 | process-compose wiring: live status, start/stop, logs | next |
| 3 | GrowthBook diff + git-gated publish chain | planned |
| 4 | GitHub runs, store versions/KPIs/reviews, alert wiring | planned |

Design rationale and the full decision record live in `design/DECISIONS.md`.
