// Inicio de sesión con Google, acceso por organización y registro de uso (Supabase).
// Sin config.js configurado, la app arranca en modo demostración con el menú de data.js.
(() => {
  "use strict";
  const C = window.CONFIG || {};
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const gate = $("#gate");
  const CACHE_KEY = "capacitacion-acceso"; // último acceso y menú, para abrir sin señal
  const G_ICON = '<svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z"/><path fill="#FBBC05" d="M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.2 0-11.5-4.1-13.4-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48z"/></svg>';

  if (!C.supabaseUrl || !C.supabaseAnonKey) {
    $("#sync").textContent = "Modo demostración: el progreso se guarda solo en este teléfono.";
    window.startApp(window.MENU, null);
    return;
  }

  const readCache = () => { try { return JSON.parse(localStorage.getItem(CACHE_KEY) || "null"); } catch (e) { return null; } };
  const writeCache = v => { try { localStorage.setItem(CACHE_KEY, JSON.stringify(v)); } catch (e) { /* sin almacenamiento */ } };
  const show = html => { $("#v-hoy").hidden = true; gate.innerHTML = html; gate.hidden = false; };

  function loginScreen(msg, sb) {
    show(`<section class="panel gate-card">
      <p class="eyebrow">Capacitación</p>
      <h2 class="h-display">Entra con tu cuenta de Google</h2>
      <p class="lead">Usa el correo que te dio de alta tu gerente.</p>
      ${msg ? `<p class="warn">${esc(msg)}</p>` : ""}
      <button class="btn google big" id="googleBtn">${G_ICON}Entrar con Google</button>
    </section>`);
    $("#googleBtn").addEventListener("click", async () => {
      $("#googleBtn").disabled = true;
      const { error } = await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: location.origin + location.pathname } });
      if (error) loginScreen("No se pudo abrir Google. Revisa tu conexión e inténtalo otra vez.", sb);
    });
  }

  function blocked(title, text, sb) {
    show(`<section class="panel gate-card">
      <p class="eyebrow">Capacitación</p>
      <h2 class="h-display">${esc(title)}</h2>
      <p class="lead">${esc(text)}</p>
      <button class="btn" id="logoutBtn">Entrar con otra cuenta</button>
    </section>`);
    $("#logoutBtn").addEventListener("click", async () => {
      try { await sb.auth.signOut(); } catch (e) { /* sin señal */ }
      localStorage.removeItem(CACHE_KEY);
      location.reload();
    });
  }

  // Sin señal: abre con el último acceso guardado en este teléfono.
  function offline(sb, userId) {
    const c = readCache();
    if (c && (!userId || c.userId === userId)) return start(c, sb);
    show(`<section class="panel gate-card"><p class="eyebrow">Sin conexión</p>
      <h2 class="h-display">Necesitas señal la primera vez</h2>
      <p class="lead">Conéctate a internet para entrar. Después la app abre aunque no haya señal.</p></section>`);
  }

  async function boot() {
    if (!window.supabase) return offline(null, null); // la librería no cargó: no hay señal
    const sb = window.supabase.createClient(C.supabaseUrl, C.supabaseAnonKey, {
      auth: { flowType: "pkce", persistSession: true, detectSessionInUrl: true }
    });
    const params = new URLSearchParams(location.search);
    const urlError = params.get("error_description");
    const { data: { session } } = await sb.auth.getSession();
    if (location.search) history.replaceState(null, "", location.pathname + location.hash); // quita ?code= de la barra
    if (!session) return loginScreen(urlError ? "Google no completó el inicio de sesión. Inténtalo otra vez." : "", sb);

    const { data: acc, error } = await sb.rpc("entrar");
    if (error) return offline(sb, session.user.id);
    const a = acc && acc[0];
    if (!a) return blocked("Tu correo no tiene acceso", `${session.user.email} no está dado de alta. Pide a tu gerente que te agregue.`, sb);
    if (!a.vigente) return blocked("La licencia venció", "Avísale a tu gerente para que la renueve.", sb);

    const [cont, org] = await Promise.all([
      sb.from("contenido").select("menu").eq("org_id", a.org_id).maybeSingle(),
      sb.from("organizaciones").select("limite_usuarios").eq("id", a.org_id).maybeSingle()
    ]);
    if (cont.error) return offline(sb, session.user.id);
    if (!cont.data) return blocked("Todavía no hay capacitación", "Tu restaurante aún no tiene su contenido cargado.", sb);
    const acceso = { userId: session.user.id, email: session.user.email, orgId: a.org_id, org: a.organizacion, rol: a.rol,
                     limite: org.data ? org.data.limite_usuarios : null, menu: cont.data.menu };
    writeCache(acceso);
    start(acceso, sb);
  }

  function start(a, sb) {
    $(".brand-k").textContent = `${a.org} · Capacitación`;
    $("#sync").textContent = "Tu progreso se guarda en tu cuenta. Si no hay señal, se sube al volver a conectarte.";
    gate.hidden = true;
    window.startApp(a.menu, makeRemote(a, sb));
  }

  // Conexión que usa app.js. Todo lo que se escribe pasa por una fila pendiente en el teléfono,
  // así nada se pierde sin señal.
  function makeRemote(a, sb) {
    const QKEY = "capacitacion-pendiente-" + a.userId;
    let q;
    try { q = JSON.parse(localStorage.getItem(QKEY) || "null"); } catch (e) { q = null; }
    q = q || { act: {}, ex: [], prog: null };
    const keep = () => { try { localStorage.setItem(QKEY, JSON.stringify(q)); } catch (e) { /* sin almacenamiento */ } };
    const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
    const addAct = (s, t) => { const v = q.act[today()] || (q.act[today()] = { s: 0, t: 0 }); v.s += s; v.t += t; keep(); };
    const friendly = e => (e.code === "23505" ? "Ese correo ya está dado de alta." : e.message);

    let flushing = false;
    async function flush() {
      if (!sb || flushing || navigator.onLine === false) return;
      flushing = true;
      try {
        for (const d of Object.keys(q.act)) {
          const v = q.act[d], s = Math.min(v.s, 3600), t = Math.min(v.t, 500);
          if (s || t) {
            const { error } = await sb.rpc("sumar_actividad", { p_dia: d, p_segundos: s, p_tarjetas: t });
            if (error) {
              if (/rango/.test(error.message)) { delete q.act[d]; continue; } // más de 7 días sin señal: se descarta
              break; // se reintenta en el siguiente envío
            }
            v.s -= s; v.t -= t;
          }
          if (!v.s && !v.t) delete q.act[d];
        }
        while (q.ex.length) {
          const { error } = await sb.from("examenes").insert({ ...q.ex[0], user_id: a.userId, org_id: a.orgId });
          if (error) break;
          q.ex.shift();
        }
        if (q.prog) {
          const p = q.prog;
          const { error } = await sb.from("progreso").upsert({ user_id: a.userId, org_id: a.orgId, ...p });
          if (!error && q.prog === p) q.prog = null;
        }
      } catch (e) { /* sin señal: se reintenta */ }
      keep();
      flushing = false;
    }

    // Tiempo en uso: cuenta de 15 en 15 segundos solo con la pantalla visible y actividad en el último minuto.
    let lastInput = Date.now();
    ["pointerdown", "keydown", "touchstart", "wheel"].forEach(ev => addEventListener(ev, () => { lastInput = Date.now(); }, { passive: true }));
    setInterval(() => { if (document.visibilityState === "visible" && Date.now() - lastInput < 60000) addAct(15, 0); }, 15000);
    setInterval(flush, 60000);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush(); });
    addEventListener("online", flush);
    flush();

    return {
      userId: a.userId, email: a.email, org: a.org, rol: a.rol, limite: a.limite,
      async loadProgress() {
        if (!sb) return null;
        try { const { data } = await sb.from("progreso").select("estado").eq("user_id", a.userId).maybeSingle(); return data ? data.estado : null; }
        catch (e) { return null; }
      },
      saveProgress(estado, stats) { q.prog = { estado, ...stats, actualizado: new Date().toISOString() }; keep(); flush(); },
      card() { addAct(0, 1); },
      saveExam(aciertos, total, tema) { q.ex.push({ aciertos, total, tema, hecho: new Date().toISOString() }); keep(); flush(); },
      async team() {
        if (!sb) throw new Error("Necesitas señal para ver al equipo.");
        const { data, error } = await sb.rpc("resumen_equipo");
        if (error) throw new Error(error.message);
        return data;
      },
      async addMember(correo, rol) {
        const { error } = await sb.from("miembros").insert({ org_id: a.orgId, correo, rol });
        if (error) throw new Error(friendly(error));
      },
      async setActive(id, activo) {
        const { error } = await sb.from("miembros").update({ activo }).eq("id", id);
        if (error) throw new Error(friendly(error));
      },
      async signOut() {
        await flush();
        try { await sb.auth.signOut(); } catch (e) { /* sin señal */ }
        localStorage.removeItem(CACHE_KEY);
        location.reload();
      }
    };
  }

  boot().catch(() => offline(null, null));
})();
