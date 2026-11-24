// Disparo del workflow de ingesta mediante `workflow_dispatch` (tarea 14.2, Requisito 15.4).
//
// Se usa un token de GitHub de grano fino, limitado a un repositorio y con el permiso Actions: escritura. El token solo existe como
// secreto del Worker. No se escribe en respuestas, registros ni mensajes de error.
// El cuerpo del disparo lo fija el Worker (solo `ref`, que viene de la configuración): no se copia nada de la solicitud del usuario.
// Solo se considera éxito la respuesta 204 de GitHub (decisión aprobada). Cualquier otra respuesta es un fallo.
// El 204 es el contrato de la versión de API fijada abajo (`2022-11-28`), sin `return_run_details`. La versión `2026-03-10` de GitHub
// cambió el endpoint a 200 con los datos de la ejecución. Si se cambia la versión, hay que cambiar también el código de éxito y sus pruebas.
//
// Dos clases de fallo, que el Worker debe tratar distinto (ver `resultadoEsDesconocido`):
//   - Confirmado: GitHub respondió con un 4xx o un 3xx. Rechazó la solicitud o no la atendió: el disparo no se inició.
//   - Desconocido: no hubo respuesta (`causa: 'red'` o `'tiempo'`: error de red, conexión perdida o plazo vencido), o GitHub respondió
//     con un 5xx o con un 2xx distinto de 204. Un 5xx puede llegar después de que GitHub aceptó el disparo, y un 2xx que no es 204
//     indica que GitHub lo aceptó pero con un contrato que este código no reconoce. En ambos casos el workflow pudo iniciarse.
// Este módulo no reintenta nunca, tampoco ante un 5xx.
//
// Los valores (propietario, repositorio, archivo del workflow, rama y token) NO están en el código: llegan por la configuración
// del Worker. Cada valor se valida antes de usarse en la URL o en el cuerpo.

const URL_BASE_API = 'https://api.github.com';
const VERSION_API = '2022-11-28';
/** GitHub exige una cabecera User-Agent. */
const AGENTE = 'teletexto-admin-worker';
/** Tiempo límite de la llamada a GitHub, en milisegundos. */
export const PLAZO_GITHUB_MS = 10_000;
/** Código de éxito aprobado: 204 sin contenido. */
export const ESTADO_EXITO_GITHUB = 204;

export interface EntornoGitHub {
  readonly ADMIN_GITHUB_TOKEN?: string | undefined;
  readonly ADMIN_GITHUB_OWNER?: string | undefined;
  readonly ADMIN_GITHUB_REPO?: string | undefined;
  readonly ADMIN_GITHUB_WORKFLOW?: string | undefined;
  readonly ADMIN_GITHUB_REF?: string | undefined;
}

export interface ConfigGitHub {
  readonly token: string;
  readonly propietario: string;
  readonly repositorio: string;
  /** Nombre del archivo del workflow (por ejemplo `algo.yml`). */
  readonly workflow: string;
  /** Rama o etiqueta sobre la que corre el workflow. */
  readonly ref: string;
}

/** `fetch` inyectable. En producción es el `fetch` global. */
export type FetchInyectable = (url: string, init: RequestInit) => Promise<Response>;

export interface DependenciasGitHub {
  readonly fetch?: FetchInyectable;
  readonly plazoMs?: number;
}

export type ResultadoDisparo =
  | { readonly ok: true }
  /**
   * GitHub respondió con este código y no fue 204. Si es un 5xx o un 2xx, el resultado es desconocido; si es un 3xx o un 4xx,
   * el fallo está confirmado. El código se conserva siempre (el registro lo escribe tal cual). La clasificación está en
   * `resultadoEsDesconocido`.
   */
  | { readonly ok: false; readonly causa: 'estado'; readonly estadoHttp: number }
  /** Resultado desconocido: no hubo respuesta. GitHub puede haber recibido el disparo. */
  | { readonly ok: false; readonly causa: 'red' | 'tiempo' };

export type FalloDisparo = Exclude<ResultadoDisparo, { readonly ok: true }>;

