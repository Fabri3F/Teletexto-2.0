---
inclusion: always
---

# Tecnología: Teletexto 2.0

Todas las decisiones de este documento provienen de `.kiro/specs/teletexto-2-0/design.md`. **No se agregan tecnologías, bibliotecas ni servicios que no estén aquí.** Si hace falta algo nuevo, se propone un cambio al diseño y se espera la aprobación del equipo.

## Stack aprobado

| Área | Decisión |
|---|---|
| Lenguaje | TypeScript en todo el código |
| Cliente | PWA con Preact + Vite |
| Estilo | CSS propio y fuente monoespaciada del sistema. Sin frameworks CSS ni fuentes web |
| Contenido | Archivos JSON estáticos generados en build (`/p/NNN.json`, `/d/alertas.json`, `/manifest.json`) y servidos por CDN |
| Mapa (Página 400) | SVG en línea renderizado por Preact a partir de `/geo/departamentos.json` (rutas SVG pre-simplificadas, 80 KB comprimidos o menos). Sin Leaflet, MapLibre ni teselas de red |
| Preparación de la geometría | Herramienta de build de una sola vez, `tools/geo`, con mapshaper 0.8.5 (CLI, licencia MPL-2.0; `-explode` y Douglas-Peucker) y un script propio. El resultado se versiona en el repositorio |
| Indicador de datos | Módulo propio de menos de 2 KB que usa Resource Timing en la página y mensajes (`postMessage`) del service worker. Sin bibliotecas |
| Hosting y CDN | Cloudflare Pages (HTTPS automático, `_headers`, ETag y 304) |
| Ingesta | CLI de Node (`tools/ingest`) que ejecuta Parser, Resumidor y Verificador y escribe en `dist/` |
| Validación de esquema | Ajv con JSON Schema |
| IA | LLM por API (por ejemplo Claude Haiku o Gemini Flash), invocado solo desde el CLI de ingesta |
| Verificador | Determinista (expresiones regulares y léxicos), sin LLM |
| Modo sin conexión | Service worker escrito a mano con Cache Storage. Metadatos de sincronización en IndexedDB. Sin Workbox |
| Escritura de contenido | Un único Worker de Cloudflare `/admin/reload`, con token JWT firmado |
| Rate limit | Cloudflare WAF Rate Limiting: 60 solicitudes por 60 s por IP, respuesta 429 con `Retry-After` |
| CI | GitHub Actions (ingesta, pruebas, verificación de tamaños, gitleaks) |
| Pruebas | Vitest + fast-check (propiedades), Playwright + axe-core (extremo a extremo y accesibilidad), Lighthouse CI (rendimiento y PWA), k6 (carga) |

## Arquitectura

- Los datos viajan en una sola dirección: `data/*.json` → Parser (Ajv) → conectores (con mapeo de niveles) → orquestador de resúmenes → Pretty_Printer → `dist/p/NNN.json`, `dist/d/alertas.json` y `manifest.json` → CDN → service worker → Cliente_Web.
- **Fuente única de alertas:** las Páginas 101 y 400 leen el mismo `/d/alertas.json` y calculan sus vistas con la misma función `alertasVigentes(dataset, ahora)`. No se duplican alertas dentro de los archivos de página.
- La geometría del mapa (`/geo/departamentos.json`) es un archivo estático aparte, fuera de la carga inicial, que se descarga al abrir la Página 400 o al sincronizar.
- El Servicio_Contenido **no tiene servidor propio**. Toda respuesta es un archivo estático, sin estado y sin cómputo por solicitud.
- El Cliente_Web solo consume `/p/NNN.json`, `/d/alertas.json`, `/geo/departamentos.json` y `/manifest.json` del mismo origen. **No llama nunca al Resumidor_IA ni a ninguna API de IA.**
- Los resúmenes se generan una vez, al publicar o actualizar un aviso, nunca en la consulta del usuario.
- Los componentes (Cliente_Web, Servicio_Contenido, Resumidor_IA) se comunican solo por interfaces definidas, para poder reemplazarlos por separado.
- El Worker `/admin/reload` es el único punto de escritura. Solo dispara el workflow de ingesta en CI.

