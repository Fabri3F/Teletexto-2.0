// Registro de verificación (tarea 10.1). Requisito 12.8 y Propiedad 25.
//
// Un registro es `{ estado, motivo?, verificadoEn }`: el estado de la verificación, el motivo (obligatorio si se rechaza o no se pudo
// verificar, de 500 caracteres como máximo) y el instante en UTC con precisión de segundos. La ingesta (tarea 10.4) le añade el
// identificador del aviso para escribirlo en `logs/verificacion.jsonl`. Los registros rechazados y no verificados no se publican.

/** Longitud máxima del motivo, en caracteres (Requisito 12.8). */
export const MAX_CARACTERES_MOTIVO = 500;

export type EstadoVerificacion = 'aprobado' | 'rechazado' | 'no_verificado';

export interface RegistroVerificacion {
  readonly estado: EstadoVerificacion;
  /** Presente cuando el estado es `rechazado` o `no_verificado`. Nunca supera 500 caracteres. */
  readonly motivo?: string;
  /** UTC ISO 8601 con precisión de segundos y sufijo Z, por ejemplo `2026-03-01T14:30:00Z`. */
  readonly verificadoEn: string;
}

/** Resultado de una verificación. `aprobado` no tiene motivo. */
export type ResultadoVerificacion =
  | { readonly estado: 'aprobado' }
  | { readonly estado: 'rechazado'; readonly motivo: string }
  | { readonly estado: 'no_verificado'; readonly motivo: string };

/** Motivo que se usa si un resultado llega sin motivo, para que el registro de un rechazo o un fallo nunca quede sin él. */
export const MOTIVO_NO_DISPONIBLE = 'motivo no disponible';

/**
 * Recorta el motivo a 500 caracteres como máximo. Cuenta unidades UTF-16, como `String.length`, y no deja un par sustituto partido:
 * si el corte caería entre las dos mitades de un carácter, se quita ese carácter entero. Así el resultado nunca supera 500 caracteres
 * ni en unidades UTF-16 ni en puntos de código.
 */
export function acotarMotivo(motivo: string): string {
  if (motivo.length <= MAX_CARACTERES_MOTIVO) return motivo;
  let fin = MAX_CARACTERES_MOTIVO;
  const ultimo = motivo.charCodeAt(fin - 1);
  const siguiente = motivo.charCodeAt(fin);
  const mitadAlta = ultimo >= 0xd800 && ultimo <= 0xdbff;
  const mitadBaja = siguiente >= 0xdc00 && siguiente <= 0xdfff;
  if (mitadAlta && mitadBaja) fin -= 1;
  return motivo.slice(0, fin);
}

const FORMATO_ISO_MILISEGUNDOS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

/**
 * Instante UTC con precisión de segundos (`AAAA-MM-DDTHH:mm:ssZ`) a partir de milisegundos desde 1970. Trunca hacia abajo los
 * milisegundos, así la hora registrada nunca es posterior al instante real. Devuelve `undefined` si el valor no es un instante
 * válido o su año no tiene cuatro cifras.
 */
export function formatearUtcSegundos(ahoraMs: number): string | undefined {
  if (typeof ahoraMs !== 'number' || !Number.isFinite(ahoraMs)) return undefined;
  const segundos = Math.floor(ahoraMs / 1000) * 1000;
  const fecha = new Date(segundos);
  if (Number.isNaN(fecha.getTime())) return undefined;
  const iso = fecha.toISOString();
  if (!FORMATO_ISO_MILISEGUNDOS.test(iso)) return undefined;
  return `${iso.slice(0, 19)}Z`;
}

/**
 * Registro de una verificación a partir de su resultado y del instante en que terminó (milisegundos, del reloj inyectado). Devuelve
 * `undefined` si el instante no es válido: sin hora no hay registro, y quien llama no debe publicar nada.
 */
export function registrarVerificacion(resultado: ResultadoVerificacion, ahoraMs: number): RegistroVerificacion | undefined {
  const verificadoEn = formatearUtcSegundos(ahoraMs);
  if (verificadoEn === undefined) return undefined;
  if (resultado.estado === 'aprobado') return Object.freeze({ estado: 'aprobado', verificadoEn });
  const motivo = typeof resultado.motivo === 'string' && resultado.motivo.trim() !== '' ? resultado.motivo : MOTIVO_NO_DISPONIBLE;
  return Object.freeze({ estado: resultado.estado, motivo: acotarMotivo(motivo), verificadoEn });
}
