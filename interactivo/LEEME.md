# Capacind Interactivo

Plataforma de preguntas en tiempo real para las capacitaciones de Capacitación Industrial. Los participantes ingresan desde el celular con un código de 6 números o escaneando un QR, sin registrarse, y responden lo que la instructora proyecta.

- **Vista del participante:** `https://capacind.com.ar/interactivo/`
- **Panel de la instructora:** `https://capacind.com.ar/interactivo/presentador.html`

## Qué incluye

| Tipo de pregunta | Uso sugerido | Puntaje |
|---|---|---|
| Opción múltiple (2 a 6 opciones) | Verificar comprensión de un concepto | Sí, si se marca la correcta |
| Verdadero o falso | Chequeo rápido al cerrar un tema | Sí, si se marca la correcta |
| Nube de palabras | Apertura, lluvia de ideas | No |
| Respuesta abierta | Dudas, conclusiones | No |
| Escala 1 a 5 | Autoevaluación antes y después del tema | No |

Además: bancos de preguntas por curso, temporizador opcional por pregunta, resultados en vivo, ranking con puntaje por rapidez (entre 500 y 1000 puntos por acierto), exportación de resultados a Excel e importación y exportación de bancos en formato JSON.

## Estructura de archivos

```
interactivo/
├── index.html              Vista del participante
├── presentador.html        Panel de la instructora
├── css/                    Estilos
├── js/
│   ├── config.js           Datos de conexión a Firebase (único archivo a editar)
│   ├── datos.js            Conexión con Firebase y modo demostración
│   ├── comun.js            Funciones compartidas
│   ├── presentador.js
│   └── participante.js
├── reglas-firebase.json    Reglas de seguridad de la base de datos
└── ejemplos/
    └── banco-ejemplo-plc.json
```

## Probar sin configurar nada (modo demostración)

Mientras `js/config.js` tenga el campo `apiKey` vacío, la aplicación funciona en modo demostración: los datos quedan guardados solo en el navegador. Sirve para conocer el funcionamiento:

1. Abrí `presentador.html` y presioná **Ingresar con Google** (en este modo no pide cuenta).
2. Importá `ejemplos/banco-ejemplo-plc.json` o creá un banco propio.
3. Presioná **Iniciar actividad en vivo**.
4. Abrí `index.html` en otras pestañas del **mismo navegador** e ingresá con el código. Cada pestaña es un participante distinto.

Nota: al abrir los archivos con doble clic (`file://`) algunos navegadores bloquean los módulos de JavaScript. Para probar en tu computadora conviene un servidor local, por ejemplo `python -m http.server` dentro de la carpeta, y luego abrir `http://localhost:8000/presentador.html`.

## Puesta en marcha con Firebase

Firebase es el servicio de Google que sincroniza las respuestas en tiempo real. El plan gratuito (Spark) alcanza para este uso: admite hasta 100 conexiones simultáneas, es decir, grupos de hasta unas 90 personas por sala.

### Paso 1. Subir la carpeta al sitio

Copiá la carpeta `interactivo` completa en la raíz del repositorio `trentoivana/hosting` (o en la carpeta que Netlify publica, si el sitio tiene un directorio de publicación configurado). Al confirmar los cambios en GitHub, Netlify la publica automáticamente en `capacind.com.ar/interactivo/`.

### Paso 2. Crear el proyecto de Firebase

1. Ingresá en <https://console.firebase.google.com> con tu cuenta de Google.
2. **Crear un proyecto**, por ejemplo `capacind-interactivo`. Google Analytics no es necesario.

### Paso 3. Registrar la aplicación web y crear la base de datos

1. En la página del proyecto, presioná el ícono **Web** (`</>`), asigná un nombre (por ejemplo, `interactivo`) y registrá la app. No hace falta activar Firebase Hosting.
2. En el menú lateral: **Compilación > Realtime Database > Crear base de datos**. Elegí la ubicación `us-central1` y comenzá en **modo bloqueado**.
3. Volvé a **Configuración del proyecto > General > Tus apps** y copiá el objeto `firebaseConfig`. Verificá que incluya `databaseURL`; si no aparece, volvé a copiarlo después de crear la base de datos.
4. Pegá esos valores en `js/config.js`.

