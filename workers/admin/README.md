# Worker de administración (`workers/admin`)

Tarea 14.2. Requisitos 15.3, 15.4 y 15.10.

`POST /admin/reload` es el único punto de escritura del sistema. Comprueba un JWT de administrador y pide a GitHub que ejecute el workflow de ingesta. No contiene lógica de contenido.

## Estado

**El Worker no está desplegado y no hay ningún secreto configurado.** Lo que existe es el código y sus pruebas. Quedan fuera de esta tarea, y pendientes:

- El workflow de ingesta. No existe ni se creó. Tampoco hay nombre de archivo, rama ni repositorio definidos.
- La protección del workflow contra disparos repetidos (por ejemplo, `concurrency`). Depende de que el workflow exista. El Worker no tiene enfriamiento ni deduplicación.
- Desplegar el Worker y cargar sus variables y secretos. No hay `wrangler` ni configuración de despliegue.
- Emitir tokens de administrador. No hay herramienta para firmarlos, y no debe haber una clave privada en el repositorio.
- La prueba de extremo a extremo: Worker, GitHub Actions, CLI de ingesta (tarea 2.8) y publicación en Cloudflare Pages.

## Flujo

1. Si la ruta no es exactamente `/admin/reload`, responde 404 sin autenticar.
2. Si falta la configuración del JWT o es inválida, responde 503. No llama a nadie.
3. Valida la credencial con cualquier método HTTP. Si falla, responde 401 o 403 y registra el rechazo.
4. Si el método no es POST, responde 405 con `Allow: POST`.
5. Si falta la configuración de GitHub o es inválida, responde 503 sin llamar a GitHub.
6. Llama a GitHub, una sola vez y sin reintentos:
   - 202 si GitHub responde 204.
   - 502 si GitHub responde con un 4xx o un 3xx. Es un fallo confirmado: el disparo no se inició.
   - 504 si el resultado es desconocido: no hay respuesta (error de red, conexión perdida o plazo vencido), o GitHub responde con un 5xx o con un 2xx distinto de 204. El workflow puede haberse iniciado.

Cualquier excepción inesperada termina en una respuesta JSON genérica: 500, o 504 si ya se había llamado a GitHub.

Una escritura sin credencial siempre recibe 401, sea cual sea su método (Requisito 15.10). El 405 solo lo recibe quien ya es administrador.

| Respuesta | Cuándo | Cuerpo |
|---|---|---|
| 202 | GitHub aceptó el disparo (204) | `{"estado":"solicitado"}` |
| 401 | Credencial ausente o inválida. Lleva `WWW-Authenticate: Bearer` | `{"error":"No autorizado."}` |
| 403 | Credencial válida cuyo `rol` no es exactamente `admin` | `{"error":"Prohibido."}` |
| 404 | Ruta distinta de `/admin/reload` | `{"error":"No encontrado."}` |
| 405 | Método distinto de POST, con credencial de administrador. Lleva `Allow: POST` | `{"error":"Método no permitido."}` |
| 500 | Excepción inesperada antes de llamar a GitHub | `{"error":"Error interno."}` |
| 502 | GitHub respondió con un 4xx o un 3xx: fallo confirmado | `{"error":"No se pudo iniciar la ingesta."}` |
| 504 | Resultado desconocido: GitHub respondió con un 5xx o con un 2xx distinto de 204, hubo un error de red o una conexión perdida, venció el plazo de 10 s, o hubo una excepción después de llamar a GitHub. Sin `Retry-After` | `{"estado":"desconocido","error":"No se pudo confirmar si la ingesta se inició. Revise las ejecuciones en GitHub. No repita la solicitud de forma automática."}` |
| 503 | Falta configuración o es inválida | `{"error":"Servicio no disponible."}` |

Todas las respuestas son JSON con `Cache-Control: no-store` y `X-Content-Type-Options: nosniff`, sin CORS. Los textos son fijos: nada de la solicitud ni de las excepciones se refleja en ellas.

**Resultado desconocido (504).** Es el resultado cuando no se puede saber si GitHub recibió el disparo: no hay respuesta (error de red, conexión perdida o plazo vencido), GitHub responde con un 5xx (puede haber aceptado el disparo y fallar después) o responde con un 2xx distinto de 204 (lo aceptó, pero con un contrato que el Worker no reconoce). Quien reciba un 504 con `"estado":"desconocido"` debe revisar las ejecuciones del workflow en GitHub antes de repetir. **No debe reintentarse de forma automática**, porque un reintento podría iniciar una segunda ejecución. El Worker tampoco reintenta. Solo un 3xx o un 4xx de GitHub es un fallo confirmado (502).

## Credencial

Cabecera `Authorization: Bearer <JWT>`. El JWT debe cumplir todo esto:

