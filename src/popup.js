// Ancla - panel de configuración
// (las funciones compartidas vienen de common.js)

const $ = (id) => document.getElementById(id);
const MODE_LABEL = { feed: "Feed oculto", block: "Bloqueado", free: "Sin bloqueo" };

let S = { ...DEFAULTS };                    // configuración actual
let view = { tab: "now", profileId: null }; // pestaña y perfil abierto
let expanded = null;                        // dominio con el editor abierto
let currentHost = null;                     // sitio de la pestaña activa
let toastTimer;

// ---------- Utilidades ----------

function h(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v === null || v === undefined) continue;
    if (k === "class") e.className = v;
    else if (k === "style") e.style.cssText = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (k === "checked" || k === "value") e[k] = v;
    else if (v === true) e.setAttribute(k, "");
    else e.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    e.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return e;
}

function toast(msg, isError = false) {
  const t = $("toast");
  t.textContent = msg;
  t.className = "show" + (isError ? " error" : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = isError ? "error" : ""), isError ? 3500 : 1600);
}

function fmtClock(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function avatarColor(domain) {
  let x = 0;
  for (const c of domain) x = (x * 31 + c.charCodeAt(0)) >>> 0;
  return `hsl(${x % 360} 55% 45%)`;
}

function avatar(domain) {
  return h("span", { class: "avatar", style: `background:${avatarColor(domain)}` }, domain[0].toUpperCase());
}

function switchEl(checked, onchange, opts = {}) {
  return h("input", {
    type: "checkbox", class: "switch", checked, disabled: !!opts.disabled, "aria-label": opts.label,
    onchange: (e) => onchange(e.target.checked), onclick: (e) => e.stopPropagation()
  });
}

function usageBar(domain, limitMin) {
  if (!(limitMin > 0)) return null;
  const f = Math.min(1, usedSeconds(S, domain) / (limitMin * 60));
  return h("div", { class: "usage" + (f >= 1 ? " over" : f >= 0.8 ? " warn" : "") },
    h("i", { style: `width:${(f * 100).toFixed(1)}%` }));
}

function ruleSummary(r) {
  const parts = [MODE_LABEL[r.mode]];
  if (r.grayscale) parts.push("B/N");
  if (r.limitMin > 0) {
    const used = Math.floor(usedSeconds(S, r.domain) / 60);
    parts.push(`${Math.min(used, r.limitMin)} de ${r.limitMin} min hoy`);
  }
  return parts.join(", ");
}

const getProfile = (id) => S.profiles.find((p) => p.id === id);

// ---------- Guardar ----------

async function save(patch, okMsg = "Guardado") {
  let next = { ...S, ...patch };
  next.profiles = (next.profiles || []).map(cleanProfile);
  let reverted = false;

  if (isLocked(S)) {
    const r = enforceStrict(S, next);
    next = r.settings;
    reverted = r.reverted;
  }

  const toWrite = {};
  for (const k of CONFIG_KEYS) toWrite[k] = next[k];
  await browser.storage.local.set(toWrite);
  S = { ...S, ...toWrite };
  render();

  if (reverted) toast("Con la configuración bloqueada solo podés endurecer las reglas", true);
  else if (okMsg) toast(okMsg);
}

function updateProfile(id, changes, msg) {
  return save({ profiles: S.profiles.map((p) => (p.id === id ? { ...p, ...changes } : p)) }, msg);
}

function updateSite(pid, domain, changes) {
  const p = getProfile(pid);
  return updateProfile(pid, { sites: p.sites.map((r) => (r.domain === domain ? { ...r, ...changes } : r)) });
}

async function addSite(pid, raw) {
  const domain = normalizeSite(raw);
  if (!isValidDomain(domain)) {
    toast("Escribí un dominio, por ejemplo tiktok.com", true);
    return false;
  }
  const p = getProfile(pid);
  expanded = domain;
  if (p.sites.some((r) => r.domain === domain)) {
    render();
    toast(`${domain} ya está en este perfil`);
    return true;
  }
  await updateProfile(pid, { sites: [...p.sites, newRule(domain)] }, `Agregaste ${domain}`);
  return true;
}

async function createProfile(templateKey) {
  const p = newProfile(templateKey);
  const n = S.profiles.filter((x) => x.name.startsWith(p.name)).length;
  if (n) p.name = `${p.name} ${n + 1}`;
  view = { tab: "profiles", profileId: p.id };
  expanded = null;
  await save({ profiles: [...S.profiles, p] }, `Creaste "${p.name}"`);
}

async function requestUnlock() {
  await browser.tabs.create({ url: browser.runtime.getURL("unlock.html") });
  window.close();
}

// ---------- Encabezado y bloqueo ----------

function renderHeader() {
  const act = activeProfiles(S);
  let title, sub;

  if (!S.enabled) {
    title = "En pausa";
    sub = "Ancla no está aplicando ningún perfil";
  } else if (act.length) {
    title = "Anclado";
    sub = (act.length === 1 ? "Activo: " : "Activos: ") + listText(act.map((p) => p.name));
  } else {
    title = "Sin perfiles activos";
    const next = S.profiles.map((p) => ({ p, d: nextStart(p) })).filter((x) => x.d).sort((a, b) => a.d - b.d)[0];
    sub = next ? `${next.p.name} empieza ${whenText(next.d)}` : "Activá un perfil para empezar";
  }
  $("statusTitle").textContent = title;
  $("statusSub").textContent = sub;
  $("statusSub").title = sub;
  $("enabled").checked = S.enabled;
  $("enabled").disabled = isLocked(S);
}

function renderLockbar() {
  const bar = $("lockbar");
  const now = Date.now();
  const left = (S.unlockedUntil || 0) - now;

  if (isLocked(S, now)) {
    bar.hidden = false;
    bar.className = "lockbar locked";
    $("lockText").textContent = "Configuración bloqueada";
    $("lockBtn").textContent = `Desbloquear (${nextUnlockDelay(S)} min)`;
    $("lockBtn").onclick = requestUnlock;
  } else if (S.strictMode && isActiveNow(S) && left > 0) {
    bar.hidden = false;
    bar.className = "lockbar open";
    $("lockText").textContent = `Desbloqueado por ${fmtClock(left)}`;
    $("lockBtn").textContent = "Bloquear ya";
    $("lockBtn").onclick = async () => {
      await browser.storage.local.set({ unlockedUntil: 0 });
      S.unlockedUntil = 0;
      render();
      toast("Configuración bloqueada de nuevo");
    };
  } else {
    bar.hidden = true;
  }
}

// ---------- Pestaña "Ahora" ----------

function renderNow() {
  const act = activeProfiles(S);
  const out = [];

  out.push(h("div", { class: "heading" }, "Perfiles activos"));
  if (!act.length) {
    out.push(h("div", { class: "list" }, h("div", { class: "empty" },
      S.enabled ? "Ningún perfil está activo en este momento. Todo se ve normal." : "Ancla está en pausa.")));
  } else {
    out.push(h("ul", { class: "list" }, act.map((p) => h("li", {},
      h("button", { class: "item", onclick: () => openProfile(p.id) },
        h("span", { class: "dot on" }),
        h("span", { class: "item-info" },
          h("div", { class: "item-name" }, p.name),
          h("div", { class: "item-sum" }, scheduleText(p))),
        h("span", { class: "chev" }, "›"))))));
  }

  // Reglas efectivas por sitio
  const domains = [...new Set(act.flatMap((p) => p.sites.map((r) => r.domain)))];
  out.push(h("div", { class: "heading" }, "Qué se aplica ahora"));
  const rows = [];
  for (const d of domains) {
    const r = effectiveRule(S, d);
    if (!r) continue;
    rows.push(h("li", {},
      h("div", { class: "item" },
        avatar(d),
        h("span", { class: "item-info" },
          h("div", { class: "item-name" }, d),
          h("div", { class: "item-sum" }, `${ruleSummary(r)}. Por ${listText(r.profiles)}`))),
      usageBar(r.domain, r.limitMin)));
  }
  if (act.some((p) => p.blockShorts)) {
    rows.push(h("li", {}, h("div", { class: "item" },
      avatar("youtube.com"),
      h("span", { class: "item-info" },
        h("div", { class: "item-name" }, "Shorts de YouTube"),
        h("div", { class: "item-sum" }, "Ocultos. Por " + listText(act.filter((p) => p.blockShorts).map((p) => p.name)))))));
  }
  out.push(rows.length
    ? h("ul", { class: "list" }, rows)
    : h("div", { class: "list" }, h("div", { class: "empty" }, "No hay reglas aplicando ahora.")));

  return out;
}

// ---------- Pestaña "Perfiles" ----------

function openProfile(id) {
  view = { tab: "profiles", profileId: id };
  expanded = null;
  render();
  $("main").scrollTop = 0;
}

function renderProfileList() {
  const locked = isLocked(S);
  const out = [h("div", { class: "heading" }, "Tus perfiles")];

  if (!S.profiles.length) {
    out.push(h("div", { class: "list" }, h("div", { class: "empty" }, "No tenés perfiles. Creá uno con las opciones de abajo.")));
  } else {
    out.push(h("ul", { class: "list" }, S.profiles.map((p) => {
      const on = S.enabled && isProfileActive(p);
      const n = p.sites.length;
      return h("li", {},
        h("div", { class: "item" },
          h("button", { class: "item", style: "padding:0;flex:1", onclick: () => openProfile(p.id) },
            h("span", { class: "dot" + (on ? " on" : ""), title: on ? "Activo ahora" : "Inactivo ahora" }),
            h("span", { class: "item-info" },
              h("div", { class: "item-name" }, p.name),
              h("div", { class: "item-sum" },
                (p.enabled ? scheduleText(p) : "En pausa") + `, ${n} ${n === 1 ? "sitio" : "sitios"}`))),
          switchEl(p.enabled, (v) => updateProfile(p.id, { enabled: v }, v ? `"${p.name}" activado` : `"${p.name}" en pausa`),
            { disabled: locked && p.enabled, label: "Activar perfil" })));
    })));
  }

  out.push(h("div", { class: "heading" }, "Nuevo perfil"));
  const tpl = (key, title, desc) => h("button", { class: "tpl", onclick: () => createProfile(key) },
    h("b", {}, title), h("span", {}, desc));
  out.push(h("div", { class: "templates" },
    tpl("social", "Redes sociales", "Feeds ocultos de lun a vie"),
    tpl("work", "Horario laboral", "YouTube en B/N de 9 a 18"),
    tpl("blank", "En blanco", "Lo armás vos")));
  return out;
}

function renderSiteRow(p, r, locked) {
  const open = expanded === r.domain;
  const feedKey = feedKeyFor(r.domain);
  const li = h("li", { class: open ? "open" : "" },
    h("button", {
      class: "item", "aria-expanded": open ? "true" : "false",
      onclick: () => { expanded = open ? null : r.domain; render(); }
    },
      avatar(r.domain),
      h("span", { class: "item-info" },
        h("div", { class: "item-name" }, r.domain),
        h("div", { class: "item-sum" }, ruleSummary(r))),
      h("span", { class: "chev", "aria-hidden": "true" }, "›")),
    usageBar(r.domain, r.limitMin));

  if (!open) return li;

  const level = MODE_LEVEL[r.mode];
  const modeBtn = (mode, label, unavailable, title) => h("button", {
    "aria-pressed": r.mode === mode ? "true" : "false",
    disabled: unavailable || (locked && MODE_LEVEL[mode] < level),
    title,
    onclick: () => r.mode !== mode && updateSite(p.id, r.domain, { mode })
  }, label);

  const modeHint = r.mode === "feed" ? FEED_SITES[feedKey].hint
    : r.mode === "block" ? "Muestra una pantalla de bloqueo en todo el sitio"
    : "No oculta nada. Sirve para usar solo el blanco y negro o el límite diario";

  li.append(h("div", { class: "edit" },
    h("div", { class: "label" }, "Qué hacer en este sitio"),
    h("div", { class: "seg" },
      modeBtn("feed", "Ocultar feed", !feedKey, feedKey ? null : "No disponible para este sitio"),
      modeBtn("block", "Bloquear"),
      modeBtn("free", "Nada")),
    h("div", { class: "hint" }, modeHint),
    h("div", { class: "row" },
      h("div", { class: "txt" }, "Blanco y negro"),
      switchEl(r.grayscale, (v) => updateSite(p.id, r.domain, { grayscale: v }),
        { disabled: locked && r.grayscale, label: "Blanco y negro" })),
    h("div", { class: "row" },
      h("div", { class: "txt" }, "Límite diario",
        h("small", {}, "0 = sin límite. Al llegar, el sitio se bloquea hasta mañana")),
      h("label", { class: "num" },
        h("input", {
          type: "number", min: "0", max: "1440", value: String(r.limitMin), "aria-label": "Minutos por día",
          onchange: (e) => updateSite(p.id, r.domain, { limitMin: Number(e.target.value) || 0 })
        }), "min")),
    h("button", {
      class: "remove", disabled: locked,
      onclick: () => {
        expanded = null;
        updateProfile(p.id, { sites: p.sites.filter((x) => x.domain !== r.domain) }, `Quitaste ${r.domain}`);
      }
    }, "Quitar sitio")));
  return li;
}

function renderProfileDetail(p) {
  const locked = isLocked(S);
  const on = S.enabled && isProfileActive(p);
  const out = [];

  out.push(h("button", { class: "back", onclick: () => { view.profileId = null; render(); } }, "‹ Todos los perfiles"));
  out.push(h("input", {
    class: "name-input", value: p.name, maxlength: "40", "aria-label": "Nombre del perfil",
    onchange: (e) => updateProfile(p.id, { name: e.target.value.trim() || p.name }, "Nombre guardado")
  }));
  out.push(h("div", { class: "pstate" },
    !p.enabled ? "En pausa" : on ? h("b", {}, "Activo ahora") : "Inactivo ahora",
    p.enabled && !on && nextStart(p) ? `. Empieza ${whenText(nextStart(p))}` : ""));

  // Horario
  const allDay = p.scheduleStart === p.scheduleEnd;
  out.push(h("div", { class: "heading" }, "Cuándo aplica"));
  out.push(h("div", { class: "section" },
    h("div", { class: "row" },
      h("div", { class: "txt" }, "Solo en un horario", h("small", {}, p.scheduleEnabled ? scheduleText(p) : "Apagado: aplica siempre")),
      switchEl(p.scheduleEnabled, (v) => updateProfile(p.id, { scheduleEnabled: v }), { disabled: locked, label: "Solo en un horario" })),
    h("div", { class: p.scheduleEnabled ? "" : "off" },
      h("div", { class: "days" }, [1, 2, 3, 4, 5, 6, 0].map((d) => h("button", {
        "aria-pressed": p.scheduleDays.includes(d) ? "true" : "false", title: DAY_LONG[d], disabled: locked,
        onclick: () => updateProfile(p.id, {
          scheduleDays: p.scheduleDays.includes(d) ? p.scheduleDays.filter((x) => x !== d) : [...p.scheduleDays, d]
        })
      }, "DLMXJVS"[d]))),
      h("div", { class: "row" },
        h("div", { class: "txt" }, "Todo el día"),
        switchEl(allDay, (v) => updateProfile(p.id, v
          ? { scheduleStart: "00:00", scheduleEnd: "00:00" }
          : { scheduleStart: "09:00", scheduleEnd: "18:00" }), { disabled: locked, label: "Todo el día" })),
      allDay ? null : h("div", { class: "times" },
        "De", h("input", { type: "time", value: p.scheduleStart, disabled: locked,
          onchange: (e) => e.target.value && updateProfile(p.id, { scheduleStart: e.target.value }) }),
        "a", h("input", { type: "time", value: p.scheduleEnd, disabled: locked,
          onchange: (e) => e.target.value && updateProfile(p.id, { scheduleEnd: e.target.value }) })),
      allDay ? null : h("div", { class: "hint" }, "Si la hora de fin es anterior a la de inicio, cruza la medianoche."))));

  // Sitios
  out.push(h("div", { class: "heading" }, "Sitios"));
  out.push(p.sites.length
    ? h("ul", { class: "list" }, p.sites.map((r) => renderSiteRow(p, r, locked)))
    : h("div", { class: "list" }, h("div", { class: "empty" }, "Este perfil todavía no tiene sitios.")));

  const input = h("input", { placeholder: "Agregar sitio, ej. tiktok.com", autocomplete: "off", spellcheck: "false" });
  out.push(h("form", {
    class: "add",
    onsubmit: async (e) => { e.preventDefault(); if (await addSite(p.id, input.value)) input.value = ""; }
  }, input, h("button", { class: "btn", type: "submit" }, "Agregar")));

  if (currentHost && isValidDomain(currentHost) && !findRule(currentHost, p.sites)) {
    out.push(h("button", { class: "btn ghost block", onclick: () => addSite(p.id, currentHost) }, `Agregar ${currentHost}`));
  }

  // Extras
  out.push(h("div", { class: "heading" }, "Extras"));
  out.push(h("div", { class: "section" },
    h("div", { class: "row" },
      h("div", { class: "txt" }, "Ocultar Shorts de YouTube", h("small", {}, "En todo YouTube, también en búsquedas y canales")),
      switchEl(p.blockShorts, (v) => updateProfile(p.id, { blockShorts: v }),
        { disabled: locked && p.blockShorts, label: "Ocultar Shorts" }))));

  // Eliminar pide un segundo toque para confirmar
  const del = h("button", {
    class: "remove", style: "margin:18px 2px 0", disabled: locked,
    onclick: () => {
      if (del.dataset.confirm !== "1") {
        del.dataset.confirm = "1";
        del.textContent = `Tocá de nuevo para eliminar "${p.name}"`;
        setTimeout(() => { if (del.isConnected) { del.dataset.confirm = ""; del.textContent = "Eliminar perfil"; } }, 4000);
        return;
      }
      view.profileId = null;
      save({ profiles: S.profiles.filter((x) => x.id !== p.id) }, `Eliminaste "${p.name}"`);
    }
  }, "Eliminar perfil");
  out.push(del);
  return out;
}

// ---------- Pestaña "Estricto" ----------

function renderStrict() {
  const locked = isLocked(S);
  const b = S.unlockDelayMin;
  const n = unlocksToday(S);
  return [
    h("div", { class: "heading" }, "Modo estricto"),
    h("div", { class: "section" },
      h("div", { class: "row" },
        h("div", { class: "txt" }, "Modo estricto",
          h("small", {}, "Mientras haya un perfil activo solo podés endurecer las reglas. Para aflojarlas hay que esperar.")),
        switchEl(S.strictMode, (v) => save({ strictMode: v }, v ? "Modo estricto activado" : "Modo estricto desactivado"),
          { disabled: locked, label: "Modo estricto" })),
      h("div", { class: "row" },
        h("div", { class: "txt" }, "Espera para desbloquear"),
        h("label", { class: "num" },
          h("input", {
            type: "number", min: "1", max: "120", value: String(b), disabled: locked, "aria-label": "Minutos de espera",
            onchange: (e) => save({ unlockDelayMin: Math.min(120, Math.max(1, Math.round(Number(e.target.value)) || 10)) })
          }), "min")),
      h("div", { class: "row" },
        h("div", { class: "txt" }, "Espera progresiva",
          h("small", {}, `Cada desbloqueo del día duplica la espera: ${b}, ${Math.min(b * 2, MAX_UNLOCK_DELAY)}, ${Math.min(b * 4, MAX_UNLOCK_DELAY)} min…`)),
        switchEl(S.progressiveUnlock, (v) => save({ progressiveUnlock: v }), { disabled: locked, label: "Espera progresiva" })),
      h("div", { class: "stat" },
        n === 0 ? "Hoy no pediste desbloqueos. " : `Hoy pediste ${n} ${n === 1 ? "desbloqueo" : "desbloqueos"}. `,
        "Próxima espera: ", h("b", {}, `${nextUnlockDelay(S)} min`), "."))
  ];
}

// ---------- Render general ----------

function renderMain() {
  let content;
  if (view.tab === "now") content = renderNow();
  else if (view.tab === "strict") content = renderStrict();
  else {
    const p = view.profileId && getProfile(view.profileId);
    if (view.profileId && !p) view.profileId = null;
    content = p ? renderProfileDetail(p) : renderProfileList();
  }
  const main = $("main");
  const top = main.scrollTop;
  main.replaceChildren(...content);
  main.scrollTop = top;
}

function render() {
  renderHeader();
  renderLockbar();
  document.querySelectorAll("nav button").forEach((b) =>
    b.setAttribute("aria-selected", String(b.dataset.tab === view.tab)));
  renderMain();
}

document.querySelectorAll("nav button").forEach((b) =>
  b.addEventListener("click", () => {
    view = { tab: b.dataset.tab, profileId: b.dataset.tab === view.tab ? null : view.profileId };
    expanded = null;
    render();
    $("main").scrollTop = 0;
  })
);

$("enabled").addEventListener("change", (e) =>
  save({ enabled: e.target.checked }, e.target.checked ? "Ancla activado" : "Ancla en pausa"));
$("introUnlock").addEventListener("click", requestUnlock);
$("introDismiss").addEventListener("click", () => ($("intro").hidden = true));

// Cambios hechos desde otro lado (uso de tiempo, desbloqueo, otra ventana)
browser.storage.onChanged.addListener((changes) => {
  for (const k in changes) S[k] = changes[k].newValue;
  if (changes.profiles) S.profiles = (S.profiles || []).map(cleanProfile);
  const a = document.activeElement;
  const typing = a && a.matches && a.matches("input:not([type=checkbox])");
  if (typing) { renderHeader(); renderLockbar(); }
  else render();
});

// ---------- Arranque ----------

(async () => {
  S = await loadSettings();
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url && /^https?:/.test(tab.url)) currentHost = normalizeSite(new URL(tab.url).hostname);
  } catch (e) { /* sin pestaña */ }

  render();

  if (isLocked(S)) {
    const m = nextUnlockDelay(S);
    $("introDelay").textContent = `${m} ${m === 1 ? "minuto" : "minutos"}`;
    $("intro").hidden = false;
  }

  // El estado cambia con el tiempo (horarios, cuenta del desbloqueo)
  let lastKey = "";
  setInterval(() => {
    renderHeader();
    renderLockbar();
    const key = isLocked(S) + "|" + activeProfiles(S).map((p) => p.id).join(",");
    const a = document.activeElement;
    if (key !== lastKey && !(a && a.matches && a.matches("input:not([type=checkbox])"))) {
      lastKey = key;
      renderMain();
    }
  }, 1000);
})();
