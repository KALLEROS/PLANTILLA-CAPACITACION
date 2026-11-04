// Convierte la página en app: modo sin señal (service worker) y botón Instalar.
(() => {
  "use strict";

  if ("serviceWorker" in navigator && location.protocol === "https:") {
    window.addEventListener("load", () => { navigator.serviceWorker.register("sw.js").catch(() => {}); });
  }
  // Pide al navegador que no borre el progreso guardado cuando le falte espacio.
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

  // Android/Chrome usa el aviso nativo de instalación. Safari en iPhone no lo tiene, así que mostramos los pasos.
  const bar = document.getElementById("installBar");
  const sheet = document.getElementById("iosSheet");
  const standalone = (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
  if (standalone) return;

  const HIDE = "come-camila-instalar-oculto-hasta";
  try { if (Date.now() < +(localStorage.getItem(HIDE) || 0)) return; } catch (e) { /* sin almacenamiento */ }

  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  let deferred = null;
  if (isIOS) bar.hidden = false;
  window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); deferred = e; bar.hidden = false; });
  window.addEventListener("appinstalled", () => { bar.hidden = true; });

  document.getElementById("installBtn").addEventListener("click", () => {
    if (deferred) {
      deferred.prompt();
      deferred.userChoice.then(() => { deferred = null; bar.hidden = true; });
    } else {
      sheet.hidden = false;
    }
  });
  document.getElementById("installClose").addEventListener("click", () => {
    try { localStorage.setItem(HIDE, String(Date.now() + 3 * 864e5)); } catch (e) { /* sin almacenamiento */ }
    bar.hidden = true;
  });
  document.getElementById("iosOk").addEventListener("click", () => { sheet.hidden = true; });
  sheet.addEventListener("click", e => { if (e.target === sheet) sheet.hidden = true; });
})();
