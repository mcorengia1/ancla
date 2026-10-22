// Ancla - script que corre en cada página
// (las funciones compartidas vienen de common.js)

const HOST = location.hostname;
const ICON_URL = browser.runtime.getURL("icons/icon.svg");

let settings = null;
let state = null;          // último estado aplicado
let overlay = null;        // pantalla de bloqueo (si está visible)
let pendingSeconds = 0;    // tiempo de uso aún no enviado al fondo

// ---------- Feeds por sitio ----------
// isFeed(path): en qué rutas se oculta el contenido principal
// redirect(path): rutas que se redirigen (ej. Reels) -> devuelve la URL de destino
// css: reglas que solo aplican en rutas de feed (html[data-ancla-feed])
// always: reglas que aplican en todo el sitio

const FEEDS = {
  "x.com": {
    isFeed: (p) => p === "/home" || p.startsWith("/explore") || p.startsWith("/i/trends"),
    css: `
      html[data-ancla-feed] [data-testid="primaryColumn"] section[role="region"],
      html[data-ancla-feed] [data-testid="primaryColumn"] [data-testid="cellInnerDiv"] { display: none !important; }`,
    always: `
      [data-testid="sidebarColumn"] section,
      [data-testid="sidebarColumn"] aside,
      [data-testid="trend"] { display: none !important; }`,
    message: "Tu feed está oculto. Podés buscar, ver perfiles y mensajes."
  },
  "instagram.com": {
    isFeed: (p) => p === "/",
    // /stories/ no se redirige: la bandeja de historias del feed queda oculta,
    // pero se pueden ver las historias (y destacadas) entrando a un perfil
    redirect: (p) => (/^\/(reels?|explore)(\/|$)/.test(p) ? "/" : null),
    css: `html[data-ancla-feed] main { visibility: hidden !important; }`,
    message: "Feed, historias, Reels y Explorar ocultos. Podés usar mensajes, buscar y ver perfiles con sus historias."
  },
  "youtube.com": {
    isFeed: (p) => p === "/",
    css: `html[data-ancla-feed] ytd-browse[page-subtype="home"] #primary { visibility: hidden !important; }`,
    always: `
      #secondary #related,
      ytd-watch-next-secondary-results-renderer,
      .ytp-endscreen-content,
      .ytp-ce-element,
      .ytp-autonav-endscreen-countdown-overlay { display: none !important; }`,
    message: "Inicio oculto. Buscá lo que viniste a ver."
  },
  "facebook.com": {
    isFeed: (p) => p === "/" || p === "/home.php",
    redirect: (p) => (/^\/(watch|reel|reels|stories)(\/|$)/.test(p) ? "/" : null),
    css: `html[data-ancla-feed] [role="main"] { visibility: hidden !important; }`,
    message: "Feed e historias ocultos. Podés usar mensajes, grupos y perfiles."
  },
  "reddit.com": {
    isFeed: (p) => ["/", "/best/", "/hot/", "/new/", "/top/", "/rising/"].includes(p.endsWith("/") ? p : p + "/") ||
                   /^\/r\/(popular|all)(\/|$)/.test(p),
    css: `
      html[data-ancla-feed] shreddit-feed,
      html[data-ancla-feed] #siteTable,
      html[data-ancla-feed] main { visibility: hidden !important; }`,
    message: "Portada oculta. Entrá directo al subreddit que buscás."
  }
};
FEEDS["twitter.com"] = FEEDS["x.com"];

// ---------- Shorts de YouTube ----------

const SHORTS_CSS = `
ytd-reel-shelf-renderer,
ytd-rich-shelf-renderer[is-shorts],
ytd-rich-section-renderer:has(ytd-rich-shelf-renderer[is-shorts]),
ytd-rich-section-renderer:has(ytm-shorts-lockup-view-model),
ytd-rich-section-renderer:has(ytm-shorts-lockup-view-model-v2),
grid-shelf-view-model:has(ytm-shorts-lockup-view-model),
grid-shelf-view-model:has(ytm-shorts-lockup-view-model-v2),
ytm-shorts-lockup-view-model,
ytm-shorts-lockup-view-model-v2,
ytd-rich-item-renderer:has(a[href^="/shorts/"]),
ytd-video-renderer:has(a[href^="/shorts/"]),
ytd-grid-video-renderer:has(a[href^="/shorts/"]),
ytd-compact-video-renderer:has(a[href^="/shorts/"]),
ytd-guide-entry-renderer:has(a[title="Shorts"]),
ytd-mini-guide-entry-renderer[aria-label="Shorts"],
yt-tab-shape[tab-title="Shorts"],
ytd-shorts { display: none !important; }`;

