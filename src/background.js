// Ancla - script de fondo: migra la configuración y suma el tiempo de uso por sitio

loadSettings(); // dispara la migración desde versiones anteriores si hace falta

// Las actualizaciones de uso se encolan para que dos pestañas no se pisen
let queue = Promise.resolve();

function addUsage(domain, seconds) {
  queue = queue.then(async () => {
    const s = await browser.storage.local.get({ usageDate: "", usage: {} });
    const today = todayKey();
    const usage = s.usageDate === today ? s.usage || {} : {};
    const d = normalizeSite(domain);
    usage[d] = (usage[d] || 0) + seconds;
    await browser.storage.local.set({ usageDate: today, usage });
  }).catch(() => {});
  return queue;
}

browser.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === "usage" && typeof msg.domain === "string") {
    const sec = Math.max(0, Math.min(60, Math.round(Number(msg.seconds) || 0)));
    if (sec > 0) return addUsage(msg.domain, sec);
  }
});
