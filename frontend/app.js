/* cherry-ops frontend — Phase 1.
 * Fully generic: renders whatever products the daemon serves. Products are
 * created and edited in the GUI (JSON editor) and stored by the daemon under
 * its home directory — never in this repo. Live wiring (process-compose,
 * flags diff, runs, store data) arrives in Phases 2-4; those actions are
 * visible but disabled with an honest hint. */
"use strict";
const App = (() => {

/* ------------------------------------------------------------------ state */

let products = [];
let secretsByProduct = {};
let knownSecrets = [];
let secretsDir = "";
let health = null;
const state = { tab: null, offline: false, layout: {} };
let modalConfirm = null;
let dragKey = null;

const PH2 = "process-compose wiring lands in Phase 2";
const PH3 = "flags diff + git-gated publish land in Phase 3";
const PH4 = "live store/CI data lands in Phase 4";

/* -------------------------------------------------------------------- api */

async function api(path, opts) {
  const res = await fetch(path, Object.assign({ headers: { "Content-Type": "application/json" } }, opts));
  let body = {};
  try { body = await res.json(); } catch (_) {}
  if (!res.ok) {
    const err = new Error(body.error || res.statusText);
    err.errors = body.errors;
    throw err;
  }
  return body;
}

async function refresh() {
  try {
    health = await api("/api/health");
    products = (await api("/api/products")).products;
    const s = await api("/api/secrets/status");
    secretsByProduct = s.byProduct; knownSecrets = s.known; secretsDir = s.dir;
    state.offline = false;
  } catch (_) {
    state.offline = true;
  }
  if (state.tab !== "settings" && (!state.tab || !prod(state.tab)))
    state.tab = products.length ? products[0].id : null;
  render();
}

function prod(id) { return products.find(p => p.id === id); }
function productSecrets(pid) {
  return secretsByProduct[pid] || knownSecrets.map(s => ({ ...s, configured: false }));
}
function secretOk(pid, name) {
  const s = productSecrets(pid).find(x => x.name === name);
  return !!(s && s.configured);
}

/* -------------------------------------------------------------------- svg */

const EXT = '<svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 2H2.2v7.8H10V7"/><path d="M7 2h3v3"/><path d="M10 2 5.6 6.4"/></svg>';
const GEAR = '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.3"><circle cx="8" cy="8" r="2.6"/><path d="M8 1.8v2M8 12.2v2M1.8 8h2M12.2 8h2M3.6 3.6l1.4 1.4M11 11l1.4 1.4M12.4 3.6L11 5M5 11l-1.4 1.4"/></svg>';
const GRIP = '<svg viewBox="0 0 8 14" width="7" height="12" fill="currentColor"><circle cx="2" cy="2" r="1.1"/><circle cx="6" cy="2" r="1.1"/><circle cx="2" cy="7" r="1.1"/><circle cx="6" cy="7" r="1.1"/><circle cx="2" cy="12" r="1.1"/><circle cx="6" cy="12" r="1.1"/></svg>';

/* section identity: one color + one icon per block */
const SEC = {
  stores:  { c:"#5d6889", i:'<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><rect x="4.2" y="1.5" width="7.6" height="13" rx="1.6"/><path d="M7 12.4h2"/></svg>' },
  servers: { c:"#4066b8", i:'<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="2" y="2.5" width="12" height="4.6" rx="1.2"/><rect x="2" y="8.9" width="12" height="4.6" rx="1.2"/><path d="M4.6 4.8h.01M4.6 11.2h.01" stroke-linecap="round" stroke-width="1.8"/></svg>' },
  flags:   { c:"#6a48b5", i:'<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><path d="M3.5 14.5v-12h8.2l-2 2.8 2 2.8H3.5"/></svg>' },
  dash:    { c:"#1f7285", i:'<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="2" y="2" width="5.2" height="5.2" rx="1"/><rect x="8.8" y="2" width="5.2" height="5.2" rx="1"/><rect x="2" y="8.8" width="5.2" height="5.2" rx="1"/><rect x="8.8" y="8.8" width="5.2" height="5.2" rx="1"/></svg>' },
  release: { c:"#b0522f", i:'<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><path d="M14.5 1.5 1.5 6.8l4.6 1.9 1.9 5.8 6.5-13z"/><path d="M6.1 8.7l8.4-7.2"/></svg>' },
  revenue: { c:"#2b7a5d", i:'<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><circle cx="8" cy="8" r="6.2"/><path d="M8 4.6v6.8M10 6.1c-.4-.7-1.2-1-2-1-1.1 0-2 .6-2 1.5 0 2 4 1 4 2.9 0 .9-.9 1.5-2 1.5-.8 0-1.6-.3-2-1"/></svg>' },
  alerts:  { c:"#c04361", i:'<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2.2a3.8 3.8 0 0 0-3.8 3.8c0 2.9-1.4 3.8-1.4 3.8h10.4S11.8 8.9 11.8 6A3.8 3.8 0 0 0 8 2.2z"/><path d="M6.9 12.6a1.2 1.2 0 0 0 2.2 0"/></svg>' },
  reviews: { c:"#96701c", i:'<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><path d="M8 1.9l1.9 3.8 4.2.6-3 3 .7 4.2L8 11.5l-3.8 2 .7-4.2-3-3 4.2-.6z"/></svg>' },
  daemon:  { c:"#5d6889", i:GEAR },
  secrets: { c:"#8d4a70", i:'<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><circle cx="5" cy="11" r="3"/><path d="M7.2 8.8 14 2M11.2 3.4l1.8 1.8M9.2 5.4l1.8 1.8"/></svg>' },
  productsCfg: { c:"#1f7285", i:'<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><path d="M4 1.5h5.5L13 5v9.5H4z"/><path d="M9.5 1.5V5H13"/></svg>' },
};

const DRAGGABLE = new Set(["servers","flags","dash","release","revenue","alerts","reviews","secrets"]);
const DEFAULT_LAYOUT = { left:["servers","flags","dash"], right:["release","revenue","alerts","secrets"], bottom:["reviews"] };

function secWrap(key, extra) {
  return '<section class="section '+(extra||"")+'" data-key="'+key+'" style="--sc:'+SEC[key].c+'">';
}

function secHead(key, title, sum, tools) {
  const grip = DRAGGABLE.has(key)
    ? '<span class="grip" title="Drag to reorder" draggable="true" '+
      'ondragstart="App.dragStart(event,\''+key+'\')" ondragend="App.dragEnd(event)">'+GRIP+'</span>'
    : "";
  return '<div class="sec-head"><div class="sec-title">'+grip+
         '<span class="sec-icon">'+SEC[key].i+'</span><span class="tt">'+title+'</span>'+
         (sum ? ' <span class="sum">'+sum+'</span>' : '')+'</div>'+
         '<div class="sec-tools">'+(tools||"")+'</div></div>';
}

function deeplink(href, text) {
  return '<a class="deeplink" href="'+href+'" target="_blank" rel="noopener">'+esc(text)+' '+EXT+'</a>';
}

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c =>
    ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
}

function stub(note) {
  return '<div class="cache-note" style="margin-top:0">'+esc(note)+'</div>';
}

/* ------------------------------------------------------------------ render */

function render() {
  document.body.classList.toggle("offline", state.offline);
  renderTabs();
  renderTopbar();
  const v = document.getElementById("view");
  if (state.tab === "settings") v.innerHTML = viewSettings();
  else {
    const p = prod(state.tab);
    v.innerHTML = p ? viewProduct(p) : viewEmpty();
  }
}

function renderTabs() {
  document.getElementById("tabs").innerHTML = products.map(p =>
    '<button class="tab '+(state.tab===p.id?"on":"")+'" onclick="App.go(\''+p.id+'\')">'+
      '<span class="sq">'+esc(p.name[0]||"?")+'</span><span class="nm">'+esc(p.name)+'</span>'+
      '<span class="dot off" title="status wiring lands in Phase 2"></span></button>'
  ).join("");
  document.getElementById("sidefoot").innerHTML =
    '<button class="tab" onclick="App.openEditor(null)">'+
      '<span class="sq">+</span><span class="nm">Add product</span></button>'+
    '<button class="tab '+(state.tab==="settings"?"on":"")+'" onclick="App.go(\'settings\')">'+
      '<span class="sq">'+GEAR+'</span><span class="nm">Settings</span></button>';
  if (health) document.getElementById("brand-ver").textContent = "v"+health.version+" · phase 1";
}

function renderTopbar() {
  const l = document.getElementById("tb-left");
  if (state.tab === "settings") l.innerHTML = '<span class="name">Settings</span>';
  else {
    const p = prod(state.tab);
    l.innerHTML = p
      ? '<span class="name">'+esc(p.name)+'</span><span class="repo">'+esc(p.repo||"")+'</span>'
      : '<span class="name muted">—</span>';
  }
  document.getElementById("daemon-chip").innerHTML = state.offline
    ? '<span class="chip err"><span class="dot err"></span>daemon · unreachable</span>'
    : '<span class="chip ok"><span class="dot ok"></span>daemon · connected</span>';
}

/* ---------- product page ---------- */

const SEC_BUILDERS = {
  servers: p => secServers(p), flags: p => secFlags(p), dash: p => secDashboards(p),
  release: p => secRelease(p), revenue: p => secRevenue(p), alerts: p => secAlerts(p),
  reviews: p => secReviews(p), secrets: p => secSecrets(p),
};

function layoutOf(p) {
  const saved = p.layout;
  const valid = saved && ["left","right","bottom"].every(z => Array.isArray(saved[z]))
    && ["left","right","bottom"].flatMap(z => saved[z]).every(k => DRAGGABLE.has(k));
  const lay = valid ? saved : JSON.parse(JSON.stringify(DEFAULT_LAYOUT));
  const present = new Set(["left","right","bottom"].flatMap(z => lay[z]));
  [...DRAGGABLE].filter(k => !present.has(k)).forEach(k => lay.right.push(k));
  return lay;
}

function zoneAttrs(z) {
  return 'data-zone="'+z+'" ondragover="App.dragOver(event)" '+
         'ondragleave="App.dragLeave(event)" ondrop="App.drop(event,\''+z+'\')"';
}

function viewProduct(p) {
  const lay = layoutOf(p);
  const zone = z => lay[z].map(k => SEC_BUILDERS[k](p)).join("");
  return verBand(p) +
    '<div class="cols">'+
      '<div class="col" '+zoneAttrs("left")+'>'+zone("left")+'</div>'+
      '<div class="col" '+zoneAttrs("right")+'>'+zone("right")+'</div>'+
    '</div>'+
    '<div class="col" '+zoneAttrs("bottom")+'>'+zone("bottom")+'</div>';
}

const INTEG = {
  revenuecat: { label:"RevenueCat",        secret:"revenuecat_secret",    url:"https://app.revenuecat.com" },
  app_store:  { label:"App Store Connect", secret:"asc_key_p8",           url:"https://appstoreconnect.apple.com" },
  play_store: { label:"Play Console",      secret:"play_service_account", url:"https://play.google.com/console" },
};

function verBand(p) {
  const integ = p.integrations || {};
  const cells = [];
  if (integ.app_store) cells.push({ store:"App Store", os:"iOS", url:INTEG.app_store.url });
  if (integ.play_store) cells.push({ store:"Google Play", os:"Android", url:INTEG.play_store.url });
  const body = cells.length
    ? cells.map(s =>
        '<div class="store">'+
        '<div class="eyebrow"><span>'+s.store+' · '+s.os+'</span>'+
        '<a href="'+s.url+'" target="_blank" rel="noopener" aria-label="Open '+s.store+'">'+EXT+'</a></div>'+
        '<div class="ver">— <span class="chip">'+ (secretOk(p.id, s.store==="App Store"?"asc_key_p8":"play_service_account") ? "awaiting Phase 4" : "credentials missing") +'</span></div>'+
        '<div class="vnote">live version + rollout status arrive in Phase 4</div>'+
        '</div>').join("")
    : '<div class="store"><div class="eyebrow"><span>Store versions</span></div>'+
      '<div class="vnote" style="margin-top:4px">Declare <span class="mono">integrations.app_store</span> / '+
      '<span class="mono">integrations.play_store</span> in the product config to track live versions here.</div></div>';
  return secWrap("stores", "verband")+body+'</section>';
}

function secServers(p) {
  const procs = (p.local && p.local.processes) || [];
  const rows = procs.map(x => {
    const openUrl = x.url || (x.port ? "http://localhost:"+x.port : null);
    return '<div class="prow">'+
      '<div class="st"><span class="dot off"></span> unknown</div>'+
      '<div class="info"><span class="lbl">'+esc(x.label||x.name)+'</span> '+
        '<span class="meta">'+esc(x.name)+(x.port?' · :'+x.port:'')+'</span></div>'+
      '<div class="up">—</div>'+
      '<div class="acts">'+
        '<button class="btn" disabled title="'+PH2+'">Start</button>'+
        '<button class="btn" disabled title="'+PH2+'">Stop</button>'+
        (openUrl ? '<a class="btn" href="'+openUrl+'" target="_blank" rel="noopener">Open '+EXT+'</a>' : "")+
        '<button class="btn" disabled title="'+PH2+'">Logs</button>'+
      '</div></div>';
  }).join("") || stub("No processes declared. Add them under local.processes in the product config.");
  const pcFile = p.local && p.local.process_compose_file;
  return secWrap("servers")+
    secHead("servers", "Local Servers", procs.length ? procs.length+" configured · status arrives in Phase 2" : "",
      '<button class="btn" disabled title="'+PH2+'">Start all</button>'+
      '<button class="btn" disabled title="'+PH2+'">Stop all</button>')+
    '<div class="sec-body">'+rows+
    (pcFile ? '<div class="cache-note">process-compose file: '+esc(pcFile)+'</div>' : "")+
    '</div></section>';
}

function secFlags(p) {
  const gb = p.growthbook && p.growthbook.local_url;
  return secWrap("flags")+
    secHead("flags", "Feature Flags", "publish is git-gated: export → commit → CI → cloud",
      gb ? deeplink(gb, "GrowthBook") : "")+
    '<div class="sec-body">'+
    (gb ? stub("Local vs cloud diff and the publish flow land in Phase 3.")
        : stub("Set growthbook.local_url in the product config to link your local GrowthBook."))+
    '</div></section>';
}

function secDashboards(p) {
  const base = p.grafana && p.grafana.base_url;
  const dashes = (p.grafana && p.grafana.dashboards) || [];
  const cards = dashes.map(d =>
    '<a class="card" href="'+(base||"")+'/d/'+esc(d.uid)+'" target="_blank" rel="noopener">'+
      '<span class="cl">'+esc(d.label||d.uid)+' <span class="faint">'+EXT+'</span></span>'+
      '<span class="cs">/d/'+esc(d.uid)+'</span></a>').join("");
  return secWrap("dash")+
    secHead("dash", "Dashboards", dashes.length ? dashes.length+" in Grafana" : "",
      base ? deeplink(base, "Grafana") : "")+
    '<div class="sec-body">'+
    (dashes.length ? '<div class="cards">'+cards+'</div>'
      : stub("Add grafana.base_url and grafana.dashboards to the product config to get deep-link cards here."))+
    '</div></section>';
}

function secRevenue(p) {
  const integ = p.integrations || {};
  const conns = Object.entries(INTEG).map(([k, def]) => {
    const declared = !!integ[k];
    const ok = declared && secretOk(p.id, def.secret);
    return '<div class="conn"><div class="top"><span class="nm">'+def.label+'</span>'+
      (ok ? '<span class="chip ok">connected</span>'
          : declared ? '<span class="chip warn">secret missing</span>'
                     : '<span class="chip">not configured</span>')+'</div>'+
      (declared
        ? '<span>'+deeplink(def.url, "Open console")+'</span>'
        : '<span class="hint">Declare integrations.'+k+' in the product config to enable.</span>')+
      '</div>';
  }).join("");
  return secWrap("revenue")+
    secHead("revenue", "Revenue / Stores", "read-only · KPI numbers arrive in Phase 4", "")+
    '<div class="sec-body"><div class="conns">'+conns+'</div>'+
    stub("KPI tiles (daemon-cached) land in Phase 4; charts live in Grafana.")+
    '</div></section>';
}

function secRelease(p) {
  const wfs = (p.release && p.release.workflows) || [];
  const rows = wfs.map(w =>
    '<div class="wf"><div class="wf-head">'+
      '<span class="id">'+esc(w.id)+'</span><span class="wl">'+esc(w.label||"")+'</span>'+
      '<button class="btn" disabled title="'+PH4+'">Dispatch…</button>'+
    '</div><div class="run faint">run history arrives in Phase 4</div></div>').join("")
    || stub("Add release.workflows to the product config to dispatch GitHub Actions from here.");
  return secWrap("release")+
    secHead("release", "Release", "workflow_dispatch via GitHub Actions",
      p.repo ? deeplink("https://github.com/"+esc(p.repo)+"/actions", "GitHub Actions") : "")+
    '<div class="sec-body">'+rows+'</div></section>';
}

function secAlerts(p) {
  const channel = p.alerts && p.alerts.channel;
  const base = p.grafana && p.grafana.base_url;
  const body = channel
    ? '<div class="srow" style="border-top:none">'+
        (secretOk(p.id, "discord_webhook")
          ? '<span class="chip ok">'+esc(channel)+' · webhook configured</span>'
          : '<span class="chip warn">'+esc(channel)+' · webhook secret missing</span>')+
        '<span class="sp">rules evaluate in Grafana → contact point → push via the '+esc(channel)+' mobile app</span>'+
        '<button class="btn" disabled title="'+PH4+'">Test ping</button></div>'+
      stub("Rule states and recent alerts land in Phase 4; define rules in Grafana → Alerting.")
    : stub("Set alerts.channel (e.g. \"discord\") in the product config, then add a matching contact point in Grafana.");
  return secWrap("alerts")+
    secHead("alerts", "Alerts", "rules live in Grafana; this panel only reports",
      base ? deeplink(base+"/alerting", "Grafana alerting") : "")+
    '<div class="sec-body">'+body+'</div></section>';
}

function secSecrets(p) {
  const rows = productSecrets(p.id).map(s =>
    '<div class="srow"><span class="sn">'+esc(s.name)+'</span><span class="sp">'+esc(s.use)+'</span>'+
    (s.configured ? '<span class="chip ok">configured</span>' : '<span class="chip">not configured</span>')+
    '<button class="btn" onclick="App.openSecret(\''+p.id+'\',\''+s.name+'\')">'+
      (s.configured ? "Rotate…" : "Set…")+'</button>'+
    '</div>').join("");
  return secWrap("secrets")+
    secHead("secrets", "Secrets", "per-product · write-only", "")+
    '<div class="sec-body">'+rows+
    '<div class="note-line">Each product keeps its own full set under '+
    '<code>'+esc(secretsDir)+'/'+esc(p.id)+'</code> (chmod 600). Values are write-only — '+
    'never displayed or returned after saving. To clear one, delete its file.</div>'+
    '</div></section>';
}

function secReviews(p) {
  const integ = p.integrations || {};
  const hasStore = integ.app_store || integ.play_store;
  return secWrap("reviews")+
    secHead("reviews", "Store Reviews", "scheduled collection · replies happen in the store console", "")+
    '<div class="sec-body">'+
    (hasStore
      ? stub("Daemon collection + AI summaries land in Phase 4. Note: the Play reviews API only looks back 7 days, so collection will run daily.")
      : stub("Declare a store integration in the product config; review collection starts once the app is live."))+
    '</div></section>';
}

/* ---------- settings ---------- */

function viewSettings() {
  const productRows = products.map(p =>
    '<div class="srow"><span class="sn">'+esc(p.id)+'</span>'+
    '<span class="sp">'+esc(p.name)+
      ' · '+(((p.local||{}).processes)||[]).length+' processes'+
      ' · '+(((p.grafana||{}).dashboards)||[]).length+' dashboards'+
      ' · '+(((p.release||{}).workflows)||[]).length+' workflows</span>'+
    '<button class="btn" onclick="App.openEditor(\''+p.id+'\')">Edit</button>'+
    '<button class="btn" onclick="App.confirmDelete(\''+p.id+'\')">Delete</button>'+
    '</div>').join("") || stub("No products yet.");

  const daemonSec = secWrap("daemon")+secHead("daemon","Daemon","","")+
    '<div class="sec-body"><dl class="kv-grid">'+
    '<dt>Status</dt><dd>'+(state.offline?"unreachable":"connected · v"+esc(health?health.version:"?"))+'</dd>'+
    '<dt>Listening</dt><dd>127.0.0.1:'+esc(health?health.port:"?")+' (localhost only)</dd>'+
    '<dt>Data dir</dt><dd>'+esc(health?health.home:"?")+'</dd>'+
    '</dl></div></section>';

  const productsSec = secWrap("productsCfg")+
    secHead("productsCfg", "Products", products.length+" configured",
      '<button class="btn" onclick="App.openEditor(null)">Add product…</button>')+
    '<div class="sec-body">'+productRows+
    '<div class="note-line">Products are configured here in the GUI and stored as JSON under the daemon data dir — the app itself ships with zero project data. Secrets live on each product\'s own page.</div>'+
    '</div></section>';

  return '<div class="cols">'+
    '<div class="col">'+daemonSec+'</div>'+
    '<div class="col">'+productsSec+'</div></div>';
}

/* ---------- empty state ---------- */

function viewEmpty() {
  return '<div class="empty"><h2>No products yet</h2>'+
    '<p>cherry-ops ships empty — add your first product and the portal composes '+
    'its tab from what you declare (local servers, flags, dashboards, release, stores, alerts).</p>'+
    '<button class="btn primary" onclick="App.openEditor(null)">Add product</button></div>';
}

/* ------------------------------------------------------------ product CRUD */

const TEMPLATE = {
  id: "my-app",
  name: "My App",
  repo: "user/my-app",
  local: {
    process_compose_file: "~/dev/my-app/process-compose.yaml",
    processes: [
      { name: "grafana", label: "Grafana", port: 3000 },
      { name: "growthbook", label: "GrowthBook", port: 3100 },
    ],
  },
  growthbook: { local_url: "http://localhost:3100" },
  grafana: {
    base_url: "http://localhost:3000",
    dashboards: [ { uid: "events", label: "Events" } ],
  },
  release: { workflows: [ { id: "release.yml", label: "Release" } ] },
  integrations: { revenuecat: {}, app_store: {} },
  alerts: { channel: "discord" },
};

function openEditor(id) {
  const existing = id ? prod(id) : null;
  const value = JSON.stringify(existing || TEMPLATE, null, 2);
  document.getElementById("modal").className = "modal wide";
  document.getElementById("modal").innerHTML =
    '<h3>'+(existing ? "Edit product — "+esc(existing.name) : "Add product")+'</h3>'+
    '<div class="mb" style="margin-bottom:8px">Declare only what the product has — every section '+
    'renders from this config and hides gracefully when a key is absent. Stored outside the repo, in the daemon data dir.</div>'+
    '<textarea class="editor" id="ped" spellcheck="false">'+esc(value)+'</textarea>'+
    '<div class="errbox" id="ped-err"></div>'+
    '<div class="mfoot"><button class="btn" onclick="App.closeModal()">Cancel</button>'+
    '<button class="btn primary" onclick="App.saveProduct('+(existing?'\''+existing.id+'\'':'null')+')">Save</button></div>';
  document.getElementById("overlay").classList.add("open");
  modalConfirm = null;
}

async function saveProduct(origId) {
  const errBox = document.getElementById("ped-err");
  let body;
  try { body = JSON.parse(document.getElementById("ped").value); }
  catch (e) { errBox.textContent = "Not valid JSON: "+e.message; errBox.classList.add("show"); return; }
  try {
    if (origId) await api("/api/products/"+origId, { method:"PUT", body: JSON.stringify(body) });
    else await api("/api/products", { method:"POST", body: JSON.stringify(body) });
  } catch (e) {
    errBox.textContent = (e.errors && e.errors.length) ? e.errors.join("\n") : e.message;
    errBox.classList.add("show");
    return;
  }
  closeModal();
  state.tab = origId || body.id;
  await refresh();
}

/* Write-once secret entry: the value is POSTed to the local daemon and the
 * textarea is cleared immediately; nothing is cached or ever shown again. */
function openSecret(pid, name) {
  const s = productSecrets(pid).find(x => x.name === name) || { name, use: "" };
  const el = document.getElementById("modal");
  el.className = "modal";
  el.innerHTML =
    '<h3>Set secret — '+esc(pid)+' / '+esc(name)+'</h3>'+
    '<div class="mb" style="margin-bottom:8px">'+esc(s.use)+'</div>'+
    '<textarea class="editor" id="sed" style="min-height:120px" spellcheck="false" '+
      'autocomplete="off" autocapitalize="off" '+
      'placeholder="Paste the value (multi-line is fine, e.g. a .p8 key)"></textarea>'+
    '<div class="errbox" id="sed-err"></div>'+
    '<div class="mb" style="margin-top:8px;font-size:11px">Write-only: stored as '+
    '<span class="mono">'+esc(secretsDir)+'/'+esc(pid)+'/'+esc(name)+'</span> (chmod 600) on this machine. '+
    'It is never shown or returned again — not by this UI, not by any API. '+
    'To clear it, delete that file; to rotate, set it again here.</div>'+
    '<div class="mfoot"><button class="btn" onclick="App.closeModal()">Cancel</button>'+
    '<button class="btn primary" onclick="App.saveSecret(\''+pid+'\',\''+name+'\')">Save</button></div>';
  document.getElementById("overlay").classList.add("open");
  modalConfirm = null;
}

async function saveSecret(pid, name) {
  const ta = document.getElementById("sed");
  const errBox = document.getElementById("sed-err");
  if (!ta.value.trim()) { errBox.textContent = "Value is empty."; errBox.classList.add("show"); return; }
  try {
    await api("/api/products/"+pid+"/secrets/"+name, { method: "POST", body: JSON.stringify({ value: ta.value }) });
  } catch (e) {
    errBox.textContent = e.message; errBox.classList.add("show"); return;
  }
  ta.value = "";
  closeModal();
  await refresh();
}

function confirmDelete(id) {
  const p = prod(id);
  openModal({
    title: "Delete product",
    body: '<div class="mb">Remove <strong>'+esc(p.name)+'</strong> ('+esc(id)+') from the portal? '+
          'This deletes the portal config and its stored secrets — it touches nothing in the product itself.</div>',
    confirm: "Delete",
    onConfirm: async () => {
      try { await api("/api/products/"+id, { method:"DELETE" }); } catch (_) {}
      if (state.tab === id) state.tab = null;
      await refresh();
    },
  });
}

/* -------------------------------------------------------- drag-to-reorder */

function dragStart(e, key) {
  dragKey = key;
  e.dataTransfer.effectAllowed = "move";
  try { e.dataTransfer.setData("text/plain", key); } catch (_) {}
  const sec = e.target.closest(".section");
  if (sec) {
    e.dataTransfer.setDragImage(sec, 24, 16);
    requestAnimationFrame(() => sec.classList.add("dragging"));
  }
  document.body.classList.add("dragging-layout");
}

function clearDragMarks() {
  document.querySelectorAll(".drop-before,.drop-after").forEach(el =>
    el.classList.remove("drop-before","drop-after"));
}

function dragEnd() {
  document.body.classList.remove("dragging-layout");
  clearDragMarks();
  document.querySelectorAll(".section.dragging").forEach(el => el.classList.remove("dragging"));
  dragKey = null;
}

function targetIndex(container, y) {
  const kids = [...container.children].filter(el =>
    el.classList.contains("section") && !el.classList.contains("dragging"));
  let i = 0;
  for (const k of kids) {
    const r = k.getBoundingClientRect();
    if (y > r.top + r.height/2) i++; else break;
  }
  return { i, kids };
}

function dragOver(e) {
  if (!dragKey) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  const { i, kids } = targetIndex(e.currentTarget, e.clientY);
  clearDragMarks();
  if (kids[i]) kids[i].classList.add("drop-before");
  else if (kids.length) kids[kids.length-1].classList.add("drop-after");
}

function dragLeave(e) {
  if (e.currentTarget.contains(e.relatedTarget)) return;
  clearDragMarks();
}

function drop(e, zone) {
  if (!dragKey) return;
  e.preventDefault();
  const { i } = targetIndex(e.currentTarget, e.clientY);
  moveSec(dragKey, zone, i);
  dragEnd();
}

function moveSec(key, zone, i) {
  const p = prod(state.tab);
  if (!p) return;
  const lay = layoutOf(p);
  ["left","right","bottom"].forEach(z => { lay[z] = lay[z].filter(k => k !== key); });
  lay[zone].splice(i, 0, key);
  p.layout = lay;
  render();
  api("/api/products/"+p.id, { method:"PUT", body: JSON.stringify(p) })
    .catch(() => { state.offline = true; render(); });
}

/* ------------------------------------------------------------------ modal */

function openModal({ title, body, confirm, onConfirm }) {
  modalConfirm = onConfirm;
  document.getElementById("modal").className = "modal";
  document.getElementById("modal").innerHTML =
    '<h3>'+title+'</h3>'+body+
    '<div class="mfoot"><button class="btn" onclick="App.closeModal()">Cancel</button>'+
    '<button class="btn primary" onclick="App.confirmModal()">'+confirm+'</button></div>';
  document.getElementById("overlay").classList.add("open");
}
function closeModal() { document.getElementById("overlay").classList.remove("open"); modalConfirm = null; }
function confirmModal() { const f = modalConfirm; closeModal(); if (f) f(); }

/* ------------------------------------------------------------------- boot */

function go(tab) { state.tab = tab; render(); }

document.getElementById("overlay").addEventListener("click", e => {
  if (e.target.id === "overlay") closeModal();
});
document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });

refresh();
setInterval(async () => {
  try {
    await api("/api/health");
    if (state.offline) refresh();
  } catch (_) {
    if (!state.offline) { state.offline = true; render(); }
  }
}, 5000);

return { go, openEditor, saveProduct, confirmDelete, openSecret, saveSecret,
         openModal, closeModal, confirmModal,
         dragStart, dragEnd, dragOver, dragLeave, drop, moveSec, refresh };
})();
