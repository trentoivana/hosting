import { conectar, MODO_DEMO, MARCA_TIEMPO } from "./datos.js";
import {
  TIPOS, LETRAS, $, $$, esc, idCorto, codigoSala, opcionesDe, esEvaluable,
  puntaje, resumir, mostrarAviso
} from "./comun.js";

const api = await conectar();
const CLAVE_SALA = "capacind-sala-activa";
const PANTALLAS = ["p-ingreso", "p-sinpermiso", "p-panel", "p-vivo"];

let uid = null;
let bancos = {};
let bancoActual = null;
let desuscribirBancos = null;
let vivo = null;

const mostrar = id => PANTALLAS.forEach(p => { $("#" + p).hidden = p !== id; });
const memoria = {
  leer() { try { return JSON.parse(localStorage.getItem(CLAVE_SALA)); } catch { return null; } },
  guardar(v) { try { v ? localStorage.setItem(CLAVE_SALA, JSON.stringify(v)) : localStorage.removeItem(CLAVE_SALA); } catch {} }
};

if (MODO_DEMO) $("#banda-demo").hidden = false;

/* ================================================================== */
/* Sesión                                                              */
/* ================================================================== */
api.alCambiarSesion(async u => {
  if (desuscribirBancos) { desuscribirBancos(); desuscribirBancos = null; }
  if (!u || u.isAnonymous) { uid = null; mostrar("p-ingreso"); return; }
  uid = u.uid;
  let admin = false;
  try { admin = await api.leer(`admins/${uid}`); } catch {}
  if (!admin) {
    $("#uid-mostrado").textContent = uid;
    mostrar("p-sinpermiso");
    return;
  }
  $("#nombre-usuario").textContent = u.displayName || u.email || "";
  abrirPanel();
});

$("#btn-google").onclick = () => api.ingresarGoogle().catch(e => mostrarAviso("No se pudo ingresar: " + e.message, "error"));
$("#btn-salir").onclick = $("#btn-salir-2").onclick = () => api.salir();
$("#btn-copiar-uid").onclick = () => navigator.clipboard?.writeText(uid).then(() => mostrarAviso("Copiado", "exito"));

/* ================================================================== */
/* Panel: bancos de preguntas                                          */
/* ================================================================== */
function abrirPanel() {
  mostrar("p-panel");
  desuscribirBancos = api.escuchar(`bancos/${uid}`, v => {
    bancos = v || {};
    if (bancoActual && !bancos[bancoActual]) bancoActual = null;
    if (!bancoActual) bancoActual = Object.keys(bancos).sort((a, b) => (bancos[b].actualizado || 0) - (bancos[a].actualizado || 0))[0] || null;
    renderBancos();
    renderEditor();
  });
  revisarSalaPendiente();
}

const preguntasDe = b => (b?.preguntas || []).filter(Boolean);

function renderBancos() {
  const ids = Object.keys(bancos).sort((a, b) => (bancos[a].titulo || "").localeCompare(bancos[b].titulo || "", "es"));
  $("#lista-bancos").innerHTML = ids.length ? ids.map(id => `
    <li><button data-id="${esc(id)}" class="${id === bancoActual ? "activo" : ""}">
      <span>${esc(bancos[id].titulo || "Sin nombre")}</span><small>${preguntasDe(bancos[id]).length}</small>
    </button></li>`).join("") : `<li class="muted" style="padding:.5rem .7rem">Aún no hay bancos.</li>`;
  $$("#lista-bancos button").forEach(b => b.onclick = () => { bancoActual = b.dataset.id; renderBancos(); renderEditor(); });
}

function renderEditor() {
  const b = bancos[bancoActual];
  $("#editor-vacio").hidden = !!b;
  $("#editor-contenido").hidden = !b;
  if (!b) return;
  const titulo = $("#titulo-banco");
  if (document.activeElement !== titulo) titulo.value = b.titulo || "";
  const ps = preguntasDe(b);
  $("#btn-iniciar").disabled = !ps.length;
  $("#lista-preguntas").innerHTML = ps.length ? ps.map((p, i) => `
    <li class="preg-item">
      <div>
        <div class="preg-texto">${esc(p.texto)}</div>
        <div class="preg-meta">
          <span class="etiqueta">${TIPOS[p.tipo]?.icono} ${TIPOS[p.tipo]?.nombre}</span>
          ${esEvaluable(p) ? `<span class="etiqueta etiqueta-quiz">Con puntaje · correcta: ${LETRAS[p.correcta]}</span>` : ""}
          ${p.tiempo ? `<span class="muted">⏱ ${p.tiempo} s</span>` : ""}
          ${p.tipo === "opcion" ? `<span class="muted">${(p.opciones || []).length} opciones</span>` : ""}
        </div>
      </div>
      <div class="preg-acciones">
        <button class="btn btn-texto" data-acc="subir" data-i="${i}" title="Subir" ${i === 0 ? "disabled" : ""}>↑</button>
        <button class="btn btn-texto" data-acc="bajar" data-i="${i}" title="Bajar" ${i === ps.length - 1 ? "disabled" : ""}>↓</button>
        <button class="btn btn-texto" data-acc="editar" data-i="${i}" title="Editar">Editar</button>
        <button class="btn btn-texto btn-peligro" data-acc="borrar" data-i="${i}" title="Eliminar">✕</button>
      </div>
    </li>`).join("") : `<li class="vacio">Este banco todavía no tiene preguntas.</li>`;
  $$("#lista-preguntas [data-acc]").forEach(btn => btn.onclick = () => accionPregunta(btn.dataset.acc, +btn.dataset.i));
}

