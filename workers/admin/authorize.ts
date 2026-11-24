// Autenticación y autorización de `POST /admin/reload` (tarea 14.2, Requisitos 15.3 y 15.10).
//
// 401: la credencial falta o no es válida (formato, firma, algoritmo, claims o vigencia).
// 403: la credencial es auténtica y vigente pero su `rol` no es exactamente "admin" (incluido el rol ausente).
// El rol se evalúa DESPUÉS de verificar la firma: un token sin firma válida que diga "admin" recibe 401, nunca 403.
import { verificarToken, type ConfigJwt } from './jwt.ts';
import type { EstadoRechazo, MotivoRechazo } from './registro.ts';

/** Rol que puede disparar la recarga. Comparación exacta, sin mayúsculas ni espacios. */
export const ROL_ADMINISTRADOR = 'admin';
/** Tamaño máximo del token en caracteres. Un ES256 con estos claims mide unos 350. */
export const MAX_CARACTERES_TOKEN = 2048;
const PREFIJO = 'Bearer ';

export type ResultadoAutorizacion =
  | { readonly permitido: true }
  | { readonly permitido: false; readonly estado: EstadoRechazo; readonly motivo: MotivoRechazo };

const rechazo = (estado: EstadoRechazo, motivo: MotivoRechazo): ResultadoAutorizacion => ({ permitido: false, estado, motivo });

/** Tres segmentos base64url no vacíos separados por puntos. */
const FORMA_COMPACTA = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

/**
 * Decide si una solicitud puede ejecutar la operación de escritura.
 * @param cabecera valor de la cabecera `Authorization`, o `null` si no vino. Varias cabeceras llegan unidas con comas y se rechazan.
 * @param ahoraMs reloj inyectado, en milisegundos desde 1970.
 */
export async function authorize(cabecera: string | null, config: ConfigJwt, ahoraMs: number): Promise<ResultadoAutorizacion> {
  if (cabecera === null || cabecera.length === 0) return rechazo(401, 'sin_credencial');
  // Se comprueba el tamaño antes de analizar nada para que una cabecera enorme no cueste tiempo de CPU.
  if (cabecera.length > PREFIJO.length + MAX_CARACTERES_TOKEN) return rechazo(401, 'token_demasiado_grande');
  // Esquema Bearer sin distinguir mayúsculas (RFC 7235) y con un solo espacio.
  if (cabecera.slice(0, PREFIJO.length).toLowerCase() !== PREFIJO.toLowerCase()) return rechazo(401, 'esquema_invalido');
  const token = cabecera.slice(PREFIJO.length);
  if (!FORMA_COMPACTA.test(token)) return rechazo(401, 'token_malformado');
  const resultado = await verificarToken(token, config, ahoraMs);
  if (!resultado.ok) return rechazo(401, resultado.motivo);
  if (resultado.rol !== ROL_ADMINISTRADOR) return rechazo(403, 'rol_insuficiente');
  return { permitido: true };
}
