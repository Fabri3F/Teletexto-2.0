// Validación del JWT de administración (tarea 14.2, Requisitos 15.3 y 15.10).
//
// Decisiones aprobadas:
//   - Un solo algoritmo, ES256, fijado aquí. Se rechaza `none`, HS256 y cualquier otro valor de `alg` (sin confusión de algoritmos).
//   - En el Worker solo hay la clave PÚBLICA. Una clave con parte privada (`d`) se rechaza como configuración inválida.
//   - Claims obligatorios: `exp`, `iat`, `iss` y `aud` (los dos últimos con valores exactos configurados). `nbf` es opcional.
//   - Duración máxima del token: 15 minutos (`exp - iat`). `iat` no puede estar en el futuro.
//   - `exp` igual al instante actual ya es un token vencido. No hay tolerancia de reloj.
// El rol (`rol`) no se decide aquí: lo evalúa `authorize`, y solo después de validar la firma.
// La firma y la lectura del token las hace la biblioteca `jose`. Esta función solo añade las reglas propias del proyecto.
import { importJWK, jwtVerify } from 'jose';
import type { MotivoRechazo } from './registro.ts';

export const ALGORITMO_JWT = 'ES256';
/** Duración máxima de un token (`exp - iat`): 15 minutos. */
export const VIDA_MAXIMA_TOKEN_SEGUNDOS = 15 * 60;
/** Tamaño máximo del texto de la clave pública configurada. Un JWK P-256 público mide unos 200 caracteres. */
export const MAX_CARACTERES_CLAVE = 1024;

/** Clave pública ya importada para verificar firmas ES256. */
export type ClavePublica = Awaited<ReturnType<typeof importJWK>>;

export interface ConfigJwt {
  readonly clave: ClavePublica;
  /** Valor exacto que debe tener `iss`. */
  readonly emisor: string;
  /** Valor exacto que debe tener `aud`. */
  readonly audiencia: string;
}

export type ResultadoToken =
  | { readonly ok: true; readonly rol: unknown }
  | { readonly ok: false; readonly motivo: MotivoRechazo };

const esObjeto = (valor: unknown): valor is Record<string, unknown> =>
  typeof valor === 'object' && valor !== null && !Array.isArray(valor);

const esTextoNoVacio = (valor: unknown): valor is string => typeof valor === 'string' && valor.length > 0;

/** Se importa una sola clave por proceso: el texto configurado casi nunca cambia. El resultado (también el fallo) es determinista. */
let ultima: { readonly texto: string; readonly resultado: Promise<ClavePublica | undefined> } | undefined;

async function importar(texto: string): Promise<ClavePublica | undefined> {
  try {
    const analizado: unknown = JSON.parse(texto);
    if (!esObjeto(analizado)) return undefined;
    // Nunca se acepta una clave con parte privada: la clave privada no debe estar en el Worker.
    if (Object.hasOwn(analizado, 'd')) return undefined;
    if (analizado['kty'] !== 'EC' || analizado['crv'] !== 'P-256') return undefined;
    const { x, y } = analizado;
    if (!esTextoNoVacio(x) || !esTextoNoVacio(y)) return undefined;
    // Solo se copian los campos de la clave pública. `alg`, `use`, `key_ops` y demás se descartan.
    return await importJWK({ kty: 'EC', crv: 'P-256', x, y }, ALGORITMO_JWT);
  } catch {
    return undefined;
  }
}

/**
 * Importa la clave pública ES256 desde su JWK en texto. Devuelve `undefined` si falta, es demasiado grande, no es JSON, no es una
 * clave EC P-256, tiene parte privada o no se puede importar. Quien llama debe tratar `undefined` como configuración inválida.
 */
export function importarClavePublica(texto: string | undefined): Promise<ClavePublica | undefined> {
  if (typeof texto !== 'string' || texto.length === 0 || texto.length > MAX_CARACTERES_CLAVE) return Promise.resolve(undefined);
  if (ultima?.texto !== texto) ultima = { texto, resultado: importar(texto) };
  return ultima.resultado;
}

/** Traduce el error de la biblioteca a un motivo de la lista cerrada. No se copia ningún texto del error ni del token. */
function clasificar(error: unknown): MotivoRechazo {
  const codigo = esObjeto(error) ? error['code'] : undefined;
  switch (codigo) {
    case 'ERR_JOSE_ALG_NOT_ALLOWED':
      return 'algoritmo_no_permitido';
    case 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED':
      return 'firma_invalida';
    case 'ERR_JWT_EXPIRED':
      return 'expirado';
    case 'ERR_JWT_CLAIM_VALIDATION_FAILED':
      // `nbf` futuro (la comprobación de tiempo falló) es "aún no válido". Un `nbf` que no es un número es un claim inválido.
      return esObjeto(error) && error['claim'] === 'nbf' && error['reason'] === 'check_failed' ? 'aun_no_valido' : 'claims_invalidos';
    default:
      return 'token_malformado';
  }
}

/**
 * Verifica un JWT compacto contra la clave pública, el emisor y la audiencia configurados, en el instante `ahoraMs`.
 * Devuelve el valor de `rol` tal como viene en el token (sin interpretarlo) o el motivo del rechazo. Nunca lanza.
 */
export async function verificarToken(token: string, config: ConfigJwt, ahoraMs: number): Promise<ResultadoToken> {
  let payload;
  try {
    ({ payload } = await jwtVerify(token, config.clave, {
      algorithms: [ALGORITMO_JWT],
      issuer: config.emisor,
      audience: config.audiencia,
      requiredClaims: ['exp', 'iat'],
      clockTolerance: 0,
      currentDate: new Date(ahoraMs),
    }));
  } catch (error) {
    return { ok: false, motivo: clasificar(error) };
  }
  const { exp, iat, iss, aud } = payload;
  const ahoraSegundos = Math.floor(ahoraMs / 1000);
  if (typeof exp !== 'number' || typeof iat !== 'number' || !Number.isFinite(exp) || !Number.isFinite(iat)) {
    return { ok: false, motivo: 'claims_invalidos' };
  }
  // `iat` en el futuro alargaría la vida real del token por encima de 15 minutos.
  if (iat > ahoraSegundos) return { ok: false, motivo: 'claims_invalidos' };
  // `exp` ya es mayor que el instante actual (lo comprobó la biblioteca) y `iat` no lo supera, así que `exp > iat`.
  if (exp - iat > VIDA_MAXIMA_TOKEN_SEGUNDOS) return { ok: false, motivo: 'claims_invalidos' };
  if (iss !== config.emisor) return { ok: false, motivo: 'claims_invalidos' };
  // Audiencia exacta: el texto configurado, solo o como único elemento de una lista.
  const audienciaValida = typeof aud === 'string' ? aud === config.audiencia : Array.isArray(aud) && aud.length === 1 && aud[0] === config.audiencia;
  if (!audienciaValida) return { ok: false, motivo: 'claims_invalidos' };
  return { ok: true, rol: payload['rol'] };
}