function guardarBanco(id, banco) {
  return api.escribir(`bancos/${uid}/${id}`, { ...banco, preguntas: preguntasDe(banco), actualizado: MARCA_TIEMPO })
    .catch(e => mostrarAviso("No se pudo guardar: " + e.message, "error"));
}

async function accionPregunta(acc, i) {
  const b = structuredClone(bancos[bancoActual]);
  const ps = preguntasDe(b);
  if (acc === "editar") return abrirDialogo(ps[i], i);
  if (acc === "borrar" && !confirm("¿Eliminar esta pregunta?")) return;
  if (acc === "borrar") ps.splice(i, 1);
  if (acc === "subir") [ps[i - 1], ps[i]] = [ps[i], ps[i - 1]];
  if (acc === "bajar") [ps[i + 1], ps[i]] = [ps[i], ps[i + 1]];
  b.preguntas = ps;
  await guardarBanco(bancoActual, b);
}

$("#btn-nuevo-banco").onclick = async () => {
  const titulo = prompt("Nombre del banco de preguntas (por ejemplo, el nombre del curso o módulo):");
  if (!titulo?.trim()) return;
  const id = idCorto("b");
  bancoActual = id;
  await guardarBanco(id, { titulo: titulo.trim().slice(0, 80), preguntas: [] });
};
$("#titulo-banco").onchange = e => {
  const b = bancos[bancoActual];
  const t = e.target.value.trim();
  if (b && t && t !== b.titulo) guardarBanco(bancoActual, { ...b, titulo: t.slice(0, 80) });
};
$("#btn-borrar-banco").onclick = async () => {
  const b = bancos[bancoActual];
  if (!b || !confirm(`¿Eliminar el banco "${b.titulo}" con sus ${preguntasDe(b).length} preguntas? Esta acción no se puede deshacer.`)) return;
  await api.borrar(`bancos/${uid}/${bancoActual}`);
  bancoActual = null;
};
$("#btn-duplicar-banco").onclick = async () => {
  const b = bancos[bancoActual];
  if (!b) return;
  const id = idCorto("b");
  bancoActual = id;
  await guardarBanco(id, { titulo: (b.titulo + " (copia)").slice(0, 80), preguntas: preguntasDe(b).map(p => ({ ...p, id: idCorto("p") })) });
};
$("#btn-exportar-banco").onclick = () => {
  const b = bancos[bancoActual];
  if (!b) return;
  const datos = JSON.stringify({ formato: "capacind-interactivo", version: 1, titulo: b.titulo, preguntas: preguntasDe(b) }, null, 2);
  descargar(new Blob([datos], { type: "application/json" }), nombreArchivo(b.titulo) + ".json");
};
$("#entrada-importar").onchange = async e => {
  const archivo = e.target.files[0];
  e.target.value = "";
  if (!archivo) return;
  try {
    const d = JSON.parse(await archivo.text());
    const preguntas = (d.preguntas || []).map(sanear).filter(Boolean);
    if (!preguntas.length) throw new Error("el archivo no contiene preguntas válidas");
    const id = idCorto("b");
    bancoActual = id;
    await guardarBanco(id, { titulo: String(d.titulo || archivo.name.replace(/\.json$/i, "")).slice(0, 80), preguntas });
    mostrarAviso(`Banco importado con ${preguntas.length} preguntas`, "exito");
  } catch (err) {
    mostrarAviso("No se pudo importar: " + err.message, "error");
  }
};

/** Normaliza una pregunta importada, descartando campos desconocidos. */
function sanear(p) {
  if (!p || !TIPOS[p.tipo] || !String(p.texto || "").trim()) return null;
  const q = { id: idCorto("p"), tipo: p.tipo, texto: String(p.texto).trim().slice(0, 250), tiempo: [0, 10, 20, 30, 45, 60, 90, 120].includes(+p.tiempo) ? +p.tiempo : 0 };
  if (p.tipo === "opcion") {
    q.opciones = (p.opciones || []).map(o => String(o).trim().slice(0, 120)).filter(Boolean).slice(0, 6);
    if (q.opciones.length < 2) return null;
  }
  if ((p.tipo === "opcion" || p.tipo === "vf") && Number.isInteger(p.correcta) && p.correcta >= 0 && p.correcta < opcionesDe(q).length) q.correcta = p.correcta;
  if (p.tipo === "escala" && Array.isArray(p.etiquetas)) q.etiquetas = p.etiquetas.slice(0, 2).map(x => String(x || "").slice(0, 30));
  return q;
}