| Regla | Detalle |
|---|---|
| Algoritmo | Solo `ES256`. Se rechaza `none`, HS256 y cualquier otro. |
| Claims obligatorios | `exp`, `iat`, `iss`, `aud` y `rol`. `nbf` es opcional y se respeta si está. |
| Emisor y audiencia | `iss` y `aud` deben ser exactamente los valores configurados. `aud` puede ser un texto o una lista con ese único elemento. |
| Vigencia | `exp` debe ser mayor que el instante actual. `exp` igual al instante actual ya es un token vencido. Sin tolerancia de reloj. |
| Duración máxima | 15 minutos (`exp - iat`). |
| `iat` | No puede estar en el futuro. Una diferencia pequeña entre el reloj de quien firma y el de Cloudflare puede dar un 401. |
| Tamaño | Hasta 2048 caracteres de token. |
| Rol | `rol` debe ser exactamente `admin`. Cualquier otro valor, o su ausencia, da 403. |

**401 y 403:** el 401 significa que la credencial no es válida (formato, firma, algoritmo, claims, emisor, audiencia o vigencia). El 403 significa que es auténtica y vigente pero no es de administrador. El rol se evalúa después de verificar la firma, así que un token sin firma válida que diga "admin" recibe 401.

**Interpretación de `rol` ausente.** `rol` es obligatorio para tener acceso, pero un token válido sin `rol` recibe 403 y no 401. Es la regla de la propuesta técnica aprobada para el caso "válida pero sin rol de administrador".

## Configuración

Ninguna tiene valor en el repositorio. Los nombres son los que lee el código.

| Nombre | Tipo | Contenido |
|---|---|---|
| `ADMIN_JWT_PUBLIC_KEY` | Variable | JWK **público** ES256 (`kty` EC, `crv` P-256, `x`, `y`), en texto JSON. Un JWK con parte privada (`d`) se rechaza. |
| `ADMIN_JWT_ISSUER` | Variable | Valor exacto del claim `iss`. |
| `ADMIN_JWT_AUDIENCE` | Variable | Valor exacto del claim `aud`. |
| `ADMIN_GITHUB_TOKEN` | **Secreto** | Token de GitHub de grano fino, limitado a un repositorio, con el permiso Actions: escritura. |
| `ADMIN_GITHUB_OWNER` | Variable | Propietario del repositorio. |
| `ADMIN_GITHUB_REPO` | Variable | Nombre del repositorio. |
| `ADMIN_GITHUB_WORKFLOW` | Variable | Nombre del archivo del workflow (termina en `.yml` o `.yaml`). |
| `ADMIN_GITHUB_REF` | Variable | Rama o etiqueta sobre la que corre el workflow. |

Si falta alguna o no tiene una forma válida, el Worker falla cerrado (503). Los valores se validan antes de usarse en la URL o en el cuerpo del disparo.

## Disparo del workflow

`POST https://api.github.com/repos/{propietario}/{repositorio}/actions/workflows/{archivo}/dispatches`, con el cuerpo `{"ref":"<rama configurada>"}`.

- Solo la respuesta **204** cuenta como éxito, por decisión aprobada. El Worker fija la versión de API `X-GitHub-Api-Version: 2022-11-28` y no envía `return_run_details`. Con esa versión y sin ese parámetro se espera la respuesta **204** sin contenido.
- **El contrato cambia en versiones nuevas de la API.** Según la documentación de GitHub, la versión `2026-03-10` hace que este endpoint responda siempre **200** con los datos de la ejecución y elimina el parámetro `return_run_details`. La página de documentación del endpoint muestra el contrato más reciente (200), no el de `2022-11-28`. Si algún día se cambia la versión configurada, también hay que cambiar el código de éxito y sus pruebas. Mientras tanto, un 200 se trata como resultado desconocido (504), porque GitHub pudo iniciar el workflow, y no se amplía la lista de códigos de éxito sin una razón.
- GitHub anuncia soporte de la versión `2022-11-28` hasta el 10 de marzo de 2028. Después responderá `410 Gone`, que el Worker trata como fallo confirmado (502).
- **Sin reintentos.** El Worker hace una sola llamada. Un error de red, una conexión perdida, el plazo de 10 segundos vencido, un 5xx o un 2xx distinto de 204 dan un resultado desconocido (504). Un 3xx o un 4xx es un fallo confirmado (502).
- El cuerpo no lleva datos del usuario. No hay `inputs`.
- No sigue redirecciones, para no enviar el token a otro destino.
- Tiempo límite de 10 segundos.
- El token solo viaja a GitHub. No se escribe en respuestas, registros ni mensajes de error.
- El token necesita Actions: escritura. Ese permiso también permite cancelar y repetir ejecuciones del mismo repositorio. No se puede acotar más con un token personal.
- **Disparos repetidos y minutos de GitHub Actions.** Un administrador válido, o quien tenga un token robado durante sus 15 minutos, puede disparar muchas ejecuciones seguidas. Cada ejecución consume minutos de GitHub Actions y cuota de la API de GitHub, según el plan y la visibilidad del repositorio. **Hoy no hay enfriamiento ni deduplicación** en el Worker: no guarda estado y no se añadió almacenamiento. La protección debe estar en el workflow (por ejemplo, un grupo de `concurrency`), y **esa protección está pendiente**, porque el workflow todavía no existe.

## Registro de rechazos (Requisito 15.10)