// ---------- Utilidades DOM ----------

function setStyle(id, css) {
  let el = document.getElementById(id);
  if (!css) {
    if (el) el.remove();
    return;
  }
  if (!el) {
    el = document.createElement("style");
    el.id = id;
    (document.head || document.documentElement).appendChild(el);
  }
  if (el.textContent !== css) el.textContent = css;
}

function el(tag, css, text) {
  const e = document.createElement(tag);
  if (css) e.style.cssText = css;
  if (text) e.textContent = text;
  return e;
}

const FONT = "font-family:system-ui,-apple-system,'Segoe UI',sans-serif;";

// ---------- Pantalla de bloqueo (overlay a pantalla completa) ----------

function showOverlay(reason, rule) {
  const key = reason + "|" + rule.domain;
  if (overlay && overlay.dataset.key === key && overlay.isConnected) return;
  hideOverlay();

  overlay = el("div",
    "all:initial;position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;" +
    "justify-content:center;background:#16161c;color:#ececf1;text-align:center;" + FONT);
  overlay.dataset.key = key;

  const card = el("div", "max-width:440px;padding:32px;");
  const img = el("img", "width:72px;height:72px;display:block;margin:0 auto 20px;");
  img.src = ICON_URL;

  let title, text;
  if (reason === "limit") {
    title = "Llegaste a tu límite de hoy";
    text = `Usaste tus ${rule.limitMin} minutos en ${rule.domain}. Mañana se renueva.`;
  } else {
    title = `${rule.domain} está bloqueado`;
    text = "Volvé a lo que estabas haciendo.";
  }
  const h = el("div", "font-size:26px;font-weight:650;margin:0 0 10px;letter-spacing:-.01em;", title);
  const p = el("div", "font-size:15px;line-height:1.55;opacity:.7;", text);
  card.append(img, h, p);

  if (rule.profiles && rule.profiles.length) {
    card.append(el("div",
      "margin-top:22px;display:inline-block;padding:6px 12px;border-radius:999px;" +
      "background:#26262f;font-size:13px;opacity:.85;",
      `Perfil: ${listText(rule.profiles)}`));
  }

  overlay.append(card);
  document.documentElement.appendChild(overlay);
  document.documentElement.style.setProperty("overflow", "hidden", "important");
}

function hideOverlay() {
  if (overlay) overlay.remove();
  overlay = null;
  document.documentElement.style.removeProperty("overflow");
}

// Mientras hay bloqueo: pausar videos y no dejar que el teclado llegue a la página
window.addEventListener("keydown", (e) => {
  if (overlay) { e.stopImmediatePropagation(); e.preventDefault(); }
}, true);

// ---------- Aviso de feed oculto y de tiempo restante ----------

let feedNote = null;
function setFeedNote(message) {
  if (!message) {
    if (feedNote) feedNote.remove();
    feedNote = null;
    return;
  }
  if (feedNote && feedNote.isConnected) return;
  feedNote = el("div",
    "all:initial;position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:2147483646;" +
    "pointer-events:none;display:flex;flex-direction:column;align-items:center;gap:10px;" +
    "padding:22px 26px;border-radius:16px;background:rgba(22,22,28,.92);color:#ececf1;" +
    "box-shadow:0 10px 40px rgba(0,0,0,.25);max-width:320px;text-align:center;" + FONT);
  const img = el("img", "width:40px;height:40px;");
  img.src = ICON_URL;
  feedNote.append(
    img,
    el("div", "font-size:16px;font-weight:600;", "Feed oculto por Ancla"),
    el("div", "font-size:13px;line-height:1.5;opacity:.7;", message)
  );
  document.documentElement.appendChild(feedNote);
}

let timePill = null;
function setTimePill(text) {
  if (!text) {
    if (timePill) timePill.remove();
    timePill = null;
    return;
  }
  if (!timePill || !timePill.isConnected) {
    timePill = el("div",
      "all:initial;position:fixed;right:16px;bottom:16px;z-index:2147483646;pointer-events:none;" +
      "padding:8px 14px;border-radius:999px;background:#2a1f12;color:#ffcf9e;font-size:13px;" +
      "font-weight:600;box-shadow:0 4px 18px rgba(0,0,0,.25);" + FONT);
    document.documentElement.appendChild(timePill);
  }
  timePill.textContent = text;
}

// ---------- Estado ----------