/* ================================================================== */
/* Diálogo de pregunta                                                 */
/* ================================================================== */
const dlg = $("#dlg-pregunta");
let edicion = null; // { indice, tipo, opciones, correcta }

$("#tipos").innerHTML = Object.entries(TIPOS).map(([k, t]) =>
  `<button type="button" class="tipo" role="radio" data-tipo="${k}"><span>${t.icono}</span>${t.nombre}</button>`).join("");
$$("#tipos .tipo").forEach(b => b.onclick = () => { edicion.tipo = b.dataset.tipo; renderDialogo(); });

function abrirDialogo(p, indice = null) {
  edicion = {
    indice,
    id: p?.id || idCorto("p"),
    tipo: p?.tipo || "opcion",
    opciones: p?.tipo === "opcion" ? [...p.opciones] : ["", "", "", ""],
    correcta: Number.isInteger(p?.correcta) ? p.correcta : -1
  };
  $("#dlg-titulo").textContent = p ? "Editar pregunta" : "Nueva pregunta";
  $("#p-texto").value = p?.texto || "";
  $("#p-tiempo").value = String(p?.tiempo || 0);
  $("#p-min").value = p?.etiquetas?.[0] || "";
  $("#p-max").value = p?.etiquetas?.[1] || "";
  const vf = p?.tipo === "vf" ? String(edicion.correcta) : "-1";
  $$("input[name=vf]").forEach(r => r.checked = r.value === vf);
  renderDialogo();
  dlg.showModal();
  $("#p-texto").focus();
}

function renderDialogo() {
  $$("#tipos .tipo").forEach(b => b.setAttribute("aria-checked", String(b.dataset.tipo === edicion.tipo)));
  $("#bloque-opciones").hidden = edicion.tipo !== "opcion";
  $("#bloque-vf").hidden = edicion.tipo !== "vf";
  $("#bloque-escala").hidden = edicion.tipo !== "escala";
  if (edicion.tipo !== "opcion") return;
  $("#p-opciones").innerHTML = edicion.opciones.map((o, i) => `
    <div class="p-opcion">
      <input type="radio" name="correcta" value="${i}" ${edicion.correcta === i ? "checked" : ""} title="Marcar como correcta" aria-label="Opción ${LETRAS[i]} correcta">
      <span class="barra-letra" style="background:var(--o${i})">${LETRAS[i]}</span>
      <input class="entrada" data-i="${i}" maxlength="120" value="${esc(o)}" placeholder="Opción ${LETRAS[i]}">
      <button type="button" class="btn btn-texto btn-peligro" data-quitar="${i}" title="Quitar opción" ${edicion.opciones.length <= 2 ? "disabled" : ""}>✕</button>
    </div>`).join("") + `<label class="muted" style="font-size:.88rem"><input type="radio" name="correcta" value="-1" ${edicion.correcta < 0 ? "checked" : ""}> Sin respuesta correcta (encuesta)</label>`;
  $$("#p-opciones input.entrada").forEach(inp => inp.oninput = () => { edicion.opciones[+inp.dataset.i] = inp.value; });
  $$("#p-opciones input[name=correcta]").forEach(r => r.onchange = () => { edicion.correcta = +r.value; });
  $$("#p-opciones [data-quitar]").forEach(b => b.onclick = () => {
    const i = +b.dataset.quitar;
    edicion.opciones.splice(i, 1);
    if (edicion.correcta === i) edicion.correcta = -1; else if (edicion.correcta > i) edicion.correcta--;
    renderDialogo();
  });
  $("#btn-mas-opcion").disabled = edicion.opciones.length >= 6;
}

$("#btn-mas-opcion").onclick = () => { edicion.opciones.push(""); renderDialogo(); $$("#p-opciones input.entrada").at(-1).focus(); };
$("#btn-cancelar").onclick = () => dlg.close();

