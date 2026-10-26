import { conectar, MODO_DEMO, MARCA_TIEMPO } from "./datos.js";
import { LETRAS, $, $$, esc, opcionesDe, mostrarAviso } from "./comun.js";

const api = await conectar();
const CLAVE = "capacind-participante";
const VISTAS = ["v-ingreso", "v-espera", "v-pregunta", "v-resultado", "v-mensaje"];

let sesion = null;          // { codigo, nombre }
let estado = null;
let miRespuesta = null;
let puntajes = {};
let desuscribir = [];
let desuscribirResp = null;
let pidEscuchado = null;
let pidDibujado = null;
let reloj = null;
let seleccion = null;
let enviando = false;

const mostrar = id => VISTAS.forEach(v => { $("#" + v).hidden = v !== id; });
// En modo demostración cada pestaña es un participante distinto, por eso se recuerda por pestaña.
const almacen = () => (MODO_DEMO ? sessionStorage : localStorage);
const memoria = {
  leer() { try { return JSON.parse(almacen().getItem(CLAVE)); } catch { return null; } },
  guardar(v) { try { v ? almacen().setItem(CLAVE, JSON.stringify(v)) : almacen().removeItem(CLAVE); } catch {} }
};
const soloDigitos = t => String(t || "").replace(/\D/g, "").slice(0, 6);

if (MODO_DEMO) $("#banda-demo").hidden = false;

// La sesión anónima tarda un instante en restaurarse al cargar la página.
const sesionLista = new Promise(res => { const fin = api.alCambiarSesion(u => { res(u); }); });

async function asegurarUsuario() {
  await sesionLista;
  // En modo demostración cada pestaña de participante debe ser un usuario anónimo propio.
  if (!api.uid() || (MODO_DEMO && !api.esAnonimo())) await api.ingresarAnonimo();
  return api.uid();
}

/* ---------- Inicio ---------- */
const params = new URLSearchParams(location.search);
const codigoUrl = soloDigitos(params.get("sala"));
const guardada = memoria.leer();
if (guardada?.nombre) $("#in-nombre").value = guardada.nombre;
if (codigoUrl) $("#in-codigo").value = codigoUrl.replace(/^(\d{3})(\d{3})$/, "$1 $2");

if (guardada?.codigo && (!codigoUrl || codigoUrl === guardada.codigo)) {
  ingresar(guardada.codigo, guardada.nombre, true);
} else {
  mostrar("v-ingreso");
  (codigoUrl ? $("#in-nombre") : $("#in-codigo")).focus();
}

$("#in-codigo").oninput = e => {
  const d = soloDigitos(e.target.value);
  e.target.value = d.length > 3 ? d.slice(0, 3) + " " + d.slice(3) : d;
};

$("#form-ingreso").onsubmit = e => {
  e.preventDefault();
  const codigo = soloDigitos($("#in-codigo").value);
  const nombre = $("#in-nombre").value.trim().replace(/\s+/g, " ").slice(0, 30);
  if (codigo.length !== 6) return mostrarAviso("El código tiene 6 números", "error");
  if (!nombre) return mostrarAviso("Escribí tu nombre", "error");
  ingresar(codigo, nombre);
};

$("#btn-otra-sala").onclick = () => {
  salir();
  memoria.guardar(sesion ? { nombre: sesion.nombre } : null);
  history.replaceState(null, "", location.pathname);
  $("#in-codigo").value = "";
  mostrar("v-ingreso");
  $("#in-codigo").focus();
};

async function ingresar(codigo, nombre, automatico = false) {
  const btn = $("#btn-ingresar");
  btn.disabled = true;
  try {
    const uid = await asegurarUsuario();
    const est = await api.leer(`salas/${codigo}/estado`);
    if (!est) {
      memoria.guardar({ nombre });
      if (automatico) { mostrar("v-ingreso"); return; }
      return mostrarAviso("No existe una sala con ese código. Revisalo en la pantalla.", "error");
    }
    if (est.fase === "fin" && !automatico) {
      return mensaje("La actividad finalizó", "Esta sala ya no recibe participantes.");
    }
    await api.escribir(`participantes/${codigo}/${uid}`, { nombre, unido: MARCA_TIEMPO });
    sesion = { codigo, nombre };
    memoria.guardar(sesion);
    $("#cab-nombre").textContent = nombre;
    suscribir();
  } catch (e) {
    mostrar("v-ingreso");
    mostrarAviso("No se pudo ingresar: " + e.message, "error");
  } finally {
    btn.disabled = false;
  }
}