function computeState() {
  const active = isActiveNow(settings);
  const rule = effectiveRule(settings, HOST); // reglas combinadas de los perfiles activos
  const path = location.pathname;

  let block = null;
  let remaining = null;
  if (rule) {
    if (rule.limitMin > 0) remaining = rule.limitMin * 60 - (usedSeconds(settings, rule.domain) + pendingSeconds);
    if (rule.mode === "block") block = "block";
    else if (remaining !== null && remaining <= 0) block = "limit";
  }

  const feedKey = rule && rule.mode === "feed" ? feedKeyFor(HOST) : null;
  const feed = feedKey ? FEEDS[feedKey] : null;

  return {
    active, rule, block, remaining, path, feed,
    isFeed: !!(feed && feed.isFeed(path)),
    gray: !!(rule && rule.grayscale && !block),
    shorts: shortsActive(settings, HOST)
  };
}

function apply() {
  if (!settings) return;
  if (!document.documentElement) { setTimeout(apply, 10); return; } // documento todavía no creado
  state = computeState();
  const st = state;

  // Bloqueo completo (por regla o por límite diario)
  if (st.block) {
    showOverlay(st.block, st.rule);
    document.querySelectorAll("video, audio").forEach((m) => { try { m.pause(); } catch (e) {} });
  } else {
    hideOverlay();
  }

  // Blanco y negro
  setStyle("ancla-gray", st.gray ? "html { filter: grayscale(100%) !important; }" : "");

  // Shorts
  setStyle("ancla-shorts", st.shorts ? SHORTS_CSS : "");
  if (st.shorts && st.path.startsWith("/shorts")) {
    location.replace("https://www.youtube.com/");
    return;
  }

  // Feed
  if (st.feed && !st.block) {
    const target = st.feed.redirect && st.feed.redirect(st.path);
    if (target && target !== st.path) {
      location.replace(target);
      return;
    }
    setStyle("ancla-feed", (st.feed.css || "") + (st.feed.always || ""));
    document.documentElement.toggleAttribute("data-ancla-feed", st.isFeed);
    setFeedNote(st.isFeed ? st.feed.message : null);
  } else {
    setStyle("ancla-feed", "");
    document.documentElement.removeAttribute("data-ancla-feed");
    setFeedNote(null);
  }

  // Aviso cuando quedan 5 minutos o menos
  setTimePill(!st.block && st.remaining !== null && st.remaining <= 300
    ? `⏳ Te quedan ${fmtDuration(st.remaining)} en ${st.rule.domain}`
    : null);
}

// Firma del estado: si cambia, se vuelve a aplicar
function signature() {
  const st = computeState();
  const rem = st.remaining === null ? "" : Math.ceil(Math.max(0, st.remaining) / 10); // cada 10 s
  return [location.href, st.active, st.rule && st.rule.domain, st.block, st.isFeed, st.gray, st.shorts,
          st.rule && st.rule.mode, st.rule && st.rule.limitMin, rem].join("|");
}

// ---------- Conteo de tiempo de uso ----------

function isBeingUsed() {
  if (document.visibilityState !== "visible") return false;
  if (document.hasFocus()) return true;
  // Un video reproduciéndose también cuenta aunque la ventana no tenga el foco
  return [...document.querySelectorAll("video")].some((v) => !v.paused && !v.ended);
}

function flushUsage() {
  if (!pendingSeconds || !state || !state.rule) return;
  const seconds = pendingSeconds;
  pendingSeconds = 0;
  browser.runtime.sendMessage({ type: "usage", domain: state.rule.domain, seconds }).catch(() => {
    pendingSeconds += seconds; // reintentar en el próximo envío
  });
}

setInterval(() => {
  if (!state || !state.rule || state.rule.limitMin <= 0 || state.block) return;
  if (!isBeingUsed()) return;
  pendingSeconds++;
  if (pendingSeconds >= 5) flushUsage();
}, 1000);

window.addEventListener("pagehide", flushUsage);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") flushUsage();
});

// ---------- Arranque ----------

loadSettings().then((s) => {
  settings = s;
  apply();
});

browser.storage.onChanged.addListener((changes) => {
  if (!settings) return;
  for (const key in changes) settings[key] = changes[key].newValue;
  if (changes.profiles) settings.profiles = (settings.profiles || []).map(cleanProfile);
  apply();
});

// Vigilar navegación sin recarga (SPA), el horario y el límite de tiempo
let lastSig = "";
setInterval(() => {
  if (!settings) return;
  const sig = signature();
  if (sig !== lastSig) {
    lastSig = sig;
    apply();
  } else if (state) {
    // Re-asegurar elementos que la página pudo haber borrado
    if (state.block) {
      if (!overlay || !overlay.isConnected) apply();
      document.querySelectorAll("video, audio").forEach((m) => { if (!m.paused) m.pause(); });
    } else if (state.isFeed && feedNote && !feedNote.isConnected) {
      apply();
    }
  }
}, 500);
window.addEventListener("yt-navigate-finish", () => settings && apply());
