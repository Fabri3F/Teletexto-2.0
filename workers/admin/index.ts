// Worker de Cloudflare `POST /admin/reload` (tarea 14.2, Requisitos 15.3, 15.4 y 15.10). Único punto de escritura.
// No contiene lógica de contenido: autentica, autoriza y pide a GitHub que ejecute el workflow de ingesta.
//
// Orden de las comprobaciones (cada una termina la solicitud si falla):
//   1. Ruta distinta de `/admin/reload`: 404, sin autenticar.
//   2. Configuración de JWT ausente o inválida: 503 (falla cerrado). No se llama a nadie.
//   3. Credencial: 401 si falta o no es válida, 403 si es válida pero el rol no es "admin". Se registra el rechazo.
//      Esto vale para cualquier método: una escritura sin credencial siempre recibe 401 (Requisito 15.10).
//   4. Método distinto de POST: 405 con `Allow: POST`.
//   5. Configuración de GitHub ausente o inválida: 503. No se llama a GitHub.
//   6. Disparo del workflow:
//        - 202 si GitHub responde 204.
//        - 502 si GitHub respondió con un 4xx o un 3xx: fallo confirmado, el disparo no se inició.
//        - 504 si el resultado es DESCONOCIDO: no hubo respuesta (red o plazo vencido), o GitHub respondió con un 5xx o con un 2xx
//          distinto de 204. El workflow puede haberse iniciado. La clasificación la hace `resultadoEsDesconocido` (github.ts).
//          La respuesta indica que no se repita la solicitud de forma automática. El Worker no reintenta nunca.
// Cualquier excepción inesperada termina en una respuesta JSON genérica (500, o 504 si ya se había iniciado el disparo).
// Las respuestas son JSON con textos fijos: nada de la solicitud ni de las excepciones se refleja en ellas.
import { authorize } from './authorize.ts';
import { dispararWorkflow, leerConfigGitHub, resultadoEsDesconocido, type EntornoGitHub, type FetchInyectable } from './github.ts';
import { importarClavePublica, type ConfigJwt } from './jwt.ts';
import { construirRegistro, serializarRegistro } from './registro.ts';

/** Ruta única del Worker. Comparación exacta: sin barra final y distinguiendo mayúsculas. */
export const RUTA_RECARGA = '/admin/reload';
const MAX_CARACTERES_VALOR = 256;

/** Configuración del Worker (variables y secretos). Ninguno tiene valor en el repositorio. */
export interface Env extends EntornoGitHub {
  /** Clave PÚBLICA ES256 en formato JWK (texto JSON). Es la única clave en el Worker. */
  readonly ADMIN_JWT_PUBLIC_KEY?: string | undefined;
  /** Valor exacto que debe tener el claim `iss`. */
  readonly ADMIN_JWT_ISSUER?: string | undefined;
  /** Valor exacto que debe tener el claim `aud`. */
  readonly ADMIN_JWT_AUDIENCE?: string | undefined;
}

export interface DependenciasWorker {
  /** Reloj en milisegundos desde 1970. */
  readonly ahora?: () => number;
  /** Escribe una línea de registro. Por defecto, `console.log` (Workers Logs). */
  readonly registrar?: (linea: string) => void;
  /** `fetch` para llamar a GitHub. */
  readonly fetch?: FetchInyectable;
  /** Tiempo límite de la llamada a GitHub, en milisegundos. */
  readonly plazoGitHubMs?: number;
}

function respuestaJson(estado: number, cuerpo: Record<string, string>, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...extra,
    },
  });
}

/** Resultado desconocido: no se sabe si GitHub recibió el disparo. Sin `Retry-After`: no se invita a repetir. */
function respuestaResultadoDesconocido(): Response {
  return respuestaJson(504, {
    estado: 'desconocido',
    error: 'No se pudo confirmar si la ingesta se inició. Revise las ejecuciones en GitHub. No repita la solicitud de forma automática.',
  });
}

/** Texto de configuración usable como valor exacto de un claim: no vacío, corto y sin caracteres de control. */
function valorExacto(valor: string | undefined): string | undefined {
  if (typeof valor !== 'string' || valor.length === 0 || valor.length > MAX_CARACTERES_VALOR) return undefined;
  return /^[\x20-\x7e]+$/.test(valor) ? valor : undefined;
}

