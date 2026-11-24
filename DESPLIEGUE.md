# Despliegue en Cloudflare Pages (pages.dev): cabeceras y HTTPS

Tarea 14.1. Requisitos 15.1, 15.2, 15.7, 15.8, 15.9 y 16.2.

## Escenario de despliegue

La aplicación se publica con el plan gratuito de Cloudflare Pages, en una dirección `https://PROYECTO.pages.dev`. **No se necesita comprar ni configurar un dominio propio.** El equipo decidió no usar ninguno.

Este documento separa lo que está en el repositorio de lo que se hace en Cloudflare. **Nada de lo que está en Cloudflare está aplicado ni comprobado todavía.** Este trabajo no creó ningún proyecto de Pages.

## 1. Estado

| Elemento | Dónde vive | Estado |
|---|---|---|
| Cabeceras de seguridad | `public/_headers` | En el repositorio y con pruebas. Pendiente de comprobar en Cloudflare real. |
| HTTPS | Lo ofrece Cloudflare Pages en `pages.dev` | Pendiente de comprobar. |
| Redirección o rechazo de HTTP plano (Requisito 15.2) | Cloudflare Pages | No hay nada que configurar en el repositorio. Pendiente de comprobar con `curl` (sección 4.2). |
| Límite de solicitudes por IP (Requisito 15.8) | No existe | **Pendiente. No se cumple.** Ver sección 5. |
| Dominio propio | No aplica | No es necesario para publicar. |

## 2. Archivo `public/_headers`

Vite copia `public/` a `dist/`, así que `dist/_headers` sale del build. Cloudflare Pages lo lee y no lo sirve como archivo.

| Cabecera | Valor | Motivo |
|---|---|---|
| `Content-Security-Policy` | `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'; form-action 'none'; upgrade-insecure-requests` | Sin scripts ni estilos en línea. Solo recursos del propio origen. |
| `X-Content-Type-Options` | `nosniff` | Evita que el navegador adivine el tipo de contenido. |
| `X-Frame-Options` | `DENY` | Evita que otro sitio incruste la aplicación. |
| `Strict-Transport-Security` | `max-age=63072000` | Fuerza HTTPS en visitas posteriores a ese mismo sitio. Sin `includeSubDomains` ni `preload`. |
| `Referrer-Policy` | `no-referrer` | No envía la página de origen a otros sitios. |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=(), usb=()` | La aplicación no usa esas funciones. |

Decisiones tomadas al escribir el archivo:

- `includeSubDomains` se quitó de HSTS por decisión del equipo. La política vale solo para la dirección exacta del sitio, no para subdominios de `pages.dev` ni de otros proyectos.
- `img-src 'self'` no incluye `data:` porque ni el código ni el build actual usan imágenes `data:`. Las imágenes del proyecto son SVG en línea en el marcado, y eso no es una carga de imagen. Si más adelante se necesita `data:`, se agrega con una decisión del equipo.
- Los valores de `Referrer-Policy` y `Permissions-Policy` no estaban fijados en el diseño. Los elegí con el criterio de privacidad del Requisito 15.9 y del uso real de la aplicación.
- No hay reglas de caché ni de CORS. Pages ya envía `Access-Control-Allow-Origin: *`, que es aceptable para datos públicos.

## 3. Pasos manuales en Cloudflare

Estos pasos no se han ejecutado.

1. En Workers & Pages, crear un proyecto de Pages conectado al repositorio. Valores previstos: comando de build `npm run build` y carpeta de salida `dist`. Confirmarlos al crearlo.
2. El nombre del proyecto define la dirección `PROYECTO.pages.dev`. El equipo debe elegirlo.
3. Comprobar que el despliegue incluye `_headers` (sección 4.1).

No hay más pasos de configuración. No se configura dominio, "Always Use HTTPS" ni reglas de seguridad, porque esas opciones pertenecen a dominios propios de la cuenta, no a `pages.dev`.

## 4. Comprobaciones en el despliegue real

Sustituir `PROYECTO` por el nombre del proyecto. Anotar el resultado de cada una. Ninguna se ha ejecutado.

### 4.1 Cabeceras

1. `curl.exe -sI https://PROYECTO.pages.dev/` debe mostrar las seis cabeceras de la sección 2, con los valores exactos.
2. `strict-transport-security` debe ser exactamente `max-age=63072000`, sin `includeSubDomains`.
3. `x-content-type-options` debe aparecer una sola vez y no como `nosniff, nosniff`. Pages envía esa cabecera por defecto y la documentación dice que `_headers` la sustituye.
4. Repetir con una ruta de archivo (`/geo/departamentos.json`) y con una respuesta 304: `curl.exe -sI -H "If-None-Match: <etag>" https://PROYECTO.pages.dev/geo/departamentos.json`.
5. Abrir la aplicación en el navegador y revisar que la consola no muestre violaciones de CSP.

### 4.2 HTTP plano (Requisito 15.2)