## Reglas de ingesta y de datos

1. **Un archivo por página** (`p/NNN.json`), con sus metadatos dentro. Así el almacenamiento de página y metadatos es atómico y permite ETag y 304 con cuerpo vacío.
2. **Reemplazo atómico**: se escribe en `dist.tmp/` y se renombra a `dist/` solo si todo tuvo éxito. Si falla, `dist/` anterior queda intacto.
3. **Carga de todo o nada**: un archivo vacío, de más de 1 MB, que no sea JSON o que incumpla el esquema se rechaza completo, con archivo, campo y regla, y el contenido anterior no cambia.
4. **Fechas**: UTC ISO 8601 en datos y servidor. La conversión a hora de Lima (UTC-5, formato `DD/MM/AAAA HH:mm`) ocurre solo en el cliente.
5. **Dinero**: los precios se guardan como **céntimos enteros** (`precioCentimos`, `null` = "Sin dato") y se formatean como `S/ 2.50`. Nunca se usa coma flotante para dinero.
6. **Páginas**: número entero de 100 a 999, sin duplicados. Agregar una página se hace con datos y configuración, sin tocar el código de navegación.
7. **`esDatoDePrueba`** es un booleano obligatorio en la página y en cada registro. Ausente o inválido se trata como `true`.
8. **Conectores**: cada fuente se lee detrás de la interfaz `ConectorFuente` (tiempo límite de 10 s). El MVP usa `ConectorPrueba` con `data/prueba/*.json`. Sustituirlo por un conector real no debe cambiar el Cliente_Web. Si un conector falla, se registra la fuente y se conserva el último contenido válido.
9. **Hash del aviso**: `hashFuente` es SHA-256 del texto original normalizado. Si el hash no cambió, no se vuelve a invocar a la IA.
10. **Registro de verificación**: `logs/verificacion.jsonl` guarda `{avisoId, estado, motivo?, verificadoEn}`. Los estados `rechazado` y `no_verificado` no se publican en el JSON público.
11. **Presupuesto de tamaño**: carga inicial de 150 KB o menos (comprimida, incluye la pantalla de carga y el indicador de datos), cada `p/NNN.json` y `/d/alertas.json` de 20 KB o menos, geometría del mapa de 80 KB (81 920 bytes) o menos, con objetivo operativo de 76 800 bytes (presupuesto aparte), imágenes de 10 KB o menos (solo iconos SVG en línea). La pantalla de carga pesa 5 KB o menos y el indicador de datos 2 KB o menos.
12. **Alertas de riesgo**: cada alerta lleva departamentos (los 25 códigos válidos), nivel normalizado (Bajo, Moderado, Alto, Muy alto), tipo de riesgo, vigencia (inicio y fin), fecha de actualización, fuente (SENAMHI o INDECI) y referencia verificable. La conversión de las escalas oficiales a los 4 niveles se hace solo en los conectores. **No existe ningún nivel por defecto**: una alerta sin departamento, nivel o fechas válidos hace que se rechace el archivo.
13. **Riesgo por departamento**: función pura `riesgoPorDepartamento(alertas, ahora)` con reloj inyectado. El nivel es el más alto entre las alertas vigentes. Las alertas vencidas se excluyen, también desde la caché. Sin alertas vigentes, el resultado es "sin información" (estilo neutro y texto exacto "Sin información disponible").

## Reglas de IA y verificación (obligatorias)

- Un resumen se publica solo si tiene de 1 a 60 palabras **y** el Verificador devolvió `aprobado`.
- Los Datos_Críticos del resumen (cifras, fechas, horas, lugares, niveles de alerta) deben ser un subconjunto exacto de los del aviso. Cada recomendación del aviso (`recomendaciones[].clave` con sus `frases`) debe aparecer en el resumen.
- Ante la duda, el Verificador rechaza. El respaldo siempre es el texto original.
- Política del orquestador: un intento inicial más 2 reintentos, con límite de 30 s por intento para la IA y 5 s para el Verificador. Si ningún intento es válido, se publica el aviso sin resumen y se registra el fallo.
- Si el texto del aviso cambió y no hay resumen nuevo válido, no se conserva el resumen anterior. Un resumen solo reemplaza al anterior cuando está generado y aprobado.
- Los avisos de prueba se redactan con 1 a 3 recomendaciones para que quepan en 60 palabras.
- Las etiquetas de interfaz son "Resumen generado con IA" y "Se muestra el aviso original".