### Paso 4. Habilitar los métodos de acceso

En **Compilación > Authentication > Método de acceso**:

1. Habilitá **Anónimo** (lo usan los participantes, no requiere datos).
2. Habilitá **Google** (lo usa la instructora para ingresar al panel).
3. En **Configuración > Dominios autorizados**, agregá `capacind.com.ar` y `www.capacind.com.ar`.

### Paso 5. Publicar las reglas de seguridad

En **Realtime Database > Reglas**, reemplazá el contenido por el de `reglas-firebase.json` y presioná **Publicar**.

Las reglas garantizan que:

- solo las cuentas habilitadas como instructoras puedan crear salas y bancos de preguntas;
- cada participante pueda responder una sola vez por pregunta y solo mientras está abierta;
- el momento de cada respuesta lo fije el servidor, de modo que el puntaje por rapidez no pueda adulterarse;
- la respuesta correcta no se envíe a los celulares hasta que se cierra la pregunta;
- los participantes no puedan leer las respuestas de los demás.

### Paso 6. Habilitar tu cuenta como instructora

1. Abrí `https://capacind.com.ar/interactivo/presentador.html` e ingresá con Google.
2. Aparecerá el mensaje **Cuenta sin habilitar** con tu identificador (UID). Copialo.
3. En **Realtime Database > Datos**, presioná **+** junto a la raíz y creá la clave `admins`. Dentro de ella, agregá una clave con tu UID y el valor `true` (de tipo booleano).
4. Recargá el panel.

Si en el futuro otra persona dicta las capacitaciones, se repite este paso con su UID.

## Uso durante una capacitación

1. **Antes del curso:** prepará un banco por curso o módulo. Marcar una opción correcta convierte la pregunta en evaluable y suma puntaje; sin opción marcada funciona como encuesta.
2. **Al comenzar:** presioná **Iniciar actividad en vivo** y proyectá la pantalla (botón **Pantalla completa**). Se muestran el código y el QR mientras los participantes ingresan.
3. **Después de cada explicación:** elegí la pregunta en la lista desplegable y presioná **Lanzar pregunta**. En las encuestas los resultados se ven en vivo; en las preguntas evaluables se ocultan hasta que presionás **Cerrar respuestas** (o se agota el tiempo).
4. **Ranking:** disponible cuando el banco tiene preguntas evaluables.
5. **Al terminar:** **Exportar resultados (.xlsx)** genera un Excel con una hoja por participante y pregunta, y otra con el resumen de cada pregunta (porcentaje de aciertos, distribución, promedios). Luego presioná **Terminar**.

Si se recarga o se cierra el panel durante la actividad, al volver aparece la opción **Retomar** la sala en curso.

## Mantenimiento

- **Limpieza de datos:** las salas finalizadas quedan guardadas. Cada tanto podés eliminar desde la consola de Firebase los nodos `salas`, `participantes`, `respuestas` y `puntajes` de actividades antiguas (después de exportar lo que necesites). Los bancos de preguntas están en `bancos` y no deben borrarse.
- **Prueba en un mismo navegador:** si abrís el panel y la vista del participante en el mismo navegador con Firebase configurado, ambas comparten la sesión. Para probar como participante usá otro navegador, una ventana de incógnito o el celular.

## Formato de un banco para importar

```json
{
  "titulo": "Nombre del banco",
  "preguntas": [
    { "tipo": "opcion", "texto": "Enunciado", "opciones": ["A", "B", "C"], "correcta": 0, "tiempo": 30 },
    { "tipo": "vf", "texto": "Enunciado", "correcta": 1, "tiempo": 20 },
    { "tipo": "nube", "texto": "Enunciado", "tiempo": 60 },
    { "tipo": "abierta", "texto": "Enunciado" },
    { "tipo": "escala", "texto": "Enunciado", "etiquetas": ["Mínimo", "Máximo"] }
  ]
}
```

`correcta` es la posición de la opción correcta empezando en 0 (en verdadero o falso: 0 es Verdadero y 1 es Falso). `tiempo` admite 0 (sin límite), 10, 20, 30, 45, 60, 90 o 120 segundos.