$("#form-pregunta").onsubmit = async e => {
  e.preventDefault();
  const texto = $("#p-texto").value.trim();
  if (!texto) return mostrarAviso("Escribí el enunciado de la pregunta", "error");
  const p = { id: edicion.id, tipo: edicion.tipo, texto, tiempo: +$("#p-tiempo").value };
  if (p.tipo === "opcion") {
    const pares = edicion.opciones.map((o, i) => [o.trim(), i]).filter(([o]) => o);
    if (pares.length < 2) return mostrarAviso("Ingresá al menos dos opciones", "error");
    p.opciones = pares.map(([o]) => o);
    const nueva = pares.findIndex(([, i]) => i === edicion.correcta);
    if (nueva >= 0) p.correcta = nueva;
  }
  if (p.tipo === "vf") {
    const v = +($("input[name=vf]:checked")?.value ?? -1);
    if (v >= 0) p.correcta = v;
  }
  if (p.tipo === "escala") {
    const et = [$("#p-min").value.trim(), $("#p-max").value.trim()];
    if (et[0] || et[1]) p.etiquetas = et;
  }
  const b = structuredClone(bancos[bancoActual]);
  const ps = preguntasDe(b);
  if (edicion.indice == null) ps.push(p); else ps[edicion.indice] = p;
  b.preguntas = ps;
  dlg.close();
  await guardarBanco(bancoActual, b);
};

$("#btn-agregar").onclick = () => abrirDialogo(null);

/* ================================================================== */
/* Sala en vivo                                                        */
/* ================================================================== */
async function revisarSalaPendiente() {
  const m = memoria.leer();
  $("#caja-retomar").hidden = true;
  if (!m) return;
  const sala = await api.leer(`salas/${m.codigo}`).catch(() => null);
  if (!sala || sala.owner !== uid || sala.estado?.fase === "fin") { memoria.guardar(null); return; }
  $("#retomar-codigo").textContent = `${formatoCodigo(m.codigo)} · ${sala.titulo || ""}`;
  $("#caja-retomar").hidden = false;
  $("#btn-retomar").onclick = () => entrarVivo(m.codigo, m.bancoId);
  $("#btn-descartar").onclick = async () => {
    await api.escribir(`salas/${m.codigo}/estado`, { fase: "fin" }).catch(() => {});
    memoria.guardar(null);
    $("#caja-retomar").hidden = true;
  };
}

$("#btn-iniciar").onclick = async () => {
  const b = bancos[bancoActual];
  if (!preguntasDe(b).length) return;
  let codigo = null;
  for (let i = 0; i < 8 && !codigo; i++) {
    const c = codigoSala();
    if (!(await api.leer(`salas/${c}/owner`).catch(() => "ocupado"))) codigo = c;
  }
  if (!codigo) return mostrarAviso("No se pudo generar un código de sala. Intentá nuevamente.", "error");
  try {
    await api.escribir(`salas/${codigo}`, { owner: uid, titulo: b.titulo || "", creada: MARCA_TIEMPO, estado: { fase: "espera" } });
  } catch (e) {
    return mostrarAviso("No se pudo crear la sala: " + e.message, "error");
  }
  memoria.guardar({ codigo, bancoId: bancoActual });
  entrarVivo(codigo, bancoActual);
};

const formatoCodigo = c => String(c).replace(/^(\d{3})(\d{3})$/, "$1 $2");
const urlIngreso = codigo => new URL("./?sala=" + codigo, location.href).href;
const urlVisible = () => { const u = new URL("./", location.href); return (u.host + u.pathname).replace(/\/$/, ""); };

async function entrarVivo(codigo, bancoId) {
  const banco = bancos[bancoId] || await api.leer(`bancos/${uid}/${bancoId}`);
  if (!banco) { memoria.guardar(null); return mostrarAviso("No se encontró el banco de esta sala", "error"); }
  const sala = await api.leer(`salas/${codigo}`);
  vivo = {
    codigo, bancoId, titulo: sala?.titulo || banco.titulo || "",
    preguntas: preguntasDe(banco),
    estado: { fase: "espera" }, participantes: {}, respuestas: {}, puntajes: {}, historial: {},
    desuscribir: [], desuscribirResp: null, pidEscuchado: null, reloj: null, cerrando: null, clave: null
  };
  mostrar("p-vivo");
  $("#vivo-url").textContent = urlVisible();
  $("#vivo-codigo").textContent = formatoCodigo(codigo);
  const d = vivo.desuscribir;
  d.push(api.escuchar(`participantes/${codigo}`, v => { vivo.participantes = v || {}; actualizarParticipantes(); }));
  d.push(api.escuchar(`puntajes/${codigo}`, v => { vivo.puntajes = v || {}; if (["ranking", "fin"].includes(vivo.estado.fase)) render(true); }));
  d.push(api.escuchar(`salas/${codigo}/historial`, v => { vivo.historial = v || {}; renderSelector(); }));
  d.push(api.escuchar(`salas/${codigo}/estado`, e => { vivo.estado = e || { fase: "espera" }; alCambiarEstado(); }));
}

function salirVivo() {
  if (!vivo) return;
  vivo.desuscribir.forEach(f => f());
  vivo.desuscribirResp?.();
  clearInterval(vivo.reloj);
  vivo = null;
  if (document.fullscreenElement) document.exitFullscreen();
  abrirPanel();
}