1. `curl.exe -sI http://PROYECTO.pages.dev/`.
2. Anotar qué ocurre: redirección (301 o 308) a `https://`, rechazo, o contenido servido por HTTP.
3. Si responde con contenido por HTTP, el Requisito 15.2 no se cumple y debe informarse al equipo. Que los navegadores puedan forzar HTTPS por su cuenta en dominios `.dev` no sustituye esta comprobación.

### 4.3 Ausencia de límite de solicitudes (evidencia, no un fallo)

1. `1..30 | ForEach-Object { curl.exe -s -o NUL -w "%{http_code}`n" https://PROYECTO.pages.dev/geo/departamentos.json }`.
2. Se espera que todas las respuestas sean 200. Guardar el resultado como evidencia de que el Requisito 15.8 no está cubierto.
3. Si aparece algún 429, anotar las cabeceras completas, incluida `retry-after` si existe. Sería un comportamiento de la plataforma que el equipo no configuró. No se debe presentar como cumplimiento del 15.8.

## 5. Requisito 15.8 pendiente

El Requisito 15.8 pide rechazar con 429 a una IP que envíe **más de 60 solicitudes en 60 segundos**, incluir el tiempo de espera en segundos y mantener el rechazo hasta que la ventana se reinicie.

**El Requisito 15.8 sigue pendiente. No se cumple, ni siquiera de forma parcial.** No hay ningún mecanismo de límite de solicitudes en el repositorio ni en Cloudflare, y no se simula uno.

### Por qué no se aplica en `pages.dev`

- Las reglas de rate limiting de Cloudflare se crean para un dominio (zona) de la cuenta del equipo. `pages.dev` no es una zona de la cuenta, y la documentación de Cloudflare vincula esas reglas a la zona. Por eso la regla considerada no se puede aplicar al despliegue en `pages.dev`.
- Un límite escrito en código (Worker o Pages Functions) exigiría ejecutar código en cada solicitud. Eso contradice el Requisito 16.2 y no está aprobado. **No se implementó ni se introdujo nada de eso.**
- `_headers` no puede aplicar límites de solicitudes.
- `Retry-After` no aplica porque no existe ningún límite. **No se afirma que `Retry-After` funcione.**

### Regla considerada, solo como referencia

Esta regla se analizó para un dominio propio con el plan Free de Cloudflare. **No se va a aplicar mientras el despliegue use solo `pages.dev`.** Se conserva por si el equipo cambia de decisión.

| Parámetro | Valor considerado |
|---|---|
| Expresión | `starts_with(http.request.uri.path, "/p/") or starts_with(http.request.uri.path, "/d/") or starts_with(http.request.uri.path, "/geo/") or http.request.uri.path eq "/manifest.json"` |
| Característica de conteo | IP (la única en Free) |
| Solicitudes | 20 |
| Período | 10 segundos (el único de Free) |
| Acción | Block |
| Duración del bloqueo | 10 segundos (la única de Free) |

Aun con dominio propio, esa regla no cumpliría el 15.8. Permite hasta 20 solicitudes cada 10 segundos, unas 120 por minuto, el doble de lo pedido, y bloquea solo 10 segundos. La cifra de 120 es una estimación, no un dato documentado de Cloudflare.

### Qué decide el equipo

Este trabajo no modifica los documentos de `.kiro/specs/`. Las opciones siguientes necesitan aprobación y no se implementaron:

- Aceptar el 15.8 como no cumplido en el MVP y mostrarlo así en la demostración.
- Proponer un cambio del Requisito 15.8.
- Conseguir un dominio propio y usar una regla del plan Free (con la desviación de arriba).
- Usar el plan Pro de Cloudflare para tener una ventana de 60 segundos. Cuesta USD 20 al mes con pago anual o USD 25 con pago mensual, y llevaría el total por encima del límite de USD 20 del Requisito 16.1.
- Usar un Worker con límite de solicitudes. Contradice el Requisito 16.2 y `tech.md`.

## 6. Otras limitaciones

- **Requisito 15.7 no se cubre al 100 %.** `_headers` solo aplica a archivos estáticos. Las redirecciones y las páginas de error generadas por Cloudflare no llevan la CSP.
- **HTTPS.** Esta tarea no puede garantizar el Requisito 15.2. Se sabrá con la comprobación 4.2.
- **Pruebas locales.** `vite preview` no lee `_headers`. Las pruebas del repositorio solo verifican el contenido del archivo.

## 7. Pendientes de otras tareas

- **Nombre del manifiesto PWA (tarea 8.2).** No se eligió. Debe ser distinto de `/manifest.json`, que es el manifiesto de contenido.
- **CLI de ingesta (tarea 2.8).** Reemplaza `dist/` con `dist.tmp/`. Debe conservar `_headers`, o el despliegue saldría sin cabeceras. Sin resolver.
- **Service worker (tarea 8.1).** Las respuestas que cree con `new Response` no heredan la CSP y tendrán que llevar sus propias cabeceras.
- **Rutas inexistentes.** Pages sirve la aplicación (HTML con 200) para rutas sin archivo si no hay `404.html`. Comprobar cómo lo trata `pageLoader`, por ejemplo con `/p/999.json`.
