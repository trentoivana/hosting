// Capa de datos: misma interfaz para Firebase Realtime Database y para el
// modo demostración (un "servidor" simulado en el navegador, compartido entre
// pestañas mediante localStorage y BroadcastChannel).

import { firebaseConfig } from "./config.js";

const FB = "https://www.gstatic.com/firebasejs/10.12.2/";
export const MODO_DEMO = !firebaseConfig.apiKey;
export const MARCA_TIEMPO = { ".sv": "timestamp" };

let api = null;

export async function conectar() {
  if (api) return api;
  api = MODO_DEMO ? crearDemo() : await crearFirebase();
  return api;
}

/* ------------------------------------------------------------------ */
/* Firebase                                                            */
/* ------------------------------------------------------------------ */
async function crearFirebase() {
  const [{ initializeApp }, A, D] = await Promise.all([
    import(FB + "firebase-app.js"),
    import(FB + "firebase-auth.js"),
    import(FB + "firebase-database.js")
  ]);
  const app = initializeApp(firebaseConfig);
  const auth = A.getAuth(app);
  const db = D.getDatabase(app);
  let desfase = 0;
  D.onValue(D.ref(db, ".info/serverTimeOffset"), s => { desfase = s.val() || 0; });

  return {
    uid: () => auth.currentUser?.uid || null,
    usuario: () => auth.currentUser,
    esAnonimo: () => !!auth.currentUser?.isAnonymous,
    alCambiarSesion: cb => A.onAuthStateChanged(auth, cb),
    ingresarAnonimo: () => A.signInAnonymously(auth),
    ingresarGoogle: () => A.signInWithPopup(auth, new A.GoogleAuthProvider()),
    salir: () => A.signOut(auth),
    leer: async ruta => (await D.get(D.ref(db, ruta))).val(),
    escribir: (ruta, valor) => D.set(D.ref(db, ruta), valor),
    actualizar: (rutas) => D.update(D.ref(db), rutas),
    borrar: ruta => D.remove(D.ref(db, ruta)),
    escuchar: (ruta, cb) => D.onValue(D.ref(db, ruta), s => cb(s.val()), e => console.warn(ruta, e.message)),
    ahora: () => Date.now() + desfase
  };
}

/* ------------------------------------------------------------------ */
/* Modo demostración                                                   */
/* ------------------------------------------------------------------ */
function crearDemo() {
  const CLAVE = "capacind-interactivo-demo";
  const canal = "BroadcastChannel" in window ? new BroadcastChannel(CLAVE) : null;
  const oyentes = new Set();
  const oyentesSesion = new Set();

  const cargar = () => { try { return JSON.parse(localStorage.getItem(CLAVE)) || {}; } catch { return {}; } };
  const guardar = arbol => { try { localStorage.setItem(CLAVE, JSON.stringify(arbol)); } catch {} };
  const partes = ruta => ruta.split("/").filter(Boolean);
  const obtener = (arbol, ruta) => partes(ruta).reduce((n, k) => (n == null ? null : n[k] ?? null), arbol);

  function resolverMarcas(v) {
    if (v && typeof v === "object") {
      if (v[".sv"] === "timestamp") return Date.now();
      const r = Array.isArray(v) ? [] : {};
      for (const k in v) r[k] = resolverMarcas(v[k]);
      return r;
    }
    return v;
  }
  function limpiar(n) { // elimina ramas vacías, como Firebase
    if (n && typeof n === "object") {
      for (const k of Object.keys(n)) {
        n[k] = limpiar(n[k]);
        if (n[k] == null) delete n[k];
      }
      return Object.keys(n).length ? n : null;
    }
    return n;
  }
  function poner(arbol, ruta, valor) {
    const p = partes(ruta);
    if (!p.length) return valor ?? {};
    let n = arbol;
    for (let i = 0; i < p.length - 1; i++) {
      if (n[p[i]] == null || typeof n[p[i]] !== "object") n[p[i]] = {};
      n = n[p[i]];
    }
    n[p.at(-1)] = valor;
    return arbol;
  }
  function modificar(fn) {
    let arbol = cargar();
    arbol = limpiar(fn(arbol)) || {};
    guardar(arbol);
    avisar();
    canal?.postMessage("cambio");
  }
  function avisar() {
    const arbol = cargar();
    for (const o of oyentes) {
      const v = obtener(arbol, o.ruta);
      const j = JSON.stringify(v);
      if (j !== o.ultimo) { o.ultimo = j; o.cb(v == null ? null : JSON.parse(j)); }
    }
  }
  if (canal) canal.onmessage = avisar;
  window.addEventListener("storage", e => { if (e.key === CLAVE) avisar(); });

  // Cada pestaña es un usuario distinto (así se simulan varios participantes).
  let usuario = null;
  try { usuario = JSON.parse(sessionStorage.getItem(CLAVE + "-usuario")); } catch {}
  const fijarUsuario = u => {
    usuario = u;
    try { sessionStorage.setItem(CLAVE + "-usuario", JSON.stringify(u)); } catch {}
    oyentesSesion.forEach(cb => cb(u));
  };

  return {
    uid: () => usuario?.uid || null,
    usuario: () => usuario,
    esAnonimo: () => !!usuario?.isAnonymous,
    alCambiarSesion: cb => { oyentesSesion.add(cb); setTimeout(() => cb(usuario)); return () => oyentesSesion.delete(cb); },
    ingresarAnonimo: async () => fijarUsuario({ uid: "p" + Math.random().toString(36).slice(2, 10), isAnonymous: true }),
    ingresarGoogle: async () => {
      modificar(a => poner(a, "admins/instructor-demo", true));
      fijarUsuario({ uid: "instructor-demo", isAnonymous: false, displayName: "Instructora (demostración)" });
    },
    salir: async () => fijarUsuario(null),
    leer: async ruta => obtener(cargar(), ruta),
    escribir: async (ruta, valor) => modificar(a => poner(a, ruta, resolverMarcas(valor))),
    actualizar: async rutas => modificar(a => {
      for (const [r, v] of Object.entries(rutas)) a = poner(a, r, resolverMarcas(v));
      return a;
    }),
    borrar: async ruta => modificar(a => poner(a, ruta, null)),
    escuchar: (ruta, cb) => {
      const o = { ruta, cb, ultimo: undefined };
      oyentes.add(o);
      setTimeout(avisar);
      return () => oyentes.delete(o);
    },
    ahora: () => Date.now()
  };
}