function alCambiarEstado() {
  const e = vivo.estado;
  if (e.pid !== vivo.pidEscuchado) {
    vivo.desuscribirResp?.();
    vivo.respuestas = {};
    vivo.pidEscuchado = e.pid || null;
    vivo.desuscribirResp = e.pid
      ? api.escuchar(`respuestas/${vivo.codigo}/${e.pid}`, r => { vivo.respuestas = r || {}; actualizarResultados(); })
      : null;
  }
  clearInterval(vivo.reloj);
  vivo.reloj = e.fase === "pregunta" && e.pregunta?.tiempo && e.inicio ? setInterval(tictac, 200) : null;
  render();
  renderSelector();
  renderControles();
}

function tictac() {
  const e = vivo?.estado;
  if (!e || e.fase !== "pregunta" || !e.pregunta?.tiempo || !e.inicio) return;
  const total = e.pregunta.tiempo * 1000;
  const resta = Math.max(0, e.inicio + total - api.ahora());
  const reloj = $("#reloj");
  if (reloj) {
    reloj.querySelector("span").textContent = Math.ceil(resta / 1000);
    reloj.style.setProperty("--p", (100 * resta / total).toFixed(1) + "%");
    reloj.classList.toggle("urgente", resta <= 5000);
  }
  if (resta <= 0) cerrarPregunta();
}

/* ---------- Escenario ---------- */
function render(forzar = false) {
  const e = vivo.estado;
  const clave = `${e.fase}:${e.pid || ""}`;
  if (clave === vivo.clave && !forzar) return actualizarResultados();
  vivo.clave = clave;
  const esc_ = $("#escenario");

  if (e.fase === "espera") {
    esc_.innerHTML = `
      <div class="lobby">
        <div>
          <h1>${esc(vivo.titulo)}</h1>
          <p class="lobby-paso">Desde el celular, ingresá en <strong>${esc(urlVisible())}</strong> y escribí el código:</p>
          <div class="lobby-codigo">${formatoCodigo(vivo.codigo)}</div>
          <p class="muted">También podés escanear el código QR.</p>
          <div class="chips" id="chips"></div>
        </div>
        <div class="lobby-qr" id="qr-lobby"></div>
      </div>`;
    dibujarQR($("#qr-lobby"), urlIngreso(vivo.codigo), 300);
    actualizarParticipantes();
    return;
  }

  if (e.fase === "ranking" || e.fase === "fin") {
    const filas = Object.values(vivo.puntajes).sort((a, b) => b.total - a.total).slice(0, 10);
    esc_.innerHTML = `
      <div class="ranking">
        <h1>${e.fase === "fin" ? "Resultados finales" : "Ranking parcial"}</h1>
        ${filas.length ? `<ol>${filas.map((f, i) => `
          <li style="animation-delay:${(filas.length - i) * 80}ms"><span class="pos">${i + 1}°</span><span>${esc(f.nombre)}</span><strong>${f.total.toLocaleString("es-AR")}</strong></li>`).join("")}</ol>`
          : `<p class="vacio">Todavía no hay puntajes. El ranking se forma con las preguntas que tienen respuesta correcta.</p>`}
      </div>`;
    return;
  }

  // pregunta o resultados
  const p = vivo.preguntas[e.idx] || e.pregunta;
  const quiz = esEvaluable(p);
  esc_.innerHTML = `
    <div class="preg-vivo">
      <div class="preg-vivo-cab">
        <div>
          <div class="preg-vivo-num">Pregunta ${e.idx + 1} de ${vivo.preguntas.length}
            <span class="etiqueta">${TIPOS[p.tipo].nombre}</span>
            ${quiz ? `<span class="etiqueta etiqueta-quiz">Con puntaje</span>` : ""}
          </div>
          <h1>${esc(p.texto)}</h1>
        </div>
        ${e.fase === "pregunta" && e.pregunta?.tiempo ? `<div class="reloj" id="reloj"><span>${e.pregunta.tiempo}</span></div>` : ""}
      </div>
      <div id="zona-resultados"></div>
      <div class="contador" id="contador"></div>
    </div>`;
  actualizarResultados();
  if (vivo.reloj) tictac();
}

