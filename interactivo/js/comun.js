// Utilidades compartidas entre la vista del instructor y la del participante.

export const TIPOS = {
  opcion:  { nombre: "Opción múltiple", icono: "☰" },
  vf:      { nombre: "Verdadero o falso", icono: "✓✗" },
  nube:    { nombre: "Nube de palabras", icono: "☁" },
  abierta: { nombre: "Respuesta abierta", icono: "✎" },
  escala:  { nombre: "Escala 1 a 5", icono: "★" }
};

export const LETRAS = ["A", "B", "C", "D", "E", "F"];

export const $ = (sel, raiz = document) => raiz.querySelector(sel);
export const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

export function esc(t) {
  return String(t ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function idCorto(prefijo = "") {
  return prefijo + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export function codigoSala() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/** Opciones visibles de una pregunta (V/F tiene opciones fijas). */
export function opcionesDe(p) {
  if (p.tipo === "vf") return ["Verdadero", "Falso"];
  if (p.tipo === "escala") return ["1", "2", "3", "4", "5"];
  return p.opciones || [];
}

/** ¿La pregunta tiene respuesta correcta (modo cuestionario)? */
export function esEvaluable(p) {
  return (p.tipo === "opcion" || p.tipo === "vf") && Number.isInteger(p.correcta) && p.correcta >= 0;
}

/** Puntaje estilo competencia: 1000 si no hay tiempo; con tiempo, entre 500 y 1000 según rapidez. */
export function puntaje(p, respuesta, inicio) {
  if (!esEvaluable(p) || respuesta?.v !== p.correcta) return 0;
  if (!p.tiempo) return 1000;
  const fraccion = Math.min(1, Math.max(0, (respuesta.t - inicio) / (p.tiempo * 1000)));
  return Math.round(1000 - 500 * fraccion);
}

export function normalizarPalabra(t) {
  return String(t).trim().toLowerCase().replace(/\s+/g, " ").slice(0, 25);
}

/** Resumen de respuestas: conteo por opción, palabras, textos, promedio. */
export function resumir(p, respuestas) {
  const lista = Object.values(respuestas || {});
  const r = { total: lista.length, conteo: [], palabras: [], textos: [], promedio: null };
  if (p.tipo === "nube") {
    const mapa = new Map();
    for (const x of lista) for (const w of [].concat(x.v || [])) {
      const k = normalizarPalabra(w);
      if (k) mapa.set(k, (mapa.get(k) || 0) + 1);
    }
    r.palabras = [...mapa.entries()].sort((a, b) => b[1] - a[1]);
  } else if (p.tipo === "abierta") {
    r.textos = lista.sort((a, b) => a.t - b.t).map(x => ({ texto: String(x.v), nombre: x.n }));
  } else {
    const ops = opcionesDe(p);
    r.conteo = ops.map(() => 0);
    let suma = 0;
    for (const x of lista) if (Number.isInteger(x.v) && x.v >= 0 && x.v < ops.length) { r.conteo[x.v]++; suma += x.v + 1; }
    if (p.tipo === "escala" && lista.length) r.promedio = suma / lista.length;
  }
  return r;
}

export function mostrarAviso(texto, tipo = "info") {
  let caja = document.getElementById("avisos");
  if (!caja) {
    caja = document.createElement("div");
    caja.id = "avisos";
    caja.setAttribute("role", "status");
    document.body.appendChild(caja);
  }
  const el = document.createElement("div");
  el.className = "aviso aviso-" + tipo;
  el.textContent = texto;
  caja.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

/* ---------- Podio: copa y medallas ---------- */
export function iconoPodio(pos) {
  if (pos === 0) return `
<svg class="icono-podio" viewBox="0 0 64 64" role="img" aria-label="Copa de primer puesto">
  <path d="M19 12h-6a8 8 0 0 0 8 10" fill="none" stroke="#d99a00" stroke-width="4" stroke-linecap="round"/>
  <path d="M45 12h6a8 8 0 0 1-8 10" fill="none" stroke="#d99a00" stroke-width="4" stroke-linecap="round"/>
  <path d="M18 7h28v15c0 8-6.3 14-14 14s-14-6-14-14z" fill="#f5b800"/>
  <path d="M24 11v10" stroke="#fff3b8" stroke-width="3" stroke-linecap="round"/>
  <path d="M32 13.5l2.1 4.3 4.7.7-3.4 3.3.8 4.7-4.2-2.2-4.2 2.2.8-4.7-3.4-3.3 4.7-.7z" fill="#fff3b8"/>
  <rect x="28.5" y="35" width="7" height="8" fill="#d99a00"/>
  <rect x="21" y="42" width="22" height="6" rx="2" fill="#f5b800"/>
  <rect x="17" y="48" width="30" height="9" rx="2" fill="#5c3a14"/>
  <rect x="25" y="51" width="14" height="3" rx="1" fill="#d99a00"/>
</svg>`;
  const [c1, c2, nombre] = pos === 1 ? ["#d6dbe1", "#7f8a96", "plata"] : ["#dc9a5f", "#94541f", "bronce"];
  return `
<svg class="icono-podio" viewBox="0 0 64 64" role="img" aria-label="Medalla de ${nombre}">
  <path d="M18 3h11l7 22H25z" fill="#1b7075"/>
  <path d="M46 3H35l-7 22h11z" fill="#145559"/>
  <circle cx="32" cy="41" r="18" fill="${c1}"/>
  <circle cx="32" cy="41" r="13.5" fill="none" stroke="${c2}" stroke-width="2.5"/>
  <text x="32" y="47.5" text-anchor="middle" font-size="18" font-weight="700" fill="${c2}" font-family="IBM Plex Sans, system-ui, sans-serif">${pos + 1}</text>
</svg>`;
}

/* ---------- Lluvia de papelitos ---------- */
export function lanzarPapelitos(duracion = 7000) {
  const lienzo = document.getElementById("papelitos");
  if (!lienzo || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const ctx = lienzo.getContext("2d");
  const colores = ["#f5b800", "#1b7075", "#2563eb", "#db2777", "#059669", "#d97706", "#9333ea", "#ffffff"];
  const dpr = Math.min(2, devicePixelRatio || 1);
  let ancho, alto;
  const ajustar = () => {
    ancho = innerWidth; alto = innerHeight;
    lienzo.width = ancho * dpr; lienzo.height = alto * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  ajustar();
  addEventListener("resize", ajustar);
  const densidad = Math.max(0.5, Math.min(1.6, ancho / 900));
  const nuevo = () => ({
    x: Math.random() * ancho, y: -20 - Math.random() * alto * 0.3,
    w: 6 + Math.random() * 7, h: 9 + Math.random() * 9,
    vx: (Math.random() - 0.5) * 2.4, vy: 2 + Math.random() * 3,
    giro: Math.random() * Math.PI, vgiro: (Math.random() - 0.5) * 0.25,
    vaiven: Math.random() * Math.PI * 2, color: colores[(Math.random() * colores.length) | 0]
  });
  let piezas = Array.from({ length: Math.round(160 * densidad) }, nuevo);
  const inicio = performance.now();
  lienzo.classList.add("activo");
  function cuadro(t) {
    const transcurrido = t - inicio;
    if (transcurrido < duracion * 0.6 && piezas.length < 420 * densidad) {
      for (let i = 0; i < 4 * densidad; i++) piezas.push(nuevo());
    }
    ctx.clearRect(0, 0, ancho, alto);
    for (const p of piezas) {
      p.vaiven += 0.05;
      p.x += p.vx + Math.sin(p.vaiven) * 0.8;
      p.y += p.vy;
      p.vy = Math.min(p.vy + 0.035, 6);
      p.giro += p.vgiro;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.giro);
      ctx.scale(1, Math.cos(p.vaiven * 1.7));
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    piezas = piezas.filter(p => p.y < alto + 30);
    if (piezas.length && transcurrido < duracion + 4000) requestAnimationFrame(cuadro);
    else { ctx.clearRect(0, 0, ancho, alto); lienzo.classList.remove("activo"); removeEventListener("resize", ajustar); }
  }
  requestAnimationFrame(cuadro);
}