function suscribir() {
  salir();
  const c = sesion.codigo;
  desuscribir.push(api.escuchar(`puntajes/${c}`, v => { puntajes = v || {}; if (estado && estado.fase !== "pregunta") render(); }));
  desuscribir.push(api.escuchar(`salas/${c}/estado`, e => { estado = e || { fase: "fin" }; alCambiarEstado(); }));
}

function salir() {
  desuscribir.forEach(f => f());
  desuscribir = [];
  desuscribirResp?.();
  desuscribirResp = null;
  pidEscuchado = pidDibujado = null;
  clearInterval(reloj);
}

function alCambiarEstado() {
  if (estado.pid !== pidEscuchado) {
    desuscribirResp?.();
    miRespuesta = null;
    pidEscuchado = estado.pid || null;
    desuscribirResp = estado.pid
      ? api.escuchar(`respuestas/${sesion.codigo}/${estado.pid}/${api.uid()}`, r => { miRespuesta = r; render(); })
      : null;
  }
  render();
}

/* ---------- Vistas ---------- */
function mensaje(titulo, texto) {
  $("#msg-titulo").textContent = titulo;
  $("#msg-texto").textContent = texto;
  mostrar("v-mensaje");
}

function resultado(icono, clase, titulo, texto, puntos) {
  const i = $("#res-icono");
  i.textContent = icono;
  i.className = "icono-grande " + clase;
  $("#res-titulo").textContent = titulo;
  $("#res-texto").textContent = texto || "";
  $("#res-puntos").hidden = !puntos;
  $("#res-puntos").innerHTML = puntos || "";
  mostrar("v-resultado");
}

function render() {
  if (!estado || !sesion) return;
  const e = estado;
  if (e.fase !== "pregunta") { clearInterval(reloj); pidDibujado = null; }

  if (e.fase === "espera") {
    $("#espera-titulo").textContent = `¡Ya estás dentro, ${sesion.nombre.split(" ")[0]}!`;
    $("#espera-texto").textContent = "Mirá la pantalla. La próxima pregunta aparecerá aquí automáticamente.";
    return mostrar("v-espera");
  }

  if (e.fase === "pregunta") {
    if (miRespuesta) {
      clearInterval(reloj);
      pidDibujado = null;
      return resultado("✓", "info", "Respuesta registrada", "Esperá a que se cierren las respuestas para ver el resultado.");
    }
    if (pidDibujado !== e.pid) dibujarPregunta();
    return mostrar("v-pregunta");
  }

  if (e.fase === "resultados") {
    const p = e.pregunta || {};
    if (!p.puntua) {
      return resultado("👀", "info", "Respuestas cerradas", miRespuesta ? "Gracias por responder. Mirá la pantalla para ver los resultados del grupo." : "No llegaste a responder esta vez. Mirá los resultados en la pantalla.");
    }
    const mio = puntajes[api.uid()];
    const pts = mio && mio.pid === e.pid ? mio.ultima : null;
    const total = mio ? `<span class="muted">Total acumulado</span><strong>${(mio.total || 0).toLocaleString("es-AR")}</strong>` : "";
    if (!miRespuesta) return resultado("–", "", "Sin respuesta", "No se registró tu respuesta a tiempo.", total);
    const correcta = opcionesDe(p)[e.correcta];
    if (miRespuesta.v === e.correcta) {
      return resultado("✓", "ok", "¡Correcto!", pts != null ? `Sumaste ${pts.toLocaleString("es-AR")} puntos.` : "Calculando puntaje…", total);
    }
    return resultado("✗", "mal", "Incorrecto", correcta ? `La respuesta correcta era: ${correcta}` : "", total);
  }

  if (e.fase === "ranking" || e.fase === "fin") {
    const lista = Object.entries(puntajes).sort((a, b) => b[1].total - a[1].total);
    const pos = lista.findIndex(([u]) => u === api.uid());
    const titulo = e.fase === "fin" ? "¡Actividad finalizada!" : "Ranking parcial";
    if (pos < 0) {
      return resultado(e.fase === "fin" ? "★" : "🏆", "trofeo", titulo, e.fase === "fin" ? "Gracias por participar." : "Mirá el ranking en la pantalla.");
    }
    const mio = lista[pos][1];
    return resultado(pos === 0 ? "🏆" : "★", "trofeo", titulo,
      `Estás en el puesto ${pos + 1} de ${lista.length}.${e.fase === "fin" ? " Gracias por participar." : ""}`,
      `<span class="muted">Tu puntaje</span><strong>${(mio.total || 0).toLocaleString("es-AR")}</strong>`);
  }
}

