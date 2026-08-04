# Phase 0 design decisions (final)

Sign-off date: 2026-08-03. The clickable spec is `design/mockup.html` (single file,
open in any browser). This document records what was settled during Phase 0 review
so Phase 1 can implement against it without re-deriving intent.

## Information architecture (additions vs HANDOFF)

- **Two-column product page.** Fixed top band + two drop zones (left / right) +
  a full-width bottom zone. Default grouping: left = local dev loop (Local
  Servers, Feature Flags, Dashboards); right = ship & live (Release,
  Revenue/Stores, Alerts); bottom = Store Reviews.
- **Store versions band** (new, pinned at top): one cell per store with the live
  version prominently displayed — state chip (live / not published / not
  configured), phased/staged rollout note, in-review sub-line. Data comes from
  daemon-cached ASC / Play APIs.
- **Alerts section** (new): Grafana alert rules → Discord contact point →
  Discord mobile app push. The portal only shows channel status, rule states
  (normal/firing), recent alerts, and a daemon-side "Test ping". Rules
  themselves live in Grafana (thin-shell principle). Secret: `discord_webhook`.
- **Store Reviews section** (new, scheduled collection + analysis):
  - Daemon collects reviews on a schedule (default daily). Hard constraint:
    the Play reviews API only looks back 7 days, so collection must never
    pause longer than that. Manual "Collect now" exists.
  - Analysis is a periodic daemon job (weekly): sentiment split + recurring
    themes (AI-drafted from the raw reviews, cheap model tier).
  - Replies deep-link to the store consoles; the portal never posts replies.
  - Reuses `asc_key_p8` / `play_service_account`; starts automatically once a
    store presence exists.
- **Drag-to-reorder** (required for the real system): every section carries a
  drag grip in its header; sections move within and across the three zones.
  Order is per product and must persist (daemon-side ui-state file or
  localStorage — decide in Phase 1; mockup keeps it in memory). The versions
  band is pinned.

## Visual system (tokens, final)

- Light pastel base: lavender-pink mist background `#f6f4f8`, white cards,
  plum-tinted ink/lines/shadows. Flat colors, no gradients, no emoji icons.
- Bold filled headers (Material 3 container/on-container pattern): top bar =
  brand rose `--header:#b84a75`; each section header = its identity color with
  white foreground layers (title #fff, summary 72% white, icon chip 18% white,
  translucent white ghost buttons/links).
- Section identity colors (`SEC` map). Single token per section, used both as
  header fill (white text) and as body-side accent on white — every value was
  chosen so white-on-fill contrast is ≥ 4.5:1 (WCAG AA):
  Servers `#4066b8` · Flags `#6a48b5` · Dashboards `#1f7285` · Release
  `#b0522f` · Revenue `#2b7a5d` · Alerts `#c04361` · Reviews `#96701c` ·
  Stores/Daemon `#5d6889`.
- Brand accent `--accent:#cf5f8d` (active tab, phased bar, focus, checkboxes).
  Primary action buttons are dark ink, not a hue.
- Status colors are reserved (running green / warn amber / failed red), always
  paired with a text label, never color-alone.
- All colors live in `:root` variables + the `SEC` map; port these as the
  Phase 1 design tokens.

## Demo data note

All three demo products are fictional. They exist to cover the three product
shapes the UI must handle: Lumen = healthy/rich (everything connected, phased
release in flight), Skylark = degraded (unhealthy process, firing alert,
failed publish), Burrow = cold start (everything stopped / unconfigured /
pre-release). The portal itself is fully generic: it composes each tab from a
`products/<name>.yaml` manifest, so any product mix works with zero UI code.

## Zero-project-info standard (added 2026-08-04, binding)

The repo (the panel itself) must never contain any project information.
Products are configured by the user in the GUI after opening the panel and
stored outside the repo in the daemon data dir (`~/.cherry-ops/products/*.json`,
overridable via `CHERRY_OPS_HOME`). This refines HANDOFF's manifest decision:
still manifest-driven and fully generic, but manifests are user data (JSON,
GUI-edited, hand-editable) rather than files in the repo. Demo/fictional data
may exist only inside `design/mockup.html`. Layout order is part of the product
config (`layout` key) and persists daemon-side.

## GUI secret entry (added 2026-08-04, owner override of HANDOFF lock #3)

Secrets MAY be entered in the GUI, under three binding conditions: (1) no
caching anywhere — `no-store` responses, no localStorage, entry field cleared
on save; (2) write-only / single-shot — after saving, no UI and no API can
display or return a value; (3) the local storage path
(`<home>/secrets/<name>`, chmod 600) is stated in the GUI so the user can
clear (delete the file) or rotate (set again). Everything else from HANDOFF #3
stands: values live only on the daemon host and are never embedded in pages.

Scope (owner decision 2026-08-04): secrets are PER-PRODUCT — one full set per
product at `<home>/secrets/<product-id>/<name>`, no global fallback. Each
product page carries its own Secrets section; account-level keys (ASC, Play,
GitHub) are intentionally duplicated across products for model simplicity.
Deleting a product deletes its secrets directory.

## Flags publish target (corrected 2026-08-04)

There is no GrowthBook Cloud in the owner's setup: the local self-hosted GB is
the only editor, and "published" means the SDK payload JSON uploaded to the
product's own CDN. Phase 3 therefore diffs the local GB feature API against
the currently published payload (a public URL — no credential needed) and the
git-gated chain ends at the CDN upload, not at a cloud GB API. One local GB
secret key suffices (`growthbook_token`; OSS only issues admin-scope keys,
acceptable for a localhost-only daemon). The product config will declare the
published payload URL per product so other setups (including a real GB Cloud)
can plug in the same way.

## Phase plan impact

- Reviews collection + analysis and alert test-ping are new daemon
  responsibilities → schedule into Phase 4 (integrations).
- Drag-to-reorder layout persistence → Phase 1 (frontend skeleton).