## Reglas del cliente y del service worker

- Búsqueda de página: tres dígitos, búfer de 3 como máximo, cancelación o 5 s sin dígito vacía el búfer. Una página inexistente muestra "Página no encontrada" y conserva la página anterior.
- Reintentos de red: esperas de 1, 2 y 4 s (máximo 4 intentos). Luego se usa la versión de la Caché_Local con aviso de posible desactualización, o un error con reintento manual.
- Service worker: precaché de la app base. Sincroniza 100, 101, 200 y 400 más `/d/alertas.json` y la geometría del mapa, con límite de 10 s, hasta 3 reintentos con 30 s o más entre ellos. En fallo **no toca** la versión anterior ni `syncedAt`. Estrategia cache-first con actualización en segundo plano que **no cambia lo que se está mostrando**.
- Las Páginas 101 y 400 se sincronizan como una unidad con `/d/alertas.json`. Una sincronización de 101 o 400 solo cuenta como exitosa si el dataset también se obtuvo, y ambas comparten `syncedAt`.
- Desactualización: función pura `estadoFrescura(syncedAt, ahora, umbral)` con umbrales de 6 h (101 y 400) y 24 h (100 y 200). Resultados: "nunca", "vigente" o "desactualizada". El aviso "Información desactualizada" se muestra con texto e icono, con o sin conexión, y no se retira mientras el usuario lee.
- Estado de sincronización de la Portada (Cargando, Sincronizando, Sincronizado, Error, Sin conexión) como reducer puro. El estado de conexión ("En línea" o "Sin conexión") y la última sincronización aparecen en todas las páginas.
- Portada: reloj en hora de Perú con segundos, calculado desde el reloj inyectado (sin depender de `Intl`), con tick de 1 s alineado. Pantalla de carga en `index.html` y CSS externo (sin scripts ni estilos en línea por la CSP), oculta como máximo a los 1.5 s y sin animación con `prefers-reduced-motion`.
- Mapa: un `<g>` por departamento con foco itinerante, `aria-label` con nombre y nivel, colores más patrones SVG más iconos, recorrido por teclado y control remoto que alcanza los 25 departamentos, y tabla alternativa que también se usa si la geometría no carga.
- El reloj y la red se inyectan como dependencias para poder probar con tiempo simulado.
- Funciones puras (búfer de dígitos, router, historial, formato, reloj, estado de sincronización, desactualización, riesgo por departamento, navegación del mapa, acumulador del indicador de datos, orden, filtros, paginación) separadas de los componentes Preact, para probarlas con propiedades.

## Seguridad