Cada 401 o 403 escribe una línea JSON con `console.log`, que Workers Logs recoge:

```json
{"evento":"admin_rechazo","timestamp":"AAAA-MM-DDTHH:mm:ssZ","ip":"...","recurso":"/admin/reload","estado":401,"motivo":"firma_invalida","metodo":"POST"}
```

- `timestamp`: fecha y hora UTC con segundos.
- `ip`: solo de `CF-Connecting-IP`, y solo si es una IPv4 o IPv6 válida. Si no, `No disponible`. Se ignoran `X-Forwarded-For` y similares.
- `recurso`: solo la ruta, sin cadena de consulta, limpia a ASCII imprimible y de hasta 200 caracteres.
- `motivo`: un código de una lista cerrada. `metodo`: una lista corta, y `OTRO` si no está en ella.
- **Nunca** se registran el token, la cabecera `Authorization` ni ningún secreto.
- También se escriben, sin datos de la solicitud, los eventos `admin_config_invalida` (con el componente `jwt` o `github`), `admin_github_error` (con la causa y el código de estado de GitHub) y `admin_error_inesperado` (solo indica si el disparo ya se había iniciado, nunca el mensaje de la excepción).
- Un fallo al escribir un registro no cambia la respuesta.

**Retención.** En el plan gratuito de Workers, Workers Logs conserva los registros **3 días** y admite 200 000 eventos al día (según la documentación de Cloudflare a la fecha de esta tarea). Tres días es poco para una auditoría. Si se necesita más, hay que copiar los registros a otro lugar, y eso no se implementó.

**Estos registros no son una auditoría permanente.** Hay tres límites: la retención de 3 días, el tope de 200 000 eventos al día y la falta de límite de solicitudes. Workers Logs sirve para detectar y revisar intentos recientes, pero no puede considerarse un registro de auditoría completo ni duradero.

**Agotamiento por inundación.** Cada solicitud rechazada escribe una línea, y también la escribe cada solicitud al endpoint mientras la configuración JWT sea inválida. Como no hay límite de solicitudes, un atacante puede enviar las suficientes para consumir el tope diario de eventos. **Después de superarlo no se garantiza que se registren los rechazos siguientes**, y no se verificó qué hace Cloudflare en el plan gratuito al superar el tope. Así podría ocultar intentos posteriores. No hay mitigación implementada.

**Dirección IP.** El Requisito 15.10 pide registrar la IP del intento. El Requisito 15.9 prohíbe asociar una IP a un perfil. Aquí la IP solo aparece en rechazos del endpoint de administración y no se asocia a ninguna cuenta ni perfil.

**Por verificar.** No se comprobó si los registros de invocación automáticos de Workers incluyen cabeceras de la solicitud. Debe revisarse en el entorno real que `Authorization` no aparezca.

## Límites del plan gratuito de Workers

100 000 solicitudes al día (cuentan también los intentos rechazados), 10 ms de CPU por solicitud y 50 subrequests. Cada solicitud válida hace una subrequest. El tiempo real de CPU de la verificación ES256 no se midió.

## Riesgos de seguridad que quedan

- Un token robado sirve hasta que venza (máximo 15 minutos). No se puede revocar, porque el Worker no guarda estado. En ese tiempo permite disparos repetidos (ver "Disparos repetidos y minutos de GitHub Actions").
- Un atacante puede agotar el tope diario de Workers Logs con rechazos y ocultar intentos posteriores (ver "Agotamiento por inundación").
- Si GitHub no responde (504), no se sabe si el workflow se inició. Un reintento, manual o automático, podría duplicarlo.
- GitHub puede devolver un 5xx después de haber aceptado el disparo. El Worker lo trata como resultado desconocido (504) y no reintenta.
- No hay límite de solicitudes para este Worker. Un atacante puede agotar las 100 000 diarias.
- Rotar la clave pública invalida todos los tokens emitidos.
- La clave privada y la emisión de tokens están fuera del repositorio. Su custodia es responsabilidad del equipo.
- Si el token de GitHub se filtra, permite disparar y cancelar ejecuciones de Actions en ese repositorio hasta que se revoque o venza.

## Comprobaciones pendientes en un entorno real

Sustituir `URL_DEL_WORKER`. Ninguna se ha ejecutado.

1. Sin credencial: `curl.exe -i -X POST URL_DEL_WORKER/admin/reload` debe dar 401 con `www-authenticate: Bearer`, y aparecer una línea en Workers Logs.
2. Con un token de un rol distinto de `admin`: 403, y una línea con `"estado":403`.
3. Con un token vencido o de más de 15 minutos: 401.
4. Con un token de administrador válido: 202 y una ejecución nueva del workflow en GitHub.
5. Confirmar que GitHub responde 204 con la versión de API `2022-11-28`. Si responde 200, no basta con ampliar los códigos de éxito: hay que revisar la versión y el contrato.
6. Revisar que ni los registros de invocación ni las respuestas muestren `Authorization` ni el token de GitHub.
7. Medir el uso de CPU de una solicitud con token válido.
