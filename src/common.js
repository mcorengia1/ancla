// Ancla - código compartido (popup, content script, background y página de desbloqueo)

// ---------- Plantillas de perfil ----------
// Un perfil tiene su propio horario y su propia lista de sitios. Pueden estar
// activos varios a la vez: para cada sitio gana la regla más estricta.

const PROFILE_TEMPLATES = {
  social: {
    name: "Redes sociales",
    scheduleEnabled: true, scheduleDays: [1, 2, 3, 4, 5], scheduleStart: "00:00", scheduleEnd: "00:00",
    blockShorts: true,
    sites: [
      { domain: "x.com", mode: "feed", grayscale: false, limitMin: 0 },
      { domain: "instagram.com", mode: "feed", grayscale: false, limitMin: 0 },
      { domain: "facebook.com", mode: "feed", grayscale: false, limitMin: 0 }
    ]
  },
  work: {
    name: "Horario laboral",
    scheduleEnabled: true, scheduleDays: [1, 2, 3, 4, 5], scheduleStart: "09:00", scheduleEnd: "18:00",
    blockShorts: false,
    sites: [{ domain: "youtube.com", mode: "free", grayscale: true, limitMin: 0 }]
  },
  blank: {
    name: "Nuevo perfil",
    scheduleEnabled: false, scheduleDays: [1, 2, 3, 4, 5], scheduleStart: "09:00", scheduleEnd: "18:00",
    blockShorts: false,
    sites: []
  }
};

const DEFAULTS = {
  enabled: true,
  profiles: [{ id: "redes", enabled: true, ...PROFILE_TEMPLATES.social }],

  // Modo estricto (global)
  strictMode: false,
  unlockDelayMin: 10,
  progressiveUnlock: true,
  unlockedUntil: 0,
  unlockDate: "",
  unlockCount: 0,

  // Uso del día por sitio (lo escribe background.js)
  usageDate: "",
  usage: {}
};

// Claves que el usuario configura desde el panel
const CONFIG_KEYS = ["enabled", "profiles", "strictMode", "unlockDelayMin", "progressiveUnlock"];
const SCHEDULE_KEYS = ["scheduleEnabled", "scheduleDays", "scheduleStart", "scheduleEnd"];

const UNLOCK_WINDOW_MIN = 5;
const MAX_UNLOCK_DELAY = 180;

// Sitios en los que se puede ocultar el feed
const FEED_SITES = {
  "x.com":         { name: "X",         hint: "Oculta Para ti / Siguiendo, Explorar y tendencias" },
  "twitter.com":   { name: "X",         hint: "Oculta Para ti / Siguiendo, Explorar y tendencias" },
  "instagram.com": { name: "Instagram", hint: "Oculta el feed, las historias, Reels y Explorar" },
  "youtube.com":   { name: "YouTube",   hint: "Oculta el inicio, los recomendados y las pantallas finales" },
  "facebook.com":  { name: "Facebook",  hint: "Oculta el feed, las historias, Watch y Reels" },
  "reddit.com":    { name: "Reddit",    hint: "Oculta la portada, Popular y All" }
};

const MODE_LEVEL = { free: 0, feed: 1, block: 2 };

// ---------- Sitios ----------