async function leerConfigJwt(env: Env): Promise<ConfigJwt | undefined> {
  const emisor = valorExacto(env.ADMIN_JWT_ISSUER);
  const audiencia = valorExacto(env.ADMIN_JWT_AUDIENCE);
  if (emisor === undefined || audiencia === undefined) return undefined;
  const clave = await importarClavePublica(env.ADMIN_JWT_PUBLIC_KEY);
  return clave === undefined ? undefined : { clave, emisor, audiencia };
}

/** Lo que `atender` informa a `manejar` para decidir cómo responder si ocurre una excepción inesperada. */
interface EstadoDeLaSolicitud {
  /** Verdadero desde que se llama a GitHub. Si después hay una excepción, el resultado del disparo es desconocido. */
  disparoIniciado: boolean;
}

async function atender(
  request: Request,
  env: Env,
  deps: DependenciasWorker,
  escribir: (linea: string) => void,
  estado: EstadoDeLaSolicitud,
): Promise<Response> {
  const ahora = deps.ahora ?? Date.now;
  const url = new URL(request.url);
  if (url.pathname !== RUTA_RECARGA) return respuestaJson(404, { error: 'No encontrado.' });

  const configJwt = await leerConfigJwt(env);
  if (configJwt === undefined) {
    escribir(JSON.stringify({ evento: 'admin_config_invalida', componente: 'jwt' }));
    return respuestaJson(503, { error: 'Servicio no disponible.' });
  }

  const ahoraMs = ahora();
  const autorizacion = await authorize(request.headers.get('authorization'), configJwt, ahoraMs);
  if (!autorizacion.permitido) {
    escribir(
      serializarRegistro(
        construirRegistro({
          ahoraMs,
          ip: request.headers.get('cf-connecting-ip'),
          ruta: url.pathname,
          metodo: request.method,
          estado: autorizacion.estado,
          motivo: autorizacion.motivo,
        }),
      ),
    );
    return autorizacion.estado === 401
      ? respuestaJson(401, { error: 'No autorizado.' }, { 'WWW-Authenticate': 'Bearer' })
      : respuestaJson(403, { error: 'Prohibido.' });
  }

  if (request.method !== 'POST') return respuestaJson(405, { error: 'Método no permitido.' }, { Allow: 'POST' });

  const configGitHub = leerConfigGitHub(env);
  if (configGitHub === undefined) {
    escribir(JSON.stringify({ evento: 'admin_config_invalida', componente: 'github' }));
    return respuestaJson(503, { error: 'Servicio no disponible.' });
  }

  estado.disparoIniciado = true;
  const disparo = await dispararWorkflow(configGitHub, {
    ...(deps.fetch === undefined ? {} : { fetch: deps.fetch }),
    ...(deps.plazoGitHubMs === undefined ? {} : { plazoMs: deps.plazoGitHubMs }),
  });
  if (!disparo.ok) {
    // Solo la causa y, si existe, el código de estado de GitHub. Nunca el token, la URL ni el texto del error.
    escribir(
      JSON.stringify({
        evento: 'admin_github_error',
        causa: disparo.causa,
        ...(disparo.causa === 'estado' ? { estadoHttp: disparo.estadoHttp } : {}),
      }),
    );
    return resultadoEsDesconocido(disparo)
      ? respuestaResultadoDesconocido()
      : respuestaJson(502, { error: 'No se pudo iniciar la ingesta.' });
  }
  return respuestaJson(202, { estado: 'solicitado' });
}

/**
 * Atiende una solicitud. Es la función que prueban las pruebas, con las dependencias inyectadas.
 * Captura cualquier excepción inesperada: la respuesta es JSON genérico y el registro no lleva el mensaje de la excepción,
 * que podría contener datos de la solicitud o secretos. Un fallo al escribir un registro nunca cambia la respuesta.
 */
export async function manejar(request: Request, env: Env, deps: DependenciasWorker = {}): Promise<Response> {
  const registrar = deps.registrar ?? ((linea: string) => console.log(linea));
  const escribir = (linea: string): void => {
    try {
      registrar(linea);
    } catch {
      // El registro no debe cambiar la respuesta. Tampoco se guarda el error: no hay otro lugar seguro donde escribirlo.
    }
  };
  const estado: EstadoDeLaSolicitud = { disparoIniciado: false };
  try {
    return await atender(request, env, deps, escribir, estado);
  } catch {
    escribir(JSON.stringify({ evento: 'admin_error_inesperado', disparoIniciado: estado.disparoIniciado }));
    return estado.disparoIniciado ? respuestaResultadoDesconocido() : respuestaJson(500, { error: 'Error interno.' });
  }
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return manejar(request, env);
  },
};