- Todo el tráfico por HTTPS. HTTP se redirige o se rechaza. HSTS activo.
- Cabeceras en `public/_headers`: CSP restrictiva (`default-src 'self'`, sin scripts en línea, `frame-ancestors 'none'`, `base-uri 'none'`), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` y `Strict-Transport-Security`.
- Todo texto externo se escapa con `escapeText` antes de mostrarse. Nunca se inserta HTML de las fuentes en el DOM.
- Secretos (clave del LLM, clave de verificación del JWT) solo en variables de entorno del CI y del Worker. Nunca en el código, el bundle, el cliente ni los logs. gitleaks corre en CI.
- Escritura de contenido solo con `Authorization: Bearer <JWT>` con `rol=admin` y `exp` vigente: 401 si falta o es inválida, 403 si el rol no es admin. En ambos casos no cambia nada y se registra fecha y hora, IP y recurso.
- Sin datos personales, sin cuentas y sin rastreadores de terceros.

## Convenciones de código

- TypeScript estricto. Tipos del modelo (`Page`, `Alerta`, `Precio`, `Campana`, `AvisoOficial`, `Metadatos`) según el diseño. Los errores esperados se devuelven como `Result` tipado, no con excepciones sueltas.
- Identificadores del dominio en español, como en el diseño (`esDatoDePrueba`, `precioCentimos`, `textoOriginal`, `recomendaciones`). Textos de interfaz en español sencillo, oraciones de 25 palabras o menos.
- Funciones puras siempre que sea posible. Efectos (red, caché, reloj, IA) detrás de interfaces inyectables.
- Accesibilidad: contraste de 4.5:1 como mínimo (7:1 para el estilo teletexto), foco visible de 2 px y 3:1, todo operable por teclado, ARIA en el orden número de página, título y metadatos, niveles de alerta con texto e icono además del color, texto ampliable a 200 %.
- Responsivo de 320 a 3840 px. Texto base de 24 px o más desde 1280 px. Controles táctiles de 44x44 px o más bajo 600 px. Navegación completa con direccionales, números y confirmación.

## Pruebas

- Vitest + fast-check, mínimo **100 iteraciones** (`numRuns: 100`) por propiedad, **una prueba por propiedad**, con el comentario `Feature: teletexto-2-0, Property N: <texto>` y la anotación `Validates: Requirements ...`.
- Las 38 propiedades del diseño son la referencia. Las propiedades 1, 2, 21, 22, 27 y 28 deben estar listas antes del día 9.
- Generadores previstos: `arbPage`, `arbAviso`, `arbMutacion`, `arbEventosDigitos`, `arbResultadosSync`, `arbToken`, `arbHtmlHostil`, `arbAlertaRiesgo`, `arbDataset`, `arbEventosSync`, `arbMuestrasBytes`, `arbGeometria`.
- Lo que no admite propiedades (CDN, cabeceras, rate limit, 304, rendimiento, PWA, accesibilidad incluido el mapa con teclado y a 320 px, tamaños de carga inicial y de geometría, 1000 usuarios concurrentes) va a pruebas de integración o de humo con las herramientas indicadas arriba.
- No se da una tarea por terminada si fallan las pruebas existentes.

## Costo

Meta: USD 20 al mes o menos. El diseño estima menos de USD 7 al mes (Cloudflare Pages, WAF básico, Worker y GitHub Actions en plan gratuito; API de IA menos de USD 1; dominio opcional; reserva). Toda decisión nueva debe mantenerse en niveles gratuitos o de costo bajo. El valor de la API de IA debe confirmarse con la tarifa vigente del proveedor.

## Limitaciones conocidas que los agentes no deben "arreglar" por su cuenta

- El Verificador solo detecta los tipos de datos que su extractor conoce. Puede rechazar resúmenes correctos, y eso es aceptable porque el respaldo es el texto original.
- El requisito de incluir el 100 % de las recomendaciones en 60 palabras puede forzar a mostrar el aviso original.
- Los cambios de contenido se publican por build, no al instante.
- El campo `recomendaciones[].clave` es una convención de datos del diseño que el equipo debe confirmar.
- **Geometría del mapa:** la fuente (INEI/IGN como candidata), su licencia y la codificación de los 25 departamentos son supuestos que el equipo debe confirmar antes de usar los datos (tarea 3.1 de `tasks.md`). No se afirma que la geometría sea oficial hasta confirmarlo. `tools/geo` no corre mientras `confirmadoPorEquipo` sea `false`. La fuente (IGN, licencia ODC-By 1.0, límites referenciales) y los parámetros del mapa ya están aprobados (tareas 3.1 y 3.2) y no se cambian sin nueva aprobación. La geometría dibuja 39 de las 40 partes de la fuente: la excepción aprobada es el hueco `21#6.2` de Puno (registrado en `fuente.config.json`). Los dos islotes de Lima solo son representables por el redondeo con la escala aprobada.
- **Escala de niveles:** la conversión de las escalas oficiales de SENAMHI e INDECI a los 4 niveles (verde = Bajo, amarillo = Moderado, naranja = Alto, rojo = Muy alto) es un supuesto por confirmar.
- **Indicador de datos:** solo mide lo que el navegador expone. Los bytes enviados se muestran como "No disponible" (no se estiman). Las respuestas servidas desde caché no cuentan como descargadas. Tiene un margen de error documentado en el diseño. Nunca se usan valores simulados.