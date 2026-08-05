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
const state = { tab: null, offline: false, layout: {}, procs: {}, logs: {}, expanded: new Set(),
                flags: {}, rc: {}, stores: {}, kpis: {}, reviews: {}, runs: {}, alertRules: {} };
let modalConfirm = null;
let dragKey = null;

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
  primeSections(state.tab);
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
const CHEV = c => '<svg class="chev '+(c?'open':'')+'" viewBox="0 0 10 10" width="9" height="9" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 1.5 7 5 3 8.5"/></svg>';
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
  config:  { c:"#5d6889", i:'<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M2 4.5h6M12.5 4.5H14M2 11.5h2.5M8.5 11.5H14"/><circle cx="10.4" cy="4.5" r="1.9"/><circle cx="6.4" cy="11.5" r="1.9"/></svg>' },
  daemon:  { c:"#5d6889", i:GEAR },
  secrets: { c:"#8d4a70", i:'<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><circle cx="5" cy="11" r="3"/><path d="M7.2 8.8 14 2M11.2 3.4l1.8 1.8M9.2 5.4l1.8 1.8"/></svg>' },
  productsCfg: { c:"#1f7285", i:'<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><path d="M4 1.5h5.5L13 5v9.5H4z"/><path d="M9.5 1.5V5H13"/></svg>' },
};

const DRAGGABLE = new Set(["servers","flags","config","dash","release","revenue","alerts","reviews","secrets"]);
const DEFAULT_LAYOUT = { left:["servers","flags","config","dash"], right:["release","revenue","alerts","secrets"], bottom:["reviews"] };

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

function rel(iso) {
  if (!iso) return "—";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 90) return "just now";
  if (s < 5400) return Math.round(s / 60) + "m ago";
  if (s < 129600) return Math.round(s / 3600) + "h ago";
  return Math.round(s / 86400) + "d ago";
}