/**
 * Verdadero si no se puede saber si GitHub recibió el disparo:
 *   - no hubo respuesta (error de red, conexión perdida o plazo vencido), o
 *   - GitHub respondió con cualquier 5xx (500 a 599): puede haber aceptado el disparo y fallar después, o
 *   - GitHub respondió con un 2xx distinto de 204 (200 a 299): lo aceptó, pero con un contrato que no es el esperado.
 * Falso si GitHub respondió con un 3xx o un 4xx: ese fallo está confirmado. El 204 es éxito y no llega aquí.
 */
export function resultadoEsDesconocido(fallo: FalloDisparo): boolean {
  if (fallo.causa !== 'estado') return true;
  const estado = fallo.estadoHttp;
  return (estado >= 200 && estado <= 299) || (estado >= 500 && estado <= 599);
}

const PROPIETARIO = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/;
const REPOSITORIO = /^[A-Za-z0-9._-]{1,100}$/;
const ARCHIVO_WORKFLOW = /^[A-Za-z0-9_-][A-Za-z0-9._-]{0,99}\.ya?ml$/;
const REFERENCIA = /^[A-Za-z0-9._/-]{1,255}$/;
/** Caracteres imprimibles sin espacios: evita saltos de línea y espacios dentro de una cabecera. */
const TOKEN = /^[\x21-\x7e]{1,512}$/;

/**
 * Lee y valida la configuración de GitHub. Devuelve `undefined` si falta algún valor o no tiene una forma segura.
 * Quien llama debe fallar cerrado (503) y no intentar el disparo.
 */
export function leerConfigGitHub(env: EntornoGitHub): ConfigGitHub | undefined {
  const token = env.ADMIN_GITHUB_TOKEN;
  const propietario = env.ADMIN_GITHUB_OWNER;
  const repositorio = env.ADMIN_GITHUB_REPO;
  const workflow = env.ADMIN_GITHUB_WORKFLOW;
  const ref = env.ADMIN_GITHUB_REF;
  if (typeof token !== 'string' || !TOKEN.test(token)) return undefined;
  if (typeof propietario !== 'string' || !PROPIETARIO.test(propietario)) return undefined;
  if (typeof repositorio !== 'string' || !REPOSITORIO.test(repositorio) || repositorio === '.' || repositorio === '..') return undefined;
  if (typeof workflow !== 'string' || !ARCHIVO_WORKFLOW.test(workflow)) return undefined;
  if (typeof ref !== 'string' || !REFERENCIA.test(ref) || ref.includes('..') || ref.startsWith('/') || ref.endsWith('/')) return undefined;
  return { token, propietario, repositorio, workflow, ref };
}

/** URL del disparo. Cada segmento se codifica aunque ya se validó. */
export function urlDeDisparo(config: ConfigGitHub): string {
  const e = encodeURIComponent;
  return `${URL_BASE_API}/repos/${e(config.propietario)}/${e(config.repositorio)}/actions/workflows/${e(config.workflow)}/dispatches`;
}

/**
 * Solicita a GitHub que ejecute el workflow. Con una respuesta válida de `fetch` no lanza: devuelve el resultado.
 * No reintenta. No sigue redirecciones (para no enviar el token a otro destino) y descarta el cuerpo de la respuesta.
 * El resultado no contiene el token, la URL ni el texto del error.
 */
export async function dispararWorkflow(config: ConfigGitHub, deps: DependenciasGitHub = {}): Promise<ResultadoDisparo> {
  const enviar: FetchInyectable = deps.fetch ?? ((url, init) => fetch(url, init));
  const senal = AbortSignal.timeout(deps.plazoMs ?? PLAZO_GITHUB_MS);
  let respuesta: Response;
  try {
    respuesta = await enviar(urlDeDisparo(config), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': VERSION_API,
        'User-Agent': AGENTE,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref: config.ref }),
      redirect: 'manual',
      signal: senal,
    });
  } catch {
    return { ok: false, causa: senal.aborted ? 'tiempo' : 'red' };
  }
  try {
    await respuesta.body?.cancel();
  } catch {
    // El cuerpo no se usa. Si no se puede cancelar, no cambia el resultado.
  }
  if (respuesta.status === ESTADO_EXITO_GITHUB) return { ok: true };
  return { ok: false, causa: 'estado', estadoHttp: respuesta.status };
}