function dibujarPregunta() {
  const e = estado;
  const p = e.pregunta;
  pidDibujado = e.pid;
  seleccion = null;
  enviando = false;
  $("#preg-num").textContent = `Pregunta ${e.idx + 1} de ${e.total}`;
  $("#preg-texto").textContent = p.texto;
  const cuerpo = $("#preg-cuerpo");
  const enviar = $("#btn-enviar");
  enviar.disabled = true;
  enviar.textContent = "Enviar respuesta";

  if (p.tipo === "opcion" || p.tipo === "vf" || p.tipo === "escala") {
    const ops = opcionesDe(p);
    const clase = p.tipo === "vf" ? "opciones vf" : p.tipo === "escala" ? "escala" : "opciones";
    cuerpo.innerHTML = `<div class="${clase}">${ops.map((o, i) => p.tipo === "opcion"
      ? `<button type="button" class="opcion" data-i="${i}" aria-pressed="false"><span class="barra-letra" style="background:var(--o${i})">${LETRAS[i]}</span><span>${esc(o)}</span></button>`
      : `<button type="button" class="opcion" data-i="${i}" aria-pressed="false">${esc(o)}</button>`).join("")}</div>` +
      (p.tipo === "escala" && p.etiquetas ? `<div class="escala-etq"><span>${esc(p.etiquetas[0] || "")}</span><span>${esc(p.etiquetas[1] || "")}</span></div>` : "");
    $$(".opcion", cuerpo).forEach(b => b.onclick = () => {
      seleccion = +b.dataset.i;
      $$(".opcion", cuerpo).forEach(x => x.setAttribute("aria-pressed", String(x === b)));
      enviar.disabled = false;
    });
  } else if (p.tipo === "nube") {
    cuerpo.innerHTML = `<div class="palabras">${[0, 1, 2].map(i =>
      `<input class="entrada" maxlength="25" placeholder="${i === 0 ? "Escribí una palabra o frase corta" : "Otra (opcional)"}" aria-label="Palabra ${i + 1}">`).join("")}</div>`;
    $$("input", cuerpo).forEach(inp => inp.oninput = () => { enviar.disabled = !valorNube().length; });
    $("input", cuerpo).focus();
  } else if (p.tipo === "abierta") {
    cuerpo.innerHTML = `<textarea class="entrada" maxlength="200" rows="4" placeholder="Escribí tu respuesta"></textarea><div class="contador-car">0 / 200</div>`;
    const ta = $("textarea", cuerpo);
    ta.oninput = () => { enviar.disabled = !ta.value.trim(); $(".contador-car", cuerpo).textContent = `${ta.value.length} / 200`; };
    ta.focus();
  }

  clearInterval(reloj);
  const r = $("#preg-reloj");
  r.hidden = !p.tiempo;
  if (p.tiempo && e.inicio) {
    const tic = () => {
      const resta = Math.max(0, e.inicio + p.tiempo * 1000 - api.ahora());
      r.textContent = `⏱ ${Math.ceil(resta / 1000)} s`;
      r.classList.toggle("urgente", resta <= 5000);
      if (resta <= 0) {
        clearInterval(reloj);
        $$("#preg-cuerpo button, #preg-cuerpo input, #preg-cuerpo textarea").forEach(x => x.disabled = true);
        enviar.disabled = true;
        enviar.textContent = "Tiempo agotado";
      }
    };
    tic();
    reloj = setInterval(tic, 250);
  }
}

const valorNube = () => $$("#preg-cuerpo input").map(i => i.value.trim().slice(0, 25)).filter(Boolean);

$("#btn-enviar").onclick = async () => {
  if (enviando || !estado || estado.fase !== "pregunta") return;
  const p = estado.pregunta;
  let v;
  if (p.tipo === "nube") v = valorNube();
  else if (p.tipo === "abierta") v = $("#preg-cuerpo textarea").value.trim().slice(0, 200);
  else v = seleccion;
  if (v == null || (Array.isArray(v) && !v.length) || v === "") return;
  enviando = true;
  $("#btn-enviar").disabled = true;
  try {
    await api.escribir(`respuestas/${sesion.codigo}/${estado.pid}/${api.uid()}`, { v, t: MARCA_TIEMPO, n: sesion.nombre });
  } catch (err) {
    enviando = false;
    $("#btn-enviar").disabled = false;
    mostrarAviso(/permission/i.test(err.message) ? "Las respuestas ya se cerraron o ya habías respondido." : "No se pudo enviar: " + err.message, "error");
  }
};