function actualizarResultados() {
  const e = vivo?.estado;
  const zona = $("#zona-resultados");
  if (!zona || !e || !["pregunta", "resultados"].includes(e.fase)) return;
  const p = vivo.preguntas[e.idx] || e.pregunta;
  const r = resumir(p, vivo.respuestas);
  const revelar = e.fase === "resultados";
  const quiz = esEvaluable(p);
  const nPart = Object.keys(vivo.participantes).length;

  if (["opcion", "vf", "escala"].includes(p.tipo)) {
    const ops = opcionesDe(p);
    const max = Math.max(1, ...r.conteo);
    let barras = zona.querySelector(".barras");
    if (!barras || barras.children.length !== ops.length) {
      const etiquetas = p.tipo === "escala" && p.etiquetas ? p.etiquetas : null;
      zona.innerHTML = (p.tipo === "escala" ? `<div class="promedio"><strong id="prom">–</strong><span class="muted">promedio sobre 5</span></div>` : "") +
        `<div class="barras">${ops.map((o, i) => {
          const color = p.tipo === "escala" ? "var(--primario)" : `var(--o${i})`;
          const txt = p.tipo === "escala" ? `${o}${etiquetas && i === 0 && etiquetas[0] ? " · " + esc(etiquetas[0]) : ""}${etiquetas && i === 4 && etiquetas[1] ? " · " + esc(etiquetas[1]) : ""}` : esc(o);
          return `<div class="barra" data-i="${i}">
            <span class="barra-letra" style="background:${color}">${p.tipo === "escala" ? o : LETRAS[i]}</span>
            <div class="barra-cuerpo"><div class="barra-relleno" style="background:${color};width:0"></div><div class="barra-texto">${txt}</div></div>
            <span class="barra-valor"></span>
          </div>`;
        }).join("")}</div>`;
      barras = zona.querySelector(".barras");
    }
    barras.classList.toggle("oculto-quiz", quiz && !revelar);
    [...barras.children].forEach((fila, i) => {
      const n = r.conteo[i] || 0;
      const pct = r.total ? Math.round(100 * n / r.total) : 0;
      fila.querySelector(".barra-relleno").style.width = (100 * n / max) + "%";
      fila.querySelector(".barra-valor").textContent = `${n} · ${pct}%`;
      fila.classList.toggle("correcta", revelar && quiz && i === p.correcta);
      fila.classList.toggle("atenuada", revelar && quiz && i !== p.correcta);
    });
    const prom = $("#prom");
    if (prom) prom.textContent = r.promedio == null ? "–" : r.promedio.toLocaleString("es-AR", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  } else if (p.tipo === "nube") {
    const max = r.palabras[0]?.[1] || 1;
    zona.innerHTML = r.palabras.length
      ? `<div class="nube">${r.palabras.slice(0, 60).map(([w, n], i) =>
          `<span style="font-size:${(1.1 + 3.4 * (n / max)).toFixed(2)}rem;color:var(--o${i % 6})" title="${n}">${esc(w)}</span>`).join("")}</div>`
      : `<div class="vacio">Esperando palabras…</div>`;
  } else if (p.tipo === "abierta") {
    zona.innerHTML = r.textos.length
      ? `<div class="textos">${r.textos.map(t => `<div class="texto-tarjeta">${esc(t.texto)}<small>${esc(t.nombre || "")}</small></div>`).join("")}</div>`
      : `<div class="vacio">Esperando respuestas…</div>`;
  }

  let pie = `<strong>${r.total}</strong> de ${nPart} ${nPart === 1 ? "participante respondió" : "participantes respondieron"}`;
  if (revelar && quiz && r.total) {
    const ok = r.conteo[p.correcta] || 0;
    pie += ` · <strong>${Math.round(100 * ok / r.total)}%</strong> acertó`;
  }
  $("#contador").innerHTML = pie;
}

function actualizarParticipantes() {
  if (!vivo) return;
  const lista = Object.values(vivo.participantes);
  $("#vivo-participantes").textContent = lista.length;
  const chips = $("#chips");
  if (chips) {
    chips.innerHTML = lista.length
      ? lista.sort((a, b) => (a.unido || 0) - (b.unido || 0)).map(x => `<span class="chip">${esc(x.nombre)}</span>`).join("")
      : `<span class="muted">Esperando participantes…</span>`;
  }
  if (vivo.estado.fase === "pregunta" || vivo.estado.fase === "resultados") actualizarResultados();
}

/* ---------- Controles ---------- */
function renderSelector() {
  if (!vivo) return;
  const sel = $("#sel-pregunta");
  const lanzadas = new Set(Object.values(vivo.historial).map(h => h.idx));
  const e = vivo.estado;
  const sugerida = e.idx == null ? 0 : Math.min(vivo.preguntas.length - 1, e.idx + (e.fase === "pregunta" ? 0 : 1));
  const previo = sel.dataset.fase === e.fase + (e.pid || "") ? sel.value : String(sugerida);
  sel.innerHTML = vivo.preguntas.map((p, i) =>
    `<option value="${i}">${lanzadas.has(i) ? "✓ " : ""}${i + 1}. ${esc(p.texto.slice(0, 60))}${p.texto.length > 60 ? "…" : ""}</option>`).join("");
  sel.value = previo;
  sel.dataset.fase = e.fase + (e.pid || "");
  sel.disabled = e.fase === "pregunta";
  sel.onchange = renderControles;
}

function renderControles() {
  if (!vivo) return;
  const e = vivo.estado;
  const sel = $("#sel-pregunta");
  const idx = +sel.value;
  const hayPuntaje = vivo.preguntas.some(esEvaluable);
  const b = [];
  if (e.fase === "pregunta") {
    b.push(`<button class="btn btn-primario" data-c="cerrar">■ Cerrar respuestas</button>`);
  } else if (e.fase === "fin") {
    b.push(`<button class="btn" data-c="espera">Reabrir sala de espera</button>`);
    b.push(`<button class="btn btn-primario" data-c="salir">Volver al panel</button>`);
  } else {
    b.push(`<button class="btn btn-acento" data-c="lanzar">▶ Lanzar pregunta ${idx + 1}</button>`);
    if (e.fase !== "espera") b.push(`<button class="btn" data-c="espera">Sala de espera</button>`);
    if (hayPuntaje && e.fase !== "ranking") b.push(`<button class="btn" data-c="ranking">🏆 Ranking</button>`);
    if (e.fase !== "espera") b.push(`<button class="btn" data-c="fin">Mostrar resultados finales</button>`);
  }
  $("#controles-fase").innerHTML = b.join("");
  $$("#controles-fase [data-c]").forEach(btn => btn.onclick = () => control(btn.dataset.c));
}

async function control(c) {
  const ruta = `salas/${vivo.codigo}/estado`;
  try {
    if (c === "lanzar") await lanzar(+$("#sel-pregunta").value);
    if (c === "cerrar") await cerrarPregunta();
    if (c === "espera") await api.escribir(ruta, { fase: "espera" });
    if (c === "ranking") await api.escribir(ruta, { fase: "ranking" });
    if (c === "fin") await api.escribir(ruta, { fase: "fin" });
    if (c === "salir") { memoria.guardar(null); salirVivo(); }
  } catch (e) {
    mostrarAviso("No se pudo completar la acción: " + e.message, "error");
  }
}

async function lanzar(idx) {
  const p = vivo.preguntas[idx];
  if (!p) return;
  const publica = { tipo: p.tipo, texto: p.texto, tiempo: p.tiempo || 0 };
  if (p.tipo === "opcion") publica.opciones = p.opciones;
  if (p.tipo === "escala" && p.etiquetas) publica.etiquetas = p.etiquetas;
  publica.puntua = esEvaluable(p);
  await api.escribir(`salas/${vivo.codigo}/estado`, {
    fase: "pregunta", idx, total: vivo.preguntas.length, pid: idCorto("q"), pregunta: publica, inicio: MARCA_TIEMPO
  });
}

async function cerrarPregunta() {
  const e = vivo?.estado;
  if (!e || e.fase !== "pregunta" || vivo.cerrando === e.pid) return;
  vivo.cerrando = e.pid;
  clearInterval(vivo.reloj);
  vivo.reloj = null;
  const c = vivo.codigo;
  const p = vivo.preguntas[e.idx];
  const quiz = esEvaluable(p);
  try {
    // 1) Cerrar: a partir de aquí las reglas rechazan nuevas respuestas.
    await api.actualizar({
      [`salas/${c}/estado/fase`]: "resultados",
      [`salas/${c}/estado/correcta`]: quiz ? p.correcta : null
    });
    // 2) Registrar historial y puntajes con las respuestas definitivas.
    const resp = (await api.leer(`respuestas/${c}/${e.pid}`)) || {};
    const rutas = {
      [`salas/${c}/historial/${e.pid}`]: {
        idx: e.idx, orden: e.inicio || Date.now(), tipo: p.tipo, texto: p.texto,
        opciones: ["opcion", "vf", "escala"].includes(p.tipo) ? opcionesDe(p) : null,
        correcta: quiz ? p.correcta : null
      }
    };
    if (quiz) {
      for (const [u, r] of Object.entries(resp)) {
        const pts = puntaje(p, r, e.inicio);
        const prev = vivo.puntajes[u] || { total: 0, aciertos: 0 };
        rutas[`puntajes/${c}/${u}`] = {
          nombre: vivo.participantes[u]?.nombre || r.n || "Participante",
          total: (prev.total || 0) + pts, aciertos: (prev.aciertos || 0) + (pts > 0 ? 1 : 0),
          ultima: pts, pid: e.pid
        };
      }
    }
    await api.actualizar(rutas);
  } catch (err) {
    vivo.cerrando = null;
    mostrarAviso("No se pudo cerrar la pregunta: " + err.message, "error");
  }
}

$("#btn-terminar").onclick = async () => {
  if (!confirm("¿Terminar la actividad? Los participantes verán los resultados finales y la sala se cerrará.")) return;
  await api.escribir(`salas/${vivo.codigo}/estado`, { fase: "fin" }).catch(() => {});
  memoria.guardar(null);
  salirVivo();
};
$("#btn-pantalla").onclick = () => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.();
$("#btn-qr-chico").onclick = () => {
  dibujarQR($("#qr-grande"), urlIngreso(vivo.codigo), 380);
  $("#qr-codigo").textContent = formatoCodigo(vivo.codigo);
  $("#dlg-qr").showModal();
};
$("#btn-exportar-res").onclick = exportarResultados;

function dibujarQR(el, texto, tam) {
  el.innerHTML = "";
  if (!window.QRCode) { el.textContent = texto; return; }
  new QRCode(el, { text: texto, width: tam, height: tam, correctLevel: QRCode.CorrectLevel.M });
}

/* ---------- Exportación a Excel ---------- */
async function exportarResultados() {
  if (!window.XLSX) return mostrarAviso("La biblioteca de Excel no terminó de cargar. Intentá en unos segundos.", "error");
  const c = vivo.codigo;
  const [hist, resp, parts, punt] = await Promise.all([
    api.leer(`salas/${c}/historial`), api.leer(`respuestas/${c}`), api.leer(`participantes/${c}`), api.leer(`puntajes/${c}`)
  ]);
  const preguntas = Object.entries(hist || {}).sort((a, b) => a[1].orden - b[1].orden);
  // Rótulo de columna con el número de la pregunta en el banco (si se repitió, se agrega una letra).
  const usados = {};
  const rotulo = {};
  for (const [pid, h] of preguntas) {
    const base = `P${h.idx + 1}`;
    usados[base] = (usados[base] || 0) + 1;
    rotulo[pid] = usados[base] > 1 ? `${base}${"abcdefghij"[usados[base] - 2]}` : base;
  }
  if (!preguntas.length) return mostrarAviso("Todavía no hay preguntas cerradas para exportar", "error");
  const uids = new Set([...Object.keys(parts || {}), ...Object.values(resp || {}).flatMap(o => Object.keys(o || {}))]);
  const textoResp = (h, r) => {
    if (!r) return "";
    if (h.tipo === "nube") return [].concat(r.v).join(", ");
    if (h.tipo === "abierta") return String(r.v);
    if (h.tipo === "escala") return r.v + 1;
    return h.opciones?.[r.v] ?? "";
  };

  const filas = [...uids].map(u => {
    const fila = {
      Participante: parts?.[u]?.nombre || "Participante",
      Puntaje: punt?.[u]?.total || 0,
      Aciertos: punt?.[u]?.aciertos || 0
    };
    preguntas.forEach(([pid, h]) => {
      const r = resp?.[pid]?.[u];
      let t = textoResp(h, r);
      if (r && Number.isInteger(h.correcta)) t = `${t} (${r.v === h.correcta ? "correcta" : "incorrecta"})`;
      fila[rotulo[pid]] = t;
    });
    return fila;
  }).sort((a, b) => b.Puntaje - a.Puntaje);

  const resumen = preguntas.map(([pid, h]) => {
    const lista = Object.values(resp?.[pid] || {});
    const fila = { "N°": rotulo[pid], Pregunta: h.texto, Tipo: TIPOS[h.tipo]?.nombre, Respuestas: lista.length };
    if (Number.isInteger(h.correcta)) {
      fila["Respuesta correcta"] = h.opciones?.[h.correcta];
      fila["% de aciertos"] = lista.length ? Math.round(100 * lista.filter(r => r.v === h.correcta).length / lista.length) : 0;
    }
    if (h.tipo === "escala" && lista.length) fila.Promedio = +(lista.reduce((s, r) => s + r.v + 1, 0) / lista.length).toFixed(2);
    if (h.opciones && h.tipo !== "escala") fila["Distribución"] = h.opciones.map((o, j) => `${o}: ${lista.filter(r => r.v === j).length}`).join(" | ");
    return fila;
  });

  const wb = XLSX.utils.book_new();
  const h1 = XLSX.utils.json_to_sheet(filas);
  h1["!cols"] = [{ wch: 26 }, { wch: 10 }, { wch: 10 }, ...preguntas.map(() => ({ wch: 28 }))];
  XLSX.utils.book_append_sheet(wb, h1, "Participantes");
  const h2 = XLSX.utils.json_to_sheet(resumen);
  h2["!cols"] = [{ wch: 6 }, { wch: 60 }, { wch: 18 }, { wch: 12 }, { wch: 28 }, { wch: 14 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, h2, "Preguntas");
  const fecha = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `${nombreArchivo(vivo.titulo)}-${fecha}.xlsx`);
}

/* ---------- Utilidades ---------- */
function nombreArchivo(t) {
  return (String(t || "capacind").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w-]+/g, "-").replace(/^-|-$/g, "") || "capacind").slice(0, 60);
}
function descargar(blob, nombre) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
