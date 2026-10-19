// Pestaña de espera para desbloquear la configuración del modo estricto.
// La cuenta vive solo en esta pestaña: si se cierra, no se desbloquea nada.

const $ = (id) => document.getElementById(id);
const CIRC = 2 * Math.PI * 44;

const QUESTIONS = [
  "¿Qué ibas a hacer cuando abriste esto?",
  "¿Esto te acerca a lo que querías terminar hoy?",
  "¿Cómo te vas a sentir en una hora si lo dejás para después?",
  "¿Es una necesidad real o solo ganas de distraerte?"
];

function fmt(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

function setProgress(f) {
  $("bar").style.strokeDasharray = CIRC;
  $("bar").style.strokeDashoffset = CIRC * (1 - Math.min(1, Math.max(0, f)));
}

async function closeTab() {
  const tab = await browser.tabs.getCurrent();
  if (tab) browser.tabs.remove(tab.id);
  else window.close();
}

$("cancel").addEventListener("click", closeTab);

(async () => {
  const s = await loadSettings();
  setProgress(0);

  if (!isLocked(s)) {
    $("title").textContent = "No hace falta desbloquear";
    $("text").textContent = "La configuración ya se puede editar desde el panel de Ancla.";
    $("timer").textContent = "🔓";
    setProgress(1);
    $("question").hidden = true;
    $("cancel").textContent = "Cerrar";
    return;
  }

  const n = unlocksToday(s) + 1;
  const delayMin = nextUnlockDelay(s);
  if (s.progressiveUnlock && n > 1) {
    $("badge").textContent = `Desbloqueo nº ${n} de hoy · espera de ${delayMin} min`;
    $("badge").hidden = false;
  }

  const total = delayMin * 60 * 1000;
  const start = Date.now();
  let q = 0;

  const tick = setInterval(async () => {
    const elapsed = Date.now() - start;
    const left = total - elapsed;
    $("timer").textContent = fmt(left);
    setProgress(elapsed / total);

    const nq = Math.floor(elapsed / 60000) % QUESTIONS.length;
    if (nq !== q) {
      q = nq;
      $("question").textContent = QUESTIONS[q];
    }

    if (left <= 0) {
      clearInterval(tick);
      const now = await loadSettings(); // releer por si cambió el contador
      await browser.storage.local.set({
        unlockedUntil: Date.now() + UNLOCK_WINDOW_MIN * 60 * 1000,
        unlockDate: todayKey(),
        unlockCount: unlocksToday(now) + 1
      });
      const after = await loadSettings();
      document.body.classList.add("done");
      $("title").textContent = "Desbloqueado";
      $("text").textContent =
        `Tenés ${UNLOCK_WINDOW_MIN} minutos para hacer cambios desde el panel de Ancla. Después se vuelve a bloquear solo.`;
      if (after.progressiveUnlock) {
        $("badge").textContent = `El próximo desbloqueo de hoy va a esperar ${nextUnlockDelay(after)} min`;
        $("badge").hidden = false;
      }
      $("timer").textContent = "🔓";
      $("question").hidden = true;
      $("cancel").textContent = "Cerrar";
    }
  }, 250);
})();
