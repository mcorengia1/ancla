// Tests de la lógica compartida (src/common.js).
// Ejecutar con: npm test

const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../src/common.js");

// Fechas de referencia (hora local): 17/10/2026 es sábado, 19 lunes, 20 martes
const SAT_11 = new Date(2026, 9, 17, 11, 0);
const MON_0859 = new Date(2026, 9, 19, 8, 59);
const TUE_11 = new Date(2026, 9, 20, 11, 0);
const TUE_20 = new Date(2026, 9, 20, 20, 0);

const social = { ...C.newProfile("social"), id: "redes" };
const work = { ...C.newProfile("work"), id: "trabajo" };
const settings = { enabled: true, profiles: [social, work], strictMode: false };

test("dominios: normalización y coincidencia", () => {
  assert.equal(C.normalizeSite("https://www.Instagram.com/reels/x"), "instagram.com");
  assert.ok(C.isValidDomain("tiktok.com"));
  assert.ok(!C.isValidDomain("tiktok"));
  assert.equal(C.findRule("m.youtube.com", [{ domain: "youtube.com" }]).domain, "youtube.com");
  assert.equal(C.findRule("notyoutube.com", [{ domain: "youtube.com" }]), null);
});

test("horario: rangos normales, cruce de medianoche y día completo", () => {
  const p = { scheduleEnabled: true, scheduleDays: [1, 2, 3, 4, 5], scheduleStart: "09:00", scheduleEnd: "18:00" };
  assert.ok(C.isInSchedule(p, TUE_11));
  assert.ok(!C.isInSchedule(p, TUE_20));
  assert.ok(!C.isInSchedule(p, SAT_11));

  const night = { ...p, scheduleStart: "22:00", scheduleEnd: "02:00" };
  assert.ok(C.isInSchedule(night, new Date(2026, 9, 20, 23, 0)));
  assert.ok(C.isInSchedule(night, new Date(2026, 9, 21, 1, 0)));
  assert.ok(!C.isInSchedule(night, new Date(2026, 9, 19, 1, 0)), "la madrugada del lunes no está cubierta: el domingo no está en el horario");

  const allDay = { ...p, scheduleStart: "00:00", scheduleEnd: "00:00" };
  assert.ok(C.isInSchedule(allDay, MON_0859));
  assert.ok(!C.isInSchedule(allDay, SAT_11));

  assert.ok(C.isInSchedule({ scheduleEnabled: false }, SAT_11));
});

test("perfiles superpuestos: feeds de lun a vie, YouTube en B/N en horario laboral", () => {
  assert.equal(C.effectiveRule(settings, "www.instagram.com", SAT_11), null);
  assert.equal(C.effectiveRule(settings, "www.youtube.com", SAT_11), null);

  assert.equal(C.effectiveRule(settings, "x.com", TUE_11).mode, "feed");
  assert.equal(C.effectiveRule(settings, "www.youtube.com", TUE_11).grayscale, true);

  assert.equal(C.effectiveRule(settings, "x.com", TUE_20).mode, "feed");
  assert.equal(C.effectiveRule(settings, "www.youtube.com", TUE_20), null);

  assert.deepEqual(C.activeProfiles(settings, TUE_11).map((p) => p.id), ["redes", "trabajo"]);
  assert.ok(C.shortsActive(settings, "www.youtube.com", TUE_20));
  assert.ok(!C.shortsActive(settings, "www.youtube.com", SAT_11));
});

test("combinación de reglas: gana la más estricta", () => {
  const s = {
    enabled: true,
    profiles: [
      C.cleanProfile({ id: "a", name: "A", sites: [{ domain: "youtube.com", mode: "feed", limitMin: 60 }] }),
      C.cleanProfile({ id: "b", name: "B", sites: [{ domain: "youtube.com", mode: "free", grayscale: true, limitMin: 20 }] })
    ]
  };
  const r = C.effectiveRule(s, "youtube.com");
  assert.equal(r.mode, "feed");
  assert.equal(r.grayscale, true);
  assert.equal(r.limitMin, 20);
  assert.deepEqual(r.profiles, ["A", "B"]);
});

test("pausa general y por perfil", () => {
  assert.equal(C.effectiveRule({ ...settings, enabled: false }, "x.com", TUE_11), null);
  const paused = { ...settings, profiles: [{ ...social, enabled: false }, work] };
  assert.equal(C.effectiveRule(paused, "x.com", TUE_11), null);
});