function fmtDur(secs) {
  if (secs == null) return "—";
  const m = Math.floor(secs / 60), s = secs % 60;
  return m ? m + "m " + String(s).padStart(2, "0") + "s" : s + "s";
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

function aggDot(p) {
  const st = state.procs[p.id];
  if (!st || !st.available) return "off";
  const s = st.processes.map(x => x.status);
  if (s.includes("unhealthy")) return "err";
  if (s.length && s.every(x => x === "running")) return "ok";
  if (s.every(x => x === "stopped")) return "off";
  return "warn";
}

function renderTabs() {
  document.getElementById("tabs").innerHTML = products.map(p =>
    '<button class="tab '+(state.tab===p.id?"on":"")+'" onclick="App.go(\''+p.id+'\')">'+
      '<span class="sq">'+esc(p.name[0]||"?")+'</span><span class="nm">'+esc(p.name)+'</span>'+
      '<span class="dot '+aggDot(p)+'"></span></button>'
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
  servers: p => secServers(p), flags: p => secFlags(p), config: p => secConfig(p),
  dash: p => secDashboards(p), release: p => secRelease(p), revenue: p => secRevenue(p),
  alerts: p => secAlerts(p), reviews: p => secReviews(p), secrets: p => secSecrets(p),
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
  const st = state.stores[p.id];
  const cells = [];
  const cell = (label, os, url, d) => {
    let ver = "—", chip = '<span class="chip">loading…</span>', note = "", sub = "";
    if (d && d.error) { chip = '<span class="chip warn">unavailable</span>'; note = d.error; }
    else if (d && d.state === "live") {
      ver = "v"+d.version;
      chip = '<span class="chip ok">live</span>';
      if (d.phased) note = "phased release · day "+d.phased.day+"/7 · "+String(d.phased.state).toLowerCase();
      else if (d.staged) note = "staged update · v"+d.staged.version+
        (d.staged.fraction ? " · "+Math.round(d.staged.fraction*100)+"% of users" : "");
      if (d.pending) sub = "v"+d.pending.version+" · "+String(d.pending.state).replace(/_/g, " ").toLowerCase();
    } else if (d && d.state === "staged") {
      ver = "v"+(d.version || "?");
      chip = '<span class="chip warn">staged rollout</span>';
      if (d.staged && d.staged.fraction) note = Math.round(d.staged.fraction*100)+"% of users";
    } else if (d) {
      chip = '<span class="chip">not live</span>';
      if (d.pending) sub = "v"+d.pending.version+" · "+String(d.pending.state).replace(/_/g, " ").toLowerCase();
    }
    return '<div class="store">'+
      '<div class="eyebrow"><span>'+label+' · '+os+'</span>'+
      '<a href="'+url+'" target="_blank" rel="noopener" aria-label="Open '+label+'">'+EXT+'</a></div>'+
      '<div class="ver">'+esc(ver)+' '+chip+'</div>'+
      (note ? '<div class="vnote">'+esc(note)+'</div>' : "")+
      (sub ? '<div class="vsub">'+esc(sub)+'</div>' : "")+
      '</div>';
  };
  if (integ.app_store) cells.push(cell("App Store", "iOS", INTEG.app_store.url, st && st.app_store));
  if (integ.play_store) cells.push(cell("Google Play", "Android", INTEG.play_store.url, st && st.play_store));
  const body = cells.length ? cells.join("")
    : '<div class="store"><div class="eyebrow"><span>Store versions</span></div>'+
      '<div class="vnote" style="margin-top:4px">Declare <span class="mono">integrations.app_store</span> / '+
      '<span class="mono">integrations.play_store</span> in the product config to track live versions here.</div></div>';
  return secWrap("stores", "verband")+body+'</section>';
}

function cfgProc(p, name) {
  return ((p.local && p.local.processes) || []).find(x => x.name === name) || {};
}

function secServers(p) {
  const cfgProcs = (p.local && p.local.processes) || [];
  const hasPC = !!(p.local && p.local.process_compose_file && p.local.process_compose_port);
  const live = state.procs[p.id];
  const up = !!(live && live.available);
  let rows, sum;

  const openBtn = c => {
    const u = c.url || (c.port ? "http://localhost:"+c.port : null);
    return u ? '<a class="btn" href="'+u+'" target="_blank" rel="noopener">Open '+EXT+'</a>' : "";
  };

  if (!hasPC) {
    sum = cfgProcs.length ? cfgProcs.length+" declared · no process-compose wiring" : "";
    rows = cfgProcs.map(c =>
      '<div class="prow"><div class="st"><span class="dot off"></span> unknown</div>'+
      '<div class="info"><span class="lbl">'+esc(c.label||c.name)+'</span> '+
      '<span class="meta">'+esc(c.name)+(c.port?' · :'+c.port:'')+'</span></div>'+
      '<div class="up">—</div><div class="acts">'+openBtn(c)+'</div></div>').join("")
      || stub("Declare local.processes plus local.process_compose_file and local.process_compose_port in the product config to control your stack from here.");
    if (cfgProcs.length)
      rows += '<div class="cache-note">Add local.process_compose_file + local.process_compose_port to enable start/stop and live status.</div>';
  } else if (!up) {
    sum = "stack down";
    rows = cfgProcs.map(c =>
      '<div class="prow"><div class="st"><span class="dot off"></span> stopped</div>'+
      '<div class="info"><span class="lbl">'+esc(c.label||c.name)+'</span> '+
      '<span class="meta">'+esc(c.name)+(c.port?' · :'+c.port:'')+'</span></div>'+
      '<div class="up">—</div><div class="acts">'+openBtn(c)+'</div></div>').join("");
    rows += '<div class="cache-note">process-compose is not running for this product — Start all launches the whole stack.</div>';
  } else {
    const running = live.processes.filter(x => x.status === "running" || x.status === "unhealthy").length;
    sum = running+"/"+live.processes.length+" running";
    rows = live.processes.map(x => {
      const c = cfgProc(p, x.name);
      const k = p.id+"/"+x.name;
      const open = state.expanded.has(k);
      const dot = x.status === "running" ? "ok" : x.status === "unhealthy" ? "err blink"
                : x.status === "pending" ? "warn" : "off";
      const label = x.status === "pending" ? (x.pendingLabel || "…") : x.status;
      const acts = [];
      if (x.status === "running" || x.status === "unhealthy") {
        acts.push('<button class="btn" onclick="App.procAction(\''+p.id+'\',\''+esc(x.name)+'\',\'restart\')">Restart</button>');
        acts.push('<button class="btn" onclick="App.procAction(\''+p.id+'\',\''+esc(x.name)+'\',\'stop\')">Stop</button>');
      } else if (x.status === "stopped") {
        acts.push('<button class="btn" onclick="App.procAction(\''+p.id+'\',\''+esc(x.name)+'\',\'start\')">Start</button>');
      }
      acts.push(openBtn(c));
      acts.push('<button class="btn" onclick="App.toggleLog(\''+p.id+'\',\''+esc(x.name)+'\')">'+CHEV(open)+' Logs</button>');
      return '<div class="prow">'+
        '<div class="st"><span class="dot '+dot+'"></span> '+esc(label)+'</div>'+
        '<div class="info"><span class="lbl">'+esc(c.label||x.name)+'</span> '+
          '<span class="meta">'+esc(x.name)+(c.port?' · :'+c.port:'')+
          (x.restarts ? ' · '+x.restarts+' restarts' : '')+'</span>'+
          (x.status === "unhealthy" ? '<div class="alert">⚠ readiness probe failing ('+esc(x.ready)+')</div>' : "")+
          (x.status === "stopped" && x.exit_code ? '<div class="alert">exit code '+x.exit_code+'</div>' : "")+
        '</div>'+
        '<div class="up">'+(x.status === "stopped" ? "—" : esc(x.uptime || "—"))+'</div>'+
        '<div class="acts">'+acts.join("")+'</div></div>'+
        (open ? '<div class="logbox">'+(state.logs[k] || ["(loading…)"]).map(l => {
          const e = esc(l);
          return /ERROR|error|500|Traceback/.test(l) ? '<span class="e">'+e+'</span>' : e;
        }).join("\n")+'</div>' : "");
    }).join("") || stub("The compose file defines no processes.");
  }

  const tools = hasPC
    ? '<button class="btn" onclick="App.startAll(\''+p.id+'\')">Start all</button>'+
      '<button class="btn" '+(up ? '' : 'disabled ')+'onclick="App.stopAll(\''+p.id+'\')">Stop all</button>'
    : "";

  return secWrap("servers")+
    secHead("servers", "Local Servers", sum, tools)+
    '<div class="sec-body">'+rows+'</div></section>';
}

function gbEnvsOf(p) {
  const gb = p.growthbook || {};
  if (Array.isArray(gb.environments))
    return gb.environments.filter(e => e && e.local_payload_url && e.published_payload_url);
  if (gb.local_payload_url && gb.published_payload_url)
    return [{ name: "default", local_payload_url: gb.local_payload_url,
              published_payload_url: gb.published_payload_url, publish_command: gb.publish_command }];
  return [];
}

function envChip(name) {
  return '<span class="chip '+(name === "prod" ? "warn" : "")+'">'+esc(name)+'</span>';
}

function secFlags(p) {
  const gb = p.growthbook || {};
  const st = state.flags[p.id];
  let body;
  if (!gbEnvsOf(p).length) {
    body = stub("Declare growthbook.environments (each with local_payload_url, published_payload_url, publish_command) in the product config to diff local flags against what is live, per environment.");
  } else if (!st) {
    body = stub("loading diff…");
  } else if (!st.available) {
    body = stub("Diff unavailable ("+esc(st.error || st.reason)+")")+
      '<button class="btn" onclick="App.loadFlags(\''+p.id+'\')">Retry</button>';
  } else {
    body = (st.environments || []).map(env => {
      const head = (extra) =>
        '<div class="env-head">'+envChip(env.name)+'<span class="sum2">'+extra+'</span>';
      if (env.publishing)
        return head("publishing… running your publish command")+'</div>';
      if (!env.available)
        return head("diff unavailable — "+esc(env.error || ""))+
          '<button class="btn" onclick="App.loadFlags(\''+p.id+'\')">Retry</button></div>';
      const rows = [["add", env.added], ["mod", env.modified], ["del", env.removed]].flatMap(([kind, list]) =>
        (list || []).map(d =>
          '<div class="drow"><span class="badge '+kind+'">'+
          (kind === "add" ? "added" : kind === "mod" ? "modified" : "removed")+'</span>'+
          '<span class="key">'+esc(d.key)+'</span><span class="chg">'+esc(d.chg)+'</span></div>'));
      const result = env.result
        ? (env.result.synced
          ? '<div class="pub-end okend"><span><strong>Published.</strong> Local and live payloads for '+esc(env.name)+' now match.</span></div>'
          : '<div class="pub-end errend"><span><strong>'+(env.result.ok ? "Published, but payloads still differ (CDN propagation?)." : "Publish failed.")+'</strong>'+
            (env.result.output ? ' <span class="mono" style="font-size:10.5px">'+esc(env.result.output.slice(-200))+'</span>' : "")+'</span></div>')
        : "";
      if (!rows.length)
        return head("in sync"+(env.dateUpdated ? " · published "+esc(env.dateUpdated) : ""))+
          '<span class="dot ok"></span></div>'+result;
      return head(rows.length+" change"+(rows.length > 1 ? "s" : "")+" vs published")+
        (env.canPublish
          ? '<button class="btn primary" onclick="App.openFlagsPublish(\''+p.id+'\',\''+esc(env.name)+'\')">Publish '+esc(env.name)+'…</button>'
          : '<span class="chip">no publish_command</span>')+
        '</div>'+rows.join("")+result;
    }).join("")+
    '<div class="flags-foot"><span class="mono faint" style="font-size:10.5px">each environment publishes separately — the confirm dialog names the target</span>'+
    '<button class="btn" onclick="App.loadFlags(\''+p.id+'\')">Refresh</button></div>';
  }
  return secWrap("flags")+
    secHead("flags", "Feature Flags", "local payload vs live payload, per environment",
      gb.local_url ? deeplink(gb.local_url, "GrowthBook") : "")+
    '<div class="sec-body">'+body+'</div></section>';
}

function secConfig(p) {
  const rc = p.remote_config;
  const st = state.rc[p.id];
  let body;
  if (!rc || !rc.url) {
    body = stub("Declare remote_config { url, fields, publish_command } in the product config to edit your app's remote config (e.g. force-update versions) from here.");
  } else if (!st) {
    body = stub("loading current values…");
  } else if (st.publishing) {
    body = stub("publishing… running your publish command");
  } else if (!st.available) {
    body = stub("Could not read "+esc(rc.url)+" ("+esc(st.error || st.reason)+")")+
      '<button class="btn" onclick="App.loadRC(\''+p.id+'\')">Retry</button>';
  } else {
    const rows = (st.fields || []).map(f =>
      '<div class="srow"><span class="sn" style="min-width:150px">'+esc(f.label || f.key)+'</span>'+
      '<span class="sp mono" style="font-size:10.5px">'+esc(f.key)+'</span>'+
      '<input class="rc-input" id="rc-'+esc(p.id)+'-'+esc(f.key)+'" value="'+
        esc(typeof st.doc[f.key] === "string" ? st.doc[f.key] : JSON.stringify(st.doc[f.key] ?? ""))+'">'+
      '</div>').join("") || stub("No fields declared — remote_config.fields is empty.");
    const result = st.result
      ? (st.result.synced
        ? '<div class="pub-end okend"><span><strong>Published.</strong> Live JSON matches your edit.</span></div>'
        : '<div class="pub-end errend"><span><strong>'+(st.result.ok ? "Published — live JSON not updated yet (CDN propagation)." : "Publish failed.")+'</strong>'+
          (st.result.output ? ' <span class="mono" style="font-size:10.5px">'+esc(st.result.output.slice(-200))+'</span>' : "")+'</span></div>')
      : "";
    body = rows+
      '<div class="flags-foot"><span class="mono faint" style="font-size:10.5px">undeclared keys in the live JSON pass through untouched</span>'+
      '<span style="display:flex;gap:8px">'+
      '<button class="btn" onclick="App.loadRC(\''+p.id+'\')">Reload</button>'+
      (st.canPublish ? '<button class="btn primary" onclick="App.openRCPublish(\''+p.id+'\')">Publish…</button>'
                     : '<span class="chip">set remote_config.publish_command to publish</span>')+
      '</span></div>'+result;
  }
  return secWrap("config")+
    secHead("config", (rc && rc.title) || "Force Update Control", "edit → publish via your own command",
      rc && rc.url ? deeplink(rc.url, "Live JSON") : "")+
    '<div class="sec-body">'+body+'</div></section>';
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
  const kp = state.kpis[p.id];
  let kpis = "";
  if (integ.revenuecat) {
    if (!kp) kpis = stub("loading KPIs…");
    else if (kp.error) kpis = stub("KPIs unavailable: "+kp.error);
    else {
      const PICK = ["mrr", "active_subscriptions", "active_trials", "revenue", "new_customers", "active_users"];
      const chosen = PICK.map(id => (kp.metrics || []).find(m => m.id === id)).filter(Boolean).slice(0, 4);
      kpis = '<div class="kpis">'+chosen.map(m => {
        const v = m.unit === "$" ? "$"+Number(m.value).toLocaleString(undefined, { maximumFractionDigits: 0 })
                                 : Number(m.value).toLocaleString();
        return '<div class="kpi"><div class="kl">'+esc(m.name)+'</div><div class="kv">'+esc(v)+'</div>'+
               '<div class="kd">'+esc(m.period || "")+'</div></div>';
      }).join("")+'</div>'+
      '<div class="cache-note">daemon-cached 10 min (charts API limit 25 req/min) · charts live in Grafana</div>';
    }
  } else {
    kpis = stub("Declare integrations.revenuecat to get KPI tiles here.");
  }
  return secWrap("revenue")+
    secHead("revenue", "Revenue / Stores", "read-only · daemon-cached", "")+
    '<div class="sec-body"><div class="conns">'+conns+'</div>'+kpis+'</div></section>';
}

function secRelease(p) {
  const wfs = (p.release && p.release.workflows) || [];
  const st = state.runs[p.id];
  let rows;
  if (!wfs.length || !p.repo) {
    rows = stub("Add repo plus release.workflows to the product config to dispatch GitHub Actions and see run history here.");
  } else if (!st) {
    rows = stub("loading runs…");
  } else if (st.error) {
    rows = stub("Runs unavailable: "+st.error);
  } else {
    rows = (st.workflows || []).map(w => {
      const runs = w.error
        ? '<div class="run faint">'+esc(w.error)+'</div>'
        : (w.runs || []).map(r => {
            const dot = r.status !== "completed" ? "warn"
              : r.conclusion === "success" ? "ok" : "err";
            const label = r.status !== "completed" ? r.status : (r.conclusion || "?");
            return '<div class="run"><span style="width:44px">#'+r.n+'</span>'+
              '<span style="width:86px;display:flex;align-items:center;gap:6px"><span class="dot '+dot+'"></span>'+esc(label)+'</span>'+
              '<span class="faint" style="width:70px">'+esc(r.sha)+'</span>'+
              '<span style="width:64px;text-align:right">'+esc(fmtDur(r.dur))+'</span>'+
              '<span class="faint">'+esc(rel(r.when))+'</span>'+
              '<a href="'+esc(r.url)+'" target="_blank" rel="noopener" style="margin-left:auto">'+EXT+'</a></div>';
          }).join("") || '<div class="run faint">no runs yet</div>';
      return '<div class="wf"><div class="wf-head">'+
        '<span class="id">'+esc(w.id)+'</span><span class="wl">'+esc(w.label||"")+'</span>'+
        (st.canDispatch
          ? '<button class="btn" onclick="App.dispatchWf(\''+p.id+'\',\''+esc(w.id)+'\')">Dispatch…</button>'
          : '<button class="btn" disabled title="set the github_token secret to dispatch">Dispatch…</button>')+
        '</div>'+runs+'</div>';
    }).join("")+
    '<div class="flags-foot"><span class="mono faint" style="font-size:10.5px">daemon-cached 2 min</span>'+
    '<button class="btn" onclick="App.loadExt(\''+p.id+'\',\'runs\',true)">Refresh</button></div>';
  }
  return secWrap("release")+
    secHead("release", "Release", "workflow_dispatch via GitHub Actions",
      p.repo ? deeplink("https://github.com/"+esc(p.repo)+"/actions", "GitHub Actions") : "")+
    '<div class="sec-body">'+rows+'</div></section>';
}

function secAlerts(p) {
  const channel = p.alerts && p.alerts.channel;
  const base = p.grafana && p.grafana.base_url;
  const st = state.alertRules[p.id];
  let body;
  if (!channel) {
    body = stub("Set alerts.channel (e.g. \"discord\") in the product config, then add a matching contact point in Grafana.");
  } else {
    const hook = st ? st.webhook : secretOk(p.id, "discord_webhook");
    body = '<div class="srow" style="border-top:none">'+
      (hook ? '<span class="chip ok">'+esc(channel)+' · webhook configured</span>'
            : '<span class="chip warn">'+esc(channel)+' · webhook secret missing</span>')+
      '<span class="sp">rules evaluate in Grafana → contact point → push via the '+esc(channel)+' mobile app</span>'+
      (st && st.pinging
        ? '<button class="btn" disabled>Pinging…</button>'
        : st && st.pingResult
          ? '<span class="chip '+(st.pingResult === "sent" ? "ok" : "err")+'">'+
            (st.pingResult === "sent" ? "Ping sent ✓" : esc(st.pingResult.slice(0, 60)))+'</span>'
          : '<button class="btn" '+(hook ? '' : 'disabled title="set the discord_webhook secret" ')+
            'onclick="App.alertPing(\''+p.id+'\')">Test ping</button>')+
      '</div>';
    if (!st) body += stub("loading rule states…");
    else if (!st.available) body += stub("Rule states unavailable ("+esc(st.error || st.reason)+").");
    else if (!(st.rules || []).length)
      body += stub("No alert rules defined yet — create them in Grafana → Alerting.");
    else body += st.rules.map(r =>
      '<div class="srow"><span class="dot '+(r.state === "firing" ? "err blink" : "ok")+'"></span>'+
      '<span class="sp" style="flex:1">'+esc(r.name)+'</span>'+
      (r.state === "firing" ? '<span class="chip err">firing</span>'
                            : '<span class="chip ok">'+esc(r.state || "normal")+'</span>')+'</div>').join("");
    if (st && st.available) {
      body += '<div class="recent-lbl">Recent alerts</div>'+
        ((st.recent || []).map(x =>
          '<div class="run" style="padding-left:0"><span class="faint" style="width:64px">'+esc(rel(x.when))+'</span>'+
          '<span>'+esc(x.msg)+'</span></div>').join("")
        || '<div class="run faint" style="padding-left:0">no alerts recorded</div>');
    }
  }
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
  const st = state.reviews[p.id];
  let body;
  if (!integ.app_store && !integ.play_store) {
    body = stub("Declare a store integration in the product config; reviews appear once the app is live.");
  } else if (!st) {
    body = stub("loading reviews…");
  } else if (st.error) {
    body = stub("Reviews unavailable: "+st.error)+
      '<button class="btn" onclick="App.loadExt(\''+p.id+'\',\'reviews\',true)">Retry</button>';
  } else {
    const head = '<div class="rating-row"><span class="rv">'+esc(st.avgRecent || "—")+'</span>'+
      '<span class="stars">★</span>'+
      '<span class="muted" style="font-size:11px">average of the last '+(st.count || 0)+' reviews across stores</span>'+
      Object.entries(st.errors || {}).map(([k, v]) =>
        '<span class="chip warn" title="'+esc(v)+'">'+(k === "app_store" ? "App Store" : "Play")+': unavailable</span>').join("")+
      '</div>';
    let analysis = "";
    if (st.analysis) {
      const s = st.analysis.sentiment || {};
      const tot = (s.pos || 0) + (s.neu || 0) + (s.neg || 0);
      const pct = n => tot ? ((n || 0) / tot * 100).toFixed(1) : 0;
      analysis =
        (tot ? '<div class="sent">'+
          '<i style="width:'+pct(s.pos)+'%;background:var(--ok)"></i>'+
          '<i style="width:'+pct(s.neu)+'%;background:var(--line2)"></i>'+
          '<i style="width:'+pct(s.neg)+'%;background:var(--err)"></i></div>'+
          '<div class="mono faint" style="font-size:10px">'+(s.pos||0)+' positive · '+(s.neu||0)+' neutral · '+(s.neg||0)+' negative</div>' : "")+
        '<div class="recent-lbl">Themes — AI summary ('+esc(rel(st.analysis.at))+')</div>'+
        (st.analysis.themes || []).map(t =>
          '<div class="theme-row"><span class="dot '+(t.tone==="pos"?"ok":t.tone==="neg"?"err":"off")+'"></span>'+
          '<span style="flex:1">'+esc(t.label)+'</span>'+
          '<span class="mono faint">×'+esc(String(t.n ?? ""))+'</span></div>').join("");
    }
    const rows = (st.recent || []).slice(0, 10).map(x =>
      '<div class="rrow"><div class="rmeta">'+
      '<span class="stars">'+"★".repeat(x.rating || 0)+'<span class="faint">'+"☆".repeat(5 - (x.rating || 0))+'</span></span>'+
      '<span>'+(x.store === "play_store" ? "Play" : "App Store")+' · '+esc(x.territory || "")+' · '+esc(rel(x.when))+'</span>'+
      '<a href="'+(x.store === "play_store" ? "https://play.google.com/console" : "https://appstoreconnect.apple.com")+
      '" target="_blank" rel="noopener" style="margin-left:auto">Reply '+EXT+'</a>'+
      '</div><div class="rtext">'+(x.title ? '<strong>'+esc(x.title)+'</strong> — ' : "")+esc(x.body || "")+'</div></div>').join("")
      || stub("No reviews yet.");
    const arch = st.archive || {};
    const busy = st.busy;
    body = head + analysis + '<div class="recent-lbl">Latest reviews</div>' + rows +
      '<div class="flags-foot"><span class="mono faint" style="font-size:10.5px">'+
      'archived '+(arch.archived ?? 0)+' · collected daily by the daemon'+
      (arch.lastCollected ? ' · last run '+esc(rel(arch.lastCollected)) : '')+'</span>'+
      '<span style="display:flex;gap:8px">'+
      '<button class="btn" '+(busy ? "disabled" : "")+' onclick="App.reviewsAction(\''+p.id+'\',\'collect\')">'+
        (busy === "collect" ? "Collecting…" : "Collect now")+'</button>'+
      (st.canAnalyze
        ? '<button class="btn" '+(busy ? "disabled" : "")+' onclick="App.reviewsAction(\''+p.id+'\',\'analyze\')">'+
          (busy === "analyze" ? "Analyzing…" : "Analyze now")+'</button>'
        : '<span class="chip" title="set reviews.analyze_command in the product config">no analyze_command</span>')+
      '<button class="btn" onclick="App.loadExt(\''+p.id+'\',\'reviews\',true)">Refresh</button>'+
      '</span></div>';
  }
  return secWrap("reviews")+
    secHead("reviews", "Store Reviews", "replies happen in the store console", "")+
    '<div class="sec-body">'+body+'</div></section>';
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
    process_compose_port: 28080,
    processes: [
      { name: "grafana", label: "Grafana", port: 3000 },
      { name: "growthbook", label: "GrowthBook", port: 3100 },
    ],
  },
  growthbook: {
    local_url: "http://localhost:3100",
    environments: [
      { name: "prod",
        local_payload_url: "http://localhost:3100/api/features/sdk-PRODKEY",
        published_payload_url: "https://example.com/api/features/my-app",
        publish_command: "cd ~/dev/my-app && ./publish-flags.sh" },
      { name: "dev",
        local_payload_url: "http://localhost:3100/api/features/sdk-DEVKEY",
        published_payload_url: "https://example.com/api/features/my-app-dev",
        publish_command: "cd ~/dev/my-app && ./publish-flags.sh --env dev" },
    ],
  },
  remote_config: {
    url: "https://example.com/app-config.json",
    fields: [
      { key: "min_supported_version", label: "Min supported version" },
      { key: "latest_version", label: "Latest version" },
    ],
    publish_command: "aws s3 cp {file} s3://my-bucket/app-config.json --content-type application/json",
  },
  grafana: {
    base_url: "http://localhost:3000",
    dashboards: [ { uid: "events", label: "Events" } ],
  },
  release: { workflows: [ { id: "release.yml", label: "Release" } ] },
  integrations: {
    revenuecat: {},
    app_store: { app_id: "1234567890", key_id: "ABC123DEF4", issuer_id: "00000000-0000-0000-0000-000000000000" },
    play_store: { package: "com.example.myapp" },
  },
  alerts: { channel: "discord" },
};

async function openEditor(id) {
  /* re-fetch first so the editor never opens on a stale copy (lost-update guard) */
  try { await refresh(); } catch (_) {}
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
  invalidateExt(state.tab);
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
  invalidateExt(pid);
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

/* ------------------------------------------------------- local servers */

function userIsTyping() {
  const el = document.activeElement;
  return !!(el && /^(INPUT|TEXTAREA)$/.test(el.tagName));
}

async function pollProcs() {
  if (dragKey || userIsTyping()) return;
  let changed = false;
  const targets = products.filter(p => p.local && p.local.process_compose_port && p.local.process_compose_file);
  await Promise.all(targets.map(async p => {
    try {
      const r = await api("/api/products/"+p.id+"/processes");
      if (JSON.stringify(state.procs[p.id]) !== JSON.stringify(r)) { state.procs[p.id] = r; changed = true; }
    } catch (_) {}
  }));
  await Promise.all([...state.expanded].map(async k => {
    const i = k.indexOf("/");
    const pid = k.slice(0, i), name = k.slice(i + 1);
    try {
      const r = await api("/api/products/"+pid+"/processes/"+encodeURIComponent(name)+"/logs?tail=100");
      if (JSON.stringify(state.logs[k]) !== JSON.stringify(r.logs)) { state.logs[k] = r.logs; changed = true; }
    } catch (_) {}
  }));
  if (changed && !dragKey) render();
}

async function procAction(pid, name, action) {
  const st = state.procs[pid];
  const proc = st && st.processes && st.processes.find(x => x.name === name);
  if (proc) { proc.status = "pending"; proc.pendingLabel = action + "…"; render(); }
  try { await api("/api/products/"+pid+"/processes/"+encodeURIComponent(name)+"/"+action, { method: "POST" }); }
  catch (_) {}
  setTimeout(pollProcs, 700);
}

async function startAll(pid) {
  const st = state.procs[pid];
  if (!st || !st.available) {
    state.procs[pid] = { available: false, reason: "launching" };
    render();
    try { await api("/api/products/"+pid+"/processes/up", { method: "POST" }); }
    catch (e) {
      openModal({ title: "Could not launch process-compose",
        body: '<div class="mb">'+esc(e.message)+'</div>', confirm: "OK", onConfirm: null });
    }
    setTimeout(pollProcs, 800);
    return;
  }
  for (const x of st.processes.filter(x => x.status === "stopped")) procAction(pid, x.name, "start");
}

function stopAll(pid) {
  openModal({
    title: "Stop the whole stack",
    body: '<div class="mb">Stop every process and shut down this product\'s process-compose instance?</div>',
    confirm: "Stop all",
    onConfirm: async () => {
      try { await api("/api/products/"+pid+"/processes/down", { method: "POST" }); } catch (_) {}
      state.procs[pid] = { available: false, reason: "down" };
      render();
      setTimeout(pollProcs, 1000);
    },
  });
}

async function toggleLog(pid, name) {
  const k = pid+"/"+name;
  if (state.expanded.has(k)) { state.expanded.delete(k); render(); return; }
  state.expanded.add(k);
  render();
  try {
    const r = await api("/api/products/"+pid+"/processes/"+encodeURIComponent(name)+"/logs?tail=100");
    state.logs[k] = r.logs.length ? r.logs : ["(no recent output)"];
  } catch (_) { state.logs[k] = ["(logs unavailable)"]; }
  render();
}

/* ------------------------------------------- flags diff + remote config */

async function loadFlags(pid) {
  try { state.flags[pid] = await api("/api/products/"+pid+"/flags/diff"); }
  catch (e) { state.flags[pid] = { available: false, reason: "error", error: e.message }; }
  render();
}

async function loadRC(pid) {
  try { state.rc[pid] = await api("/api/products/"+pid+"/remote-config"); }
  catch (e) { state.rc[pid] = { available: false, reason: "error", error: e.message }; }
  render();
}

function invalidateExt(pid) {
  ["flags","rc","stores","kpis","reviews","runs","alertRules"].forEach(k => { delete state[k][pid]; });
}

function primeSections(tab) {
  const p = prod(tab);
  if (!p) return;
  if (gbEnvsOf(p).length && !state.flags[p.id]) loadFlags(p.id);
  if (p.remote_config && p.remote_config.url && !state.rc[p.id]) loadRC(p.id);
  const integ = p.integrations || {};
  if ((integ.app_store || integ.play_store) && !state.stores[p.id]) loadExt(p.id, "stores");
  if (integ.revenuecat && !state.kpis[p.id]) loadExt(p.id, "kpis");
  if (integ.app_store && !state.reviews[p.id]) loadExt(p.id, "reviews");
  if (p.repo && p.release && (p.release.workflows || []).length && !state.runs[p.id]) loadExt(p.id, "runs");
  if (p.alerts && p.alerts.channel && p.grafana && p.grafana.base_url && !state.alertRules[p.id]) loadExt(p.id, "alertRules");
}

const EXT_PATHS = { stores: "stores", kpis: "kpis", reviews: "reviews",
                    runs: "workflows", alertRules: "alerts/rules" };

async function loadExt(pid, what, refresh) {
  try {
    state[what][pid] = await api("/api/products/"+pid+"/"+EXT_PATHS[what]+(refresh ? "?refresh=1" : ""));
  } catch (e) { state[what][pid] = { error: e.message }; }
  render();
}

async function dispatchWf(pid, wfId) {
  const p = prod(pid);
  openModal({
    title: "Dispatch workflow",
    body: '<div class="mb">Run <span class="mono">'+esc(wfId)+'</span> on '+
          '<span class="mono">'+esc(p.repo)+'@'+esc((p.release && p.release.branch) || "main")+'</span> via workflow_dispatch?</div>',
    confirm: "Dispatch",
    onConfirm: async () => {
      try { await api("/api/products/"+pid+"/workflows/"+encodeURIComponent(wfId)+"/dispatch", { method: "POST" }); }
      catch (e) {
        openModal({ title: "Dispatch failed", body: '<div class="mb">'+esc(e.message)+'</div>', confirm: "OK", onConfirm: null });
        return;
      }
      setTimeout(() => loadExt(pid, "runs", true), 1500);
    },
  });
}

async function reviewsAction(pid, action) {
  const st = state.reviews[pid];
  if (!st) return;
  st.busy = action; render();
  try { await api("/api/products/"+pid+"/reviews/"+action, { method: "POST" }); }
  catch (e) {
    openModal({ title: action === "collect" ? "Collection failed" : "Analysis failed",
      body: '<div class="mb">'+esc(e.message)+'</div>', confirm: "OK", onConfirm: null });
  }
  await loadExt(pid, "reviews", true);
}

async function alertPing(pid) {
  const st = state.alertRules[pid] || {};
  st.pinging = true; render();
  try { await api("/api/products/"+pid+"/alerts/ping", { method: "POST" }); st.pingResult = "sent"; }
  catch (e) { st.pingResult = e.message; }
  st.pinging = false;
  render();
  setTimeout(() => { st.pingResult = null; render(); }, 3000);
}

function openFlagsPublish(pid, envName) {
  const p = prod(pid), st = state.flags[pid];
  const env = (st.environments || []).find(e => e.name === envName);
  const cfg = gbEnvsOf(p).find(e => (e.name || "default") === envName);
  if (!env || !cfg) return;
  const n = (env.added||[]).length + (env.modified||[]).length + (env.removed||[]).length;
  openModal({
    title: "Publish flags — "+esc(p.name),
    body: '<div class="mb">Target environment: '+envChip(envName)+
      '<div style="margin-top:6px">'+n+' change'+(n>1?"s":"")+' will go live by running:</div></div>'+
      '<div class="logbox" style="margin:8px 0 0">'+esc(cfg.publish_command)+'</div>',
    confirm: "Publish "+esc(envName),
    onConfirm: async () => {
      env.publishing = true; render();
      let result;
      try {
        result = await api("/api/products/"+pid+"/flags/publish",
          { method: "POST", body: JSON.stringify({ env: envName }) });
      } catch (e) {
        result = { ok: false, synced: false, output: e.message };
      }
      env.publishing = false;
      if (result.diff) Object.assign(env, result.diff);
      env.result = result;
      render();
    },
  });
}

function openRCPublish(pid) {
  const p = prod(pid), st = state.rc[pid];
  const values = {}, changes = [];
  for (const f of st.fields || []) {
    const el = document.getElementById("rc-"+pid+"-"+f.key);
    if (!el) continue;
    const raw = el.value;
    let v = raw;
    if (typeof st.doc[f.key] !== "string") { try { v = JSON.parse(raw); } catch (_) {} }
    if (JSON.stringify(v) !== JSON.stringify(st.doc[f.key])) {
      values[f.key] = v;
      changes.push(esc(f.key)+": "+esc(JSON.stringify(st.doc[f.key]))+" → "+esc(JSON.stringify(v)));
    }
  }
  if (!changes.length) {
    openModal({ title: "Nothing to publish", body: '<div class="mb">No field differs from the live JSON.</div>',
                confirm: "OK", onConfirm: null });
    return;
  }
  openModal({
    title: "Publish remote config — "+esc(p.name),
    body: '<div class="mb">'+changes.map(c => '<div class="mono" style="font-size:11.5px">'+c+'</div>').join("")+
      '<div style="margin-top:8px">via your publish command:</div></div>'+
      '<div class="logbox" style="margin:8px 0 0">'+esc(p.remote_config.publish_command)+'</div>',
    confirm: "Publish",
    onConfirm: async () => {
      st.publishing = true; render();
      let result;
      try { result = await api("/api/products/"+pid+"/remote-config", { method: "POST", body: JSON.stringify({ values }) }); }
      catch (e) { result = { ok: false, synced: false, output: e.message }; }
      await loadRC(pid);
      if (state.rc[pid]) state.rc[pid].result = result;
      render();
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

function go(tab) { state.tab = tab; render(); primeSections(tab); }

document.getElementById("overlay").addEventListener("click", e => {
  if (e.target.id === "overlay") closeModal();
});
document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });

refresh().then(pollProcs);
setInterval(pollProcs, 4000);
setInterval(async () => {
  try {
    await api("/api/health");
    if (state.offline) refresh();
  } catch (_) {
    if (!state.offline) { state.offline = true; render(); }
  }
}, 5000);

return { go, openEditor, saveProduct, confirmDelete, openSecret, saveSecret,
         openModal, closeModal, confirmModal, procAction, startAll, stopAll, toggleLog,
         loadFlags, loadRC, openFlagsPublish, openRCPublish,
         loadExt, dispatchWf, alertPing, reviewsAction,
         dragStart, dragEnd, dragOver, dragLeave, drop, moveSec, refresh };
})();
