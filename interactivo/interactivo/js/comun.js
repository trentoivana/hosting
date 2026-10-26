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