function normalizeSite(d) {
  return String(d || "").trim().toLowerCase()
    .replace(/^[a-z]+:\/\//, "").replace(/^www\./, "").replace(/[\/?#:].*$/, "");
}

function isValidDomain(d) {
  return /^([a-z0-9-]+\.)+[a-z]{2,}$/.test(d);
}

function siteMatches(host, domain) {
  host = normalizeSite(host);
  domain = normalizeSite(domain);
  return !!domain && (host === domain || host.endsWith("." + domain));
}

function feedKeyFor(hostOrDomain) {
  const h = normalizeSite(hostOrDomain);
  return Object.keys(FEED_SITES).find((k) => h === k || h.endsWith("." + k)) || null;
}

// Regla más específica de una lista que aplica a un host
function findRule(host, sites) {
  let best = null;
  for (const r of sites || []) {
    if (siteMatches(host, r.domain) && (!best || r.domain.length > best.domain.length)) best = r;
  }
  return best;
}

function newRule(domain) {
  return { domain, mode: feedKeyFor(domain) ? "feed" : "block", grayscale: false, limitMin: 0 };
}

function cleanRule(r) {
  const domain = normalizeSite(r.domain);
  let mode = MODE_LEVEL[r.mode] !== undefined ? r.mode : "block";
  if (mode === "feed" && !feedKeyFor(domain)) mode = "block";
  return {
    domain,
    mode,
    grayscale: !!r.grayscale,
    limitMin: Math.max(0, Math.min(1440, Math.round(Number(r.limitMin) || 0)))
  };
}

// ---------- Perfiles ----------

function newProfileId() {
  return "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function newProfile(templateKey = "blank") {
  const t = PROFILE_TEMPLATES[templateKey] || PROFILE_TEMPLATES.blank;
  return cleanProfile({ ...JSON.parse(JSON.stringify(t)), id: newProfileId(), enabled: true });
}

function cleanProfile(p) {
  const days = Array.isArray(p.scheduleDays) ? p.scheduleDays.map(Number).filter((d) => d >= 0 && d <= 6) : [1, 2, 3, 4, 5];
  const time = (t, def) => (/^\d{2}:\d{2}$/.test(t || "") ? t : def);
  const seen = new Set();
  const sites = [];
  for (const r of p.sites || []) {
    const c = cleanRule(r);
    if (c.domain && !seen.has(c.domain)) { seen.add(c.domain); sites.push(c); }
  }
  return {
    id: String(p.id || newProfileId()),
    name: String(p.name || "Perfil").slice(0, 40),
    enabled: p.enabled !== false,
    scheduleEnabled: !!p.scheduleEnabled,
    scheduleDays: [...new Set(days)].sort(),
    scheduleStart: time(p.scheduleStart, "09:00"),
    scheduleEnd: time(p.scheduleEnd, "18:00"),
    blockShorts: !!p.blockShorts,
    sites
  };
}

// Convierte versiones anteriores (una sola configuración) en el perfil "Principal"
function migrate(raw) {
  if (Array.isArray(raw.profiles)) return null;
  const hadOld = ["sites", "blockedSites", "grayscaleSites", "blockShorts", "scheduleEnabled"].some((k) => k in raw);
  if (!hadOld) return null;

  let sites = Array.isArray(raw.sites) ? raw.sites : null;
  if (!sites) {
    const map = new Map();
    for (const d of raw.blockedSites || []) {
      const dom = normalizeSite(d);
      if (dom) map.set(dom, newRule(dom));
    }
    for (const d of raw.grayscaleSites || []) {
      const dom = normalizeSite(d);
      if (!dom) continue;
      const r = map.get(dom) || { ...newRule(dom), mode: "free" };
      r.grayscale = true;
      map.set(dom, r);
    }
    sites = [...map.values()];
  }
  return [cleanProfile({
    id: "principal",
    name: "Principal",
    enabled: true,
    scheduleEnabled: !!raw.scheduleEnabled,
    scheduleDays: raw.scheduleDays,
    scheduleStart: raw.scheduleStart,
    scheduleEnd: raw.scheduleEnd,
    blockShorts: raw.blockShorts !== false,
    sites
  })];
}

const OLD_KEYS = ["sites", "blockedSites", "grayscaleSites", "blockShorts",
                  "scheduleEnabled", "scheduleDays", "scheduleStart", "scheduleEnd"];

async function loadSettings() {
  const raw = await browser.storage.local.get(null);
  const migrated = migrate(raw);
  if (migrated) {
    await browser.storage.local.set({ profiles: migrated });
    await browser.storage.local.remove(OLD_KEYS);
    raw.profiles = migrated;
    for (const k of OLD_KEYS) delete raw[k];
  }
  const s = { ...DEFAULTS, ...raw };
  s.profiles = (s.profiles || []).map(cleanProfile);
  return s;
}

// ---------- Horario ----------

function toMinutes(hhmm) {
  const [h, m] = String(hhmm || "00:00").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

// - Inicio < fin: rango dentro del día. Inicio > fin: cruza la medianoche. Iguales: día completo.
function isInSchedule(p, now = new Date()) {
  if (!p.scheduleEnabled) return true;
  const days = p.scheduleDays || [];
  const start = toMinutes(p.scheduleStart);
  const end = toMinutes(p.scheduleEnd);
  const t = now.getHours() * 60 + now.getMinutes();
  const day = now.getDay();
  const prevDay = (day + 6) % 7;

  if (start === end) return days.includes(day);
  if (start < end) return days.includes(day) && t >= start && t < end;
  return (days.includes(day) && t >= start) || (days.includes(prevDay) && t < end);
}

function isProfileActive(p, now = new Date()) {
  return p.enabled !== false && isInSchedule(p, now);
}

function activeProfiles(s, now = new Date()) {
  if (!s.enabled) return [];
  return (s.profiles || []).filter((p) => isProfileActive(p, now));
}

// ¿Hay alguna regla aplicando ahora?
function isActiveNow(s, now = new Date()) {
  return activeProfiles(s, now).length > 0;
}

// Próxima vez que empieza un perfil que hoy no está activo (Date o null)
function nextStart(p, now = new Date()) {
  if (p.enabled === false || !p.scheduleEnabled || !(p.scheduleDays || []).length) return null;
  const [h, m] = p.scheduleStart.split(":").map(Number);
  for (let i = 0; i < 8; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, h, m);
    if (d > now && p.scheduleDays.includes(d.getDay())) return d;
  }
  return null;
}

// ---------- Regla efectiva ----------
// Combina las reglas de los perfiles activos para un sitio:
//   modo: el más estricto · B/N: si algún perfil lo pide · límite: el más bajo
function effectiveRule(s, host, now = new Date()) {
  const matches = [];
  for (const p of activeProfiles(s, now)) {
    const r = findRule(host, p.sites);
    if (r) matches.push({ r, p });
  }
  if (!matches.length) return null;

  let mode = "free", grayscale = false, limitMin = 0, domain = matches[0].r.domain;
  for (const { r } of matches) {
    if (MODE_LEVEL[r.mode] > MODE_LEVEL[mode]) mode = r.mode;
    if (r.grayscale) grayscale = true;
    if (r.limitMin > 0 && (limitMin === 0 || r.limitMin < limitMin)) {
      limitMin = r.limitMin;
      domain = r.domain;
    }
  }
  return { domain, mode, grayscale, limitMin, profiles: matches.map((m) => m.p.name) };
}

function shortsActive(s, host, now = new Date()) {
  return siteMatches(host, "youtube.com") && activeProfiles(s, now).some((p) => p.blockShorts);
}

// ---------- Uso diario ----------

function todayKey(now = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

function usedSeconds(s, domain, now = new Date()) {
  if (s.usageDate !== todayKey(now)) return 0;
  return (s.usage || {})[normalizeSite(domain)] || 0;
}

// ---------- Modo estricto ----------

function isLocked(s, nowMs = Date.now()) {
  return !!s.strictMode && isActiveNow(s, new Date(nowMs)) && !(nowMs < (s.unlockedUntil || 0));
}

function unlocksToday(s, now = new Date()) {
  return s.unlockDate === todayKey(now) ? (s.unlockCount || 0) : 0;
}

function nextUnlockDelay(s, now = new Date()) {
  const base = Math.max(1, Number(s.unlockDelayMin) || 10);
  const n = s.progressiveUnlock ? unlocksToday(s, now) : 0;
  return Math.min(MAX_UNLOCK_DELAY, base * Math.pow(2, n));
}

// Dentro de un perfil, con la configuración bloqueada solo se puede endurecer
function tightenSites(oldSites, newSites) {
  let reverted = false;
  const result = newSites.map(cleanRule);
  for (const old of oldSites) {
    const i = result.findIndex((r) => r.domain === old.domain);
    if (i === -1) { result.push({ ...old }); reverted = true; continue; }
    const r = result[i];
    if (MODE_LEVEL[r.mode] < MODE_LEVEL[old.mode]) { r.mode = old.mode; reverted = true; }
    if (old.grayscale && !r.grayscale) { r.grayscale = true; reverted = true; }
    if (old.limitMin > 0 && (r.limitMin === 0 || r.limitMin > old.limitMin)) {
      r.limitMin = old.limitMin;
      reverted = true;
    }
  }
  return { sites: result, reverted };
}

// Con la configuración bloqueada: no se pueden quitar ni pausar perfiles, cambiar
// horarios, desactivar Shorts ni aflojar sitios. Sí se pueden crear perfiles,
// agregar sitios y endurecer reglas.
function enforceStrict(oldS, newS) {
  const out = { ...newS };
  let reverted = false;
  for (const k of ["enabled", "strictMode", "unlockDelayMin", "progressiveUnlock"]) {
    if (JSON.stringify(out[k]) !== JSON.stringify(oldS[k])) { out[k] = oldS[k]; reverted = true; }
  }

  const profiles = (newS.profiles || []).map(cleanProfile);
  for (const op of oldS.profiles) {
    const np = profiles.find((p) => p.id === op.id);
    if (!np) { profiles.push(JSON.parse(JSON.stringify(op))); reverted = true; continue; }
    if (op.enabled && !np.enabled) { np.enabled = true; reverted = true; }
    for (const k of SCHEDULE_KEYS) {
      if (JSON.stringify(np[k]) !== JSON.stringify(op[k])) { np[k] = op[k]; reverted = true; }
    }
    if (op.blockShorts && !np.blockShorts) { np.blockShorts = true; reverted = true; }
    const t = tightenSites(op.sites, np.sites);
    np.sites = t.sites;
    reverted = reverted || t.reverted;
  }
  out.profiles = profiles;
  return { settings: out, reverted };
}

// ---------- Textos ----------

const DAY_SHORT = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const DAY_LONG = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

function daysText(days) {
  const set = [...new Set(days)].sort();
  const key = set.join("");
  if (key === "0123456") return "Todos los días";
  if (key === "12345") return "Lun a vie";
  if (key === "06") return "Fines de semana";
  if (!set.length) return "Ningún día";
  return [1, 2, 3, 4, 5, 6, 0].filter((d) => set.includes(d)).map((d) => DAY_SHORT[d]).join(", ");
}

function scheduleText(p) {
  if (!p.scheduleEnabled) return "Siempre";
  const hours = p.scheduleStart === p.scheduleEnd ? "todo el día" : `${p.scheduleStart} a ${p.scheduleEnd}`;
  return `${daysText(p.scheduleDays)}, ${hours}`;
}

function whenText(date, now = new Date()) {
  const d0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const d1 = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diff = Math.round((d1 - d0) / 86400000);
  const hh = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  const day = diff === 0 ? "hoy" : diff === 1 ? "mañana" : `el ${DAY_LONG[date.getDay()]}`;
  return `${day} a las ${hh}`;
}

function listText(names) {
  if (names.length <= 1) return names.join("");
  return names.slice(0, -1).join(", ") + " y " + names[names.length - 1];
}

function fmtDuration(sec) {
  sec = Math.max(0, Math.round(sec));
  if (sec < 60) return `${sec} s`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60 ? (m % 60) + " min" : ""}`.trim();
}

// Para tests en Node
if (typeof module !== "undefined") {
  module.exports = {
    DEFAULTS, PROFILE_TEMPLATES, normalizeSite, isValidDomain, findRule, newRule, cleanRule,
    newProfile, cleanProfile, migrate, isInSchedule, isProfileActive, activeProfiles, isActiveNow,
    nextStart, effectiveRule, shortsActive, usedSeconds, todayKey, isLocked, unlocksToday,
    nextUnlockDelay, tightenSites, enforceStrict, daysText, scheduleText, whenText, listText
  };
}