test("modo estricto: solo se puede endurecer", () => {
  const locked = { ...settings, strictMode: true, unlockedUntil: 0 };
  assert.ok(C.isLocked(locked, TUE_11.getTime()));
  assert.ok(!C.isLocked(locked, SAT_11.getTime()));
  assert.ok(!C.isLocked({ ...locked, unlockedUntil: TUE_11.getTime() + 60000 }, TUE_11.getTime()));

  const attempt = JSON.parse(JSON.stringify(locked.profiles));
  attempt[0].scheduleDays = [1];                      // cambiar horario
  attempt[0].sites = attempt[0].sites.slice(1);       // quitar un sitio
  attempt[1].enabled = false;                         // pausar perfil
  attempt[1].sites[0].grayscale = false;              // quitar B/N
  attempt.push(C.newProfile("blank"));                // crear perfil (permitido)

  const { settings: out, reverted } = C.enforceStrict(locked, { ...locked, profiles: attempt, strictMode: false });
  assert.ok(reverted);
  assert.equal(out.strictMode, true);
  assert.equal(out.profiles.length, 3);
  const redes = out.profiles.find((p) => p.id === "redes");
  const trabajo = out.profiles.find((p) => p.id === "trabajo");
  assert.deepEqual(redes.scheduleDays, [1, 2, 3, 4, 5]);
  assert.equal(redes.sites.length, 3);
  assert.equal(trabajo.enabled, true);
  assert.equal(trabajo.sites[0].grayscale, true);
});

test("modo estricto: bajar un límite está permitido, subirlo no", () => {
  const base = { enabled: true, strictMode: true, profiles: [C.cleanProfile({ id: "a", name: "A",
    sites: [{ domain: "youtube.com", mode: "free", limitMin: 30 }] })] };
  const withLimit = (n) => ({ ...base, profiles: [{ ...base.profiles[0], sites: [{ ...base.profiles[0].sites[0], limitMin: n }] }] });
  assert.equal(C.enforceStrict(base, withLimit(10)).settings.profiles[0].sites[0].limitMin, 10);
  assert.equal(C.enforceStrict(base, withLimit(60)).settings.profiles[0].sites[0].limitMin, 30);
  assert.equal(C.enforceStrict(base, withLimit(0)).settings.profiles[0].sites[0].limitMin, 30);
});

test("espera progresiva", () => {
  const s = { unlockDelayMin: 10, progressiveUnlock: true, unlockDate: C.todayKey(), unlockCount: 0 };
  assert.equal(C.nextUnlockDelay(s), 10);
  assert.equal(C.nextUnlockDelay({ ...s, unlockCount: 2 }), 40);
  assert.equal(C.nextUnlockDelay({ ...s, unlockCount: 10 }), 180, "tope de 3 horas");
  assert.equal(C.nextUnlockDelay({ ...s, unlockCount: 2, progressiveUnlock: false }), 10);
  assert.equal(C.nextUnlockDelay({ ...s, unlockCount: 2, unlockDate: "2000-01-01" }), 10, "se reinicia cada día");
});

test("migración desde versiones anteriores", () => {
  const v1 = C.migrate({ blockedSites: ["x.com", "tiktok.com"], grayscaleSites: ["youtube.com"], blockShorts: true });
  assert.equal(v1.length, 1);
  assert.equal(v1[0].name, "Principal");
  assert.deepEqual(v1[0].sites.map((r) => `${r.domain}:${r.mode}:${r.grayscale}`),
    ["x.com:feed:false", "tiktok.com:block:false", "youtube.com:free:true"]);

  const v2 = C.migrate({ sites: [{ domain: "x.com", mode: "feed" }], scheduleEnabled: true, scheduleDays: [1, 2] });
  assert.equal(v2[0].scheduleEnabled, true);
  assert.deepEqual(v2[0].scheduleDays, [1, 2]);

  assert.equal(C.migrate({ profiles: [] }), null, "ya migrado");
  assert.equal(C.migrate({}), null, "instalación nueva");
});

test("el modo estricto viene apagado por defecto", () => {
  assert.equal(C.DEFAULTS.strictMode, false);
});

test("textos de horario", () => {
  assert.equal(C.scheduleText(social), "Lun a vie, todo el día");
  assert.equal(C.scheduleText(work), "Lun a vie, 09:00 a 18:00");
  assert.equal(C.daysText([0, 6]), "Fines de semana");
  assert.equal(C.listText(["A", "B", "C"]), "A, B y C");
});
