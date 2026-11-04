// Lógica de estudio: tarjetas con repetición espaciada (Leitner), examen y guía.
(() => {
  "use strict";
  const M = window.MENU;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const norm = s => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const sample = (a, n) => shuffle(a).slice(0, n);
  const uniq = a => [...new Set(a)];

  /* ── Fechas ── */
  const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const parse = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const today = () => ymd(new Date());
  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return ymd(d); };
  const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / 864e5);
  const MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const fmt = s => { const d = parse(s); return `${d.getDate()} ${MES[d.getMonth()]}`; };

  /* ── Tarjetas ── */
  const DRINK = new Set(["Bebidas", "Cocteles", "Mixología"]);
  const CARDS = [];
  M.items.forEach(it => {
    if (it.wine) CARDS.push({ id: it.id, st: it.st, cat: it.cat, kind: "wine", title: it.name, q: "¿De dónde es, qué uva y a qué sabe?", it });
    else if (it.list) CARDS.push({ id: it.id, st: it.st, cat: it.cat, kind: "list", title: it.name, q: `Menciona las ${it.ing.length} marcas`, it });
    else {
      if (!it.tableOnly) CARDS.push({ id: it.id, st: it.st, cat: it.cat, kind: "dish", title: it.name, q: DRINK.has(it.cat) ? "¿Cómo se prepara?" : "¿Qué lleva?", it });
      if (it.comp) CARDS.push({ id: it.id + "~c", st: it.st, cat: it.cat, kind: "comp", title: it.name, q: "¿Con qué complementos sale?", it });
    }
  });
  M.rules.forEach(r => CARDS.push({ id: r.id, st: r.st, cat: "Reglas", kind: "rule", title: r.q, q: "", r }));
  M.codes.forEach(c => CARDS.push({ id: "code" + c.c, st: 10, cat: "Códigos", kind: "code", title: "Código " + c.c, q: "¿Qué significa en la comanda?", c }));
  CARDS.sort((a, b) => a.st - b.st);
  const BY_ID = Object.fromEntries(CARDS.map(c => [c.id, c]));

  /* ── Progreso: este dispositivo + cuenta de Claude si está disponible ── */
  const KEY = "come-camila-estudio-v1";
  const fresh = () => ({ p: {}, log: {}, ex: [], newPer: 10, upd: 0 });
  let S = fresh();
  try { const r = JSON.parse(localStorage.getItem(KEY) || "null"); if (r && r.p) S = Object.assign(fresh(), r); } catch (e) { /* sin almacenamiento */ }
  let remote = null, pushTimer = 0, pushing = Promise.resolve();

  function save() {
    S.upd = Date.now();
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* sin almacenamiento */ }
    if (!remote) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => {
      const body = JSON.parse(JSON.stringify(S));
      pushing = pushing.then(() => remote.set(body)).catch(() => {});
    }, 1200);
  }

  async function connect() {
    try {
      if (!window.claude || !window.claude.use) return;
      const [db, user] = await Promise.all([window.claude.use("db"), window.claude.use("user")]);
      if (!db || !user) return;
      const uid = await user.id();
      if (!uid) return;
      const ref = db.doc("data/users/" + uid + "/progreso");
      const snap = await ref.get();
      remote = ref;
      if (snap.exists) {
        const r = JSON.parse(JSON.stringify(snap.data()));
        if (r.p && (r.upd || 0) > (S.upd || 0)) {
          S = Object.assign(fresh(), r);
          try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* sin almacenamiento */ }
          if (!session && !exam) render(current);
        } else if ((S.upd || 0) > (r.upd || 0)) save();
      } else if (S.upd) save();
      $("#sync").textContent = "Tu progreso se guarda en tu cuenta de Claude y sigue contigo en cualquier dispositivo.";
    } catch (e) { remote = null; }
  }

  /* ── Repetición espaciada ── */
  const INT = [0, 1, 2, 4, 8, 16]; // días de espera por caja
  const MASTER = 3;                // caja 3 o más = dominada
  const seen = c => !!S.p[c.id];
  const mastered = c => (S.p[c.id]?.b || 0) >= MASTER;
  const dayLog = d => S.log[d] || (S.log[d] = { r: 0, n: 0 });
  const dueList = () => { const t = today(); return CARDS.filter(c => S.p[c.id] && S.p[c.id].due <= t); };
  const newList = (extra = 0) => {
    const left = Math.max(0, S.newPer + extra - ((S.log[today()] || {}).n || 0));
    return CARDS.filter(c => !S.p[c.id]).slice(0, left);
  };
  function streak() {
    let n = 0, d = today();
    if (!S.log[d]?.r) d = addDays(d, -1);
    while (S.log[d]?.r) { n++; d = addDays(d, -1); }
    return n;
  }

  /* ── Plan hasta diciembre ── */
  const PLAN = [
    { t: "Semana 1", from: "2026-11-04", to: "2026-11-10", st: [1, 2], focus: "Entradas, complementos y bebidas" },
    { t: "Semana 2", from: "2026-11-11", to: "2026-11-17", st: [3, 4], focus: "Ensaladas, paninis, tríos y cocteles" },
    { t: "Semana 3", from: "2026-11-18", to: "2026-11-24", st: [5, 6, 7], focus: "Pizzas, pastas, especialidades, mixología, niños y postres" },
    { t: "Semana 4", from: "2026-11-25", to: "2026-12-01", st: [8, 9, 10], focus: "Licores, vinos, códigos y simulacros" },
    { t: "Diciembre", from: "2026-12-02", to: "2026-12-31", st: [], focus: "Mantenimiento: sesión corta diaria y examen cada semana" }
  ];
  const weekIdx = (d = today()) => { const i = PLAN.findIndex(w => d >= w.from && d <= w.to); return i >= 0 ? i : (d < PLAN[0].from ? 0 : PLAN.length - 1); };
  const stageCards = n => CARDS.filter(c => c.st === n);
  function pace() {
    const t = today(), w = weekIdx(t), W = PLAN[w];
    const target = PLAN.slice(0, w + 1).flatMap(x => x.st);
    const before = PLAN.slice(0, w).flatMap(x => x.st);
    const pending = CARDS.filter(c => target.includes(c.st) && !seen(c)).length;
    const daysLeft = Math.max(1, daysBetween(t, W.to) + 1);
    return { w, W, pending, perDay: Math.ceil(pending / daysLeft), behind: CARDS.some(c => before.includes(c.st) && !seen(c)) };
  }

  /* ── Respuestas ── */
  const list = a => `<ul class="ing">${a.map(x => `<li>${esc(x)}</li>`).join("")}</ul>`;
  function extras(it) {
    const rows = [];
    if (it.comp) rows.push(["Sale con", it.comp.join(" + ")]);
    if (it.gar) rows.push(["Garnitura", it.gar]);
    if (it.esc) rows.push(["Escarcha", it.esc]);
    if (it.alias) rows.push(["En la tabla", it.alias]);
    if (it.note) rows.push(["Ojo", it.note]);
    return rows.length ? `<dl class="kv">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>` : "";
  }
  function answerHTML(c) {
    const it = c.it;
    switch (c.kind) {
      case "dish": return list(it.ing) + extras(it);
      case "comp": return `<p class="big">${esc(it.comp.join(" + "))}</p>` + (it.note ? `<p class="note">${esc(it.note)}</p>` : "");
      case "list": return list(it.ing);
      case "wine": return `<dl class="kv"><dt>Origen</dt><dd>${esc(it.origin)}</dd><dt>Uva</dt><dd>${esc(it.grape)}</dd><dt>Sabores</dt><dd>${esc(it.notes)}</dd>${it.copa ? "<dt>Servicio</dt><dd>También por copa</dd>" : ""}</dl>`;
      case "rule": return `<p class="big">${esc(c.r.a)}</p>`;
      case "code": return `<p class="big">${esc(c.c.m)}</p>`;
    }
    return "";
  }

  /* ── Vista: Hoy ── */
  let session = null, revealed = false;

  function renderHoy() {
    if (session) return renderCard();
    const el = $("#v-hoy");
    const due = dueList(), nw = newList(), pc = pace(), L = S.log[today()] || { r: 0, n: 0 };
    const total = CARDS.length, nSeen = CARDS.filter(seen).length, nMast = CARDS.filter(mastered).length;
    const pending = due.length + nw.length;
    const more = newList(5).length > nw.length;
    el.innerHTML = `
      <section class="panel today">
        <p class="eyebrow">${esc(pc.W.t)} · ${fmt(pc.W.from)} – ${fmt(pc.W.to)}</p>
        <h2 class="h-display">${esc(pc.W.focus)}</h2>
        <div class="counts">
          <div><b>${due.length}</b><span>repasos</span></div>
          <div><b>${nw.length}</b><span>nuevas</span></div>
          <div><b>${streak()}</b><span>días seguidos</span></div>
        </div>
        ${pending
          ? `<button class="btn primary big" id="start">Empezar sesión · ${pending} tarjeta${pending === 1 ? "" : "s"}</button>`
          : `<p class="lead">${L.r ? `Sesión de hoy terminada: ${L.r} tarjetas. Mañana el sistema te trae lo que toca repasar.` : "No tienes tarjetas pendientes hoy."}</p>
             ${more ? '<button class="btn" id="more">Aprender 5 nuevas más</button>' : ""}`}
        ${pc.behind ? `<p class="warn">Vas atrás del plan. Para ponerte al día necesitas unas ${pc.perDay} tarjetas nuevas por día; cámbialo en Plan.</p>` : ""}
        <div class="meter" role="img" aria-label="${nMast} de ${total} dominadas, ${nSeen} vistas">
          <span class="m-seen" style="width:${(nSeen / total) * 100}%"></span>
          <span class="m-mast" style="width:${(nMast / total) * 100}%"></span>
        </div>
        <p class="meter-legend"><span><i class="sw sw-mast"></i>${nMast} dominadas</span><span><i class="sw sw-seen"></i>${nSeen} vistas</span><span>${total} en total</span></p>
      </section>
      <section class="panel howto">
        <h3>Cómo funciona</h3>
        <ol>
          <li>Lee el nombre y <b>di la respuesta completa en voz alta</b> antes de voltear.</li>
          <li>Voltea y califícate con honestidad. Lo que falles vuelve mañana; lo que domines se espacia hasta 16 días.</li>
          <li>En el turno, cada platillo que lleves a mesa, recita sus ingredientes y compáralo con el plato.</li>
        </ol>
      </section>`;
  }

  function startSession(bonus = 0) {
    // Las tarjetas de complementos van al final, para que no salgan justo después de ver el platillo.
    const due = shuffle(dueList()), nw = newList(bonus).sort((a, b) => (a.kind === "comp") - (b.kind === "comp")), q = [];
    let i = 0, j = 0;
    while (i < due.length || j < nw.length) { // una nueva cada dos repasos
      if (i < due.length) q.push(due[i++]);
      if (i < due.length) q.push(due[i++]);
      if (j < nw.length) q.push(nw[j++]);
    }
    if (!q.length) return;
    session = { q, i: 0, total: q.length, again: new Set(), ok: 0, bad: 0 };
    revealed = false;
    renderCard();
  }

  function renderCard() {
    const el = $("#v-hoy"), s = session;
    if (s.i >= s.q.length) {
      session = null;
      el.innerHTML = `
        <section class="panel today">
          <p class="eyebrow">Sesión terminada</p>
          <h2 class="h-display">${s.i} tarjetas repasadas</h2>
          <div class="counts"><div><b>${s.ok}</b><span>lo sabías</span></div><div><b>${s.bad}</b><span>por reforzar</span></div><div><b>${streak()}</b><span>días seguidos</span></div></div>
          <div class="row"><button class="btn primary" data-go="examen">Hacer un examen rápido</button>${newList(5).length ? '<button class="btn" id="more">Aprender 5 nuevas más</button>' : ""}</div>
        </section>`;
      return;
    }
    const c = s.q[s.i], p = S.p[c.id];
    const tag = !p ? "Nueva" : p.b >= MASTER ? "Repaso" : "Aprendiendo";
    el.innerHTML = `
      <div class="progress" aria-hidden="true"><span style="width:${(s.i / s.q.length) * 100}%"></span></div>
      <article class="ticket">
        <header class="tk-head"><span>E${c.st} · ${esc(c.cat)}</span><span>${s.i + 1} / ${s.q.length}</span></header>
        <p class="tk-tag tag-${tag === "Nueva" ? "new" : tag === "Repaso" ? "ok" : "learn"}">${tag}</p>
        <h2 class="tk-title">${esc(c.title)}</h2>
        ${c.q ? `<p class="tk-q">${esc(c.q)}</p>` : ""}
        <div class="tk-cut" aria-hidden="true"></div>
        ${revealed ? `<div class="tk-answer" aria-live="polite">${answerHTML(c)}</div>` : '<p class="tk-say">Dilo completo en voz alta y luego voltea.</p>'}
      </article>
      <div class="actions">
        ${revealed
          ? `<button class="btn grade bad" data-g="0"><kbd>1</kbd>No me lo sabía</button>
             <button class="btn grade mid" data-g="1"><kbd>2</kbd>Dudé</button>
             <button class="btn grade good" data-g="2"><kbd>3</kbd>Lo sabía</button>`
          : '<button class="btn primary big" id="reveal"><kbd>Espacio</kbd>Ver respuesta</button>'}
      </div>
      <button class="link" id="quit">Terminar por ahora</button>`;
    if (!revealed) $("#reveal").focus({ preventScroll: true });
  }

  function grade(g) {
    const s = session, c = s.q[s.i], t = today();
    const isNew = !S.p[c.id];
    const p = S.p[c.id] || { b: 0, r: 0, l: 0 };
    if (g === 0) {
      p.b = 1; p.l++; p.due = addDays(t, 1); s.bad++;
      if (!s.again.has(c.id)) { s.again.add(c.id); s.q.push(c); } // la repites al final de la sesión
    } else if (g === 1) {
      p.b = Math.max(1, p.b - 1); p.due = addDays(t, 1);
    } else {
      p.b = Math.min(5, p.b + 1); p.due = addDays(t, INT[p.b]); s.ok++;
    }
    p.r++; p.last = t; S.p[c.id] = p;
    const L = dayLog(t); L.r++; if (isNew) L.n++;
    save();
    s.i++; revealed = false;
    renderCard();
  }

  /* ── Examen ── */
  let exam = null;
  const FAMILY = { "Entradas": "comida", "Ensaladas": "comida", "Paninis clásicos": "comida", "Sándwiches Prime": "comida", "Tríos": "comida", "Pizzas": "comida", "Pastas": "comida", "Especialidades": "comida", "Niños": "comida", "Postres": "postre", "Bebidas": "bebida", "Cocteles": "bebida", "Mixología": "bebida" };
  const FOOD = M.items.filter(it => !it.wine && !it.list && it.ing.length);
  const WINES = M.items.filter(it => it.wine);
  const LICORES = M.items.filter(it => it.cat === "Licores");
  const COMPS = uniq(M.items.filter(it => it.comp).map(it => it.comp.join(" + ")));
  const GENERIC = new Set("queso salsa mayo aceite vinagreta aderezo pasta mix con los las del para pan jugo zumo concentrado".split(" "));
  const toks = s => norm(s).replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2 && !GENERIC.has(w)).map(w => (w.length > 4 && w.endsWith("s") ? w.slice(0, -1) : w));
  function similar(a, b) {
    const na = norm(a), nb = norm(b);
    if (na.includes(nb) || nb.includes(na)) return true;
    const tb = new Set(toks(b));
    return toks(a).some(w => tb.has(w));
  }
  const has = (it, s) => it.ing.some(x => similar(x, s));
  const peers = it => {
    let ps = FOOD.filter(o => o.id !== it.id && o.cat === it.cat);
    if (ps.length < 4) ps = ps.concat(FOOD.filter(o => o.cat !== it.cat && FAMILY[o.cat] === FAMILY[it.cat]));
    return ps;
  };

  function qWhich(it) {
    if (it.ing.length < 3) return null;
    const shown = sample(it.ing, Math.min(4, it.ing.length));
    const ds = shuffle(peers(it)).filter(o => !shown.every(s => has(o, s))).slice(0, 3);
    if (ds.length < 3) return null;
    return { card: it.id, q: "¿Qué platillo o bebida lleva todo esto?", sub: shown.join(" · "), opts: shuffle([it.name, ...ds.map(d => d.name)]), ans: it.name, why: `${it.name}: ${it.ing.join(", ")}.` };
  }
  function qHas(it, neg) {
    if (it.cat === "Tríos") return null;
    const foreign = uniq(peers(it).flatMap(o => o.ing)).filter(x => !has(it, x));
    if (foreign.length < 3 || it.ing.length < (neg ? 3 : 1)) return null;
    const why = `${it.name} lleva: ${it.ing.join(", ")}.`;
    if (neg) { const odd = pick(foreign); return { card: it.id, q: `¿Qué NO lleva ${it.name}?`, opts: shuffle([...sample(it.ing, 3), odd]), ans: odd, why }; }
    const ok = pick(it.ing);
    return { card: it.id, q: `¿Cuál de estos sí lleva ${it.name}?`, opts: shuffle([ok, ...sample(foreign, 3)]), ans: ok, why };
  }
  function qComp(it) {
    const ans = it.comp.join(" + ");
    return { card: it.id + "~c", q: `¿Con qué complementos sale ${it.name}?`, opts: shuffle([ans, ...sample(COMPS.filter(x => x !== ans), 3)]), ans, why: `${it.name} sale con: ${ans}.` };
  }
  function qWine(it) {
    const why = `${it.name}: ${it.origin} · uva ${it.grape} · ${it.notes}.`;
    if (Math.random() < 0.5) {
      const country = s => norm(s.split(",").pop().trim());
      const ds = uniq(WINES.map(w => w.origin)).filter(o => country(o) !== country(it.origin));
      return { card: it.id, q: `¿De dónde es el ${it.name}?`, opts: shuffle([it.origin, ...sample(ds, 3)]), ans: it.origin, why };
    }
    const g = norm(it.grape);
    const ds = uniq(WINES.map(w => w.grape)).filter(x => !norm(x).includes(g) && !g.includes(norm(x)));
    return { card: it.id, q: `¿De qué uva es el ${it.name}?`, opts: shuffle([it.grape, ...sample(ds, 3)]), ans: it.grape, why };
  }
  function qList(it) {
    if (it.cat === "Licores") {
      const brand = pick(it.ing);
      return { card: it.id, q: `¿En qué grupo de licores está ${brand}?`, opts: shuffle([it.name, ...sample(LICORES.filter(o => o.id !== it.id).map(o => o.name), 3)]), ans: it.name, why: `${it.name}: ${it.ing.join(", ")}.` };
    }
    const art = M.items.find(o => o.id === "artesanales"), reg = M.items.find(o => o.id === "cervezas");
    const ans = pick(art.ing);
    return { card: it.id, q: "¿Cuál es cerveza artesanal?", opts: shuffle([ans, ...sample(reg.ing, 3)]), ans, why: `Artesanales: ${art.ing.join(", ")}.` };
  }
  function qCode(code) {
    const why = M.codes.map(x => `${x.c} = ${x.m}`).join(" · ");
    if (Math.random() < 0.5) return { card: "code" + code.c, q: `En la comanda, ¿qué significa ${code.c}?`, opts: shuffle(M.codes.map(x => x.m)), ans: code.m, why };
    return { card: "code" + code.c, q: `¿Qué código marcas para «${code.m.toLowerCase()}»?`, opts: shuffle(M.codes.map(x => x.c)), ans: code.c, why };
  }
  function makeQ(c) {
    switch (c.kind) {
      case "dish": for (const f of shuffle([() => qWhich(c.it), () => qHas(c.it, false), () => qHas(c.it, true)])) { const q = f(); if (q) return q; } return null;
      case "comp": return qComp(c.it);
      case "wine": return qWine(c.it);
      case "list": return qList(c.it);
      case "code": return qCode(c.c);
    }
    return null;
  }

  const SCOPES = () => [
    { v: "seen", t: `Lo que ya estudié (${CARDS.filter(seen).length} tarjetas)`, pool: () => CARDS.filter(seen) },
    { v: "week", t: `Etapas de esta semana`, pool: () => CARDS.filter(c => PLAN[weekIdx()].st.includes(c.st)) },
    { v: "all", t: "Todo el menú", pool: () => CARDS },
    ...M.stages.map(s => ({ v: "s" + s.n, t: `Etapa ${s.n} · ${s.t}`, pool: () => stageCards(s.n) }))
  ];
  let examScope = null;

  function renderExam() {
    const el = $("#v-examen");
    if (exam) return renderQuestion();
    const scopes = SCOPES();
    if (!examScope) examScope = CARDS.filter(seen).length >= 8 ? "seen" : "week";
    const hist = S.ex.slice(-5).reverse();
    el.innerHTML = `
      <section class="panel">
        <p class="eyebrow">Examen</p>
        <h2 class="h-display">10 preguntas, como te las haría un cliente</h2>
        <p class="lead">Opción múltiple sobre ingredientes, complementos, vinos y códigos. Lo que falles se agrega a tu repaso de hoy.</p>
        <div class="field">
          <label for="scope">¿De qué parte del menú?</label>
          <select id="scope">${scopes.map(s => `<option value="${s.v}"${s.v === examScope ? " selected" : ""}>${esc(s.t)}</option>`).join("")}</select>
        </div>
        <button class="btn primary big" id="examgo">Empezar examen</button>
        <p class="note" id="examerr" hidden></p>
      </section>
      ${hist.length ? `<section class="panel"><h3>Últimos exámenes</h3><ul class="hist">${hist.map(h => `<li><span>${fmt(h.d)}</span><span>${esc(h.t)}</span><b>${h.s}/${h.n}</b></li>`).join("")}</ul></section>` : ""}`;
  }

  function startExam() {
    const sc = SCOPES().find(s => s.v === examScope) || SCOPES()[2];
    const qs = [], used = new Set();
    for (const c of shuffle(sc.pool())) {
      const base = c.id.replace("~c", "");
      if (used.has(base)) continue;
      const q = makeQ(c);
      if (q) { qs.push(q); used.add(base); }
      if (qs.length === 10) break;
    }
    if (qs.length < 4) {
      const e = $("#examerr"); e.hidden = false;
      e.textContent = "Todavía no hay suficientes tarjetas en esa parte. Elige «Etapas de esta semana» o «Todo el menú».";
      return;
    }
    exam = { qs, i: 0, score: 0, picked: null, misses: [], title: sc.t.replace(/ \(.*\)$/, "") };
    renderQuestion();
  }

  function renderQuestion() {
    const el = $("#v-examen"), x = exam;
    if (x.i >= x.qs.length) {
      S.ex.push({ d: today(), s: x.score, n: x.qs.length, t: x.title });
      S.ex = S.ex.slice(-30);
      save();
      exam = null;
      el.innerHTML = `
        <section class="panel">
          <p class="eyebrow">Resultado</p>
          <h2 class="h-display">${x.score} de ${x.qs.length}</h2>
          <p class="lead">${x.score === x.qs.length ? "Perfecto. Esa parte del menú ya la traes." : x.score >= x.qs.length * 0.8 ? "Muy bien. Revisa las que fallaste abajo." : "Hay que reforzar. Las que fallaste ya están en tu repaso de hoy."}</p>
          ${x.misses.length ? `<ul class="misses">${x.misses.map(m => `<li><p class="mq">${esc(m.q)}${m.sub ? ` <span class="muted">(${esc(m.sub)})</span>` : ""}</p><p class="ma">${esc(m.ans)}</p></li>`).join("")}</ul>` : ""}
          <div class="row"><button class="btn primary" id="examagain">Otra ronda</button><button class="btn" data-go="hoy">Ir a mi sesión de hoy</button></div>
        </section>`;
      return;
    }
    const q = x.qs[x.i], done = x.picked !== null;
    el.innerHTML = `
      <div class="progress" aria-hidden="true"><span style="width:${(x.i / x.qs.length) * 100}%"></span></div>
      <article class="panel quiz">
        <p class="eyebrow">Pregunta ${x.i + 1} de ${x.qs.length} · ${x.score} correctas</p>
        <h2 class="quiz-q">${esc(q.q)}</h2>
        ${q.sub ? `<p class="quiz-sub">${esc(q.sub)}</p>` : ""}
        <div class="opts">${q.opts.map((o, k) => {
          const cls = !done ? "" : o === q.ans ? " right" : k === x.picked ? " wrong" : " dim";
          return `<button class="opt${cls}" data-k="${k}"${done ? " disabled" : ""}><kbd>${k + 1}</kbd><span>${esc(o)}</span></button>`;
        }).join("")}</div>
        ${done ? `<p class="why" aria-live="polite">${esc(q.why)}</p>` : ""}
      </article>
      ${done ? `<div class="actions"><button class="btn primary big" id="nextq"><kbd>Enter</kbd>${x.i + 1 < x.qs.length ? "Siguiente" : "Ver resultado"}</button></div>` : ""}
      <button class="link" id="examquit">Salir del examen</button>`;
    if (done) $("#nextq").focus({ preventScroll: true });
  }

  function choose(k) {
    const x = exam, q = x.qs[x.i];
    if (x.picked !== null) return;
    x.picked = k;
    if (q.opts[k] === q.ans) x.score++;
    else {
      x.misses.push(q);
      const p = S.p[q.card];
      if (p) { p.b = 1; p.due = today(); save(); }
    }
    renderQuestion();
  }

  /* ── Guía ── */
  const STLABEL = { new: "Sin estudiar", learn: "Aprendiendo", ok: "Dominado" };
  function itemState(it) {
    const cs = CARDS.filter(c => c.it === it);
    if (cs.length && cs.every(mastered)) return "ok";
    return cs.some(seen) ? "learn" : "new";
  }
  function itemRow(it) {
    const st = itemState(it);
    const text = norm([it.name, it.alias, ...it.ing || [], ...it.comp || [], it.gar, it.esc, it.origin, it.grape, it.notes, it.note].filter(Boolean).join(" "));
    const body = it.wine
      ? `<p class="ri-ing">${esc(it.origin)} · <b>${esc(it.grape)}</b></p><p class="ri-ing muted">${esc(it.notes)}</p>`
      : it.ing.length ? `<p class="ri-ing">${it.ing.map(esc).join('<span class="sep"> · </span>')}</p>` : "";
    const meta = [];
    if (it.comp) meta.push(`<span class="pill">Sale con: ${esc(it.comp.join(" + "))}</span>`);
    if (it.gar) meta.push(`<span class="pill soft">Garnitura: ${esc(it.gar)}</span>`);
    if (it.esc) meta.push(`<span class="pill soft">Escarcha: ${esc(it.esc)}</span>`);
    if (it.copa) meta.push('<span class="pill soft">También por copa</span>');
    if (it.alias) meta.push(`<span class="pill soft">En la tabla: ${esc(it.alias)}</span>`);
    if (it.note) meta.push(`<span class="pill warn">${esc(it.note)}</span>`);
    return `<div class="row-i" data-text="${esc(text)}"><p class="ri-name"><i class="st st-${st}" title="${STLABEL[st]}"></i><span class="sr">${STLABEL[st]}: </span>${esc(it.name)}</p>${body}${meta.length ? `<p class="ri-meta">${meta.join("")}</p>` : ""}</div>`;
  }
  function guideHTML() {
    const lastSt = {};
    M.items.forEach(it => { lastSt[it.cat] = Math.max(lastSt[it.cat] || 0, it.st); });
    return M.stages.map(s => {
      const items = M.items.filter(it => it.st === s.n);
      let h = `<section class="g-stage" id="e${s.n}"><header class="g-sh"><span class="g-num">Etapa ${s.n}</span><h2>${esc(s.t)}</h2></header>`;
      uniq(items.map(it => it.cat)).forEach(cat => {
        h += `<div class="g-cat"><h3>${esc(cat)}</h3>${items.filter(it => it.cat === cat).map(itemRow).join("")}`;
        if (lastSt[cat] === s.n && M.hints[cat]) h += `<aside class="hint"><p class="hint-t">Patrones para memorizar</p><ul>${M.hints[cat].map(x => `<li>${esc(x)}</li>`).join("")}</ul></aside>`;
        h += "</div>";
      });
      if (s.n === 10) {
        h += `<div class="g-cat"><h3>Códigos de marcaje</h3>${M.codes.map(c => `<div class="row-i code-row" data-text="${esc(norm(c.c + " " + c.m))}"><p class="ri-name"><span class="code">${esc(c.c)}</span>${esc(c.m)}</p></div>`).join("")}
          <p class="note">La Etapa 10 del manual (Secuencia de servicio) está en blanco. Pide ese contenido a tu capacitador y agrégalo a tus notas.</p></div>`;
      }
      const rules = M.rules.filter(r => r.st === s.n);
      if (rules.length) h += `<div class="g-cat"><h3>Reglas</h3>${rules.map(r => `<div class="row-i" data-text="${esc(norm(r.q + " " + r.a))}"><p class="ri-name">${esc(r.q)}</p><p class="ri-ing">${esc(r.a)}</p></div>`).join("")}</div>`;
      return h + "</section>";
    }).join("");
  }
  let guideQuery = "";
  function renderGuia() {
    $("#v-guia").innerHTML = `
      <div class="g-tools">
        <label class="sr" for="gq">Buscar en el menú</label>
        <input id="gq" type="search" placeholder="Busca platillo o ingrediente: atún, pistacho, ranch…" autocomplete="off" value="${esc(guideQuery)}">
        <nav class="g-nav" aria-label="Etapas">${M.stages.map(s => `<button class="chip" data-jump="e${s.n}">E${s.n}</button>`).join("")}</nav>
        <p class="g-count" id="gcount" aria-live="polite"></p>
      </div>
      <div id="glist">${guideHTML()}</div>`;
    if (guideQuery) filterGuide(guideQuery);
  }
  function filterGuide(q) {
    guideQuery = q;
    const n = norm(q.trim());
    let count = 0;
    $$("#glist .row-i").forEach(r => { const show = !n || r.dataset.text.includes(n); r.hidden = !show; if (show && n) count++; });
    $$("#glist .hint, #glist .g-cat > .note").forEach(h => { h.hidden = !!n; });
    $$("#glist .g-cat").forEach(c => { c.hidden = !!n && !c.querySelector(".row-i:not([hidden])"); });
    $$("#glist .g-stage").forEach(s => { s.hidden = !!n && !s.querySelector(".row-i:not([hidden])"); });
    $("#gcount").textContent = n ? `${count} resultado${count === 1 ? "" : "s"} con «${q.trim()}»` : "";
  }

  /* ── Plan ── */
  let confirmReset = false;
  function renderPlan() {
    const t = today(), pc = pace(), left = daysBetween(t, "2026-12-01");
    const nSeen = CARDS.filter(seen).length, nMast = CARDS.filter(mastered).length;
    const weeks = PLAN.map((w, i) => {
      const cs = CARDS.filter(c => w.st.includes(c.st));
      const allSeen = cs.length && cs.every(seen);
      const chip = i === pc.w ? '<span class="chip on">Ahora</span>' : i < pc.w ? (allSeen || !cs.length ? '<span class="chip ok">Completa</span>' : '<span class="chip warn">Pendiente</span>') : '<span class="chip">Próxima</span>';
      const bars = w.st.map(n => {
        const sc = stageCards(n), v = sc.filter(seen).length, m = sc.filter(mastered).length;
        return `<li><span class="b-name">E${n} · ${esc(M.stages[n - 1].t)}</span><span class="bar" role="img" aria-label="${m} de ${sc.length} dominadas"><span class="m-seen" style="width:${(v / sc.length) * 100}%"></span><span class="m-mast" style="width:${(m / sc.length) * 100}%"></span></span><span class="b-num">${m}/${sc.length}</span></li>`;
      }).join("");
      return `<li class="wk${i === pc.w ? " now" : ""}"><div class="wk-h"><b>${esc(w.t)}</b><span class="muted">${fmt(w.from)} – ${fmt(w.to)}</span>${chip}</div><p class="wk-f">${esc(w.focus)}</p>${bars ? `<ul class="bars">${bars}</ul>` : ""}</li>`;
    }).join("");
    const opts = [6, 8, 10, 12, 15, 20].map(n => `<option value="${n}"${n === S.newPer ? " selected" : ""}>${n} nuevas por día</option>`).join("");
    $("#v-plan").innerHTML = `
      <section class="panel">
        <p class="eyebrow">${left > 0 ? `Faltan ${left} días para el 1 de diciembre` : "Ya es diciembre: toca mantener"}</p>
        <h2 class="h-display">Plan de 4 semanas</h2>
        <div class="counts"><div><b>${nMast}</b><span>dominadas</span></div><div><b>${nSeen}</b><span>vistas</span></div><div><b>${CARDS.length}</b><span>en total</span></div></div>
        <ol class="weeks">${weeks}</ol>
      </section>
      <section class="panel">
        <h3>Ritmo</h3>
        <div class="field">
          <label for="newper">Tarjetas nuevas por día</label>
          <select id="newper">${opts}</select>
        </div>
        <p class="note">${pc.pending ? `Para terminar las etapas de ${esc(pc.W.t.toLowerCase())} a tiempo te conviene ver unas <b>${pc.perDay}</b> nuevas por día.` : "Vas al día con las etapas de esta semana."}</p>
      </section>
      <section class="panel howto">
        <h3>Rutina diaria · 15 a 20 minutos</h3>
        <ol>
          <li><b>Hoy:</b> termina tu sesión de tarjetas. Primero los repasos, luego las nuevas.</li>
          <li><b>En voz alta:</b> di la respuesta completa antes de voltear. Recordar cuesta más que leer, y por eso se queda.</li>
          <li><b>Guía:</b> después de la sesión, lee los «Patrones» de la categoría que estás viendo.</li>
          <li><b>En el turno:</b> con cada plato que lleves, recita sus ingredientes y compáralo con lo que ves.</li>
          <li><b>Domingo:</b> examen de 10 preguntas de «Lo que ya estudié».</li>
        </ol>
      </section>
      <section class="panel">
        <h3>Progreso</h3>
        <p class="note" id="sync2">${esc($("#sync").textContent)}</p>
        ${confirmReset
          ? '<p class="warn">Esto borra todas tus tarjetas y exámenes. No se puede deshacer.</p><div class="row"><button class="btn danger" id="resetyes">Sí, borrar todo</button><button class="btn" id="resetno">Cancelar</button></div>'
          : '<button class="btn ghost" id="reset">Borrar mi progreso</button>'}
      </section>`;
  }

  /* ── Navegación ── */
  const VIEWS = ["hoy", "examen", "guia", "plan"];
  let current = "hoy";
  function render(v) {
    if (v === "hoy") renderHoy();
    else if (v === "examen") renderExam();
    else if (v === "guia") renderGuia();
    else renderPlan();
  }
  function go(v) {
    if (!VIEWS.includes(v)) v = "hoy";
    current = v;
    VIEWS.forEach(x => {
      $("#v-" + x).hidden = x !== v;
      $(`[data-tab="${x}"]`).setAttribute("aria-current", x === v ? "page" : "false");
    });
    render(v);
    try { history.replaceState(null, "", "#" + v); } catch (e) { /* vista sin historial */ }
    try { localStorage.setItem(KEY + "-tab", v); } catch (e) { /* sin almacenamiento */ }
    window.scrollTo(0, 0);
  }

  document.addEventListener("click", e => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.tab) return go(b.dataset.tab);
    if (b.dataset.go) return go(b.dataset.go);
    if (b.dataset.g) return grade(+b.dataset.g);
    if (b.dataset.k) return choose(+b.dataset.k);
    if (b.dataset.jump) {
      const smooth = !matchMedia("(prefers-reduced-motion: reduce)").matches;
      return document.getElementById(b.dataset.jump)?.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" });
    }
    switch (b.id) {
      case "start": return startSession();
      case "more": return startSession(5);
      case "reveal": revealed = true; return renderCard();
      case "quit": session = null; return renderHoy();
      case "examgo": return startExam();
      case "examagain": return startExam();
      case "nextq": exam.i++; exam.picked = null; return renderQuestion();
      case "examquit": exam = null; return renderExam();
      case "reset": confirmReset = true; return renderPlan();
      case "resetno": confirmReset = false; return renderPlan();
      case "resetyes": S = fresh(); confirmReset = false; save(); return renderPlan();
    }
  });
  document.addEventListener("change", e => {
    if (e.target.id === "scope") examScope = e.target.value;
    if (e.target.id === "newper") { S.newPer = +e.target.value; save(); renderPlan(); }
  });
  document.addEventListener("input", e => { if (e.target.id === "gq") filterGuide(e.target.value); });
  document.addEventListener("keydown", e => {
    if (e.target.closest("input, select, textarea") || e.metaKey || e.ctrlKey || e.altKey) return;
    if (current === "hoy" && session) {
      if (!revealed && (e.key === " " || e.key === "Enter")) { e.preventDefault(); revealed = true; renderCard(); }
      else if (revealed && ["1", "2", "3"].includes(e.key)) { e.preventDefault(); grade(+e.key - 1); }
    } else if (current === "examen" && exam && exam.i < exam.qs.length) {
      const n = +e.key;
      if (exam.picked === null && n >= 1 && n <= exam.qs[exam.i].opts.length) { e.preventDefault(); choose(n - 1); }
      else if (exam.picked !== null && e.key === "Enter") { e.preventDefault(); exam.i++; exam.picked = null; renderQuestion(); }
    }
  });

  let start = location.hash.slice(1);
  if (!VIEWS.includes(start)) { try { start = localStorage.getItem(KEY + "-tab") || "hoy"; } catch (e) { start = "hoy"; } }
  go(start);
  connect();
  window.__estudio = { CARDS, BY_ID, makeQ }; // para revisar desde la consola
})();
